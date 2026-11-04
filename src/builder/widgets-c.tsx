import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowLeftRight,
  Award,
  Boxes,
  CircleDot,
  Expand,
  Layers2,
  Link2,
  ListOrdered,
  MousePointer2,
  MoveRight,
  Type,
  Repeat2,
  Sparkles,
  Split,
  Users,
  Eye,
  TrendingUp,
  Wand2,
  Droplets,
  Hash,
} from "lucide-react";
import {
  alignFlex,
  alignText,
  area,
  borderCtls,
  clr,
  dims,
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

import { IconView, faNum, useInView } from "./kit";
import { PLACEHOLDER, resolveImg } from "./stock";
import { P, makeCardWidget } from "./factory";

/* ================================================================== */
/* creative / interactive                                              */
/* ================================================================== */

function CompareView({ s }: { s: Record<string, any> }) {
  const [x, setX] = useState(50);
  const move = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setX(Math.max(0, Math.min(100, ((r.right - e.clientX) / r.width) * 100))); // RTL
  };
  return (
    <div className="ew-compare" onMouseMove={move} onTouchMove={(e) => move(e as unknown as React.MouseEvent<HTMLDivElement>)} style={{ aspectRatio: s.ratio || "4/3" }}>
      <img className="ew-cp-after" src={resolveImg(s.after) || PLACEHOLDER} alt="" draggable={false} />
      <div className="ew-cp-before" style={{ width: `${x}%` }}>
        <img src={resolveImg(s.before) || PLACEHOLDER} alt="" draggable={false} />
      </div>
      <span className="ew-cp-handle" style={{ right: `calc(${x}% - 18px)` }}>
        <ArrowLeftRight width={16} height={16} />
      </span>
      {s.labelBefore && <span className="ew-cp-tag is-before">{s.labelBefore}</span>}
      {s.labelAfter && <span className="ew-cp-tag is-after">{s.labelAfter}</span>}
    </div>
  );
}

const imageCompare: WidgetDef = {
  type: "image-compare",
  title: "مقایسهٔ تصویر",
  icon: ArrowLeftRight,
  category: "creative",
  keywords: "compare before after مقایسه",
  defaults: { before: "stock:campaign", after: "stock:atelier", labelBefore: "قبل", labelAfter: "بعد", ratio: "4/3" },
  presets: [
    preset("split", "شکاف عمودی", { ratio: "4/3", handleColor: "#16130f" }, "کلاسیک قبل/بعد"),
    preset("tall", "عمودی بلند", { ratio: "3/4", handleColor: "#8c4a2f" }, "مناسب پرتره"),
  ],
  sections: [
    sec("c", "تصاویر", "content", [img("before", "تصویر اول (قبل)"), img("after", "تصویر دوم (بعد)"), txt("labelBefore", "برچسب اول"), txt("labelAfter", "برچسب دوم"), sel("ratio", "نسبت", [["1/1", "۱:۱"], ["4/3", "۴:۳"], ["3/4", "۳:۴"], ["16/9", "۱۶:۹"]])]),
    sec("s", "استایل", "style", [clr("handleColor", "رنگ دستگیره", { "{{WRAPPER}} .ew-cp-handle": "background-color:{{VALUE}};" }), clr("tagBg", "پس‌زمینهٔ برچسب", { "{{WRAPPER}} .ew-cp-tag": "background-color:{{VALUE}};" }), ...borderCtls("cmp", "{{WRAPPER}} .ew-compare")]),
  ],
  render: ({ s }) => <CompareView s={s} />,
};

function HotspotView({ s, editing }: { s: Record<string, any>; editing: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const spots: any[] = s.spots ?? [];
  return (
    <div className="ew-hotspot" style={{ aspectRatio: s.ratio || "4/3", backgroundImage: `url("${resolveImg(s.image) || PLACEHOLDER}")` }}>
      {spots.map((sp, i) => (
        <div key={i} className="ew-hs-spot" style={{ right: `${sp.x}%`, bottom: `${sp.y}%` }}>
          <button
            type="button"
            aria-label={sp.title}
            onClick={() => !editing && setOpen(open === i ? null : i)}
            onMouseEnter={() => s.trigger === "hover" && setOpen(i)}
          >
            {sp.icon ? <IconView name={sp.icon} size={14} /> : faNum(i + 1)}
          </button>
          {open === i && (
            <div className="ew-hs-pop">
              <b>{sp.title}</b>
              {sp.desc && <p>{sp.desc}</p>}
            </div>
          )}
        </div>
      ))}
      {!spots.length && <div className="ew-empty">نقطه‌ای اضافه نشده است.</div>}
    </div>
  );
}

const hotspot: WidgetDef = {
  type: "hotspot",
  title: "نقاط تعاملی (Hotspot)",
  icon: CircleDot,
  category: "creative",
  keywords: "hotspot marker نقاط",
  defaults: {
    image: "stock:look1",
    trigger: "click",
    ratio: "4/3",
    spots: [
      { x: 30, y: 40, title: "پالتوی ریو", desc: "پشم ویرجین با آستر کامل.", icon: "Gem" },
      { x: 55, y: 20, title: "بافت مرینو", desc: "یقه‌لاک‌پشتی کشباف.", icon: "Shirt" },
    ],
  },
  presets: [
    preset("number", "شماره‌ای", { spotStyle: "number", spotBg: "#16130f" }, "دایره‌های شماره‌دار"),
    preset("icon", "آیکن‌دار", { spotStyle: "icon", spotBg: "#8c4a2f" }, "آیکن در هر نقطه"),
  ],
  sections: [
    sec("c", "تصویر و نقاط", "content", [
      img("image", "تصویر اصلی"),
      rep("spots", "نقاط", [slider("x", "موقعیت افقی", 0, 100, undefined, { unit: "%" }), slider("y", "موقعیت عمودی", 0, 100, undefined, { unit: "%" }), txt("title", "عنوان"), area("desc", "توضیح"), icn("icon")], { x: 50, y: 50, title: "نقطهٔ جدید", desc: "", icon: "" }, "title"),
      sel("trigger", "نمایش توضیح", [["click", "با کلیک"], ["hover", "با هاور"]]),
      sel("ratio", "نسبت تصویر", [["1/1", "۱:۱"], ["4/3", "۴:۳"], ["3/4", "۳:۴"], ["16/9", "۱۶:۹"]]),
    ]),
    sec("s", "استایل", "style", [
      slider("spotSize", "اندازهٔ نقطه", 16, 64, { "{{WRAPPER}} .ew-hs-spot button": "width:{{VALUE}}px;height:{{VALUE}}px;" }, { default: 30 }),
      clr("spotBg", "پس‌زمینهٔ نقطه", { "{{WRAPPER}} .ew-hs-spot button": "background-color:{{VALUE}};" }),
      clr("popBg", "پس‌زمینهٔ حباب", { "{{WRAPPER}} .ew-hs-pop": "background-color:{{VALUE}};" }),
      ...borderCtls("hs", "{{WRAPPER}} .ew-hs-spot button"),
    ]),
  ],
  render: ({ s, editing }) => <HotspotView s={s} editing={editing} />,
};

function TimelineView({ s }: { s: Record<string, any> }) {
  const items: any[] = s.items ?? [];
  return (
    <div className={`ew-timeline is-${s.side || "alternate"}`}>
      {items.map((it, i) => (
        <div key={i} className={`ew-tl-item ${i % 2 ? "is-alt" : ""}`}>
          <div className="ew-tl-dot">{it.icon ? <IconView name={it.icon} size={14} /> : null}</div>
          <div className="ew-tl-card">
            {it.date && <span className="ew-tl-date">{it.date}</span>}
            <h4 className="ew-tl-title">{it.title}</h4>
            {it.desc && <p className="ew-tl-desc">{it.desc}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

const timeline: WidgetDef = {
  type: "timeline",
  title: "خط زمانی",
  icon: ListOrdered,
  category: "creative",
  keywords: "timeline history خط زمانی",
  defaults: {
    side: "alternate",
    items: [
      { date: "۱۳۹۲", title: "آغاز آتلیه", desc: "شش قطعه و یک چرخ خیاطی.", icon: "Sparkles" },
      { date: "۱۳۹۸", title: "اولین رانوی", desc: "نمایش شش‌نفره در تهران.", icon: "Star" },
      { date: "۱۴۰۳", title: "فروشگاه آنلاین", desc: "ارسال به ۳۰ کشور.", icon: "Globe" },
    ],
  },
  presets: [
    preset("alt", "یک‌درمیان", { side: "alternate", lineColor: "#16130f" }, "کلاسیک دوطرفه"),
    preset("left", "تک‌ستونه راست", { side: "start", lineColor: "#8c4a2f" }, "همهٔ کارت‌ها یک طرف"),
  ],
  sections: [
    sec("c", "رویدادها", "content", [
      rep("items", "رویدادها", [txt("date", "تاریخ"), txt("title", "عنوان"), area("desc", "توضیح"), icn("icon")], { date: "", title: "رویداد", desc: "", icon: "" }, "title"),
      sel("side", "چیدمان", [["alternate", "یک‌درمیان"], ["start", "سمت راست"], ["end", "سمت چپ"]]),
    ]),
    sec("s", "استایل", "style", [
      clr("lineColor", "رنگ خط", { "{{WRAPPER}} .ew-timeline": "--ew-tl-line:{{VALUE}};" }),
      clr("dotBg", "پس‌زمینهٔ نقطه", { "{{WRAPPER}} .ew-tl-dot": "background-color:{{VALUE}};" }),
      clr("cardBg", "پس‌زمینهٔ کارت", { "{{WRAPPER}} .ew-tl-card": "background-color:{{VALUE}};" }),
      clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-tl-title": "color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-tl-title"),
      ...borderCtls("tlc", "{{WRAPPER}} .ew-tl-card"),
    ]),
  ],
  render: ({ s }) => <TimelineView s={s} />,
};

function StackCardsView({ s }: { s: Record<string, any> }) {
  const items: any[] = s.items ?? [];
  const [i, setI] = useState(0);
  return (
    <div className="ew-stack" style={{ ["--ew-stack-n" as string]: String(items.length) }}>
      {items.slice(0, 5).map((it, n) => (
        <article key={n} className={`ew-stack-card ${n === i % items.length ? "is-on" : ""}`} style={{ ["--i" as string]: n }}>
          <img src={resolveImg(it.image) || PLACEHOLDER} alt="" draggable={false} />
          <div className="ew-stack-cap">
            <b>{it.title}</b>
            {it.sub && <small>{it.sub}</small>}
          </div>
        </article>
      ))}
      <div className="ew-stack-nav">
        <button type="button" aria-label="بعدی" onClick={() => setI((v) => (v + 1) % Math.max(1, items.length))}>
          <MoveRight width={16} height={16} />
        </button>
      </div>
    </div>
  );
}

const stackedCards: WidgetDef = {
  type: "stacked-cards",
  title: "کارت‌های انباشته",
  icon: Layers2,
  category: "creative",
  keywords: "stacked cards deck انباشته",
  defaults: {
    items: [
      { image: "stock:look1", title: "معماری نوآر", sub: "اگزیت ۰۱" },
      { image: "stock:look3", title: "سکوت عاجی", sub: "اگزیت ۰۳" },
      { image: "stock:look5", title: "ساتن نیمه‌شب", sub: "اگزیت ۰۵" },
    ],
  },
  presets: [preset("deck", "دستهٔ کارت", { height: 420 }, "ترند اسلایدر کارتی"), preset("compact", "کوتاه", { height: 320 }, "ارتفاع کمتر")],
  sections: [
    sec("c", "کارت‌ها", "content", [
      rep("items", "کارت‌ها", [img("image"), txt("title", "عنوان"), txt("sub", "زیرعنوان")], { image: "stock:look1", title: "کارت", sub: "" }, "title"),
      slider("height", "ارتفاع", 220, 620, { "{{WRAPPER}} .ew-stack": "height:{{VALUE}}px;" }, { responsive: true, default: 400 }),
    ]),
    sec("s", "استایل", "style", [clr("capColor", "رنگ عنوان", { "{{WRAPPER}} .ew-stack-cap b": "color:{{VALUE}};" }), ...borderCtls("sc", "{{WRAPPER}} .ew-stack-card")]),
  ],
  render: ({ s }) => <StackCardsView s={s} />,
};

function MorphView({ s }: { s: Record<string, any> }) {
  const items: string[] = (s.images ?? []).filter(Boolean);
  const [i, setI] = useState(0);
  useEvery(!!s.autoplay && items.length > 1, Number(s.speed) || 2600, () => setI((v) => (v + 1) % items.length));
  const shape = s.shape || "blob1";
  return (
    <div className="ew-morph">
      <div className={`ew-morph-shape s-${shape}`}>
        {items.map((u, n) => (
          <img key={n} src={resolveImg(u) || PLACEHOLDER} alt="" className={n === i ? "is-on" : ""} draggable={false} />
        ))}
      </div>
      {s.title && <h4 className="ew-morph-title">{s.title}</h4>}
    </div>
  );
}

function useEvery(active: boolean, delay: number, fn: () => void) {
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(fn, Math.max(400, delay));
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, delay]);
}

const imageMorphing: WidgetDef = {
  type: "image-morphing",
  title: "تصویر دگردیس",
  icon: Droplets,
  category: "creative",
  keywords: "morph blob shape دگردیس",
  defaults: { shape: "blob1", autoplay: true, speed: 2600, title: "", images: ["stock:campaign", "stock:look3", "stock:look6"] },
  presets: [preset("blob", "بلاب نرم", { shape: "blob1" }, "شکل ارگانیک"), preset("circle", "دایره", { shape: "circle" }, "پرترهٔ گرد"), preset("star", "ستاره", { shape: "star" }, "بازیگوش")],
  sections: [
    sec("c", "تصاویر", "content", [
      { key: "images", label: "تصاویر", type: "images" },
      sel("shape", "شکل", [["blob1", "بلاب ۱"], ["blob2", "بلاب ۲"], ["circle", "دایره"], ["star", "ستاره"], ["squircle", "گوشه‌گرد"]]),
      sw("autoplay", "تعویض خودکار"),
      num("speed", "سرعت (ms)", { min: 600, step: 100 }),
      txt("title", "عنوان زیر تصویر"),
    ]),
    sec("s", "استایل", "style", [slider("size", "اندازه", 120, 620, { "{{WRAPPER}} .ew-morph-shape": "width:{{VALUE}}px;height:{{VALUE}}px;" }, { responsive: true, default: 320 }), clr("titleColor", "رنگ عنوان", { "{{WRAPPER}} .ew-morph-title": "color:{{VALUE}};" })]),
  ],
  render: ({ s }) => <MorphView s={s} />,
};

function UnfoldView({ s }: { s: Record<string, any> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ew-unfold">
      <div className={`ew-unfold-body ${open ? "is-open" : ""}`} style={{ maxHeight: open ? "none" : `${Number(s.height) || 120}px` }}>
        <div dangerouslySetInnerHTML={{ __html: s.content ?? "" }} />
      </div>
      <button type="button" className="ew-unfold-btn" onClick={() => setOpen((v) => !v)}>
        {open ? s.less || "نمایش کمتر" : s.more || "نمایش بیشتر"} <ArrowDown width={14} height={14} style={{ transform: open ? "rotate(180deg)" : undefined }} />
      </button>
    </div>
  );
}

const unfold: WidgetDef = {
  type: "unfold",
  title: "بازشونده (Unfold)",
  icon: Expand,
  category: "creative",
  keywords: "unfold read more بازشونده",
  defaults: { height: 130, more: "نمایش بیشتر", less: "نمایش کمتر", content: "<p>متن طولانی اینجا قرار می‌گیرد و با کلیک روی دکمه کامل باز می‌شود. برای صفحات محصول یا مقاله‌های بلند مناسب است تا کاربر ابتدا خلاصه را ببیند.</p><p>پاراگراف دوم برای نمایش ارتفاع بیشتر.</p>" },
  sections: [
    sec("c", "محتوا", "content", [{ key: "content", label: "متن (HTML)", type: "code", rows: 8 }, slider("height", "ارتفاع بسته", 60, 600, { "{{WRAPPER}} .ew-unfold-body": "max-height:{{VALUE}}px;" }, { default: 130 }), txt("more", "متن دکمهٔ باز"), txt("less", "متن دکمهٔ بست")]),
    sec("s", "استایل", "style", [clr("btnBg", "پس‌زمینهٔ دکمه", { "{{WRAPPER}} .ew-unfold-btn": "background-color:{{VALUE}};" }), clr("btnColor", "رنگ دکمه", { "{{WRAPPER}} .ew-unfold-btn": "color:{{VALUE}};" }), ...typo("t", "{{WRAPPER}} .ew-unfold-body")]),
  ],
  render: ({ s }) => <UnfoldView s={s} />,
};

function InteractiveLinks({ s }: { s: Record<string, any> }) {
  const [hover, setHover] = useState<number | null>(null);
  const items: any[] = s.items ?? [];
  return (
    <div className="ew-ilinks">
      {items.map((it, i) => (
        <a key={i} href={it.link ? (String(it.link).startsWith("/") ? `#${it.link}` : it.link) : "#"} className="ew-ilink" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
          <span className="ew-ilink-text">{it.title}</span>
          {s.showImage !== false && hover === i && it.image && <img className="ew-ilink-img" src={resolveImg(it.image)} alt="" draggable={false} />}
          {s.showArrow !== false && <ArrowDown className="ew-ilink-arrow" width={14} height={14} style={{ transform: "rotate(-90deg)" }} />}
        </a>
      ))}
    </div>
  );
}

const interactiveLinks: WidgetDef = {
  type: "interactive-links",
  title: "لینک‌های تعاملی",
  icon: Link2,
  category: "creative",
  keywords: "interactive links hover لینک",
  defaults: {
    showImage: true,
    showArrow: true,
    items: [
      { title: "پالتو و کاپشن", link: "/products?collection=outerwear", image: "stock:look1" },
      { title: "بافت و کشمیر", link: "/products?collection=knitwear", image: "stock:look3" },
      { title: "کفش و کیف", link: "/products?collection=bags", image: "stock:look6" },
    ],
  },
  presets: [preset("img", "با تصویر شناور", { showImage: true }, "تصویر کنار نشانگر"), preset("text", "فقط متن", { showImage: false, showArrow: true }, "مینیمال تایپوگرافیک")],
  sections: [
    sec("c", "لینک‌ها", "content", [rep("items", "لینک‌ها", [txt("title", "عنوان"), url("link"), img("image")], { title: "لینک", link: "#", image: "" }, "title"), sw("showImage", "تصویر شناور"), sw("showArrow", "نمایش فلش")]),
    sec("s", "استایل", "style", [...typo("t", "{{WRAPPER}} .ew-ilink-text"), clr("color", "رنگ متن", { "{{WRAPPER}} .ew-ilink-text": "color:{{VALUE}};" }), clr("colorH", "رنگ هاور", { "{{WRAPPER}} .ew-ilink:hover .ew-ilink-text": "color:{{VALUE}};" }), slider("gap", "فاصله", 4, 60, { "{{WRAPPER}} .ew-ilinks": "gap:{{VALUE}}px;" }, { default: 14 })]),
  ],
  render: ({ s }) => <InteractiveLinks s={s} />,
};

function ImageSwapView({ s }: { s: Record<string, any> }) {
  const [on, setOn] = useState(false);
  return (
    <div className="ew-swap" onMouseEnter={() => s.trigger === "hover" && setOn(true)} onMouseLeave={() => s.trigger === "hover" && setOn(false)} onClick={() => s.trigger === "click" && setOn((v) => !v)}>
      <img className={on ? "is-off" : "is-on"} src={resolveImg(s.primary) || PLACEHOLDER} alt="" draggable={false} />
      <img className={on ? "is-on" : "is-off"} src={resolveImg(s.secondary) || PLACEHOLDER} alt="" draggable={false} />
    </div>
  );
}

const imageSwap: WidgetDef = {
  type: "image-swap",
  title: "تعویض تصویر",
  icon: Repeat2,
  category: "creative",
  keywords: "image swap hover تعویض",
  defaults: { primary: "stock:look1", secondary: "stock:look3", trigger: "hover" },
  sections: [
    sec("c", "تصاویر", "content", [img("primary", "تصویر اصلی"), img("secondary", "تصویر دوم"), sel("trigger", "فعال‌سازی", [["hover", "هاور"], ["click", "کلیک"]])]),
    sec("s", "استایل", "style", [sel("ratio", "نسبت", [["1/1", "۱:۱"], ["4/5", "۴:۵"], ["3/4", "۳:۴"]], { selectors: { "{{WRAPPER}} .ew-swap": "aspect-ratio:{{VALUE}};" } }), ...borderCtls("sw", "{{WRAPPER}} .ew-swap")]),
  ],
  render: ({ s }) => <ImageSwapView s={s} />,
};

function TooltipView({ s }: { s: Record<string, any>; editing: boolean }) {
  return (
    <div className="ew-tip-wrap">
      <span className="ew-tip-target">
        {s.icon ? <IconView name={s.icon} size={Number(s.iconSize) || 18} /> : s.text || "؟"}
        <span className={`ew-tip pos-${s.pos || "top"}`}>
          <b>{s.title}</b>
          {s.desc && <small>{s.desc}</small>}
        </span>
      </span>
    </div>
  );
}

const tooltip: WidgetDef = {
  type: "tooltip",
  title: "راهنمای شناور",
  icon: MousePointer2,
  category: "creative",
  keywords: "tooltip hint راهنما",
  defaults: { text: "؟", icon: "Lightbulb", title: "راهنما", desc: "توضیح کوتاه", pos: "top", iconSize: 18 },
  sections: [
    sec("c", "راهنما", "content", [txt("text", "متن نشانگر"), icn("icon"), txt("title", "عنوان"), area("desc", "توضیح"), sel("pos", "موقعیت", [["top", "بالا"], ["bottom", "پایین"], ["start", "راست"], ["end", "چپ"]]), alignFlex("align", "{{WRAPPER}} .ew-tip-wrap")]),
    sec("s", "استایل", "style", [clr("tcolor", "رنگ نشانگر", { "{{WRAPPER}} .ew-tip-target": "color:{{VALUE}};" }), clr("bg", "پس‌زمینهٔ حباب", { "{{WRAPPER}} .ew-tip": "background-color:{{VALUE}};" }), clr("c", "رنگ متن حباب", { "{{WRAPPER}} .ew-tip": "color:{{VALUE}};" }), slider("iconSize", "اندازهٔ آیکن", 12, 48, undefined, { default: 18 })]),
  ],
  render: ({ s }) => <TooltipView s={s} editing={false} />,
};

function FunfactView({ s }: { s: Record<string, any> }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div className="ew-funfact" ref={ref}>
      <span className="ew-ff-icon">{s.icon ? <IconView name={s.icon} size={Number(s.iconSize) || 28} /> : null}</span>
      <div className="ew-ff-num">
        {seen ? <CountNumber end={Number(s.end) || 0} duration={Number(s.duration) || 1800} /> : faNum(0)}
        {s.suffix}
      </div>
      {s.title && <div className="ew-ff-title">{s.title}</div>}
      {s.desc && <p className="ew-ff-desc">{s.desc}</p>}
    </div>
  );
}

function CountNumber({ end, duration }: { end: number; duration: number }) {
  const [v, setV] = useState(0);
  useCountUp(true, end, duration, setV);
  return <>{faNum(Math.round(v))}</>;
}
function useCountUp(active: boolean, end: number, duration: number, set: (n: number) => void) {
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / Math.max(300, duration));
      set(end * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, end, duration]);
}

const funfact: WidgetDef = {
  type: "funfact",
  title: "دانستنی عددی",
  icon: Hash,
  category: "creative",
  keywords: "funfact counter stat عدد",
  defaults: { end: 1200, suffix: "+", title: "مشتری راضی", desc: "در ۳۰ کشور", icon: "Users", duration: 1800, iconSize: 28 },
  presets: [
    preset("center", "وسط‌چین", { align: "center" }, "آیکن بالا، عدد بزرگ"),
    preset("inline", "کنار هم", { align: "start", iconSize: 34 }, "آیکن و عدد در یک خط"),
  ],
  sections: [
    sec("c", "عدد", "content", [
      num("end", "مقدار"),
      txt("suffix", "پسوند"),
      txt("title", "عنوان"),
      area("desc", "توضیح"),
      icn("icon"),
      num("duration", "مدت (ms)", { min: 400, step: 100 }),
      alignText("align", "{{WRAPPER}} .ew-funfact"),
    ]),
    sec("s", "استایل", "style", [
      clr("nc", "رنگ عدد", { "{{WRAPPER}} .ew-ff-num": "color:{{VALUE}};" }),
      ...typo("n", "{{WRAPPER}} .ew-ff-num"),
      clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-ff-title": "color:{{VALUE}};" }),
      clr("ic", "رنگ آیکن", { "{{WRAPPER}} .ew-ff-icon": "color:{{VALUE}};" }),
      slider("iconSize", "اندازهٔ آیکن", 14, 72, undefined, { default: 28 }),
    ]),
  ],
  render: ({ s }) => <FunfactView s={s} />,
};

function ScrollButtonView({ s }: { s: Record<string, any>; editing: boolean }) {
  const go = () => {
    if (s.target) document.getElementById(s.target)?.scrollIntoView({ behavior: "smooth" });
    else window.scrollBy({ top: Number(s.distance) || 500, behavior: "smooth" });
  };
  return (
    <div className="ew-scrollbtn-wrap">
      <button type="button" className="ew-scrollbtn" onClick={go} aria-label={s.label || "اسکرول"}>
        <span className="ew-sb-label">{s.label}</span>
        <span className="ew-sb-ic">
          <ArrowDown width={16} height={16} />
        </span>
      </button>
    </div>
  );
}

const scrollButton: WidgetDef = {
  type: "scroll-button",
  title: "دکمهٔ اسکرول",
  icon: MousePointer2,
  category: "creative",
  keywords: "scroll button anchor اسکرول",
  defaults: { label: "کشف کن", distance: 500, target: "" },
  sections: [
    sec("c", "دکمه", "content", [txt("label", "متن"), txt("target", "شناسهٔ مقصد (اختیاری)"), num("distance", "مقدار اسکرول (px)"), alignFlex("align", "{{WRAPPER}} .ew-scrollbtn-wrap")]),
    sec("s", "استایل", "style", [clr("color", "رنگ متن", { "{{WRAPPER}} .ew-scrollbtn": "color:{{VALUE}};" }), clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-scrollbtn": "background-color:{{VALUE}};" }), ...borderCtls("sb", "{{WRAPPER}} .ew-scrollbtn")]),
  ],
  render: ({ s, editing }) => <ScrollButtonView s={s} editing={editing} />,
};

/* ---- fancy / creative button ---- */
const creativeButton: WidgetDef = {
  type: "creative-button",
  title: "دکمهٔ خلاقانه",
  icon: Wand2,
  category: "creative",
  keywords: "creative button fancy دکمه",
  defaults: { text: "خرید کالکشن", link: "/products", effect: "shine", size: "md", icon: "" },
  presets: [
    preset("shine", "درخشش", { effect: "shine", bg: "#16130f" }, "نور عبوری"),
    preset("fill", "پرشدن از راست", { effect: "fill", bg: "#8c4a2f" }, "پس‌زمینهٔ متحرک"),
    preset("border", "قاب متحرک", { effect: "border", bg: "transparent", color: "#16130f" }, "خط دور می‌چرخد"),
    preset("magnetic", "آهنربایی", { effect: "magnetic", bg: "#16130f" }, "بزرگ‌نمایی نرم"),
  ],
  sections: [
    sec("c", "دکمه", "content", [
      txt("text", "متن"),
      url("link"),
      sel("effect", "افکت", [["shine", "درخشش"], ["fill", "پر شدن"], ["border", "قاب متحرک"], ["magnetic", "آهنربایی"], ["none", "هیچ"]]),
      sel("size", "اندازه", [["sm", "کوچک"], ["md", "متوسط"], ["lg", "بزرگ"]]),
      icn("icon"),
      alignFlex("align", "{{WRAPPER}} .ew-btn-wrap"),
    ]),
    sec("s", "استایل", "style", [
      clr("color", "رنگ متن", { "{{WRAPPER}} .ew-btn": "color:{{VALUE}};" }),
      clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-btn": "background-color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-btn"),
      ...borderCtls("cb", "{{WRAPPER}} .ew-btn"),
      dims("pad", "فاصلهٔ داخلی", "{{WRAPPER}} .ew-btn", "padding"),
    ]),
  ],
  render: ({ s }) => (
    <div className="ew-btn-wrap">
      <a href={s.link ? (String(s.link).startsWith("/") ? `#${s.link}` : s.link || "#") : "#"} className={`ew-btn ew-btn--${s.size || "md"} fx-${s.effect || "shine"}`}>
        {s.icon ? <IconView name={s.icon} size={16} /> : null}
        {s.text}
      </a>
    </div>
  ),
};

const dualButton: WidgetDef = {
  type: "dual-button",
  title: "دکمهٔ دوتایی",
  icon: Split,
  category: "creative",
  keywords: "dual button group دکمه",
  defaults: {
    text1: "خرید کالکشن",
    link1: "/products",
    text2: "دیدن رانوی",
    link2: "/style",
    style1: "solid",
    style2: "outline",
    divider: "یا",
  },
  sections: [
    sec("c", "دکمه‌ها", "content", [
      txt("text1", "متن دکمهٔ اول"),
      url("link1", "لینک اول"),
      txt("text2", "متن دکمهٔ دوم"),
      url("link2", "لینک دوم"),
      txt("divider", "جداکنندهٔ میانی"),
      alignFlex("align", "{{WRAPPER}} .ew-dual"),
    ]),
    sec("s", "استایل", "style", [
      clr("c1", "رنگ دکمهٔ اول", { "{{WRAPPER}} .ew-dual .ew-btn.is-a": "background-color:{{VALUE}};" }),
      clr("c2", "رنگ دکمهٔ دوم", { "{{WRAPPER}} .ew-dual .ew-btn.is-b": "background-color:{{VALUE}};color:{{VALUE}};" }),
      ...typo("t", "{{WRAPPER}} .ew-dual .ew-btn"),
      slider("gap", "فاصله", 0, 40, { "{{WRAPPER}} .ew-dual": "gap:{{VALUE}}px;" }, { default: 12 }),
    ]),
  ],
  render: ({ s }) => (
    <div className="ew-dual">
      <a href={String(s.link1 || "#").startsWith("/") ? `#${s.link1}` : s.link1 || "#"} className="ew-btn is-a">
        {s.text1}
      </a>
      {s.divider && <span className="ew-dual-sep">{s.divider}</span>}
      <a href={String(s.link2 || "#").startsWith("/") ? `#${s.link2}` : s.link2 || "#"} className="ew-btn is-b">
        {s.text2}
      </a>
    </div>
  ),
};

function ImageMaskView({ s }: { s: Record<string, any> }) {
  const masks: Record<string, string> = {
    circle: "50%",
    blob: "30% 70% 70% 30% / 30% 30% 70% 70%",
    squircle: "28%",
    star: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)",
    leaf: "0 70% 70% 0 / 0 70% 70% 0",
    wave: "40% 60% 60% 40% / 60% 40% 60% 40%",
  };
  return (
    <div className="ew-mask">
      <img src={resolveImg(s.image) || PLACEHOLDER} alt={s.alt || ""} draggable={false} style={{ borderRadius: masks[s.shape || "circle"], width: `${Number(s.size) || 100}%` }} />
    </div>
  );
}

const imageMasking: WidgetDef = {
  type: "image-masking",
  title: "تصویر با ماسک",
  icon: Sparkles,
  category: "creative",
  keywords: "image mask shape ماسک",
  defaults: { image: "stock:campaign", shape: "blob", size: 90 },
  presets: [
    preset("blob", "بلاب ارگانیک", { shape: "blob" }, "ترند ۲۰۲۵"),
    preset("circle", "دایره", { shape: "circle" }, "کلاسیک"),
    preset("star", "ستاره", { shape: "star" }, "جذاب"),
    preset("leaf", "برگ", { shape: "leaf" }, "نرم و طبیعی"),
  ],
  sections: [
    sec("c", "تصویر", "content", [img("image"), sel("shape", "شکل", [["circle", "دایره"], ["blob", "بلاب"], ["squircle", "گوشه‌گرد"], ["star", "ستاره"], ["leaf", "برگ"], ["wave", "موج"]]), txt("alt", "متن جایگزین"), alignText("align", "{{WRAPPER}} .ew-mask")]),
    sec("s", "استایل", "style", [slider("size", "عرض", 20, 100, { "{{WRAPPER}} .ew-mask img": "width:{{VALUE}}%;" }, { unit: "%", responsive: true, default: 90 }), ...borderCtls("msk", "{{WRAPPER}} .ew-mask img")]),
  ],
  render: ({ s }) => <ImageMaskView s={s} />,
};

function DropCapsView({ s }: { s: Record<string, any> }) {
  return (
    <div className="ew-dropcaps">
      <span className="ew-dc-letter">{s.letter || "و"}</span>
      <div className="ew-dc-text" dangerouslySetInnerHTML={{ __html: s.content ?? "" }} />
    </div>
  );
}

const dropCaps: WidgetDef = {
  type: "drop-caps",
  title: "حرف آغازین بزرگ",
  icon: Type,
  category: "creative",
  keywords: "drop cap letter حرف",
  defaults: { letter: "و", content: "<p>لور داستان برند اینجا شروع می‌شود و حرف اول آن به‌صورت بزرگ در کنار متن قرار می‌گیرد.</p>" },
  sections: [
    sec("c", "محتوا", "content", [txt("letter", "حرف"), { key: "content", label: "متن (HTML)", type: "code", rows: 6 }]),
    sec("s", "استایل", "style", [
      slider("size", "اندازهٔ حرف", 40, 200, { "{{WRAPPER}} .ew-dc-letter": "font-size:{{VALUE}}px;" }, { default: 84 }),
      clr("lc", "رنگ حرف", { "{{WRAPPER}} .ew-dc-letter": "color:{{VALUE}};" }),
      sel("lf", "قلم حرف", [["'Instrument Serif', serif", "سریف"], ["'Vazirmatn', sans-serif", "سانس"]], { selectors: { "{{WRAPPER}} .ew-dc-letter": "font-family:{{VALUE}};" } }),
      ...typo("t", "{{WRAPPER}} .ew-dc-text"),
    ]),
  ],
  render: ({ s }) => <DropCapsView s={s} />,
};

function ImageAccordionView({ s }: { s: Record<string, any> }) {
  const items: any[] = s.items ?? [];
  const [open, setOpen] = useState(0);
  return (
    <div className="ew-iacc" style={{ height: Number(s.height) || 420 }}>
      {items.map((it, i) => (
        <button key={i} type="button" className={`ew-iacc-item ${open === i ? "is-open" : ""}`} style={{ backgroundImage: `url("${resolveImg(it.image) || PLACEHOLDER}")` }} onClick={() => setOpen(i)}>
          <span className="ew-iacc-cap">
            <b>{it.title}</b>
            {it.desc && <small>{it.desc}</small>}
          </span>
        </button>
      ))}
    </div>
  );
}

const imageAccordion: WidgetDef = {
  type: "image-accordion",
  title: "آکاردئون تصویری",
  icon: Boxes,
  category: "creative",
  keywords: "image accordion expand آکاردئون تصویر",
  defaults: {
    height: 420,
    items: [
      { image: "stock:look1", title: "معماری نوآر", desc: "پالتو و پشم" },
      { image: "stock:look3", title: "سکوت عاجی", desc: "کشمیر و ساتن" },
      { image: "stock:look5", title: "ساتن نیمه‌شب", desc: "ارگانزا" },
      { image: "stock:look6", title: "فصل شتری", desc: "ترنچ و چرم" },
    ],
  },
  presets: [preset("wide", "بلند", { height: 460 }, "ارتفاع بیشتر"), preset("short", "کوتاه", { height: 320 }, "فشرده")],
  sections: [
    sec("c", "تصاویر", "content", [
      rep("items", "آیتم‌ها", [img("image"), txt("title", "عنوان"), area("desc", "توضیح")], { image: "stock:look1", title: "آیتم", desc: "" }, "title"),
      slider("height", "ارتفاع", 240, 720, { "{{WRAPPER}} .ew-iacc": "height:{{VALUE}}px;" }, { responsive: true, default: 420 }),
    ]),
    sec("s", "استایل", "style", [clr("capColor", "رنگ عنوان", { "{{WRAPPER}} .ew-iacc-cap b": "color:{{VALUE}};" }), clr("ov", "رنگ لایه", { "{{WRAPPER}} .ew-iacc-item::after": "background-color:{{VALUE}};" })]),
  ],
  render: ({ s }) => <ImageAccordionView s={s} />,
};

function PanelSliderView({ s }: { s: Record<string, any> }) {
  const items: any[] = s.items ?? [];
  return (
    <div className="ew-panel" style={{ height: Number(s.height) || 420 }}>
      {items.map((it, i) => (
        <div key={i} className="ew-panel-item" style={{ backgroundImage: `url("${resolveImg(it.image) || PLACEHOLDER}")` }}>
          <div className="ew-panel-cap">
            <b>{it.title}</b>
            {it.desc && <small>{it.desc}</small>}
            {it.link && (
              <a href={String(it.link).startsWith("/") ? `#${it.link}` : it.link} className="ew-btn ew-btn--sm">
                {it.more || "مشاهده"}
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

const panelSlider: WidgetDef = {
  type: "panel-slider",
  title: "اسلایدر پنلی",
  icon: Boxes,
  category: "creative",
  keywords: "panel slider split اسلایدر",
  defaults: {
    height: 420,
    items: [
      { image: "stock:hero", title: "کالکشن AW26", desc: "شش استایل", link: "/products" },
      { image: "stock:atelier", title: "آتلیه", desc: "ساخت تهران", link: "/about" },
      { image: "stock:campaign", title: "کشمیر", desc: "نرمی یک فصل", link: "/landing" },
    ],
  },
  sections: [
    sec("c", "پنل‌ها", "content", [
      rep("items", "پنل‌ها", [img("image"), txt("title", "عنوان"), area("desc", "توضیح"), url("link"), txt("more", "متن دکمه")], { image: "stock:hero", title: "پنل", desc: "", link: "", more: "" }, "title"),
      slider("height", "ارتفاع", 240, 720, { "{{WRAPPER}} .ew-panel": "height:{{VALUE}}px;" }, { responsive: true, default: 420 }),
    ]),
    sec("s", "استایل", "style", [clr("tc", "رنگ عنوان", { "{{WRAPPER}} .ew-panel-cap b": "color:{{VALUE}};" }), clr("ov", "رنگ لایه", { "{{WRAPPER}} .ew-panel-item::after": "background-color:{{VALUE}};" })]),
  ],
  render: ({ s }) => <PanelSliderView s={s} />,
};

/* ---- factory-built creative widgets ---- */
const team = makeCardWidget({
  type: "team",
  title: "تیم",
  icon: Users,
  category: "creative",
  variant: "team",
  keywords: "team member staff تیم",
  items: [
    { image: "stock:campaign", name: "آوا رادمهر", role: "مدیر خلاقیت", desc: "۱۲ سال تجربهٔ طراحی پوشاک.", icon: "Crown" },
    { image: "stock:look3", name: "سارا نیکخواه", role: "خیاط ارشد", desc: "متخصص دوخت دستی.", icon: "Scissors" },
    { image: "stock:look2", name: "میلاد صالحی", role: "عکاس مد", desc: "عکاسی کمپین و رانوی.", icon: "Camera" },
  ],
  itemFields: [],
  presets: [P.grid3(), P.grid4(), P.carousel({ per: 3 }), P.dark(), P.glass()],
});

const clientLogo = makeCardWidget({
  type: "client-logo",
  title: "لوگوی مشتریان",
  icon: Award,
  category: "creative",
  variant: "logo",
  keywords: "client logo brand لوگو",
  defaults: { cols: 5, gap: 12, hoverLift: false },
  items: [
    { image: "stock:look1", title: "Vogue" },
    { image: "stock:look2", title: "Elle" },
    { image: "stock:look3", title: "Bazaar" },
    { image: "stock:look4", title: "GQ" },
    { image: "stock:look5", title: "Numéro" },
  ],
  itemFields: [],
  layouts: ["grid", "carousel", "list"],
  presets: [P.grid3({ cols: 5 }), P.carousel({ per: 5 }), P.minimal()],
});

const portfolioGrid = makeCardWidget({
  type: "portfolio-grid",
  title: "نمونه‌کار گرید",
  icon: Boxes,
  category: "creative",
  variant: "overlay",
  keywords: "portfolio gallery work نمونه کار",
  items: [
    { image: "stock:look1", title: "معماری نوآر", sub: "اگزیت ۰۱" },
    { image: "stock:look3", title: "سکوت عاجی", sub: "اگزیت ۰۳" },
    { image: "stock:look5", title: "ساتن نیمه‌شب", sub: "اگزیت ۰۵" },
    { image: "stock:look6", title: "فصل شتری", sub: "اگزیت ۰۶" },
  ],
  itemFields: [],
  presets: [P.grid2(), P.grid3(), P.grid4(), P.dark()],
});

const featureBoxes = makeCardWidget({
  type: "feature-boxes",
  title: "باکس‌های ویژگی",
  icon: Sparkles,
  category: "creative",
  variant: "icon",
  keywords: "feature service benefits ویژگی",
  items: [
    { icon: "Gem", title: "پارچهٔ طبیعی", desc: "بیش از ۹۰٪ کالکشن." },
    { icon: "Scissors", title: "دوخت دستی", desc: "سه هفتهٔ کار آتلیه." },
    { icon: "Truck", title: "ارسال سریع", desc: "۲ تا ۴ روز کاری." },
  ],
  itemFields: [],
  presets: [P.grid3(), P.grid4(), P.soft(), P.glass(), P.brutal(), P.outline()],
});

const stepsFlow = makeCardWidget({
  type: "step-flow",
  title: "جریان مراحل",
  icon: ListOrdered,
  category: "creative",
  variant: "step",
  keywords: "step flow process مراحل",
  defaults: { cols: 4, gap: 14 },
  items: [
    { badge: "۱", icon: "", title: "انتخاب پارچه", desc: "از میان سه وزن مختلف." },
    { badge: "۲", icon: "", title: "الگو و برش", desc: "الگوی کاغذی دست‌ساز." },
    { badge: "۳", icon: "", title: "دوخت و پرو", desc: "پرو روی بدن واقعی." },
    { badge: "۴", icon: "", title: "ارسال", desc: "بسته‌بندی هدیه‌مانند." },
  ],
  itemFields: [],
  presets: [P.grid4(), P.grid2(), P.soft()],
});

const statsRow = makeCardWidget({
  type: "stats-row",
  title: "ردیف آمار",
  icon: TrendingUp,
  category: "creative",
  variant: "stat",
  keywords: "stats numbers counters آمار",
  defaults: { cols: 4, gap: 12 },
  items: [
    { value: 24, suffix: "", title: "قطعه در فصل" },
    { value: 92, suffix: "٪", title: "پارچهٔ طبیعی" },
    { value: 1200, suffix: "+", title: "مشتری راضی" },
    { value: 30, suffix: "", title: "کشور" },
  ],
  itemFields: [],
  presets: [P.grid4(), P.dark(), P.minimal(), P.soft()],
});

const lookbook = makeCardWidget({
  type: "lookbook",
  title: "لوک‌بوک",
  icon: Eye,
  category: "creative",
  variant: "overlay",
  keywords: "lookbook style book لوک بوک",
  defaults: { cols: 3, gap: 10 },
  items: [
    { image: "stock:look2", title: "ساعت تراکوتا", sub: "کتان و چرم" },
    { image: "stock:look4", title: "استاندارد نیلی", sub: "جین شسته" },
    { image: "stock:look6", title: "فصل شتری", sub: "ترنچ بلند" },
  ],
  itemFields: [],
  presets: [P.grid3(), P.grid2(), P.carousel({ per: 3 })],
});

export const WIDGETS_C: WidgetDef[] = [
  imageCompare,
  hotspot,
  timeline,
  stackedCards,
  imageMorphing,
  unfold,
  interactiveLinks,
  imageSwap,
  tooltip,
  funfact,
  scrollButton,
  creativeButton,
  dualButton,
  imageMasking,
  dropCaps,
  imageAccordion,
  panelSlider,
  team,
  clientLogo,
  portfolioGrid,
  featureBoxes,
  stepsFlow,
  statsRow,
  lookbook,
];


