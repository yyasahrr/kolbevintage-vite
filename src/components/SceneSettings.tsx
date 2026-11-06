import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { SlidersHorizontal, RotateCcw, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { BACKDROPS } from "@/data/looks";
import type { SceneSettings as Settings } from "@/types";

export const DEFAULT_SETTINGS: Settings = {
  mode: "ring",
  speed: 1,
  blur: true,
  shadows: true,
  spacing: 1,
  backdrop: "bone",
};

interface Props {
  open: boolean;
  settings: Settings;
  onToggle: () => void;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
  reduced: boolean;
}

export function SceneSettingsPopover({ open, settings, onToggle, onChange, onReset, reduced }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) onToggle();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onToggle();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onToggle]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label="تنظیمات صحنه"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[10px] font-medium tracking-[0.16em] uppercase transition-all duration-250",
          open ? "border-ink bg-ink text-bone" : "border-black/12 bg-white/55 text-ink-70 hover:border-ink/45",
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">صحنه</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.22, 0.61, 0.24, 1] }}
            role="dialog"
            aria-label="تنظیمات صحنه"
            className={cn(
              "z-50 origin-top-right rounded-2xl border border-black/[0.08] bg-paper/96 p-4 shadow-[0_24px_60px_-26px_rgba(22,19,15,0.5)] backdrop-blur-xl",
              "fixed inset-x-3 bottom-3 max-h-[78vh] overflow-y-auto",
              "sm:absolute sm:inset-x-auto sm:top-[calc(100%+10px)] sm:left-0 sm:bottom-auto sm:max-h-none sm:w-[21.5rem] sm:overflow-visible",
            )}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-[16px] font-medium text-ink">تنظیمات صحنه</h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onReset}
                  aria-label="بازنشانی تنظیمات صحنه"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-ink-45 transition-colors hover:bg-ink/5 hover:text-ink"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onToggle}
                  aria-label="بستن تنظیمات صحنه"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-ink-45 transition-colors hover:bg-ink/5 hover:text-ink sm:hidden"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <Field label={`سرعت انیمیشن · ${settings.speed.toFixed(2)}×`}>
              <Slider
                min={0.4}
                max={2}
                step={0.05}
                value={settings.speed}
                onChange={(speed) => onChange({ speed })}
                aria-label="سرعت انیمیشن"
              />
            </Field>

            <Field label={`فاصلهٔ مدل‌ها · ${settings.spacing.toFixed(2)}×`}>
              <Slider
                min={0.6}
                max={1.45}
                step={0.05}
                value={settings.spacing}
                onChange={(spacing) => onChange({ spacing })}
                aria-label="فاصلهٔ مدل‌ها"
              />
            </Field>

            <Field label="رنگ پس‌زمینه">
              <div className="flex flex-wrap gap-1.5">
                {BACKDROPS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => onChange({ backdrop: b.id })}
                    aria-label={`پس‌زمینهٔ ${b.name}`}
                    aria-pressed={settings.backdrop === b.id}
                    title={b.name}
                    className={cn(
                      "h-7 w-7 rounded-full ring-1 ring-black/10 ring-offset-2 ring-offset-paper transition-all duration-200",
                      settings.backdrop === b.id ? "ring-[1.5px] ring-ink" : "hover:scale-110",
                    )}
                    style={{ backgroundColor: b.value }}
                  />
                ))}
              </div>
            </Field>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Toggle
                label="محوشدگی عمق"
                checked={settings.blur}
                onChange={(blur) => onChange({ blur })}
              />
              <Toggle
                label="سایه‌ها"
                checked={settings.shadows}
                onChange={(shadows) => onChange({ shadows })}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5">
      <p className="mb-1.5 text-[10px] text-ink-45">{label}</p>
      {children}
    </div>
  );
}

function Slider({
  min,
  max,
  step,
  value,
  onChange,
  ...rest
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  "aria-label": string;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-1 w-full cursor-pointer appearance-none rounded-full bg-ink/15 accent-ink outline-offset-4"
      {...rest}
    />
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[11px] font-medium transition-all duration-200",
        checked ? "border-ink/70 bg-ink/[0.04] text-ink" : "border-black/[0.08] text-ink-45 hover:border-ink/25",
      )}
    >
      {label}
      <span
        className={cn(
          "flex h-4 w-7 items-center rounded-full px-0.5 transition-colors",
          checked ? "justify-start bg-ink" : "justify-end bg-ink/20",
        )}
      >
        <span className="h-3 w-3 rounded-full bg-paper transition-colors duration-200" />
      </span>
    </button>
  );
}
