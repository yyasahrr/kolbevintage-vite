"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import {
  LoadingState,
  UnauthorizedState,
} from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import { formatJalaliDateTime, formatNumberFa } from "@/lib/formatters";
import { Send, ShieldCheck, AlertTriangle } from "lucide-react";

interface SmsLogRow {
  id: number;
  campaignTitle: string;
  recipientMasked: string;
  templatePreview: string;
  providerStatus: string;
  deliveryStatus: string;
  failureReason: string;
  sentAt: string;
}

export default function SmsMarketingPage() {
  const { can } = useRole();
  const [logs, setLogs] = useState<SmsLogRow[]>([]);
  const [audienceSummary, setAudienceSummary] = useState({
    totalCustomers: 0,
    eligibleSmsCount: 0,
    suppressedCount: 0,
  });
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [campaignType, setCampaignType] = useState("promotional");
  const [targetSegment, setTargetSegment] = useState(
    "مشتریان دارای رضایت پیامکی"
  );
  const [templateText, setTemplateText] = useState(
    "{نام} عزیز، کالکشن جدید پاییزه کلبه وینتیج هم‌اکنون در دسترس است. لغو: ۱۱"
  );
  const [sending, setSending] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<string | null>(null);

  const loadSms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/marketing", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.smsLogs || []);
        if (data.audienceSummary) setAudienceSummary(data.audienceSummary);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSms();
  }, [loadSms]);

  if (!can("marketing", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="پیامک مارکتینگ و گزارش ارسال" />
      </AdminShell>
    );
  }

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !templateText.trim()) return;
    setSending(true);
    setDispatchResult(null);
    try {
      const res = await fetch("/api/marketing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "sms_campaign",
          title: title.trim(),
          campaignType,
          targetSegment,
          templateText: templateText.trim(),
          dispatchNow: true,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setTitle("");
        setDispatchResult(
          `درخواست ارسال به پنل کاوه‌نگار تحویل شد (${formatNumberFa(data.smsCampaign.eligibleRecipientsCount)} مخاطب مجاز در انتظار تایید مخابرات DLR، و ${formatNumberFa(data.smsCampaign.suppressedUnsubscribedCount)} مخاطب لغواشتراک فیلتر شدند).`
        );
        loadSms();
      }
    } finally {
      setSending(false);
    }
  };

  const segmentsCount = Math.max(1, Math.ceil(templateText.length / 70));

  return (
    <AdminShell>
      <PageHeader
        title="پیامک مارکتینگ و گزارش تحویل مخابراتی (SMS Marketing)"
        description="ارسال هدفمند با رعایت خودکار فهرست لغو اشتراک (Opt-Out) و تفکیک «پذیرش سرویس‌دهنده» از «تحویل قطعی مخابرات (DLR)»"
      />

      {/* Consent & Delivery Accuracy Guardrail */}
      <div className="mb-5 rounded-2xl border border-[#C1BCF2] bg-[#F0EEFF]/60 p-4 text-xs text-[#344054] flex items-start gap-2.5">
        <ShieldCheck className="h-4 w-4 text-[#1813FB] shrink-0 mt-0.5" />
        <span>
          <strong>حریم خصوصی و دقت گزارش تحویل:</strong> شماره‌هایی که گزینه
          لغو اشتراک پیامک تبلیغاتی را فعال کرده‌اند به صورت خودکار مسدود
          می‌شوند. همچنین تحویل درخواست به وب‌سرویس پیامک هرگز به معنای
          «تحویل‌شده به گوشی کاربر» ثبت نمی‌شود تا گزارش DLR اپراتور دریافت
          گردد.
        </span>
      </div>

      {dispatchResult && (
        <div className="mb-4 rounded-xl border border-[#A6F4C5] bg-[#ECFDF3] px-4 py-2.5 text-xs font-medium text-[#127A4B]">
          {dispatchResult}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* SMS Campaign Composer */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-5 space-y-4">
          <h2 className="text-sm font-semibold text-[#080707]">
            طراحی و ارسال کمپین پیامکی
          </h2>

          <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#FAFAFE] p-3 text-center text-xs">
            <div>
              <div className="text-[11px] text-[#626775]">کل مخاطبان</div>
              <div className="font-bold text-[#080707]">
                {formatNumberFa(audienceSummary.totalCustomers)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#127A4B]">مجاز ارسال</div>
              <div className="font-bold text-[#127A4B]">
                {formatNumberFa(audienceSummary.eligibleSmsCount)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#B44F40]">فیلتر لغواشتراک</div>
              <div className="font-bold text-[#B44F40]">
                {formatNumberFa(audienceSummary.suppressedCount)}
              </div>
            </div>
          </div>

          <form onSubmit={handleDispatch} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                عنوان کمپین پیامکی
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: اطلاع‌رسانی شارژ مجدد پالتو آوین"
                className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-[#344054] mb-1">
                  نوع کمپین
                </label>
                <select
                  value={campaignType}
                  onChange={(e) => setCampaignType(e.target.value)}
                  className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-2.5 text-xs"
                >
                  <option value="promotional">تبلیغاتی جشنواره</option>
                  <option value="birthday">تبریک تولد مشتری</option>
                  <option value="reactivation">بازگشت مشتریان غیرفعال</option>
                  <option value="restock_alert">اطلاع‌رسانی شارژ موجودی</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#344054] mb-1">
                  گروه مخاطبان هدف
                </label>
                <select
                  value={targetSegment}
                  onChange={(e) => setTargetSegment(e.target.value)}
                  className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-2.5 text-xs"
                >
                  <option value="مشتریان دارای رضایت پیامکی">
                    همه مشتریان مجاز
                  </option>
                  <option value="مشتریان VIP">فقط مشتریان VIP</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                متن پیامک (از متغیر {"{نام}"} برای شخصی‌سازی استفاده کنید)
              </label>
              <textarea
                rows={4}
                required
                value={templateText}
                onChange={(e) => setTemplateText(e.target.value)}
                className="w-full rounded-xl border border-[#E5E7EB] p-3 text-xs leading-relaxed"
              />
              <div className="mt-1 flex justify-between text-[11px] text-[#626775]">
                <span>
                  طول متن: {formatNumberFa(templateText.length)} کاراکتر (
                  {formatNumberFa(segmentsCount)} صفحه پیامک فارسی)
                </span>
                <span>پیش‌نمایش: {templateText.replace(/\{نام\}/g, "نیلوفر")}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={sending || !can("marketing", "publish")}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1] disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              <span>
                {sending
                  ? "در حال تحویل به وب‌سرویس پیامک..."
                  : "ارسال به سرویس‌دهنده پیامک (با فیلتر لغو اشتراک)"}
              </span>
            </button>
          </form>
        </div>

        {/* SMS Delivery Records Table */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-7 space-y-3">
          <h2 className="text-sm font-semibold text-[#080707]">
            گزارش رکوردهای ارسال و وضعیت مخابراتی (SMS Logs)
          </h2>

          {loading ? (
            <LoadingState />
          ) : (
            <div className="overflow-x-auto kv-scroll-table">
              <table className="w-full min-w-[660px] text-right text-xs">
                <thead>
                  <tr className="border-b border-[#EFEFF5] text-[11px] text-[#626775]">
                    <th className="py-2.5 font-medium">گیرنده (محافظت‌شده)</th>
                    <th className="py-2.5 font-medium">کمپین</th>
                    <th className="py-2.5 font-medium">وضعیت سرویس‌دهنده</th>
                    <th className="py-2.5 font-medium">وضعیت تحویل مخابرات</th>
                    <th className="py-2.5 font-medium">زمان</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEFF5]">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-[#FAFAFE]">
                      <td className="py-3 font-medium text-[#080707]">
                        <bdi dir="ltr">{log.recipientMasked}</bdi>
                      </td>
                      <td className="py-3">
                        <div className="font-medium text-[#080707]">
                          {log.campaignTitle}
                        </div>
                        <div className="text-[11px] text-[#626775] truncate max-w-[210px]">
                          {log.templatePreview}
                        </div>
                      </td>
                      <td className="py-3">
                        {log.providerStatus === "accepted_by_provider" ? (
                          <StatusBadge
                            label="پذیرفته‌شده توسط پنل"
                            tone="indigo"
                          />
                        ) : (
                          <StatusBadge
                            label="رد شده پیش از ارسال"
                            tone="danger"
                          />
                        )}
                      </td>
                      <td className="py-3">
                        {log.deliveryStatus === "delivered" ? (
                          <StatusBadge
                            label="تحویل به گوشی (DLR تاییدشد)"
                            tone="success"
                          />
                        ) : log.deliveryStatus === "pending_operator_dlr" ? (
                          <StatusBadge
                            label="در انتظار تایید اپراتور (DLR)"
                            tone="warning"
                          />
                        ) : (
                          <div className="space-y-0.5">
                            <StatusBadge
                              label="مسدودشده (لغو اشتراک)"
                              tone="danger"
                            />
                            {log.failureReason && (
                              <div className="text-[10px] text-[#B44F40]">
                                {log.failureReason}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-[11px] text-[#626775] whitespace-nowrap">
                        {formatJalaliDateTime(log.sentAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
