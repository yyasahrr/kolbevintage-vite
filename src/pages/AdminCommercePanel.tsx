import { useCallback, useEffect, useState } from "react";
import { CreditCard, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { api } from "@/lib/api";
import { currencyLabel } from "@/data/looks";

/* =====================================================================
   Commerce settings — the store-wide switches that used to be invented
   in the browser: the 4-installment gateway, the stock hold, shipping and
   the (fail-closed) live refund switch.
   ===================================================================== */

interface CommerceSettings {
  bnpl4Enabled: boolean;
  bnpl4Installments: number;
  reservationHoldMinutes: number;
  paymentWindowMinutes: number;
  quoteTtlMinutes: number;
  shippingFlat: number;
  shippingExpress: number;
  freeShippingThreshold: number;
  shippingThresholdBasis: "after_discount" | "before_discount";
  discountStacking: "none" | "explicit";
  cashbackEnabled: boolean;
  cashbackMode: "tier_rate" | "marginal";
  cashbackBase: "merchandise" | "grand_total";
  cashbackTiers: { min: number; max: number | null; percent: number }[];
  cashbackMaxAmount: number;
  cashbackCreditTiming: "on_payment" | "on_delivery" | "after_return_window";
  cashbackHoldDays: number;
  cashbackExpiryMonths: number;
  cashbackRedeemEnabled: boolean;
  cashbackRedeemMaxPercent: number;
  cashbackCombineWithDiscounts: boolean;
  liveRefundsEnabled: boolean;
  cartMaxQtyPerLine: number;
  currency: string;
  paymentProvider: string;
  superadmins: string[];
}

interface CommerceOrderLine {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  sizeLabel: string;
  colorName: string;
  refundedQuantity: number;
}

interface CommerceOrder {
  id: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  exceptionReason: string | null;
  customer: string | null;
  email: string | null;
  total: number;
  currency: string;
  lines: CommerceOrderLine[];
}

interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
}

interface Refund {
  id: string;
  orderId: string;
  quantity: number;
  amount: number;
  status: string;
  kind?: "refund" | "return" | "exchange";
  qcResult?: string | null;
  differenceAmount?: number;
  reason: string | null;
  requestedBy: string | null;
  approvedBy: string | null;
  createdAt: string;
}

interface CashbackOverview {
  accounts: number;
  orders: number;
  earned: number;
  reversed: number;
  balance: number;
  entries: {
    id: string;
    email: string | null;
    orderId: string | null;
    kind: "earn" | "reversal";
    baseAmount: number;
    percent: number;
    amount: number;
    at: string;
  }[];
}

interface Adjustment {
  id: string;
  variantId: string;
  delta: number;
  reason: string;
  requestedBy: string;
  status: string;
  createdAt: string;
}

function PanelHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <header className="ad-head">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {action && <div className="ad-head-actions">{action}</div>}
    </header>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="ad-card">
      <header className="ad-card-head">
        <h3>{title}</h3>
        {action}
      </header>
      <div className="ad-card-body">{children}</div>
    </section>
  );
}

const money = (n: number) => n.toLocaleString("fa-IR");

export function CommercePanel() {
  const [settings, setSettings] = useState<CommerceSettings | null>(null);
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [cashback, setCashback] = useState<CashbackOverview | null>(null);
  const [orders, setOrders] = useState<CommerceOrder[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [skuPick, setSkuPick] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [superCode, setSuperCode] = useState("");
  const [elevated, setElevated] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r, a, c, o, log] = await Promise.all([
        api.get<CommerceSettings>("/api/commerce/admin/settings"),
        api.get<Refund[]>("/api/commerce/admin/refunds"),
        api.get<Adjustment[]>("/api/commerce/admin/inventory/adjustments"),
        api.get<CashbackOverview>("/api/commerce/admin/cashback"),
        api.get<CommerceOrder[]>("/api/commerce/orders?all=1&limit=50"),
        api.get<AuditEntry[]>("/api/commerce/admin/audit?limit=50"),
      ]);
      setSettings(s);
      setRefunds(r);
      setAdjustments(a);
      setCashback(c);
      setOrders(o);
      setAudit(log);
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "خواندن تنظیمات ناموفق بود." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (values: Partial<CommerceSettings>) =>
    setSettings((current) => (current ? { ...current, ...values } : current));

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const saved = await api.put<CommerceSettings>("/api/commerce/admin/settings", settings);
      setSettings(saved);
      setMessage({ ok: true, text: "تنظیمات تجارت ذخیره شد." });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "ذخیره ناموفق بود." });
    } finally {
      setBusy(false);
    }
  };

  const elevate = async () => {
    try {
      await api.post("/api/commerce/admin/elevate", { passcode: superCode });
      setElevated(true);
      setMessage({ ok: true, text: "نشست Superadmin فعال شد." });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "رمز Superadmin درست نیست." });
    }
  };

  const decideRefund = async (id: string, decision: "approve" | "reject") => {
    try {
      await api.post(`/api/commerce/admin/refunds/${id}`, { decision });
      setMessage({ ok: true, text: decision === "approve" ? "بازپرداخت تأیید شد." : "درخواست رد شد." });
      await load();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "عملیات ناموفق بود." });
    }
  };

  const refundStep = async (id: string, step: "receive" | "qc" | "settle", body: Record<string, unknown> = {}) => {
    try {
      await api.post(`/api/commerce/admin/refunds/${id}/${step}`, body);
      setMessage({ ok: true, text: "مرحلهٔ مرجوعی ثبت شد." });
      await load();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "عملیات ناموفق بود." });
    }
  };

  const decideAdjustment = async (id: string, decision: "approve" | "reject") => {
    try {
      await api.post(`/api/commerce/admin/inventory/adjustments/${id}`, { decision });
      await load();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "عملیات ناموفق بود." });
    }
  };

  /**
   * The fulfilment lifecycle lives on the server: picking needs the scanned
   * SKU, packing needs an explicit confirmation, shipping and delivery move the
   * order forward. The panel is only a caller here — it can never invent a
   * status jump, and every step is recorded in the audit trail.
   */
  const advance = async (id: string, action: "picking" | "packing" | "ship" | "deliver") => {
    try {
      const sku = skuPick[id];
      if (action === "picking" && !sku) {
        setMessage({ ok: false, text: "برای برداشت، اول SKU را انتخاب کن." });
        return;
      }
      await api.post(`/api/commerce/orders/${id}/${action}`, action === "picking" ? { sku } : { confirm: true });
      setMessage({ ok: true, text: "وضعیت سفارش به‌روز شد." });
      await load();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "تغییر وضعیت ناموفق بود." });
    }
  };

  const cancelOrder = async (id: string) => {
    try {
      await api.post(`/api/commerce/orders/${id}/cancel`, { reason: "cancelled in admin" });
      setMessage({ ok: true, text: "سفارش لغو شد و موجودی آزاد شد." });
      await load();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "لغو سفارش ناموفق بود." });
    }
  };

  const drainOutbox = async () => {
    try {
      const res = await api.post<{ outbox: { done: number; failed: number } }>("/api/commerce/admin/tick");
      setMessage({ ok: true, text: `صف رویدادها پردازش شد (${res.outbox.done} موفق، ${res.outbox.failed} ناموفق).` });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "پردازش صف ناموفق بود." });
    }
  };

  return (
    <>
      <PanelHead
        title="تجارت و پرداخت"
        sub="قواعد پول و موجودی: رزرو هنگام ورود به تسویه، درگاه چهارقسطی سراسری، کرایهٔ ارسال و بازپرداخت محافظت‌شده."
        action={
          <button type="button" className="ad-btn is-sm" onClick={() => void load()}>
            <RefreshCw width={13} height={13} /> تازه‌سازی
          </button>
        }
      />

      {message && (
        <p className="ad-hint" style={{ marginBottom: 10, color: message.ok ? undefined : "var(--ember, #b45309)" }}>
          {message.text}
        </p>
      )}

      {settings && (
        <div className="ad-grid-2">
          <Panel title="درگاه چهارقسطی (سراسری)">
            <label className="ad-check">
              <input
                type="checkbox"
                checked={settings.bnpl4Enabled}
                onChange={(e) => patch({ bnpl4Enabled: e.target.checked })}
              />
              پرداخت چهارقسطی برای کل فروشگاه فعال باشد
            </label>
            <p className="ad-hint">
              این کلید در سطح فروشگاه است، نه محصول. وقتی روشن باشد گزینهٔ اقساط برای همهٔ محصولات و کل سفارش (یک
              پرداخت، یک مرسوله) نمایش داده می‌شود؛ برچسب «اقساطی/غیراقساطی» محصولات دیگر درگاه را مخفی نمی‌کند.
              تصمیم نهایی دربارهٔ هر سفارش با ارائه‌دهنده است و در صورت رد شدن، پرداخت آنلاین عادی باقی می‌ماند.
            </p>
            <div className="ad-two">
              <label className="ad-field">
                تعداد اقساط
                <input
                  className="ad-input"
                  type="number"
                  min={2}
                  max={12}
                  value={settings.bnpl4Installments}
                  onChange={(e) => patch({ bnpl4Installments: Number(e.target.value) })}
                />
              </label>
              <label className="ad-field">
                ارائه‌دهنده
                <input className="ad-input" value={settings.paymentProvider} readOnly dir="ltr" />
              </label>
            </div>
          </Panel>

          <Panel title="رزرو موجودی و پرداخت" action={<ShieldCheck width={15} height={15} />}>
            <div className="ad-two">
              <label className="ad-field">
                مدت نگه‌داشتن موجودی (دقیقه)
                <input
                  className="ad-input"
                  type="number"
                  min={1}
                  max={60}
                  value={settings.reservationHoldMinutes}
                  onChange={(e) => patch({ reservationHoldMinutes: Number(e.target.value) })}
                />
              </label>
              <label className="ad-field">
                مهلت پرداخت درگاه (دقیقه)
                <input
                  className="ad-input"
                  type="number"
                  min={1}
                  max={120}
                  value={settings.paymentWindowMinutes}
                  onChange={(e) => patch({ paymentWindowMinutes: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="ad-two">
              <label className="ad-field">
                اعتبار پیش‌فاکتور (دقیقه)
                <input
                  className="ad-input"
                  type="number"
                  min={1}
                  max={60}
                  value={settings.quoteTtlMinutes}
                  onChange={(e) => patch({ quoteTtlMinutes: Number(e.target.value) })}
                />
              </label>
              <label className="ad-field">
                حداکثر تعداد هر قلم در سبد
                <input
                  className="ad-input"
                  type="number"
                  min={1}
                  max={20}
                  value={settings.cartMaxQtyPerLine}
                  onChange={(e) => patch({ cartMaxQtyPerLine: Number(e.target.value) })}
                />
              </label>
            </div>
            <p className="ad-hint">افزودن به سبد هیچ موجودی را رزرو نمی‌کند؛ رزرو فقط هنگام ورود به تسویه اتفاق می‌افتد.</p>
          </Panel>

          <Panel title="ارسال" action={<Truck width={15} height={15} />}>
            <div className="ad-two">
              <label className="ad-field">
                کرایهٔ استاندارد
                <input
                  className="ad-input"
                  type="number"
                  value={settings.shippingFlat}
                  onChange={(e) => patch({ shippingFlat: Number(e.target.value) })}
                />
              </label>
              <label className="ad-field">
                کرایهٔ سریع
                <input
                  className="ad-input"
                  type="number"
                  value={settings.shippingExpress}
                  onChange={(e) => patch({ shippingExpress: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="ad-two">
              <label className="ad-field">
                آستانهٔ ارسال رایگان
                <input
                  className="ad-input"
                  type="number"
                  value={settings.freeShippingThreshold}
                  onChange={(e) => patch({ freeShippingThreshold: Number(e.target.value) })}
                />
              </label>
              <label className="ad-field">
                مبنای آستانه
                <select
                  className="ad-select"
                  value={settings.shippingThresholdBasis}
                  onChange={(e) =>
                    patch({ shippingThresholdBasis: e.target.value as CommerceSettings["shippingThresholdBasis"] })
                  }
                >
                  <option value="after_discount">مبلغ پس از تخفیف (پیشنهادی)</option>
                  <option value="before_discount">مبلغ پیش از تخفیف</option>
                </select>
              </label>
            </div>
            <p className="ad-hint">هر سفارش یک مرسوله و یک کرایه دارد؛ آستانه روی مبلغ پس از تخفیف و پیش از ارسال سنجیده می‌شود.</p>
          </Panel>

          <Panel title="تخفیف‌ها و بازپرداخت" action={<CreditCard width={15} height={15} />}>
            <label className="ad-field">
              ترکیب کد تخفیف با کمپین
              <select
                className="ad-select"
                value={settings.discountStacking}
                onChange={(e) => patch({ discountStacking: e.target.value as CommerceSettings["discountStacking"] })}
              >
                <option value="none">ممنوع (پیش‌فرض)</option>
                <option value="explicit">فقط با اجازهٔ صریح هر دو طرف</option>
              </select>
            </label>
            <p className="ad-hint">
              انتخاب کمپین با بالاترین Priority است، نه بیشترین تخفیف؛ در تساوی، قدیمی‌تر و سپس شناسهٔ پایدار تعیین‌کننده است.
              کوپن فقط در مرحلهٔ تسویه وارد می‌شود.
            </p>
            <label className="ad-check">
              <input
                type="checkbox"
                checked={settings.liveRefundsEnabled}
                onChange={(e) => patch({ liveRefundsEnabled: e.target.checked })}
              />
              اجازهٔ اجرای بازپرداخت زنده (فقط پس از احراز هویت دو مرحله‌ای Superadmin)
            </label>
            <div className="ad-two" style={{ marginTop: 8 }}>
              <input
                className="ad-input"
                placeholder="رمز Superadmin"
                type="password"
                value={superCode}
                onChange={(e) => setSuperCode(e.target.value)}
                dir="ltr"
              />
              <button type="button" className="ad-btn is-sm" onClick={() => void elevate()}>
                <ShieldCheck width={13} height={13} /> ارتقا به Superadmin
              </button>
            </div>
            {elevated && <p className="ad-hint">نشست Superadmin فعال است؛ تغییر کلید بازپرداخت زنده اکنون ذخیره می‌شود.</p>}
          </Panel>
        </div>
      )}

      {settings && (
        <div className="ad-actions" style={{ marginTop: 12 }}>
          <button type="button" className="ad-btn" disabled={busy} onClick={() => void save()}>
            {busy ? "در حال ذخیره…" : "ذخیرهٔ تنظیمات تجارت"}
          </button>
          <button type="button" className="ad-btn is-sm" onClick={() => void drainOutbox()}>
            پردازش صف رویدادها
          </button>
          <span className="ad-actions-spacer" />
          <span className="ad-hint">واحد پول: {currencyLabel(settings.currency)}</span>
        </div>
      )}

      {settings && (
        <Panel
          title="کش‌بک پله‌ای"
          action={
            <button
              type="button"
              className="ad-btn is-sm"
              onClick={() =>
                patch({
                  cashbackTiers: [
                    ...settings.cashbackTiers,
                    { min: settings.cashbackTiers.at(-1)?.max ?? 0, max: null, percent: 1 },
                  ],
                })
              }
            >
              + پله
            </button>
          }
        >
          <label className="ad-check">
            <input
              type="checkbox"
              checked={settings.cashbackEnabled}
              onChange={(e) => patch({ cashbackEnabled: e.target.checked })}
            />
            کش‌بک فعال باشد
          </label>
          <p className="ad-hint">
            نرخ به مبلغ سبد بستگی دارد، نه یک درصد ثابت: مثلاً تا ۱٬۰۰۰٬۰۰۰ → ۵٪، تا ۳٬۰۰۰٬۰۰۰ → ۳٪. در حالت «نرخ پله»
            کل سبد با نرخ پلهٔ خودش حساب می‌شود؛ در حالت «پله‌ای/حاشیه‌ای» هر نرخ فقط روی سهم خودش اعمال می‌شود.
          </p>
          <div className="ad-two">
            <label className="ad-field">
              روش محاسبه
              <select
                className="ad-select"
                value={settings.cashbackMode}
                onChange={(e) => patch({ cashbackMode: e.target.value as CommerceSettings["cashbackMode"] })}
              >
                <option value="tier_rate">نرخ پله روی کل سبد (تا X → ۵٪)</option>
                <option value="marginal">حاشیه‌ای (هر نرخ روی سهم خودش)</option>
              </select>
            </label>
            <label className="ad-field">
              مبنای محاسبه
              <select
                className="ad-select"
                value={settings.cashbackBase}
                onChange={(e) => patch({ cashbackBase: e.target.value as CommerceSettings["cashbackBase"] })}
              >
                <option value="merchandise">مبلغ کالاها پس از تخفیف (بدون ارسال)</option>
                <option value="grand_total">مبلغ نهایی سفارش (با ارسال)</option>
              </select>
            </label>
          </div>
          <div className="ad-table-wrap" style={{ marginTop: 10 }}>
            <table className="ad-table">
              <thead>
                <tr>
                  <th>از مبلغ</th>
                  <th>تا مبلغ (خالی = نامحدود)</th>
                  <th>درصد</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {settings.cashbackTiers.map((tier, index) => (
                  <tr key={index}>
                    <td>
                      <input
                        className="ad-input"
                        type="number"
                        min={0}
                        value={tier.min}
                        onChange={(e) => {
                          const next = [...settings.cashbackTiers];
                          next[index] = { ...tier, min: Number(e.target.value) || 0 };
                          patch({ cashbackTiers: next });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="ad-input"
                        type="number"
                        min={0}
                        placeholder="نامحدود"
                        value={tier.max ?? ""}
                        onChange={(e) => {
                          const next = [...settings.cashbackTiers];
                          next[index] = { ...tier, max: e.target.value === "" ? null : Number(e.target.value) };
                          patch({ cashbackTiers: next });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="ad-input"
                        type="number"
                        min={0}
                        max={30}
                        step={0.5}
                        value={tier.percent}
                        onChange={(e) => {
                          const next = [...settings.cashbackTiers];
                          next[index] = { ...tier, percent: Number(e.target.value) || 0 };
                          patch({ cashbackTiers: next });
                        }}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="ad-btn is-sm is-danger"
                        onClick={() => patch({ cashbackTiers: settings.cashbackTiers.filter((_, i) => i !== index) })}
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ad-two" style={{ marginTop: 10 }}>
            <label className="ad-field">
              سقف مبلغ کش‌بک هر سفارش
              <input
                className="ad-input"
                type="number"
                min={0}
                value={settings.cashbackMaxAmount}
                onChange={(e) => patch({ cashbackMaxAmount: Number(e.target.value) || 0 })}
              />
            </label>
            <div className="ad-field">
              وضعیت
              <p className="ad-hint">
                {cashback
                  ? `${money(cashback.accounts)} حساب، ${money(cashback.orders)} سفارش، پرداختی ${money(cashback.earned)}، برگشتی ${money(Math.abs(cashback.reversed))}`
                  : "در حال خواندن…"}
              </p>
            </div>
          </div>

          <hr className="ad-divider" style={{ margin: "14px 0" }} />
          <h4 style={{ margin: "0 0 6px", fontSize: 13 }}>سیاست مالی کش‌بک (تصویب ۲۰۲۶-۱۱-۰۴)</h4>
          <p className="ad-hint">
            کش‌بک هر سفارش فقط برای سفارش‌های <b>بعدی همان مشتری</b> قابل استفاده است، <b>قابل برداشت نقدی نیست</b>
            و فقط داخل فروشگاه خرج می‌شود؛ تا زمانی که سفارش تحویل نشده (و مهلت مرجوعی تمام نشده) در حالت
            «در انتظار» می‌ماند و بعد از آن آزاد می‌شود.
          </p>
          <div className="ad-two">
            <label className="ad-field">
              زمان آزادسازی
              <select
                className="ad-select"
                value={settings.cashbackCreditTiming}
                onChange={(e) =>
                  patch({ cashbackCreditTiming: e.target.value as CommerceSettings["cashbackCreditTiming"] })
                }
              >
                <option value="after_return_window">پس از تحویل + مهلت مرجوعی (پیشنهاد)</option>
                <option value="on_delivery">بلافاصله پس از تحویل</option>
                <option value="on_payment">همان لحظهٔ پرداخت</option>
              </select>
            </label>
            <label className="ad-field">
              تعداد روز پس از تحویل
              <input
                className="ad-input"
                type="number"
                min={0}
                value={settings.cashbackHoldDays}
                onChange={(e) => patch({ cashbackHoldDays: Number(e.target.value) || 0 })}
              />
            </label>
          </div>
          <div className="ad-two">
            <label className="ad-field">
              انقضا (ماه، ۰ = بدون انقضا)
              <input
                className="ad-input"
                type="number"
                min={0}
                value={settings.cashbackExpiryMonths}
                onChange={(e) => patch({ cashbackExpiryMonths: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="ad-field">
              حداکثر سهم هر سفارش (٪ مبلغ کالا)
              <input
                className="ad-input"
                type="number"
                min={0}
                max={100}
                value={settings.cashbackRedeemMaxPercent}
                onChange={(e) => patch({ cashbackRedeemMaxPercent: Number(e.target.value) || 0 })}
              />
            </label>
          </div>
          <div className="ad-two" style={{ marginTop: 6 }}>
            <label className="ad-check">
              <input
                type="checkbox"
                checked={settings.cashbackRedeemEnabled}
                onChange={(e) => patch({ cashbackRedeemEnabled: e.target.checked })}
              />
              استفاده از کش‌بک در پرداخت مجاز باشد
            </label>
            <label className="ad-check">
              <input
                type="checkbox"
                checked={settings.cashbackCombineWithDiscounts}
                onChange={(e) => patch({ cashbackCombineWithDiscounts: e.target.checked })}
              />
              هم‌زمان با کوپن/کمپین مجاز باشد
            </label>
          </div>
        </Panel>
      )}

      <Panel title={`درخواست‌های بازپرداخت (${refunds.length})`}>
        {refunds.length === 0 ? (
          <p className="ad-hint">درخواستی ثبت نشده است.</p>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>سفارش</th>
                  <th>تعداد</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                  <th>درخواست‌دهنده</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {refunds.map((r) => (
                  <tr key={r.id}>
                    <td dir="ltr">{r.orderId}</td>
                    <td>{money(r.quantity)}</td>
                    <td>{money(r.amount)}</td>
                    <td>{r.status}</td>
                    <td dir="ltr">{r.requestedBy}</td>
                    <td>
                      <div className="ad-actions" style={{ flexWrap: "wrap", gap: 6 }}>
                        {r.status === "requested" && (
                          <>
                            <button type="button" className="ad-btn is-sm" onClick={() => void decideRefund(r.id, "approve")}>
                              تأیید
                            </button>
                            <button type="button" className="ad-btn is-sm is-danger" onClick={() => void decideRefund(r.id, "reject")}>
                              رد
                            </button>
                          </>
                        )}
                        {r.status === "approved" && r.kind !== "refund" && (
                          <button type="button" className="ad-btn is-sm" onClick={() => void refundStep(r.id, "receive")}>
                            دریافت کالا
                          </button>
                        )}
                        {r.status === "received" && (
                          <>
                            <button
                              type="button"
                              className="ad-btn is-sm"
                              onClick={() => void refundStep(r.id, "qc", { result: "saleable" })}
                            >
                              QC سالم
                            </button>
                            <button
                              type="button"
                              className="ad-btn is-sm is-danger"
                              onClick={() => void refundStep(r.id, "qc", { result: "defective" })}
                            >
                              QC معیوب (قرنطینه)
                            </button>
                          </>
                        )}
                        {(r.status === "qc_passed" || r.status === "qc_failed" || r.status === "approved") && (
                          <button type="button" className="ad-btn is-sm" onClick={() => void refundStep(r.id, "settle")}>
                            تسویه (Superadmin)
                          </button>
                        )}
                        {r.status === "manual_review" && <span className="ad-hint">نیازمند بازپرداخت دستی</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="اصلاح دستی موجودی (تأیید دو نفره)">
        {adjustments.length === 0 ? (
          <p className="ad-hint">درخواستی وجود ندارد.</p>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>واریانت</th>
                  <th>تغییر</th>
                  <th>وضعیت</th>
                  <th>درخواست‌دهنده</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {adjustments.map((a) => (
                  <tr key={a.id}>
                    <td dir="ltr">{a.variantId}</td>
                    <td>{a.delta > 0 ? `+${money(a.delta)}` : money(a.delta)}</td>
                    <td>{a.status}</td>
                    <td dir="ltr">{a.requestedBy}</td>
                    <td>
                      {a.status === "pending" && (
                        <button type="button" className="ad-btn is-sm" onClick={() => void decideAdjustment(a.id, "approve")}>
                          تأیید
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="سفارش‌های سرور — چرخهٔ پرداخت و ارسال">
        {orders.length === 0 ? (
          <p className="ad-hint">هنوز سفارشی از مسیر تجارت ثبت نشده است.</p>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>شناسه</th>
                  <th>مشتری</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                  <th>اقلام</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td dir="ltr">{o.id}</td>
                    <td dir="ltr">{o.email ?? o.customer ?? "—"}</td>
                    <td>{money(o.total)}</td>
                    <td>
                      {o.status === "exception" ? (
                        <span className="ad-pill is-pending" title={o.exceptionReason ?? undefined}>
                          استثنا — بررسی مالی
                        </span>
                      ) : (
                        o.status
                      )}
                    </td>
                    <td>{o.lines.reduce((n, l) => n + l.quantity, 0)}</td>
                    <td>
                      <div className="ad-actions" style={{ flexWrap: "wrap", gap: 6 }}>
                        {(o.status === "paid" || (o.status === "preparing" && o.fulfillmentStatus !== "packed")) && (
                          <>
                            <select
                              className="ad-input"
                              value={skuPick[o.id] ?? ""}
                              onChange={(e) => setSkuPick((m) => ({ ...m, [o.id]: e.target.value }))}
                            >
                              <option value="">SKU را انتخاب کن</option>
                              {o.lines.map((l) => (
                                <option key={l.id} value={l.sku}>
                                  {l.sku} — {l.name} ({l.colorName}/{l.sizeLabel})
                                </option>
                              ))}
                            </select>
                            <button type="button" className="ad-btn is-sm" onClick={() => void advance(o.id, "picking")}>
                              برداشت
                            </button>
                          </>
                        )}
                        {(o.status === "paid" || o.status === "preparing") && (
                          <button type="button" className="ad-btn is-sm" onClick={() => void advance(o.id, "packing")}>
                            بسته‌بندی
                          </button>
                        )}
                        {(o.status === "paid" || o.status === "preparing") && (
                          <button type="button" className="ad-btn is-sm" onClick={() => void advance(o.id, "ship")}>
                            ارسال
                          </button>
                        )}
                        {o.status !== "paid" && (
                          <span className="ad-hint">مرحلهٔ جاری: {o.fulfillmentStatus}</span>
                        )}
                        {o.status === "shipped" && (
                          <button type="button" className="ad-btn is-sm" onClick={() => void advance(o.id, "deliver")}>
                            تحویل
                          </button>
                        )}
                        {["paid", "preparing"].includes(o.status) && (
                          <button type="button" className="ad-btn is-sm is-danger" onClick={() => void cancelOrder(o.id)}>
                            لغو
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="ردپای تغییرات (Audit)">
        {audit.length === 0 ? (
          <p className="ad-hint">هنوز تغییری ثبت نشده است.</p>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>زمان</th>
                  <th>کاربر</th>
                  <th>عمل</th>
                  <th>هدف</th>
                  <th>قبل → بعد</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((row) => (
                  <tr key={row.id}>
                    <td dir="ltr">{new Date(row.at).toLocaleString("fa-IR")}</td>
                    <td dir="ltr">{row.actor}</td>
                    <td dir="ltr">{row.action}</td>
                    <td dir="ltr">{row.targetId ?? row.targetType}</td>
                    <td dir="ltr" style={{ fontSize: 11, maxWidth: 320, wordBreak: "break-all" }}>
                      {JSON.stringify(row.before)} → {JSON.stringify(row.after)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
