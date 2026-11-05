import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Copy, Link2 } from "lucide-react";
import { getPost, POSTS } from "@/data/journal";
import { CATALOG } from "@/data/catalog";
import { useCart } from "@/state/cart";
import { ProductCard } from "@/components/ProductCard";
import { Breadcrumbs, buttonStyles } from "@/components/ui";
import { NotFoundPage } from "./NotFoundPage";
import { useOps } from "@/state/ops";

export function ArticlePage() {
  const { slug } = useParams();
  const post = getPost(slug);
  // the owner's block-editor version wins over the shipped article (decision 68)
  const edited = useOps().journalBlocks ?? {};
  const { notify } = useCart();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!post) return;
    document.title = `${post.title} — ژورنال ولور`;
    return () => {
      document.title = "ولور — خرید بر اساس استایل | رانوی تعاملی";
    };
  }, [post]);

  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const total = h.scrollHeight - h.clientHeight;
      setProgress(total > 0 ? Math.min(100, (h.scrollTop / total) * 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!post) return <NotFoundPage />;

  const next = POSTS.find((p) => p.slug !== post.slug) ?? POSTS[0];
  const picks = [CATALOG[0], CATALOG[10], CATALOG[19]];

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify("لینک کپی شد", "می‌توانی مقاله را برای کسی بفرستی.");
    } catch {
      notify("کپی نشد", "لینک را از نوار مرورگر بردار.");
    }
  };

  return (
    <div>
      <div className="fixed inset-x-0 top-0 z-50 h-0.5 bg-transparent">
        <div className="h-full bg-ember transition-[width] duration-150" style={{ width: `${progress}%` }} />
      </div>

      <article>
        <div className="mx-auto w-full max-w-[1500px] px-4 pt-5 sm:px-6 lg:px-10">
          <Breadcrumbs items={[{ label: "ژورنال", to: "/journal" }, { label: post.title }]} />
        </div>

        <header className="mx-auto max-w-[46rem] px-4 pt-7 pb-6 text-center sm:px-6">
          <p className="text-[10px] text-ink-45">
            {post.category} · {post.date} · {post.readTime.toLocaleString("fa-IR")} دقیقه مطالعه
          </p>
          <h1 className="mt-3 font-display text-[clamp(1.9rem,4.6vw,3rem)] leading-[1.3] font-medium text-ink">
            {post.title}
          </h1>
          <p className="mx-auto mt-3 max-w-[34rem] text-[12.5px] leading-[2] text-ink-70">{post.excerpt}</p>
        </header>

        <div className="mx-auto w-full max-w-[1100px] px-4 sm:px-6">
          <div
            className="relative flex h-[clamp(300px,52vh,520px)] items-end justify-center overflow-hidden rounded-2xl"
            style={{ backgroundColor: post.imageTone }}
          >
            {post.cutout && (
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_15%,rgba(255,255,255,0.7),transparent_72%)]" />
            )}
            <img
              src={post.image}
              alt={post.title}
              className={
                post.cutout
                  ? "relative h-[94%] w-auto max-w-none object-contain object-bottom"
                  : "absolute inset-0 h-full w-full object-cover"
              }
              fetchPriority="high"
            />
          </div>
        </div>

        <div className="mx-auto max-w-[42rem] px-4 pt-9 sm:px-6">
          {(edited[post.slug] ?? post.blocks).map((block, i) => {
            if (block.type === "h")
              return (
                <h2 key={i} className="mt-7 font-display text-[22px] leading-snug font-medium text-ink">
                  {block.text}
                </h2>
              );
            if (block.type === "image" && block.src)
              return (
                <figure key={i} className="mt-6">
                  <img src={block.src} alt={block.text || "تصویر مقاله"} loading="lazy" className="w-full rounded-[var(--radius-lg)] border border-black/5 object-cover" />
                  {block.text && <figcaption className="mt-2 text-[10.5px] text-ink-45">{block.text}</figcaption>}
                </figure>
              );
            if (block.type === "gallery" && block.images?.length)
              return (
                <div key={i} className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {block.images.map((src, gi) => (
                    <img key={gi} src={src} alt={block.text || `تصویر ${gi + 1}`} loading="lazy" className="aspect-[3/4] w-full rounded-[var(--radius-md)] border border-black/5 object-cover" />
                  ))}
                </div>
              );
            if (block.type === "quote")
              return (
                <blockquote
                  key={i}
                  className="my-7 border-r-2 border-clay bg-[#f3ede4] px-5 py-4 font-display text-[clamp(1.05rem,2.2vw,1.35rem)] leading-[1.9] text-ink"
                >
                  {block.text}
                </blockquote>
              );
            return (
              <p key={i} className="mt-4 text-[13px] leading-[2.15] text-ink-70">
                {block.text}
              </p>
            );
          })}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-y border-black/[0.08] py-4">
            <p className="text-[10.5px] text-ink-45">نویسنده: تیم تحریریهٔ ولور</p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={copyLink} className={buttonStyles("outline", "sm")}>
                <Link2 className="h-3.5 w-3.5" /> کپی لینک
              </button>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 text-ink-45">
                <Copy className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <Link
              to="/journal"
              className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-70 transition-colors hover:text-ink"
            >
              <ArrowLeft className="h-3.5 w-3.5 rotate-180" /> بازگشت به ژورنال
            </Link>
            <Link to={`/journal/${next.slug}`} className="group text-end">
              <span className="block text-[9.5px] text-ink-45">مقالهٔ بعدی</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-[12px] font-medium text-ink">
                {next.title}
                <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-1" />
              </span>
            </Link>
          </div>
        </div>
      </article>

      <section className="mx-auto w-full max-w-[1500px] px-4 pt-12 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] text-ink-45">از کالکشن</p>
            <h2 className="mt-1.5 font-display text-[clamp(1.3rem,2.6vw,1.8rem)] font-medium text-ink">
              قطعه‌هایی که در مقاله دیدی
            </h2>
          </div>
          <Link to="/products" className={buttonStyles("outline", "md")}>
            همهٔ محصولات
          </Link>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-7 sm:gap-x-4 lg:grid-cols-3">
          {picks.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>

      <div className="mt-12">
      </div>
    </div>
  );
}
