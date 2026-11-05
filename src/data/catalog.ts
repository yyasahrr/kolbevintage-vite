import { LOOKS, stockOf } from "./looks";
import { getAdmin, type CustomProduct } from "@/state/admin";
import { lookProductIds } from "@/state/ops";
import type { ColorOption, Crop, GarmentKind, Look, Product } from "@/types";

export interface CatalogProduct extends Product {
  lookId: string;
  lookName: string;
  lookSlug: string;
  lookOrder: number;
  /** editorial copy */
  description: string;
  material: string;
  care: string;
  fit: string;
  origin: string;
  badge?: "جدید" | "پرفروش" | "آخرین موجودی" | "تخفیف" | "پیشنهاد سردبیر" | "حراج";
}

interface Detail {
  material: string;
  care: string;
  fit: string;
  blurb: string;
}

const DETAILS: Record<GarmentKind, Detail> = {
  coat: {
    material: "۷۰٪ پشم ویرجین، ۲۵٪ پلی‌آمید، ۵٪ کشمیر",
    care: "شست‌وشوی خشک با پرس گرم؛ نگهداری روی چوب‌لباس پهن",
    fit: "اورسایز با آستر کامل؛ دو سایز کوچک‌تر برای فرم کلاسیک",
    blurb:
      "لایهٔ اصلی پاییز؛ با شانه‌های افتاده و برشی بلند که در حرکت باز می‌شود. پارچه پس از چند بار پوشیدن فرم بدن را می‌گیرد و نرم‌تر می‌شود.",
  },
  jacket: {
    material: "۱۰۰٪ کتان ایتالیایی، آستر تنفس‌پذیر",
    care: "شست‌وشوی ملایم ۳۰ درجه یا خشک‌شویی",
    fit: "راحت و کمی بلندتر از حد معمول",
    blurb:
      "ساختاری سبک برای روزهای گذار فصل. یقهٔ طبیعی، دکمه‌های شاخ و جیب‌های کاربردی؛ ساده اما با جزئیات کامل.",
  },
  knit: {
    material: "۱۰۰٪ کشمیر مغولستان، بافت تمام‌بافته",
    care: "شست‌وشوی دستی با آب سرد، خشک کردن افقی",
    fit: "فرم راحت با حجم کنترل‌شده",
    blurb:
      "بافت ساده‌ای که می‌تواند تمام فصل همراه باشد. تراکم بالا، لبه‌های کشباف و رنگ‌بندی خنثی برای لایه‌بندی بی‌زحمت.",
  },
  tee: {
    material: "۱۰۰٪ پنبهٔ آلی با گرماژ ۲۴۰",
    care: "شست‌وشوی ماشینی ۳۰ درجه، بدون سفیدکننده",
    fit: "برش مستقیم و کمی آزاد",
    blurb:
      "تی‌شرت پایهٔ کمد؛ یقهٔ ضخیم که فرم می‌ماند و رنگ‌های شسته‌ای که با هر چیزی هماهنگ می‌شوند.",
  },
  dress: {
    material: "۱۰۰٪ ساتن ویسکوز با درخشش مات",
    care: "شست‌وشوی خشک؛ نگهداری دور از نور مستقیم",
    fit: "برش اریب، چسبان روی بدن بدون فشار",
    blurb:
      "پیراهنی که با حرکت بدن جابه‌جا می‌شود. برش اریب و درزهای پنهان، فرمی سیال و در عین حال ساده می‌سازند.",
  },
  skirt: {
    material: "۱۰۰٪ ساتن ویسکوز، آستر نرم",
    care: "شست‌وشوی خشک",
    fit: "میدی، برش اریب",
    blurb:
      "دامن میدی با جریان پارچه‌ای که در قدم برداشتن باز می‌شود؛ کمر کشدار پنهان برای راحتی تمام روز.",
  },
  trousers: {
    material: "۹۸٪ پشم، ۲٪ الاستان",
    care: "شست‌وشوی خشک",
    fit: "فراخ از کمر تا مچ؛ اندازهٔ کمر قابل تنظیم",
    blurb:
      "شلوار با فرم فراخ و خط پرس تیز؛ کفش را پنهان می‌کند و با کت کوتاه یا بلند هر دو کار می‌کند.",
  },
  bag: {
    material: "چرم گاوی دباغی‌شدهٔ گیاهی، یدک برنجی",
    care: "تمیز کردن با پارچهٔ نرم؛ دور از رطوبت",
    fit: "جیب داخلی زیپ‌دار و بند قابل تنظیم",
    blurb:
      "کیفی که با گذشت زمان پتینه می‌شود. ساختار محکم، درزهای دست‌دوز و فضای کافی برای روزهای کاری.",
  },
  loafer: {
    material: "چرم بزی، زیرهٔ چرمی با پاشنهٔ لاستیکی",
    care: "واکس و برس چرم هر دو هفته",
    fit: "اندازهٔ استاندارد؛ برای پای پهن نیم سایز بزرگ‌تر",
    blurb:
      "لوفر با رویهٔ دست‌دوز و خطوط صاف؛ از صبح تا شب بدون دردسر و با هر شلواری.",
  },
  heel: {
    material: "چرم ناپا، پاشنهٔ ۶ سانتی",
    care: "نگهداری در کیف پارچه‌ای",
    fit: "نوک‌تیز با بند قابل تنظیم",
    blurb:
      "کفشی که خط پا را کشیده می‌کند. پاشنهٔ متعادل و کفی نرم برای ساعت‌های طولانی.",
  },
  boot: {
    material: "چرم گاوی مات، زیرهٔ لاستیکی",
    care: "واکس دوره‌ای و خشک کردن طبیعی",
    fit: "ساسات استاندارد، ساق متوسط",
    blurb:
      "بوت با ساختار محکم و سیلوئت باریک؛ ترکیبی از دوام روزمره و ظرافت شهری.",
  },
  sneaker: {
    material: "چرم سفید ایتالیایی، زیرهٔ لاستیک طبیعی",
    care: "تمیز کردن با پارچهٔ نمدار",
    fit: "اندازهٔ استاندارد",
    blurb:
      "کفش کالجی مینیمال با خطوط تمیز؛ همان چیزی که با کت و شلوار هم درست جواب می‌دهد.",
  },
  accessory: {
    material: "مروارید طبیعی، قاب فلزی",
    care: "نگهداری در پوشش نرم",
    fit: "بند زنجیری جداشدنی",
    blurb:
      "قطعهٔ کوچک برای شب؛ پرداخت دستی و جزئیاتی که از نزدیک دیده می‌شوند.",
  },
};

const slugifyLook = (look: Look) => look.id;

export const totalStock = (p: Product) =>
  p.colors.reduce((sum, c) => sum + p.sizes.reduce((s, size) => s + stockOf(p, c.id, size.id), 0), 0);

export const CATALOG: CatalogProduct[] = LOOKS.flatMap((look) =>
  look.products.map((product) => {
    const detail = DETAILS[product.garment];
    const stock = totalStock(product);
    const badge: CatalogProduct["badge"] = product.compareAt
      ? "تخفیف"
      : stock <= 14
        ? "آخرین موجودی"
        : look.order >= 5
          ? "جدید"
          : look.order <= 2
            ? "پرفروش"
            : undefined;
    return {
      ...product,
      lookId: look.id,
      lookName: look.name,
      lookSlug: slugifyLook(look),
      lookOrder: look.order,
      description: detail.blurb,
      material: detail.material,
      care: detail.care,
      fit: detail.fit,
      origin: "طراحی و تولید در آتلیهٔ تهران",
      badge,
    };
  }),
);

export const getProduct = (id: string | undefined) => liveGetProduct(id);

export const getLook = (slug: string | undefined) => LOOKS.find((l) => l.id === slug);

export const productsOfLook = (lookId: string) => liveCatalog().filter((p) => p.lookId === lookId);

export const relatedProducts = (product: CatalogProduct, count = 4) => {
  const all = liveCatalog();
  const sameCategory = all.filter((p) => p.id !== product.id && p.category === product.category);
  const sameLook = all.filter((p) => p.id !== product.id && p.lookId === product.lookId);
  const rest = all.filter((p) => p.id !== product.id);
  const merged = [...sameLook, ...sameCategory, ...rest];
  const seen = new Set<string>();
  return merged.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).slice(0, count);
};

/** admin-defined complementary products for a product, in the chosen order */
export const complementProducts = (productId: string) => {
  const ids = getAdmin().complements[productId] ?? [];
  return ids
    .map((id) => liveGetProduct(id))
    .filter((p): p is CatalogProduct => !!p && p.id !== productId);
};

/** Three framings of the same runway photograph + one full-length frame. */
export const galleryFor = (product: CatalogProduct) => {
  const { crop } = product;
  return [
    { ...crop, label: "نمای نزدیک" },
    { cx: crop.cx, cy: crop.cy, zoom: Math.max(0.2, crop.zoom * 0.55), label: "جزئیات پارچه" },
    { cx: Math.max(0.15, Math.min(0.85, crop.cx * 0.82)), cy: Math.min(0.8, crop.cy + 0.06), zoom: Math.max(0.26, crop.zoom * 0.8), label: "زاویهٔ دوم" },
    { cx: 0.5, cy: 0.5, zoom: 1, label: "استایل کامل" },
  ] satisfies (Crop & { label: string })[];
};

/* ------------------------------------------------------------------ */
/* taxonomy                                                            */
/* ------------------------------------------------------------------ */

export interface Collection {
  id: string;
  label: string;
  short: string;
  garments: GarmentKind[];
  group: "clothing" | "shoes" | "accessories";
}

export const COLLECTIONS: Collection[] = [
  { id: "outerwear", label: "پالتو و کاپشن", short: "بیرونی", garments: ["coat", "jacket"], group: "clothing" },
  { id: "knitwear", label: "بافت و تی‌شرت", short: "بافت", garments: ["knit", "tee"], group: "clothing" },
  { id: "tailoring", label: "شلوار و دامن", short: "خیاطی", garments: ["trousers", "skirt"], group: "clothing" },
  { id: "dresses", label: "پیراهن", short: "پیراهن", garments: ["dress"], group: "clothing" },
  { id: "shoes", label: "کفش", short: "کفش", garments: ["loafer", "heel", "boot", "sneaker"], group: "shoes" },
  { id: "bags", label: "کیف و اکسسوری", short: "کیف", garments: ["bag", "accessory"], group: "accessories" },
];

/* live catalogue: base products + admin-added products, minus hidden ones */

const customToCatalog = (cp: CustomProduct): CatalogProduct => {
  const look = LOOKS.find((l) => l.id === cp.lookId) ?? LOOKS[0];
  return {
    id: cp.id,
    name: cp.name,
    category: cp.category,
    garment: cp.garment,
    price: cp.price,
    compareAt: cp.compareAt,
    colors: cp.colors,
    sizes: cp.sizes,
    stock: { ...cp.stock },
    description: cp.description || "محصول جدید فروشگاه ولور؛ ساخته‌شده در آتلیه.",
    material: "پارچهٔ طبیعی آتلیهٔ ولور",
    care: "دستورالعمل روی برچسب محصول",
    fit: "منطبق با راهنمای سایز",
    origin: "آتلیهٔ ولور",
    badge: (cp.badges?.[0] as CatalogProduct["badge"] | undefined) ?? (cp.featured ? "پرفروش" : "جدید"),
    lookId: look.id,
    lookName: "محصول آتلیه",
    lookSlug: look.id,
    lookOrder: 0,
    crop: cp.crop,
    image: look.image,
    aspect: look.aspect,
  };
};

/** merge an admin edit over the original catalogue entry */
const withEdit = (p: CatalogProduct): CatalogProduct => {
  const edit = getAdmin().productEdits[p.id];
  if (!edit) return p;
  const ownerBadge = edit.badges?.[0] as CatalogProduct["badge"] | undefined;
  return {
    ...p,
    ...edit,
    description: edit.description ?? p.description,
    stock: edit.stock ? { ...p.stock, ...edit.stock } : p.stock,
    // an owner-chosen label replaces the automatic one (decision 58)
    badge: ownerBadge ?? p.badge,
  };
};

export const liveCatalog = (): CatalogProduct[] => {
  const admin = getAdmin();
  return [
    ...CATALOG.map(withEdit),
    ...admin.customProducts.filter((c) => c.active).map(customToCatalog),
  ];
};

export const liveGetProduct = (id: string | undefined) => (id ? liveCatalog().find((p) => p.id === id) : undefined);

/**
 * The runway reads from here, so a look the owner builds in the admin panel is
 * a first-class citizen: same shape, same product panel, same cart rules.
 * Order of truth: hidden → explicit order → base order → newest custom.
 */
export const liveLooks = (): Look[] => {
  const admin = getAdmin();
  const hidden = new Set(admin.hiddenLooks);
  const explicit = admin.lookOrder;

  const withProducts = (look: Look): Look => {
    const chosen = lookProductIds(look.id);
    if (!chosen.length) return look;
    const products = chosen.map((id) => liveGetProduct(id)).filter((p): p is CatalogProduct => Boolean(p));
    return products.length ? { ...look, products } : look;
  };

  const base = LOOKS.filter((l) => !hidden.has(l.id)).map(withProducts);

  const custom: Look[] = admin.customLooks
    .filter((l) => l.published && !hidden.has(l.id))
    .map((l) => {
      const products = l.productIds.map((id) => liveGetProduct(id)).filter((p): p is CatalogProduct => Boolean(p));
      return {
        id: l.id,
        order: 100 + l.createdAt / 1e12,
        name: l.name,
        tagline: l.tagline,
        season: l.season,
        image: l.image || products[0]?.image || LOOKS[0].image,
        aspect: l.aspect || products[0]?.aspect || 1.5,
        accent: "#bc9b70",
        products,
      } satisfies Look;
    })
    .filter((l) => l.products.length > 0);

  const all = [...base, ...custom];
  const rank = (id: string, fallback: number) => {
    const i = explicit.indexOf(id);
    return i === -1 ? 500 + fallback : i;
  };
  return all.sort((a, b) => rank(a.id, a.order) - rank(b.id, b.order));
};

const isHidden = (id: string) => {
  const admin = getAdmin();
  return admin.hidden.includes(id) || !!admin.customProducts.find((c) => c.id === id && !c.active);
};
const isFeatured = (id: string) => {
  const admin = getAdmin();
  return admin.featured.includes(id) || !!admin.customProducts.find((c) => c.id === id && c.featured);
};

export const visibleProducts = () => liveCatalog().filter((p) => !isHidden(p.id));

export const productsInCollection = (id: string) => {
  const base = visibleProducts();
  if (id === "all") return base;
  const collection = COLLECTIONS.find((c) => c.id === id);
  return collection ? base.filter((p) => collection.garments.includes(p.garment)) : base;
};

/** Categories derived from the catalogue, ordered by the collection taxonomy. */
export const CATEGORIES = COLLECTIONS.flatMap((collection) => {
  const names = [...new Set(CATALOG.filter((p) => collection.garments.includes(p.garment)).map((p) => p.category))];
  return names.map((name) => ({
    name,
    collectionId: collection.id,
    count: CATALOG.filter((p) => p.category === name).length,
  }));
});

export const ALL_SIZES = [...new Set(CATALOG.flatMap((p) => p.sizes.map((s) => s.label)))];

export const ALL_COLORS: ColorOption[] = [
  ...new Map(CATALOG.flatMap((p) => p.colors).map((c) => [c.id, c])).values(),
];

export type SortKey = "featured" | "newest" | "price-asc" | "price-desc";

export const SORTS: { id: SortKey; label: string }[] = [
  { id: "featured", label: "پیشنهاد ولور" },
  { id: "newest", label: "جدیدترین" },
  { id: "price-asc", label: "ارزان‌ترین" },
  { id: "price-desc", label: "گران‌ترین" },
];

export interface ProductFilters {
  collection?: string;
  category?: string;
  size?: string;
  color?: string;
  sort?: SortKey;
  query?: string;
}

export function filterProducts(filters: ProductFilters): CatalogProduct[] {
  let list = productsInCollection(filters.collection ?? "all");

  if (filters.category) list = list.filter((p) => p.category === filters.category);
  if (filters.size) list = list.filter((p) => p.sizes.some((s) => s.label === filters.size));
  if (filters.color)
    list = list.filter((p) =>
      p.colors.some(
        (c) => c.id === filters.color && p.sizes.some((s) => stockOf(p, c.id, s.id) > 0),
      ),
    );
  if (filters.query) {
    const q = filters.query.trim().toLowerCase();
    if (q) {
      list = list.filter((p) =>
        [p.name, p.category, p.lookName, ...p.colors.map((c) => c.name)].some((v) =>
          v.toLowerCase().includes(q),
        ),
      );
    }
  }

  const sorted = [...list];
  switch (filters.sort) {
    case "newest":
      sorted.sort((a, b) => b.lookOrder - a.lookOrder);
      break;
    case "price-asc":
      sorted.sort((a, b) => a.price - b.price);
      break;
    case "price-desc":
      sorted.sort((a, b) => b.price - a.price);
      break;
    default:
      sorted.sort(
        (a, b) =>
          Number(isFeatured(b.id)) - Number(isFeatured(a.id)) || Number(b.badge === "پرفروش") - Number(a.badge === "پرفروش"),
      );
  }
  return sorted;
}

export const newArrivals = () => [...visibleProducts()].sort((a, b) => b.lookOrder - a.lookOrder).slice(0, 8);
export const bestSellers = () => visibleProducts().filter((p) => p.badge === "پرفروش" || isFeatured(p.id)).slice(0, 4);
export const FEATURED_COLLECTIONS = COLLECTIONS.filter((c) =>
  ["outerwear", "knitwear", "shoes", "bags"].includes(c.id),
);
