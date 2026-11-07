export type ThemeId =
  | "soft"
  | "minimal"
  | "material"
  | "neo-brutalism"
  | "glassmorphism"
  | "noir"
  | "cyber"
  | "editorial"
  | "liquid-glass"
  | "bento"
  | "neumorphism"
  | "brutalism";

export interface ThemeDef {
  id: ThemeId;
  label: string;
  tagline: string;
  description: string;
  category: "روشن" | "تاریک" | "تجربی";
  badge?: string;
  /** CSS custom properties written to <html> at runtime (single source of truth). */
  tokens: Record<string, string>;
}

const SANS = '"Vazirmatn", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
const SERIF = '"Instrument Serif", ui-serif, Georgia, "Times New Roman", serif';
const INTER = '"Inter", ui-sans-serif, system-ui, sans-serif';

export const THEMES: ThemeDef[] = [
  {
    id: "soft",
    label: "سافت UI",
    tagline: "Soft Luxury",
    description: "گرد، گرم و لطیف؛ سایه‌های نرم و سطوح کرِمی آرامش‌بخش",
    category: "روشن",
    tokens: {
      "--color-bone": "#f5efe6",
      "--color-paper": "#fffaf4",
      "--color-ink": "#2a2420",
      "--color-ink-70": "#5b5049",
      "--color-ink-45": "#71665d",
      "--color-sand": "#ebe2d6",
      "--color-clay": "#c9b8a3",
      "--color-ember": "#9a5a3b",
      "--font-sans": SANS,
      "--font-display": SANS,
      "--font-latin": SERIF,
      "--radius-lg": "18px",
      "--radius-xl": "26px",
      "--radius-2xl": "32px",
      "--radius-3xl": "40px",
      "--radius-thumb": "20px",
      "--radius-stage": "34px",
      "--radius-hero": "34px",
      "--btn-radius": "999px",
      "--chip-radius": "999px",
      "--btn-shadow": "0 12px 28px -12px rgba(42,36,32,0.55), inset 0 1px 0 rgba(255,255,255,0.16)",
      "--card-shadow": "0 22px 44px -26px rgba(120,92,64,0.45), 0 2px 8px -4px rgba(120,92,64,0.18)",
      "--line": "rgba(120,92,64,0.12)",
      "--surface-tint": "#f1e9de",
    },
  },
  {
    id: "minimal",
    label: "مینیمال سوئیسی",
    tagline: "Swiss Grid",
    description: "تخت، سیاه‌وسفید و خط‌کشی‌شده؛ بدون سایه و با گوشهٔ کاملاً تیز",
    category: "روشن",
    tokens: {
      "--color-bone": "#ffffff",
      "--color-paper": "#ffffff",
      "--color-ink": "#0a0a0a",
      "--color-ink-70": "#3d3d3d",
      "--color-ink-45": "#656565",
      "--color-sand": "#f2f2f2",
      "--color-clay": "#cfcfcf",
      "--color-ember": "#a8382a",
      "--font-sans": SANS,
      "--font-display": SANS,
      "--font-latin": INTER,
      "--radius-lg": "2px",
      "--radius-xl": "2px",
      "--radius-2xl": "4px",
      "--radius-3xl": "4px",
      "--radius-thumb": "0px",
      "--radius-stage": "0px",
      "--radius-hero": "0px",
      "--btn-radius": "0px",
      "--chip-radius": "0px",
      "--btn-shadow": "none",
      "--card-shadow": "none",
      "--line": "rgba(0,0,0,0.14)",
      "--surface-tint": "#f4f4f4",
    },
  },
  {
    id: "material",
    label: "متریال UI",
    tagline: "Material M3",
    description: "لایه‌ای و تونال؛ ارتفاع با سایهٔ آبی، کپسول‌ها و لایهٔ حالت تعاملی",
    category: "روشن",
    tokens: {
      "--color-bone": "#fdf8ff",
      "--color-paper": "#f7f2fb",
      "--color-ink": "#2b2766",
      "--color-ink-70": "#4d4880",
      "--color-ink-45": "#646092",
      "--color-sand": "#e8e1f5",
      "--color-clay": "#c9c3dc",
      "--color-ember": "#b3261e",
      "--font-sans": SANS,
      "--font-display": SANS,
      "--font-latin": INTER,
      "--radius-lg": "12px",
      "--radius-xl": "16px",
      "--radius-2xl": "24px",
      "--radius-3xl": "28px",
      "--radius-thumb": "14px",
      "--radius-stage": "28px",
      "--radius-hero": "28px",
      "--btn-radius": "999px",
      "--chip-radius": "10px",
      "--btn-shadow": "0 1px 2px rgba(43,39,102,0.28), 0 2px 8px -2px rgba(43,39,102,0.25)",
      "--card-shadow": "0 1px 2px rgba(43,39,102,0.14), 0 6px 16px -6px rgba(43,39,102,0.22)",
      "--line": "rgba(43,39,102,0.12)",
      "--surface-tint": "#efe8f7",
    },
  },
  {
    id: "neo-brutalism",
    label: "نیوبروتالیسم",
    tagline: "Neo-Brutalism",
    badge: "مدرن",
    description: "خطوط مشکی ضخیم، سایه‌های صلب و تیز بدون بلور، و دکمه‌های فشاری حسی",
    category: "تجربی",
    tokens: {
      "--color-bone": "#fffdf5",
      "--color-paper": "#ffffff",
      "--color-ink": "#0a0a0a",
      "--color-ink-70": "#262626",
      "--color-ink-45": "#525252",
      "--color-sand": "#ffef9f",
      "--color-clay": "#0a0a0a",
      "--color-ember": "#b4232a",
      "--font-sans": SANS,
      "--font-display": SANS,
      "--font-latin": INTER,
      "--radius-lg": "8px",
      "--radius-xl": "12px",
      "--radius-2xl": "16px",
      "--radius-3xl": "18px",
      "--radius-thumb": "8px",
      "--radius-stage": "14px",
      "--radius-hero": "14px",
      "--btn-radius": "8px",
      "--chip-radius": "6px",
      "--btn-shadow": "3px 3px 0 #0a0a0a",
      "--card-shadow": "5px 5px 0 #0a0a0a",
      "--line": "#0a0a0a",
      "--surface-tint": "#fff8d6",
    },
  },
  {
    id: "glassmorphism",
    label: "گلس‌مورفیسم",
    tagline: "Liquid Glass",
    badge: "شناور",
    description: "پنل‌های شیشه‌ای مات با بلور عمیق، لایه‌های شناور و نور ملایم شفق",
    category: "تجربی",
    tokens: {
      "--color-bone": "#f3edf9",
      "--color-paper": "rgba(255, 255, 255, 0.9)",
      "--color-ink": "#1e1832",
      "--color-ink-70": "#493f6e",
      "--color-ink-45": "#635987",
      "--color-sand": "rgba(255, 255, 255, 0.5)",
      "--color-clay": "rgba(255, 255, 255, 0.85)",
      "--color-ember": "#a52d53",
      "--font-sans": SANS,
      "--font-display": SANS,
      "--font-latin": SERIF,
      "--radius-lg": "20px",
      "--radius-xl": "28px",
      "--radius-2xl": "36px",
      "--radius-3xl": "42px",
      "--radius-thumb": "18px",
      "--radius-stage": "36px",
      "--radius-hero": "36px",
      "--btn-radius": "999px",
      "--chip-radius": "999px",
      "--btn-shadow": "0 10px 28px -6px rgba(140, 80, 220, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.9)",
      "--card-shadow": "0 22px 50px -16px rgba(100, 60, 160, 0.18), inset 0 1px 1px rgba(255, 255, 255, 0.95)",
      "--line": "rgba(255, 255, 255, 0.75)",
      "--surface-tint": "rgba(246, 238, 255, 0.65)",
    },
  },
  {
    id: "noir",
    label: "نوآر لوکس",
    tagline: "Haute Couture Noir",
    badge: "دارک",
    description: "صحنهٔ شب ادیتوریال؛ مشکی عمیق، درخشش ملایم طلایی شامپاینی و سکوت مدرن",
    category: "تاریک",
    tokens: {
      "--color-bone": "#0d0c0a",
      "--color-paper": "#171513",
      "--color-ink": "#f8f3ea",
      "--color-ink-70": "#cec4b6",
      "--color-ink-45": "#8e867b",
      "--color-sand": "#24201c",
      "--color-clay": "#423b32",
      "--color-ember": "#e5c158",
      "--font-sans": SANS,
      "--font-display": SANS,
      "--font-latin": SERIF,
      "--radius-lg": "14px",
      "--radius-xl": "20px",
      "--radius-2xl": "26px",
      "--radius-3xl": "32px",
      "--radius-thumb": "16px",
      "--radius-stage": "28px",
      "--radius-hero": "28px",
      "--btn-radius": "999px",
      "--chip-radius": "999px",
      "--btn-shadow": "0 8px 24px -4px rgba(229, 193, 88, 0.3)",
      "--card-shadow": "0 20px 48px -18px rgba(0, 0, 0, 0.9), 0 0 0 1px rgba(229, 193, 88, 0.15)",
      "--line": "rgba(229, 193, 88, 0.18)",
      "--surface-tint": "#211d18",
    },
  },
  {
    id: "cyber",
    label: "سایبر استریت‌ویر",
    tagline: "Tech Runway",
    badge: "دارک",
    description: "رانوی آینده‌نگر؛ تیتانیوم تیره با نورهای نئونی فیروزه‌ای و جزئیات سایبرپانک",
    category: "تاریک",
    tokens: {
      "--color-bone": "#0a0d14",
      "--color-paper": "#121722",
      "--color-ink": "#00f0ff",
      "--color-ink-70": "#96e6ec",
      "--color-ink-45": "#75b2ba",
      "--color-sand": "#18202d",
      "--color-clay": "#283447",
      "--color-ember": "#c084fc",
      "--font-sans": SANS,
      "--font-display": SANS,
      "--font-latin": INTER,
      "--radius-lg": "6px",
      "--radius-xl": "8px",
      "--radius-2xl": "12px",
      "--radius-3xl": "14px",
      "--radius-thumb": "6px",
      "--radius-stage": "10px",
      "--radius-hero": "10px",
      "--btn-radius": "6px",
      "--chip-radius": "6px",
      "--btn-shadow": "0 0 18px rgba(0, 240, 255, 0.45)",
      "--card-shadow": "0 0 24px -6px rgba(0, 240, 255, 0.28), 0 0 0 1px rgba(0, 240, 255, 0.22)",
      "--line": "rgba(0, 240, 255, 0.25)",
      "--surface-tint": "#171f2c",
    },
  },
];

// Additional original panel packs, expressed as actual storefront tokens.
// They reuse the common token contract, not the prototype's unrelated database.
const tokensOf = (id: ThemeId) => ({...THEMES.find(theme => theme.id === id)!.tokens});
THEMES.push(
  {id:"editorial",label:"ادیتوریال کلاسیک",tagline:"Editorial",description:"چیدمان مجله‌ای، رنگ‌های کاغذی و تیترهای برجسته",category:"روشن",tokens:{...tokensOf("minimal"),"--color-bone":"#f7f3ed","--color-paper":"#fffdfa","--color-ink":"#211b19","--color-ink-70":"#534a46","--color-ink-45":"#6b615d","--color-sand":"#ece3d9","--color-clay":"#c4ad9b","--color-ember":"#8c4a2f","--font-latin":SERIF,"--radius-thumb":"3px","--radius-hero":"4px","--line":"rgba(33,27,25,.2)","--surface-tint":"#f1e9df"}},
  {id:"liquid-glass",label:"شیشه سیال لوکس",tagline:"Liquid Glass",description:"سطوح شفاف، نور سرد و لایه‌های شناور",category:"تجربی",tokens:{...tokensOf("glassmorphism"),"--color-bone":"#eaf2fb","--color-ink":"#122942","--color-ink-70":"#405a70","--color-ink-45":"#536c81","--color-ember":"#315fb8","--surface-tint":"rgba(234,246,255,.7)","--card-shadow":"0 22px 48px -18px rgba(44,91,156,.3), inset 0 1px 2px white"}},
  {id:"bento",label:"شبکه بنتو",tagline:"Bento",description:"سطوح ماژولار با گوشه‌های گرد و شبکهٔ متنوع در صفحهٔ اصلی",category:"روشن",tokens:{...tokensOf("soft"),"--color-bone":"#f5f3fb","--color-paper":"#ffffff","--color-ink":"#292643","--color-ink-70":"#514e67","--color-ink-45":"#64607a","--color-sand":"#e8e5f4","--color-clay":"#c3badf","--color-ember":"#6154a6","--radius-xl":"20px","--radius-2xl":"24px","--radius-hero":"26px","--line":"rgba(67,54,103,.14)","--surface-tint":"#eeecf8"}},
  {id:"neumorphism",label:"نئومورفیسم لمسی",tagline:"Neumorphism",description:"برجستگی‌های ملایم با سایه روشن و تیره",category:"تجربی",tokens:{...tokensOf("soft"),"--color-bone":"#e9ebf2","--color-paper":"#eff1f7","--color-ink":"#24283b","--color-ink-70":"#4d5268","--color-ink-45":"#5e6378","--color-sand":"#dde1eb","--color-clay":"#c2c9da","--color-ember":"#5046a0","--card-shadow":"8px 8px 20px #cbd0dc, -8px -8px 20px #fff","--btn-shadow":"5px 5px 12px #cbd0dc, -5px -5px 12px #fff","--line":"rgba(70,75,100,.22)","--surface-tint":"#e4e7ef"}},
  {id:"brutalism",label:"بروتالیسم آرشیوی",tagline:"Brutalism",description:"حاشیه‌های صریح و گوشه‌های تیز بدون سایه",category:"تجربی",tokens:{...tokensOf("minimal"),"--color-bone":"#f0f0ed","--color-paper":"#ffffff","--color-ink":"#080808","--color-ink-70":"#333333","--color-ink-45":"#555555","--color-ember":"#ae3030","--radius-lg":"0px","--radius-xl":"0px","--radius-2xl":"0px","--radius-3xl":"0px","--line":"#111111","--surface-tint":"#e3e3df"}},
);

export const isThemeId = (value: unknown): value is ThemeId => typeof value === "string" && THEMES.some(theme => theme.id === value);

export const DEFAULT_THEME: ThemeId = "soft";

export const getTheme = (id: ThemeId): ThemeDef => THEMES.find((t) => t.id === id) ?? THEMES[0];
