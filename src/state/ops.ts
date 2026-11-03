import { useSyncExternalStore } from "react";
import type { GarmentKind } from "@/types";

/* =====================================================================
   Operations store — everything the admin panel edits that is NOT the
   base catalogue: brand identity, categories, size sets, per-colour
   media, hover media, CRM labels, SMS campaigns, cashback, try-on
   packages, tickets, returns, logs, security and form field policy.

   Persisted in localStorage and read live by the storefront.
   ===================================================================== */

export interface Brand {
  logoText: string;
  logoImage: string;
  favicon: string;
  name: string;
  tagline: string;
  announcement: string;
  announcementActive: boolean;
  footerNote: string;
  socials: { instagram: string; telegram: string; whatsapp: string };
}

export interface CategoryDef {
  id: string;
  name: string;
  slug: string;
  /** which garment kinds belong to this category */
  garments: GarmentKind[];
  /** thumbnail image (data URL or stock: token) */
  thumbnail: string;
  /** size set id */
  sizeSetId: string;
  active: boolean;
  order: number;
}

export interface SizeSet {
  id: string;
  name: string
  sizes: string[];
  /** optional measurements per size, used by the smart size guide */
  measurements?: Record<string, { chest?: number; waist?: number; hip?: number; shoulder?: number; height?: number }>;
}

export type MediaMap = Record<string, { hoverImage?: string; hoverVideo?: string }>;
/** productId → colorId → image list */
export type ColorMedia = Record<string, Record<string, string[]>>;

export interface CustomerLabel {
  id: string;
  name: string;
  color: string;
  /** auto-assign rule */
  rule: { type: "spend" | "orders" | "idle" | "manual"; value: number };
}

export interface SmsTemplate {
  id: string;
  name: string;
  body: string;
}

export interface SmsCampaign {
  id: string;
  at: number;
  name: string;
  body: string;
  audience: string;
  recipients: number;
  sent: number;
}

export interface CashbackTxn {
  id: string;
  at: number;
  email: string;
  orderId: string;
  amount: number;
  kind: "earn" | "spend" | "expire";
}

export interface TryOnPackage {
  id: string;
  name: string;
  credits: number;
  price: number;
  popular?: boolean;
}

export interface TryOnRequest {
  id: string;
  at: number;
  email: string;
  productId: string;
  productName: string;
  status: "queued" | "ready" | "rejected";
  note?: string;
  resultImage?: string;
}

export interface TicketMsg {
  id: string;
  at: number;
  from: "customer" | "staff";
  author: string;
  body: string;
}

export interface Ticket {
  id: string;
  at: number;
  email: string;
  subject: string;
  dept: "order" | "size" | "return" | "other";
  status: "open" | "pending" | "closed";
  priority: "low" | "normal" | "high";
  messages: TicketMsg[];
}

export interface ReturnReq {
  id: string;
  at: number;
  orderId: string;
  email: string;
  items: { name: string; qty: number; reason: string }[];
  status: "requested" | "approved" | "received" | "refunded" | "rejected";
  note?: string;
  refund: number;
}

export interface LogEntry {
  id: string;
  at: number;
  actor: string;
  action: string;
  target: string;
  meta?: string;
}

export interface Security {
  passcode: string;
  requireOtp: boolean;
  sessionMinutes: number;
  twoFactor: boolean;
  allowCustomerSignup: boolean;
  otpChannels: { sms: boolean; email: boolean };
  failedAttempts: { at: number; ip: string }[];
  blocked: string[];
}

export interface FormFieldPolicy {
  key: string;
  label: string;
  form: string;
  required: boolean;
  visible: boolean;
  placeholder?: string;
}

export interface MegaMenuDef {
  id: string;
  label: string;
  columns: { title: string; links: { label: string; href: string }[] }[];
  cta: { title: string; text: string; href: string; image: string };
  active: boolean;
}

export interface OpsState {
  brand: Brand;
  categories: CategoryDef[];
  sizeSets: SizeSet[];
  colorMedia: ColorMedia;
  hoverMedia: MediaMap;
  labels: CustomerLabel[];
  smsTemplates: SmsTemplate[];
  smsCampaigns: SmsCampaign[];
  cashbackRate: number;
  cashbackTxns: CashbackTxn[];
  tryonPackages: TryOnPackage[];
  tryonRequests: TryOnRequest[];
  tryonCredits: Record<string, number>;
  tickets: Ticket[];
  returns: ReturnReq[];
  logs: LogEntry[];
  security: Security;
  formFields: FormFieldPolicy[];
  megaMenus: MegaMenuDef[];
  /** lookId → product ids explicitly placed in that look (admin editor) */
  lookProducts: Record<string, string[]>;
  /** lookId → uploaded look image override */
  lookImages: Record<string, string>;
}

const KEY = "velours.ops.v1";

const SIZE_SETS: SizeSet[] = [
  { id: "apparel-w", name: "پوشاک زنانه", sizes: ["XS", "S", "M", "L", "XL"] },
  { id: "apparel-m", name: "پوشاک مردانه", sizes: ["S", "M", "L", "XL", "XXL"] },
  { id: "waist", name: "دور کمر", sizes: ["26", "28", "30", "32", "34"] },
  { id: "shoe-w", name: "کفش زنانه", sizes: ["36", "37", "38", "39", "40", "41"] },
  { id: "shoe-m", name: "کفش مردانه", sizes: ["40", "41", "42", "43", "44"] },
  { id: "one", name: "تک‌سایز", sizes: ["یک سایز"] },
];

const CATEGORIES: CategoryDef[] = [
  { id: "outerwear", name: "پالتو و کاپشن", slug: "outerwear", garments: ["coat", "jacket"], thumbnail: "stock:hero", sizeSetId: "apparel-w", active: true, order: 1 },
  { id: "knitwear", name: "بافت و تی‌شرت", slug: "knitwear", garments: ["knit", "tee"], thumbnail: "stock:campaign", sizeSetId: "apparel-w", active: true, order: 2 },
  { id: "tailoring", name: "شلوار و دامن", slug: "tailoring", garments: ["trousers", "skirt"], thumbnail: "stock:look6", sizeSetId: "waist", active: true, order: 3 },
  { id: "dresses", name: "پیراهن", slug: "dresses", garments: ["dress"], thumbnail: "stock:look5", sizeSetId: "apparel-w", active: true, order: 4 },
  { id: "shoes", name: "کفش", slug: "shoes", garments: ["loafer", "heel", "boot", "sneaker"], thumbnail: "stock:look2", sizeSetId: "shoe-w", active: true, order: 5 },
  { id: "bags", name: "کیف و اکسسوری", slug: "bags", garments: ["bag", "accessory"], thumbnail: "stock:look1", sizeSetId: "one", active: true, order: 6 },
];

const DEFAULT: OpsState = {
  brand: {
    logoText: "VELOURS",
    logoImage: "",
    favicon: "",
    name: "ولور",
    tagline: "خانهٔ پوشاک آماده — پاریس",
    announcement: "ارسال رایگان بالای ۲۰۰ یورو — مرجوعی تا ۱۴ روز",
    announcementActive: true,
    footerNote: "خانهٔ پوشاک آماده در پاریس؛ قطعه‌های محدود، پارچه‌های طبیعی و ساخت آهسته.",
    socials: { instagram: "#", telegram: "#", whatsapp: "#" },
  },
  categories: CATEGORIES,
  sizeSets: SIZE_SETS,
  colorMedia: {},
  hoverMedia: {},
  labels: [
    { id: "loyal", name: "مشتری وفادار", color: "#2f6f4e", rule: { type: "orders", value: 3 } },
    { id: "vip", name: "مشتری پرخرید", color: "#8c4a2f", rule: { type: "spend", value: 1500 } },
    { id: "idle", name: "مشتری منفعل", color: "#9a6b21", rule: { type: "idle", value: 90 } },
    { id: "new", name: "مشتری جدید", color: "#2563eb", rule: { type: "orders", value: 1 } },
  ],
  smsTemplates: [
    { id: "s1", name: "خوش‌آمد", body: "{{name}} عزیز، به ولور خوش آمدی. کد ۱۰٪ تخفیف: VELOURS10" },
    { id: "s2", name: "سبد رها‌شده", body: "{{name}} عزیز، ست انتخابی‌ات منتظر توست. امروز تا ۲۴ ساعت رزرو شده." },
    { id: "s3", name: "جشنواره", body: "{{name}} عزیز، جشنوارهٔ پاییزه شروع شد — ۱۵٪ روی خرید بالای ۱۵۰ یورو." },
  ],
  smsCampaigns: [],
  cashbackRate: 5,
  cashbackTxns: [],
  tryonPackages: [
    { id: "tp-starter", name: "بستهٔ شروع", credits: 3, price: 39000 },
    { id: "tp-ten", name: "بستهٔ ۱۰ پرو", credits: 10, price: 100000, popular: true },
    { id: "tp-thirty", name: "بستهٔ ۳۰ پرو", credits: 30, price: 250000 },
  ],
  tryonRequests: [],
  tryonCredits: {},
  tickets: [
    {
      id: "TK-1042",
      at: Date.now() - 86400000 * 2,
      email: "ava@example.com",
      subject: "سایز پالتو ریو",
      dept: "size",
      status: "open",
      priority: "high",
      messages: [
        { id: "m1", at: Date.now() - 86400000 * 2, from: "customer", author: "آوا", body: "قد ۱۷۲ و وزن ۶۸ دارم؛ بین S و M هستم. کدام را بگیرم؟" },
        { id: "m2", at: Date.now() - 86400000, from: "staff", author: "پشتیبانی ولور", body: "برای فرم اورسایز، S مناسب است؛ آستر کامل دارد." },
      ],
    },
    {
      id: "TK-1043",
      at: Date.now() - 3600000 * 5,
      email: "demo@velours.store",
      subject: "تغییر آدرس ارسال",
      dept: "order",
      status: "pending",
      priority: "normal",
      messages: [{ id: "m3", at: Date.now() - 3600000 * 5, from: "customer", author: "مشتری", body: "هنوز ارسال نشده؛ می‌خواهم آدرس را عوض کنم." }],
    },
  ],
  returns: [
    {
      id: "RT-201",
      at: Date.now() - 86400000 * 4,
      orderId: "VL-18422",
      email: "ava@example.com",
      items: [{ name: "بافت مرینوی یقه‌لاک‌پشتی کوت", qty: 1, reason: "سایز بزرگ بود" }],
      status: "requested",
      refund: 280,
    },
  ],
  logs: [],
  security: {
    passcode: "1234",
    requireOtp: false,
    sessionMinutes: 30,
    twoFactor: false,
    allowCustomerSignup: true,
    otpChannels: { sms: true, email: true },
    failedAttempts: [],
    blocked: [],
  },
  formFields: [
    { key: "given", label: "نام", form: "checkout", required: true, visible: true },
    { key: "family", label: "نام خانوادگی", form: "checkout", required: true, visible: true },
    { key: "email", label: "ایمیل", form: "checkout", required: true, visible: true },
    { key: "tel", label: "شمارهٔ تماس", form: "checkout", required: true, visible: true },
    { key: "street", label: "نشانی", form: "checkout", required: true, visible: true },
    { key: "city", label: "شهر", form: "checkout", required: true, visible: true },
    { key: "postal", label: "کد پستی", form: "checkout", required: false, visible: true, placeholder: "اختیاری" },
    { key: "note", label: "توضیح سفارش", form: "checkout", required: false, visible: true, placeholder: "اختیاری" },
  ],
  megaMenus: [
    {
      id: "mmm-shop",
      label: "فروشگاه",
      active: true,
      columns: [
        { title: "پوشاک", links: [{ label: "پالتو و کاپشن", href: "/products?collection=outerwear" }, { label: "بافت", href: "/products?collection=knitwear" }, { label: "شلوار و دامن", href: "/products?collection=tailoring" }] },
        { title: "اکسسوری", links: [{ label: "کیف", href: "/products?collection=bags" }, { label: "کفش", href: "/products?collection=shoes" }] },
      ],
      cta: { title: "خرید بر اساس استایل", text: "شش استایل کامل روی رانو", href: "/style", image: "stock:look5" },
    },
  ],
  lookProducts: {},
  lookImages: {},
};

function read(): OpsState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<OpsState>;
    return {
      ...DEFAULT,
      ...p,
      brand: { ...DEFAULT.brand, ...(p.brand ?? {}) },
      security: { ...DEFAULT.security, ...(p.security ?? {}) },
    };
  } catch {
    return DEFAULT;
  }
}

let cache: OpsState = typeof window === "undefined" ? DEFAULT : read();
const listeners = new Set<() => void>();

function commit(next: OpsState) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const useOps = () => useSyncExternalStore(subscribe, getOps, getOps);
export const getOps = () => cache;
export const patchOps = (p: Partial<OpsState>) => commit({ ...cache, ...p });

/* ---------------- brand ---------------- */
export const patchBrand = (p: Partial<Brand>) => patchOps({ brand: { ...cache.brand, ...p } });

/* ---------------- categories & sizes ---------------- */
export const saveCategory = (c: CategoryDef) =>
  patchOps({ categories: cache.categories.some((x) => x.id === c.id) ? cache.categories.map((x) => (x.id === c.id ? c : x)) : [...cache.categories, c] });
export const removeCategory = (id: string) => patchOps({ categories: cache.categories.filter((c) => c.id !== id) });
export const activeCategories = () => [...cache.categories].filter((c) => c.active).sort((a, b) => a.order - b.order);
export const categoryByGarment = (g: GarmentKind) => cache.categories.find((c) => c.garments.includes(g));

export const saveSizeSet = (s: SizeSet) =>
  patchOps({ sizeSets: cache.sizeSets.some((x) => x.id === s.id) ? cache.sizeSets.map((x) => (x.id === s.id ? s : x)) : [...cache.sizeSets, s] });
export const removeSizeSet = (id: string) => patchOps({ sizeSets: cache.sizeSets.filter((s) => s.id !== id) });
export const sizeSetOf = (id: string) => cache.sizeSets.find((s) => s.id === id);
export const sizesForGarment = (g: GarmentKind): string[] => {
  const cat = categoryByGarment(g);
  const set = cat ? sizeSetOf(cat.sizeSetId) : undefined;
  return set?.sizes ?? ["S", "M", "L"];
};

/* ---------------- media ---------------- */
export const setColorMedia = (productId: string, colorId: string, images: string[]) =>
  patchOps({ colorMedia: { ...cache.colorMedia, [productId]: { ...(cache.colorMedia[productId] ?? {}), [colorId]: images } } });
export const removeColorMedia = (productId: string, colorId: string) => {
  const cur = cache.colorMedia[productId] ?? {};
  const next = { ...cur };
  delete next[colorId];
  patchOps({ colorMedia: { ...cache.colorMedia, [productId]: next } });
};
export const setHoverMedia = (productId: string, media: { hoverImage?: string; hoverVideo?: string }) =>
  patchOps({ hoverMedia: { ...cache.hoverMedia, [productId]: { ...(cache.hoverMedia[productId] ?? {}), ...media } } });
export const hoverMediaOf = (productId: string) => cache.hoverMedia[productId];
export const colorMediaOf = (productId: string, colorId: string) => cache.colorMedia[productId]?.[colorId] ?? [];

/* ---------------- CRM / SMS ---------------- */
export const saveLabel = (l: CustomerLabel) =>
  patchOps({ labels: cache.labels.some((x) => x.id === l.id) ? cache.labels.map((x) => (x.id === l.id ? l : x)) : [...cache.labels, l] });
export const removeLabel = (id: string) => patchOps({ labels: cache.labels.filter((l) => l.id !== id) });
export const saveSmsTemplate = (t: SmsTemplate) =>
  patchOps({ smsTemplates: cache.smsTemplates.some((x) => x.id === t.id) ? cache.smsTemplates.map((x) => (x.id === t.id ? t : x)) : [...cache.smsTemplates, t] });
export const removeSmsTemplate = (id: string) => patchOps({ smsTemplates: cache.smsTemplates.filter((t) => t.id !== id) });
export const logSmsCampaign = (c: SmsCampaign) => patchOps({ smsCampaigns: [c, ...cache.smsCampaigns].slice(0, 60) });

/* ---------------- cashback ---------------- */
export const cashbackBalance = (email: string) =>
  cache.cashbackTxns.filter((t) => t.email === email).reduce((n, t) => n + (t.kind === "spend" ? -t.amount : t.amount), 0);
export const addCashback = (t: Omit<CashbackTxn, "id" | "at">) =>
  patchOps({ cashbackTxns: [{ ...t, id: Math.random().toString(36).slice(2, 9), at: Date.now() }, ...cache.cashbackTxns].slice(0, 500) });
export const setCashbackRate = (rate: number) => patchOps({ cashbackRate: Math.max(0, Math.min(30, rate)) });

/* ---------------- try-on ---------------- */
export const tryonBalance = (email: string) => cache.tryonCredits[email] ?? 0;
export const grantTryon = (email: string, credits: number) =>
  patchOps({ tryonCredits: { ...cache.tryonCredits, [email]: Math.max(0, (cache.tryonCredits[email] ?? 0) + credits) } });
export const requestTryon = (r: Omit<TryOnRequest, "id" | "at" | "status">) => {
  const credits = cache.tryonCredits[r.email] ?? 0;
  if (credits <= 0) return { ok: false, message: "اعتبار پرو آنلاین تمام شده است. یک بسته تهیه کن." };
  const req: TryOnRequest = { ...r, id: `TR-${Math.floor(1000 + Math.random() * 8999)}`, at: Date.now(), status: "queued" };
  patchOps({ tryonRequests: [req, ...cache.tryonRequests], tryonCredits: { ...cache.tryonCredits, [r.email]: credits - 1 } });
  addLog({ actor: r.email, action: "پرو آنلاین", target: r.productName, meta: `۱ اعتبار مصرف شد` });
  return { ok: true, message: `درخواست ${req.id} ثبت شد.`, id: req.id };
};
export const setTryonStatus = (id: string, status: TryOnRequest["status"], note?: string) =>
  patchOps({ tryonRequests: cache.tryonRequests.map((r) => (r.id === id ? { ...r, status, note: note ?? r.note } : r)) });
export const saveTryonPackage = (p: TryOnPackage) =>
  patchOps({ tryonPackages: cache.tryonPackages.some((x) => x.id === p.id) ? cache.tryonPackages.map((x) => (x.id === p.id ? p : x)) : [...cache.tryonPackages, p] });
export const removeTryonPackage = (id: string) => patchOps({ tryonPackages: cache.tryonPackages.filter((p) => p.id !== id) });

/* ---------------- tickets & returns ---------------- */
export const addTicketMessage = (ticketId: string, msg: Omit<TicketMsg, "id" | "at">) =>
  patchOps({ tickets: cache.tickets.map((t) => (t.id === ticketId ? { ...t, messages: [...t.messages, { ...msg, id: Math.random().toString(36).slice(2, 9), at: Date.now() }], status: msg.from === "staff" ? "pending" : "open" } : t)) });
export const setTicketStatus = (id: string, status: Ticket["status"]) =>
  patchOps({ tickets: cache.tickets.map((t) => (t.id === id ? { ...t, status } : t)) });
export const createTicket = (t: Omit<Ticket, "id" | "at" | "messages" | "status"> & { body: string; author?: string }) => {
  const ticket: Ticket = {
    ...t,
    id: `TK-${Math.floor(1000 + Math.random() * 8999)}`,
    at: Date.now(),
    status: "open",
    messages: [{ id: "m", at: Date.now(), from: "customer", author: t.author ?? "مشتری", body: t.body }],
  };
  patchOps({ tickets: [ticket, ...cache.tickets] });
  addLog({ actor: t.email, action: "تیکت جدید", target: ticket.id });
  return ticket;
};
export const setReturnStatus = (id: string, status: ReturnReq["status"], note?: string) =>
  patchOps({ returns: cache.returns.map((r) => (r.id === id ? { ...r, status, note: note ?? r.note } : r)) });
export const createReturn = (r: Omit<ReturnReq, "id" | "at" | "status">) => {
  const rec: ReturnReq = { ...r, id: `RT-${Math.floor(200 + Math.random() * 799)}`, at: Date.now(), status: "requested" };
  patchOps({ returns: [rec, ...cache.returns] });
  addLog({ actor: r.email, action: "درخواست مرجوعی", target: r.orderId });
  return rec;
};

/* ---------------- logs / security ---------------- */
export const addLog = (l: Omit<LogEntry, "id" | "at">) =>
  patchOps({ logs: [{ ...l, id: Math.random().toString(36).slice(2, 9), at: Date.now() }, ...cache.logs].slice(0, 400) });
export const patchSecurity = (p: Partial<Security>) => patchOps({ security: { ...cache.security, ...p } });
export const recordFailedLogin = (ip: string) =>
  patchOps({ security: { ...cache.security, failedAttempts: [{ at: Date.now(), ip }, ...cache.security.failedAttempts].slice(0, 50) } });
export const blockIp = (ip: string) => patchSecurity({ blocked: [...new Set([...cache.security.blocked, ip])] });
export const unblockIp = (ip: string) => patchSecurity({ blocked: cache.security.blocked.filter((b) => b !== ip) });

/* ---------------- form fields ---------------- */
export const patchFormField = (key: string, p: Partial<FormFieldPolicy>) =>
  patchOps({ formFields: cache.formFields.map((f) => (f.key === key ? { ...f, ...p } : f)) });
export const formField = (key: string) => cache.formFields.find((f) => f.key === key);

/* ---------------- looks ---------------- */
export const setLookProducts = (lookId: string, productIds: string[]) =>
  patchOps({ lookProducts: { ...cache.lookProducts, [lookId]: productIds } });
export const lookProductIds = (lookId: string) => cache.lookProducts[lookId] ?? [];
export const setLookImage = (lookId: string, image: string) => patchOps({ lookImages: { ...cache.lookImages, [lookId]: image } });
export const lookImageOf = (lookId: string) => cache.lookImages[lookId];

/* ---------------- mega menus ---------------- */
export const saveMegaMenu = (m: MegaMenuDef) =>
  patchOps({ megaMenus: cache.megaMenus.some((x) => x.id === m.id) ? cache.megaMenus.map((x) => (x.id === m.id ? m : x)) : [...cache.megaMenus, m] });
export const removeMegaMenu = (id: string) => patchOps({ megaMenus: cache.megaMenus.filter((m) => m.id !== id) });
