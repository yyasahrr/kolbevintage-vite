"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import {
  StatusBadge,
  getOrderStatusBadge,
  getPaymentBadge,
} from "@/components/admin/ui/StatusBadge";
import {
  LoadingState,
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
  ArrowRight,
  Printer,
  ScanBarcode,
  Truck,
  CheckCircle2,
  MapPin,
  CreditCard,
  Clock,
  Lock,
} from "lucide-react";

interface OrderDetail {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  shippingProvince: string;
  shippingCity: string;
  shippingAddress: string;
  postalCode: string;
  recipientName: string;
  subtotalAmount: number;
  discountAmount: number;
  shippingAmount: number;
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
}

interface OrderLineItem {
  id: number;
  productName: string;
  colorName: string;
  sizeLabel: string;
  sku: string;
  quantity: number;
  pickedQuantity: number;
  packedQuantity: number;
  recordedUnitPrice: number;
  recordedDiscountAmount: number;
  recordedLineTotal: number;
}

interface OrderEventRow {
  id: number;
  title: string;
  description: string;
  actorName: string;
  createdAt: string;
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { can } = useRole();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [items, setItems] = useState<OrderLineItem[]>([]);
  const [events, setEvents] = useState<OrderEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [trackingInput, setTrackingInput] = useState("");
  const [carrierInput, setCarrierInput] = useState("شرکت ملی پست");
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const loadOrder = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${params.id}`, { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "سفارش یافت نشد");
      }
      const data = await res.json();
      setOrder(data.order);
      setItems(data.items || []);
      setEvents(data.events || []);
      if (data.order?.trackingCode) setTrackingInput(data.order.trackingCode);
      if (data.order?.carrierName) setCarrierInput(data.order.carrierName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    loadOrder();
  }, [loadOrder]);

  if (!can("orders", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="جزئیات کامل سفارش" />
      </AdminShell>
    );
  }

  const runOrderAction = async (payload: Record<string, unknown>) => {
    setActionToast(null);
    setActionErr(null);
    const res = await fetch(`/api/orders/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setActionErr(data?.error || "خطا در اجرای عملیات");
    } else {
      setActionToast("وضعیت سفارش با موفقیت بروزرسانی شد.");
      loadOrder();
    }
  };

  const payB = order ? getPaymentBadge(order.paymentStatus) : null;
  const opB = order ? getOrderStatusBadge(order.operationalStatus) : null;

  return (
    <AdminShell>
      <PageHeader
        title={
          order
            ? `پرونده سفارش ${order.orderNumber}`
            : "در حال بارگذاری جزئیات سفارش..."
        }
        description={
          order
            ? `ثبت‌شده در ${formatJalaliDateTime(order.createdAt)} • مبالغ ثبت‌شده بر اساس نرخ تاریخی زمان خرید قفل شده‌اند`
            : ""
        }
        badge={
          order && payB && opB ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge label={opB.label} tone={opB.tone} />
              <StatusBadge label={payB.label} tone={payB.tone} />
            </div>
          ) : undefined
        }
        secondaryActions={
          <div className="flex items-center gap-2">
            <Link
              href="/orders"
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#344054]"
            >
              <ArrowRight className="h-4 w-4" />
              <span>سفارش‌ها</span>
            </Link>
            {order && (
              <Link
                href={`/orders/print?ids=${order.id}`}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#080707]"
              >
                <Printer className="h-4 w-4 text-[#626775]" />
                <span>چاپ برچسب / فاکتور</span>
              </Link>
            )}
          </div>
        }
        primaryAction={
          order &&
          (order.operationalStatus === "picking" ||
            order.operationalStatus === "awaiting_prep" ||
            order.operationalStatus === "new") ? (
            <Link
              href={`/orders/fulfillment?orderId=${order.id}`}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1]"
            >
              <ScanBarcode className="h-4 w-4" />
              <span>ورود به ایستگاه برداشت و بسته‌بندی</span>
            </Link>
          ) : undefined
        }
      />

      {actionToast && (
        <div className="mb-4 rounded-xl border border-[#A6F4C5] bg-[#ECFDF3] px-4 py-2.5 text-xs font-medium text-[#127A4B]">
          {actionToast}
        </div>
      )}
      {actionErr && (
        <div className="mb-4 rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-2.5 text-xs font-medium text-[#B44F40]">
          {actionErr}
        </div>
      )}

      {loading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={loadOrder} />}

      {!loading && !error && order && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Left/Main 8 Cols: Historical Items + Financial Summary + Activity Timeline */}
          <div className="space-y-5 lg:col-span-8">
            {/* Historical Purchased Items Table */}
            <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFEFF5] pb-3">
                <div>
                  <h2 className="text-sm font-semibold text-[#080707]">
                    اقلام خریداری‌شده در این سفارش
                  </h2>
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[#626775]">
                    <Lock className="h-3 w-3 text-[#1813FB]" />
                    <span>
                      قیمت واحد و تخفیف هر قلم مطابق سند تاریخی لحظه خرید حفظ شده
                      و با تغییرات فعلی کاتالوگ بازمحاسبه نمی‌شود.
                    </span>
                  </p>
                </div>
              </div>

              <div className="mt-3 overflow-x-auto kv-scroll-table">
                <table className="w-full min-w-[620px] text-right text-xs">
                  <thead>
                    <tr className="border-b border-[#EFEFF5] text-[11px] text-[#626775]">
                      <th className="py-2.5 font-medium">محصول و تنوع</th>
                      <th className="py-2.5 font-medium">کد SKU</th>
                      <th className="py-2.5 font-medium">تعداد / برداشت</th>
                      <th className="py-2.5 font-medium">قیمت واحد ثبت‌شده</th>
                      <th className="py-2.5 font-medium">تخفیف ثبت‌شده</th>
                      <th className="py-2.5 font-medium text-left">جمع سطر</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEFF5]">
                    {items.map((it) => (
                      <tr key={it.id}>
                        <td className="py-3">
                          <div className="font-semibold text-[#080707]">
                            {it.productName}
                          </div>
                          <div className="text-[11px] text-[#626775]">
                            رنگ {it.colorName} • سایز {it.sizeLabel}
                          </div>
                        </td>
                        <td className="py-3 font-mono text-[11px]">
                          <bdi dir="ltr">{it.sku}</bdi>
                        </td>
                        <td className="py-3">
                          <span className="font-semibold">
                            {formatNumberFa(it.quantity)} عدد
                          </span>
                          <div className="text-[10px] text-[#626775]">
                            اسکن برداشت: {formatNumberFa(it.pickedQuantity)} از{" "}
                            {formatNumberFa(it.quantity)}
                          </div>
                        </td>
                        <td className="py-3">
                          {formatToman(it.recordedUnitPrice)}
                        </td>
                        <td className="py-3 text-[#127A4B]">
                          {it.recordedDiscountAmount > 0
                            ? formatToman(it.recordedDiscountAmount)
                            : "—"}
                        </td>
                        <td className="py-3 text-left font-bold text-[#080707]">
                          {formatToman(it.recordedLineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Summary */}
              <div className="mt-4 rounded-xl bg-[#FAFAFE] border border-[#EFEFF5] p-4 space-y-2 text-xs">
                <div className="flex justify-between text-[#626775]">
                  <span>جمع ناخالص اقلام:</span>
                  <span>{formatToman(order.subtotalAmount)}</span>
                </div>
                <div className="flex justify-between text-[#127A4B]">
                  <span>تخفیف ثبت‌شده سفارش:</span>
                  <span>
                    {order.discountAmount > 0
                      ? `${formatToman(order.discountAmount)} -`
                      : "۰ تومان"}
                  </span>
                </div>
                <div className="flex justify-between text-[#626775]">
                  <span>هزینه ارسال ({order.shippingMethod}):</span>
                  <span>
                    {order.shippingAmount > 0
                      ? formatToman(order.shippingAmount)
                      : "رایگان"}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#E5E7EB] pt-2 text-sm font-bold text-[#080707]">
                  <span>مبلغ نهایی قابل پرداخت ({order.currencyUnit}):</span>
                  <span className="text-[#1813FB]">
                    {formatToman(order.totalAmount)}
                  </span>
                </div>
              </div>
            </section>

            {/* Activity Timeline */}
            <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
              <div className="flex items-center gap-2 border-b border-[#EFEFF5] pb-3">
                <Clock className="h-4 w-4 text-[#1813FB]" />
                <h2 className="text-sm font-semibold text-[#080707]">
                  تاریخچه رویدادها و پیگیری عملیات سفارش
                </h2>
              </div>

              <div className="mt-4 space-y-3">
                {events.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] p-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-[#080707]">
                        {ev.title}
                      </div>
                      <p className="mt-0.5 text-[#4B505E]">{ev.description}</p>
                      <span className="mt-1 inline-block text-[10px] text-[#626775]">
                        ثبت توسط: {ev.actorName}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#626775] whitespace-nowrap">
                      {formatJalaliDateTime(ev.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right 4 Cols: Customer, Iranian Address, Payment & Shipment Handoff */}
          <div className="space-y-5 lg:col-span-4">
            {/* Payment & Verification Card */}
            <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-[#1813FB]" />
                  <h2 className="text-sm font-semibold text-[#080707]">
                    وضعیت پرداخت و تراکنش
                  </h2>
                </div>
                {payB && <StatusBadge label={payB.label} tone={payB.tone} />}
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#626775]">درگاه پرداخت:</span>
                  <span className="font-medium uppercase">
                    <bdi dir="ltr">{order.paymentGateway}</bdi>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#626775]">کد پیگیری بانکی:</span>
                  <span className="font-mono font-semibold">
                    <bdi dir="ltr">{order.paymentRef || "ثبت‌نشده"}</bdi>
                  </span>
                </div>
              </div>

              {order.paymentStatus !== "verified_paid" && (
                <div className="pt-2 border-t border-[#EFEFF5]">
                  <button
                    type="button"
                    onClick={() =>
                      runOrderAction({ action: "continue_payment" })
                    }
                    className="h-9 w-full rounded-xl bg-[#127A4B] px-3 text-xs font-medium text-white hover:bg-[#0E603B]"
                  >
                    استعلام و تایید پرداخت روی همین سفارش
                  </button>
                  <p className="mt-1 text-[10px] text-[#626775]">
                    پرداخت روی همین سفارش تکمیل می‌شود و سفارش تکراری ایجاد
                    نمی‌گردد.
                  </p>
                </div>
              )}
            </section>

            {/* Recipient & Iranian Address */}
            <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-2.5 text-xs">
              <div className="flex items-center gap-2 border-b border-[#EFEFF5] pb-2.5">
                <MapPin className="h-4 w-4 text-[#1813FB]" />
                <h2 className="text-sm font-semibold text-[#080707]">
                  اطلاعات گیرنده و نشانی ارسال
                </h2>
              </div>
              <div>
                <span className="text-[#626775]">گیرنده: </span>
                <strong className="text-[#080707]">
                  {order.recipientName}
                </strong>
              </div>
              <div>
                <span className="text-[#626775]">شماره تماس: </span>
                <span className="font-mono font-medium">
                  <bdi dir="ltr">{order.customerPhone}</bdi>
                </span>
              </div>
              <div>
                <span className="text-[#626775]">استان و شهر: </span>
                <span>
                  {order.shippingProvince}، {order.shippingCity}
                </span>
              </div>
              <p className="rounded-xl bg-[#FAFAFE] p-2.5 text-[#344054] leading-relaxed">
                {order.shippingAddress}
              </p>
              {order.postalCode && (
                <div>
                  <span className="text-[#626775]">کد پستی: </span>
                  <span className="font-mono">
                    <bdi dir="ltr">{order.postalCode}</bdi>
                  </span>
                </div>
              )}
            </section>

            {/* Shipment Handoff & Tracking (Distinct from Confirmed Delivery!) */}
            <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-3 text-xs">
              <div className="flex items-center gap-2 border-b border-[#EFEFF5] pb-2.5">
                <Truck className="h-4 w-4 text-[#1813FB]" />
                <h2 className="text-sm font-semibold text-[#080707]">
                  تحویل به حمل‌ونقل و رهگیری مرسوله
                </h2>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#626775] mb-1">
                  شرکت حمل‌ونقل / پیک
                </label>
                <input
                  type="text"
                  value={carrierInput}
                  onChange={(e) => setCarrierInput(e.target.value)}
                  className="h-9 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#626775] mb-1">
                  کد رهگیری مرسوله (بارکد پستی)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={trackingInput}
                  onChange={(e) => setTrackingInput(e.target.value)}
                  placeholder="19482000481928374612"
                  className="h-9 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
                />
              </div>

              <button
                type="button"
                onClick={() =>
                  runOrderAction({
                    action: "ship_handoff",
                    carrierName: carrierInput,
                    trackingCode: trackingInput,
                  })
                }
                className="h-9 w-full rounded-xl bg-[#1813FB] px-3 font-medium text-white hover:bg-[#110CD1]"
              >
                ثبت کد رهگیری و تحویل به پست (ارسال‌شده)
              </button>

              {order.operationalStatus === "shipped" && (
                <button
                  type="button"
                  onClick={() =>
                    runOrderAction({ action: "confirm_delivery" })
                  }
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#A6F4C5] bg-[#ECFDF3] px-3 font-semibold text-[#127A4B]"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span>ثبت تایید تحویل نهایی به گیرنده</span>
                </button>
              )}

              <p className="text-[10px] text-[#626775] leading-relaxed">
                ثبت کد رهگیری به معنای تحویل مرسوله به شرکت حمل است و وضعیت
                «تحویل نهایی به مشتری» فقط پس از تایید رسید گیرنده ثبت می‌شود.
              </p>
            </section>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
