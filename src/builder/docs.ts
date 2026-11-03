import { useSyncExternalStore } from "react";
import {
  DEFAULT_PAGE,
  DEFAULT_POPUP,
  DEFAULT_SITE,
  type BDoc,
  type BNode,
  type DocKind,
  type SiteSettings,
} from "./core";
import { uid } from "./tree";

const DOCS_KEY = "velours.builder.docs.v1";
const SITE_KEY = "velours.builder.site.v1";
const SUB_KEY = "velours.builder.submissions.v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/* ---------------- tiny external store ---------------- */

function createStore<T>(key: string, initial: T) {
  let cache: T = read(key, initial);
  const listeners = new Set<() => void>();
  return {
    get: () => cache,
    set(next: T): boolean {
      const prev = cache;
      cache = next;
      const ok = write(key, next);
      if (!ok) cache = prev;
      listeners.forEach((l) => l());
      return ok;
    },
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

const docsStore = createStore<BDoc[]>(DOCS_KEY, []);
const siteStore = createStore<SiteSettings>(SITE_KEY, DEFAULT_SITE);

export interface Submission {
  id: string;
  form: string;
  page: string;
  at: number;
  data: Record<string, string>;
}
const subStore = createStore<Submission[]>(SUB_KEY, []);

/* ---------------- documents ---------------- */

export const getDocs = () => docsStore.get();
export const useDocs = () => useSyncExternalStore(docsStore.subscribe, docsStore.get, docsStore.get);
export const getDoc = (id: string | undefined) => (id ? getDocs().find((d) => d.id === id) : undefined);

export function saveDoc(doc: BDoc): boolean {
  const next = { ...doc, updatedAt: Date.now() };
  const docs = getDocs();
  const exists = docs.some((d) => d.id === doc.id);
  return docsStore.set(exists ? docs.map((d) => (d.id === doc.id ? next : d)) : [next, ...docs]);
}

export function removeDoc(id: string) {
  docsStore.set(getDocs().filter((d) => d.id !== id));
}

export function patchDoc(id: string, patch: Partial<BDoc>) {
  const d = getDoc(id);
  if (d) saveDoc({ ...d, ...patch });
}

const PERSIAN_MAP: Record<string, string> = {
  ا: "a", ب: "b", پ: "p", ت: "t", ث: "s", ج: "j", چ: "ch", ح: "h", خ: "kh", د: "d", ذ: "z", ر: "r", ز: "z",
  ژ: "zh", س: "s", ش: "sh", ص: "s", ض: "z", ط: "t", ظ: "z", ع: "a", غ: "gh", ف: "f", ق: "gh", ک: "k",
  گ: "g", ل: "l", م: "m", ن: "n", و: "v", ه: "h", ی: "y", آ: "a", ك: "k", ي: "y",
};

/** URL-safe ASCII slug. Persian titles are transliterated so links never need encoding. */
export function slugify(input: string): string {
  const translit = (input || "")
    .trim()
    .split("")
    .map((ch) => PERSIAN_MAP[ch] ?? ch)
    .join("");
  const latin = translit
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return latin || `page-${uid().slice(0, 5)}`;
}

export function uniqueSlug(base: string, ignoreId?: string): string {
  const taken = new Set(getDocs().filter((d) => d.id !== ignoreId).map((d) => d.slug));
  let slug = slugify(base);
  let i = 2;
  while (taken.has(slug)) slug = `${slugify(base)}-${i++}`;
  return slug;
}

export function createDoc(kind: DocKind, title: string, content: BNode[] = []): BDoc {
  const doc: BDoc = {
    id: uid(),
    title,
    kind,
    slug: uniqueSlug(title),
    status: "draft",
    content,
    page: {
      ...DEFAULT_PAGE,
      layout: kind === "landing" ? "canvas" : kind === "page" ? "default" : "default",
    },
    popup: { ...DEFAULT_POPUP },
    active: false,
    display: "all",
    updatedAt: Date.now(),
  };
  saveDoc(doc);
  return doc;
}

export function duplicateDoc(id: string): BDoc | null {
  const src = getDoc(id);
  if (!src) return null;
  const copy: BDoc = {
    ...JSON.parse(JSON.stringify(src)),
    id: uid(),
    title: `${src.title} (کپی)`,
    slug: uniqueSlug(`${src.slug}-copy`),
    status: "draft",
    active: false,
    updatedAt: Date.now(),
  };
  saveDoc(copy);
  return copy;
}

export function exportDoc(doc: BDoc): string {
  return JSON.stringify({ velours: "builder-doc", version: 1, doc }, null, 2);
}

export function importDoc(json: string): BDoc | null {
  try {
    const parsed = JSON.parse(json);
    const src = parsed?.doc ?? parsed;
    if (!src || !Array.isArray(src.content)) return null;
    const doc: BDoc = {
      ...src,
      id: uid(),
      slug: uniqueSlug(src.slug ?? src.title ?? "import"),
      status: "draft",
      active: false,
      page: { ...DEFAULT_PAGE, ...(src.page ?? {}) },
      popup: { ...DEFAULT_POPUP, ...(src.popup ?? {}) },
      display: src.display ?? "all",
      kind: src.kind ?? "page",
      title: src.title ?? "ایمپورت‌شده",
      updatedAt: Date.now(),
    };
    saveDoc(doc);
    return doc;
  } catch {
    return null;
  }
}

/* ---------------- site settings ---------------- */

export const getSite = () => siteStore.get();
export const useSite = () => useSyncExternalStore(siteStore.subscribe, siteStore.get, siteStore.get);
export const saveSite = (s: SiteSettings) => siteStore.set(s);

/** CSS custom properties (global colours / fonts) written on `.eb-root` */
export function siteVars(site: SiteSettings): Record<string, string> {
  const vars: Record<string, string> = {
    "--eb-container": `${site.containerWidth}px`,
    "--eb-gap": `${site.widgetGap}px`,
  };
  for (const c of site.colors) vars[`--eb-c-${c.id}`] = c.value;
  if (site.headingFont) vars["--eb-heading-font"] = site.headingFont;
  if (site.bodyFont) vars["--eb-body-font"] = site.bodyFont;
  if (site.bodyColor) vars["--eb-body-color"] = site.bodyColor;
  if (site.linkColor) vars["--eb-link-color"] = site.linkColor;
  return vars;
}

/* ---------------- form submissions ---------------- */

export const useSubmissions = () => useSyncExternalStore(subStore.subscribe, subStore.get, subStore.get);
export const addSubmission = (s: Omit<Submission, "id" | "at">) =>
  subStore.set([{ ...s, id: uid(), at: Date.now() }, ...subStore.get()].slice(0, 300));
export const clearSubmissions = () => subStore.set([]);

/* ---------------- theme-builder matching ---------------- */

export type RouteKind = "home" | "shop" | "page" | "other";

export function routeKind(pathname: string): RouteKind {
  if (pathname === "/" || pathname === "") return "home";
  if (pathname.startsWith("/products") || pathname.startsWith("/product/") || pathname.startsWith("/checkout")) return "shop";
  if (pathname.startsWith("/p/")) return "page";
  return "other";
}

export function matchesDisplay(doc: BDoc, route: RouteKind): boolean {
  switch (doc.display) {
    case "all":
      return true;
    case "home":
      return route === "home";
    case "not-home":
      return route !== "home";
    case "shop":
      return route === "shop";
    case "pages":
      return route === "page";
    default:
      return false;
  }
}

export function activeTemplate(docs: BDoc[], kind: "header" | "footer", route: RouteKind): BDoc | undefined {
  return docs.find((d) => d.kind === kind && d.active && d.status === "published" && matchesDisplay(d, route));
}
