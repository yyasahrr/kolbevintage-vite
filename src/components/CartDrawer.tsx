import { useEffect } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Minus, Plus, ShoppingBag, Trash2, X } from "lucide-react";
import { useLiveCatalog, sellableStock } from "@/state/live-catalog";
import { useCart } from "@/state/cart";
import { getAdmin } from "@/state/admin";
import { formatPrice } from "@/data/looks";
import { liveGetProduct } from "@/data/catalog";
import { ProductThumb } from "./ProductThumb";

export function CartDrawer({ reduced }: { reduced: boolean }) {
  const { lines, subtotal, count, cartOpen, setCartOpen, remove, setQty, clear } = useCart();
  const catalog = useLiveCatalog();
  const freeShippingLeft = Math.max(0, getAdmin().settings.freeShipping - subtotal);

  useEffect(() => {
    if (!cartOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setCartOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cartOpen, setCartOpen]);

  return (
    <AnimatePresence>
      {cartOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.38 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => setCartOpen(false)}
            className="fixed inset-0 z-[60] bg-ink"
            aria-hidden
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="سبد خرید"
            initial={reduced ? { opacity: 0 } : { x: "-100%" }}
            animate={reduced ? { opacity: 1 } : { x: 0 }}
            exit={reduced ? { opacity: 0 } : { x: "-100%" }}
            transition={{ duration: 0.42, ease: [0.22, 0.61, 0.24, 1] }}
            className="fixed inset-y-0 left-0 z-[61] flex w-full max-w-[26.5rem] flex-col bg-paper shadow-[0_0_80px_-20px_rgba(22,19,15,0.6)]"
          >
            <div className="flex items-center justify-between border-b border-black/[0.07] px-5 py-4">
              <div>
                <h2 className="font-display text-[22px] leading-none font-medium text-ink">سبد خرید</h2>
                <p className="mt-1.5 text-[10.5px] text-ink-45">
                  {count.toLocaleString("fa-IR")} قلم
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                aria-label="بستن سبد خرید"
                className="tap flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-ink-70 transition-colors hover:bg-ink hover:text-bone"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
              {lines.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink/[0.05]">
                    <ShoppingBag className="h-5 w-5 text-ink-45" />
                  </span>
                  <p className="font-display text-[20px] text-ink">سبد خرید خالی است</p>
                  <p className="max-w-[16rem] text-[12.5px] leading-relaxed text-ink-45">
                    روی رانوی قدم بزن، استایلی را باز کن و قطعه‌هایی که دوست داری اضافه کن.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  <AnimatePresence initial={false}>
                    {lines.map((line) => {
                      const product = liveGetProduct(line.productId);
                      const available = sellableStock(line.productId,line.colorId,line.sizeId);
                      return (
                        <motion.li
                          key={line.key}
                          layout
                          initial={reduced ? false : { opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 24, transition: { duration: 0.22 } }}
                          transition={{ duration: 0.3, ease: [0.22, 0.61, 0.24, 1] }}
                          className="flex gap-3 rounded-xl border border-black/[0.06] bg-white/60 p-2.5"
                        >
                          {product && <ProductThumb product={product} tint={line.colorHex} className="w-[62px]" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] text-ink-45">{line.lookName}</p>
                            <p className="truncate text-[12.5px] leading-tight font-medium text-ink">{line.name}</p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-45">
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
                                style={{ backgroundColor: line.colorHex }}
                              />
                              {line.colorName} · {line.sizeLabel}
                            </p>
                            {catalog.status !== "online" ? <p className="mt-1 text-[11px] text-ember">موجودی در دسترس نیست؛ اتصال را بررسی کنید.</p> : line.qty > available ? <p className="mt-1 text-[11px] text-ember">موجودی فعلی برای این تعداد کافی نیست.</p> : null}
                            <div className="mt-2 flex items-center justify-between">
                              <div className="flex items-center gap-1 rounded-full border border-black/10 px-1 py-0.5">
                                <button
                                  type="button"
                                  onClick={() => setQty(line.key, -1)}
                                  aria-label={`کاهش تعداد ${line.name}`}
                                  className="flex h-5 w-5 items-center justify-center rounded-full text-ink-70 hover:bg-ink/5"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <span className="w-4 text-center text-[11px] font-medium tabular-nums">
                                  {line.qty}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setQty(line.key, 1)}
                                  aria-label={`افزایش تعداد ${line.name}`}
                                  className="flex h-5 w-5 items-center justify-center rounded-full text-ink-70 hover:bg-ink/5"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[12.5px] font-medium text-ink">
                                  {formatPrice(line.price * line.qty)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => remove(line.key)}
                                  aria-label={`حذف ${line.name} از سبد`}
                                  className="rounded-full p-1 text-ink-45 transition-colors hover:text-ember"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
              )}
            </div>

            <div className="border-t border-black/[0.07] px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {lines.length > 0 && (
                <div className="mb-3">
                  <div className="h-1 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full bg-ink transition-all duration-500"
                      style={{ width: `${Math.min(100, (subtotal / Math.max(1, getAdmin().settings.freeShipping)) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[10px] text-ink-45">
                    {freeShippingLeft === 0
                      ? "ارسال این سفارش رایگان است."
                      : `${formatPrice(freeShippingLeft)} تا ارسال رایگان مانده.`}
                  </p>
                </div>
              )}
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-[10.5px] text-ink-45">جمع کل</span>
                <span className="font-display text-[26px] text-ink">{formatPrice(subtotal)}</span>
              </div>
              <Link
                to={lines.length ? "/checkout" : "/products"}
                onClick={() => setCartOpen(false)}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-ink px-5 py-3.5 text-[11.5px] font-medium text-bone transition-all hover:bg-ink/85 active:scale-[0.985]"
              >
                {lines.length ? "تسویه حساب" : "شروع خرید"}
                <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
              {lines.length > 0 && (
                <button
                  type="button"
                  onClick={clear}
                  className="mt-2 w-full text-[11px] text-ink-45 underline-offset-4 transition-colors hover:text-ink hover:underline"
                >
                  خالی کردن سبد
                </button>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
