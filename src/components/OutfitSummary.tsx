import { useEffect, useMemo, useState } from "react";
import { BookmarkCheck, Heart, Layers, Save, ShoppingBag, Sparkles, Trash2, Wallet } from "lucide-react";
import { cn } from "@/utils/cn";
import { liveGetProduct } from "@/data/catalog";
import { formatPrice, stockOf, tomanRate } from "@/data/looks";
import { paletteScore, budgetCheck, stylistNote, hexToHsl, type Profile } from "@/lib/stylist";
import { useLiveCatalog } from "@/state/live-catalog";
import { useCart } from "@/state/cart";
import { clearBoard, loadOutfit, patchItem, removeItem, removeOutfit, saveOutfit, useOutfit } from "@/state/outfit";
import { ProductThumb } from "./ProductThumb";

export function OutfitSummary({ profile, onEmpty }: { profile?: Profile | null; onEmpty?: () => void }) {
  const { items, saved } = useOutfit();
  const catalog = useLiveCatalog();
  const { add, notify, toggleWish, isWished, lines } = useCart();
  const [budget, setBudget] = useState(profile?.budget ?? 0);
  useEffect(() => { if (profile) setBudget(profile.budget); }, [profile]);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");

  const rows = useMemo(
    () =>
      items
        .map((item) => {
          const product = liveGetProduct(item.productId);
          if (!product) return null;
          const color = product.colors.find((c) => c.id === item.colorId) ?? product.colors[0];
          const size = product.sizes.find((s) => s.id === item.sizeId) ?? product.sizes[0];
          const stock = stockOf(product, color.id, size.id);
          return { item, product, color, size, stock };
        })
        .filter(Boolean) as {
        item: (typeof items)[number];
        product: NonNullable<ReturnType<typeof liveGetProduct>>;
        color: { id: string; name: string; hex: string };
        size: { id: string; label: string };
        stock: number;
      }[],
    [items, catalog],
  );

  const hexes = rows.map((r) => r.color.hex);
  const harmonyResult = useMemo(() => paletteScore(hexes), [hexes.join("|")]);
  const total = rows.reduce((n, r) => n + r.product.price, 0);
  // Count repeated board items and items already in the cart against the
  // same live variant stock. The server still makes the final reservation.
  const used = new Map<string, number>();
  for (const line of lines) { const key = JSON.stringify([line.productId, line.colorId, line.sizeId]); used.set(key, (used.get(key) ?? 0) + line.qty); }
  const purchasable = rows.filter((r) => { const key = JSON.stringify([r.product.id, r.color.id, r.size.id]); const count = used.get(key) ?? 0; if (r.stock <= count) return false; used.set(key, count + 1); return true; });
  const money = budgetCheck(rows.map((r) => ({ price: r.product.price })), budget);
  const note = rows.length ? stylistNote(profile ?? ({} as Profile), rows.map((r) => ({ color: r.color.hex })), harmonyResult.score) : "";

  const addAll = () => {
    if (!purchasable.length) return;
    add(
      purchasable.map((r) => ({ product: r.product, color: r.color, size: r.size, lookName: "استایل بیلدر" })),
      {
        title: `${purchasable.length.toLocaleString("fa-IR")} قطعه به سبد اضافه شد`,
        detail: `ست شخصی تو — ${formatPrice(purchasable.reduce((n, r) => n + r.product.price, 0))}`,
      },
    );
  };

  const doSave = () => {
    const title = name.trim() || `ست ${saved.length + 1}`;
    saveOutfit(title);
    notify("استایل ذخیره شد", title);
    setName("");
    setSaving(false);
  };

  return (
    <div className="sb-summary">
      <div className="sb-sum-head">
        <div>
          <h3 className="sb-sum-title">
            <Layers width={16} height={16} /> ست تو
          </h3>
          <p className="sb-sum-sub">
            {rows.length ? `${rows.length.toLocaleString("fa-IR")} قطعه روی بوم` : "هنوز قطعه‌ای اضافه نکرده‌ای"}
          </p>
        </div>
        {items.length > 0 && (
          <button type="button" className="sb-ghost" onClick={() => { if (!window.confirm("همهٔ قطعه‌ها از بوم پاک شوند؟")) return; clearBoard(); onEmpty?.(); }}>
            <Trash2 width={13} height={13} /> پاک کردن بوم
          </button>
        )}
      </div>

      {/* harmony meter */}
      {rows.length > 0 && (
        <div className="sb-harmony">
          <div className="sb-harm-top">
            <span className="sb-harm-label">
              <Sparkles width={13} height={13} /> هماهنگی رنگ
            </span>
            <b className={cn("sb-harm-score", harmonyResult.score >= 74 ? "is-good" : harmonyResult.score >= 58 ? "is-mid" : "is-bad")}>
              {harmonyResult.score.toLocaleString("fa-IR")}
            </b>
          </div>
          <div className="sb-harm-bar">
            <span style={{ width: `${harmonyResult.score}%` }} />
          </div>
          <p className="sb-harm-verdict">{harmonyResult.verdict}</p>
          <div className="sb-palette">
            {hexes.map((h, i) => (
              <span key={i} className="sb-swatch-lg" style={{ background: h }} title={hexToHsl(h).s < 0.16 ? "خنثی" : `رنگ ${Math.round(hexToHsl(h).h)}°`} />
            ))}
          </div>
          {harmonyResult.worst && harmonyResult.score < 74 && (
            <p className="sb-harm-warn">
              ضعیف‌ترین ترکیب: <i style={{ background: harmonyResult.worst.a }} /> با <i style={{ background: harmonyResult.worst.b }} />
            </p>
          )}
          {note && <p className="sb-note">{note}</p>}
        </div>
      )}

      {rows.length === 0 && (
        <div className="sb-harmony sb-harmony-empty">
          <span className="sb-harm-label"><Sparkles width={13} height={13} /> هماهنگی رنگ</span>
          <p className="sb-empty-note">با افزودن قطعه به بوم، امتیاز هماهنگی رنگ اینجا نمایش داده می‌شود.</p>
        </div>
      )}

      {/* items */}
      <ul className="sb-items">
        {rows.map(({ item, product, color, size, stock }) => (
          <li key={item.id} className="sb-item-row">
            <ProductThumb product={product} colorId={color.id} tint={color.hex} className="w-[58px]" />
            <div className="sb-item-main">
              <p className="sb-item-cat">{product.category}</p>
              <p className="sb-item-name">{product.name}</p>

              <div className="sb-swatches">
                {product.colors.map((c) => {
                  const out = product.sizes.every((s) => stockOf(product, c.id, s.id) === 0);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-label={`رنگ ${c.name}${out ? " — ناموجود" : ""}`}
                      aria-pressed={c.id === color.id}
                      disabled={out}
                      onClick={() => {
                        const nextSize = product.sizes.find((s) => stockOf(product, c.id, s.id) > 0);
                        patchItem(item.id, { colorId: c.id, ...(nextSize ? { sizeId: nextSize.id } : {}) });
                      }}
                      className={cn("sb-swatch", c.id === color.id && "is-on", out && "is-out")}
                      style={{ background: c.hex }}
                    />
                  );
                })}
              </div>

              <div className="sb-sizes">
                {product.sizes.map((s) => {
                  const out = stockOf(product, color.id, s.id) === 0;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={out}
                      aria-pressed={s.id === size.id}
                      onClick={() => patchItem(item.id, { sizeId: s.id })}
                      className={cn("sb-size", s.id === size.id && "is-on", out && "is-out")}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>

              <div className="sb-item-foot">
                <span className={cn("sb-stock", stock === 0 && "is-out")}>
                  {stock === 0 ? "ناموجود" : stock <= 2 ? `فقط ${stock.toLocaleString("fa-IR")} عدد` : "موجود"}
                </span>
                <span className="sb-price">{formatPrice(product.price)}</span>
                <span className="sb-row-btns">
                  <button
                    type="button"
                    className="sb-icon-btn"
                    aria-label={isWished(product.id) ? "حذف از علاقه‌مندی" : "افزودن به علاقه‌مندی"}
                    onClick={() => toggleWish(product.id)}
                  >
                    <Heart width={13} height={13} className={isWished(product.id) ? "fill-current" : ""} />
                  </button>
                  <button type="button" className="sb-icon-btn" aria-label="حذف از بوم" onClick={() => removeItem(item.id)}>
                    <Trash2 width={13} height={13} />
                  </button>
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {rows.length === 0 && (
        <p className="sb-empty-note">
          از «افزودن محصول» قطعه‌ها را روی بوم بینداز؛ اینجا رنگ و سایز هر قطعه را عوض می‌کنی و کل ست را یک‌جا می‌خری.
        </p>
      )}

      {/* budget + totals */}
      {rows.length > 0 && (
        <div className="sb-totals">
          <label className="sb-budget">
            <Wallet width={13} height={13} /> بودجهٔ من
            <input
              type="number"
              min={0}
              step={1}
              value={budget ? Math.round(budget * tomanRate()) : ""}
              placeholder="اختیاری"
              onChange={(e) => setBudget(Math.max(0, Number(e.target.value) || 0) / tomanRate())}
            />
            <span>تومان</span>
          </label>
          <div className="sb-total-row">
            <span>جمع ست</span>
            <b>{formatPrice(total)}</b>
          </div>
          {budget > 0 && (
            <p className={cn("sb-budget-note", money.within ? "is-ok" : "is-over")}>
              {money.note} · {money.within ? `${formatPrice(money.left)} باقی` : `${formatPrice(-money.left)} اضافه`}
            </p>
          )}
          <button type="button" className="sb-cta" disabled={!purchasable.length} onClick={addAll}>
            <ShoppingBag width={16} height={16} />
            افزودن کل ست به سبد
            <span className="sb-cta-price">{formatPrice(purchasable.reduce((n, r) => n + r.product.price, 0))}</span>
          </button>
          {purchasable.length < rows.length && rows.length > 0 && (
            <p className="sb-warn">
              {(rows.length - purchasable.length).toLocaleString("fa-IR")} قطعه ناموجود است یا از موجودی قابل افزودن بیشتر است و اضافه نمی‌شود.
            </p>
          )}
        </div>
      )}

      {/* saved looks */}
      <div className="sb-saved">
        <p className="sb-empty-note">بوم و ست‌های ذخیره‌شده فقط در همین مرورگر نگهداری می‌شوند.</p>
        <div className="sb-saved-head">
          <span>
            <BookmarkCheck width={13} height={13} /> استایل‌های ذخیره‌شده
          </span>
          {rows.length > 0 && !saving && (
            <button type="button" className="sb-ghost" onClick={() => setSaving(true)}>
              <Save width={13} height={13} /> ذخیرهٔ این ست
            </button>
          )}
        </div>
        {saving && (
          <div className="sb-save-row">
            <input value={name} autoFocus aria-label="نام ست" placeholder="نام ست (مثلاً مهمانی زمستانی)" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doSave()} />
            <button type="button" className="sb-ghost is-primary" onClick={doSave}>
              ذخیره
            </button>
            <button type="button" className="sb-ghost" onClick={() => setSaving(false)}>
              انصراف
            </button>
          </div>
        )}
        {saved.length === 0 ? (
          <p className="sb-empty-note">هنوز ستی ذخیره نکرده‌ای؛ با پاک‌کردن دادهٔ مرورگر ست‌های ذخیره‌شده هم حذف می‌شوند.</p>
        ) : (
          <ul className="sb-saved-list">
            {saved.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => { loadOutfit(o.id); notify("ست بارگذاری شد", o.name); }}>
                  <b>{o.name}</b>
                  <small>{o.items.length.toLocaleString("fa-IR")} قطعه</small>
                </button>
                <button type="button" className="sb-icon-btn" aria-label={`حذف ${o.name}`} onClick={() => removeOutfit(o.id)}>
                  <Trash2 width={12} height={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
