"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import {
  StatusBadge,
  getPublicationBadge,
} from "@/components/admin/ui/StatusBadge";
import {
  LoadingState,
  ErrorState,
  UnauthorizedState,
} from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import { resolveVariantMetrics } from "@/lib/pricing";
import { formatNumberFa, formatToman } from "@/lib/formatters";
import {
  ArrowRight,
  Save,
  Plus,
  Check,
  AlertTriangle,
  Boxes,
  Image as ImageIcon,
  Palette,
  Tag,
  Ruler,
  Link2,
  Globe,
  FileText,
  Trash2,
} from "lucide-react";

type EditorTab =
  | "basic"
  | "variants"
  | "pricing"
  | "media"
  | "size_guide"
  | "related"
  | "seo";

interface VariantRow {
  id?: number;
  tempKey?: string;
  colorId: number;
  colorName: string;
  colorHex: string;
  sizeLabel: string;
  sku: string;
  colorPriceOverride: number | null;
  skuPriceOverride: number | null;
  discountMode: "inherit" | "none" | "explicit";
  discountType: "percent" | "fixed" | null;
  discountValue: number | null;
  physicalStock: number;
  reservedStock: number;
  lowStockThreshold: number;
  isActive: boolean;
}

interface MediaRow {
  id?: number;
  colorId: number;
  mediaRole: "main" | "gallery" | "hover" | "detail_video";
  url: string;
  altText: string;
}

interface ColorOption {
  id: number;
  name: string;
  hex: string;
  family: string;
}

interface CategoryOption {
  id: number;
  name: string;
}

interface SizeTemplateOption {
  id: number;
  name: string;
  categoryType: string;
  sizesJson: string[];
  measurementSchemaJson: string[];
}

interface RelatedProdOption {
  id: number;
  code: string;
  name: string;
  primaryImage: string;
  basePrice: number;
}

const PRESET_STUDIO_URLS = [
  "/images/products/coat-camel.jpg",
  "/images/products/coat-charcoal.jpg",
  "/images/products/shirt-linen.jpg",
  "/images/products/shirt-indigo.jpg",
  "/images/products/trousers-olive.jpg",
  "/images/products/bag-leather.jpg",
  "/images/products/boots-chelsea.jpg",
  "/images/products/outfit-autumn.jpg",
];

function ProductEditorContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { can } = useRole();

  const initialTab = (searchParams.get("tab") as EditorTab) || "basic";
  const [activeTab, setActiveTab] = useState<EditorTab>(initialTab);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Core Product Fields
  const [productId, setProductId] = useState<number>(0);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [basePrice, setBasePrice] = useState<number>(0);
  const [status, setStatus] = useState<string>("draft");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [primaryImage, setPrimaryImage] = useState("");
  const [sizeTemplateId, setSizeTemplateId] = useState<number | null>(null);
  const [specifications, setSpecifications] = useState<Record<string, string>>(
    {}
  );
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [relatedProductIds, setRelatedProductIds] = useState<number[]>([]);

  // Explicit Color-Size Matrix & Color-Dependent Media
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [media, setMedia] = useState<MediaRow[]>([]);

  // Reference Catalog Metadata
  const [colors, setColors] = useState<ColorOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [sizeTemplates, setSizeTemplates] = useState<SizeTemplateOption[]>([]);
  const [otherProducts, setOtherProducts] = useState<RelatedProdOption[]>([]);

  // Inline Color Creation State (in Variants Tab)
  const [newColorName, setNewColorName] = useState("");
  const [newColorHex, setNewColorHex] = useState("#2E5A44");
  const [newColorFamily, setNewColorFamily] = useState("خاکی");
  const [creatingColor, setCreatingColor] = useState(false);

  // Adding explicit size to a specific color (never forced Cartesian!)
  const [selectedColorForAdd, setSelectedColorForAdd] = useState<number>(0);
  const [customSizeInput, setCustomSizeInput] = useState("");

  // Bulk selection in Variants / Pricing Tab
  const [selectedVariantKeys, setSelectedVariantKeys] = useState<string[]>([]);
  const [bulkDiscountPct, setBulkDiscountPct] = useState<string>("10");

  // Color-Dependent Media Active Color & Storefront Contract Preview
  const [activeMediaColorId, setActiveMediaColorId] = useState<number>(0);
  const [newMediaUrl, setNewMediaUrl] = useState(PRESET_STUDIO_URLS[0]);
  const [newMediaRole, setNewMediaRole] = useState<
    "main" | "gallery" | "hover" | "detail_video"
  >("gallery");
  const [newMediaAlt, setNewMediaAlt] = useState("");

  // Storefront Interactive Preview State (inside Media Tab)
  const [previewSelectedColorId, setPreviewSelectedColorId] =
    useState<number>(0);
  const [previewSelectedSize, setPreviewSelectedSize] = useState<string>("");

  // New Spec Row State
  const [newSpecKey, setNewSpecKey] = useState("");
  const [newSpecVal, setNewSpecVal] = useState("");

  const loadProduct = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${params.id}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "خطا در بارگذاری محصول");
      }
      const data = await res.json();
      const p = data.product;
      setProductId(p.id);
      setCode(p.code);
      setName(p.name);
      setSlug(p.slug);
      setCategoryId(p.categoryId);
      setBasePrice(p.basePrice);
      setStatus(p.status);
      setShortDescription(p.shortDescription || "");
      setDescription(p.description || "");
      setPrimaryImage(p.primaryImage || "/images/products/coat-camel.jpg");
      setSizeTemplateId(
        p.sizeTemplateId || data.sizeTemplates?.[0]?.id || null
      );
      setSpecifications(p.specificationsJson || {});
      setSeoTitle(p.seoTitle || "");
      setSeoDescription(p.seoDescription || "");
      setRelatedProductIds(p.relatedProductIdsJson || []);

      const loadedVariants: VariantRow[] = (data.variants || []).map(
        (v: VariantRow) => ({
          id: v.id,
          tempKey: `v-${v.id}`,
          colorId: v.colorId,
          colorName: v.colorName,
          colorHex: v.colorHex,
          sizeLabel: v.sizeLabel,
          sku: v.sku,
          colorPriceOverride: v.colorPriceOverride,
          skuPriceOverride: v.skuPriceOverride,
          discountMode: v.discountMode || "inherit",
          discountType: v.discountType || null,
          discountValue: v.discountValue ?? null,
          physicalStock: v.physicalStock,
          reservedStock: v.reservedStock,
          lowStockThreshold: v.lowStockThreshold,
          isActive: v.isActive,
        })
      );
      setVariants(loadedVariants);
      setMedia(data.media || []);
      setColors(data.colors || []);
      setCategories(data.categories || []);
      setSizeTemplates(data.sizeTemplates || []);
      setOtherProducts(data.otherProducts || []);

      const firstColorId =
        loadedVariants[0]?.colorId || data.colors?.[0]?.id || 0;
      setSelectedColorForAdd(firstColorId);
      setActiveMediaColorId(firstColorId);
      setPreviewSelectedColorId(firstColorId);
      const firstSizeForColor = loadedVariants.find(
        (v) => v.colorId === firstColorId && v.isActive
      )?.sizeLabel;
      setPreviewSelectedSize(firstSizeForColor || "");
      setHasUnsavedChanges(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطای ناشناخته");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  if (!can("catalog", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="ویرایشگر پیشرفته محصول" />
      </AdminShell>
    );
  }

  const markDirty = () => setHasUnsavedChanges(true);

  const handleTabSwitch = (nextTab: EditorTab) => {
    if (nextTab === activeTab) return;
    if (hasUnsavedChanges) {
      const ok = window.confirm(
        "تغییرات ذخیره‌نشده‌ای در این بخش دارید. آیا بدون ذخیره به تب دیگری می‌روید؟ (تغییرات در حافظه فرم باقی می‌ماند تا دکمه ذخیره نهایی را بزنید)"
      );
      if (!ok) return;
    }
    setActiveTab(nextTab);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setSaveToast(null);
    setSaveError(null);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          categoryId,
          basePrice,
          status,
          shortDescription,
          description,
          primaryImage,
          sizeTemplateId,
          specificationsJson: specifications,
          seoTitle,
          seoDescription,
          relatedProductIdsJson: relatedProductIds,
          variants,
          media,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "خطا در ذخیره تغییرات محصول");
      }
      setSaveToast("تمامی تغییرات محصول، تنوع‌ها و رسانه‌ها با موفقیت ذخیره شد.");
      setHasUnsavedChanges(false);
      await loadProduct();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "خطا در ذخیره");
    } finally {
      setSaving(false);
    }
  };

  // Inline Reusable Color Creation
  const handleCreateInlineColor = async () => {
    if (!newColorName.trim()) return;
    setCreatingColor(true);
    try {
      const res = await fetch("/api/catalog/meta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "color",
          name: newColorName.trim(),
          hex: newColorHex,
          family: newColorFamily,
        }),
      });
      const data = await res.json();
      if (res.ok && data.color) {
        setColors((prev) => [...prev, data.color]);
        setSelectedColorForAdd(data.color.id);
        setActiveMediaColorId(data.color.id);
        setNewColorName("");
      }
    } finally {
      setCreatingColor(false);
    }
  };

  // Add explicit size ONLY to selected color (never forced Cartesian!)
  const handleAddExplicitSize = (colorId: number, sizeLabel: string) => {
    const cleanSize = sizeLabel.trim();
    if (!colorId || !cleanSize) return;
    const exists = variants.some(
      (v) =>
        v.colorId === colorId &&
        v.sizeLabel.toUpperCase() === cleanSize.toUpperCase()
    );
    if (exists) return;

    const col = colors.find((c) => c.id === colorId);
    if (!col) return;

    // Inherit colorPriceOverride if another size of this color already has one
    const siblingColorPrice =
      variants.find((v) => v.colorId === colorId)?.colorPriceOverride ?? null;

    const skuSuffix = cleanSize.replace(/\s+/g, "").toUpperCase();
    const generatedSku = `${code}-C${colorId}-${skuSuffix}`;

    setVariants((prev) => [
      ...prev,
      {
        tempKey: `new-${colorId}-${cleanSize}-${Date.now()}`,
        colorId,
        colorName: col.name,
        colorHex: col.hex,
        sizeLabel: cleanSize,
        sku: generatedSku,
        colorPriceOverride: siblingColorPrice,
        skuPriceOverride: null,
        discountMode: "inherit",
        discountType: null,
        discountValue: null,
        physicalStock: 0,
        reservedStock: 0,
        lowStockThreshold: 4,
        isActive: true,
      },
    ]);
    markDirty();
  };

  const updateVariantField = (
    key: string,
    patch: Partial<VariantRow>
  ) => {
    setVariants((prev) =>
      prev.map((v) =>
        (v.tempKey || `v-${v.id}`) === key ? { ...v, ...patch } : v
      )
    );
    markDirty();
  };

  // Apply Color-level price override across all sizes of that color
  const updateColorLevelPrice = (colorId: number, priceVal: string) => {
    const parsed = priceVal.trim() === "" ? null : Math.max(0, Number(priceVal));
    setVariants((prev) =>
      prev.map((v) =>
        v.colorId === colorId ? { ...v, colorPriceOverride: parsed } : v
      )
    );
    markDirty();
  };

  // Bulk apply discount to selected variants
  const handleBulkApplyDiscount = () => {
    const pct = Math.min(90, Math.max(1, Number(bulkDiscountPct) || 10));
    setVariants((prev) =>
      prev.map((v) => {
        const k = v.tempKey || `v-${v.id}`;
        if (!selectedVariantKeys.includes(k)) return v;
        return {
          ...v,
          discountMode: "explicit",
          discountType: "percent",
          discountValue: pct,
        };
      })
    );
    setSelectedVariantKeys([]);
    markDirty();
  };

  // Storefront Contract Simulation Handler (inside Media Tab)
  const handlePreviewColorSwitch = (nextColorId: number) => {
    setPreviewSelectedColorId(nextColorId);
    const validSizes = variants
      .filter((v) => v.colorId === nextColorId && v.isActive)
      .map((v) => v.sizeLabel);
    // Storefront Contract #3: Clear invalid previous size selection!
    if (!validSizes.includes(previewSelectedSize)) {
      setPreviewSelectedSize(validSizes[0] || "");
    }
  };

  const activeTemplate =
    sizeTemplates.find((t) => t.id === sizeTemplateId) || sizeTemplates[0];
  const candidateSizes = activeTemplate?.sizesJson || [
    "S",
    "M",
    "L",
    "XL",
    "XXL",
  ];

  // Group variants by color for Zain's Studio-inspired Variant Matrix
  const distinctVariantColorIds = Array.from(
    new Set(variants.map((v) => v.colorId))
  );

  const pubBadge = getPublicationBadge(status);

  const tabs: Array<{
    key: EditorTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { key: "basic", label: "۱. اطلاعات پایه", icon: FileText },
    { key: "variants", label: "۲. رنگ‌ها و سایزها", icon: Palette },
    { key: "pricing", label: "۳. قیمت‌گذاری و تخفیف‌ها", icon: Tag },
    { key: "media", label: "۴. رسانه‌های محصول", icon: ImageIcon },
    { key: "size_guide", label: "۵. راهنمای سایز و مشخصات", icon: Ruler },
    { key: "related", label: "۶. محصولات مرتبط", icon: Link2 },
    { key: "seo", label: "۷. سئو و انتشار", icon: Globe },
  ];

  // Storefront preview resolved variant
  const previewColorMedia = media.filter(
    (m) => m.colorId === previewSelectedColorId
  );
  const previewValidVariants = variants.filter(
    (v) => v.colorId === previewSelectedColorId && v.isActive
  );
  const previewActiveVariant = previewValidVariants.find(
    (v) => v.sizeLabel === previewSelectedSize
  );
  const previewMetrics = previewActiveVariant
    ? resolveVariantMetrics({
        productBasePrice: basePrice,
        colorPriceOverride: previewActiveVariant.colorPriceOverride,
        skuPriceOverride: previewActiveVariant.skuPriceOverride,
        discountMode: previewActiveVariant.discountMode,
        discountType: previewActiveVariant.discountType,
        discountValue: previewActiveVariant.discountValue,
        physicalStock: previewActiveVariant.physicalStock,
        reservedStock: previewActiveVariant.reservedStock,
        lowStockThreshold: previewActiveVariant.lowStockThreshold,
        isActive: previewActiveVariant.isActive,
      })
    : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={loading ? "در حال بارگذاری ویرایشگر..." : `ویرایش محصول: ${name}`}
        description={
          loading
            ? ""
            : `کد محصول: ${code} • مدیریت تنوع‌های صریح رنگ-سایز، سلسله‌مراتب قیمت و رسانه‌های وابسته به رنگ`
        }
        badge={
          !loading ? (
            <div className="flex items-center gap-2">
              <StatusBadge label={pubBadge.label} tone={pubBadge.tone} />
              {hasUnsavedChanges && (
                <StatusBadge label="تغییرات ذخیره‌نشده" tone="warning" />
              )}
            </div>
          ) : undefined
        }
        secondaryActions={
          <Link
            href="/products"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#344054] hover:bg-[#F7F7FB]"
          >
            <ArrowRight className="h-4 w-4" />
            <span>بازگشت به محصولات</span>
          </Link>
        }
        /* Single consistent primary action area */
        primaryAction={
          can("catalog", "edit") && !loading ? (
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#1813FB] px-5 text-xs sm:text-sm font-medium text-white hover:bg-[#110CD1] disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              <span>
                {saving ? "در حال ذخیره تغییرات..." : "ذخیره نهایی تغییرات"}
              </span>
            </button>
          ) : undefined
        }
      />

      {saveToast && (
        <div className="rounded-xl border border-[#A6F4C5] bg-[#ECFDF3] px-4 py-2.5 text-xs font-medium text-[#127A4B]">
          {saveToast}
        </div>
      )}
      {saveError && (
        <div className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-2.5 text-xs font-medium text-[#B44F40]">
          {saveError}
        </div>
      )}

      {loading && <LoadingState label="در حال بارگذاری اطلاعات محصول..." />}
      {error && <ErrorState message={error} onRetry={loadProduct} />}

      {!loading && !error && (
        <div className="space-y-4">
          {/* 7-Tab Navigation Bar */}
          <div
            role="tablist"
            aria-label="بخش‌های ویرایشگر محصول"
            className="flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-[#E5E7EB] bg-white p-1.5 kv-scroll-table"
          >
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => handleTabSwitch(t.key)}
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-medium transition-colors ${
                    active
                      ? "bg-[#1813FB] text-white shadow-2xs"
                      : "text-[#4B505E] hover:bg-[#F7F7FB] hover:text-[#080707]"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: Basic Information */}
          {activeTab === "basic" && (
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#080707] mb-1.5">
                    نام محصول
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      markDirty();
                    }}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm text-[#080707] focus:border-[#1813FB] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#080707] mb-1.5">
                    وضعیت انتشار در ویترین
                  </label>
                  <select
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      markDirty();
                    }}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#080707]"
                  >
                    <option value="draft">پیش‌نویس (غیرقابل مشاهده در سایت)</option>
                    <option value="needs_review">نیازمند بازبینی کیفیت</option>
                    <option value="published">منتشر شده در فروشگاه</option>
                    <option value="archived">بایگانی‌شده</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#080707] mb-1.5">
                    دسته‌بندی
                  </label>
                  <select
                    value={categoryId ?? ""}
                    onChange={(e) => {
                      setCategoryId(
                        e.target.value ? Number(e.target.value) : null
                      );
                      markDirty();
                    }}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#080707]"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#080707] mb-1.5">
                    قیمت پایه محصول (تومان)
                  </label>
                  <input
                    type="number"
                    min={0}
                    dir="ltr"
                    value={basePrice}
                    onChange={(e) => {
                      setBasePrice(Math.max(0, Number(e.target.value) || 0));
                      markDirty();
                    }}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-sm text-[#080707]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#080707] mb-1.5">
                    کد یکتای محصول
                  </label>
                  <input
                    type="text"
                    readOnly
                    dir="ltr"
                    value={code}
                    className="h-10 w-full rounded-xl border border-[#EFEFF5] bg-[#F7F7FB] px-3 text-left font-mono text-sm text-[#626775]"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-[#080707] mb-1.5">
                    توضیح کوتاه محصول
                  </label>
                  <input
                    type="text"
                    value={shortDescription}
                    onChange={(e) => {
                      setShortDescription(e.target.value);
                      markDirty();
                    }}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-sm text-[#080707]"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-[#080707] mb-1.5">
                    توضیحات تکمیلی و داستان طراحی لباس
                  </label>
                  <textarea
                    rows={4}
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      markDirty();
                    }}
                    className="w-full rounded-xl border border-[#E5E7EB] p-3 text-sm text-[#080707]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Explicit Fashion Variant Matrix (Zain's Studio Inspired — NO Forced Cartesian Product!) */}
          {activeTab === "variants" && (
            <div className="space-y-4">
              {/* Authoritative Inventory Ledger Notice */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#FEDF89] bg-[#FFFAEB] px-4 py-3 text-xs text-[#7A4905]">
                <div className="flex items-center gap-2">
                  <Boxes className="h-4 w-4 text-[#9A5B04] shrink-0" />
                  <span>
                    <strong>مرجعیت دفتر کل انبار:</strong> موجودی کالا در ویرایشگر
                    کاتالوگ فقط خواندنی است. برای ثبت رسید تولید یا درخواست اصلاح
                    موجودی از کارتابل انبار استفاده کنید.
                  </span>
                </div>
                <Link
                  href="/inventory/operations"
                  className="font-semibold text-[#1813FB] underline"
                >
                  ثبت رسید / اصلاح موجودی در انبار
                </Link>
              </div>

              {/* Add Color & Assign Explicit Sizes Control Panel */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 lg:col-span-7 space-y-3">
                  <h3 className="text-sm font-semibold text-[#080707]">
                    افزودن سایزهای مجاز برای هر رنگ (انتخاب صریح، بدون ضرب دکارتی)
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="text-xs font-medium text-[#626775]">
                      انتخاب رنگ:
                    </label>
                    <select
                      value={selectedColorForAdd}
                      onChange={(e) =>
                        setSelectedColorForAdd(Number(e.target.value))
                      }
                      className="h-9 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#080707]"
                    >
                      {colors.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.family})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="text-[11px] text-[#626775] mb-1.5">
                      برای افزودن سایز به رنگ انتخاب‌شده، روی سایز کلیک کنید:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {candidateSizes.map((sz) => {
                        const alreadyExists = variants.some(
                          (v) =>
                            v.colorId === selectedColorForAdd &&
                            v.sizeLabel === sz
                        );
                        return (
                          <button
                            key={sz}
                            type="button"
                            disabled={alreadyExists}
                            onClick={() =>
                              handleAddExplicitSize(selectedColorForAdd, sz)
                            }
                            className={`inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium ${
                              alreadyExists
                                ? "border-[#A6F4C5] bg-[#ECFDF3] text-[#127A4B] cursor-default"
                                : "border-[#E5E7EB] bg-white text-[#080707] hover:border-[#1813FB] hover:bg-[#F0EEFF]"
                            }`}
                          >
                            {alreadyExists ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Plus className="h-3 w-3" />
                            )}
                            <span>{sz}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom Size Entry */}
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      value={customSizeInput}
                      onChange={(e) => setCustomSizeInput(e.target.value)}
                      placeholder="یا سایز دلخواه بنویسید (مثال: 3XL یا فری‌سایز)"
                      className="h-9 flex-1 rounded-xl border border-[#E5E7EB] px-3 text-xs text-[#080707]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        handleAddExplicitSize(
                          selectedColorForAdd,
                          customSizeInput
                        );
                        setCustomSizeInput("");
                      }}
                      className="h-9 rounded-xl bg-[#F0EEFF] px-3 text-xs font-semibold text-[#1813FB] hover:bg-[#E4E1FF]"
                    >
                      افزودن سایز
                    </button>
                  </div>
                </div>

                {/* Inline Reusable Color Creator */}
                <div className="rounded-2xl border border-[#E5E7EB] bg-white p-4 lg:col-span-5 space-y-3">
                  <h3 className="text-sm font-semibold text-[#080707]">
                    ساخت رنگ جدید در کتابخانه رنگ‌ها
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={newColorName}
                      onChange={(e) => setNewColorName(e.target.value)}
                      placeholder="نام رنگ (مثال: سبز یشمی)"
                      className="h-9 rounded-xl border border-[#E5E7EB] px-2.5 text-xs text-[#080707]"
                    />
                    <select
                      value={newColorFamily}
                      onChange={(e) => setNewColorFamily(e.target.value)}
                      className="h-9 rounded-xl border border-[#E5E7EB] bg-white px-2.5 text-xs text-[#080707]"
                    >
                      <option value="خنثی">خانواده خنثی</option>
                      <option value="گرم">خانواده گرم</option>
                      <option value="سرد">خانواده سرد</option>
                      <option value="خاکی">خانواده خاکی</option>
                    </select>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={newColorHex}
                        onChange={(e) => setNewColorHex(e.target.value)}
                        aria-label="انتخاب کد رنگ"
                        className="h-9 w-11 cursor-pointer rounded-lg border border-[#E5E7EB] p-0.5"
                      />
                      <input
                        type="text"
                        dir="ltr"
                        value={newColorHex}
                        onChange={(e) => setNewColorHex(e.target.value)}
                        className="h-9 w-full rounded-xl border border-[#E5E7EB] px-2 font-mono text-xs text-left"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={creatingColor || !newColorName.trim()}
                      onClick={handleCreateInlineColor}
                      className="h-9 rounded-xl bg-[#1813FB] px-3 text-xs font-medium text-white hover:bg-[#110CD1] disabled:opacity-50"
                    >
                      {creatingColor ? "در حال ثبت..." : "+ ثبت رنگ قابل استفاده مجدد"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Grouped by Color Variant Matrix */}
              {distinctVariantColorIds.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#D0D5DD] bg-white p-8 text-center text-xs text-[#626775]">
                  هنوز هیچ ترکیبی تعریف نشده است. از پنل بالا یک رنگ انتخاب کرده
                  و فقط سایزهای واقعی آن رنگ را اضافه کنید.
                </div>
              ) : (
                <div className="space-y-3">
                  {distinctVariantColorIds.map((cId) => {
                    const colorRows = variants.filter(
                      (v) => v.colorId === cId
                    );
                    const first = colorRows[0];
                    if (!first) return null;

                    return (
                      <div
                        key={cId}
                        className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFEFF5] bg-[#FAFAFE] px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="h-4 w-4 rounded-full border border-black/15"
                              style={{ backgroundColor: first.colorHex }}
                            />
                            <span className="text-sm font-semibold text-[#080707]">
                              رنگ {first.colorName}
                            </span>
                            <span className="rounded-full bg-[#F0EEFF] px-2 py-0.5 text-[11px] font-medium text-[#1813FB]">
                              {formatNumberFa(colorRows.length)} سایز تعریف‌شده
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-xs">
                            <span className="text-[#626775]">
                              قیمت اختصاصی رنگ (اختیاری):
                            </span>
                            <input
                              type="number"
                              min={0}
                              dir="ltr"
                              placeholder={String(basePrice)}
                              value={first.colorPriceOverride ?? ""}
                              onChange={(e) =>
                                updateColorLevelPrice(cId, e.target.value)
                              }
                              className="h-8 w-28 rounded-lg border border-[#E5E7EB] bg-white px-2 text-left font-mono text-xs"
                            />
                          </div>
                        </div>

                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[720px] text-right text-xs">
                            <thead>
                              <tr className="border-b border-[#EFEFF5] text-[11px] text-[#626775]">
                                <th className="px-4 py-2 font-medium">سایز</th>
                                <th className="px-4 py-2 font-medium">
                                  کد SKU یکتا
                                </th>
                                <th className="px-4 py-2 font-medium">
                                  قیمت موثر
                                </th>
                                <th className="px-4 py-2 font-medium">
                                  موجودی فیزیکی / رزرو
                                </th>
                                <th className="px-4 py-2 font-medium">
                                  قابل فروش
                                </th>
                                <th className="px-4 py-2 font-medium">
                                  وضعیت تنوع
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#EFEFF5]">
                              {colorRows.map((row) => {
                                const rKey = row.tempKey || `v-${row.id}`;
                                const metrics = resolveVariantMetrics({
                                  productBasePrice: basePrice,
                                  colorPriceOverride: row.colorPriceOverride,
                                  skuPriceOverride: row.skuPriceOverride,
                                  discountMode: row.discountMode,
                                  discountType: row.discountType,
                                  discountValue: row.discountValue,
                                  physicalStock: row.physicalStock,
                                  reservedStock: row.reservedStock,
                                  lowStockThreshold: row.lowStockThreshold,
                                  isActive: row.isActive,
                                });
                                return (
                                  <tr key={rKey} className="hover:bg-[#FAFAFE]">
                                    <td className="px-4 py-2.5 font-semibold text-[#080707]">
                                      {row.sizeLabel}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <input
                                        type="text"
                                        dir="ltr"
                                        value={row.sku}
                                        onChange={(e) =>
                                          updateVariantField(rKey, {
                                            sku: e.target.value,
                                          })
                                        }
                                        className="h-8 w-44 rounded-lg border border-[#E5E7EB] px-2 font-mono text-xs text-left"
                                      />
                                    </td>
                                    <td className="px-4 py-2.5 font-semibold text-[#080707]">
                                      {formatToman(metrics.effectivePrice)}
                                    </td>
                                    <td className="px-4 py-2.5 text-[#626775]">
                                      {formatNumberFa(row.physicalStock)} فیزیکی /{" "}
                                      {formatNumberFa(row.reservedStock)} رزرو
                                    </td>
                                    <td className="px-4 py-2.5 font-bold text-[#080707]">
                                      {formatNumberFa(metrics.sellableStock)} عدد
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={row.isActive}
                                          onChange={(e) =>
                                            updateVariantField(rKey, {
                                              isActive: e.target.checked,
                                            })
                                          }
                                          className="h-4 w-4 rounded accent-[#1813FB]"
                                        />
                                        <span className="text-xs">
                                          {row.isActive ? "فعال" : "بازنشسته / غیرفعال"}
                                        </span>
                                      </label>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Pricing Hierarchy & Tri-State Direct Discount */}
          {activeTab === "pricing" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-[#C1BCF2] bg-[#F0EEFF]/60 p-4 text-xs text-[#344054]">
                <strong>سلسله‌مراتب قیمت‌گذاری و تخفیف سه‌وضعیتی:</strong> قیمت پایه
                از سطح محصول ({formatToman(basePrice)}) به سطح رنگ و سپس به سطح SKU
                به ارث می‌رسد. هر SKU می‌تواند یکی از سه حالت تخفیف مستقیم را داشته
                باشد: <strong>ارث‌بری</strong>،{" "}
                <strong>بدون تخفیف مستقیم (صریح)</strong> یا{" "}
                <strong>تخفیف مستقیم مستقل</strong>.
              </div>

              {/* Bulk Pricing / Discount Action Bar */}
              {selectedVariantKeys.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#1813FB]/30 bg-white px-4 py-3 text-xs shadow-2xs">
                  <span className="font-semibold text-[#1813FB]">
                    {formatNumberFa(selectedVariantKeys.length)} تنوع برای ویرایش
                    گروهی تخفیف انتخاب شده است
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={90}
                      dir="ltr"
                      value={bulkDiscountPct}
                      onChange={(e) => setBulkDiscountPct(e.target.value)}
                      className="h-8 w-16 rounded-lg border border-[#E5E7EB] px-2 text-left font-mono text-xs"
                    />
                    <span>٪ تخفیف مستقیم</span>
                    <button
                      type="button"
                      onClick={handleBulkApplyDiscount}
                      className="h-8 rounded-lg bg-[#1813FB] px-3 font-medium text-white"
                    >
                      اعمال به انتخاب‌شده‌ها
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-[#E5E7EB] bg-white overflow-hidden">
                <div className="overflow-x-auto kv-scroll-table">
                  <table className="w-full min-w-[860px] text-right text-xs">
                    <thead>
                      <tr className="border-b border-[#E5E7EB] bg-[#FAFAFE] text-[11px] font-semibold text-[#626775]">
                        <th className="w-10 px-3 py-3 text-center">انتخاب</th>
                        <th className="px-3 py-3">رنگ و سایز (SKU)</th>
                        <th className="px-3 py-3">قیمت پایه محصول</th>
                        <th className="px-3 py-3">قیمت رنگ</th>
                        <th className="px-3 py-3">قیمت اختصاصی SKU</th>
                        <th className="px-3 py-3">وضعیت سه‌گانه تخفیف مستقیم</th>
                        <th className="px-3 py-3">مقدار تخفیف</th>
                        <th className="px-3 py-3">قیمت نهایی فروش</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EFEFF5]">
                      {variants.map((v) => {
                        const rKey = v.tempKey || `v-${v.id}`;
                        const metrics = resolveVariantMetrics({
                          productBasePrice: basePrice,
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
                        return (
                          <tr key={rKey} className="hover:bg-[#FAFAFE]">
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={selectedVariantKeys.includes(rKey)}
                                onChange={() =>
                                  setSelectedVariantKeys((prev) =>
                                    prev.includes(rKey)
                                      ? prev.filter((k) => k !== rKey)
                                      : [...prev, rKey]
                                  )
                                }
                                className="h-4 w-4 rounded accent-[#1813FB]"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2">
                                <span
                                  className="h-3.5 w-3.5 rounded-full border border-black/15"
                                  style={{ backgroundColor: v.colorHex }}
                                />
                                <span className="font-semibold text-[#080707]">
                                  {v.colorName} • {v.sizeLabel}
                                </span>
                              </div>
                              <div className="font-mono text-[10px] text-[#626775]">
                                <bdi dir="ltr">{v.sku}</bdi>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-[#626775]">
                              {formatToman(basePrice)}
                            </td>
                            <td className="px-3 py-2.5 text-[#626775]">
                              {v.colorPriceOverride !== null
                                ? formatToman(v.colorPriceOverride)
                                : "ارث‌بری"}
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                min={0}
                                dir="ltr"
                                placeholder="ارث‌بری"
                                value={v.skuPriceOverride ?? ""}
                                onChange={(e) =>
                                  updateVariantField(rKey, {
                                    skuPriceOverride:
                                      e.target.value === ""
                                        ? null
                                        : Math.max(0, Number(e.target.value)),
                                  })
                                }
                                className="h-8 w-28 rounded-lg border border-[#E5E7EB] px-2 text-left font-mono text-xs"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <select
                                value={v.discountMode}
                                onChange={(e) =>
                                  updateVariantField(rKey, {
                                    discountMode: e.target.value as
                                      | "inherit"
                                      | "none"
                                      | "explicit",
                                    discountType:
                                      e.target.value === "explicit"
                                        ? v.discountType || "percent"
                                        : null,
                                  })
                                }
                                className="h-8 rounded-lg border border-[#E5E7EB] bg-white px-2 text-xs text-[#080707]"
                              >
                                <option value="inherit">
                                  ارث‌بری (پیش‌فرض)
                                </option>
                                <option value="none">
                                  بدون تخفیف مستقیم (صریح)
                                </option>
                                <option value="explicit">
                                  تخفیف مستقیم روی این SKU
                                </option>
                              </select>
                            </td>
                            <td className="px-3 py-2.5">
                              {v.discountMode === "explicit" ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    dir="ltr"
                                    value={v.discountValue ?? 0}
                                    onChange={(e) =>
                                      updateVariantField(rKey, {
                                        discountValue: Math.max(
                                          0,
                                          Number(e.target.value) || 0
                                        ),
                                      })
                                    }
                                    className="h-8 w-20 rounded-lg border border-[#E5E7EB] px-2 text-left font-mono text-xs"
                                  />
                                  <select
                                    value={v.discountType || "percent"}
                                    onChange={(e) =>
                                      updateVariantField(rKey, {
                                        discountType: e.target.value as
                                          | "percent"
                                          | "fixed",
                                      })
                                    }
                                    className="h-8 rounded-lg border border-[#E5E7EB] bg-white px-1.5 text-xs"
                                  >
                                    <option value="percent">٪</option>
                                    <option value="fixed">تومان</option>
                                  </select>
                                </div>
                              ) : (
                                <span className="text-[11px] text-[#626775]">
                                  —
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-bold text-[#1813FB]">
                                {formatToman(metrics.effectivePrice)}
                              </div>
                              {metrics.directDiscountAmount > 0 && (
                                <div className="text-[10px] text-[#127A4B]">
                                  کسر {formatToman(metrics.directDiscountAmount)}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Color-Dependent Product Media & Storefront Contract Preview */}
          {activeTab === "media" && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              {/* Left 7 Cols: Per-Color Media Organizer */}
              <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-7 space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-[#080707]">
                    گالری تصاویر و ویدیوهای اختصاصی هر رنگ
                  </h3>
                  <p className="mt-0.5 text-xs text-[#626775]">
                    هر رنگ کلکسیون رسانه مستقل خود را دارد (تصویر اصلی، گالری،
                    هاور و ویدیو جزئیات).
                  </p>
                </div>

                {/* Color Selector Tabs */}
                <div className="flex flex-wrap gap-2">
                  {(distinctVariantColorIds.length > 0
                    ? colors.filter(
                        (c) =>
                          distinctVariantColorIds.includes(c.id) ||
                          media.some((m) => m.colorId === c.id)
                      )
                    : colors
                  ).map((c) => {
                      const active = activeMediaColorId === c.id;
                      const countForColor = media.filter(
                        (m) => m.colorId === c.id
                      ).length;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setActiveMediaColorId(c.id)}
                          className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-medium ${
                            active
                              ? "border-[#1813FB] bg-[#F0EEFF] text-[#1813FB] font-semibold"
                              : "border-[#E5E7EB] bg-white text-[#344054]"
                          }`}
                        >
                          <span
                            className="h-3.5 w-3.5 rounded-full border border-black/15"
                            style={{ backgroundColor: c.hex }}
                          />
                          <span>{c.name}</span>
                          <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] text-[#626775]">
                            {formatNumberFa(countForColor)}
                          </span>
                        </button>
                      );
                    })}
                </div>

                {/* Add Media Item to Selected Color */}
                <div className="rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] p-3.5 space-y-2.5">
                  <div className="text-xs font-semibold text-[#080707]">
                    افزودن رسانه جدید به رنگ انتخاب‌شده
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <select
                      value={newMediaRole}
                      onChange={(e) =>
                        setNewMediaRole(
                          e.target.value as
                            | "main"
                            | "gallery"
                            | "hover"
                            | "detail_video"
                        )
                      }
                      className="h-9 rounded-xl border border-[#E5E7EB] bg-white px-2.5 text-xs"
                    >
                      <option value="main">تصویر اصلی (Main)</option>
                      <option value="gallery">تصویر گالری (Gallery)</option>
                      <option value="hover">تصویر/ویدیو هاور (Hover)</option>
                      <option value="detail_video">
                        ویدیو جزئیات پارچه (Detail Video)
                      </option>
                    </select>

                    <select
                      value={newMediaUrl}
                      onChange={(e) => setNewMediaUrl(e.target.value)}
                      className="h-9 rounded-xl border border-[#E5E7EB] bg-white px-2.5 text-xs sm:col-span-2"
                    >
                      {PRESET_STUDIO_URLS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      value={newMediaAlt}
                      onChange={(e) => setNewMediaAlt(e.target.value)}
                      placeholder="متن جایگزین (Alt Text) برای دسترس‌پذیری و سئو..."
                      className="h-9 flex-1 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!activeMediaColorId) return;
                        setMedia((prev) => [
                          ...prev,
                          {
                            colorId: activeMediaColorId,
                            mediaRole: newMediaRole,
                            url: newMediaUrl,
                            altText: newMediaAlt || name,
                          },
                        ]);
                        setNewMediaAlt("");
                        markDirty();
                      }}
                      className="h-9 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1]"
                    >
                      + افزودن به رنگ فعلی
                    </button>
                  </div>
                </div>

                {/* Media List for Active Color */}
                <div className="space-y-2">
                  {media
                    .map((m, idx) => ({ m, idx }))
                    .filter(({ m }) => m.colorId === activeMediaColorId)
                    .map(({ m, idx }) => (
                      <div
                        key={`${m.url}-${idx}`}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[#E5E7EB] bg-white p-2.5"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={m.url}
                            alt={m.altText || name}
                            className="h-14 w-14 rounded-lg object-cover border border-[#EFEFF5]"
                          />
                          <div className="min-w-0">
                            <StatusBadge
                              label={
                                m.mediaRole === "main"
                                  ? "تصویر اصلی"
                                  : m.mediaRole === "hover"
                                  ? "تصویر هاور"
                                  : m.mediaRole === "detail_video"
                                  ? "ویدیو جزئیات"
                                  : "گالری"
                              }
                              tone={m.mediaRole === "main" ? "indigo" : "neutral"}
                            />
                            <div className="mt-1 truncate text-xs text-[#344054]">
                              {m.altText || "بدون توضیح Alt"}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setMedia((prev) => prev.filter((_, i) => i !== idx));
                            markDirty();
                          }}
                          className="rounded-lg p-1.5 text-[#B44F40] hover:bg-[#FEF3F2]"
                          title="حذف رسانه"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                </div>
              </div>

              {/* Right 5 Cols: Interactive Storefront Behavior Contract Widget */}
              <div className="rounded-2xl border border-[#C1BCF2] bg-white p-5 lg:col-span-5 space-y-3">
                <div className="flex items-center justify-between border-b border-[#EFEFF5] pb-2.5">
                  <div>
                    <h3 className="text-sm font-semibold text-[#080707]">
                      شبیه‌ساز قرارداد رفتار ویترین فروشگاه
                    </h3>
                    <p className="text-[11px] text-[#626775]">
                      تغییر رنگ باید رسانه را عوض کند، فقط سایزهای مجاز همان رنگ
                      را نشان دهد و سایز نامعتبر قبلی را پاک کند.
                    </p>
                  </div>
                </div>

                <div className="overflow-hidden rounded-xl border border-[#EFEFF5] bg-[#F7F7FB] aspect-[4/3]">
                  <img
                    src={
                      previewColorMedia.find((m) => m.mediaRole === "main")
                        ?.url ||
                      previewColorMedia[0]?.url ||
                      primaryImage
                    }
                    alt={name}
                    className="h-full w-full object-cover"
                  />
                </div>

                <div>
                  <div className="text-xs font-medium text-[#626775] mb-1.5">
                    ۱. انتخاب رنگ در ویترین:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {distinctVariantColorIds.map((cId) => {
                      const c = colors.find((x) => x.id === cId);
                      if (!c) return null;
                      const sel = previewSelectedColorId === cId;
                      return (
                        <button
                          key={cId}
                          type="button"
                          onClick={() => handlePreviewColorSwitch(cId)}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
                            sel
                              ? "border-[#1813FB] bg-[#F0EEFF] font-semibold text-[#1813FB]"
                              : "border-[#E5E7EB] bg-white text-[#344054]"
                          }`}
                        >
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: c.hex }}
                          />
                          <span>{c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-[#626775] mb-1.5">
                    ۲. سایزهای مجاز برای رنگ انتخاب‌شده:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {previewValidVariants.map((v) => (
                      <button
                        key={v.sizeLabel}
                        type="button"
                        onClick={() => setPreviewSelectedSize(v.sizeLabel)}
                        className={`rounded-lg border px-3 py-1 text-xs font-medium ${
                          previewSelectedSize === v.sizeLabel
                            ? "border-[#1813FB] bg-[#1813FB] text-white"
                            : "border-[#E5E7EB] bg-white text-[#080707]"
                        }`}
                      >
                        {v.sizeLabel}
                      </button>
                    ))}
                  </div>
                </div>

                {previewActiveVariant && previewMetrics && (
                  <div className="rounded-xl bg-[#FAFAFE] border border-[#EFEFF5] p-3 text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-[#626775]">کد SKU فعال:</span>
                      <span className="font-mono font-semibold">
                        <bdi dir="ltr">{previewActiveVariant.sku}</bdi>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#626775]">قیمت موثر نهایی:</span>
                      <span className="font-bold text-[#1813FB]">
                        {formatToman(previewMetrics.effectivePrice)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#626775]">وضعیت موجودی:</span>
                      <span
                        className={
                          previewMetrics.isOutOfStock
                            ? "font-semibold text-[#B44F40]"
                            : "font-semibold text-[#127A4B]"
                        }
                      >
                        {previewMetrics.isOutOfStock
                          ? "ناموجود (دکمه خرید غیرفعال)"
                          : `${formatNumberFa(previewMetrics.sellableStock)} عدد قابل سفارش`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: Size Guides & Specifications */}
          {activeTab === "size_guide" && (
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-[#080707] mb-1.5">
                  انتخاب الگوی راهنمای اندازه‌گیری (متناسب با نوع کالا)
                </label>
                <select
                  value={sizeTemplateId ?? ""}
                  onChange={(e) => {
                    setSizeTemplateId(Number(e.target.value));
                    markDirty();
                  }}
                  className="h-10 w-full max-w-md rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs text-[#080707]"
                >
                  {sizeTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.categoryType})
                    </option>
                  ))}
                </select>
                {activeTemplate && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {activeTemplate.measurementSchemaJson.map((field) => (
                      <span
                        key={field}
                        className="rounded-lg bg-[#F0EEFF] px-2.5 py-1 text-[11px] font-medium text-[#1813FB]"
                      >
                        {field}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-[#EFEFF5] pt-4">
                <h3 className="text-sm font-semibold text-[#080707] mb-3">
                  مشخصات فنی و جنس پارچه
                </h3>
                <div className="space-y-2 max-w-xl">
                  {Object.entries(specifications).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={k}
                        className="h-9 w-44 rounded-xl border border-[#EFEFF5] bg-[#F7F7FB] px-3 text-xs font-medium"
                      />
                      <input
                        type="text"
                        value={v}
                        onChange={(e) => {
                          setSpecifications((prev) => ({
                            ...prev,
                            [k]: e.target.value,
                          }));
                          markDirty();
                        }}
                        className="h-9 flex-1 rounded-xl border border-[#E5E7EB] px-3 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const copy = { ...specifications };
                          delete copy[k];
                          setSpecifications(copy);
                          markDirty();
                        }}
                        className="rounded-lg p-1.5 text-[#B44F40] hover:bg-[#FEF3F2]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}

                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="text"
                      value={newSpecKey}
                      onChange={(e) => setNewSpecKey(e.target.value)}
                      placeholder="عنوان ویژگی (مثال: گرماژ پارچه)"
                      className="h-9 w-44 rounded-xl border border-[#E5E7EB] px-3 text-xs"
                    />
                    <input
                      type="text"
                      value={newSpecVal}
                      onChange={(e) => setNewSpecVal(e.target.value)}
                      placeholder="مقدار (مثال: ۳۸۰ گرم)"
                      className="h-9 flex-1 rounded-xl border border-[#E5E7EB] px-3 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (!newSpecKey.trim()) return;
                        setSpecifications((prev) => ({
                          ...prev,
                          [newSpecKey.trim()]: newSpecVal.trim(),
                        }));
                        setNewSpecKey("");
                        setNewSpecVal("");
                        markDirty();
                      }}
                      className="h-9 rounded-xl bg-[#F0EEFF] px-3 text-xs font-semibold text-[#1813FB]"
                    >
                      + افزودن
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: Related Products */}
          {activeTab === "related" && (
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-3">
              <h3 className="text-sm font-semibold text-[#080707]">
                انتخاب محصولات مکمل و پیشنهادی در صفحه محصول
              </h3>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {otherProducts.map((op) => {
                  const checked = relatedProductIds.includes(op.id);
                  return (
                    <label
                      key={op.id}
                      className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                        checked
                          ? "border-[#1813FB] bg-[#F0EEFF]/60"
                          : "border-[#E5E7EB] bg-white hover:bg-[#FAFAFE]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setRelatedProductIds((prev) =>
                            prev.includes(op.id)
                              ? prev.filter((x) => x !== op.id)
                              : [...prev, op.id]
                          );
                          markDirty();
                        }}
                        className="h-4 w-4 rounded accent-[#1813FB]"
                      />
                      <img
                        src={op.primaryImage}
                        alt={op.name}
                        className="h-11 w-11 rounded-lg object-cover border border-[#EFEFF5]"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-[#080707]">
                          {op.name}
                        </div>
                        <div className="text-[11px] text-[#626775]">
                          {formatToman(op.basePrice)}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 7: SEO & Publication */}
          {activeTab === "seo" && (
            <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[#080707] mb-1.5">
                    عنوان سئو (Meta Title)
                  </label>
                  <input
                    type="text"
                    value={seoTitle}
                    onChange={(e) => {
                      setSeoTitle(e.target.value);
                      markDirty();
                    }}
                    className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#080707] mb-1.5">
                    نامک URL (Slug)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    readOnly
                    value={slug}
                    className="h-10 w-full rounded-xl border border-[#EFEFF5] bg-[#F7F7FB] px-3 text-left font-mono text-xs text-[#626775]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#080707] mb-1.5">
                    توضیحات متا (Meta Description)
                  </label>
                  <textarea
                    rows={3}
                    value={seoDescription}
                    onChange={(e) => {
                      setSeoDescription(e.target.value);
                      markDirty();
                    }}
                    className="w-full rounded-xl border border-[#E5E7EB] p-3 text-xs"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] p-4 space-y-2 text-xs">
                <div className="font-semibold text-[#080707]">
                  چک‌لیست آمادگی انتشار محصول:
                </div>
                <div className="flex items-center gap-2">
                  {variants.some((v) => v.isActive) ? (
                    <Check className="h-4 w-4 text-[#127A4B]" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-[#9A5B04]" />
                  )}
                  <span>
                    تعداد تنوع فعال: {formatNumberFa(variants.filter((v) => v.isActive).length)} کد SKU
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {media.length > 0 ? (
                    <Check className="h-4 w-4 text-[#127A4B]" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-[#9A5B04]" />
                  )}
                  <span>
                    رسانه‌های ثبت‌شده: {formatNumberFa(media.length)} تصویر/ویدیو
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProductEditorPage() {
  return (
    <AdminShell>
      <Suspense fallback={<LoadingState label="در حال بارگذاری ویرایشگر محصول..." />}>
        <ProductEditorContent />
      </Suspense>
    </AdminShell>
  );
}
