import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { ShoppingBag, X, Layers } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatPrice, stockOf } from "@/data/looks";
import { LookProductCard } from "./LookProductCard";
import type { Look, SelectionMap, VariantSelection } from "@/types";

interface Props {
  look: Look | null;
  open: boolean;
  isDesktop: boolean;
  reduced: boolean;
  selections: SelectionMap;
  cartKeys: Set<string>;
  onSelectionChange: (productId: string, patch: Partial<VariantSelection>) => void;
  onAddProduct: (productId: string) => void;
  onAddLook: () => void;
  onClose: () => void;
}

export function LookDetailsPanel(props: Props) {
  const { look, open, isDesktop } = props;
  return (
    <AnimatePresence mode="wait">
      {open && look ? (
        isDesktop ? (
          <DesktopPanel key="desktop-panel" {...props} look={look} />
        ) : (
          <MobileSheet key="mobile-sheet" {...props} look={look} />
        )
      ) : null}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* shared pieces                                                       */
/* ------------------------------------------------------------------ */

function useLookTotals(props: Props & { look: Look }) {
  const { look, selections } = props;
  return useMemo(() => {
    const included = look.products.filter((p) => selections[p.id]?.included);
    const unavailable = included.filter((p) => {
      const s = selections[p.id];
      return !s || stockOf(p, s.colorId, s.sizeId) === 0;
    });
    const total = included.reduce((n, p) => n + p.price, 0);
    return { included, unavailable, total, canAdd: included.length > 0 && unavailable.length === 0 };
  }, [look, selections]);
}

function PanelHeader({
  look,
  onClose,
  titleId,
  compact,
}: {
  look: Look;
  onClose: () => void;
  titleId: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", compact ? "px-5 pt-1 pb-3" : "px-6 pt-6 pb-4")}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="h-px w-5 bg-ink/30" />
          <p className="text-[10.5px] text-ink-45">{look.season}</p>
        </div>
        <h2 id={titleId} className="mt-1.5 font-display text-[24px] leading-[1.25] font-medium text-ink sm:text-[27px]">
          {look.name}
        </h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-70">{look.tagline}</p>
        <p className="mt-2.5 inline-flex items-center gap-1.5 text-[10px] tracking-[0.18em] text-ink-45 uppercase">
          <Layers className="h-3 w-3" />
          {look.products.length.toLocaleString("fa-IR")} قطعه در این استایل
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="بستن جزئیات استایل"
        className="-mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/10 text-ink-70 transition-colors hover:bg-ink hover:text-bone"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function ProductList(props: Props & { look: Look }) {
  const { look, selections, cartKeys, onSelectionChange, onAddProduct, reduced } = props;
  if (!look.products.length) {
    return (
      <div className="px-6 py-14 text-center text-sm text-ink-45">
        این اگزیت هنوز قطعهٔ قابل‌خریدی ندارد؛ بعد از نمایش دوباره سر بزن.
      </div>
    );
  }
  return (
    <ul className="space-y-2.5 px-5 pb-4 sm:px-6">
      {look.products.map((p, i) => {
        const sel = selections[p.id];
        if (!sel) return null;
        return (
          <LookProductCard
            key={p.id}
            product={p}
            selection={sel}
            index={i}
            accent={look.accent}
            reduced={reduced}
            inCart={cartKeys.has(`${p.id}:${sel.colorId}:${sel.sizeId}`)}
            onChange={(patch) => onSelectionChange(p.id, patch)}
            onAdd={() => onAddProduct(p.id)}
          />
        );
      })}
    </ul>
  );
}

function PanelFooter(props: Props & { look: Look }) {
  const { total, canAdd, included, unavailable } = useLookTotals(props);
  return (
    <div className="border-t border-black/[0.07] bg-paper/95 px-5 pt-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:px-6">
      <div className="mb-2.5 flex items-baseline justify-between">
        <span className="text-[11px] tracking-[0.18em] text-ink-45 uppercase">
          {included.length.toLocaleString("fa-IR")} قطعه انتخاب‌شده
          {included.length !== props.look.products.length && ` از ${props.look.products.length.toLocaleString("fa-IR")}`}
        </span>
        <span className="font-display text-[22px] text-ink">{formatPrice(total)}</span>
      </div>
      <button
        type="button"
        onClick={props.onAddLook}
        disabled={!canAdd}
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-full px-5 py-3.5 text-[12px] font-medium tracking-[0.16em] uppercase transition-all duration-250",
          canAdd
            ? "bg-ink text-bone hover:bg-ink/85 active:scale-[0.985]"
            : "cursor-not-allowed bg-black/[0.07] text-ink-45",
        )}
      >
        <ShoppingBag className="h-4 w-4" />
        افزودن استایل کامل
      </button>
      <p className="mt-2 min-h-[15px] text-center text-[11px] text-ink-45">
        {included.length === 0
          ? "برای افزودن استایل، حداقل یک قطعه را انتخاب کن."
          : unavailable.length > 0
            ? `${unavailable.length.toLocaleString("fa-IR")} قطعهٔ انتخاب‌شده ناموجود است — رنگ یا سایز را عوض کن.`
            : "ارسال و مرجوعی رایگان برای همهٔ سفارش‌های رانوی."}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* desktop — docked right panel                                        */
/* ------------------------------------------------------------------ */

function DesktopPanel(props: Props & { look: Look }) {
  const { look, onClose, reduced } = props;
  const ref = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleId = "look-panel-title";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [look.id]);

  // move focus into the panel once, without yanking the page around
  useEffect(() => {
    const id = window.setTimeout(() => ref.current?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <motion.aside
      ref={ref}
      role="dialog"
      tabIndex={-1}
      aria-labelledby={titleId}
      initial={reduced ? { opacity: 0 } : { x: -32, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={reduced ? { opacity: 0 } : { x: -32, opacity: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 0.61, 0.24, 1] }}
      className="fixed top-[106px] left-4 bottom-4 z-40 flex w-[min(27rem,34vw)] min-w-[23rem] flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-paper/92 shadow-[0_24px_70px_-28px_rgba(22,19,15,0.45)] backdrop-blur-xl"
    >
      <PanelHeader look={look} onClose={onClose} titleId={titleId} />
      <div ref={scrollRef} className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ProductList {...props} />
      </div>
      <PanelFooter {...props} />
    </motion.aside>
  );
}

/* ------------------------------------------------------------------ */
/* mobile — draggable bottom sheet                                     */
/* ------------------------------------------------------------------ */

function MobileSheet(props: Props & { look: Look }) {
  const { look, onClose, reduced } = props;
  const dragControls = useDragControls();
  const [expanded, setExpanded] = useState(false);
  const [metrics, setMetrics] = useState({ peek: 520, full: 760 });
  const titleId = "look-sheet-title";
  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // The sheet keeps its footer (and the "add complete look" CTA) on screen at
  // both heights — the peek state is a shorter sheet, not a translated one.
  useEffect(() => {
    const measure = () => {
      const h = window.innerHeight;
      const full = Math.round(h * 0.93);
      const peek = Math.max(420, Math.min(Math.round(h * 0.64), full - 90));
      setMetrics({ peek, full });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Escape to close + a lightweight focus trap (the sheet is modal on mobile)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !sheetRef.current) return;
      const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const id = window.setTimeout(() => sheetRef.current?.focus({ preventScroll: true }), 80);
    return () => window.clearTimeout(id);
  }, []);

  // keep the list pinned to the top whenever the look changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [look.id]);

  const sheetHeight = expanded ? metrics.full : metrics.peek;

  return (
    <>
      <motion.div
        key="scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: expanded ? 0.42 : 0.16 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        onClick={onClose}
        className="fixed inset-0 z-40 bg-ink"
        aria-hidden
      />
      <motion.div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby={titleId}
        drag="y"
        dragListener={false}
        dragControls={dragControls}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0.02, bottom: 0.28 }}
        initial={{ height: metrics.peek, opacity: 0 }}
        animate={{ height: sheetHeight, opacity: 1, y: 0 }}
        exit={{ height: metrics.peek, opacity: 0 }}
        transition={
          reduced ? { duration: 0.01 } : { type: "spring", stiffness: 380, damping: 40, mass: 0.85, restDelta: 0.5 }
        }
        onDragEnd={(_, info) => {
          if (info.velocity.y > 650 || info.offset.y > (expanded ? 130 : 90)) {
            if (!expanded) onClose();
            else setExpanded(false);
          } else if (info.offset.y < -40) {
            setExpanded(true);
          }
        }}
        className="fixed inset-x-0 bottom-0 z-50 flex touch-none flex-col overflow-hidden rounded-t-[var(--radius-3xl)] border-t border-black/[0.07] bg-paper shadow-[0_-16px_60px_-18px_rgba(22,19,15,0.4)]"
      >
        <div
          onPointerDown={(e) => dragControls.start(e)}
          onDoubleClick={() => setExpanded((v) => !v)}
          className="shrink-0 cursor-grab touch-none pt-2.5 pb-1 active:cursor-grabbing"
        >
          <button
            type="button"
            aria-label={expanded ? "جمع کردن پنل" : "باز کردن کامل پنل"}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="mx-auto flex h-4 w-14 items-center justify-center"
          >
            <span className="block h-1.5 w-11 rounded-full bg-ink/20 transition-colors" />
          </button>
          <PanelHeader look={look} onClose={onClose} titleId={titleId} compact={!expanded} />
        </div>
        <div
          ref={scrollRef}
          className="thin-scrollbar min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain"
          style={{ touchAction: "pan-y" }}
        >
          <ProductList {...props} />
        </div>
        <div className="shrink-0 touch-auto">
          <PanelFooter {...props} />
        </div>
      </motion.div>
    </>
  );
}
