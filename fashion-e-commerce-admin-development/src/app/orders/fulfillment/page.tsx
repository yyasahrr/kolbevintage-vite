"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import {
  StatusBadge,
  getOrderStatusBadge,
} from "@/components/admin/ui/StatusBadge";
import {
  LoadingState,
  UnauthorizedState,
} from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import { formatNumberFa } from "@/lib/formatters";
import {
  ScanBarcode,
  PackageCheck,
  Truck,
  AlertTriangle,
  CheckCircle2,
  Printer,
} from "lucide-react";

interface FulfillmentItem {
  id: number;
  productName: string;
  colorName: string;
  sizeLabel: string;
  sku: string;
  quantity: number;
  pickedQuantity: number;
  packedQuantity: number;
}

interface FulfillmentOrder {
  id: number;
  orderNumber: string;
  customerName: string;
  shippingCity: string;
  paymentStatus: string;
  operationalStatus: string;
  shippingMethod: string;
  carrierName: string;
  trackingCode: string;
  items: FulfillmentItem[];
}

function FulfillmentContent() {
  const searchParams = useSearchParams();
  const { can } = useRole();

  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number>(
    Number(searchParams.get("orderId") || "0") || 0
  );
  const [loading, setLoading] = useState(true);

  const [barcodeInput, setBarcodeInput] = useState("");
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);
  const [wrongSkuAlert, setWrongSkuAlert] = useState<string | null>(null);
  const [trackingCode, setTrackingCode] = useState("");

  const loadQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/orders", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const list: FulfillmentOrder[] = data.orders || [];
        setOrders(list);
        if (!selectedOrderId && list[0]) {
          setSelectedOrderId(list[0].id);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [selectedOrderId]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  if (!can("orders", "view") && !can("inventory", "edit")) {
    return <UnauthorizedState moduleTitle="ایستگاه برداشت، بسته‌بندی و ارسال" />;
  }

  const activeOrder =
    orders.find((o) => o.id === selectedOrderId) || orders[0] || null;

  const handleScanSku = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder || !barcodeInput.trim()) return;
    setScanSuccess(null);
    setWrongSkuAlert(null);

    const res = await fetch(`/api/orders/${activeOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "scan_pick",
        sku: barcodeInput.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setWrongSkuAlert(data?.error || "بارکد اسکن‌شده نامعتبر است!");
    } else {
      setScanSuccess(`بارکد ${data.scannedSku} با موفقیت اسکن و تایید شد.`);
      setBarcodeInput("");
      loadQueue();
    }
  };

  const handlePackVerify = async () => {
    if (!activeOrder) return;
    setScanSuccess(null);
    setWrongSkuAlert(null);
    const res = await fetch(`/api/orders/${activeOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pack_verify" }),
    });
    const data = await res.json();
    if (!res.ok) {
      setWrongSkuAlert(data?.error || "خطا در تایید بسته‌بندی");
    } else {
      setScanSuccess("بسته‌بندی مرسوله تایید شد و سفارش آماده ارسال است.");
      loadQueue();
    }
  };

  const handleShipHandoff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder) return;
    setScanSuccess(null);
    setWrongSkuAlert(null);
    const res = await fetch(`/api/orders/${activeOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "ship_handoff",
        trackingCode: trackingCode.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setWrongSkuAlert(data?.error || "خطا در ثبت کد رهگیری");
    } else {
      setScanSuccess(
        `مرسوله با کد رهگیری ${data.trackingCode} به شرکت حمل تحویل داده شد (در انتظار تحویل نهایی به گیرنده).`
      );
      setTrackingCode("");
      loadQueue();
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="ایستگاه عملیات انبار: برداشت (Picking)، بسته‌بندی و تحویل به پست"
        description="اسکن بارکد SKU برای جلوگیری از ارسال کالای اشتباه، کنترل بسته‌بندی و ثبت کد رهگیری ارسال"
        secondaryActions={
          activeOrder ? (
            <Link
              href={`/orders/print?ids=${activeOrder.id}`}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#080707]"
            >
              <Printer className="h-4 w-4 text-[#1813FB]" />
              <span>چاپ برچسب ارسال و برگ بسته‌بندی</span>
            </Link>
          ) : undefined
        }
      />

      {loading ? (
        <LoadingState />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Order Queue Sidebar */}
          <div className="rounded-2xl border border-[#E5E7EB] bg-white p-3.5 lg:col-span-4 space-y-2 h-fit">
            <h2 className="px-1 text-xs font-semibold text-[#626775]">
              انتخاب سفارش از صف عملیات ({formatNumberFa(orders.length)})
            </h2>
            <div className="space-y-1.5 max-h-[520px] overflow-y-auto kv-scroll-table">
              {orders.map((ord) => {
                const selected = activeOrder?.id === ord.id;
                const badge = getOrderStatusBadge(ord.operationalStatus);
                return (
                  <button
                    key={ord.id}
                    type="button"
                    onClick={() => {
                      setSelectedOrderId(ord.id);
                      setWrongSkuAlert(null);
                      setScanSuccess(null);
                    }}
                    className={`w-full rounded-xl border p-3 text-right text-xs transition-colors ${
                      selected
                        ? "border-[#1813FB] bg-[#F0EEFF]"
                        : "border-[#EFEFF5] bg-[#FAFAFE] hover:border-[#C1BCF2]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-[#1813FB]">
                        <bdi dir="ltr">{ord.orderNumber}</bdi>
                      </span>
                      <StatusBadge label={badge.label} tone={badge.tone} />
                    </div>
                    <div className="mt-1 font-medium text-[#080707]">
                      {ord.customerName} — {ord.shippingCity}
                    </div>
                    <div className="mt-0.5 text-[11px] text-[#626775]">
                      {formatNumberFa(ord.items.length)} قلم کالا
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Order Picking / Packing / Shipping Station */}
          {activeOrder && (
            <div className="space-y-4 lg:col-span-8">
              {wrongSkuAlert && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-2xl border-2 border-[#B44F40] bg-[#FEF3F2] p-4 text-xs font-semibold text-[#8A3427]"
                >
                  <AlertTriangle className="h-5 w-5 text-[#B44F40] shrink-0" />
                  <span>{wrongSkuAlert}</span>
                </div>
              )}

              {scanSuccess && (
                <div className="flex items-center gap-2 rounded-2xl border border-[#A6F4C5] bg-[#ECFDF3] p-3.5 text-xs font-medium text-[#127A4B]">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{scanSuccess}</span>
                </div>
              )}

              {/* Step A: SKU Barcode Scanner for Picking */}
              <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFEFF5] pb-3">
                  <div className="flex items-center gap-2">
                    <ScanBarcode className="h-5 w-5 text-[#1813FB]" />
                    <div>
                      <h3 className="text-sm font-semibold text-[#080707]">
                        مرحله ۱: اسکن بارکد SKU برای برداشت سفارش{" "}
                        <bdi dir="ltr">{activeOrder.orderNumber}</bdi>
                      </h3>
                      <p className="text-[11px] text-[#626775]">
                        بارکد هر کالا را اسکن کنید؛ اسکن کد اشتباه بلافاصله
                        هشدار خطا می‌دهد.
                      </p>
                    </div>
                  </div>
                  <StatusBadge
                    label={
                      getOrderStatusBadge(activeOrder.operationalStatus).label
                    }
                    tone={
                      getOrderStatusBadge(activeOrder.operationalStatus).tone
                    }
                  />
                </div>

                <form onSubmit={handleScanSku} className="flex gap-2">
                  <input
                    type="text"
                    dir="ltr"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="بارکد یا کد SKU را اسکن یا تایپ کنید (مثال: KV-1043-CRM-M)"
                    aria-label="ورود بارکد SKU"
                    className="h-10 flex-1 rounded-xl border border-[#E5E7EB] bg-[#FAFAFE] px-3.5 text-left font-mono text-xs focus:border-[#1813FB] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="h-10 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1]"
                  >
                    تایید اسکن بارکد
                  </button>
                </form>

                {/* Picking Items Checklist */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-right text-xs">
                    <thead>
                      <tr className="border-b border-[#EFEFF5] text-[11px] text-[#626775]">
                        <th className="py-2 font-medium">محصول و رنگ/سایز</th>
                        <th className="py-2 font-medium">کد SKU</th>
                        <th className="py-2 font-medium">تعداد مورد نیاز</th>
                        <th className="py-2 font-medium">اسکن‌شده</th>
                        <th className="py-2 font-medium">باقیمانده</th>
                        <th className="py-2 font-medium text-left">وضعیت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFEFF5]">
                      {activeOrder.items.map((it) => {
                        const remaining = Math.max(
                          0,
                          it.quantity - it.pickedQuantity
                        );
                        const done = remaining === 0;
                        return (
                          <tr key={it.id}>
                            <td className="py-2.5">
                              <div className="font-semibold text-[#080707]">
                                {it.productName}
                              </div>
                              <div className="text-[11px] text-[#626775]">
                                {it.colorName} • سایز {it.sizeLabel}
                              </div>
                            </td>
                            <td className="py-2.5 font-mono text-xs">
                              <button
                                type="button"
                                title="کلیک برای کپی در فیلد اسکن"
                                onClick={() => setBarcodeInput(it.sku)}
                                className="rounded bg-[#F7F7FB] px-2 py-0.5 hover:bg-[#F0EEFF] hover:text-[#1813FB]"
                              >
                                <bdi dir="ltr">{it.sku}</bdi>
                              </button>
                            </td>
                            <td className="py-2.5 font-semibold">
                              {formatNumberFa(it.quantity)}
                            </td>
                            <td className="py-2.5 text-[#127A4B] font-semibold">
                              {formatNumberFa(it.pickedQuantity)}
                            </td>
                            <td className="py-2.5 font-bold">
                              {formatNumberFa(remaining)}
                            </td>
                            <td className="py-2.5 text-left">
                              {done ? (
                                <StatusBadge
                                  label="برداشت کامل"
                                  tone="success"
                                />
                              ) : (
                                <StatusBadge
                                  label="در انتظار اسکن"
                                  tone="warning"
                                />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Step B: Packing Verification & Shipment Handoff */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-[#1813FB]" />
                    <h3 className="text-sm font-semibold text-[#080707]">
                      مرحله ۲: کنترل و تایید بسته‌بندی
                    </h3>
                  </div>
                  <p className="text-xs text-[#626775]">
                    پس از اسکن تمامی اقلام سفارش، پلمب کارتن و تطابق برگه
                    بسته‌بندی را تایید کنید.
                  </p>
                  <button
                    type="button"
                    onClick={handlePackVerify}
                    className="h-10 w-full rounded-xl bg-[#F0EEFF] px-4 text-xs font-semibold text-[#1813FB] hover:bg-[#E4E1FF]"
                  >
                    تایید تکمیل بسته‌بندی (آماده ارسال)
                  </button>
                </section>

                <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-[#1813FB]" />
                    <h3 className="text-sm font-semibold text-[#080707]">
                      مرحله ۳: ثبت کد رهگیری و تحویل به حمل
                    </h3>
                  </div>
                  <form onSubmit={handleShipHandoff} className="space-y-2.5">
                    <input
                      type="text"
                      dir="ltr"
                      value={trackingCode}
                      onChange={(e) => setTrackingCode(e.target.value)}
                      placeholder="کد رهگیری پستی ۲۰ رقمی..."
                      className="h-9 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
                    />
                    <button
                      type="submit"
                      className="h-10 w-full rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1]"
                    >
                      ثبت کد رهگیری و تحویل به شرکت حمل
                    </button>
                  </form>
                </section>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FulfillmentPage() {
  return (
    <AdminShell>
      <Suspense fallback={<LoadingState />}>
        <FulfillmentContent />
      </Suspense>
    </AdminShell>
  );
}
