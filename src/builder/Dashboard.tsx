import { useMemo, useRef, useState } from "react";
import { formatJalaliDateTime } from "@/utils/date";
import { Link, useNavigate } from "react-router-dom";
import {
  Copy,
  Download,
  ExternalLink,
  FileText,
  Inbox,
  LayoutPanelTop,
  LayoutTemplate,
  Megaphone,
  PanelBottom,
  PanelTop,
  Pencil,
  Plus,
  Rocket,
  Trash2,
  Upload,
  Rows3,
} from "lucide-react";
import { DISPLAY_LABEL, KIND_LABEL, type BDoc, type DisplayCond, type DocKind } from "./core";
import {
  clearSubmissions,
  CORE_PAGES,
  createDoc,
  openCorePage,
  duplicateDoc,
  exportDoc,
  importDoc,
  patchDoc,
  removeDoc,
  useDocs,
  useSubmissions,
} from "./docs";
import { WIDGET_LIST } from "./registry";
import { TEMPLATES, templatesFor } from "./templates";
import { cloneNodes } from "./clone";
import { newSection } from "./tree";
import { download, timeAgo } from "./util";
import { useCart } from "@/state/cart";

const KIND_ICON: Record<DocKind, typeof FileText> = {
  page: FileText,
  landing: Rocket,
  header: PanelTop,
  footer: PanelBottom,
  section: LayoutTemplate,
  popup: Megaphone,
};

const KIND_HINT: Record<DocKind, string> = {
  page: "صفحهٔ معمولی با آدرس #/p/نام",
  landing: "لندینگ‌پیج بوم خالی (بدون هدر و فوتر)",
  header: "هدر سراسری سایت (Theme Builder)",
  footer: "فوتر سراسری سایت (Theme Builder)",
  section: "بخش قابل‌استفادهٔ مجدد",
  popup: "پنجرهٔ شناور با محرک‌های مختلف",
};

type Tab = "all" | DocKind | "forms";

export function Dashboard() {
  const docs = useDocs();
  const submissions = useSubmissions();
  const navigate = useNavigate();
  const { notify } = useCart();
  const [tab, setTab] = useState<Tab>("all");
  const [creating, setCreating] = useState<DocKind | null>(null);
  const [confirmDel, setConfirmDel] = useState<BDoc | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const shown = tab === "all" ? docs : tab === "forms" ? [] : docs.filter((d) => d.kind === tab);
  const count = (k: DocKind) => docs.filter((d) => d.kind === k).length;

  const doImport = async (f?: File) => {
    if (!f) return;
    const doc = importDoc(await f.text());
    if (doc) {
      notify("ایمپورت شد", doc.title);
      navigate(`/builder/edit/${doc.id}`);
    } else notify("فایل معتبر نیست", "فقط خروجی JSON همین صفحه‌ساز پذیرفته می‌شود.");
  };

  const tabs: { id: Tab; label: string; n?: number }[] = [
    { id: "all", label: "همه", n: docs.length },
    { id: "page", label: "صفحه‌ها", n: count("page") },
    { id: "landing", label: "لندینگ‌ها", n: count("landing") },
    { id: "header", label: "هدرها", n: count("header") },
    { id: "footer", label: "فوترها", n: count("footer") },
    { id: "section", label: "بخش‌های ذخیره‌شده", n: count("section") },
    { id: "popup", label: "پاپ‌آپ‌ها", n: count("popup") },
    { id: "forms", label: "پیام‌های فرم", n: submissions.length },
  ];

  return (
    <div className="ebd">
      <div className="ebd-top">
        <div className="ebd-top-in">
          <Link to="/" className="ebd-logo">VELOURS</Link>
          <strong style={{ fontSize: 14 }}>صفحه‌ساز</strong>
          <span style={{ flex: 1 }} />
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { void doImport(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" className="ebd-btn" onClick={() => fileRef.current?.click()}><Upload width={14} height={14} /> ایمپورت JSON</button>
          <Link to="/" className="ebd-btn"><ExternalLink width={14} height={14} /> بازگشت به سایت</Link>
          <button type="button" className="ebd-btn is-primary" onClick={() => setCreating("page")}><Plus width={14} height={14} /> ساخت جدید</button>
        </div>
      </div>

      <main className="ebd-main">
        <section className="ebd-hero">
          <div>
            <h1>هرچه می‌خواهی بساز؛ صفحه، هدر، فوتر، بنر و پاپ‌آپ.</h1>
            <p>
              ادیتور بصری با درگ‌ودراپ، {WIDGET_LIST.length.toLocaleString("fa-IR")} ویجت، قالب‌های آماده، حالت ریسپانسیو، استایل‌های سراسری،
              افکت‌های حرکتی و Theme Builder — همه روی همین فروشگاه اجرا می‌شود.
            </p>
          </div>
          <div className="ebd-stats">
            <div className="ebd-stat"><b>{docs.filter((d) => d.kind === "page" || d.kind === "landing").length.toLocaleString("fa-IR")}</b><small>صفحه</small></div>
            <div className="ebd-stat"><b>{docs.filter((d) => d.status === "published").length.toLocaleString("fa-IR")}</b><small>منتشرشده</small></div>
            <div className="ebd-stat"><b>{TEMPLATES.length.toLocaleString("fa-IR")}</b><small>قالب آماده</small></div>
          </div>
        </section>

        {/* built-in pages: the site's own screens, editable with the builder */}
        <section className="ebd-core" aria-label="صفحه‌های خود سایت">
          <h2 className="ebd-core-title">صفحه‌های سایت را ویرایش کن</h2>
          <p className="ebd-core-sub">
            هر صفحهٔ آمادهٔ سایت (مثل صفحه اصلی) می‌تواند با همین صفحه‌ساز بازنویسی شود؛ تا وقتی سند را منتشر
            نکنی، نسخهٔ فعلی سایت دست‌نخورده می‌ماند.
          </p>
          <div className="ebd-core-grid">
            {CORE_PAGES.map((p) => {
              const doc = docs.find((d) => d.kind === "page" && d.slug === p.slug);
              return (
                <button
                  key={p.slug}
                  type="button"
                  className="ebd-core-card"
                  onClick={() => {
                    const target = openCorePage(p.slug, cloneNodes(TEMPLATES.find((t) => t.id === "page-landing")!.build()));
                    navigate(`/builder/edit/${target.id}`);
                  }}
                >
                  <span className="ebd-core-name">{p.title}</span>
                  <span className="ebd-core-hint">{p.hint}</span>
                  <span className={`ebd-core-state ${doc?.status === "published" ? "is-live" : ""}`}>
                    {doc ? (doc.status === "published" ? "منتشرشده — سایت را همین نشان می‌دهد" : "پیش‌نویس آماده") : "ویرایش با صفحه‌ساز"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="ebd-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`ebd-tab ${tab === t.id ? "is-on" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.n !== undefined && <span style={{ opacity: 0.55 }}> · {t.n.toLocaleString("fa-IR")}</span>}
            </button>
          ))}
        </div>

        {tab === "forms" ? (
          <Submissions />
        ) : shown.length === 0 ? (
          <div className="ebd-empty">
            <LayoutPanelTop width={36} height={36} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
            <div>{tab === "all" ? "هنوز چیزی نساخته‌ای." : `هنوز ${tab === "section" ? "بخش ذخیره‌شده" : KIND_LABEL[tab as DocKind]}ای نداری.`}</div>
            <button type="button" className="ebd-btn is-primary" style={{ marginTop: 12 }} onClick={() => setCreating(tab === "all" ? "page" : (tab as DocKind))}>
              <Plus width={14} height={14} /> ساخت اولین مورد
            </button>
          </div>
        ) : (
          <div className="ebd-grid">
            {shown.map((d) => (
              <DocCard key={d.id} doc={d} onDelete={() => setConfirmDel(d)} />
            ))}
          </div>
        )}
      </main>

      {creating && <CreateModal initialKind={creating} onClose={() => setCreating(null)} />}

      {confirmDel && (
        <div className="ebd-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setConfirmDel(null)}>
          <div className="ebd-modal" role="alertdialog" aria-label="حذف">
            <h2>حذف «{confirmDel.title}»؟</h2>
            <p className="sub">این کار قابل بازگشت نیست. پیشنهاد: ابتدا خروجی JSON بگیر.</p>
            <div className="ebd-row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="ebd-btn" onClick={() => setConfirmDel(null)}>انصراف</button>
              <button type="button" className="ebd-btn is-primary" onClick={() => { removeDoc(confirmDel.id); setConfirmDel(null); }}>حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function DocCard({ doc, onDelete }: { doc: BDoc; onDelete: () => void }) {
  const navigate = useNavigate();
  const { notify } = useCart();
  const Icon = KIND_ICON[doc.kind];
  const tpl = doc.kind === "header" || doc.kind === "footer" || doc.kind === "popup";
  const pageLike = doc.kind === "page" || doc.kind === "landing";
  const nodes = (() => {
    let n = 0;
    const walk = (l: BDoc["content"]) => l.forEach((x) => { n++; walk(x.children); });
    walk(doc.content);
    return n;
  })();

  return (
    <article className="ebd-card">
      <Link to={`/builder/edit/${doc.id}`} className="ebd-thumb" aria-label={`ویرایش ${doc.title}`}>
        <Icon width={40} height={40} />
        <span className="ebd-kind">{KIND_LABEL[doc.kind]}</span>
        <span className={doc.status === "published" ? "ebd-live" : "ebd-draft"}>{doc.status === "published" ? "منتشرشده" : "پیش‌نویس"}</span>
      </Link>
      <div className="ebd-body">
        <div>
          <h3>{doc.title}</h3>
          <small>
            {pageLike ? `#/p/${doc.slug} · ` : ""}
            {nodes.toLocaleString("fa-IR")} المان · {timeAgo(doc.updatedAt)}
          </small>
        </div>

        {tpl && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
            <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              فعال روی سایت
              <button
                type="button"
                role="switch"
                aria-checked={doc.active}
                aria-label="فعال روی سایت"
                className={`ebd-sw ${doc.active ? "is-on" : ""}`}
                disabled={doc.status !== "published" && !doc.active}
                title={doc.status !== "published" ? "ابتدا منتشر کن" : ""}
                onClick={() => patchDoc(doc.id, { active: !doc.active })}
              />
            </label>
            <select
              className="ebd-select"
              style={{ padding: "7px 10px", border: "1px solid #ddd3c5", borderRadius: 10, background: "#fff", font: "inherit", fontSize: 12 }}
              value={doc.display}
              aria-label="شرط نمایش"
              onChange={(e) => patchDoc(doc.id, { display: e.target.value as DisplayCond })}
            >
              {(Object.keys(DISPLAY_LABEL) as DisplayCond[]).map((k) => <option key={k} value={k}>{DISPLAY_LABEL[k]}</option>)}
            </select>
          </div>
        )}

        <div className="ebd-row">
          <Link to={`/builder/edit/${doc.id}`} className="ebd-btn is-primary is-sm"><Pencil width={12} height={12} /> ویرایش</Link>
          {pageLike && (
            <a href={`#/p/${doc.slug}`} target="_blank" rel="noreferrer" className="ebd-btn is-sm"><ExternalLink width={12} height={12} /> مشاهده</a>
          )}
          <button type="button" className="ebd-btn is-sm" onClick={() => patchDoc(doc.id, { status: doc.status === "published" ? "draft" : "published", active: doc.status === "published" ? false : doc.active })}>
            {doc.status === "published" ? "لغو انتشار" : "انتشار"}
          </button>
          <button type="button" className="ebd-btn is-sm" aria-label="تکرار" title="تکرار" onClick={() => { const c = duplicateDoc(doc.id); if (c) notify("کپی شد", c.title); }}><Copy width={12} height={12} /></button>
          <button type="button" className="ebd-btn is-sm" aria-label="خروجی JSON" title="خروجی JSON" onClick={() => { download(`${doc.slug}.json`, exportDoc(doc)); navigate("/builder"); }}><Download width={12} height={12} /></button>
          <button type="button" className="ebd-btn is-sm is-danger" aria-label="حذف" title="حذف" onClick={onDelete}><Trash2 width={12} height={12} /></button>
        </div>
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */

function CreateModal({ initialKind, onClose }: { initialKind: DocKind; onClose: () => void }) {
  const navigate = useNavigate();
  const [kind, setKind] = useState<DocKind>(initialKind);
  const [title, setTitle] = useState("");
  const [tplId, setTplId] = useState("");
  const options = useMemo(() => templatesFor(kind).filter((t) => (kind === "header" || kind === "footer" ? true : t.category === "page")), [kind]);
  const kinds: DocKind[] = ["page", "landing", "header", "footer", "section", "popup"];

  const create = () => {
    const tpl = TEMPLATES.find((t) => t.id === tplId);
    const content = tpl ? cloneNodes(tpl.build()) : [newSection([100])];
    const doc = createDoc(kind, title.trim() || `${KIND_LABEL[kind]} جدید`, content);
    navigate(`/builder/edit/${doc.id}`);
  };

  return (
    <div className="ebd-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ebd-modal" role="dialog" aria-modal="true" aria-label="ساخت جدید">
        <h2>ساخت مورد جدید</h2>
        <p className="sub">{KIND_HINT[kind]}</p>
        <div className="ebd-kinds">
          {kinds.map((k) => {
            const I = KIND_ICON[k];
            return (
              <button key={k} type="button" className={kind === k ? "is-on" : ""} onClick={() => { setKind(k); setTplId(""); }}>
                <I width={20} height={20} />
                {KIND_LABEL[k]}
              </button>
            );
          })}
        </div>
        <div className="ebd-field">
          <label htmlFor="new-title">عنوان</label>
          <input id="new-title" value={title} autoFocus placeholder={`${KIND_LABEL[kind]} جدید`} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
        </div>
        {options.length > 0 && (
          <div className="ebd-field">
            <label htmlFor="new-tpl">شروع از قالب</label>
            <select id="new-tpl" value={tplId} onChange={(e) => setTplId(e.target.value)}>
              <option value="">صفحهٔ خالی</option>
              {options.map((t) => (
                <option key={t.id} value={t.id}>{t.title} — {t.desc}</option>
              ))}
            </select>
          </div>
        )}
        <div className="ebd-row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="ebd-btn" onClick={onClose}>انصراف</button>
          <button type="button" className="ebd-btn is-primary" onClick={create}><Rows3 width={14} height={14} /> ساخت و ورود به ادیتور</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Submissions() {
  const subs = useSubmissions();
  if (!subs.length) {
    return (
      <div className="ebd-empty">
        <Inbox width={36} height={36} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
        هنوز پیامی از فرم‌ها ثبت نشده. یک ویجت «فرم» به صفحه اضافه کن، منتشرش کن و یک پیام آزمایشی بفرست.
      </div>
    );
  }
  const csv = () => {
    const keys = [...new Set(subs.flatMap((s) => Object.keys(s.data)))];
    const rows = [["فرم", "صفحه", "زمان", ...keys], ...subs.map((s) => [s.form, s.page, formatJalaliDateTime(s.at), ...keys.map((k) => s.data[k] ?? "")])];
    download("submissions.csv", "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
  };
  return (
    <>
      <div className="ebd-row" style={{ marginBottom: 12 }}>
        <button type="button" className="ebd-btn is-sm" onClick={csv}><Download width={12} height={12} /> خروجی CSV</button>
        <button type="button" className="ebd-btn is-sm is-danger" onClick={() => window.confirm("همهٔ پیام‌ها پاک شود؟") && clearSubmissions()}><Trash2 width={12} height={12} /> پاک کردن همه</button>
      </div>
      <div className="ebd-table-wrap">
      <table className="ebd-table">
        <thead>
          <tr><th>فرم</th><th>صفحه</th><th>زمان</th><th>اطلاعات</th></tr>
        </thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.id}>
              <td>{s.form}</td>
              <td>{s.page}</td>
              <td>{timeAgo(s.at)}</td>
              <td>
                {Object.entries(s.data).map(([k, v]) => (
                  <div key={k}><b>{k}:</b> {v}</div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </>
  );
}

