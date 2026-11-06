import { useEffect, useState } from "react";
import {
  AlertCircle,
  Anchor,
  BarChart3,
  Code2,
  GalleryHorizontal,
  Heading1,
  Hash,
  Images,
  LayoutGrid,
  List,
  Map as MapIcon,
  MousePointerClick,
  Minus,
  MoveVertical,
  PanelTop,
  PlayCircle,
  Quote,
  Rows3,
  Share2,
  Smile,
  Star,
  ToggleLeft,
  Type,
  Image as ImageLucide,
  ChevronDown,
  Plus,
  X,
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
  rich,
  sec,
  sel,
  shadowCtl,
  slider,
  sw,
  txt,
  typo,
  url,
  type WidgetDef,
  preset,
} from "./core";
import { dyn, href, rv, useDevice } from "./ctx";
import { Carousel, Editable, IconView, faNum, useInView } from "./kit";
import { PLACEHOLDER, resolveImg } from "./stock";

/* ================================================================== */
/* BASIC                                                               */
/* ================================================================== */

const heading: WidgetDef = {
  type: "heading",
  title: "عنوان",
  icon: Heading1,
  category: "basic",
  keywords: "heading title h1 تیتر",
  defaults: { title: "عنوان جذاب خود را اینجا بنویسید", tag: "h2" },
  presets: [
    preset("h1", "تیتر بزرگ", { tag: "h1", tSize: 52, tSizeMobile: 30, tWeight: "600" }, "هرو مدرن"),
    preset("serif", "سریف ادیتوریال", { tag: "h2", tSize: 40, tFont: "\"Instrument Serif\", serif", tWeight: "400" }, "حس مجلهٔ مد"),
    preset("badge", "با خط زیرین", { tag: "h2", tSize: 34, showLine: true }, "خط تزئینی"),
    preset("outline", "متن خط‌خورده", { tag: "h2", tSize: 46, tTransform: "uppercase", tStyle: "italic" }, "جسورانه"),
    preset("small", "کوچک و ظریف", { tag: "h4", tSize: 18, tWeight: "400", tTransform: "uppercase", tSpacing: 4 }, "برچسب سر بخش"),
  ],
  sections: [
    sec("c", "محتوا", "content", [
      area("title", "عنوان", { rows: 2 }),
      url("link"),
      sel("tag", "تگ HTML", [["h1", "H1"], ["h2", "H2"], ["h3", "H3"], ["h4", "H4"], ["h5", "H5"], ["h6", "H6"], ["div", "div"], ["p", "p"], ["span", "span"]]),
      alignText("align", "{{WRAPPER}}"),
    ]),
    sec("s", "استایل", "style", [
      clr("color", "رنگ متن", { "{{WRAPPER}} .ew-heading,{{WRAPPER}} .ew-heading a": "color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-heading"),
      shadowCtl("tshadow", "سایهٔ متن", "{{WRAPPER}} .ew-heading", "text-shadow"),
      sel("blend", "حالت ترکیب (Blend)", [["", "عادی"], ["difference", "Difference"], ["multiply", "Multiply"], ["overlay", "Overlay"]], { selectors: { "{{WRAPPER}} .ew-heading": "mix-blend-mode:{{VALUE}};" } }),
    ]),
  ],
  render: ({ s, selected, commit }) => {
    const Tag = (s.tag || "h2") as "h2";
    const text = dyn(s.title);
    const inner = s.link ? (
      <a href={href(s.link)}>{text}</a>
    ) : (
      <Editable value={s.title ?? ""} active={selected} onCommit={(v) => commit?.("title", v)} />
    );
    return <Tag className="ew-heading">{s.link ? inner : selected ? inner : text}</Tag>;
  },
};

const image: WidgetDef = {
  type: "image",
  title: "تصویر",
  icon: ImageLucide,
  category: "basic",
  keywords: "image photo عکس",
  defaults: { image: "stock:hero", alt: "تصویر" },
  presets: [
    preset("full", "تمام‌عرض", { width: 100, radiusBorderRadius: undefined, imgRadius: { top: 0, right: 0, bottom: 0, left: 0, linked: true } }, "بدون گردی"),
    preset("round", "گوشه‌گرد", { imgRadius: { top: 24, right: 24, bottom: 24, left: 24, linked: true } }, "نرم"),
    preset("gray", "سیاه‌وسفید", { filter: "grayscale(1)" }, "مینیمال"),
    preset("sepia", "سپیا", { filter: "sepia(.6)" }, "کلاسیک"),
  ],
  sections: [
    sec("c", "محتوا", "content", [
      img("image"),
      txt("alt", "متن جایگزین (Alt)"),
      txt("caption", "عنوان زیر تصویر"),
      url("link"),
      alignText("align", "{{WRAPPER}} .ew-image"),
    ]),
    sec("s", "استایل", "style", [
      slider("width", "عرض", 5, 100, { "{{WRAPPER}} .ew-image img": "width:{{VALUE}}%;" }, { unit: "%", responsive: true }),
      slider("maxWidth", "حداکثر عرض", 20, 1400, { "{{WRAPPER}} .ew-image img": "max-width:{{VALUE}}px;" }, { responsive: true }),
      slider("height", "ارتفاع", 40, 1000, { "{{WRAPPER}} .ew-image img": "height:{{VALUE}}px;object-fit:cover;" }, { responsive: true }),
      sel("fit", "نحوهٔ پوشش", [["", "پیش‌فرض"], ["cover", "Cover"], ["contain", "Contain"], ["fill", "Fill"]], { selectors: { "{{WRAPPER}} .ew-image img": "object-fit:{{VALUE}};" } }),
      slider("imgOpacity", "شفافیت", 0, 1, { "{{WRAPPER}} .ew-image img": "opacity:{{VALUE}};" }, { step: 0.05, unit: "" }),
      sel("filter", "فیلتر", [["", "هیچ"], ["grayscale(1)", "سیاه‌وسفید"], ["sepia(.6)", "سپیا"], ["saturate(1.6)", "پررنگ"], ["blur(2px)", "محو"]], { selectors: { "{{WRAPPER}} .ew-image img": "filter:{{VALUE}};" } }),
      sel("hoverZoom", "افکت هاور", [["", "هیچ"], ["scale(1.06)", "بزرگ‌نمایی"], ["scale(1.06) rotate(1deg)", "بزرگ‌نمایی و چرخش"]], { selectors: { "{{WRAPPER}} .ew-image img:hover": "transform:{{VALUE}};" } }),
      ...borderCtls("img", "{{WRAPPER}} .ew-image img"),
      clr("capColor", "رنگ عنوان تصویر", { "{{WRAPPER}} .ew-caption": "color:{{VALUE}};" }),
      ...typo("cap", "{{WRAPPER}} .ew-caption"),
    ]),
  ],
  render: ({ s }) => {
    const pic = <img src={resolveImg(s.image) || PLACEHOLDER} alt={s.alt || ""} draggable={false} />;
    return (
      <figure className="ew-image">
        {s.link ? <a href={href(s.link)}>{pic}</a> : pic}
        {s.caption && <figcaption className="ew-caption">{s.caption}</figcaption>}
      </figure>
    );
  },
};

const textEditor: WidgetDef = {
  type: "text-editor",
  title: "ویرایشگر متن",
  icon: Type,
  category: "basic",
  keywords: "text paragraph متن پاراگراف",
  defaults: {
    content:
      "<p>اینجا متن شماست. روی آن دوبار کلیک کن تا مستقیم روی صفحه ویرایش شود؛ یا از ویرایشگر پنل سمت راست استفاده کن. می‌توانی <b>پررنگ</b>، <i>کج</i> و <a href='#/products'>لینک</a> بگذاری.</p>",
    columns: 1,
  },
  sections: [
    sec("c", "محتوا", "content", [
      rich("content", "متن"),
      sel("columns", "ستون‌های متن", [["1", "۱"], ["2", "۲"], ["3", "۳"]], { selectors: { "{{WRAPPER}} .ew-text": "column-count:{{VALUE}};column-gap:32px;" } }),
      alignText("align", "{{WRAPPER}} .ew-text", "تراز", true),
    ]),
    sec("s", "استایل", "style", [
      clr("color", "رنگ متن", { "{{WRAPPER}} .ew-text": "color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-text"),
      sw("dropcap", "حرف اول بزرگ (Drop Cap)"),
    ]),
  ],
  render: ({ s, selected, commit }) => (
    <Editable
      as="div"
      html
      className={`ew-text ${s.dropcap ? "has-dropcap" : ""}`}
      value={typeof s.content === "string" ? dyn(s.content) : ""}
      active={selected}
      onCommit={(v) => commit?.("content", v)}
    />
  ),
};

function videoSrc(s: Record<string, any>): string {
  const u = String(s.url ?? "");
  const yt = u.match(/(?:youtu\.be\/|v=|embed\/)([\w-]{6,})/);
  const vm = u.match(/vimeo\.com\/(\d+)/);
  const q = new URLSearchParams();
  if (s.mute) q.set("mute", "1");
  if (s.loop) q.set("loop", "1");
  if (!s.controls) q.set("controls", "0");
  q.set("autoplay", "1");
  if (s.source === "vimeo" && vm) return `https://player.vimeo.com/video/${vm[1]}?${q}`;
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?${q}`;
  return "";
}

function VideoView({ s }: { s: Record<string, any> }) {
  const [play, setPlay] = useState(!s.overlay);
  useEffect(() => setPlay(!s.overlay), [s.overlay]);
  const src = videoSrc(s);
  return (
    <div className="ew-video">
      {s.source === "file" ? (
        <video src={s.url} controls={!!s.controls} muted={!!s.mute} loop={!!s.loop} poster={resolveImg(s.overlay)} playsInline />
      ) : play && src ? (
        <iframe src={src} title="ویدیو" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
      ) : (
        <button type="button" className="ew-video-overlay" onClick={() => setPlay(true)} style={{ backgroundImage: s.overlay ? `url("${resolveImg(s.overlay)}")` : undefined }} aria-label="پخش ویدیو">
          <span className="ew-play">
            <PlayCircle width={54} height={54} />
          </span>
          {!src && <span className="ew-video-hint">لینک یوتیوب یا ویمئو را وارد کن</span>}
        </button>
      )}
    </div>
  );
}

const video: WidgetDef = {
  type: "video",
  title: "ویدیو",
  icon: PlayCircle,
  category: "basic",
  keywords: "video youtube vimeo ویدیو",
  defaults: { source: "youtube", url: "https://www.youtube.com/watch?v=ysz5S6PUM-U", aspect: "16/9", controls: true, overlay: "stock:campaign" },
  sections: [
    sec("c", "ویدیو", "content", [
      sel("source", "منبع", [["youtube", "یوتیوب"], ["vimeo", "ویمئو"], ["file", "فایل (MP4)"]]),
      url("url", "لینک ویدیو"),
      img("overlay", "تصویر پوشش (Image Overlay)"),
      sw("mute", "بی‌صدا"),
      sw("loop", "تکرار"),
      sw("controls", "نمایش کنترل‌ها"),
    ]),
    sec("s", "استایل", "style", [
      sel("aspect", "نسبت تصویر", [["16/9", "۱۶:۹"], ["4/3", "۴:۳"], ["1/1", "۱:۱"], ["21/9", "۲۱:۹"], ["9/16", "۹:۱۶"]], { selectors: { "{{WRAPPER}} .ew-video": "aspect-ratio:{{VALUE}};" } }),
      ...borderCtls("vid", "{{WRAPPER}} .ew-video"),
    ]),
  ],
  render: ({ s }) => <VideoView s={s} />,
};

const button: WidgetDef = {
  type: "button",
  title: "دکمه",
  icon: MousePointerClick,
  category: "basic",
  keywords: "button cta دکمه",
  defaults: { text: "همین حالا بخر", link: "/products", size: "md", btype: "", iconPos: "after" },
  presets: [
    preset("solid", "توپر", { size: "md" }, "کلاسیک"),
    preset("lg", "بزرگ", { size: "lg", tSize: 17 }, "هرو"),
    preset("outline", "توخالی", { btype: "outline", size: "md" }, "ملایم"),
    preset("ghost", "شفاف", { btype: "ghost", size: "sm" }, "مینیمال"),
    preset("full", "تمام‌عرض", { size: "lg", full: true }, "موبایل‌پسند"),
  ],
  sections: [
    sec("c", "دکمه", "content", [
      txt("text", "متن دکمه"),
      url("link"),
      sel("btype", "نوع", [["", "پیش‌فرض"], ["info", "اطلاعات"], ["success", "موفقیت"], ["warning", "هشدار"], ["danger", "خطر"], ["outline", "توخالی"], ["ghost", "شفاف"]]),
      sel("size", "اندازه", [["xs", "خیلی کوچک"], ["sm", "کوچک"], ["md", "متوسط"], ["lg", "بزرگ"], ["xl", "خیلی بزرگ"]]),
      icn("icon", "آیکن"),
      sel("iconPos", "جای آیکن", [["before", "قبل از متن"], ["after", "بعد از متن"]], { show: (s) => !!s.icon }),
      slider("iconGap", "فاصلهٔ آیکن", 0, 30, { "{{WRAPPER}} .ew-btn": "gap:{{VALUE}}px;" }, { show: (s) => !!s.icon }),
      alignFlex("align", "{{WRAPPER}} .ew-btn-wrap"),
      sw("full", "تمام‌عرض"),
    ]),
    sec("s", "استایل", "style", [
      ...typo("t", "{{WRAPPER}} .ew-btn"),
      clr("color", "رنگ متن", { "{{WRAPPER}} .ew-btn": "color:{{VALUE}};" }),
      clr("bg", "رنگ پس‌زمینه", { "{{WRAPPER}} .ew-btn": "background-color:{{VALUE}};" }),
      clr("colorH", "رنگ متن (هاور)", { "{{WRAPPER}} .ew-btn:hover": "color:{{VALUE}};" }),
      clr("bgH", "پس‌زمینه (هاور)", { "{{WRAPPER}} .ew-btn:hover": "background-color:{{VALUE}};" }),
      ...borderCtls("btn", "{{WRAPPER}} .ew-btn", true),
      dims("btnPadding", "فاصلهٔ داخلی", "{{WRAPPER}} .ew-btn", "padding"),
    ]),
  ],
  render: ({ s, selected, commit }) => {
    const ic = s.icon ? <IconView name={s.icon} size={16} /> : null;
    const content = (
      <>
        {s.iconPos === "before" && ic}
        <Editable value={dyn(s.text ?? "")} active={selected && !s.link} onCommit={(v) => commit?.("text", v)} />
        {s.iconPos !== "before" && ic}
      </>
    );
    return (
      <div className="ew-btn-wrap">
        <a href={href(s.link) || "#"} className={`ew-btn ew-btn--${s.size || "md"} ${s.btype ? `ew-btn--${s.btype}` : ""} ${s.full ? "is-full" : ""}`}>
          {content}
        </a>
      </div>
    );
  },
};

const divider: WidgetDef = {
  type: "divider",
  title: "جداکننده",
  icon: Minus,
  category: "basic",
  keywords: "divider line جداکننده خط",
  defaults: { dstyle: "solid" },
  presets: [preset("plain", "خط ساده", { dstyle: "solid" }), preset("dots", "نقطه‌چین", { dstyle: "dotted" }), preset("label", "با متن", { label: "یا" }), preset("icon", "با آیکن", { icon: "Sparkles" })],
  sections: [
    sec("c", "جداکننده", "content", [
      sel("dstyle", "سبک", [["solid", "ساده"], ["dashed", "خط‌چین"], ["dotted", "نقطه‌چین"], ["double", "دوتایی"]], { selectors: { "{{WRAPPER}} .ew-div-line": "border-top-style:{{VALUE}};" } }),
      txt("label", "متن میانی"),
      icn("icon", "آیکن میانی"),
      alignFlex("align", "{{WRAPPER}} .ew-divider-wrap"),
    ]),
    sec("s", "استایل", "style", [
      clr("color", "رنگ خط", { "{{WRAPPER}} .ew-div-line": "border-top-color:{{VALUE}};" }),
      slider("weight", "ضخامت", 1, 20, { "{{WRAPPER}} .ew-div-line": "border-top-width:{{VALUE}}px;" }),
      slider("width", "عرض", 5, 100, { "{{WRAPPER}} .ew-divider": "width:{{VALUE}}%;" }, { unit: "%", responsive: true }),
      slider("gap", "فاصلهٔ بالا و پایین", 0, 100, { "{{WRAPPER}} .ew-divider": "margin-block:{{VALUE}}px;" }, { responsive: true }),
      clr("lcolor", "رنگ متن میانی", { "{{WRAPPER}} .ew-div-label": "color:{{VALUE}};" }),
      ...typo("lt", "{{WRAPPER}} .ew-div-label"),
    ]),
  ],
  render: ({ s }) => (
    <div className="ew-divider-wrap">
    <div className="ew-divider">
      <span className="ew-div-line" />
      {(s.label || s.icon) && (
        <>
          <span className="ew-div-label">
            {s.icon && <IconView name={s.icon} size={16} />}
            {s.label}
          </span>
          <span className="ew-div-line" />
        </>
      )}
    </div>
    </div>
  ),
};

const spacer: WidgetDef = {
  type: "spacer",
  title: "فاصله‌دهنده",
  icon: MoveVertical,
  category: "basic",
  keywords: "spacer space فاصله",
  defaults: {},
  sections: [sec("c", "فاصله", "content", [slider("height", "ارتفاع", 5, 400, { "{{WRAPPER}} .ew-spacer": "height:{{VALUE}}px;" }, { responsive: true, default: 50 })])],
  render: () => <div className="ew-spacer" />,
};

const maps: WidgetDef = {
  type: "google-maps",
  title: "نقشهٔ گوگل",
  icon: MapIcon,
  category: "basic",
  keywords: "map google نقشه",
  defaults: { address: "Valiasr St 24, Tehran", zoom: 14 },
  sections: [
    sec("c", "نقشه", "content", [
      txt("address", "نشانی"),
      slider("zoom", "بزرگ‌نمایی", 1, 20, undefined, { unit: "" }),
      slider("height", "ارتفاع", 120, 800, { "{{WRAPPER}} .ew-map iframe": "height:{{VALUE}}px;" }, { responsive: true, default: 320 }),
      sw("gray", "سیاه‌وسفید"),
    ]),
    sec("s", "استایل", "style", [...borderCtls("map", "{{WRAPPER}} .ew-map")]),
  ],
  render: ({ s }) => (
    <div className="ew-map" style={s.gray ? { filter: "grayscale(1)" } : undefined}>
      <iframe
        title="نقشه"
        loading="lazy"
        src={`https://maps.google.com/maps?q=${encodeURIComponent(s.address || "Tehran")}&t=m&z=${s.zoom || 14}&output=embed`}
      />
    </div>
  ),
};

const iconW: WidgetDef = {
  type: "icon",
  title: "آیکن",
  icon: Smile,
  category: "basic",
  keywords: "icon آیکن",
  defaults: { icon: "Sparkles", view: "default", shape: "circle" },
  presets: [
    preset("plain", "ساده", { view: "default" }, "بدون قاب"),
    preset("stack", "با پس‌زمینه", { view: "stack", pad: 16 }, "دایرهٔ رنگی"),
    preset("framed", "قاب‌دار", { view: "framed" }, "خط دور"),
    preset("square", "مربع", { view: "stack", shape: "square", pad: 14 }, "مدرن"),
  ],
  sections: [
    sec("c", "آیکن", "content", [
      icn("icon"),
      sel("view", "نمایش", [["default", "پیش‌فرض"], ["stack", "پس‌زمینه‌دار"], ["framed", "قاب‌دار"]]),
      sel("shape", "شکل", [["circle", "دایره"], ["square", "مربع"]], { show: (s) => s.view !== "default" }),
      url("link"),
      alignFlex("align", "{{WRAPPER}} .ew-icon-wrap"),
    ]),
    sec("s", "استایل", "style", [
      slider("size", "اندازه", 12, 200, { "{{WRAPPER}} .ew-icon svg": "width:{{VALUE}}px;height:{{VALUE}}px;" }, { responsive: true, default: 40 }),
      clr("color", "رنگ", { "{{WRAPPER}} .ew-icon": "color:{{VALUE}};" }),
      clr("colorH", "رنگ (هاور)", { "{{WRAPPER}} .ew-icon:hover": "color:{{VALUE}};" }),
      clr("bg", "رنگ پس‌زمینه", { "{{WRAPPER}} .ew-icon.is-stack": "background-color:{{VALUE}};" }, { show: (s) => s.view === "stack" }),
      clr("frame", "رنگ قاب", { "{{WRAPPER}} .ew-icon.is-framed": "border-color:{{VALUE}};" }, { show: (s) => s.view === "framed" }),
      slider("pad", "فاصلهٔ داخلی", 0, 60, { "{{WRAPPER}} .ew-icon": "padding:{{VALUE}}px;" }, { show: (s) => s.view !== "default" }),
      slider("rotate", "چرخش", 0, 360, { "{{WRAPPER}} .ew-icon svg": "transform:rotate({{VALUE}}deg);" }, { unit: "°" }),
    ]),
  ],
  render: ({ s }) => {
    const el = (
      <span className={`ew-icon is-${s.view || "default"} ${s.shape === "square" ? "is-square" : ""}`}>
        <IconView name={s.icon} size={40} />
      </span>
    );
    return <div className="ew-icon-wrap">{s.link ? <a href={href(s.link)}>{el}</a> : el}</div>;
  },
};

/* ================================================================== */
/* GENERAL                                                             */
/* ================================================================== */

const boxStyle = (cls: string) => [
  hd("عنوان"),
  clr("titleColor", "رنگ عنوان", { [`{{WRAPPER}} .${cls}-title`]: "color:{{VALUE}};" }),
  ...typo("title", `{{WRAPPER}} .${cls}-title`),
  slider("titleGap", "فاصلهٔ عنوان", 0, 60, { [`{{WRAPPER}} .${cls}-title`]: "margin-bottom:{{VALUE}}px;" }),
  hd("توضیح"),
  clr("descColor", "رنگ توضیح", { [`{{WRAPPER}} .${cls}-desc`]: "color:{{VALUE}};" }),
  ...typo("desc", `{{WRAPPER}} .${cls}-desc`),
];

const imageBox: WidgetDef = {
  type: "image-box",
  title: "باکس تصویر",
  icon: LayoutGrid,
  category: "general",
  keywords: "image box تصویر کارت",
  defaults: { image: "stock:atelier", title: "عنوان باکس", desc: "توضیح کوتاه دربارهٔ این بخش که زیر تصویر نمایش داده می‌شود.", pos: "top", align: "start" },
  presets: [
    preset("top", "تصویر بالا", { pos: "top" }, "کلاسیک"),
    preset("aside", "تصویر کنار", { pos: "start" }, "افقی"),
    preset("overlay", "کپشن روی تصویر", { pos: "top" }, "مدرن"),
  ],
  sections: [
    sec("c", "محتوا", "content", [
      img("image"),
      txt("title", "عنوان"),
      area("desc", "توضیح"),
      url("link"),
      choose("pos", "جای تصویر", [["top", "بالا", "ArrowUp"], ["start", "راست", "ArrowRight"], ["end", "چپ", "ArrowLeft"]]),
      alignText("align", "{{WRAPPER}} .ew-ib"),
    ]),
    sec("s", "استایل", "style", [
      slider("imgW", "عرض تصویر", 10, 100, { "{{WRAPPER}} .ew-ib-img": "width:{{VALUE}}%;flex-basis:{{VALUE}}%;" }, { unit: "%", responsive: true }),
      slider("imgGap", "فاصلهٔ تصویر", 0, 60, { "{{WRAPPER}} .ew-ib": "gap:{{VALUE}}px;" }),
      ...borderCtls("ibImg", "{{WRAPPER}} .ew-ib-img img"),
      ...boxStyle("ew-ib"),
    ]),
  ],
  render: ({ s }) => {
    const body = (
      <div className="ew-ib-body">
        <h3 className="ew-ib-title">{s.title}</h3>
        <p className="ew-ib-desc">{s.desc}</p>
      </div>
    );
    const card = (
      <div className={`ew-ib pos-${s.pos || "top"}`}>
        <div className="ew-ib-img">
          <img src={resolveImg(s.image) || PLACEHOLDER} alt={s.title || ""} draggable={false} />
        </div>
        {body}
      </div>
    );
    return s.link ? <a href={href(s.link)} className="ew-plain">{card}</a> : card;
  },
};

const iconBox: WidgetDef = {
  type: "icon-box",
  title: "باکس آیکن",
  icon: Rows3,
  category: "general",
  keywords: "icon box feature ویژگی",
  defaults: { icon: "ShieldCheck", title: "ارسال امن", desc: "سفارش‌ها در بسته‌بندی ایمن و با بیمه ارسال می‌شوند.", pos: "top", align: "center" },
  presets: [
    preset("top", "آیکن بالا", { pos: "top", align: "center" }, "کلاسیک"),
    preset("aside", "آیکن کنار", { pos: "start", align: "start" }, "فشرده"),
    preset("dark", "کارت تیره", { pos: "top", bgColor: "#16130f", color: "#f7f3ed" }, "لوکس"),
    preset("soft", "کارت نرم", { pos: "top", bgColor: "#f7f3ed", radius: { top: 20, right: 20, bottom: 20, left: 20, linked: true } }, "گرد"),
  ],
  sections: [
    sec("c", "محتوا", "content", [
      icn("icon"),
      txt("title", "عنوان"),
      area("desc", "توضیح"),
      url("link"),
      choose("pos", "جای آیکن", [["top", "بالا", "ArrowUp"], ["start", "راست", "ArrowRight"], ["end", "چپ", "ArrowLeft"]]),
      alignText("align", "{{WRAPPER}} .ew-xb"),
    ]),
    sec("s", "استایل", "style", [
      slider("size", "اندازهٔ آیکن", 14, 120, { "{{WRAPPER}} .ew-xb-icon svg": "width:{{VALUE}}px;height:{{VALUE}}px;" }, { default: 36, responsive: true }),
      clr("color", "رنگ آیکن", { "{{WRAPPER}} .ew-xb-icon": "color:{{VALUE}};" }),
      clr("bg", "پس‌زمینهٔ آیکن", { "{{WRAPPER}} .ew-xb-icon": "background-color:{{VALUE}};" }),
      slider("pad", "فاصلهٔ داخلی آیکن", 0, 50, { "{{WRAPPER}} .ew-xb-icon": "padding:{{VALUE}}px;" }),
      dims("iconRadius", "گردی آیکن", "{{WRAPPER}} .ew-xb-icon", "border-radius"),
      slider("gap", "فاصلهٔ آیکن و متن", 0, 60, { "{{WRAPPER}} .ew-xb": "gap:{{VALUE}}px;" }),
      ...boxStyle("ew-xb"),
    ]),
  ],
  render: ({ s }) => {
    const card = (
      <div className={`ew-xb pos-${s.pos || "top"}`}>
        <div className="ew-xb-ic">
          <span className="ew-xb-icon">
            <IconView name={s.icon} size={36} />
          </span>
        </div>
        <div className="ew-xb-body">
          <h3 className="ew-xb-title">{s.title}</h3>
          <p className="ew-xb-desc">{s.desc}</p>
        </div>
      </div>
    );
    return s.link ? <a href={href(s.link)} className="ew-plain">{card}</a> : card;
  },
};

const starRating: WidgetDef = {
  type: "star-rating",
  title: "امتیاز ستاره‌ای",
  icon: Star,
  category: "general",
  keywords: "star rating امتیاز",
  defaults: { rating: 4.5, scale: 5, title: "امتیاز مشتریان" },
  sections: [
    sec("c", "امتیاز", "content", [
      num("rating", "امتیاز", { min: 0, max: 10, step: 0.5 }),
      sel("scale", "مقیاس", [["5", "از ۵"], ["10", "از ۱۰"]]),
      txt("title", "عنوان"),
      alignFlex("align", "{{WRAPPER}} .ew-stars-wrap"),
    ]),
    sec("s", "استایل", "style", [
      slider("size", "اندازه", 10, 60, { "{{WRAPPER}} .ew-stars svg": "width:{{VALUE}}px;height:{{VALUE}}px;" }, { default: 22 }),
      clr("color", "رنگ ستاره", { "{{WRAPPER}} .ew-stars-on": "color:{{VALUE}};" }),
      clr("off", "رنگ ستارهٔ خالی", { "{{WRAPPER}} .ew-stars-off": "color:{{VALUE}};" }),
      clr("tcolor", "رنگ عنوان", { "{{WRAPPER}} .ew-stars-title": "color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-stars-title"),
    ]),
  ],
  render: ({ s }) => {
    const scale = Number(s.scale) || 5;
    const pct = Math.max(0, Math.min(100, ((Number(s.rating) || 0) / scale) * 100));
    const row = Array.from({ length: scale }).map((_, i) => <Star key={i} fill="currentColor" strokeWidth={0} />);
    return (
      <div className="ew-stars-wrap">
        <div className="ew-stars" aria-label={`امتیاز ${faNum(s.rating)} از ${faNum(scale)}`}>
          <div className="ew-stars-off">{row}</div>
          <div className="ew-stars-on" style={{ width: `${pct}%` }}>
            {row}
          </div>
        </div>
        {s.title && <span className="ew-stars-title">{s.title}</span>}
      </div>
    );
  },
};

function GalleryView({ s }: { s: Record<string, any> }) {
  const [open, setOpen] = useState<number | null>(null);
  const imgs: string[] = Array.isArray(s.images) ? s.images : [];
  useEffect(() => {
    if (open === null) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowLeft") setOpen((v) => (v === null ? v : (v + 1) % imgs.length));
      if (e.key === "ArrowRight") setOpen((v) => (v === null ? v : (v - 1 + imgs.length) % imgs.length));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, imgs.length]);
  if (!imgs.length) return <div className="ew-empty">تصاویر گالری را از پنل اضافه کن.</div>;
  return (
    <>
      <div className="ew-gallery">
        {imgs.map((u, i) => (
          <button key={i} type="button" className="ew-gal-item" onClick={() => s.lightbox !== false && setOpen(i)} aria-label={`تصویر ${i + 1}`}>
            <img src={resolveImg(u)} alt="" draggable={false} loading="lazy" />
          </button>
        ))}
      </div>
      {open !== null && (
        <div className="ew-lightbox" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <img src={resolveImg(imgs[open])} alt="" onClick={(e) => e.stopPropagation()} />
          <button type="button" className="ew-lb-close" aria-label="بستن" onClick={() => setOpen(null)}>
            <X width={20} height={20} />
          </button>
        </div>
      )}
    </>
  );
}

const STOCK_SET = ["stock:hero", "stock:atelier", "stock:campaign", "stock:look1", "stock:look2", "stock:look3"];

const gallery: WidgetDef = {
  type: "image-gallery",
  title: "گالری تصاویر",
  icon: Images,
  category: "general",
  keywords: "gallery grid گالری",
  defaults: { images: STOCK_SET, cols: 3, colsTablet: 2, colsMobile: 2, lightbox: true },
  sections: [
    sec("c", "گالری", "content", [
      { key: "images", label: "تصاویر", type: "images" },
      slider("cols", "ستون‌ها", 1, 8, { "{{WRAPPER}} .ew-gallery": "grid-template-columns:repeat({{VALUE}},1fr);" }, { unit: "", responsive: true, default: 3 }),
      slider("gap", "فاصله", 0, 60, { "{{WRAPPER}} .ew-gallery": "gap:{{VALUE}}px;" }, { default: 10 }),
      sel("ratio", "نسبت تصویر", [["1/1", "۱:۱"], ["4/5", "۴:۵"], ["3/4", "۳:۴"], ["4/3", "۴:۳"], ["16/9", "۱۶:۹"], ["", "طبیعی"]], { selectors: { "{{WRAPPER}} .ew-gal-item": "aspect-ratio:{{VALUE}};" }, default: "1/1" }),
      sw("lightbox", "نمایش بزرگ (Lightbox)", { default: true }),
    ]),
    sec("s", "استایل", "style", [
      ...borderCtls("gal", "{{WRAPPER}} .ew-gal-item"),
      sel("hover", "افکت هاور", [["", "هیچ"], ["scale(1.08)", "بزرگ‌نمایی"]], { selectors: { "{{WRAPPER}} .ew-gal-item:hover img": "transform:{{VALUE}};" } }),
    ]),
  ],
  render: ({ s }) => <GalleryView s={s} />,
};

function ImageCarouselView({ s }: { s: Record<string, any> }) {
  const d = useDevice();
  const imgs: string[] = Array.isArray(s.images) ? s.images : [];
  const per = Number(rv(s, "per", d, 3)) || 1;
  return (
    <Carousel
      perView={per}
      autoplay={!!s.autoplay}
      speed={Number(s.speed) || 4000}
      arrows={s.arrows !== false}
      dots={s.dots !== false}
      gap={Number(s.gap) || 0}
      items={imgs.map((u, i) => (
        <div className="ew-car-img" key={i}>
          <img src={resolveImg(u)} alt="" draggable={false} />
        </div>
      ))}
    />
  );
}

const imageCarousel: WidgetDef = {
  type: "image-carousel",
  title: "کاروسل تصاویر",
  icon: GalleryHorizontal,
  category: "general",
  keywords: "carousel slider اسلایدر",
  defaults: { images: STOCK_SET, per: 3, perTablet: 2, perMobile: 1, autoplay: true, speed: 3500, arrows: true, dots: true, gap: 16 },
  sections: [
    sec("c", "کاروسل", "content", [
      { key: "images", label: "تصاویر", type: "images" },
      num("per", "تعداد نمایش", { responsive: true, min: 1, max: 8 }),
      sw("autoplay", "پخش خودکار"),
      num("speed", "سرعت (میلی‌ثانیه)", { min: 1200, max: 12000, step: 100 }),
      sw("arrows", "فلش‌ها"),
      sw("dots", "نقطه‌ها"),
      slider("gap", "فاصلهٔ اسلایدها", 0, 60, undefined, { unit: "px" }),
    ]),
    sec("s", "استایل", "style", [
      sel("ratio", "نسبت تصویر", [["4/3", "۴:۳"], ["1/1", "۱:۱"], ["3/4", "۳:۴"], ["16/9", "۱۶:۹"]], { selectors: { "{{WRAPPER}} .ew-car-img": "aspect-ratio:{{VALUE}};" } }),
      ...borderCtls("ci", "{{WRAPPER}} .ew-car-img"),
      clr("arrowColor", "رنگ فلش", { "{{WRAPPER}} .ew-car-arrow": "color:{{VALUE}};" }),
      clr("arrowBg", "پس‌زمینهٔ فلش", { "{{WRAPPER}} .ew-car-arrow": "background-color:{{VALUE}};" }),
      clr("dotColor", "رنگ نقطهٔ فعال", { "{{WRAPPER}} .ew-car-dots .is-on": "background-color:{{VALUE}};" }),
    ]),
  ],
  render: ({ s }) => <ImageCarouselView s={s} />,
};

const iconList: WidgetDef = {
  type: "icon-list",
  title: "لیست آیکن‌دار",
  icon: List,
  category: "general",
  keywords: "icon list لیست",
  defaults: {
    layout: "vertical",
    items: [
      { text: "ارسال رایگان بالای ۲۰۰٬۰۰۰ تومان", icon: "Truck", link: "" },
      { text: "مرجوعی تا ۱۴ روز", icon: "Check", link: "" },
      { text: "ساخت محدود در تهران", icon: "Gem", link: "" },
    ],
  },
  sections: [
    sec("c", "آیتم‌ها", "content", [
      rep("items", "آیتم‌ها", [txt("text", "متن"), icn("icon"), url("link")], { text: "آیتم جدید", icon: "Check", link: "" }, "text"),
      choose("layout", "چیدمان", [["vertical", "عمودی", "ArrowDown"], ["inline", "افقی", "ArrowLeft"]]),
      alignFlex("align", "{{WRAPPER}} .ew-il-wrap"),
    ]),
    sec("s", "استایل", "style", [
      slider("gap", "فاصلهٔ آیتم‌ها", 0, 50, { "{{WRAPPER}} .ew-il": "gap:{{VALUE}}px;" }, { default: 10 }),
      clr("iconColor", "رنگ آیکن", { "{{WRAPPER}} .ew-il-icon": "color:{{VALUE}};" }),
      slider("iconSize", "اندازهٔ آیکن", 10, 60, { "{{WRAPPER}} .ew-il-icon svg": "width:{{VALUE}}px;height:{{VALUE}}px;" }, { default: 18 }),
      clr("color", "رنگ متن", { "{{WRAPPER}} .ew-il-text": "color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-il-text"),
      sw("divider", "خط جداکننده"),
      clr("divColor", "رنگ خط", { "{{WRAPPER}} .ew-il.has-divider .ew-il-item:not(:last-child)": "border-bottom:1px solid {{VALUE}};" }, { show: (s) => !!s.divider }),
    ]),
  ],
  render: ({ s }) => (
    <div className="ew-il-wrap">
    <ul className={`ew-il is-${s.layout || "vertical"} ${s.divider ? "has-divider" : ""}`}>
      {(s.items ?? []).map((it: any, i: number) => {
        const inner = (
          <>
            <span className="ew-il-icon">
              <IconView name={it.icon} size={18} />
            </span>
            <span className="ew-il-text">{it.text}</span>
          </>
        );
        return (
          <li key={i} className="ew-il-item">
            {it.link ? <a href={href(it.link)}>{inner}</a> : inner}
          </li>
        );
      })}
    </ul>
    </div>
  ),
};

function CounterView({ s }: { s: Record<string, any> }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const [v, setV] = useState(Number(s.start) || 0);
  const end = Number(s.end) || 0;
  const start = Number(s.start) || 0;
  const dur = Math.max(300, Number(s.duration) || 1800);
  useEffect(() => {
    if (!seen) {
      setV(start);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setV(Math.round(start + (end - start) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, start, end, dur]);
  const shown = s.sep === false ? String(v) : v.toLocaleString("fa-IR");
  return (
    <div className="ew-counter" ref={ref}>
      <div className="ew-counter-num">
        {s.prefix && <span>{s.prefix}</span>}
        <span>{s.sep === false ? faNum(shown) : shown}</span>
        {s.suffix && <span>{s.suffix}</span>}
      </div>
      {s.title && <div className="ew-counter-title">{s.title}</div>}
    </div>
  );
}

const counter: WidgetDef = {
  type: "counter",
  title: "شمارنده",
  icon: Hash,
  category: "general",
  keywords: "counter number آمار شمارنده",
  defaults: { start: 0, end: 1200, prefix: "", suffix: "+", duration: 1800, title: "مشتری راضی", sep: true },
  sections: [
    sec("c", "شمارنده", "content", [
      num("start", "شروع"),
      num("end", "پایان"),
      txt("prefix", "پیشوند"),
      txt("suffix", "پسوند"),
      num("duration", "مدت (میلی‌ثانیه)", { min: 300, step: 100 }),
      sw("sep", "جداکنندهٔ هزارگان", { default: true }),
      txt("title", "عنوان"),
      alignText("align", "{{WRAPPER}} .ew-counter"),
    ]),
    sec("s", "استایل", "style", [
      clr("numColor", "رنگ عدد", { "{{WRAPPER}} .ew-counter-num": "color:{{VALUE}};" }),
      ...typo("num", "{{WRAPPER}} .ew-counter-num"),
      clr("titleColor", "رنگ عنوان", { "{{WRAPPER}} .ew-counter-title": "color:{{VALUE}};" }),
      ...typo("title", "{{WRAPPER}} .ew-counter-title"),
    ]),
  ],
  render: ({ s }) => <CounterView s={s} />,
};

function ProgressView({ s }: { s: Record<string, any> }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const pct = Math.max(0, Math.min(100, Number(s.percent) || 0));
  return (
    <div className="ew-progress" ref={ref}>
      <div className="ew-progress-head">
        <span className="ew-progress-title">{s.title}</span>
        {s.showPct !== false && <span className="ew-progress-pct">{faNum(pct)}٪</span>}
      </div>
      <div className="ew-progress-bar">
        <div className="ew-progress-fill" style={{ width: seen ? `${pct}%` : 0 }}>
          {s.inner}
        </div>
      </div>
    </div>
  );
}

const progress: WidgetDef = {
  type: "progress",
  title: "نوار پیشرفت",
  icon: BarChart3,
  category: "general",
  keywords: "progress bar skill پیشرفت",
  defaults: { title: "پارچهٔ طبیعی", percent: 92, showPct: true },
  sections: [
    sec("c", "نوار", "content", [
      txt("title", "عنوان"),
      slider("percent", "درصد", 0, 100, undefined, { unit: "%" }),
      txt("inner", "متن داخل نوار"),
      sw("showPct", "نمایش درصد", { default: true }),
    ]),
    sec("s", "استایل", "style", [
      clr("fill", "رنگ نوار", { "{{WRAPPER}} .ew-progress-fill": "background-color:{{VALUE}};" }),
      clr("track", "رنگ پس‌زمینه", { "{{WRAPPER}} .ew-progress-bar": "background-color:{{VALUE}};" }),
      slider("h", "ارتفاع", 4, 60, { "{{WRAPPER}} .ew-progress-bar": "height:{{VALUE}}px;" }, { default: 10 }),
      dims("radius", "گردی", "{{WRAPPER}} .ew-progress-bar,{{WRAPPER}} .ew-progress-fill", "border-radius"),
      clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-progress-head": "color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-progress-head"),
    ]),
  ],
  render: ({ s }) => <ProgressView s={s} />,
};

const testimonial: WidgetDef = {
  type: "testimonial",
  title: "نظر مشتری",
  icon: Quote,
  category: "general",
  keywords: "testimonial review نظر",
  defaults: { content: "کیفیت پارچه و دوخت فوق‌العاده بود. پالتو دقیقاً همان‌طور که روی رانوی دیدم به دستم رسید.", name: "آوا رادمهر", job: "طراح داخلی", image: "stock:campaign", pos: "top", align: "center" },
  sections: [
    sec("c", "محتوا", "content", [
      area("content", "متن نظر", { rows: 4 }),
      txt("name", "نام"),
      txt("job", "عنوان شغلی"),
      img("image", "تصویر"),
      choose("pos", "جای تصویر", [["top", "بالا", "ArrowUp"], ["aside", "کنار", "ArrowRight"]]),
      alignText("align", "{{WRAPPER}} .ew-tm"),
    ]),
    sec("s", "استایل", "style", [
      clr("cc", "رنگ متن", { "{{WRAPPER}} .ew-tm-content": "color:{{VALUE}};" }),
      ...typo("c", "{{WRAPPER}} .ew-tm-content"),
      clr("nc", "رنگ نام", { "{{WRAPPER}} .ew-tm-name": "color:{{VALUE}};" }),
      ...typo("n", "{{WRAPPER}} .ew-tm-name"),
      clr("jc", "رنگ عنوان شغلی", { "{{WRAPPER}} .ew-tm-job": "color:{{VALUE}};" }),
      slider("imgSize", "اندازهٔ تصویر", 30, 160, { "{{WRAPPER}} .ew-tm-img": "width:{{VALUE}}px;height:{{VALUE}}px;" }, { default: 64 }),
      dims("imgRadius", "گردی تصویر", "{{WRAPPER}} .ew-tm-img", "border-radius"),
    ]),
  ],
  render: ({ s }) => (
    <div className={`ew-tm pos-${s.pos || "top"}`}>
      <p className="ew-tm-content">{s.content}</p>
      <div className="ew-tm-meta">
        {s.image && <img className="ew-tm-img" src={resolveImg(s.image)} alt="" draggable={false} />}
        <div>
          <div className="ew-tm-name">{s.name}</div>
          <div className="ew-tm-job">{s.job}</div>
        </div>
      </div>
    </div>
  ),
};

function TabsView({ s }: { s: Record<string, any> }) {
  const items: any[] = s.items ?? [];
  const [i, setI] = useState(0);
  const cur = items[Math.min(i, items.length - 1)];
  return (
    <div className={`ew-tabs is-${s.layout || "horizontal"}`}>
      <div className="ew-tab-list" role="tablist">
        {items.map((it, n) => (
          <button key={n} type="button" role="tab" aria-selected={n === i} className={`ew-tab ${n === i ? "is-on" : ""}`} onClick={() => setI(n)}>
            {it.title}
          </button>
        ))}
      </div>
      <div className="ew-tab-panel" role="tabpanel" dangerouslySetInnerHTML={{ __html: cur?.content ?? "" }} />
    </div>
  );
}

const tabs: WidgetDef = {
  type: "tabs",
  title: "تب‌ها",
  icon: PanelTop,
  category: "general",
  keywords: "tabs تب",
  defaults: {
    layout: "horizontal",
    items: [
      { title: "جنس و پارچه", content: "<p>پشم ویرجین و کشمیر مغولستان، با آستر تنفس‌پذیر.</p>" },
      { title: "مراقبت", content: "<p>شست‌وشوی خشک و نگهداری روی چوب‌لباس پهن.</p>" },
      { title: "ارسال", content: "<p>ارسال ۲ تا ۴ روز کاری و مرجوعی تا ۱۴ روز.</p>" },
    ],
  },
  sections: [
    sec("c", "تب‌ها", "content", [
      rep("items", "آیتم‌ها", [txt("title", "عنوان"), area("content", "محتوا (HTML)", { rows: 4 })], { title: "تب جدید", content: "<p>محتوا</p>" }),
      choose("layout", "چیدمان", [["horizontal", "افقی", "ArrowLeft"], ["vertical", "عمودی", "ArrowDown"]]),
    ]),
    sec("s", "استایل", "style", [
      ...typo("t", "{{WRAPPER}} .ew-tab"),
      clr("tc", "رنگ تب", { "{{WRAPPER}} .ew-tab": "color:{{VALUE}};" }),
      clr("tcA", "رنگ تب فعال", { "{{WRAPPER}} .ew-tab.is-on": "color:{{VALUE}};border-color:{{VALUE}};" }),
      clr("tbgA", "پس‌زمینهٔ تب فعال", { "{{WRAPPER}} .ew-tab.is-on": "background-color:{{VALUE}};" }),
      clr("pbg", "پس‌زمینهٔ محتوا", { "{{WRAPPER}} .ew-tab-panel": "background-color:{{VALUE}};" }),
      clr("pc", "رنگ متن محتوا", { "{{WRAPPER}} .ew-tab-panel": "color:{{VALUE}};" }),
      dims("pp", "فاصلهٔ داخلی محتوا", "{{WRAPPER}} .ew-tab-panel", "padding"),
      ...borderCtls("tabBox", "{{WRAPPER}} .ew-tab-panel"),
    ]),
  ],
  render: ({ s }) => <TabsView s={s} />,
};

function AccordionView({ s, multi }: { s: Record<string, any>; multi: boolean }) {
  const items: any[] = s.items ?? [];
  const [open, setOpen] = useState<number[]>(s.openFirst === false ? [] : [0]);
  const toggle = (n: number) =>
    setOpen((o) => (o.includes(n) ? o.filter((x) => x !== n) : multi ? [...o, n] : [n]));
  return (
    <div className="ew-acc">
      {items.map((it, n) => {
        const on = open.includes(n);
        return (
          <div key={n} className={`ew-acc-item ${on ? "is-on" : ""}`}>
            <button type="button" className="ew-acc-head" aria-expanded={on} onClick={() => toggle(n)}>
              <span className="ew-acc-title">{it.title}</span>
              <span className="ew-acc-ic">{s.iconType === "chevron" ? <ChevronDown width={16} height={16} /> : on ? <X width={14} height={14} /> : <Plus width={14} height={14} />}</span>
            </button>
            <div className="ew-acc-body" hidden={!on} dangerouslySetInnerHTML={{ __html: it.content ?? "" }} />
          </div>
        );
      })}
    </div>
  );
}

const accordionItems = [
  { title: "ارسال چقدر طول می‌کشد؟", content: "<p>ارسال استاندارد ۲ تا ۴ روز کاری است و ارسال سریع ۲۴ ساعته هم داریم.</p>" },
  { title: "مرجوعی چگونه است؟", content: "<p>تا ۱۴ روز پس از دریافت، بدون سؤال و با برچسب اصلی.</p>" },
  { title: "راهنمای سایز کجاست؟", content: "<p>در صفحهٔ هر محصول، بخش «راهنمای سایز».</p>" },
];

const accStyle = [
  ...typo("t", "{{WRAPPER}} .ew-acc-title"),
  clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-acc-head": "color:{{VALUE}};" }),
  clr("tcA", "رنگ عنوان فعال", { "{{WRAPPER}} .ew-acc-item.is-on .ew-acc-head": "color:{{VALUE}};" }),
  clr("hbg", "پس‌زمینهٔ عنوان", { "{{WRAPPER}} .ew-acc-head": "background-color:{{VALUE}};" }),
  clr("bbg", "پس‌زمینهٔ محتوا", { "{{WRAPPER}} .ew-acc-body": "background-color:{{VALUE}};" }),
  clr("bc", "رنگ متن محتوا", { "{{WRAPPER}} .ew-acc-body": "color:{{VALUE}};" }),
  dims("bp", "فاصلهٔ داخلی محتوا", "{{WRAPPER}} .ew-acc-body", "padding"),
  slider("space", "فاصلهٔ آیتم‌ها", 0, 30, { "{{WRAPPER}} .ew-acc": "gap:{{VALUE}}px;" }),
  ...borderCtls("accItem", "{{WRAPPER}} .ew-acc-item"),
];

const accordion: WidgetDef = {
  type: "accordion",
  title: "آکاردئون",
  icon: ChevronDown,
  category: "general",
  keywords: "accordion faq سوالات",
  defaults: { items: accordionItems, iconType: "plus", openFirst: true },
  sections: [
    sec("c", "آیتم‌ها", "content", [
      rep("items", "آیتم‌ها", [txt("title", "عنوان"), area("content", "محتوا (HTML)", { rows: 4 })], { title: "سؤال جدید", content: "<p>پاسخ</p>" }),
      sel("iconType", "آیکن", [["plus", "بعلاوه"], ["chevron", "فلش"]]),
      sw("openFirst", "اولین آیتم باز باشد", { default: true }),
    ]),
    sec("s", "استایل", "style", accStyle),
  ],
  render: ({ s }) => <AccordionView s={s} multi={false} />,
};

const toggle: WidgetDef = {
  type: "toggle",
  title: "تاگل",
  icon: ToggleLeft,
  category: "general",
  keywords: "toggle تاگل",
  defaults: { items: accordionItems, iconType: "chevron", openFirst: false },
  sections: [
    sec("c", "آیتم‌ها", "content", [
      rep("items", "آیتم‌ها", [txt("title", "عنوان"), area("content", "محتوا (HTML)", { rows: 4 })], { title: "آیتم جدید", content: "<p>محتوا</p>" }),
      sel("iconType", "آیکن", [["plus", "بعلاوه"], ["chevron", "فلش"]]),
      sw("openFirst", "اولین آیتم باز باشد"),
    ]),
    sec("s", "استایل", "style", accStyle),
  ],
  render: ({ s }) => <AccordionView s={s} multi />,
};

export const NETWORKS: Record<string, { label: string; icon: string; color: string }> = {
  instagram: { label: "اینستاگرام", icon: "Camera", color: "#e1306c" },
  telegram: { label: "تلگرام", icon: "Send", color: "#229ed9" },
  whatsapp: { label: "واتساپ", icon: "MessageCircle", color: "#25d366" },
  twitter: { label: "ایکس", icon: "AtSign", color: "#111111" },
  youtube: { label: "یوتیوب", icon: "Play", color: "#ff0000" },
  linkedin: { label: "لینکدین", icon: "Link2", color: "#0a66c2" },
  email: { label: "ایمیل", icon: "Mail", color: "#8c4a2f" },
  phone: { label: "تلفن", icon: "Phone", color: "#16130f" },
  website: { label: "وب‌سایت", icon: "Globe", color: "#16130f" },
};

const socialIcons: WidgetDef = {
  type: "social-icons",
  title: "آیکن‌های اجتماعی",
  icon: Share2,
  category: "general",
  keywords: "social icons شبکه اجتماعی",
  defaults: {
    shape: "circle",
    colorMode: "official",
    items: [
      { network: "instagram", link: "#" },
      { network: "telegram", link: "#" },
      { network: "whatsapp", link: "#" },
      { network: "youtube", link: "#" },
    ],
  },
  sections: [
    sec("c", "آیتم‌ها", "content", [
      rep("items", "شبکه‌ها", [sel("network", "شبکه", Object.entries(NETWORKS).map(([k, v]) => [k, v.label] as [string, string])), url("link")], { network: "website", link: "#" }, "network"),
      sel("shape", "شکل", [["circle", "دایره"], ["rounded", "گرد"], ["square", "مربع"], ["plain", "بدون پس‌زمینه"]]),
      sel("colorMode", "رنگ", [["official", "رنگ برند"], ["custom", "سفارشی"]]),
      alignFlex("align", "{{WRAPPER}} .ew-social"),
    ]),
    sec("s", "استایل", "style", [
      slider("size", "اندازهٔ آیکن", 12, 60, { "{{WRAPPER}} .ew-soc svg": "width:{{VALUE}}px;height:{{VALUE}}px;" }, { default: 18 }),
      slider("pad", "اندازهٔ دکمه", 20, 90, { "{{WRAPPER}} .ew-soc": "width:{{VALUE}}px;height:{{VALUE}}px;" }, { default: 40 }),
      slider("gap", "فاصله", 0, 40, { "{{WRAPPER}} .ew-social": "gap:{{VALUE}}px;" }, { default: 8 }),
      clr("color", "رنگ آیکن", { "{{WRAPPER}} .ew-soc": "color:{{VALUE}};" }, { show: (s) => s.colorMode === "custom" }),
      clr("bg", "رنگ پس‌زمینه", { "{{WRAPPER}} .ew-soc": "background-color:{{VALUE}};" }, { show: (s) => s.colorMode === "custom" }),
      clr("hover", "رنگ هاور", { "{{WRAPPER}} .ew-soc:hover": "background-color:{{VALUE}};" }),
    ]),
  ],
  render: ({ s }) => (
    <div className={`ew-social is-${s.shape || "circle"}`}>
      {(s.items ?? []).map((it: any, i: number) => {
        const n = NETWORKS[it.network] ?? NETWORKS.website;
        const official = s.colorMode !== "custom";
        const link = it.network === "email" && it.link && !it.link.startsWith("mailto:") ? `mailto:${it.link}` : it.link;
        return (
          <a
            key={i}
            href={href(link) || "#"}
            className="ew-soc"
            aria-label={n.label}
            style={official ? { backgroundColor: s.shape === "plain" ? "transparent" : n.color, color: s.shape === "plain" ? n.color : "#fff" } : undefined}
          >
            <IconView name={n.icon} size={18} />
          </a>
        );
      })}
    </div>
  ),
};

function AlertView({ s }: { s: Record<string, any> }) {
  const [gone, setGone] = useState(false);
  useEffect(() => setGone(false), [s.title, s.desc]);
  if (gone) return <div className="ew-empty">هشدار بسته شد (در حالت زنده دیگر نمایش داده نمی‌شود).</div>;
  return (
    <div className={`ew-alert is-${s.atype || "info"}`} role="alert">
      <div>
        <div className="ew-alert-title">{s.title}</div>
        <div className="ew-alert-desc">{s.desc}</div>
      </div>
      {s.dismiss !== false && (
        <button type="button" className="ew-alert-x" aria-label="بستن" onClick={() => setGone(true)}>
          <X width={16} height={16} />
        </button>
      )}
    </div>
  );
}

const alertW: WidgetDef = {
  type: "alert",
  title: "هشدار",
  icon: AlertCircle,
  category: "general",
  keywords: "alert notice هشدار",
  defaults: { atype: "info", title: "اطلاعیه", desc: "ارسال رایگان تا پایان هفته برای همهٔ سفارش‌ها.", dismiss: true },
  sections: [
    sec("c", "هشدار", "content", [
      sel("atype", "نوع", [["info", "اطلاعات"], ["success", "موفقیت"], ["warning", "هشدار"], ["danger", "خطر"]]),
      txt("title", "عنوان"),
      area("desc", "توضیح"),
      sw("dismiss", "دکمهٔ بستن", { default: true }),
    ]),
    sec("s", "استایل", "style", [
      clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-alert": "background-color:{{VALUE}};" }),
      clr("color", "رنگ متن", { "{{WRAPPER}} .ew-alert": "color:{{VALUE}};" }),
      clr("bc", "رنگ حاشیه", { "{{WRAPPER}} .ew-alert": "border-color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-alert-title"),
      dims("pad", "فاصلهٔ داخلی", "{{WRAPPER}} .ew-alert", "padding"),
      dims("rad", "گردی", "{{WRAPPER}} .ew-alert", "border-radius"),
    ]),
  ],
  render: ({ s }) => <AlertView s={s} />,
};

const htmlW: WidgetDef = {
  type: "html",
  title: "HTML سفارشی",
  icon: Code2,
  category: "general",
  keywords: "html code embed کد",
  defaults: { code: "<div style='padding:24px;border:1px dashed #c2b09a;border-radius:12px;text-align:center'>کد HTML سفارشی شما اینجا نمایش داده می‌شود.</div>" },
  sections: [sec("c", "کد", "content", [{ key: "code", label: "کد HTML", type: "code", rows: 10 }])],
  render: ({ s }) => <div className="ew-html" dangerouslySetInnerHTML={{ __html: s.code ?? "" }} />,
};

const anchor: WidgetDef = {
  type: "menu-anchor",
  title: "لنگر منو",
  icon: Anchor,
  category: "general",
  keywords: "anchor لنگر",
  defaults: { anchor: "about" },
  sections: [sec("c", "لنگر", "content", [txt("anchor", "شناسهٔ لنگر", { hint: "لینک: #/p/نام-صفحه ← یا از دکمه با لینک #about استفاده کن." })])],
  render: ({ s, editing }) => (
    <div id={s.anchor || undefined} className={editing ? "ew-anchor is-edit" : "ew-anchor"}>
      {editing && <span>⚓ {s.anchor}</span>}
    </div>
  ),
};

export const WIDGETS_A: WidgetDef[] = [
  heading,
  image,
  textEditor,
  video,
  button,
  divider,
  spacer,
  maps,
  iconW,
  imageBox,
  iconBox,
  starRating,
  gallery,
  imageCarousel,
  iconList,
  counter,
  progress,
  testimonial,
  tabs,
  accordion,
  toggle,
  socialIcons,
  alertW,
  htmlW,
  anchor,
];

