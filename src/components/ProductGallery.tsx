import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductImage } from "./ProductImage";
import { cn } from "@/utils/cn";
import { galleryFor, type CatalogProduct } from "@/data/catalog";
import { IMAGE_ROLE_LABEL } from "@/state/ops";
import { useLiveCatalog } from "@/state/live-catalog";
import type { ColorOption, Crop } from "@/types";

interface Slide {
  kind: "image" | "frame";
  label: string;
  image?: string;
  crop?: Crop;
  colorName?: string;
  colorHex?: string;
}

/**
 * Product gallery with colour-aware ordering:
 *  1. images assigned to the selected colour come first
 *  2. images of the other colours follow (so the shopper can peek at them)
 *  3. the standard runway framings close the list
 *
 * On mobile it is a snap carousel sized to 84% so the next photo peeks in
 * from the side instead of being hidden behind a slider control.
 */
export function ProductGallery({
  product,
  color,
  overlay,
}: {
  product: CatalogProduct;
  color: ColorOption;
  overlay?: ReactNode;
}) {
  const catalog = useLiveCatalog();
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  const slides = useMemo<Slide[]>(() => {
    const out: Slide[] = [];
    const all = catalog.products.find(item => item.id === product.id)?.images ?? [];
    const rank = { main: 0, gallery: 1, detail: 2, hover: 9, cutout: 10 } as const;
    // hover-only pictures never enter the gallery
    const usable = all.filter((i) => i.role !== "hover" && i.role !== "cutout").sort((a, b) => rank[a.role] - rank[b.role]);
    const forColor = (colorId: string) => usable.filter((i) => i.colorId === "*" || i.colorId === colorId);
    const push = (list: typeof usable) => {
      list.forEach((img) => {
        const c = product.colors.find((x) => x.id === img.colorId);
        out.push({
          kind: "image",
          image: img.url,
          label: IMAGE_ROLE_LABEL[img.role],
          colorName: c?.name,
          colorHex: c?.hex,
        });
      });
    };
    push(forColor(color.id));
    for (const c of product.colors) {
      if (c.id === color.id) continue;
      push(usable.filter((i) => i.colorId === c.id));
    }
    if (out.length === 0) {
      for (const f of galleryFor(product)) out.push({ kind: "frame", crop: f, label: f.label });
    }
    return out;
  }, [catalog.products, product, color]);

  useEffect(() => {
    setIndex(0);
    trackRef.current?.scrollTo({ left: 0 });
  }, [color.id, product.id]);

  const go = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(slides.length - 1, index + dir));
    setIndex(next);
    const el = trackRef.current;
    if (el) {
      const child = el.children[next] as HTMLElement | undefined;
      child?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest", inline: "start" });
    }
  };

  const renderSlide = (s: Slide, i: number, small = false) => (
    <div className="pg-frame">
      {s.kind === "image" ? (
        <ProductImage src={s.image} alt={`${product.name} — ${s.label}`} className="pg-img" />
      ) : (
        <FramedCrop image={product.image} name={product.name} aspect={product.aspect} crop={s.crop!} />
      )}
      {!small && s.colorHex && (
        <span className="pg-color-chip">
          <i style={{ background: s.colorHex }} /> {s.colorName}
        </span>
      )}
      {!small && <span className="pg-label">{s.label}</span>}
      <span className="sr-only">
        تصویر {(i + 1).toLocaleString("fa-IR")} از {slides.length.toLocaleString("fa-IR")}
      </span>
    </div>
  );

  return (
    <div className="pg">
      {/* mobile: peek carousel */}
      <div className="pg-mobile">
        <div
          ref={trackRef}
          className="pg-track"
          onScroll={(e) => {
            const el = e.currentTarget;
            const track = el.getBoundingClientRect();
            const rtl = getComputedStyle(el).direction === "rtl";
            const start = rtl ? track.right : track.left;
            const closest = [...el.children].reduce((best, child, i) => {
              const rect = child.getBoundingClientRect();
              const distance = Math.abs((rtl ? rect.right : rect.left) - start);
              return distance < best.distance ? { index: i, distance } : best;
            }, { index: 0, distance: Infinity });
            setIndex(closest.index);
          }}
        >
          {slides.map((s, i) => (
            <div key={i} className="pg-slide">
              {renderSlide(s, i)}
              {i === index && overlay && (
                <div className="pointer-events-none absolute inset-0 z-10">{overlay}</div>
              )}
            </div>
          ))}
        </div>
        {slides.length > 1 && (
          <>
            <button type="button" className="pg-arrow is-prev" aria-label="تصویر قبلی" onClick={() => go(-1)} disabled={index === 0}>
              <ChevronRight width={16} height={16} />
            </button>
            <button type="button" className="pg-arrow is-next" aria-label="تصویر بعدی" onClick={() => go(1)} disabled={index >= slides.length - 1}>
              <ChevronLeft width={16} height={16} />
            </button>
            <div className="pg-dots">
              {slides.map((_, i) => (
                <button key={i} type="button" aria-label={`تصویر ${i + 1}`} className={cn(i === index && "is-on")} onClick={() => { setIndex(i); const el = trackRef.current; const child = el?.children[i] as HTMLElement | undefined; child?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", inline: "start", block: "nearest" }); }} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* desktop: main + thumbs */}
      <div className="pg-desktop">
        <div className="pg-main">
          {slides[index] ? renderSlide(slides[index], index) : <div className="pg-frame" />}
          {overlay && <div className="pointer-events-none absolute inset-0 z-10">{overlay}</div>}
          {slides.length > 1 && (
            <>
              <button type="button" className="pg-arrow is-prev" aria-label="تصویر قبلی" onClick={() => go(-1)} disabled={index === 0}>
                <ChevronRight width={15} height={15} />
              </button>
              <button type="button" className="pg-arrow is-next" aria-label="تصویر بعدی" onClick={() => go(1)} disabled={index >= slides.length - 1}>
                <ChevronLeft width={15} height={15} />
              </button>
            </>
          )}
        </div>
        {slides.length > 1 && (
          <div className="pg-thumbs">
            {slides.map((s, i) => (
              <button key={i} type="button" className={cn("pg-thumb", i === index && "is-on")} onClick={() => setIndex(i)} aria-label={`نمای ${s.label}${s.colorName ? " " + s.colorName : ""}`} aria-pressed={i === index}>
                {renderSlide(s, i, true)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FramedCrop({ image, name, aspect, crop, tileAspect = 0.82 }: { image: string; name: string; aspect: number; crop: Crop; tileAspect?: number }) {
  const hFrac = Math.min(1, (crop.zoom * aspect) / tileAspect);
  const cy = Math.min(Math.max(crop.cy, hFrac / 2), 1 - hFrac / 2);
  const widthPct = 100 / crop.zoom;
  const leftPct = 50 - (crop.cx * 100) / crop.zoom;
  const topPct = 50 - (cy * 100) / hFrac;
  return (
    <div className="relative h-full w-full overflow-hidden" style={{ aspectRatio: tileAspect }}>
      <ProductImage src={image} alt={name} className="pointer-events-none absolute max-w-none select-none" style={{ width: `${widthPct}%`, left: `${leftPct}%`, top: `${topPct}%` }} />
    </div>
  );
}
