import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  LayoutTemplate,
  Layers,
  Box,
  Plus,
  Search,
  Trash2,
  X,
  ClipboardPaste,
  Palette,
  Save,
  Pencil,
  Clipboard,
} from "lucide-react";
import {
  DISPLAY_LABEL,
  FONT_OPTIONS,
  KIND_LABEL,
  type BDoc,
  type BNode,
  type DisplayCond,
  type SiteSettings,
} from "./core";
import { ColorBox } from "./ControlsUI";
import { CATEGORY_LABEL, CATEGORY_ORDER, WIDGET_LIST, nodeLabel, WIDGETS } from "./registry";
import { TPL_CATEGORY_LABEL, templatesFor, type TplCategory } from "./templates";
import { saveSite, uniqueSlug, useDocs } from "./docs";
import { cloneNodes } from "./clone";
import type { DragPayload } from "./Renderer";
import { newContainer, newWidget } from "./tree";

/* ------------------------------------------------------------------ */
/* elements panel                                                      */
/* ------------------------------------------------------------------ */

export const STRUCTURES: number[][] = [[100], [50, 50], [33.33, 33.33, 33.33], [25, 25, 25, 25], [33.33, 66.67], [66.67, 33.33], [25, 50, 25], [20, 20, 20, 20, 20]];

export function StructurePicker({ onPick }: { onPick: (cols: number[]) => void }) {
  return (
    <div className="eb-structs">
      {STRUCTURES.map((s, i) => (
        <button key={i} type="button" className="eb-struct" title={s.map((n) => `${Math.round(n)}٪`).join(" · ")} aria-label={`ساختار ${s.length} ستونه`} onClick={() => onPick(s)}>
          {s.map((n, j) => (
            <i key={j} style={{ width: `${n}%` }} />
          ))}
        </button>
      ))}
    </div>
  );
}

export function ElementsPanel({
  onAdd,
  onAddContainer,
  startDrag,
  endDrag,
  onStructure,
}: {
  onAdd: (type: string) => void;
  onAddContainer: () => void;
  startDrag: (p: DragPayload) => void;
  endDrag: () => void;
  onStructure: (cols: number[]) => void;
}) {
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const query = q.trim().toLowerCase();
  const list = WIDGET_LIST.filter((w) => !query || `${w.title} ${w.keywords ?? ""} ${w.type}`.toLowerCase().includes(query));

  return (
    <div className="eb-panel-body">
      <div className="eb-search">
        <input placeholder="جست‌وجوی ویجت…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="جست‌وجوی ویجت" />
        <Search width={14} height={14} />
      </div>

      {!query && (
        <div style={{ padding: "0 14px 12px" }}>
          <div className="eb-widget-grid" style={{ padding: 0 }}>
            <div
              role="button"
              tabIndex={0}
              className="eb-tile is-structure"
              draggable
              title="کانتینر انعطاف‌پذیر — قابل تودرتویی"
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", "container");
                e.dataTransfer.effectAllowed = "copy";
                startDrag({ kind: "new", type: "container", make: () => newContainer([], { bgType: "color", bgColor: "#f7f3ed", boxRadius: { top: 18, right: 18, bottom: 18, left: 18, linked: true } }) });
              }}
              onDragEnd={endDrag}
              onClick={() => onAddContainer()}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onAddContainer())}
            >
              <Box width={22} height={22} />
              کانتینر
            </div>
          </div>
        </div>
      )}

      {!query && (
        <>
          <button type="button" className="eb-cat-title" onClick={() => setClosed((c) => ({ ...c, _s: !c._s }))}>
            ساختار بخش (ستون‌ها)
            {closed._s ? <ChevronDown width={14} height={14} /> : <ChevronUp width={14} height={14} />}
          </button>
          {!closed._s && (
            <div style={{ padding: "2px 14px 14px" }}>
              <StructurePicker onPick={onStructure} />
            </div>
          )}
        </>
      )}

      {CATEGORY_ORDER.map((cat) => {
        const items = list.filter((w) => w.category === cat);
        if (!items.length) return null;
        const isClosed = !query && closed[cat];
        return (
          <div key={cat}>
            <button type="button" className="eb-cat-title" onClick={() => setClosed((c) => ({ ...c, [cat]: !c[cat] }))}>
              {CATEGORY_LABEL[cat]} · {items.length.toLocaleString("fa-IR")}
              {isClosed ? <ChevronDown width={14} height={14} /> : <ChevronUp width={14} height={14} />}
            </button>
            {!isClosed && (
              <div className="eb-widget-grid">
                {items.map((w) => (
                  <div
                    key={w.type}
                    role="button"
                    tabIndex={0}
                    className="eb-tile"
                    draggable
                    title="بکش روی صفحه یا کلیک کن"
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", w.type);
                      e.dataTransfer.effectAllowed = "copy";
                      startDrag({ kind: "new", type: "widget", make: () => newWidget(w.type) });
                    }}
                    onDragEnd={endDrag}
                    onClick={() => onAdd(w.type)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onAdd(w.type))}
                  >
                    <w.icon width={22} height={22} />
                    {w.title}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {list.length === 0 && <div className="eb-empty-note">ویجتی با این نام پیدا نشد.</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* navigator                                                           */
/* ------------------------------------------------------------------ */

export function Navigator({
  content,
  selectedId,
  onSelect,
  onHover,
  onDuplicate,
  onRemove,
  onClose,
}: {
  content: BNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const rows: { node: BNode; depth: number }[] = [];
  const walk = (list: BNode[], depth: number) => {
    for (const n of list) {
      rows.push({ node: n, depth });
      if (n.children.length && !collapsed[n.id]) walk(n.children, depth + 1);
    }
  };
  walk(content, 0);

  const hint = (n: BNode) => {
    const t = n.settings?.title ?? n.settings?.text ?? n.settings?.label;
    return typeof t === "string" && t ? ` — ${t.slice(0, 22)}` : "";
  };

  return (
    <div className="eb-nav" role="dialog" aria-label="ناوبیگیتور" onClick={(e) => e.stopPropagation()}>
      <div className="eb-panel-head" style={{ padding: "10px 12px" }}>
        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <Layers width={15} height={15} /> ناوبیگیتور
        </span>
        <button type="button" className="eb-iconbtn" style={{ width: 28, height: 28 }} aria-label="بستن" onClick={onClose}>
          <X width={15} height={15} />
        </button>
      </div>
      <div className="eb-nav-body" onMouseLeave={() => onHover(null)}>
        {rows.length === 0 && <div className="eb-empty-note">صفحه خالی است.</div>}
        {rows.map(({ node, depth }) => {
          const def = node.widget ? WIDGETS[node.widget] : undefined;
          const Icon = def?.icon;
          return (
            <div
              key={node.id}
              className={`eb-nav-row ${selectedId === node.id ? "is-on" : ""}`}
              style={{ paddingInlineStart: 6 + depth * 14 }}
              onClick={() => onSelect(node.id)}
              onMouseEnter={() => onHover(node.id)}
            >
              {node.children.length > 0 ? (
                <button type="button" className="eb-x" aria-label="باز/بسته" onClick={(e) => { e.stopPropagation(); setCollapsed((c) => ({ ...c, [node.id]: !c[node.id] })); }}>
                  {collapsed[node.id] ? <ChevronDown width={12} height={12} /> : <ChevronUp width={12} height={12} />}
                </button>
              ) : (
                <span style={{ width: 20 }} />
              )}
              {Icon ? <Icon width={13} height={13} /> : null}
              <span className="eb-nav-name">
                {nodeLabel(node)}
                <span style={{ opacity: 0.55 }}>{hint(node)}</span>
              </span>
              <button type="button" className="eb-x" aria-label="تکرار" onClick={(e) => { e.stopPropagation(); onDuplicate(node.id); }}>
                <Copy width={12} height={12} />
              </button>
              <button type="button" className="eb-x" aria-label="حذف" onClick={(e) => { e.stopPropagation(); onRemove(node.id); }}>
                <Trash2 width={12} height={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* modal shell                                                         */
/* ------------------------------------------------------------------ */

export function Modal({ title, onClose, children, foot, small }: { title: string; onClose: () => void; children: React.ReactNode; foot?: React.ReactNode; small?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="eb-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`eb-modal ${small ? "is-sm" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="eb-modal-head">
          <span>{title}</span>
          <button type="button" className="eb-iconbtn" aria-label="بستن" onClick={onClose}>
            <X width={16} height={16} />
          </button>
        </div>
        <div className="eb-modal-body">{children}</div>
        {foot && <div className="eb-modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* template library                                                    */
/* ------------------------------------------------------------------ */

export function LibraryModal({ doc, onInsert, onInsertSaved, onClose }: { doc: BDoc; onInsert: (nodes: BNode[], isPage: boolean) => void; onInsertSaved: (nodes: BNode[]) => void; onClose: () => void }) {
  const docs = useDocs();
  const [tab, setTab] = useState<TplCategory | "all" | "saved">("all");
  const available = useMemo(() => templatesFor(doc.kind), [doc.kind]);
  const cats = useMemo(() => [...new Set(available.map((t) => t.category))], [available]);
  const saved = docs.filter((d) => d.kind === "section");
  const shown = tab === "all" ? available : available.filter((t) => t.category === tab);

  return (
    <Modal title="کتابخانهٔ قالب‌ها" onClose={onClose}>
      <div className="eb-tpl-tabs">
        <button type="button" className={`eb-btn is-sm ${tab === "all" ? "is-primary" : ""}`} onClick={() => setTab("all")}>
          همه
        </button>
        {cats.map((c) => (
          <button key={c} type="button" className={`eb-btn is-sm ${tab === c ? "is-primary" : ""}`} onClick={() => setTab(c)}>
            {TPL_CATEGORY_LABEL[c]}
          </button>
        ))}
        <button type="button" className={`eb-btn is-sm ${tab === "saved" ? "is-primary" : ""}`} onClick={() => setTab("saved")}>
          قالب‌های من · {saved.length.toLocaleString("fa-IR")}
        </button>
      </div>

      {tab === "saved" ? (
        saved.length === 0 ? (
          <div className="eb-empty-note">هنوز بخش ذخیره‌شده‌ای نداری. روی یک بخش راست‌کلیک کن و «ذخیره به‌عنوان قالب» را بزن.</div>
        ) : (
          <div className="eb-tpl-grid">
            {saved.map((d) => (
              <button key={d.id} type="button" className="eb-tpl" onClick={() => { onInsertSaved(cloneNodes(d.content)); onClose(); }}>
                <span className="eb-tpl-prev"><LayoutTemplate width={30} height={30} /></span>
                <span className="eb-tpl-meta"><b>{d.title}</b><small>{KIND_LABEL[d.kind]}</small></span>
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="eb-tpl-grid">
          {shown.map((t) => (
            <button key={t.id} type="button" className="eb-tpl" onClick={() => { onInsert(t.build(), t.category === "page"); onClose(); }}>
              <span className="eb-tpl-prev"><LayoutTemplate width={30} height={30} /></span>
              <span className="eb-tpl-meta"><b>{t.title}</b><small>{t.desc}</small></span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* page settings                                                       */
/* ------------------------------------------------------------------ */

export function PageSettingsModal({ doc, onChange, onClose }: { doc: BDoc; onChange: (patch: Partial<BDoc>) => void; onClose: () => void }) {
  const set = <K extends keyof BDoc["page"]>(k: K, v: BDoc["page"][K]) => onChange({ page: { ...doc.page, [k]: v } });
  const setPopup = <K extends keyof BDoc["popup"]>(k: K, v: BDoc["popup"][K]) => onChange({ popup: { ...doc.popup, [k]: v } });
  const isTpl = doc.kind === "header" || doc.kind === "footer" || doc.kind === "popup";
  return (
    <Modal title={`تنظیمات ${KIND_LABEL[doc.kind]}`} onClose={onClose} foot={<button type="button" className="eb-btn is-primary" onClick={onClose}>تأیید</button>}>
      <div className="eb-sec-body" style={{ padding: 0 }}>
        <label className="eb-ctl"><span className="eb-label">عنوان</span><input className="eb-in" value={doc.title} onChange={(e) => onChange({ title: e.target.value })} /></label>
        {(doc.kind === "page" || doc.kind === "landing") && (
          <label className="eb-ctl">
            <span className="eb-label">نشانی (slug) — آدرس: #/p/{doc.slug}</span>
            <input className="eb-in" dir="ltr" value={doc.slug} onChange={(e) => onChange({ slug: uniqueSlug(e.target.value, doc.id) })} />
          </label>
        )}
        <label className="eb-ctl">
          <span className="eb-label">وضعیت</span>
          <select className="eb-in" value={doc.status} onChange={(e) => onChange({ status: e.target.value as BDoc["status"] })}>
            <option value="draft">پیش‌نویس</option>
            <option value="published">منتشرشده</option>
          </select>
        </label>

        {(doc.kind === "page" || doc.kind === "landing") && (
          <>
            <label className="eb-ctl">
              <span className="eb-label">قالب صفحه</span>
              <select className="eb-in" value={doc.page.layout} onChange={(e) => set("layout", e.target.value as BDoc["page"]["layout"])}>
                <option value="default">پیش‌فرض (هدر و فوتر سایت)</option>
                <option value="fullwidth">تمام‌عرض (با هدر و فوتر)</option>
                <option value="canvas">بوم خالی (بدون هدر و فوتر)</option>
              </select>
            </label>
            <label className="eb-ctl">
              <span className="eb-label">توضیح متا (SEO)</span>
              <textarea className="eb-in" rows={2} value={doc.page.description} onChange={(e) => set("description", e.target.value)} />
            </label>
          </>
        )}

        <div className="eb-ctl">
          <span className="eb-label">رنگ پس‌زمینهٔ صفحه</span>
          <ColorBox value={doc.page.bg} onChange={(v) => set("bg", v)} onClear={() => set("bg", "")} />
        </div>
        <label className="eb-ctl">
          <span className="eb-label">فاصلهٔ داخلی صفحه (px)</span>
          <input className="eb-in" type="number" value={doc.page.padding} onChange={(e) => set("padding", Number(e.target.value) || 0)} />
        </label>
        <label className="eb-ctl">
          <span className="eb-label">CSS سفارشی صفحه</span>
          <textarea className="eb-in is-code" rows={5} placeholder=".eb-root h2 { letter-spacing: 0; }" value={doc.page.customCss} onChange={(e) => set("customCss", e.target.value)} />
        </label>

        {isTpl && (
          <>
            <div className="eb-h">نمایش در سایت (Theme Builder)</div>
            <div className="eb-ctl-row"><span className="eb-label">فعال روی سایت</span>
              <button type="button" role="switch" aria-checked={doc.active} aria-label="فعال" className={`eb-switch ${doc.active ? "is-on" : ""}`} onClick={() => onChange({ active: !doc.active })} />
            </div>
            <label className="eb-ctl">
              <span className="eb-label">شرط نمایش</span>
              <select className="eb-in" value={doc.display} onChange={(e) => onChange({ display: e.target.value as DisplayCond })}>
                {(Object.keys(DISPLAY_LABEL) as DisplayCond[]).map((k) => <option key={k} value={k}>{DISPLAY_LABEL[k]}</option>)}
              </select>
            </label>
            <div className="eb-hint">فقط قالب‌های «منتشرشده» و «فعال» روی سایت اعمال می‌شوند.</div>
          </>
        )}

        {doc.kind === "popup" && (
          <>
            <div className="eb-h">رفتار پاپ‌آپ</div>
            <label className="eb-ctl"><span className="eb-label">محرک نمایش</span>
              <select className="eb-in" value={doc.popup.trigger} onChange={(e) => setPopup("trigger", e.target.value as BDoc["popup"]["trigger"])}>
                <option value="load">هنگام بارگذاری</option>
                <option value="delay">بعد از چند ثانیه</option>
                <option value="scroll">بعد از اسکرول</option>
                <option value="exit">قصد خروج (Exit Intent)</option>
              </select>
            </label>
            {doc.popup.trigger === "delay" && <label className="eb-ctl"><span className="eb-label">تأخیر (ثانیه)</span><input className="eb-in" type="number" value={doc.popup.delay} onChange={(e) => setPopup("delay", Number(e.target.value) || 0)} /></label>}
            {doc.popup.trigger === "scroll" && <label className="eb-ctl"><span className="eb-label">درصد اسکرول</span><input className="eb-in" type="number" value={doc.popup.scroll} onChange={(e) => setPopup("scroll", Number(e.target.value) || 0)} /></label>}
            <label className="eb-ctl"><span className="eb-label">موقعیت</span>
              <select className="eb-in" value={doc.popup.position} onChange={(e) => setPopup("position", e.target.value as BDoc["popup"]["position"])}>
                <option value="center">وسط صفحه</option>
                <option value="bottom-right">گوشهٔ پایین</option>
                <option value="top-bar">نوار بالا</option>
                <option value="bottom-bar">نوار پایین</option>
              </select>
            </label>
            <label className="eb-ctl"><span className="eb-label">عرض (px)</span><input className="eb-in" type="number" value={doc.popup.width} onChange={(e) => setPopup("width", Number(e.target.value) || 480)} /></label>
            <div className="eb-ctl-row"><span className="eb-label">فقط یک‌بار برای هر بازدیدکننده</span>
              <button type="button" role="switch" aria-checked={doc.popup.once} aria-label="یک‌بار" className={`eb-switch ${doc.popup.once ? "is-on" : ""}`} onClick={() => setPopup("once", !doc.popup.once)} />
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* site settings (global styles)                                       */
/* ------------------------------------------------------------------ */

export function SiteSettingsPanel({ site }: { site: SiteSettings }) {
  const set = (patch: Partial<SiteSettings>) => saveSite({ ...site, ...patch });
  return (
    <div className="eb-panel-body" style={{ paddingTop: 0 }}>
      <div className="eb-sec">
        <div className="eb-sec-head" style={{ cursor: "default" }}><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Palette width={14} height={14} /> رنگ‌های سراسری</span></div>
        <div className="eb-sec-body">
          <div className="eb-hint">این رنگ‌ها در انتخاب‌گر رنگ همهٔ ویجت‌ها نمایش داده می‌شوند؛ با تغییر آن‌ها همهٔ صفحه‌ها یک‌جا عوض می‌شود.</div>
          {site.colors.map((c, i) => (
            <div key={c.id} className="eb-ctl">
              <span className="eb-label">{c.title} <code className="eb-kbd">--eb-c-{c.id}</code></span>
              <ColorBox value={c.value} onChange={(v) => set({ colors: site.colors.map((x, n) => (n === i ? { ...x, value: v } : x)) })} onClear={() => undefined} />
            </div>
          ))}
        </div>
      </div>
      <div className="eb-sec">
        <div className="eb-sec-head" style={{ cursor: "default" }}>تایپوگرافی سراسری</div>
        <div className="eb-sec-body">
          <label className="eb-ctl"><span className="eb-label">فونت عنوان‌ها</span>
            <select className="eb-in" value={site.headingFont} onChange={(e) => set({ headingFont: e.target.value })}>{FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
          </label>
          <label className="eb-ctl"><span className="eb-label">فونت متن</span>
            <select className="eb-in" value={site.bodyFont} onChange={(e) => set({ bodyFont: e.target.value })}>{FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}</select>
          </label>
          <div className="eb-ctl"><span className="eb-label">رنگ پیش‌فرض متن</span><ColorBox value={site.bodyColor} onChange={(v) => set({ bodyColor: v })} onClear={() => set({ bodyColor: "" })} /></div>
          <div className="eb-ctl"><span className="eb-label">رنگ لینک‌ها</span><ColorBox value={site.linkColor} onChange={(v) => set({ linkColor: v })} onClear={() => set({ linkColor: "" })} /></div>
        </div>
      </div>
      <div className="eb-sec">
        <div className="eb-sec-head" style={{ cursor: "default" }}>چیدمان سراسری</div>
        <div className="eb-sec-body">
          <label className="eb-ctl"><span className="eb-label">عرض محتوا (px) — {site.containerWidth}</span>
            <input type="range" min={720} max={1600} step={10} value={site.containerWidth} onChange={(e) => set({ containerWidth: Number(e.target.value) })} style={{ accentColor: "#6366f1" }} />
          </label>
          <label className="eb-ctl"><span className="eb-label">فاصلهٔ ویجت‌ها (px) — {site.widgetGap}</span>
            <input type="range" min={0} max={60} value={site.widgetGap} onChange={(e) => set({ widgetGap: Number(e.target.value) })} style={{ accentColor: "#6366f1" }} />
          </label>
        </div>
      </div>
      <div className="eb-sec">
        <div className="eb-sec-head" style={{ cursor: "default" }}>CSS سفارشی سراسری</div>
        <div className="eb-sec-body">
          <textarea className="eb-in is-code" rows={7} placeholder=".eb-root a { text-decoration: none; }" value={site.customCss} onChange={(e) => set({ customCss: e.target.value })} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* context menu + shortcuts                                            */
/* ------------------------------------------------------------------ */

export interface CtxItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  divider?: boolean;
}

export function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: CtxItem[]; onClose: () => void }) {
  useEffect(() => {
    const close = () => onClose();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", k);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", k);
    };
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 210);
  const top = Math.min(y, window.innerHeight - items.length * 34 - 16);
  return (
    <div className="eb-ctx" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()} role="menu">
      {items.map((it, i) =>
        it.divider ? (
          <hr key={i} />
        ) : (
          <button key={i} type="button" role="menuitem" disabled={it.disabled} onClick={() => { it.onClick(); onClose(); }}>
            {it.icon}
            {it.label}
          </button>
        ),
      )}
    </div>
  );
}

export const SHORTCUTS: [string, string][] = [
  ["Ctrl + S", "ذخیره"],
  ["Ctrl + Z", "واگرد"],
  ["Ctrl + Shift + Z  /  Ctrl + Y", "تکرار"],
  ["Ctrl + D", "تکرار المان انتخاب‌شده"],
  ["Ctrl + C  /  Ctrl + V", "کپی و چسباندن المان"],
  ["Delete", "حذف المان انتخاب‌شده"],
  ["Ctrl + I", "نمایش/پنهان کردن ناوبیگیتور"],
  ["Ctrl + Shift + P", "پیش‌نمایش"],
  ["Esc", "لغو انتخاب / بستن پنجره"],
  ["دوبار کلیک روی متن", "ویرایش درون‌خطی"],
  ["راست‌کلیک", "منوی المان"],
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="میانبرهای صفحه‌کلید" onClose={onClose} small>
      {SHORTCUTS.map(([k, d]) => (
        <div key={k} className="eb-kb-row">
          <span>{d}</span>
          <span className="eb-kbd">{k}</span>
        </div>
      ))}
    </Modal>
  );
}

/* icons used by the editor menu (re-exported for convenience) */
export const MENU_ICONS = { Eye, Plus, Save, Pencil, Clipboard, ClipboardPaste, Copy, Trash2 };
