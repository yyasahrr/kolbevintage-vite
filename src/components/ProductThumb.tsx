import { cn } from "@/utils/cn";
import type { Product } from "@/types";

interface Props {
  product: Product;
  tint?: string;
  className?: string;
  /** width / height of the tile itself */
  tileAspect?: number;
  /** lighten hard crops on white backgrounds so the garment reads at a glance */
  softLight?: boolean;
}

/**
 * Thumbnails are framed crops of the same transparent runway cut-out, so every
 * product image is genuinely the garment as worn on the runway.
 */
export function ProductThumb({ product, tint = "#bba893", className, tileAspect = 0.78, softLight = true }: Props) {
  const { crop, aspect, image, name } = product;
  const hFrac = Math.min(1, (crop.zoom * aspect) / tileAspect);
  const cy = Math.min(Math.max(crop.cy, hFrac / 2), 1 - hFrac / 2);

  const widthPct = 100 / crop.zoom;
  const leftPct = 50 - (crop.cx * 100) / crop.zoom;
  const topPct = 50 - (cy * 100) / hFrac;

  return (
    <div
      className={cn(
        "relative shrink-0 self-start overflow-hidden rounded-[var(--radius-thumb)] bg-[#efe9e0] ring-1 ring-black/5",
        className,
      )}
      style={{ aspectRatio: tileAspect }}
    >
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(155deg, ${tint}2e 0%, ${tint}0d 45%, #ffffff00 100%)` }}
      />
      <img
        src={image}
        alt={name}

        loading="lazy"
        decoding="async"
        draggable={false}
        className="pointer-events-none absolute select-none"
        style={{
          width: `${widthPct}%`,
          left: `${leftPct}%`,
          top: `${topPct}%`,
          maxWidth: "none",
          filter: softLight ? "drop-shadow(0 6px 10px rgba(22,19,15,0.06))" : undefined,
        }}
      />
    </div>
  );
}
