import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import { customers, orders, returnRequests, auditLogs } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireApiPermission } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "crm", "view");
  if (!auth.authorized) return auth.response;

  const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
  const tagFilter = (req.nextUrl.searchParams.get("tag") || "").trim();
  const segmentFilter = (req.nextUrl.searchParams.get("segment") || "all").trim();

  const [allCustomers, allOrders, allReturns] = await Promise.all([
    db.select().from(customers).orderBy(desc(customers.registeredAt)),
    db.select().from(orders),
    db.select().from(returnRequests),
  ]);

  const enriched = allCustomers.map((c) => {
    const custOrders = allOrders.filter(
      (o) => o.customerId === c.id || o.customerPhone === c.phone
    );
    const verifiedPaidTotal = custOrders
      .filter((o) => o.paymentStatus === "verified_paid")
      .reduce((sum, o) => sum + o.totalAmount, 0);
    const custReturns = allReturns.filter((r) =>
      custOrders.some((o) => o.id === r.orderId)
    );

    return {
      ...c,
      ordersCount: custOrders.length,
      verifiedPaidTotal,
      returnsCount: custReturns.length,
      recentOrders: custOrders.slice(0, 5),
    };
  });

  // Explicit rule-based segment counts (NO fabricated LTV!)
  const segments = [
    {
      key: "all",
      title: "همه مشتریان",
      ruleDefinition: "کلیه حساب‌های ثبت‌شده در سیستم",
      count: enriched.length,
    },
    {
      key: "vip",
      title: "مشتریان ویژه (VIP)",
      ruleDefinition: "مشتریان دارای برچسب وضعیت VIP یا پرداخت تاییدشده بالای ۶ میلیون تومان",
      count: enriched.filter(
        (c) => c.status === "vip" || c.verifiedPaidTotal >= 6000000
      ).length,
    },
    {
      key: "frequent",
      title: "خریداران مکرر",
      ruleDefinition: "مشتریان با ۲ سفارش ثبت‌شده یا بیشتر",
      count: enriched.filter((c) => c.ordersCount >= 2).length,
    },
    {
      key: "sms_consented",
      title: "دارای رضایت پیامکی",
      ruleDefinition: "رضایت بازاریابی فعال و عدم لغو اشتراک (Opt-Out=False)",
      count: enriched.filter(
        (c) => c.marketingConsent && !c.smsUnsubscribed
      ).length,
    },
    {
      key: "unsubscribed",
      title: "لغو اشتراک پیامک",
      ruleDefinition: "مشتریانی که دریافت پیامک تبلیغاتی را مسدود کرده‌اند",
      count: enriched.filter((c) => c.smsUnsubscribed || !c.marketingConsent)
        .length,
    },
  ];

  const allTags = Array.from(
    new Set(enriched.flatMap((c) => c.tagsJson ?? []))
  );

  let filtered = enriched;
  if (segmentFilter === "vip") {
    filtered = filtered.filter(
      (c) => c.status === "vip" || c.verifiedPaidTotal >= 6000000
    );
  } else if (segmentFilter === "frequent") {
    filtered = filtered.filter((c) => c.ordersCount >= 2);
  } else if (segmentFilter === "sms_consented") {
    filtered = filtered.filter(
      (c) => c.marketingConsent && !c.smsUnsubscribed
    );
  } else if (segmentFilter === "unsubscribed") {
    filtered = filtered.filter(
      (c) => c.smsUnsubscribed || !c.marketingConsent
    );
  }

  if (tagFilter) {
    filtered = filtered.filter((c) => (c.tagsJson ?? []).includes(tagFilter));
  }
  if (q) {
    filtered = filtered.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.city.toLowerCase().includes(q)
    );
  }

  return NextResponse.json({
    customers: filtered,
    segments,
    allTags,
  });
}

export async function PATCH(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "crm", "edit");
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const id = Number(body?.id);
    const [existing] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id));
    if (!existing) {
      return NextResponse.json({ error: "مشتری یافت نشد" }, { status: 404 });
    }

    const [updated] = await db
      .update(customers)
      .set({
        tagsJson: Array.isArray(body?.tagsJson)
          ? body.tagsJson.map(String)
          : existing.tagsJson,
        internalNotes:
          body?.internalNotes !== undefined
            ? String(body.internalNotes)
            : existing.internalNotes,
        smsUnsubscribed:
          body?.smsUnsubscribed !== undefined
            ? Boolean(body.smsUnsubscribed)
            : existing.smsUnsubscribed,
        status:
          body?.status && ["active", "vip", "restricted"].includes(body.status)
            ? body.status
            : existing.status,
      })
      .where(eq(customers.id, id))
      .returning();

    await db.insert(auditLogs).values({
      actorName: auth.actorName,
      actorRole: auth.role,
      module: "CRM",
      action: `بروزرسانی برچسب/تنظیمات ارتباطی مشتری: ${existing.fullName}`,
      entityRef: existing.phone,
      result: "success",
      referenceCode: `CRM-${existing.id}`,
    });

    return NextResponse.json({ customer: updated });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در بروزرسانی اطلاعات مشتری", detail: String(err) },
      { status: 500 }
    );
  }
}
