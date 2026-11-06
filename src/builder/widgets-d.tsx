import { useEffect, useState } from "react";
import {
  BadgePercent,
  Bell,
  BookOpen,
  Check,
  ClipboardList,
  Clock,
  Copy,
  FileSpreadsheet,
  Globe2,
  Grid2x2,
  HelpCircle,
  Layers,
  MessageSquare,
  PanelRightClose,
  Phone,
  QrCode,
  Shield,
  ShoppingBag,
  X,
  Star,
} from "lucide-react";
import {
  alignFlex,
  area,
  borderCtls,
  clr,
  icn,
  num,
  rep,
  sec,
  sel,
  slider,
  sw,
  txt,
  typo,
  url,
  preset,
  type WidgetDef,
} from "./core";
import { href } from "./ctx";
import { Carousel, IconView, faNum } from "./kit";
import { P, makeCardWidget } from "./factory";
import { resolveImg } from "./stock";
import { useCart } from "@/state/cart";
import { CATALOG, COLLECTIONS, productsInCollection } from "@/data/catalog";
import { POSTS } from "@/data/journal";
import { LOOKS, formatPrice } from "@/data/looks";
import { ProductCard } from "@/components/ProductCard";
import { ProductThumb } from "@/components/ProductThumb";

/* ================================================================== */
/* marketing & conversion                                              */
/* ================================================================== */

function CouponView({ s }: { s: Record<string, any> }) {
  const { notify } = useCart();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(String(s.code ?? "")).then(() => {
      setCopied(true);
      notify("کد تخفیف کپی شد", s.code);
      window.setTimeout(() => setCopied(false), 2200);
    });
  };
  return (
    <div className={`ew-coupon is-${s.skin || "classic"}`}>
      {s.icon && (
        <span className="ew-cp-ic">
          <IconView name={s.icon} size={26} />
        </span>
      )}
      <div className="ew-cp-body">
        {s.title && <b className="ew-cp-title">{s.title}</b>}
        <button type="button" className="ew-cp-code" onClick={copy} title="کپی کن">
          <span dir="ltr">{s.code}</span>
          {copied ? <Check width={15} height={15} /> : <Copy width={15} height={15} />}
        </button>
        {s.desc && <small className="ew-cp-desc">{s.desc}</small>}
      </div>
    </div>
  );
}

const coupon: WidgetDef = {
  type: "coupon-code",
  title: "کد تخفیف",
  icon: BadgePercent,
  category: "pro",
  keywords: "coupon discount code کد تخفیف",
  defaults: { code: "VELOURS10", title: "۱۰٪ تخفیف اولین خرید", desc: "تا پایان ماه معتبر است.", skin: "classic", icon: "Percent" },
  presets: [
    preset("classic", "کلاسیک", { skin: "classic", cpBg: "#16130f", cpColor: "#fff" }, "خط‌چین دور کد"),
    preset("ticket", "بلیتی", { skin: "ticket" }, "دو دایرهٔ کناری"),
    preset("light", "روشن", { skin: "classic", cpBg: "#f1ebe2", cpColor: "#16130f" }, "ملایم"),
  ],
  sections: [
    sec("c", "کد", "content", [txt("code", "کد"), txt("title", "عنوان"), area("desc", "توضیح"), icn("icon"), sel("skin", "سبک", [["classic", "کلاسیک"], ["ticket", "بلیتی"]]), alignFlex("align", "{{WRAPPER}}")]),
    sec("s", "استایل", "style", [
      clr("cpBg", "پس‌زمینه", { "{{WRAPPER}} .ew-coupon": "background-color:{{VALUE}};" }),
      clr("cpColor", "رنگ متن", { "{{WRAPPER}} .ew-coupon": "color:{{VALUE}};" }),
      clr("codeBg", "پس‌زمینهٔ کد", { "{{WRAPPER}} .ew-cp-code": "background-color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-cp-title"),
      ...borderCtls("cpn", "{{WRAPPER}} .ew-coupon"),
    ]),
  ],
  render: ({ s }) => <CouponView s={s} />,
};

function NotificationBar({ s, editing }: { s: Record<string, any>; editing: boolean }) {
  const [closed, setClosed] = useState(false);
  const [i, setI] = useState(0);
  const items: any[] = s.items ?? [];
  useEffect(() => {
    if (!s.rotate || items.length < 2 || editing) return;
    const t = window.setInterval(() => setI((v) => (v + 1) % items.length), Math.max(1600, Number(s.speed) || 3500));
    return () => window.clearInterval(t);
  }, [s.rotate, s.speed, items.length, editing]);
  if (closed) return editing ? <div className="ew-empty">نوار بسته شد.</div> : null;
  const cur = items[Math.min(i, items.length - 1)] ?? { text: "" };
  return (
    <div className={`ew-note is-${s.pos || "top"}`}>
      {items.length > 1 && s.rotate ? (
        <span className="ew-note-rot" key={i}>
          {cur.text}
        </span>
      ) : (
        <span>{cur.text}</span>
      )}
      {cur.link && (
        <a href={href(cur.link) || "#"}>{cur.more || "مشاهده"}</a>
      )}
      {s.dismiss !== false && (
        <button type="button" className="ew-note-x" aria-label="بستن" onClick={() => setClosed(true)}>
          <X width={14} height={14} />
        </button>
      )}
    </div>
  );
}

const notification: WidgetDef = {
  type: "notification",
  title: "نوار اعلان",
  icon: Bell,
  category: "pro",
  keywords: "notification bar announcement اعلان",
  defaults: {
    pos: "top",
    rotate: true,
    speed: 3500,
    dismiss: true,
    items: [
      { text: "ارسال رایگان سفارش‌های بالای ۲۰۰٬۰۰۰ تومان", link: "/products", more: "خرید کن" },
      { text: "کد VELOURS10 برای ۱۰٪ تخفیف", link: "", more: "" },
    ],
  },
  sections: [
    sec("c", "پیام‌ها", "content", [
      rep("items", "پیام‌ها", [txt("text", "متن"), url("link"), txt("more", "متن دکمه")], { text: "پیام جدید", link: "", more: "" }, "text"),
      sw("rotate", "چرخش خودکار"),
      num("speed", "سرعت (ms)", { min: 1600, step: 100 }),
      sw("dismiss", "دکمهٔ بستن", { default: true }),
      sel("pos", "جای صفحه", [["top", "بالای صفحه"], ["inline", "در جریان صفحه"]]),
    ]),
    sec("s", "استایل", "style", [clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-note": "background-color:{{VALUE}};" }), clr("c", "رنگ متن", { "{{WRAPPER}} .ew-note": "color:{{VALUE}};" }), ...typo("t", "{{WRAPPER}} .ew-note")]),
  ],
  render: ({ s, editing }) => <NotificationBar s={s} editing={editing} />,
};

function ModalView({ s, editing }: { s: Record<string, any>; editing: boolean }) {
  const [open, setOpen] = useState(!!editing);
  const [once, setOnce] = useState(false);
  useEffect(() => {
    if (editing || once) return;
    const t = window.setTimeout(() => {
      setOpen(true);
      setOnce(true);
    }, Math.max(0, Number(s.delay) || 0) * 1000);
    return () => window.clearTimeout(t);
  }, [editing, once, s.delay]);
  return (
    <>
      <div className="ew-btn-wrap">
        <button type="button" className="ew-btn ew-btn--md" onClick={() => setOpen(true)}>
          {s.btnText || "باز کردن"}
        </button>
      </div>
      {open && (
        <div className="eb-popup-bg pos-center" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="ew-modal" role="dialog" aria-modal="true" style={{ maxWidth: Number(s.width) || 520 }}>
            <button type="button" className="eb-popup-x" aria-label="بستن" onClick={() => setOpen(false)}>
              <X width={16} height={16} />
            </button>
            <div className="ew-modal-body">
              {s.title && <h4 className="ew-modal-title">{s.title}</h4>}
              <div dangerouslySetInnerHTML={{ __html: s.content ?? "" }} />
              {s.btnLink && (
                <a href={href(s.btnLink) || "#"} className="ew-btn ew-btn--md is-full">
                  {s.btnLabel || "تأیید"}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const modal: WidgetDef = {
  type: "modal",
  title: "پنجرهٔ مودال",
  icon: PanelRightClose,
  category: "pro",
  keywords: "modal popup dialog مودال",
  defaults: {
    btnText: "باز کردن پنجره",
    title: "عنوان پنجره",
    content: "<p>محتوای پنجرهٔ شناور اینجا قرار می‌گیرد؛ می‌توانی فرم، تصویر یا متن بگذاری.</p>",
    width: 520,
    delay: 0,
    btnLabel: "تأیید",
    btnLink: "",
  },
  sections: [
    sec("c", "پنجره", "content", [
      txt("btnText", "متن دکمهٔ باز کردن"),
      txt("title", "عنوان پنجره"),
      { key: "content", label: "محتوا (HTML)", type: "code", rows: 6 },
      slider("width", "عرض", 280, 900, { "{{WRAPPER}} .ew-modal": "max-width:{{VALUE}}px;" }, { default: 520 }),
      num("delay", "باز شدن خودکار بعد از (ثانیه)", { min: 0 }),
      txt("btnLabel", "متن دکمهٔ داخل"),
      url("btnLink"),
    ]),
    sec("s", "استایل", "style", [clr("bg", "پس‌زمینهٔ پنجره", { "{{WRAPPER}} .ew-modal": "background-color:{{VALUE}};" }), clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-modal-title": "color:{{VALUE}};" }), ...borderCtls("md", "{{WRAPPER}} .ew-modal")]),
  ],
  render: ({ s, editing }) => <ModalView s={s} editing={editing} />,
};

function OffcanvasView({ s, editing }: { s: Record<string, any>; editing: boolean }) {
  const [open, setOpen] = useState(!!editing);
  return (
    <>
      <div className="ew-btn-wrap">
        <button type="button" className="ew-btn ew-btn--md" onClick={() => setOpen(true)}>
          {s.btnText || "باز کردن منو"}
        </button>
      </div>
      <div className={`ew-offcanvas is-${s.side || "start"} ${open ? "is-open" : ""}`}>
        <button type="button" className="eb-popup-x" aria-label="بستن" onClick={() => setOpen(false)}>
          <X width={16} height={16} />
        </button>
        <div className="ew-offcanvas-body" dangerouslySetInnerHTML={{ __html: s.content ?? "" }} />
      </div>
      {open && !editing && <div className="ew-offcanvas-scrim" onClick={() => setOpen(false)} />}
    </>
  );
}

const offcanvas: WidgetDef = {
  type: "offcanvas",
  title: "پنل کشویی",
  icon: PanelRightClose,
  category: "pro",
  keywords: "offcanvas drawer panel کشویی",
  defaults: { btnText: "فیلترها", side: "start", content: "<p>محتوای پنل کشویی.</p>" },
  sections: [
    sec("c", "پنل", "content", [txt("btnText", "متن دکمه"), sel("side", "سمت", [["start", "راست"], ["end", "چپ"], ["bottom", "پایین"]]), { key: "content", label: "محتوا (HTML)", type: "code", rows: 6 }]),
    sec("s", "استایل", "style", [clr("bg", "پس‌زمینهٔ پنل", { "{{WRAPPER}} .ew-offcanvas": "background-color:{{VALUE}};" }), slider("width", "عرض پنل", 200, 640, { "{{WRAPPER}} .ew-offcanvas": "width:{{VALUE}}px;" }, { default: 340 })]),
  ],
  render: ({ s, editing }) => <OffcanvasView s={s} editing={editing} />,
};

const cookieConsent: WidgetDef = {
  type: "cookie-consent",
  title: "رضایت کوکی",
  icon: Shield,
  category: "pro",
  keywords: "cookie consent gdpr کوکی",
  defaults: { text: "ما از کوکی برای بهبود تجربهٔ خرید استفاده می‌کنیم.", accept: "می‌پذیرم", reject: "تنظیمات", link: "/about" },
  sections: [
    sec("c", "متن", "content", [area("text", "متن"), txt("accept", "متن پذیرش"), txt("reject", "متن رد"), url("link", "لینک سیاست")]),
    sec("s", "استایل", "style", [clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-cookie": "background-color:{{VALUE}};" }), clr("c", "رنگ متن", { "{{WRAPPER}} .ew-cookie": "color:{{VALUE}};" })]),
  ],
  render: ({ s, editing }) => {
    const [ok, setOk] = useState(!!editing);
    if (ok) return editing ? <div className="ew-empty">رضایت داده شده (در حالت ویرایش نمایش داده می‌شود).</div> : null;
    return (
      <div className="ew-cookie">
        <span>{s.text}</span>
        <span className="ew-cookie-btns">
          <a href={href(s.link) || "#"}>{s.reject}</a>
          <button type="button" className="ew-btn ew-btn--sm" onClick={() => setOk(true)}>
            {s.accept}
          </button>
        </span>
      </div>
    );
  },
};

/* ---- tables ---- */

function TableView({ s }: { s: Record<string, any> }) {
  const cols: any[] = s.cols ?? [];
  const rows: any[] = s.rows ?? [];
  return (
    <div className="ew-table-wrap">
      <table className={`ew-table ${s.compact ? "is-compact" : ""} ${s.stripped ? "is-stripped" : ""}`}>
        {s.showHead !== false && (
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th key={i}>{c.title}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {cols.map((c, ci) => {
                const v = r[c.title] ?? (Array.isArray(r.cells) ? r.cells[ci] : "");
                return (
                  <td key={ci} className={String(v).startsWith("!") ? "is-yes" : String(v).startsWith("x") ? "is-no" : ""}>
                    {String(v).replace(/^[!x]/, "")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const tableCtl = () => [
  rep("cols", "ستون‌ها", [txt("title", "عنوان ستون")], { title: "ستون" }, "title"),
  rep("rows", "ردیف‌ها", [area("cells", "مقادیر (هر خط یک ستون)")], { cells: "" }, "cells"),
  sw("showHead", "نمایش سربرگ", { default: true }),
  sw("stripped", "ردیف‌های یک‌درمیان"),
  sw("compact", "فشرده"),
];

const dataTable: WidgetDef = {
  type: "data-table",
  title: "جدول داده",
  icon: FileSpreadsheet,
  category: "pro",
  keywords: "table data grid جدول",
  defaults: {
    cols: [{ title: "ویژگی" }, { title: "پالتو ریو" }, { title: "ترنچ گرند" }],
    rows: [
      { cells: "جنس\nپشم ویرجین\nگاباردین پشمی" },
      { cells: "آستر\nدارد\nندارد" },
      { cells: "مناسب فصل\nپاییز\nزمستان" },
    ],
  },
  sections: [
    sec("c", "داده‌ها", "content", tableCtl()),
    sec("s", "استایل", "style", [
      clr("headBg", "پس‌زمینهٔ سربرگ", { "{{WRAPPER}} thead th": "background-color:{{VALUE}};" }),
      clr("headColor", "رنگ سربرگ", { "{{WRAPPER}} thead th": "color:{{VALUE}};" }),
      clr("rowBg", "پس‌زمینهٔ ردیف زوج", { "{{WRAPPER}} tbody tr:nth-child(even)": "background-color:{{VALUE}};" }),
      clr("border", "رنگ خطوط", { "{{WRAPPER}} .ew-table th,{{WRAPPER}} .ew-table td": "border-color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-table"),
    ]),
  ],
  render: ({ s }) => <TableView s={s} />,
};

const comparisonTable: WidgetDef = {
  type: "comparison-table",
  title: "جدول مقایسه",
  icon: ClipboardList,
  category: "pro",
  keywords: "comparison table vs مقایسه",
  defaults: {
    cols: [{ title: "ویژگی" }, { title: "پایه" }, { title: "طلایی" }, { title: "پلاتینیوم" }],
    rows: [
      { cells: "ارسال رایگان\nx\n!\n!" },
      { cells: "دسترسی زودهنگام\nx\nx\n!" },
      { cells: "پرو اختصاصی\nx\nx\n!" },
      { cells: "مشاور استایل\nx\nx\nx" },
    ],
  },
  sections: [
    sec("c", "مقایسه", "content", tableCtl()),
    sec("s", "استایل", "style", [
      clr("yes", "رنگ تیک", { "{{WRAPPER}} td.is-yes": "color:{{VALUE}};" }),
      clr("no", "رنگ ضربدر", { "{{WRAPPER}} td.is-no": "color:{{VALUE}};" }),
      clr("headBg", "پس‌زمینهٔ سربرگ", { "{{WRAPPER}} thead th": "background-color:{{VALUE}};" }),
      ...borderCtls("tbl", "{{WRAPPER}} .ew-table"),
    ]),
  ],
  render: ({ s }) => <TableView s={s} />,
};

/* ---- social proof / reviews ---- */

const reviewGrid = makeCardWidget({
  type: "review-grid",
  title: "شبکهٔ نظرات",
  icon: MessageSquare,
  category: "social",
  variant: "plain",
  keywords: "reviews rating testimonials نظر",
  items: [
    { title: "★★★★★ کیفیت بی‌نظیر", desc: "پارچه و دوخت دقیقاً مثل عکس رانوی بود.", link: "" },
    { title: "★★★★ ارسال سریع", desc: "دو روزه رسید و بسته‌بندی خیلی شیک بود.", link: "" },
    { title: "★★★★★ ارزش خرید", desc: "قیمتش نسبت به کیفیت منصفانه است.", link: "" },
  ],
  itemFields: [sel("stars", "امتیاز", [["5", "۵ ستاره"], ["4", "۴ ستاره"], ["3", "۳ ستاره"]])],
  presets: [P.grid3(), P.grid2(), P.list(), P.soft(), P.outline()],
});

const googleReviews: WidgetDef = {
  type: "google-reviews",
  title: "نظرات گوگل",
  icon: Star,
  category: "social",
  keywords: "google reviews rating گوگل",
  defaults: { rating: 4.8, count: 236, layout: "grid", cols: 3, items: [
    { name: "آوا ر.", role: "Local Guide", desc: "کیفیت پارچه عالی و تیم فروش بسیار مودب.", stars: 5 },
    { name: "سارا ن.", role: "مشتری", desc: "پالتو را سفارش دادم و دقیقاً همان بود.", stars: 5 },
    { name: "میلاد ص.", role: "مشتری", desc: "کیف چرمی بعد از ماه‌ها مثل روز اول.", stars: 4 },
  ] },
  sections: [
    sec("c", "نظرات", "content", [
      num("rating", "امتیاز کلی", { min: 1, max: 5, step: 0.1 }),
      num("count", "تعداد نظرات"),
      rep("items", "نظرات", [txt("name", "نام"), txt("role", "عنوان"), area("desc", "متن"), sel("stars", "ستاره", [["5", "۵"], ["4", "۴"], ["3", "۳"]])], { name: "نام", role: "", desc: "", stars: 5 }, "name"),
    ]),
    sec("s", "استایل", "style", [clr("tc", "رنگ نام", { "{{WRAPPER}} .ew-card-title": "color:{{VALUE}};" }), clr("bg", "پس‌زمینهٔ کارت", { "{{WRAPPER}} .ew-card": "background-color:{{VALUE}};" }), ...borderCtls("gr", "{{WRAPPER}} .ew-card")]),
  ],
  render: ({ s }) => (
    <div>
      <div className="ew-gr-head">
        <span className="ew-gr-badge">G</span>
        <b>{faNum(s.rating)}</b>
        <span className="ew-gr-stars">★★★★★</span>
        <small>({faNum(s.count)} نظر)</small>
      </div>
      <div className="ew-cards is-grid" style={{ ["--ew-cols" as string]: String(s.cols || 3) }}>
        {(s.items ?? []).map((it: any, i: number) => (
          <article key={i} className="ew-card v-plain">
            <div className="ew-card-body">
              <div className="ew-gr-stars">{"★".repeat(Number(it.stars) || 5)}</div>
              <h4 className="ew-card-title">{it.name}</h4>
              {it.role && <p className="ew-card-role">{it.role}</p>}
              <p className="ew-card-desc">{it.desc}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  ),
};

/* ---- social feeds (mock) ---- */

const instagramFeed: WidgetDef = {
  type: "instagram-feed",
  title: "اینستاگرام",
  icon: Globe2,
  category: "social",
  keywords: "instagram feed social اینستاگرام",
  defaults: { handle: "@velours", cols: 4, gap: 8, images: ["stock:look1", "stock:look2", "stock:look3", "stock:look4", "stock:look5", "stock:look6", "stock:hero", "stock:campaign"] },
  sections: [
    sec("c", "فید", "content", [txt("handle", "نام کاربری"), { key: "images", label: "تصاویر", type: "images" }, num("cols", "ستون‌ها", { responsive: true, min: 2, max: 8 }), slider("gap", "فاصله", 0, 30, { "{{WRAPPER}} .ew-ig": "gap:{{VALUE}}px;" }, { default: 8 })]),
    sec("s", "استایل", "style", [clr("ov", "رنگ لایهٔ هاور", { "{{WRAPPER}} .ew-ig-item::after": "background-color:{{VALUE}};" })]),
  ],
  render: ({ s }) => (
    <div className="ew-ig-wrap">
      {s.handle && (
        <a className="ew-ig-handle" href="#/">
          <IconView name="Camera" size={16} /> {s.handle}
        </a>
      )}
      <div className="ew-ig" style={{ ["--ew-cols" as string]: String(s.cols || 4), gap: `${Number(s.gap) || 8}px` }}>
        {(s.images ?? []).map((u: string, i: number) => (
          <a key={i} href="#/" className="ew-ig-item">
            <img src={resolveImg(u)} alt="" loading="lazy" draggable={false} />
          </a>
        ))}
      </div>
    </div>
  ),
};

const twitterCarousel = makeCardWidget({
  type: "twitter-carousel",
  title: "کاروسل توییت",
  icon: Layers,
  category: "social",
  variant: "plain",
  keywords: "twitter tweets carousel توییت",
  layouts: ["carousel", "list"],
  items: [
    { title: "@ava", desc: "پالتوی ریو بهترین خرید امسال بود. کیفیت پارچه فوق‌العاده.", link: "" },
    { title: "@sara", desc: "ارسال سریع و بسته‌بندی خیلی شیک. ممنون ولور.", link: "" },
    { title: "@milad", desc: "عکاسی کمپین جدید واقعاً حرفه‌ای بود.", link: "" },
  ],
  itemFields: [],
  presets: [P.carousel({ per: 2 }), P.list()],
});

/* ---- business hours / schedule ---- */

const businessHours: WidgetDef = {
  type: "business-hours",
  title: "ساعات کاری",
  icon: Clock,
  category: "pro",
  keywords: "business hours opening ساعات",
  defaults: {
    title: "ساعات بوتیک",
    items: [
      { day: "شنبه تا چهارشنبه", time: "۱۱:۰۰ – ۱۹:۰۰", closed: false },
      { day: "پنجشنبه", time: "۱۱:۰۰ – ۲۱:۰۰", closed: false },
      { day: "جمعه", time: "بسته", closed: true },
    ],
  },
  sections: [
    sec("c", "ساعات", "content", [txt("title", "عنوان"), rep("items", "روزها", [txt("day", "روز"), txt("time", "ساعت"), sw("closed", "بسته")], { day: "روز", time: "", closed: false }, "day")]),
    sec("s", "استایل", "style", [clr("tc", "رنگ روز", { "{{WRAPPER}} .ew-bh-day": "color:{{VALUE}};" }), clr("cc", "رنگ ساعت", { "{{WRAPPER}} .ew-bh-time": "color:{{VALUE}};" }), clr("closedColor", "رنگ بسته", { "{{WRAPPER}} .is-closed": "color:{{VALUE}};" })]),
  ],
  render: ({ s }) => (
    <div className="ew-bh">
      {s.title && <h4 className="ew-bh-title">{s.title}</h4>}
      <ul>
        {(s.items ?? []).map((it: any, i: number) => (
          <li key={i} className={it.closed ? "is-closed" : ""}>
            <span className="ew-bh-day">{it.day}</span>
            <span className="ew-bh-line" />
            <span className="ew-bh-time">{it.closed ? "بسته" : it.time}</span>
          </li>
        ))}
      </ul>
    </div>
  ),
};

/* ---- contact / info ---- */

const contactInfo: WidgetDef = {
  type: "contact-info",
  title: "اطلاعات تماس",
  icon: Phone,
  category: "pro",
  keywords: "contact info address phone تماس",
  defaults: {
    items: [
      { icon: "MapPin", title: "نشانی", desc: "تهران، ولیعصر ۲۴", link: "" },
      { icon: "Phone", title: "تلفن", desc: "021 8888 2424", link: "tel:02188882424" },
      { icon: "Mail", title: "ایمیل", desc: "client@velours.store", link: "mailto:client@velours.store" },
    ],
  },
  sections: [
    sec("c", "اطلاعات", "content", [rep("items", "مورد", [icn("icon"), txt("title", "عنوان"), txt("desc", "مقدار"), url("link")], { icon: "Phone", title: "", desc: "", link: "" }, "title")]),
    sec("s", "استایل", "style", [num("iconSize", "اندازهٔ آیکن", { selectors: { "{{WRAPPER}} .ew-card-ic svg": "width:{{VALUE}}px;height:{{VALUE}}px;" } }), clr("ic", "رنگ آیکن", { "{{WRAPPER}} .ew-card-ic": "color:{{VALUE}};" }), clr("bg", "پس‌زمینهٔ کارت", { "{{WRAPPER}} .ew-card": "background-color:{{VALUE}};" })]),
  ],
  render: ({ s }) => (
    <div className="ew-cards is-list">
      {(s.items ?? []).map((it: any, i: number) => (
        <article key={i} className="ew-card v-icon">
          <div className="ew-card-body is-row">
            <span className="ew-card-ic">
              <IconView name={it.icon} size={20} />
            </span>
            <div>
              <h4 className="ew-card-title">{it.title}</h4>
              {it.desc && (
                <p className="ew-card-desc">
                  {it.link ? (
                    <a href={href(it.link) || "#"} style={{ color: "inherit" }}>
                      {it.desc}
                    </a>
                  ) : (
                    it.desc
                  )}
                </p>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  ),
};

/* ---- QR / barcode ---- */

const qrCode: WidgetDef = {
  type: "qr-code",
  title: "کد QR",
  icon: QrCode,
  category: "pro",
  keywords: "qr barcode code کیوآر",
  defaults: { data: "https://velours.store", size: 180, label: "اسکن کن" },
  sections: [
    sec("c", "کد", "content", [txt("data", "داده (متن یا لینک)", { placeholder: "https://…" }), slider("size", "اندازه", 80, 400, { "{{WRAPPER}} .ew-qr img": "width:{{VALUE}}px;" }, { default: 180 }), txt("label", "برچسب زیر کد"), alignFlex("align", "{{WRAPPER}} .ew-qr")]),
    sec("s", "استایل", "style", [clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-qr": "background-color:{{VALUE}};" }), ...borderCtls("qr", "{{WRAPPER}} .ew-qr")]),
  ],
  render: ({ s }) => {
    // deterministic pseudo-QR block pattern (no external service)
    const seed = String(s.data ?? "");
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const n = 21;
    const cells: boolean[] = [];
    for (let i = 0; i < n * n; i++) {
      h = Math.imul(h ^ i, 16777619) >>> 0;
      cells.push((h & 7) > 3);
    }
    const isFinder = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    return (
      <div className="ew-qr">
        <svg viewBox={`0 0 ${n} ${n}`} width={Number(s.size) || 180} height={Number(s.size) || 180} shapeRendering="crispEdges" aria-label={`QR: ${seed}`}>
          <rect width={n} height={n} fill="#fff" />
          {cells.map((on, i) => {
            const r = Math.floor(i / n);
            const c = i % n;
            if (isFinder(r, c)) return null;
            return on ? <rect key={i} x={c} y={r} width={1} height={1} fill="#111" /> : null;
          })}
          {[
            [0, 0],
            [0, n - 7],
            [n - 7, 0],
          ].map(([r, c], k) => (
            <g key={k}>
              <rect x={c} y={r} width={7} height={7} fill="#111" />
              <rect x={c + 1} y={r + 1} width={5} height={5} fill="#fff" />
              <rect x={c + 2} y={r + 2} width={3} height={3} fill="#111" />
            </g>
          ))}
        </svg>
        {s.label && <small className="ew-qr-label">{s.label}</small>}
      </div>
    );
  },
};

/* ---- call to action variants ---- */

const callOut: WidgetDef = {
  type: "callout",
  title: "کال‌اوت",
  icon: HelpCircle,
  category: "pro",
  keywords: "callout note highlight کال اوت",
  defaults: { icon: "Lightbulb", title: "نکتهٔ مهم", desc: "این بخش برای جلب توجه خواننده به یک نکتهٔ کلیدی است.", btn: "", link: "" },
  sections: [
    sec("c", "محتوا", "content", [icn("icon"), txt("title", "عنوان"), area("desc", "توضیح"), txt("btn", "متن دکمه"), url("link")]),
    sec("s", "استایل", "style", [clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-callout": "background-color:{{VALUE}};" }), clr("ic", "رنگ آیکن", { "{{WRAPPER}} .ew-co-ic": "color:{{VALUE}};" }), clr("bar", "رنگ خط کناری", { "{{WRAPPER}} .ew-callout": "border-color:{{VALUE}};" }), ...borderCtls("co", "{{WRAPPER}} .ew-callout")]),
  ],
  render: ({ s }) => (
    <div className="ew-callout">
      <span className="ew-co-ic">
        <IconView name={s.icon} size={22} />
      </span>
      <div>
        {s.title && <b className="ew-co-title">{s.title}</b>}
        <p className="ew-co-desc">{s.desc}</p>
        {s.btn && (
          <a href={href(s.link) || "#"} className="ew-btn ew-btn--sm">
            {s.btn}
          </a>
        )}
      </div>
    </div>
  ),
};

/* ---- shop extras ---- */

const productSlider: WidgetDef = {
  ...makeCardWidget({
  type: "product-slider",
  title: "اسلایدر محصولات",
  icon: ShoppingBag,
  category: "shop",
  variant: "post",
  keywords: "products slider carousel محصول",
  layouts: ["carousel"],
  items: [],
  itemFields: [sel("productId", "محصول", CATALOG.slice(0, 40).map((p) => [p.id, p.name] as [string, string]))],
  presets: [P.carousel({ per: 4 }), P.carousel({ per: 3 })],
  }),
  render: () => {
    const list = CATALOG.slice(0, 6);
    return (
      <Carousel perView={4} arrows dots items={list.map((p) => (
        <div key={p.id} className="ew-product"><ProductCard product={p} /></div>
      ))} />
    );
  },
};

const categoryTiles: WidgetDef = {
  type: "category-tiles",
  title: "کاشی دسته‌ها",
  icon: Grid2x2,
  category: "shop",
  keywords: "category tiles shop دسته",
  defaults: { cols: 3, gap: 14 },
  sections: [
    sec("c", "دسته‌ها", "content", [sel("collection", "دستهٔ نمایشی", [["all", "همه"], ...COLLECTIONS.map((c) => [c.id, c.label] as [string, string])]), num("cols", "ستون‌ها", { responsive: true, min: 1, max: 6 }), slider("gap", "فاصله", 0, 40, { "{{WRAPPER}} .ew-cats": "gap:{{VALUE}}px;" }, { default: 14 }), sw("showCount", "نمایش تعداد", { default: true })]),
    sec("s", "استایل", "style", [clr("bg", "پس‌زمینهٔ کارت", { "{{WRAPPER}} .ew-cat": "background-color:{{VALUE}};" }), clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-cat-cap": "color:{{VALUE}};" }), ...borderCtls("cat", "{{WRAPPER}} .ew-cat")]),
  ],
  render: ({ s }) => (
    <div className="ew-cats" style={{ ["--ew-cols" as string]: String(s.cols || 3), gap: `${Number(s.gap) || 14}px` }}>
      {COLLECTIONS.map((c) => {
        const sample = productsInCollection(c.id)[0];
        return (
          <a key={c.id} href={`#/products?collection=${c.id}`} className="ew-cat">
            {sample && <ProductThumb product={sample} tileAspect={1} className="w-full rounded-none ring-0" />}
            <span className="ew-cat-cap">
              {c.label}
              {s.showCount !== false && <small> · {faNum(productsInCollection(c.id).length)}</small>}
            </span>
          </a>
        );
      })}
    </div>
  ),
};

const looksGrid: WidgetDef = {
  type: "looks-grid",
  title: "شبکهٔ استایل‌ها",
  icon: Layers,
  category: "shop",
  keywords: "looks styles runway استایل",
  defaults: { cols: 3, gap: 14, showPrice: true },
  sections: [
    sec("c", "استایل‌ها", "content", [num("cols", "ستون‌ها", { responsive: true, min: 1, max: 6 }), slider("gap", "فاصله", 0, 40, { "{{WRAPPER}} .ew-looks": "gap:{{VALUE}}px;" }, { default: 14 }), sw("showPrice", "نمایش قیمت", { default: true }), sw("showCount", "تعداد قطعه", { default: true })]),
    sec("s", "استایل", "style", [clr("bg", "پس‌زمینهٔ کارت", { "{{WRAPPER}} .ew-look": "background-color:{{VALUE}};" }), clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-look-cap": "color:{{VALUE}};" }), ...borderCtls("lk", "{{WRAPPER}} .ew-look")]),
  ],
  render: ({ s }) => (
    <div className="ew-looks" style={{ ["--ew-cols" as string]: String(s.cols || 3), gap: `${Number(s.gap) || 14}px` }}>
      {LOOKS.map((l) => (
        <a key={l.id} href={`#/style/${l.id}`} className="ew-look">
          <img src={l.image} alt={l.name} loading="lazy" draggable={false} />
          <span className="ew-look-cap">
            <b>{l.name}</b>
            {s.showCount !== false && <small>{faNum(l.products.length)} قطعه</small>}
            {s.showPrice !== false && <small>از {formatPrice(Math.min(...l.products.map((p) => p.price)))}</small>}
          </span>
        </a>
      ))}
    </div>
  ),
};

const postTabs: WidgetDef = {
  type: "post-tabs",
  title: "تب مقالات",
  icon: BookOpen,
  category: "dynamic",
  keywords: "post tabs blog مقاله",
  defaults: { count: 4, cols: 2 },
  sections: [
    sec("c", "مقالات", "content", [sel("cat", "دسته", [["", "همه"], ["استایل", "استایل"], ["آتلیه", "آتلیه"], ["پارچه", "پارچه"], ["رانوی", "رانوی"]]), num("count", "تعداد", { min: 1, max: 4 }), num("cols", "ستون‌ها", { responsive: true, min: 1, max: 4 }), sw("showExcerpt", "نمایش خلاصه", { default: true })]),
    sec("s", "استایل", "style", [clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-post-title a": "color:{{VALUE}};" }), clr("bg", "پس‌زمینهٔ کارت", { "{{WRAPPER}} .ew-post": "background-color:{{VALUE}};" }), ...borderCtls("pt", "{{WRAPPER}} .ew-post")]),
  ],
  render: ({ s }) => {
    const list = POSTS.filter((p) => !s.cat || p.category === s.cat).slice(0, Number(s.count) || 4);
    return (
      <div className="ew-cards is-grid" style={{ ["--ew-cols" as string]: String(s.cols || 2) }}>
        {list.map((p) => (
          <article key={p.slug} className="ew-card v-post">
            <div className="ew-card-img is-cover" style={{ backgroundColor: p.cutout ? p.imageTone : undefined }}>
              <img src={p.image} alt="" loading="lazy" draggable={false} style={p.cutout ? { objectFit: "contain", objectPosition: "bottom" } : undefined} />
            </div>
            <div className="ew-card-body">
              <p className="ew-card-meta">{p.category}</p>
              <h4 className="ew-card-title">
                <a href={`#/journal/${p.slug}`}>{p.title}</a>
              </h4>
              {s.showExcerpt !== false && <p className="ew-card-desc">{p.excerpt}</p>}
            </div>
          </article>
        ))}
      </div>
    );
  },
};

export const WIDGETS_D: WidgetDef[] = [
  coupon,
  notification,
  modal,
  offcanvas,
  cookieConsent,
  dataTable,
  comparisonTable,
  reviewGrid,
  googleReviews,
  instagramFeed,
  twitterCarousel,
  businessHours,
  contactInfo,
  qrCode,
  callOut,
  productSlider,
  categoryTiles,
  looksGrid,
  postTabs,
];
