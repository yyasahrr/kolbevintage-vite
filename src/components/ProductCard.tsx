import { Link } from "react-router-dom";
import { Heart, Plus, ShoppingBag } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatPrice, stockOf } from "@/data/looks";
import { totalStock, type CatalogProduct } from "@/data/catalog";
import { useCart } from "@/state/cart";
import { CardMedia } from "./CardMedia";
import { buttonStyles } from "./ui";

interface Props {
  product: CatalogProduct;
  className?: string;
}

export function ProductCard({ product, className }: Props) {
  const { add, toggleWish, isWished } = useCart();
  const wished = isWished(product.id);
  const soldOut = totalStock(product) === 0;
  const compare = product.compareAt;

  const quickAdd = () => {
    for (const color of product.colors) {
      for (const size of product.sizes) {
        if (stockOf(product, color.id, size.id) > 0) {
          add([{ product, color, size, lookName: product.lookName }], {
            title: `${product.name} به سبد اضافه شد`,
            detail: `${color.name} · سایز ${size.label}`,
          });
          return;
        }
      }
    }
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
              "pointer-events-none absolute top-2.5 right-2.5 rounded-full px-2.5 py-1 text-[9.5px] font-medium backdrop-blur",
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
            "absolute top-2 left-2 flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur transition-all duration-250",
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
            onClick={quickAdd}
            disabled={soldOut}
            aria-label={`افزودن سریع ${product.name} به سبد`}
            className={buttonStyles(
              "solid",
              "sm",
              "w-full bg-paper/95 text-ink shadow-[0_6px_24px_-10px_rgba(22,19,15,0.5)] backdrop-blur hover:bg-ink hover:text-bone",
            )}
          >
            {soldOut ? <ShoppingBag className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {soldOut ? "ناموجود" : "افزودن سریع"}
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
        <div className="shrink-0 text-left">
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
    </article>
  );
}
