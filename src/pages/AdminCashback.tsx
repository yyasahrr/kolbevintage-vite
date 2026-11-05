import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, Plus, RefreshCw, Save, Trash2, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/utils/cn";
import { CURRENCY, formatNumber, formatPrice, tomanRate } from "@/data/looks";

/* =====================================================================
   Cashback — one screen, one source of truth.

   The panel used to hold a single flat rate in the try-on screen while the
   server already ran a bracket engine; the storefront read the engine, the
   owner edited the flat number, and the two disagreed. This screen edits the
   engine itself: a ladder of brackets (۱ میلیون ⇒ ۳٪, ۲ میلیون ⇒ ۵٪), the
   payment cap, the release policy, and the ledger the money actually lives in.

   Every number here is read from and written to
   GET/PUT /api/commerce/admin/settings and GET /api/commerce/admin/cashback.
   ===================================================================== */

interface Tier {
  min: number;
  max: number | null;
  percent: number;
}

interface CashbackSettings {
  cashbackEnabled: boolean;
  cashbackMode: "tier_rate" | "marginal";
  cashbackBase: "merchandise" | "grand_total";
  cashbackTiers: Tier[];
  cashbackMaxAmount: number;
  cashbackCreditTiming: "on_payment" | "on_delivery" | "after_return_window";
  cashbackHoldDays: number;
  cashbackExpiryMonths: number;
  cashbackRedeemEnabled: boolean;
  cashbackRedeemMaxPercent: number;
  cashbackCombineWithDiscounts: boolean;
}

interface LedgerEntry {
  id: string;
  email: string | null;
  orderId: string | null;
  kind: "earn" | "reversal";
  baseAmount: number;
  percent: number;
  amount: number;
  at: string;
}

interface Overview {
  accounts: number;
  orders: number;
  earned: number;
  reversed: number;
  balance: number;
  entries: LedgerEntry[];
}

/** the owner's ladder, in stored units (1 unit = 1,000 Toman by default) */
const OWNER_LADDER: { toman: number; percent: number }[] = [
  { toman: 0, percent: 1 },
  { toman: 1_000_000, percent: 3 },
  { toman: 2_000_000, percent: 5 },
];

const fa = (n: number) => n.toLocaleString("fa-IR");
const unitsToToman = (units: number) => Math.round(units * tomanRate());
const tomanToUnits = (toman: number) => Math.round(toman / tomanRate());

const TIMING_LABEL: Record<CashbackSettings["cashbackCreditTiming"], string> = {
  on_payment: "به‌محض پرداخت",
  on_delivery: "بعد از تحویل",
  after_return_window: "بعد از پایان مهلت مرجوعی",
};

const MODE_HINT: Record<CashbackSettings["cashbackMode"], string> = {
  tier_rate:
    "کل سبد در همان پله‌ای که می‌افتد حساب می‌شود: سبد ۲٫۵ میلیونی تمامش ۵٪ می‌گیرد. ساده‌ترین حالت برای توضیح به مشتری.",
  marginal:
    "هر بخش از سبد نرخ خودش را می‌گیرد: تا ۱ میلیون ۱٪، بخش دوم ۳٪، بخش سوم ۵٪. منصفانه‌تر، ولی سخت‌تر برای توضیح.",
};

const BASE_LABEL: Record<CashbackSettings["cashbackBase"], string> = {
  merchandise: "فقط مبلغ کالاها (بدون ارسال)",
  grand_total: "مبلغ کل فاکتور (با ارسال)",
};

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

/** the same bracket rule the server applies, so the preview cannot drift */
function cashbackFor(base: number, s: Pick<CashbackSettings, "cashbackMode" | "cashbackTiers" | "cashbackMaxAmount">) {
  const tiers = [...s.cashbackTiers]
    .map((t) => ({ min: Math.max(0, t.min), max: t.max, percent: Math.max(0, t.percent) }))
    .filter((t) => t.percent > 0)
    .sort((a, b) => a.min - b.min)
    .map((t, i, all) => ({ ...t, max: t.max ?? all[i + 1]?.min ?? null }));
  if (!tiers.length || base <= 0) return { percent: 0, amount: 0, tier: null as Tier | null };
  let amount = 0;
  let percent = 0;
  let tier: Tier | null = null;
  if (s.cashbackMode === "marginal") {
    for (const b of tiers) {
      const top = b.max === null ? base : Math.min(base, b.max);
      const slice = Math.max(0, top - b.min);
      if (slice > 0) {
        amount += (slice * b.percent) / 100;
        tier = b;
      }
    }
    percent = base > 0 ? Math.round((amount / base) * 10000) / 100 : 0;
  } else {
    tier = tiers.find((b) => base >= b.min && (b.max === null || base < b.max)) ?? tiers[tiers.length - 1];
    percent = tier.percent;
    amount = (base * percent) / 100;
  }
  const cap = Number(s.cashbackMaxAmount) || 0;
  if (cap > 0) amount = Math.min(amount, cap);
  return { percent, amount: Math.round(amount * 100) / 100, tier };
}

export function CashbackPanel() {
  const [settings, setSettings] = useState<CashbackSettings | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "earn" | "reversal">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sim, setSim] = useState(1_500_000);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, o] = await Promise.all([
        api.get<CashbackSettings>("/api/commerce/admin/settings"),
        api.get<Overview>("/api/commerce/admin/cashback"),
      ]);
      setSettings({
        cashbackEnabled: s.cashbackEnabled,
        cashbackMode: s.cashbackMode,
        cashbackBase: s.cashbackBase,
        cashbackTiers: s.cashbackTiers ?? [],
        cashbackMaxAmount: s.cashbackMaxAmount,
        cashbackCreditTiming: s.cashbackCreditTiming,
        cashbackHoldDays: s.cashbackHoldDays,
        cashbackExpiryMonths: s.cashbackExpiryMonths,
        cashbackRedeemEnabled: s.cashbackRedeemEnabled,
        cashbackRedeemMaxPercent: s.cashbackRedeemMaxPercent,
        cashbackCombineWithDiscounts: s.cashbackCombineWithDiscounts,
      });
      setOverview(o);
    } catch (err) {
      setError(err instanceof Error ? err.message : "خواندن تنظیمات کشبک ناموفق بود.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = (values: Partial<CashbackSettings>) => {
    setSettings((cur) => (cur ? { ...cur, ...values } : cur));
    setMessage(null);
  };

  const save = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      /* brackets are sent open-ended (max: null): the server closes the gaps from
         the sorted starts, so editing a start can never leave an uncovered band */
      await api.put("/api/commerce/admin/settings", {
        ...settings,
        cashbackTiers: [...settings.cashbackTiers]
          .sort((a, b) => a.min - b.min)
          .map((t) => ({ min: t.min, max: null, percent: t.percent })),
      });
      setMessage({ ok: true, text: "قاعدهٔ کشبک ذخیره شد و از همین لحظه روی تسویه‌حساب‌های بعدی اعمال می‌شود." });
      await load();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "ذخیره ناموفق بود." });
    } finally {
      setBusy(false);
    }
  };

  /** the ladder is edited as "from this amount up ⇒ this percent" */
  const ladder = useMemo(() => {
    if (!settings) return [];
    return [...settings.cashbackTiers].sort((a, b) => a.min - b.min);
  }, [settings]);

  const ladderError = useMemo(() => {
    if (!ladder.length) return "حداقل یک پله لازم است.";
    if (ladder[0].min !== 0) return "پلهٔ اول باید از صفر شروع شود.";
    for (let i = 1; i < ladder.length; i += 1) {
      if (ladder[i].min <= ladder[i - 1].min) return "شروع هر پله باید از پلهٔ قبلی بزرگ‌تر باشد.";
    }
    if (ladder.some((t) => t.percent <= 0 || t.percent > 30)) return "درصد هر پله باید بین ۰ و ۳۰ باشد.";
    return null;
  }, [ladder]);

  const setTier = (index: number, values: Partial<Tier>) => {
    if (!settings) return;
    const next = ladder.map((t, i) => (i === index ? { ...t, ...values } : t));
    patch({ cashbackTiers: next });
  };

  const rows = useMemo(() => {
    const entries = overview?.entries ?? [];
    const needle = q.trim();
    return entries
      .filter((e) => (kind === "all" ? true : e.kind === kind))
      .filter((e) => !needle || `${e.email ?? ""} ${e.orderId ?? ""}`.includes(needle));
  }, [overview, q, kind]);

  const pickedHere = rows.filter((e) => picked.has(e.id)).length;
  const allHerePicked = rows.length > 0 && pickedHere === rows.length;
  const toggleAll = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (allHerePicked) rows.forEach((e) => next.delete(e.id));
      else rows.forEach((e) => next.add(e.id));
      return next;
    });

  const exportCsv = () => {
    const chosen = picked.size > 0 ? rows.filter((e) => picked.has(e.id)) : rows;
    const header = ["شناسه", "تاریخ", "مشتری", "سفارش", "نوع", "مبلغ پایه", "درصد", "مبلغ کشبک"];
    const body = chosen.map((e) => [
      e.id,
      new Date(e.at).toLocaleString("fa-IR"),
      e.email ?? "",
      e.orderId ?? "",
      e.kind === "earn" ? "کسب" : "برگشت",
      unitsToToman(e.baseAmount),
      e.percent,
      unitsToToman(e.amount),
    ]);
    const csv = [header, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cashback-ledger.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error && !settings) {
    return (
      <>
        <PanelHead title="کشبک" sub="قاعدهٔ کشبک از سرور خوانده می‌شود." />
        <p className="ad-banner is-warn" role="alert">
          {error} — کشبک بدون سرعت اینترنت نیست: قاعده در پایگاه داده است و تا وقتی سرور پاسخ ندهد
          ویرایش نمی‌شود. دوباره تلاش کن.
        </p>
        <button type="button" className="ad-btn is-sm" onClick={() => void load()}>
          <RefreshCw width={13} height={13} /> تلاش دوباره
        </button>
      </>
    );
  }

  if (!settings) {
    return <p className="ad-hint" aria-busy="true">در حال خواندن قاعدهٔ کشبک…</p>;
  }

  const simResult = cashbackFor(tomanToUnits(sim), settings);
  const capToman = unitsToToman(settings.cashbackMaxAmount);

  return (
    <>
      <PanelHead
        title="کشبک"
        sub="کشبک پلکانی است: هرچه سبد بزرگ‌تر، درصد بیشتر. اینجا همان قاعده‌ای است که سرور در تسویه‌حساب اجرا می‌کند."
        action={
          <div className="ad-actions">
            <button type="button" className="ad-btn is-sm" onClick={() => void load()} disabled={busy}>
              <RefreshCw width={13} height={13} /> بازخوانی
            </button>
            <button type="button" className="ad-btn is-sm is-primary" onClick={() => void save()} disabled={busy || !!ladderError}>
              <Save width={13} height={13} /> {busy ? "در حال ذخیره…" : "ذخیرهٔ قاعده"}
            </button>
          </div>
        }
      />

      {message && (
        <p className={cn("ad-banner", message.ok ? "is-ok" : "is-warn")} role="status">
          {message.text}
        </p>
      )}
      {ladderError && (
        <p className="ad-banner is-warn" role="alert">
          <AlertTriangle width={13} height={13} /> {ladderError} تا این خطا برطرف نشود، ذخیره غیرفعال است.
        </p>
      )}

      <div className="ad-report-kpis">
        <div className="ad-report-kpi">
          <b>{fa(overview?.accounts ?? 0)}</b>
          <span>کیف پول کشبک</span>
          <small>مشتری با حداقل یک ردیف در دفتر کل</small>
        </div>
        <div className="ad-report-kpi">
          <b>{formatPrice(overview?.earned ?? 0)}</b>
          <span>کشبک کسب‌شده</span>
          <small>{fa(overview?.orders ?? 0)} سفارش پرداخت‌شده</small>
        </div>
        <div className="ad-report-kpi">
          <b>{formatPrice(Math.abs(overview?.reversed ?? 0))}</b>
          <span>برگشت‌خورده</span>
          <small>بابت مرجوعی و لغو</small>
        </div>
        <div className="ad-report-kpi">
          <b>{formatPrice(overview?.balance ?? 0)}</b>
          <span>ماندهٔ قابل خرج</span>
          <small>
            {settings.cashbackEnabled
              ? `فعال · حداکثر ${formatNumber(settings.cashbackRedeemMaxPercent)}٪ هر سفارش`
              : "کلید کشبک خاموش است"}
          </small>
        </div>
      </div>

      <Panel
        title="پله‌های کشبک"
        action={
          <label className="ad-check">
            <input
              type="checkbox"
              className="ad-checkbox"
              checked={settings.cashbackEnabled}
              onChange={(e) => patch({ cashbackEnabled: e.target.checked })}
            />
            کشبک فعال است
          </label>
        }
      >
        <p className="ad-hint" style={{ marginTop: 0 }}>
          «از این مبلغ به بالا» را در تومان بنویس؛ درصد کل سبد بر اساس پله‌ای که سبد در آن می‌افتد
          تعیین می‌شود. پلهٔ آخر باز است و سقفی ندارد. یک واحد قیمت در فروشگاه معادل{" "}
          <b>{formatNumber(tomanRate())} تومان</b> است، پس مبالغ اینجا درست همان چیزی است که مشتری
          در صفحهٔ محصول می‌بیند.
        </p>

        <div className="ad-ladder" role="group" aria-label="پله‌های کشبک">
          {ladder.map((tier, i) => (
            <div key={i} className="ad-ladder-row">
              <label className="ad-field">
                از مبلغ (تومان)
                <input
                  className="ad-input"
                  type="number"
                  min={0}
                  step={100000}
                  value={unitsToToman(tier.min)}
                  onChange={(e) => setTier(i, { min: tomanToUnits(Number(e.target.value) || 0) })}
                />
              </label>
              <label className="ad-field">
                درصد
                <input
                  className="ad-input"
                  type="number"
                  min={0}
                  max={30}
                  step={0.5}
                  value={tier.percent}
                  onChange={(e) => setTier(i, { percent: Number(e.target.value) || 0 })}
                />
              </label>
              <span className="ad-ladder-note">
                {i === ladder.length - 1 ? "تا بی‌نهایت" : `تا ${formatNumber(unitsToToman(ladder[i + 1].min))} تومان`}
              </span>
              <button
                type="button"
                className="ad-icon is-danger"
                aria-label="حذف پله"
                disabled={ladder.length <= 1}
                onClick={() => patch({ cashbackTiers: ladder.filter((_, idx) => idx !== i) })}
              >
                <Trash2 width={14} height={14} />
              </button>
            </div>
          ))}
        </div>

        <div className="ad-actions" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="ad-btn is-sm"
            onClick={() => {
              const lastMin = ladder.at(-1)?.min ?? 0;
              const step = Math.max(1, Math.round(1_000_000 / Math.max(1, tomanRate())));
              patch({ cashbackTiers: [...ladder, { min: Math.max(lastMin + step, 1), max: null, percent: 1 }] });
            }}
          >
            <Plus width={13} height={13} /> پلهٔ تازه
          </button>
          <button
            type="button"
            className="ad-btn is-sm"
            onClick={() =>
              patch({
                cashbackTiers: OWNER_LADDER.map((t) => ({
                  min: tomanToUnits(t.toman),
                  max: null,
                  percent: t.percent,
                })),
              })
            }
          >
            پله‌های پیشنهادی (۱ م ⇒ ۳٪، ۲ م ⇒ ۵٪)
          </button>
        </div>

        <div className="ad-ladder-preview" aria-label="پیش‌نمایش پله‌ها">
          {[500_000, 1_200_000, 2_500_000, 5_000_000].map((toman) => {
            const r = cashbackFor(tomanToUnits(toman), settings);
            return (
              <div key={toman}>
                <span>سبد {formatNumber(toman)} تومان</span>
                <b>
                  {formatNumber(r.percent)}٪ ≈ {formatPrice(r.amount)}
                </b>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="ad-grid-2">
        <Panel title="روش محاسبه و سقف">
          <label className="ad-field">
            روش محاسبه
            <select
              className="ad-select"
              value={settings.cashbackMode}
              onChange={(e) => patch({ cashbackMode: e.target.value as CashbackSettings["cashbackMode"] })}
            >
              <option value="tier_rate">نرخ پله‌ای روی کل سبد</option>
              <option value="marginal">پله‌ای تدریجی (هر بخش با نرخ خودش)</option>
            </select>
          </label>
          <p className="ad-hint">{MODE_HINT[settings.cashbackMode]}</p>

          <label className="ad-field">
            مبنای محاسبه
            <select
              className="ad-select"
              value={settings.cashbackBase}
              onChange={(e) => patch({ cashbackBase: e.target.value as CashbackSettings["cashbackBase"] })}
            >
              <option value="merchandise">{BASE_LABEL.merchandise}</option>
              <option value="grand_total">{BASE_LABEL.grand_total}</option>
            </select>
          </label>

          <label className="ad-field">
            سقف کشبک هر سفارش (تومان)
            <input
              className="ad-input"
              type="number"
              min={0}
              step={50000}
              value={capToman}
              onChange={(e) => patch({ cashbackMaxAmount: tomanToUnits(Number(e.target.value) || 0) })}
            />
          </label>
          <p className="ad-hint">
            سقف جلوی پول‌پاشیِ یک پلهٔ اشتباه را می‌گیرد. صفر یعنی بدون سقف.
          </p>
        </Panel>

        <Panel title="سیاست پرداخت و خرج">
          <label className="ad-field">
            چه زمانی به کیف پول می‌نشیند
            <select
              className="ad-select"
              value={settings.cashbackCreditTiming}
              onChange={(e) => patch({ cashbackCreditTiming: e.target.value as CashbackSettings["cashbackCreditTiming"] })}
            >
              {(Object.keys(TIMING_LABEL) as CashbackSettings["cashbackCreditTiming"][]).map((k) => (
                <option key={k} value={k}>{TIMING_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <div className="ad-two">
            <label className="ad-field">
              مهلت نگه‌داری (روز)
              <input
                className="ad-input"
                type="number"
                min={0}
                value={settings.cashbackHoldDays}
                onChange={(e) => patch({ cashbackHoldDays: Number(e.target.value) || 0 })}
              />
            </label>
            <label className="ad-field">
              انقضا (ماه)
              <input
                className="ad-input"
                type="number"
                min={0}
                value={settings.cashbackExpiryMonths}
                onChange={(e) => patch({ cashbackExpiryMonths: Number(e.target.value) || 0 })}
              />
            </label>
          </div>
          <label className="ad-check">
            <input
              type="checkbox"
              className="ad-checkbox"
              checked={settings.cashbackRedeemEnabled}
              onChange={(e) => patch({ cashbackRedeemEnabled: e.target.checked })}
            />
            مشتری می‌تواند کشبک را خرج کند
          </label>
          <label className="ad-field" style={{ marginTop: 10 }}>
            حداکثر سهم کشبک از هر سفارش (٪)
            <input
              className="ad-input"
              type="number"
              min={0}
              max={100}
              value={settings.cashbackRedeemMaxPercent}
              onChange={(e) => patch({ cashbackRedeemMaxPercent: Number(e.target.value) || 0 })}
            />
          </label>
          <label className="ad-check">
            <input
              type="checkbox"
              className="ad-checkbox"
              checked={settings.cashbackCombineWithDiscounts}
              onChange={(e) => patch({ cashbackCombineWithDiscounts: e.target.checked })}
            />
            با کد تخفیف و جشنواره هم‌زمان جمع شود
          </label>
          <p className="ad-hint" style={{ marginTop: 10 }}>
            کشبک هیچ‌وقت روی سفارشی خرج می‌شود که آن را ساخته نیست؛ فقط سفارش بعدی.
          </p>
        </Panel>
      </div>

      <Panel title="شبیه‌ساز">
        <div className="ad-toolbar" style={{ padding: 0, border: 0, background: "transparent" }}>
          <label className="ad-field" style={{ marginBottom: 0, flex: 1 }}>
            مبلغ سبد (تومان)
            <input
              className="ad-input"
              type="number"
              min={0}
              step={100000}
              value={sim}
              onChange={(e) => setSim(Number(e.target.value) || 0)}
            />
          </label>
          <div className="ad-stat">
            <b>{formatPrice(simResult.amount)}</b>
            <span>کشبک این سبد ({formatNumber(simResult.percent)}٪)</span>
            <small>
              {simResult.amount >= settings.cashbackMaxAmount && settings.cashbackMaxAmount > 0
                ? "به سقف خورده است"
                : settings.cashbackEnabled
                  ? "با قاعدهٔ فعلی"
                  : "کلید کشبک خاموش است: پرداختی انجام نمی‌شود"}
            </small>
          </div>
        </div>
        <p className="ad-hint" style={{ marginBottom: 0 }}>
          این محاسبه با همان قاعدهٔ سرور انجام می‌شود، ولی عدد قطعی را سرور در پیش‌فاکتور تسویه‌حساب
          اعلام می‌کند (تخفیف‌ها و ارسال هم روی مبنا اثر دارند).
        </p>
      </Panel>

      <Panel
        title="دفتر کل کشبک"
        action={
          <div className="ad-actions">
            <button type="button" className="ad-btn is-sm" onClick={exportCsv} disabled={rows.length === 0}>
              <Download width={13} height={13} /> خروجی CSV {picked.size > 0 ? `(${fa(picked.size)})` : ""}
            </button>
          </div>
        }
      >
        <div className="ad-toolbar">
          <input
            className="ad-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ایمیل یا شناسهٔ سفارش…"
            aria-label="جست‌وجوی دفتر کل کشبک"
          />
          <label className="ad-select-all">
            <input
              type="checkbox"
              className="ad-checkbox"
              checked={allHerePicked}
              ref={(el) => {
                if (el) el.indeterminate = !allHerePicked && pickedHere > 0;
              }}
              onChange={toggleAll}
              aria-label="انتخاب همهٔ ردیف‌های دفتر کل"
            />
            همه ({fa(rows.length)})
          </label>
          {picked.size > 0 && (
            <button type="button" className="ad-btn is-sm" onClick={() => setPicked(new Set())}>
              لغو انتخاب
            </button>
          )}
        </div>
        <div className="ad-filters">
          {([["all", "همه"], ["earn", "کسب"], ["reversal", "برگشت"]] as const).map(([k, label]) => (
            <button key={k} type="button" className={cn("ad-chip", kind === k && "is-on")} onClick={() => setKind(k)}>
              {label}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="ad-empty">
            {overview?.entries.length
              ? "با این فیلتر ردیفی نیست."
              : "هنوز کشبکی ثبت نشده. اولین سفارش پرداخت‌شده که در یک پله بیفتد، اینجا ردیف می‌سازد."}
          </p>
        ) : (
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th className="ad-check-cell">
                    <span className="ad-sr">انتخاب همه</span>
                    <input
                      type="checkbox"
                      className="ad-checkbox"
                      checked={allHerePicked}
                      ref={(el) => {
                        if (el) el.indeterminate = !allHerePicked && pickedHere > 0;
                      }}
                      onChange={toggleAll}
                      aria-label="انتخاب همه"
                    />
                  </th>
                  <th>زمان</th>
                  <th>مشتری</th>
                  <th>سفارش</th>
                  <th>نوع</th>
                  <th className="ad-money">مبنا</th>
                  <th>درصد</th>
                  <th className="ad-money">مبلغ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <input
                        type="checkbox"
                        className="ad-checkbox"
                        checked={picked.has(e.id)}
                        onChange={() =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            if (next.has(e.id)) next.delete(e.id);
                            else next.add(e.id);
                            return next;
                          })
                        }
                        aria-label={`انتخاب ردیف ${e.id}`}
                      />
                    </td>
                    <td>{new Date(e.at).toLocaleString("fa-IR")}</td>
                    <td dir="ltr">{e.email ?? "—"}</td>
                    <td dir="ltr">{e.orderId ?? "—"}</td>
                    <td>
                      <span className={cn("ad-pill", e.kind === "earn" ? "is-done" : "is-danger")}>
                        {e.kind === "earn" ? "کسب" : "برگشت"}
                      </span>
                    </td>
                    <td className="ad-money">{formatPrice(e.baseAmount)}</td>
                    <td>{formatNumber(e.percent)}٪</td>
                    <td className="ad-money">{formatPrice(Math.abs(e.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ad-hint" style={{ marginBottom: 0, marginTop: 10 }}>
          <Wallet width={12} height={12} /> دفتر کل قابل ویرایش نیست: پول کشبک فقط با سفارش، مرجوعی یا
          لغو جابه‌جا می‌شود تا هیچ ردیفی دستی عوض نشود. واحد نمایش {CURRENCY.main} است.
        </p>
      </Panel>
    </>
  );
}
