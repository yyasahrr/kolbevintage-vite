import { Link } from "react-router-dom";
import { ArrowLeft, Clock, Leaf, Mail, MapPin, Phone, Scissors, Sparkles, Truck } from "lucide-react";
import { ATELIER_IMAGE, HERO_IMAGE } from "@/data/journal";
import {
  Accordion,
  Breadcrumbs,
  PageIntro,
  Reveal,
  SectionHeading,
  buttonStyles,
} from "@/components/ui";

const VALUES = [
  {
    icon: Leaf,
    title: "پارچهٔ طبیعی، انتخاب محدود",
    body: "بیش از ۹۰٪ کالکشن از پشم، کشمیر، پنبه و کتان طبیعی است. برای هر قطعه حداکثر سه پارچه آزمایش می‌شود تا وزن و افت مناسب پیدا شود.",
  },
  {
    icon: Scissors,
    title: "تولید کوچک، دست‌دوز",
    body: "هر سفارش از میان تولید محدود همان فصل ارسال می‌شود. هیچ قطعه‌ای به‌اندازهٔ کافی برای تخفیف پایان فصل ساخته نمی‌شود.",
  },
  {
    icon: Truck,
    title: "ارسال و مرجوعی بدون دردسر",
    body: "ارسال رایگان بالای ۲۰۰٬۰۰۰ تومان، مرجوعی تا ۱۴ روز و تعمیر رایگان درزها تا یک سال پس از خرید.",
  },
];

const STEPS = [
  { n: "۰۱", t: "الگو در کاغذ", b: "طرح اولیه روی کاغذ کشمیر و با مداد نرم؛ سه نسبت متفاوت تا انتخاب نهایی." },
  { n: "۰۲", t: "نمونهٔ پارچه", b: "وزن، افت و بازتاب رنگ پارچه در نور طبیعی آتلیه سنجیده می‌شود." },
  { n: "۰۳", t: "دوخت و پرو", b: "دوخت دستی سجاف و لبه‌ها، سپس پرو روی بدن واقعی برای اصلاح فرم." },
  { n: "۰۴", t: "رانوی و فروشگاه", b: "قطعه روی رانوی معرفی می‌شود و هم‌زمان برای سفارش آنلاین آماده است." },
];

const BOUTIQUES = [
  { city: "تهران", address: "خیابان ولیعصر، پلاک ۲۴، طبقهٔ دوم", hours: "شنبه تا پنجشنبه، ۱۰ تا ۲۰", phone: "021 8888 2424" },
  { city: "اصفهان", address: "خیابان چهارباغ بالا، مجتمع نگین، واحد ۱۱", hours: "شنبه تا پنجشنبه، ۱۰ تا ۲۱", phone: "031 3666 1111" },
  { city: "شیراز", address: "بلوار زند، پلاک ۴۸", hours: "هر روز، ۱۰ تا ۲۲", phone: "071 3232 2020" },
];

export function AboutPage() {
  return (
    <div className="pb-14">
      <PageIntro
        crumbs={[{ label: "دربارهٔ ما" }]}
        eyebrow="خانهٔ کلبه وینتیج · تأسیس ۱۳۹۲"
        title="آهسته می‌سازیم، بلند می‌پوشیم"
        description="کلبه وینتیج یک خانهٔ مستقل پوشاک آماده است؛ با آتلیه‌ای در تهران و مجموعه‌هایی کوچک که با نسبت، پارچه و دست‌دوزی ساخته می‌شوند."
      >
        <Link to="/products" className={buttonStyles("solid", "md")}>
          دیدن کالکشن <ArrowLeft className="h-3.5 w-3.5" />
        </Link>
      </PageIntro>

      <section className="mx-auto w-full max-w-[1500px] px-4 sm:px-6 lg:px-10">
        <div className="grid overflow-hidden rounded-2xl border border-black/[0.06] bg-[#f1ebe2] lg:grid-cols-[1.05fr_1fr]">
          <div className="relative min-h-[280px] overflow-hidden sm:min-h-[360px]">
            <img src={ATELIER_IMAGE} alt="آتلیه کلبه وینتیج" className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-col justify-center px-6 py-8 sm:px-9 lg:py-10">
            <Breadcrumbs items={[]} />
            <h2 className="mt-3 font-display text-[clamp(1.5rem,3vw,2.1rem)] leading-[1.4] font-medium text-ink">
              از یک میز کار در محلهٔ سوم شروع شد
            </h2>
            <p className="mt-3 text-[12.5px] leading-[2] text-ink-70">
              سال ۱۳۹۲ با شش قطعه و یک چرخ خیاطی شروع کردیم. ایده ساده بود: لباس‌هایی که سال‌ها بعد هم بتوانی
              بپوشی. امروز همان شش قطعه به شش استایل رانوی رسیده‌اند، اما روش تغییر نکرده؛ هنوز هر نمونه روی
              بدن پرو می‌شود و هر درز دستی کنترل می‌شود.
            </p>
            <p className="mt-2.5 text-[12.5px] leading-[2] text-ink-70">
              تصمیم گرفتیم فقط دو کالکشن در سال و در تعداد محدود تولید کنیم. به همین دلیل، قطعه‌ای که می‌خری
              کمتر جایی دیده می‌شود و بیشتر می‌ماند.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-3 border-t border-black/[0.08] pt-4">
              {[
                { n: "۲۴", l: "قطعه در فصل" },
                { n: "۹۲٪", l: "پارچهٔ طبیعی" },
                { n: "۱۴", l: "روز مرجوعی" },
              ].map((s) => (
                <div key={s.l}>
                  <p className="font-display text-[21px] leading-none text-ink">{s.n}</p>
                  <p className="mt-1.5 text-[10px] text-ink-45">{s.l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1500px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
        <SectionHeading
          eyebrow="اصول ما"
          title="سه تصمیم که تغییر نمی‌کند"
          description="هر تصمیم طراحی از این سه اصل شروع می‌شود؛ از انتخاب پارچه تا نوع بسته‌بندی."
        />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {VALUES.map((value, i) => (
            <Reveal key={value.title} delay={i * 0.06}>
              <div className="h-full rounded-xl border border-black/[0.07] bg-white/50 p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-bone">
                  <value.icon className="h-4 w-4" />
                </span>
                <h3 className="mt-3.5 text-[13px] font-medium text-ink">{value.title}</h3>
                <p className="mt-2 text-[11.5px] leading-[2] text-ink-70">{value.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-y border-black/[0.07] bg-[#f1ebe2]">
        <div className="mx-auto grid max-w-[1500px] gap-7 px-4 py-10 sm:px-6 lg:grid-cols-[0.8fr_2fr] lg:px-10 lg:py-12">
          <div>
            <p className="text-[10px] text-ink-45">مراحل ساخت</p>
            <h2 className="mt-2 font-display text-[clamp(1.35rem,2.6vw,1.8rem)] leading-snug font-medium text-ink">
              از کاغذ تا رانوی
            </h2>
            <p className="mt-2.5 max-w-[21rem] text-[12px] leading-[1.95] text-ink-70">
              یک قطعه به‌طور متوسط چهار تا شش هفته پیش از رسیدن به فروشگاه، این مسیر را طی می‌کند.
            </p>
            <div className="mt-4 flex items-center gap-2 text-[10.5px] text-ink-45">
              <Sparkles className="h-3 w-3" /> همهٔ قطعه‌ها در تهران مونتاژ می‌شوند
            </div>
          </div>
          <ol className="grid gap-2.5 sm:grid-cols-2">
            {STEPS.map((step) => (
              <li key={step.n} className="rounded-xl border border-black/[0.07] bg-paper/80 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-ink-45">{step.n}</span>
                  <span className="h-px flex-1 mx-3 bg-ink/10" />
                </div>
                <h3 className="mt-2 text-[12.5px] font-medium text-ink">{step.t}</h3>
                <p className="mt-1.5 text-[11px] leading-[1.9] text-ink-70">{step.b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1500px] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
        <SectionHeading
          eyebrow="بوتیک‌ها"
          title="ما را از نزدیک ببین"
          description="برای پرو، مشاورهٔ سایز یا تعمیر قطعه‌های قبلی، به یکی از بوتیک‌ها سر بزن."
          action={{ to: "/products", label: "خرید آنلاین" }}
        />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {BOUTIQUES.map((b) => (
            <div key={b.city} className="rounded-xl border border-black/[0.07] bg-white/50 p-5">
              <h3 className="font-display text-[18px] font-medium text-ink">{b.city}</h3>
              <ul className="mt-3 space-y-2 text-[11.5px] text-ink-70">
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-45" /> {b.address}
                </li>
                <li className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-45" /> {b.hours}
                </li>
                <li className="flex items-start gap-2">
                  <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-45" />
                  <span dir="ltr">{b.phone}</span>
                </li>
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-xl border border-black/[0.07] bg-white/50 p-5">
            <p className="text-[10px] text-ink-45">پرسش‌های متداول</p>
            <div className="mt-3">
              <Accordion
                items={[
                  {
                    title: "چه مدت ارسال طول می‌کشد؟",
                    body: "ارسال استاندارد ۲ تا ۴ روز کاری در سراسر ایران و ۵ تا ۸ روز برای سایر مقاصد. ارسال سریع ۲۴ ساعته برای سفارش‌های ثبت‌شده تا ساعت ۱۲ به وقت تهران فعال است.",
                  },
                  {
                    title: "اگر سایز مناسب نبود چه کنم؟",
                    body: "تا ۱۴ روز پس از دریافت می‌توانی درخواست مرجوعی یا تعویض ثبت کنی. برچسب اصلی باید روی قطعه باشد. هزینهٔ بازگشت برای سفارش‌های بالای ۲۰۰٬۰۰۰ تومان با ما است.",
                  },
                  {
                    title: "قطعه‌های رانوی قابل خرید هستند؟",
                    body: "بله. همهٔ مدل‌های صفحهٔ «خرید بر اساس استایل» به فروشگاه متصل‌اند و هر قطعه به‌صورت تکی یا به‌شکل استایل کامل قابل افزودن به سبد است.",
                  },
                  {
                    title: "امکان خرید حضوری و پرو وجود دارد؟",
                    body: "در سه بوتیک تهران، اصفهان و شیراز امکان پرو و مشاورهٔ رایگان وجود دارد. برای وقت اختصاصی از طریق ایمیل مشتریان وقت بگیر.",
                  },
                ]}
              />
            </div>
          </div>
          <div className="relative overflow-hidden rounded-xl">
            <img src={HERO_IMAGE} alt="بوتیک کلبه وینتیج" className="h-full min-h-[220px] w-full object-cover object-top" />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/60 to-transparent" />
            <div className="absolute inset-x-4 bottom-4 flex flex-wrap items-center justify-between gap-2 text-bone">
              <p className="text-[11px]">مشاورهٔ اختصاصی با تیم استایل</p>
              <a
                href="mailto:client@velours.store"
                className="inline-flex items-center gap-1.5 rounded-full bg-bone/95 px-3 py-1.5 text-[10.5px] text-ink"
              >
                <Mail className="h-3 w-3" /> ایمیل بزن
              </a>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
