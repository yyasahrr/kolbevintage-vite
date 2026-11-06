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
import { formatJalaliDateTime, formatNumberFa } from "@/lib/formatters";

interface MovementRow {
  id: number;
  sku: string;
  movementType: string;
  quantityDelta: number;
  balanceAfter: number;
  referenceCode: string;
  actorName: string;
  reason: string;
  createdAt: string;
}

export default function InventoryLedgerPage() {
  const { can } = useRole();
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/inventory", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.movements) setMovements(d.movements);
      })
      .finally(() => setLoading(false));
  }, []);

  if (!can("inventory", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="دفتر کل گردش کالا" />
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <PageHeader
        title="دفتر کل گردش موجودی کالا (Authoritative Movement Ledger)"
        description="تاریخچه غیرقابل تغییر تمامی ورودها، رزرو سفارش‌ها، اصلاحات تاییدشده و شمارش‌های انبار"
      />

      {loading ? (
        <LoadingState />
      ) : (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden">
          <div className="overflow-x-auto kv-scroll-table">
            <table className="w-full min-w-[780px] text-right text-xs">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#FAFAFE] text-[11px] font-semibold text-[#626775]">
                  <th className="px-4 py-3">زمان ثبت</th>
                  <th className="px-4 py-3">کد SKU</th>
                  <th className="px-4 py-3">نوع تراکنش</th>
                  <th className="px-4 py-3">تغییر تعداد</th>
                  <th className="px-4 py-3">مانده فیزیکی</th>
                  <th className="px-4 py-3">شماره مرجع</th>
                  <th className="px-4 py-3">عامل ثبت</th>
                  <th className="px-4 py-3">شرح دلیل</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFF5]">
                {movements.map((m) => (
                  <tr key={m.id} className="hover:bg-[#FAFAFE]">
                    <td className="px-4 py-3 text-[#626775] whitespace-nowrap">
                      {formatJalaliDateTime(m.createdAt)}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold">
                      <bdi dir="ltr">{m.sku}</bdi>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        label={
                          m.movementType === "receive"
                            ? "رسید ورود کالا"
                            : m.movementType === "order_reserve"
                            ? "رزرو سفارش"
                            : m.movementType === "stocktake_reconcile"
                            ? "شمارش انبار"
                            : "اصلاح موجودی"
                        }
                        tone={m.quantityDelta >= 0 ? "success" : "warning"}
                      />
                    </td>
                    <td
                      dir="ltr"
                      className={`px-4 py-3 font-mono font-bold text-right ${
                        m.quantityDelta >= 0
                          ? "text-[#127A4B]"
                          : "text-[#B44F40]"
                      }`}
                    >
                      {m.quantityDelta >= 0
                        ? `+${m.quantityDelta}`
                        : m.quantityDelta}
                    </td>
                    <td className="px-4 py-3 font-semibold">
                      {formatNumberFa(m.balanceAfter)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      <bdi dir="ltr">{m.referenceCode}</bdi>
                    </td>
                    <td className="px-4 py-3 text-[#344054]">{m.actorName}</td>
                    <td className="px-4 py-3 text-[#626775]">{m.reason}</td>
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
