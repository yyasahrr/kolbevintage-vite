import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/utils/cn";
import { useLiveCatalog } from "@/state/live-catalog";
import { useOps } from "@/state/ops";
import { ProductThumb } from "./ProductThumb";
import { ProductImage } from "./ProductImage";
import type { Product } from "@/types";

/** The first frame is the actual product cover. Navigation is separate from the
 * product link, so mouse, touch and keyboard users can use it without navigating. */
export function CardMedia({
  product,
  className,
  interactive = false,
  colorId,
  strictColor = false,
}: {
  product: Product;
  className?: string;
  interactive?: boolean;
  colorId?: string;
  strictColor?: boolean;
}) {
  const ops = useOps();
  const catalog = useLiveCatalog();
  const gallery =
    catalog.products.find((item) => item.id === product.id)?.images ?? [];
  const legacy = ops.hoverMedia[product.id];
  const specific = colorId
    ? gallery.filter((i) => i.colorId === colorId && i.role !== "hover" && i.role !== "cutout")
    : [];
  const cover =
    specific.find((i) => i.role === "main") ??
    specific[0] ??
    (!strictColor ? gallery.find((i) => i.role === "main") ??
    gallery.find((i) => i.role !== "hover" && i.role !== "cutout") : undefined);
  const images = useMemo(() => {
    // null means ProductThumb's existing crop/fallback, not a fabricated image.
    const urls: (string | null)[] = [cover?.url ?? null];
    for (const image of gallery)
      if ((!strictColor || image.colorId === colorId) && image.role !== "cutout" && image.url && !urls.includes(image.url)) urls.push(image.url);
    if (!strictColor && legacy?.hoverImage && !urls.includes(legacy.hoverImage))
      urls.push(legacy.hoverImage);
    return urls;
  }, [cover?.url, gallery, legacy?.hoverImage, strictColor, colorId]);
  const hoverUrl =
    gallery.find((i) => (!strictColor || i.colorId === colorId) && i.role === "hover" && i.url !== cover?.url)?.url ??
    images[1] ??
    null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const startTouch = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const [index, setIndex] = useState(0);
  const [manual, setManual] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [hover, setHover] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  // The hovered image can be replaced while the pointer is over it; native
  // mouseleave still fires on the stable frame even if the old image unmounts.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const leave = () => {
      setDirection(-1);
      setHover(false);
    };
    root.addEventListener("mouseleave", leave);
    return () => root.removeEventListener("mouseleave", leave);
  }, []);
  const activeHover = hover || focusWithin;
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    setIndex(0);
    setManual(false);
  }, [product.id, colorId]);
  useEffect(() => {
    if (index >= images.length) {
      setIndex(0);
      setManual(false);
    }
  }, [index, images.length]);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const hoverVideo =
    !strictColor && !manual && activeHover && !hoverUrl && !!legacy?.hoverVideo && !reduced;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (hoverVideo) void video.play().catch(() => undefined);
    else {
      video.pause();
      try {
        video.currentTime = 0;
      } catch {
        /* metadata not ready */
      }
    }
  }, [hoverVideo]);
  // A browsable gallery starts on its cover even on hover/focus. Otherwise the
  // first arrow press could silently skip the second photograph on desktop.
  const previewHover = !interactive && activeHover && hoverUrl;
  const displayed = manual ? images[index] : previewHover || images[0];
  const shownIndex = manual
    ? index
    : previewHover
      ? Math.max(0, images.indexOf(previewHover))
      : 0;
  useEffect(() => {
    // Prefetch only neighboring frames once the shopper interacts with this card.
    if (!activeHover && !manual) return;
    for (const offset of [-1, 1]) {
      const url = images[(shownIndex + offset + images.length) % images.length];
      if (url) {
        const image = new Image();
        image.src = url;
      }
    }
  }, [activeHover, manual, images, shownIndex]);
  const step = (offset: number) => {
    setDirection(offset > 0 ? 1 : -1);
    setIndex((shownIndex + offset + images.length) % images.length);
    setManual(true);
  };
  const media = (
    <>
      <div className="card-gallery-frame">
        <AnimatePresence initial={false} custom={direction}>
          <motion.div
            key={displayed ?? "fallback"}
            className="card-gallery-slide"
            custom={direction}
            variants={{
              enter: (dir: 1 | -1) => ({ x: `${dir * -100}%` }),
              center: { x: 0 },
              exit: (dir: 1 | -1) => ({ x: `${dir * 100}%` }),
            }}
            initial={reduced ? false : "enter"}
            animate="center"
            exit={reduced ? "center" : "exit"}
            transition={{ duration: reduced ? 0 : 0.32, ease: "easeInOut" }}
            aria-hidden="true"
          >
            {displayed ? (
              <div className="relative w-full bg-[#efe9e0]">
                <ProductImage
                  src={displayed}
                  alt=""
                  lazy
                  className="absolute inset-0 h-full w-full object-cover"
                />
              </div>
            ) : strictColor ? (
              <div className="grid h-full place-items-center bg-[#efe9e0] p-4 text-center text-xs text-ink-70">تصویر این رنگ ثبت نشده است</div>
            ) : (
              <ProductThumb
                product={product}
                colorId={colorId}
                decorative
                tileAspect={0.8}
                tint="#b7a48c"
                className="w-full rounded-none ring-0"
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      {!strictColor && legacy?.hoverVideo && !manual && !hoverUrl && !reduced && (
        <div
          className={cn("card-media-layer", hoverVideo && "is-on")}
          aria-hidden
        >
          <video
            ref={videoRef}
            src={legacy.hoverVideo}
            muted
            loop
            playsInline
            preload="none"
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/10 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
    </>
  );
  return (
    <div
      ref={rootRef}
      className={cn("card-media relative overflow-hidden", className)}
      onMouseEnter={() => {
        setDirection(1);
        setHover(true);
      }}
      onFocusCapture={() => {
        setDirection(1);
        setFocusWithin(true);
      }}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setDirection(-1);
          setFocusWithin(false);
        }
      }}
      onTouchStart={(e) => {
        const t = e.touches.length === 1 ? e.touches[0] : null;
        startTouch.current = t ? { x: t.clientX, y: t.clientY } : null;
        swiped.current = false;
      }}
      onTouchEnd={(e) => {
        const t = e.changedTouches[0],
          start = startTouch.current;
        startTouch.current = null;
        if (
          !interactive ||
          !t ||
          !start ||
          e.touches.length ||
          images.length < 2
        )
          return;
        const dx = t.clientX - start.x,
          dy = t.clientY - start.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
          swiped.current = true;
          step(dx > 0 ? 1 : -1);
        }
      }}
      onTouchCancel={() => {
        startTouch.current = null;
      }}
    >
      {interactive ? (
        <Link
          to={`/product/${product.id}`}
          aria-label={`مشاهده ${product.name}`}
          className="block outline-offset-4"
          onClick={(e) => {
            if (swiped.current) {
              e.preventDefault();
              swiped.current = false;
            }
          }}
        >
          {media}
        </Link>
      ) : (
        media
      )}
      {strictColor && !cover && <span className="sr-only">تصویر این رنگ ثبت نشده است.</span>}
      {interactive && images.length > 1 && (
        <>
          <button
            type="button"
            className="card-gallery-arrow card-gallery-prev"
            aria-label={`تصویر قبلی ${product.name}`}
            onClick={() => step(-1)}
          >
            <ChevronRight size={18} aria-hidden />
          </button>
          <button
            type="button"
            className="card-gallery-arrow card-gallery-next"
            aria-label={`تصویر بعدی ${product.name}`}
            onClick={() => step(1)}
          >
            <ChevronLeft size={18} aria-hidden />
          </button>
          <span
            className="card-gallery-count"
            aria-live="polite"
            aria-atomic="true"
          >
            {(shownIndex + 1).toLocaleString("fa-IR")} /{" "}
            {images.length.toLocaleString("fa-IR")}
          </span>
        </>
      )}
    </div>
  );
}
