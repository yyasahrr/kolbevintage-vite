import type { ColorOption, Look, Product, SizeOption, StockMap } from "@/types";
import { getAdmin } from "@/state/admin";

import look1 from "@/assets/models/look-1.webp";
import look2 from "@/assets/models/look-2.webp";
import look3 from "@/assets/models/look-3.webp";
import look4 from "@/assets/models/look-4.webp";
import look5 from "@/assets/models/look-5.webp";
import look6 from "@/assets/models/look-6.webp";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const c = (id: string, name: string, hex: string): ColorOption => ({ id, name, hex });

const mk = (labels: string[]): SizeOption[] =>
  labels.map((label) => ({ id: label.toLowerCase().replace(/\s+/g, "-"), label }));

const SIZES = {
  apparel: mk(["XS", "S", "M", "L", "XL"]),
  menswear: mk(["S", "M", "L", "XL"]),
  waist: mk(["26", "28", "30", "32", "34"]),
  shoeW: mk(["36", "37", "38", "39", "40", "41"]),
  shoeM: mk(["40", "41", "42", "43", "44"]),
  one: mk(["یک سایز"]),
};

/** deterministic FNV-1a so every reload shows the exact same availability */
function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function buildStock(id: string, colors: ColorOption[], sizes: SizeOption[], soldOut: string[] = []): StockMap {
  const stock: StockMap = {};
  let any = false;
  for (const col of colors) {
    for (const size of sizes) {
      const key = `${col.id}:${size.id}`;
      const v = hash(`${id}|${key}`) % 12;
      const qty = v <= 1 ? 0 : Math.min(9, v - 1);
      stock[key] = qty;
      if (qty > 0) any = true;
    }
  }
  // explicit sold-out colours / variants for demo purposes
  for (const token of soldOut) {
    if (token.includes(":")) {
      stock[token] = 0;
    } else {
      for (const size of sizes) stock[`${token}:${size.id}`] = 0;
    }
  }
  if (!any) stock[`${colors[0].id}:${sizes[0].id}`] = 4;
  return stock;
}

/** A product before its parent look injects the image + aspect ratio. */
type ProductBase = Omit<Product, "image" | "aspect">;

interface ProductSeed extends Omit<ProductBase, "stock"> {
  soldOut?: string[];
}

const product = (seed: ProductSeed): ProductBase => {
  const { soldOut, ...rest } = seed;
  return { ...rest, stock: buildStock(rest.id, rest.colors, rest.sizes, soldOut) };
};

/** crop shorthand: cx, cy, zoom */
const cr = (cx: number, cy: number, zoom: number) => ({ cx, cy, zoom });

interface LookSeed extends Omit<Look, "products"> {
  products: ProductBase[];
}

/* ------------------------------------------------------------------ */
/* palettes                                                            */
/* ------------------------------------------------------------------ */

const NOIR = c("noir", "مشکی", "#16130f");
const CHARCOAL = c("charcoal", "زغالی", "#3b3b3d");
const IVORY = c("ivory", "عاجی", "#f1ead9");
const CREAM = c("cream", "کرم", "#e8e0cb");
const CAMEL = c("camel", "شتری", "#b7905c");
const COGNAC = c("cognac", "کنیاک", "#8c5a33");
const TERRA = c("terracotta", "تراکوتا", "#a9513a");
const SAND = c("sand", "شنی", "#cdbba1");
const STONE = c("stone", "سنگی", "#a9a39a");
const NAVY = c("navy", "نیمه‌شب", "#1d2440");
const OXBLOOD = c("oxblood", "زرشکی", "#5c2026");
const INDIGO = c("indigo", "نیلی شسته", "#4a6487");
const ESPRESSO = c("espresso", "اسپرسو", "#43291c");
const CHOCOLATE = c("chocolate", "شکلاتی", "#5a3a28");
const SILVER = c("silver", "نقره‌ای مروارید", "#c8c6cc");
const SLATE = c("slate", "خاکستری", "#6c727a");

/* ------------------------------------------------------------------ */
/* looks                                                               */
/* ------------------------------------------------------------------ */

const LOOK_SEEDS: LookSeed[] = [
  {
    id: "look-01",
    order: 1,
    name: "معماری نوآر",
    tagline: "ستونی از پشم سیاه، بلند و رها.",
    season: "پاییز / زمستان ۲۶ · اگزیت ۰۱",
    image: look1,
    aspect: 427 / 1180,
    accent: "#16130f",
    products: [
      product({
        id: "p-rive-coat",
        crop: cr(0.5, 0.4, 1),
        name: "پالتوی پشمی اورسایز ریو",
        category: "بیرونی",
        garment: "coat",
        price: 1290,
        compareAt: 1490,
        colors: [NOIR, CHARCOAL, CAMEL],
        sizes: SIZES.apparel,
        soldOut: ["charcoal:xs"],
      }),
      product({
        id: "p-cote-rollneck",
        crop: cr(0.52, 0.26, 0.45),
        name: "بافت مرینوی یقه‌لاک‌پشتی کوت",
        category: "بافت",
        garment: "knit",
        price: 280,
        colors: [NOIR, IVORY, SLATE],
        sizes: SIZES.apparel,
      }),
      product({
        id: "p-lacroix-trouser",
        crop: cr(0.55, 0.72, 0.6),
        name: "شلوار راسته لاکروا",
        category: "خیاطی",
        garment: "trousers",
        price: 390,
        colors: [NOIR, CHARCOAL],
        sizes: SIZES.waist,
      }),
      product({
        id: "p-vega-boot",
        crop: cr(0.6, 0.95, 0.65),
        name: "بوت چرمی کوتاه وگا",
        category: "کفش",
        garment: "boot",
        price: 640,
        colors: [NOIR, OXBLOOD],
        sizes: SIZES.shoeW,
        soldOut: ["oxblood"],
      }),
      product({
        id: "p-carre-bag",
        crop: cr(0.2, 0.62, 0.42),
        name: "کیف دسته‌دار کوچک کاره",
        category: "کیف و چرم",
        garment: "bag",
        price: 990,
        colors: [NOIR, COGNAC],
        sizes: SIZES.one,
      }),
    ],
  },
  {
    id: "look-02",
    order: 2,
    name: "ساعت تراکوتا",
    tagline: "کتانِ آفتاب‌گرفته روی شلواری فراخ و سبک.",
    season: "پاییز / زمستان ۲۶ · اگزیت ۰۲",
    image: look2,
    aspect: 390 / 1180,
    accent: "#a9513a",
    products: [
      product({
        id: "p-sienna-blazer",
        crop: cr(0.5, 0.33, 0.95),
        name: "بلیزر کتان راحت سیِنا",
        category: "خیاطی",
        garment: "jacket",
        price: 720,
        colors: [TERRA, SAND, NOIR],
        sizes: SIZES.menswear,
      }),
      product({
        id: "p-ribbed-tank",
        crop: cr(0.52, 0.35, 0.3),
        name: "تاپ کشباف آتلیه",
        category: "اسنشال",
        garment: "tee",
        price: 120,
        colors: [CREAM, NOIR],
        sizes: SIZES.menswear,
      }),
      product({
        id: "p-palazzo-trouser",
        crop: cr(0.5, 0.72, 0.62),
        name: "شلوار فراخ پالازو",
        category: "خیاطی",
        garment: "trousers",
        price: 340,
        colors: [CREAM, STONE, NOIR],
        sizes: SIZES.waist,
      }),
      product({
        id: "p-marcel-loafer",
        crop: cr(0.5, 0.96, 0.6),
        name: "لوفر دست‌دوز مارسل",
        category: "کفش",
        garment: "loafer",
        price: 450,
        colors: [COGNAC, ESPRESSO],
        sizes: SIZES.shoeM,
      }),
      product({
        id: "p-sling-cross",
        crop: cr(0.62, 0.43, 0.38),
        name: "کیف کراس‌بادی چرمی اسلینگ",
        category: "کیف و چرم",
        garment: "bag",
        price: 520,
        colors: [COGNAC, NOIR],
        sizes: SIZES.one,
      }),
    ],
  },
  {
    id: "look-03",
    order: 3,
    name: "سکوت عاجی",
    tagline: "حجم کشمیر روی جریانی از ساتن اریب.",
    season: "پاییز / زمستان ۲۶ · اگزیت ۰۳",
    image: look3,
    aspect: 369 / 1180,
    accent: "#c2b09a",
    products: [
      product({
        id: "p-nuage-sweater",
        crop: cr(0.5, 0.28, 0.85),
        name: "پلیور کشمیر نوآژ",
        category: "بافت",
        garment: "knit",
        price: 460,
        colors: [IVORY, SAND, SLATE],
        sizes: SIZES.apparel,
      }),
      product({
        id: "p-liquid-skirt",
        crop: cr(0.5, 0.65, 0.8),
        name: "دامن میدی ساتن لیکید",
        category: "دامن",
        garment: "skirt",
        price: 310,
        compareAt: 380,
        colors: [SAND, NAVY, NOIR],
        sizes: SIZES.apparel,
      }),
      product({
        id: "p-aria-slingback",
        crop: cr(0.5, 0.95, 0.65),
        name: "کفش پاشنه‌دار نوک‌تیز آریا",
        category: "کفش",
        garment: "heel",
        price: 520,
        colors: [SAND, NOIR],
        sizes: SIZES.shoeW,
      }),
      product({
        id: "p-soft-shoulder",
        crop: cr(0.85, 0.43, 0.45),
        name: "کیف دوشی جیر سوفله",
        category: "کیف و چرم",
        garment: "bag",
        price: 680,
        colors: [CREAM, CHOCOLATE],
        sizes: SIZES.one,
      }),
    ],
  },
  {
    id: "look-04",
    order: 4,
    name: "استاندارد نیلی",
    tagline: "یونیفرم، بازطراحی‌شده: جین شسته و توییل خشک.",
    season: "پاییز / زمستان ۲۶ · اگزیت ۰۴",
    image: look4,
    aspect: 398 / 1180,
    accent: "#4a6487",
    products: [
      product({
        id: "p-trucker-jacket",
        crop: cr(0.5, 0.33, 0.95),
        name: "کاپشن جین شسته تراکر",
        category: "بیرونی",
        garment: "jacket",
        price: 390,
        colors: [INDIGO, NOIR],
        sizes: SIZES.menswear,
      }),
      product({
        id: "p-heavy-tee",
        crop: cr(0.5, 0.33, 0.3),
        name: "تیشرت جرسی ضخیم",
        category: "اسنشال",
        garment: "tee",
        price: 90,
        colors: [CHARCOAL, IVORY, NOIR],
        sizes: SIZES.menswear,
      }),
      product({
        id: "p-tapered-twill",
        crop: cr(0.5, 0.7, 0.62),
        name: "شلوار تیپر توییل خشک",
        category: "شلوار",
        garment: "trousers",
        price: 240,
        colors: [CHARCOAL, STONE],
        sizes: SIZES.waist,
      }),
      product({
        id: "p-court-sneaker",
        crop: cr(0.5, 0.96, 0.62),
        name: "کفش کالجی چرمی کورت",
        category: "کفش",
        garment: "sneaker",
        price: 320,
        colors: [IVORY, NOIR],
        sizes: SIZES.shoeM,
      }),
    ],
  },
  {
    id: "look-05",
    order: 5,
    name: "ساتن نیمه‌شب",
    tagline: "لغزشی از سرمه‌ای زیر نفس ارگانزای سیاه.",
    season: "پاییز / زمستان ۲۶ · اگزیت ۰۵",
    image: look5,
    aspect: 431 / 1180,
    accent: "#1d2440",
    products: [
      product({
        id: "p-bias-slip",
        crop: cr(0.52, 0.55, 0.85),
        name: "پیراهن ساتن اریب اسلیپ",
        category: "شب",
        garment: "dress",
        price: 890,
        colors: [NAVY, NOIR, OXBLOOD],
        sizes: SIZES.apparel,
        soldOut: ["oxblood:s", "oxblood:m"],
      }),
      product({
        id: "p-organza-coat",
        crop: cr(0.5, 0.35, 1),
        name: "پالتوی اپرا ارگانزا",
        category: "بیرونی",
        garment: "coat",
        price: 1150,
        colors: [NOIR, SILVER],
        sizes: SIZES.apparel,
      }),
      product({
        id: "p-filament-sandal",
        crop: cr(0.55, 0.95, 0.6),
        name: "صندل پاشنه‌دار فیلامنت",
        category: "کفش",
        garment: "heel",
        price: 590,
        colors: [NOIR, SILVER],
        sizes: SIZES.shoeW,
      }),
      product({
        id: "p-perle-clutch",
        crop: cr(0.34, 0.51, 0.35),
        name: "کیف دستی مرواریدبافت پرل",
        category: "کیف و چرم",
        garment: "accessory",
        price: 740,
        colors: [SILVER, NOIR],
        sizes: SIZES.one,
      }),
    ],
  },
  {
    id: "look-06",
    order: 6,
    name: "فصل شتری",
    tagline: "ترنچ، یقه‌لاک‌پشتی، چرم — قدمِ بلند پاییز.",
    season: "پاییز / زمستان ۲۶ · اگزیت ۰۶",
    image: look6,
    aspect: 496 / 1180,
    accent: "#b7905c",
    products: [
      product({
        id: "p-grand-trench",
        crop: cr(0.5, 0.35, 0.95),
        name: "ترنچ دوردکمه گرند",
        category: "بیرونی",
        garment: "coat",
        price: 1450,
        colors: [CAMEL, NOIR, STONE],
        sizes: SIZES.apparel,
      }),
      product({
        id: "p-chocolat-rollneck",
        crop: cr(0.5, 0.21, 0.35),
        name: "بافت پشمی یقه‌لاک‌پشتی شوکولا",
        category: "بافت",
        garment: "knit",
        price: 260,
        colors: [CHOCOLATE, IVORY],
        sizes: SIZES.apparel,
      }),
      product({
        id: "p-leather-wide",
        crop: cr(0.52, 0.6, 0.55),
        name: "شلوار چرمی فراخ",
        category: "شلوار",
        garment: "trousers",
        price: 780,
        colors: [ESPRESSO, NOIR],
        sizes: SIZES.waist,
      }),
      product({
        id: "p-rive-tall-boot",
        crop: cr(0.55, 0.92, 0.5),
        name: "بوت بلند سوارکاری ریو",
        category: "کفش",
        garment: "boot",
        price: 890,
        colors: [CHOCOLATE, NOIR],
        sizes: SIZES.shoeW,
      }),
      product({
        id: "p-atelier-tote",
        crop: cr(0.17, 0.66, 0.4),
        name: "توت ساختاریافته آتلیه",
        category: "کیف و چرم",
        garment: "bag",
        price: 1050,
        colors: [COGNAC, NOIR, CAMEL],
        sizes: SIZES.one,
      }),
    ],
  },
];

export const LOOKS: Look[] = LOOK_SEEDS.map((look) => ({
  ...look,
  products: look.products.map((p) => ({ ...p, image: look.image, aspect: look.aspect })),
}));

export const BACKDROPS = [
  { id: "bone", name: "استخوانی", value: "#f2ece3", dark: false },
  { id: "mist", name: "مه‌آلود", value: "#e6e9e8", dark: false },
  { id: "blush", name: "صورتی", value: "#f1e3dd", dark: false },
  { id: "dune", name: "شنی", value: "#e7dcc9", dark: false },
  { id: "ink", name: "شب", value: "#1b1916", dark: true },
] as const;

export const formatPrice = (value: number) =>
  `${value.toLocaleString("fa-IR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;

export const variantKey = (colorId: string, sizeId: string) => `${colorId}:${sizeId}`;

/** base stock, overridden live by the admin panel when it edits a variant */
/** global resolver: admin edits + custom products, falling back to the base catalogue */
export const stockOf = (p: Product, colorId: string, sizeId: string) => {
  const admin = getAdmin();
  const custom = admin.customProducts.find((c) => c.id === p.id);
  if (custom) return custom.stock[variantKey(colorId, sizeId)] ?? 0;
  const edited = admin.stock.find((s) => s.productId === p.id && s.colorId === colorId && s.sizeId === sizeId);
  if (edited) return edited.qty;
  return p.stock[variantKey(colorId, sizeId)] ?? 0;
};

export const firstAvailable = (p: Product): { colorId: string; sizeId: string } => {
  for (const col of p.colors) {
    for (const size of p.sizes) {
      if (stockOf(p, col.id, size.id) > 0) return { colorId: col.id, sizeId: size.id };
    }
  }
  return { colorId: p.colors[0].id, sizeId: p.sizes[0].id };
};

export const ALL_PRODUCTS: Product[] = LOOKS.flatMap((l) => l.products);
