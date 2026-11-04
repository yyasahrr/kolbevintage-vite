import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, Loader2, Lock, PackageCheck, ShieldCheck, ShoppingBag, Truck, Wallet, Zap } from "lucide-react";
import { useCart } from "@/state/cart";
import { useAuth } from "@/state/auth";
import { formField } from "@/state/ops";
import { getAdmin } from "@/state/admin";
import { computeDiscounts } from "@/state/discounts";
import { ApiError } from "@/lib/api";
import {
  commerce,
  type CashbackWallet,
  type CommerceConfig,
  type CommerceItem,
  type ServerQuote,
  type Shortage,
} from "@/lib/commerce";
import { formatPrice } from "@/data/looks";

import { PageIntro, buttonStyles } from "@/components/ui";
import { cn } from "@/utils/cn";

const GATEWAY_LABEL: Record<string, string> = {
  zarinpal: "زرین‌پال",
  sadad: "سداد",
  stripe: "Stripe",
  none: "بدون درگاه (نمایشی)",
};

export function CheckoutPage() {
  const { lines, clear, notify } = useCart();
  const admin = getAdmin();
  const auth = useAuth();
  const showField = (k: string) => formField(k)?.visible !== false;
  const requiredField = (k: string) => formField(k)?.required === true;
  const settings = admin.settings;
  const [shipping, setShipping] = useState<"standard" | "express">("standard");
  const [code, setCode] = useState("");
  const [appliedCode, setAppliedCode] = useState("");
  const [codeMsg, setCodeMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [order, setOrder] = useState<{
    id: string;
    total: number;
    items: number;
    discounts: { id: string; name: string; amount: number; note?: string }[];
    status?: string;
    note?: string;
    cashback?: { amount: number; percent: number } | null;
  } | null>(null);
  const [serverQuote, setServerQuote] = useState<ServerQuote | null>(null);
  const [cfg, setCfg] = useState<CommerceConfig | null>(null);
  const [method, setMethod] = useState<"online" | "bnpl4">("online");
  const [wallet, setWallet] = useState<CashbackWallet | null>(null);
  const [useWallet, setUseWallet] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const attemptKey = useRef(`co-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const linesLite = useMemo(
    () => lines.map((l) => ({ productId: l.productId, name: l.name, price: l.price, qty: l.qty })),
    [lines],
  );

  const items = useMemo<CommerceItem[]>(
    () => lines.map((l) => ({ productId: l.productId, colorId: l.colorId, sizeId: l.sizeId, quantity: l.qty })),
    [lines],
  );
  const itemsKey = items.map((i) => `${i.productId}:${i.colorId}:${i.sizeId}:${i.quantity}`).join("|");

  const discount = useMemo(() => computeDiscounts(linesLite, appliedCode || undefined), [linesLite, appliedCode]);
  const finalShipping = lines.length === 0 ? 0 : shipping === "express" ? (discount.freeship ? 0 : settings.expressCost) : discount.freeship ? 0 : 12;
  const total = Math.max(0, discount.afterDiscount + finalShipping);

  // authoritative totals come from the server quote; the local engine is only
  // a placeholder until the quote arrives (or when the API is offline)
  const viewSubtotal = serverQuote?.subtotal ?? discount.subtotal;
  const viewDiscounts: { id: string; name: string; amount: number }[] = serverQuote
    ? serverQuote.discounts.map((d) => ({ id: d.id, name: d.name, amount: d.amount }))
    : discount.applied;
  const viewShipping = serverQuote ? serverQuote.shippingTotal : finalShipping;
  const viewTotal = serverQuote ? serverQuote.grandTotal : total;
  const bnplPlan = serverQuote?.installments.find((i) => i.method === "bnpl4");

  /* ---------- wallet (cashback) payment ----------
     Only money already released by the server policy is offered here, and the
     cap is a share of the goods value. The server re-checks both at pay time. */
  const walletAvailable = wallet?.available ?? 0;
  const walletCapPercent = cfg?.cashback.redeem.maxPercent ?? 0;
  const goodsAfterDiscount = serverQuote
    ? Math.max(0, serverQuote.subtotal - serverQuote.discountTotal)
    : discount.afterDiscount;
  const walletCap = Math.max(0, (goodsAfterDiscount * walletCapPercent) / 100);
  const walletApplied = useWallet ? Math.min(walletAvailable, walletCap, viewTotal) : 0;
  const payableNow = Math.max(0, viewTotal - walletApplied);

  useEffect(() => {
    commerce.config().then(setCfg).catch(() => undefined);
  }, []);

  // the wallet belongs to the signed-in account; guests simply have none
  useEffect(() => {
    if (!auth.account?.email) {
      setWallet(null);
      return;
    }
    commerce
      .cashback()
      .then(setWallet)
      .catch(() => setWallet(null));
  }, [auth.account?.email]);

  useEffect(() => {
    if (!items.length) {
      setServerQuote(null);
      return;
    }
    let alive = true;
    commerce
      .quote(items, { couponCode: appliedCode || undefined, shippingMethod: shipping })
      .then((q) => {
        if (alive) setServerQuote(q);
      })
      .catch(() => {
        if (alive) setServerQuote(null);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, appliedCode, shipping]);

  const applyCode = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setAppliedCode("");
      setCodeMsg(null);
      return;
    }
    try {
      const q = await commerce.quote(items, { couponCode: trimmed, shippingMethod: shipping });
      setServerQuote(q);
      setAppliedCode(q.couponCode ?? trimmed.toUpperCase());
      setCodeMsg({ ok: true, message: "کد تخفیف روی سرور اعمال شد." });
    } catch (err) {
      setAppliedCode("");
      setCodeMsg({ ok: false, message: err instanceof Error ? err.message : "کد تخفیف اعمال نشد." });
    }
  };

  /**
   * Checkout against the commerce core:
   * quote → reserve stock → payment attempt → server-side verify → order.
   * The amount charged is the server's, never the number rendered here.
   */
  const placeOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!lines.length || placing) return;
    const form = new FormData(e.currentTarget);
    const address = {
      receiver: `${form.get("given") ?? ""} ${form.get("family") ?? ""}`.trim(),
      phone: String(form.get("tel") ?? ""),
      province: String(form.get("province") ?? ""),
      city: String(form.get("city") ?? ""),
      street: String(form.get("street") ?? ""),
      postal: String(form.get("postal") ?? ""),
      note: String(form.get("note") ?? ""),
    };

    setPlacing(true);
    setCheckoutError(null);
    setShortages([]);
    try {
      const created = await commerce.checkout({
        items,
        address,
        shippingMethod: shipping,
        couponCode: appliedCode || undefined,
        idempotencyKey: attemptKey.current,
      });
      setServerQuote(created.checkout.quote);

      const pay = await commerce.pay(created.checkout.id, method, `pay-${attemptKey.current}`, {
        useCashback: useWallet && walletApplied > 0,
      });
      if (pay.payment?.redirectUrl) {
        window.location.href = pay.payment.redirectUrl;
        return;
      }
      if (!pay.payment?.mock) {
        setCheckoutError("درگاه پاسخ قابل تأیید نداد؛ سفارش ثبت نشد.");
        return;
      }

      // the demo gateway is verified server-side, exactly like a real callback
      const settled = await commerce.simulate(pay.attempt.id, "success");
      if (settled.status === "settled" && settled.orderId) {
        const paid = Number(settled.total ?? created.checkout.quote.grandTotal);
        setOrder({
          id: settled.orderId,
          cashback: settled.cashback ? { amount: settled.cashback.amount, percent: settled.cashback.percent } : null,
          total: paid,
          items: lines.reduce((n, l) => n + l.qty, 0),
          discounts: viewDiscounts,
          status: settled.orderStatus,
          note:
            settled.orderStatus === "exception"
              ? "پرداخت ثبت شد اما موجودی رزروشده آزاد شده بود؛ سفارش برای بررسی مالی به حالت استثنا رفت."
              : undefined,
        });
        clear();
        notify("پرداخت تأیید شد", `سفارش ${settled.orderId} ثبت شد و موجودی از انبار کسر شد.`);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setCheckoutError(settled.message ?? "پرداخت تأیید نشد؛ دوباره تلاش کن.");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "insufficient_stock") {
          const details = err.details as { shortages?: Shortage[] } | undefined;
          setShortages(details?.shortages ?? []);
        }
        if (err.code === "quote_stale") {
          const details = err.details as { quote?: ServerQuote } | undefined;
          if (details?.quote) setServerQuote(details.quote);
        }
        setCheckoutError(err.message);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      // fail closed: an order that the server never created must not be shown
      // as placed, and stock/coupon/cashback must never be invented in the browser
      setCheckoutError(
        "ارتباط با سرور برقرار نشد؛ سفارش ثبت نشد. اتصال را بررسی کن و دوباره تلاش کن. هیچ مبلغی کسر نشده است.",
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setPlacing(false);
    }
  };

  /* ---------- success ---------- */
  if (order) {
    return (
      <div className="pb-16">
        <PageIntro
        crumbs={[{ label: "تسویه حساب" }]}
        title="سفارش شما ثبت شد"
        description="مبلغ نهایی و موجودی را سرور تأیید کرده است. پرداخت درگاه شبیه‌سازی‌شده اما با همان قرارداد verify و idempotency واقعی ثبت می‌شود."
      />
        <div className="mx-auto max-w-[520px] px-4">
          <div className="rounded-2xl border border-black/[0.08] bg-paper p-6 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ink text-bone">
              <PackageCheck width={26} height={26} />
            </span>
            <h2 className="mt-4 font-display text-[24px] font-medium text-ink">ممنون که با ولور همراه شدی.</h2>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-[12px]">
              <div className="rounded-xl bg-[#f4efe7] p-3">
                <dt className="text-ink-45">شمارهٔ سفارش</dt>
                <dd className="mt-1 font-semibold text-ink" dir="ltr">{order.id}</dd>
              </div>
              <div className="rounded-xl bg-[#f4efe7] p-3">
                <dt className="text-ink-45">اقلام</dt>
                <dd className="mt-1 font-semibold text-ink">{order.items.toLocaleString("fa-IR")}</dd>
              </div>
              <div className="rounded-xl bg-[#f4efe7] p-3">
                <dt className="text-ink-45">مبلغ</dt>
                <dd className="mt-1 font-semibold text-ink">{formatPrice(order.total)}</dd>
              </div>
            </dl>
            {order.cashback && order.cashback.amount > 0 && (
              <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-[11.5px] text-emerald-800">
                {formatPrice(order.cashback.amount)} کش‌بک ({order.cashback.percent.toLocaleString("fa-IR")}٪) به کیف پول حساب تو اضافه شد.
              </p>
            )}
            {order.note && (
              <p className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-900">
                {order.note}
              </p>
            )}
            {order.status === "exception" && (
              <p className="mt-2 text-[11px] text-ember" dir="ltr">status: exception</p>
            )}
            {order.discounts.length > 0 && (
              <ul className="mt-3 space-y-1 text-[11.5px] text-ink-70">
                {order.discounts.map((d) => (
                  <li key={d.id} className="flex justify-between">
                    <span>{d.name}</span>
                    <span>{d.amount > 0 ? `− ${formatPrice(d.amount)}` : d.note}</span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link to="/products" className={buttonStyles("solid", "md")}>ادامهٔ خرید</Link>
              <Link to="/style" className={buttonStyles("outline", "md")}>رانوی</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- empty ---------- */
  if (!lines.length) {
    return (
      <div className="pb-16">
        <PageIntro crumbs={[{ label: "تسویه حساب" }]} title="تسویه حساب" />
        <div className="mx-auto max-w-[520px] px-4">
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-black/15 bg-white/40 px-6 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink/[0.05]">
              <ShoppingBag className="h-5 w-5 text-ink-45" />
            </span>
            <h2 className="mt-4 font-display text-[22px] font-medium text-ink">سبد خریدت خالی است</h2>
            <p className="mt-2 max-w-[18rem] text-[12.5px] leading-relaxed text-ink-45">
              برای رسیدن به این مرحله، چند قطعه از فروشگاه یا استایل بیلدر به سبد اضافه کن.
            </p>
            <Link to="/products" className={buttonStyles("solid", "md", "mt-5")}>شروع خرید</Link>
          </div>
        </div>
      </div>
    );
  }

  /* ---------- form ---------- */
  const gateway = GATEWAY_LABEL[admin.integrations.payment.gateway];
  return (
    <div className="pb-16">
      <PageIntro
        crumbs={[{ label: "تسویه حساب" }]}
        title="تسویه حساب"
        description="اطلاعات ارسال را کامل کن. تخفیف‌های فعال فروشگاه به‌صورت خودکار روی سبد اعمال می‌شوند."
      />

      {(checkoutError || shortages.length > 0) && (
        <div className="mx-auto mb-4 w-full max-w-[1200px] px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-ember/30 bg-ember/[0.06] p-4">
            {checkoutError && <p className="text-[12.5px] font-medium text-ember">{checkoutError}</p>}
            {shortages.length > 0 && (
              <ul className="mt-2 list-inside list-disc space-y-1 text-[11.5px] text-ink-70">
                {shortages.map((item) => (
                  <li key={item.variantId}>
                    یکی از اقلام سبد — درخواستی {item.requested.toLocaleString("fa-IR")} عدد،
                    موجود {item.available.toLocaleString("fa-IR")} عدد
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-ink-45">
              تعداد را در سبد اصلاح کن یا محصول دیگری انتخاب کن؛ سبد خریدت حفظ می‌شود.
            </p>
          </div>
        </div>
      )}

      <form onSubmit={placeOrder} className="mx-auto grid w-full max-w-[1200px] gap-6 px-4 sm:px-6 lg:grid-cols-[1.35fr_0.75fr] lg:items-start lg:px-8">
        <div className="space-y-4">
          <section className="rounded-2xl border border-black/[0.07] bg-paper p-5">
            <h3 className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-ink">
              <UserCircleIcon /> اطلاعات مشتری
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {showField("given") && <Field label={requiredField("given") ? "نام" : "نام (اختیاری)"} name="given" required={requiredField("given")} autoComplete="given-name" defaultValue={auth.account?.name.split(" ")[0] ?? ""} />}
              {showField("family") && <Field label={requiredField("family") ? "نام خانوادگی" : "نام خانوادگی (اختیاری)"} name="family" required={requiredField("family")} autoComplete="family-name" />}
              {showField("email") && <Field label={requiredField("email") ? "ایمیل" : "ایمیل (اختیاری)"} name="email" type="email" required={requiredField("email")} autoComplete="email" className="sm:col-span-2" dir="ltr" defaultValue={auth.account?.email ?? ""} />}
              {showField("tel") && <Field label={requiredField("tel") ? "شمارهٔ تماس" : "شمارهٔ تماس (اختیاری)"} name="tel" type="tel" required={requiredField("tel")} autoComplete="tel" dir="ltr" defaultValue={auth.account?.phone ?? ""} />}
            </div>
          </section>

          {(showField("street") || showField("city") || showField("postal") || showField("note")) && (
            <section className="rounded-2xl border border-black/[0.07] bg-paper p-5">
              <h3 className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-ink">
                <Truck size={15} /> نشانی ارسال
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {showField("street") && <Field label={requiredField("street") ? "نشانی" : "نشانی (اختیاری)"} name="street" required={requiredField("street")} autoComplete="street-address" className="sm:col-span-2" defaultValue={auth.account?.addresses.find((a) => a.default)?.street ?? ""} />}
                {showField("city") && <Field label={requiredField("city") ? "شهر" : "شهر (اختیاری)"} name="city" required={requiredField("city")} autoComplete="address-level2" defaultValue={auth.account?.addresses.find((a) => a.default)?.city ?? ""} />}
                {showField("postal") && <Field label={requiredField("postal") ? "کد پستی" : "کد پستی (اختیاری)"} name="postal" required={requiredField("postal")} dir="ltr" defaultValue={auth.account?.addresses.find((a) => a.default)?.postal ?? ""} />}
                {showField("note") && <Field label="توضیح برای پیک (اختیاری)" name="note" placeholder={formField("note")?.placeholder ?? ""} className="sm:col-span-2" />}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-black/[0.07] bg-paper p-5">
            <h3 className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-ink">
              <Truck size={15} /> روش ارسال
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              <ShipOption
                active={shipping === "standard"}
                title="ارسال استاندارد"
                note={discount.freeship ? "رایگان (تخفیف فعال)" : settings.freeShipping ? `رایگان بالای ${settings.freeShipping.toLocaleString("fa-IR")} تومان` : "۱۲ تومان"}
                onClick={() => setShipping("standard")}
              />
              <ShipOption
                active={shipping === "express"}
                title="ارسال سریع (۲۴ ساعته)"
                note={discount.freeship ? "رایگان (تخفیف فعال)" : `${settings.expressCost.toLocaleString("fa-IR")} تومان`}
                onClick={() => setShipping("express")}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-black/[0.07] bg-paper p-5">
            <h3 className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-ink">
              <Wallet size={15} /> پرداخت
            </h3>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => setMethod("online")}
                aria-pressed={method === "online"}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-4 text-start transition-colors",
                  method === "online" ? "border-ink bg-ink/[0.04]" : "border-black/10 hover:border-ink/35",
                )}
              >
                <CreditCard className="mt-0.5 h-5 w-5 text-ink-70" />
                <span className="flex-1">
                  <span className="block text-[12.5px] font-medium text-ink">پرداخت آنلاین — {gateway}</span>
                  <span className="mt-0.5 block text-[11px] text-ink-45">
                    {admin.integrations.payment.enabled
                      ? `حالت ${admin.integrations.payment.mode === "test" ? "تست" : "حقیقی"}.`
                      : "درگاه شبیه‌سازی‌شده؛ تأیید نهایی سمت سرور انجام می‌شود."}
                  </span>
                </span>
                <ShieldCheck className="h-4 w-4 text-ink-45" />
              </button>

              {cfg?.bnpl4.enabled && (
                <button
                  type="button"
                  onClick={() => setMethod("bnpl4")}
                  aria-pressed={method === "bnpl4"}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-start transition-colors",
                    method === "bnpl4" ? "border-ink bg-ink/[0.04]" : "border-black/10 hover:border-ink/35",
                  )}
                >
                  <Wallet className="mt-0.5 h-5 w-5 text-ink-70" />
                  <span className="flex-1">
                    <span className="block text-[12.5px] font-medium text-ink">
                      پرداخت {cfg.bnpl4.installments} قسطی — کل سفارش
                    </span>
                    <span className="mt-0.5 block text-[11px] text-ink-45">
                      {bnplPlan
                        ? `هر قسط حدود ${formatPrice(bnplPlan.perInstallment)} (بدون کارمزد) · تصمیم نهایی با ارائه‌دهنده`
                        : "مبلغ کل سفارش به اقساط مساوی تقسیم می‌شود؛ تصمیم نهایی با ارائه‌دهنده است."}
                    </span>
                  </span>
                </button>
              )}

              {cfg?.cashback.redeem.enabled && walletAvailable > 0 && (
                <label
                  className={cn(
                    "flex items-start gap-3 rounded-xl border p-4 text-start transition-colors",
                    useWallet ? "border-ink bg-ink/[0.04]" : "border-black/10 hover:border-ink/35",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 accent-ink"
                    checked={useWallet}
                    onChange={(e) => setUseWallet(e.target.checked)}
                  />
                  <span className="flex-1">
                    <span className="block text-[12.5px] font-medium text-ink">
                      استفاده از کش‌بک — تا {formatPrice(Math.min(walletAvailable, walletCap))}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-ink-45">
                      موجودی قابل استفاده {formatPrice(walletAvailable)}
                      {wallet && wallet.pending > 0 ? ` · ${formatPrice(wallet.pending)} پس از تحویل آزاد می‌شود` : ""}
                      {" · "}حداکثر {walletCapPercent.toLocaleString("fa-IR")}٪ مبلغ کالا · غیرقابل برداشت
                    </span>
                  </span>
                  <Wallet className="h-4 w-4 text-ink-45" />
                </label>
              )}
            </div>
          </section>
        </div>

        {/* summary */}
        <aside className="rounded-2xl border border-black/[0.07] bg-paper p-5 lg:sticky lg:top-24">
          <h3 className="text-[13px] font-semibold text-ink">خلاصهٔ سفارش</h3>
          <ul className="mt-3 max-h-[220px] space-y-2 overflow-y-auto pe-1">
            {lines.map((l) => (
              <li key={l.key} className="flex justify-between gap-2 text-[12px]">
                <span className="min-w-0 flex-1 truncate text-ink-70">
                  {l.name}
                  <span className="text-ink-45"> · {l.colorName} · {l.sizeLabel} × {l.qty.toLocaleString("fa-IR")}</span>
                </span>
                <span className="shrink-0 text-ink">{formatPrice(l.price * l.qty)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="کد تخفیف / جشنواره"
              dir="ltr"
              aria-label="کد تخفیف"
              className="min-w-0 flex-1 rounded-full border border-black/12 bg-white px-3 py-2 text-[11.5px] outline-none focus:border-ink/50"
            />
            <button type="button" onClick={applyCode} className={buttonStyles("outline", "sm")}>اعمال</button>
          </div>
          {codeMsg && (
            <p className={cn("mt-2 text-[11px]", codeMsg.ok ? "text-emerald-700" : "text-ember")}>{codeMsg.message}</p>
          )}

          <dl className="mt-4 space-y-1.5 border-t border-black/[0.07] pt-3 text-[12px]">
            <div className="flex justify-between">
              <dt className="text-ink-45">جمع اقلام</dt>
              <dd className="text-ink">{formatPrice(viewSubtotal)}</dd>
            </div>
            {viewDiscounts.map((d) => (
              <div key={d.id} className="flex justify-between text-emerald-700">
                <dt className="min-w-0 truncate pe-2">{d.name}</dt>
                <dd className="shrink-0">{d.amount > 0 ? `− ${formatPrice(d.amount)}` : "ارسال رایگان"}</dd>
              </div>
            ))}
            <div className="flex justify-between">
              <dt className="text-ink-45">ارسال {shipping === "express" ? "سریع" : "استاندارد"}</dt>
              <dd className={cn("text-ink", viewShipping === 0 && "text-emerald-700")}>{viewShipping === 0 ? "رایگان" : formatPrice(viewShipping)}</dd>
            </div>
            {serverQuote?.cashback.enabled && serverQuote.cashback.amount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <dt>
                  کش‌بک این خرید{" "}
                  <span className="text-[10.5px] text-ink-45">({serverQuote.cashback.percent.toLocaleString("fa-IR")}٪)</span>
                </dt>
                <dd>+ {formatPrice(serverQuote.cashback.amount)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-black/[0.07] pt-2">
              <dt className="text-[12.5px] font-medium text-ink">مبلغ نهایی</dt>
              <dd className="font-display text-[24px] font-medium text-ink">
                {formatPrice(walletApplied > 0 ? payableNow : viewTotal)}
              </dd>
            </div>
          </dl>

          <button type="submit" disabled={placing} className={buttonStyles("solid", "lg", "mt-4 w-full disabled:opacity-60")}>
            {placing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
            {placing ? "در حال رزرو موجودی و پرداخت…" : "پرداخت و ثبت سفارش"}
          </button>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-ink-45">
            <Zap className="h-3 w-3" />
            با ورود به این مرحله موجودی تا {cfg?.reservationHoldMinutes ?? 10} دقیقه رزرو می‌شود؛ سبد خرید به‌تنهایی موجودی را نگه نمی‌دارد.
          </p>
        </aside>
      </form>
    </div>
  );
}

function Field({ label, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; className?: string }) {
  return (
    <label className={cn("block text-[11.5px] text-ink-70", className)}>
      {label}
      <input
        {...rest}
        className="mt-1.5 w-full rounded-xl border border-black/12 bg-white px-3 py-2.5 text-[12.5px] text-ink outline-none transition-colors focus:border-ink/50"
      />
    </label>
  );
}

function ShipOption({ active, title, note, onClick }: { active: boolean; title: string; note: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-xl border p-3.5 text-start transition-all",
        active ? "border-ink bg-ink/[0.04]" : "border-black/10 hover:border-ink/35",
      )}
    >
      <span className="block text-[12.5px] font-medium text-ink">{title}</span>
      <span className="mt-0.5 block text-[11px] text-ink-45">{note}</span>
    </button>
  );
}

function UserCircleIcon() {
  return <span className="flex h-4 w-4 items-center justify-center rounded-full border border-ink-70" />;
}
