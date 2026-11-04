import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, Quote } from "lucide-react";
import { CAMPAIGN_IMAGE, HERO_IMAGE, LOOK2_IMAGE, ATELIER_IMAGE } from "@/data/journal";
import { LOOKS } from "@/data/looks";
import { CATALOG } from "@/data/catalog";
import { ProductCard } from "@/components/ProductCard";
import {
  Breadcrumbs,
  Marquee,
  Reveal,
  SectionHeading,
  buttonStyles,
} from "@/components/ui";

const CHAPTERS = [
  {
    n: "۰۱",
    label: "پارچه",
    title: "کتان، پیش از پاییز",
    body: "تراکوتا از همان ابتدا در کالکشن بود؛ رنگی که در نور بعدازظهر گرم می‌شود. بلیزر سیِنا از کتان ایتالیایی با بافت درشت دوخته شده و روی تاپ کشباف، فرمی آرام می‌سازد.",
    image: LOOK2_IMAGE,
    tint: "#e9d9cd",
    link: "/style/look-02",
    linkLabel: "استایل ساعت تراکوتا",
    fit: "contain",
  },
  {
    n: "۰۲",
    label: "حجم",
    title: "کشمیر، بی‌وزن",
    body: "بافت نوآژ با حجم کنترل‌شده روی دامن ساتن می‌نشیند. ایدهٔ این استایل از یک صبح آرام در آتلیه آمد: نرمی بالا و جریان پایین، بدون هیچ جزئیات اضافه.",
    image: CAMPAIGN_IMAGE,
    tint: "#efe6d8",
    link: "/style/look-03",
    linkLabel: "استایل سکوت عاجی",
    fit: "cover",
  },
  {
    n: "۰۳",
    label: "ساخت",
    title: "چرم، با گذشت زمان",
    body: "کفش و کیف این فصل از چرم دباغی‌شدهٔ گیاهی ساخته شده‌اند؛ همان چیزی که با پوشیدن، تیره‌تر و شخصی‌تر می‌شود. سه هفته کار دستی برای هر جفت.",
    image: ATELIER_IMAGE,
    tint: "#e6dccb",
    link: "/products?collection=bags",
    linkLabel: "دیدن کیف و چرم",
    fit: "cover",
  },
];

export function LandingPage() {
  const featured = [CATALOG[0], CATALOG[8], CATALOG[17], CATALOG[22]];

  return (
    <div>
      {/* hero */}
      <section className="mx-auto w-full max-w-[1500px] px-3 pt-3 sm:px-5 lg:px-8">
        <div className="relative overflow-hidden rounded-[var(--radius-hero)] bg-[#2a241e]">
          <img
            src={HERO_IMAGE}
            alt="کمپین پاییز زمستان ولور؛ دو مدل با پالتوهای شتری و مشکی"
            className="h-[clamp(460px,78vh,720px)] w-full object-cover object-[60%_center] sm:object-center"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-ink/5" />
          <div className="absolute inset-0 flex flex-col justify-between p-5 sm:p-9 lg:p-12">
            <div className="flex items-start justify-between gap-4 text-bone">
              <p className="flex items-center gap-2.5 text-[10px] text-bone/70">
                <span className="h-px w-7 bg-bone/50" /> کمپین پاییز / زمستان ۲۶
              </p>
              <p className="latin-track hidden text-[9.5px] text-bone/50 sm:block">AW26 · CAMPAIGN</p>
            </div>
            <div className="max-w-[38rem] text-bone">
              <h1 className="font-display text-[clamp(2.3rem,6.2vw,4.6rem)] leading-[1.12] font-medium">
                زمستان،
                <span className="block text-bone/75">به روایتِ کشمیر.</span>
              </h1>
              <p className="mt-4 max-w-[27rem] text-[12.5px] leading-[2] text-bone/70">
                کمپین امسال در سکوت یک گالری بتنی و نور عصرانه ثبت شد؛ سه فصل کوچک از یک ایده:
                لباسی که با حرکت بدن کامل می‌شود.
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5">
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
      </section>

      <div className="mt-4">
        <Marquee
          items={["کمپین AW26", "ساخت تهران", "پارچهٔ طبیعی", "تولید محدود", "سه فصل، یک ایده"]}
        />
      </div>

      {/* manifesto */}
      <section className="mx-auto w-full max-w-[1500px] px-4 pt-12 pb-8 sm:px-6 lg:px-10 lg:pt-16">
        <Breadcrumbs items={[{ label: "کمپین AW26" }]} />
        <Reveal className="mx-auto mt-8 max-w-[46rem] text-center">
          <Quote className="mx-auto h-6 w-6 text-clay" />
          <p className="mt-4 font-display text-[clamp(1.25rem,2.9vw,1.9rem)] leading-[1.75] font-medium text-ink">
            «ما لباس نمی‌سازیم؛ تصمیم می‌گیریم پارچه کجای بدن بایستد. هر قطعه، یک جملهٔ کوتاه از یک فصل
            بلند است.»
          </p>
          <p className="mt-4 text-[10.5px] text-ink-45">— استودیوی طراحی ولور، تهران</p>
        </Reveal>
      </section>

      {/* chapters */}
      <section className="mx-auto w-full max-w-[1500px] px-4 pb-6 sm:px-6 lg:px-10">
        <div className="space-y-4">
          {CHAPTERS.map((chapter, i) => (
            <Reveal key={chapter.n}>
              <article
                className="grid overflow-hidden rounded-2xl border border-black/[0.06] lg:grid-cols-2"
                style={{ backgroundColor: chapter.tint }}
              >
                <div
                  className={
                    "relative flex min-h-[300px] items-end justify-center overflow-hidden sm:min-h-[380px] " +
                    (i % 2 === 1 ? "lg:order-2" : "")
                  }
                >
                  <img
                    src={chapter.image}
                    alt={chapter.title}
                    loading="lazy"
                    className={
                      chapter.fit === "contain"
                        ? "h-[94%] w-auto max-w-none object-contain drop-shadow-[0_18px_26px_rgba(22,19,15,0.16)]"
                        : "h-full w-full object-cover object-[center_32%]"
                    }
                  />
                  <span className="absolute top-4 right-4 rounded-full bg-white/80 px-2.5 py-1 text-[9.5px] text-ink backdrop-blur">
                    {chapter.label}
                  </span>
                </div>
                <div className="flex flex-col justify-center px-6 py-8 sm:px-10 lg:py-12">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-[15px] text-ink-45">{chapter.n}</span>
                    <span className="h-px w-8 bg-ink/20" />
                    <span className="text-[10px] text-ink-45">فصل {chapter.label}</span>
                  </div>
                  <h2 className="mt-3 font-display text-[clamp(1.5rem,3vw,2.1rem)] leading-[1.35] font-medium text-ink">
                    {chapter.title}
                  </h2>
                  <p className="mt-3 max-w-[30rem] text-[12.5px] leading-[2] text-ink-70">{chapter.body}</p>
                  <div className="mt-5 flex flex-wrap items-center gap-4">
                    <Link to={chapter.link} className={buttonStyles("solid", "md")}>
                      {chapter.linkLabel} <ArrowLeft className="h-3.5 w-3.5" />
                    </Link>
                    <Link to="/about" className="group inline-flex items-center gap-1.5 text-[11px] text-ink-70">
                      دربارهٔ ساخت
                      <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </Link>
                  </div>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      {/* campaign pieces */}
      <section className="mx-auto w-full max-w-[1500px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
        <SectionHeading
          eyebrow="قطعه‌های کمپین"
          title="آنچه در قاب دیدی"
          description="چهار قطعهٔ شاخص کمپین، آمادهٔ سفارش با سایز و رنگ دلخواه."
          action={{ to: "/products", label: "همهٔ محصولات" }}
        />
        <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 lg:grid-cols-4">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      {/* runway cta */}
      <section className="relative overflow-hidden bg-ink text-bone">
        <div className="mx-auto flex max-w-[1500px] flex-col items-center gap-2 px-4 py-12 text-center sm:px-6 lg:px-10">
          <p className="text-[10px] text-bone/55">تجربهٔ تعاملی</p>
          <h2 className="mt-1 font-display text-[clamp(1.7rem,3.6vw,2.6rem)] font-medium">
            سه فصل را روی رانو ببین
          </h2>
          <p className="mt-2 max-w-[32rem] text-[12px] leading-[1.95] text-bone/60">
            هر شش اگزیت با تمام قطعه‌هایشان روی صحنهٔ تعاملی؛ حرکت کن، انتخاب کن و استایل را کامل بخر.
          </p>
          <Link to="/style" className={buttonStyles("light", "lg", "mt-5")}>
            ورود به رانوی تعاملی <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
          <div className="mt-6 flex items-end justify-center gap-1 opacity-80">
            {[LOOKS[5], LOOKS[0]].map((look) => (
              <img
                key={look.id}
                src={look.image}
                alt=""
                loading="lazy"
                className="h-[110px] w-auto object-contain sm:h-[150px]"
              />
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
