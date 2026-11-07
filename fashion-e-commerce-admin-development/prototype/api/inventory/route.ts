import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import {
  products,
  productVariants,
  colorLibrary,
  inventoryMovements,
  inventoryAdjustments,
} from "@/db/schema";
import { desc } from "drizzle-orm";
import { requireApiPermission } from "@/lib/server-auth";
import { resolveVariantMetrics } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "inventory", "view");
  if (!auth.authorized) return auth.response;

  const [allProducts, allVariants, allColors, movements, adjustments] =
    await Promise.all([
      db.select().from(products),
      db.select().from(productVariants),
      db.select().from(colorLibrary),
      db
        .select()
        .from(inventoryMovements)
        .orderBy(desc(inventoryMovements.createdAt))
        .limit(50),
      db
        .select()
        .from(inventoryAdjustments)
        .orderBy(desc(inventoryAdjustments.createdAt)),
    ]);

  const colorMap = new Map(allColors.map((c) => [c.id, c]));

  const latestMovementByVariant = new Map<number, (typeof movements)[0]>();
  for (const m of movements) {
    if (!latestMovementByVariant.has(m.variantId)) {
      latestMovementByVariant.set(m.variantId, m);
    }
  }

  const productRows = allProducts.map((p) => {
    const vars = allVariants
      .filter((v) => v.productId === p.id)
      .map((v) => {
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
        const recentMove = latestMovementByVariant.get(v.id);
        return {
          ...v,
          colorName: col?.name ?? "نامشخص",
          colorHex: col?.hex ?? "#CCCCCC",
          sellableStock: metrics.sellableStock,
          isLowStock: metrics.isLowStock,
          isOutOfStock: metrics.isOutOfStock,
          recentMovementSummary: recentMove
            ? `${recentMove.quantityDelta > 0 ? `+${recentMove.quantityDelta}` : recentMove.quantityDelta} (${recentMove.referenceCode})`
            : "بدون گردش اخیر",
        };
      });

    const totalPhysical = vars.reduce((s, v) => s + v.physicalStock, 0);
    const totalReserved = vars.reduce((s, v) => s + v.reservedStock, 0);
    const totalSellable = vars.reduce((s, v) => s + v.sellableStock, 0);
    const warningCount = vars.filter(
      (v) => v.isLowStock || v.isOutOfStock
    ).length;

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      primaryImage: p.primaryImage,
      status: p.status,
      totalPhysical,
      totalReserved,
      totalSellable,
      warningCount,
      variants: vars,
    };
  });

  const flatSkus = productRows.flatMap((pr) =>
    pr.variants.map((v) => ({
      variantId: v.id,
      sku: v.sku,
      productName: pr.name,
      colorName: v.colorName,
      sizeLabel: v.sizeLabel,
      physicalStock: v.physicalStock,
      reservedStock: v.reservedStock,
      sellableStock: v.sellableStock,
    }))
  );

  return NextResponse.json({
    products: productRows,
    flatSkus,
    movements,
    adjustments,
  });
}
