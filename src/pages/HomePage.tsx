import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { newArrivals, FEATURED_COLLECTIONS, productsInCollection } from "@/data/catalog";
import { LOOKS, formatPrice } from "@/data/looks";
import { POSTS, HERO_IMAGE, ATELIER_IMAGE, CAMPAIGN_IMAGE } from "@/data/journal";
import { ProductCard } from "@/components/ProductCard";
import { ProductThumb } from "@/components/ProductThumb";
import { ArrowLink, Marquee, Reveal, SectionHeading, buttonStyles } from "@/components/ui";

const COLLECTION_COPY: Record<string, string> = {
  outerwear: "پالتو، ترنچ و کاپشن",
  knitwear: "کشمیر، پشم و پنبه",
  shoes: "چرم دست‌دوز",
  bags: "کیف و اکسسوری",
};

export function HomePage() {
  return (
    <>
      {/* ---------------- hero ---------------- */}
      <section className="mx-auto w-full max-w-[1500px] px-3 pt-3 sm:px-5 lg:px-8 lg:pt-5">
        <div className="relative overflow-hidden rounded-[var(--radius-hero)] bg-[#d9cfc0]">
          <img
            src={HERO_IMAGE}
            alt="کمپین پاییز و زمستان ولور؛ دو مدل با پالتوهای شتری و مشکی در فضایی بتنی"
            className="h-[clamp(460px,74vh,700px)] w-full object-cover object-[62%_center] sm:object-center"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/30 to-ink/5 sm:bg-gradient-to-l sm:from-ink/90 sm:via-ink/40 sm:to-transparent" />
          <div className="absolute inset-0 flex items-end sm:items-center">
            <div className="w-full px-5 pb-7 sm:px-10 sm:pb-0 lg:px-14">
              <div className="max-w-[32rem] text-bone">
                <p className="flex items-center gap-2.5 text-[10px] text-bone/70">
                  <span className="h-px w-7 bg-bone/50" />
                  مجموعهٔ پاییز / زمستان ۲۶
                </p>
                <h1 className="mt-3 font-display text-[clamp(2.15rem,5.6vw,4.15rem)] leading-[1.15] font-medium">
                  سکوتِ ساختار.
                  <span className="mt-1 block text-bone/80">حضورِ پارچه.</span>
                </h1>
                <p className="mt-4 max-w-[26rem] text-[12.5px] leading-[1.95] text-bone/75">
                  شش استایل، از پالتوی بلند نوار تا ترنچ شتری. هر قطعه در آتلیهٔ پاریس ساخته می‌شود و روی
                  رانوی همین سایت می‌توانی آن را تن‌به‌تن ببینی.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-2.5">
                  <Link to="/products" className={buttonStyles("solid", "lg", "bg-bone text-ink hover:bg-white")}>
                    خرید کالکشن <ArrowLeft className="h-3.5 w-3.5" />
                  </Link>
                  <Link to="/style" className={buttonStyles("light", "lg")}>
                    خرید بر اساس استایل
                  </Link>
                </div>
              </div>
            </div>
          </div>
          <div className="absolute bottom-4 left-5 hidden items-center gap-2 text-[9.5px] text-bone/60 sm:flex lg:left-8">
            <span className="h-1.5 w-1.5 rounded-full bg-bone/70" />
            عکاسی: استودیوی ولور — پاریس
          </div>
        </div>
      </section>

      <div className="mt-4">
        <Marquee
          items={[
            "ارسال رایگان بالای ۲۰۰٬۰۰۰ تومان",
            "مرجوعی تا ۱۴ روز",
            "ساخت محدود در پاریس",
            "پرداخت امن",
            "رانوی تعاملی AW26",
          ]}
        />
      </div>

      {/* ---------------- collections ---------------- */}
      <section className="mx-auto w-full max-w-[1500px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
        <SectionHeading
          eyebrow="دسته‌بندی‌ها"
          title="از کجا شروع کنی؟"
          description="چهار مسیر کوتاه به کمد پاییزی؛ هر دسته از قطعه‌های واقعی کالکشن ساخته شده است."
          action={{ to: "/products", label: "همهٔ محصولات" }}
        />
        <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {FEATURED_COLLECTIONS.map((c, i) => {
            const sample = productsInCollection(c.id)[0];
            if (!sample) return null;
            return (
              <Reveal key={c.id} delay={i * 0.05}>
                <Link
                  to={`/products?collection=${c.id}`}
                  className="group relative block overflow-hidden rounded-xl bg-[#efe8dd]"
                >
                  <ProductThumb
                    product={sample}
                    tileAspect={0.95}
                    className="w-full rounded-none bg-transparent ring-0 transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-transparent to-transparent" />
                  <div className="absolute inset-x-3 bottom-3 text-bone">
                    <p className="text-[9.5px] text-bone/70">{COLLECTION_COPY[c.id]}</p>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <h3 className="font-display text-[17px] font-medium">{c.label}</h3>
                      <span className="text-[10px] text-bone/70">{productsInCollection(c.id).length} قطعه</span>
                    </div>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ---------------- new arrivals ---------------- */}
      <section className="mx-auto w-full max-w-[1500px] px-4 pb-10 sm:px-6 lg:px-10 lg:pb-14">
        <SectionHeading
          eyebrow="تازه‌های فصل"
          title="تازه رسیده‌ها"
          description="هشت قطعه از آخرین خروجی‌های رانوی پاییز / زمستان، آمادهٔ سفارش."
          action={{ to: "/products?sort=newest", label: "دیدن همهٔ تازه‌ها" }}
        />
        <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 lg:grid-cols-4">
          {newArrivals().map((product, i) => (
            <Reveal key={product.id} delay={Math.min(i, 4) * 0.04}>
              <ProductCard product={product} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- runway band ---------------- */}
      <section className="relative overflow-hidden bg-ink text-bone">
        <div className="mx-auto grid max-w-[1500px] items-center gap-6 px-4 py-0 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-4 lg:px-10">
          <div className="relative z-10 py-10 lg:py-14">
            <div className="flex items-center gap-2.5">
              <span className="h-px w-7 bg-bone/35" />
              <p className="text-[10px] text-bone/55">تجربهٔ تعاملی ولور</p>
            </div>
            <h2 className="mt-3 font-display text-[clamp(1.9rem,4.4vw,3.1rem)] leading-[1.2] font-medium">
              خرید بر اساس استایل
            </h2>
            <p className="mt-3.5 max-w-[27rem] text-[12.5px] leading-[1.95] text-bone/65">
              مدل‌ها را روی صحنه جابه‌جا کن، استایل را از نزدیک ببین و همهٔ قطعه‌های یک ست را — از پالتو تا کیف —
              یک‌جا یا تک‌تک به سبد اضافه کن. سه حالت حرکت، برای هر سلیقه.
            </p>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-bone/60">
              {["۶ استایل کامل", "۲۷ قطعه", "افزودن یک‌جای ست", "سایز و رنگ زنده"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-clay" /> {t}
                </li>
              ))}
            </ul>
            <Link to="/style" className={buttonStyles("light", "lg", "mt-7")}>
              ورود به رانوی تعاملی <ArrowLeft className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="relative -mb-1 flex h-[300px] items-end justify-center gap-0 sm:h-[360px] lg:h-[430px]">
            <div className="pointer-events-none absolute inset-x-6 bottom-0 top-6 rounded-t-full bg-gradient-to-t from-white/[0.07] to-transparent" />
            {[LOOKS[5], LOOKS[0], LOOKS[2]].map((look, i) => (
              <Link
                key={look.id}
                to={`/style/${look.id}`}
                className={
                  i === 1
                    ? "relative z-20 block w-[44%] max-w-[190px] self-end"
                    : "relative z-10 hidden w-[34%] max-w-[150px] self-end opacity-80 transition-opacity hover:opacity-100 sm:block"
                }
                style={{ marginBottom: i === 1 ? 0 : 10 }}
                aria-label={`استایل ${look.name}`}
              >
                <img
                  src={look.image}
                  alt={look.name}
                  loading="lazy"
                  className="h-auto w-full object-contain drop-shadow-[0_16px_24px_rgba(0,0,0,0.45)]"
                  style={{ maxHeight: i === 1 ? 400 : 330 }}
                />
                <span className="mt-1 block text-center text-[9.5px] text-bone/55">{look.name}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- atelier split ---------------- */}
      <section className="mx-auto grid w-full max-w-[1500px] items-stretch gap-0 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:px-10 lg:py-14">
        <div className="relative order-2 min-h-[320px] overflow-hidden rounded-b-xl bg-[#e6dbc9] lg:order-1 lg:rounded-r-xl lg:rounded-bl-none">
          <img
            src={ATELIER_IMAGE}
            alt="دست‌های خیاط در آتلیه ولور روی پالتوی شتری"
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-1000 hover:scale-[1.02]"
          />
        </div>
        <div className="order-1 flex flex-col justify-center rounded-t-xl bg-[#f1ebe2] px-6 py-9 sm:px-10 lg:order-2 lg:rounded-l-xl lg:rounded-tr-none lg:py-14">
          <p className="text-[10px] text-ink-45">آتلیهٔ ولور</p>
          <h2 className="mt-2.5 font-display text-[clamp(1.6rem,3.4vw,2.4rem)] leading-[1.3] font-medium text-ink">
            سه هفته برای یک یقه.
            <span className="block text-ink-70">چون لباس، تصمیم است.</span>
          </h2>
          <p className="mt-3.5 max-w-[30rem] text-[12.5px] leading-[1.95] text-ink-70">
            هر قطعه پیش از رسیدن به رانوی، نمونه‌های پارچه، الگوی کاغذی و دوخت دستی را پشت سر می‌گذارد. ما
            مجموعه‌های کوچک تولید می‌کنیم تا چیزی که می‌پوشی، کمتر شبیه بقیه باشد.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-4 border-t border-black/[0.08] pt-5">
            {[
              { n: "۲۴", l: "قطعه در هر کالکشن" },
              { n: "۹۲٪", l: "پارچهٔ طبیعی" },
              { n: "۱۴", l: "روز مهلت مرجوعی" },
            ].map((s) => (
              <div key={s.l}>
                <p className="font-display text-[22px] leading-none text-ink">{s.n}</p>
                <p className="mt-1.5 text-[10px] leading-relaxed text-ink-45">{s.l}</p>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <ArrowLink to="/about">داستان ولور را بخوان</ArrowLink>
          </div>
        </div>
      </section>

      {/* ---------------- looks ---------------- */}
      <section className="mx-auto w-full max-w-[1500px] px-4 pb-10 sm:px-6 lg:px-10 lg:pb-14">
        <SectionHeading
          eyebrow="استایل‌های رانوی"
          title="شش خروجی، آمادهٔ پوشیدن"
          description="هر استایل ترکیبی است از قطعه‌هایی که جداگانه هم می‌توانی بخری."
          action={{ to: "/style", label: "همهٔ استایل‌ها" }}
        />
        <div className="mt-6 grid gap-3 sm:grid-cols-3 sm:gap-4">
          {[LOOKS[5], LOOKS[1], LOOKS[4]].map((look, i) => (
            <Reveal key={look.id} delay={i * 0.06}>
              <Link
                to={`/style/${look.id}`}
                className="group flex h-full flex-col overflow-hidden rounded-xl border border-black/[0.06] bg-[#f1ebe2]"
              >
                <div className="relative flex h-[290px] items-end justify-center overflow-hidden bg-gradient-to-b from-white/40 to-[#e2d5c2] sm:h-[320px]">
                  <img
                    src={look.image}
                    alt={`استایل ${look.name}`}
                    loading="lazy"
                    className="h-[96%] w-auto max-w-none object-contain transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                  <span className="absolute top-3 right-3 rounded-full bg-white/85 px-2.5 py-1 text-[9.5px] text-ink backdrop-blur">
                    اگزیت {look.order.toLocaleString("fa-IR", { minimumIntegerDigits: 2, useGrouping: false })}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] bg-paper px-4 py-3.5">
                  <div>
                    <h3 className="font-display text-[16px] font-medium text-ink">{look.name}</h3>
                    <p className="mt-0.5 text-[10px] text-ink-45">
                      {look.products.length.toLocaleString("fa-IR")} قطعه · از {formatPrice(Math.min(...look.products.map((p) => p.price)))}
                    </p>
                  </div>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-black/12 text-ink transition-colors group-hover:bg-ink group-hover:text-bone">
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------- campaign / journal ---------------- */}
      <section className="mx-auto grid w-full max-w-[1500px] gap-3 px-4 pb-10 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:px-10 lg:pb-14">
        <Reveal className="relative overflow-hidden rounded-xl bg-[#e8ddcd]">
          <img
            src={CAMPAIGN_IMAGE}
            alt="کمپین ولور؛ مدل با بافت کشمیر عاجی"
            loading="lazy"
            className="h-[360px] w-full object-cover object-[center_38%] sm:h-[440px]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />
          <div className="absolute inset-x-5 bottom-5 text-bone sm:inset-x-7 sm:bottom-7">
            <p className="text-[10px] text-bone/65">کمپین زمستان</p>
            <h2 className="mt-1.5 font-display text-[clamp(1.4rem,2.8vw,2rem)] leading-snug font-medium">
              نرمی، به‌اندازهٔ یک فصل کامل
            </h2>
            <Link
              to="/landing"
              className="mt-3 inline-flex items-center gap-1.5 border-b border-bone/40 pb-0.5 text-[11.5px] text-bone transition-colors hover:border-bone"
            >
              داستان کمپین را ببین <ArrowLeft className="h-3 w-3" />
            </Link>
          </div>
        </Reveal>

        <div className="flex flex-col rounded-xl border border-black/[0.06] bg-paper px-5 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] text-ink-45">از ژورنال</p>
            <ArrowLink to="/journal" className="text-[11px]">
              همهٔ مقاله‌ها
            </ArrowLink>
          </div>
          <ul className="mt-3 divide-y divide-black/[0.07]">
            {POSTS.slice(0, 3).map((post) => (
              <li key={post.slug}>
                <Link to={`/journal/${post.slug}`} className="group flex items-center gap-3 py-3.5">
                  <span
                    className="relative flex h-16 w-14 shrink-0 items-end justify-center overflow-hidden rounded-lg ring-1 ring-black/5"
                    style={{ backgroundColor: post.imageTone }}
                  >
                    <img
                      src={post.image}
                      alt=""
                      loading="lazy"
                      className={
                        post.cutout
                          ? "relative h-[96%] w-auto max-w-none object-contain object-bottom"
                          : "absolute inset-0 h-full w-full object-cover"
                      }
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[9.5px] text-ink-45">
                      {post.category} · {post.readTime.toLocaleString("fa-IR")} دقیقه
                    </p>
                    <h3 className="mt-0.5 truncate text-[12.5px] font-medium text-ink group-hover:text-ink-70">
                      {post.title}
                    </h3>
                    <p className="mt-0.5 line-clamp-1 text-[10.5px] text-ink-45">{post.excerpt}</p>
                  </div>
                  <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-ink-45 transition-transform group-hover:-translate-x-1" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

    </>
  );
}
