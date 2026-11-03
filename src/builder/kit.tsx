import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ElementType, ReactNode } from "react";
import type { BNode } from "./core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { iconByName } from "./icons";

/** Inline-editable text. Only becomes contentEditable while the element is selected in the editor. */
export function Editable({
  value,
  active,
  onCommit,
  as: Tag = "span",
  html = false,
  className,
  style,
}: {
  value: string;
  active: boolean;
  onCommit?: (v: string) => void;
  as?: ElementType;
  html?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  if (!active || !onCommit) {
    return html ? (
      <Tag className={className} style={style} dangerouslySetInnerHTML={{ __html: value }} />
    ) : (
      <Tag className={className} style={style}>
        {value}
      </Tag>
    );
  }
  const common = {
    className: `${className ?? ""} eb-inline`,
    style,
    contentEditable: true,
    suppressContentEditableWarning: true,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
    },
    onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
  };
  return html ? (
    <Tag
      key={value}
      {...common}
      onBlur={(e: React.FocusEvent<HTMLElement>) => onCommit(e.currentTarget.innerHTML)}
      dangerouslySetInnerHTML={{ __html: value }}
    />
  ) : (
    <Tag key={value} {...common} onBlur={(e: React.FocusEvent<HTMLElement>) => onCommit(e.currentTarget.innerText)}>
      {value}
    </Tag>
  );
}

export function IconView({ name, size = 20, className, style }: { name?: string; size?: number; className?: string; style?: CSSProperties }) {
  const I = iconByName(name);
  if (!I) return null;
  return <I className={className} style={style} width={size} height={size} />;
}

export function useInView<T extends Element>(once = true): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          if (once) io.disconnect();
        } else if (!once) setSeen(false);
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);
  return [ref, seen];
}

/** Slide-based carousel (RTL aware). `fade` stacks slides instead of translating. */
export function Carousel({
  items,
  perView = 1,
  autoplay = false,
  speed = 4000,
  arrows = true,
  dots = true,
  fade = false,
  gap = 16,
  className,
}: {
  items: ReactNode[];
  perView?: number;
  autoplay?: boolean;
  speed?: number;
  arrows?: boolean;
  dots?: boolean;
  fade?: boolean;
  gap?: number;
  className?: string;
}) {
  const count = items.length;
  const per = fade ? 1 : Math.max(1, Math.min(perView, Math.max(1, count)));
  const max = Math.max(0, count - per);
  const [i, setI] = useState(0);
  const [hover, setHover] = useState(false);
  const idx = Math.min(i, max);

  useEffect(() => {
    if (!autoplay || hover || count <= per) return;
    const t = window.setInterval(() => setI((v) => (Math.min(v, max) >= max ? 0 : Math.min(v, max) + 1)), Math.max(1200, speed));
    return () => window.clearInterval(t);
  }, [autoplay, hover, speed, max, count, per]);

  const go = (d: 1 | -1) => setI(() => (idx + d > max ? 0 : idx + d < 0 ? max : idx + d));

  if (!count) return <div className="ew-empty">این کاروسل هنوز آیتمی ندارد.</div>;

  return (
    <div
      className={`ew-carousel ${className ?? ""}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className={`ew-car-viewport ${fade ? "is-fade" : ""}`}>
        {fade ? (
          items.map((it, n) => (
            <div key={n} className="ew-car-slide is-fade" style={{ opacity: n === idx ? 1 : 0, pointerEvents: n === idx ? "auto" : "none" }}>
              {it}
            </div>
          ))
        ) : (
          <div className="ew-car-track" style={{ transform: `translateX(${(idx * 100) / per}%)` }}>
            {items.map((it, n) => (
              <div key={n} className="ew-car-slide" style={{ flex: `0 0 ${100 / per}%`, padding: gap / 2 }}>
                {it}
              </div>
            ))}
          </div>
        )}
      </div>
      {arrows && count > per && (
        <>
          <button type="button" className="ew-car-arrow ew-car-prev" aria-label="قبلی" onClick={() => go(-1)}>
            <ChevronRight width={18} height={18} />
          </button>
          <button type="button" className="ew-car-arrow ew-car-next" aria-label="بعدی" onClick={() => go(1)}>
            <ChevronLeft width={18} height={18} />
          </button>
        </>
      )}
      {dots && max > 0 && (
        <div className="ew-car-dots">
          {Array.from({ length: max + 1 }).map((_, n) => (
            <button key={n} type="button" aria-label={`اسلاید ${n + 1}`} className={n === idx ? "is-on" : ""} onClick={() => setI(n)} />
          ))}
        </div>
      )}
    </div>
  );
}

export const faNum = (n: number | string) => Number(n).toLocaleString("fa-IR");

/** The renderer registers itself here so widgets (e.g. Template) can render nested trees without import cycles. */
export const hooks: { renderNodes?: (nodes: BNode[]) => ReactNode } = {};
