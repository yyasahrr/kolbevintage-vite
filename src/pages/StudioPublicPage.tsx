import { useEffect, useState } from "react";
import { useLiveCatalog } from "@/state/live-catalog";
import { visibleProducts } from "@/data/catalog";
import { ProductCard } from "@/components/ProductCard";
import { useParams } from "react-router-dom";

type Block = {
  id: string;
  type: "hero" | "banner" | "text" | "video" | "products" | "campaign";
  heading: string;
  text: string;
  buttonText: string;
  href: string;
  image: string;
  video?: string;
};
type Page = { title: string; blocks: Block[] };
function safe(value: string | undefined, media = false) {
  if (!value || /[\u0000-\u0020\\]/.test(value)) return "";
  if (value.startsWith("/"))
    return !value.startsWith("//") &&
      (!media || /^\/uploads\/[a-zA-Z0-9._-]+$/.test(value))
      ? value
      : "";
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password ? value : "";
  } catch {
    return "";
  }
}
function StudioProducts({ block }: { block: Block }) {
  const catalog = useLiveCatalog();
  const products = visibleProducts().slice(0, 8);
  return (
    <section
      style={{ maxWidth: "80rem", margin: "auto", padding: "3rem 1.25rem" }}
    >
      <h2 style={{ fontSize: "1.75rem", fontWeight: 700 }}>{block.heading}</h2>
      {block.text && (
        <p style={{ marginTop: ".5rem", lineHeight: 2 }}>{block.text}</p>
      )}
      {catalog.status !== "online" && (
        <p role="status">اطلاعات کاتالوگ ممکن است به‌روز نباشد.</p>
      )}
      {!products.length && <p>محصولی برای نمایش موجود نیست.</p>}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(min(100%, 180px),1fr))",
          gap: "1rem",
          marginTop: "1.5rem",
        }}
      >
        {products.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
      <p style={{ marginTop: "1rem", fontSize: ".8rem" }}>
        قیمت نهایی و شرایط تخفیف در سبد خرید محاسبه می‌شود.
      </p>
    </section>
  );
}
function StudioBlock({ block }: { block: Block }) {
  const video = block.type === "video",
    dark = block.type === "hero" || video,
    media = safe(block.image, true),
    source = safe(block.video, true),
    href = safe(block.href);
  const [reduce, setReduce] = useState(true);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(m.matches);
    update();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  if (block.type === "products") return <StudioProducts block={block} />;
  return (
    <section
      style={{
        position: "relative",
        overflow: "hidden",
        minHeight: video
          ? "100svh"
          : block.type === "hero"
            ? "28rem"
            : undefined,
        display: "flex",
        alignItems: "center",
        background: dark
          ? "#19172b"
          : block.type === "banner" || block.type === "campaign"
            ? "#e8e5fa"
            : "#fff",
        color: dark ? "#fff" : "#171429",
      }}
    >
      {media && (
        <img
          src={media}
          alt=""
          loading="lazy"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: dark ? 0.35 : 0.2,
          }}
        />
      )}
      {video && source && !reduce && (
        <video
          aria-label={block.heading || "ویدیو"}
          src={source}
          poster={media || undefined}
          autoPlay
          muted
          loop
          playsInline
          controls
          preload="metadata"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            opacity: 0.42,
          }}
        />
      )}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "80rem",
          margin: "0 auto",
          padding: "clamp(2rem, 7vw, 6rem) 1.25rem",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            maxWidth: "45rem",
            pointerEvents: "auto",
            background: dark ? "rgba(17,15,30,0.78)" : "rgba(255,255,255,0.88)",
            padding: "1.5rem",
            borderRadius: "1rem",
          }}
        >
          {block.heading && (
            <h2
              style={{
                fontSize: "clamp(1.5rem, 4vw, 3rem)",
                fontWeight: 700,
                lineHeight: 1.4,
              }}
            >
              {block.heading}
            </h2>
          )}
          {block.text && (
            <p
              style={{
                marginTop: "1rem",
                whiteSpace: "pre-wrap",
                lineHeight: 2,
              }}
            >
              {block.text}
            </p>
          )}
          {block.buttonText && href && (
            <a
              href={href.startsWith("/") ? `/#${href}` : href}
              {...(!href.startsWith("/")
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
              style={{
                display: "inline-block",
                marginTop: "1.5rem",
                padding: ".75rem 1.25rem",
                background: dark ? "#fff" : "#21184b",
                color: dark ? "#171429" : "#fff",
                borderRadius: ".6rem",
                fontWeight: 700,
              }}
            >
              {block.buttonText}
            </a>
          )}
        </div>
      </div>
      {video && source && reduce && (
        <div style={{ position: "absolute", bottom: 8, left: 8, right: 8 }}>
          <video
            aria-label={block.heading || "ویدیو"}
            src={source}
            poster={media || undefined}
            controls
            preload="none"
            style={{ maxHeight: "35vh", maxWidth: "100%" }}
          />
        </div>
      )}
    </section>
  );
}
export function StudioPublicPage() {
  const { slug } = useParams();
  const [page, setPage] = useState<Page | null>(null),
    [state, setState] = useState<"loading" | "ready" | "missing" | "error">(
      "loading",
    );
  useEffect(() => {
    let controller: AbortController | null = null;
    let alive = true;
    setPage(null);
    setState("loading");
    const refresh = () => {
      controller?.abort();
      controller = new AbortController();
      fetch(`/api/studio/pages/${encodeURIComponent(slug ?? "")}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (r) => {
          if (!alive) return;
          if (r.status === 404) {
            setPage(null);
            setState("missing");
            return;
          }
          if (!r.ok) throw Error("request");
          const body = await r.json();
          if (!alive) return;
          if (typeof body.title !== "string" || !Array.isArray(body.blocks))
            throw Error("invalid");
          setPage(body);
          setState("ready");
        })
        .catch((e) => {
          if (alive && e.name !== "AbortError") {
            setPage(null);
            setState("error");
          }
        });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    refresh();
    const timer = window.setInterval(onVisible, 30000);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      controller?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [slug]);
  useEffect(() => {
    if (!page) return;
    const old = document.title;
    document.title = page.title;
    return () => {
      document.title = old;
    };
  }, [page]);
  if (state !== "ready")
    return (
      <div role="status" className="mx-auto max-w-3xl px-5 py-16 text-center">
        {state === "loading"
          ? "در حال دریافت صفحه…"
          : state === "missing"
            ? "این صفحه منتشر نشده یا در دسترس نیست."
            : "دریافت صفحه ناموفق بود؛ دوباره تلاش کنید."}
      </div>
    );
  return (
    <div aria-label={page?.title}>
      {page?.blocks.map((b) => (
        <StudioBlock key={b.id} block={b} />
      ))}
    </div>
  );
}
