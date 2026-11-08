import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen } from "lucide-react";
import { useJournalCategories, useJournalPage } from "@/data/journal";
import { Chip, EmptyState, PageIntro, Reveal } from "@/components/ui";



export function JournalPage() {
  const [category, setCategory] = useState<string|null>(null);
  const [cursors,setCursors]=useState<(string|null)[]>([null]);
  const [navigationKey,setNavigationKey]=useState(0);
  const cursor=cursors[cursors.length-1];
  const journal=useJournalPage(cursor,navigationKey,category);
  const {categories,error:categoriesError}=useJournalCategories();
  const posts=journal.items;
  const featured=cursor===null ? journal.items.find(p=>p.featured) ?? journal.items[0] : undefined;
  const back=()=>{setCursors(old=>old.slice(0,-1));setNavigationKey(v=>v+1)};
  const next=()=>{if(journal.nextCursor){setCursors(old=>[...old,journal.nextCursor]);setNavigationKey(v=>v+1)}};

  // the owner can switch the journal off from the panel; when it is off the
  // section is really gone instead of showing an empty shell (decision 62)
  if (journal.status === "loading") return <div className="p-10 text-center">در حال بارگذاری ژورنال…</div>;
  if (journal.status === "offline") return <div role="alert" className="p-10 text-center">ارتباط با ژورنال برقرار نشد. لطفاً دوباره تلاش کنید.</div>;
  if (!journal.enabled) {
    return (
      <div className="pb-14">
        <PageIntro crumbs={[{ label: "ژورنال" }]} title="ژورنال فعلاً خاموش است" description="مالک فروشگاه این بخش را از پنل خاموش کرده است." />
        <div className="mx-auto w-full max-w-[1500px] px-4 sm:px-6 lg:px-10">
          <EmptyState icon={<BookOpen className="h-5 w-5" />} title="این بخش در دسترس نیست" body="از فروشگاه یا صفحهٔ استایل‌ها شروع کن." />
        </div>
      </div>
    );
  }

  if (!journal.items.length && !category) return <div className="p-10"><EmptyState icon={<BookOpen className="h-5 w-5" />} title={cursor?"مقاله‌ای در این صفحه پیدا نشد":"هنوز مقاله‌ای منتشر نشده"} body={cursor?"فهرست ممکن است تغییر کرده باشد؛ به صفحهٔ قبل برگردید.":"به‌زودی دوباره سر بزنید."} />{cursor&&<button type="button" onClick={back} className="mt-4 rounded-full border px-4 py-2">صفحهٔ قبل</button>}</div>;
  return (
    <div className="pb-14">
      <PageIntro
        crumbs={[{ label: "ژورنال" }]}
        eyebrow={`صفحهٔ ${cursors.length.toLocaleString("fa-IR")} ژورنال`}
        title="ژورنال"
        description="یادداشت‌هایی از آتلیه، رانوی و کمدی که هر روز می‌پوشیم. دربارهٔ پارچه، نسبت و ماندگاری."
      />

      <div className="mx-auto w-full max-w-[1500px] px-4 sm:px-6 lg:px-10">
        {/* featured */}
        {featured&&<Reveal>
          <Link
            to={`/journal/${featured.slug}`}
            className="group grid overflow-hidden rounded-2xl border border-black/[0.06] bg-[#f1ebe2] lg:grid-cols-[1.15fr_1fr]"
          >
            <div
              className="relative flex h-[300px] items-end justify-center overflow-hidden sm:h-[380px] lg:h-[440px]"
              style={{ backgroundColor: featured.cutout ? featured.imageTone : "#e7ddd0" }}
            >
              {featured.cutout && (
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_20%,rgba(255,255,255,0.7),transparent_70%)]" />
              )}
              <img
                src={featured.image}
                alt={featured.title}
                className={
                  featured.cutout
                    ? "relative h-[96%] w-auto max-w-none object-contain object-bottom transition-transform duration-1000 group-hover:scale-[1.03]"
                    : "absolute inset-0 h-full w-full object-cover transition-transform duration-1000 group-hover:scale-[1.03]"
                }
              />
              <span className="absolute top-4 right-4 rounded-full bg-white/85 px-2.5 py-1 text-[9.5px] text-ink backdrop-blur">
                مقالهٔ ویژه
              </span>
            </div>
            <div className="flex flex-col justify-center px-6 py-7 sm:px-9">
              <p className="flex items-center gap-2 text-[10px] text-[#5b534c]">
                <BookOpen className="h-3 w-3" /> {featured.category} · {featured.readTime.toLocaleString("fa-IR")} دقیقه
                مطالعه
              </p>
              <h2 className="mt-2.5 font-display text-[clamp(1.5rem,3.2vw,2.3rem)] leading-[1.35] font-medium text-ink">
                {featured.title}
              </h2>
              <p className="mt-3 max-w-[30rem] text-[12.5px] leading-[2] text-ink-70">{featured.excerpt}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-[11.5px] font-medium text-ink">
                خواندن مقاله
                <ArrowLeft className="h-3.5 w-3.5 transition-transform duration-300 group-hover:-translate-x-1" />
              </span>
            </div>
          </Link>
        </Reveal>}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            <Chip active={category===null} onClick={()=>{setCategory(null);setCursors([null]);setNavigationKey(v=>v+1)}}>همه</Chip>
            {categories.map((c) => (
              <Chip key={c} active={category === c} onClick={() => {setCategory(c);setCursors([null]);setNavigationKey(v=>v+1)}}>
                {c}
              </Chip>
            ))}
          </div>
          <p className="text-[11px] text-ink-45">{posts.length.toLocaleString("fa-IR")} مقاله در این صفحه</p>
        </div>

        {categoriesError && <p role="alert" className="mt-2 text-sm">دریافت دسته‌ها ناموفق بود؛ صفحه را تازه کنید.</p>}
        {!posts.length && <p className="mt-5 text-sm">مقاله‌ای در این دسته یا صفحه پیدا نشد.</p>}
        <div className="mt-5 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, i) => (
            <Reveal key={post.slug} delay={i * 0.05}>
              <Link to={`/journal/${post.slug}`} className="group flex h-full flex-col">
                <div
                  className="relative flex h-[260px] items-end justify-center overflow-hidden rounded-xl"
                  style={{ backgroundColor: post.imageTone }}
                >
                  {post.cutout && (
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_15%,rgba(255,255,255,0.65),transparent_70%)]" />
                  )}
                  <img
                    src={post.image}
                    alt={post.title}
                    loading="lazy"
                    className={
                      post.cutout
                        ? "relative h-[94%] w-auto max-w-none object-contain object-bottom transition-transform duration-700 group-hover:scale-[1.03]"
                        : "absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                    }
                  />
                  <span className="absolute top-3 right-3 rounded-full bg-white/85 px-2.5 py-1 text-[9.5px] text-ink backdrop-blur">
                    {post.category}
                  </span>
                </div>
                <div className="mt-3 flex flex-1 flex-col">
                  <p className="text-[10px] text-ink-45">
                    {post.date} · {post.readTime.toLocaleString("fa-IR")} دقیقه
                  </p>
                  <h3 className="mt-1.5 font-display text-[19px] leading-snug font-medium text-ink group-hover:text-ink-70">
                    {post.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 flex-1 text-[11.5px] leading-[1.9] text-ink-70">{post.excerpt}</p>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-ink">
                    ادامهٔ مطلب <ArrowLeft className="h-3 w-3" />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
        {(cursor||journal.nextCursor)&&<nav aria-label="صفحه‌بندی ژورنال" className="mt-8 flex flex-wrap items-center gap-3">
          <button type="button" className="rounded-full border border-current px-4 py-2 text-sm disabled:opacity-40" onClick={back} disabled={!cursor}>صفحهٔ قبل</button>
          <span className="text-sm">صفحهٔ {cursors.length.toLocaleString("fa-IR")}</span>
          <button type="button" className="rounded-full border border-current px-4 py-2 text-sm disabled:opacity-40" onClick={next} disabled={!journal.nextCursor}>مقالات قدیمی‌تر</button>
        </nav>}
      </div>

      <div className="mt-12">
      </div>
    </div>
  );
}
