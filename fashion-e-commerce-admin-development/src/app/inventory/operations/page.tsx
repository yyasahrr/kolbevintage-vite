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
import { PackagePlus, ClipboardCheck, Scale, Check, X } from "lucide-react";

interface FlatSku {
  variantId: number;
  sku: string;
  productName: string;
  colorName: string;
  sizeLabel: string;
  physicalStock: number;
  reservedStock: number;
  sellableStock: number;
}

interface AdjustmentRow {
  id: number;
  sku: string;
  currentStock: number;
  requestedDelta: number;
  reason: string;
  requesterName: string;
  status: string;
  reviewerName: string | null;
  createdAt: string;
}

export default function InventoryOperationsPage() {
  const { can } = useRole();
  const [tab, setTab] = useState<"receive" | "stocktake" | "adjustments">(
    "receive"
  );
  const [skus, setSkus] = useState<FlatSku[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [acceptedQty, setAcceptedQty] = useState("10");
  const [rejectedQty, setRejectedQty] = useState("0");
  const [refCode, setRefCode] = useState("");
  const [qcNote, setQcNote] = useState("تایید کیفیت در بارانداز مرکزی");

  const [countedQty, setCountedQty] = useState("8");
  const [sessionCode, setSessionCode] = useState("STK-1404-Q3");

  const [adjDelta, setAdjDelta] = useState("2");
  const [adjReason, setAdjReason] = useState("");

  const [opToast, setOpToast] = useState<string | null>(null);
  const [opErr, setOpErr] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inventory", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const flat: FlatSku[] = data.flatSkus || [];
        setSkus(flat);
        setAdjustments(data.adjustments || []);
        if (flat[0] && !selectedVariantId) {
          setSelectedVariantId(String(flat[0].variantId));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selectedVariantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!can("inventory", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="عملیات انبار و اصلاح موجودی" />
      </AdminShell>
    );
  }

  const runOperation = async (payload: Record<string, unknown>) => {
    setOpToast(null);
    setOpErr(null);
    const res = await fetch("/api/inventory/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setOpErr(data?.error || "عملیات انجام نشد");
    } else {
      setOpToast("تراکنش در دفتر کل مرجع انبار با موفقیت ثبت شد.");
      loadData();
    }
  };

  const activeSku = skus.find((s) => String(s.variantId) === selectedVariantId);

  return (
    <AdminShell>
      <PageHeader
        title="عملیات انبار: دریافت کالا، شمارش دوره‌ای و اصلاح موجودی"
        description="کلیه تغییرات موجودی فقط از طریق این فرآیندهای کنترل‌شده و با ثبت سند در دفتر کل انبار انجام می‌شود"
      />

      {opToast && (
        <div className="mb-4 rounded-xl border border-[#A6F4C5] bg-[#ECFDF3] px-4 py-2.5 text-xs font-medium text-[#127A4B]">
          {opToast}
        </div>
      )}
      {opErr && (
        <div className="mb-4 rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-2.5 text-xs font-medium text-[#B44F40]">
          {opErr}
        </div>
      )}

      {/* Mode Tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab("receive")}
          className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-medium ${
            tab === "receive"
              ? "bg-[#1813FB] text-white"
              : "border border-[#E5E7EB] bg-white text-[#344054]"
          }`}
        >
          <PackagePlus className="h-4 w-4" />
          <span>۱. دریافت محموله کالا (Receiving)</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("stocktake")}
          className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-medium ${
            tab === "stocktake"
              ? "bg-[#1813FB] text-white"
              : "border border-[#E5E7EB] bg-white text-[#344054]"
          }`}
        >
          <ClipboardCheck className="h-4 w-4" />
          <span>۲. شمارش انبار (Stocktaking)</span>
        </button>
        <button
          type="button"
          onClick={() => setTab("adjustments")}
          className={`inline-flex h-10 items-center gap-2 rounded-xl px-4 text-xs font-medium ${
            tab === "adjustments"
              ? "bg-[#1813FB] text-white"
              : "border border-[#E5E7EB] bg-white text-[#344054]"
          }`}
        >
          <Scale className="h-4 w-4" />
          <span>
            ۳. اصلاح موجودی و کارتابل تایید مدیر (
            {formatNumberFa(
              adjustments.filter((a) => a.status === "pending").length
            )}
            )
          </span>
        </button>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <div className="space-y-5">
          {/* Shared SKU Selector Card */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4">
            <label className="block text-xs font-semibold text-[#080707] mb-1.5">
              انتخاب کد تنوع (SKU) هدف:
            </label>
            <select
              value={selectedVariantId}
              onChange={(e) => setSelectedVariantId(e.target.value)}
              className="h-10 w-full max-w-2xl rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#080707]"
            >
              {skus.map((s) => (
                <option key={s.variantId} value={s.variantId}>
                  {s.sku} — {s.productName} ({s.colorName} / سایز {s.sizeLabel}) |
                  موجودی فیزیکی: {s.physicalStock}
                </option>
              ))}
            </select>

            {activeSku && (
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-[#626775]">
                <span>
                  فیزیکی فعلی:{" "}
                  <strong className="text-[#080707]">
                    {formatNumberFa(activeSku.physicalStock)}
                  </strong>
                </span>
                <span>
                  رزروشده سفارش‌ها:{" "}
                  <strong className="text-[#080707]">
                    {formatNumberFa(activeSku.reservedStock)}
                  </strong>
                </span>
                <span>
                  قابل فروش فعلی:{" "}
                  <strong className="text-[#1813FB]">
                    {formatNumberFa(activeSku.sellableStock)}
                  </strong>
                </span>
              </div>
            )}
          </div>

          {tab === "receive" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runOperation({
                  operation: "receive",
                  variantId: Number(selectedVariantId),
                  acceptedQty: Number(acceptedQty),
                  rejectedQty: Number(rejectedQty),
                  referenceCode: refCode,
                  qcNote,
                });
              }}
              className="max-w-2xl rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-4"
            >
              <h3 className="text-sm font-semibold text-[#080707]">
                فرم ثبت رسید ورود کالا و کنترل کیفیت بارانداز
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-[#344054] mb-1">
                    تعداد سالم تاییدشده
                  </label>
                  <input
                    type="number"
                    min={1}
                    dir="ltr"
                    value={acceptedQty}
                    onChange={(e) => setAcceptedQty(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#344054] mb-1">
                    تعداد مردودی کنترل کیفیت
                  </label>
                  <input
                    type="number"
                    min={0}
                    dir="ltr"
                    value={rejectedQty}
                    onChange={(e) => setRejectedQty(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#344054] mb-1">
                    شماره حواله / بارنامه
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="RCV-1404-099"
                    value={refCode}
                    onChange={(e) => setRefCode(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-[#344054] mb-1">
                  توضیحات کنترل کیفیت ورود
                </label>
                <input
                  type="text"
                  value={qcNote}
                  onChange={(e) => setQcNote(e.target.value)}
                  className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
                />
              </div>
              <button
                type="submit"
                disabled={!can("inventory", "create")}
                className="h-10 rounded-xl bg-[#1813FB] px-5 text-xs font-medium text-white hover:bg-[#110CD1] disabled:opacity-50"
              >
                ثبت قطعی رسید در دفتر کل انبار
              </button>
            </form>
          )}

          {tab === "stocktake" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runOperation({
                  operation: "stocktake_reconcile",
                  variantId: Number(selectedVariantId),
                  countedQty: Number(countedQty),
                  sessionCode,
                });
              }}
              className="max-w-2xl rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-4"
            >
              <h3 className="text-sm font-semibold text-[#080707]">
                ثبت شمارش فیزیکی قفسه (Stocktaking)
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#344054] mb-1">
                    کد جلسه شمارش انبار
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={sessionCode}
                    onChange={(e) => setSessionCode(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#344054] mb-1">
                    تعداد واقعی شمارش‌شده در قفسه
                  </label>
                  <input
                    type="number"
                    min={0}
                    dir="ltr"
                    value={countedQty}
                    onChange={(e) => setCountedQty(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
                  />
                </div>
              </div>
              {activeSku && (
                <div className="rounded-xl bg-[#FAFAFE] p-3 text-xs text-[#4B505E]">
                  اختلاف با موجودی سیستمی فعلی:{" "}
                  <strong dir="ltr">
                    {Number(countedQty) - activeSku.physicalStock >= 0
                      ? `+${Number(countedQty) - activeSku.physicalStock}`
                      : Number(countedQty) - activeSku.physicalStock}
                  </strong>
                </div>
              )}
              <button
                type="submit"
                disabled={!can("inventory", "edit")}
                className="h-10 rounded-xl bg-[#1813FB] px-5 text-xs font-medium text-white hover:bg-[#110CD1]"
              >
                ثبت مغایرت‌گیری شمارش انبار
              </button>
            </form>
          )}

          {tab === "adjustments" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  runOperation({
                    operation: "request_adjustment",
                    variantId: Number(selectedVariantId),
                    requestedDelta: Number(adjDelta),
                    reason: adjReason,
                  });
                  setAdjReason("");
                }}
                className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-5 h-fit space-y-3"
              >
                <h3 className="text-sm font-semibold text-[#080707]">
                  ارسال درخواست اصلاح موجودی (نیازمند تایید مدیر)
                </h3>
                <div>
                  <label className="block text-xs font-medium text-[#344054] mb-1">
                    مقدار تغییر (+ افزایش / - کاهش)
                  </label>
                  <input
                    type="number"
                    dir="ltr"
                    value={adjDelta}
                    onChange={(e) => setAdjDelta(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#344054] mb-1">
                    دلیل مستند اصلاح موجودی
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={adjReason}
                    onChange={(e) => setAdjReason(e.target.value)}
                    placeholder="مثال: کسری به دلیل آسیب دیدگی در جابجایی..."
                    className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!can("inventory", "edit")}
                  className="h-10 w-full rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white"
                >
                  ثبت درخواست برای تایید مدیر
                </button>
              </form>

              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-7 space-y-3">
                <h3 className="text-sm font-semibold text-[#080707]">
                  کارتابل بررسی و تایید اصلاحات موجودی
                </h3>
                <div className="space-y-2.5">
                  {adjustments.map((adj) => (
                    <div
                      key={adj.id}
                      className="rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] p-3.5 text-xs space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-[#080707]">
                            <bdi dir="ltr">{adj.sku}</bdi>
                          </span>
                          <span
                            dir="ltr"
                            className={`font-mono font-bold ${
                              adj.requestedDelta >= 0
                                ? "text-[#127A4B]"
                                : "text-[#B44F40]"
                            }`}
                          >
                            {adj.requestedDelta >= 0
                              ? `+${adj.requestedDelta}`
                              : adj.requestedDelta}
                          </span>
                        </div>
                        <StatusBadge
                          label={
                            adj.status === "approved"
                              ? "تایید و اعمال شده"
                              : adj.status === "rejected"
                              ? "رد شده"
                              : "در انتظار تایید مدیر"
                          }
                          tone={
                            adj.status === "approved"
                              ? "success"
                              : adj.status === "rejected"
                              ? "danger"
                              : "warning"
                          }
                        />
                      </div>

                      <p className="text-[#344054]">{adj.reason}</p>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#626775]">
                        <span>درخواست‌کننده: {adj.requesterName}</span>
                        <span>{formatJalaliDateTime(adj.createdAt)}</span>
                      </div>

                      {adj.status === "pending" && (
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              runOperation({
                                operation: "review_adjustment",
                                adjustmentId: adj.id,
                                decision: "approved",
                              })
                            }
                            className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#127A4B] px-3 font-medium text-white hover:bg-[#0E603B]"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>تایید و اعمال در موجودی</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              runOperation({
                                operation: "review_adjustment",
                                adjustmentId: adj.id,
                                decision: "rejected",
                              })
                            }
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#FECDCA] bg-white px-3 font-medium text-[#B44F40]"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span>رد درخواست</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </AdminShell>
  );
}
