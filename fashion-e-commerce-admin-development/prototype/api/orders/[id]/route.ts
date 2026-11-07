import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import {
  orders,
  orderItems,
  orderEvents,
  returnRequests,
  auditLogs,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireApiPermission } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "orders", "view");
  if (!auth.authorized) return auth.response;

  const { id } = await context.params;
  const orderId = Number(id);
  if (Number.isNaN(orderId)) {
    return NextResponse.json({ error: "شناسه سفارش نامعتبر است" }, { status: 400 });
  }

  const [ordRows, items, events, returns] = await Promise.all([
    db.select().from(orders).where(eq(orders.id, orderId)),
    db.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
    db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, orderId))
      .orderBy(desc(orderEvents.createdAt)),
    db.select().from(returnRequests).where(eq(returnRequests.orderId, orderId)),
  ]);

  if (!ordRows[0]) {
    return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
  }

  return NextResponse.json({
    order: ordRows[0],
    items,
    events,
    returns,
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "orders", "edit");
  if (!auth.authorized) return auth.response;

  const { id } = await context.params;
  const orderId = Number(id);
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId));
  if (!order) {
    return NextResponse.json({ error: "سفارش یافت نشد" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const action = body?.action;

    // 1. Barcode SKU Scan during Picking (with Wrong-SKU protection!)
    if (action === "scan_pick") {
      const scannedSku = String(body?.sku ?? "").trim().toUpperCase();
      if (!scannedSku) {
        return NextResponse.json(
          { error: "لطفاً بارکد یا کد SKU را اسکن یا وارد کنید." },
          { status: 400 }
        );
      }

      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      const matched = items.find(
        (it) =>
          it.sku.toUpperCase() === scannedSku &&
          it.pickedQuantity < it.quantity
      );

      if (!matched) {
        const alreadyFull = items.find(
          (it) => it.sku.toUpperCase() === scannedSku
        );
        if (alreadyFull) {
          return NextResponse.json(
            {
              error: `تعداد مورد نیاز برای کد ${scannedSku} قبلاً به طور کامل برداشت شده است.`,
              code: "ALREADY_PICKED",
            },
            { status: 400 }
          );
        }
        return NextResponse.json(
          {
            error: `هشدار بارکد اشتباه! کد ${scannedSku} متعلق به اقلام سفارش ${order.orderNumber} نیست.`,
            code: "WRONG_SKU_SCANNED",
          },
          { status: 400 }
        );
      }

      const nextPicked = matched.pickedQuantity + 1;
      await db
        .update(orderItems)
        .set({ pickedQuantity: nextPicked })
        .where(eq(orderItems.id, matched.id));

      const allItemsAfter = items.map((it) =>
        it.id === matched.id ? { ...it, pickedQuantity: nextPicked } : it
      );
      const allPicked = allItemsAfter.every(
        (it) => it.pickedQuantity >= it.quantity
      );

      const nextOpStatus = allPicked ? "packing" : "picking";
      await db
        .update(orders)
        .set({ operationalStatus: nextOpStatus, updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      await db.insert(orderEvents).values({
        orderId,
        eventType: "sku_picked",
        title: `اسکن موفق بارکد ${matched.sku}`,
        description: allPicked
          ? "تمامی اقلام سفارش برداشت شدند و سفارش آماده بسته‌بندی نهایی است."
          : `تعداد برداشت‌شده ${matched.sku}: ${nextPicked} از ${matched.quantity}`,
        actorName: auth.actorName,
      });

      return NextResponse.json({
        ok: true,
        scannedSku: matched.sku,
        allPicked,
        operationalStatus: nextOpStatus,
      });
    }

    // 2. Complete Packing Verification -> ready_to_ship
    if (action === "pack_verify") {
      const items = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));

      const unpicked = items.some((it) => it.pickedQuantity < it.quantity);
      if (unpicked) {
        return NextResponse.json(
          {
            error:
              "پیش از تایید بسته‌بندی، تمامی اقلام سفارش باید در مرحله برداشت اسکن شوند.",
          },
          { status: 400 }
        );
      }

      for (const it of items) {
        await db
          .update(orderItems)
          .set({ packedQuantity: it.quantity })
          .where(eq(orderItems.id, it.id));
      }

      await db
        .update(orders)
        .set({ operationalStatus: "ready_to_ship", updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      await db.insert(orderEvents).values({
        orderId,
        eventType: "packing_completed",
        title: "تکمیل بسته‌بندی و کنترل کیفیت مرسوله",
        description: "بسته پلمب شد و برچسب ارسال استاندارد آماده چاپ است.",
        actorName: auth.actorName,
      });

      return NextResponse.json({ ok: true, operationalStatus: "ready_to_ship" });
    }

    // 3. Shipment Handoff (Entering tracking code -> shipped, NOT delivered!)
    if (action === "ship_handoff") {
      if (order.paymentStatus !== "verified_paid") {
        return NextResponse.json(
          {
            error:
              "ارسال سفارش بدون تایید قطعی پرداخت (verified_paid) مجاز نیست.",
          },
          { status: 400 }
        );
      }
      const trackingCode = String(body?.trackingCode ?? "").trim();
      const carrierName = String(
        body?.carrierName ?? order.carrierName ?? "شرکت ملی پست"
      ).trim();

      if (!trackingCode) {
        return NextResponse.json(
          { error: "ثبت کد رهگیری پستی یا کد تحویل سفیر الزامی است." },
          { status: 400 }
        );
      }

      await db
        .update(orders)
        .set({
          trackingCode,
          carrierName,
          operationalStatus: "shipped",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      await db.insert(orderEvents).values({
        orderId,
        eventType: "shipment_handoff",
        title: "تحویل مرسوله به شرکت حمل‌ونقل",
        description: `تحویل به ${carrierName} با کد رهگیری ${trackingCode} (در انتظار تایید تحویل به گیرنده).`,
        actorName: auth.actorName,
      });

      return NextResponse.json({
        ok: true,
        operationalStatus: "shipped",
        trackingCode,
      });
    }

    // 4. Confirm Delivery (Distinct from entering tracking!)
    if (action === "confirm_delivery") {
      await db
        .update(orders)
        .set({ operationalStatus: "delivered", updatedAt: new Date() })
        .where(eq(orders.id, orderId));

      await db.insert(orderEvents).values({
        orderId,
        eventType: "delivery_confirmed",
        title: "تایید تحویل نهایی مرسوله به مشتری",
        description: "رسید تحویل گیرنده ثبت شد.",
        actorName: auth.actorName,
      });

      return NextResponse.json({ ok: true, operationalStatus: "delivered" });
    }

    // 5. Continue Payment on Existing Unpaid Manual Order (NEVER creates duplicate order!)
    if (action === "continue_payment") {
      const gateway = String(body?.gateway ?? order.paymentGateway);
      const ref =
        String(body?.paymentRef ?? "").trim() ||
        `ZP-${Math.floor(10000000 + Math.random() * 89999999)}`;

      await db
        .update(orders)
        .set({
          paymentGateway: gateway,
          paymentRef: ref,
          paymentStatus: "verified_paid",
          operationalStatus:
            order.operationalStatus === "new"
              ? "awaiting_prep"
              : order.operationalStatus,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      await db.insert(orderEvents).values({
        orderId,
        eventType: "payment_verified",
        title: "تایید پرداخت روی سفارش موجود",
        description: `پرداخت از طریق ${gateway} با کد پیگیری ${ref} روی همین سفارش تایید شد (بدون ایجاد سفارش تکراری).`,
        actorName: auth.actorName,
      });

      await db.insert(auditLogs).values({
        actorName: auth.actorName,
        actorRole: auth.role,
        module: "سفارش‌ها",
        action: `تایید پرداخت سفارش موجود ${order.orderNumber}`,
        entityRef: order.orderNumber,
        result: "success",
        referenceCode: ref,
      });

      return NextResponse.json({
        ok: true,
        paymentStatus: "verified_paid",
        paymentRef: ref,
      });
    }

    return NextResponse.json({ error: "عملیات سفارش نامعتبر است" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در بروزرسانی وضعیت سفارش", detail: String(err) },
      { status: 500 }
    );
  }
}
