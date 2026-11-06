import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import { returnRequests, orderItems, orders, auditLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireApiPermission } from "@/lib/server-auth";
import { hasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "returns", "view");
  if (!auth.authorized) return auth.response;

  const [allReturns, allOrders, allItems] = await Promise.all([
    db.select().from(returnRequests).orderBy(desc(returnRequests.createdAt)),
    db.select().from(orders),
    db.select().from(orderItems),
  ]);

  return NextResponse.json({
    returns: allReturns,
    eligibleOrders: allOrders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      items: allItems.filter((it) => it.orderId === o.id),
    })),
  });
}

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "returns", "create");
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const orderItemId = Number(body?.orderItemId);
    const requestedQty = Math.max(1, Math.round(Number(body?.requestedQty ?? 1)));
    const reason = String(body?.reason ?? "").trim();

    if (!orderItemId || !reason) {
      return NextResponse.json(
        { error: "انتخاب قلم سفارش و دلیل مرجوعی الزامی است." },
        { status: 400 }
      );
    }

    const [item] = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.id, orderItemId));
    if (!item) {
      return NextResponse.json({ error: "قلم سفارش یافت نشد" }, { status: 404 });
    }

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, item.orderId));
    const existingReturns = await db
      .select()
      .from(returnRequests)
      .where(eq(returnRequests.orderItemId, orderItemId));

    const previouslyReturnedQty = existingReturns.reduce(
      (sum, r) => sum + r.requestedQty,
      0
    );
    const eligibleRemaining = item.quantity - previouslyReturnedQty;

    if (requestedQty > eligibleRemaining) {
      return NextResponse.json(
        {
          error: `تعداد درخواستی (${requestedQty}) بیشتر از تعداد مجاز باقی‌مانده (${eligibleRemaining} از ${item.quantity}) است.`,
        },
        { status: 400 }
      );
    }

    const returnCode = `RET-${Math.floor(9020 + Math.random() * 900)}`;
    const [created] = await db
      .insert(returnRequests)
      .values({
        returnCode,
        orderId: item.orderId,
        orderNumber: order?.orderNumber ?? `ORD-${item.orderId}`,
        orderItemId: item.id,
        sku: item.sku,
        productName: item.productName,
        purchasedQty: item.quantity,
        previouslyReturnedQty,
        requestedQty,
        reason,
        status: "requested",
      })
      .returning();

    return NextResponse.json({ returnRequest: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در ثبت درخواست مرجوعی", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "returns", "edit");
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const id = Number(body?.id);
    const nextStatus = String(body?.status ?? "");

    const [existing] = await db
      .select()
      .from(returnRequests)
      .where(eq(returnRequests.id, id));
    if (!existing) {
      return NextResponse.json(
        { error: "پرونده مرجوعی یافت نشد" },
        { status: 404 }
      );
    }

    // Confirming provider refund requires finance/approve permission + provider reference!
    if (nextStatus === "refund_confirmed") {
      if (!hasPermission(auth.role, "returns", "approve")) {
        return NextResponse.json(
          {
            error:
              "تایید نهایی بازپرداخت وجه نیازمند مجوز تایید مالی (approve) است.",
          },
          { status: 403 }
        );
      }
      const ref = String(
        body?.refundProviderRef ?? existing.refundProviderRef ?? ""
      ).trim();
      if (!ref) {
        return NextResponse.json(
          {
            error:
              "ثبت شماره پیگیری تاییدشده بانک/شاپرک پیش از نمایش وضعیت بازپرداخت موفق الزامی است.",
          },
          { status: 400 }
        );
      }
    }

    const [updated] = await db
      .update(returnRequests)
      .set({
        status: nextStatus || existing.status,
        qcNotes:
          body?.qcNotes !== undefined ? String(body.qcNotes) : existing.qcNotes,
        refundProviderRef:
          body?.refundProviderRef !== undefined
            ? String(body.refundProviderRef)
            : existing.refundProviderRef,
      })
      .where(eq(returnRequests.id, id))
      .returning();

    await db.insert(auditLogs).values({
      actorName: auth.actorName,
      actorRole: auth.role,
      module: "مرجوعی",
      action: `تغییر وضعیت پرونده مرجوعی ${existing.returnCode} به ${updated.status}`,
      entityRef: existing.returnCode,
      result: "success",
      referenceCode: updated.refundProviderRef || existing.returnCode,
    });

    return NextResponse.json({ returnRequest: updated });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در بروزرسانی پرونده مرجوعی", detail: String(err) },
      { status: 500 }
    );
  }
}
