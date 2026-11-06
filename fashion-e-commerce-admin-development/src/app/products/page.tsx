"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import {
  StatusBadge,
  getPublicationBadge,
} from "@/components/admin/ui/StatusBadge";
import {
  LoadingState,
  EmptyState,
  ErrorState,
  UnauthorizedState,
} from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import {
  formatJalaliDate,
  formatNumberFa,
  formatToman,
} from "@/lib/formatters";
import {
  Plus,
  Search,
  SlidersHorizontal,
  Columns3,
  ChevronDown,
  ChevronLeft,
  Pencil,
  Eye,
  AlertTriangle,
  Archive,
  X,
} from "lucide-react";

interface ResolvedVariant {
  id: number;
  colorId: number;
  colorName: string;
  colorHex: string;
  sizeLabel: string;
  sku: string;
  resolvedBasePrice: number;
  directDiscountAmount: number;
  effectivePrice: number;
  discountLabel: string;
  discountMode: string;
  physicalStock: number;
  reservedStock: number;
  sellableStock: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  isActive: boolean;
}

interface ProductListItem {
  id: number;
  code: string;
  name: string;
  slug: string;
  categoryId: number | null;
  categoryName: string;
  basePrice: number;
  status: string;
  primaryImage: string;
  variantCount: number;
  colorCount: number;
  minEffectivePrice: number;
  maxEffectivePrice: number;
  totalSellableStock: number;
  lowStockSkuCount: number;
  hasAnyDiscount: boolean;
  updatedAt: string;
  variants: ResolvedVariant[];
}

interface CategoryItem {
  id: number;
  name: string;
}

function ProductsListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { can } = useRole();

  const [statusTab, setStatusTab] = useState(
    searchParams.get("status") || "all"
  );
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [categoryId, setCategoryId] = useState(
    searchParams.get("categoryId") || "all"
  );
  const [stockFilter, setStockFilter] = useState(
    searchParams.get("stockFilter") || "all"
  );
  const [discountFilter, setDiscountFilter] = useState(
    searchParams.get("discountFilter") || "all"
  );
  const [sortBy, setSortBy] = useState(
    searchParams.get("sort") || "updated_desc"
  );
  const [page, setPage] = useState(
    Math.max(1, Number(searchParams.get("page") || "1") || 1)
  );

  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [columnsMenuOpen, setColumnsMenuOpen] = useState(false);
  const [visibleCols, setVisibleCols] = useState({
    code: false,
    colorCount: false,
    discountState: false,
    lowStockCount: false,
  });

  const [items, setItems] = useState<ProductListItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [statusCounts, setStatusCounts] = useState({
    all: 0,
    published: 0,
    draft: 0,
    needs_review: 0,
    archived: 0,
  });
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProductIds, setExpandedProductIds] = useState<
    Record<number, boolean>
  >({});
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [previewProduct, setPreviewProduct] = useState<ProductListItem | null>(
    null
  );
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const syncUrlAndFetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (statusTab !== "all") params.set("status", statusTab);
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (categoryId !== "all") params.set("categoryId", categoryId);
    if (stockFilter !== "all") params.set("stockFilter", stockFilter);
    if (discountFilter !== "all") params.set("discountFilter", discountFilter);
    if (sortBy !== "updated_desc") params.set("sort", sortBy);
    if (page > 1) params.set("page", String(page));

    const qs = params.toString();
    router.replace(qs ? `/products?${qs}` : "/products", { scroll: false });

    try {
      const res = await fetch(`/api/products?${qs}`, { cache: "no-store" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "خطا در دریافت فهرست محصولات");
      }
      const data = await res.json();
      setItems(data.items ?? []);
      setCategories(data.categories ?? []);
      if (data.statusCounts) setStatusCounts(data.statusCounts);
      if (data.pagination) {
        setTotalPages(data.pagination.totalPages);
        setTotalItems(data.pagination.totalItems);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای شبکه");
    } finally {
      setLoading(false);
    }
  }, [
    statusTab,
    searchQuery,
    categoryId,
    stockFilter,
    discountFilter,
    sortBy,
    page,
    router,
  ]);

  useEffect(() => {
    syncUrlAndFetch();
  }, [syncUrlAndFetch]);

  if (!can("catalog", "view")) {
    return <UnauthorizedState moduleTitle="مدیریت محصولات" />;
  }

  const toggleExpand = (id: number) => {
    setExpandedProductIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map((it) => it.id));
    }
  };

  const handleBulkStatus = async (nextStatus: "needs_review" | "archived") => {
    if (selectedIds.length === 0) return;
    setBulkMessage(null);
    for (const id of selectedIds) {
      await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
    }
    setBulkMessage(
      `وضعیت ${formatNumberFa(selectedIds.length)} محصول انتخاب‌شده بروزرسانی شد.`
    );
    setSelectedIds([]);
    syncUrlAndFetch();
  };

  const tabs = [
    { key: "all", label: "همه محصولات", count: statusCounts.all },
    { key: "published", label: "منتشر شده", count: statusCounts.published },
    { key: "draft", label: "پیش‌نویس‌ها", count: statusCounts.draft },
    {
      key: "needs_review",
      label: "نیازمند بازبینی",
      count: statusCounts.needs_review,
    },
    { key: "archived", label: "بایگانی", count: statusCounts.archived },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="مدیریت محصولات و تنوع‌های پوشاک"
        description="فهرست تخصصی محصولات با نمایش ترکیبات صریح رنگ-سایز، حداقل قیمت موثر و موجودی قابل فروش انبار"
        primaryAction={
          can("catalog", "create") ? (
            <Link
              href="/products/new"
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1813FB] px-4 text-xs sm:text-sm font-medium text-white hover:bg-[#110CD1] transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span>ایجاد محصول جدید</span>
            </Link>
          ) : undefined
        }
        secondaryActions={
          <Link
            href="/catalog/outfits"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs sm:text-sm font-medium text-[#080707] hover:bg-[#F7F7FB]"
          >
            <span>مدیریت استایل‌ها و ست‌ها</span>
          </Link>
        }
      />

      {/* Publication Status Tabs (Strictly distinct from Stock State) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 kv-scroll-table">
        {tabs.map((tab) => {
          const active = statusTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setStatusTab(tab.key);
                setPage(1);
              }}
              className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition-colors ${
                active
                  ? "border-[#1813FB] bg-[#F0EEFF] text-[#1813FB] font-semibold"
                  : "border-[#E5E7EB] bg-white text-[#4B505E] hover:bg-[#F7F7FB]"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] ${
                  active
                    ? "bg-[#1813FB] text-white"
                    : "bg-[#F4F5F8] text-[#626775]"
                }`}
              >
                {formatNumberFa(tab.count)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search, Advanced Filters Toggle & Column Customization */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-3.5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          {/* Visible Search Field */}
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#626775]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="جستجو بر اساس نام محصول، کد محصول یا SKU..."
              aria-label="جستجو در محصولات"
              className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-[#FAFAFE] pr-9 pl-3 text-xs text-[#080707] placeholder:text-[#626775] focus:border-[#1813FB] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAdvancedFiltersOpen((v) => !v)}
              className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                advancedFiltersOpen ||
                categoryId !== "all" ||
                stockFilter !== "all" ||
                discountFilter !== "all"
                  ? "border-[#1813FB] bg-[#F0EEFF] text-[#1813FB]"
                  : "border-[#E5E7EB] bg-white text-[#344054] hover:bg-[#F7F7FB]"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>فیلترهای پیشرفته</span>
            </button>

            {/* Column Customization Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setColumnsMenuOpen((v) => !v)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#344054] hover:bg-[#F7F7FB]"
              >
                <Columns3 className="h-3.5 w-3.5" />
                <span>ستون‌ها</span>
              </button>

              {columnsMenuOpen && (
                <div className="absolute left-0 mt-2 w-56 rounded-2xl border border-[#E5E7EB] bg-white p-3 shadow-lg z-30">
                  <div className="text-xs font-semibold text-[#080707] pb-2 border-b border-[#EFEFF5]">
                    سفارشی‌سازی ستون‌های اختیاری
                  </div>
                  <div className="mt-2 space-y-2 text-xs">
                    {[
                      { key: "code", label: "کد محصول" },
                      { key: "colorCount", label: "تعداد رنگ فعال" },
                      { key: "discountState", label: "وضعیت تخفیف" },
                      { key: "lowStockCount", label: "تعداد SKU کم‌موجودی" },
                    ].map((c) => (
                      <label
                        key={c.key}
                        className="flex items-center justify-between cursor-pointer"
                      >
                        <span className="text-[#344054]">{c.label}</span>
                        <input
                          type="checkbox"
                          checked={
                            visibleCols[c.key as keyof typeof visibleCols]
                          }
                          onChange={(e) =>
                            setVisibleCols((prev) => ({
                              ...prev,
                              [c.key]: e.target.checked,
                            }))
                          }
                          className="h-4 w-4 rounded border-[#D0D5DD] accent-[#1813FB]"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Collapsible Advanced Filters */}
        {advancedFiltersOpen && (
          <div className="mt-3 grid grid-cols-1 gap-2.5 border-t border-[#EFEFF5] pt-3 sm:grid-cols-4">
            <div>
              <label className="block text-[11px] font-medium text-[#626775] mb-1">
                دسته‌بندی
              </label>
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-white px-2.5 text-xs text-[#080707]"
              >
                <option value="all">همه دسته‌بندی‌ها</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#626775] mb-1">
                وضعیت موجودی انبار
              </label>
              <select
                value={stockFilter}
                onChange={(e) => {
                  setStockFilter(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-white px-2.5 text-xs text-[#080707]"
              >
                <option value="all">همه وضعیت‌های موجودی</option>
                <option value="low_stock">دارای SKU کم‌موجودی / هشدار</option>
                <option value="out_of_stock">کاملاً ناموجود (موجودی صفر)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#626775] mb-1">
                وضعیت تخفیف مستقیم
              </label>
              <select
                value={discountFilter}
                onChange={(e) => {
                  setDiscountFilter(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-white px-2.5 text-xs text-[#080707]"
              >
                <option value="all">همه محصولات</option>
                <option value="has_discount">دارای تنوع با تخفیف مستقیم</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#626775] mb-1">
                مرتب‌سازی
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="h-9 w-full rounded-xl border border-[#E5E7EB] bg-white px-2.5 text-xs text-[#080707]"
              >
                <option value="updated_desc">جدیدترین بروزرسانی</option>
                <option value="price_asc">کمترین حداقل قیمت</option>
                <option value="price_desc">بیشترین حداقل قیمت</option>
                <option value="stock_asc">کمترین موجودی قابل فروش</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Operations Bar */}
      {selectedIds.length > 0 && can("catalog", "edit") && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#C1BCF2] bg-[#F0EEFF] px-4 py-2.5 text-xs">
          <span className="font-semibold text-[#1813FB]">
            {formatNumberFa(selectedIds.length)} محصول انتخاب شده است
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleBulkStatus("needs_review")}
              className="rounded-lg bg-white px-3 py-1.5 font-medium text-[#080707] border border-[#E5E7EB] hover:bg-[#FAFAFE]"
            >
              ارسال به صف بازبینی
            </button>
            <button
              type="button"
              onClick={() => handleBulkStatus("archived")}
              className="inline-flex items-center gap-1 rounded-lg bg-[#FEF3F2] px-3 py-1.5 font-medium text-[#B44F40] border border-[#FECDCA] hover:bg-[#FEE4E2]"
            >
              <Archive className="h-3.5 w-3.5" />
              <span>بایگانی گروهی</span>
            </button>
          </div>
        </div>
      )}

      {bulkMessage && (
        <div className="rounded-xl border border-[#A6F4C5] bg-[#ECFDF3] px-4 py-2.5 text-xs font-medium text-[#127A4B]">
          {bulkMessage}
        </div>
      )}

      {/* Specialist Management Table (Preserved on Mobile as Horizontally Scrollable Table with Sticky RTL Identity) */}
      {loading && <LoadingState label="در حال بارگذاری جدول تخصصی محصولات..." />}
      {error && <ErrorState message={error} onRetry={syncUrlAndFetch} />}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          title="محصولی با فیلترهای انتخاب‌شده یافت نشد"
          description="فیلترهای جستجو را تغییر دهید یا یک پیش‌نویس محصول جدید ایجاد کنید."
          action={
            can("catalog", "create") ? (
              <Link
                href="/products/new"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white"
              >
                <Plus className="h-4 w-4" />
                <span>ایجاد پیش‌نویس محصول</span>
              </Link>
            ) : undefined
          }
        />
      )}

      {!loading && !error && items.length > 0 && (
        <div className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden">
          <div className="overflow-x-auto kv-scroll-table">
            <table className="w-full min-w-[820px] border-collapse text-right text-xs">
              <thead>
                <tr className="border-b border-[#E5E7EB] bg-[#FAFAFE] text-[11px] font-semibold text-[#626775]">
                  <th className="w-9 px-2.5 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={
                        items.length > 0 && selectedIds.length === items.length
                      }
                      onChange={toggleSelectAll}
                      aria-label="انتخاب همه محصولات"
                      className="h-4 w-4 rounded border-[#D0D5DD] accent-[#1813FB]"
                    />
                  </th>
                  {/* Sticky RTL-side Product Identity Header */}
                  <th className="sticky right-0 z-20 bg-[#FAFAFE] px-2.5 py-3 min-w-[235px] shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.06)]">
                    محصول
                  </th>
                  {visibleCols.code && (
                    <th className="px-3 py-3 whitespace-nowrap">کد محصول</th>
                  )}
                  <th className="px-3 py-3 whitespace-nowrap">تنوع‌ها</th>
                  {visibleCols.colorCount && (
                    <th className="px-3 py-3 whitespace-nowrap">رنگ‌ها</th>
                  )}
                  <th className="px-3 py-3 whitespace-nowrap">
                    حداقل قیمت موثر
                  </th>
                  {visibleCols.discountState && (
                    <th className="px-3 py-3 whitespace-nowrap">وضعیت تخفیف</th>
                  )}
                  <th className="px-3 py-3 whitespace-nowrap">
                    موجودی قابل فروش
                  </th>
                  {visibleCols.lowStockCount && (
                    <th className="px-3 py-3 whitespace-nowrap">
                      SKU کم‌موجودی
                    </th>
                  )}
                  <th className="px-3 py-3 whitespace-nowrap">وضعیت انتشار</th>
                  <th className="px-3 py-3 whitespace-nowrap">آخرین بروزرسانی</th>
                  <th className="px-3 py-3 text-left whitespace-nowrap">
                    عملیات
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#EFEFF5]">
                {items.map((prod) => {
                  const isExpanded = Boolean(expandedProductIds[prod.id]);
                  const pubBadge = getPublicationBadge(prod.status);
                  const hasPriceRange =
                    prod.maxEffectivePrice > prod.minEffectivePrice;

                  return (
                    <React.Fragment key={prod.id}>
                      {/* Main Row: 64-72px operational density */}
                      <tr className="group min-h-[68px] bg-white hover:bg-[#FAFAFE] transition-colors">
                        <td className="px-3 py-3 text-center align-middle">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(prod.id)}
                            onChange={() => toggleSelect(prod.id)}
                            aria-label={`انتخاب ${prod.name}`}
                            className="h-4 w-4 rounded border-[#D0D5DD] accent-[#1813FB]"
                          />
                        </td>

                        {/* Sticky RTL-side Product Identity Cell */}
                        <td className="sticky right-0 z-10 bg-white group-hover:bg-[#FAFAFE] px-3 py-2.5 align-middle shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.06)]">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => toggleExpand(prod.id)}
                              aria-expanded={isExpanded}
                              aria-label={`نمایش تنوع‌های ${prod.name}`}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#4B505E] hover:border-[#1813FB] hover:text-[#1813FB]"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronLeft className="h-4 w-4" />
                              )}
                            </button>

                            <img
                              src={
                                prod.primaryImage ||
                                "/images/products/coat-camel.jpg"
                              }
                              alt={prod.name}
                              className="h-12 w-12 shrink-0 rounded-xl border border-[#EFEFF5] object-cover bg-[#F7F7FB]"
                            />

                            <div className="min-w-0">
                              <Link
                                href={`/products/${prod.id}`}
                                className="block truncate font-semibold text-[#080707] hover:text-[#1813FB]"
                              >
                                {prod.name}
                              </Link>
                              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#626775]">
                                <span className="truncate">
                                  {prod.categoryName}
                                </span>
                                <span>•</span>
                                <span className="font-mono">
                                  <bdi dir="ltr">{prod.code}</bdi>
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {visibleCols.code && (
                          <td className="px-3 py-3 align-middle font-mono text-[11px] text-[#344054]">
                            <bdi dir="ltr">{prod.code}</bdi>
                          </td>
                        )}

                        <td className="px-3 py-3 align-middle whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => toggleExpand(prod.id)}
                            className="inline-flex items-center gap-1 rounded-lg bg-[#F7F7FB] px-2.5 py-1 text-xs font-medium text-[#344054] hover:bg-[#F0EEFF] hover:text-[#1813FB]"
                          >
                            <span>{formatNumberFa(prod.variantCount)} کد SKU</span>
                          </button>
                        </td>

                        {visibleCols.colorCount && (
                          <td className="px-3 py-3 align-middle whitespace-nowrap text-[#344054]">
                            {formatNumberFa(prod.colorCount)} رنگ
                          </td>
                        )}

                        {/* Minimum Valid Effective Price (never implying all variants share lowest price) */}
                        <td className="px-3 py-3 align-middle whitespace-nowrap">
                          <div className="font-semibold text-[#080707]">
                            {hasPriceRange ? "از " : ""}
                            {formatToman(prod.minEffectivePrice)}
                          </div>
                          {hasPriceRange && (
                            <div className="text-[10px] text-[#626775]">
                              تا {formatToman(prod.maxEffectivePrice)}
                            </div>
                          )}
                        </td>

                        {visibleCols.discountState && (
                          <td className="px-3 py-3 align-middle whitespace-nowrap">
                            {prod.hasAnyDiscount ? (
                              <StatusBadge
                                label="دارای تنوع تخفیف‌دار"
                                tone="indigo"
                              />
                            ) : (
                              <span className="text-[11px] text-[#626775]">
                                بدون تخفیف مستقیم
                              </span>
                            )}
                          </td>
                        )}

                        {/* Authoritative Sellable Stock + SKU Warning */}
                        <td className="px-3 py-3 align-middle whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-semibold ${
                                prod.totalSellableStock === 0
                                  ? "text-[#B44F40]"
                                  : "text-[#080707]"
                              }`}
                            >
                              {formatNumberFa(prod.totalSellableStock)} عدد
                            </span>
                            {prod.lowStockSkuCount > 0 && (
                              <span
                                title={`${prod.lowStockSkuCount} کد تنوع در وضعیت کم‌موجودی یا ناموجود`}
                                className="inline-flex items-center gap-1 rounded-full bg-[#FFFAEB] border border-[#FEDF89] px-2 py-0.5 text-[10px] font-medium text-[#9A5B04]"
                              >
                                <AlertTriangle className="h-3 w-3" />
                                <span>{formatNumberFa(prod.lowStockSkuCount)}</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {visibleCols.lowStockCount && (
                          <td className="px-3 py-3 align-middle whitespace-nowrap">
                            {prod.lowStockSkuCount > 0 ? (
                              <StatusBadge
                                label={`${formatNumberFa(prod.lowStockSkuCount)} هشدار`}
                                tone="warning"
                              />
                            ) : (
                              <span className="text-[11px] text-[#127A4B]">
                                عادی
                              </span>
                            )}
                          </td>
                        )}

                        <td className="px-3 py-3 align-middle whitespace-nowrap">
                          <StatusBadge
                            label={pubBadge.label}
                            tone={pubBadge.tone}
                          />
                        </td>

                        <td className="px-3 py-3 align-middle whitespace-nowrap text-[#626775]">
                          {formatJalaliDate(prod.updatedAt)}
                        </td>

                        <td className="px-3 py-3 align-middle text-left whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setPreviewProduct(prod)}
                              title="پیش‌نمایش سریع تنوع‌ها"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#4B505E] hover:border-[#1813FB] hover:text-[#1813FB]"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <Link
                              href={`/products/${prod.id}`}
                              title="ویرایش پیشرفته محصول"
                              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#E5E7EB] bg-white px-2.5 text-xs font-medium text-[#080707] hover:border-[#1813FB] hover:text-[#1813FB]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span>ویرایش</span>
                            </Link>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Explicit Color-Size Combinations Sub-Row */}
                      {isExpanded && (
                        <tr className="bg-[#FAFAFE]">
                          <td colSpan={12} className="px-4 py-3">
                            <div className="rounded-xl border border-[#E5E7EB] bg-white p-3">
                              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-[#4B505E]">
                                <span>
                                  ترکیبات صریح رنگ و سایز ثبت‌شده برای «
                                  {prod.name}» (بدون تولید خودکار ترکیبات نامعتبر)
                                </span>
                                <Link
                                  href={`/products/${prod.id}?tab=variants`}
                                  className="text-[#1813FB] hover:underline"
                                >
                                  مدیریت ماتریس تنوع و قیمت
                                </Link>
                              </div>

                              {prod.variants.length === 0 ? (
                                <div className="py-3 text-center text-xs text-[#626775]">
                                  هنوز ترکیب رنگ و سایزی برای این محصول ثبت نشده است.
                                </div>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full min-w-[680px] text-right text-xs">
                                    <thead>
                                      <tr className="border-b border-[#EFEFF5] text-[11px] text-[#626775]">
                                        <th className="py-2 font-medium">رنگ</th>
                                        <th className="py-2 font-medium">سایز</th>
                                        <th className="py-2 font-medium">کد SKU</th>
                                        <th className="py-2 font-medium">
                                          قیمت موثر فروش
                                        </th>
                                        <th className="py-2 font-medium">
                                          وضعیت تخفیف مستقیم
                                        </th>
                                        <th className="py-2 font-medium">
                                          موجودی قابل فروش
                                        </th>
                                        <th className="py-2 font-medium">
                                          وضعیت تنوع
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#EFEFF5]">
                                      {prod.variants.map((v) => (
                                        <tr key={v.id}>
                                          <td className="py-2">
                                            <div className="flex items-center gap-2">
                                              <span
                                                className="h-3.5 w-3.5 rounded-full border border-black/15 shrink-0"
                                                style={{
                                                  backgroundColor: v.colorHex,
                                                }}
                                              />
                                              <span className="font-medium text-[#080707]">
                                                {v.colorName}
                                              </span>
                                            </div>
                                          </td>
                                          <td className="py-2">
                                            <span className="rounded-md bg-[#F4F5F8] px-2 py-0.5 font-semibold text-[#080707]">
                                              {v.sizeLabel}
                                            </span>
                                          </td>
                                          <td className="py-2 font-mono text-[11px] text-[#344054]">
                                            <bdi dir="ltr">{v.sku}</bdi>
                                          </td>
                                          <td className="py-2 font-semibold text-[#080707]">
                                            {formatToman(v.effectivePrice)}
                                          </td>
                                          <td className="py-2 text-[11px] text-[#4B505E]">
                                            {v.discountLabel}
                                          </td>
                                          <td className="py-2">
                                            <span
                                              className={`font-semibold ${
                                                v.isOutOfStock
                                                  ? "text-[#B44F40]"
                                                  : v.isLowStock
                                                  ? "text-[#9A5B04]"
                                                  : "text-[#127A4B]"
                                              }`}
                                            >
                                              {formatNumberFa(v.sellableStock)}{" "}
                                              عدد
                                            </span>
                                            <span className="mr-1 text-[10px] text-[#626775]">
                                              (فیزیکی:{" "}
                                              {formatNumberFa(v.physicalStock)} |
                                              رزرو:{" "}
                                              {formatNumberFa(v.reservedStock)})
                                            </span>
                                          </td>
                                          <td className="py-2">
                                            {v.isActive ? (
                                              <StatusBadge
                                                label="فعال"
                                                tone="success"
                                              />
                                            ) : (
                                              <StatusBadge
                                                label="غیرفعال"
                                                tone="neutral"
                                              />
                                            )}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
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

          {/* Pagination */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#EFEFF5] bg-[#FAFAFE] px-4 py-3 text-xs text-[#626775]">
            <span>
              نمایش {formatNumberFa(items.length)} از{" "}
              {formatNumberFa(totalItems)} محصول
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 font-medium text-[#080707] disabled:opacity-40"
              >
                قبلی
              </button>
              <span className="px-2 font-medium text-[#080707]">
                صفحه {formatNumberFa(page)} از {formatNumberFa(totalPages)}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-1.5 font-medium text-[#080707] disabled:opacity-40"
              >
                بعدی
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Centered Product Quick Preview Modal */}
      {previewProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-preview-prod-title"
        >
          <div className="w-full max-w-xl rounded-2xl border border-[#E5E7EB] bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#EFEFF5] pb-3.5">
              <div className="flex items-center gap-3">
                <img
                  src={previewProduct.primaryImage}
                  alt={previewProduct.name}
                  className="h-14 w-14 rounded-xl object-cover border border-[#E5E7EB]"
                />
                <div>
                  <h3
                    id="quick-preview-prod-title"
                    className="text-base font-semibold text-[#080707]"
                  >
                    {previewProduct.name}
                  </h3>
                  <div className="mt-0.5 text-xs text-[#626775]">
                    {previewProduct.categoryName} •{" "}
                    <bdi dir="ltr">{previewProduct.code}</bdi>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewProduct(null)}
                className="rounded-lg p-1.5 text-[#626775] hover:bg-[#F4F5F8]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 max-h-72 overflow-y-auto space-y-2 kv-scroll-table">
              {previewProduct.variants.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3.5 w-3.5 rounded-full border border-black/15"
                      style={{ backgroundColor: v.colorHex }}
                    />
                    <span className="font-medium text-[#080707]">
                      {v.colorName} — سایز {v.sizeLabel}
                    </span>
                    <span className="font-mono text-[11px] text-[#626775]">
                      (<bdi dir="ltr">{v.sku}</bdi>)
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-[#080707]">
                      {formatToman(v.effectivePrice)}
                    </span>
                    <span className="text-[11px] text-[#626775]">
                      موجودی: {formatNumberFa(v.sellableStock)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-[#EFEFF5] pt-3.5">
              <button
                type="button"
                onClick={() => setPreviewProduct(null)}
                className="h-9 rounded-xl border border-[#E5E7EB] bg-white px-4 text-xs font-medium text-[#344054]"
              >
                بستن
              </button>
              <Link
                href={`/products/${previewProduct.id}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1]"
              >
                <span>باز کردن ویرایشگر کامل</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <AdminShell>
      <Suspense fallback={<LoadingState label="در حال آماده‌سازی کاتالوگ..." />}>
        <ProductsListContent />
      </Suspense>
    </AdminShell>
  );
}
