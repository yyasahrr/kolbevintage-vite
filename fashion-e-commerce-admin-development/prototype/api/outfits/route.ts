import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import {
  outfits,
  outfitItems,
  products,
  productVariants,
  colorLibrary,
  auditLogs,
} from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { requireApiPermission } from "@/lib/server-auth";
import { resolveVariantMetrics } from "@/lib/pricing";
import { slugifyPersianOrLatin } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "catalog", "view");
  if (!auth.authorized) return auth.response;

  const [allOutfits, allOutfitItems, allProducts, allVariants, allColors] =
    await Promise.all([
      db.select().from(outfits).orderBy(desc(outfits.updatedAt)),
      db.select().from(outfitItems).orderBy(asc(outfitItems.sortOrder)),
      db.select().from(products),
      db.select().from(productVariants),
      db.select().from(colorLibrary),
    ]);

  const prodMap = new Map(allProducts.map((p) => [p.id, p]));
  const varMap = new Map(allVariants.map((v) => [v.id, v]));
  const colorMap = new Map(allColors.map((c) => [c.id, c]));

  const enriched = allOutfits.map((o) => {
    const items = allOutfitItems
      .filter((i) => i.outfitId === o.id)
      .map((i) => {
        const prod = prodMap.get(i.productId);
        const defVar = i.defaultVariantId
          ? varMap.get(i.defaultVariantId)
          : allVariants.find((v) => v.productId === i.productId && v.isActive);
        const col = defVar ? colorMap.get(defVar.colorId) : undefined;
        const metrics = defVar
          ? resolveVariantMetrics({
              productBasePrice: prod?.basePrice ?? 0,
              colorPriceOverride: defVar.colorPriceOverride,
              skuPriceOverride: defVar.skuPriceOverride,
              discountMode: defVar.discountMode,
              discountType: defVar.discountType,
              discountValue: defVar.discountValue,
              physicalStock: defVar.physicalStock,
              reservedStock: defVar.reservedStock,
              lowStockThreshold: defVar.lowStockThreshold,
              isActive: defVar.isActive,
            })
          : null;

        return {
          ...i,
          productName: prod?.name ?? "محصول حذف‌شده",
          productCode: prod?.code ?? "",
          productImage: prod?.primaryImage ?? "/images/products/coat-camel.jpg",
          sku: defVar?.sku ?? "بدون SKU",
          colorName: col?.name ?? "",
          sizeLabel: defVar?.sizeLabel ?? "",
          effectivePrice: metrics?.effectivePrice ?? prod?.basePrice ?? 0,
          sellableStock: metrics?.sellableStock ?? 0,
        };
      });

    const itemsSumPrice = items.reduce((s, it) => s + it.effectivePrice, 0);
    const minComponentStock =
      items.length > 0 ? Math.min(...items.map((it) => it.sellableStock)) : 0;

    return {
      ...o,
      items,
      itemsSumPrice,
      minComponentStock,
    };
  });

  return NextResponse.json({
    outfits: enriched,
    availableProducts: allProducts.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      basePrice: p.basePrice,
      primaryImage: p.primaryImage,
    })),
  });
}

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "catalog", "create");
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    const description = String(body?.description ?? "").trim();
    const heroImage =
      String(body?.heroImage ?? "").trim() ||
      "/images/products/outfit-autumn.jpg";
    const pricingMode = [
      "sum_of_items",
      "look_discount_percent",
      "fixed_look_price_pending_approval",
    ].includes(body?.pricingMode)
      ? body.pricingMode
      : "sum_of_items";
    const lookDiscountPercent = Math.min(
      50,
      Math.max(0, Number(body?.lookDiscountPercent ?? 0) || 0)
    );
    const fixedLookPrice = body?.fixedLookPrice
      ? Math.max(0, Number(body.fixedLookPrice))
      : null;
    const productIds: number[] = Array.isArray(body?.productIds)
      ? body.productIds.map(Number).filter((n: number) => !Number.isNaN(n))
      : [];

    if (!name || productIds.length < 2) {
      return NextResponse.json(
        { error: "نام ست و حداقل ۲ محصول متصل الزامی است." },
        { status: 400 }
      );
    }

    const slug = `${slugifyPersianOrLatin(name)}-${Date.now().toString().slice(-4)}`;
    const [created] = await db
      .insert(outfits)
      .values({
        name,
        slug,
        description,
        heroImage,
        pricingMode,
        lookDiscountPercent,
        fixedLookPrice,
        status: "draft", // New outfit starts as draft
      })
      .returning();

    const allVars = await db.select().from(productVariants);
    for (let i = 0; i < productIds.length; i++) {
      const pid = productIds[i];
      const defVar = allVars.find((v) => v.productId === pid && v.isActive);
      await db.insert(outfitItems).values({
        outfitId: created.id,
        productId: pid,
        defaultVariantId: defVar?.id ?? null,
        isRequired: i < 2,
        sortOrder: i + 1,
      });
    }

    await db.insert(auditLogs).values({
      actorName: auth.actorName,
      actorRole: auth.role,
      module: "استایل و ست",
      action: `ایجاد ست لباس جدید: ${created.name}`,
      entityRef: created.slug,
      result: "success",
      referenceCode: `AUD-${Date.now().toString().slice(-6)}`,
    });

    return NextResponse.json({ outfit: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در ایجاد ست لباس", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "catalog", "edit");
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const id = Number(body?.id);
    const [existing] = await db
      .select()
      .from(outfits)
      .where(eq(outfits.id, id));
    if (!existing) {
      return NextResponse.json({ error: "ست یافت نشد" }, { status: 404 });
    }

    const [updated] = await db
      .update(outfits)
      .set({
        status:
          body?.status === "published" || body?.status === "draft"
            ? body.status
            : existing.status,
        pricingMode: body?.pricingMode ?? existing.pricingMode,
        updatedAt: new Date(),
      })
      .where(eq(outfits.id, id))
      .returning();

    return NextResponse.json({ outfit: updated });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در بروزرسانی ست", detail: String(err) },
      { status: 500 }
    );
  }
}
