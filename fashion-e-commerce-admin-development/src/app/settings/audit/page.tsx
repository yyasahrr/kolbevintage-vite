"use client";

import React, { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import {
  LoadingState,
  UnauthorizedState,
} from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import { formatJalaliDateTime } from "@/lib/formatters";
import { Search, ShieldAlert } from "lucide-react";

interface AuditLogRow {
  id: number;
  actorName: string;
  actorRole: string;
  module: string;
  action: string;
  entityRef: string;
  result: string;
  referenceCode: string;
  createdAt: string;
}

export default function AuditLogsPage() {
  const { can } = useRole();
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");

  useEffect(() => {
    fetch("/api/admin/system?domain=audit", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.auditLogs) setLogs(d.auditLogs);
      })
      .finally(() => setLoading(false));
  }, []);

  if (!can("audit", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="گزارش فعالیت‌ها و نظارت امنیتی" />
      </AdminShell>
    );
  }

  const modules = Array.from(new Set(logs.map((l) => l.module)));

  const filtered = logs.filter((l) => {
    if (moduleFilter !== "all" && l.module !== moduleFilter) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      l.actorName.toLowerCase().includes(q) ||
      l.action.toLowerCase().includes(q) ||
      l.entityRef.toLowerCase().includes(q) ||
      l.referenceCode.toLowerCase().includes(q)
    );
  });

  return (
    <AdminShell>
      <PageHeader
        title="گزارش ممیزی و رویدادهای عملیاتی (Audit Logs)"
        description="ثبت رخدادهای کلیدی کاربران و سیستم با حذف خودکار داده‌های محرمانه (رمز عبور، OTP و توکن‌های بانکی)"
      />

      <div className="mb-4 flex flex-col gap-2.5 rounded-2xl border border-[#E5E7EB] bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#626775]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو در عامل، شرح عملیات، شناسه موجودیت یا کد مرجع..."
            className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-[#FAFAFE] pr-9 pl-3 text-xs"
          />
        </div>

        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="h-9 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs"
        >
          <option value="all">همه ماژول‌ها</option>
          {modules.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden">
          <div className="overflow-x-auto kv-scroll-table">
            <table className="w-full min-w-[820px] text-right text-xs">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#FAFAFE] text-[11px] font-semibold text-[#626775]">
                  <th className="px-4 py-3">زمان ثبت</th>
                  <th className="px-4 py-3">عامل (کاربر / سیستم)</th>
                  <th className="px-4 py-3">ماژول</th>
                  <th className="px-4 py-3">شرح رویداد</th>
                  <th className="px-4 py-3">موجودیت هدف</th>
                  <th className="px-4 py-3">نتیجه</th>
                  <th className="px-4 py-3">کد مرجع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFF5]">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-[#FAFAFE]">
                    <td className="px-4 py-3 text-[#626775] whitespace-nowrap">
                      {formatJalaliDateTime(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-medium text-[#080707]">
                      {log.actorName}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge label={log.module} tone="indigo" />
                    </td>
                    <td className="px-4 py-3 text-[#344054]">{log.action}</td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      <bdi dir="ltr">{log.entityRef}</bdi>
                    </td>
                    <td className="px-4 py-3">
                      {log.result === "success" ? (
                        <StatusBadge label="موفق" tone="success" />
                      ) : log.result === "denied" ? (
                        <StatusBadge label="مسدودشده (غیرمجاز)" tone="danger" />
                      ) : (
                        <StatusBadge label="هشدار" tone="warning" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-[#626775]">
                      <bdi dir="ltr">{log.referenceCode}</bdi>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-[#EFEFF5] bg-[#FAFAFE] px-4 py-2.5 text-[11px] text-[#626775] flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-[#1813FB]" />
            <span>
              مطابق خط‌مشی امنیت، گذرواژه‌ها، کدهای تایید پیامکی (OTP) و کلیدهای
              درگاه بانکی هرگز در لاگ‌ها ذخیره نمی‌شوند.
            </span>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
