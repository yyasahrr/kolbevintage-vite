import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BookOpen,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  LifeBuoy,
  Mail,
  Rocket,
  ScrollText,
  Search,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { timeAgo } from "@/builder/util";
import { addIssue, addLog, resolveIssue, setDeveloperEmail, setSetup, signLaunchCheck, useOps, type IssueReport } from "@/state/ops";
import { useAdmin } from "@/state/admin";
import { useAdminMe } from "@/state/session";
import { CHANGELOG } from "@/data/changelog";
import { MANUAL } from "@/data/manual";

const fa = (n: number) => n.toLocaleString("fa-IR");

/* ------------------------------------------------------------------ */
/* shared bits                                                         */
/* ------------------------------------------------------------------ */

function LHead({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <header className="ad-head">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {actions}
    </header>
  );
}

function LCard({ title, icon, children, action }: { title: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="ad-card">
      <header className="ad-card-head">
        <h3 className="inline-flex items-center gap-2">{icon}{title}</h3>
        {action}
      </header>
      <div className="ad-card-body">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 1. first-run wizard — five steps, resumable (decision 93)           */
/* ------------------------------------------------------------------ */

const WIZARD_STEPS = [
  { id: "brand", title: "نام و هویت", body: "نام، شعار و لوگوی فروشگاه؛ همین‌ها در هدر، عنوان صفحه و فاکتور می‌آیند." },
  { id: "theme", title: "ظاهر", body: "یک تم برای کل فروشگاه انتخاب کن؛ بازدیدکننده کلید تغییر ظاهر ندارد." },
  { id: "catalog", title: "دسته‌ها و اولین محصول", body: "دسته‌ها و ست سایز را بساز، بعد اولین محصول واقعی را ثبت کن." },
  { id: "money", title: "ارسال و پرداخت", body: "هزینه و آستانهٔ ارسال رایگان، مهلت مرجوعی و درگاه پرداخت را مشخص کن." },
  { id: "safety", title: "پشتیبان و بازیابی", body: "یک پشتیبان بگیر و بازیابی را یک‌بار آزمون کن؛ بدون آزمون، پشتیبان حساب نمی‌شود." },
];

export function SetupWizard({ onJump }: { onJump: (target: string) => void }) {
  const ops = useOps();
  const setup = ops.setup ?? { done: false, step: 0 };
  const [open, setOpen] = useState(!setup.done);
  const [step, setStep] = useState(Math.min(setup.step, WIZARD_STEPS.length - 1));
  const current = WIZARD_STEPS[step];

  useEffect(() => {
    if (setup.done) setOpen(false);
  }, [setup.done]);

  if (!open || setup.done) return null;

  const jump: Record<string, string> = { brand: "brand", theme: "appearance", catalog: "products", money: "settings", safety: "backup" };

  return (
    <div className="ad-wizard-backdrop" role="dialog" aria-modal="true" aria-label="راه‌اندازی اولیه">
      <div className="ad-wizard">
        <header>
          <div>
            <p className="ad-eyebrow">مرحلهٔ {fa(step + 1)} از {fa(WIZARD_STEPS.length)}</p>
            <h2>{current.title}</h2>
            <p>{current.body}</p>
          </div>
          <button type="button" className="ad-icon" aria-label="بستن ویزارد" onClick={() => setOpen(false)}>
            <X width={15} height={15} />
          </button>
        </header>

        <ol className="ad-wizard-steps">
          {WIZARD_STEPS.map((s, i) => (
            <li key={s.id} className={cn(i === step && "is-on", i < step && "is-done")}>
              <span>{i < step ? <Check width={12} height={12} /> : fa(i + 1)}</span>
              {s.title}
            </li>
          ))}
        </ol>

        <footer>
          <button
            type="button"
            className="ad-btn is-sm"
            onClick={() => {
              setSetup({ step });
              onJump(jump[current.id]);
            }}
          >
            باز کردن این بخش
          </button>
          <div className="ad-actions">
            <button type="button" className="ad-btn is-sm" onClick={() => { setSetup({ done: true }); setOpen(false); }}>
              رد کردن ویزارد
            </button>
            {step > 0 && (
              <button type="button" className="ad-btn is-sm" onClick={() => { const s = step - 1; setStep(s); setSetup({ step: s }); }}>
                قبلی
              </button>
            )}
            {step < WIZARD_STEPS.length - 1 ? (
              <button type="button" className="ad-btn is-primary is-sm" onClick={() => { const s = step + 1; setStep(s); setSetup({ step: s }); }}>
                بعدی
              </button>
            ) : (
              <button type="button" className="ad-btn is-primary is-sm" onClick={() => { setSetup({ done: true, step }); setOpen(false); }}>
                <CheckCircle2 width={13} height={13} /> پایان راه‌اندازی
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 2. launch checklist (decision 91)                                   */
/* ------------------------------------------------------------------ */

type CheckState = { status: "ok" | "fail" | "manual"; text: string };

export function LaunchChecklist() {
  const ops = useOps();
  const admin = useAdmin();
  const session = useAdminMe();
  const [health, setHealth] = useState<{ database?: string; migrations?: string | number } | null>(null);
  const [backups, setBackups] = useState<{ name: string; at: string | number; bytes: number }[] | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { api } = await import("@/lib/api");
      try {
        const h = await api.get<{ database?: string }>("/api/health");
        if (alive) setHealth(h as { database?: string });
      } catch {
        if (alive) setHealth(null);
      }
      try {
        const b = await api.get<{ backups: { name: string; at: string | number; bytes: number }[] }>("/api/admin/backups");
        if (alive) setBackups(b.backups);
      } catch {
        if (alive) setBackups(null);
      }
    })();
    return () => { alive = false; };
  }, []);

  const delivered = admin.orders.some((o) => o.status === "done");
  const paidOrder = admin.orders.some((o) => o.status !== "pending" && o.status !== "cancelled");

  const checks: { id: string; title: string; detail: string; state: CheckState }[] = useMemo(
    () => [
      {
        id: "security",
        title: "امنیت",
        detail: health?.database
          ? "سرور پاسخ می‌دهد و پنل پشت نشست ادمین است؛ هر عمل پنل مجوز سرور دارد و در گزارش فعالیت می‌ماند."
          : "پاسخ سرور خوانده نشد — پیش از انتشار دستی بررسی کن.",
        state: { status: health?.database ? "ok" : "fail", text: health?.database ? "سرور پاسخ داد" : "بی‌پاسخ" } as CheckState,
      },
      {
        id: "backup",
        title: "پشتیبان آزمون‌شده",
        detail: backups === null
          ? "فهرست پشتیبان خوانده نشد؛ اجازهٔ پشتیبان را بررسی کن."
          : backups.length === 0
            ? "هیچ پشتیبانی گرفته نشده. از «پشتیبان‌گیری» یکی بگیر."
            : `${fa(backups.length)} پشتیبان موجود است؛ آخرین: ${timeAgo(Number(backups[0].at))}. آزمون بازیابی را خودت تأیید کن.`,
        state: backups && backups.length > 0 ? ({ status: "manual", text: "منتظر تأیید تو" } as CheckState) : ({ status: "fail", text: "پشتیبان نیست" } as CheckState),
      },
      {
        id: "purchase",
        title: "خرید کامل تا تحویل",
        detail: delivered
          ? "دست‌کم یک سفارش تا وضعیت «تحویل شد» رفته است."
          : paidOrder
            ? "سفارش پرداخت‌شده هست ولی هیچ سفارشی به «تحویل شد» نرسیده؛ آخرین سفارش را تا انتها ببر."
            : "هنوز سفارش واقعی ثبت نشده؛ یک خرید آزمایشی کامل انجام بده.",
        state: (delivered ? { status: "ok", text: "تحویل انجام شد" } : { status: "fail", text: "تحویل انجام نشده" }) as CheckState,
      },
      {
        id: "a11y",
        title: "دسترس‌پذیری و موبایل",
        detail: "پنل خودش این را نمی‌تواند از داخل مرورگر بسنجد؛ با گوشی یک دور کامل بزن (سبد → تسویه → پیگیری) و این مورد را امضا کن.",
        state: { status: "manual", text: "بررسی دستی" } as CheckState,
      },
    ],
    [health, backups, delivered, paidOrder],
  );

  const stateOf = (c: { id: string; state: CheckState }) => {
    const signed = ops.launchChecks[c.id];
    if (signed) return { tone: "ok" as const, label: `امضا شد — ${signed.by}` };
    if (c.state.status === "ok") return { tone: "ok" as const, label: c.state.text };
    if (c.state.status === "fail") return { tone: "fail" as const, label: c.state.text };
    return { tone: "manual" as const, label: "منتظر تأیید تو" };
  };

  const signedCount = checks.filter((c) => ops.launchChecks[c.id]).length;
  const ready = checks.every((c) => ops.launchChecks[c.id] || c.state.status === "ok");

  return (
    <>
      <LHead
        title="چک‌لیست پیش از انتشار"
        sub="چهار شرط: امنیت، پشتیبان آزمون‌شده، خرید کامل تا تحویل، دسترس‌پذیری و موبایل. آنچه پنل اندازه می‌گیرد خودکار است؛ بقیه با امضای تو بسته می‌شود."
      />
      <LCard
        title={ready ? "همهٔ شرط‌ها بسته شد" : `${fa(signedCount)} از ${fa(checks.length)} با امضا بسته شد`}
        icon={<Rocket width={14} height={14} />}
      >
        <ul className="ad-launch-list">
          {checks.map((c) => {
            const s = stateOf(c);
            return (
              <li key={c.id} className={cn("ad-launch-item", `is-${s.tone}`)}>
                <span className="ad-launch-icon" aria-hidden="true">
                  {s.tone === "ok" ? <CheckCircle2 width={16} height={16} /> : s.tone === "fail" ? <Circle width={16} height={16} /> : <Circle width={16} height={16} />}
                </span>
                <div>
                  <b>{c.title}</b>
                  <p>{c.detail}</p>
                  <small>{s.label}{ops.launchChecks[c.id] ? ` · ${timeAgo(ops.launchChecks[c.id].at)}` : ""}</small>
                </div>
                <div className="ad-actions">
                  {ops.launchChecks[c.id] ? (
                    <button type="button" className="ad-btn is-sm" onClick={() => signLaunchCheck(c.id, "", false)}>برداشتن امضا</button>
                  ) : (
                    <button
                      type="button"
                      className="ad-btn is-sm is-primary"
                      onClick={() => {
                        const by = session.me?.staff?.name ?? "مالک";
                        signLaunchCheck(c.id, by);
                        addLog({ action: `امضای شرط انتشار: ${c.title}`, actor: by, target: c.id });
                      }}
                    >
                      <BadgeCheck width={13} height={13} /> تأیید می‌کنم
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </LCard>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 3. changelog (decision 94) + manual (decision 95)                   */
/* ------------------------------------------------------------------ */

export function ChangelogPanel() {
  return (
    <>
      <LHead title="سابقهٔ تغییرات" sub="هر نسخه چه چیزی را عوض کرد و چه چیزی هنوز باز است." />
      <div className="ad-changelog">
        {CHANGELOG.map((r) => (
          <article key={r.version} className="ad-changelog-item">
            <header>
              <b>نسخهٔ {r.version}</b>
              <span>{r.title}</span>
              <small>{r.date}</small>
            </header>
            <ul>
              {r.items.map((item) => (
                <li key={item}><Check width={12} height={12} />{item}</li>
              ))}
            </ul>
            {r.open && r.open.length > 0 && (
              <div className="ad-changelog-open">
                <b>باز مانده در این نسخه</b>
                <ul>{r.open.map((o) => <li key={o}>{o}</li>)}</ul>
              </div>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

export function ManualPanel() {
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(MANUAL[0]?.id ?? null);
  const list = useMemo(() => {
    const s = q.trim();
    if (!s) return MANUAL;
    return MANUAL.filter((m) => `${m.title} ${m.where} ${m.steps.join(" ")} ${m.note ?? ""}`.includes(s));
  }, [q]);

  return (
    <>
      <LHead title="راهنمای فارسی" sub={`${fa(MANUAL.length)} بخش کوتاه، هر کدام یک کار روزمره.`} />
      <div className="ad-search-row">
        <Search width={13} height={13} />
        <input className="ad-input ad-input-inline" value={q} onChange={(e) => setQ(e.target.value)} placeholder="در راهنما بگرد…" aria-label="جست‌وجو در راهنما" />
        <span className="ad-hint">{fa(list.length)} بخش</span>
      </div>
      {list.length === 0 ? (
        <p className="ad-empty">با این عبارت بخشی پیدا نشد.</p>
      ) : (
        <div className="ad-manual">
          {list.map((m) => (
            <article key={m.id} className={cn("ad-manual-item", openId === m.id && "is-open")}>
              <button type="button" className="ad-manual-head" onClick={() => setOpenId(openId === m.id ? null : m.id)} aria-expanded={openId === m.id}>
                <BookOpen width={14} height={14} />
                <b>{m.title}</b>
                <small>{m.where}</small>
              </button>
              {openId === m.id && (
                <div className="ad-manual-body">
                  <ol>{m.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                  {m.note && <p className="ad-hint">{m.note}</p>}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 4. 'مشکل داشتم' — report kept in the panel + ready for the dev      */
/*    (decisions 96 + 97)                                             */
/* ------------------------------------------------------------------ */

export function IssueDialog({ page, onClose }: { page: string; onClose: () => void }) {
  const ops = useOps();
  const session = useAdminMe();
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<IssueReport | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const report = saved
    ? [
        `گزارش مشکل — ${ops.brand.name}`,
        `زمان: ${new Date(saved.at).toLocaleString("fa-IR")}`,
        `صفحه: ${saved.page}`,
        `مرورگر: ${saved.context.ua} · عرض ${saved.context.width}px`,
        `نشانی: ${saved.context.url}`,
        "",
        saved.text,
      ].join("\n")
    : "";

  return (
    <div className="acc-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="گزارش مشکل" className="ad-issue-dialog">
        <header>
          <h3>مشکل داشتم</h3>
          <button type="button" className="ad-icon" onClick={onClose} aria-label="بستن"><X width={15} height={15} /></button>
        </header>
        {!saved ? (
          <>
            <p className="ad-hint">صفحه و مشخصات مرورگر خودکار کنار گزارش ثبت می‌شود تا بازتولیدش راحت باشد.</p>
            <label className="ad-field">
              چه اتفاقی افتاد؟
              <textarea
                className="ad-input"
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="مثلاً: در صفحهٔ سفارش، بعد از زدن «ارسال شد» وضعیت برنگشت."
                aria-label="متن گزارش مشکل"
              />
            </label>
            <div className="ad-actions">
              <button
                type="button"
                className="ad-btn is-primary"
                disabled={text.trim().length < 8}
                onClick={() => {
                  const issue: IssueReport = {
                    id: `iss-${Math.random().toString(36).slice(2, 9)}`,
                    at: Date.now(),
                    page,
                    text: text.trim(),
                    context: { ua: navigator.userAgent, width: window.innerWidth, url: window.location.href },
                  };
                  addIssue(issue);
                  addLog({ action: `گزارش مشکل از ${page}`, actor: session.me?.staff?.name ?? "مالک", target: page });
                  setSaved(issue);
                }}
              >
                <Send width={13} height={13} /> ثبت گزارش
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="ad-note-ok"><CheckCircle2 width={14} height={14} /> گزارش در پنل ثبت شد؛ در «سیستم → گزارش مشکل» می‌بینی‌اش.</p>
            <pre className="ad-issue-text" dir="ltr">{report}</pre>
            <div className="ad-actions">
              <button
                type="button"
                className="ad-btn is-sm"
                onClick={() => void navigator.clipboard.writeText(report).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })}
              >
                <Copy width={13} height={13} /> {copied ? "کپی شد" : "کپی برای توسعه‌دهنده"}
              </button>
              {ops.developerEmail ? (
                <a className="ad-btn is-sm is-primary" href={`mailto:${ops.developerEmail}?subject=${encodeURIComponent(`گزارش مشکل — ${ops.brand.name}`)}&body=${encodeURIComponent(report)}`}>
                  <Mail width={13} height={13} /> ایمیل به توسعه‌دهنده
                </a>
              ) : (
                <span className="ad-hint">ایمیل توسعه‌دهنده در «سیستم → گزارش مشکل» تنظیم می‌شود.</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function IssueInbox() {
  const ops = useOps();
  const [dev, setDev] = useState(ops.developerEmail);
  useEffect(() => setDev(ops.developerEmail), [ops.developerEmail]);

  return (
    <>
      <LHead title="گزارش مشکل" sub="هر گزارش با صفحه و مشخصات مرورگر ثبت می‌شود؛ برای فرستادن به توسعه‌دهنده هم آماده است." />
      <LCard title="مقصد گزارش" icon={<Mail width={14} height={14} />}>
        <label className="ad-field">
          ایمیل توسعه‌دهنده
          <input
            className="ad-input"
            dir="ltr"
            value={dev}
            onChange={(e) => setDev(e.target.value)}
            onBlur={() => setDeveloperEmail(dev.trim())}
            placeholder="dev@example.com"
          />
          <small className="ad-hint">خالی بماند، دکمهٔ ایمیل نشان داده نمی‌شود و فقط کپی متن می‌ماند — ایمیل ساختگی ساخته نمی‌شود.</small>
        </label>
      </LCard>
      {ops.issues.length === 0 ? (
        <p className="ad-empty">گزارشی ثبت نشده. دکمهٔ «مشکل داشتم» پایین هر صفحهٔ پنل و فروشگاه است.</p>
      ) : (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>زمان</th><th>صفحه</th><th>متن</th><th>مرورگر</th><th>وضعیت</th></tr></thead>
            <tbody>
              {ops.issues.map((i) => (
                <tr key={i.id}>
                  <td>{timeAgo(i.at)}</td>
                  <td dir="ltr">{i.page}</td>
                  <td>{i.text}</td>
                  <td className="ad-hint" dir="ltr">{i.context.width}px</td>
                  <td>
                    <button type="button" className="ad-btn is-sm" onClick={() => resolveIssue(i.id)}>
                      {i.resolved ? "حل شد ✓" : "حل شد"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/* the floating button: present on every storefront and panel screen */
export function IssueButton({ page }: { page: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="ad-issue-fab" onClick={() => setOpen(true)} title="مشکل داشتم" aria-label="گزارش مشکل">
        <LifeBuoy width={15} height={15} />
        <span>مشکل داشتم</span>
      </button>
      {open && <IssueDialog page={page} onClose={() => setOpen(false)} />}
    </>
  );
}

/* a small reminder of what is still open, used on the admin home */
export function LaunchBanner() {
  const ops = useOps();
  const signed = Object.keys(ops.launchChecks ?? {}).length;
  if (signed >= 4) return null;
  return (
    <div className="ad-launch-banner" role="status">
      <Sparkles width={14} height={14} />
      <span>
        {signed === 0 ? "چک‌لیست انتشار هنوز باز است." : `${fa(signed)} مورد از چک‌لیست انتشار امضا شده.`} پیش از انتشار، «سیستم → چک‌لیست انتشار» را کامل کن.
      </span>
    </div>
  );
}

export const LaunchIcons = { ScrollText, Rocket };
