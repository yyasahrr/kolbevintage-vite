import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import {
  products,
  categories,
  productVariants,
  colorLibrary,
  productMedia,
  auditLogs,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireApiPermission } from "@/lib/server-auth";
import { resolveVariantMetrics } from "@/lib/pricing";
import { slugifyPersianOrLatin } from "@/lib/formatters";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "catalog", "view");
  if (!auth.authorized) return auth.response;

  const sp = req.nextUrl.searchParams;
  const statusFilter = sp.get("status") || "all";
  const queryText = (sp.get("q") || "").trim().toLowerCase();
  const categoryIdParam = sp.get("categoryId");
  const stockFilter = sp.get("stockFilter") || "all"; // all | low_stock | out_of_stock
  const discountFilter = sp.get("discountFilter") || "all"; // all | has_discount
  const sortParam = sp.get("sort") || "updated_desc";
  const page = Math.max(1, Number(sp.get("page") || "1") || 1);
  const limit = Math.min(50, Math.max(5, Number(sp.get("limit") || "15") || 15));

  const [allProducts, allCategories, allVariants, allColors, allMedia] =
    await Promise.all([
      db.select().from(products).orderBy(desc(products.updatedAt)),
      db.select().from(categories),
      db.select().from(productVariants),
      db.select().from(colorLibrary),
      db.select().from(productMedia),
    ]);

  const catMap = new Map(allCategories.map((c) => [c.id, c]));
  const colorMap = new Map(allColors.map((c) => [c.id, c]));

  const variantsByProduct = new Map<number, typeof allVariants>();
  for (const v of allVariants) {
    const arr = variantsByProduct.get(v.productId) ?? [];
    arr.push(v);
    variantsByProduct.set(v.productId, arr);
  }

  const mediaByProduct = new Map<number, typeof allMedia>();
  for (const m of allMedia) {
    const arr = mediaByProduct.get(m.productId) ?? [];
    arr.push(m);
    mediaByProduct.set(m.productId, arr);
  }

  const enrichedAll = allProducts.map((p) => {
    const cat = p.categoryId ? catMap.get(p.categoryId) : undefined;
    const rawVariants = variantsByProduct.get(p.id) ?? [];
    const prodMedia = mediaByProduct.get(p.id) ?? [];

    const resolvedVariants = rawVariants.map((v) => {
      const col = colorMap.get(v.colorId);
      const metrics = resolveVariantMetrics({
        productBasePrice: p.basePrice,
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

    const activeVariants = resolvedVariants.filter((v) => v.isActive);
    const eligiblePriceVariants =
      activeVariants.length > 0 ? activeVariants : resolvedVariants;

    const minEffectivePrice =
      eligiblePriceVariants.length > 0
        ? Math.min(...eligiblePriceVariants.map((v) => v.effectivePrice))
        : p.basePrice;

    const maxEffectivePrice =
      eligiblePriceVariants.length > 0
        ? Math.max(...eligiblePriceVariants.map((v) => v.effectivePrice))
        : p.basePrice;

    const totalSellableStock = activeVariants.reduce(
      (sum, v) => sum + v.sellableStock,
      0
    );
    const lowStockSkuCount = activeVariants.filter(
      (v) => v.isLowStock || v.isOutOfStock
    ).length;
    const distinctColorIds = new Set(activeVariants.map((v) => v.colorId));
    const hasAnyDiscount = activeVariants.some(
      (v) => v.directDiscountAmount > 0
    );

    return {
      ...p,
      categoryName: cat?.name ?? "بدون دسته‌بندی",
      variantCount: activeVariants.length,
      totalVariantRows: resolvedVariants.length,
      colorCount: distinctColorIds.size,
      minEffectivePrice,
      maxEffectivePrice,
      totalSellableStock,
      lowStockSkuCount,
      hasAnyDiscount,
      mediaCount: prodMedia.length,
      variants: resolvedVariants,
    };
  });

  // Status counts for tabs (distinct from stock state!)
  const statusCounts = {
    all: enrichedAll.length,
    published: enrichedAll.filter((p) => p.status === "published").length,
    draft: enrichedAll.filter((p) => p.status === "draft").length,
    needs_review: enrichedAll.filter((p) => p.status === "needs_review").length,
    archived: enrichedAll.filter((p) => p.status === "archived").length,
  };

  let filtered = enrichedAll;
  if (statusFilter !== "all") {
    filtered = filtered.filter((p) => p.status === statusFilter);
  }
  if (queryText) {
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(queryText) ||
        p.code.toLowerCase().includes(queryText) ||
        p.categoryName.toLowerCase().includes(queryText) ||
        p.variants.some((v) => v.sku.toLowerCase().includes(queryText))
    );
  }
  if (categoryIdParam && categoryIdParam !== "all") {
    const cid = Number(categoryIdParam);
    if (!Number.isNaN(cid)) {
      filtered = filtered.filter((p) => p.categoryId === cid);
    }
  }
  if (stockFilter === "low_stock") {
    filtered = filtered.filter((p) => p.lowStockSkuCount > 0);
  } else if (stockFilter === "out_of_stock") {
    filtered = filtered.filter((p) => p.totalSellableStock === 0);
  }
  if (discountFilter === "has_discount") {
    filtered = filtered.filter((p) => p.hasAnyDiscount);
  }

  // Sorting
  if (sortParam === "price_asc") {
    filtered = [...filtered].sort(
      (a, b) => a.minEffectivePrice - b.minEffectivePrice
    );
  } else if (sortParam === "price_desc") {
    filtered = [...filtered].sort(
      (a, b) => b.minEffectivePrice - a.minEffectivePrice
    );
  } else if (sortParam === "stock_asc") {
    filtered = [...filtered].sort(
      (a, b) => a.totalSellableStock - b.totalSellableStock
    );
  } else {
    filtered = [...filtered].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / limit));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * limit;
  const paginatedItems = filtered.slice(startIdx, startIdx + limit);

  return NextResponse.json({
    items: paginatedItems,
    statusCounts,
    pagination: {
      page: safePage,
      limit,
      totalItems,
      totalPages,
    },
    categories: allCategories,
  });
}

// Stage One: Quick Create Draft Product (NEVER publishes immediately)
export async function POST(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "catalog", "create");
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    const categoryId = body?.categoryId ? Number(body.categoryId) : null;
    const basePrice = Math.max(0, Math.round(Number(body?.basePrice ?? 0) || 0));
    const shortDescription = String(body?.shortDescription ?? "").trim();
    const primaryImage =
      String(body?.primaryImage ?? "").trim() ||
      "/images/products/coat-camel.jpg";

    if (!name || name.length < 2) {
      return NextResponse.json(
        { error: "نام محصول الزامی است و باید حداقل ۲ کاراکتر باشد." },
        { status: 400 }
      );
    }

    if (categoryId) {
      const cat = await db
        .select()
        .from(categories)
        .where(eq(categories.id, categoryId));
      if (cat.length === 0) {
        return NextResponse.json(
          { error: "دسته‌بندی انتخاب‌شده یافت نشد." },
          { status: 400 }
        );
      }
    }

    const randomCode = `KV-${Math.floor(1050 + Math.random() * 8900)}`;
    const slug = `${slugifyPersianOrLatin(name)}-${Date.now().toString().slice(-4)}`;

    const [created] = await db
      .insert(products)
      .values({
        code: randomCode,
        name,
        slug,
        categoryId,
        basePrice,
        status: "draft", // Mandatory: creating a draft must NEVER publish the product
        shortDescription,
        description: shortDescription,
        primaryImage,
        specificationsJson: {},
        measurementsJson: {},
        relatedProductIdsJson: [],
      })
      .returning();

    await db.insert(auditLogs).values({
      actorName: auth.actorName,
      actorRole: auth.role,
      module: "کاتالوگ",
      action: `ایجاد پیش‌نویس سریع محصول: ${created.name}`,
      entityRef: created.code,
      result: "success",
      referenceCode: `AUD-${Date.now().toString().slice(-6)}`,
    });

    return NextResponse.json({ product: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در ایجاد پیش‌نویس محصول", detail: String(err) },
      { status: 500 }
    );
  }
}
