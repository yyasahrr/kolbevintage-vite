import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AirVent,
  BadgeCheck,
  BookOpen,
  Boxes,
  Briefcase,
  CalendarClock,
  CircleDot,
  Cloud,
  Coins,
  FileText,
  Grid2x2,
  Hand,
  Hexagon,
  Image as ImageIcon,
  LayoutList,
  Lightbulb,
  List,
  ListChecks,
  MapPin,
  MessageSquare,
  MousePointerClick,
  Newspaper,
  Palette,
  Percent,
  PieChart as PieIcon,
  Play,
  Quote,
  Repeat,
  Ruler,
  Shapes,
  Shield,
  ShoppingBag,
  Sparkles,
  Tag,
  Target,
  TrendingUp,
  UserCircle,
  Users,
  Video,
} from "lucide-react";
import {
  alignFlex,
  area,
  borderCtls,
  clr,
  icn,
  img,
  num,
  rep,
  sec,
  sel,
  slider,
  txt,
  typo,
  url,
  preset,
  type WidgetDef,
} from "./core";
import { href } from "./ctx";
import { IconView, faNum } from "./kit";
import { PLACEHOLDER, resolveImg } from "./stock";
import { P, makeCardWidget } from "./factory";
import { CATALOG } from "@/data/catalog";
import { ProductCard } from "@/components/ProductCard";

/* ------------------------------------------------------------------ */
/* factory-generated list widgets (each a distinct Elementor-style     */
/* widget with its own presets)                                        */
/* ------------------------------------------------------------------ */

const L = makeCardWidget;

const SERVICES = [
  { icon: "Scissors", title: "خیاطی سفارشی", desc: "تنظیم فرم روی بدن توسط خیاط آتلیه." },
  { icon: "Sparkles", title: "مشاورهٔ استایل", desc: "یک ساعت با تیم طراحی، بدون تعهد خرید." },
  { icon: "Truck", title: "ارسال جهانی", desc: "به بیش از ۳۰ کشور با بیمهٔ کامل." },
];
const POSTS_SEED = [
  { image: "stock:atelier", meta: "آتلیه · ۶ دقیقه", title: "سه هفته برای یک یقه", excerpt: "سفری کوتاه به میز کار ما.", more: "ادامهٔ مطلب", link: "/journal" },
  { image: "stock:campaign", meta: "پارچه · ۵ دقیقه", title: "نرمی یک فصل کامل", excerpt: "کشمیر عاجی با ساتن ماسه‌ای.", more: "ادامهٔ مطلب", link: "/journal" },
  { image: "stock:hero", meta: "رانوی · ۷ دقیقه", title: "شش خروجی، شش داستان", excerpt: "دفترچهٔ نمایش AW26.", more: "ادامهٔ مطلب", link: "/journal" },
];
const REVIEWS = [
  { name: "آوا رادمهر", role: "طراح داخلی", desc: "کیفیت پارچه و دوخت فوق‌العاده بود.", image: "stock:campaign" },
  { name: "سارا نیکخواه", role: "معمار", desc: "سایز را راحت انتخاب کردم و ارسال سریع بود.", image: "" },
  { name: "میلاد صالحی", role: "عکاس", desc: "کیف چرمی بعد از ماه‌ها مثل روز اول است.", image: "" },
];
const LOGOS = ["stock:look1", "stock:look2", "stock:look3", "stock:look4", "stock:look5", "stock:look6"].map((s, i) => ({
  image: s,
  title: `برند ${i + 1}`,
  link: "#",
}));
const WORKS = [
  { image: "stock:look1", title: "معماری نوآر", sub: "اگزیت ۰۱" },
  { image: "stock:look3", title: "سکوت عاجی", sub: "اگزیت ۰۳" },
  { image: "stock:look5", title: "ساتن نیمه‌شب", sub: "اگزیت ۰۵" },
  { image: "stock:look6", title: "فصل شتری", sub: "اگزیت ۰۶" },
];
const SPECS = [
  { title: "جنس", desc: "۷۰٪ پشم ویرجین، ۵٪ کشمیر" },
  { title: "فرم", desc: "اورسایز با آستر کامل" },
  { title: "مراقبت", desc: "شست‌وشوی خشک" },
  { title: "ساخت", desc: "آتلیهٔ پاریس" },
];
const KPIS = [
  { value: 24, suffix: "", title: "قطعه در فصل" },
  { value: 92, suffix: "٪", title: "پارچهٔ طبیعی" },
  { value: 30, suffix: "", title: "کشور" },
];

export const WIDGETS_F: WidgetDef[] = [
  /* ---- services / features ---- */
  L({ type: "services-grid", title: "گرید خدمات", icon: Briefcase, category: "general", variant: "icon", items: SERVICES, itemFields: [], presets: [P.grid3(), P.grid2(), P.soft(), P.glass()] }),
  L({ type: "services-list", title: "لیست خدمات", icon: List, category: "general", variant: "icon", layouts: ["list", "grid"], items: SERVICES, itemFields: [], presets: [P.list(), P.grid2(), P.minimal()] }),
  L({ type: "benefits-grid", title: "گرید مزایا", icon: BadgeCheck, category: "general", variant: "icon", items: SERVICES, itemFields: [], presets: [P.grid3(), P.grid4(), P.outline()] }),
  L({ type: "feature-list", title: "فهرست ویژگی", icon: ListChecks, category: "general", variant: "icon", layouts: ["list", "grid"], items: SPECS.map((s) => ({ icon: "Check", title: s.title, desc: s.desc })), itemFields: [], presets: [P.list(), P.grid2(), P.minimal()] }),
  L({ type: "checklist", title: "چک‌لیست", icon: ListChecks, category: "general", variant: "icon", layouts: ["list", "grid"], defaults: { cols: 2 }, items: [{ icon: "Check", title: "ارسال رایگان" }, { icon: "Check", title: "مرجوعی ۱۴ روزه" }, { icon: "Check", title: "بسته‌بندی هدیه" }, { icon: "Check", title: "پرداخت امن" }], itemFields: [], presets: [P.grid2(), P.grid4(), P.list()] }),
  L({ type: "icon-grid", title: "گرید آیکن", icon: Grid2x2, category: "layout", variant: "icon", defaults: { cols: 4 }, items: [{ icon: "Gem", title: "جنس" }, { icon: "Ruler", title: "اندازه" }, { icon: "Truck", title: "ارسال" }, { icon: "ShieldCheck", title: "ضمانت" }], itemFields: [], presets: [P.grid4(), P.grid2(), P.soft()] }),
  L({ type: "why-us", title: "چرا ما", icon: Target, category: "pro", variant: "icon", items: SERVICES, itemFields: [], presets: [P.grid3(), P.dark(), P.glass()] }),
  L({ type: "value-proposition", title: "ارزش پیشنهادی", icon: Sparkles, category: "pro", variant: "icon", layouts: ["grid", "list"], items: SERVICES, itemFields: [], presets: [P.grid3(), P.list(), P.brutal()] }),

  /* ---- logos / brands ---- */
  L({ type: "brand-grid", title: "گرید برندها", icon: Tag, category: "social", variant: "logo", defaults: { cols: 5, hoverLift: false }, items: LOGOS, itemFields: [], presets: [P.grid3({ cols: 5 }), P.carousel({ per: 5 }), P.minimal()] }),
  L({ type: "partner-logo", title: "لوگوی شرکا", icon: Hand, category: "social", variant: "logo", layouts: ["carousel", "grid"], defaults: { per: 5 }, items: LOGOS.slice(0, 4), itemFields: [], presets: [P.carousel({ per: 4 }), P.grid3({ cols: 4 })] }),
  L({ type: "sponsor-strip", title: "نوار حامیان", icon: Hand, category: "social", variant: "logo", layouts: ["carousel"], defaults: { per: 5, autoplay: true }, items: LOGOS, itemFields: [], presets: [P.carousel({ per: 5 }), P.carousel({ per: 3 })] }),

  /* ---- portfolio / work ---- */
  L({ type: "portfolio-carousel", title: "کاروسل نمونه‌کار", icon: Boxes, category: "creative", variant: "overlay", layouts: ["carousel"], defaults: { per: 3 }, items: WORKS, itemFields: [], presets: [P.carousel({ per: 3 }), P.carousel({ per: 2 })] }),
  L({ type: "portfolio-list", title: "لیست نمونه‌کار", icon: LayoutList, category: "creative", variant: "overlay", layouts: ["list", "grid"], items: WORKS, itemFields: [], presets: [P.list(), P.grid2()] }),
  L({ type: "project-grid", title: "گرید پروژه", icon: Boxes, category: "creative", variant: "overlay", items: WORKS, itemFields: [], presets: [P.grid3(), P.grid2(), P.grid4()] }),
  L({ type: "work-grid", title: "گرید کارها", icon: Boxes, category: "creative", variant: "overlay", items: WORKS, itemFields: [], presets: [P.grid4(), P.grid3()] }),
  L({ type: "case-study", title: "مطالعهٔ موردی", icon: FileText, category: "pro", variant: "post", items: POSTS_SEED, itemFields: [], presets: [P.grid2(), P.list(), P.soft()] }),

  /* ---- posts / blog ---- */
  L({ type: "post-grid", title: "گرید مقاله", icon: Newspaper, category: "dynamic", variant: "post", items: POSTS_SEED, itemFields: [], presets: [P.grid3(), P.grid2(), P.list()] }),
  L({ type: "post-list", title: "لیست مقاله", icon: LayoutList, category: "dynamic", variant: "post", layouts: ["list", "grid"], items: POSTS_SEED, itemFields: [], presets: [P.list(), P.grid2()] }),
  L({ type: "post-carousel", title: "کاروسل مقاله", icon: Newspaper, category: "dynamic", variant: "post", layouts: ["carousel"], defaults: { per: 3 }, items: POSTS_SEED, itemFields: [], presets: [P.carousel({ per: 3 }), P.carousel({ per: 2 })] }),
  L({ type: "post-block", title: "بلوک مقاله", icon: FileText, category: "dynamic", variant: "post", layouts: ["list", "grid"], defaults: { cols: 1 }, items: POSTS_SEED.slice(0, 2), itemFields: [], presets: [P.list(), P.minimal()] }),
  L({ type: "post-block-modern", title: "بلوک مدرن مقاله", icon: FileText, category: "dynamic", variant: "overlay", defaults: { cols: 2 }, items: WORKS.slice(0, 2), itemFields: [], presets: [P.grid2(), P.grid3()] }),
  L({ type: "post-card", title: "کارت مقاله", icon: FileText, category: "dynamic", variant: "post", defaults: { cols: 1 }, items: POSTS_SEED.slice(0, 1), itemFields: [], presets: [P.soft(), P.outline()] }),
  L({ type: "blog-grid", title: "گرید بلاگ", icon: BookOpen, category: "dynamic", variant: "post", items: POSTS_SEED, itemFields: [], presets: [P.grid3(), P.grid2(), P.soft()] }),
  L({ type: "blog-list", title: "لیست بلاگ", icon: BookOpen, category: "dynamic", variant: "post", layouts: ["list"], items: POSTS_SEED, itemFields: [], presets: [P.list(), P.minimal()] }),
  L({ type: "article-grid", title: "گرید نوشته", icon: BookOpen, category: "dynamic", variant: "post", items: POSTS_SEED, itemFields: [], presets: [P.grid3(), P.list()] }),
  L({ type: "news-grid", title: "گرید اخبار", icon: Newspaper, category: "dynamic", variant: "post", items: POSTS_SEED, itemFields: [], presets: [P.grid4(), P.grid3(), P.brutal()] }),

  /* ---- reviews / testimonials ---- */
  L({ type: "review-list", title: "لیست نظرات", icon: MessageSquare, category: "social", variant: "profile", layouts: ["list", "grid"], items: REVIEWS, itemFields: [], presets: [P.list(), P.grid2(), P.soft()] }),
  L({ type: "review-carousel", title: "کاروسل نظرات", icon: Quote, category: "social", variant: "profile", layouts: ["carousel"], defaults: { per: 2 }, items: REVIEWS, itemFields: [], presets: [P.carousel({ per: 2 }), P.carousel({ per: 1 })] }),
  L({ type: "testimonial-list", title: "لیست نظر مشتری", icon: Quote, category: "social", variant: "profile", layouts: ["list"], items: REVIEWS, itemFields: [], presets: [P.list(), P.minimal()] }),
  L({ type: "testimonial-block", title: "بلوک نظر", icon: Quote, category: "social", variant: "plain", layouts: ["list"], defaults: { cols: 1 }, items: [{ title: "★★★★★", desc: "بهترین تجربهٔ خرید پوشاک آنلاین من بود؛ کیفیت پارچه واقعاً متفاوت است.", link: "" }], itemFields: [], presets: [P.list(), P.soft()] }),

  /* ---- team / people ---- */
  L({ type: "team-grid", title: "گرید تیم", icon: Users, category: "creative", variant: "team", items: REVIEWS.map((r) => ({ image: r.image, name: r.name, role: r.role, desc: "", icon: "" })), itemFields: [], presets: [P.grid3(), P.grid4(), P.soft()] }),
  L({ type: "team-list", title: "لیست تیم", icon: Users, category: "creative", variant: "team", layouts: ["list"], items: REVIEWS.map((r) => ({ image: r.image, name: r.name, role: r.role, desc: "", icon: "" })), itemFields: [], presets: [P.list(), P.minimal()] }),
  L({ type: "team-carousel", title: "کاروسل تیم", icon: Users, category: "creative", variant: "team", layouts: ["carousel"], defaults: { per: 4 }, items: REVIEWS.map((r) => ({ image: r.image, name: r.name, role: r.role, desc: "", icon: "" })), itemFields: [], presets: [P.carousel({ per: 4 }), P.carousel({ per: 2 })] }),
  L({ type: "member-grid", title: "گرید اعضا", icon: UserCircle, category: "creative", variant: "profile", items: REVIEWS, itemFields: [], presets: [P.grid3(), P.grid2()] }),
  L({ type: "staff-grid", title: "گرید کارکنان", icon: UserCircle, category: "creative", variant: "team", defaults: { cols: 4 }, items: REVIEWS.map((r) => ({ image: r.image, name: r.name, role: r.role, desc: "", icon: "" })), itemFields: [], presets: [P.grid4(), P.grid2()] }),
  L({ type: "profile-list", title: "لیست پروفایل", icon: UserCircle, category: "creative", variant: "profile", layouts: ["list"], items: REVIEWS, itemFields: [], presets: [P.list(), P.outline()] }),
  L({ type: "author-box", title: "باکس نویسنده", icon: UserCircle, category: "dynamic", variant: "profile", layouts: ["list"], defaults: { cols: 1 }, items: [{ image: "stock:campaign", name: "تیم تحریریهٔ ولور", role: "نویسنده", desc: "یادداشت‌هایی از آتلیه و رانوی.", linkText: "مقالات", link: "/journal" }], itemFields: [], presets: [P.list(), P.soft()] }),

  /* ---- stats / metrics ---- */
  L({ type: "stat-grid", title: "گرید آمار", icon: Activity, category: "dynamic", variant: "stat", defaults: { cols: 4 }, items: KPIS, itemFields: [], presets: [P.grid4(), P.grid2(), P.dark()] }),
  L({ type: "counter-grid", title: "گرید شمارنده", icon: TrendingUp, category: "dynamic", variant: "stat", defaults: { cols: 3 }, items: KPIS, itemFields: [], presets: [P.grid3(), P.grid4(), P.minimal()] }),
  L({ type: "fact-grid", title: "گرید دانستنی", icon: Lightbulb, category: "dynamic", variant: "stat", items: KPIS, itemFields: [], presets: [P.grid3(), P.soft()] }),
  L({ type: "metric-row", title: "ردیف شاخص‌ها", icon: Activity, category: "dynamic", variant: "stat", layouts: ["list", "grid"], defaults: { cols: 4 }, items: KPIS, itemFields: [], presets: [P.list(), P.grid4()] }),
  L({ type: "kpi-grid", title: "گرید KPI", icon: PieIcon, category: "dynamic", variant: "stat", defaults: { cols: 4 }, items: KPIS, itemFields: [], presets: [P.grid4(), P.dark(), P.glass()] }),
  L({ type: "total-count", title: "شمار کل", icon: Activity, category: "dynamic", variant: "stat", layouts: ["list"], defaults: { cols: 1 }, items: [{ value: 1200, suffix: "+", title: "مشتری در ۳۰ کشور" }], itemFields: [], presets: [P.list(), P.minimal()] }),

  /* ---- spec / menu / offers ---- */
  L({ type: "spec-list", title: "فهرست مشخصات", icon: Ruler, category: "general", variant: "price", layouts: ["list"], items: SPECS.map((s) => ({ title: s.title, price: "", desc: s.desc, image: "" })), itemFields: [], presets: [P.list(), P.minimal()] }),
  L({ type: "menu-card", title: "کارت منو", icon: Tag, category: "pro", variant: "price", items: [{ title: "پرو و مشاوره", price: "رایگان", desc: "یک ساعت با تیم استایل.", image: "" }, { title: "تنظیم سایز", price: "۸۰۰٬۰۰۰ تومان", desc: "اصلاح فرم روی بدن.", image: "" }], itemFields: [], presets: [P.list(), P.grid2()] }),
  L({ type: "offer-grid", title: "گرید پیشنهاد", icon: Percent, category: "shop", variant: "icon", items: [{ icon: "Percent", title: "۱۰٪ اولین خرید", desc: "با کد VELOURS10." }, { icon: "Truck", title: "ارسال رایگان", desc: "بالای ۲۰۰٬۰۰۰ تومان." }], itemFields: [], presets: [P.grid2(), P.soft(), P.brutal()] }),
  L({ type: "deal-grid", title: "گرید تخفیف", icon: Percent, category: "shop", variant: "icon", items: [{ icon: "Flame", title: "فروش پایان فصل", desc: "تا ۴۰٪ تخفیف." }, { icon: "Gift", title: "بستهٔ هدیه", desc: "جعبهٔ دست‌ساز." }], itemFields: [], presets: [P.grid2(), P.grid3()] }),
  L({ type: "promo-grid", title: "گرید پروموشن", icon: Sparkles, category: "shop", variant: "overlay", items: WORKS.slice(0, 2), itemFields: [], presets: [P.grid2(), P.grid3()] }),
  L({ type: "category-list", title: "لیست دسته‌ها", icon: LayoutList, category: "shop", variant: "icon", layouts: ["list", "grid"], defaults: { cols: 2 }, items: [{ icon: "Layers", title: "پالتو و کاپشن", desc: "۱۲ قطعه" }, { icon: "Shirt", title: "بافت", desc: "۸ قطعه" }, { icon: "ShoppingBag", title: "کیف", desc: "۶ قطعه" }, { icon: "Footprints", title: "کفش", desc: "۵ قطعه" }], itemFields: [], presets: [P.grid2(), P.grid4(), P.list()] }),

  /* ---- faq / info ---- */
  L({ type: "faq-list", title: "لیست سؤالات", icon: MessageSquare, category: "general", variant: "plain", layouts: ["list", "grid"], items: [{ title: "ارسال چقدر طول می‌کشد؟", desc: "۲ تا ۴ روز کاری." }, { title: "مرجوعی چگونه است؟", desc: "تا ۱۴ روز بدون سؤال." }], itemFields: [], presets: [P.list(), P.grid2(), P.outline()] }),
  L({ type: "info-list", title: "لیست اطلاعات", icon: CircleDot, category: "general", variant: "icon", layouts: ["list"], items: [{ icon: "MapPin", title: "نشانی", desc: "پاریس، سن‌آنوره ۲۴" }, { icon: "Clock", title: "ساعات", desc: "۱۱ تا ۱۹" }], itemFields: [], presets: [P.list(), P.minimal()] }),
  L({ type: "gallery-carousel", title: "کاروسل گالری", icon: ImageIcon, category: "media", variant: "overlay", layouts: ["carousel"], defaults: { per: 4 }, items: WORKS, itemFields: [], presets: [P.carousel({ per: 4 }), P.carousel({ per: 3 })] }),
  L({ type: "gallery-list", title: "لیست گالری", icon: ImageIcon, category: "media", variant: "overlay", layouts: ["list", "grid"], items: WORKS, itemFields: [], presets: [P.list(), P.grid3()] }),

  /* ================================================================== */
  /* hand-written extras                                                 */
  /* ================================================================== */
  {
    type: "advanced-icon-box",
    title: "باکس آیکن پیشرفته",
    icon: Sparkles,
    category: "general",
    keywords: "icon box advanced آیکن",
    defaults: { icon: "Gem", title: "پارچهٔ طبیعی", desc: "بیش از ۹۰٪ کالکشن از پارچهٔ طبیعی ساخته می‌شود.", badge: "اصلی", pos: "start", link: "" },
    presets: [
      preset("badge", "با برچسب", { badge: "اصلی", pos: "start" }, "برچسب گوشه"),
      preset("center", "وسط‌چین", { pos: "top", align: "center", badge: "" }, "کلاسیک"),
      preset("dark", "تیره", { bgColor: "#16130f", tc: "#f7f3ed", ic: "#e5c158" }, "لوکس"),
    ],
    sections: [
      sec("c", "محتوا", "content", [
        icn("icon"),
        txt("badge", "برچسب"),
        txt("title", "عنوان"),
        area("desc", "توضیح"),
        url("link"),
        sel("pos", "جای آیکن", [["top", "بالا"], ["start", "راست"], ["end", "چپ"]]),
        alignFlex("align", "{{WRAPPER}} .ew-aib"),
      ]),
      sec("s", "استایل", "style", [
        num("iconSize", "اندازهٔ آیکن", { selectors: { "{{WRAPPER}} .ew-aib-icon svg": "width:{{VALUE}}px;height:{{VALUE}}px;" }, default: 32 }),
        clr("ic", "رنگ آیکن", { "{{WRAPPER}} .ew-aib-icon": "color:{{VALUE}};" }),
        clr("icBg", "پس‌زمینهٔ آیکن", { "{{WRAPPER}} .ew-aib-icon": "background-color:{{VALUE}};" }),
        clr("bg", "پس‌زمینهٔ باکس", { "{{WRAPPER}} .ew-aib": "background-color:{{VALUE}};" }),
        clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-aib-title": "color:{{VALUE}};" }),
        ...typo("t", "{{WRAPPER}} .ew-aib-title"),
        clr("dc", "رنگ توضیح", { "{{WRAPPER}} .ew-aib-desc": "color:{{VALUE}};" }),
        ...borderCtls("aib", "{{WRAPPER}} .ew-aib"),
      ]),
    ],
    render: ({ s }) => (
      <div className={`ew-aib pos-${s.pos || "start"}`}>
        {s.badge && <span className="ew-aib-badge">{s.badge}</span>}
        <span className="ew-aib-icon">
          <IconView name={s.icon} size={32} />
        </span>
        <div>
          <h4 className="ew-aib-title">{s.title}</h4>
          <p className="ew-aib-desc">{s.desc}</p>
          {s.link && (
            <a href={href(s.link) || "#"} className="ew-card-more">
              بیشتر ←
            </a>
          )}
        </div>
      </div>
    ),
  },
  {
    type: "fancy-card",
    title: "کارت فانتزی",
    icon: Shapes,
    category: "creative",
    keywords: "fancy card hover کارت",
    defaults: { image: "stock:look1", title: "معماری نوآر", desc: "پالتو، بافت و بوت مشکی.", effect: "zoom", link: "/style" },
    presets: [
      preset("zoom", "بزرگ‌نمایی", { effect: "zoom" }, "کلاسیک"),
      preset("blur", "محو شدن متن", { effect: "blur" }, "مدرن"),
      preset("slide", "لغزش کپشن", { effect: "slide" }, "متحرک"),
      preset("tilt", "چرخش سه‌بعدی", { effect: "tilt" }, "ترند"),
    ],
    sections: [
      sec("c", "کارت", "content", [img("image"), txt("title", "عنوان"), area("desc", "توضیح"), url("link"), sel("effect", "افکت هاور", [["zoom", "بزرگ‌نمایی"], ["blur", "محو شدن"], ["slide", "لغزش"], ["tilt", "چرخش"]]), sel("ratio", "نسبت", [["3/4", "۳:۴"], ["1/1", "۱:۱"], ["4/3", "۴:۳"]])]),
      sec("s", "استایل", "style", [clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-fc-cap b": "color:{{VALUE}};" }), clr("ov", "رنگ لایه", { "{{WRAPPER}} .ew-fc::after": "background-color:{{VALUE}};" }), ...borderCtls("fc", "{{WRAPPER}} .ew-fc")]),
    ],
    render: ({ s }) => (
      <a href={href(s.link) || "#"} className={`ew-fc fx-${s.effect || "zoom"}`} style={{ aspectRatio: s.ratio || "3/4", backgroundImage: `url("${resolveImg(s.image) || PLACEHOLDER}")` }}>
        <span className="ew-fc-cap">
          <b>{s.title}</b>
          <small>{s.desc}</small>
        </span>
      </a>
    ),
  },
  {
    type: "hover-box",
    title: "باکس هاور",
    icon: MousePointerClick,
    category: "creative",
    keywords: "hover box reveal هاور",
    defaults: { image: "stock:look3", title: "سکوت عاجی", desc: "کشمیر و ساتن ماسه‌ای.", btn: "مشاهده", link: "/style/look-03" },
    sections: [
      sec("c", "باکس", "content", [img("image"), txt("title", "عنوان"), area("desc", "توضیح"), txt("btn", "متن دکمه"), url("link"), slider("height", "ارتفاع", 180, 620, { "{{WRAPPER}} .ew-hb": "height:{{VALUE}}px;" }, { responsive: true, default: 320 })]),
      sec("s", "استایل", "style", [clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-hb-cap b": "color:{{VALUE}};" }), clr("ov", "رنگ لایه", { "{{WRAPPER}} .ew-hb::after": "background-color:{{VALUE}};" }), ...borderCtls("hb", "{{WRAPPER}} .ew-hb")]),
    ],
    render: ({ s }) => (
      <div className="ew-hb" style={{ backgroundImage: `url("${resolveImg(s.image) || PLACEHOLDER}")` }}>
        <div className="ew-hb-cap">
          <b>{s.title}</b>
          <p>{s.desc}</p>
          {s.btn && <span className="ew-btn ew-btn--sm">{s.btn}</span>}
        </div>
      </div>
    ),
  },
  {
    type: "trailer-box",
    title: "باکس تریلر",
    icon: Video,
    category: "media",
    keywords: "trailer box video preview تریلر",
    defaults: { image: "stock:hero", title: "پشت صحنهٔ رانوی", url: "https://www.youtube.com/watch?v=ysz5S6PUM-U", length: "۲:۱۴" },
    sections: [
      sec("c", "تریلر", "content", [img("image", "کاور"), txt("title", "عنوان"), url("url", "لینک ویدیو"), txt("length", "مدت"), slider("height", "ارتفاع", 160, 560, { "{{WRAPPER}} .ew-tr": "height:{{VALUE}}px;" }, { responsive: true, default: 300 })]),
      sec("s", "استایل", "style", [clr("pc", "رنگ دکمهٔ پخش", { "{{WRAPPER}} .ew-tr-play": "background-color:{{VALUE}};" }), clr("ov", "رنگ لایه", { "{{WRAPPER}} .ew-tr::after": "background-color:{{VALUE}};" }), ...borderCtls("tr", "{{WRAPPER}} .ew-tr")]),
    ],
    render: ({ s }) => (
      <a href={href(s.url) || "#"} className="ew-tr" style={{ backgroundImage: `url("${resolveImg(s.image) || PLACEHOLDER}")` }}>
        <span className="ew-tr-play">
          <Play width={26} height={26} fill="currentColor" />
        </span>
        <span className="ew-tr-cap">
          <b>{s.title}</b>
          {s.length && <small>{s.length}</small>}
        </span>
      </a>
    ),
  },
  {
    type: "lottie-animation",
    title: "انیمیشن (Lottie جایگزین)",
    icon: Sparkles,
    category: "creative",
    keywords: "lottie animation انیمیشن",
    defaults: { kind: "pulse", color: "#16130f", size: 120, speed: 2 },
    presets: [
      preset("pulse", "ضربان", { kind: "pulse" }, "ملایم"),
      preset("spin", "چرخش", { kind: "spin" }, "لودر"),
      preset("float", "شناوری", { kind: "float" }, "بالا و پایین"),
      preset("morph", "دگردیس", { kind: "morph" }, "شکل متغیر"),
    ],
    sections: [
      sec("c", "انیمیشن", "content", [sel("kind", "نوع", [["pulse", "ضربان"], ["spin", "چرخش"], ["float", "شناوری"], ["morph", "دگردیس"], ["bounce", "پرش"]]), icn("icon", "آیکن"), slider("speed", "سرعت (ثانیه)", 0.4, 6, undefined, { step: 0.2, unit: "s", default: 2 }), alignFlex("align", "{{WRAPPER}} .ew-lottie-wrap")]),
      sec("s", "استایل", "style", [slider("size", "اندازه", 40, 340, { "{{WRAPPER}} .ew-lottie svg": "width:{{VALUE}}px;height:{{VALUE}}px;" }, { default: 120 }), clr("color", "رنگ", { "{{WRAPPER}} .ew-lottie": "color:{{VALUE}};" })]),
    ],
    render: ({ s }) => (
      <div className="ew-lottie-wrap">
        <span className={`ew-lottie k-${s.kind || "pulse"}`} style={{ animationDuration: `${Number(s.speed) || 2}s` }}>
          <IconView name={s.icon || "Sparkles"} size={Number(s.size) || 120} />
        </span>
      </div>
    ),
  },
  {
    type: "scroll-image",
    title: "تصویر اسکرولی",
    icon: Repeat,
    category: "creative",
    keywords: "scroll image parallax اسکرول",
    defaults: { image: "stock:hero", height: 420, speed: 0.25 },
    sections: [
      sec("c", "تصویر", "content", [img("image"), slider("height", "ارتفاع", 200, 800, { "{{WRAPPER}} .ew-si": "height:{{VALUE}}px;" }, { responsive: true, default: 420 }), slider("speed", "شدت حرکت", 0, 1, undefined, { step: 0.05, unit: "", default: 0.25 })]),
      sec("s", "استایل", "style", [clr("ov", "رنگ لایه", { "{{WRAPPER}} .ew-si::after": "background-color:{{VALUE}};" }), ...borderCtls("si", "{{WRAPPER}} .ew-si")]),
    ],
    render: ({ s, editing }) => {
      const [off, setOff] = useState(0);
      useEffect(() => {
        if (editing) return;
        const f = () => setOff(window.scrollY * (Number(s.speed) || 0.25));
        f();
        window.addEventListener("scroll", f, { passive: true });
        return () => window.removeEventListener("scroll", f);
      }, [editing, s.speed]);
      return (
        <div className="ew-si" style={{ backgroundImage: `url("${resolveImg(s.image) || PLACEHOLDER}")`, backgroundPositionY: `${off}px` }} />
      );
    },
  },
  {
    type: "particles",
    title: "ذرات",
    icon: Cloud,
    category: "creative",
    keywords: "particles dots background ذرات",
    defaults: { count: 24, color: "#ffffff", size: 6, height: 320 },
    sections: [
      sec("c", "ذرات", "content", [num("count", "تعداد", { min: 4, max: 90 }), slider("height", "ارتفاع", 160, 720, { "{{WRAPPER}} .ew-parts": "height:{{VALUE}}px;" }, { responsive: true, default: 320 }), slider("size", "اندازهٔ ذره", 2, 18, undefined, { default: 6 })]),
      sec("s", "استایل", "style", [clr("color", "رنگ ذرات", { "{{WRAPPER}} .ew-part": "background-color:{{VALUE}};" }), clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-parts": "background-color:{{VALUE}};" })]),
    ],
    render: ({ s }) => {
      const n = Math.max(4, Math.min(90, Number(s.count) || 24));
      const dots = Array.from({ length: n }, (_, i) => {
        const seed = (i * 9301 + 49297) % 233280 / 233280;
        const seed2 = (i * 4523 + 7919) % 104729 / 104729;
        return { l: seed * 100, t: seed2 * 100, d: (seed * 6).toFixed(2), size: (Number(s.size) || 6) * (0.5 + seed2) };
      });
      return (
        <div className="ew-parts">
          {dots.map((d, i) => (
            <span key={i} className="ew-part" style={{ left: `${d.l}%`, top: `${d.t}%`, width: d.size, height: d.size, animationDelay: `${d.d}s` }} />
          ))}
        </div>
      );
    },
  },
  {
    type: "honeycombs",
    title: "لانهٔ زنبوری",
    icon: Hexagon,
    category: "creative",
    keywords: "honeycomb hexagon hex لانه زنبوری",
    defaults: { size: 130, gap: 8, items: [{ icon: "Gem", title: "پارچه" }, { icon: "Ruler", title: "اندازه" }, { icon: "Truck", title: "ارسال" }, { icon: "ShieldCheck", title: "ضمانت" }, { icon: "Sparkles", title: "طراحی" }] },
    sections: [
      sec("c", "سلول‌ها", "content", [rep("items", "سلول‌ها", [icn("icon"), txt("title", "عنوان")], { icon: "Star", title: "سلول" }, "title"), slider("size", "اندازهٔ سلول", 90, 240, { "{{WRAPPER}} .ew-honey": "--ew-hex:{{VALUE}}px;" }, { default: 130 }), slider("gap", "فاصله", 0, 30, undefined, { default: 8 })]),
      sec("s", "استایل", "style", [clr("bg", "پس‌زمینهٔ سلول", { "{{WRAPPER}} .ew-hex": "background-color:{{VALUE}};" }), clr("c", "رنگ آیکن", { "{{WRAPPER}} .ew-hex": "color:{{VALUE}};" })]),
    ],
    render: ({ s }) => (
      <div className="ew-honey">
        {(s.items ?? []).map((it: any, i: number) => (
          <div key={i} className="ew-hex">
            <IconView name={it.icon} size={22} />
            <small>{it.title}</small>
          </div>
        ))}
      </div>
    ),
  },
  {
    type: "circle-menu",
    title: "منوی دایره‌ای",
    icon: CircleDot,
    category: "layout",
    keywords: "circle menu radial منو",
    defaults: { size: 220, items: [{ icon: "ShoppingBag", title: "فروشگاه", link: "/products" }, { icon: "Layers", title: "استایل", link: "/style" }, { icon: "BookOpen", title: "ژورنال", link: "/journal" }, { icon: "Users", title: "درباره", link: "/about" }] },
    sections: [
      sec("c", "آیتم‌ها", "content", [rep("items", "آیتم‌ها", [icn("icon"), txt("title", "عنوان"), url("link")], { icon: "Star", title: "آیتم", link: "" }, "title"), slider("size", "قطر دایره", 140, 420, { "{{WRAPPER}} .ew-cmenu": "width:{{VALUE}}px;height:{{VALUE}}px;" }, { default: 220 })]),
      sec("s", "استایل", "style", [clr("bg", "پس‌زمینهٔ دکمه", { "{{WRAPPER}} .ew-cm-item": "background-color:{{VALUE}};" }), clr("c", "رنگ آیکن", { "{{WRAPPER}} .ew-cm-item": "color:{{VALUE}};" }), clr("center", "پس‌زمینهٔ مرکز", { "{{WRAPPER}} .ew-cm-core": "background-color:{{VALUE}};" })]),
    ],
    render: ({ s }) => {
      const items: any[] = s.items ?? [];
      return (
        <div className="ew-cmenu">
          {items.map((it, i) => {
            const a = (i / items.length) * Math.PI * 2 - Math.PI / 2;
            return (
              <a key={i} href={href(it.link) || "#"} className="ew-cm-item" style={{ transform: `translate(${Math.cos(a) * 46}%, ${Math.sin(a) * 46}%)` }}>
                <IconView name={it.icon} size={18} />
                <small>{it.title}</small>
              </a>
            );
          })}
          <span className="ew-cm-core">
            <IconView name="Sparkles" size={20} />
          </span>
        </div>
      );
    },
  },
  {
    type: "crypto-card",
    title: "کارت رمزارز",
    icon: Coins,
    category: "dynamic",
    keywords: "crypto currency card رمزارز",
    defaults: { name: "BTC", label: "بیت‌کوین", price: 64200, change: 2.4, icon: "Coins" },
    sections: [
      sec("c", "کارت", "content", [txt("name", "نماد"), txt("label", "نام"), num("price", "قیمت نمایشی"), num("change", "تغییر درصدی"), icn("icon")]),
      sec("s", "استایل", "style", [clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-crypto": "background-color:{{VALUE}};" }), clr("up", "رنگ رشد", { "{{WRAPPER}} .is-up": "color:{{VALUE}};" }), clr("down", "رنگ افت", { "{{WRAPPER}} .is-down": "color:{{VALUE}};" }), ...borderCtls("cr", "{{WRAPPER}} .ew-crypto")]),
    ],
    render: ({ s }) => {
      const ch = Number(s.change) || 0;
      return (
        <div className="ew-crypto">
          <div className="ew-cr-head">
            <span className="ew-cr-ic">
              <IconView name={s.icon || "Coins"} size={22} />
            </span>
            <div>
              <b>{s.name}</b>
              <small>{s.label}</small>
            </div>
          </div>
          <div className="ew-cr-price">{faNum(s.price)} $</div>
          <div className={`ew-cr-change ${ch >= 0 ? "is-up" : "is-down"}`}>
            {ch >= 0 ? "▲" : "▼"} {faNum(Math.abs(ch))}٪
          </div>
        </div>
      );
    },
  },
  {
    type: "air-quality",
    title: "کیفیت هوا",
    icon: AirVent,
    category: "dynamic",
    keywords: "air quality aqi هوا",
    defaults: { city: "پاریس", aqi: 34, label: "خوب" },
    sections: [
      sec("c", "داده", "content", [txt("city", "شهر"), num("aqi", "شاخص (AQI)"), sel("label", "وضعیت", [["خوب", "خوب"], ["متوسط", "متوسط"], ["ناسالم", "ناسالم"], ["خطرناک", "خطرناک"]])]),
      sec("s", "استایل", "style", [clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-aqi": "background-color:{{VALUE}};" }), ...borderCtls("aqi", "{{WRAPPER}} .ew-aqi")]),
    ],
    render: ({ s }) => (
      <div className="ew-aqi">
        <div className="ew-aqi-num">{faNum(s.aqi)}</div>
        <div>
          <b>{s.label}</b>
          <small>{s.city}</small>
        </div>
      </div>
    ),
  },
  {
    type: "timezone-clock",
    title: "ساعت جهانی",
    icon: CalendarClock,
    category: "dynamic",
    keywords: "timezone clock world time ساعت",
    defaults: { city: "پاریس", offset: 1, format: "24" },
    sections: [
      sec("c", "ساعت", "content", [txt("city", "شهر"), num("offset", "اختلاف با UTC"), sel("format", "فرمت", [["24", "۲۴ ساعته"], ["12", "۱۲ ساعته"]]), alignFlex("align", "{{WRAPPER}} .ew-tzc")]),
      sec("s", "استایل", "style", [clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-tzc": "background-color:{{VALUE}};" }), ...typo("t", "{{WRAPPER}} .ew-tzc-time")]),
    ],
    render: ({ s }) => {
      const [now, setNow] = useState(new Date());
      useEffect(() => {
        const t = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(t);
      }, []);
      const utc = now.getTime() + now.getTimezoneOffset() * 60000;
      const local = new Date(utc + (Number(s.offset) || 0) * 3600000);
      const hh = s.format === "12" ? local.getHours() % 12 || 12 : local.getHours();
      const time = `${String(hh).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;
      return (
        <div className="ew-tzc">
          <span className="ew-tzc-time" dir="ltr">
            {faNum(time)}
          </span>
          <small>{s.city}</small>
        </div>
      );
    },
  },
  {
    type: "document-viewer",
    title: "نمایشگر سند",
    icon: FileText,
    category: "media",
    keywords: "document viewer pdf سند",
    defaults: { title: "کاتالوگ AW26", pages: 12, size: "۴.۲ مگابایت" },
    sections: [
      sec("c", "سند", "content", [txt("title", "عنوان"), num("pages", "تعداد صفحه"), txt("size", "حجم"), url("link", "لینک دانلود")]),
      sec("s", "استایل", "style", [clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-doc": "background-color:{{VALUE}};" }), ...borderCtls("doc", "{{WRAPPER}} .ew-doc")]),
    ],
    render: ({ s }) => (
      <a href={href(s.link) || "#"} className="ew-doc">
        <IconView name="FileText" size={30} />
        <div>
          <b>{s.title}</b>
          <small>
            {faNum(s.pages)} صفحه · {s.size}
          </small>
        </div>
      </a>
    ),
  },
  {
    type: "marker",
    title: "نشانگر روی نقشه",
    icon: MapPin,
    category: "media",
    keywords: "marker pin map نشانگر",
    defaults: { address: "Rue Saint-Honoré 24, Paris", zoom: 15, height: 300, label: "بوتیک ولور" },
    sections: [
      sec("c", "نقشه", "content", [txt("address", "نشانی"), slider("zoom", "بزرگ‌نمایی", 1, 20, undefined, { unit: "", default: 15 }), slider("height", "ارتفاع", 160, 700, { "{{WRAPPER}} .ew-map iframe": "height:{{VALUE}}px;" }, { responsive: true, default: 300 }), txt("label", "برچسب نشانگر")]),
      sec("s", "استایل", "style", [...borderCtls("mk", "{{WRAPPER}} .ew-map")]),
    ],
    render: ({ s }) => (
      <div className="ew-map-wrap">
        <div className="ew-map">
          <iframe title="نقشه" loading="lazy" src={`https://maps.google.com/maps?q=${encodeURIComponent(s.address || "Paris")}&t=m&z=${s.zoom || 15}&output=embed`} />
        </div>
        {s.label && <span className="ew-map-label">{s.label}</span>}
      </div>
    ),
  },
  {
    type: "featured-products",
    title: "محصولات ویژه",
    icon: ShoppingBag,
    category: "shop",
    keywords: "featured products shop محصول",
    defaults: { count: 4, cols: 4 },
    sections: [
      sec("c", "محصولات", "content", [num("count", "تعداد", { min: 1, max: 12 }), num("cols", "ستون‌ها", { responsive: true, min: 1, max: 6 }), sel("order", "مرتب‌سازی", [["featured", "پیشنهادی"], ["newest", "جدیدترین"], ["price-asc", "ارزان‌ترین"], ["price-desc", "گران‌ترین"]])]),
      sec("s", "استایل", "style", [slider("gap", "فاصله", 0, 50, { "{{WRAPPER}} .ew-products": "gap:{{VALUE}}px;" }, { default: 18 })]),
    ],
    render: ({ s }) => {
      const list = [...CATALOG].sort((a, b) => {
        if (s.order === "price-asc") return a.price - b.price;
        if (s.order === "price-desc") return b.price - a.price;
        if (s.order === "newest") return b.lookOrder - a.lookOrder;
        return 0;
      }).slice(0, Number(s.count) || 4);
      return (
        <div className="ew-products" style={{ ["--ew-cols" as string]: String(s.cols || 4) }}>
          {list.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      );
    },
  },
  {
    type: "reading-progress",
    title: "پیشرفت مطالعه",
    icon: Ruler,
    category: "layout",
    keywords: "reading progress scroll مطالعه",
    defaults: { height: 3, color: "#8c4a2f" },
    sections: [
      sec("c", "نوار", "content", [slider("height", "ارتفاع", 2, 20, undefined, { default: 3 })]),
      sec("s", "استایل", "style", [clr("color", "رنگ نوار", { "{{WRAPPER}} .ew-rp-fill": "background-color:{{VALUE}};" }), clr("track", "رنگ مسیر", { "{{WRAPPER}} .ew-rp": "background-color:{{VALUE}};" })]),
    ],
    render: ({ s, editing }) => {
      const [p, setP] = useState(editing ? 42 : 0);
      const ref = useRef<HTMLDivElement>(null);
      useEffect(() => {
        if (editing) return;
        const f = () => {
          const h = document.documentElement;
          const total = h.scrollHeight - h.clientHeight;
          setP(total > 0 ? (h.scrollTop / total) * 100 : 0);
        };
        f();
        window.addEventListener("scroll", f, { passive: true });
        return () => window.removeEventListener("scroll", f);
      }, [editing]);
      void ref;
      return (
        <div className="ew-rp" style={{ height: Number(s.height) || 3 }}>
          <div className="ew-rp-fill" style={{ width: `${p}%` }} />
        </div>
      );
    },
  },
  {
    type: "visibility-info",
    title: "کنترل نمایش (راهنما)",
    icon: Shield,
    category: "layout",
    keywords: "visibility control conditional نمایش",
    defaults: { note: "برای مخفی‌کردن هر المان در یک دستگاه، تب «پیشرفته» › بخش «نمایش ریسپانسیو» را باز کن." },
    sections: [sec("c", "راهنما", "content", [area("note", "متن راهنما")])],
    render: ({ s }) => <div className="ew-empty">{s.note}</div>,
  },
];

export const _factoryIcons = { Palette, Cloud, Hand };
