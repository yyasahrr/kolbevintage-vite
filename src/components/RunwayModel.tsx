import { memo } from "react";
import { motion } from "motion/react";
import { cn } from "@/utils/cn";
import type { ModelLayout } from "@/lib/transitions";
import type { Look } from "@/types";

interface Props {
  look: Look;
  layout: ModelLayout;
  active: boolean;
  modelHeight: number;
  floor: number;
  duration: number;
  ease: [number, number, number, number];
  shadows: boolean;
  dark: boolean;
  reduced: boolean;
  priority: boolean;
  onSelect: () => void;
}

function RunwayModelBase({
  look,
  layout,
  active,
  modelHeight,
  floor,
  duration,
  ease,
  shadows,
  dark,
  reduced,
  priority,
  onSelect,
}: Props) {
  const delay = reduced ? 0 : Math.min(0.09, Math.abs(layout.zIndex - 1000) * 0.00004);
  const t = reduced ? { duration: 0.001 } : { duration, ease, delay };
  const width = Math.round(modelHeight * look.aspect);

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-end justify-center"
      style={{ zIndex: layout.zIndex, paddingBottom: floor }}
      aria-hidden={!layout.visible}
    >
      <motion.button
        type="button"
        onClick={onSelect}
        tabIndex={layout.visible ? 0 : -1}
        aria-label={`اگزیت ${look.order.toLocaleString("fa-IR")}، ${look.name}. ${active ? "نمایش جزئیات استایل" : "انتخاب این مدل و نمایش استایل"}`}
        aria-pressed={active}
        initial={false}
        animate={{
          x: layout.x,
          y: layout.y,
          opacity: layout.visible ? layout.opacity : 0,
          rotateY: layout.rotateY,
          filter: `blur(${layout.blur.toFixed(2)}px)`,
        }}
        transition={t}
        className={cn(
          "group relative block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-8",
          layout.visible ? "pointer-events-auto" : "pointer-events-none",
          dark ? "focus-visible:outline-bone" : "focus-visible:outline-ink",
        )}
        style={{ transformStyle: "preserve-3d", willChange: "transform, opacity, filter" }}
      >
        <motion.div
          initial={false}
          animate={{ scale: layout.scale }}
          whileHover={reduced || active ? undefined : { scale: layout.scale * 1.035 }}
          whileTap={{ scale: layout.scale * 0.985 }}
          transition={t}
          style={{ transformOrigin: "center bottom" }}
          className="relative"
        >
          {shadows && (
            <div
              className="pointer-events-none absolute left-1/2 -z-10 -translate-x-1/2 rounded-[50%]"
              style={{
                bottom: -modelHeight * 0.012,
                width: width * 0.78,
                height: Math.max(10, modelHeight * 0.035),
                background: dark
                  ? "radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 72%)"
                  : "radial-gradient(50% 50% at 50% 50%, rgba(22,19,15,0.42) 0%, rgba(22,19,15,0) 72%)",
                opacity: 0.35 + layout.depth * 0.65,
                filter: "blur(3px)",
              }}
            />
          )}

          <img
            src={look.image}
            alt={`استایل کامل ${look.name} روی رانوی`}
            width={width}
            height={modelHeight}
            draggable={false}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            fetchPriority={priority ? "high" : "low"}
            className="model-img block h-auto w-auto"
            style={{ height: modelHeight, width }}
          />

          <span
            className={cn(
              "pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300",
              !active && "group-hover:opacity-100",
            )}
            style={{
              background: dark
                ? "radial-gradient(60% 40% at 50% 85%, rgba(255,255,255,0.1), transparent 70%)"
                : "radial-gradient(60% 40% at 50% 85%, rgba(255,255,255,0.45), transparent 70%)",
            }}
          />
        </motion.div>

        {/* caption rides with the active model */}
        <motion.span
          initial={false}
          animate={{ opacity: active ? 1 : 0, y: active ? 0 : 6 }}
          transition={{ duration: reduced ? 0.001 : 0.4, ease }}
          className={cn(
            "pointer-events-none absolute left-1/2 flex -translate-x-1/2 flex-col items-center gap-1 text-center whitespace-nowrap",
            dark ? "text-bone" : "text-ink",
          )}
          style={{ top: "100%", marginTop: Math.max(10, modelHeight * 0.03) }}
        >
          <span className="text-[9px] tracking-[0.3em] opacity-55 uppercase">
            اگزیت {String(look.order.toLocaleString("fa-IR", { minimumIntegerDigits: 2, useGrouping: false }))}
          </span>
          <span className="font-display text-[clamp(0.95rem,2.2vw,1.3rem)] leading-none font-medium">{look.name}</span>
        </motion.span>
      </motion.button>
    </div>
  );
}

export const RunwayModel = memo(RunwayModelBase);
