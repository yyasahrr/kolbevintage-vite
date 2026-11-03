import { Check } from "lucide-react";
import { cn } from "@/utils/cn";
import { stockOf } from "@/data/looks";
import type { Product } from "@/types";

interface Props {
  product: Product;
  colorId: string;
  sizeId: string;
  onColor: (id: string) => void;
  onSize: (id: string) => void;
}

export function VariantSelector({ product, colorId, sizeId, onColor, onSize }: Props) {
  const colorSoldOut = (id: string) => product.sizes.every((s) => stockOf(product, id, s.id) === 0);
  const sizeSoldOut = (id: string) => stockOf(product, colorId, id) === 0;
  const activeColor = product.colors.find((c) => c.id === colorId);
  const singleSize = product.sizes.length === 1;

  return (
    <div className="mt-3 space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[10px] text-ink-45">رنگ</span>
        <div className="flex items-center gap-1.5">
          {product.colors.map((c) => {
            const out = colorSoldOut(c.id);
            const active = c.id === colorId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => !out && onColor(c.id)}
                disabled={out}
                aria-pressed={active}
                aria-label={`${c.name}${out ? " — ناموجود" : ""}`}
                title={`${c.name}${out ? " — ناموجود" : ""}`}
                className={cn(
                  "relative h-6 w-6 rounded-full transition-all duration-200",
                  "ring-1 ring-black/15 ring-offset-1 ring-offset-white",
                  active && "ring-[1.5px] ring-ink",
                  out ? "cursor-not-allowed opacity-35" : "hover:scale-110",
                )}
                style={{ backgroundColor: c.hex }}
              >
                {out && <span className="absolute inset-x-[-2px] top-1/2 h-px rotate-45 bg-ink/60" />}
              </button>
            );
          })}
        </div>
        <span className="text-[11px] text-ink-70">{activeColor?.name}</span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[10px] text-ink-45">سایز</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {product.sizes.map((s) => {
            const out = sizeSoldOut(s.id);
            const active = s.id === sizeId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => !out && onSize(s.id)}
                disabled={out}
                aria-pressed={active}
                aria-label={`سایز ${s.label}${out ? " — ناموجود" : ""}`}
                className={cn(
                  "relative min-w-[2.1rem] rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-200",
                  active
                    ? "border-ink bg-ink text-bone"
                    : "border-black/12 bg-white/70 text-ink-70 hover:border-ink/45 hover:text-ink",
                  out && "cursor-not-allowed border-dashed border-black/10 bg-transparent text-ink-45/60 line-through",
                )}
              >
                {s.label}
                {active && !singleSize && <Check className="ml-0.5 -mt-px inline h-2.5 w-2.5" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
