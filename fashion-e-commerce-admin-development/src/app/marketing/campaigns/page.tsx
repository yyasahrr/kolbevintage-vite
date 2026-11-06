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
import {
  formatJalaliDate,
  formatNumberFa,
  formatToman,
} from "@/lib/formatters";
import { Megaphone, Plus, AlertTriangle, Play, Pause } from "lucide-react";

interface CampaignRow {
  id: number;
  name: string;
  description: string;
  promotionType: string;
  discountValue: number;
  status: string;
  startAt: string;
  endAt: string;
  eligibleScope: string;
  eligibleCount: number;
  maxCapacity: number;
  usedCount: number;
  perCustomerLimit: number;
  stackingPolicyNote: string;
}

export default function CampaignsPage() {
  const { can } = useRole();
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promotionType, setPromotionType] = useState("percent_off");
  const [discountValue, setDiscountValue] = useState("15");
  const [maxCapacity, setMaxCapacity] = useState("250");
  const [perCustomerLimit, setPerCustomerLimit] = useState("1");

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/marketing", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data.campaigns || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  if (!can("marketing", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="کمپین‌ها و جشنواره‌های فروش" />
      </AdminShell>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const res = await fetch("/api/marketing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "campaign",
        name: name.trim(),
        description: description.trim(),
        promotionType,
        discountValue: Number(discountValue),
        maxCapacity: Number(maxCapacity),
        perCustomerLimit: Number(perCustomerLimit),
      }),
    });
    if (res.ok) {
      setName("");
      setDescription("");
      loadCampaigns();
    }
  };

  const handleStateChange = async (id: number, status: string) => {
    await fetch("/api/marketing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    loadCampaigns();
  };

  const getCampaignBadge = (st: string) => {
    switch (st) {
      case "active":
        return { label: "فعال", tone: "success" as const };
      case "scheduled":
        return { label: "زمان‌بندی‌شده", tone: "indigo" as const };
      case "paused":
        return { label: "متوقف موقت", tone: "warning" as const };
      case "expired":
        return { label: "منقضی‌شده", tone: "danger" as const };
      case "completed":
        return { label: "تکمیل‌شده", tone: "neutral" as const };
      default:
        return { label: "پیش‌نویس", tone: "neutral" as const };
    }
  };

  return (
    <AdminShell>
      <PageHeader
        title="مدیریت جشنواره‌ها، کمپین‌ها و تخفیف‌های دوره‌ای"
        description="تنظیم بازه زمانی، سقف ظرفیت سفارش، محدودیت هر مشتری و کنترل تداخل قیمت‌گذاری"
      />

      {/* Pricing Integrity & Overselling Guardrail Banner */}
      <div className="mb-5 rounded-2xl border border-[#FEDF89] bg-[#FFFAEB] p-4 text-xs text-[#7A4905] space-y-1">
        <div className="flex items-center gap-2 font-semibold text-[#9A5B04]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>ضمانت یکپارچگی قیمت و جلوگیری از فروش بیش از موجودی:</span>
        </div>
        <p>
          نمایش شمارنده ظرفیت کمپین در ویترین جایگزین رزرو موجودی انبار نیست؛
          محدودیت سقف سفارش و عدم تجمیع غیرمجاز با تخفیف مستقیم SKU توسط موتور
          تسویه‌حساب سرور اعمال می‌شود.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Campaigns List */}
        <div className="space-y-3 lg:col-span-8">
          {loading ? (
            <LoadingState />
          ) : (
            campaigns.map((c) => {
              const badge = getCampaignBadge(c.status);
              const pct = c.maxCapacity
                ? Math.min(100, Math.round((c.usedCount / c.maxCapacity) * 100))
                : 0;
              return (
                <div
                  key={c.id}
                  className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-[#080707]">
                          {c.name}
                        </h3>
                        <StatusBadge label={badge.label} tone={badge.tone} />
                      </div>
                      <p className="mt-1 text-xs text-[#626775]">
                        {c.description}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {c.status !== "active" ? (
                        <button
                          type="button"
                          onClick={() => handleStateChange(c.id, "active")}
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#ECFDF3] border border-[#A6F4C5] px-3 text-xs font-semibold text-[#127A4B]"
                        >
                          <Play className="h-3.5 w-3.5" />
                          <span>فعال‌سازی</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStateChange(c.id, "paused")}
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#FFFAEB] border border-[#FEDF89] px-3 text-xs font-semibold text-[#9A5B04]"
                        >
                          <Pause className="h-3.5 w-3.5" />
                          <span>توقف موقت</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#FAFAFE] p-3 text-xs sm:grid-cols-4">
                    <div>
                      <span className="text-[#626775] block text-[11px]">
                        نوع و میزان تخفیف
                      </span>
                      <strong className="text-[#1813FB]">
                        {c.promotionType === "percent_off"
                          ? `${formatNumberFa(c.discountValue)}٪ تخفیف`
                          : formatToman(c.discountValue)}
                      </strong>
                    </div>
                    <div>
                      <span className="text-[#626775] block text-[11px]">
                        بازه زمانی
                      </span>
                      <span>
                        {formatJalaliDate(c.startAt)} تا{" "}
                        {formatJalaliDate(c.endAt)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#626775] block text-[11px]">
                        اقلام مشمول
                      </span>
                      <span>{formatNumberFa(c.eligibleCount)} محصول</span>
                    </div>
                    <div>
                      <span className="text-[#626775] block text-[11px]">
                        سقف هر مشتری
                      </span>
                      <span>{formatNumberFa(c.perCustomerLimit)} سفارش</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-[#626775] mb-1">
                      <span>
                        ظرفیت استفاده‌شده: {formatNumberFa(c.usedCount)} از{" "}
                        {formatNumberFa(c.maxCapacity)} سفارش
                      </span>
                      <span>{formatNumberFa(pct)}٪</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#EFEFF5]">
                      <div
                        className="h-full bg-[#1813FB]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-[11px] text-[#626775]">
                    سیاست تداخل: {c.stackingPolicyNote}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Create Campaign Form */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-4 h-fit space-y-4">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-[#1813FB]" />
            <h2 className="text-sm font-semibold text-[#080707]">
              ایجاد کمپین یا جشنواره جدید
            </h2>
          </div>

          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                نام کمپین
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: حراج پایان فصل زمستان"
                className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                توضیحات کمپین
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-[#344054] mb-1">
                  نوع تخفیف
                </label>
                <select
                  value={promotionType}
                  onChange={(e) => setPromotionType(e.target.value)}
                  className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-2.5 text-xs"
                >
                  <option value="percent_off">درصدی (٪)</option>
                  <option value="fixed_off">مبلغ ثابت (تومان)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#344054] mb-1">
                  مقدار تخفیف
                </label>
                <input
                  type="number"
                  min={1}
                  dir="ltr"
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-[#344054] mb-1">
                  سقف کل استفاده
                </label>
                <input
                  type="number"
                  min={1}
                  dir="ltr"
                  value={maxCapacity}
                  onChange={(e) => setMaxCapacity(e.target.value)}
                  className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#344054] mb-1">
                  محدودیت هر مشتری
                </label>
                <input
                  type="number"
                  min={1}
                  dir="ltr"
                  value={perCustomerLimit}
                  onChange={(e) => setPerCustomerLimit(e.target.value)}
                  className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!can("marketing", "create")}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1]"
            >
              <Plus className="h-4 w-4" />
              <span>ذخیره پیش‌نویس کمپین</span>
            </button>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
