import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  Heart,
  Ruler,
  ShieldCheck,
  Sparkles,
  Star,
  Truck,
  Undo2,
} from "lucide-react";
import { complementProducts, getProduct, liveGetProduct, productsOfLook, relatedProducts, totalStock } from "@/data/catalog";
import { ProductGallery } from "@/components/ProductGallery";
import { SmartSizeGuide } from "@/components/SmartSizeGuide";
import { useAuth } from "@/state/auth";
import { useAdmin } from "@/state/admin";
import { useOps, requestTryon, tryonBalance, type TryOnPackage } from "@/state/ops";
import { formatPrice, stockOf } from "@/data/looks";
import { useCart } from "@/state/cart";
import { addItem } from "@/state/outfit";
import { ProductCard } from "@/components/ProductCard";
import {
  Accordion,
  Breadcrumbs,
  Newsletter,
  Reveal,
  SectionHeading,
  buttonStyles,
} from "@/components/ui";
import { NotFoundPage } from "./NotFoundPage";
import { cn } from "@/utils/cn";

export function ProductPage() {
  const { productId } = useParams();
  // subscribe to the admin store so edits, new products and complements render live
  useAdmin();
  const product = liveGetProduct(productId);
  const { add, toggleWish, isWished, setCartOpen, notify } = useCart();

  const [colorId, setColorId] = useState(product?.colors[0]?.id ?? "");
  const [sizeId, setSizeId] = useState(product?.sizes[0]?.id ?? "");
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  const [tryonOpen, setTryonOpen] = useState(false);
  const priceRef = useRef<HTMLDivElement>(null);
  const [pastPrice, setPastPrice] = useState(false);
  const auth = useAuth();
  const myCredits = auth.account ? tryonBalance(auth.account.email) : 0;

  useEffect(() => {
    if (!product) return;
    const color = product.colors.find((c) =>
      product.sizes.some((s) => stockOf(product, c.id, s.id) > 0),
    );
    setColorId(color?.id ?? product.colors[0].id);
    const firstSize = product.sizes.find((s) => stockOf(product, color?.id ?? product.colors[0].id, s.id) > 0);
    setSizeId(firstSize?.id ?? product.sizes[0].id);
    document.title = `${product.name} — فروشگاه ولور`;
    return () => {
      document.title = "ولور — خرید بر اساس استایل | رانوی تعاملی";
    };
  }, [productId]);

  useEffect(() => {
    if (!product) return;
    if (!product.colors.some((c) => c.id === colorId)) setColorId(product.colors[0]?.id ?? "");
    if (!product.sizes.some((s) => s.id === sizeId)) setSizeId(product.sizes[0]?.id ?? "");
  }, [product, colorId, sizeId]);

  if (!product) return <NotFoundPage />;

  const stock = stockOf(product, colorId, sizeId);
  const color = product.colors.find((c) => c.id === colorId) ?? product.colors[0];
  const size = product.sizes.find((s) => s.id === sizeId) ?? product.sizes[0];
  const soldOut = stock === 0;
  const wished = isWished(product.id);

  const lookProducts = productsOfLook(product.lookId).filter((p) => p.id !== product.id);
  const complements = complementProducts(product.id);
  const related = relatedProducts(product, 4);
  const colorAvailability = (id: string) => product.sizes.some((s) => stockOf(product, id, s.id) > 0);

  // a size only exists inside a colour: picking a new colour resets the size to the
  // first one that colour actually has, so the old choice is never carried over silently
  const selectColor = (id: string) => {
    setColorId(id);
    const next = product.sizes.find((s) => stockOf(product, id, s.id) > 0) ?? product.sizes[0];
    if (next) setSizeId(next.id);
  };

  useEffect(() => {
    const el = priceRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        // sticky bar appears only after the price has scrolled *above* the viewport
        setPastPrice(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      },
      { rootMargin: "-96px 0px 0px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [product?.id]);

  const handleAdd = () => {
    if (soldOut) return;
    add([{ product, color, size, lookName: product.lookName }], {
      title: `${product.name} به سبد اضافه شد`,
      detail: `${color.name} · سایز ${size.label} · ${formatPrice(product.price)}`,
    });
  };

  return (
    <div className="pb-16">
      <div className="mx-auto w-full max-w-[1500px] px-4 pt-5 sm:px-6 lg:px-10">
        <Breadcrumbs
          items={[
            { label: "فروشگاه", to: "/products" },
            { label: product.category, to: `/products?category=${encodeURIComponent(product.category)}` },
            { label: product.name },
          ]}
        />
      </div>

      <div className="mx-auto grid w-full max-w-[1500px] gap-6 px-4 pt-5 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10 lg:px-10">
        {/* ---------------- gallery ---------------- */}
        <div>
          <div className="relative">
            <ProductGallery product={product} color={color} />

            {product.badge && (
              <span className={cn("absolute top-3 right-3 z-10 rounded-full px-3 py-1 text-[10px] font-medium backdrop-blur", product.badge === "تخفیف" ? "bg-ember text-white" : "bg-white/85 text-ink")}>
                {product.badge}
              </span>
            )}
            <button
              type="button"
              onClick={() => toggleWish(product.id)}
              aria-label={wished ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"}
              aria-pressed={wished}
              className={cn("absolute top-3 left-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur transition-colors", wished ? "border-ember/30 bg-white text-ember" : "border-white/60 bg-white/80 text-ink-70 hover:text-ink")}
            >
              <Heart className={cn("h-4 w-4", wished && "fill-ember")} />
            </button>
            <Link to={`/style/${product.lookSlug}`} className="absolute bottom-3 left-3 z-10 rounded-full bg-paper/90 px-3 py-1.5 text-[10px] text-ink backdrop-blur transition-colors hover:bg-paper">
              دیدن روی رانوی
            </Link>
          </div>

          <p className="mt-3 hidden text-[10.5px] leading-relaxed text-ink-45 lg:block">
            تصاویر از عکاسی رسمی رانوی پاییز / زمستان ۲۶ گرفته شده‌اند. رنگ واقعی ممکن است بسته به نمایشگر
            کمی متفاوت دیده شود.
          </p>
        </div>

        {/* ---------------- buy box ---------------- */}
        <div className="lg:sticky lg:top-[112px] lg:self-start">
          <div className="flex items-center justify-between gap-3">
            <Link
              to={`/style/${product.lookSlug}`}
              className="inline-flex items-center gap-1.5 text-[10.5px] text-ink-45 transition-colors hover:text-ink"
            >
              <Sparkles className="h-3 w-3" />
              از استایل {product.lookName}
            </Link>
            <span className="text-[10.5px] text-ink-45">{totalStock(product).toLocaleString("fa-IR")} عدد در انبار</span>
          </div>

          <h1 className="mt-2 font-display text-[clamp(1.5rem,3.2vw,2.1rem)] leading-[1.3] font-medium text-ink">
            {product.name}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="text-[13px] text-ink-70">{product.category}</p>
            <span className="h-1 w-1 rounded-full bg-clay" />
            <div className="flex items-center gap-1 text-[11px] text-ink-70">
              <div className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-3 w-3 fill-ink text-ink" />
                ))}
              </div>
              <span className="text-ink-45">۴.۸ · ۲۳ نظر</span>
            </div>
          </div>

          <div ref={priceRef} className="mt-3.5 flex items-baseline gap-2.5">
            <span className="font-display text-[24px] font-medium text-ink">{formatPrice(product.price)}</span>
            {product.compareAt && (
              <>
                <span className="text-[12.5px] text-ink-45 line-through">{formatPrice(product.compareAt)}</span>
                <span className="rounded-full bg-ember/10 px-2 py-0.5 text-[10px] text-ember">
                  {Math.round((1 - product.price / product.compareAt) * 100).toLocaleString("fa-IR")}٪ تخفیف
                </span>
              </>
            )}
          </div>

          <p className="mt-3 text-[12.5px] leading-[1.95] text-ink-70">{product.description}</p>

          <div className="mt-5 border-t border-black/[0.07] pt-4">
            <div className="flex items-center justify-between">
              <p className="text-[11.5px] font-medium text-ink">
                رنگ: <span className="font-normal text-ink-70">{color.name}</span>
              </p>
              <span className="text-[10px] text-ink-45">{product.colors.length} رنگ</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {product.colors.map((c) => {
                const available = colorAvailability(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectColor(c.id)}
                    aria-pressed={colorId === c.id}
                    aria-label={`رنگ ${c.name}${available ? "" : " — ناموجود"}`}
                    title={`${c.name}${available ? "" : " — ناموجود"}`}
                    className={cn(
                      "group flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[10.5px] transition-all",
                      colorId === c.id ? "border-ink bg-ink/[0.03] text-ink" : "border-black/10 text-ink-70 hover:border-ink/35",
                    )}
                  >
                    <span className="relative h-4 w-4 rounded-full ring-1 ring-black/15" style={{ backgroundColor: c.hex }}>
                      {!available && <span className="absolute inset-x-[-2px] top-1/2 h-px rotate-45 bg-ink/60" />}
                    </span>
                    {c.name}
                    {colorId === c.id && <Check className="h-3 w-3" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-[11.5px] font-medium text-ink">سایز</p>
              <button
                type="button"
                onClick={() => setSizeGuideOpen(true)}
                className="inline-flex items-center gap-1 text-[10.5px] text-ink-45 underline-offset-4 hover:text-ink hover:underline"
              >
                <Ruler className="h-3 w-3" /> راهنمای سایز
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {product.sizes.map((s) => {
                const available = stockOf(product, colorId, s.id) > 0;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSizeId(s.id)}
                    disabled={!available}
                    aria-pressed={sizeId === s.id}
                    aria-label={`سایز ${s.label}${available ? "" : " — ناموجود"}`}
                    className={cn(
                      "min-w-[2.7rem] rounded-md border px-3 py-2 text-[11.5px] transition-all",
                      sizeId === s.id
                        ? "border-ink bg-ink text-bone"
                        : "border-black/12 text-ink-70 hover:border-ink/40",
                      !available && "cursor-not-allowed border-dashed border-black/10 text-ink-45/50 line-through",
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>

            <p className="mt-2 text-[10.5px] leading-relaxed text-ink-45">
              مطمئن نیستی؟ <button type="button" className="underline underline-offset-4 hover:text-ink" onClick={() => setSizeGuideOpen(true)}>راهنمای سایز هوشمند</button> با قد، وزن و اندازه‌های بدنت سایز درست را پیدا می‌کند.
            </p>

            <p className={cn("mt-2.5 text-[11px]", soldOut ? "text-ember" : "text-ink-45")}>
              {soldOut ? (
                "این ترکیب رنگ و سایز ناموجود است — ترکیب دیگری را انتخاب کن."
              ) : stock <= 2 ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-ember" /> فقط {stock.toLocaleString("fa-IR")} عدد در انبار
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600/70" /> موجود · آمادهٔ ارسال
                </span>
              )}
            </p>
          </div>

          <div className="mt-4 flex items-stretch gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={soldOut}
              className={buttonStyles("solid", "lg", "flex-1")}
            >
              {soldOut ? "ناموجود" : "افزودن به سبد"}
              {!soldOut && <ArrowLeft className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => toggleWish(product.id)}
              aria-label={wished ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"}
              aria-pressed={wished}
              className={cn(
                "flex w-12 items-center justify-center rounded-full border transition-colors",
                wished ? "border-ember/30 bg-ember/[0.06] text-ember" : "border-ink/20 text-ink hover:border-ink",
              )}
            >
              <Heart className={cn("h-4 w-4", wished && "fill-ember")} />
            </button>
          </div>

          <Link
            to="/style-builder"
            onClick={() => {
              addItem(product.id, color.id, size.id);
              notify("به بوم استایل اضافه شد", "در استایل بیلدر جابه‌جایش کن و با بقیهٔ قطعه‌ها بسنج.");
            }}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-dashed border-ink/30 px-5 py-3 text-[11.5px] text-ink transition-colors hover:border-ink hover:bg-ink/[0.04]"
          >
            <Sparkles className="h-3.5 w-3.5" />
            افزودن به بوم استایل بیلدر
          </Link>

          <button
            type="button"
            onClick={() => {
              handleAdd();
              setCartOpen(true);
            }}
            className="mt-2 w-full rounded-full border border-ink/20 px-5 py-3 text-[11.5px] font-medium text-ink transition-colors hover:border-ink hover:bg-ink/[0.04] disabled:opacity-50"
            disabled={soldOut}
          >
            خرید فوری — رفتن به سبد
          </button>

          <button type="button" onClick={() => setTryonOpen(true)} className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-ink/[0.055] px-5 py-3 text-[11.5px] font-medium text-ink transition-colors hover:bg-ink/[0.1]">
            <Sparkles className="h-3.5 w-3.5" />
            پرو آنلاین — ببین رویت چطور می‌شود
            <span className="rounded-full bg-white px-2 py-0.5 text-[9.5px] text-ink-70">{myCredits.toLocaleString("fa-IR")} اعتبار</span>
          </button>

          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#f3ede4] p-3">
            {[
              { icon: Truck, t: "ارسال رایگان", s: "بالای ۲۰۰ یورو" },
              { icon: Undo2, t: "مرجوعی", s: "تا ۱۴ روز" },
              { icon: ShieldCheck, t: "اصالت", s: "ساخت ولور" },
            ].map((item) => (
              <div key={item.t} className="text-center">
                <item.icon className="mx-auto h-4 w-4 text-ink-70" />
                <p className="mt-1 text-[10px] font-medium text-ink">{item.t}</p>
                <p className="text-[9px] text-ink-45">{item.s}</p>
              </div>
            ))}
          </div>

          <div className="mt-5">
            <Accordion
              items={[
                {
                  title: "جزئیات و جنس",
                  body: (
                    <ul className="space-y-1.5">
                      <li>جنس: {product.material}</li>
                      <li>فرم: {product.fit}</li>
                      <li>{product.origin}</li>
                      <li>شمارهٔ قطعه: {product.id.toUpperCase()}</li>
                    </ul>
                  ),
                },
                {
                  title: "سایز و فیت",
                  body: `${product.fit}. اگر بین دو سایز هستی، برای فرم راحت‌تر سایز بزرگ‌تر را انتخاب کن. قد مدل در تصویر ${(172).toLocaleString("fa-IR")} سانتی‌متر است و سایز ${size.label} پوشیده است.`,
                },
                {
                  title: "مراقبت",
                  body: product.care,
                },
                {
                  title: "ارسال و مرجوعی",
                  body: "ارسال استاندارد ۲ تا ۴ روز کاری و ارسال سریع ۲۴ ساعته. مرجوعی بدون سؤال تا ۱۴ روز پس از دریافت؛ قطعه باید برچسب اصلی داشته باشد.",
                },
              ]}
            />
          </div>
        </div>
      </div>

      {/* ---------------- complete the look ---------------- */}
      {lookProducts.length > 0 && (
        <section className="mx-auto w-full max-w-[1500px] px-4 pt-12 sm:px-6 lg:px-10">
          <div className="rounded-2xl border border-black/[0.07] bg-[#f1ebe2] p-4 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] text-ink-45">استایل کامل</p>
                <h2 className="mt-1.5 font-display text-[clamp(1.3rem,2.6vw,1.8rem)] font-medium text-ink">
                  همین قطعه با بقیهٔ «{product.lookName}»
                </h2>
              </div>
              <Link
                to={`/style/${product.lookSlug}`}
                className={buttonStyles("solid", "md", "gap-1.5")}
              >
                دیدن روی رانوی <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
              {lookProducts.slice(0, 4).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------------- complementary products ---------------- */}
      {complements.length > 0 && (
        <section className="mx-auto w-full max-w-[1500px] px-4 pt-12 sm:px-6 lg:px-10">
          <div className="rounded-2xl border border-black/[0.07] bg-[#f1ebe2] p-4 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] text-ink-45">کالاهای مکمل</p>
                <h2 className="mt-1.5 font-display text-[clamp(1.3rem,2.6vw,1.8rem)] font-medium text-ink">
                  این قطعه را با این‌ها کامل کن
                </h2>
              </div>
              <Link to="/products" className={buttonStyles("solid", "md", "gap-1.5")}>
                همهٔ محصولات <ArrowLeft className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4">
              {complements.slice(0, 8).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------------- related ---------------- */}
      <section className="mx-auto w-full max-w-[1500px] px-4 pt-12 sm:px-6 lg:px-10">
        <SectionHeading
          eyebrow="پیشنهاد سردبیر"
          title="شاید این‌ها را هم بپسندی"
          action={{ to: "/products", label: "همهٔ محصولات" }}
        />
        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 lg:grid-cols-4">
          {related.map((p, i) => (
            <Reveal key={p.id} delay={Math.min(i, 4) * 0.04}>
              <ProductCard product={p} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* mobile sticky buy bar */}
      <div className={cn("product-sticky", pastPrice && "is-on")} aria-hidden={!pastPrice}>
        <div className="product-sticky-in">
          <img src={product.image} alt="" className="product-sticky-img" />
          <div className="product-sticky-text">
            <p>{product.name}</p>
            <small>{color.name} · سایز {size.label}</small>
          </div>
          <span className="product-sticky-price">{formatPrice(product.price)}</span>
          <button
            type="button"
            onClick={() => {
              handleAdd();
              setCartOpen(true);
            }}
            disabled={soldOut}
            className={buttonStyles("solid", "sm", "shrink-0 px-4 py-2.5")}
          >
            {soldOut ? "ناموجود" : "افزودن"}
          </button>
        </div>
      </div>

      {sizeGuideOpen && (
        <SmartSizeGuide
          sizes={product.sizes}
          garment={product.garment}
          onClose={() => setSizeGuideOpen(false)}
          onPick={(sizeLabel) => {
            const found = product.sizes.find((sz) => sz.label === sizeLabel);
            if (found) setSizeId(found.id);
          }}
        />
      )}

      {tryonOpen && <TryOnSheet product={product} onClose={() => setTryonOpen(false)} />}

      <Newsletter compact />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* online fitting-room sheet                                          */
/* ------------------------------------------------------------------ */

function TryOnSheet({ product, onClose }: { product: NonNullable<ReturnType<typeof getProduct>>; onClose: () => void }) {
  const auth = useAuth();
  const ops = useOps();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const credits = auth.account ? tryonBalance(auth.account.email) : 0;

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const request = () => {
    if (!auth.account) return setMsg({ ok: false, text: "برای پرو آنلاین اول وارد حساب شو." });
    const r = requestTryon({ email: auth.account.email, productId: product.id, productName: product.name });
    setMsg({ ok: r.ok, text: r.message });
  };

  return (
    <div className="acc-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="پرو آنلاین">
        <header><h3>پرو آنلاین</h3></header>
        <p className="acc-muted" style={{ padding: 0 }}>
          {product.name} — تیم استایل نسخهٔ روی‌تنی این قطعه را با اندازه‌های ذخیره‌شدهٔ تو آماده می‌کند. هر درخواست یک اعتبار مصرف می‌کند.
        </p>

        {!auth.account ? (
          <div className="acc-msg is-bad" style={{ margin: "12px 0" }}>
            برای استفاده از پرو آنلاین <a href="#/auth" className="underline">وارد حساب</a> شو.
          </div>
        ) : (
          <p className="acc-muted" style={{ padding: 0 }}>اعتبار فعلی: {credits.toLocaleString("fa-IR")} پرو</p>
        )}

        <div className="acc-tryon-grid" style={{ padding: "12px 0" }}>
          {ops.tryonPackages.map((p: TryOnPackage) => (
            <article key={p.id} className={cn("acc-pack", p.popular && "is-popular")}>
              {p.popular && <span className="acc-popular">پیشنهاد ویژه</span>}
              <b>{p.name}</b>
              <p>{p.credits.toLocaleString("fa-IR")} پرو</p>
              <strong>{p.price.toLocaleString("fa-IR")} تومان</strong>
              <button
                type="button"
                className={buttonStyles("solid", "sm", "mt-2 w-full")}
                onClick={() => {
                  if (!auth.account) return setMsg({ ok: false, text: "اول وارد شو." });
                  const r = auth.purchaseTryon(p.credits, p.price);
                  setMsg({ ok: r.ok, text: r.message });
                }}
              >
                خرید
              </button>
            </article>
          ))}
        </div>

        {msg && <p className={cn("acc-msg", msg.ok ? "is-ok" : "is-bad")} style={{ margin: "8px 0 0" }}>{msg.text}</p>}

        <footer>
          <button type="button" className="acc-btn" onClick={onClose}>بستن</button>
          <button type="button" className="acc-btn is-primary" disabled={credits <= 0} onClick={request}>
            <Sparkles width={14} height={14} /> ثبت درخواست پرو
          </button>
        </footer>
      </div>
    </div>
  );
}
