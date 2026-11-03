import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";
import { useOps } from "@/state/ops";
import { ProductThumb } from "./ProductThumb";
import type { CatalogProduct } from "@/data/catalog";

/**
 * Product-card media:
 *  • default = the framed cut-out thumbnail
 *  • on hover / focus = the admin-configured hover image or a muted, looping,
 *    very short video. Falls back to the product's alternate framing.
 *  • respects prefers-reduced-motion (no video autoplay)
 */
export function CardMedia({ product, className }: { product: CatalogProduct; className?: string }) {
  const ops = useOps();
  const media = ops.hoverMedia[product.id];
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hover, setHover] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (hover && !reduced) {
      v.play().catch(() => undefined);
    } else {
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        /* not loaded yet */
      }
    }
  }, [hover, reduced]);

  const hasMedia = !!(media?.hoverVideo || media?.hoverImage);

  return (
    <div
      className={cn("card-media relative overflow-hidden", className)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <ProductThumb
        product={product}
        tileAspect={0.8}
        tint={product.lookOrder % 2 ? "#c2b09a" : "#b7a48c"}
        className="w-full rounded-none ring-0"
      />

      {hasMedia && (
        <div className={cn("card-media-layer", hover && "is-on")} aria-hidden>
          {media?.hoverVideo ? (
            <video ref={videoRef} src={media.hoverVideo} muted loop playsInline preload="metadata" poster={media.hoverImage} className="h-full w-full object-cover" />
          ) : media?.hoverImage ? (
            <img src={media.hoverImage} alt="" draggable={false} className="h-full w-full object-cover" />
          ) : null}
        </div>
      )}

      {hasMedia && <span className="card-media-hint" aria-hidden>▸ نمای دوم</span>}
    </div>
  );
}
