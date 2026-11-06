import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, LayoutGrid, Plus, Search, Trash2 } from "lucide-react";
import { addWidget, moveWidget, removeFaq, removeWidget, saveFaq, toggleWidget, updateWidget, useOps } from "@/state/ops";
import { LOOKS } from "@/data/looks";
import { WIDGETS, widgetDef } from "@/widgets/registry";
import { ZONE_LABEL, type WidgetInstance, type WidgetZone } from "@/widgets/types";

/* =====================================================================
   Widget manager (decision 75).

   Two halves: what is installed (grouped by the zone it renders in, with its
   order and options) and the catalogue (every widget this build actually
   has). Nothing is installed by default — a fresh shop stays exactly as the
   owner designed it until a widget is added here.
   ===================================================================== */

const GROUPS = [...new Set(WIDGETS.map((w) => w.group))];
const ZONES = Object.keys(ZONE_LABEL) as WidgetZone[];

function Head({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
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

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
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

/** the starting set the panel offers, so the first install is not a blank page */
const STARTER: { kind: string; zone: WidgetZone }[] = [
  { kind: "usp-bar", zone: "home-top" },
  { kind: "new-arrivals", zone: "home-middle" },
  { kind: "category-tiles", zone: "home-middle" },
  { kind: "journal-latest", zone: "home-middle" },
];

function InstalledRow({ instance }: { instance: WidgetInstance }) {
  const def = widgetDef(instance.kind);
  const ops = useOps();
  // options whose choices live in the shop's own documents (categories, looks)
  const choicesFor = (source?: "categories" | "looks", fixed?: { value: string; label: string }[]) => {
    if (fixed?.length) return fixed;
    if (source === "categories") {
      return ops.categories.filter((c) => c.active).map((c) => ({ value: c.slug, label: c.name }));
    }
    if (source === "looks") return LOOKS.map((l) => ({ value: l.id, label: l.name }));
    return [];
  };
  const [open, setOpen] = useState(false);
  if (!def) return null;
  const setOption = (key: string, value: string | number | boolean) =>
    updateWidget(instance.id, { options: { ...instance.options, [key]: value } });

  return (
    <div className="ad-widget-row">
      <div className="ad-widget-row-head">
        <span className="ad-widget-name">
          {def.name}
          {!instance.active && <em className="ad-hint"> — خاموش</em>}
        </span>
        <div className="ad-actions">
          <button type="button" className="ad-btn is-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "بستن تنظیمات" : "تنظیمات"}
          </button>
          <button
            type="button"
            className="ad-icon"
            aria-label={instance.active ? "خاموش کردن ویجت" : "روشن کردن ویجت"}
            title={instance.active ? "خاموش کردن" : "روشن کردن"}
            onClick={() => toggleWidget(instance.id)}
          >
            {instance.active ? <Eye width={13} height={13} /> : <EyeOff width={13} height={13} />}
          </button>
          <button type="button" className="ad-icon" aria-label="بالا بردن ترتیب" onClick={() => moveWidget(instance.id, -1)}>
            <ArrowUp width={13} height={13} />
          </button>
          <button type="button" className="ad-icon" aria-label="پایین آوردن ترتیب" onClick={() => moveWidget(instance.id, 1)}>
            <ArrowDown width={13} height={13} />
          </button>
          <button type="button" className="ad-icon is-danger" aria-label="حذف ویجت" onClick={() => removeWidget(instance.id)}>
            <Trash2 width={13} height={13} />
          </button>
        </div>
      </div>

      {open && (
        <div className="ad-widget-settings">
          <label className="ad-field">
            عنوان دلخواه {def.defaultTitle ? `(خالی = «${def.defaultTitle}»)` : "(اختیاری)"}
            <input
              className="ad-input"
              value={instance.title}
              placeholder={def.defaultTitle || "بدون عنوان"}
              onChange={(e) => updateWidget(instance.id, { title: e.target.value })}
            />
          </label>
          <label className="ad-field">
            جای نمایش
            <select
              className="ad-select"
              value={instance.zone}
              onChange={(e) => updateWidget(instance.id, { zone: e.target.value as WidgetZone })}
            >
              {def.zones.map((zone) => (
                <option key={zone} value={zone}>
                  {ZONE_LABEL[zone]}
                </option>
              ))}
            </select>
          </label>
          {def.options?.map((option) => (
            <label key={option.key} className="ad-field">
              {option.label}
              {option.type === "number" ? (
                <input
                  className="ad-input"
                  type="number"
                  min={1}
                  max={12}
                  value={Number(instance.options[option.key] ?? option.default)}
                  onChange={(e) => setOption(option.key, Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                />
              ) : option.type === "toggle" ? (
                <input
                  type="checkbox"
                  checked={Boolean(instance.options[option.key] ?? option.default)}
                  onChange={(e) => setOption(option.key, e.target.checked)}
                />
              ) : option.type === "select" ? (
                <select
                  className="ad-select"
                  value={String(instance.options[option.key] ?? option.default)}
                  onChange={(e) => setOption(option.key, e.target.value)}
                >
                  {choicesFor(option.choicesSource, option.choices).map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="ad-input"
                  value={String(instance.options[option.key] ?? option.default)}
                  onChange={(e) => setOption(option.key, e.target.value)}
                />
              )}
            </label>
          ))}
          <p className="ad-hint">{def.blurb}</p>
        </div>
      )}
    </div>
  );
}

export function WidgetsPanel() {
  const ops = useOps();
  const installed = ops.widgets ?? [];
  const faqs = ops.faqs ?? [];
  const [newsletter, setNewsletter] = useState<{ total: number; recent: { email: string; created_at: string }[] } | null>(null);
  const [newsletterError, setNewsletterError] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { api } = await import("@/lib/api");
        const res = await api.get<{ total: number; recent: { email: string; created_at: string }[] }>("/api/admin/newsletter");
        if (alive) setNewsletter(res);
      } catch {
        if (alive) setNewsletterError("فهرست مشترکان خوانده نشد؛ دسترسی «مشتریان» یا اتصال سرور را بررسی کن.");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("همه");
  const [zone, setZone] = useState<WidgetZone>("home-middle");

  const catalogue = useMemo(
    () =>
      WIDGETS.filter((w) => (group === "همه" ? true : w.group === group)).filter((w) =>
        query.trim() ? `${w.name} ${w.blurb} ${w.group}`.includes(query.trim()) : true,
      ),
    [group, query],
  );

  const countByZone = (z: WidgetZone) => installed.filter((w) => w.zone === z).length;

  return (
    <>
      <Head
        title="ویجت‌ها"
        sub={`${WIDGETS.length.toLocaleString("fa-IR")} ویجت در این نسخه · ${installed.length.toLocaleString("fa-IR")} نصب‌شده. هر ویجت فقط از دادهٔ واقعی فروشگاه می‌خواند؛ اگر داده‌اش نباشد، در فروشگاه دیده نمی‌شود.`}
        action={
          <button
            type="button"
            className="ad-btn is-sm"
            onClick={() => STARTER.forEach((item) => addWidget(item.kind, item.zone))}
            disabled={STARTER.every((item) => installed.some((w) => w.kind === item.kind))}
          >
            <Plus width={13} height={13} /> نصب پیشنهادی
          </button>
        }
      />

      <Card title="نصب‌شده" action={<span className="ad-hint">{installed.length ? "ترتیب، جایش را در فروشگاه تعیین می‌کند" : "خالی"}</span>}>
        {installed.length === 0 ? (
          <p className="ad-hint" style={{ margin: 0 }}>
            هیچ ویجتی نصب نشده؛ فروشگاه دقیقاً همان چیزی است که در «ظاهر سایت» چیده‌ای. از فهرست پایین یکی را اضافه کن
            یا «نصب پیشنهادی» را بزن.
          </p>
        ) : (
          ZONES.filter((z) => countByZone(z) > 0).map((z) => (
            <div key={z} className="ad-widget-zone">
              <p className="ad-field-label">
                {ZONE_LABEL[z]} <span className="ad-hint">— {countByZone(z).toLocaleString("fa-IR")} ویجت</span>
              </p>
              {installed.filter((w) => w.zone === z).map((w) => (
                <InstalledRow key={w.id} instance={w} />
              ))}
            </div>
          ))
        )}
      </Card>

      <Card
        title="فهرست ویجت‌ها"
        action={
          <div className="ad-inline" style={{ gap: 8 }}>
            <label className="ad-inline" style={{ gap: 6 }}>
              <Search width={13} height={13} />
              <input
                className="ad-input"
                style={{ maxWidth: 180 }}
                placeholder="جست‌وجو…"
                aria-label="جست‌وجوی ویجت"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select className="ad-select" style={{ maxWidth: 140 }} aria-label="دستهٔ ویجت" value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="همه">همه</option>
              {GROUPS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <div className="ad-inline" style={{ gap: 8, marginBottom: 10 }}>
          <span className="ad-hint">افزودن به:</span>
          <select className="ad-select" style={{ maxWidth: 240 }} aria-label="جای پیش‌فرض ویجت تازه" value={zone} onChange={(e) => setZone(e.target.value as WidgetZone)}>
            {ZONES.map((z) => (
              <option key={z} value={z}>
                {ZONE_LABEL[z]}
              </option>
            ))}
          </select>
        </div>

        {catalogue.length === 0 ? (
          <p className="ad-hint" style={{ margin: 0 }}>ویجتی با این فیلتر پیدا نشد.</p>
        ) : (
          <div className="ad-widget-catalogue">
            {catalogue.map((def) => {
              const already = installed.filter((w) => w.kind === def.kind).length;
              const targets = def.zones.includes(zone) ? zone : def.zones[0];
              const added = installed.some((w) => w.kind === def.kind && w.zone === targets);
              return (
                <article key={def.kind} className="ad-widget-card">
                  <div>
                    <h4>
                      {def.name}
                      {def.needsData && <em className="ad-hint"> · داده‌محور</em>}
                    </h4>
                    <p>{def.blurb}</p>
                    <p className="ad-hint">
                      {def.zones.map((z) => ZONE_LABEL[z].split("—")[0].trim()).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}
                      {already > 0 ? ` · ${already.toLocaleString("fa-IR")} بار نصب شده` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="ad-btn is-sm"
                    disabled={added}
                    title={added ? "در این جای صفحه همین حالا هست" : undefined}
                    onClick={() => addWidget(def.kind, targets)}
                  >
                    {added ? <Check width={13} height={13} /> : <Plus width={13} height={13} />}
                    {added ? "نصب است" : "افزودن"}
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="پرسش‌های متداول (برای ویجت «پرسش‌های متداول»)" action={<span className="ad-hint">{faqs.length.toLocaleString("fa-IR")} پرسش</span>}>
        {faqs.length === 0 && <p className="ad-hint" style={{ margin: 0 }}>هنوز پرسشی نوشته نشده؛ ویجت تا آن موقع در فروشگاه دیده نمی‌شود.</p>}
        {faqs.map((faq) => (
          <div key={faq.id} className="ad-widget-row">
            <label className="ad-field">
              پرسش
              <input className="ad-input" value={faq.q} onChange={(e) => saveFaq({ ...faq, q: e.target.value })} />
            </label>
            <label className="ad-field" style={{ marginTop: 8 }}>
              پاسخ
              <textarea className="ad-input" rows={2} value={faq.a} onChange={(e) => saveFaq({ ...faq, a: e.target.value })} />
            </label>
            <div className="ad-actions" style={{ marginTop: 8 }}>
              <button type="button" className="ad-btn is-sm is-danger" onClick={() => removeFaq(faq.id)}>
                <Trash2 width={13} height={13} /> حذف پرسش
              </button>
            </div>
          </div>
        ))}
        <div className="ad-actions" style={{ marginTop: 10 }}>
          <button
            type="button"
            className="ad-btn is-sm"
            onClick={() => saveFaq({ id: `faq-${Date.now().toString(36)}`, q: "", a: "" })}
          >
            <Plus width={13} height={13} /> پرسش تازه
          </button>
        </div>
      </Card>

      <Card title="مشترکان خبرنامه" action={<span className="ad-hint">{newsletter ? `${newsletter.total.toLocaleString("fa-IR")} نفر` : "—"}</span>}>
        {newsletterError && <p className="ad-hint is-warn">{newsletterError}</p>}
        {!newsletter && !newsletterError && <p className="ad-hint" style={{ margin: 0 }}>در حال خواندن…</p>}
        {newsletter && newsletter.total === 0 && (
          <p className="ad-hint" style={{ margin: 0 }}>هنوز کسی عضو نشده. ویجت «خبرنامه» هر ثبت را واقعاً در سرور ذخیره می‌کند.</p>
        )}
        {newsletter && newsletter.recent.length > 0 && (
          <ul className="ad-mini-list">
            {newsletter.recent.map((row) => (
              <li key={row.email}>
                <span dir="ltr">{row.email}</span>
                <b>{new Date(row.created_at).toLocaleDateString("fa-IR")}</b>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="قاعده‌ها" action={<LayoutGrid width={14} height={14} />}>
        <ul className="ad-hint" style={{ margin: 0, paddingInlineStart: 18, lineHeight: 2 }}>
          <li>ویجت خاموش می‌ماند ولی حذف نمی‌شود؛ تنظیماتش هم می‌ماند.</li>
          <li>ویجتی که داده ندارد (مثلاً پرفروش‌ها در فروشگاه تازه) خودش را نشان نمی‌دهد؛ ردیف خالی و محتوای نمایشی ساخته نمی‌شود.</li>
          <li>ویجت‌های «داده‌محور» با فروش و نظر واقعی پر می‌شوند؛ تا آن موقع فروشگاه فقط ویجت‌های پرشده را نشان می‌دهد.</li>
          <li>تغییرها فوراً در فروشگاه دیده می‌شوند؛ برای دیدنشان صفحهٔ اصلی را باز کن.</li>
        </ul>
      </Card>
    </>
  );
}
