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
  ModuleKey,
  ROLE_DEFINITIONS,
  RoleKey,
} from "@/lib/permissions";
import { formatJalaliDateTime } from "@/lib/formatters";
import { UserCog, Shield, Check } from "lucide-react";

interface StaffRow {
  id: number;
  fullName: string;
  email: string;
  roleKey: RoleKey;
  roleTitle: string;
  status: string;
  lastActivityAt: string;
}

const MODULE_LABELS: Array<{ key: ModuleKey; label: string }> = [
  { key: "dashboard", label: "داشبورد" },
  { key: "catalog", label: "کاتالوگ" },
  { key: "inventory", label: "انبار" },
  { key: "orders", label: "سفارش‌ها" },
  { key: "returns", label: "مرجوعی" },
  { key: "marketing", label: "بازاریابی" },
  { key: "crm", label: "مشتریان" },
  { key: "content", label: "محتوا" },
  { key: "appearance", label: "استودیو" },
  { key: "finance", label: "مالی" },
  { key: "integrations", label: "اتصالات" },
  { key: "rules", label: "قوانین" },
  { key: "staff", label: "کارکنان" },
  { key: "audit", label: "گزارش فعالیت" },
];

export default function StaffAndRolesPage() {
  const { can, activeRole, switchRole } = useRole();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/system?domain=staff", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setStaff(data.staff || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  if (!can("staff", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="کارکنان و ماتریس سطوح دسترسی" />
      </AdminShell>
    );
  }

  const toggleStaffStatus = async (s: StaffRow) => {
    await fetch("/api/admin/system", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "staff_role",
        id: s.id,
        status: s.status === "active" ? "suspended" : "active",
      }),
    });
    loadStaff();
  };

  return (
    <AdminShell>
      <PageHeader
        title="مدیریت کارکنان و ماتریس دسترسی مبتنی بر نقش (RBAC)"
        description="کنترل دسترسی ماژول‌به‌ماژول برای ۸ نقش تخصصی فروشگاه و کنترل سمت سرور APIها"
      />

      {loading ? (
        <LoadingState />
      ) : (
        <div className="space-y-6">
          {/* Staff Directory */}
          <section className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#EFEFF5] px-5 py-3.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#080707]">
                <UserCog className="h-4 w-4 text-[#1813FB]" />
                <span>فهرست همکاران پنل مدیریت</span>
              </div>
              <span className="text-xs text-[#626775]">
                کلیک روی «آزمایش نقش» دسترسی کل پنل و APIها را به همان نقش تغییر
                می‌دهد
              </span>
            </div>

            <div className="overflow-x-auto kv-scroll-table">
              <table className="w-full min-w-[760px] text-right text-xs">
                <thead>
                  <tr className="border-b border-[#EFEFF5] bg-[#FAFAFE] text-[11px] text-[#626775]">
                    <th className="px-4 py-3 font-medium">نام همکار</th>
                    <th className="px-4 py-3 font-medium">ایمیل سازمانی</th>
                    <th className="px-4 py-3 font-medium">نقش تخصصی</th>
                    <th className="px-4 py-3 font-medium">وضعیت حساب</th>
                    <th className="px-4 py-3 font-medium">آخرین فعالیت</th>
                    <th className="px-4 py-3 font-medium text-left">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEFF5]">
                  {staff.map((s) => {
                    const isCurrent = activeRole === s.roleKey;
                    return (
                      <tr key={s.id} className="hover:bg-[#FAFAFE]">
                        <td className="px-4 py-3 font-semibold text-[#080707]">
                          {s.fullName}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[#344054]">
                          <bdi dir="ltr">{s.email}</bdi>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge label={s.roleTitle} tone="indigo" />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            label={s.status === "active" ? "فعال" : "تعلیق‌شده"}
                            tone={s.status === "active" ? "success" : "danger"}
                          />
                        </td>
                        <td className="px-4 py-3 text-[#626775]">
                          {formatJalaliDateTime(s.lastActivityAt)}
                        </td>
                        <td className="px-4 py-3 text-left">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isCurrent}
                              onClick={() => switchRole(s.roleKey)}
                              className={`h-8 rounded-lg px-2.5 text-xs font-medium ${
                                isCurrent
                                  ? "bg-[#ECFDF3] text-[#127A4B]"
                                  : "bg-[#F0EEFF] text-[#1813FB] hover:bg-[#E4E1FF]"
                              }`}
                            >
                              {isCurrent ? "نقش فعلی شما" : "آزمایش این نقش"}
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleStaffStatus(s)}
                              className="h-8 rounded-lg border border-[#E5E7EB] bg-white px-2.5 text-xs text-[#344054]"
                            >
                              {s.status === "active" ? "تعلیق" : "فعال‌سازی"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Dynamic Module-Level Permission Matrix */}
          <section className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden">
            <div className="border-b border-[#EFEFF5] px-5 py-3.5 flex items-center gap-2">
              <Shield className="h-4 w-4 text-[#1813FB]" />
              <h2 className="text-sm font-semibold text-[#080707]">
                ماتریس سطوح دسترسی ماژول‌ها در ۸ نقش سازمانی
              </h2>
            </div>

            <div className="overflow-x-auto kv-scroll-table">
              <table className="w-full min-w-[960px] text-right text-xs">
                <thead>
                  <tr className="border-b border-[#EFEFF5] bg-[#FAFAFE] text-[11px] text-[#626775]">
                    <th className="sticky right-0 z-10 bg-[#FAFAFE] px-4 py-3 min-w-[200px]">
                      عنوان نقش
                    </th>
                    {MODULE_LABELS.map((m) => (
                      <th
                        key={m.key}
                        className="px-2.5 py-3 text-center whitespace-nowrap"
                      >
                        {m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEFF5]">
                  {(Object.keys(ROLE_DEFINITIONS) as RoleKey[]).map((rKey) => {
                    const def = ROLE_DEFINITIONS[rKey];
                    return (
                      <tr key={rKey} className="hover:bg-[#FAFAFE]">
                        <td className="sticky right-0 z-10 bg-white px-4 py-3 font-semibold text-[#080707]">
                          <div>{def.persianTitle}</div>
                          <div className="font-mono text-[10px] font-normal text-[#626775]">
                            <bdi dir="ltr">{def.key}</bdi>
                          </div>
                        </td>
                        {MODULE_LABELS.map((m) => {
                          const actions = def.modules[m.key];
                          return (
                            <td
                              key={m.key}
                              className="px-2.5 py-3 text-center"
                            >
                              {actions && actions.length > 0 ? (
                                <span
                                  title={actions.join(", ")}
                                  className="inline-flex items-center justify-center rounded-lg bg-[#ECFDF3] px-2 py-1 text-[10px] font-semibold text-[#127A4B]"
                                >
                                  <Check className="h-3 w-3 ml-0.5" />
                                  {actions.length === 8
                                    ? "کامل"
                                    : actions.includes("approve") ||
                                      actions.includes("publish")
                                    ? "ویرایش+تایید"
                                    : actions.includes("edit")
                                    ? "ویرایش"
                                    : "مشاهده"}
                                </span>
                              ) : (
                                <span className="text-[#CBD5E1]">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </AdminShell>
  );
}
