import {
  W,
  bgCtls,
  borderCtls,
  choose,
  clr,
  dims,
  hd,
  img,
  num,
  sec,
  sel,
  slider,
  sw,
  txt,
  area,
  type Ctl,
  type CtlSection,
} from "./core";

export const ANIMATIONS: [string, string][] = [
  ["", "هیچ"],
  ["fadeIn", "محو شدن (Fade In)"],
  ["fadeInUp", "از پایین"],
  ["fadeInDown", "از بالا"],
  ["fadeInLeft", "از چپ"],
  ["fadeInRight", "از راست"],
  ["zoomIn", "بزرگ‌نمایی"],
  ["slideInUp", "لغزش از پایین"],
  ["bounceIn", "پرش ورود"],
  ["flipInX", "چرخش X"],
  ["rotateIn", "چرخش"],
  ["pulse", "ضربان"],
];

/**
 * Advanced tab shared by sections, columns and widgets (Elementor's "Advanced" panel).
 * `target` is the element that receives the box styles.
 */
export function advancedSections(target = W, isWidget = true): CtlSection[] {
  return [
    sec("a-layout", "چیدمان", "advanced", [
      dims("margin", "فاصلهٔ بیرونی (Margin)", target, "margin"),
      dims("padding", "فاصلهٔ داخلی (Padding)", target, "padding"),
      ...(isWidget
        ? [
            sel(
              "widthType",
              "عرض المان",
              [
                ["", "پیش‌فرض"],
                ["100%", "تمام‌عرض"],
                ["auto", "خودکار (Inline)"],
                ["custom", "سفارشی"],
              ],
              { selectors: { [target]: "width:{{VALUE}};" } },
            ),
            slider("widthCustom", "عرض سفارشی", 5, 100, { [target]: "width:{{VALUE}}%;" }, { unit: "%", responsive: true, show: (s) => s.widthType === "custom" }),
          ]
        : []),
      num("zIndex", "Z-Index", { selectors: { [target]: "z-index:{{VALUE}};position:relative;" } }),
      sel(
        "position",
        "موقعیت‌دهی",
        [
          ["", "پیش‌فرض"],
          ["absolute", "مطلق (Absolute)"],
          ["fixed", "ثابت (Fixed)"],
          ["sticky", "چسبان (Sticky)"],
        ],
        { selectors: { [target]: "position:{{VALUE}};" } },
      ),
      slider("offsetTop", "فاصله از بالا", -400, 1200, { [target]: "top:{{VALUE}}px;" }, { responsive: true, show: (s) => !!s.position }),
      slider("offsetStart", "فاصله از راست", -400, 1200, { [target]: "right:{{VALUE}}px;" }, { responsive: true, show: (s) => s.position === "absolute" || s.position === "fixed" }),
    ]),
    sec("a-bg", "پس‌زمینه", "advanced", bgCtls("bg", target)),
    sec("a-border", "حاشیه و سایه", "advanced", borderCtls("box", target, true)),
    sec("a-motion", "افکت‌های حرکتی", "advanced", [
      sel("animation", "انیمیشن ورود", ANIMATIONS),
      slider("animDuration", "مدت (میلی‌ثانیه)", 100, 3000, { [target]: "animation-duration:{{VALUE}}ms;" }, { unit: "ms", step: 50, show: (s) => !!s.animation }),
      slider("animDelay", "تأخیر (میلی‌ثانیه)", 0, 3000, { [target]: "animation-delay:{{VALUE}}ms;" }, { unit: "ms", step: 50, show: (s) => !!s.animation }),
      hd("افکت هاور و شفافیت"),
      slider("opacity", "شفافیت", 0, 1, { [target]: "opacity:{{VALUE}};" }, { step: 0.05, unit: "" }),
      slider("hoverScale", "بزرگ‌نمایی در هاور", 0.8, 1.4, { [`${target}:hover`]: "transform:scale({{VALUE}});" }, { step: 0.01, unit: "" }),
      slider("hoverRotate", "چرخش در هاور", -45, 45, { [`${target}:hover`]: "transform:rotate({{VALUE}}deg);" }, { unit: "°" }),
      slider("hoverLift", "بالا آمدن در هاور", 0, 30, { [`${target}:hover`]: "transform:translateY(-{{VALUE}}px);" }),
      slider("hoverOpacity", "شفافیت در هاور", 0, 1, { [`${target}:hover`]: "opacity:{{VALUE}};" }, { step: 0.05, unit: "" }),
      sel(
        "transition",
        "سرعت انتقال هاور",
        [
          ["", "پیش‌فرض"],
          ["all .15s ease", "سریع"],
          ["all .35s ease", "متوسط"],
          ["all .7s ease", "کند"],
        ],
        { selectors: { [target]: "transition:{{VALUE}};" } },
      ),
    ]),
    sec("a-resp", "نمایش ریسپانسیو", "advanced", [
      sw("hideDesktop", "مخفی در دسکتاپ"),
      sw("hideTablet", "مخفی در تبلت"),
      sw("hideMobile", "مخفی در موبایل"),
    ]),
    sec("a-attr", "ویژگی‌ها و CSS سفارشی", "advanced", [
      txt("cssId", "شناسهٔ CSS (ID)", { placeholder: "my-section" }),
      txt("cssClasses", "کلاس‌های CSS", { placeholder: "class-one class-two" }),
      { key: "customCss", label: "CSS سفارشی", type: "code", rows: 6, placeholder: "selector { color: red; }", hint: "از واژهٔ selector برای اشاره به همین المان استفاده کن." },
    ]),
  ];
}

const gaps: [string, string][] = [
  ["0", "بدون فاصله"],
  ["5", "باریک"],
  ["10", "پیش‌فرض"],
  ["15", "گسترده"],
  ["20", "پهن"],
  ["30", "خیلی پهن"],
];

/**
 * Container = Elementor Pro flexbox container. Holds widgets, other containers
 * and inner sections, nesting without limit.
 */
export function containerSections(): CtlSection[] {
  const wrap = "{{WRAPPER}} > .eb-container-wrap";
  const inner = "{{WRAPPER}} > .eb-container-wrap > .eb-container-inner";
  return [
    sec("k-layout", "چیدمان کانتینر", "content", [
      choose("direction", "جهت", [["row", "افقی", "ArrowLeft"], ["column", "عمودی", "ArrowDown"]], { default: "column", selectors: { [inner]: "flex-direction:{{VALUE}};" } }),
      choose("justify", "جای‌گیری اصلی", [
        ["flex-start", "شروع", "AlignRight"],
        ["center", "وسط", "AlignCenter"],
        ["flex-end", "پایان", "AlignLeft"],
        ["space-between", "بین", "AlignJustify"],
      ], { default: "flex-start", selectors: { [inner]: "justify-content:{{VALUE}};" } }),
      choose("align", "جای‌گیری عرضی", [
        ["stretch", "کشیده", "AlignJustify"],
        ["flex-start", "شروع", "AlignRight"],
        ["center", "وسط", "AlignCenter"],
        ["flex-end", "پایان", "AlignLeft"],
      ], { default: "stretch", selectors: { [inner]: "align-items:{{VALUE}};" } }),
      sel("wrapMode", "شکستن خط", [["wrap", "با شکست خط"], ["nowrap", "بدون شکست"]], { default: "wrap", selectors: { [inner]: "flex-wrap:{{VALUE}};" } }),
      slider("gap", "فاصلهٔ فرزندان", 0, 100, { [inner]: "gap:{{VALUE}}px;" }, { responsive: true, default: 20 }),
      sel("widthMode", "عرض کانتینر", [["", "پیش‌فرض"], ["100%", "تمام‌عرض"], ["inline", "درجا (Inline)"], ["custom", "سفارشی"]], { selectors: { [wrap]: "width:{{VALUE}};" } }),
      slider("widthCustom", "عرض سفارشی", 5, 100, { [wrap]: "width:{{VALUE}}%;" }, { unit: "%", responsive: true, show: (s) => s.widthMode === "custom" }),
      sel("heightMode", "ارتفاع", [["", "پیش‌فرض"], ["fit-content", "هم‌اندازهٔ محتوا"], ["100%", "تمام‌ارتفاع والد"], ["100vh", "تمام صفحه"]], { selectors: { [wrap]: "height:{{VALUE}};" } }),
      num("minHeight", "حداقل ارتفاع (px)", { selectors: { [wrap]: "min-height:{{VALUE}}px;" } }),
      sel("tag", "تگ HTML", [["div", "div"], ["section", "section"], ["article", "article"], ["aside", "aside"], ["li", "li"]], { default: "div" }),
    ]),
    sec("k-box", "جعبه و پس‌زمینه", "content", [
      ...bgCtls("bg", wrap),
      ...borderCtls("box", wrap),
      dims("padding", "فاصلهٔ داخلی", wrap, "padding"),
      hd("اندازهٔ فرزندان"),
      sw("childGrow", "کشیده شدن فرزندان", { selectors: { [inner + " > .eb-widget"]: "flex-grow:1;" } }),
      sw("childFill", "پر کردن عرض فرزندان", { selectors: { [inner + " > .eb-widget"]: "width:100%;" } }),
      sel("childWidth", "عرض پایهٔ فرزند", [["", "خاموش"], ["25%", "۴ ستونه"], ["33.333%", "۳ ستونه"], ["50%", "دو ستونه"]], { selectors: { [inner + " > .eb-widget"]: "flex-basis:{{VALUE}};" } }),
    ]),
    sec("k-color", "رنگ متن", "style", [
      clr("headingColor", "رنگ عنوان‌ها", { "{{WRAPPER}} h1,{{WRAPPER}} h2,{{WRAPPER}} h3,{{WRAPPER}} h4,{{WRAPPER}} .ew-heading": "color:{{VALUE}};" }),
      clr("textColor", "رنگ متن", { "{{WRAPPER}} .ew-text,{{WRAPPER}} p": "color:{{VALUE}};" }),
    ]),
    ...advancedSections(wrap, false),
  ];
}

export function sectionSections(): CtlSection[] {
  const container = "{{WRAPPER}} > .eb-container";
  const row = `${container} > .eb-row`;
  return [
    sec("s-layout", "چیدمان", "content", [
      choose("layout", "عرض محتوا", [
        ["boxed", "محدود", "Minimize2"],
        ["full", "تمام‌عرض", "Maximize2"],
      ], { default: "boxed" }),
      slider("contentWidth", "حداکثر عرض", 400, 1920, { [container]: "max-width:{{VALUE}}px;" }, { responsive: true, show: (s) => (s.layout ?? "boxed") === "boxed" }),
      sel("columnGap", "فاصلهٔ ستون‌ها", gaps, { default: "10", selectors: { [`${row} > .eb-column`]: "padding:{{VALUE}}px;" } }),
      sel(
        "heightMode",
        "ارتفاع",
        [
          ["default", "پیش‌فرض"],
          ["screen", "تمام صفحه (100vh)"],
          ["min", "حداقل ارتفاع"],
        ],
        { default: "default" },
      ),
      slider("minHeight", "حداقل ارتفاع", 50, 1200, { [W]: "min-height:{{VALUE}}px;" }, { responsive: true, show: (s) => s.heightMode === "min" }),
      sel(
        "colAlign",
        "جای‌گیری عمودی ستون‌ها",
        [
          ["stretch", "کشیده"],
          ["flex-start", "بالا"],
          ["center", "وسط"],
          ["flex-end", "پایین"],
        ],
        { default: "stretch", selectors: { [row]: "align-items:{{VALUE}};" } },
      ),
      sel(
        "tag",
        "تگ HTML",
        [
          ["section", "section"],
          ["div", "div"],
          ["header", "header"],
          ["footer", "footer"],
          ["main", "main"],
          ["article", "article"],
        ],
        { default: "section" },
      ),
    ]),
    sec("s-color", "رنگ متن", "style", [
      clr("headingColor", "رنگ عنوان‌ها", { "{{WRAPPER}} h1,{{WRAPPER}} h2,{{WRAPPER}} h3,{{WRAPPER}} h4,{{WRAPPER}} .ew-heading": "color:{{VALUE}};" }),
      clr("textColor", "رنگ متن", { "{{WRAPPER}} .ew-text,{{WRAPPER}} p": "color:{{VALUE}};" }),
      clr("linkColor", "رنگ لینک", { "{{WRAPPER}} .ew-text a": "color:{{VALUE}};" }),
      sel(
        "textAlign",
        "تراز متن بخش",
        [
          ["", "پیش‌فرض"],
          ["start", "شروع"],
          ["center", "وسط"],
          ["end", "پایان"],
        ],
        { selectors: { [W]: "text-align:{{VALUE}};" } },
      ),
    ]),
    sec("s-overlay", "لایهٔ روی پس‌زمینه", "style", [
      clr("overlayColor", "رنگ لایه", { "{{WRAPPER}} > .eb-overlay": "background-color:{{VALUE}};" }),
      slider("overlayOpacity", "شفافیت لایه", 0, 1, { "{{WRAPPER}} > .eb-overlay": "opacity:{{VALUE}};" }, { step: 0.05, unit: "", default: 0.5 }),
    ]),
    sec("s-shape", "جداکنندهٔ شکلی (Shape Divider)", "style", [
      sel(
        "shapeTop",
        "شکل بالا",
        [
          ["", "هیچ"],
          ["wave", "موج"],
          ["curve", "منحنی"],
          ["triangle", "مثلث"],
          ["tilt", "کج"],
          ["arrow", "فلش"],
        ],
      ),
      clr("shapeTopColor", "رنگ شکل بالا", { "{{WRAPPER}} .eb-shape-top path": "fill:{{VALUE}};" }, { show: (s) => !!s.shapeTop }),
      slider("shapeTopHeight", "ارتفاع شکل بالا", 20, 300, { "{{WRAPPER}} .eb-shape-top svg": "height:{{VALUE}}px;" }, { show: (s) => !!s.shapeTop, default: 80 }),
      sel(
        "shapeBottom",
        "شکل پایین",
        [
          ["", "هیچ"],
          ["wave", "موج"],
          ["curve", "منحنی"],
          ["triangle", "مثلث"],
          ["tilt", "کج"],
          ["arrow", "فلش"],
        ],
      ),
      clr("shapeBottomColor", "رنگ شکل پایین", { "{{WRAPPER}} .eb-shape-bottom path": "fill:{{VALUE}};" }, { show: (s) => !!s.shapeBottom }),
      slider("shapeBottomHeight", "ارتفاع شکل پایین", 20, 300, { "{{WRAPPER}} .eb-shape-bottom svg": "height:{{VALUE}}px;" }, { show: (s) => !!s.shapeBottom, default: 80 }),
    ]),
    ...advancedSections(W, false),
  ];
}

export function columnSections(): CtlSection[] {
  const wrap = "{{WRAPPER}} > .eb-column-wrap";
  return [
    sec("c-layout", "چیدمان ستون", "content", [
      slider("width", "عرض ستون", 5, 100, { [W]: "width:{{VALUE}}%;" }, { unit: "%", responsive: true, default: 100 }),
      sel(
        "vAlign",
        "جای‌گیری عمودی محتوا",
        [
          ["", "بالا"],
          ["center", "وسط"],
          ["flex-end", "پایین"],
          ["space-between", "توزیع"],
        ],
        { selectors: { [wrap]: "justify-content:{{VALUE}};" } },
      ),
      sel(
        "hAlign",
        "جای‌گیری افقی محتوا",
        [
          ["", "کشیده"],
          ["flex-start", "شروع"],
          ["center", "وسط"],
          ["flex-end", "پایان"],
        ],
        { selectors: { [wrap]: "align-items:{{VALUE}};" } },
      ),
      sel(
        "tag",
        "تگ HTML",
        [
          ["div", "div"],
          ["aside", "aside"],
          ["article", "article"],
        ],
        { default: "div" },
      ),
    ]),
    sec("c-color", "رنگ متن", "style", [
      clr("headingColor", "رنگ عنوان‌ها", { "{{WRAPPER}} .ew-heading": "color:{{VALUE}};" }),
      clr("textColor", "رنگ متن", { "{{WRAPPER}} .ew-text": "color:{{VALUE}};" }),
    ]),
    ...advancedSections(wrap, false),
  ];
}

export const textareaForCode = (key: string, label: string): Ctl => area(key, label);
export { img };
