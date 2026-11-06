import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import {
  campaigns,
  smsCampaigns,
  smsLogs,
  customers,
  auditLogs,
} from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireApiPermission } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "marketing", "view");
  if (!auth.authorized) return auth.response;

  const [allCampaigns, allSmsCampaigns, allSmsLogs, allCustomers] =
    await Promise.all([
      db.select().from(campaigns).orderBy(desc(campaigns.id)),
      db.select().from(smsCampaigns).orderBy(desc(smsCampaigns.createdAt)),
      db.select().from(smsLogs).orderBy(desc(smsLogs.sentAt)).limit(50),
      db.select().from(customers),
    ]);

  const eligibleSmsCount = allCustomers.filter(
    (c) => c.marketingConsent && !c.smsUnsubscribed
  ).length;
  const suppressedCount = allCustomers.length - eligibleSmsCount;

  return NextResponse.json({
    campaigns: allCampaigns,
    smsCampaigns: allSmsCampaigns,
    smsLogs: allSmsLogs,
    audienceSummary: {
      totalCustomers: allCustomers.length,
      eligibleSmsCount,
      suppressedCount,
    },
  });
}

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "marketing", "create");
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const kind = body?.kind;

    if (kind === "campaign") {
      const name = String(body?.name ?? "").trim();
      const description = String(body?.description ?? "").trim();
      const promotionType = [
        "percent_off",
        "fixed_off",
        "festival_bundle",
      ].includes(body?.promotionType)
        ? body.promotionType
        : "percent_off";
      const discountValue = Math.max(
        1,
        Math.round(Number(body?.discountValue ?? 10))
      );
      const maxCapacity = Math.max(
        1,
        Math.round(Number(body?.maxCapacity ?? 200))
      );
      const perCustomerLimit = Math.max(
        1,
        Math.round(Number(body?.perCustomerLimit ?? 1))
      );

      if (!name) {
        return NextResponse.json(
          { error: "عنوان کمپین یا جشنواره الزامی است." },
          { status: 400 }
        );
      }

      const [created] = await db
        .insert(campaigns)
        .values({
          name,
          description,
          promotionType,
          discountValue,
          status: "draft",
          startAt: body?.startAt ? new Date(body.startAt) : new Date(),
          endAt: body?.endAt
            ? new Date(body.endAt)
            : new Date(Date.now() + 7 * 86400000),
          eligibleScope: String(body?.eligibleScope ?? "all"),
          eligibleCount: Number(body?.eligibleCount ?? 15),
          maxCapacity,
          usedCount: 0,
          perCustomerLimit,
        })
        .returning();

      return NextResponse.json({ campaign: created }, { status: 201 });
    }

    if (kind === "sms_campaign") {
      const title = String(body?.title ?? "").trim();
      const campaignType = String(body?.campaignType ?? "promotional");
      const targetSegment = String(
        body?.targetSegment ?? "مشتریان دارای رضایت پیامکی"
      );
      const templateText = String(body?.templateText ?? "").trim();
      const dispatchNow = Boolean(body?.dispatchNow);

      if (!title || !templateText) {
        return NextResponse.json(
          { error: "عنوان و متن پیامک الزامی است." },
          { status: 400 }
        );
      }

      const allCustomers = await db.select().from(customers);
      const targetList =
        targetSegment === "مشتریان VIP"
          ? allCustomers.filter((c) => c.status === "vip")
          : allCustomers;

      const eligible = targetList.filter(
        (c) => c.marketingConsent && !c.smsUnsubscribed
      );
      const suppressed = targetList.filter(
        (c) => !c.marketingConsent || c.smsUnsubscribed
      );

      const [createdCamp] = await db
        .insert(smsCampaigns)
        .values({
          title,
          campaignType,
          targetSegment,
          templateText,
          eligibleRecipientsCount: eligible.length,
          suppressedUnsubscribedCount: suppressed.length,
          status: dispatchNow ? "dispatched_to_provider" : "draft",
          providerName: "کاوه‌نگار (Kavenegar)",
        })
        .returning();

      if (dispatchNow) {
        for (const c of eligible) {
          const masked = `${c.phone.slice(0, 4)}***${c.phone.slice(-4)} (${c.fullName})`;
          const personalized = templateText.replace(
            /\{نام\}/g,
            c.fullName.split(" ")[0] || c.fullName
          );
          await db.insert(smsLogs).values({
            smsCampaignId: createdCamp.id,
            campaignTitle: title,
            recipientMasked: masked,
            templatePreview: personalized,
            // NEVER mark delivered merely because provider accepted!
            providerStatus: "accepted_by_provider",
            deliveryStatus: "pending_operator_dlr",
            failureReason: "ارسال به سرویس‌دهنده انجام شد؛ در انتظار تایید مخابرات (DLR)",
          });
        }
        for (const s of suppressed) {
          const masked = `${s.phone.slice(0, 4)}***${s.phone.slice(-4)} (${s.fullName})`;
          await db.insert(smsLogs).values({
            smsCampaignId: createdCamp.id,
            campaignTitle: title,
            recipientMasked: masked,
            templatePreview: "— مسدودشده در فیلتر حریم خصوصی —",
            providerStatus: "rejected_by_provider",
            deliveryStatus: "failed_blocked",
            failureReason: "عدم رضایت بازاریابی یا لغو اشتراک پیامکی (Opt-Out)",
          });
        }

        await db.insert(auditLogs).values({
          actorName: auth.actorName,
          actorRole: auth.role,
          module: "پیامک مارکتینگ",
          action: `تحویل کمپین پیامکی «${title}» به سرویس‌دهنده (${eligible.length} مجاز، ${suppressed.length} مسدودشده)`,
          entityRef: `SMS-${createdCamp.id}`,
          result: "success",
          referenceCode: `SMS-${createdCamp.id}`,
        });
      }

      return NextResponse.json({ smsCampaign: createdCamp }, { status: 201 });
    }

    return NextResponse.json({ error: "نوع درخواست نامعتبر است" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در ثبت کمپین بازاریابی", detail: String(err) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  await ensureSeeded();
  const auth = await requireApiPermission(req, "marketing", "edit");
  if (!auth.authorized) return auth.response;

  try {
    const body = await req.json();
    const id = Number(body?.id);
    const status = String(body?.status ?? "");
    const allowedStates = [
      "draft",
      "scheduled",
      "active",
      "paused",
      "expired",
      "completed",
    ];
    if (!allowedStates.includes(status)) {
      return NextResponse.json(
        { error: "وضعیت کمپین نامعتبر است." },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(campaigns)
      .set({ status })
      .where(eq(campaigns.id, id))
      .returning();

    return NextResponse.json({ campaign: updated });
  } catch (err) {
    return NextResponse.json(
      { error: "خطا در بروزرسانی کمپین", detail: String(err) },
      { status: 500 }
    );
  }
}
