import type { BDoc, BNode, Ctl, Device } from "./core";
import { suffixOf } from "./ctx";
import { controlsOf, effective } from "./registry";
import { resolveImg } from "./stock";

export type CssMode = "live" | Device;

const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || v === false || (typeof v === "number" && Number.isNaN(v));

function fill(tpl: string, v: any, ctl: Ctl): string | null {
  if (ctl.type === "dimensions") {
    const o = v && typeof v === "object" ? v : {};
    const keys = ["top", "right", "bottom", "left"] as const;
    if (keys.every((k) => isEmpty(o[k]) && o[k] !== 0)) return null;
    let out = tpl;
    for (const k of keys) out = out.split(`{{${k.toUpperCase()}}}`).join(String(Number(o[k]) || 0));
    return out;
  }
  if (ctl.type === "shadow") {
    if (!v || typeof v !== "object" || !v.color) return null;
    return tpl
      .replace("{{X}}", String(Number(v.x) || 0))
      .replace("{{Y}}", String(Number(v.y) || 0))
      .replace("{{BLUR}}", String(Number(v.blur) || 0))
      .replace("{{SPREAD}}", String(Number(v.spread) || 0))
      .replace("{{COLOR}}", String(v.color));
  }
  if (ctl.type === "gradient") {
    if (!v || typeof v !== "object" || !v.a || !v.b) return null;
    return tpl.replace("{{A}}", v.a).replace("{{B}}", v.b).replace("{{ANGLE}}", String(Number(v.angle) || 90));
  }
  if (isEmpty(v)) return null;
  const val = ctl.type === "image" ? resolveImg(String(v)) : String(v);
  if (ctl.type === "image" && !val) return null;
  return tpl.split("{{VALUE}}").join(val);
}

const HIDE: { key: string; media: string; dev: Device }[] = [
  { key: "hideDesktop", media: "(min-width:1025px)", dev: "desktop" },
  { key: "hideTablet", media: "(min-width:768px) and (max-width:1024px)", dev: "tablet" },
  { key: "hideMobile", media: "(max-width:767px)", dev: "mobile" },
];

export function nodeCss(node: BNode, mode: CssMode): string {
  const s = effective(node);
  const cls = `.eb-root .eb-${node.id}`;
  const controls = controlsOf(node);

  const layers: { dev: Device; wrap?: string }[] =
    mode === "live"
      ? [{ dev: "desktop" }, { dev: "tablet", wrap: "@media (max-width:1024px)" }, { dev: "mobile", wrap: "@media (max-width:767px)" }]
      : mode === "desktop"
        ? [{ dev: "desktop" }]
        : mode === "tablet"
          ? [{ dev: "desktop" }, { dev: "tablet" }]
          : [{ dev: "desktop" }, { dev: "tablet" }, { dev: "mobile" }];

  const blocks: string[] = [];
  for (const layer of layers) {
    const rules: string[] = [];
    for (const c of controls) {
      if (!c.selectors) continue;
      if (c.show && !c.show(s)) continue;
      if (!c.responsive && layer.dev !== "desktop") continue;
      const v = s[c.key + (c.responsive ? suffixOf(layer.dev) : "")];
      for (const [selector, tpl] of Object.entries(c.selectors)) {
        const body = fill(tpl, v, c);
        if (body) rules.push(`${selector.split("{{WRAPPER}}").join(cls)}{${body}}`);
      }
    }
    if (!rules.length) continue;
    const css = rules.join("\n");
    blocks.push(layer.wrap ? `${layer.wrap}{${css}}` : css);
  }

  if (node.type === "column" && !s.widthMobile) {
    if (mode === "live") blocks.push(`@media (max-width:767px){${cls}{width:100%}}`);
    else if (mode === "mobile") blocks.push(`${cls}{width:100%}`);
  }

  for (const h of HIDE) {
    if (!s[h.key]) continue;
    if (mode === "live") blocks.push(`@media ${h.media}{${cls}{display:none !important}}`);
    else if (mode === h.dev) blocks.push(`${cls}{opacity:.28 !important;outline:1px dashed #94a3b8}`);
  }

  if (typeof s.customCss === "string" && s.customCss.trim()) {
    blocks.push(s.customCss.split(/\bselector\b/).join(cls));
  }
  return blocks.join("\n");
}

export function contentCss(content: BNode[], mode: CssMode): string {
  const out: string[] = [];
  const walk = (list: BNode[]) => {
    for (const n of list) {
      const css = nodeCss(n, mode);
      if (css) out.push(css);
      if (n.children.length) walk(n.children);
    }
  };
  walk(content);
  return out.join("\n");
}

export function docCss(doc: BDoc, mode: CssMode, siteCss = ""): string {
  const page: string[] = [];
  if (doc.page.bg) page.push(`.eb-root.eb-page-${doc.id}{background:${doc.page.bg}}`);
  if (doc.page.padding) page.push(`.eb-root.eb-page-${doc.id}{padding:${doc.page.padding}px}`);
  if (doc.page.customCss) page.push(doc.page.customCss);
  return [contentCss(doc.content, mode), page.join("\n"), siteCss].filter(Boolean).join("\n");
}

const GOOGLE_FONTS = ["Playfair Display", "Poppins", "Lora", "Montserrat", "Cormorant Garamond", "Space Grotesk"];
const loaded = new Set<string>();

/** Lazily loads any Google font referenced by the generated CSS. */
export function ensureFonts(css: string) {
  if (typeof document === "undefined") return;
  for (const f of GOOGLE_FONTS) {
    if (loaded.has(f) || !css.includes(f)) continue;
    loaded.add(f);
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${f.replace(/ /g, "+")}:wght@300;400;500;600;700&display=swap`;
    document.head.appendChild(link);
  }
}
