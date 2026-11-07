import { cn } from "@/utils/cn";
import { ProductImage } from "./ProductImage";
import { useLiveCatalog } from "@/state/live-catalog";
import type { Product } from "@/types";

interface Props {
  product: Product;
  tint?: string;
  className?: string;
  /** width / height of the tile itself */
  tileAspect?: number;
  /** lighten hard crops on white backgrounds so the garment reads at a glance */
  softLight?: boolean;
  /** the name is already text next to the tile: repeating it in alt is noise for a screen reader */
  decorative?: boolean;
  /** Prefer photos belonging to the currently selected product colour. */
  colorId?: string;
}

/**
 * Thumbnails are framed crops of the same transparent runway cut-out, so every
 * product image is genuinely the garment as worn on the runway.
 */
export function ProductThumb({ product, tint = "#bba893", className, tileAspect = 0.78, softLight = true, decorative = false, colorId }: Props) {
  const { crop, aspect, image, name } = product;
  const catalog = useLiveCatalog();
  const uploaded = catalog.products.find(item => item.id === product.id)?.images ?? [];
  // an uploaded photo always wins over the runway crop
  const specific = colorId ? uploaded.filter(i => i.colorId === colorId && i.role !== "hover" && i.role !== "cutout") : [];
  const shared = uploaded.filter(i => i.colorId === "*" && i.role !== "hover" && i.role !== "cutout");
  const cover = (specific.find(i => i.role === "main") ?? specific[0] ?? shared.find(i => i.role === "main") ?? shared[0] ?? uploaded.find(i => i.role === "main") ?? uploaded.find(i => i.role !== "hover" && i.role !== "cutout"))?.url;
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
      {cover ? (
        <ProductImage
          src={cover}
          alt={decorative ? "" : name}
          lazy
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <>
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(155deg, ${tint}2e 0%, ${tint}0d 45%, #ffffff00 100%)` }}
          />
          <ProductImage
            src={image}
            alt={decorative ? "" : name}
            lazy
            className="pointer-events-none absolute select-none"
            style={{
              width: `${widthPct}%`,
              left: `${leftPct}%`,
              top: `${topPct}%`,
              maxWidth: "none",
              filter: softLight ? "drop-shadow(0 6px 10px rgba(22,19,15,0.06))" : undefined,
            }}
          />
        </>
      )}
    </div>
  );
}
