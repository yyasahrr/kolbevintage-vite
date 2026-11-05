import { useSyncExternalStore } from "react";
import type { Crop, GarmentKind, ColorOption, SizeOption, StockMap } from "@/types";
import { pushRemote } from "./persist";

/* =====================================================================
   Admin data store — the single source of truth the admin panel edits
   and the storefront reads live (products, stock, discounts, campaigns,
   customers, integrations, orders).
   ===================================================================== */

export interface StoreSettings {
  name: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  currency: string;
  /** how many Toman one stored price unit is worth (display only) */
  currencyRate: number;
  freeShipping: number;
  expressCost: number;
  returnDays: number;
  passcode: string;
  maintenance: boolean;
  /**
   * a shop-floor announcement, deliberately separate from maintenance
   * (decision 63): maintenance is "we are closed", a notice is "here is
   * something you should know" and it shows while everything still works.
   */
  notice: { on: boolean; text: string; href: string; tone: "info" | "warn" };
  /** store-wide "low stock" line; 0/undefined = the built-in default (decision 32) */
  lowStockThreshold?: number;
}

export const LOW_STOCK_DEFAULT = 12;

export type OrderStatus = "pending" | "processing" | "shipped" | "done" | "cancelled" | "exception";
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "در انتظار پرداخت",
  processing: "در حال آماده‌سازی",
  shipped: "ارسال شده",
  done: "تحویل شده",
  cancelled: "لغو شده",
  exception: "استثنا — بررسی مالی",
};

export interface OrderLine {
  name: string;
  productId: string;
  color: string;
  colorId: string;
  size: string;
  sizeId: string;
  qty: number;
  price: number;
}

export interface Order {
  id: string;
  at: number;
  customer: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  shipping: "standard" | "express";
  lines: OrderLine[];
  subtotal: number;
  discounts: { name: string; amount: number }[];
  discountTotal: number;
  shippingCost: number;
  total: number;
  status: OrderStatus;
  coupon?: string;
  campaign?: string;
  gateway?: string;
  /** internal notes — the customer never sees these */
  notes?: { id: string; at: number; by: string; text: string }[];
  /** carrier tracking code, shown to the customer */
  tracking?: string;
}

export interface Coupon {
  id: string;
  code: string;
  kind: "percent" | "fixed";
  value: number;
  minSpend: number;
  /** hard ceiling in Toman for a percent code; 0/undefined = no cap */
  maxDiscount?: number;
  /** how many times the code may be used in total; undefined = unlimited */
  usageLimit?: number;
  active: boolean;
  expires: string;
  uses: number;
}

export interface Review {
  id: string;
  product: string;
  author: string;
  /** 0 means the customer left a review without a star (decision 59) */
  rating: number;
  text: string;
  at: number;
  approved: boolean;
  /** the store's public answer, written from the panel (decision 70) */
  reply?: { text: string; at: number; by: string };
}

/* ---------------- catalogue extensions ---------------- */

export interface CustomProduct {
  id: string;
  name: string;
  category: string;
  garment: GarmentKind;
  /** the look whose photo/aspect this product borrows */
  lookId: string;
  crop: { cx: number; cy: number; zoom: number };
  price: number;
  compareAt?: number;
  description?: string;
  colors: ColorOption[];
  sizes: SizeOption[];
  stock: StockMap;
  active: boolean;
  featured: boolean;
  createdAt: number;
  /** this product's own low-stock line, overriding the store-wide one (decision 32) */
  lowStockThreshold?: number;
  /** owner-chosen labels, shown on the product card (decision 58) */
  badges?: string[];
  /** what the piece cost the shop, so a margin can be shown (decision 38) */
  cost?: number;
}

/**
 * Override applied on top of a base-catalogue product when the admin edits it.
 * Everything is optional: only the fields the admin actually touched differ
 * from the original catalogue entry, so materials/editorial copy stay intact.
 */
export interface ProductEdit {
  name?: string;
  category?: string;
  garment?: GarmentKind;
  price?: number;
  compareAt?: number;
  description?: string;
  lookId?: string;
  crop?: Crop;
  colors?: ColorOption[];
  sizes?: SizeOption[];
  /** stock snapshot for the variants shown in the form */
  stock?: StockMap;
  /** this product's own low-stock line, overriding the store-wide one (decision 32) */
  lowStockThreshold?: number;
  /** owner-chosen labels, shown on the product card (decision 58) */
  badges?: string[];
  /** what the piece cost the shop, so a margin can be shown (decision 38) */
  cost?: number;
}

export const GARMENT_LABEL: Record<string, string> = {
  coat: "پالتو / کاپشن",
  jacket: "جلیقه / جاکت",
  knit: "بافت",
  tee: "تی‌شرت / تاپ",
  dress: "پیراهن",
  skirt: "دامن",
  trousers: "شلوار",
  bag: "کیف",
  loafer: "لوفر",
  heel: "کفش پاشنه‌دار",
  boot: "بوت",
  sneaker: "کفش ورزشی",
  accessory: "اکسسوری",
};

export interface StockMove {
  id: string;
  at: number;
  productId: string;
  name: string;
  colorId: string;
  sizeId: string;
  delta: number;
  reason: "sale" | "restock" | "edit" | "create";
}

/* ---------------- discounts & campaigns ---------------- */

export type Scope = "all" | "category" | "look";
export const SCOPE_LABEL: Record<Scope, string> = { all: "کل فروشگاه", category: "یک دسته", look: "یک استایل" };

export interface Campaign {
  id: string;
  name: string;
  start: string;
  end: string;
  kind: "percent" | "fixed" | "freeship";
  value: number;
  minSpend: number;
  /** hard ceiling in Toman for a percent campaign; 0/undefined = no cap (decision 33) */
  maxDiscount?: number;
  scope: Scope;
  scopeId?: string;
  code?: string;
  banner: { title: string; text: string; active: boolean; tone: "gold" | "dark" };
  active: boolean;
  uses: number;
}

export type RuleType = "percent" | "fixed" | "second" | "bundle" | "freeship";
export const RULE_TYPE_LABEL: Record<RuleType, string> = {
  percent: "تخفیف درصدی",
  fixed: "تخفیف مبلغ ثابت",
  second: "تخفیف روی قطعهٔ دوم",
  bundle: "X عدد به قیمت Y",
  freeship: "ارسال رایگان",
};

export interface DiscountRule {
  id: string;
  name: string;
  type: RuleType;
  value: number;
  qty: number;
  scope: Scope;
  scopeId?: string;
  minItems: number;
  stackable: boolean;
  active: boolean;
  priority: number;
  from?: string;
  to?: string;
}

/* ---------------- integrations ---------------- */

export interface Integrations {
  ai: {
    provider: "openai" | "anthropic" | "custom";
    baseUrl: string;
    apiKey: string;
    model: string;
    enabled: boolean;
    lastTest?: { ok: boolean; at: number; ms?: number; error?: string };
  };
  payment: { gateway: "zarinpal" | "sadad" | "stripe" | "none"; key: string; mode: "test" | "live"; enabled: boolean };
  sms: { provider: string; sender: string; key: string; enabled: boolean };
  email: { provider: string; from: string; key: string; enabled: boolean };
  shipping: { courier: string; apiKey: string; enabled: boolean };
}

export interface CustomerMeta {
  tags: string[];
  note: string;
}

/* =====================================================================
   state
   ===================================================================== */

const KEY = "velours.admin.v2";
const SESSION = "velours.admin.session.v1";

/** a look the owner builds inside the admin panel (base runway looks stay code-side) */
export interface CustomLook {
  id: string;
  name: string;
  tagline: string;
  season: string;
  /** upload data-url; falls back to the first product image when empty */
  image: string;
  /** natural aspect (w / h) of the cut-out, keeps the runway free of layout shift */
  aspect: number;
  productIds: string[];
  published: boolean;
  createdAt: number;
}

export interface AdminState {
  settings: StoreSettings;
  orders: Order[];
  coupons: Coupon[];
  reviews: Review[];
  hidden: string[];
  featured: string[];
  hiddenLooks: string[];
  stock: { productId: string; colorId: string; sizeId: string; qty: number }[];
  lookOrder: string[];
  /** owner-built looks; only `published` ones reach the storefront */
  customLooks: CustomLook[];
  customProducts: CustomProduct[];
  /** base product id → field overrides (base catalogue products are editable too) */
  productEdits: Record<string, ProductEdit>;
  /** product id → product ids that complete the look ("کالاهای مکمل") */
  complements: Record<string, string[]>;
  movements: StockMove[];
  campaigns: Campaign[];
  rules: DiscountRule[];
  integrations: Integrations;
  customers: Record<string, CustomerMeta>;
}

const days = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const DEFAULT_ADMIN: AdminState = {
  settings: {
    name: "ولور",
    tagline: "خانهٔ پوشاک آماده — تهران",
    address: "تهران، خیابان ولیعصر، پلاک ۲۴، طبقهٔ دوم",
    phone: "021 8888 2424",
    email: "client@velours.store",
    currency: "تومان",
    currencyRate: 1000,
    freeShipping: 200,
    expressCost: 25,
    returnDays: 14,
    passcode: "1234",
    maintenance: false,
    notice: { on: false, text: "", href: "", tone: "info" },
  },
  orders: [],
  coupons: [
    { id: "c1", code: "VELOURS10", kind: "percent", value: 10, minSpend: 0, active: true, expires: "", uses: 0 },
    { id: "c2", code: "RUNWAY50", kind: "fixed", value: 50, minSpend: 400, active: true, expires: "", uses: 0 },
  ],
  reviews: [
    { id: "r1", product: "پالتوی پشمی اورسایز ریو", author: "آوا رادمهر", rating: 5, text: "پارچه و دوخت فوق‌العاده؛ دقیقاً مثل عکس رانوی.", at: Date.now() - 86400000 * 3, approved: true },
    { id: "r2", product: "شلوار فراخ پالازو", author: "سارا نیکخواه", rating: 4, text: "قدش برای من کمی بلند بود، بقیه‌اش عالی.", at: Date.now() - 86400000 * 6, approved: true },
    { id: "r3", product: "کیف دسته‌دار کوچک کاره", author: "میلاد صالحی", rating: 5, text: "چرم بعد از دو ماه هنوز مثل روز اول است.", at: Date.now() - 86400000 * 9, approved: false },
    { id: "r4", product: "بافت مرینوی یقه‌لاک‌پشتی کوت", author: "نگار موسوی", rating: 3, text: "کمی نازک‌تر از انتظارم بود.", at: Date.now() - 86400000 * 12, approved: false },
  ],
  hidden: [],
  featured: [],
  hiddenLooks: [],
  stock: [],
  lookOrder: [],
  customLooks: [],
  customProducts: [
    {
      id: "custom-scarf",
      name: "روسری حریر مچاله",
      category: "اکسسوری",
      garment: "accessory",
      lookId: "look-03",
      crop: { cx: 0.5, cy: 0.28, zoom: 0.55 },
      price: 120,
      colors: [
        { id: "ivory", name: "عاجی", hex: "#f1ead9" },
        { id: "sand", name: "شنی", hex: "#cdbba1" },
      ],
      sizes: [{ id: "one-size", label: "یک سایز" }],
      stock: { "ivory:one-size": 24, "sand:one-size": 12 },
      active: true,
      featured: false,
      createdAt: Date.now() - 86400000 * 20,
    },
  ],
  productEdits: {},
  complements: {},
  movements: [],
  campaigns: [
    {
      id: "cmp-autumn",
      name: "جشنوارهٔ پاییزه",
      start: days(-2),
      end: days(5),
      kind: "percent",
      value: 15,
      minSpend: 150,
      scope: "all",
      banner: { title: "جشنوارهٔ پاییزه", text: "۱۵٪ تخفیف روی خرید بالای ۱۵۰ تومان", active: true, tone: "gold" },
      active: true,
      uses: 0,
    },
  ],
  rules: [
    {
      id: "rule-2nd",
      name: "دوم کفش‌ها ۲۰٪",
      type: "second",
      value: 20,
      qty: 2,
      scope: "category",
      scopeId: "کفش",
      minItems: 2,
      stackable: true,
      active: true,
      priority: 10,
    },
    {
      id: "rule-ship",
      name: "ارسال رایگان با ۲۰۰ تومان",
      type: "freeship",
      value: 200,
      qty: 1,
      scope: "all",
      minItems: 1,
      stackable: true,
      active: true,
      priority: 1,
    },
  ],
  integrations: {
    ai: {
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "",
      model: "gpt-4o-mini",
      enabled: false,
    },
    payment: { gateway: "none", key: "", mode: "test", enabled: false },
    sms: { provider: "کاسپیس", sender: "1000543210", key: "", enabled: false },
    email: { provider: "Resend", from: "velours@velours.store", key: "", enabled: false },
    shipping: { courier: "تپیکس", apiKey: "", enabled: false },
  },
  customers: {},
};

function read(): AdminState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_ADMIN;
    const p = JSON.parse(raw) as Partial<AdminState>;
    return {
      ...DEFAULT_ADMIN,
      ...p,
      settings: { ...DEFAULT_ADMIN.settings, ...(p.settings ?? {}) },
      integrations: {
        ai: { ...DEFAULT_ADMIN.integrations.ai, ...(p.integrations?.ai ?? {}) },
        payment: { ...DEFAULT_ADMIN.integrations.payment, ...(p.integrations?.payment ?? {}) },
        sms: { ...DEFAULT_ADMIN.integrations.sms, ...(p.integrations?.sms ?? {}) },
        email: { ...DEFAULT_ADMIN.integrations.email, ...(p.integrations?.email ?? {}) },
        shipping: { ...DEFAULT_ADMIN.integrations.shipping, ...(p.integrations?.shipping ?? {}) },
      },
    };
  } catch {
    return DEFAULT_ADMIN;
  }
}

let cache: AdminState = typeof window === "undefined" ? DEFAULT_ADMIN : read();
const listeners = new Set<() => void>();

function commit(next: AdminState) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota — keep in memory */
  }
  listeners.forEach((l) => l());
  // persisted to PostgreSQL through the sync bridge (no-op when offline)
  pushRemote("admin", next);
}

/** replaces the store with the server snapshot without echoing it back */
export function hydrateAdmin(next: Partial<AdminState>) {
  const merged: AdminState = {
    ...DEFAULT_ADMIN,
    ...next,
    settings: { ...DEFAULT_ADMIN.settings, ...(next.settings ?? {}) },
    integrations: {
      ai: { ...DEFAULT_ADMIN.integrations.ai, ...(next.integrations?.ai ?? {}) },
      payment: { ...DEFAULT_ADMIN.integrations.payment, ...(next.integrations?.payment ?? {}) },
      sms: { ...DEFAULT_ADMIN.integrations.sms, ...(next.integrations?.sms ?? {}) },
      email: { ...DEFAULT_ADMIN.integrations.email, ...(next.integrations?.email ?? {}) },
      shipping: { ...DEFAULT_ADMIN.integrations.shipping, ...(next.integrations?.shipping ?? {}) },
    },
    customLooks: next.customLooks ?? [],
    customProducts: next.customProducts ?? [],
    productEdits: next.productEdits ?? {},
    complements: next.complements ?? {},
  };
  cache = merged;
  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    /* quota */
  }
  listeners.forEach((l) => l());
}

export const useAdmin = () => useSyncExternalStore(subscribe, getAdmin, getAdmin);
export const getAdmin = () => cache;
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const patch = (p: Partial<AdminState>) => commit({ ...cache, ...p });

/* ---------------- settings ---------------- */
export const patchSettings = (p: Partial<StoreSettings>) => patch({ settings: { ...cache.settings, ...p } });

/* ---------------- orders ---------------- */
export const addOrder = (o: Order) => patch({ orders: [o, ...cache.orders].slice(0, 400) });
/** any order field, without inventing a mutator per field */
export const patchOrder = (id: string, change: Partial<Order>) =>
  patch({ orders: cache.orders.map((o) => (o.id === id ? { ...o, ...change } : o)) });

export const addOrderNote = (id: string, text: string, by: string) =>
  patch({
    orders: cache.orders.map((o) =>
      o.id === id
        ? { ...o, notes: [...(o.notes ?? []), { id: `n-${Math.random().toString(36).slice(2, 8)}`, at: Date.now(), by, text }] }
        : o,
    ),
  });

export const setOrderStatus = (id: string, status: OrderStatus) =>
  patch({ orders: cache.orders.map((o) => (o.id === id ? { ...o, status } : o)) });
export const removeOrder = (id: string) => patch({ orders: cache.orders.filter((o) => o.id !== id) });

/* ---------------- reviews / looks ---------------- */
/** a customer review always lands as "pending": the owner decides what the shop shows */
export const submitReview = (review: Omit<Review, "id" | "at" | "approved">) =>
  patch({
    reviews: [
      { ...review, id: `r${Math.random().toString(36).slice(2, 9)}`, at: Date.now(), approved: false },
      ...cache.reviews,
    ],
  });

export const setReviewReply = (id: string, text: string, by: string) =>
  patch({
    reviews: cache.reviews.map((r) =>
      r.id === id ? { ...r, reply: text.trim() ? { text: text.trim(), at: Date.now(), by } : undefined } : r,
    ),
  });
export const setReviewApproved = (id: string, approved: boolean) =>
  patch({ reviews: cache.reviews.map((r) => (r.id === id ? { ...r, approved } : r)) });
export const removeReview = (id: string) => patch({ reviews: cache.reviews.filter((r) => r.id !== id) });
export const saveCustomLook = (look: CustomLook) =>
  patch({
    customLooks: cache.customLooks.some((l) => l.id === look.id)
      ? cache.customLooks.map((l) => (l.id === look.id ? look : l))
      : [look, ...cache.customLooks],
  });
export const removeCustomLook = (id: string) =>
  patch({
    customLooks: cache.customLooks.filter((l) => l.id !== id),
    hiddenLooks: cache.hiddenLooks.filter((x) => x !== id),
    lookOrder: cache.lookOrder.filter((x) => x !== id),
  });
export const setCustomLookPublished = (id: string, published: boolean) =>
  patch({ customLooks: cache.customLooks.map((l) => (l.id === id ? { ...l, published } : l)) });
export const toggleLookHidden = (id: string) =>
  patch({ hiddenLooks: cache.hiddenLooks.includes(id) ? cache.hiddenLooks.filter((x) => x !== id) : [...cache.hiddenLooks, id] });

/* ---------------- catalogue flags ---------------- */
export const toggleHidden = (id: string) =>
  patch({ hidden: cache.hidden.includes(id) ? cache.hidden.filter((x) => x !== id) : [...cache.hidden, id] });
export const toggleFeatured = (id: string) => {
  const isCustom = cache.customProducts.some((c) => c.id === id);
  if (isCustom) {
    patch({ customProducts: cache.customProducts.map((c) => (c.id === id ? { ...c, featured: !c.featured } : c)) });
  } else {
    patch({ featured: cache.featured.includes(id) ? cache.featured.filter((x) => x !== id) : [...cache.featured, id] });
  }
};

/* ---------------- custom products ---------------- */
export const addCustomProduct = (c: CustomProduct) => {
  patch({ customProducts: [c, ...cache.customProducts] });
  for (const [key, qty] of Object.entries(c.stock)) {
    if (qty > 0) {
      const [colorId, sizeId] = key.split(":");
      logMove({ productId: c.id, name: c.name, colorId, sizeId, delta: qty, reason: "create" });
    }
  }
};
export const updateCustomProduct = (id: string, p: Partial<CustomProduct>) =>
  patch({ customProducts: cache.customProducts.map((c) => (c.id === id ? { ...c, ...p } : c)) });
export const removeCustomProduct = (id: string) =>
  patch({ customProducts: cache.customProducts.filter((c) => c.id !== id) });

/* ---------------- base products: edit / reset ---------------- */
export const saveProductEdit = (id: string, edit: ProductEdit) =>
  patch({ productEdits: { ...cache.productEdits, [id]: { ...(cache.productEdits[id] ?? {}), ...edit } } });
export const resetProductEdit = (id: string) => {
  const next = { ...cache.productEdits };
  delete next[id];
  patch({ productEdits: next });
};
export const productEditOf = (id: string) => cache.productEdits[id];

/* ---------------- product labels (decision 58) ---------------- */
export const PRODUCT_BADGES = ["جدید", "پیشنهاد سردبیر", "حراج", "پرفروش"] as const;
export type ProductBadge = (typeof PRODUCT_BADGES)[number];

/** the first label the owner set wins, so the card never shows a pile of chips */
export const badgesOf = (productId: string): string[] =>
  cache.productEdits[productId]?.badges ??
  cache.customProducts.find((p) => p.id === productId)?.badges ??
  [];

/* ---------------- low stock line (decision 32) ---------------- */
export const lowStockLine = (settings: StoreSettings = cache.settings) =>
  settings.lowStockThreshold && settings.lowStockThreshold > 0 ? settings.lowStockThreshold : LOW_STOCK_DEFAULT;

/** a product can carry its own line; otherwise the store-wide one applies */
export const lowStockLineOf = (productId: string) => {
  const own =
    cache.productEdits[productId]?.lowStockThreshold ??
    cache.customProducts.find((p) => p.id === productId)?.lowStockThreshold;
  return own && own > 0 ? own : lowStockLine();
};

export const isLowStock = (productId: string, total: number) => total > 0 && total <= lowStockLineOf(productId);
export const isOutOfStock = (total: number) => total <= 0;

/* ---------------- complementary products ---------------- */
export const setComplements = (productId: string, ids: string[]) =>
  patch({ complements: { ...cache.complements, [productId]: ids } });
export const complementsOf = (productId: string) => cache.complements[productId] ?? [];

/* ---------------- stock ---------------- */
const variantKey = (c: string, s: string) => `${c}:${s}`;

/** unified stock resolver for base + custom products */
export const getBaseStock = (productId: string, colorId: string, sizeId: string) =>
  cache.stock.find((s) => s.productId === productId && s.colorId === colorId && s.sizeId === sizeId)?.qty;

export function logMove(m: Omit<StockMove, "id" | "at">) {
  const move: StockMove = { ...m, id: Math.random().toString(36).slice(2, 9), at: Date.now() };
  patch({ movements: [move, ...cache.movements].slice(0, 500) });
}

/** set an absolute quantity (base or custom) with a movement log entry */
export function setStockUnified(productId: string, colorId: string, sizeId: string, qty: number, reason: StockMove["reason"] = "edit") {
  const custom = cache.customProducts.find((c) => c.id === productId);
  if (custom) {
    const cur = custom.stock[variantKey(colorId, sizeId)] ?? 0;
    if (cur === qty) return;
    patch({
      customProducts: cache.customProducts.map((c) =>
        c.id === productId ? { ...c, stock: { ...c.stock, [variantKey(colorId, sizeId)]: qty } } : c,
      ),
    });
    logMove({ productId, name: custom.name, colorId, sizeId, delta: qty - cur, reason });
    return;
  }
  const rest = cache.stock.filter((s) => !(s.productId === productId && s.colorId === colorId && s.sizeId === sizeId));
  const entry = rest.length !== cache.stock.length ? cache.stock.find((s) => s.productId === productId && s.colorId === colorId && s.sizeId === sizeId) : undefined;
  const prev = entry?.qty ?? -2;
  if (prev === qty) return;
  patch({ stock: qty < 0 ? rest : [...rest, { productId, colorId, sizeId, qty }] });
  if (prev >= 0) logMove({ productId, name: "(محصول پایه)", colorId, sizeId, delta: qty - prev, reason });
}

/** decrement stock after a sale; returns the moves that happened */
export function consumeStock(lines: { productId: string; colorId: string; sizeId: string; qty: number; name: string }[]) {
  const moves: Omit<StockMove, "id" | "at">[] = [];
  let next = { ...cache };
  for (const line of lines) {
    const custom = next.customProducts.find((c) => c.id === line.productId);
    if (custom) {
      const key = variantKey(line.colorId, line.sizeId);
      const cur = custom.stock[key] ?? 0;
      const dec = Math.min(cur, line.qty);
      next = {
        ...next,
        customProducts: next.customProducts.map((c) => (c.id === line.productId ? { ...c, stock: { ...c.stock, [key]: cur - dec } } : c)),
      };
      if (dec > 0) moves.push({ productId: line.productId, name: line.name, colorId: line.colorId, sizeId: line.sizeId, delta: -dec, reason: "sale" });
    } else {
      const entry = next.stock.find((s) => s.productId === line.productId && s.colorId === line.colorId && s.sizeId === line.sizeId);
      // base stock decrement is stored as an override
      const base = (next.stock.find((s) => s.productId === line.productId && s.colorId === line.colorId && s.sizeId === line.sizeId) ?? null);
      const cur = base ? base.qty : -1;
      if (cur >= 0) {
        const dec = Math.min(cur, line.qty);
        const list = next.stock.map((s) => (s.productId === line.productId && s.colorId === line.colorId && s.sizeId === line.sizeId ? { ...s, qty: cur - dec } : s));
        next = { ...next, stock: list.filter((s) => s.qty >= 0 || s !== list.find((x) => x.productId === line.productId && x.colorId === line.colorId && x.sizeId === line.sizeId)) };
        if (dec > 0) moves.push({ productId: line.productId, name: line.name, colorId: line.colorId, sizeId: line.sizeId, delta: -dec, reason: "sale" });
      }
      void entry;
    }
  }
  commit(next);
  moves.forEach(logMove);
}

export const restock = (productId: string, name: string, colorId: string, sizeId: string, delta: number) => {
  const custom = cache.customProducts.find((c) => c.id === productId);
  const cur = custom ? (custom.stock[variantKey(colorId, sizeId)] ?? 0) : (getBaseStock(productId, colorId, sizeId) ?? 0);
  setStockUnified(productId, colorId, sizeId, cur + delta, "restock");
  void name;
};

/* ---------------- campaigns / rules / coupons ---------------- */
export const saveCampaign = (c: Campaign) =>
  patch({ campaigns: cache.campaigns.some((x) => x.id === c.id) ? cache.campaigns.map((x) => (x.id === c.id ? c : x)) : [c, ...cache.campaigns] });
export const removeCampaign = (id: string) => patch({ campaigns: cache.campaigns.filter((c) => c.id !== id) });
export const bumpCampaignUse = (id: string) =>
  patch({ campaigns: cache.campaigns.map((c) => (c.id === id ? { ...c, uses: c.uses + 1 } : c)) });

export const saveRule = (r: DiscountRule) =>
  patch({ rules: cache.rules.some((x) => x.id === r.id) ? cache.rules.map((x) => (x.id === r.id ? r : x)) : [r, ...cache.rules] });
export const removeRule = (id: string) => patch({ rules: cache.rules.filter((r) => r.id !== id) });

/* A readable code an owner can say out loud: two syllables + a 4-char tail.
   Generated locally, checked against existing codes so a new code is never a duplicate. */
const CODE_SYLLABLES = ["BAR", "NO", "SA", "TAK", "PAR", "GOL", "SIM", "AB", "AT", "MAH", "NOO", "ZAR"];
export function generateCouponCode(existing: string[] = cache.coupons.map((c) => c.code.toUpperCase())): string {
  const taken = new Set(existing.map((c) => c.toUpperCase()));
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const head = CODE_SYLLABLES[Math.floor(Math.random() * CODE_SYLLABLES.length)];
    const tail = CODE_SYLLABLES[Math.floor(Math.random() * CODE_SYLLABLES.length)];
    const digits = String(Math.floor(10 + Math.random() * 90));
    const code = `${head}${tail}${digits}`;
    if (!taken.has(code)) return code;
  }
  return `KV${Date.now().toString().slice(-6)}`;
}

export const saveCoupons = (list: Coupon[]) =>
  patch({ coupons: [...list, ...cache.coupons.filter((c) => !list.some((x) => x.id === c.id))] });

export const saveCoupon = (c: Coupon) =>
  patch({ coupons: cache.coupons.some((x) => x.id === c.id) ? cache.coupons.map((x) => (x.id === c.id ? c : x)) : [c, ...cache.coupons] });
export const removeCoupon = (id: string) => patch({ coupons: cache.coupons.filter((c) => c.id !== id) });
export const bumpCouponUse = (code: string) =>
  patch({ coupons: cache.coupons.map((c) => (c.code.toUpperCase() === code.toUpperCase() ? { ...c, uses: c.uses + 1 } : c)) });

/* ---------------- integrations ---------------- */
export const setIntegrations = (p: Partial<Integrations>) => patch({ integrations: { ...cache.integrations, ...p } });

/* ---------------- CRM ---------------- */
export const setCustomerMeta = (email: string, p: Partial<CustomerMeta>) => {
  const cur = cache.customers[email] ?? { tags: [], note: "" };
  patch({ customers: { ...cache.customers, [email]: { ...cur, ...p } } });
};

export const resetAdmin = () => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  cache = DEFAULT_ADMIN;
  listeners.forEach((l) => l());
};

/* ---------------- session ---------------- */
export function adminUnlocked() {
  try {
    return sessionStorage.getItem(SESSION) === "1";
  } catch {
    return false;
  }
}
export function unlockAdmin(code: string) {
  if (code.trim() !== getAdmin().settings.passcode) return false;
  try {
    sessionStorage.setItem(SESSION, "1");
  } catch {
    /* ignore */
  }
  return true;
}
export function lockAdmin() {
  try {
    sessionStorage.removeItem(SESSION);
  } catch {
    /* ignore */
  }
}
