import { useEffect, useRef, useState } from "react";
import { FlipHorizontal, Grid3x3, Maximize, Minimize, Move, Plus, RotateCcw, Ruler, Tag, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { formatPrice, stockOf } from "@/data/looks";
import { liveGetProduct } from "@/data/catalog";
import {
  bringToFront,
  patchItem,
  removeItem,
  sendToBack,
  duplicateItem,
  useOutfit,
  setBoard,
  setSnap,
  setZoom,
} from "@/state/outfit";
import type { CanvasItem } from "@/state/outfit";

const ITEM_H = 240; // base item height in px (at scale 1)
const BASELINE_Y = 88; // % of board height where item bottoms snap

export function StyleCanvas({ selectedId, onSelect, onDropProduct }: { selectedId: string | null; onSelect: (id: string | null) => void; onDropProduct: (productId: string, x: number, y: number) => void }) {
  const { items, board, snap, zoom } = useOutfit();
  const [showPrices, setShowPrices] = useState(true);
  const [baseline, setBaseline] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);

  const toPercent = (clientX: number, clientY: number) => {
    const r = boardRef.current?.getBoundingClientRect();
    if (!r) return { x: 50, y: 50 };
    return {
      x: Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - r.top) / r.height) * 100)),
    };
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const item = items.find((i) => i.id === d.id);
      const r = boardRef.current?.getBoundingClientRect();
      if (!item || !r) return;
      const p = toPercent(e.clientX, e.clientY);
      let x = p.x - d.dx;
      let y = p.y - d.dy;
      if (baseline) {
        // snap the item's bottom edge to the baseline line
        const hPct = (ITEM_H * item.scale) / r.height * 100;
        y = BASELINE_Y - hPct / 2;
      } else if (snap) {
        x = Math.round(x / 4) * 4;
        y = Math.round(y / 4) * 4;
      }
      patchItem(d.id, { x: Math.max(3, Math.min(97, x)), y: Math.max(6, Math.min(97, y)) });
    };
    const up = () => {
      drag.current = null;
      setMoving(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [items, snap, baseline]);

  // keyboard nudge
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedId) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      const item = items.find((i) => i.id === selectedId);
      if (!item) return;
      const step = e.shiftKey ? 5 : 1;
      if (e.key === "ArrowLeft") patchItem(selectedId, { x: Math.max(3, item.x - step) });
      else if (e.key === "ArrowRight") patchItem(selectedId, { x: Math.min(97, item.x + step) });
      else if (e.key === "ArrowUp") patchItem(selectedId, { y: Math.max(6, item.y - step) });
      else if (e.key === "ArrowDown") patchItem(selectedId, { y: Math.min(97, item.y + step) });
      else if (e.key === "+" || e.key === "=") patchItem(selectedId, { scale: Math.min(2.4, item.scale + 0.08) });
      else if (e.key === "-") patchItem(selectedId, { scale: Math.max(0.4, item.scale - 0.08) });
      else if (e.key === "Delete" || e.key === "Backspace") {
        removeItem(selectedId);
        onSelect(null);
      }
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, items, onSelect]);

  const startDrag = (e: React.PointerEvent, item: CanvasItem) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    const p = toPercent(e.clientX, e.clientY);
    drag.current = { id: item.id, dx: p.x - item.x, dy: p.y - item.y };
    setMoving(item.id);
    bringToFront(item.id);
    onSelect(item.id);
  };

  const selected = items.find((i) => i.id === selectedId);
  const selectedProduct = selected ? liveGetProduct(selected.productId) : undefined;

  return (
    <div className="sb-canvas-wrap">
      <div className="sb-board-bar">
        <div className="sb-bar-group" role="group" aria-label="پس‌زمینهٔ بوم">
          {(
            [
              ["studio", "استودیو"],
              ["floor", "کف و دیوار"],
              ["dark", "تیره"],
              ["grid", "شبکه"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={cn("sb-board-swatch", board === id && "is-on")} onClick={() => setBoard(id)} aria-label={label} title={label} aria-pressed={board === id}>
              <span className="sr-only">{label}</span>
            </button>
          ))}
        </div>
        <div className="sb-bar-group">
          <button type="button" className={cn("sb-tool", snap && !baseline && "is-on")} onClick={() => { setSnap(!snap); if (baseline) setBaseline(false); }} aria-pressed={snap && !baseline} title="چسبیدن به شبکه" aria-label="چسبیدن به شبکه">
            <Grid3x3 width={14} height={14} />
          </button>
          <button type="button" className={cn("sb-tool", baseline && "is-on")} onClick={() => { setBaseline(!baseline); if (snap) setSnap(false); }} aria-pressed={baseline} title="چسبیدن به خط کف (بست‌چینی)" aria-label="چسبیدن به خط کف">
            <Ruler width={14} height={14} />
          </button>
          <button type="button" className={cn("sb-tool", showPrices && "is-on")} onClick={() => setShowPrices((v) => !v)} aria-pressed={showPrices} title="نمایش قیمت روی بوم" aria-label="نمایش قیمت">
            <Tag width={14} height={14} />
          </button>
          <button type="button" className="sb-tool" onClick={() => setZoom(Math.max(0.6, zoom - 0.1))} aria-label="کوچک‌نمایی">
            <Minimize width={14} height={14} />
          </button>
          <span className="sb-zoom">{Math.round(zoom * 100).toLocaleString("fa-IR")}٪</span>
          <button type="button" className="sb-tool" onClick={() => setZoom(Math.min(1.6, zoom + 0.1))} aria-label="بزرگ‌نمایی">
            <Maximize width={14} height={14} />
          </button>
        </div>
      </div>

      <div
        ref={boardRef}
        className={cn("sb-board", board === "grid" && "is-grid", board === "dark" && "is-dark")}
        style={{ transform: `scale(${zoom})` }}
        onPointerDown={() => onSelect(null)}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          const id = e.dataTransfer.getData("text/plain");
          if (!id) return;
          e.preventDefault();
          const p = toPercent(e.clientX, e.clientY);
          onDropProduct(id, p.x, p.y);
        }}
        role="application"
        aria-label="بوم چیدمان استایل"
      >
        {board === "floor" && <span className="sb-floor-line" aria-hidden />}
        {baseline && <span className="sb-baseline" aria-hidden />}

        {items.length === 0 && (
          <div className="sb-board-empty">
            <Move width={24} height={24} />
            <p>محصول را از سینی کنار بکش و اینجا رها کن، یا دکمهٔ «افزودن» هر محصول را بزن.</p>
            <small>ماوس یا انگشت: جابه‌جایی · جهت‌های صفحه‌کلید: حرکت ظریف · +/−: اندازه · Delete: حذف</small>
          </div>
        )}

        {items
          .slice()
          .sort((a, b) => a.z - b.z)
          .map((item) => {
            const product = liveGetProduct(item.productId);
            const color = product?.colors.find((c) => c.id === item.colorId) ?? product?.colors[0];
            const isSel = item.id === selectedId;
            return (
              <div
                key={item.id}
                className={cn("sb-item", isSel && "is-selected", moving === item.id && "is-moving")}
                style={{
                  left: `${item.x}%`,
                  top: `${item.y}%`,
                  zIndex: item.z,
                  width: `${(product?.aspect ?? 0.36) * ITEM_H * item.scale}px`,
                  height: `${ITEM_H * item.scale}px`,
                }}
                onPointerDown={(e) => startDrag(e, item)}
                onDoubleClick={() => duplicateItem(item.id)}
              >
                <div className="sb-item-inner" style={{ transform: `rotate(${item.rotate}deg) scaleX(${item.flip ? -1 : 1})` }}>
                  {product ? (
                    <div className="pointer-events-none relative h-full w-full overflow-visible">
                      <img src={product.image} alt={product.name} draggable={false} className="h-full w-auto max-w-none object-contain" style={{ marginInline: "auto", filter: "drop-shadow(0 12px 18px rgba(22,19,15,0.25))" }} />
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-lg border border-dashed border-ink/20 text-[10px] text-ink-45">
                      محصول حذف شده
                    </div>
                  )}
                </div>
                {color && <span className="sb-item-dot" style={{ background: color.hex }} title={color.name} />}
                {isSel && <span className="sb-item-ring" aria-hidden />}
                {isSel && product && <span className="sb-item-name" dir="rtl">{product.name}</span>}
                {showPrices && product && <span className="sb-item-price">{formatPrice(product.price)}</span>}
              </div>
            );
          })}
      </div>

      {selected && selectedProduct && (
        <div className="sb-item-bar" onPointerDown={(e) => e.stopPropagation()}>
          <span className="sb-item-bar-title">{selectedProduct.name}</span>
          <label className="sb-mini">
            چرخش
            <input type="range" min={-40} max={40} value={selected.rotate} onChange={(e) => patchItem(selected.id, { rotate: Number(e.target.value) })} aria-label="چرخش" />
          </label>
          <label className="sb-mini">
            اندازه
            <input type="range" min={0.4} max={2.4} step={0.05} value={selected.scale} onChange={(e) => patchItem(selected.id, { scale: Number(e.target.value) })} aria-label="اندازه" />
          </label>
          <button type="button" className="sb-tool" title="وارونه کردن" onClick={() => patchItem(selected.id, { flip: !selected.flip })} aria-label="وارونه کردن">
            <FlipHorizontal width={14} height={14} />
          </button>
          <button type="button" className="sb-tool" title="صاف کردن" onClick={() => patchItem(selected.id, { rotate: 0, flip: false })} aria-label="صاف کردن">
            <RotateCcw width={14} height={14} />
          </button>
          <button type="button" className="sb-tool" title="جلو آوردن" onClick={() => bringToFront(selected.id)} aria-label="جلو آوردن">
            <Move width={14} height={14} />
          </button>
          <button type="button" className="sb-tool" title="عقب بردن" onClick={() => sendToBack(selected.id)} aria-label="عقب بردن">
            <Minimize width={14} height={14} />
          </button>
          <button type="button" className="sb-tool" title="تکرار (دوبار کلیک)" onClick={() => duplicateItem(selected.id)} aria-label="تکرار">
            <Plus width={14} height={14} />
          </button>
          <button
            type="button"
            className="sb-tool"
            title="حذف از بوم"
            onClick={() => {
              removeItem(selected.id);
              onSelect(null);
            }}
            aria-label="حذف از بوم"
            style={{ color: "#9c2f22" }}
          >
            <X width={14} height={14} />
          </button>
        </div>
      )}

      {selected && selectedProduct && (
        <p className="sb-stock-hint">
          {stockOfSafe(selectedProduct, selected.colorId, selected.sizeId)}
        </p>
      )}
    </div>
  );
}


function stockOfSafe(p: { id: string; colors: { id: string }[]; sizes: { id: string }[] }, colorId: string, sizeId: string) {
  const v = stockOf(p as never, colorId, sizeId);
  if (v === 0) return "این ترکیب رنگ و سایز در حال حاضر ناموجود است.";
  if (v <= 2) return `فقط ${v.toLocaleString("fa-IR")} عدد از این ترکیب در انبار مانده است.`;
  return `${v.toLocaleString("fa-IR")} عدد از این ترکیب در انبار موجود است.`;
}
