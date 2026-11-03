import { advancedSections, columnSections, containerSections, sectionSections } from "./common";
import type { BNode, Ctl, CtlSection, Settings, WidgetDef } from "./core";
import { WIDGETS_A } from "./widgets-a";
import { WIDGETS_B } from "./widgets-b";
import { WIDGETS_C } from "./widgets-c";
import { WIDGETS_D } from "./widgets-d";
import { WIDGETS_E } from "./widgets-e";
import { WIDGETS_F } from "./widgets-f";
import { WIDGETS_G } from "./widgets-g";

export const WIDGET_LIST: WidgetDef[] = [...WIDGETS_A, ...WIDGETS_B, ...WIDGETS_C, ...WIDGETS_D, ...WIDGETS_E, ...WIDGETS_F, ...WIDGETS_G];
export const WIDGETS: Record<string, WidgetDef> = Object.fromEntries(WIDGET_LIST.map((w) => [w.type, w]));

export const CATEGORY_LABEL: Record<WidgetDef["category"], string> = {
  basic: "پایه",
  general: "عمومی",
  pro: "پرو",
  creative: "خلاقانه",
  dynamic: "داینامیک",
  media: "رسانه",
  layout: "چیدمان",
  form: "فرم",
  social: "اجتماعی",
  site: "سایت",
  shop: "فروشگاه",
};

export const CATEGORY_ORDER: WidgetDef["category"][] = [
  "basic",
  "layout",
  "general",
  "creative",
  "dynamic",
  "media",
  "form",
  "social",
  "shop",
  "site",
  "pro",
];

export function sectionsFor(node: BNode): CtlSection[] {
  if (node.type === "section") return sectionSections();
  if (node.type === "column") return columnSections();
  if (node.type === "container") return containerSections();
  const def = node.widget ? WIDGETS[node.widget] : undefined;
  return [...(def?.sections ?? []), ...advancedSections()];
}

export function controlsOf(node: BNode): Ctl[] {
  return sectionsFor(node).flatMap((s) => s.controls);
}

const cache = new WeakMap<Ctl[], Settings>();

function controlDefaults(controls: Ctl[]): Settings {
  const hit = cache.get(controls);
  if (hit) return hit;
  const out: Settings = {};
  for (const c of controls) if (c.default !== undefined) out[c.key] = c.default;
  cache.set(controls, out);
  return out;
}

/** effective settings = control defaults < widget defaults < user values */
export function effective(node: BNode): Settings {
  const controls = controlsOf(node);
  const def = node.widget ? WIDGETS[node.widget] : undefined;
  const merged: Settings = { ...controlDefaults(controls), ...(def?.defaults ?? {}) };
  for (const [k, v] of Object.entries(node.settings)) if (v !== undefined) merged[k] = v;
  return merged;
}

export function nodeLabel(node: BNode): string {
  if (node.type === "section") return "بخش";
  if (node.type === "column") return "ستون";
  if (node.type === "container") return "کانتینر";
  return (node.widget && WIDGETS[node.widget]?.title) || "ویجت";
}
