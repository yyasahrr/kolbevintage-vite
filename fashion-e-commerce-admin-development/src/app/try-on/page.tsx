"use client";

import React, { useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { UnauthorizedState } from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import { TRY_ON_MODELS } from "@/lib/business-decisions";
import { Wand2, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";

export default function TryOnSpecificationPage() {
  const { can } = useRole();
  const [selectedModelId, setSelectedModelId] = useState<string>(
    TRY_ON_MODELS[0].id
  );

  if (!can("try_on", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="مستند تصمیم تجاری پرو مجازی (Try-On)" />
      </AdminShell>
    );
  }

  const activeModel =
    TRY_ON_MODELS.find((m) => m.id === selectedModelId) || TRY_ON_MODELS[0];

  return (
    <AdminShell>
      <PageHeader
        title="ماژول پرو مجازی و بسته‌های خدمات (Try-On — نیازمند تصمیم تجاری)"
        description="مستند تحلیل UX و مقایسه ۴ مدل تجاری احتمالی پیش از پیاده‌سازی موتور پردازش یا لجستیک فیزیکی"
        badge={
          <StatusBadge
            label="وضعیت: DESIGNED • در انتظار تصویب مدل تجاری"
            tone="warning"
          />
        }
      />

      {/* Explicit Guardrail Banner per Section 30 */}
      <div className="mb-5 rounded-2xl border border-[#FEDF89] bg-[#FFFAEB] p-4 text-xs text-[#7A4905] flex items-start gap-2.5">
        <AlertTriangle className="h-4 w-4 text-[#9A5B04] shrink-0 mt-0.5" />
        <div>
          <strong>توقف پیاده‌سازی اجرایی تا تصویب مدل تجاری:</strong> مطابق
          اصل معماری پروژه، ماهیت «پرو مجازی / بسته ۵ بار استفاده» هنوز بین
          مدل‌های پردازش تصویر هوش مصنوعی، پرو فیزیکی در منزل، رزرو وقت شوروم یا
          مشاوره دیجیتال نهایی نشده است. بنابراین هیچ پردازشگر جعلی AI یا رزرو
          جعلی در این صفحه اجرا نمی‌شود و ساختار کامل UX برای تصمیم‌گیری مدیران
          ارائه شده است.
        </div>
      </div>

      {/* 4 Business Model Selector Cards */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TRY_ON_MODELS.map((m) => {
          const selected = m.id === activeModel.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedModelId(m.id)}
              className={`rounded-2xl border p-4 text-right transition-all flex flex-col justify-between space-y-2 ${
                selected
                  ? "border-[#1813FB] bg-[#F0EEFF] ring-2 ring-[#1813FB]/15"
                  : "border-[#E5E7EB] bg-white hover:border-[#C1BCF2]"
              }`}
            >
              <div className="flex items-center justify-between">
                <Wand2 className="h-4 w-4 text-[#1813FB]" />
                <StatusBadge label="در انتظار تصویب" tone="warning" />
              </div>
              <div>
                <div className="text-xs font-bold text-[#080707] leading-snug">
                  {m.title}
                </div>
                <div className="mt-1 font-mono text-[10px] text-[#626775]">
                  <bdi dir="ltr">{m.subtitle}</bdi>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Detailed 10-Dimension UX & Operational Specification for Selected Model */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFEFF5] pb-3.5">
          <div>
            <h2 className="text-base font-bold text-[#080707]">
              {activeModel.title}
            </h2>
            <p className="font-mono text-xs text-[#626775]">
              <bdi dir="ltr">{activeModel.subtitle}</bdi>
            </p>
          </div>
          <StatusBadge
            label="مستند UX و قرارداد عملیاتی تاییدنشده"
            tone="indigo"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 text-xs">
          {[
            { label: "۱. سفر کاربری مشتری (User Journey)", val: activeModel.userJourney },
            { label: "۲. شرایط احراز صلاحیت مشتری (Eligibility)", val: activeModel.customerEligibility },
            { label: "۳. کنترل‌های مدیریتی پنل ادمین (Admin Controls)", val: activeModel.adminControls },
            { label: "۴. تعریف بسته (مثال: بسته ۵ بار مصرف)", val: activeModel.packageDefinition },
            { label: "۵. نحوه شمارش و کسر اعتبار مصرف (Usage Counting)", val: activeModel.usageCounting },
            { label: "۶. سیاست انقضای بسته (Expiration Policy)", val: activeModel.expirationPolicy },
            { label: "۷. پرداخت، لغو و بازپرداخت (Payment & Refunds)", val: activeModel.paymentAndRefund },
            { label: "۸. گردش کار عملیاتی و انبار (Operational Workflow)", val: activeModel.operationalWorkflow },
            { label: "۹. الزامات حریم خصوصی و نگهداری داده (Privacy)", val: activeModel.privacyImplications },
            { label: "۱۰. وابستگی‌های فنی و یکپارچه‌سازی (Integrations)", val: activeModel.integrationDependencies },
          ].map((row) => (
            <div
              key={row.label}
              className="rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] p-3.5 space-y-1"
            >
              <div className="font-semibold text-[#1813FB] flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>{row.label}</span>
              </div>
              <p className="text-[#344054] leading-relaxed">{row.val}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-[#C1BCF2] bg-[#F0EEFF]/50 p-3.5 text-xs text-[#344054] flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-[#1813FB] shrink-0" />
          <span>
            پس از انتخاب یکی از ۴ مدل فوق توسط مدیریت محصول کلبه وینتیج،
            قرارداد API و قوانین سهمیه‌بندی در ماژول قوانین فروش فعال خواهد شد.
          </span>
        </div>
      </div>
    </AdminShell>
  );
}
