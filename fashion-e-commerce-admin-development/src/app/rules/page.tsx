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
import { formatJalaliDateTime } from "@/lib/formatters";
import { ShieldCheck, AlertTriangle } from "lucide-react";

interface SalesRuleRow {
  id: number;
  name: string;
  scope: string;
  currentValue: string;
  isEnabled: boolean;
  lastChangedBy: string;
  impactWarning: string;
  updatedAt: string;
}

export default function SalesRulesPage() {
  const { can } = useRole();
  const [rules, setRules] = useState<SalesRuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/system?domain=rules", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setRules(data.salesRules || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  if (!can("rules", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="قوانین فروش و محدودیت‌های تجاری" />
      </AdminShell>
    );
  }

  const handleToggle = async (rule: SalesRuleRow) => {
    setToast(null);
    const res = await fetch("/api/admin/system", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "sales_rule",
        id: rule.id,
        isEnabled: !rule.isEnabled,
      }),
    });
    if (res.ok) {
      setToast(
        `سیاست «${rule.name}» بروزرسانی شد و در گزارش فعالیت‌های امنیتی ثبت گردید.`
      );
      loadRules();
    }
  };

  return (
    <AdminShell>
      <PageHeader
        title="قوانین فروش، سقف خرید و محدودیت‌های عملیاتی"
        description="پیکربندی سیاست‌های تجاری فروشگاه با ثبت آخرین اپراتور تغییر‌دهنده و هشدار اثر عملیاتی"
      />

      <div className="mb-5 rounded-2xl border border-[#C1BCF2] bg-[#F0EEFF]/60 p-4 text-xs text-[#344054] flex items-start gap-2.5">
        <ShieldCheck className="h-4 w-4 text-[#1813FB] shrink-0 mt-0.5" />
        <span>
          <strong>اصل امنیت سمت سرور:</strong> تغییر وضعیت کلیدهای این صفحه
          سیاست پیکربندی را در پایگاه‌داده ذخیره می‌کند، اما اعمال قطعی
          محدودیت‌های پرداخت و خرید همواره توسط لایه اعتبارسنجی سرور انجام
          می‌شود.
        </span>
      </div>

      {toast && (
        <div className="mb-4 rounded-xl border border-[#A6F4C5] bg-[#ECFDF3] px-4 py-2.5 text-xs font-medium text-[#127A4B]">
          {toast}
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        <div className="space-y-3">
          {rules.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-[#E5E7EB] bg-white p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-[#080707]">
                    {r.name}
                  </h3>
                  <StatusBadge
                    label={r.isEnabled ? "سیاست فعال" : "غیرفعال"}
                    tone={r.isEnabled ? "success" : "neutral"}
                  />
                  <span className="rounded-md bg-[#F4F5F8] px-2 py-0.5 font-mono text-[10px] text-[#626775]">
                    <bdi dir="ltr">{r.scope}</bdi>
                  </span>
                </div>

                <div className="text-xs text-[#080707]">
                  مقدار فعلی سیاست: <strong>{r.currentValue}</strong>
                </div>

                {r.impactWarning && (
                  <div className="flex items-center gap-1.5 text-[11px] text-[#9A5B04]">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>{r.impactWarning}</span>
                  </div>
                )}

                <div className="text-[11px] text-[#626775]">
                  آخرین تغییر توسط: {r.lastChangedBy} •{" "}
                  {formatJalaliDateTime(r.updatedAt)}
                </div>
              </div>

              <button
                type="button"
                disabled={!can("rules", "edit")}
                onClick={() => handleToggle(r)}
                className={`h-9 shrink-0 rounded-xl px-4 text-xs font-medium transition-colors disabled:opacity-50 ${
                  r.isEnabled
                    ? "border border-[#FECDCA] bg-[#FEF3F2] text-[#B44F40]"
                    : "bg-[#1813FB] text-white"
                }`}
              >
                {r.isEnabled ? "غیرفعال‌سازی سیاست" : "فعال‌سازی سیاست"}
              </button>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
