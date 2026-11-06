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
import { RotateCcw, Plus, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";

interface ReturnRow {
  id: number;
  returnCode: string;
  orderNumber: string;
  sku: string;
  productName: string;
  purchasedQty: number;
  previouslyReturnedQty: number;
  requestedQty: number;
  reason: string;
  status: string;
  qcNotes: string;
  refundProviderRef: string;
  createdAt: string;
}

interface EligibleOrder {
  id: number;
  orderNumber: string;
  customerName: string;
  items: Array<{
    id: number;
    productName: string;
    sku: string;
    quantity: number;
  }>;
}

export default function ReturnsPage() {
  const { can } = useRole();
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [eligibleOrders, setEligibleOrders] = useState<EligibleOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [requestedQty, setRequestedQty] = useState("1");
  const [reason, setReason] = useState("");
  const [providerRefMap, setProviderRefMap] = useState<Record<number, string>>(
    {}
  );
  const [toast, setToast] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const loadReturns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/returns", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setReturns(data.returns || []);
        const ords: EligibleOrder[] = data.eligibleOrders || [];
        setEligibleOrders(ords);
        if (!selectedItemId && ords[0]?.items[0]) {
          setSelectedItemId(String(ords[0].items[0].id));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selectedItemId]);

  useEffect(() => {
    loadReturns();
  }, [loadReturns]);

  if (!can("returns", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="مرجوعی، کنترل کیفیت و بازپرداخت" />
      </AdminShell>
    );
  }

  const handleCreateReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    setToast(null);
    setErrMsg(null);
    const res = await fetch("/api/returns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderItemId: Number(selectedItemId),
        requestedQty: Number(requestedQty),
        reason,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrMsg(data?.error || "خطا در ثبت درخواست مرجوعی");
    } else {
      setReason("");
      setToast(`پرونده مرجوعی ${data.returnRequest.returnCode} ثبت شد.`);
      loadReturns();
    }
  };

  const handleUpdateReturn = async (
    id: number,
    status: string,
    qcNotes?: string,
    refundProviderRef?: string
  ) => {
    setToast(null);
    setErrMsg(null);
    const res = await fetch("/api/returns", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, qcNotes, refundProviderRef }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErrMsg(data?.error || "عملیات مجاز نیست");
    } else {
      setToast("وضعیت پرونده مرجوعی بروزرسانی شد.");
      loadReturns();
    }
  };

  const getReturnBadge = (st: string) => {
    switch (st) {
      case "requested":
        return { label: "درخواست ثبت‌شده", tone: "indigo" as const };
      case "received":
        return { label: "تحویل به انبار مرجوعی", tone: "warning" as const };
      case "qc_passed":
        return { label: "تایید کنترل کیفیت (QC)", tone: "success" as const };
      case "qc_failed":
        return { label: "رد کنترل کیفیت", tone: "danger" as const };
      case "refund_pending_provider":
        return {
          label: "در انتظار تایید بانک / شاپرک",
          tone: "warning" as const,
        };
      case "refund_confirmed":
        return {
          label: "بازپرداخت تاییدشده بانک",
          tone: "success" as const,
        };
      case "exchanged":
        return { label: "تعویض سایز ثبت‌شده", tone: "indigo" as const };
      default:
        return { label: st, tone: "neutral" as const };
    }
  };

  return (
    <AdminShell>
      <PageHeader
        title="مدیریت مرجوعی، بازرسی کنترل کیفیت (QC) و بازپرداخت وجه"
        description="ثبت مرجوعی جزئی با کنترل تعداد مجاز باقی‌مانده، ارزیابی سلامت کالا و ثبت تاییدیه واقعی بانک"
      />

      {toast && (
        <div className="mb-4 rounded-xl border border-[#A6F4C5] bg-[#ECFDF3] px-4 py-2.5 text-xs font-medium text-[#127A4B]">
          {toast}
        </div>
      )}
      {errMsg && (
        <div className="mb-4 rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-2.5 text-xs font-medium text-[#B44F40]">
          {errMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Returns Queue */}
        <div className="space-y-3 lg:col-span-8">
          {loading ? (
            <LoadingState />
          ) : (
            returns.map((ret) => {
              const badge = getReturnBadge(ret.status);
              const eligibleRemaining =
                ret.purchasedQty - ret.previouslyReturnedQty;
              return (
                <div
                  key={ret.id}
                  className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-[#1813FB]">
                        <bdi dir="ltr">{ret.returnCode}</bdi>
                      </span>
                      <span className="text-xs text-[#626775]">
                        سفارش <bdi dir="ltr">{ret.orderNumber}</bdi>
                      </span>
                    </div>
                    <StatusBadge label={badge.label} tone={badge.tone} />
                  </div>

                  <div className="text-xs space-y-1">
                    <div className="font-semibold text-[#080707]">
                      {ret.productName} (
                      <span className="font-mono">
                        <bdi dir="ltr">{ret.sku}</bdi>
                      </span>
                      )
                    </div>
                    <div className="text-[#626775]">
                      تعداد خرید اصلی:{" "}
                      <strong>{formatNumberFa(ret.purchasedQty)}</strong> •
                      مرجوعی قبلی:{" "}
                      <strong>{formatNumberFa(ret.previouslyReturnedQty)}</strong>{" "}
                      • سقف مجاز:{" "}
                      <strong>{formatNumberFa(eligibleRemaining)}</strong> •{" "}
                      <span className="text-[#1813FB] font-semibold">
                        درخواست فعلی: {formatNumberFa(ret.requestedQty)} عدد
                      </span>
                    </div>
                    <p className="rounded-xl bg-[#FAFAFE] p-2.5 text-[#344054]">
                      دلیل مشتری: {ret.reason}
                    </p>
                    {ret.qcNotes && (
                      <p className="text-[11px] text-[#626775]">
                        گزارش کنترل کیفیت: {ret.qcNotes}
                      </p>
                    )}
                    {ret.refundProviderRef && (
                      <div className="text-[11px] font-mono text-[#127A4B]">
                        شناسه مرجع بانکی: <bdi dir="ltr">{ret.refundProviderRef}</bdi>
                      </div>
                    )}
                  </div>

                  {/* Workflow Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 border-t border-[#EFEFF5] pt-3 text-xs">
                    {ret.status === "requested" && (
                      <button
                        type="button"
                        onClick={() => handleUpdateReturn(ret.id, "received")}
                        className="h-8 rounded-lg bg-[#F0EEFF] px-3 font-semibold text-[#1813FB]"
                      >
                        تایید دریافت بسته در انبار
                      </button>
                    )}

                    {(ret.status === "received" || ret.status === "requested") && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateReturn(
                              ret.id,
                              "qc_passed",
                              "سلامت فیزیکی، تگ و بسته‌بندی کالا تایید شد."
                            )
                          }
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#127A4B] px-3 font-medium text-white"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span>تایید کنترل کیفیت (QC Pass)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateReturn(
                              ret.id,
                              "qc_failed",
                              "آثار استفاده یا مخدوش شدن تگ مشاهده شد."
                            )
                          }
                          className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#FECDCA] bg-white px-3 font-medium text-[#B44F40]"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <span>رد کنترل کیفیت</span>
                        </button>
                      </>
                    )}

                    {ret.status === "qc_passed" && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateReturn(
                              ret.id,
                              "refund_pending_provider"
                            )
                          }
                          className="h-8 rounded-lg bg-[#1813FB] px-3 font-medium text-white"
                        >
                          ارسال دستور بازپرداخت به بانک
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateReturn(ret.id, "exchanged")
                          }
                          className="h-8 rounded-lg border border-[#E5E7EB] bg-white px-3 font-medium text-[#080707]"
                        >
                          ثبت تعویض کالا
                        </button>
                      </>
                    )}

                    {ret.status === "refund_pending_provider" && (
                      <div className="flex flex-wrap items-center gap-2 w-full">
                        <input
                          type="text"
                          dir="ltr"
                          placeholder="شماره پیگیری شبا / شاپرک (مثال: SHABA-99812)"
                          value={providerRefMap[ret.id] ?? ""}
                          onChange={(e) =>
                            setProviderRefMap((p) => ({
                              ...p,
                              [ret.id]: e.target.value,
                            }))
                          }
                          className="h-8 flex-1 min-w-[200px] rounded-lg border border-[#E5E7EB] px-2.5 text-left font-mono text-xs"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateReturn(
                              ret.id,
                              "refund_confirmed",
                              undefined,
                              providerRefMap[ret.id]
                            )
                          }
                          className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#127A4B] px-3 font-medium text-white"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                          <span>ثبت تایید قطعی بانک</span>
                        </button>
                      </div>
                    )}

                    <span className="mr-auto text-[11px] text-[#626775]">
                      {formatJalaliDateTime(ret.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Create Partial Return Request */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-4 h-fit space-y-4">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-[#1813FB]" />
            <h2 className="text-sm font-semibold text-[#080707]">
              ثبت درخواست مرجوعی جزئی / کامل
            </h2>
          </div>

          <form onSubmit={handleCreateReturn} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                انتخاب قلم از سفارش‌های ثبت‌شده
              </label>
              <select
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs"
              >
                {eligibleOrders.flatMap((o) =>
                  o.items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {o.orderNumber} — {it.productName} ({it.sku}) | خرید:{" "}
                      {it.quantity}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                تعداد درخواستی مرجوعی
              </label>
              <input
                type="number"
                min={1}
                dir="ltr"
                value={requestedQty}
                onChange={(e) => setRequestedQty(e.target.value)}
                className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                دلیل مرجوعی یا تعویض
              </label>
              <textarea
                rows={3}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="مثال: بزرگ بودن سایز آستین — درخواست تعویض..."
                className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={!can("returns", "create")}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1]"
            >
              <Plus className="h-4 w-4" />
              <span>ثبت پرونده مرجوعی</span>
            </button>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
