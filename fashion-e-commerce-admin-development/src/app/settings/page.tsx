"use client";

import React, { useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import { UnauthorizedState } from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import { BUSINESS_DECISION_REGISTER } from "@/lib/business-decisions";
import { Store, Globe, FileCheck2, CheckCircle2 } from "lucide-react";

const DELIVERABLE_STATUS_REGISTER = [
  {
    module: "پوسته یکپارچه پنل ادمین و سیستم طراحی ThreadCraft",
    route: "/",
    owner: "Agent 4",
    status: "BACKEND INTEGRATED",
    tone: "success" as const,
  },
  {
    module: "فهرست تخصصی محصولات، ردیف‌های بازشونده SKU و فیلترهای URL",
    route: "/products",
    owner: "Agent 2 + Agent 4",
    status: "BACKEND INTEGRATED",
    tone: "success" as const,
  },
  {
    module: "ایجاد پیش‌نویس سریع و ویرایشگر ۷ بخشی تنوع رنگ-سایز و رسانه‌های رنگ",
    route: "/products/new , /products/[id]",
    owner: "Agent 2 + Agent 4",
    status: "BACKEND INTEGRATED",
    tone: "success" as const,
  },
  {
    module: "دفتر کل انبار، دریافت کالا، شمارش و کارتابل تایید اصلاح موجودی",
    route: "/inventory , /inventory/operations",
    owner: "Agent 2 + Agent 4",
    status: "BACKEND INTEGRATED",
    tone: "success" as const,
  },
  {
    module: "مدیریت سفارش‌ها، پیش‌نمایش سریع، جزئیات تاریخی و سفارش دستی ۶ مرحله‌ای",
    route: "/orders , /orders/[id] , /orders/manual",
    owner: "Agent 1 + Agent 4",
    status: "BACKEND INTEGRATED",
    tone: "success" as const,
  },
  {
    module: "برداشت کالا با اسکن بارکد SKU، مرکز چاپ ۱۰۰×۱۵۰mm و مرجوعی QC",
    route: "/orders/fulfillment , /orders/print , /returns",
    owner: "Agent 1 + Agent 4",
    status: "BACKEND INTEGRATED",
    tone: "success" as const,
  },
  {
    module: "کمپین‌ها، پیامک مارکتینگ با فیلتر لغواشتراک و CRM مشتریان",
    route: "/marketing/campaigns , /marketing/sms , /crm/customers",
    owner: "Agent 4",
    status: "BACKEND INTEGRATED",
    tone: "success" as const,
  },
  {
    module: "استودیو طراحی (پوسته لایه‌بندی) و گالری پک‌های ظاهری ویترین",
    route: "/appearance/studio , /appearance/style-packs",
    owner: "Agent 3 + Agent 4",
    status: "FRONTEND READY (Agent 3 Handoff)",
    tone: "indigo" as const,
  },
  {
    module: "درگاه‌های اعتباری دیجی‌پی (Digipay) و اسنپ‌پی (SnappPay)",
    route: "/integrations",
    owner: "Agent 1 + مالی",
    status: "PENDING CONTRACT",
    tone: "warning" as const,
  },
  {
    module: "پرو مجازی و بسته‌های خدمات (Try-On 4 Business Models)",
    route: "/try-on",
    owner: "تیم تجاری + Agent 4",
    status: "DESIGNED (Decision Required)",
    tone: "warning" as const,
  },
];

export default function SettingsPage() {
  const { can } = useRole();
  const [domainTab, setDomainTab] = useState<
    "identity" | "decisions" | "acceptance"
  >("identity");

  if (!can("settings", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="تنظیمات فروشگاه و مستندات تحویل" />
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <PageHeader
        title="تنظیمات فروشگاه، دفتر ثبت تصمیم‌های تجاری و ماتریس وضعیت تحویل"
        description="پیکربندی هویت فروشگاه، بومی‌سازی تقویم جلالی، ثبت تصمیم‌های در انتظار تایید و وضعیت پیاده‌سازی ماژول‌ها"
      />

      {/* Focused Settings Domain Tabs (Never one endlessly scrolling settings page!) */}
      <div className="mb-5 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setDomainTab("identity")}
          className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-medium ${
            domainTab === "identity"
              ? "bg-[#1813FB] text-white"
              : "border border-[#E5E7EB] bg-white text-[#344054]"
          }`}
        >
          <Store className="h-4 w-4" />
          <span>۱. هویت فروشگاه و بومی‌سازی ایران</span>
        </button>
        <button
          type="button"
          onClick={() => setDomainTab("decisions")}
          className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-medium ${
            domainTab === "decisions"
              ? "bg-[#1813FB] text-white"
              : "border border-[#E5E7EB] bg-white text-[#344054]"
          }`}
        >
          <FileCheck2 className="h-4 w-4" />
          <span>۲. دفتر تصمیم‌های تجاری باز (Business Decisions)</span>
        </button>
        <button
          type="button"
          onClick={() => setDomainTab("acceptance")}
          className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-medium ${
            domainTab === "acceptance"
              ? "bg-[#1813FB] text-white"
              : "border border-[#E5E7EB] bg-white text-[#344054]"
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          <span>۳. وضعیت تحویل و یکپارچه‌سازی ماژول‌ها</span>
        </button>
      </div>

      {domainTab === "identity" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#EFEFF5] pb-3">
              <Store className="h-4 w-4 text-[#1813FB]" />
              <h2 className="text-sm font-semibold text-[#080707]">
                هویت برند و اطلاعات پایه فروشگاه
              </h2>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-[#344054] mb-1">
                  نام فارسی فروشگاه
                </label>
                <input
                  type="text"
                  readOnly
                  value="کلبه وینتیج (KolbeVintage)"
                  className="h-10 w-full rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] px-3"
                />
              </div>
              <div>
                <label className="block font-medium text-[#344054] mb-1">
                  دامنه رسمی
                </label>
                <input
                  type="text"
                  dir="ltr"
                  readOnly
                  value="https://kolbevintage.ir"
                  className="h-10 w-full rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] px-3 text-left font-mono"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-[#EFEFF5] pb-3">
              <Globe className="h-4 w-4 text-[#1813FB]" />
              <h2 className="text-sm font-semibold text-[#080707]">
                تنظیمات بومی‌سازی، تقویم و واحد پول
              </h2>
            </div>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between rounded-xl bg-[#FAFAFE] p-3">
                <span className="text-[#626775]">زبان و جهت رابط کاربری:</span>
                <strong>فارسی (fa-IR) — راست‌به‌چپ (RTL)</strong>
              </div>
              <div className="flex justify-between rounded-xl bg-[#FAFAFE] p-3">
                <span className="text-[#626775]">تقویم رسمی گزارش‌ها:</span>
                <strong>هجری شمسی (جلالی) — منطقه زمانی Asia/Tehran</strong>
              </div>
              <div className="flex justify-between rounded-xl bg-[#FAFAFE] p-3">
                <span className="text-[#626775]">واحد پول نمایش و ثبت جدید:</span>
                <strong>تومان ایران (IRT) — بدون تبدیل خودکار رکورد تاریخی</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {domainTab === "decisions" && (
        <div className="space-y-3">
          {BUSINESS_DECISION_REGISTER.map((bd) => (
            <div
              key={bd.id}
              className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-[#1813FB]">
                    <bdi dir="ltr">{bd.id}</bdi>
                  </span>
                  <span className="rounded-lg bg-[#F4F5F8] px-2 py-0.5 text-[11px] font-medium text-[#344054]">
                    {bd.domain}
                  </span>
                </div>
                <StatusBadge
                  label={
                    bd.status === "contract_defined"
                      ? "قرارداد رابط کاربری تعریف‌شده"
                      : bd.status === "blocked_external"
                      ? "در انتظار قرارداد سرویس‌دهنده خارجی"
                      : "در انتظار تصمیم تجاری نهایی"
                  }
                  tone={
                    bd.status === "contract_defined" ? "success" : "warning"
                  }
                />
              </div>

              <h3 className="text-sm font-semibold text-[#080707]">
                {bd.title}
              </h3>
              <p className="text-xs text-[#4B505E] leading-relaxed">
                {bd.summary}
              </p>
              <div className="rounded-xl bg-[#F0EEFF]/60 px-3 py-2 text-[11px] text-[#344054]">
                <strong>کنترل ایمنی در رابط کاربری:</strong> {bd.guardrailInUi}
              </div>
            </div>
          ))}
        </div>
      )}

      {domainTab === "acceptance" && (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden">
          <div className="overflow-x-auto kv-scroll-table">
            <table className="w-full min-w-[740px] text-right text-xs">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#FAFAFE] text-[11px] font-semibold text-[#626775]">
                  <th className="px-4 py-3">ماژول / قابلیت</th>
                  <th className="px-4 py-3">مسیر (Route)</th>
                  <th className="px-4 py-3">مالکیت فنی</th>
                  <th className="px-4 py-3">وضعیت دقیق تحویل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFF5]">
                {DELIVERABLE_STATUS_REGISTER.map((row) => (
                  <tr key={row.module} className="hover:bg-[#FAFAFE]">
                    <td className="px-4 py-3 font-semibold text-[#080707]">
                      {row.module}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#344054]">
                      <bdi dir="ltr">{row.route}</bdi>
                    </td>
                    <td className="px-4 py-3 text-[#626775]">{row.owner}</td>
                    <td className="px-4 py-3">
                      <StatusBadge label={row.status} tone={row.tone} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
