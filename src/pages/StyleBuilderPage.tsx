import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Layers, Plus, Search, Sparkles, Wand2, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { CATALOG, COLLECTIONS, productsInCollection, visibleProducts } from "@/data/catalog";
import { firstAvailable, formatPrice } from "@/data/looks";
import { useCart } from "@/state/cart";
import { addItem, clearBoard, setItems, useOutfit } from "@/state/outfit";
import { uid } from "@/builder/tree";
import { adviseSize, type Profile } from "@/lib/stylist";
import { ProductThumb } from "@/components/ProductThumb";
import { StyleCanvas } from "@/components/StyleCanvas";
import { OutfitSummary } from "@/components/OutfitSummary";
import { StyleWizard } from "@/components/StyleWizard";
import { PageIntro, Newsletter, buttonStyles } from "@/components/ui";
import "@/styles/style-builder.css";

type Mode = "canvas" | "wizard";

const GROUPS = [
  { id: "all", label: "همه" },
  ...COLLECTIONS.map((c) => ({ id: c.id, label: c.short })),
];

export function StyleBuilderPage() {
  const [mode, setMode] = useState<Mode>("canvas");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [group, setGroup] = useState("all");
  const [query, setQuery] = useState("");
  const [trayOpen, setTrayOpen] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const { items } = useOutfit();
  const { notify } = useCart();

  const products = useMemo(() => {
    const base = group === "all" ? visibleProducts() : productsInCollection(group);
    const q = query.trim();
    return q ? base.filter((p) => `${p.name} ${p.category} ${p.lookName}`.includes(q)) : base;
  }, [group, query]);

  const addProduct = (productId: string, at?: { x: number; y: number }, slot?: string, colorId?: string, sizeId?: string) => {
    const product = CATALOG.find((p) => p.id === productId);
    if (!product) return;
    const fallback = firstAvailable(product);
    const id = addItem(productId, colorId ?? fallback.colorId, sizeId ?? fallback.sizeId, at, slot);
    setSelectedId(id);
  };

  /** the wizard hands its picks over to the free-style board */
  const loadWizardResult = (
    picks: { productId: string; colorId: string; sizeId: string; slot: string }[],
    p: Profile,
  ) => {
    const built = picks.map((pick, i) => ({
      id: uid(),
      productId: pick.productId,
      x: 10 + i * 15,
      y: 22 + (i % 2) * 16,
      scale: 1,
      rotate: 0,
      flip: false,
      colorId: pick.colorId,
      sizeId: pick.sizeId,
      z: i + 1,
      slot: pick.slot,
    }));
    setItems(built);
    setProfile(p);
    setMode("canvas");
    setSelectedId(built[0]?.id ?? null);
    notify("ست روی بوم چیده شد", `${built.length.toLocaleString("fa-IR")} قطعه — حالا آزادانه جابه‌جایشان کن`);
  };

  const sizeAdviceCount = profile
    ? items.filter((i) => {
        const p = CATALOG.find((x) => x.id === i.productId);
        return p && adviseSize(p, profile).size === p.sizes.find((s) => s.id === i.sizeId)?.label;
      }).length
    : 0;

  return (
    <div className="sb-page">
      <PageIntro
        crumbs={[{ label: "استایل بیلدر" }]}
        eyebrow="ابزار شخصی ست‌چینی"
        title="استایل بیلدر"
        description="قطعه‌ها را روی بوم بچین و ببین ست واقعاً کار می‌کند یا نه؛ یا بگذار دستیار استایل با چند پرسش، ست را بر اساس موقعیت، هوا، فرم بدن و رنگ‌های انتخابی‌ات بسازد."
      >
        <div className="sb-mode-switch" role="tablist" aria-label="حالت استایل بیلدر">
          <button type="button" role="tab" aria-selected={mode === "canvas"} className={cn("sb-mode", mode === "canvas" && "is-on")} onClick={() => setMode("canvas")}>
            <Layers width={15} height={15} /> بوم آزاد
          </button>
          <button type="button" role="tab" aria-selected={mode === "wizard"} className={cn("sb-mode", mode === "wizard" && "is-on")} onClick={() => setMode("wizard")}>
            <Wand2 width={15} height={15} /> دستیار استایل
          </button>
        </div>
      </PageIntro>

      <div className="sb-shell">
        <div className="sb-main">
          {mode === "canvas" ? (
            <>
              <StyleCanvas
                selectedId={selectedId}
                onSelect={setSelectedId}
                onDropProduct={(productId, x, y) => addProduct(productId, { x, y })}
              />

              {/* product tray */}
              <section className={cn("sb-tray", !trayOpen && "is-closed")}>
                <header className="sb-tray-head">
                  <button type="button" className="sb-tray-toggle" onClick={() => setTrayOpen((v) => !v)} aria-expanded={trayOpen}>
                    <Plus width={14} height={14} className={cn("sb-tray-ic", trayOpen && "is-open")} />
                    افزودن محصول به بوم
                    <small>{products.length.toLocaleString("fa-IR")} قطعه</small>
                  </button>
                  <div className="sb-tray-search">
                    <Search width={13} height={13} />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="جست‌وجوی قطعه…" aria-label="جست‌وجوی محصول" />
                    {query && (
                      <button type="button" onClick={() => setQuery("")} aria-label="پاک کردن جست‌وجو">
                        <X width={13} height={13} />
                      </button>
                    )}
                  </div>
                </header>

                {trayOpen && (
                  <>
                    <div className="sb-tray-groups">
                      {GROUPS.map((g) => (
                        <button key={g.id} type="button" onClick={() => setGroup(g.id)} aria-pressed={group === g.id} className={cn("sb-chip", group === g.id && "is-on")}>
                          {g.label}
                        </button>
                      ))}
                    </div>
                    <div className="sb-tray-scroll">
                      {products.length === 0 && <p className="sb-empty-note">قطعه‌ای با این فیلتر پیدا نشد.</p>}
                      {products.map((p) => {
                        const inBoard = items.some((i) => i.productId === p.id);
                        return (
                          <article
                            key={p.id}
                            className={cn("sb-tray-card", inBoard && "is-in")}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", p.id);
                              e.dataTransfer.effectAllowed = "copy";
                            }}
                          >
                            <ProductThumb product={p} tileAspect={0.86} className="w-full" />
                            <div className="sb-tray-meta">
                              <span className="sb-tray-cat">{p.category}</span>
                              <b className="sb-tray-name">{p.name}</b>
                              <span className="sb-tray-price">{formatPrice(p.price)}</span>
                              <div className="sb-tray-dots">
                                {p.colors.map((c) => (
                                  <i key={c.id} style={{ background: c.hex }} title={c.name} />
                                ))}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="sb-tray-add"
                              onClick={() => addProduct(p.id)}
                              aria-label={`افزودن ${p.name} به بوم`}
                              title={inBoard ? "روی بوم هست — دوباره اضافه نمی‌شود" : "افزودن به بوم"}
                            >
                              {inBoard ? <Layers width={14} height={14} /> : <Plus width={14} height={14} />}
                              <span>{inBoard ? "روی بوم" : "افزودن"}</span>
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>

              {profile && (
                <div className="sb-profile-note">
                  <Sparkles width={14} height={14} />
                  <span>
                    پروفایل دستیار فعال است: {sizeAdviceCount.toLocaleString("fa-IR")} از {items.length.toLocaleString("fa-IR")} قطعه دقیقاً با سایز
                    پیشنهادی مطابقت دارد.
                  </span>
                  <button type="button" className="sb-ghost" onClick={() => { setProfile(null); clearBoard(); }}>
                    شروع دوباره
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="sb-wizard-shell">
              <div className="sb-wizard-hero">
                <Wand2 width={22} height={22} />
                <div>
                  <h2>دستیار استایل</h2>
                  <p>
                    هفت پرسش کوتاه، بعد پیشنهاد قطعه‌به‌قطعه. هر پیشنهاد از انتخاب‌های قبلی‌ات خبر دارد: اگر بالاتنهٔ
                    نارنجی برداشته باشی، کفش و کیفی پیشنهاد می‌شود که با نارنجی بخواند.
                  </p>
                </div>
              </div>
              <StyleWizard onFinish={loadWizardResult} />
            </div>
          )}
        </div>

        <aside className="sb-side">
          <OutfitSummary profile={profile} onEmpty={() => setSelectedId(null)} />
          <div className="sb-side-links">
            <Link to="/style" className={buttonStyles("outline", "sm")}>
              استایل‌های آمادهٔ رانوی
            </Link>
            <Link to="/products" className={buttonStyles("ghost", "sm")}>
              همهٔ محصولات
            </Link>
          </div>
        </aside>
      </div>

      <details className="sb-tips">
        <summary>راهنمای کوتاه بوم و دستیار</summary>
        <div>
          <p><b>بوم:</b> محصول را از سینی بکش یا «افزودن» را بزن؛ با کلیدهای جهت‌دار جابه‌جا و با <b>+ / −</b> اندازه را عوض کن. <b>Delete</b> حذف می‌کند.</p>
          <p><b>امتیاز هماهنگی:</b> رنگ‌ها با HSL سنجیده می‌شوند؛ خنثی‌ها با همه می‌خوانند و بیش از چهار رنگ، ست را شلوغ می‌کند.</p>
          <p><b>دستیار:</b> موقعیت، هوا، اندازه‌ها، سلیقه و بودجه را می‌پرسد و هر پیشنهاد را با انتخاب‌های قبلی هماهنگ می‌کند.</p>
        </div>
      </details>

      <Newsletter compact />
    </div>
  );
}
