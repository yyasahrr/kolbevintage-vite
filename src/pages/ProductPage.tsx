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
import { rememberView } from "@/widgets/recent";
import { WidgetZone } from "@/widgets/WidgetZone";
import { COLLECTIONS, complementProducts, getProduct, liveGetProduct, relatedProducts, totalStock } from "@/data/catalog";
import { ProductGallery } from "@/components/ProductGallery";
import { SmartSizeGuide } from "@/components/SmartSizeGuide";
import { useAuth } from "@/state/auth";
import { submitReview, useAdmin } from "@/state/admin";
import { useOps, requestTryon, tryonBalance, type TryOnPackage } from "@/state/ops";
import { formatPrice, formatRial, stockOf } from "@/data/looks";
import { useCart } from "@/state/cart";
import { ProductCard } from "@/components/ProductCard";
import { CardMedia } from "@/components/CardMedia";
import { Accordion, Breadcrumbs, Reveal, SectionHeading, buttonStyles } from "@/components/ui";
import { NotFoundPage } from "./NotFoundPage";
import { cn } from "@/utils/cn";

export function ProductPage() {
  const { productId } = useParams();
  // subscribe to the admin store so edits, new products and complements render live
  useAdmin();
  const product = liveGetProduct(productId);
  const admin = useAdmin();
  const { add, toggleWish, isWished, setCartOpen } = useCart();

  // approved reviews for this product; a review without a star is not averaged (decisions 59 + 70)
  const reviews = admin.reviews.filter((r) => r.approved && r.product === product?.name);
  const ratedReviews = reviews.filter((r) => r.rating > 0);
  const reviewAvg = ratedReviews.length
    ? ratedReviews.reduce((sum, r) => sum + r.rating, 0) / ratedReviews.length
    : 0;

  const [colorId, setColorId] = useState(product?.colors[0]?.id ?? "");
  const [sizeId, setSizeId] = useState(product?.sizes[0]?.id ?? "");
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false);
  // per-category measurements the owner maintains in the panel (decision 56)
  const opsForGuide = useOps();
  const categoryGuide = product ? opsForGuide.sizeGuides[product.category] : undefined;
  const features = opsForGuide.features ?? { tryon: true, reviews: true, journal: true, wishlist: true };
  const video = product ? opsForGuide.productVideos?.[product.id] : undefined;
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
    // remembered in this browser only, for the «بازدیدهای اخیر» widget
    rememberView(product.id);
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
    // one action, one obvious next step: the drawer opens on the cart
    setCartOpen(true);
  };

  return (
    <div className="pb-16">
      <div className="mx-auto w-full max-w-[1500px] px-4 pt-5 sm:px-6 lg:px-10">
        <Breadcrumbs
          items={[
            { label: "فروشگاه", to: "/products" },
            {
              label: COLLECTIONS.find((c) => c.garments.includes(product.garment))?.label ?? "فروشگاه",
              to: `/products?collection=${COLLECTIONS.find((c) => c.garments.includes(product.garment))?.id ?? "all"}`,
            },
            { label: product.name },
          ]}
        />
      </div>

      <div className="mx-auto grid w-full max-w-[1500px] gap-6 px-4 pt-5 sm:px-6 md:grid-cols-[1.15fr_0.85fr] md:gap-8 lg:gap-10 lg:px-10">
        {/* ---------------- gallery ---------------- */}
        <div>
          <ProductGallery
            product={product}
            color={color}
            overlay={
              <>
                {product.badge && (
                  <span className={cn("pointer-events-auto absolute top-3 start-3 rounded-full px-3 py-1 text-[10px] font-medium backdrop-blur", product.badge === "تخفیف" ? "bg-ember text-white" : "bg-white/85 text-ink")}>
                    {product.badge}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => toggleWish(product.id)}
                  aria-label={wished ? "حذف از علاقه‌مندی‌ها" : "افزودن به علاقه‌مندی‌ها"}
                  aria-pressed={wished}
                  className={cn("pointer-events-auto tap absolute top-3 end-3 flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur transition-colors", wished ? "border-ember/30 bg-white text-ember" : "border-white/60 bg-white/80 text-ink-70 hover:text-ink")}
                >
                  <Heart className={cn("h-4 w-4", wished && "fill-ember")} />
                </button>
              </>
            }
          />
          <div className="mt-2 flex justify-end">
            <Link to={`/style/${product.lookSlug}`} className="inline-flex min-h-11 items-center rounded-full px-3 text-[10px] text-ink-70 transition-colors hover:bg-ink/[0.04] hover:text-ink">
              دیدن روی رانوی
            </Link>
          </div>

          {video && (
            <figure className="mt-3">
              <video
                src={video}
                controls
                preload="metadata"
                playsInline
                className="w-full rounded-[var(--radius-lg)] border border-black/10 bg-black/5"
              />
              <figcaption className="mt-1.5 text-[10px] text-ink-45">ویدیوی کوتاه همین قطعه</figcaption>
            </figure>
          )}

          <p className="mt-3 hidden text-[10.5px] leading-relaxed text-ink-45 md:block">
            تصاویر از عکاسی رسمی رانوی پاییز / زمستان ۲۶ گرفته شده‌اند. رنگ واقعی ممکن است بسته به نمایشگر
            کمی متفاوت دیده شود.
          </p>
        </div>

        {/* ---------------- buy box ---------------- */}
        <div className="md:sticky md:top-[112px] md:self-start">
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
            <p className="text-[13px] text-ink-70">
              {COLLECTIONS.find((c) => c.garments.includes(product.garment))?.label ?? product.category}
            </p>
            <span className="h-1 w-1 rounded-full bg-clay" />
            <div className="flex items-center gap-1 text-[11px] text-ink-70">
              {reviews.length > 0 ? (
                <>
                  <div className="flex" aria-hidden>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={cn("h-3 w-3", reviewAvg && i < Math.round(reviewAvg) ? "fill-ink text-ink" : "fill-none text-ink-45/40")}
                      />
                    ))}
                  </div>
                  <span className="text-ink-45">
                    {reviewAvg ? reviewAvg.toFixed(1).replace(".", "٫") : "بدون امتیاز"} ·{" "}
                    {reviews.length.toLocaleString("fa-IR")} نظر
                  </span>
                </>
              ) : (
                <span className="text-ink-45">اولین نظر را تو بنویس</span>
              )}
            </div>
          </div>

          <div className="mt-3">
          <div ref={priceRef} className="flex flex-wrap items-baseline gap-2.5">
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
          <p className="mt-1 text-[10.5px] text-ink-45">{formatRial(product.price)}</p>
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

            {categoryGuide && (
              <details className="mt-3 rounded-lg border border-black/10 bg-white/60">
                <summary className="cursor-pointer px-3 py-2 text-[11px] text-ink">
                  جدول اندازهٔ {product.category} (سانتی‌متر)
                </summary>
                <div className="overflow-x-auto px-3 pb-3">
                  <table className="w-full text-[10.5px]">
                    <thead>
                      <tr className="text-ink-45">
                        <th className="py-1 text-start font-normal">سایز</th>
                        <th className="py-1 text-start font-normal">دور سینه</th>
                        <th className="py-1 text-start font-normal">دور کمر</th>
                        <th className="py-1 text-start font-normal">دور باسن</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryGuide.rows.map((row) => (
                        <tr key={row.size} className="border-t border-black/5">
                          <td className="py-1 text-ink">{row.size}</td>
                          <td className="py-1 text-ink-70" dir="ltr">{row.chest}</td>
                          <td className="py-1 text-ink-70" dir="ltr">{row.waist}</td>
                          <td className="py-1 text-ink-70" dir="ltr">{row.hips}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {categoryGuide.note && <p className="mt-2 text-[10px] leading-relaxed text-ink-45">{categoryGuide.note}</p>}
                </div>
              </details>
            )}

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
              {soldOut ? "ناموجود" : "خرید آنلاین — افزودن به سبد"}
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

          {features.tryon && (
          <button
            type="button"
            onClick={() => setTryonOpen(true)}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-ink/[0.055] px-4 py-3 text-[11.5px] font-medium text-ink transition-colors hover:bg-ink/[0.1]"
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">پرو آنلاین — ببین رویت چطور می‌شود</span>
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[9.5px] text-ink-70">
              {myCredits.toLocaleString("fa-IR")} اعتبار
            </span>
          </button>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-[#f3ede4] p-3">
            {[
              { icon: Truck, t: "ارسال رایگان", s: "بالای ۲۰۰٬۰۰۰ تومان" },
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

          {complements.length > 0 && (
            <div className="mt-5 rounded-xl border border-black/[0.08] bg-[#fbf7f1] p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-medium text-ink">با اینا می‌تونی ست کنی</p>
                <span className="text-[9.5px] text-ink-45">انتخاب استایلیست</span>
              </div>
              <ul className="mt-2.5 grid grid-cols-4 gap-2">
                {complements.slice(0, 4).map((p) => (
                  <li key={p.id}>
                    <Link to={`/product/${p.id}`} className="group/item block outline-offset-4">
                      {/* CardMedia renders a block element, so the frame is a div — no div inside span */}
                      <div className="overflow-hidden rounded-lg bg-[#efe9e0] ring-1 ring-black/[0.05] transition-transform duration-500 group-hover/item:-translate-y-0.5">
                        <CardMedia product={p} />
                      </div>
                      <div className="mt-1 truncate text-[9.5px] text-ink-70 group-hover/item:text-ink">{p.name}</div>
                      <div className="text-[9.5px] text-ink-45">{formatPrice(p.price)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

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


      {/* ---------------- reviews (decisions 59 + 70) ---------------- */}
      {features.reviews && (
      <section className="mx-auto w-full max-w-[1500px] px-4 pt-12 sm:px-6 lg:px-10">
        <SectionHeading
          eyebrow="تجربهٔ خریداران"
          title="نظرها"
          description={
            reviews.length
              ? `${reviews.length.toLocaleString("fa-IR")} نظر تأییدشده برای این محصول. پاسخ فروشگاه زیر همان نظر نوشته می‌شود.`
              : "هنوز نظری برای این محصول تأیید نشده است."
          }
        />
        <div className="mt-5 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
          <ul className="grid gap-3">
            {reviews.map((review) => (
              <li key={review.id} className="rounded-[var(--radius-lg)] border border-line/60 p-4">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-ink-45">
                  {review.rating > 0 ? (
                    <span className="flex" aria-label={`${review.rating} از ۵ ستاره`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={cn("h-3 w-3", i < review.rating ? "fill-ink text-ink" : "fill-none text-ink-45/40")} />
                      ))}
                    </span>
                  ) : (
                    <span>بدون امتیاز</span>
                  )}
                  <b className="text-ink">{review.author}</b>
                  <span>{new Date(review.at).toLocaleDateString("fa-IR")}</span>
                </div>
                <p className="mt-2 text-[12.5px] leading-[1.95] text-ink-70">{review.text}</p>
                {review.reply && (
                  <div className="mt-3 rounded-[var(--radius-md)] bg-[#f2ede5] p-3">
                    <b className="text-[10.5px] text-ink">پاسخ فروشگاه</b>
                    <p className="mt-1 text-[12px] leading-[1.9] text-ink-70">{review.reply.text}</p>
                  </div>
                )}
              </li>
            ))}
            {reviews.length === 0 && (
              <li className="rounded-[var(--radius-lg)] border border-dashed border-line/70 p-5 text-[12px] text-ink-45">
                وقتی نظرها تأیید شوند همین‌جا با پاسخ فروشگاه نمایش داده می‌شوند.
              </li>
            )}
          </ul>
          <ReviewForm product={product.name} />
        </div>
      </section>
      )}

      {/* widgets the owner installed for product pages (decision 75) */}
      <WidgetZone zone="product-side" productId={product.id} />

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

/* =====================================================================
   The customer writes a review; the owner decides whether it goes live.
   The star is optional (decision 59) — a customer may simply describe the fit.
   ===================================================================== */

function ReviewForm({ product }: { product: string }) {
  const auth = useAuth();
  const admin = useAdmin();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  if (!auth.account) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-line/60 p-4 text-[12px] leading-[1.9] text-ink-45">
        برای نوشتن نظر وارد حساب خودت شو. نظرها پس از تأیید فروشگاه منتشر می‌شوند.
      </div>
    );
  }

  if (sent) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-line/60 p-4 text-[12px] leading-[1.9] text-ink-70">
        نظرت ثبت شد و بعد از تأیید فروشگاه منتشر می‌شود. ممنون که تجربه‌ات را نوشتی.
        <button
          type="button"
          className="mt-2 block text-[11px] underline underline-offset-4"
          onClick={() => { setSent(false); setText(""); setRating(0); }}
        >
          نوشتن نظر دیگر
        </button>
      </div>
    );
  }

  const submit = () => {
    const account = auth.account;
    if (!account) return;
    if (text.trim().length < 8) {
      setError("کمی بیشتر بنویس (حداقل ۸ نویسه).");
      return;
    }
    // a review always lands as pending; nothing appears on the shop before the owner approves it
    submitReview({
      product,
      author: account.name || account.email,
      rating,
      text: text.trim(),
    });
    setError("");
    setSent(true);
    void admin;
  };

  return (
    <div className="rounded-[var(--radius-lg)] border border-line/60 p-4">
      <p className="text-[12px] font-medium text-ink">نظر تو</p>
      <div className="mt-2 flex items-center gap-1.5" role="radiogroup" aria-label="امتیاز (اختیاری)">
        {Array.from({ length: 5 }).map((_, i) => {
          const value = i + 1;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} ستاره`}
              className="tap p-0.5"
              onClick={() => setRating(rating === value ? 0 : value)}
            >
              <Star className={cn("h-4 w-4", value <= rating ? "fill-ink text-ink" : "fill-none text-ink-45/50")} />
            </button>
          );
        })}
        <span className="text-[10.5px] text-ink-45">{rating ? `${rating} از ۵` : "بدون امتیاز (اختیاری)"}</span>
      </div>
      <textarea
        className="mt-2 w-full rounded-[var(--radius-md)] border border-line/70 bg-transparent p-2.5 text-[12.5px] leading-[1.9] outline-none focus:border-ink/40"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="از جنس پارچه، اندازه و دوخت بنویس…"
        aria-label="متن نظر"
      />
      {error && <p className="mt-1 text-[11px] text-ember">{error}</p>}
      <button type="button" onClick={submit} className={buttonStyles("solid", "sm", "mt-2 w-full")}>
        ثبت نظر برای تأیید
      </button>
    </div>
  );
}
