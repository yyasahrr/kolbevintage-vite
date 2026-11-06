"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { StatusBadge } from "@/components/admin/ui/StatusBadge";
import {
  LoadingState,
  UnauthorizedState,
} from "@/components/admin/ui/StateViews";
import { useRole } from "@/components/admin/RoleContext";
import { formatToman } from "@/lib/formatters";
import { ArrowRight, Sparkles, Check } from "lucide-react";

interface CategoryOption {
  id: number;
  name: string;
  parentId: number | null;
}

const STUDIO_SAMPLE_IMAGES = [
  { url: "/images/products/coat-camel.jpg", label: "پالتو شتری" },
  { url: "/images/products/coat-charcoal.jpg", label: "پالتو زغالی" },
  { url: "/images/products/shirt-linen.jpg", label: "پیراهن کتان کرم" },
  { url: "/images/products/shirt-indigo.jpg", label: "پیراهن آبی نیلی" },
  { url: "/images/products/trousers-olive.jpg", label: "شلوار زیتونی" },
  { url: "/images/products/bag-leather.jpg", label: "کیف چرم کنیاکی" },
  { url: "/images/products/boots-chelsea.jpg", label: "نیم‌بوت چرم" },
];

export default function QuickCreateProductPage() {
  const router = useRouter();
  const { can } = useRole();

  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [basePrice, setBasePrice] = useState<string>("2500000");
  const [primaryImage, setPrimaryImage] = useState<string>(
    "/images/products/coat-camel.jpg"
  );
  const [shortDescription, setShortDescription] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/catalog/meta")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.categories) {
          setCategories(data.categories);
          if (data.categories.length > 0) {
            setCategoryId(String(data.categories[0].id));
          }
        }
      })
      .finally(() => setLoadingCats(false));
  }, []);

  if (!can("catalog", "create")) {
    return (
      <AdminShell>
        <UnauthorizedState moduleTitle="ایجاد محصول جدید" />
      </AdminShell>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!name.trim()) {
      setErrorMsg("لطفاً نام محصول را وارد کنید.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          categoryId: categoryId ? Number(categoryId) : null,
          basePrice: Number(basePrice) || 0,
          primaryImage,
          shortDescription: shortDescription.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "خطا در ایجاد پیش‌نویس محصول");
      }
      router.push(`/products/${data.product.id}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "خطا در ارسال فرم");
      setSubmitting(false);
    }
  };

  return (
    <AdminShell>
      <PageHeader
        title="مرحله اول: ایجاد سریع پیش‌نویس محصول"
        description="ثبت اطلاعات اولیه و ورود به ویرایشگر جامع برای تعریف رنگ‌ها، سایزها، قیمت‌گذاری و رسانه‌های هر رنگ"
        badge={<StatusBadge label="وضعیت اولیه: پیش‌نویس (منتشرنشده)" tone="neutral" />}
        secondaryActions={
          <Link
            href="/products"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-xs font-medium text-[#344054] hover:bg-[#F7F7FB]"
          >
            <ArrowRight className="h-4 w-4" />
            <span>بازگشت به فهرست محصولات</span>
          </Link>
        }
      />

      {loadingCats ? (
        <LoadingState label="در حال بارگذاری دسته‌بندی‌ها..." />
      ) : (
        <form
          onSubmit={handleSubmit}
          className="mx-auto max-w-3xl rounded-2xl border border-[#E5E7EB] bg-white p-5 sm:p-6 space-y-5"
        >
          <div className="rounded-xl border border-[#C1BCF2] bg-[#F0EEFF]/60 px-3.5 py-2.5 text-xs text-[#344054]">
            ایجاد پیش‌نویس به معنای انتشار در ویترین فروشگاه نیست. پس از تکمیل
            تنوع‌های رنگ و سایز و بررسی موجودی در مرحله دوم، می‌توانید محصول را
            منتشر کنید.
          </div>

          {errorMsg && (
            <div className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-3.5 py-2.5 text-xs font-medium text-[#B44F40]">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label
                htmlFor="quick-prod-name"
                className="block text-xs font-semibold text-[#080707] mb-1.5"
              >
                نام محصول <span className="text-[#B44F40]">*</span>
              </label>
              <input
                id="quick-prod-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: کت بلیزر پشمی چهارخانه مدل مهرآوا"
                className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-sm text-[#080707] placeholder:text-[#98A2B3] focus:border-[#1813FB] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="quick-prod-category"
                className="block text-xs font-semibold text-[#080707] mb-1.5"
              >
                دسته‌بندی اصلی <span className="text-[#B44F40]">*</span>
              </label>
              <select
                id="quick-prod-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 text-sm text-[#080707] focus:border-[#1813FB] focus:outline-none"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.parentId ? `↳ ${cat.name}` : cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="quick-prod-price"
                className="block text-xs font-semibold text-[#080707] mb-1.5"
              >
                قیمت پایه محصول (تومان)
              </label>
              <input
                id="quick-prod-price"
                type="number"
                min={0}
                step={1000}
                dir="ltr"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 text-left font-mono text-sm text-[#080707] focus:border-[#1813FB] focus:outline-none"
              />
              <span className="mt-1 block text-[11px] text-[#626775]">
                معادل: {formatToman(Number(basePrice) || 0)} (قابل تغییر در سطح
                رنگ و SKU)
              </span>
            </div>

            <div className="sm:col-span-2">
              <label
                htmlFor="quick-prod-desc"
                className="block text-xs font-semibold text-[#080707] mb-1.5"
              >
                توضیح کوتاه معرفی (اختیاری)
              </label>
              <textarea
                id="quick-prod-desc"
                rows={2}
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                placeholder="خلاصه‌ای کوتاه درباره جنس پارچه، تنخور و کاربرد لباس..."
                className="w-full rounded-xl border border-[#E5E7EB] bg-white p-3 text-sm text-[#080707] placeholder:text-[#98A2B3] focus:border-[#1813FB] focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <span className="block text-xs font-semibold text-[#080707] mb-2">
                تصویر شاخص اولیه (اختیاری)
              </span>
              <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-7">
                {STUDIO_SAMPLE_IMAGES.map((img) => {
                  const selected = primaryImage === img.url;
                  return (
                    <button
                      key={img.url}
                      type="button"
                      onClick={() => setPrimaryImage(img.url)}
                      className={`group relative overflow-hidden rounded-xl border p-1 text-center transition-all ${
                        selected
                          ? "border-[#1813FB] ring-2 ring-[#1813FB]/20 bg-[#F0EEFF]"
                          : "border-[#E5E7EB] bg-white hover:border-[#C1BCF2]"
                      }`}
                    >
                      <img
                        src={img.url}
                        alt={img.label}
                        className="aspect-square w-full rounded-lg object-cover"
                      />
                      <span className="mt-1 block truncate text-[10px] text-[#4B505E]">
                        {img.label}
                      </span>
                      {selected && (
                        <span className="absolute top-1.5 left-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#1813FB] text-white">
                          <Check className="h-2.5 w-2.5" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EFEFF5] pt-4">
            <span className="text-xs text-[#626775]">
              پس از ذخیره، به ویرایشگر ۷ بخشی تنوع رنگ و سایز هدایت می‌شوید.
            </span>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#1813FB] px-5 text-sm font-medium text-white hover:bg-[#110CD1] disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              <span>
                {submitting
                  ? "در حال ایجاد پیش‌نویس..."
                  : "ایجاد پیش‌نویس و ادامه ویرایش"}
              </span>
            </button>
          </div>
        </form>
      )}
    </AdminShell>
  );
}
