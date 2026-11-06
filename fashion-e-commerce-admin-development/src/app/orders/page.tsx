"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import {
  StatusBadge,
  getOrderStatusBadge,
  getPaymentBadge,
} from "@/components/admin/ui/StatusBadge";
import {
  LoadingState,
  EmptyState,
  ErrorState,
  UnauthorizedState,
} from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import {
  formatJalaliDateTime,
  formatNumberFa,
  formatToman,
} from "@/lib/formatters";
import {
  FilePlus2,
  Printer,
  Search,
  Eye,
  ArrowUpLeft,
  X,
  ScanBarcode,
} from "lucide-react";

interface OrderItemSummary {
  id: number;
  productName: string;
  colorName: string;
  sizeLabel: string;
  sku: string;
  quantity: number;
  recordedLineTotal: number;
}

interface OrderRow {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  shippingProvince: string;
  shippingCity: string;
  shippingAddress: string;
  totalAmount: number;
  currencyUnit: string;
  paymentStatus: string;
  paymentGateway: string;
  paymentRef: string;
  operationalStatus: string;
  shippingMethod: string;
  carrierName: string;
  trackingCode: string;
  isManualOrder: boolean;
  createdAt: string;
  items: OrderItemSummary[];
}

function OrdersListContent() {
  const searchParams = useSearchParams();
  const { can } = useRole();

  const [statusTab, setStatusTab] = useState(
    searchParams.get("status") || "all"
  );
  const [search, setSearch] = useState("");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [counts, setCounts] = useState({
    all: 0,
    new: 0,
    awaiting_prep: 0,
    picking_packing: 0,
    ready_to_ship: 0,
    shipped: 0,
    exception: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [quickPreviewOrder, setQuickPreviewOrder] = useState<OrderRow | null>(
    null
  );

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statusTab !== "all") params.set("status", statusTab);
    if (search.trim()) params.set("q", search.trim());
    try {
      const res = await fetch(`/api/orders?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "خطا در بارگذاری سفارش‌ها");
      }
      const data = await res.json();
      setOrders(data.orders || []);
      if (data.statusCounts) setCounts(data.statusCounts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای شبکه");
    } finally {
      setLoading(false);
    }
  }, [statusTab, search]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  if (!can("orders", "view")) {
    return <UnauthorizedState moduleTitle="مدیریت سفارش‌ها" />;
  }

  const tabs = [
    { key: "all", label: "همه سفارش‌ها", count: counts.all },
    { key: "new", label: "جدید", count: counts.new },
    {
      key: "awaiting_prep",
      label: "در انتظار آماده‌سازی",
      count: counts.awaiting_prep,
    },
    {
      key: "picking_packing",
      label: "برداشت و بسته‌بندی",
      count: counts.picking_packing,
    },
    { key: "ready_to_ship", label: "آماده ارسال", count: counts.ready_to_ship },
    { key: "shipped", label: "ارسال شده", count: counts.shipped },
    { key: "exception", label: "مغایرت / استعلام", count: counts.exception },
  ];

  const handleQuickPayVerify = async (orderId: number) => {
    await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "continue_payment" }),
    });
    setQuickPreviewOrder(null);
    loadOrders();
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="مدیریت سفارش‌ها و عملیات پردازش (OMS)"
        description="پیگیری وضعیت تایید پرداخت بانکی، صف آماده‌سازی انبار، کد رهگیری پستی و مغایرت‌ها"
        primaryAction={
          can("orders", "create") ? (
            <Link
              href="/orders/manual"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1813FB] px-4 text-xs sm:text-sm font-medium text-white hover:bg-[#110CD1]"
            >
              <FilePlus2 className="h-4 w-4" />
              <span>ثبت سفارش دستی</span>
            </Link>
          ) : undefined
        }
        secondaryActions={
          <div className="flex items-center gap-2">
            <Link
              href="/orders/fulfillment"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#080707] hover:bg-[#F7F7FB]"
            >
              <ScanBarcode className="h-4 w-4 text-[#1813FB]" />
              <span>برداشت و بسته‌بندی</span>
            </Link>
            <Link
              href="/orders/print"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#080707] hover:bg-[#F7F7FB]"
            >
              <Printer className="h-4 w-4 text-[#626775]" />
              <span>چاپ گروهی</span>
            </Link>
          </div>
        }
      />

      {/* Status Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 kv-scroll-table">
        {tabs.map((t) => {
          const active = statusTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatusTab(t.key)}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-medium ${
                active
                  ? "border-[#1813FB] bg-[#F0EEFF] text-[#1813FB] font-semibold"
                  : "border-[#E5E7EB] bg-white text-[#4B505E] hover:bg-[#F7F7FB]"
              }`}
            >
              <span>{t.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                  active
                    ? "bg-[#1813FB] text-white"
                    : "bg-[#F4F5F8] text-[#626775]"
                }`}
              >
                {formatNumberFa(t.count)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search & Bulk Actions */}
      <div className="flex flex-col gap-2.5 rounded-2xl border border-[#E5E7EB] bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#626775]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو بر اساس شماره سفارش، نام مشتری، موبایل یا کد رهگیری..."
            className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-[#FAFAFE] pr-9 pl-3 text-xs"
          />
        </div>

        {selectedIds.length > 0 && (
          <Link
            href={`/orders/print?ids=${selectedIds.join(",")}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#F0EEFF] px-3 text-xs font-semibold text-[#1813FB]"
          >
            <Printer className="h-3.5 w-3.5" />
            <span>
              چاپ برچسب ارسال ({formatNumberFa(selectedIds.length)} سفارش)
            </span>
          </Link>
        )}
      </div>

      {loading && <LoadingState label="در حال بارگذاری سفارش‌ها..." />}
      {error && <ErrorState message={error} onRetry={loadOrders} />}

      {!loading && !error && orders.length === 0 && (
        <EmptyState
          title="سفارشی در این وضعیت یافت نشد"
          description="فیلترهای جستجو را بررسی کنید یا یک سفارش دستی جدید ثبت نمایید."
        />
      )}

      {!loading && !error && orders.length > 0 && (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden">
          <div className="overflow-x-auto kv-scroll-table">
            <table className="w-full min-w-[900px] text-right text-xs">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#FAFAFE] text-[11px] font-semibold text-[#626775]">
                  <th className="w-10 px-3 py-3 text-center">انتخاب</th>
                  <th className="sticky right-0 z-10 bg-[#FAFAFE] px-3 py-3">
                    شماره سفارش
                  </th>
                  <th className="px-3 py-3">مشتری و مقصد</th>
                  <th className="px-3 py-3">تاریخ ثبت</th>
                  <th className="px-3 py-3">مبلغ کل</th>
                  <th className="px-3 py-3">وضعیت پرداخت</th>
                  <th className="px-3 py-3">وضعیت عملیات</th>
                  <th className="px-3 py-3">روش و کد رهگیری ارسال</th>
                  <th className="px-3 py-3 text-left">عملیات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFF5]">
                {orders.map((ord) => {
                  const payB = getPaymentBadge(ord.paymentStatus);
                  const opB = getOrderStatusBadge(ord.operationalStatus);
                  return (
                    <tr key={ord.id} className="hover:bg-[#FAFAFE]">
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(ord.id)}
                          onChange={() =>
                            setSelectedIds((prev) =>
                              prev.includes(ord.id)
                                ? prev.filter((x) => x !== ord.id)
                                : [...prev, ord.id]
                            )
                          }
                          className="h-4 w-4 rounded accent-[#1813FB]"
                        />
                      </td>

                      <td className="sticky right-0 z-10 bg-white px-3 py-3">
                        <Link
                          href={`/orders/${ord.id}`}
                          className="font-mono text-xs font-bold text-[#1813FB] hover:underline"
                        >
                          <bdi dir="ltr">{ord.orderNumber}</bdi>
                        </Link>
                        {ord.isManualOrder && (
                          <span className="mr-1.5 rounded bg-[#F0EEFF] px-1.5 py-0.5 text-[10px] font-medium text-[#1813FB]">
                            دستی
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3">
                        <div className="font-semibold text-[#080707]">
                          {ord.customerName}
                        </div>
                        <div className="text-[11px] text-[#626775]">
                          {ord.shippingProvince}، {ord.shippingCity} •{" "}
                          <bdi dir="ltr">{ord.customerPhone}</bdi>
                        </div>
                      </td>

                      <td className="px-3 py-3 text-[#626775] whitespace-nowrap">
                        {formatJalaliDateTime(ord.createdAt)}
                      </td>

                      <td className="px-3 py-3 font-semibold text-[#080707] whitespace-nowrap">
                        {formatToman(ord.totalAmount)}
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        <StatusBadge label={payB.label} tone={payB.tone} />
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        <StatusBadge label={opB.label} tone={opB.tone} />
                      </td>

                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="text-xs text-[#080707]">
                          {ord.shippingMethod}
                        </div>
                        {ord.trackingCode ? (
                          <div className="font-mono text-[11px] text-[#1813FB]">
                            <bdi dir="ltr">{ord.trackingCode}</bdi>
                          </div>
                        ) : (
                          <div className="text-[10px] text-[#626775]">
                            بدون کد رهگیری
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-3 text-left whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setQuickPreviewOrder(ord)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-2.5 text-xs font-medium text-[#080707] hover:border-[#1813FB] hover:text-[#1813FB]"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            <span>پیش‌نمایش سریع</span>
                          </button>
                          <Link
                            href={`/orders/${ord.id}`}
                            className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#F0EEFF] px-2.5 text-xs font-semibold text-[#1813FB] hover:bg-[#E4E1FF]"
                          >
                            <span>جزئیات</span>
                            <ArrowUpLeft className="h-3.5 w-3.5" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approved Centered Quick Preview Modal (NEVER a long side drawer!) */}
      {quickPreviewOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-quick-preview-title"
        >
          <div className="w-full max-w-xl rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-[#EFEFF5] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3
                    id="order-quick-preview-title"
                    className="text-base font-semibold text-[#080707]"
                  >
                    پیش‌نمایش سریع سفارش{" "}
                    <span className="font-mono text-[#1813FB]">
                      <bdi dir="ltr">{quickPreviewOrder.orderNumber}</bdi>
                    </span>
                  </h3>
                  <StatusBadge
                    label={
                      getPaymentBadge(quickPreviewOrder.paymentStatus).label
                    }
                    tone={getPaymentBadge(quickPreviewOrder.paymentStatus).tone}
                  />
                </div>
                <p className="mt-1 text-xs text-[#626775]">
                  مشتری: {quickPreviewOrder.customerName} (
                  <bdi dir="ltr">{quickPreviewOrder.customerPhone}</bdi>)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQuickPreviewOrder(null)}
                aria-label="بستن پیش‌نمایش"
                className="rounded-lg p-1.5 text-[#626775] hover:bg-[#F4F5F8]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Items Snapshot */}
            <div className="space-y-2 max-h-56 overflow-y-auto kv-scroll-table">
              {quickPreviewOrder.items.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center justify-between rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] px-3 py-2 text-xs"
                >
                  <div>
                    <div className="font-semibold text-[#080707]">
                      {it.productName}
                    </div>
                    <div className="text-[11px] text-[#626775]">
                      {it.colorName} • سایز {it.sizeLabel} •{" "}
                      <bdi dir="ltr">{it.sku}</bdi> ×{" "}
                      {formatNumberFa(it.quantity)}
                    </div>
                  </div>
                  <span className="font-semibold text-[#080707]">
                    {formatToman(it.recordedLineTotal)}
                  </span>
                </div>
              ))}
            </div>

            {/* Shipment & Financial Summary */}
            <div className="rounded-xl bg-[#F7F7FB] p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[#626775]">نشانی ارسال:</span>
                <span className="font-medium text-[#080707] text-left max-w-xs truncate">
                  {quickPreviewOrder.shippingProvince}،{" "}
                  {quickPreviewOrder.shippingCity} —{" "}
                  {quickPreviewOrder.shippingAddress}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#626775]">شیوه ارسال:</span>
                <span className="font-medium text-[#080707]">
                  {quickPreviewOrder.shippingMethod}
                </span>
              </div>
              <div className="flex justify-between border-t border-[#E5E7EB] pt-1.5">
                <span className="font-semibold text-[#080707]">
                  مبلغ نهایی ثبت‌شده:
                </span>
                <span className="font-bold text-[#1813FB]">
                  {formatToman(quickPreviewOrder.totalAmount)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#EFEFF5] pt-3">
              <div className="flex items-center gap-2">
                {quickPreviewOrder.paymentStatus === "unpaid" && (
                  <button
                    type="button"
                    onClick={() => handleQuickPayVerify(quickPreviewOrder.id)}
                    className="h-9 rounded-xl bg-[#127A4B] px-3.5 text-xs font-medium text-white hover:bg-[#0E603B]"
                  >
                    تایید پرداخت روی همین سفارش
                  </button>
                )}
                {(quickPreviewOrder.operationalStatus === "picking" ||
                  quickPreviewOrder.operationalStatus === "awaiting_prep") && (
                  <Link
                    href={`/orders/fulfillment?orderId=${quickPreviewOrder.id}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1813FB] px-3.5 text-xs font-medium text-white"
                  >
                    <ScanBarcode className="h-3.5 w-3.5" />
                    <span>شروع برداشت / اسکن بارکد</span>
                  </Link>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuickPreviewOrder(null)}
                  className="h-9 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#344054]"
                >
                  بستن
                </button>
                <Link
                  href={`/orders/${quickPreviewOrder.id}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#F0EEFF] px-4 text-xs font-semibold text-[#1813FB] hover:bg-[#E4E1FF]"
                >
                  <span>مشاهده جزئیات کامل سفارش</span>
                  <ArrowUpLeft className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <AdminShell>
      <Suspense fallback={<LoadingState label="در حال بارگذاری سفارش‌ها..." />}>
        <OrdersListContent />
      </Suspense>
    </AdminShell>
  );
}
