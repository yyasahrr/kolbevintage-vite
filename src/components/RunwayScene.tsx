import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/utils/cn";
import { computeLayout, transitionMeta, wrapOffset } from "@/lib/transitions";
import { RunwayModel } from "./RunwayModel";
import type { Look, SceneSettings } from "@/types";

interface Props {
  looks: Look[];
  activeIndex: number;
  onSelect: (index: number) => void;
  onStep: (dir: 1 | -1) => void;
  settings: SceneSettings;
  backdrop: { value: string; dark: boolean };
  panelOpen: boolean;
  isDesktop: boolean;
  reduced: boolean;
}

export function RunwayScene({
  looks,
  activeIndex,
  onSelect,
  onStep,
  settings,
  backdrop,
  panelOpen,
  isDesktop,
  reduced,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1024, h: 560 });
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const meta = transitionMeta(settings.mode);
  const duration = Math.max(0.12, meta.duration / settings.speed);

  const mobileSheetOpen = panelOpen && !isDesktop;
  const modelHeight = Math.max(170, Math.min(size.h * 0.74, 700));
  const floor = size.h * 0.15;

  const groupX = panelOpen && isDesktop ? Math.min(432, size.w * 0.34) / 2 + 14 : 0;
  const groupScale = mobileSheetOpen ? 0.5 : panelOpen && isDesktop ? 0.9 : 1;
  const groupY = mobileSheetOpen ? -size.h * 0.18 : 0;

  const handleSelect = useCallback(
    (i: number) => {
      if (suppressClick.current) return;
      onSelect(i);
    },
    [onSelect],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swipe.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy) * 1.2 && Date.now() - s.t < 900) {
      suppressClick.current = true;
      onStep(dx > 0 ? 1 : -1);
      window.setTimeout(() => (suppressClick.current = false), 60);
    }
  };

  useEffect(() => {
    if (!mobileSheetOpen) return;
    const el = stageRef.current;
    if (!el) return;
    const id = window.setTimeout(() => {
      const top = el.getBoundingClientRect().top + window.scrollY - 64;
      window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
    }, 90);
    return () => window.clearTimeout(id);
  }, [mobileSheetOpen, reduced]);

  return (
    <div
      ref={stageRef}
      role="group"
      aria-label="صحنهٔ رانوی — با کلیدهای جهت‌دار بین استایل‌ها حرکت کن"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          onStep(1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onStep(-1);
        }
      }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (swipe.current = null)}
      className={cn(
        "stage-3d relative isolate w-full touch-pan-y overflow-hidden rounded-[var(--radius-stage)] select-none",
        "h-[clamp(340px,50vh,440px)] sm:h-[clamp(410px,56vh,540px)] lg:h-[clamp(430px,56vh,590px)]",
      )}
      style={{ backgroundColor: backdrop.value, transition: "background-color 600ms var(--ease-runway)" }}
    >
      {/* ambient light */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: backdrop.dark
            ? "radial-gradient(90% 62% at 50% 8%, rgba(255,250,238,0.16) 0%, rgba(255,250,238,0) 62%)"
            : "radial-gradient(90% 62% at 50% 6%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 60%)",
        }}
      />

      {/* receding runway strip */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%]"
        style={{
          clipPath: "polygon(38% 0%, 62% 0%, 100% 100%, 0% 100%)",
          background: backdrop.dark
            ? "linear-gradient(to bottom, rgba(255,255,255,0.015) 0%, rgba(255,255,255,0.07) 100%)"
            : "linear-gradient(to bottom, rgba(22,19,15,0.012) 0%, rgba(22,19,15,0.062) 100%)",
          opacity: settings.mode === "queue" ? 0.35 : 1,
          transition: "opacity 500ms var(--ease-runway)",
        }}
      />

      {/* floor haze + horizon */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[30%]"
        style={{
          background: backdrop.dark
            ? "linear-gradient(to top, rgba(0,0,0,0.42), rgba(0,0,0,0))"
            : "linear-gradient(to top, rgba(22,19,15,0.07), rgba(22,19,15,0))",
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-0"
        style={{
          top: `${100 - 15 - 0.5}%`,
          height: 1,
          background: backdrop.dark
            ? "linear-gradient(to right, transparent, rgba(255,255,255,0.14) 32%, rgba(255,255,255,0.14) 68%, transparent)"
            : "linear-gradient(to right, transparent, rgba(22,19,15,0.1) 32%, rgba(22,19,15,0.1) 68%, transparent)",
        }}
      />

      {/* models */}
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={{ x: groupX, y: groupY, scale: groupScale }}
        transition={reduced ? { duration: 0.001 } : { duration: 0.6, ease: [0.22, 0.61, 0.24, 1] }}
        style={{ transformOrigin: "50% 92%" }}
      >
        {looks.map((look, i) => {
          const offset = wrapOffset(i, activeIndex, looks.length);
          const layout = computeLayout({
            mode: settings.mode,
            offset,
            count: looks.length,
            stageW: size.w,
            stageH: size.h,
            spacing: settings.spacing,
            blurEnabled: settings.blur,
            mirror: true,
          });
          return (
            <RunwayModel
              key={look.id}
              look={look}
              layout={layout}
              active={i === activeIndex}
              modelHeight={modelHeight}
              floor={floor}
              duration={duration}
              ease={meta.ease}
              shadows={settings.shadows}
              dark={backdrop.dark}
              reduced={reduced}
              priority={Math.abs(offset) <= 1}
              onSelect={() => handleSelect(i)}
            />
          );
        })}
      </motion.div>

      {/* editorial stage mark */}
      <div className="pointer-events-none absolute inset-x-4 top-3.5 flex items-center justify-between sm:inset-x-5 sm:top-4">
        <span className={cn("text-[10px] opacity-50", backdrop.dark ? "text-bone" : "text-ink")}>
          {(activeIndex + 1).toLocaleString("fa-IR", { minimumIntegerDigits: 2, useGrouping: false })}
          {" / "}
          {looks.length.toLocaleString("fa-IR", { minimumIntegerDigits: 2, useGrouping: false })}
        </span>
        <span
          className={cn(
            "latin-track font-latin text-[11px] tracking-[0.34em] opacity-55",
            backdrop.dark ? "text-bone" : "text-ink",
          )}
        >
          SHOP THE LOOK
        </span>
      </div>

      <div className="grain pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-multiply" />

      <p
        className={cn(
          "pointer-events-none absolute left-4 bottom-3 text-[10px] opacity-40",
          backdrop.dark ? "text-bone" : "text-ink",
        )}
      >
        {meta.label}
      </p>
    </div>
  );
}
