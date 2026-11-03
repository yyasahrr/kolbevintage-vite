import { AnimatePresence, motion } from "motion/react";
import { Check, X } from "lucide-react";
import { useCart } from "@/state/cart";

export function Toasts({ reduced }: { reduced: boolean }) {
  const { toasts, dismissToast } = useCart();

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[70] flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-5 sm:right-5 sm:items-start"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.32, ease: [0.22, 0.61, 0.24, 1] }}
            className="pointer-events-auto flex w-full max-w-[26rem] items-start gap-3 rounded-xl border border-black/[0.08] bg-ink px-4 py-3 text-bone shadow-[0_18px_44px_-20px_rgba(22,19,15,0.7)] sm:w-auto sm:min-w-[19rem]"
          >
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bone/15">
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium">{t.title}</p>
              {t.detail && <p className="mt-0.5 text-[11.5px] text-bone/65">{t.detail}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              aria-label="بستن اعلان"
              className="-mr-1 shrink-0 rounded-full p-1 text-bone/55 transition-colors hover:text-bone"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
