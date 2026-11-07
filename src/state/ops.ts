import { useSyncExternalStore } from "react";
import type { GarmentKind, ProductImage, ProductImageRole } from "@/types";
import { pushRemote } from "./persist";
import { DEFAULT_THEME, type ThemeId } from "@/theme/themes";
import type { WidgetInstance, WidgetZone } from "@/widgets/types";

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
  /** optional parent for the catalogue tree; empty means a root collection */
  parentId?: string;
  /** which garment kinds belong to this category */
  garments: GarmentKind[];
  /** thumbnail image (data URL or stock: token) */
  thumbnail: string;
  /** size set id */
  sizeSetId: string;
  active: boolean;
  order: number;
}

export interface ColorLibraryItem {
  id: string;
  name: string;
  hex: string;
  family: "خنثی" | "گرم" | "سرد" | "خاکی";
  active: boolean;
  order: number;
}

export interface SizeSet {
  id: string;
  name: string
  sizes: string[];
  /** optional category-level measurements; sizes are not predicted automatically */
  measurements?: Record<string, { chest?: number; waist?: number; hip?: number; shoulder?: number; height?: number }>;
  measurementBasis?: "body" | "garment";
}

export type MediaMap = Record<string, { hoverImage?: string; hoverVideo?: string }>;
/** productId → colorId → image list (legacy, migrated into productImages) */
export type ColorMedia = Record<string, Record<string, string[]>>;
/** productId → ordered gallery where each image knows its colour and role */
export type ProductImageMap = Record<string, ProductImage[]>;

export const IMAGE_ROLE_LABEL: Record<ProductImageRole, string> = {
  main: "تصویر شاخص",
  gallery: "گالری",
  hover: "نمایش در هاور",
  detail: "جزئیات / بافت",
};

export const IMAGE_ROLE_HINT: Record<ProductImageRole, string> = {
  main: "اول گالری محصول دیده می‌شود",
  gallery: "بین بقیهٔ تصاویر گالری",
  hover: "وقتی نشانگر روی کارت محصول می‌رود",
  detail: "برای نمای نزدیک پارچه و دوخت",
};

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
  /** 0 until a real provider confirms delivery — the panel never claims a send */
  sent: number;
  /** "prepared" = text is ready and handed to the phone's SMS app */
  status?: "prepared" | "sent";
}

export interface IssueReport {
  id: string;
  at: number;
  /** where the owner was when they hit the problem */
  page: string;
  text: string;
  /** what the browser said about itself — helps the developer reproduce */
  context: { ua: string; width: number; url: string };
  resolved?: boolean;
}

export interface ReplyTemplate {
  id: string;
  name: string;
  body: string;
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
  /** who inside the shop owns this ticket (decision 47) */
  assignee?: string;
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
  /**
   * the storefront's visual theme — one store-level decision, applied to every
   * visitor. Shoppers never get their own theme switch.
   */
  siteTheme: ThemeId;
  /** New stores stay behind a preparation screen until explicitly launched. */
  siteUnderSetup?: boolean;
  categories: CategoryDef[];
  /** reusable colour definitions available to every product editor */
  colorLibrary: ColorLibraryItem[];
  sizeSets: SizeSet[];
  /** drag order of the storefront home page blocks (decision 67) */
  homeSections: HomeSection[];
  /** productId → ordered gallery, each image with its own colour + role */
  productImages: ProductImageMap;
  /** productId → one short video (decision 23: 12 photos plus a clip) */
  productVideos: Record<string, string>;
  /** kept for backwards compatibility with older saved data */
  colorMedia: ColorMedia;
  hoverMedia: MediaMap;
  labels: CustomerLabel[];
  smsTemplates: SmsTemplate[];
  smsCampaigns: SmsCampaign[];
  /** canned answers the support desk can drop into a reply (decision 29) */
  replyTemplates: ReplyTemplate[];
  /** per-category size guide the product page shows (decision 56) */
  sizeGuides: Record<string, { note: string; rows: { size: string; chest: string; waist: string; hips: string }[] }>;
  /**
   * store-level on/off switches, flipped from the panel without shipping a new
   * build (decision 62). Off means the feature is really gone from the shop,
   * not greyed out.
   */
  features: { tryon: boolean; reviews: boolean; journal: boolean; wishlist: boolean };
  /**
   * default product order per category, chosen by the owner (decision 27);
   * a shopper picking a sort still wins for that visit.
   */
  categorySort: Record<string, "featured" | "newest" | "price-asc" | "price-desc">;
  /** journal articles the owner rewrote in the block editor, by slug (decision 68) */
  journalBlocks: Record<string, import("@/data/journal").ArticleBlock[]>;
  /** optional video lookbook URL per journal article, shown on the public page */
  journalVideos: Record<string, string>;
  /** first-run wizard: five steps, resumable, and it disappears once finished (decision 93) */
  setup: { done: boolean; step: number };
  /** signed-off launch checks; what the panel can measure is measured, the rest is the owner's word (decision 91) */
  launchChecks: Record<string, { at: number; by: string }>;
  /** 'مشکل داشتم' reports, kept in the panel and copied/mailed to the developer (decisions 96 + 97) */
  issues: IssueReport[];
  /** where the developer wants the reports (set in settings) */
  developerEmail: string;
  /** search preview + the editable 404 copy (decisions 64 + 66) */
  seo: { title: string; description: string; notFoundTitle: string; notFoundText: string };
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
  /**
   * widgets the owner dropped into a storefront zone (decision 75). The list is
   * empty on a fresh shop: nothing appears until the owner installs a widget.
   */
  widgets: WidgetInstance[];
  /** questions the owner wrote for the FAQ widget (decision 75, batch 2) */
  faqs: { id: string; q: string; a: string }[];
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

/* ---------------- home page section order (decision 67) ---------------- */

export interface HomeSection {
  id: string;
  label: string;
  active: boolean;
}

/** the order a fresh shop starts with; the panel can reorder or hide each block */
export const HOME_DEFAULT_ORDER = ["hero", "collections", "newArrivals", "runway", "atelier", "looks", "journal"];

const HOME_SECTION_NAMES: Record<string, string> = {
  hero: "هدر تصویری و نوار متحرک",
  collections: "دسته‌بندی‌ها",
  newArrivals: "تازه رسیده‌ها",
  runway: "نوار رانوی",
  atelier: "آتلیه و ساخت",
  looks: "استایل‌ها",
  journal: "ژورنال",
};

export const defaultHomeSections = (): HomeSection[] =>
  HOME_DEFAULT_ORDER.map((id) => ({ id, label: HOME_SECTION_NAMES[id] ?? id, active: true }));

export const setHomeSections = (list: HomeSection[]) => patchOps({ homeSections: list });

/* ---------------- widgets (decision 75) ---------------- */

const uid = () => `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const addWidget = (kind: string, zone: WidgetZone, defaults: Record<string, string | number | boolean> = {}) => {
  const list = cache.widgets ?? [];
  const instance: WidgetInstance = { id: uid(), kind, zone, title: "", active: true, options: defaults };
  patchOps({ widgets: [...list, instance] });
  return instance.id;
};

export const removeWidget = (id: string) => patchOps({ widgets: (cache.widgets ?? []).filter((w) => w.id !== id) });

export const toggleWidget = (id: string) =>
  patchOps({ widgets: (cache.widgets ?? []).map((w) => (w.id === id ? { ...w, active: !w.active } : w)) });

export const updateWidget = (id: string, patch: Partial<Omit<WidgetInstance, "id">>) =>
  patchOps({ widgets: (cache.widgets ?? []).map((w) => (w.id === id ? { ...w, ...patch } : w)) });

/** move an instance inside its own zone; widgets never jump zones by accident */
export const moveWidget = (id: string, direction: -1 | 1) => {
  const list = [...(cache.widgets ?? [])];
  const index = list.findIndex((w) => w.id === id);
  if (index < 0) return;
  const zone = list[index].zone;
  const siblings = list.filter((w) => w.zone === zone);
  const at = siblings.findIndex((w) => w.id === id);
  const target = siblings[at + direction];
  if (!target) return;
  const targetIndex = list.findIndex((w) => w.id === target.id);
  [list[index], list[targetIndex]] = [list[targetIndex], list[index]];
  patchOps({ widgets: list });
};

export const setWidgets = (list: WidgetInstance[]) => patchOps({ widgets: list });

export const saveFaq = (faq: { id: string; q: string; a: string }) =>
  patchOps({ faqs: cache.faqs.some((f) => f.id === faq.id) ? cache.faqs.map((f) => (f.id === faq.id ? faq : f)) : [...cache.faqs, faq] });
export const removeFaq = (id: string) => patchOps({ faqs: cache.faqs.filter((f) => f.id !== id) });

/** move one block up/down; used by the drag handle and the keyboard buttons */
export const moveHomeSection = (id: string, direction: -1 | 1) => {
  const list = cache.homeSections?.length ? [...cache.homeSections] : defaultHomeSections();
  const index = list.findIndex((s) => s.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target], list[index]];
  patchOps({ homeSections: list });
};

export const toggleHomeSection = (id: string) => {
  const list = cache.homeSections?.length ? [...cache.homeSections] : defaultHomeSections();
  patchOps({ homeSections: list.map((s) => (s.id === id ? { ...s, active: !s.active } : s)) });
};

const DEFAULT: OpsState = {
  siteTheme: DEFAULT_THEME,
  brand: {
    logoText: "VELOURS",
    logoImage: "",
    favicon: "",
    name: "ولور",
    tagline: "خانهٔ پوشاک آماده — تهران",
    announcement: "ارسال رایگان بالای ۲۰۰٬۰۰۰ تومان — مرجوعی تا ۱۴ روز",
    announcementActive: true,
    footerNote: "خانهٔ پوشاک آماده در تهران؛ قطعه‌های محدود، پارچه‌های طبیعی و ساخت آهسته.",
    socials: { instagram: "#", telegram: "#", whatsapp: "#" },
  },
  categories: CATEGORIES,
  colorLibrary: [
    { id: "noir", name: "مشکی", hex: "#16130f", family: "خنثی", active: true, order: 1 },
    { id: "ivory", name: "عاجی", hex: "#f1ead9", family: "خنثی", active: true, order: 2 },
    { id: "camel", name: "شتری", hex: "#b68b5e", family: "خاکی", active: true, order: 3 },
    { id: "sand", name: "شنی", hex: "#cdbba1", family: "خاکی", active: true, order: 4 },
    { id: "terracotta", name: "تراکوتا", hex: "#a5543a", family: "گرم", active: true, order: 5 },
    { id: "navy", name: "سرمه‌ای", hex: "#26364a", family: "سرد", active: true, order: 6 },
  ],
  sizeSets: SIZE_SETS,
  homeSections: defaultHomeSections(),
  productImages: {},
  productVideos: {},
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
    { id: "s3", name: "جشنواره", body: "{{name}} عزیز، جشنوارهٔ پاییزه شروع شد — ۱۵٪ روی خرید بالای ۱۵۰ تومان." },
  ],
  smsCampaigns: [],
  replyTemplates: [
    { id: "rt1", name: "اطلاع ارسال", body: "سفارش شما بسته‌بندی شد و تا ۴۸ ساعت آینده به پست تحویل می‌شود. کد رهگیری پس از ثبت، پیامک می‌شود." },
    { id: "rt2", name: "راهنمای سایز", body: "برای انتخاب دقیق سایز، جدول اندازهٔ همین محصول را در صفحهٔ محصول ببینید؛ اگر بین دو سایز بودید، سایز بزرگ‌تر راحت‌تر است." },
    { id: "rt3", name: "پیگیری مرجوعی", body: "درخواست مرجوعی شما ثبت شد. پس از دریافت بسته و کنترل کیفیت، طی ۷۲ ساعت کاری تعیین وضعیت می‌شود." },
  ],
  sizeGuides: {},
  features: { tryon: true, reviews: true, journal: true, wishlist: true },
  categorySort: {},
  journalBlocks: {},
  journalVideos: {},
  setup: { done: false, step: 0 },
  launchChecks: {},
  issues: [],
  developerEmail: "",
  seo: {
    title: "ولور | پوشاک آمادهٔ زنانه — تهران",
    description: "پالتو، بافت و کیف چرم دست‌دوز؛ ساخت محدود در آتلیهٔ تهران با ارسال سراسری و مرجوعی ۱۴ روزه.",
    notFoundTitle: "این صفحه پیدا نشد",
    notFoundText: "ممکن است نشانی عوض شده باشد. از منوی بالا یا جست‌وجو دوباره شروع کن.",
  },
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
  widgets: [],
  faqs: [],
  lookProducts: {},
  lookImages: {},
};

/** fold the old per-colour / hover uploads into the unified image gallery */
function migrateImages(p: Partial<OpsState>): ProductImageMap {
  const out: ProductImageMap = {};
  for (const [productId, list] of Object.entries(p.productImages ?? {})) {
    if (Array.isArray(list)) out[productId] = list.filter((i) => !!i?.url);
  }
  for (const [productId, perColor] of Object.entries(p.colorMedia ?? {})) {
    if (out[productId]?.length) continue;
    const list: ProductImage[] = [];
    for (const [colorId, urls] of Object.entries(perColor ?? {})) {
      (urls ?? []).forEach((url, i) => {
        if (url) list.push({ id: `mig-${productId}-${colorId}-${i}`, url, colorId, role: "gallery" });
      });
    }
    const hover = p.hoverMedia?.[productId];
    if (hover?.hoverImage) list.push({ id: `mig-hover-${productId}`, url: hover.hoverImage, colorId: "*", role: "hover" });
    if (list.length) out[productId] = list;
  }
  for (const [productId, hover] of Object.entries(p.hoverMedia ?? {})) {
    if (!hover?.hoverImage || out[productId]?.some((i) => i.role === "hover")) continue;
    out[productId] = [...(out[productId] ?? []), { id: `mig-hover-${productId}`, url: hover.hoverImage, colorId: "*", role: "hover" }];
  }
  return out;
}

function read(): OpsState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<OpsState>;
    return {
      ...DEFAULT,
      ...p,
      productImages: migrateImages(p),
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
  pushRemote("ops", next);
}

/** replaces the store with the server snapshot without echoing it back */
export function hydrateOps(next: Partial<OpsState>) {
  const merged: OpsState = {
    ...DEFAULT,
    ...next,
    brand: { ...DEFAULT.brand, ...(next.brand ?? {}) },
    security: { ...DEFAULT.security, ...(next.security ?? {}) },
    productImages: migrateImages(next),
  };
  cache = merged;
  try {
    localStorage.setItem(KEY, JSON.stringify(merged));
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

export const saveColorLibraryItem = (item: ColorLibraryItem) =>
  patchOps({
    colorLibrary: cache.colorLibrary.some((color) => color.id === item.id)
      ? cache.colorLibrary.map((color) => (color.id === item.id ? item : color))
      : [...cache.colorLibrary, item],
  });
export const removeColorLibraryItem = (id: string) =>
  patchOps({ colorLibrary: cache.colorLibrary.filter((color) => color.id !== id) });

/* ---------------- media ---------------- */
export const productImagesOf = (productId: string): ProductImage[] => cache.productImages[productId] ?? [];
export const setProductImages = (productId: string, images: ProductImage[]) =>
  patchOps({ productImages: { ...cache.productImages, [productId]: images } });
export const productVideoOf = (productId: string): string | undefined => cache.productVideos[productId];
export const setProductVideo = (productId: string, url: string | undefined) => {
  const next = { ...cache.productVideos };
  if (url) next[productId] = url;
  else delete next[productId];
  return patchOps({ productVideos: next });
};

export const updateProductImage = (productId: string, imageId: string, p: Partial<ProductImage>) =>
  setProductImages(productId, productImagesOf(productId).map((i) => (i.id === imageId ? { ...i, ...p } : i)));
export const removeProductImage = (productId: string, imageId: string) =>
  setProductImages(productId, productImagesOf(productId).filter((i) => i.id !== imageId));

/** gallery images for a colour, main first, then gallery, then close-ups */
export const galleryImagesOf = (productId: string, colorId?: string) => {
  const rank: Record<ProductImageRole, number> = { main: 0, gallery: 1, detail: 2, hover: 9 };
  return productImagesOf(productId)
    .filter((i) => i.role !== "hover" && (!colorId || i.colorId === "*" || i.colorId === colorId))
    .sort((a, b) => rank[a.role] - rank[b.role]);
};
/** the picture a product card shows while hovered */
export const hoverImageOf = (productId: string) => productImagesOf(productId).find((i) => i.role === "hover")?.url;
/** the picture that replaces the runway crop as the product's visual */
export const coverImageOf = (productId: string) => galleryImagesOf(productId)[0]?.url;

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
export const saveReplyTemplate = (t: ReplyTemplate) =>
  patchOps({
    replyTemplates: cache.replyTemplates.some((x) => x.id === t.id)
      ? cache.replyTemplates.map((x) => (x.id === t.id ? t : x))
      : [...cache.replyTemplates, t],
  });
export const removeReplyTemplate = (id: string) => patchOps({ replyTemplates: cache.replyTemplates.filter((t) => t.id !== id) });

export const setTicketAssignee = (id: string, assignee: string) =>
  patchOps({ tickets: cache.tickets.map((t) => (t.id === id ? { ...t, assignee: assignee || undefined } : t)) });

export const setSizeGuide = (categoryId: string, guide: OpsState["sizeGuides"][string]) =>
  patchOps({ sizeGuides: { ...cache.sizeGuides, [categoryId]: guide } });

export const setCategorySort = (category: string, sort: OpsState["categorySort"][string]) =>
  patchOps({ categorySort: { ...cache.categorySort, [category]: sort } });

export const setJournalBlocks = (slug: string, blocks: import("@/data/journal").ArticleBlock[]) =>
  patchOps({ journalBlocks: { ...cache.journalBlocks, [slug]: blocks } });

export const setJournalVideo = (slug: string, url: string) => {
  const next = { ...cache.journalVideos };
  if (url.trim()) next[slug] = url.trim();
  else delete next[slug];
  patchOps({ journalVideos: next });
};

export const resetJournalBlocks = (slug: string) => {
  const next = { ...cache.journalBlocks };
  delete next[slug];
  return patchOps({ journalBlocks: next });
};

export const setFeature = (key: keyof OpsState["features"], on: boolean) =>
  patchOps({ features: { ...cache.features, [key]: on } });

export const setSetup = (patchSetup: Partial<OpsState["setup"]>) => patchOps({ setup: { ...cache.setup, ...patchSetup } });

export const signLaunchCheck = (id: string, by: string, ok = true) => {
  const next = { ...cache.launchChecks };
  if (ok) next[id] = { at: Date.now(), by };
  else delete next[id];
  return patchOps({ launchChecks: next });
};

export const addIssue = (issue: IssueReport) => patchOps({ issues: [issue, ...cache.issues].slice(0, 200) });
export const resolveIssue = (id: string) =>
  patchOps({ issues: cache.issues.map((i) => (i.id === id ? { ...i, resolved: !i.resolved } : i)) });
export const removeIssue = (id: string) => patchOps({ issues: cache.issues.filter((i) => i.id !== id) });
export const setDeveloperEmail = (developerEmail: string) => patchOps({ developerEmail });

export const setSeo = (patchSeo: Partial<OpsState["seo"]>) => patchOps({ seo: { ...cache.seo, ...patchSeo } });

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
export const setTicketDept = (id: string, dept: Ticket["dept"]) =>
  patchOps({ tickets: cache.tickets.map((t) => (t.id === id ? { ...t, dept } : t)) });
export const setTicketPriority = (id: string, priority: Ticket["priority"]) =>
  patchOps({ tickets: cache.tickets.map((t) => (t.id === id ? { ...t, priority } : t)) });
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
