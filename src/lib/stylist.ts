import { liveCatalog, type CatalogProduct } from "@/data/catalog";
import { stockOf } from "@/data/looks";
import type { ColorOption, GarmentKind } from "@/types";

/* ------------------------------------------------------------------ */
/* colour maths                                                        */
/* ------------------------------------------------------------------ */

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): HSL {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { h: 0, s: 0, l: 0.5 };
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s, l };
}

/** near-neutral colours (black, white, grey, camel, ivory) go with everything */
export const isNeutral = (c: HSL) => c.s < 0.16 || c.l > 0.88 || c.l < 0.16;

const hueDist = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export type Harmony = "neutral" | "monochrome" | "analogous" | "complementary" | "triadic" | "clash";

export interface HarmonyResult {
  score: number; // 0..1
  kind: Harmony;
  note: string;
}

/** How well two colours sit together — the heart of the recommendation engine. */
export function harmony(a: string, b: string): HarmonyResult {
  const A = hexToHsl(a);
  const B = hexToHsl(b);
  if (isNeutral(A) || isNeutral(B)) {
    const l = Math.abs(A.l - B.l);
    return {
      score: 0.86 + (l > 0.28 ? 0.12 : 0),
      kind: "neutral",
      note: l > 0.28 ? "خنثی با تضاد روشنایی — امن و شیک" : "خنثی هم‌تن — آرام و یکدست",
    };
  }
  const dh = hueDist(A.h, B.h);
  const ds = Math.abs(A.s - B.s);
  const dl = Math.abs(A.l - B.l);
  if (dh < 14)
    return { score: 0.9 - ds * 0.15 + (dl > 0.2 ? 0.08 : 0), kind: "monochrome", note: "تک‌رنگ با اختلاف روشنایی — ست حرفه‌ای" };
  if (dh < 42) return { score: 0.82 - ds * 0.12, kind: "analogous", note: "رنگ‌های همسایه روی چرخه — هماهنگ و نرم" };
  if (dh > 148 && dh < 212)
    return { score: 0.62 + (dl > 0.22 ? 0.2 : 0) - ds * 0.1, kind: "complementary", note: "مکمل — پرانرژی؛ بهتر است یکی کم‌رنگ‌تر باشد" };
  if ((dh > 108 && dh < 148) || (dh > 212 && dh < 252))
    return { score: 0.6 - ds * 0.12, kind: "triadic", note: "سه‌گانه — جسور، فقط با یک رنگ غالب" };
  return { score: 0.42 - ds * 0.15, kind: "clash", note: "تضاد ناخواسته — بهتر است یکی عوض شود" };
}

/** Cohesion of a whole palette, 0..100. */
export function paletteScore(hexes: string[]): { score: number; verdict: string; worst?: { a: string; b: string; kind: Harmony } } {
  const clean = hexes.filter(Boolean);
  if (clean.length < 2) return { score: clean.length ? 78 : 0, verdict: "یک قطعه — ست کامل نیست" };
  let sum = 0;
  let n = 0;
  let worst: { a: string; b: string; kind: Harmony; s: number } | undefined;
  for (let i = 0; i < clean.length; i++)
    for (let j = i + 1; j < clean.length; j++) {
      const r = harmony(clean[i], clean[j]);
      sum += r.score;
      n++;
      if (!worst || r.score < worst.s) worst = { a: clean[i], b: clean[j], kind: r.kind, s: r.score };
    }
  const avg = n ? sum / n : 0;
  // reward a tight palette: more than 4 distinct hues is noisy
  const hues = new Set(clean.map((c) => Math.round(hexToHsl(c).h / 30)));
  const varietyPenalty = Math.max(0, hues.size - 4) * 0.05;
  const score = Math.round(Math.max(0, Math.min(1, avg - varietyPenalty)) * 100);
  const verdict =
    score >= 88
      ? "ست بسیار هماهنگ — آمادهٔ پوشیدن"
      : score >= 74
        ? "ست خوب و متعادل"
        : score >= 58
          ? "قابل قبول؛ یک قطعه را نرم‌تر کن"
          : "تضاد زیاد — رنگ‌ها با هم نمی‌خوانند";
  return { score, verdict, worst: worst ? { a: worst.a, b: worst.b, kind: worst.kind } : undefined };
}

/* ------------------------------------------------------------------ */
/* profile                                                             */
/* ------------------------------------------------------------------ */

export type Occasion = "formal" | "office" | "casual" | "party" | "travel" | "sport";
export type StyleTaste = "minimal" | "classic" | "street" | "luxe" | "comfy";
export type BodyShape = "rectangle" | "hourglass" | "pear" | "inverted";

export interface Profile {
  occasion: Occasion;
  city: string;
  season: "spring" | "summer" | "autumn" | "winter";
  temp: number;
  age: number;
  height: number;
  weight: number;
  shape: BodyShape;
  taste: StyleTaste;
  loveColors: string[];
  avoidColors: string[];
  budget: number;
}

export const OCCASIONS: { id: Occasion; label: string; desc: string }[] = [
  { id: "formal", label: "مراسم رسمی", desc: "عروسی، ضیافت شب" },
  { id: "office", label: "محیط کار", desc: "اداری و جلسات" },
  { id: "casual", label: "روزمره", desc: "کافه، خرید، گردش" },
  { id: "party", label: "مهمانی", desc: "دورهمی و شب‌نشینی" },
  { id: "travel", label: "سفر", desc: "پرواز و پیاده‌روی طولانی" },
  { id: "sport", label: "فعال و ورزشی", desc: "حرکت و هوای آزاد" },
];

export const TASTES: { id: StyleTaste; label: string }[] = [
  { id: "minimal", label: "مینیمال" },
  { id: "classic", label: "کلاسیک" },
  { id: "street", label: "استریت‌ویر" },
  { id: "luxe", label: "لوکس و ادیتوریال" },
  { id: "comfy", label: "راحت و کاربردی" },
];

export const SHAPES: { id: BodyShape; label: string; hint: string }[] = [
  { id: "rectangle", label: "مستطیل", hint: "شانه و باسن نزدیک به هم" },
  { id: "hourglass", label: "ساعت شنی", hint: "کمر باریک‌تر از شانه و باسن" },
  { id: "pear", label: "گلابی", hint: "باسن پهن‌تر از شانه" },
  { id: "inverted", label: "مثلث وارونه", hint: "شانه پهن‌تر از باسن" },
];

export interface Slot {
  id: "outer" | "top" | "bottom" | "dress" | "shoes" | "bag" | "accessory";
  label: string;
  kinds: GarmentKind[];
  optional: boolean;
}

export const SLOTS: Slot[] = [
  { id: "outer", label: "لایهٔ بیرونی", kinds: ["coat", "jacket"], optional: true },
  { id: "top", label: "بالاتنه", kinds: ["knit", "tee", "dress"], optional: false },
  { id: "bottom", label: "پایین‌تنه", kinds: ["trousers", "skirt"], optional: false },
  { id: "shoes", label: "کفش", kinds: ["loafer", "heel", "boot", "sneaker"], optional: false },
  { id: "bag", label: "کیف", kinds: ["bag"], optional: true },
  { id: "accessory", label: "اکسسوری", kinds: ["accessory"], optional: true },
];

/* ------------------------------------------------------------------ */
/* sizing                                                              */
/* ------------------------------------------------------------------ */

export interface SizeAdvice {
  size: string;
  note: string;
}

export function adviseSize(p: CatalogProduct, profile: Profile): SizeAdvice {
  const labels = p.sizes.map((s) => s.label);
  if (labels.length === 1) return { size: labels[0], note: "تک‌سایز با فرم آزاد" };
  const bmi = profile.weight / Math.pow(profile.height / 100, 2);
  const numeric = labels.every((l) => /^\d+$/.test(l));
  if (numeric) {
    const waist = Math.round(profile.weight * 0.42 + (profile.shape === "pear" ? 4 : 0));
    const best = labels.reduce((a, b) => (Math.abs(Number(a) - waist) <= Math.abs(Number(b) - waist) ? a : b));
    return { size: best, note: `بر اساس دور کمرِ تقریبی ${waist} سانتی‌متر` };
  }
  const shoe = labels.every((l) => Number(l) >= 35 && Number(l) <= 46);
  if (shoe) {
    const eu = Math.round(profile.height / 6.6 + (profile.weight > 78 ? 1 : 0));
    const best = labels.reduce((a, b) => (Math.abs(Number(a) - eu) <= Math.abs(Number(b) - eu) ? a : b));
    return { size: best, note: `سایز پیشنهادی اروپایی ${best}` };
  }
  const order = ["XS", "S", "M", "L", "XL"];
  const idx = bmi < 19 ? 0 : bmi < 22 ? 1 : bmi < 26 ? 2 : bmi < 30 ? 3 : 4;
  let pick = order[idx];
  if (profile.shape === "inverted" && ["top", "coat", "jacket", "knit", "tee"].includes(p.garment)) pick = order[Math.min(4, idx + 1)];
  if (profile.shape === "pear" && ["trousers", "skirt"].includes(p.garment)) pick = order[Math.min(4, idx + 1)];
  return { size: labels.includes(pick) ? pick : labels[Math.min(idx, labels.length - 1)], note: `بر اساس BMI ${bmi.toFixed(1)}` };
}

/* ------------------------------------------------------------------ */
/* scoring                                                             */
/* ------------------------------------------------------------------ */

export interface Suggestion {
  product: CatalogProduct;
  color: ColorOption;
  sizeId: string;
  sizeLabel: string;
  score: number;
  reasons: string[];
  warnings: string[];
}

const FIRST_AVAILABLE_COLOR = (p: CatalogProduct) => p.colors.find((c) => p.sizes.some((s) => stockOf(p, c.id, s.id) > 0)) ?? p.colors[0];

const styleOf = (p: CatalogProduct): StyleTaste[] => {
  const g = p.garment;
  if (["sneaker", "tee"].includes(g) || p.name.includes("جین") || p.name.includes("تراکر")) return ["street", "comfy", "minimal"];
  if (["heel", "dress", "accessory"].includes(g) || p.price > 900) return ["luxe", "classic"];
  if (["knit", "coat", "trousers", "skirt"].includes(g)) return ["minimal", "classic", "luxe"];
  if (["loafer", "boot"].includes(g)) return ["classic", "comfy", "minimal"];
  return ["classic", "comfy"];
};

const formality = (p: CatalogProduct): number => {
  const g = p.garment;
  if (["heel", "dress", "accessory", "coat"].includes(g)) return 0.9;
  if (["trousers", "skirt", "knit", "loafer", "bag", "boot"].includes(g)) return 0.65;
  if (["jacket"].includes(g)) return 0.5;
  return 0.25; // tee, sneaker
};

const targetFormality: Record<Occasion, number> = { formal: 0.92, office: 0.72, casual: 0.4, party: 0.82, travel: 0.35, sport: 0.22 };

/** warmth each garment contributes, used against the temperature answer */
const warmth = (g: GarmentKind) => (["coat", "knit", "boot"].includes(g) ? 3 : ["jacket", "trousers", "loafer"].includes(g) ? 2 : 1);

export interface ChosenPiece {
  color: string;
  colorName?: string;
  slotLabel?: string;
  product: CatalogProduct;
}

export function suggestFor(slot: Slot, profile: Profile, chosen: ChosenPiece[], limit = 6): Suggestion[] {
  const pool = liveCatalog().filter((p) => slot.kinds.includes(p.garment) && p.sizes.some((s) => p.colors.some((c) => stockOf(p, c.id, s.id) > 0)));
  const chosenHexes = chosen.map((c) => c.color).filter(Boolean);
  const out: Suggestion[] = [];

  for (const p of pool) {
    // pick the colour that best fits the profile *and* the already-chosen pieces
    let bestColor = FIRST_AVAILABLE_COLOR(p);
    let bestColorScore = -Infinity;
    for (const c of p.colors) {
      if (!p.sizes.some((s) => stockOf(p, c.id, s.id) > 0)) continue;
      let s = 0;
      const hsl = hexToHsl(c.hex);
      if (profile.avoidColors.some((a) => hueDist(hsl.h, hexToHsl(a).h) < 24)) s -= 0.9;
      if (profile.loveColors.some((a) => hueDist(hsl.h, hexToHsl(a).h) < 30)) s += 0.5;
      if (chosenHexes.length) {
        const avg = chosenHexes.reduce((acc, hex) => acc + harmony(hex, c.hex).score, 0) / chosenHexes.length;
        s += avg * 1.1;
      } else s += isNeutral(hsl) ? 0.35 : 0.1;
      if (s > bestColorScore) {
        bestColorScore = s;
        bestColor = c;
      }
    }

    const advice = adviseSize(p, profile);
    const size = p.sizes.find((s) => s.label === advice.size && stockOf(p, bestColor.id, s.id) > 0) ?? p.sizes.find((s) => stockOf(p, bestColor.id, s.id) > 0) ?? p.sizes[0];

    let score = 0.5 + bestColorScore * 0.32;
    const reasons: string[] = [];
    const warnings: string[] = [];

    // occasion
    const fDelta = Math.abs(formality(p) - targetFormality[profile.occasion]);
    score += (0.28 - fDelta) * 0.9;
    if (fDelta < 0.12) reasons.push(`مناسب ${OCCASIONS.find((o) => o.id === profile.occasion)?.label}`);
    if (fDelta > 0.34) warnings.push("سطح رسمیت با موقعیت فاصله دارد");

    // taste
    if (styleOf(p).includes(profile.taste)) {
      score += 0.16;
      reasons.push(`سبک ${TASTES.find((t) => t.id === profile.taste)?.label}`);
    }

    // weather: cold needs warmth, heat rejects heavy outerwear
    if (profile.temp <= 12) {
      score += warmth(p.garment) * 0.045;
      if (warmth(p.garment) >= 3) reasons.push("گرم برای هوای سرد");
    } else if (profile.temp >= 24) {
      score -= warmth(p.garment) * 0.05;
      if (warmth(p.garment) >= 3) warnings.push("برای این هوا گرم است");
      else reasons.push("سبک و خنک");
    }

    // harmony with everything already picked — the "memory" of the wizard
    if (chosenHexes.length) {
      const worst = Math.min(...chosenHexes.map((hex) => harmony(hex, bestColor.hex).score));
      const avg = chosenHexes.reduce((a, hex) => a + harmony(hex, bestColor.hex).score, 0) / chosenHexes.length;
      score += avg * 0.3;
      const last = chosen[chosen.length - 1];
      const kind = harmony(chosenHexes[chosenHexes.length - 1], bestColor.hex);
      const against = last?.colorName ? `${last.slotLabel ? last.slotLabel + " " : ""}${last.colorName}` : "";
      reasons.push(against ? `${kind.note} — هماهنگ با ${against}` : kind.note);
      if (worst < 0.5) warnings.push("با یکی از قطعه‌های انتخابی تضاد دارد");
    }

    // age: keep very loud pieces away from conservative brackets, allow them for young
    if (profile.age > 45 && ["sneaker", "tee"].includes(p.garment) && bestColorScore > 0.4) score -= 0.06;
    if (profile.age < 26 && p.price > 1000) score -= 0.05;

    // budget
    if (p.price > profile.budget / 2.4) {
      score -= 0.12;
      warnings.push("بخش بزرگی از بودجه را می‌گیرد");
    }
    if (p.compareAt) {
      score += 0.05;
      reasons.push("تخفیف فعال");
    }

    // body shape nudges
    if (profile.shape === "pear" && p.garment === "trousers" && p.name.includes("فراخ")) {
      score += 0.07;
      reasons.push("فرم فراخ برای بالاتنهٔ متعادل");
    }
    if (profile.shape === "inverted" && p.garment === "skirt") {
      score += 0.05;
      reasons.push("حجم در پایین‌تنه برای تعادل شانه");
    }
    if (profile.height < 165 && p.garment === "coat" && p.name.includes("بلند")) {
      score -= 0.05;
      warnings.push("قد بلند ممکن است کوتاه‌تر نشان دهد");
    }

    out.push({ product: p, color: bestColor, sizeId: size.id, sizeLabel: size.label, score, reasons: reasons.slice(0, 3), warnings: warnings.slice(0, 2) });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** total of an outfit against the stated budget */
export function budgetCheck(items: { price: number }[], budget: number) {
  const total = items.reduce((n, i) => n + i.price, 0);
  const ratio = budget ? total / budget : 0;
  return {
    total,
    within: total <= budget,
    left: budget - total,
    ratio,
    note:
      budget === 0
        ? "بودجه‌ای تعیین نشده"
        : total <= budget
          ? `${Math.round((1 - ratio) * 100).toLocaleString("fa-IR")}٪ از بودجه باقی است`
          : `${Math.round((ratio - 1) * 100).toLocaleString("fa-IR")}٪ بیش از بودجه`,
  };
}

/** a short stylist's note for the finished look */
export function stylistNote(profile: Profile, items: { color: string }[], score: number): string {
  const bits: string[] = [];
  bits.push(
    score >= 85
      ? "پالت این ست یکدست است؛ بدون ترس بپوش."
      : score >= 68
        ? "پالت متعادل است؛ اگر خواستی جسورتر شوی یک اکسسوری رنگی اضافه کن."
        : "دو رنگ در این ست با هم نمی‌خوانند — یکی را خنثی‌تر کن.",
  );
  if (profile.temp <= 12 && !items.length) bits.push("برای این هوا لایهٔ بیرونی لازم داری.");
  if (profile.occasion === "formal") bits.push("برای مراسم رسمی، کفش و کیف را براق و ساده نگه دار.");
  if (profile.occasion === "travel") bits.push("برای سفر، کفش راحت و کیف کراس‌بادی انتخاب هوشمندانه‌ای است.");
  if (profile.age < 26) bits.push("می‌توانی یک قطعهٔ ترند اضافه کنی تا ست جوان‌تر شود.");
  if (profile.age > 45) bits.push("برش‌های تمیز و پارچهٔ باکیفیت، این ست را گران‌تر نشان می‌دهد.");
  return bits.slice(0, 2).join(" ");
}
