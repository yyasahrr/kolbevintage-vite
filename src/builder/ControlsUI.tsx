import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  LayoutTemplate,
  Link2,
  Link2Off,
  Monitor,
  Paintbrush,
  Plus,
  Search,
  Settings2,
  Smartphone,
  Tablet,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import type { BNode, Ctl, Device } from "./core";
import { CATALOG } from "@/data/catalog";
import { ICONS, PICKER_ICONS } from "./icons";
import { suffixOf, rv } from "./ctx";
import { useDocs, useSite } from "./docs";
import { WIDGETS, effective, sectionsFor } from "./registry";
import type { Settings } from "./core";
import { STOCK_IMAGES, resolveImg } from "./stock";
import { cloneDeep } from "./util";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

export async function fileToDataUrl(file: File, max = 1500): Promise<string> {
  if (file.type === "image/svg+xml") {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
    const keepAlpha = file.type === "image/png" || file.type === "image/webp" || file.type === "image/gif";
    return keepAlpha ? c.toDataURL("image/webp", 0.85) : c.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const DEV_ICON = { desktop: Monitor, tablet: Tablet, mobile: Smartphone } as const;

const hexOf = (v: unknown): string => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : "#000000");

/* ------------------------------------------------------------------ */
/* panel                                                               */
/* ------------------------------------------------------------------ */

type Tab = "presets" | "content" | "style" | "advanced";
const TABS: { id: Tab; label: string; icon: typeof FileText }[] = [
  { id: "presets", label: "طرح‌ها", icon: LayoutTemplate },
  { id: "content", label: "محتوا", icon: FileText },
  { id: "style", label: "استایل", icon: Paintbrush },
  { id: "advanced", label: "پیشرفته", icon: Settings2 },
];

export function ControlsPanel({ node, device, onChange, onApplyPreset }: { node: BNode; device: Device; onChange: (key: string, value: any) => void; onApplyPreset: (settings: Settings) => void }) {
  const [tab, setTab] = useState<Tab>("content");
  const sections = useMemo(() => sectionsFor(node), [node.id, node.widget, node.type]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = effective(node);
  const presets = node.widget ? WIDGETS[node.widget]?.presets ?? [] : [];
  const list = sections.filter((x) => x.tab === tab);
  const [open, setOpen] = useState<string | null>(null);
  const current = open && list.some((x) => x.id === open) ? open : list[0]?.id;

  return (
    <>
      <div className="eb-ptabs">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={`eb-ptab ${tab === t.id ? "is-on" : ""}`} onClick={() => setTab(t.id)}>
            <t.icon width={14} height={14} />
            {t.label}
          </button>
        ))}
      </div>
      {tab === "presets" ? (
        <div className="eb-panel-body" style={{ paddingTop: 8 }}>
          {presets.length === 0 ? (
            <div className="eb-empty-note">این المان طرح آمادهٔ جداگانه‌ای ندارد؛ از تب‌های محتوا و استایل سفارشی‌اش کن.</div>
          ) : (
            <div className="eb-preset-grid">
              {presets.map((p) => (
                <button key={p.id} type="button" className="eb-preset" onClick={() => onApplyPreset(p.settings)}>
                  <span className="eb-preset-prev" style={{ background: p.tone }}>
                    <LayoutTemplate width={22} height={22} />
                  </span>
                  <span className="eb-preset-meta">
                    <b>{p.label}</b>
                    {p.desc && <small>{p.desc}</small>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
      <div className="eb-panel-body" style={{ paddingTop: 0 }}>
        {list.length === 0 && <div className="eb-empty-note">تنظیماتی در این تب نیست.</div>}
        {list.map((sec) => {
          const on = current === sec.id;
          return (
            <div key={sec.id} className="eb-sec">
              <button type="button" className="eb-sec-head" onClick={() => setOpen(on ? "" : sec.id)} aria-expanded={on}>
                {sec.title}
                {on ? <ChevronUp width={14} height={14} /> : <ChevronDown width={14} height={14} />}
              </button>
              {on && (
                <div className="eb-sec-body">
                  {sec.controls.map((c) => (
                    <Field key={c.key} ctl={c} s={s} device={device} set={onChange} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* single control                                                      */
/* ------------------------------------------------------------------ */

export function Field({ ctl, s, device, set }: { ctl: Ctl; s: Settings; device: Device; set: (key: string, value: any) => void }) {
  if (ctl.show && !ctl.show(s)) return null;
  if (ctl.type === "heading") return <div className="eb-h">{ctl.label}</div>;

  const responsive = !!ctl.responsive;
  const key = ctl.key + (responsive ? suffixOf(device) : "");
  const raw = s[key];
  const value = responsive ? rv(s, ctl.key, device) : raw;
  const inherited = responsive && device !== "desktop" && raw === undefined;
  const write = (v: any) => set(key, v);
  const clear = () => set(key, undefined);
  const DevIcon = DEV_ICON[device];

  const label = ctl.label ? (
    <span className="eb-label">
      {ctl.label}
      {responsive && <span className="eb-dev-ic" title={`مقدار برای ${device}`}><DevIcon width={12} height={12} /></span>}
    </span>
  ) : null;

  const body = (() => {
    switch (ctl.type) {
      case "switch":
        return (
          <div className="eb-ctl-row">
            {label}
            <button type="button" role="switch" aria-checked={!!value} aria-label={ctl.label} className={`eb-switch ${value ? "is-on" : ""}`} onClick={() => write(!value)} />
          </div>
        );
      case "text":
      case "url":
      case "number":
      case "datetime":
        return (
          <>
            {label}
            <input
              className="eb-in"
              type={ctl.type === "number" ? "number" : ctl.type === "datetime" ? "datetime-local" : "text"}
              dir={ctl.type === "url" || ctl.type === "datetime" ? "ltr" : undefined}
              value={value ?? ""}
              min={ctl.min}
              max={ctl.max}
              step={ctl.step}
              placeholder={ctl.placeholder}
              onChange={(e) => write(ctl.type === "number" ? (e.target.value === "" ? undefined : Number(e.target.value)) : e.target.value)}
            />
          </>
        );
      case "textarea":
      case "code":
        return (
          <>
            {label}
            <textarea className={`eb-in ${ctl.type === "code" ? "is-code" : ""}`} rows={ctl.rows ?? 3} value={value ?? ""} placeholder={ctl.placeholder} onChange={(e) => write(e.target.value)} />
          </>
        );
      case "wysiwyg":
        return (
          <>
            {label}
            <Wysiwyg value={typeof value === "string" ? value : ""} onChange={write} />
          </>
        );
      case "slider": {
        const min = ctl.min ?? 0;
        const max = ctl.max ?? 100;
        const shown = value === undefined || value === "" ? "" : value;
        return (
          <>
            {label}
            <div className="eb-slider">
              <input type="range" min={min} max={max} step={ctl.step ?? 1} value={shown === "" ? min : Number(shown)} onChange={(e) => write(Number(e.target.value))} aria-label={ctl.label} />
              <input className="eb-in" type="number" min={min} max={max} step={ctl.step ?? 1} value={shown} placeholder={ctl.unit} onChange={(e) => write(e.target.value === "" ? undefined : Number(e.target.value))} />
              <button type="button" className="eb-x" title="بازنشانی" onClick={clear}>
                <X width={13} height={13} />
              </button>
            </div>
          </>
        );
      }
      case "select":
        return (
          <>
            {label}
            <SelectBox ctl={ctl} value={value} onChange={write} />
          </>
        );
      case "choose":
        return (
          <>
            {label}
            <div className="eb-choose" role="group" aria-label={ctl.label}>
              {ctl.options?.map((o) => {
                const I = o.icon ? ICONS[o.icon] : null;
                return (
                  <button key={o.value} type="button" title={o.label} className={value === o.value ? "is-on" : ""} onClick={() => (value === o.value && ctl.responsive ? clear() : write(o.value))}>
                    {I ? <I width={14} height={14} /> : o.label}
                  </button>
                );
              })}
            </div>
          </>
        );
      case "color":
        return (
          <>
            {label}
            <ColorBox value={value} onChange={write} onClear={clear} />
          </>
        );
      case "dimensions":
        return (
          <>
            {label}
            <Dimensions value={value} onChange={write} onClear={clear} />
          </>
        );
      case "shadow":
        return (
          <>
            {label}
            <ShadowBox value={value} onChange={write} onClear={clear} />
          </>
        );
      case "gradient":
        return (
          <>
            {label}
            <GradientBox value={value} onChange={write} />
          </>
        );
      case "image":
        return (
          <>
            {label}
            <ImageBox value={value} onChange={write} />
          </>
        );
      case "images":
        return (
          <>
            {label}
            <ImagesBox value={Array.isArray(value) ? value : []} onChange={write} />
          </>
        );
      case "icon":
        return (
          <>
            {label}
            <IconPicker value={value} onChange={write} />
          </>
        );
      case "repeater":
        return (
          <>
            {label}
            <Repeater ctl={ctl} value={Array.isArray(value) ? value : []} onChange={write} />
          </>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="eb-ctl" style={inherited ? { opacity: 0.85 } : undefined}>
      {body}
      {ctl.hint && <div className="eb-hint">{ctl.hint}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* pieces                                                              */
/* ------------------------------------------------------------------ */

function SelectBox({ ctl, value, onChange }: { ctl: Ctl; value: any; onChange: (v: any) => void }) {
  const docs = useDocs();
  let options = ctl.options ?? [];
  if (ctl.key === "templateId") {
    options = [{ value: "", label: "— انتخاب کن —" }, ...docs.filter((d) => d.kind === "section").map((d) => ({ value: d.id, label: d.title }))];
  }
  if (ctl.key === "productId" && !options.length) options = CATALOG.map((p) => ({ value: p.id, label: p.name }));
  return (
    <select className="eb-in" value={value ?? ""} onChange={(e) => onChange(e.target.value)} aria-label={ctl.label}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function ColorBox({ value, onChange, onClear }: { value: any; onChange: (v: any) => void; onClear: () => void }) {
  const site = useSite();
  const v = typeof value === "string" ? value : "";
  const globalMatch = site.colors.find((c) => v === `var(--eb-c-${c.id})`);
  const display = globalMatch ? globalMatch.value : v;
  return (
    <div className="eb-ctl" style={{ gap: 8 }}>
      <div className="eb-color">
        <input type="color" value={hexOf(display)} onChange={(e) => onChange(e.target.value)} aria-label="انتخاب رنگ" />
        <input className="eb-in" value={v} placeholder="#000000 / rgba()" onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="eb-x" title="پاک کردن" onClick={onClear}>
          <X width={13} height={13} />
        </button>
      </div>
      <div className="eb-swatches" title="رنگ‌های سراسری سایت">
        {site.colors.map((c) => (
          <button key={c.id} type="button" className="eb-swatch" title={`${c.title} (سراسری)`} style={{ background: c.value }} onClick={() => onChange(`var(--eb-c-${c.id})`)} />
        ))}
      </div>
    </div>
  );
}

function Dimensions({ value, onChange, onClear }: { value: any; onChange: (v: any) => void; onClear: () => void }) {
  const v = value && typeof value === "object" ? value : {};
  const linked = v.linked !== false;
  const sides: [string, string][] = [
    ["top", "بالا"],
    ["right", "راست"],
    ["bottom", "پایین"],
    ["left", "چپ"],
  ];
  const update = (side: string, raw: string) => {
    const n = raw === "" ? "" : Number(raw);
    if (linked) onChange({ top: n, right: n, bottom: n, left: n, linked });
    else onChange({ ...v, [side]: n, linked });
  };
  return (
    <div className="eb-dims">
      {sides.map(([k, l]) => (
        <label key={k}>
          <input className="eb-in" type="number" value={v[k] ?? ""} onChange={(e) => update(k, e.target.value)} aria-label={l} />
          {l}
        </label>
      ))}
      <button type="button" className={`eb-link ${linked ? "is-on" : ""}`} title={linked ? "جدا کردن" : "پیوند دادن"} onClick={() => onChange({ ...v, linked: !linked })}>
        {linked ? <Link2 width={14} height={14} /> : <Link2Off width={14} height={14} />}
      </button>
      <div style={{ gridColumn: "1 / -1", textAlign: "start" }}>
        <button type="button" className="eb-x" onClick={onClear} style={{ fontSize: 11, gap: 4 }}>
          <X width={11} height={11} /> پاک کردن
        </button>
      </div>
    </div>
  );
}

function ShadowBox({ value, onChange, onClear }: { value: any; onChange: (v: any) => void; onClear: () => void }) {
  const v = value && typeof value === "object" ? value : { x: 0, y: 8, blur: 24, spread: 0, color: "" };
  const up = (k: string, val: any) => onChange({ ...v, [k]: val });
  return (
    <div className="eb-ctl" style={{ gap: 8 }}>
      <div className="eb-dims" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        {(
          [
            ["x", "X"],
            ["y", "Y"],
            ["blur", "محو"],
            ["spread", "گسترش"],
          ] as [string, string][]
        ).map(([k, l]) => (
          <label key={k}>
            <input className="eb-in" type="number" value={v[k] ?? 0} onChange={(e) => up(k, Number(e.target.value))} aria-label={l} />
            {l}
          </label>
        ))}
      </div>
      <ColorBox value={v.color} onChange={(c) => up("color", c)} onClear={onClear} />
    </div>
  );
}

function GradientBox({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const v = value && typeof value === "object" ? value : { a: "#16130f", b: "#8c4a2f", angle: 135 };
  const up = (k: string, val: any) => onChange({ ...v, [k]: val });
  return (
    <div className="eb-ctl" style={{ gap: 8 }}>
      <div className="eb-color">
        <input type="color" value={hexOf(v.a)} onChange={(e) => up("a", e.target.value)} aria-label="رنگ اول" />
        <input type="color" value={hexOf(v.b)} onChange={(e) => up("b", e.target.value)} aria-label="رنگ دوم" />
        <div className="eb-slider" style={{ flex: 1 }}>
          <input type="range" min={0} max={360} value={v.angle ?? 135} onChange={(e) => up("angle", Number(e.target.value))} aria-label="زاویه" />
          <span className="eb-label">{v.angle ?? 135}°</span>
        </div>
      </div>
      <div style={{ height: 26, borderRadius: 7, background: `linear-gradient(${v.angle ?? 135}deg,${v.a},${v.b})` }} />
    </div>
  );
}

function ImageBox({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const [stock, setStock] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const url = typeof value === "string" ? value : "";
  const upload = async (f?: File) => {
    if (!f) return;
    try {
      onChange(await fileToDataUrl(f));
    } catch {
      /* ignore broken images */
    }
  };
  return (
    <div className="eb-img">
      <div className="eb-img-preview" style={{ backgroundImage: url ? `url("${resolveImg(url)}")` : undefined }}>
        {!url && "بدون تصویر"}
      </div>
      <div className="eb-img-actions">
        <button type="button" className="eb-btn is-sm" onClick={() => file.current?.click()}>
          <Upload width={13} height={13} /> آپلود
        </button>
        <button type="button" className="eb-btn is-sm" onClick={() => setStock((v) => !v)}>
          کتابخانه
        </button>
        {url && (
          <button type="button" className="eb-btn is-sm is-danger" onClick={() => onChange("")}>
            <X width={13} height={13} /> حذف
          </button>
        )}
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      {stock && (
        <div className="eb-stock">
          {STOCK_IMAGES.map((s) => (
            <button key={s.id} type="button" title={s.label} style={{ backgroundImage: `url("${s.url}")` }} onClick={() => { onChange(`stock:${s.id}`); setStock(false); }} />
          ))}
        </div>
      )}
      <input className="eb-in" dir="ltr" placeholder="یا آدرس تصویر (https://…)" value={url.startsWith("data:") || url.startsWith("stock:") ? "" : url} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function ImagesBox({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [stock, setStock] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const upload = async (files?: FileList | null) => {
    if (!files?.length) return;
    const out: string[] = [];
    for (const f of Array.from(files)) {
      try {
        out.push(await fileToDataUrl(f, 1400));
      } catch {
        /* skip */
      }
    }
    onChange([...value, ...out]);
  };
  return (
    <div className="eb-img">
      <div className="eb-imgs">
        {value.map((u, i) => (
          <div key={i} style={{ backgroundImage: `url("${resolveImg(u)}")` }}>
            <button type="button" className="eb-x" aria-label="حذف تصویر" onClick={() => onChange(value.filter((_, n) => n !== i))}>
              <X width={12} height={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="eb-img-actions">
        <button type="button" className="eb-btn is-sm" onClick={() => file.current?.click()}>
          <Upload width={13} height={13} /> آپلود چند تصویر
        </button>
        <button type="button" className="eb-btn is-sm" onClick={() => setStock((v) => !v)}>
          کتابخانه
        </button>
        {value.length > 0 && (
          <button type="button" className="eb-btn is-sm is-danger" onClick={() => onChange([])}>
            پاک کردن همه
          </button>
        )}
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      {stock && (
        <div className="eb-stock">
          {STOCK_IMAGES.map((s) => (
            <button key={s.id} type="button" title={s.label} style={{ backgroundImage: `url("${s.url}")` }} onClick={() => onChange([...value, `stock:${s.id}`])} />
          ))}
        </div>
      )}
    </div>
  );
}

function IconPicker({ value, onChange }: { value: any; onChange: (v: any) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const Cur = typeof value === "string" ? ICONS[value] : null;
  const list = PICKER_ICONS.filter((n) => n.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="eb-img">
      <div className="eb-img-actions">
        <button type="button" className="eb-btn is-sm" onClick={() => setOpen((v) => !v)}>
          {Cur ? <Cur width={15} height={15} /> : <Search width={13} height={13} />} {value || "انتخاب آیکن"}
        </button>
        {value && (
          <button type="button" className="eb-btn is-sm is-danger" onClick={() => onChange("")}>
            <X width={13} height={13} />
          </button>
        )}
      </div>
      {open && (
        <>
          <input className="eb-in" placeholder="جست‌وجوی آیکن (انگلیسی)" dir="ltr" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="eb-icons">
            {list.map((n) => {
              const I = ICONS[n];
              return (
                <button key={n} type="button" title={n} className={value === n ? "is-on" : ""} onClick={() => { onChange(n); setOpen(false); }}>
                  <I width={16} height={16} />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Repeater({ ctl, value, onChange }: { ctl: Ctl; value: Settings[]; onChange: (v: Settings[]) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const fields = ctl.fields ?? [];
  const labelOf = (it: Settings, i: number) => {
    const raw = it[ctl.itemLabel ?? "title"];
    const opt = fields.find((f) => f.key === ctl.itemLabel)?.options?.find((o) => o.value === raw)?.label;
    return String(opt ?? raw ?? "").slice(0, 40) || `آیتم ${i + 1}`;
  };
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    setOpen(j);
  };
  return (
    <div className="eb-rep">
      {value.map((it, i) => (
        <div key={i} className="eb-rep-item">
          <div className="eb-rep-head">
            <button type="button" className="eb-rep-title" onClick={() => setOpen(open === i ? null : i)}>
              {labelOf(it, i)}
            </button>
            <button type="button" className="eb-x" title="بالا" onClick={() => move(i, -1)}><ArrowUp width={13} height={13} /></button>
            <button type="button" className="eb-x" title="پایین" onClick={() => move(i, 1)}><ArrowDown width={13} height={13} /></button>
            <button type="button" className="eb-x" title="تکرار" onClick={() => onChange([...value.slice(0, i + 1), cloneDeep(it), ...value.slice(i + 1)])}><Copy width={13} height={13} /></button>
            <button type="button" className="eb-x" title="حذف" onClick={() => onChange(value.filter((_, n) => n !== i))}><Trash2 width={13} height={13} /></button>
          </div>
          {open === i && (
            <div className="eb-rep-body">
              {fields.map((f) => (
                <Field key={f.key} ctl={f} s={it} device="desktop" set={(k, v) => onChange(value.map((x, n) => (n === i ? { ...x, [k]: v } : x)))} />
              ))}
            </div>
          )}
        </div>
      ))}
      <button
        type="button"
        className="eb-btn is-sm"
        onClick={() => {
          onChange([...value, cloneDeep(ctl.defaultItem ?? {})]);
          setOpen(value.length);
        }}
      >
        <Plus width={13} height={13} /> افزودن آیتم
      </button>
    </div>
  );
}

function Wysiwyg({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerHTML !== value) el.innerHTML = value;
  }, [value]);
  const cmd = (c: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(c, false, arg);
    if (ref.current) onChange(ref.current.innerHTML);
  };
  return (
    <div className="eb-wys">
      <div className="eb-wys-bar">
        <button type="button" title="پررنگ" onClick={() => cmd("bold")}>B</button>
        <button type="button" title="کج" onClick={() => cmd("italic")} style={{ fontStyle: "italic" }}>I</button>
        <button type="button" title="زیرخط" onClick={() => cmd("underline")} style={{ textDecoration: "underline" }}>U</button>
        <button type="button" title="لیست" onClick={() => cmd("insertUnorderedList")}>•</button>
        <button type="button" title="لیست شماره‌دار" onClick={() => cmd("insertOrderedList")}>۱.</button>
        <button type="button" title="عنوان" onClick={() => cmd("formatBlock", "h3")}>H</button>
        <button type="button" title="پاراگراف" onClick={() => cmd("formatBlock", "p")}>¶</button>
        <button
          type="button"
          title="لینک"
          onClick={() => {
            const u = window.prompt("آدرس لینک:", "https://");
            if (u) cmd("createLink", u);
          }}
        >
          🔗
        </button>
        <button type="button" title="حذف قالب" onClick={() => cmd("removeFormat")}>⌫</button>
      </div>
      <div ref={ref} className="eb-wys-area" contentEditable suppressContentEditableWarning onInput={(e) => onChange(e.currentTarget.innerHTML)} onKeyDown={(e) => e.stopPropagation()} />
    </div>
  );
}
