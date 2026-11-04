import { useEffect, useMemo, useState } from "react";
import {
  AlignLeft,
  Badge,
  Clock3,
  Copy,
  CreditCard,
  FileInput,
  FolderOpen,
  Footprints,
  Home,
  ListTree,
  LogIn,
  Megaphone,
  Menu as MenuIcon,
  MessageSquareQuote,
  Newspaper,
  Presentation,
  RefreshCcw,
  Search as SearchIcon,
  ShoppingBag,
  Tag as TagIcon,
  TextCursorInput,
  Timer,
  Type as TypeIcon,
  Navigation,
  LayoutTemplate,
  Gauge,
  Images,
  Store,
  Grid3x3,
  ShoppingCart as CartIcon,
  Quote,
  Share2,
  Layers,
} from "lucide-react";
import {
  alignFlex,
  alignText,
  area,
  borderCtls,
  choose,
  clr,
  dims,
  hd,
  icn,
  img,
  num,
  rep,
  sec,
  sel,
  slider,
  sw,
  txt,
  typo,
  url,
  type WidgetDef,
  preset,
} from "./core";
import { dyn, href, rv, useDevice } from "./ctx";
import { Carousel, IconView, faNum, hooks } from "./kit";
import { resolveImg, PLACEHOLDER } from "./stock";
import { addSubmission } from "./docs";
import { POSTS } from "@/data/journal";
import { CATALOG, COLLECTIONS, filterProducts, productsInCollection, totalStock } from "@/data/catalog";
import { LOOKS, formatPrice, stockOf } from "@/data/looks";
import { ProductCard } from "@/components/ProductCard";
import { ProductThumb } from "@/components/ProductThumb";
import { useCart } from "@/state/cart";
import { NETWORKS } from "./widgets-a";

/* ================================================================== */
/* PRO — content                                                       */
/* ================================================================== */

function PostsView({ s }: { s: Record<string, any> }) {
  const list = POSTS.filter((p) => !s.cat || p.category === s.cat).slice(0, Number(s.count) || 3);
  return (
    <div className={`ew-posts skin-${s.skin || "classic"}`}>
      {list.map((p) => (
        <article key={p.slug} className="ew-post">
          {s.showImage !== false && (
            <a href={`#/journal/${p.slug}`} className={`ew-post-img ${p.cutout ? "is-cutout" : ""}`} style={{ backgroundColor: p.cutout ? p.imageTone : undefined }}>
              <img src={p.image} alt="" loading="lazy" draggable={false} />
            </a>
          )}
          <div className="ew-post-body">
            <div className="ew-post-meta">
              {p.category}
              {s.showDate !== false && ` · ${p.date}`}
            </div>
            <h3 className="ew-post-title">
              <a href={`#/journal/${p.slug}`}>{p.title}</a>
            </h3>
            {s.showExcerpt !== false && <p className="ew-post-excerpt">{p.excerpt}</p>}
            {s.readMore !== false && (
              <a href={`#/journal/${p.slug}`} className="ew-post-more">
                {s.moreText || "ادامهٔ مطلب"} ←
              </a>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

const posts: WidgetDef = {
  type: "posts",
  title: "نوشته‌ها (Posts)",
  icon: Newspaper,
  category: "pro",
  keywords: "posts blog journal مقاله ژورنال",
  presets: [
    preset("classic3", "سه‌تایی کلاسیک", { skin: "classic", cols: 3 }, "استاندارد"),
    preset("card", "کارت‌دار", { skin: "card", cols: 3 }, "با قاب"),
    preset("big", "دو ستونه بزرگ", { skin: "card", cols: 2 }, "تصاویر بزرگ"),
    preset("minimal", "فقط متن", { skin: "classic", cols: 3, showImage: false }, "ساده"),
  ],
  defaults: { count: 3, cols: 3, colsTablet: 2, colsMobile: 1, skin: "classic", showImage: true, showExcerpt: true, showDate: true, readMore: true, moreText: "ادامهٔ مطلب" },
  sections: [
    sec("c", "پرس‌وجو", "content", [
      sel("cat", "دستهٔ مقاله", [["", "همه"], ["استایل", "استایل"], ["آتلیه", "آتلیه"], ["پارچه", "پارچه"], ["رانوی", "رانوی"]]),
      slider("count", "تعداد", 1, 4, undefined, { unit: "", default: 3 }),
      slider("cols", "ستون‌ها", 1, 4, { "{{WRAPPER}} .ew-posts": "grid-template-columns:repeat({{VALUE}},1fr);" }, { unit: "", responsive: true, default: 3 }),
      sel("skin", "اسکین", [["classic", "کلاسیک"], ["card", "کارتی"]]),
      sw("showImage", "تصویر", { default: true }),
      sw("showExcerpt", "خلاصه", { default: true }),
      sw("showDate", "تاریخ", { default: true }),
      sw("readMore", "دکمهٔ ادامه", { default: true }),
      txt("moreText", "متن دکمه"),
    ]),
    sec("s", "استایل", "style", [
      slider("gap", "فاصلهٔ آیتم‌ها", 0, 60, { "{{WRAPPER}} .ew-posts": "gap:{{VALUE}}px;" }, { default: 24 }),
      clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-post-title a": "color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-post-title"),
      clr("ec", "رنگ خلاصه", { "{{WRAPPER}} .ew-post-excerpt": "color:{{VALUE}};" }),
      clr("mc", "رنگ متای پست", { "{{WRAPPER}} .ew-post-meta": "color:{{VALUE}};" }),
      ...borderCtls("post", "{{WRAPPER}} .ew-post"),
    ]),
  ],
  render: ({ s }) => <PostsView s={s} />,
};

function PortfolioView({ s }: { s: Record<string, any> }) {
  const items: any[] = s.items ?? [];
  const cats = useMemo(() => [...new Set(items.map((i) => i.category).filter(Boolean))], [items]);
  const [f, setF] = useState("");
  const shown = f ? items.filter((i) => i.category === f) : items;
  return (
    <div className="ew-pf">
      {s.filter !== false && cats.length > 0 && (
        <div className="ew-pf-filter">
          <button type="button" className={!f ? "is-on" : ""} onClick={() => setF("")}>
            همه
          </button>
          {cats.map((c) => (
            <button key={c} type="button" className={f === c ? "is-on" : ""} onClick={() => setF(c)}>
              {c}
            </button>
          ))}
        </div>
      )}
      <div className="ew-pf-grid">
        {shown.map((it, i) => (
          <a key={i} href={href(it.link) || "#"} className="ew-pf-item">
            <img src={resolveImg(it.image) || PLACEHOLDER} alt="" draggable={false} loading="lazy" />
            <span className="ew-pf-cap">
              <b>{it.title}</b>
              <small>{it.category}</small>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

const portfolio: WidgetDef = {
  type: "portfolio",
  title: "پورتفولیو",
  icon: Grid3x3,
  category: "pro",
  keywords: "portfolio gallery filter پورتفولیو",
  defaults: {
    filter: true,
    cols: 3,
    colsTablet: 2,
    colsMobile: 2,
    fit: "contain",
    items: LOOKS.slice(0, 6).map((l, i) => ({ image: `stock:look${i + 1}`, title: l.name, category: i % 2 ? "مردانه" : "زنانه", link: `/style/${l.id}` })),
  },
  sections: [
    sec("c", "آیتم‌ها", "content", [
      rep("items", "آیتم‌ها", [img("image"), txt("title", "عنوان"), txt("category", "دسته"), url("link")], { image: "stock:look1", title: "پروژه", category: "دسته", link: "" }),
      sw("filter", "فیلتر دسته‌ها", { default: true }),
      sel("fit", "نحوهٔ نمایش تصویر", [["cover", "پوشش (Cover)"], ["contain", "کامل (Contain)"]], { selectors: { "{{WRAPPER}} .ew-pf-item img": "object-fit:{{VALUE}};" } }),
      slider("cols", "ستون‌ها", 1, 6, { "{{WRAPPER}} .ew-pf-grid": "grid-template-columns:repeat({{VALUE}},1fr);" }, { unit: "", responsive: true, default: 3 }),
      slider("gap", "فاصله", 0, 50, { "{{WRAPPER}} .ew-pf-grid": "gap:{{VALUE}}px;" }, { default: 14 }),
      sel("ratio", "نسبت تصویر", [["3/4", "۳:۴"], ["1/1", "۱:۱"], ["4/3", "۴:۳"]], { selectors: { "{{WRAPPER}} .ew-pf-item": "aspect-ratio:{{VALUE}};" } }),
    ]),
    sec("s", "استایل", "style", [
      clr("bg", "پس‌زمینهٔ آیتم", { "{{WRAPPER}} .ew-pf-item": "background-color:{{VALUE}};" }),
      clr("capBg", "پس‌زمینهٔ عنوان", { "{{WRAPPER}} .ew-pf-cap": "background:{{VALUE}};" }),
      clr("capColor", "رنگ عنوان", { "{{WRAPPER}} .ew-pf-cap": "color:{{VALUE}};" }),
      clr("fc", "رنگ دکمهٔ فعال فیلتر", { "{{WRAPPER}} .ew-pf-filter .is-on": "background-color:{{VALUE}};border-color:{{VALUE}};" }),
      ...borderCtls("pfi", "{{WRAPPER}} .ew-pf-item"),
    ]),
  ],
  render: ({ s }) => <PortfolioView s={s} />,
};

const slidesItems = [
  { image: "stock:hero", title: "کلکسیون پاییز / زمستان", desc: "پالتو، کشمیر و چرم؛ ساخت پاریس.", btn: "مشاهدهٔ کالکشن", link: "/products" },
  { image: "stock:atelier", title: "آتلیه‌ای که آهسته می‌سازد", desc: "هر قطعه، سه هفته کار دست.", btn: "داستان ما", link: "/about" },
  { image: "stock:campaign", title: "نرمی یک فصل کامل", desc: "کشمیر عاجی با ساتن ماسه‌ای.", btn: "ورود به لندینگ", link: "/landing" },
];

function SlidesView({ s }: { s: Record<string, any> }) {
  const items: any[] = s.items ?? [];
  return (
    <Carousel
      fade
      autoplay={!!s.autoplay}
      speed={Number(s.speed) || 5000}
      arrows={s.arrows !== false}
      dots={s.dots !== false}
      className="ew-slides"
      items={items.map((it, i) => (
        <div key={i} className="ew-slide" style={{ backgroundImage: `url("${resolveImg(it.image) || PLACEHOLDER}")` }}>
          <div className="ew-slide-ov" />
          <div className="ew-slide-body">
            <h2 className="ew-slide-title">{it.title}</h2>
            <p className="ew-slide-desc">{it.desc}</p>
            {it.btn && (
              <a href={href(it.link) || "#"} className="ew-btn ew-btn--md ew-slide-btn">
                {it.btn}
              </a>
            )}
          </div>
        </div>
      ))}
    />
  );
}

const slides: WidgetDef = {
  type: "slides",
  title: "اسلایدها",
  icon: Presentation,
  category: "pro",
  keywords: "slides hero slider اسلاید",
  defaults: { items: slidesItems, autoplay: true, speed: 5000, arrows: true, dots: true, align: "start" },
  sections: [
    sec("c", "اسلایدها", "content", [
      rep("items", "اسلایدها", [img("image", "تصویر پس‌زمینه"), txt("title", "عنوان"), area("desc", "توضیح"), txt("btn", "متن دکمه"), url("link")], { image: "stock:hero", title: "اسلاید جدید", desc: "", btn: "بیشتر", link: "" }),
      slider("height", "ارتفاع", 240, 900, { "{{WRAPPER}} .ew-slide": "height:{{VALUE}}px;" }, { responsive: true, default: 460 }),
      sw("autoplay", "پخش خودکار", { default: true }),
      num("speed", "سرعت (میلی‌ثانیه)", { min: 1500, max: 12000, step: 100 }),
      sw("arrows", "فلش‌ها", { default: true }),
      sw("dots", "نقطه‌ها", { default: true }),
      choose("align", "تراز محتوا", [["start", "شروع", "AlignRight"], ["center", "وسط", "AlignCenter"], ["end", "پایان", "AlignLeft"]], { selectors: { "{{WRAPPER}} .ew-slide-body": "text-align:{{VALUE}};align-items:{{VALUE}};" } }),
    ]),
    sec("s", "استایل", "style", [
      clr("ov", "رنگ لایه", { "{{WRAPPER}} .ew-slide-ov": "background-color:{{VALUE}};" }),
      slider("ovo", "شفافیت لایه", 0, 1, { "{{WRAPPER}} .ew-slide-ov": "opacity:{{VALUE}};" }, { step: 0.05, unit: "", default: 0.45 }),
      clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-slide-title": "color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-slide-title"),
      clr("dc", "رنگ توضیح", { "{{WRAPPER}} .ew-slide-desc": "color:{{VALUE}};" }),
      clr("bc", "رنگ دکمه", { "{{WRAPPER}} .ew-slide-btn": "background-color:{{VALUE}};" }),
      ...borderCtls("slide", "{{WRAPPER}} .ew-slides"),
    ]),
  ],
  render: ({ s }) => <SlidesView s={s} />,
};

/* ================================================================== */
/* PRO — forms & navigation                                            */
/* ================================================================== */

function FormView({ s, editing }: { s: Record<string, any>; editing: boolean }) {
  const fields: any[] = s.fields ?? [];
  const [done, setDone] = useState(false);
  const [note, setNote] = useState("");
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (editing) {
      setNote("در حالت ویرایش ارسال نمی‌شود — پیش‌نمایش بگیر.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    const data: Record<string, string> = {};
    fields.forEach((f) => {
      const v = fd.get(f.name || f.label);
      data[f.label] = f.type === "checkbox" ? (v ? "بله" : "خیر") : String(v ?? "");
    });
    addSubmission({ form: s.formName || "فرم", page: document.title, data });
    setDone(true);
    e.currentTarget.reset();
  };
  if (done) return <div className="ew-form-ok">{s.success || "پیام شما ثبت شد. ممنون!"}</div>;
  return (
    <form className="ew-form" onSubmit={submit}>
      {fields.map((f, i) => {
        const name = f.name || f.label;
        const id = `ef-${name}-${i}`;
        const width = f.width && Number(f.width) < 100 ? { flexBasis: `calc(${f.width}% - 14px)` } : undefined;
        return (
          <div key={i} className="ew-field" style={width}>
            {f.type !== "checkbox" && s.showLabels !== false && (
              <label htmlFor={id}>
                {f.label}
                {f.required && <i> *</i>}
              </label>
            )}
            {f.type === "textarea" ? (
              <textarea id={id} name={name} rows={4} required={!!f.required} placeholder={f.placeholder} />
            ) : f.type === "select" ? (
              <select id={id} name={name} required={!!f.required}>
                {String(f.options ?? "").split(",").map((o: string) => (
                  <option key={o.trim()}>{o.trim()}</option>
                ))}
              </select>
            ) : f.type === "checkbox" ? (
              <label className="ew-check" htmlFor={id}>
                <input id={id} name={name} type="checkbox" required={!!f.required} /> {f.label}
              </label>
            ) : (
              <input id={id} name={name} type={f.type || "text"} required={!!f.required} placeholder={f.placeholder} />
            )}
          </div>
        );
      })}
      <div className="ew-field is-submit">
        <button type="submit" className="ew-btn ew-btn--md ew-form-btn">
          {s.submit || "ارسال"}
        </button>
      </div>
      {note && <p className="ew-form-note">{note}</p>}
    </form>
  );
}

const form: WidgetDef = {
  type: "form",
  title: "فرم",
  icon: FileInput,
  category: "pro",
  keywords: "form contact فرم تماس",
  presets: [
    preset("contact", "فرم تماس کامل", { formName: "فرم تماس" }, "چهار فیلد"),
    preset("newsletter", "خبرنامه", { formName: "خبرنامه", showLabels: false, fields: [{ type: "email", label: "ایمیل", placeholder: "ایمیل", required: true, width: 100 }] }, "تک‌فیلد"),
    preset("compact", "فشرده دوستونه", { formName: "پیام سریع", fields: [{ type: "text", label: "نام", placeholder: "نام", required: true, width: 50 }, { type: "email", label: "ایمیل", placeholder: "ایمیل", required: true, width: 50 }] }, "دو فیلد"),
  ],
  defaults: {
    formName: "فرم تماس",
    submit: "ارسال پیام",
    success: "پیام شما ثبت شد؛ به‌زودی پاسخ می‌دهیم.",
    showLabels: true,
    fields: [
      { type: "text", label: "نام", placeholder: "نام شما", required: true, width: 50 },
      { type: "email", label: "ایمیل", placeholder: "email@example.com", required: true, width: 50 },
      { type: "select", label: "موضوع", options: "سفارش,مرجوعی,همکاری,سایر", width: 100 },
      { type: "textarea", label: "پیام", placeholder: "پیام خود را بنویس…", required: true, width: 100 },
    ],
  },
  sections: [
    sec("c", "فیلدها", "content", [
      txt("formName", "نام فرم (برای ثبت پیام‌ها)"),
      rep(
        "fields",
        "فیلدها",
        [
          sel("type", "نوع", [["text", "متن"], ["email", "ایمیل"], ["tel", "تلفن"], ["number", "عدد"], ["date", "تاریخ"], ["textarea", "متن بلند"], ["select", "انتخابی"], ["checkbox", "تیک"]]),
          txt("label", "برچسب"),
          txt("placeholder", "راهنما"),
          txt("options", "گزینه‌ها (با ویرگول)"),
          sw("required", "اجباری"),
          slider("width", "عرض", 25, 100, undefined, { unit: "%", default: 100 }),
        ],
        { type: "text", label: "فیلد جدید", placeholder: "", required: false, width: 100 },
        "label",
      ),
      txt("submit", "متن دکمه"),
      txt("success", "پیام موفقیت"),
      sw("showLabels", "نمایش برچسب‌ها", { default: true }),
    ]),
    sec("s", "استایل", "style", [
      slider("gap", "فاصلهٔ فیلدها", 0, 40, { "{{WRAPPER}} .ew-form": "gap:{{VALUE}}px;" }, { default: 14 }),
      clr("lc", "رنگ برچسب", { "{{WRAPPER}} .ew-field label": "color:{{VALUE}};" }),
      ...typo("l", "{{WRAPPER}} .ew-field label"),
      clr("fbg", "پس‌زمینهٔ فیلد", { "{{WRAPPER}} .ew-field input,{{WRAPPER}} .ew-field textarea,{{WRAPPER}} .ew-field select": "background-color:{{VALUE}};" }),
      clr("fc", "رنگ متن فیلد", { "{{WRAPPER}} .ew-field input,{{WRAPPER}} .ew-field textarea,{{WRAPPER}} .ew-field select": "color:{{VALUE}};" }),
      clr("fb", "رنگ حاشیهٔ فیلد", { "{{WRAPPER}} .ew-field input,{{WRAPPER}} .ew-field textarea,{{WRAPPER}} .ew-field select": "border-color:{{VALUE}};" }),
      dims("fr", "گردی فیلد", "{{WRAPPER}} .ew-field input,{{WRAPPER}} .ew-field textarea,{{WRAPPER}} .ew-field select", "border-radius"),
      hd("دکمه"),
      clr("bbg", "پس‌زمینهٔ دکمه", { "{{WRAPPER}} .ew-form-btn": "background-color:{{VALUE}};" }),
      clr("bc", "رنگ متن دکمه", { "{{WRAPPER}} .ew-form-btn": "color:{{VALUE}};" }),
      ...typo("b", "{{WRAPPER}} .ew-form-btn"),
      dims("br", "گردی دکمه", "{{WRAPPER}} .ew-form-btn", "border-radius"),
    ]),
  ],
  render: ({ s, editing }) => <FormView s={s} editing={editing} />,
};

function LoginView({ s, editing }: { s: Record<string, any>; editing: boolean }) {
  const { notify } = useCart();
  return (
    <form
      className="ew-form ew-login"
      onSubmit={(e) => {
        e.preventDefault();
        if (!editing) notify("ورود نمایشی", "این نسخه سیستم کاربری واقعی ندارد.");
      }}
    >
      <div className="ew-field">
        <label>{s.userLabel || "نام کاربری یا ایمیل"}</label>
        <input name="u" required />
      </div>
      <div className="ew-field">
        <label>{s.passLabel || "رمز عبور"}</label>
        <input name="p" type="password" required />
      </div>
      {s.remember !== false && (
        <label className="ew-check">
          <input type="checkbox" /> مرا به خاطر بسپار
        </label>
      )}
      <button type="submit" className="ew-btn ew-btn--md ew-form-btn">
        {s.submit || "ورود"}
      </button>
      {s.lost !== false && (
        <a className="ew-login-lost" href="#/about">
          رمز عبور را فراموش کرده‌ای؟
        </a>
      )}
    </form>
  );
}

const login: WidgetDef = {
  type: "login",
  title: "ورود به حساب",
  icon: LogIn,
  category: "pro",
  keywords: "login signin ورود",
  defaults: { submit: "ورود", remember: true, lost: true },
  sections: [
    sec("c", "فرم ورود", "content", [txt("userLabel", "برچسب نام کاربری"), txt("passLabel", "برچسب رمز"), txt("submit", "متن دکمه"), sw("remember", "مرا به خاطر بسپار", { default: true }), sw("lost", "لینک فراموشی رمز", { default: true })]),
    sec("s", "استایل", "style", [
      clr("fbg", "پس‌زمینهٔ فیلد", { "{{WRAPPER}} .ew-field input": "background-color:{{VALUE}};" }),
      clr("bbg", "پس‌زمینهٔ دکمه", { "{{WRAPPER}} .ew-form-btn": "background-color:{{VALUE}};" }),
      ...borderCtls("login", "{{WRAPPER}} .ew-login"),
      dims("pad", "فاصلهٔ داخلی", "{{WRAPPER}} .ew-login", "padding"),
    ]),
  ],
  render: ({ s, editing }) => <LoginView s={s} editing={editing} />,
};

const MENU_ITEMS = [
  { label: "خانه", link: "/" },
  { label: "فروشگاه", link: "/products" },
  { label: "خرید بر اساس استایل", link: "/style" },
  { label: "ژورنال", link: "/journal" },
  { label: "دربارهٔ ما", link: "/about" },
];

function NavMenuView({ s }: { s: Record<string, any> }) {
  const d = useDevice();
  const [open, setOpen] = useState(false);
  const collapsed = d === "mobile" || (s.breakpoint === "tablet" && d === "tablet");
  const items: any[] = s.items ?? [];
  const list = (
    <ul className={`ew-nav-list is-${s.layout || "horizontal"}`}>
      {items.map((it, i) => (
        <li key={i}>
          <a href={href(it.link) || "#"} onClick={() => setOpen(false)}>
            {it.label}
          </a>
        </li>
      ))}
    </ul>
  );
  return (
    <nav className="ew-nav">
      {collapsed ? (
        <>
          <button type="button" className="ew-nav-toggle" aria-expanded={open} aria-label="منو" onClick={() => setOpen((v) => !v)}>
            <MenuIcon width={20} height={20} />
          </button>
          {open && <div className="ew-nav-drop">{list}</div>}
        </>
      ) : (
        list
      )}
    </nav>
  );
}

const navMenu: WidgetDef = {
  type: "nav-menu",
  title: "منوی ناوبری",
  icon: Navigation,
  category: "pro",
  keywords: "menu nav منو",
  defaults: { layout: "horizontal", breakpoint: "mobile", items: MENU_ITEMS },
  sections: [
    sec("c", "منو", "content", [
      rep("items", "آیتم‌ها", [txt("label", "برچسب"), url("link")], { label: "آیتم", link: "/" }, "label"),
      choose("layout", "چیدمان", [["horizontal", "افقی", "ArrowLeft"], ["vertical", "عمودی", "ArrowDown"]]),
      sel("breakpoint", "تبدیل به همبرگری", [["mobile", "در موبایل"], ["tablet", "در تبلت و موبایل"]]),
      alignFlex("align", "{{WRAPPER}} .ew-nav"),
    ]),
    sec("s", "استایل", "style", [
      ...typo("t", "{{WRAPPER}} .ew-nav-list a"),
      clr("c", "رنگ لینک", { "{{WRAPPER}} .ew-nav-list a": "color:{{VALUE}};" }),
      clr("ch", "رنگ هاور", { "{{WRAPPER}} .ew-nav-list a:hover": "color:{{VALUE}};" }),
      slider("gap", "فاصلهٔ آیتم‌ها", 0, 60, { "{{WRAPPER}} .ew-nav-list": "gap:{{VALUE}}px;" }, { default: 24, responsive: true }),
      clr("dbg", "پس‌زمینهٔ منوی بازشو", { "{{WRAPPER}} .ew-nav-drop": "background-color:{{VALUE}};" }),
      clr("tg", "رنگ دکمهٔ همبرگر", { "{{WRAPPER}} .ew-nav-toggle": "color:{{VALUE}};" }),
    ]),
  ],
  render: ({ s }) => <NavMenuView s={s} />,
};

function AnimatedHeadline({ s }: { s: Record<string, any> }) {
  const words = String(s.words ?? "").split("\n").map((w) => w.trim()).filter(Boolean);
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState(0);
  const kind = s.effect || "rotate";
  const cur = words[i % Math.max(1, words.length)] ?? "";
  useEffect(() => {
    if (words.length < 2 && kind !== "typing") return;
    if (kind === "typing") {
      if (typed < cur.length) {
        const t = window.setTimeout(() => setTyped((v) => v + 1), 90);
        return () => window.clearTimeout(t);
      }
      const t = window.setTimeout(() => {
        setTyped(0);
        setI((v) => v + 1);
      }, 1400);
      return () => window.clearTimeout(t);
    }
    const t = window.setInterval(() => setI((v) => v + 1), Math.max(900, Number(s.speed) || 2200));
    return () => window.clearInterval(t);
  }, [kind, typed, cur, words.length, s.speed]);
  const Tag = (s.tag || "h2") as "h2";
  return (
    <Tag className="ew-ah">
      <span>{s.before} </span>
      <span key={kind === "typing" ? "t" : i} className={`ew-ah-word is-${kind}`}>
        {kind === "typing" ? cur.slice(0, typed) : cur}
      </span>
      <span> {s.after}</span>
    </Tag>
  );
}

const animatedHeadline: WidgetDef = {
  type: "animated-headline",
  title: "عنوان متحرک",
  icon: TypeIcon,
  category: "pro",
  keywords: "animated headline typing rotating عنوان متحرک",
  defaults: { before: "ما می‌سازیم", words: "پالتوی بلند\nکشمیر نرم\nچرم دست‌دوز", after: "برای تو.", effect: "rotate", speed: 2200, tag: "h2" },
  sections: [
    sec("c", "متن", "content", [
      txt("before", "متن قبل"),
      area("words", "کلمات متحرک (هر خط یک کلمه)", { rows: 4 }),
      txt("after", "متن بعد"),
      sel("effect", "افکت", [["rotate", "چرخشی (Fade)"], ["typing", "تایپ"], ["slide", "لغزشی"], ["highlight", "هایلایت"]]),
      num("speed", "سرعت (میلی‌ثانیه)", { min: 900, max: 8000, step: 100 }),
      sel("tag", "تگ HTML", [["h1", "H1"], ["h2", "H2"], ["h3", "H3"], ["div", "div"]]),
      alignText("align", "{{WRAPPER}} .ew-ah"),
    ]),
    sec("s", "استایل", "style", [
      clr("color", "رنگ متن", { "{{WRAPPER}} .ew-ah": "color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-ah"),
      clr("wc", "رنگ کلمهٔ متحرک", { "{{WRAPPER}} .ew-ah-word": "color:{{VALUE}};" }),
    ]),
  ],
  render: ({ s }) => <AnimatedHeadline s={s} />,
};

/* ================================================================== */
/* PRO — pricing & marketing                                           */
/* ================================================================== */

const priceList: WidgetDef = {
  type: "price-list",
  title: "لیست قیمت",
  icon: TagIcon,
  category: "pro",
  keywords: "price list menu قیمت",
  defaults: {
    items: [
      { title: "پرو و مشاورهٔ استایل", price: "رایگان", desc: "یک ساعت با تیم استایل، بدون تعهد خرید.", image: "", link: "" },
      { title: "تنظیم سایز اختصاصی", price: "۸۰۰٬۰۰۰ تومان", desc: "اصلاح فرم روی بدن توسط خیاط آتلیه.", image: "", link: "" },
      { title: "بسته‌بندی هدیه", price: "۱۵۰٬۰۰۰ تومان", desc: "جعبهٔ دست‌ساز با کارت دست‌نویس.", image: "", link: "" },
    ],
  },
  sections: [
    sec("c", "آیتم‌ها", "content", [rep("items", "آیتم‌ها", [txt("title", "عنوان"), txt("price", "قیمت"), area("desc", "توضیح"), img("image"), url("link")], { title: "آیتم", price: "۰ تومان", desc: "", image: "", link: "" })]),
    sec("s", "استایل", "style", [
      slider("gap", "فاصلهٔ آیتم‌ها", 0, 60, { "{{WRAPPER}} .ew-pl": "gap:{{VALUE}}px;" }, { default: 20 }),
      clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-pl-title": "color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-pl-title"),
      clr("pc", "رنگ قیمت", { "{{WRAPPER}} .ew-pl-price": "color:{{VALUE}};" }),
      ...typo("p", "{{WRAPPER}} .ew-pl-price"),
      clr("dc", "رنگ توضیح", { "{{WRAPPER}} .ew-pl-desc": "color:{{VALUE}};" }),
      clr("lc", "رنگ خط ارتباطی", { "{{WRAPPER}} .ew-pl-sep": "border-color:{{VALUE}};" }),
    ]),
  ],
  render: ({ s }) => (
    <ul className="ew-pl">
      {(s.items ?? []).map((it: any, i: number) => {
        const row = (
          <>
            {it.image && <img className="ew-pl-img" src={resolveImg(it.image)} alt="" draggable={false} />}
            <div className="ew-pl-main">
              <div className="ew-pl-head">
                <span className="ew-pl-title">{it.title}</span>
                <span className="ew-pl-sep" />
                <span className="ew-pl-price">{it.price}</span>
              </div>
              <p className="ew-pl-desc">{it.desc}</p>
            </div>
          </>
        );
        return (
          <li key={i} className="ew-pl-item">
            {it.link ? <a href={href(it.link)} className="ew-plain ew-pl-row">{row}</a> : <div className="ew-pl-row">{row}</div>}
          </li>
        );
      })}
    </ul>
  ),
};

const priceTable: WidgetDef = {
  type: "price-table",
  title: "جدول قیمت",
  icon: CreditCard,
  category: "pro",
  keywords: "pricing table plan جدول قیمت پلن",
  presets: [
    preset("featured", "برجسته با نوار", { featured: true, ribbon: "پیشنهاد ویژه" }, "استاندارد"),
    preset("plain", "ساده", { featured: false, ribbon: "" }, "بدون نوار"),
    preset("dark", "تیره لوکس", { featured: true, bgColor: "#16130f", ptBg: "#1f1b17", tc: "#f7f3ed", pc: "#e5c158" }, "شب"),
  ],
  defaults: {
    title: "عضویت طلایی",
    subtitle: "برای مشتریان وفادار",
    price: "۴۹",
    currency: "تومان",
    period: "/ ماه",
    featured: true,
    ribbon: "پیشنهاد ویژه",
    btn: "همین حالا شروع کن",
    link: "/products",
    features: [
      { text: "ارسال رایگان همهٔ سفارش‌ها", on: true },
      { text: "دسترسی زودهنگام به کالکشن", on: true },
      { text: "پرو اختصاصی در بوتیک", on: true },
      { text: "مشاور استایل شخصی", on: false },
    ],
  },
  sections: [
    sec("c", "جدول", "content", [
      txt("title", "عنوان"),
      txt("subtitle", "زیرعنوان"),
      txt("price", "قیمت"),
      txt("currency", "واحد"),
      txt("period", "دوره"),
      rep("features", "ویژگی‌ها", [txt("text", "متن"), sw("on", "فعال", { default: true })], { text: "ویژگی جدید", on: true }, "text"),
      txt("btn", "متن دکمه"),
      url("link"),
      txt("ribbon", "نوار گوشه"),
      sw("featured", "برجسته"),
    ]),
    sec("s", "استایل", "style", [
      clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-pt": "background-color:{{VALUE}};" }),
      clr("hbg", "پس‌زمینهٔ هدر", { "{{WRAPPER}} .ew-pt-head": "background-color:{{VALUE}};" }),
      clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-pt-title": "color:{{VALUE}};" }),
      clr("pc", "رنگ قیمت", { "{{WRAPPER}} .ew-pt-price": "color:{{VALUE}};" }),
      ...typo("p", "{{WRAPPER}} .ew-pt-price"),
      clr("fc", "رنگ ویژگی‌ها", { "{{WRAPPER}} .ew-pt-feat li": "color:{{VALUE}};" }),
      clr("bbg", "رنگ دکمه", { "{{WRAPPER}} .ew-pt .ew-btn": "background-color:{{VALUE}};" }),
      clr("rbg", "رنگ نوار", { "{{WRAPPER}} .ew-pt-ribbon": "background-color:{{VALUE}};" }),
      ...borderCtls("pt", "{{WRAPPER}} .ew-pt"),
    ]),
  ],
  render: ({ s }) => (
    <div className={`ew-pt ${s.featured ? "is-featured" : ""}`}>
      {s.ribbon && <span className="ew-pt-ribbon">{s.ribbon}</span>}
      <div className="ew-pt-head">
        <h3 className="ew-pt-title">{s.title}</h3>
        <p className="ew-pt-sub">{s.subtitle}</p>
        <div className="ew-pt-price">
          <small>{s.currency}</small>
          <b>{s.price}</b>
          <small>{s.period}</small>
        </div>
      </div>
      <ul className="ew-pt-feat">
        {(s.features ?? []).map((f: any, i: number) => (
          <li key={i} className={f.on === false ? "is-off" : ""}>
            <IconView name={f.on === false ? "X" : "Check"} size={14} /> {f.text}
          </li>
        ))}
      </ul>
      <a href={href(s.link) || "#"} className="ew-btn ew-btn--md is-full">
        {s.btn}
      </a>
    </div>
  ),
};

function FlipView({ s }: { s: Record<string, any> }) {
  const [flip, setFlip] = useState(false);
  return (
    <div className={`ew-flip fx-${s.effect || "flip"} ${flip ? "is-flip" : ""} ${s.trigger === "click" ? "on-click" : "on-hover"}`} onClick={() => s.trigger === "click" && setFlip((v) => !v)}>
      <div className="ew-flip-inner">
        <div className="ew-flip-face ew-flip-front">
          <IconView name={s.icon} size={42} />
          <h3>{s.frontTitle}</h3>
          <p>{s.frontDesc}</p>
        </div>
        <div className="ew-flip-face ew-flip-back">
          <h3>{s.backTitle}</h3>
          <p>{s.backDesc}</p>
          {s.btn && (
            <a href={href(s.link) || "#"} className="ew-btn ew-btn--sm">
              {s.btn}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

const flipBox: WidgetDef = {
  type: "flip-box",
  title: "باکس چرخان",
  icon: RefreshCcw,
  category: "pro",
  keywords: "flip box باکس چرخان",
  presets: [preset("flip", "چرخش", { effect: "flip" }), preset("slide", "لغزش", { effect: "slide" }), preset("fade", "محو", { effect: "fade" }), preset("zoom", "بزرگ‌نمایی", { effect: "zoom" }), preset("click", "با کلیک", { trigger: "click" })],
  defaults: { effect: "flip", trigger: "hover", icon: "Gem", frontTitle: "کشمیر ناب", frontDesc: "نرم، سبک و ماندگار", backTitle: "ببین از نزدیک", backDesc: "همهٔ بافت‌های کشمیر را در فروشگاه ببین.", btn: "مشاهده", link: "/products?collection=knitwear" },
  sections: [
    sec("c", "رو و پشت", "content", [
      sel("effect", "افکت", [["flip", "چرخش"], ["slide", "لغزش"], ["fade", "محو"], ["zoom", "بزرگ‌نمایی"]]),
      sel("trigger", "فعال‌سازی", [["hover", "هاور"], ["click", "کلیک"]]),
      slider("height", "ارتفاع", 160, 600, { "{{WRAPPER}} .ew-flip": "height:{{VALUE}}px;" }, { default: 280, responsive: true }),
      hd("روی کارت"),
      icn("icon"),
      txt("frontTitle", "عنوان"),
      area("frontDesc", "توضیح"),
      hd("پشت کارت"),
      txt("backTitle", "عنوان"),
      area("backDesc", "توضیح"),
      txt("btn", "متن دکمه"),
      url("link"),
    ]),
    sec("s", "استایل", "style", [
      clr("fbg", "پس‌زمینهٔ رو", { "{{WRAPPER}} .ew-flip-front": "background-color:{{VALUE}};" }),
      clr("fc", "رنگ متن رو", { "{{WRAPPER}} .ew-flip-front": "color:{{VALUE}};" }),
      clr("bbg", "پس‌زمینهٔ پشت", { "{{WRAPPER}} .ew-flip-back": "background-color:{{VALUE}};" }),
      clr("bc", "رنگ متن پشت", { "{{WRAPPER}} .ew-flip-back": "color:{{VALUE}};" }),
      ...borderCtls("flip", "{{WRAPPER}} .ew-flip-face"),
    ]),
  ],
  render: ({ s }) => <FlipView s={s} />,
};

const cta: WidgetDef = {
  type: "call-to-action",
  title: "فراخوان (CTA)",
  icon: Megaphone,
  category: "pro",
  keywords: "cta call to action فراخوان",
  defaults: { title: "عضو خبرنامه شو", desc: "اول از همه، نمایش بعدی را ببین.", btn: "عضویت", link: "/", image: "stock:atelier", layout: "cover", align: "center" },
  presets: [
    preset("cover", "تصویر پس‌زمینه", { layout: "cover" }, "کلاسیک"),
    preset("split", "تصویر کنار متن", { layout: "split" }, "مدرن"),
    preset("solid", "رنگ ساده", { layout: "cover", image: "", bgColor: "#16130f", tc: "#ffffff" }, "مینیمال"),
  ],
  sections: [
    sec("c", "محتوا", "content", [
      txt("title", "عنوان"),
      area("desc", "توضیح"),
      txt("btn", "متن دکمه"),
      url("link"),
      img("image", "تصویر"),
      choose("layout", "چیدمان", [["cover", "تصویر پس‌زمینه", "Image"], ["split", "تصویر کنار متن", "ArrowLeft"]]),
      slider("height", "حداقل ارتفاع", 200, 800, { "{{WRAPPER}} .ew-cta": "min-height:{{VALUE}}px;" }, { responsive: true, default: 340 }),
      alignText("align", "{{WRAPPER}} .ew-cta-body"),
    ]),
    sec("s", "استایل", "style", [
      clr("ov", "رنگ لایه", { "{{WRAPPER}} .ew-cta-ov": "background-color:{{VALUE}};" }),
      slider("ovo", "شفافیت لایه", 0, 1, { "{{WRAPPER}} .ew-cta-ov": "opacity:{{VALUE}};" }, { step: 0.05, unit: "", default: 0.5 }),
      clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-cta-title": "color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-cta-title"),
      clr("dc", "رنگ توضیح", { "{{WRAPPER}} .ew-cta-desc": "color:{{VALUE}};" }),
      clr("bbg", "رنگ دکمه", { "{{WRAPPER}} .ew-cta .ew-btn": "background-color:{{VALUE}};" }),
      ...borderCtls("cta", "{{WRAPPER}} .ew-cta"),
    ]),
  ],
  render: ({ s }) => (
    <div className={`ew-cta is-${s.layout || "cover"}`} style={s.layout !== "split" ? { backgroundImage: `url("${resolveImg(s.image) || PLACEHOLDER}")` } : undefined}>
      {s.layout === "split" && <img className="ew-cta-img" src={resolveImg(s.image) || PLACEHOLDER} alt="" draggable={false} />}
      <div className="ew-cta-ov" />
      <div className="ew-cta-body">
        <h3 className="ew-cta-title">{s.title}</h3>
        <p className="ew-cta-desc">{s.desc}</p>
        {s.btn && (
          <a href={href(s.link) || "#"} className="ew-btn ew-btn--md">
            {s.btn}
          </a>
        )}
      </div>
    </div>
  ),
};

function MediaCarouselView({ s }: { s: Record<string, any> }) {
  const d = useDevice();
  const items: any[] = s.items ?? [];
  const per = Number(rv(s, "per", d, 3)) || 1;
  return (
    <Carousel
      perView={per}
      autoplay={!!s.autoplay}
      speed={Number(s.speed) || 4000}
      gap={Number(s.gap) || 0}
      items={items.map((it, i) => (
        <a key={i} href={href(it.link) || "#"} className="ew-mc-item">
          <img src={resolveImg(it.image) || PLACEHOLDER} alt="" draggable={false} />
          <span className="ew-mc-cap">{it.title}</span>
        </a>
      ))}
    />
  );
}

const mediaCarousel: WidgetDef = {
  type: "media-carousel",
  title: "کاروسل رسانه",
  icon: Images,
  category: "pro",
  keywords: "media carousel کاروسل رسانه",
  defaults: { per: 3, perTablet: 2, perMobile: 2, fit: "contain", autoplay: true, speed: 3800, gap: 14, items: LOOKS.slice(0, 5).map((l, i) => ({ image: `stock:look${i + 1}`, title: l.name, link: `/style/${l.id}` })) },
  sections: [
    sec("c", "آیتم‌ها", "content", [
      rep("items", "آیتم‌ها", [img("image"), txt("title", "عنوان"), url("link")], { image: "stock:look1", title: "آیتم", link: "" }),
      num("per", "تعداد نمایش", { responsive: true, min: 1, max: 6 }),
      sw("autoplay", "پخش خودکار"),
      num("speed", "سرعت", { min: 1200, step: 100 }),
      slider("gap", "فاصله", 0, 50),
    ]),
    sec("s", "استایل", "style", [
      sel("fit", "نحوهٔ نمایش تصویر", [["cover", "پوشش (Cover)"], ["contain", "کامل (Contain)"]], { selectors: { "{{WRAPPER}} .ew-mc-item img": "object-fit:{{VALUE}};" } }),
      sel("ratio", "نسبت تصویر", [["3/4", "۳:۴"], ["1/1", "۱:۱"], ["4/3", "۴:۳"]], { selectors: { "{{WRAPPER}} .ew-mc-item": "aspect-ratio:{{VALUE}};" } }),
      clr("bg", "پس‌زمینهٔ آیتم", { "{{WRAPPER}} .ew-mc-item": "background-color:{{VALUE}};" }),
      clr("cc", "رنگ عنوان", { "{{WRAPPER}} .ew-mc-cap": "color:{{VALUE}};" }),
      ...borderCtls("mc", "{{WRAPPER}} .ew-mc-item"),
    ]),
  ],
  render: ({ s }) => <MediaCarouselView s={s} />,
};

function TestimonialCarouselView({ s }: { s: Record<string, any> }) {
  const d = useDevice();
  const items: any[] = s.items ?? [];
  const per = Number(rv(s, "per", d, 1)) || 1;
  return (
    <Carousel
      perView={per}
      autoplay={!!s.autoplay}
      speed={Number(s.speed) || 5000}
      gap={Number(s.gap) || 0}
      items={items.map((t, i) => (
        <div key={i} className="ew-tm pos-top ew-tmc">
          <p className="ew-tm-content">{t.content}</p>
          <div className="ew-tm-meta">
            {t.image && <img className="ew-tm-img" src={resolveImg(t.image)} alt="" draggable={false} />}
            <div>
              <div className="ew-tm-name">{t.name}</div>
              <div className="ew-tm-job">{t.job}</div>
            </div>
          </div>
        </div>
      ))}
    />
  );
}

const testimonialCarousel: WidgetDef = {
  type: "testimonial-carousel",
  title: "کاروسل نظرات",
  icon: MessageSquareQuote,
  category: "pro",
  keywords: "testimonial carousel reviews نظرات",
  defaults: {
    per: 1,
    perTablet: 1,
    perMobile: 1,
    autoplay: true,
    speed: 5000,
    gap: 20,
    items: [
      { content: "پارچه و دوخت فوق‌العاده است. دقیقاً همان‌طور که روی رانو دیدم.", name: "آوا رادمهر", job: "طراح داخلی", image: "stock:campaign" },
      { content: "سایز رو راحت انتخاب کردم و ارسال خیلی سریع بود.", name: "سارا نیکخواه", job: "معمار", image: "" },
      { content: "کیف چرمی بعد از چند ماه هنوز مثل روز اول است.", name: "میلاد صالحی", job: "عکاس", image: "" },
    ],
  },
  sections: [
    sec("c", "نظرات", "content", [
      rep("items", "نظرات", [area("content", "متن"), txt("name", "نام"), txt("job", "شغل"), img("image")], { content: "نظر جدید", name: "نام", job: "", image: "" }, "name"),
      num("per", "تعداد نمایش", { responsive: true, min: 1, max: 4 }),
      sw("autoplay", "پخش خودکار"),
      num("speed", "سرعت", { min: 1500, step: 100 }),
      slider("gap", "فاصله", 0, 50),
    ]),
    sec("s", "استایل", "style", [
      clr("cc", "رنگ متن", { "{{WRAPPER}} .ew-tm-content": "color:{{VALUE}};" }),
      ...typo("c", "{{WRAPPER}} .ew-tm-content"),
      clr("nc", "رنگ نام", { "{{WRAPPER}} .ew-tm-name": "color:{{VALUE}};" }),
      clr("bg", "پس‌زمینهٔ کارت", { "{{WRAPPER}} .ew-tmc": "background-color:{{VALUE}};" }),
      ...borderCtls("tmc", "{{WRAPPER}} .ew-tmc"),
    ]),
  ],
  render: ({ s }) => <TestimonialCarouselView s={s} />,
};

function CountdownView({ s }: { s: Record<string, any> }) {
  const target = s.due ? new Date(s.due).getTime() : Date.now() + 5 * 86400000;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const diff = Math.max(0, target - now);
  if (diff === 0 && s.due) return <div className="ew-cd-done">{s.expired || "زمان به پایان رسید."}</div>;
  const parts = [
    { v: Math.floor(diff / 86400000), l: s.lDays || "روز", on: s.showDays !== false },
    { v: Math.floor(diff / 3600000) % 24, l: s.lHours || "ساعت", on: s.showHours !== false },
    { v: Math.floor(diff / 60000) % 60, l: s.lMins || "دقیقه", on: s.showMins !== false },
    { v: Math.floor(diff / 1000) % 60, l: s.lSecs || "ثانیه", on: s.showSecs !== false },
  ].filter((p) => p.on);
  return (
    <div className="ew-cd">
      {parts.map((p) => (
        <div key={p.l} className="ew-cd-box">
          <b>{faNum(String(p.v).padStart(2, "0"))}</b>
          <small>{p.l}</small>
        </div>
      ))}
    </div>
  );
}

const countdown: WidgetDef = {
  type: "countdown",
  title: "شمارش معکوس",
  icon: Timer,
  category: "pro",
  keywords: "countdown timer شمارش معکوس",
  defaults: { due: "", expired: "این پیشنهاد به پایان رسید.", showDays: true, showHours: true, showMins: true, showSecs: true, lDays: "روز", lHours: "ساعت", lMins: "دقیقه", lSecs: "ثانیه" },
  sections: [
    sec("c", "زمان", "content", [
      { key: "due", label: "تاریخ و ساعت پایان", type: "datetime", hint: "اگر خالی باشد، ۵ روز بعد." },
      sw("showDays", "روز", { default: true }),
      sw("showHours", "ساعت", { default: true }),
      sw("showMins", "دقیقه", { default: true }),
      sw("showSecs", "ثانیه", { default: true }),
      txt("lDays", "برچسب روز"),
      txt("lHours", "برچسب ساعت"),
      txt("lMins", "برچسب دقیقه"),
      txt("lSecs", "برچسب ثانیه"),
      txt("expired", "پیام پایان"),
      alignFlex("align", "{{WRAPPER}} .ew-cd"),
    ]),
    sec("s", "استایل", "style", [
      clr("bg", "پس‌زمینهٔ باکس", { "{{WRAPPER}} .ew-cd-box": "background-color:{{VALUE}};" }),
      clr("nc", "رنگ عدد", { "{{WRAPPER}} .ew-cd-box b": "color:{{VALUE}};" }),
      ...typo("n", "{{WRAPPER}} .ew-cd-box b"),
      clr("lc", "رنگ برچسب", { "{{WRAPPER}} .ew-cd-box small": "color:{{VALUE}};" }),
      slider("gap", "فاصله", 0, 40, { "{{WRAPPER}} .ew-cd": "gap:{{VALUE}}px;" }, { default: 12 }),
      dims("pad", "فاصلهٔ داخلی باکس", "{{WRAPPER}} .ew-cd-box", "padding"),
      ...borderCtls("cd", "{{WRAPPER}} .ew-cd-box"),
    ]),
  ],
  render: ({ s }) => <CountdownView s={s} />,
};

function ShareView({ s }: { s: Record<string, any> }) {
  const { notify } = useCart();
  const items: any[] = s.items ?? [];
  const link = typeof window !== "undefined" ? window.location.href : "";
  const make = (n: string) => {
    const u = encodeURIComponent(link);
    const t = encodeURIComponent(typeof document !== "undefined" ? document.title : "");
    switch (n) {
      case "telegram":
        return `https://t.me/share/url?url=${u}&text=${t}`;
      case "whatsapp":
        return `https://wa.me/?text=${t}%20${u}`;
      case "twitter":
        return `https://twitter.com/intent/tweet?url=${u}&text=${t}`;
      case "linkedin":
        return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
      case "email":
        return `mailto:?subject=${t}&body=${u}`;
      default:
        return "";
    }
  };
  return (
    <div className={`ew-share is-${s.skin || "framed"}`}>
      {items.map((it, i) => {
        const copy = it.network === "copy";
        const net = NETWORKS[it.network];
        return (
          <a
            key={i}
            className="ew-share-btn"
            href={copy ? "#" : make(it.network)}
            target={copy ? undefined : "_blank"}
            rel="noreferrer"
            onClick={(e) => {
              if (copy) {
                e.preventDefault();
                navigator.clipboard?.writeText(link).then(() => notify("لینک کپی شد"));
              }
            }}
          >
            {copy ? <Copy width={16} height={16} /> : <IconView name={net?.icon ?? "Share2"} size={16} />}
            {s.showText !== false && <span>{copy ? "کپی لینک" : net?.label}</span>}
          </a>
        );
      })}
    </div>
  );
}

const shareButtons: WidgetDef = {
  type: "share-buttons",
  title: "دکمه‌های اشتراک",
  icon: Share2,
  category: "pro",
  keywords: "share buttons اشتراک",
  defaults: { skin: "framed", showText: true, items: [{ network: "telegram" }, { network: "whatsapp" }, { network: "twitter" }, { network: "copy" }] },
  sections: [
    sec("c", "دکمه‌ها", "content", [
      rep("items", "شبکه‌ها", [sel("network", "شبکه", [["telegram", "تلگرام"], ["whatsapp", "واتساپ"], ["twitter", "ایکس"], ["linkedin", "لینکدین"], ["email", "ایمیل"], ["copy", "کپی لینک"]])], { network: "telegram" }, "network"),
      sel("skin", "سبک", [["framed", "قاب‌دار"], ["flat", "تخت"], ["minimal", "مینیمال"]]),
      sw("showText", "نمایش متن", { default: true }),
      alignFlex("align", "{{WRAPPER}} .ew-share"),
    ]),
    sec("s", "استایل", "style", [
      clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-share-btn": "background-color:{{VALUE}};" }),
      clr("c", "رنگ", { "{{WRAPPER}} .ew-share-btn": "color:{{VALUE}};" }),
      slider("gap", "فاصله", 0, 30, { "{{WRAPPER}} .ew-share": "gap:{{VALUE}}px;" }, { default: 8 }),
      ...borderCtls("sh", "{{WRAPPER}} .ew-share-btn"),
    ]),
  ],
  render: ({ s }) => <ShareView s={s} />,
};

const blockquote: WidgetDef = {
  type: "blockquote",
  title: "نقل‌قول",
  icon: Quote,
  category: "pro",
  keywords: "blockquote quote نقل قول",
  defaults: { content: "ما لباس نمی‌سازیم؛ تصمیم می‌گیریم پارچه کجای بدن بایستد.", author: "استودیوی طراحی ولور", align: "start" },
  sections: [
    sec("c", "محتوا", "content", [area("content", "متن", { rows: 4 }), txt("author", "گوینده"), alignText("align", "{{WRAPPER}} .ew-bq")]),
    sec("s", "استایل", "style", [
      clr("c", "رنگ متن", { "{{WRAPPER}} .ew-bq-text": "color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-bq-text"),
      clr("ac", "رنگ گوینده", { "{{WRAPPER}} .ew-bq-author": "color:{{VALUE}};" }),
      clr("bar", "رنگ خط کناری", { "{{WRAPPER}} .ew-bq": "border-color:{{VALUE}};" }),
      clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-bq": "background-color:{{VALUE}};" }),
      dims("pad", "فاصلهٔ داخلی", "{{WRAPPER}} .ew-bq", "padding"),
    ]),
  ],
  render: ({ s }) => (
    <blockquote className="ew-bq">
      <p className="ew-bq-text">{s.content}</p>
      {s.author && <cite className="ew-bq-author">— {s.author}</cite>}
    </blockquote>
  ),
};

function TrackerView({ s, editing }: { s: Record<string, any>; editing: boolean }) {
  const [p, setP] = useState(editing ? 38 : 0);
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
  return (
    <div className={`ew-tracker ${s.fixed && !editing ? "is-fixed" : ""}`}>
      <div className="ew-tracker-fill" style={{ width: `${p}%` }} />
    </div>
  );
}

const tracker: WidgetDef = {
  type: "progress-tracker",
  title: "ردیاب پیشرفت صفحه",
  icon: Gauge,
  category: "pro",
  keywords: "progress tracker scroll اسکرول",
  defaults: { fixed: true },
  sections: [
    sec("c", "ردیاب", "content", [sw("fixed", "ثابت در بالای صفحه", { default: true })]),
    sec("s", "استایل", "style", [
      slider("h", "ارتفاع", 2, 24, { "{{WRAPPER}} .ew-tracker": "height:{{VALUE}}px;" }, { default: 4 }),
      clr("fill", "رنگ نوار", { "{{WRAPPER}} .ew-tracker-fill": "background-color:{{VALUE}};" }),
      clr("track", "رنگ پس‌زمینه", { "{{WRAPPER}} .ew-tracker": "background-color:{{VALUE}};" }),
    ]),
  ],
  render: ({ s, editing }) => <TrackerView s={s} editing={editing} />,
};

function TocView({ s }: { s: Record<string, any> }) {
  const [heads, setHeads] = useState<{ id: string; text: string; lvl: number }[]>([]);
  useEffect(() => {
    const scan = () => {
      const sel = s.levels === "h2" ? "h2" : "h2,h3";
      const els = Array.from(document.querySelectorAll<HTMLElement>(`.eb-root .ew-heading`)).filter((e) => e.matches(sel));
      setHeads(
        els.map((e, i) => {
          if (!e.id) e.id = `toc-${i}`;
          return { id: e.id, text: e.innerText, lvl: e.tagName === "H3" ? 3 : 2 };
        }),
      );
    };
    scan();
    const t = window.setTimeout(scan, 700);
    return () => window.clearTimeout(t);
  }, [s.levels]);
  return (
    <div className="ew-toc">
      <div className="ew-toc-title">{s.title || "فهرست مطالب"}</div>
      <ol>
        {heads.length === 0 && <li className="ew-empty">عنوانی (H2/H3) در صفحه پیدا نشد.</li>}
        {heads.map((h) => (
          <li key={h.id} className={h.lvl === 3 ? "is-sub" : ""}>
            <a
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(h.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

const toc: WidgetDef = {
  type: "table-of-contents",
  title: "فهرست مطالب",
  icon: ListTree,
  category: "pro",
  keywords: "toc table of contents فهرست",
  defaults: { title: "فهرست مطالب", levels: "h2h3" },
  sections: [
    sec("c", "فهرست", "content", [txt("title", "عنوان"), sel("levels", "سطح عنوان‌ها", [["h2h3", "H2 و H3"], ["h2", "فقط H2"]])]),
    sec("s", "استایل", "style", [
      clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-toc": "background-color:{{VALUE}};" }),
      clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-toc-title": "color:{{VALUE}};" }),
      clr("lc", "رنگ لینک‌ها", { "{{WRAPPER}} .ew-toc a": "color:{{VALUE}};" }),
      ...borderCtls("toc", "{{WRAPPER}} .ew-toc"),
    ]),
  ],
  render: ({ s }) => <TocView s={s} />,
};

const template: WidgetDef = {
  type: "template",
  title: "قالب ذخیره‌شده",
  icon: LayoutTemplate,
  category: "pro",
  keywords: "template saved global قالب",
  defaults: { templateId: "" },
  sections: [sec("c", "قالب", "content", [{ key: "templateId", label: "انتخاب قالب (بخش ذخیره‌شده)", type: "select", options: [] }])],
  render: ({ s }) => {
    const doc = s.__doc as { content: any[] } | undefined;
    if (!s.templateId || !doc) return <div className="ew-empty">یک «بخش ذخیره‌شده» از پنل انتخاب کن (در داشبورد بخش جدید بساز).</div>;
    return <div className="ew-template">{hooks.renderNodes?.(doc.content)}</div>;
  },
};

/* ================================================================== */
/* SITE widgets                                                        */
/* ================================================================== */

const siteLogo: WidgetDef = {
  type: "site-logo",
  title: "لوگوی سایت",
  icon: Badge,
  category: "site",
  keywords: "logo لوگو",
  defaults: { text: "VELOURS", link: "/" },
  sections: [
    sec("c", "لوگو", "content", [txt("text", "متن لوگو"), img("image", "یا تصویر لوگو"), url("link"), alignFlex("align", "{{WRAPPER}} .ew-logo-wrap")]),
    sec("s", "استایل", "style", [
      clr("c", "رنگ", { "{{WRAPPER}} .ew-logo": "color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-logo"),
      slider("w", "عرض تصویر", 40, 400, { "{{WRAPPER}} .ew-logo img": "width:{{VALUE}}px;" }, { responsive: true }),
    ]),
  ],
  render: ({ s }) => (
    <div className="ew-logo-wrap">
      <a href={href(s.link) || "#/"} className="ew-logo latin-track">
        {s.image ? <img src={resolveImg(s.image)} alt={s.text || "لوگو"} draggable={false} /> : s.text}
      </a>
    </div>
  ),
};

const siteTitle: WidgetDef = {
  type: "site-title",
  title: "عنوان سایت",
  icon: Store,
  category: "site",
  keywords: "site title عنوان سایت",
  defaults: { text: "{{site-title}}", tag: "p" },
  sections: [
    sec("c", "عنوان", "content", [txt("text", "متن (پشتیبانی از {{site-title}})"), sel("tag", "تگ", [["h1", "H1"], ["h2", "H2"], ["p", "p"], ["div", "div"]]), alignText("align", "{{WRAPPER}} .ew-heading")]),
    sec("s", "استایل", "style", [clr("c", "رنگ", { "{{WRAPPER}} .ew-heading": "color:{{VALUE}};" }), ...typo("t", "{{WRAPPER}} .ew-heading")]),
  ],
  render: ({ s }) => {
    const Tag = (s.tag || "p") as "p";
    return <Tag className="ew-heading">{dyn(s.text)}</Tag>;
  },
};

const pageTitle: WidgetDef = {
  type: "page-title",
  title: "عنوان صفحه",
  icon: FolderOpen,
  category: "site",
  keywords: "page title عنوان صفحه",
  defaults: { tag: "h1" },
  sections: [
    sec("c", "عنوان", "content", [sel("tag", "تگ", [["h1", "H1"], ["h2", "H2"], ["div", "div"]]), alignText("align", "{{WRAPPER}} .ew-heading")]),
    sec("s", "استایل", "style", [clr("c", "رنگ", { "{{WRAPPER}} .ew-heading": "color:{{VALUE}};" }), ...typo("t", "{{WRAPPER}} .ew-heading")]),
  ],
  render: ({ s }) => {
    const Tag = (s.tag || "h1") as "h1";
    return <Tag className="ew-heading">{dyn("{{page-title}}")}</Tag>;
  },
};

const breadcrumbs: WidgetDef = {
  type: "breadcrumbs",
  title: "مسیر صفحه",
  icon: Footprints,
  category: "site",
  keywords: "breadcrumbs مسیر",
  defaults: { home: "خانه", sep: "/" },
  sections: [
    sec("c", "مسیر", "content", [txt("home", "برچسب خانه"), txt("sep", "جداکننده"), alignText("align", "{{WRAPPER}} .ew-bc")]),
    sec("s", "استایل", "style", [clr("c", "رنگ", { "{{WRAPPER}} .ew-bc": "color:{{VALUE}};" }), ...typo("t", "{{WRAPPER}} .ew-bc")]),
  ],
  render: ({ s }) => (
    <nav className="ew-bc" aria-label="مسیر">
      <a href="#/">
        <Home width={13} height={13} style={{ display: "inline", marginInlineEnd: 4 }} />
        {s.home}
      </a>
      <span> {s.sep} </span>
      <span>{dyn("{{page-title}}")}</span>
    </nav>
  ),
};

function SearchFormView({ s, editing }: { s: Record<string, any>; editing: boolean }) {
  const [q, setQ] = useState("");
  return (
    <form
      className="ew-search"
      onSubmit={(e) => {
        e.preventDefault();
        if (!editing && q.trim()) window.location.hash = `#/products?q=${encodeURIComponent(q.trim())}`;
      }}
    >
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={s.placeholder || "جست‌وجو در فروشگاه…"} aria-label="جست‌وجو" />
      <button type="submit" aria-label="جست‌وجو">
        <SearchIcon width={16} height={16} />
      </button>
    </form>
  );
}

const searchForm: WidgetDef = {
  type: "search-form",
  title: "فرم جست‌وجو",
  icon: TextCursorInput,
  category: "site",
  keywords: "search جست‌وجو",
  defaults: { placeholder: "جست‌وجو در فروشگاه…" },
  sections: [
    sec("c", "جست‌وجو", "content", [txt("placeholder", "متن راهنما")]),
    sec("s", "استایل", "style", [
      clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-search": "background-color:{{VALUE}};" }),
      clr("c", "رنگ متن", { "{{WRAPPER}} .ew-search input": "color:{{VALUE}};" }),
      clr("bc", "رنگ دکمه", { "{{WRAPPER}} .ew-search button": "background-color:{{VALUE}};" }),
      ...borderCtls("sr", "{{WRAPPER}} .ew-search"),
    ]),
  ],
  render: ({ s, editing }) => <SearchFormView s={s} editing={editing} />,
};

/* ================================================================== */
/* SHOP widgets                                                        */
/* ================================================================== */

const productOptions = CATALOG.map((p) => ({ value: p.id, label: p.name }));

function ProductsView({ s }: { s: Record<string, any> }) {
  const list = filterProducts({ collection: s.collection || "all", sort: s.order || "featured" }).slice(0, Number(s.count) || 4);
  if (!list.length) return <div className="ew-empty">محصولی با این فیلتر پیدا نشد.</div>;
  return (
    <div className="ew-products">
      {list.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

const products: WidgetDef = {
  type: "products",
  title: "محصولات",
  icon: ShoppingBag,
  category: "shop",
  keywords: "products shop grid محصولات فروشگاه",
  defaults: { collection: "all", count: 4, cols: 4, colsTablet: 2, colsMobile: 2, order: "featured" },
  presets: [
    preset("grid4", "چهار ستونه", { cols: 4, count: 4 }, "استاندارد"),
    preset("grid3", "سه ستونه", { cols: 3, count: 3 }, "بزرگ‌تر"),
    preset("newest", "جدیدترین", { order: "newest", count: 8 }, "تازه‌ها"),
    preset("cheap", "ارزان‌ترین", { order: "price-asc" }, "مرتب‌شده"),
  ],
  sections: [
    sec("c", "پرس‌وجو", "content", [
      sel("collection", "دسته", [["all", "همهٔ محصولات"], ...COLLECTIONS.map((c) => [c.id, c.label] as [string, string])]),
      sel("order", "مرتب‌سازی", [["featured", "پیشنهادی"], ["newest", "جدیدترین"], ["price-asc", "ارزان‌ترین"], ["price-desc", "گران‌ترین"]]),
      slider("count", "تعداد", 1, 12, undefined, { unit: "", default: 4 }),
      slider("cols", "ستون‌ها", 1, 6, { "{{WRAPPER}} .ew-products": "grid-template-columns:repeat({{VALUE}},minmax(0,1fr));" }, { unit: "", responsive: true, default: 4 }),
      slider("gap", "فاصله", 0, 50, { "{{WRAPPER}} .ew-products": "gap:{{VALUE}}px;" }, { default: 18 }),
    ]),
  ],
  render: ({ s }) => <ProductsView s={s} />,
};

const product: WidgetDef = {
  type: "product",
  title: "یک محصول",
  icon: Layers,
  category: "shop",
  keywords: "product single محصول",
  defaults: { productId: CATALOG[0]?.id ?? "" },
  sections: [
    sec("c", "محصول", "content", [{ key: "productId", label: "محصول", type: "select", options: productOptions }, slider("maxW", "حداکثر عرض", 160, 600, { "{{WRAPPER}} .ew-product": "max-width:{{VALUE}}px;" }, { default: 320 }), alignFlex("align", "{{WRAPPER}} .ew-product-wrap")]),
  ],
  render: ({ s }) => {
    const p = CATALOG.find((x) => x.id === s.productId) ?? CATALOG[0];
    if (!p) return <div className="ew-empty">محصولی انتخاب نشده.</div>;
    return (
      <div className="ew-product-wrap">
        <div className="ew-product">
          <ProductCard product={p} />
        </div>
      </div>
    );
  },
};

function AddToCartView({ s, editing }: { s: Record<string, any>; editing: boolean }) {
  const { add } = useCart();
  const p = CATALOG.find((x) => x.id === s.productId) ?? CATALOG[0];
  const click = (e: React.MouseEvent) => {
    e.preventDefault();
    if (editing || !p) return;
    for (const c of p.colors)
      for (const z of p.sizes)
        if (stockOf(p, c.id, z.id) > 0) {
          add([{ product: p, color: c, size: z, lookName: p.lookName }], { title: `${p.name} به سبد اضافه شد`, detail: `${c.name} · سایز ${z.label}` });
          return;
        }
  };
  const out = p ? totalStock(p) === 0 : true;
  return (
    <div className="ew-btn-wrap">
      <a href="#" onClick={click} className={`ew-btn ew-btn--${s.size || "md"} ${s.full ? "is-full" : ""}`} aria-disabled={out}>
        <IconView name="ShoppingBag" size={16} />
        {out ? "ناموجود" : `${s.text || "افزودن به سبد"} — ${p ? formatPrice(p.price) : ""}`}
      </a>
    </div>
  );
}

const addToCart: WidgetDef = {
  type: "add-to-cart",
  title: "افزودن به سبد",
  icon: CartIcon,
  category: "shop",
  keywords: "add to cart سبد خرید",
  defaults: { productId: CATALOG[0]?.id ?? "", text: "افزودن به سبد", size: "md" },
  sections: [
    sec("c", "دکمه", "content", [
      { key: "productId", label: "محصول", type: "select", options: productOptions },
      txt("text", "متن دکمه"),
      sel("size", "اندازه", [["sm", "کوچک"], ["md", "متوسط"], ["lg", "بزرگ"]]),
      sw("full", "تمام‌عرض"),
      alignFlex("align", "{{WRAPPER}} .ew-btn-wrap"),
    ]),
    sec("s", "استایل", "style", [
      clr("color", "رنگ متن", { "{{WRAPPER}} .ew-btn": "color:{{VALUE}};" }),
      clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-btn": "background-color:{{VALUE}};" }),
      ...borderCtls("a2c", "{{WRAPPER}} .ew-btn"),
    ]),
  ],
  render: ({ s, editing }) => <AddToCartView s={s} editing={editing} />,
};

function MenuCartView({ s }: { s: Record<string, any> }) {
  const { count, subtotal, setCartOpen } = useCart();
  return (
    <div className="ew-cart-wrap">
      <button type="button" className="ew-cart" aria-label="سبد خرید" onClick={() => setCartOpen(true)}>
        <IconView name="ShoppingBag" size={Number(s.size) || 20} />
        {s.showCount !== false && <span className="ew-cart-count">{faNum(count)}</span>}
        {s.showTotal && <span className="ew-cart-total">{formatPrice(subtotal)}</span>}
      </button>
    </div>
  );
}

const menuCart: WidgetDef = {
  type: "menu-cart",
  title: "آیکن سبد خرید",
  icon: Clock3,
  category: "shop",
  keywords: "menu cart سبد",
  defaults: { size: 20, showCount: true, showTotal: false },
  sections: [
    sec("c", "سبد", "content", [slider("size", "اندازهٔ آیکن", 14, 48, undefined, { default: 20 }), sw("showCount", "تعداد", { default: true }), sw("showTotal", "جمع مبلغ"), alignFlex("align", "{{WRAPPER}} .ew-cart-wrap")]),
    sec("s", "استایل", "style", [
      clr("c", "رنگ", { "{{WRAPPER}} .ew-cart": "color:{{VALUE}};" }),
      clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-cart": "background-color:{{VALUE}};" }),
      clr("bb", "رنگ نشان تعداد", { "{{WRAPPER}} .ew-cart-count": "background-color:{{VALUE}};" }),
      dims("pad", "فاصلهٔ داخلی", "{{WRAPPER}} .ew-cart", "padding"),
      ...borderCtls("cart", "{{WRAPPER}} .ew-cart"),
    ]),
  ],
  render: ({ s }) => <MenuCartView s={s} />,
};

const productCategories: WidgetDef = {
  type: "product-categories",
  title: "دسته‌بندی محصولات",
  icon: AlignLeft,
  category: "shop",
  keywords: "categories دسته بندی",
  defaults: { cols: 3, colsTablet: 2, colsMobile: 2, countLabel: true },
  sections: [
    sec("c", "دسته‌ها", "content", [
      slider("cols", "ستون‌ها", 1, 6, { "{{WRAPPER}} .ew-cats": "grid-template-columns:repeat({{VALUE}},minmax(0,1fr));" }, { unit: "", responsive: true, default: 3 }),
      slider("gap", "فاصله", 0, 40, { "{{WRAPPER}} .ew-cats": "gap:{{VALUE}}px;" }, { default: 14 }),
      sw("countLabel", "نمایش تعداد", { default: true }),
    ]),
    sec("s", "استایل", "style", [
      clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-cat-cap": "color:{{VALUE}};" }),
      clr("bg", "پس‌زمینهٔ کارت", { "{{WRAPPER}} .ew-cat": "background-color:{{VALUE}};" }),
      ...borderCtls("cat", "{{WRAPPER}} .ew-cat"),
    ]),
  ],
  render: ({ s }) => (
    <div className="ew-cats">
      {COLLECTIONS.map((c) => {
        const sample = productsInCollection(c.id)[0];
        return (
          <a key={c.id} href={`#/products?collection=${c.id}`} className="ew-cat">
            {sample && <ProductThumb product={sample} tileAspect={0.95} className="w-full rounded-none ring-0" />}
            <span className="ew-cat-cap">
              {c.label}
              {s.countLabel !== false && <small> · {faNum(productsInCollection(c.id).length)}</small>}
            </span>
          </a>
        );
      })}
    </div>
  ),
};

export const WIDGETS_B: WidgetDef[] = [
  posts,
  portfolio,
  slides,
  form,
  login,
  navMenu,
  animatedHeadline,
  priceList,
  priceTable,
  flipBox,
  cta,
  mediaCarousel,
  testimonialCarousel,
  countdown,
  shareButtons,
  blockquote,
  tracker,
  toc,
  template,
  siteLogo,
  siteTitle,
  pageTitle,
  breadcrumbs,
  searchForm,
  products,
  product,
  addToCart,
  menuCart,
  productCategories,
];

