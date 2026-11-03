import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Palette, Sparkles, X } from "lucide-react";
import { useTheme } from "@/theme/ThemeProvider";
import type { ThemeDef } from "@/theme/themes";
import { useCart } from "@/state/cart";
import { cn } from "@/utils/cn";

const CATEGORIES = ["همه", "روشن", "تاریک", "تجربی"] as const;
type CategoryFilter = (typeof CATEGORIES)[number];

export function ThemeSwitcher() {
  const { theme, themes, setTheme } = useTheme();
  const { notify } = useCart();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<CategoryFilter>("همه");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Alt + T cycles through all themes from anywhere on the site.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.code !== "KeyT") return;
      e.preventDefault();
      const i = themes.findIndex((t) => t.id === theme.id);
      const next = themes[(i + 1) % themes.length];
      setTheme(next.id);
      notify(`ظاهر «${next.label}» فعال شد`, next.description);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [theme.id, themes, setTheme, notify]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    if (filter === "همه") return themes;
    return themes.filter((t) => t.category === filter);
  }, [themes, filter]);

  const choose = (next: ThemeDef) => {
    if (next.id !== theme.id) {
      setTheme(next.id);
      notify(`ظاهر «${next.label}» فعال شد`, `${next.tagline} · ${next.description}`);
    }
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`ظاهر سایت: ${theme.label}. برای تغییر سبک بصری کلیک کن (Alt+T)`}
        title="تغییر سبک و UI سایت (Alt+T)"
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-[var(--btn-radius)] border px-2.5 transition-all duration-250",
          open
            ? "border-ink bg-ink text-bone shadow-[var(--btn-shadow)]"
            : "border-black/10 bg-white/50 text-ink hover:border-ink hover:bg-ink hover:text-bone",
        )}
      >
        <Palette className="h-[15px] w-[15px]" />
        <span className="hidden text-[11px] font-medium lg:inline">{theme.label}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="انتخاب ظاهر و سبک UI سایت"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 0.61, 0.24, 1] }}
            className="fixed inset-x-3 top-[102px] z-[68] origin-top max-h-[82vh] overflow-y-auto rounded-[var(--radius-2xl)] border border-black/[0.08] bg-paper p-4 shadow-[0_28px_60px_-24px_rgba(22,19,15,0.45)] sm:absolute sm:inset-x-auto sm:top-[calc(100%+10px)] sm:left-0 sm:max-h-[85vh] sm:w-[32rem] sm:p-5"
          >
            {/* Header */}
            <div className="mb-3.5 flex items-start justify-between gap-3 border-b border-black/[0.06] pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-ink-45" />
                  <h3 className="font-display text-[16px] font-medium text-ink">سبک‌های طراحی سایت</h3>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-45">
                  ۷ سبک رابط کاربری الهام‌گرفته از ترندهای روز طراحی مد و وب؛ انتخاب ذخیره می‌شود.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <kbd className="hidden rounded-md border border-black/10 px-1.5 py-0.5 text-[9.5px] text-ink-45 sm:inline-block" dir="ltr">
                  Alt + T
                </kbd>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="بستن پنجره انتخاب تم"
                  className="rounded-full p-1 text-ink-45 hover:bg-ink/5 hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Filter categories */}
            <div className="mb-3.5 flex flex-wrap items-center gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilter(cat)}
                  aria-pressed={filter === cat}
                  className={cn(
                    "rounded-[var(--chip-radius)] border px-2.5 py-1 text-[10.5px] font-medium transition-all duration-200",
                    filter === cat
                      ? "border-ink bg-ink text-bone shadow-sm"
                      : "border-black/10 text-ink-70 hover:border-ink/40 hover:text-ink",
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Grid of themes */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {filtered.map((t) => {
                const active = t.id === theme.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => choose(t)}
                    aria-pressed={active}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-[var(--radius-xl)] border p-2.5 text-start transition-all duration-200",
                      active
                        ? "border-ink bg-ink/[0.04] ring-1 ring-ink"
                        : "border-black/[0.08] hover:border-ink/40 hover:bg-ink/[0.02]",
                    )}
                  >
                    <ThemePreview theme={t} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-medium text-ink">{t.label}</span>
                          {t.badge && (
                            <span className="rounded-full bg-ink/10 px-1.5 py-0.2 text-[8.5px] text-ink">
                              {t.badge}
                            </span>
                          )}
                        </div>
                        {active && <Check className="h-3.5 w-3.5 shrink-0 text-ink" strokeWidth={3} />}
                      </div>
                      <span className="mt-0.5 block text-[9.5px] font-medium text-ink-70" dir="ltr">
                        {t.tagline}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[10px] leading-relaxed text-ink-45">
                        {t.description}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** A faithful miniature of the theme's palette, radii, borders, and tactile cues */
function ThemePreview({ theme }: { theme: ThemeDef }) {
  const t = theme.tokens;

  if (theme.id === "neo-brutalism") {
    return (
      <span
        className="relative block h-[74px] w-[88px] shrink-0 overflow-hidden rounded-[8px] p-1.5"
        style={{
          background: "#ffef9f",
          border: "2px solid #000",
          boxShadow: "3px 3px 0 #000",
        }}
        aria-hidden
      >
        <span
          className="block h-[42px] w-full p-1"
          style={{
            background: "#fff",
            border: "1.5px solid #000",
            boxShadow: "2px 2px 0 #000",
            borderRadius: "4px",
          }}
        >
          <span className="block h-1 w-[70%] bg-black" />
          <span className="mt-1 block h-0.5 w-[45%] bg-black/60" />
          <span
            className="mt-1.5 flex h-[14px] items-center justify-center text-[7px] font-bold text-white"
            style={{ background: "#ff3838", border: "1px solid #000", borderRadius: "3px" }}
          >
            خرید
          </span>
        </span>
      </span>
    );
  }

  if (theme.id === "glassmorphism") {
    return (
      <span
        className="relative block h-[74px] w-[88px] shrink-0 overflow-hidden rounded-[18px] p-1.5"
        style={{
          background: "linear-gradient(135deg, #d8b4fe 0%, #93c5fd 50%, #fbcfe8 100%)",
          border: "1px solid rgba(255, 255, 255, 0.8)",
          boxShadow: "0 8px 20px -6px rgba(147, 51, 234, 0.3)",
        }}
        aria-hidden
      >
        <span
          className="block h-[48px] w-full p-1.5"
          style={{
            background: "rgba(255, 255, 255, 0.72)",
            backdropFilter: "blur(12px)",
            borderRadius: "12px",
            border: "1px solid rgba(255, 255, 255, 0.9)",
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
          }}
        >
          <span className="block h-1 w-[65%] rounded-full bg-[#1e1832]" />
          <span className="mt-1 block h-0.5 w-[40%] rounded-full bg-[#493f6e]" />
          <span
            className="mt-2 flex h-[13px] items-center justify-center text-[7px] text-white"
            style={{
              background: "#1e1832",
              borderRadius: "999px",
              boxShadow: "0 2px 6px rgba(30,24,50,0.3)",
            }}
          >
            خرید
          </span>
        </span>
      </span>
    );
  }

  if (theme.id === "noir") {
    return (
      <span
        className="relative block h-[74px] w-[88px] shrink-0 overflow-hidden rounded-[12px] p-1.5"
        style={{
          background: "#0d0c0a",
          border: "1px solid rgba(229, 193, 88, 0.35)",
          boxShadow: "0 6px 16px rgba(0,0,0,0.8)",
        }}
        aria-hidden
      >
        <span
          className="block h-[48px] w-full p-1.5"
          style={{
            background: "#1a1815",
            borderRadius: "8px",
            border: "1px solid rgba(229, 193, 88, 0.2)",
          }}
        >
          <span className="block h-1 w-[70%] rounded-full bg-[#f8f3ea]" />
          <span className="mt-1 block h-0.5 w-[45%] rounded-full bg-[#8e867b]" />
          <span
            className="mt-2 flex h-[13px] items-center justify-center text-[7px] font-medium text-black"
            style={{
              background: "#e5c158",
              borderRadius: "999px",
              boxShadow: "0 2px 8px rgba(229, 193, 88, 0.4)",
            }}
          >
            خرید
          </span>
        </span>
      </span>
    );
  }

  if (theme.id === "cyber") {
    return (
      <span
        className="relative block h-[74px] w-[88px] shrink-0 overflow-hidden rounded-[4px] p-1.5"
        style={{
          background: "#0a0d14",
          border: "1px solid #00f0ff",
          boxShadow: "0 0 12px rgba(0, 240, 255, 0.35)",
        }}
        aria-hidden
      >
        <span
          className="block h-[48px] w-full p-1.5"
          style={{
            background: "#131822",
            borderRadius: "3px",
            border: "1px solid rgba(0, 240, 255, 0.4)",
          }}
        >
          <span className="block h-1 w-[65%] bg-[#00f0ff]" style={{ boxShadow: "0 0 4px #00f0ff" }} />
          <span className="mt-1 block h-0.5 w-[45%] bg-[#547e88]" />
          <span
            className="mt-2 flex h-[13px] items-center justify-center text-[7px] font-bold text-black"
            style={{
              background: "#00f0ff",
              borderRadius: "2px",
              boxShadow: "0 0 8px rgba(0, 240, 255, 0.6)",
            }}
          >
            خرید
          </span>
        </span>
      </span>
    );
  }

  // Default light / minimal / soft / material
  return (
    <span
      className="relative block h-[74px] w-[88px] shrink-0 overflow-hidden rounded-lg p-1.5"
      style={{
        background: t["--color-bone"],
        border: `1px solid ${t["--line"]}`,
        fontFamily: t["--font-sans"],
        borderRadius: t["--radius-thumb"],
      }}
      aria-hidden
    >
      <span
        className="block h-[48px] w-full p-1.5"
        style={{
          background: t["--color-paper"],
          borderRadius: t["--radius-xl"],
          boxShadow: t["--card-shadow"],
        }}
      >
        <span className="block h-1 w-[70%] rounded-full" style={{ background: t["--color-ink"] }} />
        <span className="mt-1 block h-0.5 w-[50%] rounded-full" style={{ background: t["--color-ink-45"] }} />
        <span
          className="mt-2 flex h-[13px] items-center justify-center text-[7px] text-white"
          style={{
            background: t["--color-ink"],
            borderRadius: t["--btn-radius"],
            boxShadow: t["--btn-shadow"],
          }}
        >
          خرید
        </span>
      </span>
    </span>
  );
}
