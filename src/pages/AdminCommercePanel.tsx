import { useCallback, useEffect, useState } from "react";
import { CreditCard, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { api } from "@/lib/api";

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
  liveRefundsEnabled: boolean;
  cartMaxQtyPerLine: number;
  currency: string;
  paymentProvider: string;
  superadmins: string[];
}

interface Refund {
  id: string;
  orderId: string;
  quantity: number;
  amount: number;
  status: string;
  reason: string | null;
  requestedBy: string | null;
  approvedBy: string | null;
  createdAt: string;
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
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [superCode, setSuperCode] = useState("");
  const [elevated, setElevated] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r, a] = await Promise.all([
        api.get<CommerceSettings>("/api/commerce/admin/settings"),
        api.get<Refund[]>("/api/commerce/admin/refunds"),
        api.get<Adjustment[]>("/api/commerce/admin/inventory/adjustments"),
      ]);
      setSettings(s);
      setRefunds(r);
      setAdjustments(a);
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

  const decideAdjustment = async (id: string, decision: "approve" | "reject") => {
    try {
      await api.post(`/api/commerce/admin/inventory/adjustments/${id}`, { decision });
      await load();
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "عملیات ناموفق بود." });
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
          <span className="ad-hint">واحد پول: {settings.currency}</span>
        </div>
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
                      {r.status === "requested" && (
                        <div className="ad-actions">
                          <button type="button" className="ad-btn is-sm" onClick={() => void decideRefund(r.id, "approve")}>
                            تأیید
                          </button>
                          <button type="button" className="ad-btn is-sm is-danger" onClick={() => void decideRefund(r.id, "reject")}>
                            رد
                          </button>
                        </div>
                      )}
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
    </>
  );
}
