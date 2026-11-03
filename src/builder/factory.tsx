import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  alignText,
  area,
  borderCtls,
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
  preset,
  type Ctl,
  type CtlSection,
  type Preset,
  type Settings,
  type WidgetCategory,
  type WidgetDef,
} from "./core";
import { rv, useDevice } from "./ctx";
import { Carousel, IconView, faNum, useInView } from "./kit";
import { PLACEHOLDER, resolveImg } from "./stock";

/* ------------------------------------------------------------------ */
/* animation helper                                                    */
/* ------------------------------------------------------------------ */

function CountTo({ end }: { end: number }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!seen) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 1400);
      setV(end * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, end]);
  return <span ref={ref}>{faNum(Math.round(v))}</span>;
}

/* ------------------------------------------------------------------ */
/* card list factory                                                   */
/* ------------------------------------------------------------------ */

export type CardVariant =
  | "team"
  | "post"
  | "logo"
  | "icon"
  | "stat"
  | "overlay"
  | "price"
  | "step"
  | "profile"
  | "plain";

export interface CardSpec {
  type: string;
  title: string;
  icon: LucideIcon;
  category: WidgetCategory;
  variant: CardVariant;
  keywords?: string;
  defaults?: Settings;
  items: Settings[];
  itemFields: Ctl[];
  itemLabel?: string;
  layouts?: ("grid" | "carousel" | "list")[];
  presets?: Preset[];
  extraSections?: CtlSection[];
  bare?: boolean;
}

const VARIANT_FIELDS: Record<CardVariant, Ctl[]> = {
  team: [img("image"), txt("name", "نام"), txt("role", "نقش"), area("desc", "توضیح"), url("link"), icn("icon", "آیکن")],
  post: [img("image"), txt("meta", "متا (تاریخ/دسته)"), txt("title", "عنوان"), area("excerpt", "خلاصه"), txt("more", "متن ادامه"), url("link")],
  logo: [img("image"), txt("title", "نام برند"), url("link")],
  icon: [icn("icon"), txt("title", "عنوان"), area("desc", "توضیح"), url("link")],
  stat: [num("value", "مقدار"), txt("suffix", "پسوند"), txt("title", "عنوان"), area("desc", "توضیح")],
  overlay: [img("image"), txt("title", "عنوان"), txt("sub", "زیرعنوان"), url("link")],
  price: [txt("title", "عنوان"), txt("price", "قیمت"), area("desc", "توضیح"), img("image"), url("link")],
  step: [txt("badge", "شماره/برچسب"), icn("icon"), txt("title", "عنوان"), area("desc", "توضیح")],
  profile: [img("image", "تصویر"), txt("name", "نام"), txt("role", "نقش"), area("desc", "بیوگرافی"), txt("linkText", "متن دکمه"), url("link")],
  plain: [txt("title", "عنوان"), area("desc", "توضیح"), txt("linkText", "متن لینک"), url("link")],
};

function cardBody(v: CardVariant, it: Settings, s: Settings): ReactNode {
  const raw = String(it.link ?? "");
  const href = raw ? (raw.startsWith("/") ? `#${raw}` : raw) : "";
  const link = href ? (
    <a className="ew-card-more" href={href} target={raw.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
      {it.more || it.linkText || "بیشتر"} ←
    </a>
  ) : null;

  switch (v) {
    case "team":
      return (
        <>
          {it.image ? (
            <div className="ew-card-img is-cover">
              <img src={resolveImg(it.image) || PLACEHOLDER} alt={it.name || ""} loading="lazy" draggable={false} />
            </div>
          ) : null}
          <div className="ew-card-body">
            {it.icon ? (
              <span className="ew-card-ic">
                <IconView name={it.icon} size={18} />
              </span>
            ) : null}
            <h4 className="ew-card-title">{it.name}</h4>
            {it.role ? <p className="ew-card-role">{it.role}</p> : null}
            {it.desc ? <p className="ew-card-desc">{it.desc}</p> : null}
          </div>
        </>
      );
    case "post":
      return (
        <>
          <div className="ew-card-img is-cover">
            <img src={resolveImg(it.image) || PLACEHOLDER} alt="" loading="lazy" draggable={false} />
          </div>
          <div className="ew-card-body">
            {it.meta ? <p className="ew-card-meta">{it.meta}</p> : null}
            <h4 className="ew-card-title">{it.title}</h4>
            {it.excerpt ? <p className="ew-card-desc">{it.excerpt}</p> : null}
            {link}
          </div>
        </>
      );
    case "logo":
      return (
        <div className="ew-card-logo">
          <img src={resolveImg(it.image) || PLACEHOLDER} alt={it.title || ""} loading="lazy" draggable={false} />
        </div>
      );
    case "icon":
      return (
        <div className="ew-card-body">
          {it.icon ? (
            <span className="ew-card-ic">
              <IconView name={it.icon} size={Number(s.iconSize) || 28} />
            </span>
          ) : null}
          <h4 className="ew-card-title">{it.title}</h4>
          {it.desc ? <p className="ew-card-desc">{it.desc}</p> : null}
          {link}
        </div>
      );
    case "stat":
      return (
        <div className="ew-card-body is-center">
          <div className="ew-card-num">
            <CountTo end={Number(it.value) || 0} />
            {it.suffix}
          </div>
          <h4 className="ew-card-title">{it.title}</h4>
          {it.desc ? <p className="ew-card-desc">{it.desc}</p> : null}
        </div>
      );
    case "overlay":
      return (
        <div className="ew-card-overlay" style={{ backgroundImage: `url("${resolveImg(it.image) || PLACEHOLDER}")` }}>
          <div className="ew-card-cap">
            <b>{it.title}</b>
            {it.sub ? <small>{it.sub}</small> : null}
          </div>
        </div>
      );
    case "price":
      return (
        <>
          {it.image ? (
            <div className="ew-card-img is-cover">
              <img src={resolveImg(it.image) || PLACEHOLDER} alt="" loading="lazy" draggable={false} />
            </div>
          ) : null}
          <div className="ew-card-body">
            <div className="ew-card-head">
              <h4 className="ew-card-title">{it.title}</h4>
              <span className="ew-card-price">{it.price}</span>
            </div>
            {it.desc ? <p className="ew-card-desc">{it.desc}</p> : null}
          </div>
        </>
      );
    case "step":
      return (
        <div className="ew-card-body is-step">
          <span className="ew-card-badge">{it.icon ? <IconView name={it.icon} size={16} /> : it.badge}</span>
          <h4 className="ew-card-title">{it.title}</h4>
          {it.desc ? <p className="ew-card-desc">{it.desc}</p> : null}
        </div>
      );
    case "profile":
      return (
        <>
          <div className="ew-card-avatar">
            <img src={resolveImg(it.image) || PLACEHOLDER} alt={it.name || ""} loading="lazy" draggable={false} />
          </div>
          <div className="ew-card-body">
            <h4 className="ew-card-title">{it.name}</h4>
            {it.role ? <p className="ew-card-role">{it.role}</p> : null}
            {it.desc ? <p className="ew-card-desc">{it.desc}</p> : null}
            {link}
          </div>
        </>
      );
    default:
      return (
        <div className="ew-card-body">
          <h4 className="ew-card-title">{it.title}</h4>
          {it.desc ? <p className="ew-card-desc">{it.desc}</p> : null}
          {link}
        </div>
      );
  }
}

function CardListView({ s, variant }: { s: Settings; variant: CardVariant }) {
  const d = useDevice();
  const items: Settings[] = Array.isArray(s.items) ? s.items : [];
  const layout = s.layout || "grid";
  const per = Number(rv(s, "per", d, 3)) || 3;

  const card = (it: Settings, i: number) => (
    <article key={i} className={`ew-card v-${variant} ${s.hoverLift !== false ? "is-lift" : ""}`}>
      {cardBody(variant, it, s)}
    </article>
  );

  if (!items.length) return <div className="ew-empty">آیتمی اضافه نشده — از پنل «محتوا» آیتم اضافه کن.</div>;

  if (layout === "carousel")
    return (
      <Carousel
        perView={per}
        autoplay={!!s.autoplay}
        speed={Number(s.speed) || 4000}
        arrows={s.arrows !== false}
        dots={s.dots !== false}
        gap={Number(s.gap) || 16}
        items={items.map(card)}
      />
    );

  if (layout === "list") return <div className="ew-cards is-list">{items.map(card)}</div>;

  return (
    <div className="ew-cards is-grid" style={{ ["--ew-cols" as string]: String(rv(s, "cols", d, 3)) }}>
      {items.map(card)}
    </div>
  );
}

/** Builds a fully-styled repeater widget (grid / carousel / list). */
export function makeCardWidget(spec: CardSpec): WidgetDef {
  const layouts = spec.layouts ?? ["grid", "carousel", "list"];
  const fields = [...(VARIANT_FIELDS[spec.variant] ?? []), ...spec.itemFields];

  const content: CtlSection = sec("c", "محتوا", "content", [
    rep("items", "آیتم‌ها", fields, spec.items[0] ?? {}, spec.itemLabel ?? (spec.variant === "team" ? "name" : "title")),
    ...(layouts.length > 1
      ? [sel("layout", "چیدمان", layouts.map((l) => [l, l === "grid" ? "گرید" : l === "carousel" ? "کاروسل" : "لیست"] as [string, string]))]
      : []),
    ...(layouts.includes("grid") ? [num("cols", "ستون‌ها", { responsive: true, min: 1, max: 6 })] : []),
    ...(layouts.includes("carousel")
      ? [
          num("per", "تعداد در اسلاید", { responsive: true, min: 1, max: 6 }),
          sw("autoplay", "پخش خودکار"),
          num("speed", "سرعت (ms)", { min: 1200, step: 100 }),
          sw("arrows", "فلش‌ها", { default: true }),
          sw("dots", "نقطه‌ها", { default: true }),
        ]
      : []),
    ...(spec.bare ? [] : [slider("gap", "فاصله", 0, 60, undefined, { unit: "px" }), sw("hoverLift", "بالا آمدن در هاور", { default: true })]),
  ]);

  const style: CtlSection[] = spec.bare
    ? []
    : [
        sec("s", "استایل کارت", "style", [
          clr("bg", "پس‌زمینهٔ کارت", { "{{WRAPPER}} .ew-card": "background-color:{{VALUE}};" }),
          dims("pad", "فاصلهٔ داخلی کارت", "{{WRAPPER}} .ew-card-body", "padding"),
          ...borderCtls("card", "{{WRAPPER}} .ew-card"),
          num("iconSize", "اندازهٔ آیکن", { selectors: { "{{WRAPPER}} .ew-card-ic svg": "width:{{VALUE}}px;height:{{VALUE}}px;" } }),
          clr("icColor", "رنگ آیکن", { "{{WRAPPER}} .ew-card-ic": "color:{{VALUE}};" }),
          clr("icBg", "پس‌زمینهٔ آیکن", { "{{WRAPPER}} .ew-card-ic": "background-color:{{VALUE}};" }),
          dims("icRadius", "گردی آیکن", "{{WRAPPER}} .ew-card-ic", "border-radius"),
          hd("عنوان"),
          clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-card-title": "color:{{VALUE}};" }),
          ...typo("t", "{{WRAPPER}} .ew-card-title"),
          hd("متن"),
          clr("dc", "رنگ توضیح", { "{{WRAPPER}} .ew-card-desc": "color:{{VALUE}};" }),
          ...typo("d", "{{WRAPPER}} .ew-card-desc"),
          hd("قیمت / عدد"),
          clr("pc", "رنگ قیمت", { "{{WRAPPER}} .ew-card-price,{{WRAPPER}} .ew-card-num": "color:{{VALUE}};" }),
          ...typo("p", "{{WRAPPER}} .ew-card-price,{{WRAPPER}} .ew-card-num"),
        ]),
      ];

  return {
    type: spec.type,
    title: spec.title,
    icon: spec.icon,
    category: spec.category,
    keywords: spec.keywords,
    presets: spec.presets,
    defaults: {
      layout: layouts[0],
      cols: 3,
      colsTablet: 2,
      colsMobile: 1,
      per: 3,
      perTablet: 2,
      perMobile: 1,
      gap: 16,
      hoverLift: true,
      /** seed content so a freshly dropped widget is never empty */
      items: JSON.parse(JSON.stringify(spec.items)),
      ...spec.defaults,
    },
    sections: [content, ...style, ...(spec.extraSections ?? [])],
    render: ({ s }) => <CardListView s={s} variant={spec.variant} />,
  };
}

/* ------------------------------------------------------------------ */
/* shared control helpers                                              */
/* ------------------------------------------------------------------ */

export const gridCtl = (def = 3): Ctl => num("cols", "ستون‌ها", { responsive: true, min: 1, max: 8, default: def });
export const gapCtl = (def = 16): Ctl => slider("gap", "فاصله", 0, 60, undefined, { unit: "px", default: def });
export const headingBlock = (p = "hd"): CtlSection =>
  sec(p, "عنوان و توضیح", "content", [
    txt("title", "عنوان"),
    area("desc", "توضیح"),
    txt("badge", "برچسب بالای عنوان"),
    txt("moreText", "متن لینک"),
    url("moreLink"),
    alignText("align", "{{WRAPPER}} .ew-hd"),
  ]);

/** Common ready-made presets reused across list widgets. */
export const P = {
  grid3: (extra: Settings = {}): Preset => preset("grid3", "گرید سه‌تایی", { layout: "grid", cols: 3, gap: 20, ...extra }, "کلاسیک و همیشه‌جواب‌دهنده"),
  grid2: (extra: Settings = {}): Preset => preset("grid2", "دو ستونه بزرگ", { layout: "grid", cols: 2, gap: 28, ...extra }, "تصاویر بزرگ‌تر، مناسب نمونه‌کار"),
  grid4: (extra: Settings = {}): Preset => preset("grid4", "چهار ستونه فشرده", { layout: "grid", cols: 4, gap: 14, ...extra }, "چگالی بالا برای کاتالوگ"),
  carousel: (extra: Settings = {}): Preset => preset("carousel", "کاروسل خودکار", { layout: "carousel", per: 3, autoplay: true, speed: 3800, gap: 18, ...extra }, "حرکت مداوم برای جلب توجه"),
  list: (extra: Settings = {}): Preset => preset("list", "لیست عمودی", { layout: "list", gap: 10, ...extra }, "خوانایی بالا، موبایل‌پسند"),
  dark: (extra: Settings = {}): Preset => preset("dark", "کارت تیره لوکس", { bgColor: "#16130f", tc: "#f7f3ed", dc: "rgba(247,243,237,.66)", icColor: "#e5c158", ...extra }, "حس شب و لوکس"),
  soft: (extra: Settings = {}): Preset => preset("soft", "کارت نرم", { bgColor: "#f7f3ed", cardRadius: { top: 22, right: 22, bottom: 22, left: 22, linked: true }, ...extra }, "گرد و آرام"),
  glass: (extra: Settings = {}): Preset =>
    preset("glass", "شیشه‌ای", { bgColor: "rgba(255,255,255,.62)", cardRadius: { top: 24, right: 24, bottom: 24, left: 24, linked: true }, cardShadow: { x: 0, y: 22, blur: 44, spread: -14, color: "rgba(100,60,160,.22)" }, ...extra }, "ترند گلس‌مورفیسم"),
  brutal: (extra: Settings = {}): Preset =>
    preset("brutal", "نیوبروتال", { bgColor: "#fff8d6", cardBorderStyle: "solid", cardBorderWidth: { top: 2, right: 2, bottom: 2, left: 2, linked: true }, cardBorderColor: "#0a0a0a", cardRadius: { top: 10, right: 10, bottom: 10, left: 10, linked: true }, cardShadow: { x: 5, y: 5, blur: 0, spread: 0, color: "#0a0a0a" }, ...extra }, "خط ضخیم و سایهٔ صلب"),
  bento: (extra: Settings = {}): Preset => preset("bento", "بنتو گرید", { layout: "grid", cols: 4, colsTablet: 2, colsMobile: 1, gap: 12, bgColor: "#f1ebe2", ...extra }, "شبکهٔ ترند ۲۰۲۵"),
  minimal: (extra: Settings = {}): Preset => preset("minimal", "مینیمال بدون قاب", { bgColor: "transparent", cardBorderStyle: "none", hoverLift: false, ...extra }, "فقط محتوا"),
  outline: (extra: Settings = {}): Preset => preset("outline", "خط‌کشی‌شده", { bgColor: "transparent", cardBorderStyle: "solid", cardBorderWidth: { top: 1, right: 1, bottom: 1, left: 1, linked: true }, cardBorderColor: "rgba(0,0,0,.12)", ...extra }, "سبک سوئیسی"),
};
