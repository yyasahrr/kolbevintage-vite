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
import { Search, Tag, UserCheck, MessageSquareOff, Plus } from "lucide-react";

interface SegmentDef {
  key: string;
  title: string;
  ruleDefinition: string;
  count: number;
}

interface CustomerRow {
  id: number;
  fullName: string;
  phone: string;
  email: string;
  province: string;
  city: string;
  addressLine: string;
  postalCode: string;
  status: string;
  marketingConsent: boolean;
  smsUnsubscribed: boolean;
  tagsJson: string[];
  sizeProfileJson: Record<string, string>;
  internalNotes: string;
  registeredAt: string;
  ordersCount: number;
  verifiedPaidTotal: number;
  returnsCount: number;
}

export default function CrmCustomersPage() {
  const { can } = useRole();
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [segments, setSegments] = useState<SegmentDef[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [activeSegment, setActiveSegment] = useState("all");
  const [activeTag, setActiveTag] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(
    null
  );
  const [newTagInput, setNewTagInput] = useState("");
  const [notesInput, setNotesInput] = useState("");

  const loadCrm = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (activeSegment !== "all") params.set("segment", activeSegment);
    if (activeTag) params.set("tag", activeTag);
    if (search.trim()) params.set("q", search.trim());
    try {
      const res = await fetch(`/api/crm?${params.toString()}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        const list: CustomerRow[] = data.customers || [];
        setCustomers(list);
        setSegments(data.segments || []);
        setAllTags(data.allTags || []);
        if (selectedCustomer) {
          const refreshed = list.find((c) => c.id === selectedCustomer.id);
          if (refreshed) {
            setSelectedCustomer(refreshed);
            setNotesInput(refreshed.internalNotes || "");
          }
        } else if (list[0]) {
          setSelectedCustomer(list[0]);
          setNotesInput(list[0].internalNotes || "");
        }
      }
    } finally {
      setLoading(false);
    }
  }, [activeSegment, activeTag, search, selectedCustomer?.id]);

  useEffect(() => {
    loadCrm();
  }, [loadCrm]);

  if (!can("crm", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="مدیریت مشتریان (CRM)" />
      </AdminShell>
    );
  }

  const updateCustomer = async (
    id: number,
    patch: Partial<{
      tagsJson: string[];
      internalNotes: string;
      smsUnsubscribed: boolean;
      status: string;
    }>
  ) => {
    const res = await fetch("/api/crm", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (res.ok) {
      loadCrm();
    }
  };

  return (
    <AdminShell>
      <PageHeader
        title="مدیریت ارتباط با مشتریان (CRM)، گروه‌بندی و پروفایل سایز"
        description="گروه‌بندی شفاف بر اساس شاخص‌های تاییدشده سفارش، سوابق سایز لباس، برچسب‌ها و وضعیت رضایت پیامکی"
      />

      {/* Rule-Based Segments Bar (Explicit Metric Definitions!) */}
      <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        {segments.map((seg) => {
          const active = activeSegment === seg.key;
          return (
            <button
              key={seg.key}
              type="button"
              onClick={() => setActiveSegment(seg.key)}
              className={`rounded-2xl border p-3.5 text-right transition-all ${
                active
                  ? "border-[#1813FB] bg-[#F0EEFF]"
                  : "border-[#E5E7EB] bg-white hover:border-[#C1BCF2]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#080707]">
                  {seg.title}
                </span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[#1813FB]">
                  {formatNumberFa(seg.count)}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-[#626775] leading-relaxed">
                {seg.ruleDefinition}
              </p>
            </button>
          );
        })}
      </div>

      {/* Search & Tag Filter */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-[#E5E7EB] bg-white p-3.5">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#626775]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو نام مشتری، موبایل یا شهر..."
            className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-[#FAFAFE] pr-9 pl-3 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[#626775]">فیلتر برچسب:</span>
          <button
            type="button"
            onClick={() => setActiveTag("")}
            className={`rounded-lg px-2.5 py-1 text-xs ${
              !activeTag
                ? "bg-[#1813FB] text-white"
                : "bg-[#F4F5F8] text-[#4B505E]"
            }`}
          >
            همه
          </button>
          {allTags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTag(t === activeTag ? "" : t)}
              className={`rounded-lg px-2.5 py-1 text-xs ${
                activeTag === t
                  ? "bg-[#1813FB] text-white"
                  : "bg-[#F0EEFF] text-[#1813FB]"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Customers Table */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden lg:col-span-7">
            <div className="overflow-x-auto kv-scroll-table">
              <table className="w-full min-w-[600px] text-right text-xs">
                <thead>
                  <tr className="border-b border-[#E5E7EB] bg-[#FAFAFE] text-[11px] font-semibold text-[#626775]">
                    <th className="px-4 py-3">مشتری و تماس</th>
                    <th className="px-4 py-3">سفارش‌ها</th>
                    <th className="px-4 py-3">پرداخت تاییدشده</th>
                    <th className="px-4 py-3">وضعیت ارتباطی</th>
                    <th className="px-4 py-3">عضویت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEFF5]">
                  {customers.map((c) => {
                    const selected = selectedCustomer?.id === c.id;
                    return (
                      <tr
                        key={c.id}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setNotesInput(c.internalNotes || "");
                        }}
                        className={`cursor-pointer transition-colors ${
                          selected ? "bg-[#F0EEFF]/70" : "hover:bg-[#FAFAFE]"
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#080707]">
                            {c.fullName}
                            {c.status === "vip" && (
                              <span className="mr-1.5 rounded-full bg-[#F0EEFF] px-2 py-0.5 text-[10px] font-bold text-[#1813FB]">
                                VIP
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[#626775]">
                            <bdi dir="ltr">{c.phone}</bdi> • {c.city}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {formatNumberFa(c.ordersCount)} سفارش
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#080707]">
                          {formatToman(c.verifiedPaidTotal)}
                        </td>
                        <td className="px-4 py-3">
                          {c.smsUnsubscribed || !c.marketingConsent ? (
                            <StatusBadge
                              label="لغو پیامک تبلیغاتی"
                              tone="danger"
                            />
                          ) : (
                            <StatusBadge
                              label="مجاز پیامک"
                              tone="success"
                            />
                          )}
                        </td>
                        <td className="px-4 py-3 text-[#626775]">
                          {formatJalaliDate(c.registeredAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Selected Customer Detailed Profile */}
          {selectedCustomer && (
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-5 space-y-4 h-fit">
              <div className="flex items-start justify-between border-b border-[#EFEFF5] pb-3">
                <div>
                  <h3 className="text-base font-semibold text-[#080707]">
                    {selectedCustomer.fullName}
                  </h3>
                  <div className="mt-0.5 text-xs text-[#626775]">
                    <bdi dir="ltr">{selectedCustomer.phone}</bdi> •{" "}
                    <bdi dir="ltr">{selectedCustomer.email || "بدون ایمیل"}</bdi>
                  </div>
                </div>
                <StatusBadge
                  label={
                    selectedCustomer.status === "vip" ? "مشتری VIP" : "مشتری عادی"
                  }
                  tone={selectedCustomer.status === "vip" ? "indigo" : "neutral"}
                />
              </div>

              {/* Saved Address */}
              <div className="rounded-xl bg-[#FAFAFE] p-3 text-xs space-y-1">
                <div className="font-semibold text-[#344054]">
                  نشانی ذخیره‌شده:
                </div>
                <div className="text-[#626775]">
                  {selectedCustomer.province}، {selectedCustomer.city} —{" "}
                  {selectedCustomer.addressLine}
                </div>
                {selectedCustomer.postalCode && (
                  <div className="font-mono text-[11px]">
                    کد پستی: <bdi dir="ltr">{selectedCustomer.postalCode}</bdi>
                  </div>
                )}
              </div>

              {/* Size Profile */}
              <div>
                <div className="text-xs font-semibold text-[#080707] mb-1.5">
                  پروفایل سایز ثبت‌شده مشتری:
                </div>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(selectedCustomer.sizeProfileJson || {}).map(
                    ([k, v]) => (
                      <span
                        key={k}
                        className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 text-xs"
                      >
                        {k}: <strong>{v}</strong>
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* Tags Manager */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#080707]">
                  <Tag className="h-3.5 w-3.5 text-[#1813FB]" />
                  <span>برچسب‌های مشتری:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(selectedCustomer.tagsJson || []).map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-[#F0EEFF] px-2.5 py-0.5 text-xs font-medium text-[#1813FB]"
                    >
                      <span>{t}</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateCustomer(selectedCustomer.id, {
                            tagsJson: selectedCustomer.tagsJson.filter(
                              (x) => x !== t
                            ),
                          })
                        }
                        className="hover:text-[#B44F40]"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    placeholder="افزودن برچسب جدید..."
                    className="h-8 flex-1 rounded-lg border border-[#E5E7EB] px-2.5 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newTagInput.trim()) return;
                      const next = Array.from(
                        new Set([
                          ...(selectedCustomer.tagsJson || []),
                          newTagInput.trim(),
                        ])
                      );
                      updateCustomer(selectedCustomer.id, { tagsJson: next });
                      setNewTagInput("");
                    }}
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#F0EEFF] px-3 text-xs font-semibold text-[#1813FB]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>افزودن</span>
                  </button>
                </div>
              </div>

              {/* Communication Preference Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-[#EFEFF5] p-3 text-xs">
                <div className="flex items-center gap-2">
                  {selectedCustomer.smsUnsubscribed ? (
                    <MessageSquareOff className="h-4 w-4 text-[#B44F40]" />
                  ) : (
                    <UserCheck className="h-4 w-4 text-[#127A4B]" />
                  )}
                  <span>وضعیت دریافت پیامک تبلیغاتی</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateCustomer(selectedCustomer.id, {
                      smsUnsubscribed: !selectedCustomer.smsUnsubscribed,
                    })
                  }
                  className="rounded-lg border border-[#E5E7EB] bg-white px-2.5 py-1 font-medium text-[#080707]"
                >
                  {selectedCustomer.smsUnsubscribed
                    ? "فعال‌سازی مجدد"
                    : "ثبت لغو اشتراک"}
                </button>
              </div>

              {/* Internal Notes */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#080707]">
                  یادداشت داخلی پشتیبانی و فروش:
                </label>
                <textarea
                  rows={2}
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() =>
                    updateCustomer(selectedCustomer.id, {
                      internalNotes: notesInput,
                    })
                  }
                  className="h-9 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white"
                >
                  ذخیره یادداشت مشتری
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </AdminShell>
  );
}
