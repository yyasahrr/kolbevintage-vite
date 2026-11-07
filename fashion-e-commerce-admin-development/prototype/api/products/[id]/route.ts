import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import {
  products,
  categories,
  productVariants,
  colorLibrary,
  productMedia,
  sizeTemplates,
  auditLogs,
} from "@/db/schema";
import { eq, ne } from "drizzle-orm";
import { requireApiPermission } from "@/lib/server-auth";
import { resolveVariantMetrics } from "@/lib/pricing";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "catalog", "view");
  if (!auth.authorized) return auth.response;

  const { id } = await context.params;
  const productId = Number(id);
  if (Number.isNaN(productId)) {
    return NextResponse.json({ error: "شناسه محصول نامعتبر است" }, { status: 400 });
  }

  const [prodRows, allCategories, allColors, allTemplates, variants, media, otherProducts] =
    await Promise.all([
      db.select().from(products).where(eq(products.id, productId)),
      db.select().from(categories),
      db.select().from(colorLibrary),
      db.select().from(sizeTemplates),
      db
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, productId)),
      db.select().from(productMedia).where(eq(productMedia.productId, productId)),
      db.select().from(products).where(ne(products.id, productId)),
    ]);

  const product = prodRows[0];
  if (!product) {
    return NextResponse.json({ error: "محصول یافت نشد" }, { status: 404 });
  }

  const colorMap = new Map(allColors.map((c) => [c.id, c]));

  const resolvedVariants = variants.map((v) => {
    const col = colorMap.get(v.colorId);
    const metrics = resolveVariantMetrics({
      productBasePrice: product.basePrice,
      colorPriceOverride: v.colorPriceOverride,
      skuPriceOverride: v.skuPriceOverride,
      discountMode: v.discountMode,
      discountType: v.discountType,
      discountValue: v.discountValue,
      physicalStock: v.physicalStock,
      reservedStock: v.reservedStock,
      lowStockThreshold: v.lowStockThreshold,
      isActive: v.isActive,
    });
    return {
      ...v,
      colorName: col?.name ?? "نامشخص",
      colorHex: col?.hex ?? "#CCCCCC",
      ...metrics,
    };
  });

  return NextResponse.json({
    product,
    variants: resolvedVariants,
    media: media.sort((a, b) => a.sortOrder - b.sortOrder),
    categories: allCategories,
    colors: allColors,
    sizeTemplates: allTemplates,
    otherProducts: otherProducts.map((op) => ({
      id: op.id,
      code: op.code,
      name: op.name,
      primaryImage: op.primaryImage,
      basePrice: op.basePrice,
      status: op.status,
    })),
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "catalog", "edit");
  if (!auth.authorized) return auth.response;

  const { id } = await context.params;
  const productId = Number(id);
  if (Number.isNaN(productId)) {
    return NextResponse.json({ error: "شناسه محصول نامعتبر است" }, { status: 400 });
  }

  const existingRows = await db
    .select()
    .from(products)
    .where(eq(products.id, productId));
  const existing = existingRows[0];
  if (!existing) {
    return NextResponse.json({ error: "محصول یافت نشد" }, { status: 404 });
  }

  try {
    const body = await req.json();

    // Check publish permission if status is transitioning to published
    const nextStatus = body?.status ?? existing.status;
    if (
      nextStatus === "published" &&
      existing.status !== "published" &&
      !hasPermission(auth.role, "catalog", "publish")
    ) {
      return NextResponse.json(
        { error: "نقش فعلی مجوز انتشار مستقیم محصول را ندارد." },
        { status: 403 }
      );
    }

    const [updatedProduct] = await db
      .update(products)
      .set({
        name:
          typeof body?.name === "string" && body.name.trim()
            ? body.name.trim()
            : existing.name,
        categoryId:
          body?.categoryId !== undefined
            ? body.categoryId
              ? Number(body.categoryId)
              : null
            : existing.categoryId,
        basePrice:
          body?.basePrice !== undefined
            ? Math.max(0, Math.round(Number(body.basePrice) || 0))
            : existing.basePrice,
        status: nextStatus,
        shortDescription:
          body?.shortDescription !== undefined
            ? String(body.shortDescription)
            : existing.shortDescription,
        description:
          body?.description !== undefined
            ? String(body.description)
            : existing.description,
        primaryImage:
          body?.primaryImage !== undefined
            ? String(body.primaryImage)
            : existing.primaryImage,
        sizeTemplateId:
          body?.sizeTemplateId !== undefined
            ? body.sizeTemplateId
              ? Number(body.sizeTemplateId)
              : null
            : existing.sizeTemplateId,
        specificationsJson:
          body?.specificationsJson !== undefined
            ? body.specificationsJson
            : existing.specificationsJson,
        measurementsJson:
          body?.measurementsJson !== undefined
            ? body.measurementsJson
            : existing.measurementsJson,
        seoTitle:
          body?.seoTitle !== undefined
            ? String(body.seoTitle)
            : existing.seoTitle,
        seoDescription:
          body?.seoDescription !== undefined
            ? String(body.seoDescription)
            : existing.seoDescription,
        relatedProductIdsJson:
          Array.isArray(body?.relatedProductIdsJson)
            ? body.relatedProductIdsJson.map(Number)
            : existing.relatedProductIdsJson,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId))
      .returning();

    // Explicit Color-Size Variants Sync (Notice: physicalStock is NEVER mutated here; owned by Warehouse ledger!)
    if (Array.isArray(body?.variants)) {
      const existingVariants = await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, productId));
      const existingById = new Map(existingVariants.map((v) => [v.id, v]));

      for (const incoming of body.variants) {
        const colorId = Number(incoming.colorId);
        const sizeLabel = String(incoming.sizeLabel || "").trim();
        if (!colorId || !sizeLabel) continue;

        const colorPriceOverride =
          incoming.colorPriceOverride !== null &&
          incoming.colorPriceOverride !== undefined &&
          incoming.colorPriceOverride !== ""
            ? Math.max(0, Math.round(Number(incoming.colorPriceOverride)))
            : null;

        const skuPriceOverride =
          incoming.skuPriceOverride !== null &&
          incoming.skuPriceOverride !== undefined &&
          incoming.skuPriceOverride !== ""
            ? Math.max(0, Math.round(Number(incoming.skuPriceOverride)))
            : null;

        const discountMode = ["inherit", "none", "explicit"].includes(
          incoming.discountMode
        )
          ? incoming.discountMode
          : "inherit";

        const discountType =
          discountMode === "explicit"
            ? incoming.discountType === "fixed"
              ? "fixed"
              : "percent"
            : null;

        const discountValue =
          discountMode === "explicit" && incoming.discountValue
            ? Math.max(0, Math.round(Number(incoming.discountValue)))
            : null;

        const isActive =
          incoming.isActive !== undefined ? Boolean(incoming.isActive) : true;

        if (incoming.id && existingById.has(Number(incoming.id))) {
          const prev = existingById.get(Number(incoming.id))!;
          await db
            .update(productVariants)
            .set({
              sku: String(incoming.sku || prev.sku).trim(),
              colorPriceOverride,
              skuPriceOverride,
              discountMode,
              discountType,
              discountValue,
              isActive,
              updatedAt: new Date(),
            })
            .where(eq(productVariants.id, prev.id));
        } else {
          // Insert new explicit color-size combination (initial stock 0 until received in Warehouse!)
          const generatedSku =
            String(incoming.sku || "").trim() ||
            `${updatedProduct.code}-C${colorId}-${sizeLabel.toUpperCase()}-${Math.floor(10 + Math.random() * 89)}`;
          await db.insert(productVariants).values({
            productId,
            colorId,
            sizeLabel,
            sku: generatedSku,
            colorPriceOverride,
            skuPriceOverride,
            discountMode,
            discountType,
            discountValue,
            physicalStock: 0,
            reservedStock: 0,
            lowStockThreshold: 4,
            isActive,
          });
        }
      }
    }

    // Color-Dependent Media Sync
    if (Array.isArray(body?.media)) {
      await db
        .delete(productMedia)
        .where(eq(productMedia.productId, productId));
      const cleanMedia = body.media
        .filter((m: { colorId?: number; url?: string }) => m.colorId && m.url)
        .map(
          (
            m: {
              colorId: number;
              mediaRole?: string;
              url: string;
              altText?: string;
            },
            idx: number
          ) => ({
            productId,
            colorId: Number(m.colorId),
            mediaRole: ["main", "gallery", "hover", "detail_video"].includes(
              m.mediaRole ?? ""
            )
              ? String(m.mediaRole)
              : "gallery",
            url: String(m.url).trim(),
            altText: String(m.altText ?? "").trim(),
            sortOrder: idx + 1,
          })
        );
      if (cleanMedia.length > 0) {
        await db.insert(productMedia).values(cleanMedia);
      }
    }

    await db.insert(auditLogs).values({
      actorName: auth.actorName,
      actorRole: auth.role,
      module: "کاتالوگ",
      action: `بروزرسانی اطلاعات/تنوع محصول: ${updatedProduct.name}`,
      entityRef: updatedProduct.code,
      result: "success",
      referenceCode: `AUD-${Date.now().toString().slice(-6)}`,
    });

    return NextResponse.json({ ok: true, product: updatedProduct });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در ذخیره تغییرات محصول", detail: String(err) },
      { status: 500 }
    );
  }
}
