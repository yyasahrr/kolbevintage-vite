import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* base types                                                          */
/* ------------------------------------------------------------------ */

export type Settings = Record<string, any>;
export type Device = "desktop" | "tablet" | "mobile";
export const DEVICES: Device[] = ["desktop", "tablet", "mobile"];
export const DEVICE_LABEL: Record<Device, string> = { desktop: "دسکتاپ", tablet: "تبلت", mobile: "موبایل" };
export const DEVICE_WIDTH: Record<Device, number | null> = { desktop: null, tablet: 820, mobile: 390 };

export type NodeType = "section" | "column" | "container" | "widget";

/** A saved starting point for a widget (Elementor-style block presets). */
export interface Preset {
  id: string;
  label: string;
  desc?: string;
  settings: Settings;
  tone?: string;
}

export const preset = (id: string, label: string, settings: Settings, desc?: string, tone?: string): Preset => ({
  id,
  label,
  settings,
  desc,
  tone,
});

export interface BNode {
  id: string;
  type: NodeType;
  widget?: string;
  settings: Settings;
  children: BNode[];
}

export type DocKind = "page" | "landing" | "header" | "footer" | "section" | "popup";
export const KIND_LABEL: Record<DocKind, string> = {
  page: "صفحه",
  landing: "لندینگ‌پیج",
  header: "هدر",
  footer: "فوتر",
  section: "بخش ذخیره‌شده",
  popup: "پاپ‌آپ",
};

export type DisplayCond = "all" | "home" | "not-home" | "shop" | "pages";
export const DISPLAY_LABEL: Record<DisplayCond, string> = {
  all: "کل سایت",
  home: "فقط صفحهٔ اصلی",
  "not-home": "همه به‌جز صفحهٔ اصلی",
  shop: "صفحات فروشگاه",
  pages: "صفحه‌های ساخته‌شده با صفحه‌ساز",
};

export interface PageSettings {
  layout: "default" | "canvas" | "fullwidth";
  bg: string;
  padding: number;
  customCss: string;
  hideTitle: boolean;
  description: string;
}

export interface PopupSettings {
  trigger: "load" | "delay" | "scroll" | "exit";
  delay: number;
  scroll: number;
  once: boolean;
  position: "center" | "bottom-right" | "top-bar" | "bottom-bar";
  width: number;
}

export interface BDoc {
  id: string;
  title: string;
  kind: DocKind;
  slug: string;
  status: "draft" | "published";
  content: BNode[];
  page: PageSettings;
  popup: PopupSettings;
  active: boolean;
  display: DisplayCond;
  updatedAt: number;
  /** every save keeps the previous content so the owner can walk back (decision 74) */
  versions?: { at: number; title: string; content: BNode[] }[];
}

export interface GlobalColor {
  id: string;
  title: string;
  value: string;
}

export interface SiteSettings {
  colors: GlobalColor[];
  headingFont: string;
  bodyFont: string;
  containerWidth: number;
  widgetGap: number;
  bodyColor: string;
  linkColor: string;
  customCss: string;
}

export const DEFAULT_PAGE: PageSettings = {
  layout: "default",
  bg: "",
  padding: 0,
  customCss: "",
  hideTitle: true,
  description: "",
};

export const DEFAULT_POPUP: PopupSettings = {
  trigger: "delay",
  delay: 3,
  scroll: 40,
  once: true,
  position: "center",
  width: 560,
};

export const DEFAULT_SITE: SiteSettings = {
  colors: [
    { id: "primary", title: "اصلی", value: "#16130f" },
    { id: "secondary", title: "ثانویه", value: "#8c4a2f" },
    { id: "text", title: "متن", value: "#4c443b" },
    { id: "accent", title: "تأکید", value: "#c2b09a" },
    { id: "light", title: "روشن", value: "#f7f3ed" },
  ],
  headingFont: "",
  bodyFont: "",
  containerWidth: 1140,
  widgetGap: 20,
  bodyColor: "",
  linkColor: "",
  customCss: "",
};

/* ------------------------------------------------------------------ */
/* control schema                                                      */
/* ------------------------------------------------------------------ */

export type WidgetCategory =
  | "basic"
  | "general"
  | "pro"
  | "site"
  | "shop"
  | "creative"
  | "dynamic"
  | "media"
  | "layout"
  | "form"
  | "social";

export type CtlType =
  | "text"
  | "textarea"
  | "wysiwyg"
  | "number"
  | "slider"
  | "color"
  | "select"
  | "choose"
  | "switch"
  | "image"
  | "images"
  | "url"
  | "dimensions"
  | "icon"
  | "repeater"
  | "heading"
  | "shadow"
  | "gradient"
  | "code"
  | "datetime";

export interface Ctl {
  key: string;
  label?: string;
  type: CtlType;
  default?: any;
  options?: { value: string; label: string; icon?: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  responsive?: boolean;
  show?: (s: Settings) => boolean;
  selectors?: Record<string, string>;
  fields?: Ctl[];
  itemLabel?: string;
  defaultItem?: Settings;
  placeholder?: string;
  rows?: number;
  hint?: string;
}

export interface CtlSection {
  id: string;
  title: string;
  tab: "content" | "style" | "advanced";
  controls: Ctl[];
}

export interface RenderCtx {
  s: Settings;
  id: string;
  editing: boolean;
  selected: boolean;
  commit?: (key: string, value: any) => void;
}

export interface WidgetDef {
  type: string;
  title: string;
  icon: LucideIcon;
  category: WidgetCategory;
  /** ready-made designs for this widget */
  presets?: Preset[];
  keywords?: string;
  sections: CtlSection[];
  defaults: Settings;
  render: (c: RenderCtx) => ReactNode;
}

/* ------------------------------------------------------------------ */
/* control builders (keeps the widget files compact)                   */
/* ------------------------------------------------------------------ */

export const W = "{{WRAPPER}}";

export const sec = (id: string, title: string, tab: CtlSection["tab"], controls: Ctl[]): CtlSection => ({
  id,
  title,
  tab,
  controls,
});
export const txt = (key: string, label: string, extra: Partial<Ctl> = {}): Ctl => ({ key, label, type: "text", ...extra });
export const area = (key: string, label: string, extra: Partial<Ctl> = {}): Ctl => ({
  key,
  label,
  type: "textarea",
  rows: 3,
  ...extra,
});
export const rich = (key: string, label: string, extra: Partial<Ctl> = {}): Ctl => ({ key, label, type: "wysiwyg", ...extra });
export const url = (key: string, label = "لینک", extra: Partial<Ctl> = {}): Ctl => ({
  key,
  label,
  type: "url",
  placeholder: "https://… یا /products",
  ...extra,
});
export const img = (key: string, label = "تصویر", extra: Partial<Ctl> = {}): Ctl => ({ key, label, type: "image", ...extra });
export const icn = (key: string, label = "آیکن", extra: Partial<Ctl> = {}): Ctl => ({ key, label, type: "icon", ...extra });
export const sw = (key: string, label: string, extra: Partial<Ctl> = {}): Ctl => ({ key, label, type: "switch", ...extra });
export const hd = (label: string): Ctl => ({ key: `_h_${label}`, type: "heading", label });
export const num = (key: string, label: string, extra: Partial<Ctl> = {}): Ctl => ({ key, label, type: "number", ...extra });
export const slider = (
  key: string,
  label: string,
  min: number,
  max: number,
  selectors?: Record<string, string>,
  extra: Partial<Ctl> = {},
): Ctl => ({ key, label, type: "slider", min, max, unit: "px", selectors, ...extra });
export const sel = (
  key: string,
  label: string,
  options: [string, string][],
  extra: Partial<Ctl> = {},
): Ctl => ({ key, label, type: "select", options: options.map(([value, l]) => ({ value, label: l })), ...extra });
export const choose = (
  key: string,
  label: string,
  options: [string, string, string?][],
  extra: Partial<Ctl> = {},
): Ctl => ({ key, label, type: "choose", options: options.map(([value, l, icon]) => ({ value, label: l, icon })), ...extra });
export const clr = (key: string, label: string, selectors?: Record<string, string>, extra: Partial<Ctl> = {}): Ctl => ({
  key,
  label,
  type: "color",
  selectors,
  ...extra,
});
export const rep = (
  key: string,
  label: string,
  fields: Ctl[],
  defaultItem: Settings,
  itemLabel = "title",
): Ctl => ({ key, label, type: "repeater", fields, defaultItem, itemLabel });

const textAlignOpts: [string, string, string][] = [
  ["start", "شروع", "AlignRight"],
  ["center", "وسط", "AlignCenter"],
  ["end", "پایان", "AlignLeft"],
];
const flexAlignOpts: [string, string, string][] = [
  ["flex-start", "شروع", "AlignRight"],
  ["center", "وسط", "AlignCenter"],
  ["flex-end", "پایان", "AlignLeft"],
];

export const alignText = (key: string, selector: string, label = "تراز", justify = false): Ctl =>
  choose(key, label, justify ? [...textAlignOpts, ["justify", "کشیده", "AlignJustify"]] : textAlignOpts, {
    responsive: true,
    selectors: { [selector]: "text-align:{{VALUE}};" },
  });

export const alignFlex = (key: string, selector: string, label = "تراز"): Ctl =>
  choose(key, label, flexAlignOpts, {
    responsive: true,
    selectors: { [selector]: "display:flex;justify-content:{{VALUE}};" },
  });

export const dims = (key: string, label: string, selector: string, prop: string, extra: Partial<Ctl> = {}): Ctl => ({
  key,
  label,
  type: "dimensions",
  responsive: true,
  selectors: { [selector]: `${prop}:{{TOP}}px {{RIGHT}}px {{BOTTOM}}px {{LEFT}}px;` },
  ...extra,
});

export const shadowCtl = (key: string, label: string, selector: string, prop = "box-shadow"): Ctl => ({
  key,
  label,
  type: "shadow",
  selectors: {
    [selector]: prop === "text-shadow" ? "text-shadow:{{X}}px {{Y}}px {{BLUR}}px {{COLOR}};" : `${prop}:{{X}}px {{Y}}px {{BLUR}}px {{SPREAD}}px {{COLOR}};`,
  },
});

export const FONT_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "پیش‌فرض" },
  { value: "'Vazirmatn', sans-serif", label: "وزیرمتن" },
  { value: "'Inter', sans-serif", label: "Inter" },
  { value: "'Instrument Serif', serif", label: "Instrument Serif" },
  { value: "'Playfair Display', serif", label: "Playfair Display" },
  { value: "'Poppins', sans-serif", label: "Poppins" },
  { value: "'Lora', serif", label: "Lora" },
  { value: "'Montserrat', sans-serif", label: "Montserrat" },
  { value: "'Cormorant Garamond', serif", label: "Cormorant Garamond" },
  { value: "'Space Grotesk', sans-serif", label: "Space Grotesk" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Courier New', monospace", label: "Courier" },
];

export function typo(p: string, selector: string): Ctl[] {
  const s = (css: string) => ({ [selector]: css });
  return [
    { key: `${p}Font`, label: "فونت", type: "select", options: FONT_OPTIONS.map((f) => ({ ...f })), selectors: s("font-family:{{VALUE}};") },
    slider(`${p}Size`, "اندازه", 8, 140, s("font-size:{{VALUE}}px;"), { responsive: true }),
    sel(
      `${p}Weight`,
      "ضخامت",
      [
        ["", "پیش‌فرض"],
        ["300", "سبک"],
        ["400", "معمولی"],
        ["500", "متوسط"],
        ["600", "نیمه‌ضخیم"],
        ["700", "ضخیم"],
        ["800", "خیلی ضخیم"],
      ],
      { selectors: s("font-weight:{{VALUE}};") },
    ),
    sel(
      `${p}Transform`,
      "حالت حروف",
      [
        ["", "پیش‌فرض"],
        ["uppercase", "بزرگ"],
        ["lowercase", "کوچک"],
        ["capitalize", "سرکلمه"],
      ],
      { selectors: s("text-transform:{{VALUE}};") },
    ),
    sel(
      `${p}Style`,
      "سبک",
      [
        ["", "پیش‌فرض"],
        ["italic", "مایل"],
        ["normal", "عادی"],
      ],
      { selectors: s("font-style:{{VALUE}};") },
    ),
    sel(
      `${p}Deco`,
      "خط",
      [
        ["", "پیش‌فرض"],
        ["underline", "زیرخط"],
        ["line-through", "خط‌خورده"],
        ["none", "هیچ"],
      ],
      { selectors: s("text-decoration:{{VALUE}};") },
    ),
    slider(`${p}Line`, "ارتفاع خط", 0.8, 3, s("line-height:{{VALUE}};"), { responsive: true, step: 0.05, unit: "" }),
    slider(`${p}Spacing`, "فاصلهٔ حروف", -3, 20, s("letter-spacing:{{VALUE}}px;"), { step: 0.5 }),
  ];
}

export function borderCtls(p: string, selector: string, withHover = false): Ctl[] {
  const out: Ctl[] = [
    sel(
      `${p}BorderStyle`,
      "نوع حاشیه",
      [
        ["", "پیش‌فرض"],
        ["none", "هیچ"],
        ["solid", "ساده"],
        ["dashed", "خط‌چین"],
        ["dotted", "نقطه‌چین"],
        ["double", "دوتایی"],
      ],
      { selectors: { [selector]: "border-style:{{VALUE}};" } },
    ),
    dims(`${p}BorderWidth`, "ضخامت حاشیه", selector, "border-width", { show: (s) => !!s[`${p}BorderStyle`] && s[`${p}BorderStyle`] !== "none" }),
    clr(`${p}BorderColor`, "رنگ حاشیه", { [selector]: "border-color:{{VALUE}};" }, { show: (s) => !!s[`${p}BorderStyle`] && s[`${p}BorderStyle`] !== "none" }),
    dims(`${p}Radius`, "گردی گوشه‌ها", selector, "border-radius"),
    shadowCtl(`${p}Shadow`, "سایه", selector),
  ];
  if (withHover) {
    out.push(clr(`${p}BorderColorHover`, "رنگ حاشیه (هاور)", { [`${selector}:hover`]: "border-color:{{VALUE}};" }));
  }
  return out;
}

export const bgCtls = (p: string, selector: string, withImage = true): Ctl[] => [
  choose(
    `${p}Type`,
    "نوع پس‌زمینه",
    [
      ["none", "هیچ", "Ban"],
      ["color", "رنگ", "Palette"],
      ["gradient", "گرادیان", "Blend"],
      ...(withImage ? ([["image", "تصویر", "Image"]] as [string, string, string][]) : []),
    ],
    { default: "none" },
  ),
  clr(`${p}Color`, "رنگ", { [selector]: "background-color:{{VALUE}};" }, { show: (s) => s[`${p}Type`] === "color" }),
  {
    key: `${p}Gradient`,
    label: "گرادیان",
    type: "gradient",
    selectors: { [selector]: "background-image:linear-gradient({{ANGLE}}deg,{{A}},{{B}});" },
    show: (s) => s[`${p}Type`] === "gradient",
  },
  ...(withImage
    ? ([
        img(`${p}Image`, "تصویر پس‌زمینه", { selectors: { [selector]: 'background-image:url("{{VALUE}}");' }, show: (s) => s[`${p}Type`] === "image" }),
        sel(
          `${p}Size`,
          "اندازه",
          [
            ["", "پیش‌فرض"],
            ["cover", "پوشش کامل"],
            ["contain", "جا شدن"],
            ["auto", "خودکار"],
          ],
          { selectors: { [selector]: "background-size:{{VALUE}};" }, show: (s) => s[`${p}Type`] === "image", default: "cover" },
        ),
        sel(
          `${p}Pos`,
          "موقعیت",
          [
            ["", "پیش‌فرض"],
            ["center center", "وسط"],
            ["top center", "بالا"],
            ["bottom center", "پایین"],
            ["center right", "راست"],
            ["center left", "چپ"],
          ],
          { selectors: { [selector]: "background-position:{{VALUE}};" }, show: (s) => s[`${p}Type`] === "image", default: "center center" },
        ),
        sel(
          `${p}Attach`,
          "اسکرول (پارالاکس)",
          [
            ["", "عادی"],
            ["fixed", "ثابت (پارالاکس)"],
          ],
          { selectors: { [selector]: "background-attachment:{{VALUE}};" }, show: (s) => s[`${p}Type`] === "image" },
        ),
      ] as Ctl[])
    : []),
  clr(`${p}HoverColor`, "رنگ پس‌زمینه در هاور", { [`${selector}:hover`]: "background-color:{{VALUE}};" }),
];
