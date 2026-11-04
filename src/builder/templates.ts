import type { BNode, DocKind } from "./core";
import { newColumn, newContainer, newSection, newWidget } from "./tree";
const box = (children: BNode[], settings: Record<string, any> = {}) => newContainer(children, settings);

export type TplCategory = "hero" | "features" | "content" | "shop" | "pricing" | "social" | "cta" | "header" | "footer" | "page";

export interface Template {
  id: string;
  title: string;
  desc: string;
  category: TplCategory;
  /** which kinds of document this makes sense for (undefined = any) */
  kinds?: DocKind[];
  build: () => BNode[];
}

export const TPL_CATEGORY_LABEL: Record<TplCategory, string> = {
  page: "صفحهٔ کامل",
  hero: "هرو",
  features: "ویژگی‌ها",
  content: "محتوا",
  shop: "فروشگاه",
  pricing: "قیمت‌گذاری",
  social: "اعتماد اجتماعی",
  cta: "فراخوان",
  header: "هدر",
  footer: "فوتر",
};

/* ---------- tiny helpers ---------- */
const w = newWidget;
const col = (children: BNode[], width = 100, settings: Record<string, any> = {}) => newColumn(children, width, settings);
const sec = (cols: BNode[], settings: Record<string, any> = {}) => newSection(cols, settings);
const pad = (top: number, bottom = top, sides = 0) => ({ top, right: sides, bottom, left: sides, linked: false });
const dark = { bgType: "color", bgColor: "var(--eb-c-primary)", headingColor: "#ffffff", textColor: "rgba(255,255,255,.72)" };
const soft = { bgType: "color", bgColor: "#f1ebe2" };

const h = (title: string, extra: Record<string, any> = {}) => w("heading", { title, align: "center", tSize: 36, tWeight: "600", ...extra });
const p = (content: string, extra: Record<string, any> = {}) => w("text-editor", { content: `<p>${content}</p>`, align: "center", ...extra });

/* ================================================================== */
/* blocks                                                              */
/* ================================================================== */

const heroBg = (): BNode[] => [
  sec(
    [
      col(
        [
          w("heading", { title: "سکوتِ ساختار. حضورِ پارچه.", tag: "h1", tSize: 56, tSizeMobile: 34, tWeight: "600", color: "#ffffff", align: "start", animation: "fadeInUp" }),
          w("text-editor", { content: "<p>مجموعهٔ پاییز / زمستان ۲۶ — پالتو، کشمیر و چرم، ساخت آتلیهٔ تهران.</p>", color: "rgba(255,255,255,.85)", tSize: 18, align: "start" }),
          w("button", { text: "خرید کالکشن", link: "/products", size: "lg", bg: "#ffffff", color: "#16130f", align: "flex-start" }),
        ],
        60,
        { vAlign: "center", widthMobile: 100 },
      ),
    ],
    { layout: "boxed", heightMode: "min", minHeight: 620, minHeightMobile: 480, bgType: "image", bgImage: "stock:hero", bgSize: "cover", bgPos: "center center", overlayColor: "#16130f", overlayOpacity: 0.55, colAlign: "center" },
  ),
];

const heroSlides = (): BNode[] => [sec([col([w("slides")], 100, { padding: pad(0) })], { layout: "full", columnGap: "0" })];

const heroSplit = (): BNode[] => [
  sec(
    [
      col(
        [
          w("animated-headline", { before: "ما می‌سازیم", words: "پالتوی بلند\nکشمیر نرم\nچرم دست‌دوز", after: "برای تو.", tSize: 44, tSizeMobile: 30, align: "start" }),
          w("text-editor", { content: "<p>قطعه‌های محدود، پارچه‌های طبیعی و ساخت آهسته؛ هر استایل را روی رانوی تعاملی ببین و کامل بخر.</p>", align: "start" }),
          w("button", { text: "ورود به رانوی", link: "/style", size: "lg", align: "flex-start" }),
        ],
        50,
        { vAlign: "center", widthMobile: 100 },
      ),
      col([w("image", { image: "stock:campaign", align: "center", radiusBorderRadius: undefined, imgRadius: { top: 24, right: 24, bottom: 24, left: 24, linked: true } })], 50, { widthMobile: 100 }),
    ],
    { ...soft, padding: pad(60), colAlign: "center" },
  ),
];

const features3 = (): BNode[] => [
  sec(
    [
      col([h("چرا ولور؟"), p("سه دلیل ساده برای اینکه اینجا خرید کنی.")], 100, { padding: pad(0, 24) }),
    ],
    { padding: pad(70, 0) },
  ),
  sec(
    [
      col([w("icon-box", { icon: "Gem", title: "پارچهٔ طبیعی", desc: "پشم، کشمیر، پنبه و کتان؛ بیش از ۹۰٪ کالکشن." })], 33.33, { widthMobile: 100 }),
      col([w("icon-box", { icon: "Scissors", title: "دوخت دستی", desc: "هر قطعه سه هفته زیر دست خیاط آتلیه است." })], 33.33, { widthMobile: 100 }),
      col([w("icon-box", { icon: "Truck", title: "ارسال و مرجوعی", desc: "ارسال رایگان بالای ۲۰۰٬۰۰۰ تومان و مرجوعی تا ۱۴ روز." })], 33.33, { widthMobile: 100 }),
    ],
    { padding: pad(0, 70) },
  ),
];

const stats = (): BNode[] => [
  sec(
    [20, 20, 20, 20].map((_, i) =>
      col(
        [
          w("counter", [
            { end: 24, suffix: "", title: "قطعه در هر کالکشن" },
            { end: 92, suffix: "٪", title: "پارچهٔ طبیعی" },
            { end: 1200, suffix: "+", title: "مشتری راضی" },
            { end: 14, suffix: "", title: "روز مهلت مرجوعی" },
          ][i] as Record<string, any>),
        ],
        25,
        { widthMobile: 50 },
      ),
    ),
    { ...dark, padding: pad(56), numColor: undefined },
  ),
];

const aboutSplit = (): BNode[] => [
  sec(
    [
      col([w("image", { image: "stock:atelier", imgRadius: { top: 20, right: 20, bottom: 20, left: 20, linked: true } })], 45, { widthMobile: 100 }),
      col(
        [
          w("heading", { title: "سه هفته برای یک یقه", align: "start", tSize: 34 }),
          w("text-editor", { content: "<p>هر قطعه پیش از رسیدن به رانو، نمونهٔ پارچه، الگوی کاغذی و دوخت دستی را پشت سر می‌گذارد. ما مجموعه‌های کوچک تولید می‌کنیم تا چیزی که می‌پوشی کمتر شبیه بقیه باشد.</p>", align: "start" }),
          w("icon-list", {}),
          w("button", { text: "داستان ولور", link: "/about", btype: "outline", align: "flex-start" }),
        ],
        55,
        { vAlign: "center", widthMobile: 100, padding: { top: 0, right: 24, bottom: 0, left: 24, linked: false } },
      ),
    ],
    { padding: pad(70), colAlign: "center" },
  ),
];

const productsGrid = (): BNode[] => [
  sec(
    [col([h("تازه رسیده‌ها"), p("آخرین قطعه‌های رانوی پاییز / زمستان."), w("products", { count: 4, order: "newest" }), w("button", { text: "همهٔ محصولات", link: "/products", btype: "outline", align: "center" })])],
    { padding: pad(70) },
  ),
];

const categories = (): BNode[] => [sec([col([h("خرید بر اساس دسته"), w("product-categories")])], { padding: pad(60), ...soft })];

const pricing3 = (): BNode[] => [
  sec(
    [
      col([h("عضویت‌های ولور"), p("هر پلن را هر زمان می‌توانی تغییر بدهی.")], 100, { padding: pad(0, 24) }),
    ],
    { padding: pad(70, 0) },
  ),
  sec(
    [
      col([w("price-table", { title: "پایه", subtitle: "برای شروع", price: "۰", period: "/ همیشه", featured: false, ribbon: "", btn: "ثبت‌نام رایگان", features: [{ text: "گزارش ماهانه فروش", on: true }, { text: "ارسال رایگان", on: false }, { text: "پرو اختصاصی", on: false }] })], 33.33, { widthMobile: 100 }),
      col([w("price-table", {})], 33.33, { widthMobile: 100 }),
      col([w("price-table", { title: "پلاتینیوم", subtitle: "تجربهٔ کامل", price: "۱۲۹", featured: false, ribbon: "", btn: "تماس با مشاور", features: [{ text: "همهٔ مزایای طلایی", on: true }, { text: "مشاور استایل شخصی", on: true }, { text: "دعوت به رانوهای خصوصی", on: true }] })], 33.33, { widthMobile: 100 }),
    ],
    { padding: pad(0, 70) },
  ),
];

const testimonials = (): BNode[] => [sec([col([h("مشتری‌ها چه می‌گویند؟"), w("testimonial-carousel")])], { padding: pad(70), ...soft })];

const faq = (): BNode[] => [
  sec(
    [col([h("سؤال‌های پرتکرار"), w("accordion")], 100, { widthMobile: 100 })],
    { padding: pad(70), contentWidth: 820 },
  ),
];

const ctaBanner = (): BNode[] => [sec([col([w("call-to-action", {})])], { padding: pad(40) })];

const contact = (): BNode[] => [
  sec(
    [
      col([h("تماس با ما", { align: "start" }), w("form", {}), ], 55, { widthMobile: 100 }),
      col(
        [
          w("icon-list", { items: [{ text: "تهران، خیابان ولیعصر، پلاک ۲۴", icon: "MapPin", link: "" }, { text: "021 8888 2424", icon: "Phone", link: "tel:02188882424" }, { text: "client@velours.store", icon: "Mail", link: "" }, { text: "همه‌روزه ۱۱ تا ۱۹", icon: "Clock", link: "" }] }),
          w("google-maps", { address: "Valiasr St 24, Tehran", height: 280 }),
        ],
        45,
        { widthMobile: 100, vAlign: "center" },
      ),
    ],
    { padding: pad(70) },
  ),
];

const galleryBlock = (): BNode[] => [sec([col([h("از آتلیه و رانو"), w("image-gallery", {})])], { padding: pad(70) })];

const postsBlock = (): BNode[] => [sec([col([h("از ژورنال"), w("posts", {})])], { padding: pad(70) })];

const countdownOffer = (): BNode[] => [
  sec(
    [
      col(
        [
          w("heading", { title: "فروش ویژهٔ پایان فصل", tag: "h2", align: "center", tSize: 40 }),
          p("فقط تا پایان این شمارش معکوس، ارسال همهٔ سفارش‌ها رایگان است."),
          w("countdown", { align: "center" }),
          w("button", { text: "همین حالا بخر", link: "/products", size: "lg", bg: "#ffffff", color: "#16130f", align: "center" }),
        ],
        100,
        {},
      ),
    ],
    { bgType: "gradient", bgGradient: { a: "#16130f", b: "#8c4a2f", angle: 135 }, headingColor: "#ffffff", textColor: "rgba(255,255,255,.8)", padding: pad(80), contentWidth: 760 },
  ),
];

const runwayBand = (): BNode[] => [
  sec(
    [
      col(
        [
          w("heading", { title: "خرید بر اساس استایل", tSize: 40, align: "start", color: "#ffffff" }),
          w("text-editor", { content: "<p>مدل‌ها را روی صحنه جابه‌جا کن و همهٔ قطعه‌های یک ست را یک‌جا به سبد اضافه کن.</p>", align: "start", color: "rgba(255,255,255,.7)" }),
          w("button", { text: "ورود به رانوی تعاملی", link: "/style", size: "lg", bg: "#ffffff", color: "#16130f", align: "flex-start" }),
        ],
        50,
        { vAlign: "center", widthMobile: 100 },
      ),
      col([w("media-carousel", { per: 2, perTablet: 2, perMobile: 2, autoplay: true })], 50, { widthMobile: 100 }),
    ],
    { ...dark, padding: pad(56), colAlign: "center" },
  ),
];

/* ---------- headers & footers ---------- */

const headerSimple = (): BNode[] => [
  sec(
    [
      col([w("site-logo", { align: "flex-start" })], 20, { vAlign: "center", widthMobile: 50 }),
      col([w("nav-menu", { align: "center" })], 60, { vAlign: "center", widthMobile: 25 }),
      col([w("menu-cart", { align: "flex-end" })], 20, { vAlign: "center", widthMobile: 25 }),
    ],
    {
      bgType: "color",
      bgColor: "#fffdfa",
      position: "sticky",
      offsetTop: 0,
      zIndex: 40,
      boxBorderStyle: "solid",
      boxBorderWidth: { top: 0, right: 0, bottom: 1, left: 0, linked: false },
      boxBorderColor: "rgba(0,0,0,.08)",
      padding: pad(8),
      colAlign: "center",
      layout: "boxed",
    },
  ),
];

const headerSearch = (): BNode[] => [
  sec(
    [
      col([w("site-logo", { align: "flex-start" })], 18, { vAlign: "center", widthMobile: 60 }),
      col([w("search-form", {})], 50, { vAlign: "center", widthMobile: 100 }),
      col([w("nav-menu", { layout: "horizontal", breakpoint: "tablet", align: "flex-end", items: [{ label: "فروشگاه", link: "/products" }, { label: "استایل", link: "/style" }, { label: "ژورنال", link: "/journal" }] }), ], 20, { vAlign: "center", widthMobile: 20 }),
      col([w("menu-cart", { align: "flex-end" })], 12, { vAlign: "center", widthMobile: 20 }),
    ],
    { ...dark, padding: pad(10), colAlign: "center", position: "sticky", offsetTop: 0, zIndex: 40 },
  ),
];

const footer4 = (): BNode[] => [
  sec(
    [
      col(
        [
          w("site-logo", { align: "flex-start", c: "#ffffff" }),
          w("text-editor", { content: "<p>خانهٔ پوشاک آماده در تهران؛ قطعه‌های محدود، پارچه‌های طبیعی و ساخت آهسته.</p>", align: "start", color: "rgba(255,255,255,.65)" }),
          w("social-icons", { align: "flex-start" }),
        ],
        34,
        { widthMobile: 100 },
      ),
      col(
        [
          w("heading", { title: "فروشگاه", tag: "h4", tSize: 15, align: "start", color: "#ffffff" }),
          w("icon-list", { items: [{ text: "همهٔ محصولات", icon: "", link: "/products" }, { text: "خرید بر اساس استایل", icon: "", link: "/style" }, { text: "کمپین AW26", icon: "", link: "/landing" }], color: "rgba(255,255,255,.7)", iconColor: "#ffffff" }),
        ],
        22,
        { widthMobile: 50 },
      ),
      col(
        [
          w("heading", { title: "ولور", tag: "h4", tSize: 15, align: "start", color: "#ffffff" }),
          w("icon-list", { items: [{ text: "دربارهٔ ما", icon: "", link: "/about" }, { text: "ژورنال", icon: "", link: "/journal" }, { text: "علاقه‌مندی‌ها", icon: "", link: "/wishlist" }], color: "rgba(255,255,255,.7)" }),
        ],
        22,
        { widthMobile: 50 },
      ),
      col(
        [
          w("heading", { title: "پشتیبانی", tag: "h4", tSize: 15, align: "start", color: "#ffffff" }),
          w("icon-list", { items: [{ text: "پیگیری سفارش", icon: "", link: "/account" }, { text: "ارسال و مرجوعی", icon: "", link: "/about" }, { text: "تماس با ما", icon: "", link: "/about" }], color: "rgba(255,255,255,.7)" }),
        ],
        22,
        { widthMobile: 100 },
      ),
    ],
    { ...dark, padding: pad(56, 28), headingColor: undefined },
  ),
  sec(
    [col([w("text-editor", { content: "<p>© {{year}} ولور — تمام حقوق محفوظ است.</p>", align: "center", tSize: 12, color: "rgba(255,255,255,.5)" })])],
    { bgType: "color", bgColor: "#0d0b09", padding: pad(14) },
  ),
];

const footerSimple = (): BNode[] => [
  sec(
    [
      col([w("site-logo", { align: "flex-start" })], 30, { vAlign: "center", widthMobile: 100 }),
      col([w("nav-menu", { align: "center", breakpoint: "mobile" })], 40, { vAlign: "center", widthMobile: 100 }),
      col([w("text-editor", { content: "<p>© {{year}} ولور</p>", align: "end", tSize: 12 })], 30, { vAlign: "center", widthMobile: 100 }),
    ],
    { ...soft, padding: pad(28), colAlign: "center" },
  ),
];

/* ================================================================== */
/* registry                                                            */
/* ================================================================== */

const concat = (...fns: (() => BNode[])[]) => () => fns.flatMap((f) => f());

/* ---------- trendy section blocks (2025/2026) ---------- */

const bentoHero = (): BNode[] => [
  box([w("heading", { title: "بنتو گرید مدرن", tag: "h2", tSize: 40, tSizeMobile: 26, align: "start" }), w("text-editor", { content: "<p>شبکهٔ نامنظم با کانتینرهای تودرتو.</p>", align: "start" })], { direction: "row", align: "center", justify: "space-between", gap: 24, padding: { top: 24, right: 24, bottom: 24, left: 24, linked: true } }),
  box([
    box([w("image", { image: "stock:hero" })], { childWidth: "100%", padding: { top: 0, right: 0, bottom: 0, left: 0, linked: true }, boxRadius: { top: 22, right: 22, bottom: 22, left: 22, linked: true } }),
    box([w("icon-box", { icon: "Sparkles", title: "روشن", desc: "کارت‌های شیشه‌ای." })], { bgType: "color", bgColor: "#efe8f7", boxRadius: { top: 22, right: 22, bottom: 22, left: 22, linked: true }, padding: { top: 20, right: 20, bottom: 20, left: 20, linked: true } }),
    box([w("counter", { end: 24, title: "قطعه" })], { bgType: "color", bgColor: "#16130f", headingColor: "#ffffff", textColor: "rgba(255,255,255,.7)", boxRadius: { top: 22, right: 22, bottom: 22, left: 22, linked: true }, padding: { top: 20, right: 20, bottom: 20, left: 20, linked: true } }),
  ], { direction: "row", gap: 12, wrapMode: "wrap", childWidth: "33.333%" }),
].map((n) => sec([col([n], 100, { padding: { top: 0, right: 0, bottom: 0, left: 0, linked: true } })], { padding: pad(40) }));

const glassCards = (): BNode[] => [
  sec([col([h("ویژگی‌های شیشه‌ای"), w("feature-boxes", { layout: "grid", cols: 3, bgColor: "rgba(255,255,255,.6)", cardRadius: { top: 24, right: 24, bottom: 24, left: 24, linked: true }, cardShadow: { x: 0, y: 20, blur: 44, spread: -16, color: "rgba(100,60,160,.2)" } })])], { ...soft, padding: pad(60) }),
];

const neoBrutal = (): BNode[] => [
  sec([col([w("heading", { title: "نیوبروتالیسم", tag: "h2", tSize: 44, tSizeMobile: 28, align: "center" }), w("feature-boxes", { layout: "grid", cols: 3, bgColor: "#fff8d6", cardBorderStyle: "solid", cardBorderWidth: { top: 2, right: 2, bottom: 2, left: 2, linked: true }, cardBorderColor: "#0a0a0a", cardRadius: { top: 10, right: 10, bottom: 10, left: 10, linked: true }, cardShadow: { x: 5, y: 5, blur: 0, spread: 0, color: "#0a0a0a" } })])], { bgType: "color", bgColor: "#fffdf5", padding: pad(60) }),
];

const auroraCta = (): BNode[] => [
  sec([col([w("call-to-action", { layout: "split", title: "آرورا و گرادیان", desc: "ترند رنگ‌های محو ۲۰۲۶.", btn: "شروع کن", link: "/products" })])], { bgType: "gradient", bgGradient: { a: "#4f46e5", b: "#ec4899", angle: 120 }, padding: pad(40) }),
];

const splitFeature = (): BNode[] => [
  sec([
    col([w("image", { image: "stock:campaign", imgRadius: { top: 26, right: 26, bottom: 26, left: 26, linked: true } })], 50, { widthMobile: 100 }),
    col([w("advanced-heading", { title: "دو ستونه با تصویر", sub: "ترند اسپلیت‌اسکرین", align: "start" }), w("fancy-list", { layout: "grid", cols: 2, colsMobile: 1 }), w("button", { text: "بیشتر بدان", link: "/about", btype: "outline", align: "flex-start" })], 50, { vAlign: "center", widthMobile: 100, padding: { top: 0, right: 20, bottom: 0, left: 20, linked: false } }),
  ], { padding: pad(70), colAlign: "center" }),
];

const logoStrip = (): BNode[] => [sec([col([w("client-logo", { layout: "carousel", per: 5, autoplay: true, gap: 18 })])], { padding: pad(40), bgType: "color", bgColor: "#ffffff" })];

const teamSection = (): BNode[] => [sec([col([h("تیم ولور"), w("team", { layout: "grid", cols: 4, colsTablet: 2, colsMobile: 1 })])], { padding: pad(70) })];

const faqSection = (): BNode[] => [sec([col([w("advanced-heading", { title: "سؤالات پرتکرار", align: "center" }), w("accordion")])], { padding: pad(70), contentWidth: 800 })];

const socialProofSec = (): BNode[] => [sec([col([h("مشتریان چه می‌گویند"), w("testimonial-grid", { layout: "carousel", per: 2, autoplay: true })])], { ...soft, padding: pad(70) })];

const bigStats = (): BNode[] => [sec([col([w("stats-row", { layout: "grid", cols: 4, colsTablet: 2, colsMobile: 2, bgColor: "transparent", cardBorderStyle: "none", hoverLift: false })])], { ...dark, padding: pad(56) })];

const instagramStrip = (): BNode[] => [sec([col([w("instagram-feed", { cols: 6, colsTablet: 4, colsMobile: 3 })])], { padding: pad(30) })];

const couponBanner = (): BNode[] => [sec([col([w("coupon-code", {})], 100, { widthMobile: 100 })], { ...dark, padding: pad(30) })];

const marqueeStrip = (): BNode[] => [sec([col([w("news-ticker", { label: "تازه‌ها" })])], { padding: pad(0), columnGap: "0" })];

const chartSection = (): BNode[] => [sec([col([h("نمودار فروش فصلی"), w("charts", {})])], { padding: pad(70), contentWidth: 820 })];

const weatherBar = (): BNode[] => [sec([col([w("weather", {})])], { padding: pad(14) })];

const stepsSec = (): BNode[] => [sec([col([h("چطور کار می‌کند؟"), w("step-flow", { layout: "grid", cols: 4, colsTablet: 2, colsMobile: 1 })])], { padding: pad(70) })];

const gallerySec = (): BNode[] => [sec([col([h("از آتلیه"), w("gallery-masonry", { cols: 3, colsTablet: 2, colsMobile: 1 })])], { padding: pad(70) })];

const lookbookSec = (): BNode[] => [sec([col([w("looks-grid", { cols: 3, colsTablet: 2, colsMobile: 1 })])], { padding: pad(50) })];

const contactSplit = (): BNode[] => [sec([col([w("contact-info", {})], 45, { widthMobile: 100 }), col([w("form", {})], 55, { widthMobile: 100 })], { padding: pad(70), colAlign: "center" })];

const compareSec = (): BNode[] => [sec([col([h("مقایسهٔ پالتوها"), w("comparison-table", {})])], { padding: pad(60) })];

const pricingSec = (): BNode[] => [sec([col([h("پلن‌ها"), w("price-table", {})])], { padding: pad(60) })];

const timelineSec = (): BNode[] => [sec([col([h("مسیر ما"), w("timeline", {})])], { padding: pad(70), contentWidth: 900 })];

const hotspotSec = (): BNode[] => [sec([col([w("hotspot", {})], 60, { widthMobile: 100 }), col([w("advanced-heading", { title: "روی مدل ببین", sub: "روی نقاط بزن", align: "start" }), w("button", { text: "خرید این استایل", link: "/style", align: "flex-start" })], 40, { vAlign: "center", widthMobile: 100 })], { padding: pad(70), colAlign: "center" })];

const compareImgSec = (): BNode[] => [sec([col([h("قبل و بعد"), w("image-compare", {})])], { padding: pad(60), contentWidth: 860 })];

const bentoStats = (): BNode[] => [
  sec([col([
    box([
      box([w("counter", { end: 24, title: "قطعه در فصل", numColor: "#ffffff", titleColor: "rgba(255,255,255,.7)" })], { bgType: "color", bgColor: "#16130f", boxRadius: { top: 20, right: 20, bottom: 20, left: 20, linked: true }, padding: { top: 24, right: 24, bottom: 24, left: 24, linked: true } }),
      box([w("progress-pie", { percent: 92, title: "پارچهٔ طبیعی" })], { bgType: "color", bgColor: "#f1ebe2", boxRadius: { top: 20, right: 20, bottom: 20, left: 20, linked: true }, padding: { top: 24, right: 24, bottom: 24, left: 24, linked: true } }),
      box([w("funfact", { end: 1200, suffix: "+", title: "مشتری", icon: "Users" })], { bgType: "color", bgColor: "#efe8f7", boxRadius: { top: 20, right: 20, bottom: 20, left: 20, linked: true }, padding: { top: 24, right: 24, bottom: 24, left: 24, linked: true } }),
    ], { direction: "row", gap: 12, wrapMode: "wrap", childWidth: "33.333%" }),
  ], 100, { padding: { top: 0, right: 0, bottom: 0, left: 0, linked: true } })], { padding: pad(50) }),
];

const darkPortfolio = (): BNode[] => [sec([col([w("portfolio-grid", { layout: "grid", cols: 3, colsTablet: 2, colsMobile: 1 })])], { ...dark, padding: pad(50) })];

export const TEMPLATES: Template[] = [
  { id: "page-landing", title: "لندینگ مد (کامل)", desc: "هرو، ویژگی‌ها، محصولات، رانوی و نظرات", category: "page", kinds: ["page", "landing"], build: concat(heroBg, features3, productsGrid, runwayBand, testimonials, ctaBanner) },
  { id: "page-sale", title: "صفحهٔ فروش ویژه", desc: "شمارش معکوس، محصولات و سؤالات متداول", category: "page", kinds: ["page", "landing"], build: concat(heroSlides, countdownOffer, productsGrid, faq) },
  { id: "page-about", title: "دربارهٔ ما", desc: "داستان برند، آمار و گالری", category: "page", kinds: ["page"], build: concat(heroSplit, aboutSplit, stats, galleryBlock) },
  { id: "page-contact", title: "تماس با ما", desc: "فرم تماس، اطلاعات و نقشه", category: "page", kinds: ["page"], build: concat(contact, faq) },
  { id: "hero-bg", title: "هرو با تصویر پس‌زمینه", desc: "عنوان بزرگ + دکمه روی تصویر", category: "hero", build: heroBg },
  { id: "hero-slides", title: "هرو اسلایدر", desc: "اسلایدر تمام‌عرض", category: "hero", build: heroSlides },
  { id: "hero-split", title: "هرو دوستونه", desc: "عنوان متحرک و تصویر", category: "hero", build: heroSplit },
  { id: "features-3", title: "سه ویژگی", desc: "عنوان و سه باکس آیکن", category: "features", build: features3 },
  { id: "stats", title: "آمار و شمارنده‌ها", desc: "چهار شمارندهٔ متحرک", category: "features", build: stats },
  { id: "about-split", title: "تصویر + متن", desc: "درباره با لیست آیکن‌دار", category: "content", build: aboutSplit },
  { id: "gallery", title: "گالری تصاویر", desc: "گرید با نمایش بزرگ", category: "content", build: galleryBlock },
  { id: "posts", title: "مقاله‌های ژورنال", desc: "سه مقالهٔ آخر", category: "content", build: postsBlock },
  { id: "faq", title: "سؤالات متداول", desc: "آکاردئون", category: "content", build: faq },
  { id: "contact", title: "فرم تماس + نقشه", desc: "دو ستون", category: "content", build: contact },
  { id: "products", title: "محصولات جدید", desc: "گرید محصولات فروشگاه", category: "shop", build: productsGrid },
  { id: "categories", title: "دسته‌بندی محصولات", desc: "کاشی دسته‌ها", category: "shop", build: categories },
  { id: "runway-band", title: "باند خرید بر اساس استایل", desc: "معرفی رانو با کاروسل", category: "shop", build: runwayBand },
  { id: "pricing", title: "جدول قیمت سه‌تایی", desc: "سه پلن", category: "pricing", build: pricing3 },
  { id: "testimonials", title: "کاروسل نظرات", desc: "نظر مشتریان", category: "social", build: testimonials },
  { id: "cta", title: "فراخوان (CTA)", desc: "بنر با دکمه", category: "cta", build: ctaBanner },
  { id: "countdown", title: "فروش ویژه + شمارش معکوس", desc: "گرادیان و تایمر", category: "cta", build: countdownOffer },
  { id: "header-simple", title: "هدر ساده", desc: "لوگو، منو و سبد خرید (چسبان)", category: "header", kinds: ["header"], build: headerSimple },
  { id: "header-search", title: "هدر تیره با جست‌وجو", desc: "لوگو، جست‌وجو و سبد", category: "header", kinds: ["header"], build: headerSearch },
  { id: "footer-4", title: "فوتر چهارستونه", desc: "لینک‌ها و شبکه‌ها", category: "footer", kinds: ["footer"], build: footer4 },
  { id: "footer-simple", title: "فوتر ساده", desc: "یک ردیف", category: "footer", kinds: ["footer"], build: footerSimple },

  /* ---------- trendy blocks ---------- */
  { id: "bento-hero", title: "هرو بنتو گرید", desc: "کانتینرهای تودرتو — ترند ۲۰۲۵", category: "hero", build: bentoHero },
  { id: "glass-cards", title: "کارت‌های شیشه‌ای", desc: "گلس‌مورفیسم", category: "features", build: glassCards },
  { id: "neo-brutal", title: "نیوبروتالیسم", desc: "خط ضخیم و سایهٔ صلب", category: "features", build: neoBrutal },
  { id: "aurora-cta", title: "CTA آرورا", desc: "گرادیان رنگی", category: "cta", build: auroraCta },
  { id: "split-feature", title: "ویژگی دوستونه", desc: "تصویر + متن و لیست", category: "content", build: splitFeature },
  { id: "logo-strip", title: "نوار لوگوها", desc: "کاروسل برندها", category: "social", build: logoStrip },
  { id: "team-sec", title: "بخش تیم", desc: "چهار کارت تیم", category: "content", build: teamSection },
  { id: "faq-sec", title: "سؤالات متداول", desc: "آکاردئون وسط‌چین", category: "content", build: faqSection },
  { id: "social-proof", title: "اثبات اجتماعی", desc: "کاروسل نظرات", category: "social", build: socialProofSec },
  { id: "big-stats", title: "آمار تیره", desc: "چهار شمارنده", category: "features", build: bigStats },
  { id: "bento-stats", title: "آمار بنتو", desc: "کانتینرهای تودرتو با عدد", category: "features", build: bentoStats },
  { id: "instagram-strip", title: "نوار اینستاگرام", desc: "شش تصویر", category: "social", build: instagramStrip },
  { id: "coupon-banner", title: "بنر کد تخفیف", desc: "کد قابل کپی", category: "cta", build: couponBanner },
  { id: "marquee-strip", title: "نوار متحرک", desc: "تیکر خبری", category: "content", build: marqueeStrip },
  { id: "chart-sec", title: "بخش نمودار", desc: "ستونی متحرک", category: "content", build: chartSection },
  { id: "weather-bar", title: "نوار آب‌وهوا", desc: "کارت آب‌وهوا", category: "content", build: weatherBar },
  { id: "steps-sec", title: "مراحل کار", desc: "چهار گام", category: "features", build: stepsSec },
  { id: "gallery-sec", title: "گالری موزاییکی", desc: "ارتفاع‌های متفاوت", category: "content", build: gallerySec },
  { id: "lookbook-sec", title: "لوک‌بوک استایل‌ها", desc: "کارت استایل‌های رانوی", category: "shop", build: lookbookSec },
  { id: "contact-split", title: "تماس دوستونه", desc: "اطلاعات + فرم", category: "content", build: contactSplit },
  { id: "compare-sec", title: "جدول مقایسه", desc: "ویژگی‌ها و پلن‌ها", category: "pricing", build: compareSec },
  { id: "pricing-sec", title: "جدول قیمت", desc: "کارت پلن", category: "pricing", build: pricingSec },
  { id: "timeline-sec", title: "خط زمانی برند", desc: "رویدادها", category: "content", build: timelineSec },
  { id: "hotspot-sec", title: "محصول با نقاط تعاملی", desc: "تصویر + متن", category: "shop", build: hotspotSec },
  { id: "compare-img", title: "قبل و بعد", desc: "مقایسهٔ تصویر", category: "content", build: compareImgSec },
  { id: "dark-portfolio", title: "پورتفولیو تیره", desc: "گرید روی زمینهٔ تیره", category: "content", build: darkPortfolio },
];

export const templatesFor = (kind?: DocKind) =>
  TEMPLATES.filter((t) => {
    if (kind === "header") return t.category === "header";
    if (kind === "footer") return t.category === "footer";
    if (t.category === "header" || t.category === "footer") return false;
    return !t.kinds || !kind || t.kinds.includes(kind) || t.category !== "page";
  });

export const starterNodes = (): BNode[] => [newSection([100])];
