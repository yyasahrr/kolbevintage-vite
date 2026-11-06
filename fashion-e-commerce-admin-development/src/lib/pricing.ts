export interface VariantPricingInput {
  productBasePrice: number;
  colorPriceOverride: number | null;
  skuPriceOverride: number | null;
  discountMode: string; // 'inherit' | 'none' | 'explicit'
  discountType: string | null; // 'percent' | 'fixed' | null
  discountValue: number | null;
  physicalStock: number;
  reservedStock: number;
  lowStockThreshold: number;
  isActive: boolean;
}

export interface ResolvedVariantMetrics {
  resolvedBasePrice: number;
  priceSource: "sku" | "color" | "product";
  directDiscountAmount: number;
  effectivePrice: number;
  discountLabel: string;
  sellableStock: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
}

export function resolveVariantMetrics(
  v: VariantPricingInput
): ResolvedVariantMetrics {
  let resolvedBasePrice = v.productBasePrice;
  let priceSource: "sku" | "color" | "product" = "product";

  if (v.colorPriceOverride !== null && v.colorPriceOverride >= 0) {
    resolvedBasePrice = v.colorPriceOverride;
    priceSource = "color";
  }
  if (v.skuPriceOverride !== null && v.skuPriceOverride >= 0) {
    resolvedBasePrice = v.skuPriceOverride;
    priceSource = "sku";
  }

  let directDiscountAmount = 0;
  let discountLabel = "ارث‌بری (بدون تخفیف مستقیم)";

  if (v.discountMode === "none") {
    directDiscountAmount = 0;
    discountLabel = "بدون تخفیف مستقیم (صریح)";
  } else if (v.discountMode === "explicit" && v.discountValue && v.discountValue > 0) {
    if (v.discountType === "percent") {
      const clampedPct = Math.min(95, Math.max(0, v.discountValue));
      directDiscountAmount = Math.round((resolvedBasePrice * clampedPct) / 100);
      discountLabel = `${clampedPct}٪ تخفیف مستقیم`;
    } else {
      directDiscountAmount = Math.min(resolvedBasePrice, Math.max(0, v.discountValue));
      discountLabel = `${directDiscountAmount.toLocaleString("fa-IR")} تومان تخفیف`;
    }
  }

  const effectivePrice = Math.max(0, resolvedBasePrice - directDiscountAmount);
  const sellableStock = Math.max(0, v.physicalStock - v.reservedStock);
  const isOutOfStock = sellableStock <= 0;
  const isLowStock = sellableStock > 0 && sellableStock <= v.lowStockThreshold;

  return {
    resolvedBasePrice,
    priceSource,
    directDiscountAmount,
    effectivePrice,
    discountLabel,
    sellableStock,
    isLowStock,
    isOutOfStock,
  };
}
