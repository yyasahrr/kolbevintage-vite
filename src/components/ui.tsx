import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ChevronDown, Minus, Plus, Sparkles } from "lucide-react";
import { cn } from "@/utils/cn";

/* ------------------------------------------------------------------ */
/* buttons                                                             */
/* ------------------------------------------------------------------ */

type Variant = "solid" | "outline" | "ghost" | "light";
type Size = "sm" | "md" | "lg";

export function buttonStyles(variant: Variant = "solid", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-[var(--btn-radius)] font-medium transition-all duration-250 disabled:cursor-not-allowed disabled:opacity-45",
    size === "sm" && "px-3.5 py-2 text-[11.5px]",
    size === "md" && "px-5 py-2.5 text-[12px]",
    size === "lg" && "px-6 py-3.5 text-[12.5px]",
    variant === "solid" && "bg-ink text-bone shadow-[var(--btn-shadow)] hover:bg-ink/85 active:scale-[0.985]",
    variant === "outline" && "border border-ink/25 text-ink hover:border-ink hover:bg-ink/[0.04]",
    variant === "ghost" && "text-ink hover:bg-ink/[0.06]",
    variant === "light" && "border border-bone/30 text-bone hover:bg-bone hover:text-ink",
    extra,
  );
}

export function ArrowLink({ to, children, className }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={cn(
        "group inline-flex items-center gap-2 text-[12px] font-medium text-ink transition-colors hover:text-ink-70",
        className,
      )}
    >
      <span className="border-b border-ink/25 pb-0.5 transition-colors group-hover:border-ink">{children}</span>
      <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-x-1" />
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* section chrome                                                      */
/* ------------------------------------------------------------------ */

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  className,
  border = true,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: { to: string; label: string };
  className?: string;
  border?: boolean;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-x-8 gap-y-4", className)}>
      <div>
        {eyebrow && (
          <div className="mb-2.5 flex items-center gap-2.5">
            <span className="h-px w-7 bg-ink/30" />
            <p className="text-[10.5px] text-ink-45">{eyebrow}</p>
          </div>
        )}
        <h2
          className={cn(
            "font-display text-[clamp(1.5rem,3vw,2.15rem)] leading-[1.35] font-medium text-ink",
            border && "pb-0.5",
          )}
        >
          {title}
        </h2>
        {description && <p className="mt-2 max-w-[38rem] text-[12.5px] leading-[1.9] text-ink-70">{description}</p>}
      </div>
      {action && <ArrowLink to={action.to}>{action.label}</ArrowLink>}
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav aria-label="مسیر صفحه" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10.5px] text-ink-45">
      <Link to="/" className="transition-colors hover:text-ink">
        خانه
      </Link>
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5">
          <span className="opacity-40">/</span>
          {item.to ? (
            <Link to={item.to} className="transition-colors hover:text-ink">
              {item.label}
            </Link>
          ) : (
            <span className="text-ink/75">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageIntro({
  crumbs,
  eyebrow,
  title,
  description,
  children,
}: {
  crumbs: { label: string; to?: string }[];
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="mx-auto w-full max-w-[1500px] px-4 pt-6 pb-7 sm:px-6 lg:px-10">
      <Breadcrumbs items={crumbs} />
      <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
        <div className="max-w-[46rem]">
          {eyebrow && (
            <p className="mb-2 flex items-center gap-2 text-[10px] text-ink-45">
              <Sparkles className="h-3 w-3" /> {eyebrow}
            </p>
          )}
          <h1 className="font-display text-[clamp(1.85rem,4.4vw,3rem)] leading-[1.25] font-medium text-ink">{title}</h1>
          {description && <p className="mt-3 max-w-[38rem] text-[12.5px] leading-[1.95] text-ink-70">{description}</p>}
        </div>
        {children}
      </div>
    </header>
  );
}

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 0.61, 0.24, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* accordion                                                           */
/* ------------------------------------------------------------------ */

export function Accordion({ items }: { items: { title: string; body: ReactNode }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const base = useId();
  return (
    <div className="divide-y divide-black/[0.08] border-y border-black/[0.08]">
      {items.map((item, i) => {
        const expanded = open === i;
        return (
          <div key={item.title}>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={`${base}-${i}`}
              onClick={() => setOpen(expanded ? null : i)}
              className="flex w-full items-center justify-between gap-4 py-3.5 text-start text-[12.5px] font-medium text-ink transition-colors hover:text-ink-70"
            >
              {item.title}
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-black/10">
                {expanded ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              </span>
            </button>
            <div
              id={`${base}-${i}`}
              hidden={!expanded}
              className="pb-4 text-[12px] leading-[1.95] text-ink-70"
            >
              {item.body}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* misc                                                               */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-black/12 bg-white/40 px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink/[0.05] text-ink-45">{icon}</span>
      <h3 className="mt-4 font-display text-[20px] font-medium text-ink">{title}</h3>
      <p className="mt-2 max-w-[24rem] text-[12.5px] leading-relaxed text-ink-45">{body}</p>
      {action && (
        <Link to={action.to} className={buttonStyles("solid", "md", "mt-5")}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function Marquee({ items }: { items: string[] }) {
  const loop = [...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-black/[0.07] bg-[#efe8dd] py-2.5" dir="ltr">
      <div className="flex w-max animate-[marquee_46s_linear_infinite] gap-10 whitespace-nowrap will-change-transform">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex shrink-0 items-center gap-10" aria-hidden={copy === 1}>
            {loop.map((item, i) => (
              <span key={`${item}-${i}`} className="flex items-center gap-10 text-[10.5px] tracking-normal text-ink-70" dir="rtl">
                {item}
                <span className="h-1 w-1 rounded-full bg-clay" />
              </span>
            ))}
          </div>
        ))}
      </div>
      <style>{`@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      @media (prefers-reduced-motion: reduce) { .animate-\\[marquee_46s_linear_infinite\\] { animation: none; } }`}</style>
    </div>
  );
}

export function Chip({
  active,
  children,
  onClick,
  className,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--chip-radius)] border px-3.5 py-1.5 text-[11.5px] transition-all duration-200",
        active
          ? "border-ink bg-ink text-bone"
          : "border-black/12 bg-white/50 text-ink-70 hover:border-ink/40 hover:text-ink",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-[11.5px] text-ink-45">
      <span>{label}</span>
      <span className="relative inline-flex items-center">
        <select
          aria-label={label || "مرتب‌سازی"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="appearance-none rounded-[var(--chip-radius)] border border-black/12 bg-white/60 py-1.5 pr-3 pl-8 text-[11.5px] text-ink transition-colors hover:border-ink/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-ink-45" />
      </span>
    </label>
  );
}
