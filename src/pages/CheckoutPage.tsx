import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CreditCard, Lock, PackageCheck, ShieldCheck, ShoppingBag, Truck, Wallet, Zap } from "lucide-react";
import { useCart } from "@/state/cart";
import { useAuth } from "@/state/auth";
import { addCashback, formField, getOps } from "@/state/ops";
import {
  addOrder,
  bumpCampaignUse,
  bumpCouponUse,
  consumeStock,
  getAdmin,
  type Order,
  type OrderLine,
} from "@/state/admin";
import { computeDiscounts, validateCode, type AppliedDiscount } from "@/state/discounts";
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
  const [order, setOrder] = useState<{ id: string; total: number; items: number; discounts: AppliedDiscount[] } | null>(null);

  const linesLite = useMemo(
    () => lines.map((l) => ({ productId: l.productId, name: l.name, price: l.price, qty: l.qty })),
    [lines],
  );

  const discount = useMemo(() => computeDiscounts(linesLite, appliedCode || undefined), [linesLite, appliedCode]);
  const finalShipping = lines.length === 0 ? 0 : shipping === "express" ? (discount.freeship ? 0 : settings.expressCost) : discount.freeship ? 0 : 12;
  const total = Math.max(0, discount.afterDiscount + finalShipping);

  const applyCode = () => {
    const r = validateCode(code, discount.subtotal);
    setCodeMsg(r);
    setAppliedCode(r.ok ? code.trim().toUpperCase() : "");
  };

  const placeOrder = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!lines.length) return;
    const form = new FormData(e.currentTarget);
    void lines;
    const id = `VL-${Math.floor(10000 + Math.random() * 89999)}`;
    const linesFull: OrderLine[] = lines.map((l) => ({
        name: l.name,
        productId: l.productId,
        color: l.colorName,
        colorId: l.colorId,
        size: l.sizeLabel,
        sizeId: l.sizeId,
        qty: l.qty,
        price: l.price,
    }));
    const campaignHit = discount.applied.find((a) => a.id.startsWith("cmp-"));
    const couponHit = discount.applied.find((a) => a.id.startsWith("cp-"));
    const campaignId = campaignHit ? admin.campaigns.find((c) => `cmp-${c.id}` === campaignHit.id)?.id : undefined;
    const record: Order = {
      id,
      at: Date.now(),
      customer: `${form.get("given") ?? ""} ${form.get("family") ?? ""}`.trim() || "مشتری مهمان",
      email: String(form.get("email") ?? ""),
      phone: String(form.get("tel") ?? ""),
      city: String(form.get("city") ?? ""),
      address: String(form.get("street") ?? ""),
      shipping,
      lines: linesFull,
      subtotal: discount.subtotal,
      discounts: discount.applied.map((d) => ({ name: d.name, amount: d.amount })),
      discountTotal: discount.discountTotal,
      shippingCost: finalShipping,
      total,
      status: "pending",
      coupon: appliedCode || undefined,
      campaign: campaignHit?.name,
      gateway: GATEWAY_LABEL[admin.integrations.payment.gateway],
    };
    addOrder(record);
    if (campaignId) bumpCampaignUse(campaignId);
    if (couponHit) bumpCouponUse(appliedCode);
    consumeStock(linesFull.map((l) => ({ productId: l.productId, colorId: l.colorId, sizeId: l.sizeId, qty: l.qty, name: l.name })));
    const cashback = Math.round((total * getOps().cashbackRate) / 100);
    if (record.email && cashback > 0) addCashback({ email: record.email.toLowerCase(), orderId: id, amount: cashback, kind: "earn" });
    setOrder({ id, total, items: lines.reduce((n, l) => n + l.qty, 0), discounts: discount.applied });
    clear();
    if (admin.integrations.sms.enabled)
      notify("پیامک ارسال شد (شبیه‌سازی)", `کد رهگیری ${id} با ${admin.integrations.sms.provider} به ${record.phone || "مشتری"} ارسال شد.`);
    if (admin.integrations.email.enabled)
      notify("ایمیل تایید ارسال شد (شبیه‌سازی)", `${record.email || "ایمیل مشتری"} — ${admin.integrations.email.provider}`);
    if (admin.integrations.shipping.enabled)
      notify("برگهٔ بار ثبت شد (شبیه‌سازی)", `${admin.integrations.shipping.courier} — سفارش ${id}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /* ---------- success ---------- */
  if (order) {
    return (
      <div className="pb-16">
        <PageIntro crumbs={[{ label: "تسویه حساب" }]} title="سفارش شما ثبت شد" description="این نسخه نمایشی است؛ پرداخت واقعی انجام نشده و سفارش در پنل مدیریت ثبت شد." />
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
                note={discount.freeship ? "رایگان (تخفیف فعال)" : settings.freeShipping ? `رایگان بالای ${settings.freeShipping.toLocaleString("fa-IR")} یورو` : "۱۲ یورو"}
                onClick={() => setShipping("standard")}
              />
              <ShipOption
                active={shipping === "express"}
                title="ارسال سریع (۲۴ ساعته)"
                note={discount.freeship ? "رایگان (تخفیف فعال)" : `${settings.expressCost.toLocaleString("fa-IR")} یورو`}
                onClick={() => setShipping("express")}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-black/[0.07] bg-paper p-5">
            <h3 className="mb-4 flex items-center gap-2 text-[13px] font-semibold text-ink">
              <Wallet size={15} /> پرداخت
            </h3>
            <div className="flex items-center gap-3 rounded-xl bg-[#f4efe7] p-4">
              <CreditCard className="h-5 w-5 text-ink-70" />
              <div className="flex-1">
                <p className="text-[12.5px] font-medium text-ink">{gateway}</p>
                <p className="text-[11px] text-ink-45">
                  {admin.integrations.payment.enabled
                    ? `حالت ${admin.integrations.payment.mode === "test" ? "تست" : "حقیقی"} — در این نسخه پرداخت شبیه‌سازی می‌شود.`
                    : "درگاه در پنل مدیریت پیکربندی نشده — پرداخت شبیه‌سازی می‌شود."}
                </p>
              </div>
              <ShieldCheck className="h-4 w-4 text-ink-45" />
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
              <dd className="text-ink">{formatPrice(discount.subtotal)}</dd>
            </div>
            {discount.applied.map((d) => (
              <div key={d.id} className="flex justify-between text-emerald-700">
                <dt className="min-w-0 truncate pe-2">{d.name}</dt>
                <dd className="shrink-0">{d.amount > 0 ? `− ${formatPrice(d.amount)}` : "ارسال رایگان"}</dd>
              </div>
            ))}
            <div className="flex justify-between">
              <dt className="text-ink-45">ارسال {shipping === "express" ? "سریع" : "استاندارد"}</dt>
              <dd className={cn("text-ink", finalShipping === 0 && "text-emerald-700")}>{finalShipping === 0 ? "رایگان" : formatPrice(finalShipping)}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t border-black/[0.07] pt-2">
              <dt className="text-[12.5px] font-medium text-ink">مبلغ نهایی</dt>
              <dd className="font-display text-[24px] font-medium text-ink">{formatPrice(total)}</dd>
            </div>
          </dl>

          <button type="submit" className={buttonStyles("solid", "lg", "mt-4 w-full")}>
            <Lock className="h-3.5 w-3.5" />
            ثبت سفارش نمایشی
          </button>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-[10px] text-ink-45">
            <Zap className="h-3 w-3" />
            موجودی انبار بعد از ثبت سفارش کسر می‌شود
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
