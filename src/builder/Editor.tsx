import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  ClipboardPaste,
  Clipboard,
  Copy,
  Eye,
  EyeOff,
  FileCode2,
  FileJson,
  History,
  Keyboard,
  LayoutTemplate,
  Layers,
  Menu,
  Monitor,
  Plus,
  Redo2,
  Rocket,
  Save,
  Settings2,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
  Globe,
  Home,
  Paintbrush,
  ExternalLink,
} from "lucide-react";
import {
  DEVICES,
  DEVICE_LABEL,
  DEVICE_WIDTH,
  KIND_LABEL,
  type BDoc,
  type BNode,
  type Device,
} from "./core";
import { ControlsPanel } from "./ControlsUI";
import { DeviceCtx } from "./ctx";
import { docCss, ensureFonts } from "./css";
import { exportDoc, getDoc, saveDoc, siteVars, useDocs, useSite, createDoc } from "./docs";
import {
  ContextMenu,
  ElementsPanel,
  LibraryModal,
  Modal,
  Navigator,
  PageSettingsModal,
  ShortcutsModal,
  SiteSettingsPanel,
  StructurePicker,
  type CtxItem,
} from "./EditorParts";
import { EditorContext, RenderNodes, type DragPayload, type DropPos, type EditorApi } from "./Renderer";
import { useEntranceAnimations } from "./anim";
import { controlsOf, nodeLabel, WIDGETS } from "./registry";
import { adaptNode, cloneNode, containsNode, findNode, findParent, insertNode, mapNode, newContainer, newSection, newWidget, removeNode, sectionDepth, evenColumns, newColumn } from "./tree";
import { cloneDeep, download } from "./util";
import { cloneNodes } from "./clone";
import { useCart } from "@/state/cart";

/* ------------------------------------------------------------------ */
/* history reducer                                                     */
/* ------------------------------------------------------------------ */

interface Snap {
  content: BNode[];
  label: string;
  key?: string;
  t: number;
}

interface State {
  doc: BDoc;
  past: Snap[];
  future: Snap[];
  dirty: boolean;
}

type Action =
  | { type: "apply"; label: string; fn: (c: BNode[]) => BNode[]; key?: string }
  | { type: "meta"; patch: Partial<BDoc> }
  | { type: "undo"; n?: number }
  | { type: "redo" }
  | { type: "saved"; doc: BDoc };

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "apply": {
      const next = a.fn(state.doc.content);
      if (next === state.doc.content) return state;
      const last = state.past[state.past.length - 1];
      const coalesce = !!a.key && !!last && last.key === a.key && Date.now() - last.t < 1400;
      const past = coalesce ? state.past : [...state.past, { content: state.doc.content, label: a.label, key: a.key, t: Date.now() }].slice(-120);
      if (coalesce && last) last.t = Date.now();
      return { ...state, doc: { ...state.doc, content: next }, past, future: [], dirty: true };
    }
    case "meta":
      return { ...state, doc: { ...state.doc, ...a.patch }, dirty: true };
    case "undo": {
      let s = state;
      for (let i = 0; i < (a.n ?? 1); i++) {
        const snap = s.past[s.past.length - 1];
        if (!snap) break;
        s = {
          ...s,
          doc: { ...s.doc, content: snap.content },
          past: s.past.slice(0, -1),
          future: [{ content: s.doc.content, label: snap.label, t: Date.now() }, ...s.future],
          dirty: true,
        };
      }
      return s;
    }
    case "redo": {
      const snap = state.future[0];
      if (!snap) return state;
      return {
        ...state,
        doc: { ...state.doc, content: snap.content },
        past: [...state.past, { content: state.doc.content, label: snap.label, t: Date.now() }],
        future: state.future.slice(1),
        dirty: true,
      };
    }
    case "saved":
      return { ...state, doc: a.doc, dirty: false };
    default:
      return state;
  }
}

const isEditable = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
};

const baseKey = (k: string) => k.replace(/(Tablet|Mobile)$/, "");

/* ------------------------------------------------------------------ */
/* route wrapper                                                       */
/* ------------------------------------------------------------------ */

export function EditorPage() {
  const { id } = useParams();
  const docs = useDocs();
  const doc = docs.find((d) => d.id === id);
  if (!doc) {
    return (
      <div className="ebd">
        <div className="ebd-main">
          <div className="ebd-empty">
            این سند پیدا نشد.
            <br />
            <Link to="/builder" className="ebd-btn is-primary" style={{ marginTop: 12 }}>
              بازگشت به داشبورد
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return <EditorInner key={doc.id} initial={getDoc(doc.id) ?? doc} />;
}

/* ------------------------------------------------------------------ */
/* editor                                                              */
/* ------------------------------------------------------------------ */

type PanelMode = "elements" | "edit" | "history" | "site";

function EditorInner({ initial }: { initial: BDoc }) {
  const navigate = useNavigate();
  const { notify } = useCart();
  const site = useSite();
  const [state, dispatch] = useReducer(reducer, { doc: initial, past: [], future: [], dirty: false });
  const { doc } = state;
  const content = doc.content;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; pos: DropPos } | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [panel, setPanel] = useState<PanelMode>("elements");
  const [navOpen, setNavOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<null | "library" | "settings" | "keys" | "structure">(null);
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null);
  const [clip, setClip] = useState<BNode | null>(null);
  const [styleClip, setStyleClip] = useState<Record<string, any> | null>(null);

  const dragRef = useRef<DragPayload | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const selected = selectedId ? findNode(content, selectedId) : null;

  /* ---------------- mutations ---------------- */

  const apply = useCallback((label: string, fn: (c: BNode[]) => BNode[], key?: string) => dispatch({ type: "apply", label, fn, key }), []);

  const select = useCallback((id: string | null) => {
    setSelectedId(id);
    if (id) setPanel((p) => (p === "site" || p === "history" ? "edit" : "edit"));
    else setPanel((p) => (p === "edit" ? "elements" : p));
  }, []);

  const setSetting = useCallback(
    (id: string, key: string, value: any) =>
      apply(
        "تغییر تنظیمات",
        (c) =>
          mapNode(c, id, (n) => {
            const settings = { ...n.settings };
            if (value === undefined) delete settings[key];
            else settings[key] = value;
            return { ...n, settings };
          }),
        `${id}:${key}`,
      ),
    [apply],
  );

  /** Where would `node` land if inserted at (parentId, index)? */
  const parentKind = (parentId: string | null) => (parentId === null ? ("root" as const) : (findNode(content, parentId)?.type ?? "root"));

  const resolve = (target: BNode, pos: DropPos) => {
    const payload = dragRef.current;
    if (!payload) return null;
    let parentId: string | null;
    let index: number;
    if (pos === "inside") {
      parentId = target.id;
      index = target.children.length;
    } else {
      const info = findParent(content, target.id);
      if (!info) return null;
      parentId = info.parent?.id ?? null;
      index = info.index + (pos === "after" ? 1 : 0);
    }
    if (payload.kind === "move") {
      const src = findNode(content, payload.id ?? "");
      if (!src) return null;
      if (target.id === src.id || containsNode(src, target.id)) return null;
    }
    const kind = parentKind(parentId);
    const inner = kind === "column" && parentId ? sectionDepth(content, parentId) >= 1 : false;
    const probe = { id: "probe", type: payload.type, settings: {}, children: [] } as BNode;
    if (!adaptNode(probe, kind, inner)) return null;
    return { parentId, index, kind, inner, payload };
  };

  const canDrop = (target: BNode, pos: DropPos) => !!resolve(target, pos);

  const prune = (c: BNode[]): BNode[] =>
    c
      .map((n) => (n.children.length ? { ...n, children: prune(n.children) } : n))
      .filter((n) => !(n.type === "section" && n.children.length === 0));

  /** place a node (new or moved) at a resolved gap */
  const place = (parentId: string | null, index: number, node: BNode, inner: boolean, moveFrom?: string, label = "إضافه کردن") => {
    const kind = parentKind(parentId);
    const adapted = adaptNode(node, kind, inner);
    if (!adapted) return;
    apply(label, (c) => {
      let next = c;
      let idx = index;
      if (moveFrom) {
        const info = findParent(c, moveFrom);
        if (info && (info.parent?.id ?? null) === parentId && info.index < idx) idx -= 1;
        next = removeNode(next, moveFrom);
      }
      next = insertNode(next, parentId, idx, adapted);
      return moveFrom ? prune(next) : next;
    });
    setSelectedId(node.id);
    setPanel("edit");
  };

  const performDrop = (target: BNode, pos: DropPos) => {
    const r = resolve(target, pos);
    const payload = dragRef.current;
    setDrop(null);
    setDragId(null);
    dragRef.current = null;
    if (!r || !payload) return;
    if (payload.kind === "move") {
      const src = findNode(content, payload.id ?? "");
      if (src) place(r.parentId, r.index, src, r.inner, src.id, "جابه‌جایی");
    } else if (payload.make) {
      place(r.parentId, r.index, payload.make(), r.inner, undefined, "افزودن ویجت");
    }
  };

  /** insert at the current selection (click-to-add, paste, templates) */
  const insertAtSelection = (node: BNode, label: string) => {
    const sel = selected;
    if (!sel) {
      const wrapped = adaptNode(node, "root", false);
      if (wrapped) {
        apply(label, (c) => insertNode(c, null, c.length, wrapped));
        setSelectedId(node.id);
        setPanel("edit");
      }
      return;
    }
    if (sel.type === "container") {
      // dropping inside a container nests it (the whole point of containers)
      place(sel.id, sel.children.length, node, false, undefined, label);
    } else if (sel.type === "column") {
      const inner = sectionDepth(content, sel.id) >= 1;
      place(sel.id, sel.children.length, node, inner, undefined, label);
    } else if (sel.type === "widget") {
      const info = findParent(content, sel.id);
      if (info?.parent) place(info.parent.id, info.index + 1, node, sectionDepth(content, info.parent.id) >= 1, undefined, label);
    } else {
      // section selected → append inside its first column (widget) or after it (section)
      if (node.type === "section") {
        const info = findParent(content, sel.id);
        place(info?.parent?.id ?? null, (info?.index ?? content.length - 1) + 1, node, false, undefined, label);
      } else {
        const firstCol = sel.children[0];
        if (firstCol) place(firstCol.id, firstCol.children.length, node, sectionDepth(content, firstCol.id) >= 1, undefined, label);
      }
    }
  };

  const addWidget = (type: string) => insertAtSelection(newWidget(type), "افزودن ویجت");

  const addStructure = (cols: number[]) => {
    const sec = newSection(cols);
    const idx = selected ? (() => {
      const top = (function climb(id: string): BNode | null {
        const info = findParent(content, id);
        if (!info) return null;
        return info.parent ? climb(info.parent.id) ?? info.parent : findNode(content, id);
      })(selected.id);
      const ti = top ? content.findIndex((n) => n.id === top.id) : -1;
      return ti >= 0 ? ti + 1 : content.length;
    })() : content.length;
    apply("افزودن بخش", (c) => insertNode(c, null, idx, sec));
    setSelectedId(sec.children[0]?.id ?? sec.id);
    setPanel("edit");
    setModal(null);
  };

  const duplicate = (id: string) => {
    const info = findParent(content, id);
    const n = findNode(content, id);
    if (!info || !n) return;
    const copy = cloneNode(n);
    apply("تکرار المان", (c) => insertNode(c, info.parent?.id ?? null, info.index + 1, copy));
    setSelectedId(copy.id);
  };

  const remove = (id: string) => {
    apply("حذف المان", (c) => {
      let next = removeNode(c, id);
      // a section left without columns disappears
      next = prune(next);
      return next;
    });
    if (selectedId && (selectedId === id || (findNode(content, id) && containsNode(findNode(content, id) as BNode, selectedId)))) {
      setSelectedId(null);
      setPanel("elements");
    }
  };

  /** Adds a nested container (with a soft background) inside any container/column. */
  const addContainer = (parentId: string) => {
    const node = newContainer([], {
      bgType: "color",
      bgColor: "#f7f3ed",
      boxBorderStyle: "solid",
      boxBorderWidth: { top: 1, right: 1, bottom: 1, left: 1, linked: true },
      boxBorderColor: "rgba(0,0,0,.08)",
      boxRadius: { top: 18, right: 18, bottom: 18, left: 18, linked: true },
    });
    apply("افزودن کانتینر", (c) => {
      const parent = findNode(c, parentId);
      if (!parent) return c;
      return insertNode(c, parentId, parent.children.length, node);
    });
    setSelectedId(node.id);
    setPanel("edit");
  };

  const addColumn = (sectionId: string) => {
    apply("افزودن ستون", (c) => mapNode(c, sectionId, (s) => evenColumns({ ...s, children: [...s.children, newColumn([], 100)] })));
  };

  const copyNode = (id: string) => {
    const n = findNode(content, id);
    if (n) {
      setClip(cloneDeep(n));
      notify("المان کپی شد", "برای چسباندن Ctrl+V یا راست‌کلیک.");
    }
  };

  const pasteNode = () => {
    if (!clip) return;
    insertAtSelection(cloneNode(clip), "چسباندن المان");
  };

  const styleKeysOf = (n: BNode) => new Set(controlsOf(n).filter((c) => !c.key.startsWith("_h_")).map((c) => c.key));
  const contentKeysOf = (n: BNode) => {
    if (n.type !== "widget") return new Set<string>();
    const def = n.widget ? WIDGETS[n.widget] : undefined;
    return new Set((def?.sections ?? []).filter((s) => s.tab === "content").flatMap((s) => s.controls.map((c) => c.key)));
  };

  const copyStyle = (id: string) => {
    const n = findNode(content, id);
    if (!n) return;
    const keys = styleKeysOf(n);
    const content_ = contentKeysOf(n);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(n.settings)) {
      const b = baseKey(k);
      if (keys.has(b) && !content_.has(b) && v !== undefined) out[k] = cloneDeep(v);
    }
    setStyleClip(out);
    notify("استایل کپی شد", `${Object.keys(out).length.toLocaleString("fa-IR")} تنظیم`);
  };

  const pasteStyle = (id: string) => {
    if (!styleClip) return;
    apply("چسباندن استایل", (c) => mapNode(c, id, (n) => ({ ...n, settings: { ...n.settings, ...cloneDeep(styleClip) } })));
  };

  const saveAsTemplate = (id: string) => {
    const n = findNode(content, id);
    if (!n) return;
    const title = window.prompt("نام قالب:", `${nodeLabel(n)} من`);
    if (!title) return;
    const nodes = n.type === "section" ? [cloneNode(n)] : [adaptNode(cloneNode(n), "root", false) as BNode];
    createDoc("section", title, nodes);
    notify("قالب ذخیره شد", "در کتابخانه (قالب‌های من) پیدا می‌شود.");
  };

  /* ---------------- save / publish ---------------- */

  const save = (publish?: boolean) => {
    const next: BDoc = { ...stateRef.current.doc, status: publish ? "published" : stateRef.current.doc.status };
    if (saveDoc(next)) {
      dispatch({ type: "saved", doc: { ...next } });
      notify(publish ? "منتشر شد" : "ذخیره شد", publish ? "نسخهٔ جدید روی سایت زنده است." : undefined);
    } else {
      notify("ذخیره نشد", "حافظهٔ مرورگر پر است؛ تصاویر آپلودی را کم کن.");
    }
  };

  const exit = () => {
    if (state.dirty && !window.confirm("تغییرات ذخیره‌نشده از بین می‌روند. خارج شویم؟")) return;
    navigate("/builder");
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (stateRef.current.dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const viewLive = () => {
    if (doc.kind === "page" || doc.kind === "landing") window.open(`#/p/${doc.slug}`, "_blank");
    else window.open("#/", "_blank");
  };

  const exportHtml = () => {
    const root = frameRef.current?.querySelector(".eb-root");
    if (!root) return;
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll(".eb-edit-only").forEach((el) => el.remove());
    clone.querySelectorAll("style").forEach((el) => el.remove());
    clone.querySelectorAll("[data-eb-id]").forEach((el) => el.removeAttribute("data-eb-id"));
    clone.querySelectorAll(".eb-node").forEach((el) => el.classList.remove("eb-node", "is-selected", "is-hover"));
    let base = "";
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) {
          const t = rule.cssText;
          if (/\.(ew|eb)-|@keyframes (eb|ebAh)/.test(t) && !/\.eb-(app|top|panel|tag|nav|modal|ctx|tpl|struct|canvas|frame|empty-col|add-area|drop|sec|ptab|tile|in|ctl|btn|iconbtn)/.test(t)) base += t + "\n";
        }
      } catch {
        /* cross-origin sheet */
      }
    }
    const html = `<!doctype html>\n<html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${doc.title}</title>\n<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700&family=Instrument+Serif&display=swap" rel="stylesheet">\n<style>body{margin:0;font-family:Vazirmatn,system-ui,sans-serif}\n${base}\n${docCss(doc, "live", site.customCss)}</style></head><body>\n${clone.outerHTML.replace(/ eb-anim a-\w+/g, "")}\n</body></html>`;
    download(`${doc.slug || "page"}.html`, html, "text/html");
    notify("خروجی HTML ساخته شد", "نسخهٔ ایستا (بدون اسکریپت) دانلود شد.");
  };

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const typing = isEditable(e.target);
      const k = e.key.toLowerCase();
      if (mod && k === "s") {
        e.preventDefault();
        save();
      } else if (mod && k === "z" && !typing) {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "redo" : "undo" });
      } else if (mod && k === "y" && !typing) {
        e.preventDefault();
        dispatch({ type: "redo" });
      } else if (mod && e.shiftKey && k === "p") {
        e.preventDefault();
        setPreview((v) => !v);
      } else if (mod && k === "i" && !typing) {
        e.preventDefault();
        setNavOpen((v) => !v);
      } else if (!typing && selectedId) {
        if (mod && k === "d") {
          e.preventDefault();
          duplicate(selectedId);
        } else if (mod && k === "c") {
          copyNode(selectedId);
        } else if ((e.key === "Delete" || e.key === "Backspace") && !mod) {
          e.preventDefault();
          remove(selectedId);
        } else if (e.key === "Escape") {
          select(null);
        }
      } else if (!typing && mod && k === "v") {
        pasteNode();
      } else if (e.key === "Escape" && !typing) {
        setPreview(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------------- canvas css ---------------- */

  const css = useMemo(() => docCss(doc, device, site.customCss), [doc, device, site.customCss]);
  useEffect(() => ensureFonts(css + JSON.stringify([site.headingFont, site.bodyFont])), [css, site.headingFont, site.bodyFont]);
  useEntranceAnimations(frameRef, [preview, doc.content, device]);

  /* ---------------- editor api for the renderer ---------------- */

  const api: EditorApi = {
    content,
    selectedId: selected ? selected.id : null,
    hoverId,
    dragId,
    drop,
    select,
    setHover: setHoverId,
    dragRef,
    startDrag: (p) => {
      dragRef.current = p;
      setDragId(p.kind === "move" ? (p.id ?? null) : null);
    },
    endDrag: () => {
      dragRef.current = null;
      setDragId(null);
      setDrop(null);
    },
    setDrop,
    canDrop,
    performDrop,
    commit: (id, key, value) => setSetting(id, key, value),
    duplicate,
    remove,
    addColumn,
    addContainer,
    openElements: () => {
      setPanel("elements");
    },
    contextMenu: (id, x, y) => setCtx({ id, x, y }),
  };

  const ctxItems = (id: string): CtxItem[] => {
    const n = findNode(content, id);
    if (!n) return [];
    return [
      { label: "تکرار", icon: <Copy width={14} height={14} />, onClick: () => duplicate(id) },
      { label: "کپی", icon: <Clipboard width={14} height={14} />, onClick: () => copyNode(id) },
      { label: "چسباندن", icon: <ClipboardPaste width={14} height={14} />, disabled: !clip, onClick: pasteNode },
      { divider: true, label: "", onClick: () => undefined },
      { label: "کپی استایل", onClick: () => copyStyle(id) },
      { label: "چسباندن استایل", disabled: !styleClip, onClick: () => pasteStyle(id) },
      ...(n.type === "section" || n.type === "widget" ? [{ label: "ذخیره به‌عنوان قالب", icon: <Save width={14} height={14} />, onClick: () => saveAsTemplate(id) }] : []),
      { divider: true, label: "", onClick: () => undefined },
      { label: "حذف", icon: <Trash2 width={14} height={14} />, onClick: () => remove(id) },
    ];
  };

  const insertTemplate = (nodes: BNode[], isPage: boolean) => {
    const fresh = cloneNodes(nodes);
    if (isPage && content.length && window.confirm("کل صفحه با این قالب جایگزین شود؟\n(لغو = افزودن به انتهای صفحه)")) {
      apply("جایگزینی صفحه با قالب", () => fresh);
    } else {
      apply("افزودن قالب", (c) => [...c, ...fresh]);
    }
    setSelectedId(null);
    setPanel("elements");
  };

  const insertSaved = (nodes: BNode[]) => {
    const idx = content.length;
    apply("افزودن قالب ذخیره‌شده", (c) => nodes.reduce((acc, n, i) => insertNode(acc, null, idx + i, adaptNode(n, "root", false) as BNode), c));
  };

  const vars = siteVars(site) as React.CSSProperties;
  const frameWidth = DEVICE_WIDTH[device];
  const selectedDef = selected?.widget ? WIDGETS[selected.widget] : undefined;
  const SelIcon = selectedDef?.icon;

  return (
    <div className="eb-app" onMouseDown={() => setMenu(false)}>
      {/* ---------------- top bar ---------------- */}
      <div className="eb-top">
        <div style={{ position: "relative" }}>
          <button type="button" className={`eb-iconbtn ${menu ? "is-on" : ""}`} aria-label="منوی صفحه‌ساز" aria-expanded={menu} onMouseDown={(e) => e.stopPropagation()} onClick={() => setMenu((v) => !v)}>
            <Menu width={18} height={18} />
          </button>
          {menu && (
            <div className="eb-ctx" style={{ position: "absolute", top: 40, right: 0, left: "auto", minWidth: 220 }} onMouseDown={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => { setMenu(false); setModal("settings"); }}><Settings2 width={14} height={14} /> تنظیمات {KIND_LABEL[doc.kind]}</button>
              <button type="button" onClick={() => { setMenu(false); setPanel("site"); }}><Paintbrush width={14} height={14} /> استایل‌های سراسری سایت</button>
              <button type="button" onClick={() => { setMenu(false); setModal("library"); }}><LayoutTemplate width={14} height={14} /> کتابخانهٔ قالب‌ها</button>
              <hr />
              <button type="button" onClick={() => { setMenu(false); download(`${doc.slug || "doc"}.json`, exportDoc(doc)); }}><FileJson width={14} height={14} /> خروجی JSON</button>
              <button type="button" onClick={() => { setMenu(false); exportHtml(); }}><FileCode2 width={14} height={14} /> خروجی HTML ایستا</button>
              <button type="button" onClick={() => { setMenu(false); setModal("keys"); }}><Keyboard width={14} height={14} /> میانبرهای صفحه‌کلید</button>
              <hr />
              <button type="button" onClick={() => { setMenu(false); viewLive(); }}><ExternalLink width={14} height={14} /> مشاهدهٔ در سایت</button>
              <button type="button" onClick={() => { setMenu(false); exit(); }}><Home width={14} height={14} /> بازگشت به داشبورد</button>
            </div>
          )}
        </div>

        <div className="eb-top-title">
          <input value={doc.title} onChange={(e) => dispatch({ type: "meta", patch: { title: e.target.value } })} aria-label="عنوان" />
          <span className="eb-badge">{KIND_LABEL[doc.kind]}</span>
          <span className={`eb-badge ${doc.status === "published" ? "is-live" : ""}`}>{doc.status === "published" ? "منتشرشده" : "پیش‌نویس"}</span>
          {state.dirty && <span className="eb-badge" title="ذخیره‌نشده">●</span>}
        </div>

        <div className="eb-top-spacer" />

        <div className="eb-devices" role="group" aria-label="حالت نمایش">
          {DEVICES.map((d) => {
            const I = d === "desktop" ? Monitor : d === "tablet" ? Tablet : Smartphone;
            return (
              <button key={d} type="button" className={`eb-iconbtn ${device === d ? "is-on" : ""}`} title={DEVICE_LABEL[d]} aria-label={DEVICE_LABEL[d]} aria-pressed={device === d} onClick={() => setDevice(d)}>
                <I width={16} height={16} />
              </button>
            );
          })}
        </div>

        <button type="button" className="eb-iconbtn" title="واگرد (Ctrl+Z)" aria-label="واگرد" disabled={!state.past.length} onClick={() => dispatch({ type: "undo" })}><Undo2 width={16} height={16} /></button>
        <button type="button" className="eb-iconbtn" title="تکرار (Ctrl+Shift+Z)" aria-label="تکرار" disabled={!state.future.length} onClick={() => dispatch({ type: "redo" })}><Redo2 width={16} height={16} /></button>
        <button type="button" className={`eb-iconbtn ${panel === "history" ? "is-on" : ""}`} title="تاریخچه" aria-label="تاریخچه" onClick={() => setPanel(panel === "history" ? "elements" : "history")}><History width={16} height={16} /></button>
        <button type="button" className={`eb-iconbtn ${navOpen ? "is-on" : ""}`} title="ناوبیگیتور (Ctrl+I)" aria-label="ناوبیگیتور" onClick={() => setNavOpen((v) => !v)}><Layers width={16} height={16} /></button>
        <button type="button" className="eb-iconbtn" title="قالب‌ها" aria-label="کتابخانهٔ قالب‌ها" onClick={() => setModal("library")}><LayoutTemplate width={16} height={16} /></button>
        <button type="button" className={`eb-iconbtn ${preview ? "is-on" : ""}`} title="پیش‌نمایش (Ctrl+Shift+P)" aria-label="پیش‌نمایش" aria-pressed={preview} onClick={() => { setPreview((v) => !v); select(null); }}>
          {preview ? <EyeOff width={16} height={16} /> : <Eye width={16} height={16} />}
        </button>

        <button type="button" className="eb-btn" onClick={() => save()} disabled={!state.dirty}><Save width={14} height={14} /> ذخیره</button>
        <button type="button" className="eb-btn is-primary" onClick={() => save(true)}><Rocket width={14} height={14} /> {doc.status === "published" ? "به‌روزرسانی" : "انتشار"}</button>
        <button type="button" className="eb-iconbtn" title="خروج" aria-label="خروج" onClick={exit}><ArrowRight width={16} height={16} style={{ transform: "scaleX(-1)" }} /></button>
      </div>

      {/* ---------------- body ---------------- */}
      <div className="eb-body">
        {!preview && (
          <aside className="eb-panel" aria-label="پنل ویرایش">
            {panel === "edit" && selected ? (
              <>
                <div className="eb-panel-head">
                  <span style={{ display: "inline-flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                    <button type="button" className="eb-iconbtn" style={{ width: 28, height: 28 }} aria-label="بازگشت به ویجت‌ها" onClick={() => setPanel("elements")}><ArrowRight width={15} height={15} style={{ transform: "scaleX(-1)" }} /></button>
                    {SelIcon && <SelIcon width={16} height={16} />}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>ویرایش {nodeLabel(selected)}</span>
                  </span>
                  <span style={{ display: "inline-flex" }}>
                    <button type="button" className="eb-iconbtn" style={{ width: 28, height: 28 }} title="کپی استایل" aria-label="کپی استایل" onClick={() => copyStyle(selected.id)}><Clipboard width={14} height={14} /></button>
                    <button type="button" className="eb-iconbtn" style={{ width: 28, height: 28 }} title="چسباندن استایل" aria-label="چسباندن استایل" disabled={!styleClip} onClick={() => pasteStyle(selected.id)}><ClipboardPaste width={14} height={14} /></button>
                    <button type="button" className="eb-iconbtn" style={{ width: 28, height: 28 }} title="تکرار" aria-label="تکرار" onClick={() => duplicate(selected.id)}><Copy width={14} height={14} /></button>
                    <button type="button" className="eb-iconbtn" style={{ width: 28, height: 28 }} title="حذف" aria-label="حذف" onClick={() => remove(selected.id)}><Trash2 width={14} height={14} /></button>
                  </span>
                </div>
                <ControlsPanel
                    key={selected.id}
                    node={selected}
                    device={device}
                    onChange={(k, v) => setSetting(selected.id, k, v)}
                    onApplyPreset={(preset) =>
                      apply("اعمال طرح آماده", (c) => mapNode(c, selected.id, (n) => ({ ...n, settings: { ...n.settings, ...cloneDeep(preset) } })))
                    }
                  />
              </>
            ) : (
              <>
                <div className="eb-ptabs">
                  <button type="button" className={`eb-ptab ${panel === "elements" || panel === "edit" ? "is-on" : ""}`} onClick={() => setPanel("elements")}><Plus width={14} height={14} /> ویجت‌ها</button>
                  <button type="button" className={`eb-ptab ${panel === "site" ? "is-on" : ""}`} onClick={() => setPanel("site")}><Globe width={14} height={14} /> سراسری</button>
                  <button type="button" className={`eb-ptab ${panel === "history" ? "is-on" : ""}`} onClick={() => setPanel("history")}><History width={14} height={14} /> تاریخچه</button>
                </div>
                {panel === "site" ? (
                  <SiteSettingsPanel site={site} />
                ) : panel === "history" ? (
                  <div className="eb-panel-body">
                    {state.past.length === 0 && state.future.length === 0 && <div className="eb-empty-note">هنوز تغییری ثبت نشده است.</div>}
                    {[...state.future].reverse().map((s, i) => (
                      <button key={`f${i}`} type="button" className="eb-nav-row" style={{ width: "100%", opacity: 0.45, background: "transparent", border: 0, color: "inherit", textAlign: "start" }} onClick={() => { for (let n = 0; n <= i; n++) dispatch({ type: "redo" }); }}>
                        ↷ {s.label}
                      </button>
                    ))}
                    {[...state.past].reverse().map((s, i) => (
                      <button key={`p${i}`} type="button" className={`eb-nav-row ${i === 0 ? "is-on" : ""}`} style={{ width: "100%", background: i === 0 ? undefined : "transparent", border: 0, color: "inherit", textAlign: "start" }} onClick={() => dispatch({ type: "undo", n: i + 1 })}>
                        {i === 0 ? "● " : "↶ "}{s.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <ElementsPanel onAdd={addWidget} onAddContainer={() => insertAtSelection(newContainer([], { bgType: "color", bgColor: "#f7f3ed", boxRadius: { top: 18, right: 18, bottom: 18, left: 18, linked: true } }), "افزودن کانتینر")} startDrag={api.startDrag} endDrag={api.endDrag} onStructure={addStructure} />
                )}
              </>
            )}
          </aside>
        )}

        {/* ---------------- canvas ---------------- */}
        <div
          className="eb-canvas"
          onClick={() => !preview && select(null)}
          onMouseLeave={() => setHoverId(null)}
          onDragLeave={(e) => {
            if (!(e.relatedTarget instanceof Node) || !e.currentTarget.contains(e.relatedTarget)) setDrop(null);
          }}
        >
          <div ref={frameRef} className={`eb-frame ${device !== "desktop" ? "is-device" : ""} ${preview ? "is-preview" : "eb-edit"}`} style={{ width: frameWidth ?? "100%" }}>
            <DeviceCtx.Provider value={device}>
              <EditorContext.Provider value={preview ? null : api}>
                <div className={`eb-root eb-page-${doc.id}`} style={vars}>
                  <style>{css}</style>
                  <RenderNodes nodes={content} />
                </div>
              </EditorContext.Provider>
            </DeviceCtx.Provider>

            {!preview && (
              <div
                className="eb-add-area eb-edit-only"
                onClick={(e) => e.stopPropagation()}
                onDragOver={(e) => dragRef.current && (e.preventDefault(), setDrop(null))}
                onDrop={(e) => {
                  const p = dragRef.current;
                  if (!p) return;
                  e.preventDefault();
                  dragRef.current = null;
                  setDragId(null);
                  setDrop(null);
                  if (p.kind === "new" && p.make) place(null, content.length, p.make(), false, undefined, "افزودن ویجت");
                  else if (p.kind === "move" && p.id) {
                    const src = findNode(content, p.id);
                    if (src) place(null, content.length, src, false, src.id, "جابه‌جایی");
                  }
                }}
              >
                <h3>{content.length ? "افزودن بخش جدید" : "از اینجا شروع کن"}</h3>
                <StructurePicker onPick={addStructure} />
                <div className="eb-add-btns">
                  <button type="button" className="eb-btn is-primary" onClick={() => setModal("library")}><LayoutTemplate width={14} height={14} /> افزودن قالب</button>
                  <button type="button" className="eb-btn" onClick={() => setPanel("elements")}><Plus width={14} height={14} /> ویجت‌ها</button>
                </div>
                <small>یا یک ویجت را مستقیم از پنل بکشید و اینجا رها کنید.</small>
              </div>
            )}
          </div>

          {navOpen && !preview && (
            <Navigator
              content={content}
              selectedId={selected ? selected.id : null}
              onSelect={select}
              onHover={setHoverId}
              onDuplicate={duplicate}
              onRemove={remove}
              onClose={() => setNavOpen(false)}
            />
          )}

          {preview && (
            <button type="button" className="eb-btn is-primary" style={{ position: "fixed", bottom: 18, right: 18, zIndex: 100 }} onClick={() => setPreview(false)}>
              <EyeOff width={14} height={14} /> خروج از پیش‌نمایش (Esc)
            </button>
          )}
        </div>
      </div>

      {/* ---------------- modals ---------------- */}
      {modal === "library" && <LibraryModal doc={doc} onInsert={insertTemplate} onInsertSaved={insertSaved} onClose={() => setModal(null)} />}
      {modal === "settings" && <PageSettingsModal doc={doc} onChange={(patch) => dispatch({ type: "meta", patch })} onClose={() => setModal(null)} />}
      {modal === "keys" && <ShortcutsModal onClose={() => setModal(null)} />}
      {modal === "structure" && (
        <Modal title="ساختار بخش جدید" onClose={() => setModal(null)} small>
          <StructurePicker onPick={addStructure} />
        </Modal>
      )}
      {ctx && <ContextMenu x={ctx.x} y={ctx.y} items={ctxItems(ctx.id)} onClose={() => setCtx(null)} />}
      {/* link to dashboard for accessibility */}
      <Link to="/builder" className="sr-only" tabIndex={-1}>داشبورد صفحه‌ساز</Link>
    </div>
  );
}
