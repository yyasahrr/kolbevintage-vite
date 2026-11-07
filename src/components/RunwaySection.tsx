import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { BACKDROPS, firstAvailable, stockOf } from "@/data/looks";
import { liveLooks } from "@/data/catalog";
import { useLiveCatalog } from "@/state/live-catalog";
import { useAdmin } from "@/state/admin";
import type { Look } from "@/types";
import { useCart } from "@/state/cart";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { RunwayScene } from "./RunwayScene";
import { RunwayControls } from "./RunwayControls";
import { LookDetailsPanel } from "./LookDetailsPanel";
import { DEFAULT_SETTINGS, SceneSettingsPopover } from "./SceneSettings";
import type { AddPayload } from "@/state/cart";
import type { SceneSettings, SelectionMap, VariantSelection } from "@/types";

function initialSelections(looks: Look[]): SelectionMap {
  const map: SelectionMap = {};
  for (const look of looks) {
    for (const p of look.products) {
      const { colorId, sizeId } = firstAvailable(p);
      map[p.id] = { colorId, sizeId, included: true };
    }
  }
  return map;
}

interface RunwaySectionProps {
  /** deep-link into a specific runway exit: /style/look-03 */
  initialLookId?: string;
}

export function RunwaySection({ initialLookId }: RunwaySectionProps = {}) {
  const reduced = useReducedMotion() ?? false;
  const isDesktop = useIsDesktop();
  const { add, lines, cartOpen } = useCart();

  // the runway is fed by the live catalogue so owner-built looks appear here
  const admin = useAdmin();
  const catalog = useLiveCatalog();
  const looks = useMemo(() => liveLooks(), [admin, catalog.products]);

  const [activeIndex, setActiveIndex] = useState(() => {
    const i = looks.findIndex((l) => l.id === initialLookId);
    return i >= 0 ? i : 0;
  });
  const [panelOpen, setPanelOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<SceneSettings>(DEFAULT_SETTINGS);
  const [selections, setSelections] = useState<SelectionMap>(() => initialSelections(looks));
  useEffect(() => {
    const defaults = initialSelections(looks);
    setSelections(previous => {
      const missing = Object.keys(defaults).filter(id => !previous[id]);
      if (!missing.length) return previous;
      return {...defaults,...previous};
    });
  }, [looks]);

  useEffect(() => {
    if (!initialLookId) return;
    const i = looks.findIndex((l) => l.id === initialLookId);
    if (i >= 0) setActiveIndex(i);
  }, [initialLookId, looks]);

  // hiding or deleting a look must never leave the runway pointing past the end
  useEffect(() => {
    setActiveIndex((i) => Math.min(i, Math.max(0, looks.length - 1)));
  }, [looks.length]);

  const lastStep = useRef(0);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const activeLook = looks[activeIndex] ?? looks[0];
  const backdrop = BACKDROPS.find((b) => b.id === settings.backdrop) ?? BACKDROPS[0];

  const cartKeys = useMemo(() => new Set(lines.map((l) => l.key)), [lines]);

  /* ---------------- navigation ---------------- */

  const step = useCallback((dir: 1 | -1) => {
    const now = performance.now();
    if (now - lastStep.current < 110) return; // guard against animation pile-up
    lastStep.current = now;
    setActiveIndex((i) => (i + dir + looks.length) % Math.max(1, looks.length));
  }, [looks.length]);

  const selectModel = useCallback(
    (index: number) => {
      restoreFocus.current = document.activeElement as HTMLElement;
      // on phones the details sheet covers the runway, so tapping a model only
      // switches it — the sheet opens from «خرید این استایل» when the shopper is ready
      if (!isDesktop) {
        setActiveIndex(index);
        return;
      }
      if (index === activeIndex) {
        setPanelOpen((v) => !v);
      } else {
        setActiveIndex(index);
        setPanelOpen(true);
      }
    },
    [activeIndex, isDesktop],
  );

  /** rail navigation: move the runway without forcing the panel open */
  const goTo = useCallback((index: number) => setActiveIndex(index), []);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    const el = restoreFocus.current;
    if (el && document.contains(el)) window.setTimeout(() => el.focus({ preventScroll: true }), 10);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (cartOpen || settingsOpen) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, cartOpen, settingsOpen]);

  /* ---------------- variants + cart ---------------- */

  const onSelectionChange = useCallback((productId: string, patch: Partial<VariantSelection>) => {
    setSelections((prev) => {
      const current = prev[productId];
      if (!current) return prev;
      const product = looks.flatMap((l) => l.products).find((p) => p.id === productId);
      let next = { ...current, ...patch };
      // switching colour: keep the size if it exists, otherwise fall back to an available one
      if (product && patch.colorId && stockOf(product, next.colorId, next.sizeId) === 0) {
        const size = product.sizes.find((s) => stockOf(product, next.colorId, s.id) > 0);
        if (size) next = { ...next, sizeId: size.id };
      }
      return { ...prev, [productId]: next };
    });
  }, [looks]);

  const addProduct = useCallback(
    (productId: string) => {
      const product = activeLook.products.find((p) => p.id === productId);
      const sel = selections[productId];
      if (!product || !sel) return;
      const color = product.colors.find((c) => c.id === sel.colorId);
      const size = product.sizes.find((s) => s.id === sel.sizeId);
      if (!color || !size) return;
      add([{ product, color, size, lookName: activeLook.name }], {
        title: `${product.name} به سبد اضافه شد`,
        detail: `${color.name} · ${size.label} · ${activeLook.name}`,
      });
    },
    [activeLook, selections, add],
  );

  const addLook = useCallback(() => {
    const items: AddPayload[] = [];
    for (const product of activeLook.products) {
      const sel = selections[product.id];
      if (!sel?.included) continue;
      const color = product.colors.find((c) => c.id === sel.colorId);
      const size = product.sizes.find((s) => s.id === sel.sizeId);
      if (!color || !size || stockOf(product, color.id, size.id) === 0) return;
      items.push({ product, color, size, lookName: activeLook.name });
    }
    if (!items.length) return;
    add(items, {
      title: `«${activeLook.name}» به سبد اضافه شد`,
      detail: `${items.length.toLocaleString("fa-IR")} قطعه از اگزیت ${activeLook.order.toLocaleString("fa-IR", { minimumIntegerDigits: 2, useGrouping: false })}`,
    });
  }, [activeLook, selections, add]);

  /* ---------------- render ---------------- */
  if (!activeLook) return <section className="mx-auto max-w-[1500px] px-4 py-16" role="status">{catalog.status === "loading" ? "در حال دریافت استایل‌ها…" : catalog.status === "offline" ? "اتصال به فروشگاه برقرار نیست." : "استایلی با محصول منتشرشده وجود ندارد."}</section>;

  return (
    <section id="runway" className="relative mx-auto w-full max-w-[1500px] px-4 pt-6 pb-16 sm:px-6 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[34rem]">
          <div className="flex items-center gap-2.5">
            <span className="h-px w-8 bg-ink/35" />
            <p className="text-[9.5px] tracking-[0.3em] text-ink-45 uppercase">رانوی تعاملی · پاییز / زمستان ۲۶</p>
          </div>
          <h1 className="mt-2.5 font-display text-[clamp(1.75rem,4.4vw,2.9rem)] leading-[1.32] font-medium text-ink">
            خرید بر اساس استایل
            <span className="block text-ink-70">از روی رانوی.</span>
          </h1>
          <p className="mt-3 max-w-[30rem] text-[12.5px] leading-[1.9] text-ink-70">
            شش اگزیت، از سر تا پا استایل‌دهی‌شده. بین مدل‌ها حرکت کن، هر استایل را باز کن و قطعه‌هایش را با سایز و
            رنگ دلخواه — تکی یا به‌صورت استایل کامل — به سبد اضافه کن.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <p className="hidden text-right text-[10px] leading-relaxed tracking-[0.14em] text-ink-45 uppercase sm:block">
            مدل را انتخاب کن
            <br />
            بعد «خرید این استایل»
          </p>
          <SceneSettingsPopover
            open={settingsOpen}
            settings={settings}
            reduced={reduced}
            onToggle={() => setSettingsOpen((v) => !v)}
            onChange={(patch) => setSettings((s) => ({ ...s, ...patch }))}
            onReset={() => setSettings(DEFAULT_SETTINGS)}
          />
        </div>
      </div>

      <div className="mt-5">
        <RunwayScene
          looks={looks}
          activeIndex={activeIndex}
          onSelect={selectModel}
          onStep={step}
          settings={settings}
          backdrop={backdrop}
          panelOpen={panelOpen}
          isDesktop={isDesktop}
          reduced={reduced}
        />

        <div
          className="transition-[padding] duration-500 ease-[cubic-bezier(0.22,0.61,0.24,1)]"
          style={{ paddingLeft: panelOpen && isDesktop ? "min(27rem, 34vw)" : 0 }}
        >
          <RunwayControls
            looks={looks}
            activeIndex={activeIndex}
            panelOpen={panelOpen}
            onStep={step}
            onSelect={goTo}
            onShop={() => (panelOpen ? closePanel() : setPanelOpen(true))}
          />
        </div>
      </div>

      <LookDetailsPanel
        look={activeLook}
        open={panelOpen}
        isDesktop={isDesktop}
        reduced={reduced}
        selections={selections}
        cartKeys={cartKeys}
        onSelectionChange={onSelectionChange}
        onAddProduct={addProduct}
        onAddLook={addLook}
        onClose={closePanel}
      />
    </section>
  );
}
