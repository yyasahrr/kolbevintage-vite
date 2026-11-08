import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Heart, Plus, ShoppingBag, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatPrice, stockOf } from "@/data/looks";
import { totalStock, type CatalogProduct } from "@/data/catalog";
import { useCart } from "@/state/cart";
import { useLiveCatalog } from "@/state/live-catalog";
import { CardMedia } from "./CardMedia";
import { buttonStyles } from "./ui";

interface Props { product: CatalogProduct; className?: string; filterColorId?: string }

export function ProductCard({ product, className, filterColorId }: Props) {
  const { add, lines, toggleWish, isWished } = useCart();
  const catalog = useLiveCatalog();
  const [colorId, setColorId] = useState("");
  const [step, setStep] = useState<"buy" | "color" | "size">("buy");
  const [message, setMessage] = useState("");
  const controlsRef = useRef<HTMLDivElement>(null), buyRef = useRef<HTMLButtonElement>(null), previousStep = useRef(step);
  useEffect(() => { if (step !== "buy") controlsRef.current?.querySelector<HTMLButtonElement>("[data-quick-options] button:not([disabled])")?.focus(); else if (previousStep.current !== "buy") buyRef.current?.focus(); previousStep.current = step; }, [step]);
  useEffect(() => { setStep("buy"); setColorId(""); setMessage(""); }, [product.id, filterColorId]);
  const color = product.colors.find(c => c.id === colorId);
  const soldOut = totalStock(product) === 0;
  const wished = isWished(product.id);
  const quickAdd = (sizeId: string) => {
    const size = product.sizes.find(s => s.id === sizeId);
    if (!color || !size) return;
    const stock = stockOf(product, color.id, size.id);
    const inCart = lines.find(line => line.productId === product.id && line.colorId === color.id && line.sizeId === size.id)?.qty ?? 0;
    if (stock <= 0) { setMessage("موجودی این گزینه قابل تأیید نیست."); return; }
    if (inCart >= stock) { setMessage("همهٔ موجودی این گزینه در سبد است."); return; }
    add([{ product, color, size, lookName: product.lookName }], {
      title: `${product.name} به سبد اضافه شد`, detail: `${color.name} · سایز ${size.label}`,
    });
    setStep("buy"); setColorId(""); setMessage("");
  };
  return (
    <article className={cn("group relative flex min-w-0 flex-col", className)}>
      <div className="isolate relative overflow-hidden rounded-xl bg-[#efe9e0] ring-1 ring-black/[0.05]">
        <CardMedia key={colorId || filterColorId || "all"} product={product} interactive colorId={colorId || filterColorId} strictColor={!!(colorId || filterColorId)} />
        {product.badge && <span className={cn("product-card-badge pointer-events-none absolute z-10 top-2.5 start-2.5 rounded-full px-2.5 py-1 text-[9.5px] font-medium backdrop-blur", product.badge === "تخفیف" ? "is-discount" : product.badge === "آخرین موجودی" ? "bg-white/85 text-ember" : "bg-white/85 text-ink")}>{product.badge}</span>}
        <button type="button" onClick={() => toggleWish(product.id)} aria-label={wished ? `حذف ${product.name} از علاقه‌مندی‌ها` : `افزودن ${product.name} به علاقه‌مندی‌ها`} aria-pressed={wished} className={cn("product-card-wish tap absolute z-10 top-2 end-2 flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur transition-colors duration-250", wished ? "border-ember/30 bg-white text-ember" : "border-white/50 bg-white/75 text-ink-70 hover:bg-white hover:text-ink")}><Heart className={cn("h-3.5 w-3.5", wished && "fill-ember")} /></button>
        <div className={cn("absolute z-10 inset-x-2 bottom-2 transition-[transform,opacity] duration-200", step === "buy" ? "translate-y-3 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 focus-within:translate-y-0 focus-within:opacity-100 max-lg:translate-y-0 max-lg:opacity-100" : "translate-y-0 opacity-100")}>
          {step === "buy" ? <button ref={buyRef} type="button" onClick={() => {setMessage("");setStep("color")}} disabled={soldOut} aria-label={`خرید سریع ${product.name}`} className={buttonStyles("solid", "sm", "tap min-h-11 w-full bg-paper/95 text-ink shadow-[0_6px_24px_-10px_rgba(22,19,15,0.5)] backdrop-blur hover:bg-ink hover:text-bone")}>
            {soldOut ? <ShoppingBag className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}{catalog.status !== "online" ? "موجودی نامشخص" : soldOut ? "ناموجود" : "خرید سریع"}
          </button> : <div ref={controlsRef} className="rounded-xl bg-paper/95 p-2 shadow-lg backdrop-blur" role="group" aria-label={`${step === "color" ? "انتخاب رنگ" : "انتخاب سایز"} ${product.name}`}>
            <div className="flex items-center justify-between gap-1"><span className="text-[11px] font-medium text-ink">{step === "color" ? "رنگ را انتخاب کن" : `سایز · ${color?.name ?? ""}`}</span><div className="flex"><button type="button" onClick={() => {setStep("color");setColorId("");setMessage("")}} aria-label="بازگشت به انتخاب رنگ" className={cn("flex h-8 w-8 items-center justify-center", step === "color" && "hidden")}><ArrowRight size={15}/></button><button type="button" onClick={() => {setStep("buy");setColorId("");setMessage("")}} aria-label="لغو خرید سریع" className="flex h-8 w-8 items-center justify-center"><X size={15}/></button></div></div>
            <div data-quick-options className="no-scrollbar flex gap-1.5 overflow-x-auto py-1">
              {step === "color" ? product.colors.map(c => {const available=product.sizes.some(s => stockOf(product,c.id,s.id)>0);return <button key={c.id} type="button" disabled={!available} onClick={() => {setColorId(c.id);setStep("size");setMessage("")}} aria-label={`رنگ ${c.name}${available ? "" : " — ناموجود"}`} title={c.name} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-ink/20 px-2.5 text-[11px] text-ink disabled:opacity-40"><span className="h-4 w-4 rounded-full ring-1 ring-black/20" style={{backgroundColor:c.hex}}/>{c.name}</button>}) : product.sizes.map(s => {const stock=color?stockOf(product,color.id,s.id):0;const qty=lines.find(line=>line.productId===product.id&&line.colorId===color?.id&&line.sizeId===s.id)?.qty??0;return <button key={s.id} type="button" disabled={stock<=0 || qty>=stock} onClick={() => quickAdd(s.id)} aria-label={`سایز ${s.label}${stock<=0 ? " — ناموجود" : qty>=stock ? " — حداکثر در سبد" : ""}`} className="min-h-10 min-w-10 shrink-0 rounded-full border border-ink/20 px-3 text-[11px] text-ink disabled:opacity-40">{s.label}</button>})}
            </div>{message && <p role="status" className="text-[10px] text-ember">{message}</p>}{step === "size" && <p className="text-[10px] text-ink-70">با انتخاب سایز به سبد اضافه می‌شود.</p>}
          </div>}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0"><p className="text-[10px] text-ink-45">{product.category}</p><h3 className="mt-0.5 text-[12.5px] leading-5 font-medium text-ink"><Link to={`/product/${product.id}`} className="hover:text-ink-70">{product.name}</Link></h3>{product.lookName && <p className="mt-0.5 truncate text-[10px] text-ink-45">استایل {product.lookName}</p>}</div>
        <div className="shrink-0 text-start"><p className={cn("text-[12px] font-medium", product.compareAt ? "text-ember" : "text-ink")}>{formatPrice(product.price)}</p>{product.compareAt && <p className="text-[10px] text-ink-45 line-through">{formatPrice(product.compareAt)}</p>}</div>
      </div>
      <div className="mt-1.5 flex items-center gap-1">{product.colors.slice(0, 4).map(c => <span key={c.id} title={c.name} className="h-2.5 w-2.5 rounded-full ring-1 ring-black/15" style={{backgroundColor:c.hex}}/>)}<span className="ms-1 text-[9.5px] text-ink-45">{product.colors.length.toLocaleString("fa-IR")} رنگ</span></div>
    </article>
  );
}
