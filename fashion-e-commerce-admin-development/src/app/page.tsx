"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
import { formatJalaliDateTime, formatNumberFa, formatToman } from "@/lib/formatters";
import {
  ShoppingBag,
  PackageCheck,
  ScanBarcode,
  Truck,
  AlertOctagon,
  RotateCcw,
  AlertTriangle,
  ShieldAlert,
  Plus,
  Printer,
  ArrowUpLeft,
  CheckCircle2,
  Clock,
} from "lucide-react";

interface DashboardData {
  kpis: {
    newOrdersCount: number;
    awaitingPrepCount: number;
    pickingPackingCount: number;
    readyToShipCount: number;
    shippingExceptionsCount: number;
    returnsActionCount: number;
    lowStockAlertsCount: number;
    financialExceptionsCount: number;
    pendingAdjustmentsCount: number;
    activeCampaignsCount: number;
  };
  salesOverview: {
    currencyUnit: string;
    recordedOrderValue: number;
    verifiedPaidValue: number;
    pendingVerificationValue: number;
    confirmedRefundsValue: number;
    totalOrdersCount: number;
    verifiedPaidOrdersCount: number;
    contractNote: string;
  };
  skuAlerts: Array<{
    variantId: number;
    productId: number;
    productName: string;
    colorName: string;
    colorHex: string;
    sizeLabel: string;
    sku: string;
    physicalStock: number;
    reservedStock: number;
    sellableStock: number;
    threshold: number;
    isLowStock: boolean;
    isOutOfStock: boolean;
  }>;
  recentOrders: Array<{
    id: number;
    orderNumber: string;
    customerName: string;
    shippingCity: string;
    totalAmount: number;
    paymentStatus: string;
    operationalStatus: string;
    createdAt: string;
  }>;
  recentEvents: Array<{
    id: number;
    orderId: number;
    title: string;
    description: string;
    actorName: string;
    createdAt: string;
  }>;
}

export default function DashboardPage() {
  const { can } = useRole();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "خطا در بارگذاری داشبورد");
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای ناشناخته");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (!can("dashboard", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="داشبورد عملیات" />
      </AdminShell>
    );
  }

  const kpiCards = data
    ? [
        {
          label: "سفارش‌های جدید",
          value: data.kpis.newOrdersCount,
          href: "/orders?status=new",
          icon: ShoppingBag,
          tone: "indigo" as const,
        },
        {
          label: "در انتظار آماده‌سازی",
          value: data.kpis.awaitingPrepCount,
          href: "/orders?status=awaiting_prep",
          icon: Clock,
          tone: "warning" as const,
        },
        {
          label: "صف برداشت و بسته‌بندی",
          value: data.kpis.pickingPackingCount,
          href: "/orders/fulfillment",
          icon: ScanBarcode,
          tone: "indigo" as const,
        },
        {
          label: "آماده ارسال",
          value: data.kpis.readyToShipCount,
          href: "/orders?status=ready_to_ship",
          icon: PackageCheck,
          tone: "success" as const,
        },
        {
          label: "مغایرت‌های ارسال",
          value: data.kpis.shippingExceptionsCount,
          href: "/orders?status=exception",
          icon: AlertOctagon,
          tone: "danger" as const,
        },
        {
          label: "مرجوعی نیازمند اقدام",
          value: data.kpis.returnsActionCount,
          href: "/returns",
          icon: RotateCcw,
          tone: "warning" as const,
        },
        {
          label: "هشدار کم‌موجودی SKU",
          value: data.kpis.lowStockAlertsCount,
          href: "/inventory",
          icon: AlertTriangle,
          tone: "warning" as const,
        },
        {
          label: "مغایرت‌های مالی / استعلام",
          value: data.kpis.financialExceptionsCount,
          href: "/finance",
          icon: ShieldAlert,
          tone: "danger" as const,
        },
      ]
    : [];

  const totalSalesBase = Math.max(
    1,
    data?.salesOverview.recordedOrderValue ?? 1
  );
  const verifiedPct = data
    ? Math.round((data.salesOverview.verifiedPaidValue / totalSalesBase) * 100)
    : 0;
  const pendingPct = data
    ? Math.round(
        (data.salesOverview.pendingVerificationValue / totalSalesBase) * 100
      )
    : 0;

  return (
    <AdminShell>
      <PageHeader
        title="داشبورد عملیات کلبه وینتیج"
        description="نمای لحظه‌ای وضعیت سفارش‌ها، موجودی انبار، مغایرت‌های پرداخت و شاخص‌های تاییدشده فروشگاه"
        badge={
          <StatusBadge
            label="متصل به پایگاه‌داده زنده"
            tone="indigo"
          />
        }
        primaryAction={
          can("catalog", "create") ? (
            <Link
              href="/products/new"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1813FB] px-4 text-xs sm:text-sm font-medium text-white hover:bg-[#110CD1] transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>افزودن سریع محصول</span>
            </Link>
          ) : undefined
        }
        secondaryActions={
          <Link
            href="/orders/print"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs sm:text-sm font-medium text-[#080707] hover:bg-[#F7F7FB]"
          >
            <Printer className="h-4 w-4 text-[#626775]" />
            <span>چاپ اسناد ارسال</span>
          </Link>
        }
      />

      {loading && <LoadingState label="در حال جمع‌آوری شاخص‌های عملیاتی..." />}
      {error && <ErrorState message={error} onRetry={loadDashboard} />}

      {!loading && !error && data && (
        <div className="space-y-6">
          {/* A. Operational KPIs Grid (8 Real Operational Metrics) */}
          <section aria-label="شاخص‌های کلیدی عملیات">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-4">
              {kpiCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Link
                    key={card.label}
                    href={card.href}
                    className="group rounded-2xl border border-[#E5E7EB] bg-white p-4 transition-all hover:border-[#C1BCF2] hover:shadow-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[#626775] group-hover:text-[#080707]">
                        {card.label}
                      </span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#F7F7FB] text-[#1813FB] group-hover:bg-[#F0EEFF]">
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="mt-3 flex items-baseline justify-between">
                      <span className="text-2xl font-bold text-[#080707]">
                        {formatNumberFa(card.value)}
                      </span>
                      <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-[#1813FB] opacity-80 group-hover:opacity-100">
                        <span>بررسی</span>
                        <ArrowUpLeft className="h-3 w-3" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* B. Sales Overview (Verified Metrics Only) + E. Quick Actions */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-8">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFEFF5] pb-3.5">
                <div>
                  <h2 className="text-base font-semibold text-[#080707]">
                    گزارش وضعیت فروش و پرداخت‌های تاییدشده
                  </h2>
                  <p className="mt-0.5 text-xs text-[#626775]">
                    تفکیک دقیق سفارش‌های ثبت‌شده، واریزی‌های تاییدشده بانکی و
                    تراکنش‌های در انتظار استعلام
                  </p>
                </div>
                <StatusBadge label="واحد پول: تومان (IRT)" tone="neutral" />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl bg-[#F7F7FB] p-3.5 border border-[#EFEFF5]">
                  <div className="text-xs text-[#626775]">
                    ارزش کل سفارش‌های ثبت‌شده
                  </div>
                  <div className="mt-1.5 text-base font-bold text-[#080707]">
                    {formatToman(data.salesOverview.recordedOrderValue)}
                  </div>
                  <div className="mt-1 text-[11px] text-[#626775]">
                    مجموع {formatNumberFa(data.salesOverview.totalOrdersCount)}{" "}
                    سفارش فعال
                  </div>
                </div>

                <div className="rounded-xl bg-[#ECFDF3]/60 p-3.5 border border-[#A6F4C5]">
                  <div className="text-xs font-medium text-[#127A4B]">
                    پرداخت‌های تاییدشده بانکی
                  </div>
                  <div className="mt-1.5 text-base font-bold text-[#0D5C38]">
                    {formatToman(data.salesOverview.verifiedPaidValue)}
                  </div>
                  <div className="mt-1 text-[11px] text-[#127A4B]">
                    {formatNumberFa(data.salesOverview.verifiedPaidOrdersCount)}{" "}
                    تراکنش تاییدشده ({formatNumberFa(verifiedPct)}٪)
                  </div>
                </div>

                <div className="rounded-xl bg-[#FFFAEB]/70 p-3.5 border border-[#FEDF89]">
                  <div className="text-xs font-medium text-[#9A5B04]">
                    در انتظار استعلام / پرداخت‌نشده
                  </div>
                  <div className="mt-1.5 text-base font-bold text-[#7A4905]">
                    {formatToman(data.salesOverview.pendingVerificationValue)}
                  </div>
                  <div className="mt-1 text-[11px] text-[#9A5B04]">
                    {formatNumberFa(pendingPct)}٪ نیازمند تعیین تکلیف
                  </div>
                </div>

                <div className="rounded-xl bg-[#FEF3F2]/60 p-3.5 border border-[#FECDCA]">
                  <div className="text-xs font-medium text-[#B44F40]">
                    بازپرداخت‌های تاییدشده
                  </div>
                  <div className="mt-1.5 text-base font-bold text-[#8A3427]">
                    {formatToman(data.salesOverview.confirmedRefundsValue)}
                  </div>
                  <div className="mt-1 text-[11px] text-[#B44F40]">
                    مبتنی بر رسید شبا تاییدشده
                  </div>
                </div>
              </div>

              {/* Clean Segmented Bar */}
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-[#626775] mb-1.5">
                  <span>نسبت وصولی تاییدشده به کل سفارش‌های ثبت‌شده</span>
                  <span className="font-semibold text-[#080707]">
                    {formatNumberFa(verifiedPct)}٪ تاییدشده
                  </span>
                </div>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#EFEFF5]">
                  <div
                    className="bg-[#1813FB] transition-all"
                    style={{ width: `${Math.min(100, verifiedPct)}%` }}
                    title="پرداخت تاییدشده"
                  />
                  <div
                    className="bg-[#A9A4E7] transition-all"
                    style={{
                      width: `${Math.min(100 - verifiedPct, pendingPct)}%`,
                    }}
                    title="در انتظار تایید"
                  />
                </div>
              </div>

              <div className="mt-3.5 flex items-center gap-2 rounded-xl bg-[#F0EEFF]/60 px-3 py-2 text-[11px] text-[#344054]">
                <CheckCircle2 className="h-4 w-4 text-[#1813FB] shrink-0" />
                <span>{data.salesOverview.contractNote}</span>
              </div>
            </section>

            {/* Quick Operational Actions */}
            <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-4">
              <h2 className="text-base font-semibold text-[#080707]">
                دسترسی سریع عملیات روزانه
              </h2>
              <p className="mt-0.5 text-xs text-[#626775]">
                مسیرهای مستقیم برای انجام وظایف پرتکرار تیم
              </p>

              <div className="mt-4 space-y-2">
                <Link
                  href="/products/new"
                  className="flex items-center justify-between rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] px-3.5 py-2.5 text-xs font-medium text-[#080707] hover:border-[#C1BCF2] hover:bg-[#F0EEFF]/50"
                >
                  <span>ایجاد پیش‌نویس محصول جدید</span>
                  <Plus className="h-4 w-4 text-[#1813FB]" />
                </Link>
                <Link
                  href="/orders"
                  className="flex items-center justify-between rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] px-3.5 py-2.5 text-xs font-medium text-[#080707] hover:border-[#C1BCF2] hover:bg-[#F0EEFF]/50"
                >
                  <span>مدیریت سفارش‌ها و پیش‌نمایش سریع</span>
                  <ShoppingBag className="h-4 w-4 text-[#1813FB]" />
                </Link>
                <Link
                  href="/orders/fulfillment"
                  className="flex items-center justify-between rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] px-3.5 py-2.5 text-xs font-medium text-[#080707] hover:border-[#C1BCF2] hover:bg-[#F0EEFF]/50"
                >
                  <span>برداشت کالا و اسکن بارکد SKU</span>
                  <ScanBarcode className="h-4 w-4 text-[#1813FB]" />
                </Link>
                <Link
                  href="/orders/print"
                  className="flex items-center justify-between rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] px-3.5 py-2.5 text-xs font-medium text-[#080707] hover:border-[#C1BCF2] hover:bg-[#F0EEFF]/50"
                >
                  <span>چاپ برچسب ارسال ۱۰۰×۱۵۰ میلی‌متر</span>
                  <Printer className="h-4 w-4 text-[#1813FB]" />
                </Link>
                <Link
                  href="/returns"
                  className="flex items-center justify-between rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] px-3.5 py-2.5 text-xs font-medium text-[#080707] hover:border-[#C1BCF2] hover:bg-[#F0EEFF]/50"
                >
                  <span>بررسی مرجوعی‌ها و کنترل کیفیت</span>
                  <RotateCcw className="h-4 w-4 text-[#1813FB]" />
                </Link>
                <Link
                  href="/inventory/operations"
                  className="flex items-center justify-between rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] px-3.5 py-2.5 text-xs font-medium text-[#080707] hover:border-[#C1BCF2] hover:bg-[#F0EEFF]/50"
                >
                  <span>
                    تایید اصلاحات موجودی ({formatNumberFa(data.kpis.pendingAdjustmentsCount)} مورد)
                  </span>
                  <Truck className="h-4 w-4 text-[#1813FB]" />
                </Link>
              </div>
            </section>
          </div>

          {/* D. SKU-Level Inventory Alerts + C. Order Activity */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* SKU-Level Low Stock Alerts */}
            <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-7">
              <div className="flex items-center justify-between border-b border-[#EFEFF5] pb-3.5">
                <div>
                  <h2 className="text-base font-semibold text-[#080707]">
                    هشدارهای موجودی در سطح کد تنوع (SKU)
                  </h2>
                  <p className="mt-0.5 text-xs text-[#626775]">
                    محاسبه بر اساس موجودی قابل فروش (فیزیکی منهای رزروشده سفارش‌ها)
                  </p>
                </div>
                <Link
                  href="/inventory"
                  className="text-xs font-semibold text-[#1813FB] hover:underline"
                >
                  مشاهده انبار
                </Link>
              </div>

              <div className="mt-3 overflow-x-auto kv-scroll-table">
                <table className="w-full min-w-[540px] text-right text-xs">
                  <thead>
                    <tr className="border-b border-[#EFEFF5] text-[#626775]">
                      <th className="py-2.5 font-medium">محصول و رنگ/سایز</th>
                      <th className="py-2.5 font-medium">کد SKU</th>
                      <th className="py-2.5 font-medium">فیزیکی</th>
                      <th className="py-2.5 font-medium">رزرو</th>
                      <th className="py-2.5 font-medium">قابل فروش</th>
                      <th className="py-2.5 font-medium">وضعیت</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFEFF5]">
                    {data.skuAlerts.map((item) => (
                      <tr key={item.variantId} className="hover:bg-[#FAFAFE]">
                        <td className="py-3">
                          <Link
                            href={`/products/${item.productId}`}
                            className="font-medium text-[#080707] hover:text-[#1813FB]"
                          >
                            {item.productName}
                          </Link>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#626775]">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full border border-black/15"
                              style={{ backgroundColor: item.colorHex }}
                            />
                            <span>{item.colorName}</span>
                            <span>•</span>
                            <span>سایز {item.sizeLabel}</span>
                          </div>
                        </td>
                        <td className="py-3 font-mono text-[11px] text-[#344054]">
                          <bdi dir="ltr">{item.sku}</bdi>
                        </td>
                        <td className="py-3">
                          {formatNumberFa(item.physicalStock)}
                        </td>
                        <td className="py-3">
                          {formatNumberFa(item.reservedStock)}
                        </td>
                        <td className="py-3 font-bold text-[#080707]">
                          {formatNumberFa(item.sellableStock)}
                        </td>
                        <td className="py-3">
                          {item.isOutOfStock ? (
                            <StatusBadge label="ناموجود" tone="danger" />
                          ) : (
                            <StatusBadge
                              label={`کم‌موجودی (حداقل ${formatNumberFa(item.threshold)})`}
                              tone="warning"
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Recent Order Activity & Live Events */}
            <section className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-5">
              <div className="flex items-center justify-between border-b border-[#EFEFF5] pb-3.5">
                <div>
                  <h2 className="text-base font-semibold text-[#080707]">
                    آخرین رویدادهای سفارش و پرداخت
                  </h2>
                  <p className="mt-0.5 text-xs text-[#626775]">
                    گزارش واقعی رویدادهای ثبت‌شده در OMS
                  </p>
                </div>
                <Link
                  href="/orders"
                  className="text-xs font-semibold text-[#1813FB] hover:underline"
                >
                  همه سفارش‌ها
                </Link>
              </div>

              <div className="mt-3.5 space-y-3">
                {data.recentOrders.slice(0, 4).map((ord) => {
                  const pBadge = getPaymentBadge(ord.paymentStatus);
                  const oBadge = getOrderStatusBadge(ord.operationalStatus);
                  return (
                    <Link
                      key={ord.id}
                      href={`/orders/${ord.id}`}
                      className="block rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] p-3 hover:border-[#C1BCF2]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[#1813FB]">
                            <bdi dir="ltr">{ord.orderNumber}</bdi>
                          </span>
                          <span className="text-xs font-medium text-[#080707]">
                            {ord.customerName}
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-[#080707]">
                          {formatToman(ord.totalAmount)}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge
                            label={oBadge.label}
                            tone={oBadge.tone}
                          />
                          <StatusBadge
                            label={pBadge.label}
                            tone={pBadge.tone}
                          />
                        </div>
                        <span className="text-[11px] text-[#626775]">
                          {formatJalaliDateTime(ord.createdAt)}
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
