import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import {
  orders,
  orderItems,
  orderEvents,
  products,
  productVariants,
  colorLibrary,
  customers,
  auditLogs,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireApiPermission } from "@/lib/server-auth";
import { resolveVariantMetrics } from "@/lib/pricing";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "orders", "view");
  if (!auth.authorized) return auth.response;

  const sp = req.nextUrl.searchParams;
  const statusFilter = sp.get("status") || "all";
  const q = (sp.get("q") || "").trim().toLowerCase();

  const [allOrders, allItems, allEvents] = await Promise.all([
    db.select().from(orders).orderBy(desc(orders.createdAt)),
    db.select().from(orderItems),
    db.select().from(orderEvents).orderBy(desc(orderEvents.createdAt)),
  ]);

  const itemsByOrder = new Map<number, typeof allItems>();
  for (const it of allItems) {
    const arr = itemsByOrder.get(it.orderId) ?? [];
    arr.push(it);
    itemsByOrder.set(it.orderId, arr);
  }

  const eventsByOrder = new Map<number, typeof allEvents>();
  for (const ev of allEvents) {
    const arr = eventsByOrder.get(ev.orderId) ?? [];
    arr.push(ev);
    eventsByOrder.set(ev.orderId, arr);
  }

  const enriched = allOrders.map((o) => ({
    ...o,
    items: itemsByOrder.get(o.id) ?? [],
    events: eventsByOrder.get(o.id) ?? [],
  }));

  const statusCounts = {
    all: enriched.length,
    new: enriched.filter((o) => o.operationalStatus === "new").length,
    awaiting_prep: enriched.filter(
      (o) => o.operationalStatus === "awaiting_prep"
    ).length,
    picking_packing: enriched.filter(
      (o) =>
        o.operationalStatus === "picking" || o.operationalStatus === "packing"
    ).length,
    ready_to_ship: enriched.filter(
      (o) => o.operationalStatus === "ready_to_ship"
    ).length,
    shipped: enriched.filter(
      (o) =>
        o.operationalStatus === "shipped" ||
        o.operationalStatus === "delivered"
    ).length,
    exception: enriched.filter(
      (o) =>
        o.operationalStatus === "exception" ||
        o.paymentStatus === "pending_verification" ||
        o.paymentStatus === "failed"
    ).length,
  };

  let filtered = enriched;
  if (statusFilter === "picking_packing") {
    filtered = filtered.filter(
      (o) =>
        o.operationalStatus === "picking" || o.operationalStatus === "packing"
    );
  } else if (statusFilter === "shipped") {
    filtered = filtered.filter(
      (o) =>
        o.operationalStatus === "shipped" ||
        o.operationalStatus === "delivered"
    );
  } else if (statusFilter === "exception") {
    filtered = filtered.filter(
      (o) =>
        o.operationalStatus === "exception" ||
        o.paymentStatus === "pending_verification" ||
        o.paymentStatus === "failed"
    );
  } else if (statusFilter !== "all") {
    filtered = filtered.filter((o) => o.operationalStatus === statusFilter);
  }

  if (q) {
    filtered = filtered.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.customerPhone.toLowerCase().includes(q) ||
        (o.trackingCode || "").toLowerCase().includes(q)
    );
  }

  return NextResponse.json({
    orders: filtered,
    statusCounts,
  });
}

// Step-Based Manual Order Creation: creates UNPAID order with authoritative server quote
export async function POST(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "orders", "create");
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const customerId = body?.customerId ? Number(body.customerId) : null;
    const customerName = String(body?.customerName ?? "").trim();
    const customerPhone = String(body?.customerPhone ?? "").trim();
    const shippingProvince = String(body?.shippingProvince ?? "تهران").trim();
    const shippingCity = String(body?.shippingCity ?? "تهران").trim();
    const shippingAddress = String(body?.shippingAddress ?? "").trim();
    const postalCode = String(body?.postalCode ?? "").trim();
    const shippingMethod = String(
      body?.shippingMethod ?? "پست پیشتاز"
    ).trim();
    const lines: Array<{ variantId: number; quantity: number }> = Array.isArray(
      body?.lines
    )
      ? body.lines
      : [];

    if (!customerName || !customerPhone || !shippingAddress || lines.length === 0) {
      return NextResponse.json(
        {
          error:
            "مشخصات مشتری، نشانی کامل ارسال و حداقل یک قلم کالا برای ثبت سفارش دستی الزامی است.",
        },
        { status: 400 }
      );
    }

    const [allProducts, allVariants, allColors] = await Promise.all([
      db.select().from(products),
      db.select().from(productVariants),
      db.select().from(colorLibrary),
    ]);

    const prodMap = new Map(allProducts.map((p) => [p.id, p]));
    const varMap = new Map(allVariants.map((v) => [v.id, v]));
    const colorMap = new Map(allColors.map((c) => [c.id, c]));

    let subtotalAmount = 0;
    let discountAmount = 0;
    const preparedItems: Array<{
      productId: number;
      variantId: number;
      productName: string;
      colorName: string;
      sizeLabel: string;
      sku: string;
      quantity: number;
      recordedUnitPrice: number;
      recordedDiscountAmount: number;
      recordedLineTotal: number;
    }> = [];

    for (const line of lines) {
      const variant = varMap.get(Number(line.variantId));
      const qty = Math.max(1, Math.round(Number(line.quantity) || 1));
      if (!variant || !variant.isActive) {
        return NextResponse.json(
          { error: "یکی از تنوع‌های انتخاب‌شده نامعتبر یا غیرفعال است." },
          { status: 400 }
        );
      }
      const prod = prodMap.get(variant.productId);
      const col = colorMap.get(variant.colorId);
      const metrics = resolveVariantMetrics({
        productBasePrice: prod?.basePrice ?? 0,
        colorPriceOverride: variant.colorPriceOverride,
        skuPriceOverride: variant.skuPriceOverride,
        discountMode: variant.discountMode,
        discountType: variant.discountType,
        discountValue: variant.discountValue,
        physicalStock: variant.physicalStock,
        reservedStock: variant.reservedStock,
        lowStockThreshold: variant.lowStockThreshold,
        isActive: variant.isActive,
      });

      if (qty > metrics.sellableStock) {
        return NextResponse.json(
          {
            error: `موجودی قابل فروش برای کد ${variant.sku} فقط ${metrics.sellableStock} عدد است.`,
          },
          { status: 400 }
        );
      }

      const lineGross = metrics.resolvedBasePrice * qty;
      const lineDisc = metrics.directDiscountAmount * qty;
      const lineNet = metrics.effectivePrice * qty;
      subtotalAmount += lineGross;
      discountAmount += lineDisc;

      preparedItems.push({
        productId: variant.productId,
        variantId: variant.id,
        productName: prod?.name ?? "محصول",
        colorName: col?.name ?? "",
        sizeLabel: variant.sizeLabel,
        sku: variant.sku,
        quantity: qty,
        recordedUnitPrice: metrics.resolvedBasePrice,
        recordedDiscountAmount: lineDisc,
        recordedLineTotal: lineNet,
      });
    }

    const netMerchandise = subtotalAmount - discountAmount;
    const shippingAmount = netMerchandise >= 5000000 ? 0 : 95000;
    const totalAmount = netMerchandise + shippingAmount;
    const orderNumber = `KV-${Math.floor(41000 + Math.random() * 8900)}`;

    // Verify customer if provided
    if (customerId) {
      await db.select().from(customers).where(eq(customers.id, customerId));
    }

    const [createdOrder] = await db
      .insert(orders)
      .values({
        orderNumber,
        customerId,
        customerName,
        customerPhone,
        shippingProvince,
        shippingCity,
        shippingAddress,
        postalCode,
        recipientName: customerName,
        subtotalAmount,
        discountAmount,
        shippingAmount,
        totalAmount,
        currencyUnit: "IRT",
        paymentStatus: "unpaid", // Step 5: Always creates an UNPAID order first!
        paymentGateway: "zarinpal",
        operationalStatus: "new",
        shippingMethod,
        carrierName:
          shippingMethod === "پیک اختصاصی تهران"
            ? "ناوگان ارسال کلبه"
            : "شرکت ملی پست",
        isManualOrder: true,
      })
      .returning();

    for (const item of preparedItems) {
      await db.insert(orderItems).values({
        orderId: createdOrder.id,
        ...item,
        pickedQuantity: 0,
        packedQuantity: 0,
      });
    }

    await db.insert(orderEvents).values({
      orderId: createdOrder.id,
      eventType: "manual_order_created",
      title: "ثبت سفارش دستی در وضعیت پرداخت‌نشده",
      description: `سفارش توسط ${auth.actorName} با استعلام قیمت قطعی سرور ثبت شد و آماده ادامه فرآیند پرداخت است.`,
      actorName: auth.actorName,
    });

    await db.insert(auditLogs).values({
      actorName: auth.actorName,
      actorRole: auth.role,
      module: "سفارش‌ها",
      action: `ایجاد سفارش دستی پرداخت‌نشده ${createdOrder.orderNumber}`,
      entityRef: createdOrder.orderNumber,
      result: "success",
      referenceCode: createdOrder.orderNumber,
    });

    return NextResponse.json({ order: createdOrder }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در ثبت سفارش دستی", detail: String(err) },
      { status: 500 }
    );
  }
}
