import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { SlidersHorizontal, X, PackageSearch, RotateCcw } from "lucide-react";
import {
  ALL_COLORS,
  ALL_SIZES,
  CATEGORIES,
  COLLECTIONS,
  SORTS,
  filterProducts,
  productsInCollection,
  type SortKey,
} from "@/data/catalog";
import { ProductCard } from "@/components/ProductCard";
import {
  Chip,
  EmptyState,
  PageIntro,
  Reveal,
  SelectField,
  buttonStyles,
} from "@/components/ui";
import { cn } from "@/utils/cn";
import { useOps } from "@/state/ops";
import { resolveImg } from "@/builder/stock";

const VALID_SORTS = new Set<string>(SORTS.map((s) => s.id));

export function ProductsPage() {
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { categories } = useOps();

  const collection = COLLECTIONS.find((c) => c.id === params.get("collection"))?.id ?? "all";
  const category = params.get("category") ?? "";
  const size = params.get("size") ?? "";
  const color = params.get("color") ?? "";
  const sortParam = params.get("sort") ?? "featured";
  const sort = (VALID_SORTS.has(sortParam) ? sortParam : "featured") as SortKey;
  const query = params.get("q") ?? "";

  const patch = (patchObj: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patchObj)) {
      if (!value || value === "all" || value === "featured") next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const reset = () => setParams(new URLSearchParams(), { replace: true });

  const list = useMemo(
    () => filterProducts({ collection, category, size, color, sort, query }),
    [collection, category, size, color, sort, query],
  );

  const activeCollection = COLLECTIONS.find((c) => c.id === collection);
  const availableCategories = CATEGORIES.filter(
    (c) => !activeCollection || c.collectionId === activeCollection.id,
  );
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

  const activeFilters = [
    category && { key: "category", label: category },
    size && { key: "size", label: `سایز ${size}` },
    color && {
      key: "color",
      label: `رنگ ${ALL_COLORS.find((c) => c.id === color)?.name ?? color}`,
    },
    query && { key: "q", label: `جست‌وجو: ${query}` },
  ].filter(Boolean) as { key: string; label: string }[];

  const filterPanel = (
    <>
      <div>
        <p className="mb-2 text-[10px] text-ink-45">دسته</p>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={!collection || collection === "all"} onClick={() => patch({ collection: "all", category: null })}>
            همه
          </Chip>
          {COLLECTIONS.map((c) => (
            <Chip
              key={c.id}
              active={collection === c.id}
              onClick={() => patch({ collection: c.id, category: null })}
            >
              {c.label}
              <span className="text-[9.5px] opacity-60">{productsInCollection(c.id).length}</span>
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] text-ink-45">گروه محصول</p>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={!category} onClick={() => patch({ category: null })}>
            همهٔ گروه‌ها
          </Chip>
          {availableCategories.map((c) => (
            <Chip key={c.name} active={category === c.name} onClick={() => patch({ category: c.name })}>
              {c.name}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] text-ink-45">سایز</p>
        <div className="flex flex-wrap gap-1.5">
          {ALL_SIZES.map((s) => (
            <Chip key={s} active={size === s} onClick={() => patch({ size: size === s ? undefined : s })}>
              {s}
            </Chip>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] text-ink-45">رنگ</p>
        <div className="flex flex-wrap items-center gap-2">
          {ALL_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => patch({ color: color === c.id ? undefined : c.id })}
              aria-pressed={color === c.id}
              aria-label={`فیلتر رنگ ${c.name}`}
              title={c.name}
              className={cn(
                "relative h-7 w-7 rounded-full ring-1 ring-black/15 ring-offset-2 ring-offset-bone transition-all",
                color === c.id ? "ring-[1.5px] ring-ink" : "hover:scale-110",
              )}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>
      </div>

      <div className="lg:hidden">
        <p className="mb-2 text-[10px] text-ink-45">مرتب‌سازی</p>
        <div className="flex flex-wrap gap-1.5">
          {SORTS.map((s) => (
            <Chip key={s.id} active={sort === s.id} onClick={() => patch({ sort: s.id })}>
              {s.label}
            </Chip>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <div className="pb-12">
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
              <span className="sb-cat-name">{c.name}</span>
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
            <div className="hidden items-center gap-3 lg:flex">
              <span className="text-[11px] text-ink-45">فیلتر:</span>
              {activeFilters.length === 0 ? (
                <span className="text-[11px] text-ink-45">همهٔ قطعه‌ها — بدون محدودیت</span>
              ) : (
                activeFilters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => patch({ [f.key]: undefined })}
                    className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.06] px-2.5 py-1 text-[10.5px] text-ink"
                  >
                    {f.label}
                    <X className="h-3 w-3" />
                  </button>
                ))
              )}
              {activeFilters.length > 0 && (
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1 text-[10.5px] text-ink-45 hover:text-ink"
                >
                  <RotateCcw className="h-3 w-3" /> پاک کردن
                </button>
              )}
            </div>
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
              <div className="rounded-lg bg-[#efe8dd] p-3">
                <p className="text-[11px] font-medium text-ink">خرید کامل استایل</p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-ink-70">
                  شش استایل آماده روی رانو، با امکان افزودن یک‌جای همهٔ قطعه‌ها.
                </p>
                <LinkToStyle compact />
              </div>
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
              <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 md:grid-cols-3">
                {list.map((product, i) => (
                  <Reveal key={product.id} delay={Math.min(i, 5) * 0.03}>
                    <ProductCard product={product} />
                  </Reveal>
                ))}
              </div>
            )}

            <div className="mt-9 flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.07] pt-5 text-[11px] text-ink-45">
              <p>
                نمایش {(list.length > 0 ? 1 : 0).toLocaleString("fa-IR")} تا{" "}
                {list.length.toLocaleString("fa-IR")} از {list.length.toLocaleString("fa-IR")} قطعه
              </p>
              <p>همهٔ قطعه‌ها ساخت محدود دارند · ارسال رایگان بالای ۲۰۰ یورو</p>
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
                <h2 className="font-display text-[17px] font-medium text-ink">فیلتر و مرتب‌سازی</h2>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  aria-label="بستن فیلترها"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10"
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
