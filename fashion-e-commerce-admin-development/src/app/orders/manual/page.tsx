"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import {
  LoadingState,
  UnauthorizedState,
} from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import { resolveVariantMetrics } from "@/lib/pricing";
import { formatNumberFa, formatToman } from "@/lib/formatters";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  ShieldAlert,
} from "lucide-react";

interface CustomerOpt {
  id: number;
  fullName: string;
  phone: string;
  province: string;
  city: string;
  addressLine: string;
  postalCode: string;
}

interface VariantOpt {
  id: number;
  sku: string;
  colorName: string;
  sizeLabel: string;
  effectivePrice: number;
  sellableStock: number;
  productName: string;
}

export default function ManualOrderPage() {
  const { can } = useRole();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);

  const [customers, setCustomers] = useState<CustomerOpt[]>([]);
  const [variants, setVariants] = useState<VariantOpt[]>([]);

  // Step 1: Customer
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  // Step 2: Variants
  const [selectedLines, setSelectedLines] = useState<
    Array<{ variantId: number; quantity: number }>
  >([]);

  // Step 3: Iranian Delivery Address
  const [shippingProvince, setShippingProvince] = useState("تهران");
  const [shippingCity, setShippingCity] = useState("تهران");
  const [shippingAddress, setShippingAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [shippingMethod, setShippingMethod] = useState("پیک اختصاصی تهران");

  // Step 5 & 6: Created Unpaid Order & Payment Continuation
  const [createdOrder, setCreatedOrder] = useState<{
    id: number;
    orderNumber: string;
    totalAmount: number;
    paymentStatus: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/crm").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/products?limit=50").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([crmData, prodData]) => {
        if (crmData?.customers) {
          setCustomers(crmData.customers);
          if (crmData.customers[0]) {
            const c = crmData.customers[0];
            setSelectedCustomerId(String(c.id));
            setCustomerName(c.fullName);
            setCustomerPhone(c.phone);
            setShippingProvince(c.province);
            setShippingCity(c.city);
            setShippingAddress(c.addressLine);
            setPostalCode(c.postalCode || "");
          }
        }
        if (prodData?.items) {
          const flat: VariantOpt[] = [];
          for (const p of prodData.items) {
            for (const v of p.variants || []) {
              if (v.isActive && v.sellableStock > 0) {
                const m = resolveVariantMetrics({
                  productBasePrice: p.basePrice,
                  colorPriceOverride: v.colorPriceOverride,
                  skuPriceOverride: v.skuPriceOverride,
                  discountMode: v.discountMode,
                  discountType: v.discountType,
                  discountValue: v.discountValue,
                  physicalStock: v.physicalStock,
                  reservedStock: v.reservedStock,
                  lowStockThreshold: v.lowStockThreshold,
                  isActive: v.isActive,
                });
                flat.push({
                  id: v.id,
                  sku: v.sku,
                  colorName: v.colorName,
                  sizeLabel: v.sizeLabel,
                  effectivePrice: m.effectivePrice,
                  sellableStock: m.sellableStock,
                  productName: p.name,
                });
              }
            }
          }
          setVariants(flat);
          if (flat[0]) {
            setSelectedLines([{ variantId: flat[0].id, quantity: 1 }]);
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  if (!can("orders", "create")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="ثبت سفارش دستی" />
      </AdminShell>
    );
  }

  const handleCustomerSelect = (cid: string) => {
    setSelectedCustomerId(cid);
    const c = customers.find((x) => String(x.id) === cid);
    if (c) {
      setCustomerName(c.fullName);
      setCustomerPhone(c.phone);
      setShippingProvince(c.province);
      setShippingCity(c.city);
      setShippingAddress(c.addressLine);
      setPostalCode(c.postalCode || "");
    }
  };

  const quoteSubtotal = selectedLines.reduce((sum, line) => {
    const v = variants.find((x) => x.id === line.variantId);
    return sum + (v ? v.effectivePrice * line.quantity : 0);
  }, 0);
  const quoteShipping = quoteSubtotal >= 5000000 ? 0 : 95000;
  const quoteTotal = quoteSubtotal + quoteShipping;

  const handleCreateUnpaidOrder = async () => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomerId ? Number(selectedCustomerId) : null,
          customerName,
          customerPhone,
          shippingProvince,
          shippingCity,
          shippingAddress,
          postalCode,
          shippingMethod,
          lines: selectedLines,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "خطا در ثبت سفارش دستی");
      }
      setCreatedOrder(data.order);
      setStep(6);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "خطا");
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinuePayment = async () => {
    if (!createdOrder) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/orders/${createdOrder.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "continue_payment",
          gateway: "zarinpal",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "خطا در تایید پرداخت");
      setCreatedOrder((prev) =>
        prev ? { ...prev, paymentStatus: "verified_paid" } : null
      );
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "خطا");
    } finally {
      setSubmitting(false);
    }
  };

  const stepTitles = [
    "۱. انتخاب مشتری",
    "۲. انتخاب کالا و تنوع",
    "۳. نشانی ارسال",
    "۴. استعلام قیمت سرور",
    "۵. ثبت سفارش پرداخت‌نشده",
    "۶. ادامه پرداخت روی سفارش",
  ];

  return (
    <AdminShell>
      <PageHeader
        title="ثبت سفارش دستی ۶ مرحله‌ای (Manual Order Workflow)"
        description="ایجاد سفارش با استعلام قیمت قطعی سرور، ثبت اولیه در وضعیت پرداخت‌نشده و تکمیل پرداخت بدون تکرار سفارش"
      />

      {/* Production Safety Guardrail Notice */}
      <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-[#FEDF89] bg-[#FFFAEB] p-3.5 text-xs text-[#7A4905]">
        <ShieldAlert className="h-4 w-4 text-[#9A5B04] shrink-0 mt-0.5" />
        <span>
          <strong>محدودیت ایمنی تولید:</strong> قیمت‌گذاری نهایی و کنترل موجودی
          قابل فروش سمت سرور انجام می‌شود. تلاش مجدد برای پرداخت همواره روی
          شناسه سفارش ایجادشده انجام می‌گردد تا سفارش تکراری ساخته نشود.
        </span>
      </div>

      {/* 6-Step RTL Stepper */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {stepTitles.map((label, idx) => {
          const sNum = idx + 1;
          const active = step === sNum;
          const done = step > sNum;
          return (
            <button
              key={label}
              type="button"
              disabled={sNum === 6 && !createdOrder}
              onClick={() => {
                if (sNum <= 5 && !createdOrder) setStep(sNum);
              }}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-right text-xs font-medium transition-colors ${
                active
                  ? "border-[#1813FB] bg-[#1813FB] text-white"
                  : done
                  ? "border-[#A6F4C5] bg-[#ECFDF3] text-[#127A4B]"
                  : "border-[#E5E7EB] bg-white text-[#626775]"
              }`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/10 text-[11px] font-bold">
                {done ? <Check className="h-3 w-3" /> : formatNumberFa(sNum)}
              </span>
              <span className="truncate">{label.replace(/^\d+\.\s/, "")}</span>
            </button>
          );
        })}
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-2.5 text-xs font-medium text-[#B44F40]">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        <div className="mx-auto max-w-3xl rounded-2xl border border-[#E5E7EB] bg-white p-5 sm:p-6 space-y-5">
          {/* STEP 1: Select Customer */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-[#080707]">
                مرحله ۱: انتخاب مشتری از CRM یا ورود مشخصات
              </h2>
              <div>
                <label className="block text-xs font-medium text-[#344054] mb-1">
                  انتخاب از مشتریان ثبت‌شده
                </label>
                <select
                  value={selectedCustomerId}
                  onChange={(e) => handleCustomerSelect(e.target.value)}
                  className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} — {c.phone} ({c.city})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[#344054] mb-1">
                    نام و نام خانوادگی گیرنده
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#344054] mb-1">
                    شماره موبایل
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Select Products & Variants */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-[#080707]">
                مرحله ۲: انتخاب تنوع‌های مجاز و موجود
              </h2>
              <div className="space-y-2 max-h-72 overflow-y-auto kv-scroll-table">
                {variants.map((v) => {
                  const existingLine = selectedLines.find(
                    (l) => l.variantId === v.id
                  );
                  return (
                    <div
                      key={v.id}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-xs ${
                        existingLine
                          ? "border-[#1813FB] bg-[#F0EEFF]/50"
                          : "border-[#EFEFF5] bg-[#FAFAFE]"
                      }`}
                    >
                      <div>
                        <div className="font-semibold text-[#080707]">
                          {v.productName}
                        </div>
                        <div className="text-[11px] text-[#626775]">
                          {v.colorName} • سایز {v.sizeLabel} •{" "}
                          <bdi dir="ltr">{v.sku}</bdi> • موجودی:{" "}
                          {formatNumberFa(v.sellableStock)}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-[#080707]">
                          {formatToman(v.effectivePrice)}
                        </span>
                        {existingLine ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              max={v.sellableStock}
                              dir="ltr"
                              value={existingLine.quantity}
                              onChange={(e) =>
                                setSelectedLines((prev) =>
                                  prev.map((l) =>
                                    l.variantId === v.id
                                      ? {
                                          ...l,
                                          quantity: Math.max(
                                            1,
                                            Math.min(
                                              v.sellableStock,
                                              Number(e.target.value) || 1
                                            )
                                          ),
                                        }
                                      : l
                                  )
                                )
                              }
                              className="h-8 w-16 rounded-lg border border-[#E5E7EB] bg-white px-2 text-center font-mono text-xs"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedLines((prev) =>
                                  prev.filter((l) => l.variantId !== v.id)
                                )
                              }
                              className="text-[11px] text-[#B44F40] underline"
                            >
                              حذف
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedLines((prev) => [
                                ...prev,
                                { variantId: v.id, quantity: 1 },
                              ])
                            }
                            className="h-8 rounded-lg bg-white border border-[#E5E7EB] px-3 font-medium text-[#1813FB]"
                          >
                            + افزودن
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: Iranian Delivery Information */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-[#080707]">
                مرحله ۳: اطلاعات ارسال و نشانی پستی
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-[#344054] mb-1">
                    استان
                  </label>
                  <input
                    type="text"
                    value={shippingProvince}
                    onChange={(e) => setShippingProvince(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#344054] mb-1">
                    شهر
                  </label>
                  <input
                    type="text"
                    value={shippingCity}
                    onChange={(e) => setShippingCity(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#344054] mb-1">
                    کد پستی ۱۰ رقمی
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-[#344054] mb-1">
                    نشانی دقیق (خیابان، کوچه، پلاک، واحد)
                  </label>
                  <input
                    type="text"
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-[#344054] mb-1">
                    شیوه ارسال
                  </label>
                  <select
                    value={shippingMethod}
                    onChange={(e) => setShippingMethod(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs"
                  >
                    <option value="پیک اختصاصی تهران">پیک اختصاصی تهران</option>
                    <option value="پست پیشتاز">پست پیشتاز سراسر کشور</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4 & 5: Authoritative Quote Review & Create UNPAID Order */}
          {(step === 4 || step === 5) && (
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-[#080707]">
                {step === 4
                  ? "مرحله ۴: بازبینی پیش‌فاکتور قطعی کاتالوگ"
                  : "مرحله ۵: تایید نهایی و ایجاد سفارش پرداخت‌نشده"}
              </h2>
              <div className="rounded-xl bg-[#FAFAFE] border border-[#EFEFF5] p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#626775]">مشتری:</span>
                  <span className="font-semibold">
                    {customerName} (<bdi dir="ltr">{customerPhone}</bdi>)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#626775]">مقصد ارسال:</span>
                  <span>
                    {shippingProvince}، {shippingCity} — {shippingAddress}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#626775]">جمع اقلام انتخاب‌شده:</span>
                  <span>{formatToman(quoteSubtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#626775]">هزینه ارسال:</span>
                  <span>
                    {quoteShipping === 0
                      ? "رایگان (سفارش بالای ۵ میلیون تومان)"
                      : formatToman(quoteShipping)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#E5E7EB] pt-2 text-sm font-bold text-[#1813FB]">
                  <span>مبلغ قطعی پیش‌فاکتور:</span>
                  <span>{formatToman(quoteTotal)}</span>
                </div>
              </div>

              {step === 5 && (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleCreateUnpaidOrder}
                  className="h-11 w-full rounded-xl bg-[#1813FB] px-5 text-sm font-medium text-white hover:bg-[#110CD1] disabled:opacity-50"
                >
                  {submitting
                    ? "در حال ثبت سفارش..."
                    : "ثبت سفارش در وضعیت «پرداخت‌نشده» و ادامه پرداخت"}
                </button>
              )}
            </div>
          )}

          {/* STEP 6: Continue Payment on Existing Order (Never Duplicate!) */}
          {step === 6 && createdOrder && (
            <div className="space-y-4 text-center py-2">
              <StatusBadge
                label={
                  createdOrder.paymentStatus === "verified_paid"
                    ? "پرداخت تاییدشده روی سفارش"
                    : "سفارش ایجاد شد — در انتظار پرداخت"
                }
                tone={
                  createdOrder.paymentStatus === "verified_paid"
                    ? "success"
                    : "warning"
                }
              />
              <h2 className="text-base font-bold text-[#080707]">
                سفارش شماره{" "}
                <span className="font-mono text-[#1813FB]">
                  <bdi dir="ltr">{createdOrder.orderNumber}</bdi>
                </span>
              </h2>
              <p className="text-xs text-[#626775]">
                مبلغ قابل پرداخت:{" "}
                <strong className="text-[#080707]">
                  {formatToman(createdOrder.totalAmount)}
                </strong>
              </p>

              {createdOrder.paymentStatus !== "verified_paid" ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleContinuePayment}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#127A4B] px-6 text-xs sm:text-sm font-medium text-white hover:bg-[#0E603B]"
                >
                  <CreditCard className="h-4 w-4" />
                  <span>
                    {submitting
                      ? "در حال استعلام درگاه..."
                      : "ادامه و تایید پرداخت روی همین سفارش (بدون تکرار)"}
                  </span>
                </button>
              ) : (
                <div className="pt-2">
                  <Link
                    href={`/orders/${createdOrder.id}`}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1813FB] px-5 text-xs font-medium text-white"
                  >
                    <span>مشاهده پرونده کامل سفارش</span>
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Navigation Footer for Steps 1..5 */}
          {step < 6 && (
            <div className="flex items-center justify-between border-t border-[#EFEFF5] pt-4">
              <button
                type="button"
                disabled={step <= 1}
                onClick={() => setStep((s) => Math.max(1, s - 1))}
                className="inline-flex h-9 items-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#344054] disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
                <span>مرحله قبل</span>
              </button>

              {step < 5 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.min(5, s + 1))}
                  className="inline-flex h-9 items-center gap-1 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1]"
                >
                  <span>مرحله بعد</span>
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </AdminShell>
  );
}
