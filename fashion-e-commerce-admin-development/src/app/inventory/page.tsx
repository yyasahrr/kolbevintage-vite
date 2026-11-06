"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import {
  LoadingState,
  ErrorState,
  UnauthorizedState,
} from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import { formatNumberFa } from "@/lib/formatters";
import {
  PackagePlus,
  ChevronDown,
  ChevronLeft,
  AlertTriangle,
  Search,
  ClipboardList,
} from "lucide-react";

interface InventoryVariantRow {
  id: number;
  colorName: string;
  colorHex: string;
  sizeLabel: string;
  sku: string;
  physicalStock: number;
  reservedStock: number;
  sellableStock: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  recentMovementSummary: string;
}

interface InventoryProductRow {
  id: number;
  code: string;
  name: string;
  primaryImage: string;
  status: string;
  totalPhysical: number;
  totalReserved: number;
  totalSellable: number;
  warningCount: number;
  variants: InventoryVariantRow[];
}

export default function InventoryPage() {
  const { can } = useRole();
  const [products, setProducts] = useState<InventoryProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlyWarnings, setOnlyWarnings] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const loadInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory", { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "خطا در دریافت موجودی انبار");
      }
      const data = await res.json();
      const rows: InventoryProductRow[] = data.products || [];
      setProducts(rows);
      // Expand first product by default so SKU details are immediately inspectable
      if (rows[0]) {
        setExpanded({ [rows[0].id]: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطا");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  if (!can("inventory", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="موجودی کالا و هشدارهای انبار" />
      </AdminShell>
    );
  }

  const filtered = products.filter((p) => {
    if (onlyWarnings && p.warningCount === 0) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      p.variants.some((v) => v.sku.toLowerCase().includes(q))
    );
  });

  return (
    <AdminShell>
      <PageHeader
        title="موجودی کالا و هشدارهای انبار (SKU-Centered Inventory)"
        description="دفتر کل مرجع انبار: تفکیک موجودی فیزیکی، موجودی رزروشده سفارش‌ها و موجودی قابل فروش در سطح هر کد SKU"
        primaryAction={
          can("inventory", "create") ? (
            <Link
              href="/inventory/operations"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1813FB] px-4 text-xs sm:text-sm font-medium text-white hover:bg-[#110CD1]"
            >
              <PackagePlus className="h-4 w-4" />
              <span>دریافت کالا / اصلاح موجودی</span>
            </Link>
          ) : undefined
        }
        secondaryActions={
          <Link
            href="/inventory/ledger"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#080707] hover:bg-[#F7F7FB]"
          >
            <ClipboardList className="h-4 w-4 text-[#626775]" />
            <span>دفتر کل گردش کالا</span>
          </Link>
        }
      />

      {/* Search & Alert Filter */}
      <div className="mb-4 flex flex-col gap-2.5 rounded-2xl border border-[#E5E7EB] bg-white p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#626775]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="جستجو بر اساس نام محصول یا کد SKU..."
            className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-[#FAFAFE] pr-9 pl-3 text-xs"
          />
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-medium text-[#344054] cursor-pointer">
          <input
            type="checkbox"
            checked={onlyWarnings}
            onChange={(e) => setOnlyWarnings(e.target.checked)}
            className="h-4 w-4 rounded accent-[#1813FB]"
          />
          <span>فقط محصولات دارای هشدار کم‌موجودی یا ناموجود</span>
        </label>
      </div>

      {loading && <LoadingState label="در حال خواندن موجودی دفتر کل انبار..." />}
      {error && <ErrorState message={error} onRetry={loadInventory} />}

      {!loading && !error && (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden">
          <div className="overflow-x-auto kv-scroll-table">
            <table className="w-full min-w-[780px] text-right text-xs">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#FAFAFE] text-[11px] font-semibold text-[#626775]">
                  <th className="sticky right-0 z-10 bg-[#FAFAFE] px-4 py-3 min-w-[260px]">
                    محصول
                  </th>
                  <th className="px-4 py-3">موجودی فیزیکی کل</th>
                  <th className="px-4 py-3">رزروشده سفارش‌ها</th>
                  <th className="px-4 py-3">موجودی قابل فروش</th>
                  <th className="px-4 py-3">هشدار موجودی</th>
                  <th className="px-4 py-3 text-left">خلاصه وضعیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EFEFF5]">
                {filtered.map((prod) => {
                  const isOpen = Boolean(expanded[prod.id]);
                  return (
                    <React.Fragment key={prod.id}>
                      <tr className="bg-white hover:bg-[#FAFAFE]">
                        <td className="sticky right-0 z-10 bg-white px-4 py-3">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded((p) => ({
                                  ...p,
                                  [prod.id]: !p[prod.id],
                                }))
                              }
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E5E7EB] text-[#4B505E] hover:border-[#1813FB]"
                            >
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronLeft className="h-4 w-4" />
                              )}
                            </button>
                            <img
                              src={prod.primaryImage}
                              alt={prod.name}
                              className="h-11 w-11 rounded-xl object-cover border border-[#EFEFF5]"
                            />
                            <div>
                              <div className="font-semibold text-[#080707]">
                                {prod.name}
                              </div>
                              <div className="font-mono text-[11px] text-[#626775]">
                                <bdi dir="ltr">{prod.code}</bdi> •{" "}
                                {formatNumberFa(prod.variants.length)} کد SKU
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {formatNumberFa(prod.totalPhysical)} عدد
                        </td>
                        <td className="px-4 py-3 text-[#626775]">
                          {formatNumberFa(prod.totalReserved)} عدد
                        </td>
                        <td className="px-4 py-3 font-bold text-[#080707]">
                          {formatNumberFa(prod.totalSellable)} عدد
                        </td>
                        <td className="px-4 py-3">
                          {prod.warningCount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#FFFAEB] border border-[#FEDF89] px-2.5 py-0.5 text-[11px] font-medium text-[#9A5B04]">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              <span>
                                {formatNumberFa(prod.warningCount)} کد SKU نیازمند
                                شارژ
                              </span>
                            </span>
                          ) : (
                            <StatusBadge label="موجودی ایمن" tone="success" />
                          )}
                        </td>
                        <td className="px-4 py-3 text-left">
                          {prod.totalSellable > 0 ? (
                            <StatusBadge label="آماده فروش" tone="indigo" />
                          ) : (
                            <StatusBadge label="ناموجود کل" tone="danger" />
                          )}
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="bg-[#FAFAFE]">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="rounded-xl border border-[#E5E7EB] bg-white p-3 overflow-x-auto">
                              <table className="w-full min-w-[680px] text-right text-xs">
                                <thead>
                                  <tr className="border-b border-[#EFEFF5] text-[11px] text-[#626775]">
                                    <th className="py-2 font-medium">رنگ</th>
                                    <th className="py-2 font-medium">سایز</th>
                                    <th className="py-2 font-medium">کد SKU</th>
                                    <th className="py-2 font-medium">فیزیکی</th>
                                    <th className="py-2 font-medium">رزرو</th>
                                    <th className="py-2 font-medium">
                                      قابل فروش
                                    </th>
                                    <th className="py-2 font-medium">وضعیت</th>
                                    <th className="py-2 font-medium">
                                      آخرین گردش
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#EFEFF5]">
                                  {prod.variants.map((v) => (
                                    <tr key={v.id}>
                                      <td className="py-2">
                                        <div className="flex items-center gap-2">
                                          <span
                                            className="h-3.5 w-3.5 rounded-full border border-black/15"
                                            style={{
                                              backgroundColor: v.colorHex,
                                            }}
                                          />
                                          <span className="font-medium">
                                            {v.colorName}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="py-2 font-semibold">
                                        {v.sizeLabel}
                                      </td>
                                      <td className="py-2 font-mono text-[11px]">
                                        <bdi dir="ltr">{v.sku}</bdi>
                                      </td>
                                      <td className="py-2">
                                        {formatNumberFa(v.physicalStock)}
                                      </td>
                                      <td className="py-2 text-[#626775]">
                                        {formatNumberFa(v.reservedStock)}
                                      </td>
                                      <td className="py-2 font-bold">
                                        {formatNumberFa(v.sellableStock)}
                                      </td>
                                      <td className="py-2">
                                        {v.isOutOfStock ? (
                                          <StatusBadge
                                            label="ناموجود"
                                            tone="danger"
                                          />
                                        ) : v.isLowStock ? (
                                          <StatusBadge
                                            label="کم‌موجودی"
                                            tone="warning"
                                          />
                                        ) : (
                                          <StatusBadge
                                            label="عادی"
                                            tone="success"
                                          />
                                        )}
                                      </td>
                                      <td className="py-2 text-[11px] text-[#626775]">
                                        <bdi dir="ltr">
                                          {v.recentMovementSummary}
                                        </bdi>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
