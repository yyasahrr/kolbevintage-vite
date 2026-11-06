import { useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { Check, Heart, Plus, ShoppingBag, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatPrice, stockOf } from "@/data/looks";
import { totalStock, type CatalogProduct } from "@/data/catalog";
import { useCart } from "@/state/cart";
import { useDialogFocus, useEscape, useScrollLock } from "@/hooks/useOverlay";
import { CardMedia } from "./CardMedia";
import { buttonStyles } from "./ui";

interface Props {
  product: CatalogProduct;
  className?: string;
}

export function ProductCard({ product, className }: Props) {
  const { add, toggleWish, isWished } = useCart();
  const [quickBuyOpen, setQuickBuyOpen] = useState(false);
  const [quickColorId, setQuickColorId] = useState("");
  const [quickSizeId, setQuickSizeId] = useState("");
  const quickBuyId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const wished = isWished(product.id);
  const soldOut = totalStock(product) === 0;
  const compare = product.compareAt;

  useEscape(quickBuyOpen, () => setQuickBuyOpen(false));
  useScrollLock(quickBuyOpen);
  useDialogFocus(quickBuyOpen, dialogRef);

  const openQuickBuy = () => {
    setQuickColorId("");
    setQuickSizeId("");
    setQuickBuyOpen(true);
  };

  const quickColor = product.colors.find((color) => color.id === quickColorId);
  const quickSize = product.sizes.find((size) => size.id === quickSizeId);
  const quickStock = quickColor && quickSize ? stockOf(product, quickColor.id, quickSize.id) : 0;

  const quickAdd = () => {
    if (!quickColor || !quickSize || quickStock <= 0) return;
    add([{ product, color: quickColor, size: quickSize, lookName: product.lookName }], {
      title: `${product.name} به سبد اضافه شد`,
      detail: `${quickColor.name} · سایز ${quickSize.label}`,
    });
    setQuickBuyOpen(false);
  };

  return (
    <article className={cn("group relative flex flex-col", className)}>
      <div className="relative overflow-hidden rounded-xl bg-[#efe9e0] ring-1 ring-black/[0.05]">
        <Link
          to={`/product/${product.id}`}
          aria-label={`${product.name} — ${formatPrice(product.price)}`}
          className="block outline-offset-4"
        >
          <div className="overflow-hidden transition-transform duration-700 ease-[cubic-bezier(0.22,0.61,0.24,1)] group-hover:[&_img]:scale-[1.045] [&_img]:transition-transform [&_img]:duration-700">
            <CardMedia product={product} />
          </div>
          <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/10 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        </Link>

        {product.badge && (
          <span
            className={cn(
              "pointer-events-none absolute top-2.5 start-2.5 rounded-full px-2.5 py-1 text-[9.5px] font-medium backdrop-blur",
              product.badge === "تخفیف"
                ? "bg-ember text-white"
                : product.badge === "آخرین موجودی"
                  ? "bg-white/85 text-ember"
                  : "bg-white/85 text-ink",
            )}
          >
            {product.badge}
          </span>
        )}

        <button
          type="button"
          onClick={() => toggleWish(product.id)}
          aria-label={wished ? `حذف ${product.name} از علاقه‌مندی‌ها` : `افزودن ${product.name} به علاقه‌مندی‌ها`}
          aria-pressed={wished}
          className={cn(
            "tap absolute top-2 end-2 flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur transition-colors duration-250",
            wished
              ? "border-ember/30 bg-white text-ember"
              : "border-white/50 bg-white/75 text-ink-70 hover:bg-white hover:text-ink",
          )}
        >
          <Heart className={cn("h-3.5 w-3.5", wished && "fill-ember")} />
        </button>

        <div className="absolute inset-x-2 bottom-2 translate-y-3 opacity-0 transition-all duration-350 group-hover:translate-y-0 group-hover:opacity-100 focus-within:translate-y-0 focus-within:opacity-100 max-lg:translate-y-0 max-lg:opacity-100">
          <button
            type="button"
            onClick={openQuickBuy}
            disabled={soldOut}
            aria-label={`خرید سریع ${product.name}`}
            aria-haspopup="dialog"
            aria-expanded={quickBuyOpen}
            aria-controls={quickBuyId}
            className={buttonStyles(
              "solid",
              "sm",
              "tap min-h-11 w-full bg-paper/95 text-ink shadow-[0_6px_24px_-10px_rgba(22,19,15,0.5)] backdrop-blur hover:bg-ink hover:text-bone",
            )}
          >
            {soldOut ? <ShoppingBag className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {soldOut ? "ناموجود" : "خرید سریع"}
          </button>
        </div>
      </div>

      <div className="mt-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[9.5px] text-ink-45">{product.category}</p>
          <h3 className="mt-0.5 truncate text-[12.5px] leading-5 font-medium text-ink">
            <Link to={`/product/${product.id}`} className="hover:text-ink-70">
              {product.name}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-[10px] text-ink-45">استایل {product.lookName}</p>
        </div>
        <div className="shrink-0 text-start">
          <p className={cn("text-[12px] font-medium", compare ? "text-ember" : "text-ink")}>
            {formatPrice(product.price)}
          </p>
          {compare && <p className="text-[10px] text-ink-45 line-through">{formatPrice(compare)}</p>}
        </div>
      </div>

      <div className="mt-1.5 flex items-center gap-1">
        {product.colors.slice(0, 4).map((c) => (
          <span
            key={c.id}
            title={c.name}
            className="h-2.5 w-2.5 rounded-full ring-1 ring-black/15"
            style={{ backgroundColor: c.hex }}
          />
        ))}
        <span className="ms-1 text-[9.5px] text-ink-45">{product.colors.length} رنگ</span>
      </div>

      {quickBuyOpen && createPortal(
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/50 sm:items-center sm:p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setQuickBuyOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            id={quickBuyId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${quickBuyId}-title`}
            tabIndex={-1}
            className="max-h-[90dvh] w-full overflow-y-auto rounded-t-2xl bg-paper px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-start shadow-[0_-12px_48px_-20px_rgba(22,19,15,0.35)] sm:max-w-md sm:rounded-2xl sm:pb-5"
          >
            <header className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id={`${quickBuyId}-title`} className="text-[15px] font-semibold text-ink">
                  خرید سریع
                </h2>
                <p className="mt-1 truncate text-[12px] text-ink-70">{product.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setQuickBuyOpen(false)}
                aria-label="بستن خرید سریع"
                className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-ink/15 text-ink transition-colors hover:bg-ink/[0.05]"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <p className="mt-4 text-[11px] font-medium text-ink">رنگ را انتخاب کن</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {product.colors.map((color) => {
                const available = product.sizes.some((size) => stockOf(product, color.id, size.id) > 0);
                const selected = quickColorId === color.id;
                return (
                  <button
                    key={color.id}
                    type="button"
                    disabled={!available}
                    onClick={() => {
                      setQuickColorId(color.id);
                      setQuickSizeId("");
                    }}
                    aria-label={`${color.name}${available ? "" : " — ناموجود"}`}
                    aria-pressed={selected}
                    title={color.name}
                    className={cn(
                      "tap flex min-h-11 min-w-11 items-center justify-center rounded-full border transition-colors",
                      selected ? "border-ink ring-2 ring-ink ring-offset-2 ring-offset-paper" : "border-ink/15",
                      !available && "cursor-not-allowed opacity-35",
                    )}
                  >
                    <span className="h-6 w-6 rounded-full ring-1 ring-black/15" style={{ backgroundColor: color.hex }} />
                  </button>
                );
              })}
              {quickColor && <span className="self-center text-[11px] text-ink-70">{quickColor.name}</span>}
            </div>

            <p className="mt-4 text-[11px] font-medium text-ink">سایز را انتخاب کن</p>
            {!quickColor && <p className="mt-1 text-[11px] text-ink-45">بعد از انتخاب رنگ، سایزهای موجود نمایش داده می‌شوند.</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {product.sizes.map((size) => {
                const available = !!quickColor && stockOf(product, quickColor.id, size.id) > 0;
                const selected = quickSizeId === size.id;
                return (
                  <button
                    key={size.id}
                    type="button"
                    disabled={!available}
                    onClick={() => setQuickSizeId(size.id)}
                    aria-pressed={selected}
                    aria-label={`سایز ${size.label}${!quickColor ? " — ابتدا رنگ را انتخاب کن" : available ? "" : " — ناموجود"}`}
                    className={cn(
                      "tap flex min-h-11 min-w-11 items-center justify-center rounded-full border px-3 text-[12px] font-medium transition-colors",
                      selected ? "border-ink bg-ink text-bone" : "border-ink/15 bg-white text-ink",
                      !available && "cursor-not-allowed opacity-40",
                    )}
                  >
                    {size.label}
                    {selected && <Check className="ms-1 h-3.5 w-3.5" aria-hidden />}
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-t border-ink/10 pt-4">
              <div>
                <p className="text-[12px] font-medium text-ink">{formatPrice(product.price)}</p>
                {quickSize && quickStock > 0 && (
                  <p className="mt-0.5 text-[10px] text-ink-45">{quickStock.toLocaleString("fa-IR")} عدد موجود</p>
                )}
              </div>
              <button
                type="button"
                onClick={quickAdd}
                disabled={!quickColor || !quickSize || quickStock <= 0}
                className={buttonStyles("solid", "md", "tap min-h-11 disabled:cursor-not-allowed")}
              >
                <ShoppingBag className="h-4 w-4" aria-hidden />
                افزودن به سبد
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </article>
  );
}
