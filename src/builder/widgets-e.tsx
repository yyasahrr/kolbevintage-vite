import { useEffect, useRef, useState } from "react";
import {
  AlignJustify,
  ArrowUp,
  BarChart3,
  Bookmark,
  Columns3,
  Contrast,
  FileCode,
  Frame,
  Gauge,
  Image as ImageIcon,
  LayoutPanelLeft,
  Maximize2,
  Moon,
  Monitor,
  MousePointer,
  Music,
  Pause,
  Play,
  Quote,
  Scan,
  SquareStack,
  Sun,
  Trash2,
  Tv,
  Wind,
  Zap,
} from "lucide-react";
import {
  alignFlex,
  alignText,
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
  sw,
  txt,
  typo,
  url,
  preset,
  type WidgetDef,
} from "./core";
import { href } from "./ctx";
import { Carousel, IconView, faNum, useInView } from "./kit";
import { PLACEHOLDER, resolveImg } from "./stock";
import { P, makeCardWidget } from "./factory";
import { useTheme } from "@/theme/ThemeProvider";

/* ================================================================== */
/* media                                                               */
/* ================================================================== */

function MagnifyView({ s }: { s: Record<string, any> }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const move = (e: React.MouseEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: ((r.right - e.clientX) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
  };
  const zoom = Number(s.zoom) || 2;
  return (
    <div className="ew-mag" ref={box} onMouseMove={move} onMouseLeave={() => setPos(null)}>
      <img src={resolveImg(s.image) || PLACEHOLDER} alt="" draggable={false} />
      {pos && (
        <div
          className="ew-mag-lens"
          style={{ backgroundImage: `url("${resolveImg(s.image) || PLACEHOLDER}")`, backgroundSize: `${zoom * 100}%`, backgroundPosition: `${pos.x}% ${pos.y}%` }}
        />
      )}
    </div>
  );
}

const imageMagnifier: WidgetDef = {
  type: "image-magnifier",
  title: "ذره‌بین تصویر",
  icon: Scan,
  category: "media",
  keywords: "magnifier zoom image ذره بین",
  defaults: { image: "stock:atelier", zoom: 2, ratio: "1/1" },
  sections: [
    sec("c", "تصویر", "content", [img("image"), num("zoom", "بزرگ‌نمایی", { min: 1.2, max: 5, step: 0.2 }), sel("ratio", "نسبت", [["1/1", "۱:۱"], ["4/3", "۴:۳"], ["3/4", "۳:۴"]], { selectors: { "{{WRAPPER}} .ew-mag": "aspect-ratio:{{VALUE}};" } })]),
    sec("s", "استایل", "style", [clr("lens", "رنگ قاب لنز", { "{{WRAPPER}} .ew-mag-lens": "border-color:{{VALUE}};" }), ...borderCtls("mag", "{{WRAPPER}} .ew-mag")]),
  ],
  render: ({ s }) => <MagnifyView s={s} />,
};

function Player360({ s }: { s: Record<string, any> }) {
  const imgs: string[] = (s.images ?? []).filter(Boolean);
  const [i, setI] = useState(0);
  const drag = useRef<number | null>(null);
  if (!imgs.length) return <div className="ew-empty">برای چرخش ۳۶۰ درجه، چند تصویر اضافه کن.</div>;
  return (
    <div
      className="ew-360"
      onPointerDown={(e) => {
        drag.current = e.clientX;
      }}
      onPointerMove={(e) => {
        if (drag.current === null) return;
        if (Math.abs(e.clientX - drag.current) > 14) {
          const step = e.clientX > (drag.current as number) ? -1 : 1;
          setI((v) => (((v + step) % imgs.length) + imgs.length) % imgs.length);
          drag.current = e.clientX;
        }
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerLeave={() => (drag.current = null)}
    >
      <img src={resolveImg(imgs[((i % imgs.length) + imgs.length) % imgs.length])} alt="" draggable={false} />
      <span className="ew-360-hint">
        <MousePointer width={14} height={14} /> برای چرخش بکش
      </span>
    </div>
  );
}

const viewer360: WidgetDef = {
  type: "360-viewer",
  title: "نمایشگر ۳۶۰ درجه",
  icon: Frame,
  category: "media",
  keywords: "360 product viewer چرخش",
  defaults: { images: ["stock:look1", "stock:look2", "stock:look3", "stock:look4", "stock:look5", "stock:look6"] },
  sections: [
    sec("c", "تصاویر", "content", [{ key: "images", label: "فریم‌های چرخش", type: "images" }, slider("height", "ارتفاع", 200, 700, { "{{WRAPPER}} .ew-360": "height:{{VALUE}}px;" }, { responsive: true, default: 380 })]),
    sec("s", "استایل", "style", [clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-360": "background-color:{{VALUE}};" }), ...borderCtls("v360", "{{WRAPPER}} .ew-360")]),
  ],
  render: ({ s }) => <Player360 s={s} />,
};

function AudioPlayer({ s }: { s: Record<string, any> }) {
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const dur = Number(s.duration) || 120;
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setT((v) => (v + 1 >= dur ? 0 : v + 1)), 1000);
    return () => window.clearInterval(id);
  }, [playing, dur]);
  const fmt = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  return (
    <div className="ew-audio">
      <button type="button" className="ew-au-btn" onClick={() => setPlaying((v) => !v)} aria-label={playing ? "توقف" : "پخش"}>
        {playing ? <Pause width={18} height={18} /> : <Play width={18} height={18} />}
      </button>
      <div className="ew-au-body">
        <div className="ew-au-row">
          <b>{s.title || "نام قطعه"}</b>
          <span className="ew-au-time" dir="ltr">
            {fmt(t)} / {fmt(dur)}
          </span>
        </div>
        <div className="ew-au-bar">
          <div className="ew-au-fill" style={{ width: `${(t / dur) * 100}%` }} />
        </div>
      </div>
      {s.art && <img className="ew-au-art" src={resolveImg(s.art)} alt="" draggable={false} />}
    </div>
  );
}

const audioPlayer: WidgetDef = {
  type: "audio-player",
  title: "پخش‌کنندهٔ صوت",
  icon: Music,
  category: "media",
  keywords: "audio player music صوت",
  defaults: { title: "پادکست ولور — قسمت ۴", duration: 180, art: "stock:atelier" },
  sections: [
    sec("c", "قطعه", "content", [txt("title", "عنوان"), num("duration", "مدت (ثانیه)"), img("art", "کاور")]),
    sec("s", "استایل", "style", [clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-audio": "background-color:{{VALUE}};" }), clr("btn", "رنگ دکمه", { "{{WRAPPER}} .ew-au-btn": "background-color:{{VALUE}};" }), clr("fill", "رنگ نوار", { "{{WRAPPER}} .ew-au-fill": "background-color:{{VALUE}};" }), ...borderCtls("au", "{{WRAPPER}} .ew-audio")]),
  ],
  render: ({ s }) => <AudioPlayer s={s} />,
};

const videoGallery: WidgetDef = {
  type: "video-gallery",
  title: "گالری ویدیو",
  icon: Tv,
  category: "media",
  keywords: "video gallery youtube گالری ویدیو",
  defaults: {
    cols: 3,
    gap: 14,
    items: [
      { image: "stock:hero", title: "پشت صحنهٔ رانوی", url: "https://www.youtube.com/watch?v=ysz5S6PUM-U" },
      { image: "stock:atelier", title: "یک روز در آتلیه", url: "https://vimeo.com/76979871" },
      { image: "stock:campaign", title: "کمپین کشمیر", url: "" },
    ],
  },
  sections: [
    sec("c", "ویدیوها", "content", [
      rep("items", "ویدیوها", [img("image", "کاور"), txt("title", "عنوان"), url("url", "لینک ویدیو")], { image: "stock:hero", title: "ویدیو", url: "" }, "title"),
      num("cols", "ستون‌ها", { responsive: true, min: 1, max: 6 }),
      slider("gap", "فاصله", 0, 40, { "{{WRAPPER}} .ew-vg": "gap:{{VALUE}}px;" }, { default: 14 }),
    ]),
    sec("s", "استایل", "style", [clr("ov", "رنگ لایه", { "{{WRAPPER}} .ew-vg-item::after": "background-color:{{VALUE}};" }), clr("pc", "رنگ دکمهٔ پخش", { "{{WRAPPER}} .ew-vg-play": "background-color:{{VALUE}};" }), ...borderCtls("vg", "{{WRAPPER}} .ew-vg-item")]),
  ],
  render: ({ s }) => (
    <div className="ew-vg" style={{ ["--ew-cols" as string]: String(s.cols || 3), gap: `${Number(s.gap) || 14}px` }}>
      {(s.items ?? []).map((it: any, i: number) => (
        <a key={i} href={it.url || "#"} className="ew-vg-item" style={{ backgroundImage: `url("${resolveImg(it.image) || PLACEHOLDER}")` }}>
          <span className="ew-vg-play">
            <Play width={22} height={22} fill="currentColor" />
          </span>
          <span className="ew-vg-cap">{it.title}</span>
        </a>
      ))}
    </div>
  ),
};

const thumbGallery: WidgetDef = {
  type: "thumb-gallery",
  title: "گالری بندانگشتی",
  icon: SquareStack,
  category: "media",
  keywords: "thumb gallery thumbnails گالری",
  defaults: { main: "stock:look1", thumbs: ["stock:look1", "stock:look2", "stock:look3", "stock:look4"], pos: "bottom" },
  sections: [
    sec("c", "تصاویر", "content", [img("main", "تصویر اصلی"), { key: "thumbs", label: "بندانگشتی‌ها", type: "images" }, sel("pos", "جای بندانگشتی‌ها", [["bottom", "پایین"], ["start", "راست"], ["end", "چپ"]])]),
    sec("s", "استایل", "style", [slider("thumbW", "عرض بندانگشتی", 40, 180, { "{{WRAPPER}} .ew-tg-thumb": "width:{{VALUE}}px;" }, { default: 92 }), clr("on", "رنگ قاب فعال", { "{{WRAPPER}} .ew-tg-thumb.is-on": "border-color:{{VALUE}};" }), ...borderCtls("tg", "{{WRAPPER}} .ew-tg-main img")]),
  ],
  render: ({ s }) => {
    const [i, setI] = useState(0);
    const thumbs: string[] = (s.thumbs ?? []).filter(Boolean);
    const src = resolveImg(thumbs[i] ?? s.main) || PLACEHOLDER;
    return (
      <div className={`ew-tg pos-${s.pos || "bottom"}`}>
        <div className="ew-tg-main">
          <img src={src} alt="" draggable={false} />
        </div>
        {thumbs.length > 0 && (
          <div className="ew-tg-list">
            {thumbs.map((u, n) => (
              <button key={n} type="button" className={`ew-tg-thumb ${n === i ? "is-on" : ""}`} onClick={() => setI(n)} aria-label={`تصویر ${n + 1}`}>
                <img src={resolveImg(u)} alt="" draggable={false} />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  },
};

function DeviceSliderView({ s }: { s: Record<string, any> }) {
  const imgs: string[] = (s.images ?? []).filter(Boolean);
  return (
    <div className={`ew-device is-${s.device || "laptop"}`}>
      <div className="ew-device-screen">
        <Carousel fade autoplay={!!s.autoplay} arrows={false} dots items={imgs.map((u, i) => <img key={i} src={resolveImg(u)} alt="" draggable={false} />)} />
      </div>
    </div>
  );
}

const deviceSlider: WidgetDef = {
  type: "device-slider",
  title: "اسلایدر در دستگاه",
  icon: Monitor,
  category: "media",
  keywords: "device slider mockup دستگاه",
  defaults: { device: "laptop", autoplay: true, images: ["stock:hero", "stock:campaign", "stock:atelier"] },
  presets: [preset("laptop", "لپ‌تاپ", { device: "laptop" }), preset("phone", "موبایل", { device: "phone" }), preset("tablet", "تبلت", { device: "tablet" })],
  sections: [
    sec("c", "دستگاه", "content", [sel("device", "نوع دستگاه", [["laptop", "لپ‌تاپ"], ["phone", "موبایل"], ["tablet", "تبلت"]]), { key: "images", label: "تصاویر", type: "images" }, sw("autoplay", "پخش خودکار", { default: true })]),
    sec("s", "استایل", "style", [slider("width", "عرض", 200, 1000, { "{{WRAPPER}} .ew-device": "max-width:{{VALUE}}px;" }, { default: 620, responsive: true }), clr("frame", "رنگ بدنه", { "{{WRAPPER}} .ew-device": "border-color:{{VALUE}};" })]),
  ],
  render: ({ s }) => <DeviceSliderView s={s} />,
};

/* ================================================================== */
/* charts & data                                                       */
/* ================================================================== */

function BarChart({ s }: { s: Record<string, any> }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const items: any[] = s.items ?? [];
  const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
  return (
    <div className="ew-chart is-bar" ref={ref}>
      {items.map((it, i) => (
        <div key={i} className="ew-bar-col" title={`${it.label}: ${faNum(it.value)}`}>
          <div className="ew-bar-fill" style={{ height: seen ? `${((Number(it.value) || 0) / max) * 100}%` : 0 }} />
          <span className="ew-bar-label">{it.label}</span>
          <span className="ew-bar-value">{faNum(it.value)}</span>
        </div>
      ))}
    </div>
  );
}

const charts: WidgetDef = {
  type: "charts",
  title: "نمودار ستونی",
  icon: BarChart3,
  category: "dynamic",
  keywords: "chart graph bar نمودار",
  defaults: {
    items: [
      { label: "بهار", value: 42 },
      { label: "تابستان", value: 65 },
      { label: "پاییز", value: 88 },
      { label: "زمستان", value: 74 },
    ],
  },
  presets: [preset("bars", "ستونی", { chartType: "bar" }, "کلاسیک"), preset("tall", "بلند", { height: 320 }, "ارتفاع بیشتر")],
  sections: [
    sec("c", "داده‌ها", "content", [rep("items", "داده‌ها", [txt("label", "برچسب"), num("value", "مقدار")], { label: "داده", value: 0 }, "label")]),
    sec("s", "استایل", "style", [
      slider("height", "ارتفاع", 140, 520, { "{{WRAPPER}} .ew-chart": "height:{{VALUE}}px;" }, { responsive: true, default: 260 }),
      clr("bar", "رنگ ستون", { "{{WRAPPER}} .ew-bar-fill": "background-color:{{VALUE}};" }),
      clr("label", "رنگ برچسب", { "{{WRAPPER}} .ew-bar-label": "color:{{VALUE}};" }),
      slider("gap", "فاصلهٔ ستون‌ها", 4, 60, { "{{WRAPPER}} .ew-chart": "gap:{{VALUE}}px;" }, { default: 18 }),
    ]),
  ],
  render: ({ s }) => <BarChart s={s} />,
};

function ProgressPie({ s }: { s: Record<string, any> }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const pct = Math.max(0, Math.min(100, Number(s.percent) || 0));
  const r = 54;
  const c = 2 * Math.PI * r;
  return (
    <div className="ew-pie" ref={ref}>
      <svg viewBox="0 0 140 140" width={Number(s.size) || 160} height={Number(s.size) || 160}>
        <circle cx="70" cy="70" r={r} fill="none" strokeWidth={Number(s.weight) || 10} className="ew-pie-track" />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          strokeWidth={Number(s.weight) || 10}
          className="ew-pie-fill"
          strokeDasharray={c}
          strokeDashoffset={seen ? c - (c * pct) / 100 : c}
          transform="rotate(-90 70 70)"
        />
        <text x="70" y="76" textAnchor="middle" className="ew-pie-text">
          {faNum(pct)}٪
        </text>
      </svg>
      {s.title && <div className="ew-pie-title">{s.title}</div>}
    </div>
  );
}

const progressPie: WidgetDef = {
  type: "progress-pie",
  title: "دایرهٔ پیشرفت",
  icon: Gauge,
  category: "dynamic",
  keywords: "progress pie circle percent دایره",
  defaults: { percent: 78, title: "رضایت مشتریان", size: 160, weight: 10 },
  sections: [
    sec("c", "درصد", "content", [slider("percent", "درصد", 0, 100, undefined, { unit: "%" }), txt("title", "عنوان"), alignFlex("align", "{{WRAPPER}} .ew-pie")]),
    sec("s", "استایل", "style", [
      slider("size", "اندازه", 90, 340, { "{{WRAPPER}} .ew-pie svg": "width:{{VALUE}}px;height:{{VALUE}}px;" }, { default: 160 }),
      slider("weight", "ضخامت خط", 4, 30, undefined, { default: 10 }),
      clr("fill", "رنگ پیشرفت", { "{{WRAPPER}} .ew-pie-fill": "stroke:{{VALUE}};" }),
      clr("track", "رنگ مسیر", { "{{WRAPPER}} .ew-pie-track": "stroke:{{VALUE}};" }),
      clr("tc", "رنگ متن", { "{{WRAPPER}} .ew-pie-text": "fill:{{VALUE}};" }),
    ]),
  ],
  render: ({ s }) => <ProgressPie s={s} />,
};

/* ================================================================== */
/* layout & utility                                                    */
/* ================================================================== */

const advancedHeading: WidgetDef = {
  type: "advanced-heading",
  title: "عنوان پیشرفته",
  icon: LayoutPanelLeft,
  category: "layout",
  keywords: "heading title advanced عنوان",
  defaults: { badge: "جدید", title: "خرید بر اساس استایل", sub: "شش اگزیت روی رانوی تعاملی", align: "center", tag: "h2" },
  presets: [
    preset("center", "وسط با برچسب", { align: "center", badge: "جدید" }, "کلاسیک مدرن"),
    preset("start", "راست‌چین", { align: "start", badge: "" }, "ساده"),
    preset("outline", "متن خط‌خورده", { align: "center", deco: "line-through" }, "جسورانه"),
  ],
  sections: [
    sec("c", "عنوان", "content", [
      txt("badge", "برچسب بالای عنوان"),
      area("title", "عنوان", { rows: 2 }),
      txt("sub", "زیرعنوان"),
      sel("tag", "تگ", [["h1", "H1"], ["h2", "H2"], ["h3", "H3"], ["div", "div"]]),
      alignText("align", "{{WRAPPER}} .ew-ahd"),
      url("link"),
    ]),
    sec("s", "استایل", "style", [
      clr("bc", "رنگ برچسب", { "{{WRAPPER}} .ew-ahd-badge": "color:{{VALUE}};" }),
      clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-ahd-title": "color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-ahd-title"),
      clr("sc", "رنگ زیرعنوان", { "{{WRAPPER}} .ew-ahd-sub": "color:{{VALUE}};" }),
      ...typo("s", "{{WRAPPER}} .ew-ahd-sub"),
      clr("deco", "رنگ خط زیر عنوان", { "{{WRAPPER}} .ew-ahd-title::after": "background-color:{{VALUE}};" }),
      sw("showLine", "خط زیر عنوان", { selectors: { "{{WRAPPER}} .ew-ahd-title::after": "content:'';display:block;width:56px;height:2px;margin:14px auto 0;" } }),
    ]),
  ],
  render: ({ s }) => {
    const Tag = (s.tag || "h2") as "h2";
    return (
      <div className="ew-ahd">
        {s.badge && <span className="ew-ahd-badge">{s.badge}</span>}
        <Tag className="ew-ahd-title">
          {s.link ? (
            <a href={href(s.link) || "#"} style={{ color: "inherit", textDecoration: "none" }}>
              {s.title}
            </a>
          ) : (
            s.title
          )}
        </Tag>
        {s.sub && <p className="ew-ahd-sub">{s.sub}</p>}
      </div>
    );
  },
};

const advancedDivider: WidgetDef = {
  type: "advanced-divider",
  title: "جداکنندهٔ پیشرفته",
  icon: Zap,
  category: "layout",
  keywords: "divider separator advanced جداکننده",
  defaults: { style: "wave", width: 100, height: 60, color: "#c2b09a" },
  presets: [preset("wave", "موج", { style: "wave" }), preset("curve", "منحنی", { style: "curve" }), preset("tilt", "کج", { style: "tilt" }), preset("arrow", "فلش", { style: "arrow" })],
  sections: [
    sec("c", "شکل", "content", [
      sel("style", "شکل", [["wave", "موج"], ["curve", "منحنی"], ["tilt", "کج"], ["arrow", "فلش"], ["triangle", "مثلث"], ["zigzag", "زیگزاگ"]]),
      slider("width", "عرض", 20, 100, { "{{WRAPPER}} .ew-adv svg": "width:{{VALUE}}%;" }, { unit: "%", default: 100 }),
      slider("height", "ارتفاع", 20, 240, { "{{WRAPPER}} .ew-adv svg": "height:{{VALUE}}px;" }, { default: 60 }),
      alignFlex("align", "{{WRAPPER}}"),
    ]),
    sec("s", "استایل", "style", [clr("color", "رنگ", { "{{WRAPPER}} .ew-adv path": "fill:{{VALUE}};" }), clr("flip", "پس‌زمینهٔ پایین", { "{{WRAPPER}} .ew-adv path:last-child": "fill:{{VALUE}};" })]),
  ],
  render: ({ s }) => {
    const d: Record<string, string> = {
      wave: "M0,60 C200,0 400,120 600,60 C800,0 1000,120 1200,60 L1200,120 L0,120 Z",
      curve: "M0,0 C300,120 900,120 1200,0 L1200,120 L0,120 Z",
      tilt: "M0,120 L1200,0 L1200,120 Z",
      arrow: "M0,120 L560,120 L600,50 L640,120 L1200,120 Z",
      triangle: "M0,120 L600,0 L1200,120 Z",
      zigzag: "M0,120 L100,60 L200,120 L300,60 L400,120 L500,60 L600,120 L700,60 L800,120 L900,60 L1000,120 L1100,60 L1200,120 Z",
    };
    return (
      <div className="ew-adv">
        <svg viewBox="0 0 1200 120" preserveAspectRatio="none">
          <path d={d[s.style || "wave"]} />
        </svg>
      </div>
    );
  },
};

const iconNav: WidgetDef = {
  type: "icon-nav",
  title: "ناوبری آیکنی",
  icon: Bookmark,
  category: "layout",
  keywords: "icon nav quick links ناوبری",
  defaults: {
    cols: 4,
    items: [
      { icon: "ShoppingBag", title: "فروشگاه", link: "/products" },
      { icon: "Layers", title: "استایل‌ها", link: "/style" },
      { icon: "BookOpen", title: "ژورنال", link: "/journal" },
      { icon: "Users", title: "دربارهٔ ما", link: "/about" },
    ],
  },
  sections: [
    sec("c", "آیتم‌ها", "content", [rep("items", "آیتم‌ها", [icn("icon"), txt("title", "عنوان"), url("link")], { icon: "Star", title: "آیتم", link: "" }, "title"), num("cols", "ستون‌ها", { responsive: true, min: 2, max: 8 })]),
    sec("s", "استایل", "style", [num("iconSize", "اندازهٔ آیکن", { selectors: { "{{WRAPPER}} .ew-card-ic svg": "width:{{VALUE}}px;height:{{VALUE}}px;" } }), clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-card": "background-color:{{VALUE}};" }), ...borderCtls("in", "{{WRAPPER}} .ew-card")]),
  ],
  render: ({ s }) => (
    <div className="ew-cards is-grid" style={{ ["--ew-cols" as string]: String(s.cols || 4) }}>
      {(s.items ?? []).map((it: any, i: number) => (
        <a key={i} href={href(it.link) || "#"} className="ew-card v-icon">
          <div className="ew-card-body is-center">
            <span className="ew-card-ic">
              <IconView name={it.icon} size={22} />
            </span>
            <h4 className="ew-card-title">{it.title}</h4>
          </div>
        </a>
      ))}
    </div>
  ),
};

const scrollNav: WidgetDef = {
  type: "scroll-nav",
  title: "منوی اسکرولی",
  icon: AlignJustify,
  category: "layout",
  keywords: "scroll nav one page منو",
  defaults: { sticky: true, items: [{ title: "معرفی", id: "intro" }, { title: "محصولات", id: "shop" }, { title: "نظرات", id: "reviews" }, { title: "تماس", id: "contact" }] },
  sections: [
    sec("c", "لینک‌ها", "content", [rep("items", "لینک‌ها", [txt("title", "عنوان"), txt("id", "شناسهٔ مقصد")], { title: "بخش", id: "" }, "title"), sw("sticky", "چسبان به بالای صفحه", { default: true })]),
    sec("s", "استایل", "style", [clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-snav": "background-color:{{VALUE}};" }), clr("c", "رنگ متن", { "{{WRAPPER}} .ew-snav a": "color:{{VALUE}};" }), ...typo("t", "{{WRAPPER}} .ew-snav a")]),
  ],
  render: ({ s, editing }) => (
    <nav className={`ew-snav ${s.sticky && !editing ? "is-sticky" : ""}`}>
      {(s.items ?? []).map((it: any, i: number) => (
        <a
          key={i}
          href="#"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(it.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          {it.title}
        </a>
      ))}
    </nav>
  ),
};

const sourceCode: WidgetDef = {
  type: "source-code",
  title: "بلوک کد",
  icon: FileCode,
  category: "media",
  keywords: "code snippet source کد",
  defaults: { code: "const look = {\n  name: 'Noir Architecture',\n  pieces: 5,\n};", lang: "js", showLine: true },
  sections: [
    sec("c", "کد", "content", [{ key: "code", label: "کد", type: "code", rows: 10 }, sel("lang", "زبان (نمایشی)", [["js", "JavaScript"], ["ts", "TypeScript"], ["css", "CSS"], ["html", "HTML"], ["json", "JSON"]]), sw("showLine", "شمارهٔ خط", { default: true })]),
    sec("s", "استایل", "style", [clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-code": "background-color:{{VALUE}};" }), clr("c", "رنگ متن", { "{{WRAPPER}} .ew-code": "color:{{VALUE}};" }), ...typo("t", "{{WRAPPER}} .ew-code")]),
  ],
  render: ({ s }) => (
    <pre className="ew-code" dir="ltr">
      <code>{String(s.code ?? "")}</code>
    </pre>
  ),
};

const iframeW: WidgetDef = {
  type: "iframe",
  title: " iframe (کد جاگذاری)",
  icon: Columns3,
  category: "media",
  keywords: "iframe embed html embed",
  defaults: { url: "https://www.openstreetmap.org/export/embed.html?bbox=2.29%2C48.85%2C2.33%2C48.87", height: 320 },
  sections: [
    sec("c", "آدرس", "content", [url("url", "آدرس iframe"), slider("height", "ارتفاع", 120, 900, { "{{WRAPPER}} .ew-ifr iframe": "height:{{VALUE}}px;" }, { responsive: true, default: 320 })]),
    sec("s", "استایل", "style", [...borderCtls("ifr", "{{WRAPPER}} .ew-ifr")]),
  ],
  render: ({ s }) => (
    <div className="ew-ifr">
      <iframe src={s.url} title="محتوای جاگذاری‌شده" loading="lazy" />
    </div>
  ),
};

const darkModeSwitch: WidgetDef = {
  type: "dark-mode",
  title: "کلید تم تاریک",
  icon: Contrast,
  category: "layout",
  keywords: "dark mode theme switch تم",
  defaults: { label: "تم تاریک", style: "switch" },
  sections: [
    sec("c", "کلید", "content", [txt("label", "برچسب"), sel("style", "سبک", [["switch", "کلید"], ["button", "دکمه"]]), alignFlex("align", "{{WRAPPER}} .ew-dm-wrap")]),
    sec("s", "استایل", "style", [clr("on", "رنگ فعال", { "{{WRAPPER}} .ew-dm.is-on": "background-color:{{VALUE}};" }), clr("off", "رنگ غیرفعال", { "{{WRAPPER}} .ew-dm": "background-color:{{VALUE}};" })]),
  ],
  render: ({ s }) => {
    const { theme, themes, setTheme } = useTheme();
    const dark = theme.id === "noir" || theme.id === "cyber";
    const toggle = () => setTheme(dark ? "soft" : "noir");
    return (
      <div className="ew-dm-wrap">
        <button type="button" className={`ew-dm ${dark ? "is-on" : ""} ${s.style === "button" ? "is-btn" : ""}`} role="switch" aria-checked={dark} aria-label={s.label || "تم تاریک"} onClick={toggle}>
          {s.style === "button" ? (
            <>
              {dark ? <Sun width={15} height={15} /> : <Contrast width={15} height={15} />}
              {s.label}
            </>
          ) : (
            <span className="ew-dm-knob">{dark ? <Sun width={12} height={12} /> : <Moon width={12} height={12} />}</span>
          )}
        </button>
        {themes.length > 2 && <span className="ew-dm-note">{themes.length.toLocaleString("fa-IR")} تم سایت موجود است</span>}
      </div>
    );
  },
};

const backToTop: WidgetDef = {
  type: "back-to-top",
  title: "بازگشت به بالا",
  icon: ArrowUp,
  category: "layout",
  keywords: "back to top scroll بالا",
  defaults: { fixed: true, label: "بالا", showLabel: false },
  sections: [
    sec("c", "دکمه", "content", [sw("fixed", "ثابت در گوشهٔ صفحه", { default: true }), sw("showLabel", "نمایش متن"), txt("label", "متن"), slider("offset", "فاصله از پایین", 10, 120, undefined, { default: 22 })]),
    sec("s", "استایل", "style", [clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-tt": "background-color:{{VALUE}};" }), clr("c", "رنگ", { "{{WRAPPER}} .ew-tt": "color:{{VALUE}};" }), slider("size", "اندازه", 32, 72, { "{{WRAPPER}} .ew-tt": "width:{{VALUE}}px;height:{{VALUE}}px;" }, { default: 44 }), ...borderCtls("tt", "{{WRAPPER}} .ew-tt")]),
  ],
  render: ({ s, editing }) => {
    const [show, setShow] = useState(!!editing);
    useEffect(() => {
      const f = () => setShow(window.scrollY > 400 || editing);
      f();
      window.addEventListener("scroll", f, { passive: true });
      return () => window.removeEventListener("scroll", f);
    }, [editing]);
    if (!show) return null;
    return (
      <button type="button" className={`ew-tt ${s.fixed && !editing ? "is-fixed" : ""}`} aria-label="بازگشت به بالا" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
        <ArrowUp width={18} height={18} />
        {s.showLabel && <span>{s.label}</span>}
      </button>
    );
  },
};

const newsTicker: WidgetDef = {
  type: "news-ticker",
  title: "تیکر خبری",
  icon: Zap,
  category: "dynamic",
  keywords: "ticker marquee news تیکر",
  defaults: { label: "تازه‌ها", speed: 26, items: [{ text: "ارسال رایگان بالای ۲۰۰٬۰۰۰ تومان", link: "/products" }, { text: "کالکشن AW26 رسید", link: "/landing" }, { text: "کد VELOURS10 برای تخفیف", link: "" }] },
  sections: [
    sec("c", "اخبار", "content", [txt("label", "برچسب"), rep("items", "مورد", [txt("text", "متن"), url("link")], { text: "خبر", link: "" }, "text"), num("speed", "سرعت (ثانیه)", { min: 8, max: 90 })]),
    sec("s", "استایل", "style", [clr("labelBg", "پس‌زمینهٔ برچسب", { "{{WRAPPER}} .ew-tk-label": "background-color:{{VALUE}};" }), clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-ticker": "background-color:{{VALUE}};" }), ...typo("t", "{{WRAPPER}} .ew-tk-item")]),
  ],
  render: ({ s }) => (
    <div className="ew-ticker">
      {s.label && <span className="ew-tk-label">{s.label}</span>}
      <div className="ew-tk-viewport" dir="ltr">
        <div className="ew-tk-track" style={{ animationDuration: `${Number(s.speed) || 26}s` }}>
          {[0, 1].map((copy) => (
            <div key={copy} className="ew-tk-group" aria-hidden={copy === 1} dir="rtl">
              {(s.items ?? []).map((it: any, i: number) => (
                <a key={i} href={href(it.link) || "#"} className="ew-tk-item">
                  {it.text}
                </a>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  ),
};

const weather: WidgetDef = {
  type: "weather",
  title: "آب‌وهوا",
  icon: Wind,
  category: "dynamic",
  keywords: "weather climate آب و هوا",
  defaults: { city: "پاریس", temp: 14, cond: "ابری", icon: "Cloud", unit: "°C" },
  sections: [
    sec("c", "شهر", "content", [txt("city", "شهر"), num("temp", "دمای نمایشی"), txt("cond", "وضعیت"), icn("icon"), sel("unit", "واحد", [["°C", "سلسیوس"], ["°F", "فارنهایت"]])]),
    sec("s", "استایل", "style", [clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-weather": "background-color:{{VALUE}};" }), clr("tc", "رنگ دما", { "{{WRAPPER}} .ew-w-temp": "color:{{VALUE}};" }), ...typo("t", "{{WRAPPER}} .ew-w-city"), ...borderCtls("wt", "{{WRAPPER}} .ew-weather")]),
  ],
  render: ({ s }) => (
    <div className="ew-weather">
      <IconView name={s.icon || "Cloud"} size={34} />
      <div>
        <div className="ew-w-temp">
          {faNum(s.temp)}
          {s.unit}
        </div>
        <div className="ew-w-city">{s.city}</div>
        <small>{s.cond}</small>
      </div>
    </div>
  ),
};

const protectedContent: WidgetDef = {
  type: "protected-content",
  title: "محتوای محافظت‌شده",
  icon: Bookmark,
  category: "pro",
  keywords: "protected content password محافظت",
  defaults: { password: "1234", message: "برای مشاهدهٔ این بخش رمز را وارد کن.", placeholder: "رمز", content: "<p>محتوای مخفی اینجا قرار دارد.</p>" },
  sections: [
    sec("c", "محتوا", "content", [txt("password", "رمز (نمایشی)"), area("message", "پیام"), txt("placeholder", "راهنمای ورودی"), { key: "content", label: "محتوای محافظت‌شده (HTML)", type: "code", rows: 6 }]),
    sec("s", "استایل", "style", [clr("bg", "پس‌زمینهٔ قفل", { "{{WRAPPER}} .ew-lock": "background-color:{{VALUE}};" })]),
  ],
  render: ({ s, editing }) => {
    const [ok, setOk] = useState(!!editing);
    const [v, setV] = useState("");
    if (ok) return <div dangerouslySetInnerHTML={{ __html: s.content ?? "" }} />;
    return (
      <form
        className="ew-lock"
        onSubmit={(e) => {
          e.preventDefault();
          if (v === s.password) setOk(true);
        }}
      >
        <p>{s.message}</p>
        <input value={v} onChange={(e) => setV(e.target.value)} placeholder={s.placeholder} aria-label="رمز" />
        <button type="submit" className="ew-btn ew-btn--sm">
          نمایش
        </button>
      </form>
    );
  },
};

const scheduleContent: WidgetDef = {
  type: "schedule-content",
  title: "محتوای زمان‌بندی‌شده",
  icon: Trash2,
  category: "pro",
  keywords: "schedule time content زمان بندی",
  defaults: { from: "", to: "", message: "این بخش فقط در بازهٔ تعیین‌شده نمایش داده می‌شود.", content: "<p>محتوای زمان‌بندی‌شده.</p>" },
  sections: [
    sec("c", "زمان", "content", [
      { key: "from", label: "از تاریخ", type: "datetime" },
      { key: "to", label: "تا تاریخ", type: "datetime" },
      area("message", "پیام خارج از بازه"),
      { key: "content", label: "محتوا (HTML)", type: "code", rows: 6 },
    ]),
  ],
  render: ({ s, editing }) => {
    const now = Date.now();
    const from = s.from ? new Date(s.from).getTime() : -Infinity;
    const to = s.to ? new Date(s.to).getTime() : Infinity;
    const on = now >= from && now <= to;
    if (on || editing) return <div dangerouslySetInnerHTML={{ __html: s.content ?? "" }} />;
    return <div className="ew-empty">{s.message}</div>;
  },
};

/* ---- more list widgets via factory ---- */
const priceMenu = makeCardWidget({
  type: "price-menu",
  title: "منوی قیمت",
  icon: Quote,
  category: "pro",
  variant: "price",
  keywords: "price menu list منو قیمت",
  layouts: ["list", "grid"],
  items: [
    { title: "تنظیم سایز اختصاصی", price: "۸۰۰٬۰۰۰ تومان", desc: "اصلاح فرم روی بدن.", image: "" },
    { title: "بسته‌بندی هدیه", price: "۱۵۰٬۰۰۰ تومان", desc: "جعبهٔ دست‌ساز با کارت.", image: "" },
    { title: "مشاورهٔ استایل", price: "رایگان", desc: "یک ساعت با تیم.", image: "" },
  ],
  itemFields: [],
  presets: [P.list(), P.grid2(), P.minimal()],
});

const testimonialGrid = makeCardWidget({
  type: "testimonial-grid",
  title: "شبکهٔ نظرات",
  icon: Quote,
  category: "social",
  variant: "profile",
  keywords: "testimonial grid reviews نظر",
  items: [
    { image: "stock:campaign", name: "آوا رادمهر", role: "طراح داخلی", desc: "کیفیت پارچه و دوخت فوق‌العاده بود.", linkText: "", link: "" },
    { image: "", name: "سارا نیکخواه", role: "معمار", desc: "سایز را راحت انتخاب کردم.", linkText: "", link: "" },
    { image: "", name: "میلاد صالحی", role: "عکاس", desc: "کیف چرمی هنوز مثل روز اول است.", linkText: "", link: "" },
  ],
  itemFields: [],
  presets: [P.grid3(), P.grid2(), P.list(), P.soft(), P.glass()],
});

const fancyList = makeCardWidget({
  type: "fancy-list",
  title: "لیست فانتزی",
  icon: Bookmark,
  category: "layout",
  variant: "icon",
  keywords: "fancy list stylish list لیست",
  layouts: ["grid", "list"],
  defaults: { cols: 2 },
  items: [
    { icon: "Check", title: "پارچهٔ طبیعی", desc: "بیش از ۹۰٪ کالکشن." },
    { icon: "Truck", title: "ارسال سریع", desc: "۲ تا ۴ روز کاری." },
    { icon: "ShieldCheck", title: "ضمانت اصالت", desc: "ساخت ولور." },
    { icon: "Undo2", title: "مرجوعی آسان", desc: "تا ۱۴ روز." },
  ],
  itemFields: [],
  presets: [P.grid2(), P.grid4(), P.list(), P.minimal()],
});

const whyChooseUs = makeCardWidget({
  type: "why-choose-us",
  title: "چرا ما را انتخاب کنی",
  icon: Maximize2,
  category: "pro",
  variant: "icon",
  keywords: "why choose us benefits چرا",
  items: [
    { icon: "Gem", title: "کیفیت بی‌compromise", desc: "پارچهٔ طبیعی و دوخت دستی." },
    { icon: "Users", title: "تیم متخصص", desc: "۱۲ سال تجربهٔ طراحی." },
    { icon: "Globe", title: "ارسال جهانی", desc: "به ۳۰ کشور." },
  ],
  itemFields: [],
  presets: [P.grid3(), P.soft(), P.glass(), P.dark()],
});

const galleryMasonry: WidgetDef = {
  type: "gallery-masonry",
  title: "گالری موزاییکی",
  icon: ImageIcon,
  category: "media",
  keywords: "masonry gallery grid گالری",
  defaults: { cols: 3, gap: 10, lightbox: true, images: ["stock:hero", "stock:campaign", "stock:atelier", "stock:look1", "stock:look3", "stock:look5", "stock:look6"] },
  sections: [
    sec("c", "تصاویر", "content", [{ key: "images", label: "تصاویر", type: "images" }, num("cols", "ستون‌ها", { responsive: true, min: 1, max: 6 }), slider("gap", "فاصله", 0, 40, { "{{WRAPPER}} .ew-masonry": "gap:{{VALUE}}px;" }, { default: 10 }), sw("lightbox", "نمایش بزرگ", { default: true })]),
    sec("s", "استایل", "style", [...borderCtls("ms", "{{WRAPPER}} .ew-masonry figure")]),
  ],
  render: ({ s }) => {
    const [open, setOpen] = useState<number | null>(null);
    const imgs: string[] = (s.images ?? []).filter(Boolean);
    const ratios = ["4/5", "1/1", "3/4", "4/3", "1/1", "4/5"];
    return (
      <>
        <div className="ew-masonry" style={{ ["--ew-cols" as string]: String(s.cols || 3), gap: `${Number(s.gap) || 10}px` }}>
          {imgs.map((u, i) => (
            <figure key={i} style={{ aspectRatio: ratios[i % ratios.length] }}>
              <button type="button" onClick={() => s.lightbox !== false && setOpen(i)} aria-label={`تصویر ${i + 1}`}>
                <img src={resolveImg(u)} alt="" loading="lazy" draggable={false} />
              </button>
            </figure>
          ))}
        </div>
        {open !== null && (
          <div className="ew-lightbox" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
            <img src={resolveImg(imgs[open])} alt="" />
          </div>
        )}
      </>
    );
  },
};

export const WIDGETS_E: WidgetDef[] = [
  imageMagnifier,
  viewer360,
  audioPlayer,
  videoGallery,
  thumbGallery,
  deviceSlider,
  charts,
  progressPie,
  advancedHeading,
  advancedDivider,
  iconNav,
  scrollNav,
  sourceCode,
  iframeW,
  darkModeSwitch,
  backToTop,
  newsTicker,
  weather,
  protectedContent,
  scheduleContent,
  priceMenu,
  testimonialGrid,
  fancyList,
  whyChooseUs,
  galleryMasonry,
];
