"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { Printer, AlertTriangle, CheckCircle2 } from "lucide-react";

type DocType = "shipping_label_100x150" | "packing_slip" | "picking_list" | "invoice";

interface PrintableOrder {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  shippingProvince: string;
  shippingCity: string;
  shippingAddress: string;
  postalCode: string;
  totalAmount: number;
  paymentStatus: string;
  operationalStatus: string;
  shippingMethod: string;
  trackingCode: string;
  createdAt: string;
  items: Array<{
    id: number;
    productName: string;
    colorName: string;
    sizeLabel: string;
    sku: string;
    quantity: number;
    recordedUnitPrice: number;
    recordedLineTotal: number;
  }>;
}

function PrintCenterContent() {
  const searchParams = useSearchParams();
  const { can } = useRole();

  const [orders, setOrders] = useState<PrintableOrder[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>(() => {
    const raw = searchParams.get("ids") || "";
    return raw
      .split(",")
      .map(Number)
      .filter((n) => !Number.isNaN(n) && n > 0);
  });
  const [docType, setDocType] = useState<DocType>("shipping_label_100x150");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/orders", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.orders) {
          const list: PrintableOrder[] = data.orders;
          setOrders(list);
          if (selectedIds.length === 0 && list[0]) {
            setSelectedIds([list[0].id]);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [selectedIds.length]);

  if (!can("orders", "view") && !can("inventory", "view")) {
    return <UnauthorizedState moduleTitle="مرکز چاپ اسناد" />;
  }

  const isOrderEligible = (ord: PrintableOrder, type: DocType): boolean => {
    if (type === "invoice" || type === "shipping_label_100x150") {
      return (
        ord.paymentStatus === "verified_paid" &&
        ord.operationalStatus !== "cancelled" &&
        ord.operationalStatus !== "exception"
      );
    }
    return ord.operationalStatus !== "cancelled";
  };

  const selectedOrders = orders.filter((o) => selectedIds.includes(o.id));
  const eligibleSelected = selectedOrders.filter((o) =>
    isOrderEligible(o, docType)
  );
  const ineligibleSelected = selectedOrders.filter(
    (o) => !isOrderEligible(o, docType)
  );

  return (
    <div className="space-y-4">
      <div className="no-print">
        <PageHeader
          title="مرکز یکپارچه چاپ اسناد عملیات (Print Center)"
          description="تولید و چاپ برچسب استاندارد ارسال ۱۰۰×۱۵۰ میلی‌متر، برگ بسته‌بندی مجزا، لیست برداشت و فاکتور مجاز"
          primaryAction={
            <button
              type="button"
              disabled={eligibleSelected.length === 0}
              onClick={() => window.print()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1813FB] px-5 text-xs sm:text-sm font-medium text-white hover:bg-[#110CD1] disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              <span>
                چاپ اسناد مجاز ({formatNumberFa(eligibleSelected.length)} سند)
              </span>
            </button>
          }
        />

        {/* Physical Printer Verification Disclaimer */}
        <div className="mb-4 rounded-xl border border-[#C1BCF2] bg-[#F0EEFF]/60 px-4 py-2.5 text-xs text-[#344054]">
          ابعاد برچسب ارسال مطابق استاندارد حرارتی{" "}
          <strong dir="ltr">100 × 150 mm</strong> تنظیم شده است. کالیبراسیون
          نهایی چاپگر حرارتی فیزیکی در انبار منوط به آزمون چاپ روی دستگاه
          تنظیم‌شده است.
        </div>

        {/* Document Type Selector + Order Selection */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 lg:col-span-5 space-y-3">
            <div className="text-xs font-semibold text-[#080707]">
              ۱. انتخاب نوع سند چاپی:
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  key: "shipping_label_100x150",
                  label: "برچسب ارسال (100×150mm)",
                },
                {
                  key: "packing_slip",
                  label: "برگ بسته‌بندی (Packing Slip)",
                },
                {
                  key: "picking_list",
                  label: "لیست برداشت انبار",
                },
                {
                  key: "invoice",
                  label: "فاکتور فروش مجاز",
                },
              ].map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setDocType(d.key as DocType)}
                  className={`rounded-xl border px-3 py-2.5 text-right text-xs font-medium ${
                    docType === d.key
                      ? "border-[#1813FB] bg-[#F0EEFF] text-[#1813FB] font-semibold"
                      : "border-[#E5E7EB] bg-white text-[#344054]"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div className="pt-2 border-t border-[#EFEFF5]">
              <div className="text-xs font-semibold text-[#080707] mb-2">
                ۲. انتخاب سفارش‌های تکی یا گروهی:
              </div>
              {loading ? (
                <LoadingState />
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-1.5 kv-scroll-table">
                  {orders.map((ord) => {
                    const checked = selectedIds.includes(ord.id);
                    const ok = isOrderEligible(ord, docType);
                    return (
                      <label
                        key={ord.id}
                        className="flex items-center justify-between rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] px-3 py-2 text-xs cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedIds((prev) =>
                                prev.includes(ord.id)
                                  ? prev.filter((x) => x !== ord.id)
                                  : [...prev, ord.id]
                              )
                            }
                            className="h-4 w-4 rounded accent-[#1813FB]"
                          />
                          <span className="font-mono font-bold text-[#1813FB]">
                            <bdi dir="ltr">{ord.orderNumber}</bdi>
                          </span>
                          <span className="text-[#080707]">
                            {ord.customerName}
                          </span>
                        </div>
                        {ok ? (
                          <CheckCircle2 className="h-4 w-4 text-[#127A4B]" />
                        ) : (
                          <StatusBadge label="غیرمجاز چاپ" tone="danger" />
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {ineligibleSelected.length > 0 && (
              <div className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] p-3 text-[11px] text-[#8A3427] flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-[#B44F40] shrink-0 mt-0.5" />
                <span>
                  {formatNumberFa(ineligibleSelected.length)} سفارش انتخاب‌شده
                  به دلیل تایید نشدن پرداخت یا وجود مغایرت مالی مجاز به چاپ
                  برچسب/فاکتور نیستند.
                </span>
              </div>
            )}
          </div>

          {/* Live Print Preview Area */}
          <div className="lg:col-span-7">
            <div className="mb-2 text-xs font-semibold text-[#626775]">
              پیش‌نمایش سند آماده چاپ:
            </div>
            <div className="space-y-4">
              {eligibleSelected.map((ord) => (
                <div
                  key={ord.id}
                  className={`print-only-container mx-auto rounded-2xl border border-[#D0D5DD] bg-white p-5 shadow-xs ${
                    docType === "shipping_label_100x150"
                      ? "shipping-label-100x150 max-w-[380px] min-h-[540px] flex flex-col justify-between"
                      : "w-full"
                  }`}
                >
                  {docType === "shipping_label_100x150" && (
                    <>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between border-b-2 border-[#080707] pb-2.5">
                          <div>
                            <div className="text-sm font-bold">کلبه وینتیج</div>
                            <div className="text-[10px] text-[#626775]">
                              برچسب ارسال استاندارد 100×150mm
                            </div>
                          </div>
                          <span className="font-mono text-sm font-bold">
                            <bdi dir="ltr">{ord.orderNumber}</bdi>
                          </span>
                        </div>

                        <div className="rounded-lg border border-[#080707] p-2.5 text-xs space-y-1">
                          <div className="text-[10px] font-bold text-[#626775]">
                            فرستنده:
                          </div>
                          <div className="font-semibold">
                            انبار مرکزی کلبه وینتیج — تهران، خیابان ولیعصر
                          </div>
                        </div>

                        <div className="rounded-lg border-2 border-[#080707] p-3 text-xs space-y-1.5">
                          <div className="text-[10px] font-bold text-[#626775]">
                            گیرنده و نشانی مقصد:
                          </div>
                          <div className="text-sm font-bold">
                            {ord.customerName}
                          </div>
                          <div>
                            موبایل:{" "}
                            <span className="font-mono font-semibold">
                              <bdi dir="ltr">{ord.customerPhone}</bdi>
                            </span>
                          </div>
                          <div className="leading-relaxed">
                            {ord.shippingProvince}، {ord.shippingCity} —{" "}
                            {ord.shippingAddress}
                          </div>
                          <div className="pt-1 font-mono font-bold">
                            کد پستی: <bdi dir="ltr">{ord.postalCode || "—"}</bdi>
                          </div>
                        </div>
                      </div>

                      <div className="border-t-2 border-[#080707] pt-3 text-center space-y-1.5">
                        <div className="text-xs font-semibold">
                          {ord.shippingMethod}
                        </div>
                        {/* Crisp SVG Barcode Representation */}
                        <div className="mx-auto flex h-12 w-56 items-center justify-center gap-0.5 bg-white px-2">
                          {Array.from({ length: 34 }).map((_, i) => (
                            <span
                              key={i}
                              className="inline-block bg-[#080707] h-full"
                              style={{
                                width: i % 3 === 0 ? "3px" : i % 2 === 0 ? "2px" : "1px",
                              }}
                            />
                          ))}
                        </div>
                        <div className="font-mono text-xs font-bold">
                          <bdi dir="ltr">
                            {ord.trackingCode || ord.orderNumber}
                          </bdi>
                        </div>
                      </div>
                    </>
                  )}

                  {docType === "packing_slip" && (
                    <div className="space-y-4 text-xs">
                      <div className="flex items-center justify-between border-b border-[#080707] pb-3">
                        <div>
                          <h3 className="text-base font-bold">
                            برگ بسته‌بندی مرسوله (Packing Slip)
                          </h3>
                          <span className="text-[#626775]">
                            سند مجزا ویژه کنترل کیفیت و بسته‌بندی انبار
                          </span>
                        </div>
                        <div className="text-left font-mono font-bold">
                          <bdi dir="ltr">{ord.orderNumber}</bdi>
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span>گیرنده: {ord.customerName}</span>
                        <span>تاریخ: {formatJalaliDate(ord.createdAt)}</span>
                      </div>
                      <table className="w-full text-right border-collapse">
                        <thead>
                          <tr className="border-b border-[#080707]">
                            <th className="py-2">نام کالا</th>
                            <th className="py-2">رنگ / سایز</th>
                            <th className="py-2">کد SKU</th>
                            <th className="py-2">تعداد</th>
                            <th className="py-2">کنترل</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E7EB]">
                          {ord.items.map((it) => (
                            <tr key={it.id}>
                              <td className="py-2 font-medium">
                                {it.productName}
                              </td>
                              <td className="py-2">
                                {it.colorName} / {it.sizeLabel}
                              </td>
                              <td className="py-2 font-mono">
                                <bdi dir="ltr">{it.sku}</bdi>
                              </td>
                              <td className="py-2 font-bold">
                                {formatNumberFa(it.quantity)}
                              </td>
                              <td className="py-2">☐</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {(docType === "picking_list" || docType === "invoice") && (
                    <div className="space-y-4 text-xs">
                      <div className="flex items-center justify-between border-b border-[#080707] pb-3">
                        <h3 className="text-base font-bold">
                          {docType === "invoice"
                            ? "فاکتور فروش تاییدشده کلبه وینتیج"
                            : "لیست برداشت از قفسه انبار"}
                        </h3>
                        <span className="font-mono font-bold">
                          <bdi dir="ltr">{ord.orderNumber}</bdi>
                        </span>
                      </div>
                      <div>
                        خریدار: {ord.customerName} — {ord.shippingProvince}،{" "}
                        {ord.shippingCity}
                      </div>
                      <table className="w-full text-right">
                        <thead>
                          <tr className="border-b border-[#080707]">
                            <th className="py-2">شرح کالا</th>
                            <th className="py-2">SKU</th>
                            <th className="py-2">تعداد</th>
                            {docType === "invoice" && (
                              <th className="py-2 text-left">مبلغ کل</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5E7EB]">
                          {ord.items.map((it) => (
                            <tr key={it.id}>
                              <td className="py-2">
                                {it.productName} ({it.colorName} - {it.sizeLabel})
                              </td>
                              <td className="py-2 font-mono">
                                <bdi dir="ltr">{it.sku}</bdi>
                              </td>
                              <td className="py-2">
                                {formatNumberFa(it.quantity)}
                              </td>
                              {docType === "invoice" && (
                                <td className="py-2 text-left font-semibold">
                                  {formatToman(it.recordedLineTotal)}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {docType === "invoice" && (
                        <div className="border-t border-[#080707] pt-2 text-left font-bold text-sm">
                          جمع کل پرداخت‌شده: {formatToman(ord.totalAmount)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PrintCenterPage() {
  return (
    <AdminShell>
      <Suspense fallback={<LoadingState />}>
        <PrintCenterContent />
      </Suspense>
    </AdminShell>
  );
}
