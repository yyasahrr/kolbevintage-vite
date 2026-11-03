import type { BNode, NodeType, Settings } from "./core";

export const uid = () => Math.random().toString(36).slice(2, 9);

export const mk = (type: NodeType, settings: Settings = {}, children: BNode[] = [], widget?: string): BNode => ({
  id: uid(),
  type,
  settings,
  children,
  ...(widget ? { widget } : {}),
});

export const newWidget = (widget: string, settings: Settings = {}): BNode => mk("widget", settings, [], widget);
export const newColumn = (children: BNode[] = [], width = 100, settings: Settings = {}): BNode =>
  mk("column", { width, ...settings }, children);
export const newContainer = (children: BNode[] = [], settings: Settings = {}): BNode =>
  mk("container", { direction: "column", gap: 20, ...settings }, children);

export const newSection = (cols: (number | BNode)[] = [100], settings: Settings = {}): BNode =>
  mk(
    "section",
    settings,
    cols.map((c) => (typeof c === "number" ? newColumn([], c) : c)),
  );

export function cloneNode(n: BNode): BNode {
  return {
    ...n,
    id: uid(),
    settings: JSON.parse(JSON.stringify(n.settings)),
    children: n.children.map(cloneNode),
  };
}

export function findNode(content: BNode[], id: string): BNode | null {
  for (const n of content) {
    if (n.id === id) return n;
    const f = findNode(n.children, id);
    if (f) return f;
  }
  return null;
}

export interface ParentInfo {
  parent: BNode | null;
  index: number;
  siblings: BNode[];
}

export function findParent(content: BNode[], id: string, parent: BNode | null = null): ParentInfo | null {
  for (let i = 0; i < content.length; i++) {
    if (content[i].id === id) return { parent, index: i, siblings: content };
    const f = findParent(content[i].children, id, content[i]);
    if (f) return f;
  }
  return null;
}

export function mapNode(content: BNode[], id: string, fn: (n: BNode) => BNode): BNode[] {
  return content.map((n) => {
    if (n.id === id) return fn(n);
    if (!n.children.length) return n;
    const kids = mapNode(n.children, id, fn);
    return kids === n.children || kids.every((k, i) => k === n.children[i]) ? n : { ...n, children: kids };
  });
}

export function removeNode(content: BNode[], id: string): BNode[] {
  const out: BNode[] = [];
  for (const n of content) {
    if (n.id === id) continue;
    out.push(n.children.length ? { ...n, children: removeNode(n.children, id) } : n);
  }
  return out;
}

export function insertNode(content: BNode[], parentId: string | null, index: number, node: BNode): BNode[] {
  if (parentId === null) {
    const next = [...content];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, node);
    return next;
  }
  return mapNode(content, parentId, (p) => {
    const kids = [...p.children];
    kids.splice(Math.max(0, Math.min(index, kids.length)), 0, node);
    return { ...p, children: kids };
  });
}

export function containsNode(n: BNode, id: string): boolean {
  if (n.id === id) return true;
  return n.children.some((c) => containsNode(c, id));
}

export function pathTo(content: BNode[], id: string, acc: BNode[] = []): BNode[] | null {
  for (const n of content) {
    const next = [...acc, n];
    if (n.id === id) return next;
    const f = pathTo(n.children, id, next);
    if (f) return f;
  }
  return null;
}

/** nesting depth of the section that owns the node: 0 = top-level section, 1 = inner section */
export function sectionDepth(content: BNode[], id: string): number {
  const p = pathTo(content, id) ?? [];
  return Math.max(0, p.filter((n) => n.type === "section").length - 1);
}

export function walk(content: BNode[], fn: (n: BNode) => void) {
  for (const n of content) {
    fn(n);
    walk(n.children, fn);
  }
}

export type ParentKind = "root" | NodeType;

/**
 * Wraps / validates a node so it can legally live inside the given parent.
 * Containers nest arbitrarily: root › container › container › widget …
 */
export function adaptNode(node: BNode, parent: ParentKind, _unused?: boolean): BNode | null {
  switch (parent) {
    case "root":
      if (node.type === "section" || node.type === "container") return node;
      if (node.type === "column") return newSection([node]);
      return newContainer([node]);
    case "section":
      if (node.type === "column" || node.type === "container") return node;
      if (node.type === "widget") return newColumn([node]);
      return null;
    case "column":
      if (node.type === "widget" || node.type === "container") return node;
      return null;
    case "container":
      return node.type === "widget" || node.type === "container" || node.type === "section" ? node : null;
    default:
      return null;
  }
}

/** after the child count of a section changes, spread columns evenly */
export function evenColumns(section: BNode): BNode {
  const n = section.children.length || 1;
  const w = Math.round((100 / n) * 100) / 100;
  return { ...section, children: section.children.map((c) => ({ ...c, settings: { ...c.settings, width: w, widthTablet: undefined, widthMobile: undefined } })) };
}
