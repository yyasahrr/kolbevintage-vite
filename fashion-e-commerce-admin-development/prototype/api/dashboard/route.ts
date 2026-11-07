import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import {
  orders,
  productVariants,
  products,
  colorLibrary,
  returnRequests,
  inventoryAdjustments,
  orderEvents,
  campaigns,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireApiPermission } from "@/lib/server-auth";
import { resolveVariantMetrics } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "dashboard", "view");
  if (!auth.authorized) return auth.response;

  const [
    allOrders,
    allVariants,
    allProducts,
    allColors,
    allReturns,
    allAdjustments,
    recentEvents,
    allCampaigns,
  ] = await Promise.all([
    db.select().from(orders).orderBy(desc(orders.createdAt)),
    db.select().from(productVariants),
    db.select().from(products),
    db.select().from(colorLibrary),
    db.select().from(returnRequests),
    db.select().from(inventoryAdjustments),
    db.select().from(orderEvents).orderBy(desc(orderEvents.createdAt)).limit(8),
    db.select().from(campaigns),
  ]);

  const productMap = new Map(allProducts.map((p) => [p.id, p]));
  const colorMap = new Map(allColors.map((c) => [c.id, c]));

  // Operational KPIs from verified DB records
  const newOrdersCount = allOrders.filter(
    (o) => o.operationalStatus === "new"
  ).length;
  const awaitingPrepCount = allOrders.filter(
    (o) => o.operationalStatus === "awaiting_prep"
  ).length;
  const pickingPackingCount = allOrders.filter(
    (o) =>
      o.operationalStatus === "picking" || o.operationalStatus === "packing"
  ).length;
  const readyToShipCount = allOrders.filter(
    (o) => o.operationalStatus === "ready_to_ship"
  ).length;
  const shippingExceptionsCount = allOrders.filter(
    (o) => o.operationalStatus === "exception"
  ).length;
  const returnsActionCount = allReturns.filter(
    (r) =>
      r.status === "requested" ||
      r.status === "received" ||
      r.status === "qc_passed"
  ).length;
  const financialExceptionsCount = allOrders.filter(
    (o) =>
      o.paymentStatus === "pending_verification" ||
      o.paymentStatus === "failed"
  ).length;

  // Low-stock & out-of-stock SKU alerts
  const skuAlerts = allVariants
    .filter((v) => v.isActive)
    .map((v) => {
      const prod = productMap.get(v.productId);
      const col = colorMap.get(v.colorId);
      const metrics = resolveVariantMetrics({
        productBasePrice: prod?.basePrice ?? 0,
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
        variantId: v.id,
        productId: v.productId,
        productName: prod?.name ?? "محصول",
        colorName: col?.name ?? "",
        colorHex: col?.hex ?? "#999999",
        sizeLabel: v.sizeLabel,
        sku: v.sku,
        physicalStock: v.physicalStock,
        reservedStock: v.reservedStock,
        sellableStock: metrics.sellableStock,
        threshold: v.lowStockThreshold,
        isLowStock: metrics.isLowStock,
        isOutOfStock: metrics.isOutOfStock,
      };
    })
    .filter((item) => item.isLowStock || item.isOutOfStock);

  // Verified Sales Overview (explicitly separating Recorded Order Value vs Verified Paid vs Pending)
  const recordedOrderValue = allOrders
    .filter((o) => o.operationalStatus !== "cancelled")
    .reduce((acc, o) => acc + o.totalAmount, 0);

  const verifiedPaidValue = allOrders
    .filter((o) => o.paymentStatus === "verified_paid")
    .reduce((acc, o) => acc + o.totalAmount, 0);

  const pendingVerificationValue = allOrders
    .filter(
      (o) =>
        o.paymentStatus === "pending_verification" ||
        o.paymentStatus === "unpaid"
    )
    .reduce((acc, o) => acc + o.totalAmount, 0);

  const confirmedRefundsValue = allReturns
    .filter((r) => r.status === "refund_confirmed")
    .reduce((acc, r) => acc + r.requestedQty * 2150000, 0);

  const pendingAdjustmentsCount = allAdjustments.filter(
    (a) => a.status === "pending"
  ).length;

  const activeCampaignsCount = allCampaigns.filter(
    (c) => c.status === "active"
  ).length;

  return NextResponse.json({
    kpis: {
      newOrdersCount,
      awaitingPrepCount,
      pickingPackingCount,
      readyToShipCount,
      shippingExceptionsCount,
      returnsActionCount,
      lowStockAlertsCount: skuAlerts.length,
      financialExceptionsCount,
      pendingAdjustmentsCount,
      activeCampaignsCount,
    },
    salesOverview: {
      currencyUnit: "IRT",
      recordedOrderValue,
      verifiedPaidValue,
      pendingVerificationValue,
      confirmedRefundsValue,
      totalOrdersCount: allOrders.length,
      verifiedPaidOrdersCount: allOrders.filter(
        (o) => o.paymentStatus === "verified_paid"
      ).length,
      contractNote:
        "ارزش سفارش ثبت‌شده با پرداخت تاییدشده بانکی تفکیک شده است؛ تسویه نهایی بانکی منوط به گزارش شاپرک است.",
    },
    skuAlerts,
    recentOrders: allOrders.slice(0, 5),
    recentEvents,
  });
}
