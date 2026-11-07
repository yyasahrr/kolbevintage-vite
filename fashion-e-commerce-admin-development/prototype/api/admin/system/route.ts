import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import {
  orders,
  returnRequests,
  integrations,
  salesRules,
  staffMembers,
  auditLogs,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireApiPermission } from "@/lib/server-auth";
import { ROLE_DEFINITIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const domain = req.nextUrl.searchParams.get("domain") || "all";

  if (domain === "finance") {
    const auth = await requireApiPermission(req, "finance", "view");
    if (!auth.authorized) return auth.response;
  } else if (domain === "integrations") {
    const auth = await requireApiPermission(req, "integrations", "view");
    if (!auth.authorized) return auth.response;
  } else if (domain === "rules") {
    const auth = await requireApiPermission(req, "rules", "view");
    if (!auth.authorized) return auth.response;
  } else if (domain === "staff") {
    const auth = await requireApiPermission(req, "staff", "view");
    if (!auth.authorized) return auth.response;
  } else if (domain === "audit") {
    const auth = await requireApiPermission(req, "audit", "view");
    if (!auth.authorized) return auth.response;
  } else {
    const auth = await requireApiPermission(req, "settings", "view");
    if (!auth.authorized) return auth.response;
  }

  const [
    allOrders,
    allReturns,
    allIntegrations,
    allRules,
    allStaff,
    allAudit,
  ] = await Promise.all([
    db.select().from(orders).orderBy(desc(orders.createdAt)),
    db.select().from(returnRequests).orderBy(desc(returnRequests.createdAt)),
    db.select().from(integrations),
    db.select().from(salesRules),
    db.select().from(staffMembers),
    db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(60),
  ]);

  const recordedOrdersTotal = allOrders
    .filter((o) => o.operationalStatus !== "cancelled")
    .reduce((s, o) => s + o.totalAmount, 0);
  const verifiedPaymentsTotal = allOrders
    .filter((o) => o.paymentStatus === "verified_paid")
    .reduce((s, o) => s + o.totalAmount, 0);
  const pendingVerificationTotal = allOrders
    .filter(
      (o) =>
        o.paymentStatus === "pending_verification" ||
        o.paymentStatus === "unpaid"
    )
    .reduce((s, o) => s + o.totalAmount, 0);

  return NextResponse.json({
    finance: {
      currencyPolicy: "IRT (تومان) — حفظ برچسب واحد تاریخی بدون تبدیل خودکار ریال/تومان",
      recordedOrdersTotal,
      verifiedPaymentsTotal,
      pendingVerificationTotal,
      transactions: allOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        amount: o.totalAmount,
        currencyUnit: o.currencyUnit,
        gateway: o.paymentGateway,
        paymentStatus: o.paymentStatus,
        paymentRef: o.paymentRef || "ثبت‌نشده",
        createdAt: o.createdAt,
      })),
      refunds: allReturns.filter(
        (r) =>
          r.status === "refund_pending_provider" ||
          r.status === "refund_confirmed"
      ),
    },
    integrations: allIntegrations,
    salesRules: allRules,
    staff: allStaff,
    roleDefinitions: Object.values(ROLE_DEFINITIONS),
    auditLogs: allAudit,
  });
}

export async function PATCH(req: NextRequest) {
  await ensureSeeded();

  try {
    const body = await req.json();
    const kind = body?.kind;

    if (kind === "sales_rule") {
      const auth = await requireApiPermission(req, "rules", "edit");
      if (!auth.authorized) return auth.response;

      const id = Number(body?.id);
      const [existing] = await db
        .select()
        .from(salesRules)
        .where(eq(salesRules.id, id));
      if (!existing) {
        return NextResponse.json({ error: "قانون یافت نشد" }, { status: 404 });
      }

      const [updated] = await db
        .update(salesRules)
        .set({
          isEnabled:
            body?.isEnabled !== undefined
              ? Boolean(body.isEnabled)
              : existing.isEnabled,
          currentValue:
            body?.currentValue !== undefined
              ? String(body.currentValue)
              : existing.currentValue,
          lastChangedBy: auth.actorName,
          updatedAt: new Date(),
        })
        .where(eq(salesRules.id, id))
        .returning();

      await db.insert(auditLogs).values({
        actorName: auth.actorName,
        actorRole: auth.role,
        module: "قوانین فروش",
        action: `تغییر سیاست «${updated.name}» به ${updated.isEnabled ? "فعال" : "غیرفعال"}`,
        entityRef: `RULE-${updated.id}`,
        result: "success",
        referenceCode: `RULE-${updated.id}`,
      });

      return NextResponse.json({ rule: updated });
    }

    if (kind === "staff_role") {
      const auth = await requireApiPermission(req, "staff", "edit");
      if (!auth.authorized) return auth.response;

      const id = Number(body?.id);
      const [existing] = await db
        .select()
        .from(staffMembers)
        .where(eq(staffMembers.id, id));
      if (!existing) {
        return NextResponse.json({ error: "همکار یافت نشد" }, { status: 404 });
      }

      const nextStatus =
        body?.status === "active" || body?.status === "suspended"
          ? body.status
          : existing.status;

      const [updated] = await db
        .update(staffMembers)
        .set({ status: nextStatus })
        .where(eq(staffMembers.id, id))
        .returning();

      await db.insert(auditLogs).values({
        actorName: auth.actorName,
        actorRole: auth.role,
        module: "کارکنان و دسترسی‌ها",
        action: `تغییر وضعیت دسترسی ${updated.fullName} به ${nextStatus}`,
        entityRef: updated.email,
        result: "success",
        referenceCode: `STF-${updated.id}`,
      });

      return NextResponse.json({ staffMember: updated });
    }

    return NextResponse.json({ error: "نوع درخواست نامعتبر است" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در بروزرسانی تنظیمات سیستمی", detail: String(err) },
      { status: 500 }
    );
  }
}
