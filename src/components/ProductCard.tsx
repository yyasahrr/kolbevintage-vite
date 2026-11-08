import { useState } from "react";
import { Link } from "react-router-dom";
import { Heart, Plus, ShoppingBag } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatPrice, stockOf } from "@/data/looks";
import { totalStock, type CatalogProduct } from "@/data/catalog";
import { useCart } from "@/state/cart";
import { useLiveCatalog } from "@/state/live-catalog";
import { CardMedia } from "./CardMedia";
import { buttonStyles } from "./ui";

interface Props { product: CatalogProduct; className?: string }

export function ProductCard({ product, className }: Props) {
  const { add, lines, toggleWish, isWished } = useCart();
  const catalog = useLiveCatalog();
  const [colorId, setColorId] = useState("");
  const [sizeId, setSizeId] = useState("");
  const color = product.colors.find(c => c.id === colorId);
  const size = product.sizes.find(s => s.id === sizeId);
  const stock = color && size ? stockOf(product, color.id, size.id) : 0;
  const inCart = lines.find(line => line.productId === product.id && line.colorId === colorId && line.sizeId === sizeId)?.qty ?? 0;
  const atLimit = stock > 0 && inCart >= stock;
  const soldOut = totalStock(product) === 0;
  const wished = isWished(product.id);
  const quickAdd = () => {
    if (!color || !size || stockOf(product, color.id, size.id) <= inCart) return;
    add([{ product, color, size, lookName: product.lookName }], {
      title: `${product.name} به سبد اضافه شد`, detail: `${color.name} · سایز ${size.label}`,
    });
  };
  return (
    <article className={cn("group relative flex min-w-0 flex-col", className)}>
      <div className="isolate relative overflow-hidden rounded-xl bg-[#efe9e0] ring-1 ring-black/[0.05]">
        <CardMedia product={product} interactive colorId={colorId || undefined} />
        {product.badge && <span className={cn("product-card-badge pointer-events-none absolute z-10 top-2.5 start-2.5 rounded-full px-2.5 py-1 text-[9.5px] font-medium backdrop-blur", product.badge === "تخفیف" ? "bg-ember text-white" : product.badge === "آخرین موجودی" ? "bg-white/85 text-ember" : "bg-white/85 text-ink")}>{product.badge}</span>}
        <button type="button" onClick={() => toggleWish(product.id)} aria-label={wished ? `حذف ${product.name} از علاقه‌مندی‌ها` : `افزودن ${product.name} به علاقه‌مندی‌ها`} aria-pressed={wished} className={cn("product-card-wish tap absolute z-10 top-2 end-2 flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur transition-colors duration-250", wished ? "border-ember/30 bg-white text-ember" : "border-white/50 bg-white/75 text-ink-70 hover:bg-white hover:text-ink")}><Heart className={cn("h-3.5 w-3.5", wished && "fill-ember")} /></button>
      </div>
      <div className="mt-2.5 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><p className="text-[10px] text-ink-45">{product.category}</p><h3 className="mt-0.5 text-[12.5px] leading-5 font-medium text-ink"><Link to={`/product/${product.id}`} className="hover:text-ink-70">{product.name}</Link></h3>{product.lookName && <p className="mt-0.5 truncate text-[10px] text-ink-45">استایل {product.lookName}</p>}</div>
        <div className="shrink-0 text-start"><p className={cn("text-[12px] font-medium", product.compareAt ? "text-ember" : "text-ink")}>{formatPrice(product.price)}</p>{product.compareAt && <p className="text-[10px] text-ink-45 line-through">{formatPrice(product.compareAt)}</p>}</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="min-w-0 text-[11px] text-ink-70">رنگ
          <select aria-label={`رنگ ${product.name}`} value={colorId} disabled={soldOut} onChange={e => {setColorId(e.target.value); setSizeId("")}} className="mt-1 min-h-10 w-full min-w-0 rounded-lg border border-black/15 bg-white px-2 text-[12px] text-ink disabled:opacity-50">
            <option value="">انتخاب رنگ</option>{product.colors.map(c => <option key={c.id} value={c.id} disabled={!product.sizes.some(s => stockOf(product,c.id,s.id)>0)}>{c.name}{!product.sizes.some(s => stockOf(product,c.id,s.id)>0) ? " — ناموجود" : ""}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-[11px] text-ink-70">سایز
          <select aria-label={`سایز ${product.name}`} value={sizeId} disabled={!color || soldOut} onChange={e => setSizeId(e.target.value)} className="mt-1 min-h-10 w-full min-w-0 rounded-lg border border-black/15 bg-white px-2 text-[12px] text-ink disabled:opacity-50">
            <option value="">انتخاب سایز</option>{product.sizes.map(s => <option key={s.id} value={s.id} disabled={!color || stockOf(product,color.id,s.id)<=0}>{s.label}{color && stockOf(product,color.id,s.id)<=0 ? " — ناموجود" : ""}</option>)}
          </select>
        </label>
      </div>
      <button type="button" onClick={quickAdd} disabled={!color || !size || stock <= 0 || atLimit} aria-label={`خرید سریع ${product.name}`} className={buttonStyles("solid", "sm", "mt-2 min-h-10 w-full")}>
        {soldOut ? <ShoppingBag className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}{catalog.status !== "online" ? "موجودی نامشخص" : soldOut ? "ناموجود" : atLimit ? "حداکثر در سبد" : "خرید سریع"}
      </button>
      {atLimit && <p className="mt-1 text-[10px] text-ink-70" role="status">همهٔ موجودی این گزینه در سبد است.</p>}
    </article>
  );
}
