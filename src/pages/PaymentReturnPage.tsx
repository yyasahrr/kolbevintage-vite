import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { formatPrice } from "@/data/looks";
import { buttonStyles } from "@/components/ui";

/* =====================================================================
   Where the shopper lands after a real gateway sends them back.

   The page does two things, in this order, and shows only what the server
   says afterwards:

     1. hand the gateway's query parameters to the server (which verifies them
        server-to-server — the callback body is never proof on its own);
     2. ask for the attempt's real status and render it.

   Nothing here claims success. If the provider has not confirmed yet, the page
   says «در حال تأیید» and points at the order list; it never invents a paid
   order from a redirect.
   ===================================================================== */

type AttemptView = {
  id: string;
  status: string;
  amount: number;
  provider: string;
  order: { id: string; status: string; total: number } | null;
};

const STATUS_TEXT: Record<string, string> = {
  initiated: "پرداخت آغاز شده ولی تأیید نشده است.",
  pending_verification: "درگاه هنوز پاسخ قطعی نداده؛ سفارش پرداخت‌شده ثبت نشده است.",
  settled: "پرداخت تأیید شد.",
  failed: "پرداخت انجام نشد.",
  exception: "مبلغ یا وضعیت پرداخت با سفارش نمی‌خواند؛ برای بررسی مالی جدا شده است.",
  expired: "مهلت پرداخت تمام شد.",
};

export function PaymentReturnPage() {
  const { attemptId } = useParams();
  const [view, setView] = useState<AttemptView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!attemptId) return;
    let alive = true;
    void (async () => {
      try {
        // whatever the gateway appended to the return URL goes to the server
        const params = new URLSearchParams(window.location.search);
        const payload: Record<string, string> = {};
        for (const [key, value] of params.entries()) payload[key] = value;
        if (Object.keys(payload).length) {
          await api.post(`/api/commerce/payments/${attemptId}/callback`, payload).catch(() => undefined);
        }
        const status = await api.get<AttemptView>(`/api/commerce/payments/${attemptId}`);
        if (alive) setView(status);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "وضعیت پرداخت خوانده نشد.");
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [attemptId]);

  const settled = view?.status === "settled";
  const failed = view?.status === "failed" || view?.status === "expired";
  const pending = !settled && !failed;

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-16 sm:px-6">
      <div className="border border-line/70 p-6 sm:p-8">
        {busy ? (
          <p className="text-[13px] text-ink-70">در حال خواندن وضعیت پرداخت از سرور…</p>
        ) : error ? (
          <>
            <h1 className="font-display text-[22px]">وضعیت پرداخت خوانده نشد</h1>
            <p className="mt-2 text-[12.5px] leading-[1.9] text-ink-70">{error}</p>
          </>
        ) : view ? (
          <>
            <div className="flex items-start gap-3">
              <span className={settled ? "text-[#2f6f4e]" : failed ? "text-ember" : "text-ink-45"}>
                {settled ? <CheckCircle2 className="h-6 w-6" /> : failed ? <XCircle className="h-6 w-6" /> : <Clock className="h-6 w-6" />}
              </span>
              <div>
                <h1 className="font-display text-[22px] leading-tight">
                  {settled ? "پرداخت تأیید شد" : failed ? "پرداخت انجام نشد" : "در حال تأیید پرداخت"}
                </h1>
                <p className="mt-2 text-[12.5px] leading-[1.95] text-ink-70">{STATUS_TEXT[view.status] ?? view.status}</p>
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-2">
              <div className="border border-line/60 px-3 py-2">
                <dt className="text-[10px] text-ink-45">شناسهٔ تراکنش</dt>
                <dd dir="ltr" className="mt-0.5 text-ink-70">{view.id}</dd>
              </div>
              <div className="border border-line/60 px-3 py-2">
                <dt className="text-[10px] text-ink-45">مبلغ</dt>
                <dd className="mt-0.5 text-ink-70">{formatPrice(view.amount)}</dd>
              </div>
              {view.order && (
                <>
                  <div className="border border-line/60 px-3 py-2">
                    <dt className="text-[10px] text-ink-45">شمارهٔ سفارش</dt>
                    <dd dir="ltr" className="mt-0.5 text-ink-70">{view.order.id}</dd>
                  </div>
                  <div className="border border-line/60 px-3 py-2">
                    <dt className="text-[10px] text-ink-45">جمع سفارش</dt>
                    <dd className="mt-0.5 text-ink-70">{formatPrice(view.order.total)}</dd>
                  </div>
                </>
              )}
            </dl>

            {pending && (
              <p className="mt-4 text-[11.5px] leading-[1.9] text-ink-45">
                اگر پول از حساب تو کم شده باشد، سفارش با تأیید درگاه ثبت می‌شود؛ لازم نیست دوباره پرداخت کنی. وضعیت را در
                «حساب من → سفارش‌ها» ببین.
              </p>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/account/orders" className={buttonStyles("solid", "md")}>
                سفارش‌های من
              </Link>
              {!settled && (
                <Link to="/checkout" className={buttonStyles("outline", "md")}>
                  برگشت به تسویه
                </Link>
              )}
              <Link to="/products" className={buttonStyles("light", "md")}>
                ادامهٔ خرید
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
