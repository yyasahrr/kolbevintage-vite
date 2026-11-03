import { LayoutGrid } from "lucide-react";
import { alignText, clr, sec, sel, slider, txt, preset, type WidgetDef } from "./core";
import { href } from "./ctx";
import { useOps } from "@/state/ops";
import { faNum } from "./kit";
import { resolveImg } from "./stock";

/**
 * Mega-menu widget for the page builder. It renders whichever mega menu the
 * admin has designed in the panel (columns, links, CTA card) so the same
 * structure can be dropped into a landing page or a custom header.
 */
const menu: WidgetDef = {
  type: "mega-menu",
  title: "مگا منو (پنل ادمین)",
  icon: LayoutGrid,
  category: "site",
  keywords: "mega menu header navigation مگا منو",
  defaults: { which: "", columns: 2, showCta: true, heading: "دسته‌بندی‌ها" },
  presets: [
    preset("two", "دو ستون + کارت", { columns: 2, showCta: true }, "کلاسیک"),
    preset("three", "سه ستون", { columns: 3, showCta: false }, "فقط لینک"),
    preset("compact", "فشرده", { columns: 1, showCta: false, showHeading: false }, "مینیمال"),
  ],
  sections: [
    sec("c", "محتوا", "content", [
      { key: "which", label: "کدام مگا منو؟", type: "select", options: [{ value: "", label: "اولین منوی فعال" }] },
      sel("columns", "تعداد ستون", [["1", "یک"], ["2", "دو"], ["3", "سه"]]),
      slider("cols", "ستون‌ها در دسکتاپ", 1, 4, { "{{WRAPPER}} .ew-mm-cols": "grid-template-columns:repeat({{VALUE}},1fr);" }, { default: 2 }),
      txt("heading", "عنوان بخش لینک‌ها"),
      { key: "showHeading", label: "نمایش عنوان", type: "switch", default: true },
      { key: "showCta", label: "نمایش کارت ویژه", type: "switch", default: true },
      sel("ctaPos", "جای کارت", [["end", "سمت چپ"], ["start", "سمت راست"], ["bottom", "پایین"]]),
      alignText("align", "{{WRAPPER}} .ew-mm"),
    ]),
    sec("s", "استایل", "style", [
      clr("bg", "پس‌زمینه", { "{{WRAPPER}} .ew-mm": "background-color:{{VALUE}};" }),
      clr("tc", "رنگ لینک‌ها", { "{{WRAPPER}} .ew-mm-link": "color:{{VALUE}};" }),
      clr("hc", "رنگ عنوان ستون", { "{{WRAPPER}} .ew-mm-col-title": "color:{{VALUE}};" }),
      slider("gap", "فاصلهٔ ستون‌ها", 0, 60, { "{{WRAPPER}} .ew-mm-cols": "gap:{{VALUE}}px;" }, { default: 24 }),
      clr("ctaBg", "رنگ کارت ویژه", { "{{WRAPPER}} .ew-mm-cta": "background-color:{{VALUE}};" }),
      slider("radius", "گردی", 0, 40, { "{{WRAPPER}} .ew-mm": "border-radius:{{VALUE}}px;" }, { default: 16 }),
    ]),
  ],
  render: ({ s }) => {
    const { megaMenus } = useOps();
    const menu = s.which ? megaMenus.find((m) => m.id === s.which) : megaMenus.find((m) => m.active);
    if (!menu) return <div className="ew-empty">هنوز مگا منویی در پنل ادمین ساخته نشده. از بخش «مگا منو» یکی بساز.</div>;
    const cols = Number(s.cols) || Number(s.columns) || 2;
    return (
      <nav className="ew-mm" aria-label={menu.label}>
        {s.showHeading !== false && (
          <div className="ew-mm-head">
            <b>{s.heading || menu.label}</b>
            <small>{faNum(menu.columns.reduce((n, c) => n + c.links.length, 0))} لینک</small>
          </div>
        )}
        <div className="ew-mm-grid" style={{ direction: "rtl" }}>
          <div className="ew-mm-cols" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
            {menu.columns.map((col) => (
              <div key={col.title} className="ew-mm-col">
                {col.title && <p className="ew-mm-col-title">{col.title}</p>}
                <ul>
                  {col.links.map((ln) => (
                    <li key={ln.href + ln.label}>
                      <a className="ew-mm-link" href={href(ln.href) || "#"}>{ln.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {s.showCta !== false && (
            <a className="ew-mm-cta" href={href(menu.cta.href) || "#"} style={menu.cta.image ? { backgroundImage: `url("${resolveImg(menu.cta.image)}")` } : undefined}>
              <b>{menu.cta.title}</b>
              <small>{menu.cta.text}</small>
              <span>مشاهده ←</span>
            </a>
          )}
        </div>
      </nav>
    );
  },
};

export const WIDGETS_G: WidgetDef[] = [menu];
