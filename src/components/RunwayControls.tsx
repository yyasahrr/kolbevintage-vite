import { ArrowLeft, ArrowRight, ShoppingBag } from "lucide-react";
import { cn } from "@/utils/cn";
import type { Look } from "@/types";

interface Props {
  looks: Look[];
  activeIndex: number;
  panelOpen: boolean;
  onStep: (dir: 1 | -1) => void;
  onSelect: (index: number) => void;
  onShop: () => void;
}

export function RunwayControls({ looks, activeIndex, panelOpen, onStep, onSelect, onShop }: Props) {
  const active = looks[activeIndex];

  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <RoundButton label="استایل قبلی" onClick={() => onStep(-1)}>
            <ArrowRight className="h-4 w-4" />
          </RoundButton>
          <RoundButton label="استایل بعدی" onClick={() => onStep(1)}>
            <ArrowLeft className="h-4 w-4" />
          </RoundButton>
          <span className="ml-1 font-display text-[15px] text-ink-70 tabular-nums">
            {(activeIndex + 1).toLocaleString("fa-IR", { minimumIntegerDigits: 2, useGrouping: false })}
            <span className="mx-1 text-ink-45">/</span>
            <span className="text-ink-45">{looks.length.toLocaleString("fa-IR", { minimumIntegerDigits: 2, useGrouping: false })}</span>
          </span>
        </div>

        <button
          type="button"
          onClick={onShop}
          aria-expanded={panelOpen}
          className={cn(
            "group inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-[11px] font-medium tracking-[0.16em] uppercase transition-all duration-250 sm:px-5",
            panelOpen
              ? "border border-ink/15 bg-transparent text-ink-70 hover:border-ink/40"
              : "bg-ink text-bone hover:bg-ink/85 active:scale-[0.98]",
          )}
        >
          <ShoppingBag className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{panelOpen ? "بستن استایل" : "خرید این استایل"}</span>
          <span className="sm:hidden">{panelOpen ? "بستن" : "خرید"}</span>
        </button>
      </div>

      {/* exit rail */}
      <div className="no-scrollbar -mx-1 flex snap-x snap-mandatory gap-1 overflow-x-auto px-1 pb-1">
        {looks.map((look, i) => {
          const isActive = i === activeIndex;
          return (
            <button
              key={look.id}
              type="button"
              onClick={() => onSelect(i)}
              aria-current={isActive}
              className={cn(
                "group relative shrink-0 snap-start rounded-lg px-3 py-2 text-start transition-colors duration-300",
                isActive ? "bg-ink/[0.055]" : "hover:bg-ink/[0.03]",
              )}
            >
              <span
                className={cn(
                  "block text-[10px] uppercase transition-colors",
                  isActive ? "text-ink" : "text-ink-45",
                )}
              >
                {String(look.order.toLocaleString("fa-IR", { minimumIntegerDigits: 2, useGrouping: false }))}
              </span>
              <span
                className={cn(
                  "mt-0.5 block font-display text-[14px] leading-none whitespace-nowrap transition-colors",
                  isActive ? "text-ink" : "text-ink-45 group-hover:text-ink-70",
                )}
              >
                {look.name}
              </span>
              <span
                className={cn(
                  "mt-1.5 block h-px origin-right transition-all duration-500",
                  isActive ? "scale-x-100 bg-ink" : "scale-x-0 bg-ink/40",
                )}
              />
            </button>
          );
        })}
      </div>

      {active?.tagline && (
        <p className="text-[11px] text-ink-45">{active.tagline}</p>
      )}
    </div>
  );
}

function RoundButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-black/12 bg-white/55 text-ink transition-all duration-250 hover:border-ink hover:bg-ink hover:text-bone active:scale-95"
    >
      {children}
    </button>
  );
}
