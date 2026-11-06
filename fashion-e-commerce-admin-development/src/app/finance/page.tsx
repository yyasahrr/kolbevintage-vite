"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import {
  StatusBadge,
  getPaymentBadge,
} from "@/components/admin/ui/StatusBadge";
import {
  LoadingState,
  UnauthorizedState,
} from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import { formatJalaliDateTime, formatToman } from "@/lib/formatters";
import { Download, ShieldAlert, CheckCircle2 } from "lucide-react";

interface FinanceTransaction {
  id: number;
  orderNumber: string;
  customerName: string;
  amount: number;
  currencyUnit: string;
  gateway: string;
  paymentStatus: string;
  paymentRef: string;
  createdAt: string;
}

export default function FinancePage() {
  const { can } = useRole();
  const [finance, setFinance] = useState<{
    currencyPolicy: string;
    recordedOrdersTotal: number;
    verifiedPaymentsTotal: number;
    pendingVerificationTotal: number;
    transactions: FinanceTransaction[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [exportToast, setExportToast] = useState<string | null>(null);

  const loadFinance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/system?domain=finance", {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setFinance(data.finance);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFinance();
  }, [loadFinance]);

  if (!can("finance", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="نمای مالی، تراکنش‌ها و حسابداری" />
      </AdminShell>
    );
  }

  const handleExportCsv = () => {
    if (!finance) return;
    const headers = [
      "OrderNumber",
      "Customer",
      "Amount",
      "CurrencyUnit",
      "Gateway",
      "PaymentStatus",
      "PaymentRef",
      "CreatedAt",
    ];
    const rows = finance.transactions.map((t) => [
      t.orderNumber,
      t.customerName,
      t.amount,
      t.currencyUnit,
      t.gateway,
      t.paymentStatus,
      t.paymentRef,
      t.createdAt,
    ]);
    const csv =
      "\uFEFF" +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kolbevintage-accounting-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportToast(
      "خروجی حسابداری CSV با حفظ برچسب صریح واحد پول (IRT) تولید و دانلود شد."
    );
  };

  return (
    <AdminShell>
      <PageHeader
        title="نمای مالی، تطبیق تراکنش‌ها و خروجی حسابداری"
        description="تفکیک شفاف سفارش‌های ثبت‌شده، پرداخت‌های تاییدشده درگاه بانکی، مغایرت‌ها و استاندارد واحد پول تومان"
        primaryAction={
          can("finance", "export") ? (
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1]"
            >
              <Download className="h-4 w-4" />
              <span>خروجی حسابداری (CSV با متادیتای IRT)</span>
            </button>
          ) : undefined
        }
      />

      {exportToast && (
        <div className="mb-4 rounded-xl border border-[#A6F4C5] bg-[#ECFDF3] px-4 py-2.5 text-xs font-medium text-[#127A4B]">
          {exportToast}
        </div>
      )}

      {loading || !finance ? (
        <LoadingState />
      ) : (
        <div className="space-y-5">
          {/* Currency Integrity Banner */}
          <div className="rounded-2xl border border-[#C1BCF2] bg-[#F0EEFF]/60 p-4 text-xs text-[#344054] flex items-start gap-2.5">
            <ShieldAlert className="h-4 w-4 text-[#1813FB] shrink-0 mt-0.5" />
            <div>
              <strong>سیاست دقت واحد پول و تسویه بانکی:</strong>{" "}
              {finance.currencyPolicy}. مبالغ سفارش‌های ثبت‌شده به معنای تسویه
              نهایی بانکی یا سود خالص نیستند و فقط تراکنش‌های دارای تاییدیه
              Verify درگاه در ستون وصولی تاییدشده محاسبه می‌شوند.
            </div>
          </div>

          {/* 3 Verified Financial Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
              <div className="text-xs text-[#626775]">
                کل مبالغ سفارش‌های ثبت‌شده (ناخالص)
              </div>
              <div className="mt-2 text-xl font-bold text-[#080707]">
                {formatToman(finance.recordedOrdersTotal)}
              </div>
              <div className="mt-1 text-[11px] text-[#626775]">
                شامل سفارش‌های پرداخت‌شده و در انتظار تایید
              </div>
            </div>

            <div className="rounded-2xl border border-[#A6F4C5] bg-[#ECFDF3]/40 p-5">
              <div className="text-xs font-medium text-[#127A4B]">
                تراکنش‌های تاییدشده بانکی (Verified Paid)
              </div>
              <div className="mt-2 text-xl font-bold text-[#0D5C38]">
                {formatToman(finance.verifiedPaymentsTotal)}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[11px] text-[#127A4B]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>دارای کد رهگیری تاییدشده از سرور درگاه</span>
              </div>
            </div>

            <div className="rounded-2xl border border-[#FEDF89] bg-[#FFFAEB]/50 p-5">
              <div className="text-xs font-medium text-[#9A5B04]">
                مغایرت‌ها و تراکنش‌های در انتظار استعلام
              </div>
              <div className="mt-2 text-xl font-bold text-[#7A4905]">
                {formatToman(finance.pendingVerificationTotal)}
              </div>
              <div className="mt-1 text-[11px] text-[#9A5B04]">
                ارسال این سفارش‌ها تا تعیین تکلیف بانکی متوقف است
              </div>
            </div>
          </div>

          {/* Transactions Ledger */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden">
            <div className="border-b border-[#EFEFF5] px-5 py-3.5 text-sm font-semibold text-[#080707]">
              فهرست تراکنش‌ها و وضعیت تایید درگاه
            </div>
            <div className="overflow-x-auto kv-scroll-table">
              <table className="w-full min-w-[760px] text-right text-xs">
                <thead>
                  <tr className="border-b border-[#EFEFF5] bg-[#FAFAFE] text-[11px] text-[#626775]">
                    <th className="px-4 py-3 font-medium">شماره سفارش</th>
                    <th className="px-4 py-3 font-medium">مشتری</th>
                    <th className="px-4 py-3 font-medium">مبلغ</th>
                    <th className="px-4 py-3 font-medium">واحد پول</th>
                    <th className="px-4 py-3 font-medium">درگاه</th>
                    <th className="px-4 py-3 font-medium">شماره مرجع بانکی</th>
                    <th className="px-4 py-3 font-medium">وضعیت تایید</th>
                    <th className="px-4 py-3 font-medium">زمان ثبت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEFF5]">
                  {finance.transactions.map((t) => {
                    const pBadge = getPaymentBadge(t.paymentStatus);
                    return (
                      <tr key={t.id} className="hover:bg-[#FAFAFE]">
                        <td className="px-4 py-3 font-mono font-bold text-[#1813FB]">
                          <bdi dir="ltr">{t.orderNumber}</bdi>
                        </td>
                        <td className="px-4 py-3 font-medium text-[#080707]">
                          {t.customerName}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {formatToman(t.amount)}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px]">
                          <bdi dir="ltr">{t.currencyUnit}</bdi>
                        </td>
                        <td className="px-4 py-3 uppercase font-mono text-[11px]">
                          <bdi dir="ltr">{t.gateway}</bdi>
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px]">
                          <bdi dir="ltr">{t.paymentRef}</bdi>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            label={pBadge.label}
                            tone={pBadge.tone}
                          />
                        </td>
                        <td className="px-4 py-3 text-[#626775] whitespace-nowrap">
                          {formatJalaliDateTime(t.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
