import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  FlipHorizontal,
  Grid3x3,
  Layers,
  Minus,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
} from "lucide-react";
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
import { ProductThumb } from "./ProductThumb";

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
const limit = (value: number, half: number) =>
  half >= 50 ? 50 : clamp(value, half, 100 - half);

export function StyleCanvas({
  selectedId,
  onSelect,
  onDropProduct,
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onDropProduct: (productId: string, x: number, y: number) => void;
}) {
  const { items, board, snap, zoom } = useOutfit();
  const [showPrices, setShowPrices] = useState(true);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [moving, setMoving] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    id: string;
    pointerId: number;
    dx: number;
    dy: number;
  } | null>(null);
  const selected = items.find((i) => i.id === selectedId);
  const product = selected ? liveGetProduct(selected.productId) : undefined;
  const selectedColor =
    product?.colors.find((c) => c.id === selected?.colorId) ??
    product?.colors[0];
  const selectedSize =
    product?.sizes.find((s) => s.id === selected?.sizeId) ?? product?.sizes[0];
  useEffect(() => {
    if (selectedId && !items.some((item) => item.id === selectedId))
      onSelect(null);
  }, [items, selectedId, onSelect]);
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const measure = () =>
      setSize({
        width: board.clientWidth || 1,
        height: board.clientHeight || 1,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    return () => observer.disconnect();
  }, [zoom]);
  const position = (item: CanvasItem) => {
    const base = size.width / zoom < 500 ? 34 : 24;
    // Keep even the largest item inside the visible board, including its caption.
    const maxWidthForHeight = Math.max(
      1,
      ((size.height - 60) / 1.25 / size.width) * 100,
    );
    const width = Math.min(
      clamp(base * item.scale, base * 0.4, base * 2.4),
      96,
      maxWidthForHeight,
    );
    const halfX = width / 2 + 1;
    const halfY =
      ((((size.width * width) / 100) * 1.25 + 60) / size.height) * 50 + 1;
    return {
      x: limit(item.x, halfX),
      y: limit(item.y, halfY),
      width,
      halfX,
      halfY,
    };
  };
  const point = (clientX: number, clientY: number) => {
    const r = boardRef.current?.getBoundingClientRect();
    return r
      ? {
          x: ((clientX - r.left) / r.width) * 100,
          y: ((clientY - r.top) / r.height) * 100,
        }
      : { x: 50, y: 50 };
  };
  const startDrag = (
    e: React.PointerEvent<HTMLButtonElement>,
    item: CanvasItem,
  ) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.focus();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = point(e.clientX, e.clientY),
      shown = position(item);
    drag.current = {
      id: item.id,
      pointerId: e.pointerId,
      dx: p.x - shown.x,
      dy: p.y - shown.y,
    };
    setMoving(item.id);
    onSelect(item.id);
    bringToFront(item.id);
  };
  const moveDrag = (
    e: React.PointerEvent<HTMLButtonElement>,
    item: CanvasItem,
  ) => {
    const d = drag.current;
    if (!d || d.id !== item.id || d.pointerId !== e.pointerId) return;
    e.preventDefault();
    const p = point(e.clientX, e.clientY),
      bounds = position(item);
    let x = p.x - d.dx,
      y = p.y - d.dy;
    if (snap) {
      x = Math.round(x / 4) * 4;
      y = Math.round(y / 4) * 4;
    }
    patchItem(item.id, {
      x: limit(x, bounds.halfX),
      y: limit(y, bounds.halfY),
    });
  };
  const stopDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId === e.pointerId) {
      drag.current = null;
      setMoving(null);
    }
  };
  const nudge = (item: CanvasItem, dx: number, dy: number) => {
    const pos = position(item);
    patchItem(item.id, {
      x: limit(pos.x + dx, pos.halfX),
      y: limit(pos.y + dy, pos.halfY),
    });
  };
  const keyMove = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    item: CanvasItem,
  ) => {
    const n = e.shiftKey ? 5 : 1;
    if (e.key === "ArrowLeft") nudge(item, -n, 0);
    else if (e.key === "ArrowRight") nudge(item, n, 0);
    else if (e.key === "ArrowUp") nudge(item, 0, -n);
    else if (e.key === "ArrowDown") nudge(item, 0, n);
    else if (e.key === "+" || e.key === "=")
      patchItem(item.id, { scale: clamp(item.scale + 0.1, 0.4, 2.4) });
    else if (e.key === "-")
      patchItem(item.id, { scale: clamp(item.scale - 0.1, 0.4, 2.4) });
    else if (e.key === "Delete" || e.key === "Backspace") {
      removeItem(item.id);
      onSelect(null);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const duplicate = () => {
    if (!selected) return;
    const id = duplicateItem(selected.id);
    if (id) onSelect(id);
  };
  return (
    <section className="sb-canvas-wrap" aria-label="ویرایشگر بوم استایل">
      <div className="sb-board-bar">
        <div>
          <p className="sb-board-eyebrow">STYLE BOARD</p>
          <h2 className="sb-board-title">
            بوم استایل تو{" "}
            <span>{items.length.toLocaleString("fa-IR")} قطعه</span>
          </h2>
        </div>
        <div className="sb-board-tools">
          <div className="sb-bar-group" role="group" aria-label="پس‌زمینهٔ بوم">
            {(
              [
                ["studio", "شبکه سفید"],
                ["floor", "کف و دیوار"],
                ["dark", "تیره"],
                ["grid", "شبکه"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-board={id}
                className={cn("sb-board-swatch", board === id && "is-on")}
                onClick={() => setBoard(id)}
                aria-label={`پس‌زمینه ${label}`}
                title={label}
                aria-pressed={board === id}
              />
            ))}
          </div>
          <button
            type="button"
            className={cn("sb-tool", snap && "is-on")}
            onClick={() => setSnap(!snap)}
            aria-label="چسبیدن به شبکه"
            aria-pressed={snap}
            title="چسبیدن به شبکه"
          >
            <Grid3x3 size={16} />
          </button>
          <button
            type="button"
            className={cn("sb-tool", showPrices && "is-on")}
            onClick={() => setShowPrices(!showPrices)}
            aria-label="نمایش قیمت"
            aria-pressed={showPrices}
            title="نمایش قیمت"
          >
            <Tag size={16} />
          </button>
          <div
            className="sb-zoom-controls"
            role="group"
            aria-label="بزرگ‌نمایی بوم"
          >
            <button
              type="button"
              className="sb-tool"
              onClick={() =>
                setZoom(Math.max(0.6, Number((zoom - 0.1).toFixed(1))))
              }
              disabled={zoom <= 0.6}
              aria-label="کوچک‌نمایی"
            >
              <Minus size={16} />
            </button>
            <button
              type="button"
              className="sb-zoom-reset"
              onClick={() => setZoom(1)}
              aria-label="بازنشانی بزرگ‌نمایی"
            >
              {Math.round(zoom * 100).toLocaleString("fa-IR")}٪
            </button>
            <button
              type="button"
              className="sb-tool"
              onClick={() =>
                setZoom(Math.min(1.6, Number((zoom + 0.1).toFixed(1))))
              }
              disabled={zoom >= 1.6}
              aria-label="بزرگ‌نمایی"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      </div>
      <p className="sb-board-help">
        قطعه را بکش و رها کن؛ با انتخاب هر قطعه ابزارهای ویرایش ظاهر می‌شوند.
      </p>
      <div className="sb-stage-viewport" aria-label="محدوده پیمایش بوم">
        <div
          ref={boardRef}
          className={cn(
            "sb-board",
            board === "grid" && "is-grid",
            board === "dark" && "is-dark",
            board === "floor" && "is-floor",
          )}
          style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
          role="region"
          aria-label="بوم چیدمان استایل"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onSelect(null);
          }}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.types).includes("text/plain")) {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }
          }}
          onDrop={(e) => {
            const id = e.dataTransfer.getData("text/plain");
            if (!id || !liveGetProduct(id)) return;
            e.preventDefault();
            const p = point(e.clientX, e.clientY);
            onDropProduct(id, clamp(p.x, 0, 100), clamp(p.y, 0, 100));
          }}
        >
          {board === "floor" && <span className="sb-floor-line" aria-hidden />}
          {!items.length && (
            <div className="sb-board-empty">
              <div className="sb-empty-icon">
                <Layers size={23} />
              </div>
              <h3>استایل خودت را بساز</h3>
              <p>
                از پنل محصولات کنار بوم، قطعه‌ای را اضافه کن یا با ماوس آن را
                اینجا بکش.
              </p>
              <small>
                برای جابه‌جایی با صفحه‌کلید، قطعه را انتخاب و از کلیدهای جهت‌دار
                استفاده کن.
              </small>
            </div>
          )}
          {items
            .slice()
            .sort((a, b) => a.z - b.z)
            .map((item) => {
              const p = liveGetProduct(item.productId),
                color =
                  p?.colors.find((c) => c.id === item.colorId) ?? p?.colors[0],
                pos = position(item),
                active = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "sb-canvas-item",
                    active && "is-selected",
                    moving === item.id && "is-moving",
                  )}
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    width: `${pos.width}%`,
                    zIndex: item.z,
                  }}
                  aria-label={
                    p ? `قطعه ${p.name} روی بوم` : "قطعه ناموجود روی بوم"
                  }
                  aria-pressed={active}
                  aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(item.id);
                  }}
                  onPointerDown={(e) => startDrag(e, item)}
                  onPointerMove={(e) => moveDrag(e, item)}
                  onPointerUp={stopDrag}
                  onPointerCancel={stopDrag}
                  onLostPointerCapture={stopDrag}
                  onKeyDown={(e) => keyMove(e, item)}
                >
                  <span className="sb-canvas-photo">
                    <span
                      className="sb-canvas-art"
                      style={{
                        transform: `rotate(${item.rotate}deg) scaleX(${item.flip ? -1 : 1})`,
                      }}
                    >
                      {p ? (
                        <ProductThumb
                          product={p}
                          colorId={color?.id}
                          tint={color?.hex}
                          decorative
                          tileAspect={0.8}
                          className="w-full"
                        />
                      ) : (
                        <span className="sb-missing-item">
                          محصول در دسترس نیست
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="sb-canvas-caption">
                    <span className="sb-canvas-name">
                      {p?.name ?? "محصول ناموجود"}
                    </span>
                    {showPrices && p && (
                      <span className="sb-canvas-price">
                        {formatPrice(p.price)}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
        </div>
      </div>
      {selected && (
        <div className="sb-inspector" aria-label="تنظیمات قطعه انتخاب‌شده">
          <div className="sb-inspector-head">
            <div>
              <span>قطعهٔ انتخاب‌شده</span>
              <strong>{product?.name ?? "محصول در دسترس نیست"}</strong>
            </div>
            <button
              type="button"
              className="sb-tool sb-delete"
              aria-label="حذف از بوم"
              onClick={() => {
                removeItem(selected.id);
                onSelect(null);
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div className="sb-inspector-controls">
            <label className="sb-mini">
              اندازه{" "}
              <input
                type="range"
                min={0.4}
                max={2.4}
                step={0.05}
                value={selected.scale}
                onChange={(e) =>
                  patchItem(selected.id, { scale: Number(e.target.value) })
                }
                aria-label="اندازه قطعه"
              />
              <output>
                {Math.round(selected.scale * 100).toLocaleString("fa-IR")}٪
              </output>
            </label>
            <label className="sb-mini">
              چرخش{" "}
              <input
                type="range"
                min={-40}
                max={40}
                value={selected.rotate}
                onChange={(e) =>
                  patchItem(selected.id, { rotate: Number(e.target.value) })
                }
                aria-label="چرخش قطعه"
              />
              <output>{selected.rotate.toLocaleString("fa-IR")}°</output>
            </label>
            <div className="sb-bar-group" role="group" aria-label="ابزار قطعه">
              <button
                type="button"
                className={cn("sb-tool", selected.flip && "is-on")}
                onClick={() => patchItem(selected.id, { flip: !selected.flip })}
                aria-label="وارونه کردن"
                aria-pressed={selected.flip}
              >
                <FlipHorizontal size={16} />
              </button>
              <button
                type="button"
                className="sb-tool"
                onClick={() =>
                  patchItem(selected.id, { rotate: 0, flip: false, scale: 1 })
                }
                aria-label="بازنشانی قطعه"
              >
                <RotateCcw size={16} />
              </button>
              <button
                type="button"
                className="sb-tool"
                onClick={() => bringToFront(selected.id)}
                aria-label="جلو آوردن"
              >
                <Layers size={16} />
              </button>
              <button
                type="button"
                className="sb-tool"
                onClick={() => sendToBack(selected.id)}
                aria-label="عقب بردن"
              >
                <Layers size={16} style={{ transform: "rotate(180deg)" }} />
              </button>
              <button
                type="button"
                className="sb-tool"
                onClick={duplicate}
                aria-label="تکرار قطعه"
              >
                <Copy size={16} />
              </button>
            </div>
            <div
              className="sb-bar-group"
              role="group"
              aria-label="جابه‌جایی قطعه"
            >
              <button
                type="button"
                className="sb-tool"
                onClick={() => nudge(selected, -4, 0)}
                aria-label="حرکت به چپ"
              >
                <ArrowLeft size={16} />
              </button>
              <button
                type="button"
                className="sb-tool"
                onClick={() => nudge(selected, 4, 0)}
                aria-label="حرکت به راست"
              >
                <ArrowRight size={16} />
              </button>
              <button
                type="button"
                className="sb-tool"
                onClick={() => nudge(selected, 0, -4)}
                aria-label="حرکت به بالا"
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                className="sb-tool"
                onClick={() => nudge(selected, 0, 4)}
                aria-label="حرکت به پایین"
              >
                <ArrowDown size={16} />
              </button>
            </div>
          </div>
          {product && (
            <p className="sb-inspector-note">
              {selectedColor &&
              selectedSize &&
              stockOf(product, selectedColor.id, selectedSize.id) > 0
                ? "این ترکیب در حال حاضر موجود است."
                : "این ترکیب در حال حاضر ناموجود است."}{" "}
              رنگ و سایز را در بخش «ست تو» تغییر بده. اندازه تا مرز بوم محدود
              می‌شود.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
