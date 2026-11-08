import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { SlidersHorizontal, X, PackageSearch, RotateCcw } from "lucide-react";
import {
  COLLECTIONS,
  SORTS,
  filterProducts,
  colorFilterKey,
  type SortKey,
} from "@/data/catalog";
import { ProductCard } from "@/components/ProductCard";
import {
  EmptyState,
  PageIntro,
  Reveal,
  SelectField,
  buttonStyles,
} from "@/components/ui";
import { cn } from "@/utils/cn";
import { useDialogFocus, useEscape, useScrollLock } from "@/hooks/useOverlay";
import { useLiveCatalog } from "@/state/live-catalog";
import { useOps } from "@/state/ops";
import { useAdmin } from "@/state/admin";
import { stockOf, tomanRate } from "@/data/looks";
import { toLatinDigits } from "@/utils/date";
import { resolveImg } from "@/builder/stock";

const VALID_SORTS = new Set<string>(SORTS.map((s) => s.id));

export function ProductsPage() {
  const admin = useAdmin();
  const live = useLiveCatalog();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterDialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(filtersOpen, filterDialogRef);
  useEscape(filtersOpen, () => setFiltersOpen(false));
  useScrollLock(filtersOpen);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const close = () => { if (desktop.matches) setFiltersOpen(false); };
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);
  const ops = useOps();
  const { categories } = ops;

  const requestedCollection = params.get("collection");
  const selectedCategory = categories.find(c => c.active && c.id === requestedCollection);
  const collection = selectedCategory?.id ?? COLLECTIONS.find(c => c.id === requestedCollection && !categories.some(category => category.id === c.id))?.id ?? "all";
  const category = params.get("category") ?? "";
  const size = params.get("size") ?? "";
  const color = params.get("color") ?? "";
  // the owner's per-category default applies until the shopper picks a sort (decision 27)
  const ownerSort = category ? ops.categorySort?.[category] : undefined;
  const sortParam = params.get("sort") ?? ownerSort ?? "featured";
  const sort = (VALID_SORTS.has(sortParam) ? sortParam : "featured") as SortKey;
  const query = params.get("q") ?? "";
  const validPrice = (v:string|null) => v && /^\d{1,12}$/.test(v) ? v : "";
  const minPrice = validPrice(params.get("minPrice")), maxPrice = validPrice(params.get("maxPrice"));
  const [priceFrom, setPriceFrom] = useState(minPrice), [priceTo, setPriceTo] = useState(maxPrice), [priceError, setPriceError] = useState("");
  useEffect(() => { setPriceFrom(minPrice); setPriceTo(maxPrice); setPriceError(""); }, [minPrice,maxPrice]);

  const patch = (patchObj: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patchObj)) {
      if (!value || value === "all" || value === "featured") next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const reset = () => { setPriceFrom(""); setPriceTo(""); setPriceError(""); setParams(new URLSearchParams(), { replace: true }); };

  const list = useMemo(
    () => filterProducts({ collection, category, size, color, sort, query }).filter(p => (!minPrice || Math.round(p.price*tomanRate()) >= Number(minPrice)) && (!maxPrice || Math.round(p.price*tomanRate()) <= Number(maxPrice))),
    [collection, category, size, color, sort, query, minPrice, maxPrice, admin, ops, live],
  );

  const activeCollection = selectedCategory ? { id: selectedCategory.id, label: selectedCategory.name } : COLLECTIONS.find((c) => c.id === collection);
  const title = query
    ? `نتیجهٔ جست‌وجو برای «${query}»`
    : activeCollection
      ? activeCollection.label
      : "همهٔ محصولات";
  const description = query
    ? "نزدیک‌ترین قطعه‌ها به آنچه جست‌وجو کردی. فیلترها را برای رسیدن به نتیجهٔ دقیق‌تر تغییر بده."
    : activeCollection
      ? "قطعه‌هایی از مجموعهٔ پاییز / زمستان ۲۶ که در این دسته قرار می‌گیرند."
      : "تمام کالکشن در یک نگاه: بیرونی، بافت، خیاطی، پیراهن، کفش و کیف. قطعه‌ها محدود و شماره‌دار هستند.";

  // Limit choices to the current collection/search, without multiplying the
  // category controls already visible above the results.
  const optionProducts = filterProducts({ collection, category, query });
  const sizeOptions = [...new Set(optionProducts.flatMap(product => product.sizes.map(item => item.label)))];
  if (size && !sizeOptions.includes(size)) sizeOptions.push(size);
  const colorOptions = [...new Map(optionProducts.flatMap(product => product.colors).map(item => [colorFilterKey(item), item])).entries()].map(([key,item]) => ({...item, filterKey:key}));
  const selectedColor = colorOptions.find(c => c.filterKey === color || c.id === color);
  const activeFilters = [
    collection !== "all" && { key: "collection", label: activeCollection?.label ?? collection },
    category && { key: "category", label: category },
    size && { key: "size", label: `سایز ${size}` },
    color && { key: "color", label: `رنگ ${selectedColor?.name ?? color}` },
    query && { key: "q", label: `جست‌وجو: ${query}` },
    minPrice && { key: "minPrice", label: `از ${Number(minPrice).toLocaleString("fa-IR")} تومان` },
    maxPrice && { key: "maxPrice", label: `تا ${Number(maxPrice).toLocaleString("fa-IR")} تومان` },
  ].filter(Boolean) as { key: string; label: string }[];

  const filterPanel = (
    <div className="space-y-4">
      <p className="text-[11px] leading-5 text-ink-70">دسته را از نوار بالای محصولات انتخاب کن؛ رنگ و سایز را اینجا مشخص کن.</p>
      <label className="block text-[12px] font-medium text-ink">سایز
        <select aria-label="فیلتر سایز" value={size} onChange={e => patch({size:e.target.value})} className="mt-2 min-h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-[12px] text-ink">
          <option value="">همهٔ سایزها</option>{sizeOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="block text-[12px] font-medium text-ink">رنگ
        <select aria-label="فیلتر رنگ" value={color} onChange={e => patch({color:e.target.value})} className="mt-2 min-h-11 w-full rounded-lg border border-black/15 bg-white px-3 text-[12px] text-ink">
          <option value="">همهٔ رنگ‌ها</option>{color && !selectedColor && <option value={color}>{color}</option>}{selectedColor && selectedColor.filterKey !== color && <option value={color}>{selectedColor.name}</option>}{colorOptions.map(c => <option key={c.filterKey} value={c.filterKey}>{c.name}</option>)}
        </select>
      </label>
      <form className="space-y-2 border-t border-black/10 pt-4" onSubmit={e => {e.preventDefault();if(priceFrom && priceTo && Number(priceFrom)>Number(priceTo)){setPriceError("حداقل قیمت نمی‌تواند بیشتر از حداکثر باشد.");return}setPriceError("");patch({minPrice:priceFrom,maxPrice:priceTo})}}>
        <p className="text-[12px] font-medium">بازهٔ قیمت <span className="font-normal text-ink-70">(تومان)</span></p>
        <label className="block text-[11px] text-ink-70">از<input aria-label="حداقل قیمت به تومان" inputMode="numeric" value={priceFrom} onChange={e=>setPriceFrom(toLatinDigits(e.target.value).replace(/[^0-9]/g,"").slice(0,12))} placeholder="بدون حداقل" className="mt-1 min-h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-ink"/></label>
        <label className="block text-[11px] text-ink-70">تا<input aria-label="حداکثر قیمت به تومان" inputMode="numeric" value={priceTo} onChange={e=>setPriceTo(toLatinDigits(e.target.value).replace(/[^0-9]/g,"").slice(0,12))} placeholder="بدون حداکثر" className="mt-1 min-h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-ink"/></label>
        {priceError && <p role="alert" className="text-xs text-ember">{priceError}</p>}
        <button className={buttonStyles("outline","sm","min-h-10 w-full")}>اعمال بازهٔ قیمت</button>
      </form>
      <p className="text-[11px] leading-5 text-ink-70">نتیجه‌ها فقط گزینه‌های موجود با رنگ و سایز انتخاب‌شده را نشان می‌دهند.</p>
    </div>
  );

  return (
    <div className="pb-12">
      {live.status !== "online" && <p role="status" className="mx-auto max-w-[1500px] px-4 pt-4 text-sm text-ember">{live.status === "loading" ? "در حال دریافت کاتالوگ…" : "ارتباط با فروشگاه قطع است؛ موجودی قابل تأیید نیست و خرید موقتاً غیرفعال است."}</p>}
      <PageIntro
        crumbs={[{ label: "فروشگاه", to: "/products" }, ...(activeCollection ? [{ label: activeCollection.label }] : [])]}
        eyebrow={`${list.length.toLocaleString("fa-IR")} قطعه در دسترس`}
        title={title}
        description={description}
      >
        <div className="flex items-center gap-2">
          <LinkToStyle />
        </div>
      </PageIntro>

      <div className="mx-auto w-full max-w-[1500px] px-4 sm:px-6 lg:px-10">
        {/* collection rail with admin-managed thumbnails */}
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          <button type="button" onClick={() => patch({ collection: "all", category: null })} aria-pressed={collection === "all"} className={cn("sb-cat-tile shrink-0", collection === "all" && "is-on")}>
            <span className="sb-cat-thumb">همه</span>
            <span className="sb-cat-name">همه</span>
          </button>
          {categories.filter((c) => c.active).map((c) => (
            <button key={c.id} type="button" onClick={() => patch({ collection: c.id, category: null })} aria-pressed={collection === c.id} className={cn("sb-cat-tile shrink-0", collection === c.id && "is-on")}>
              <span className="sb-cat-thumb">{c.thumbnail ? <img src={resolveImg(c.thumbnail)} alt={c.name} /> : c.name.slice(0, 2)}</span>
              <span className="sb-cat-name">{c.parentId ? `↳ ${c.name}` : c.name}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-y border-black/[0.07] py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className={buttonStyles("outline", "sm", "lg:hidden")}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              فیلترها
              {activeFilters.length > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-ink px-1 text-[9px] text-bone">
                  {activeFilters.length.toLocaleString("fa-IR")}
                </span>
              )}
            </button>
            <p className="text-[11px] text-ink-45 lg:hidden">{list.length.toLocaleString("fa-IR")} نتیجه</p>
            <p className="hidden text-[11px] text-ink-45 lg:block">{list.length.toLocaleString("fa-IR")} نتیجه</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-[11px] text-ink-45 lg:block">مرتب‌سازی</p>
            <SelectField
              label=""
              value={sort}
              options={SORTS.map((s) => ({ value: s.id, label: s.label }))}
              onChange={(v) => patch({ sort: v })}
            />
          </div>
        </div>

        {activeFilters.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="فیلترهای فعال">
          {activeFilters.map(f => <button key={f.key} type="button" onClick={() => patch({[f.key]:undefined})} aria-label={`حذف فیلتر ${f.label}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-ink/[0.06] px-3 text-[11px] text-ink">{f.label}<X className="h-3 w-3" aria-hidden /></button>)}
          <button type="button" onClick={reset} className="inline-flex min-h-9 items-center gap-1 text-[11px] text-ink-70 hover:text-ink"><RotateCcw className="h-3 w-3" /> پاک کردن همه</button>
        </div>}

        <div className="mt-6 grid gap-7 lg:grid-cols-[15.5rem_1fr] lg:gap-8">
          <aside className="hidden lg:block">
            <div className="sticky top-[112px] space-y-5 rounded-xl border border-black/[0.07] bg-white/45 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[12px] font-medium text-ink">فیلترها</h2>
                <button type="button" onClick={reset} className="text-[10px] text-ink-45 hover:text-ink">
                  بازنشانی
                </button>
              </div>
              {filterPanel}

            </div>
          </aside>

          <div>
            {list.length === 0 ? (
              <EmptyState
                icon={<PackageSearch className="h-5 w-5" />}
                title="با این فیلترها چیزی پیدا نشد"
                body="ترکیب فیلترها را ساده‌تر کن یا همهٔ محصولات را ببین. بعضی قطعه‌ها فقط در یک رنگ موجودند."
                action={{ to: "/products", label: "دیدن همهٔ محصولات" }}
              />
            ) : (
              <div className="product-list-grid grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {list.map((product, i) => (
                  <Reveal key={product.id} delay={Math.min(i, 5) * 0.03}>
                    <ProductCard product={product} filterColorId={color ? product.colors.find(c => (color.startsWith("tone:") ? colorFilterKey(c) === color : c.id === color) && product.sizes.some(s => (!size || s.label === size) && stockOf(product,c.id,s.id)>0))?.id : undefined} />
                  </Reveal>
                ))}
              </div>
            )}

            <div className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.07] pt-5 text-[11px] text-ink-45">
              <p>
                نمایش {(list.length > 0 ? 1 : 0).toLocaleString("fa-IR")} تا{" "}
                {list.length.toLocaleString("fa-IR")} از {list.length.toLocaleString("fa-IR")} قطعه
              </p>
              <p>همهٔ قطعه‌ها ساخت محدود دارند · ارسال رایگان بالای ۲۰۰٬۰۰۰ تومان</p>
            </div>
          </div>
        </div>
      </div>

      {/* mobile filter sheet */}
      <AnimatePresence>
        {filtersOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setFiltersOpen(false)}
              className="fixed inset-0 z-[55] bg-ink lg:hidden"
              aria-hidden
            />
            <motion.div
              ref={filterDialogRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="فیلتر محصولات"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.35, ease: [0.22, 0.61, 0.24, 1] }}
              className="fixed inset-x-0 bottom-0 z-[56] flex max-h-[86vh] flex-col rounded-t-2xl bg-paper lg:hidden"
            >
              <div className="flex items-center justify-between border-b border-black/[0.07] px-5 py-4">
                <h2 className="font-display text-[17px] font-medium text-ink">فیلتر محصولات</h2>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  aria-label="بستن فیلترها"
                  className="tap flex h-9 w-9 items-center justify-center rounded-full border border-black/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="thin-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">{filterPanel}</div>
              <div className="flex items-center gap-2 border-t border-black/[0.07] px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button type="button" onClick={reset} className={buttonStyles("outline", "md", "flex-1")}>
                  بازنشانی
                </button>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className={buttonStyles("solid", "md", "flex-[1.4]")}
                >
                  نمایش {list.length.toLocaleString("fa-IR")} نتیجه
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function LinkToStyle({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/style"
      className={buttonStyles("outline", compact ? "sm" : "md", compact ? "mt-2 w-full" : "")}
    >
      خرید بر اساس استایل
    </Link>
  );
}
