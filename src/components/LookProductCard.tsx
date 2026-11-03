import { motion } from "motion/react";
import { Plus, Check, Minus } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatPrice, stockOf } from "@/data/looks";
import { ProductThumb } from "./ProductThumb";
import { VariantSelector } from "./VariantSelector";
import type { Product, VariantSelection } from "@/types";

interface Props {
  product: Product;
  selection: VariantSelection;
  index: number;
  accent: string;
  inCart: boolean;
  reduced: boolean;
  onChange: (patch: Partial<VariantSelection>) => void;
  onAdd: () => void;
}

export function LookProductCard({ product, selection, index, accent, inCart, reduced, onChange, onAdd }: Props) {
  const stock = stockOf(product, selection.colorId, selection.sizeId);
  const color = product.colors.find((c) => c.id === selection.colorId) ?? product.colors[0];
  const size = product.sizes.find((s) => s.id === selection.sizeId) ?? product.sizes[0];
  const available = stock > 0;
  const anyAvailable = product.colors.some((c) => product.sizes.some((s) => stockOf(product, c.id, s.id) > 0));

  return (
    <motion.li
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, delay: reduced ? 0 : 0.04 + index * 0.055, ease: [0.22, 0.61, 0.24, 1] }}
      className={cn(
        "group relative rounded-xl border border-black/[0.07] bg-white/70 p-3 transition-colors duration-300",
        "hover:border-black/15 hover:bg-white",
        !selection.included && "opacity-60",
      )}
    >
      <div className="flex gap-3">
        <ProductThumb product={product} tint={accent} className="w-[74px] sm:w-[82px]" />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[10px] text-ink-45">{product.category}</p>
              <h4 className="mt-0.5 truncate text-[13.5px] leading-tight font-medium text-ink">{product.name}</h4>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={selection.included}
              aria-label={`${product.name} را ${selection.included ? "از" : "به"} استایل کامل ${selection.included ? "حذف" : "اضافه"} کن`}
              onClick={() => onChange({ included: !selection.included })}
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border transition-all duration-200",
                selection.included
                  ? "border-ink bg-ink text-bone"
                  : "border-black/20 bg-transparent text-transparent hover:border-ink/50",
              )}
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </button>
          </div>

          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-[13px] font-medium text-ink">{formatPrice(product.price)}</span>
            {product.compareAt && (
              <span className="text-[11px] text-ink-45 line-through">{formatPrice(product.compareAt)}</span>
            )}
          </div>

          <VariantSelector
            product={product}
            colorId={selection.colorId}
            sizeId={selection.sizeId}
            onColor={(colorId) => onChange({ colorId })}
            onSize={(sizeId) => onChange({ sizeId })}
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <StockBadge stock={stock} anyAvailable={anyAvailable} />
            <button
              type="button"
              onClick={onAdd}
              disabled={!available}
              aria-label={
                available
                  ? `افزودن ${product.name}، رنگ ${color.name}، سایز ${size.label} به سبد`
                  : `${product.name} در این ترکیب رنگ و سایز موجود نیست`
              }
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-medium tracking-wide transition-all duration-200",
                available
                  ? "bg-ink text-bone hover:bg-ink/85 active:scale-[0.97]"
                  : "cursor-not-allowed bg-black/[0.06] text-ink-45",
              )}
            >
              {available ? (
                <>
                  {inCart ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  {inCart ? "اضافه شد" : "افزودن"}
                </>
              ) : (
                <>
                  <Minus className="h-3.5 w-3.5" />
                  ناموجود
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </motion.li>
  );
}

function StockBadge({ stock, anyAvailable }: { stock: number; anyAvailable: boolean }) {
  if (stock === 0) {
    return (
      <span className="text-[11px] text-ember/90">
        {anyAvailable ? "این ترکیب ناموجود است" : "کاملاً ناموجود"}
      </span>
    );
  }
  if (stock <= 2) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-ember">
        <span className="h-1.5 w-1.5 rounded-full bg-ember" />
        فقط {stock.toLocaleString("fa-IR")} عدد
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-45">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600/70" />
      موجود · {stock.toLocaleString("fa-IR")}
    </span>
  );
}
