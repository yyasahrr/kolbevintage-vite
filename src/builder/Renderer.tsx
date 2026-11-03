import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import "./builder.css";
import type { ElementType, MutableRefObject, ReactNode } from "react";
import { Copy, GripVertical, Plus, Trash2, Columns2, Box } from "lucide-react";
import type { BDoc, BNode, NodeType } from "./core";
import { contentCss, docCss, ensureFonts } from "./css";
import { getDoc, siteVars, useDocs, useSite } from "./docs";
import { hooks } from "./kit";
import { WIDGETS, effective, nodeLabel } from "./registry";
import { findNode } from "./tree";
import { useEntranceAnimations } from "./anim";

/* ------------------------------------------------------------------ */
/* editor context (null on the live site)                              */
/* ------------------------------------------------------------------ */

export type DropPos = "before" | "after" | "inside";

export interface DragPayload {
  kind: "new" | "move";
  type: NodeType;
  id?: string;
  make?: () => BNode;
}

export interface EditorApi {
  content: BNode[];
  selectedId: string | null;
  hoverId: string | null;
  dragId: string | null;
  drop: { id: string; pos: DropPos } | null;
  select: (id: string | null) => void;
  setHover: (id: string | null) => void;
  dragRef: MutableRefObject<DragPayload | null>;
  startDrag: (p: DragPayload) => void;
  endDrag: () => void;
  setDrop: (d: { id: string; pos: DropPos } | null) => void;
  canDrop: (target: BNode, pos: DropPos) => boolean;
  performDrop: (target: BNode, pos: DropPos) => void;
  commit: (id: string, key: string, value: any) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  addColumn: (sectionId: string) => void;
  addContainer: (parentId: string) => void;
  openElements: () => void;
  contextMenu: (id: string, x: number, y: number) => void;
}

export const EditorContext = createContext<EditorApi | null>(null);

/* ------------------------------------------------------------------ */
/* node interaction props                                              */
/* ------------------------------------------------------------------ */

function useNodeProps(node: BNode) {
  const ed = useContext(EditorContext);
  if (!ed) return { ed: null, className: "", props: {} as Record<string, unknown> };

  const isSel = ed.selectedId === node.id;
  const isHover = ed.hoverId === node.id;
  const dropPos = ed.drop?.id === node.id ? ed.drop.pos : null;

  const className = [
    "eb-node",
    isSel && "is-selected",
    isHover && "is-hover",
    dropPos && (dropPos === "inside" ? "eb-drop-inside" : `eb-drop-${dropPos}`),
    ed.dragId === node.id && "eb-dragging",
  ]
    .filter(Boolean)
    .join(" ");

  const calcPos = (e: React.DragEvent<HTMLElement>, payloadType: NodeType): DropPos => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (node.type === "column") {
      if (payloadType === "column") return e.clientX > rect.left + rect.width / 2 ? "before" : "after"; // RTL: start = right
      return "inside";
    }
    if (node.type === "container") {
      if (payloadType === "widget") return "inside";
      return e.clientY - rect.top < rect.height / 2 ? "before" : "after";
    }
    return e.clientY - rect.top < rect.height / 2 ? "before" : "after";
  };

  const props: Record<string, unknown> = {
    "data-eb-id": node.id,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      ed.select(node.id);
    },
    onMouseOver: (e: React.MouseEvent) => {
      e.stopPropagation();
      if (ed.hoverId !== node.id) ed.setHover(node.id);
    },
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      ed.select(node.id);
      ed.contextMenu(node.id, e.clientX, e.clientY);
    },
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      const payload = ed.dragRef.current;
      if (!payload) return;
      e.stopPropagation();
      const pos = calcPos(e, payload.type);
      if (!ed.canDrop(node, pos)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = payload.kind === "new" ? "copy" : "move";
      if (ed.drop?.id !== node.id || ed.drop.pos !== pos) ed.setDrop({ id: node.id, pos });
    },
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      const payload = ed.dragRef.current;
      if (!payload) return;
      // recompute from the event: React state may lag behind a fast drop
      const pos = calcPos(e, payload.type);
      if (!ed.canDrop(node, pos)) return;
      e.preventDefault();
      e.stopPropagation();
      ed.performDrop(node, pos);
    },
  };
  return { ed, className, props };
}

function Tag({ node, kind }: { node: BNode; kind: "section" | "column" | "container" | "widget" }) {
  const ed = useContext(EditorContext);
  if (!ed) return null;
  return (
    <div className={`eb-tag t-${kind} eb-edit-only`} onClick={(e) => e.stopPropagation()}>
      <span
        className="eb-grip"
        draggable
        title="بکش و جابه‌جا کن"
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData("text/plain", node.id);
          e.dataTransfer.effectAllowed = "move";
          ed.startDrag({ kind: "move", id: node.id, type: node.type });
        }}
        onDragEnd={ed.endDrag}
      >
        <GripVertical width={14} height={14} />
      </span>
      <b>{nodeLabel(node)}</b>
      {kind === "section" && (
        <button type="button" title="افزودن ستون" onClick={() => ed.addColumn(node.id)}>
          <Columns2 width={13} height={13} />
        </button>
      )}
      {(kind === "container" || kind === "column") && (
        <button type="button" title="افزودن کانتینر تودرتو" onClick={() => ed.addContainer(node.id)}>
          <Box width={13} height={13} />
        </button>
      )}
      <button type="button" title="تکرار (Ctrl+D)" onClick={() => ed.duplicate(node.id)}>
        <Copy width={13} height={13} />
      </button>
      <button type="button" title="حذف (Delete)" onClick={() => ed.remove(node.id)}>
        <Trash2 width={13} height={13} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* shapes                                                              */
/* ------------------------------------------------------------------ */

const SHAPES: Record<string, string> = {
  wave: "M0,40 C150,90 350,0 600,40 C850,80 1050,10 1200,40 L1200,120 L0,120 Z",
  curve: "M0,0 C300,120 900,120 1200,0 L1200,120 L0,120 Z",
  triangle: "M0,120 L600,0 L1200,120 Z",
  tilt: "M0,120 L1200,0 L1200,120 Z",
  arrow: "M0,120 L540,120 L600,60 L660,120 L1200,120 Z",
};

function Shape({ kind, where }: { kind: string; where: "top" | "bottom" }) {
  const d = SHAPES[kind];
  if (!d) return null;
  return (
    <div className={`eb-shape eb-shape-${where}`} aria-hidden>
      <svg viewBox="0 0 1200 120" preserveAspectRatio="none">
        <path d={d} />
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* nodes                                                               */
/* ------------------------------------------------------------------ */

const classes = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(" ");

function animClass(s: Record<string, any>, editing: boolean) {
  return s.animation && !editing ? `eb-anim a-${s.animation}` : "";
}

function SectionNode({ node }: { node: BNode }) {
  const { ed, className, props } = useNodeProps(node);
  const s = effective(node);
  const Tagname = (s.tag || "section") as ElementType;
  return (
    <Tagname
      id={s.cssId || undefined}
      className={classes(
        "eb-section",
        `eb-${node.id}`,
        s.layout === "full" ? "is-full" : "is-boxed",
        s.heightMode === "screen" && "is-screen",
        animClass(s, !!ed),
        s.cssClasses,
        className,
      )}
      {...props}
    >
      <Tag node={node} kind="section" />
      {s.overlayColor && <div className="eb-overlay" />}
      {s.shapeTop && <Shape kind={s.shapeTop} where="top" />}
      {s.shapeBottom && <Shape kind={s.shapeBottom} where="bottom" />}
      <div className="eb-container">
        <div className="eb-row">
          <RenderNodes nodes={node.children} />
        </div>
      </div>
    </Tagname>
  );
}

function ColumnNode({ node }: { node: BNode }) {
  const { ed, className, props } = useNodeProps(node);
  const s = effective(node);
  const Tagname = (s.tag || "div") as ElementType;
  return (
    <div className={classes("eb-column", `eb-${node.id}`, animClass(s, !!ed), className)} {...props}>
      <Tagname id={s.cssId || undefined} className={classes("eb-column-wrap", s.cssClasses)}>
        <Tag node={node} kind="column" />
        {node.children.length ? (
          <RenderNodes nodes={node.children} />
        ) : ed ? (
          <div
            className="eb-empty-col eb-edit-only"
            onClick={(e) => {
              e.stopPropagation();
              ed.select(node.id);
              ed.openElements();
            }}
          >
            <Plus width={18} height={18} />
            ویجت را اینجا رها کن
            <small>یا از پنل ویجت‌ها کلیک کن</small>
          </div>
        ) : null}
      </Tagname>
    </div>
  );
}

function ContainerNode({ node }: { node: BNode }) {
  const { ed, className, props } = useNodeProps(node);
  const s = effective(node);
  const Tagname = (s.tag || "div") as ElementType;
  return (
    <div className={classes("eb-container-node", `eb-${node.id}`, animClass(s, !!ed), className)} {...props}>
      <Tagname id={s.cssId || undefined} className={classes("eb-container-wrap", s.cssClasses)}>
        <Tagname className="eb-container-inner">
          <Tag node={node} kind="container" />
          {node.children.length ? (
            <RenderNodes nodes={node.children} />
          ) : ed ? (
            <div
              className="eb-empty-col eb-edit-only"
              onClick={(e) => {
                e.stopPropagation();
                ed.select(node.id);
                ed.openElements();
              }}
            >
              <Plus width={18} height={18} />
              چیزی داخل این کانتینر بگذار
              <small>ویجت، کانتینر تودرتو یا متن</small>
            </div>
          ) : null}
        </Tagname>
      </Tagname>
    </div>
  );
}

function WidgetNode({ node }: { node: BNode }) {
  const { ed, className, props } = useNodeProps(node);
  useDocs(); // re-render when a referenced saved template changes
  const def = node.widget ? WIDGETS[node.widget] : undefined;
  let s = effective(node);
  if (node.widget === "template" && s.templateId) s = { ...s, __doc: getDoc(s.templateId) };
  const body: ReactNode = def ? (
    def.render({
      s,
      id: node.id,
      editing: !!ed,
      selected: !!ed && ed.selectedId === node.id,
      commit: ed ? (k, v) => ed.commit(node.id, k, v) : undefined,
    })
  ) : (
    <div className="ew-empty">ویجت «{node.widget}» پشتیبانی نمی‌شود.</div>
  );
  return (
    <div
      id={s.cssId || undefined}
      className={classes("eb-widget", `eb-${node.id}`, node.widget && `ew-${node.widget}`, animClass(s, !!ed), s.cssClasses, className)}
      {...props}
    >
      <Tag node={node} kind="widget" />
      {body}
    </div>
  );
}

export function RenderNodes({ nodes }: { nodes: BNode[] }) {
  return (
    <>
      {nodes.map((n) =>
        n.type === "section" ? (
          <SectionNode key={n.id} node={n} />
        ) : n.type === "column" ? (
          <ColumnNode key={n.id} node={n} />
        ) : n.type === "container" ? (
          <ContainerNode key={n.id} node={n} />
        ) : (
          <WidgetNode key={n.id} node={n} />
        ),
      )}
    </>
  );
}

hooks.renderNodes = (nodes) => (
  <>
    <style>{contentCss(nodes, "live")}</style>
    <RenderNodes nodes={nodes} />
  </>
);

/* ------------------------------------------------------------------ */
/* live document                                                       */
/* ------------------------------------------------------------------ */

export function LiveDoc({ doc, className }: { doc: BDoc; className?: string }) {
  const site = useSite();
  const ref = useRef<HTMLDivElement>(null);
  const css = useMemo(() => docCss(doc, "live", site.customCss), [doc, site.customCss]);
  useEffect(() => ensureFonts(css + JSON.stringify([site.headingFont, site.bodyFont])), [css, site.headingFont, site.bodyFont]);
  useEntranceAnimations(ref, [doc.content]);
  return (
    <div ref={ref} className={classes("eb-root", `eb-page-${doc.id}`, className)} style={siteVars(site) as React.CSSProperties}>
      <style>{css}</style>
      <RenderNodes nodes={doc.content} />
    </div>
  );
}

export { findNode };
