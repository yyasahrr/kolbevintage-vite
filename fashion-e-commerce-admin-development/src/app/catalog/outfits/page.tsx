"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import {
  StatusBadge,
  getPublicationBadge,
} from "@/components/admin/ui/StatusBadge";
import {
  LoadingState,
  UnauthorizedState,
} from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import { formatNumberFa, formatToman } from "@/lib/formatters";
import { Layers, Plus, AlertTriangle, CheckCircle2 } from "lucide-react";

interface OutfitItemRow {
  id: number;
  productId: number;
  productName: string;
  productCode: string;
  productImage: string;
  sku: string;
  colorName: string;
  sizeLabel: string;
  effectivePrice: number;
  sellableStock: number;
  isRequired: boolean;
}

interface OutfitRow {
  id: number;
  name: string;
  slug: string;
  description: string;
  heroImage: string;
  pricingMode: string;
  lookDiscountPercent: number;
  fixedLookPrice: number | null;
  status: string;
  contractNote: string;
  itemsSumPrice: number;
  minComponentStock: number;
  items: OutfitItemRow[];
}

interface AvailableProd {
  id: number;
  code: string;
  name: string;
  basePrice: number;
  primaryImage: string;
}

export default function OutfitsPage() {
  const { can } = useRole();
  const [outfits, setOutfits] = useState<OutfitRow[]>([]);
  const [availableProducts, setAvailableProducts] = useState<AvailableProd[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pricingMode, setPricingMode] = useState("look_discount_percent");
  const [lookDiscountPercent, setLookDiscountPercent] = useState("10");
  const [fixedLookPrice, setFixedLookPrice] = useState("4900000");
  const [selectedProdIds, setSelectedProdIds] = useState<number[]>([]);
  const [formMsg, setFormMsg] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);

  const loadOutfits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/outfits", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setOutfits(data.outfits || []);
        setAvailableProducts(data.availableProducts || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOutfits();
  }, [loadOutfits]);

  if (!can("catalog", "view")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="مدیریت استایل‌ها و ست‌های لباس" />
      </AdminShell>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    setFormMsg(null);
    if (!name.trim() || selectedProdIds.length < 2) {
      setFormErr("عنوان استایل و انتخاب حداقل ۲ محصول زیرمجموعه الزامی است.");
      return;
    }

    const res = await fetch("/api/outfits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim(),
        pricingMode,
        lookDiscountPercent: Number(lookDiscountPercent) || 0,
        fixedLookPrice:
          pricingMode === "fixed_look_price_pending_approval"
            ? Number(fixedLookPrice) || 0
            : null,
        productIds: selectedProdIds,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setFormErr(data?.error || "خطا در ثبت ست لباس");
    } else {
      setName("");
      setDescription("");
      setSelectedProdIds([]);
      setFormMsg(
        `ست «${data.outfit.name}» در وضعیت پیش‌نویس ایجاد شد (رزرو موجودی در سطح SKU اقلام انجام می‌شود).`
      );
      loadOutfits();
    }
  };

  const toggleOutfitPublish = async (o: OutfitRow) => {
    await fetch("/api/outfits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: o.id,
        status: o.status === "published" ? "draft" : "published",
      }),
    });
    loadOutfits();
  };

  return (
    <AdminShell>
      <PageHeader
        title="مدیریت استایل‌ها و ست‌های لباس (Outfits & Curated Looks)"
        description="ترکیب چندین محصول مستقل در یک استایل کامل با رزرو موجودی از SKUهای اصلی و تفکیک شفاف قواعد قیمت‌گذاری"
        badge={
          <StatusBadge
            label="موجودی بدون تکرار (SKU-Level Reservation)"
            tone="indigo"
          />
        }
      />

      {/* Explicit Commercial Pricing & Inventory Contract Banner */}
      <div className="mb-5 rounded-2xl border border-[#FEDF89] bg-[#FFFAEB] p-4 text-xs text-[#7A4905] space-y-1.5">
        <div className="flex items-center gap-2 font-semibold text-[#9A5B04]">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            قرارداد مرجع قیمت‌گذاری و موجودی استایل‌ها (بدون ایجاد موجودی
            مجزا):
          </span>
        </div>
        <p className="leading-relaxed">
          ۱. برای ست‌های لباس هیچ موجودی مستقلی ساخته نمی‌شود؛ موجودی قابل فروش
          ست برابر حداقل موجودی قابل فروش SKUهای اجباری زیرمجموعه است. ۲. مدل
          «قیمت ثابت ست» به عنوان{" "}
          <strong>پیش‌نویس نیازمند تصویب نهایی مالی</strong> ثبت می‌شود تا
          تکلیف خرید جزئی، تجمیع تخفیف‌ها و مرجوعی تک‌قلم در قرارداد تجاری
          نهایی شود.
        </p>
      </div>

      {formMsg && (
        <div className="mb-4 rounded-xl border border-[#A6F4C5] bg-[#ECFDF3] px-4 py-2.5 text-xs font-medium text-[#127A4B]">
          {formMsg}
        </div>
      )}
      {formErr && (
        <div className="mb-4 rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-2.5 text-xs font-medium text-[#B44F40]">
          {formErr}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Outfits List */}
        <div className="space-y-4 lg:col-span-8">
          {loading ? (
            <LoadingState label="در حال بارگذاری ست‌های لباس..." />
          ) : (
            outfits.map((o) => {
              const pub = getPublicationBadge(o.status);
              const discountedLookTotal =
                o.pricingMode === "look_discount_percent"
                  ? Math.round(
                      o.itemsSumPrice * (1 - (o.lookDiscountPercent || 0) / 100)
                    )
                  : o.itemsSumPrice;

              return (
                <div
                  key={o.id}
                  className="rounded-2xl border border-[#E5E7EB] bg-white p-5 space-y-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3.5">
                      <img
                        src={o.heroImage}
                        alt={o.name}
                        className="h-20 w-20 rounded-xl object-cover border border-[#EFEFF5] shrink-0"
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-[#080707]">
                            {o.name}
                          </h3>
                          <StatusBadge label={pub.label} tone={pub.tone} />
                        </div>
                        <p className="mt-1 text-xs text-[#626775]">
                          {o.description}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                          <span>
                            مجموع قیمت اقلام:{" "}
                            <strong className="text-[#080707]">
                              {formatToman(o.itemsSumPrice)}
                            </strong>
                          </span>
                          {o.pricingMode === "look_discount_percent" && (
                            <span className="text-[#1813FB] font-semibold">
                              با {formatNumberFa(o.lookDiscountPercent)}٪ تخفیف
                              خرید کامل ست: {formatToman(discountedLookTotal)}
                            </span>
                          )}
                          {o.pricingMode ===
                            "fixed_look_price_pending_approval" && (
                            <StatusBadge
                              label={`قیمت ثابت پیشنهادی (${formatToman(o.fixedLookPrice)}) — نیازمند تصویب مالی`}
                              tone="warning"
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleOutfitPublish(o)}
                      className="h-9 shrink-0 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-medium text-[#080707] hover:bg-[#F7F7FB]"
                    >
                      {o.status === "published"
                        ? "بازگرداندن به پیش‌نویس"
                        : "انتشار استایل"}
                    </button>
                  </div>

                  {/* Component Products Table */}
                  <div className="rounded-xl border border-[#EFEFF5] bg-[#FAFAFE] p-3">
                    <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-[#4B505E]">
                      <span>
                        اقلام زیرمجموعه استایل ({formatNumberFa(o.items.length)}{" "}
                        محصول)
                      </span>
                      <span>
                        حداقل موجودی قابل فروش ست:{" "}
                        <strong className="text-[#080707]">
                          {formatNumberFa(o.minComponentStock)} ست کامل
                        </strong>
                      </span>
                    </div>

                    <div className="space-y-2">
                      {o.items.map((it) => (
                        <div
                          key={it.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 border border-[#EFEFF5] text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <img
                              src={it.productImage}
                              alt={it.productName}
                              className="h-9 w-9 rounded-lg object-cover"
                            />
                            <div>
                              <div className="font-semibold text-[#080707]">
                                {it.productName}
                              </div>
                              <div className="text-[11px] text-[#626775]">
                                {it.colorName} • سایز {it.sizeLabel} •{" "}
                                <bdi dir="ltr">{it.sku}</bdi>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <StatusBadge
                              label={it.isRequired ? "جزء اجباری ست" : "اختیاری"}
                              tone={it.isRequired ? "indigo" : "neutral"}
                            />
                            <span className="font-semibold text-[#080707]">
                              {formatToman(it.effectivePrice)}
                            </span>
                            <span className="text-[11px] text-[#626775]">
                              (موجودی: {formatNumberFa(it.sellableStock)})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-[#626775]">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#1813FB] shrink-0" />
                    <span>{o.contractNote}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Create New Curated Look */}
        <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5 lg:col-span-4 h-fit space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-[#1813FB]" />
            <h2 className="text-sm font-semibold text-[#080707]">
              ساخت استایل / ست لباس جدید
            </h2>
          </div>

          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                عنوان استایل
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: استایل کژوال آخر هفته"
                className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                توضیح استایل و پیشنهاد ست‌بندی
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-[#E5E7EB] p-2.5 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1">
                مدل قیمت‌گذاری ست
              </label>
              <select
                value={pricingMode}
                onChange={(e) => setPricingMode(e.target.value)}
                className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs"
              >
                <option value="sum_of_items">
                  مجموع قیمت موثر اقلام انتخاب‌شده
                </option>
                <option value="look_discount_percent">
                  تخفیف درصدی هنگام خرید کامل ست
                </option>
                <option value="fixed_look_price_pending_approval">
                  قیمت ثابت ست (نیازمند تصویب قرارداد مالی)
                </option>
              </select>
            </div>

            {pricingMode === "look_discount_percent" && (
              <div>
                <label className="block text-xs font-medium text-[#344054] mb-1">
                  درصد تخفیف خرید کامل ست
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  dir="ltr"
                  value={lookDiscountPercent}
                  onChange={(e) => setLookDiscountPercent(e.target.value)}
                  className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
                />
              </div>
            )}

            {pricingMode === "fixed_look_price_pending_approval" && (
              <div>
                <label className="block text-xs font-medium text-[#344054] mb-1">
                  قیمت ثابت پیشنهادی ست (تومان)
                </label>
                <input
                  type="number"
                  min={0}
                  dir="ltr"
                  value={fixedLookPrice}
                  onChange={(e) => setFixedLookPrice(e.target.value)}
                  className="h-10 w-full rounded-xl border border-[#E5E7EB] px-3 text-left font-mono text-xs"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-[#344054] mb-1.5">
                انتخاب محصولات تشکیل‌دهنده (حداقل ۲ محصول):
              </label>
              <div className="max-h-48 overflow-y-auto space-y-1.5 rounded-xl border border-[#EFEFF5] p-2 kv-scroll-table">
                {availableProducts.map((p) => {
                  const checked = selectedProdIds.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 rounded-lg p-1.5 text-xs hover:bg-[#F7F7FB] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedProdIds((prev) =>
                            prev.includes(p.id)
                              ? prev.filter((x) => x !== p.id)
                              : [...prev, p.id]
                          )
                        }
                        className="h-4 w-4 rounded accent-[#1813FB]"
                      />
                      <span className="truncate flex-1 font-medium text-[#080707]">
                        {p.name}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={!can("catalog", "create")}
              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-[#1813FB] px-4 text-xs font-medium text-white hover:bg-[#110CD1]"
            >
              <Plus className="h-4 w-4" />
              <span>ایجاد پیش‌نویس ست لباس</span>
            </button>
          </form>
        </div>
      </div>
    </AdminShell>
  );
}
