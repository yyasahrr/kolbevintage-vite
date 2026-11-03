import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Pencil, X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import type { BDoc } from "./core";
import { activeTemplate, routeKind, useDocs } from "./docs";
import { LiveDoc } from "./Renderer";
import { Header } from "@/components/Header";
import { SiteFooter } from "@/components/SiteFooter";
import { CartDrawer } from "@/components/CartDrawer";
import { Toasts } from "@/components/Toasts";
import { NotFoundPage } from "@/pages/NotFoundPage";

/* ------------------------------------------------------------------ */
/* header / footer slots (Theme Builder)                               */
/* ------------------------------------------------------------------ */

export function useSiteTemplates() {
  const docs = useDocs();
  const { pathname } = useLocation();
  const route = routeKind(pathname);
  return useMemo(
    () => ({
      header: activeTemplate(docs, "header", route),
      footer: activeTemplate(docs, "footer", route),
    }),
    [docs, route],
  );
}

export function AdminPill({ to, label = "ویرایش با صفحه‌ساز" }: { to: string; label?: string }) {
  return (
    <Link to={to} className="eb-admin-pill" aria-label={label}>
      <Pencil width={14} height={14} />
      {label}
    </Link>
  );
}

/** The normal site chrome — default header/footer unless a published template overrides them. */
export function SiteShell({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion() ?? false;
  const { header, footer } = useSiteTemplates();
  return (
    <div className="flex min-h-screen flex-col bg-bone">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:right-3 focus:z-[90] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-[12px] focus:text-bone"
      >
        رفتن به محتوای اصلی
      </a>
      {header ? <LiveDoc doc={header} className="eb-site-header" /> : <Header />}
      <main id="main" className="flex-1">
        {children}
      </main>
      {footer ? <LiveDoc doc={footer} className="eb-site-footer" /> : <SiteFooter />}
      <CartDrawer reduced={reduced} />
      <Toasts reduced={reduced} />
      <PopupHost />
      {(header || footer) && <AdminPill to={`/builder/edit/${(header ?? footer)!.id}`} label="ویرایش هدر / فوتر" />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* published pages                                                     */
/* ------------------------------------------------------------------ */

export function PublishedPage() {
  const { slug } = useParams();
  const docs = useDocs();
  const reduced = useReducedMotion() ?? false;
  const doc = docs.find((d) => (d.kind === "page" || d.kind === "landing") && d.slug === slug);

  useEffect(() => {
    if (!doc) return;
    const prev = document.title;
    document.title = `${doc.title} — ولور`;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const prevDesc = meta?.content;
    if (doc.page.description && meta) meta.content = doc.page.description;
    return () => {
      document.title = prev;
      meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (meta && prevDesc !== undefined) meta.content = prevDesc;
    };
  }, [doc]);

  if (!doc) {
    return (
      <SiteShell>
        <NotFoundPage />
      </SiteShell>
    );
  }

  const draftBanner =
    doc.status !== "published" ? (
      <div style={{ background: "#fef3c7", color: "#92400e", textAlign: "center", fontSize: 12, padding: "6px 10px" }}>
        این صفحه هنوز منتشر نشده و فقط برای پیش‌نمایش نمایش داده می‌شود.
      </div>
    ) : null;

  const body = (
    <>
      {draftBanner}
      {!doc.page.hideTitle && doc.page.layout === "default" && (
        <h1 className="mx-auto max-w-[1100px] px-4 pt-8 font-display text-[clamp(1.8rem,4vw,2.6rem)] font-medium text-ink">{doc.title}</h1>
      )}
      <LiveDoc doc={doc} />
      <AdminPill to={`/builder/edit/${doc.id}`} />
    </>
  );

  if (doc.page.layout === "canvas") {
    return (
      <div className="min-h-screen bg-bone">
        {body}
        <CartDrawer reduced={reduced} />
        <Toasts reduced={reduced} />
        <PopupHost />
      </div>
    );
  }
  return <SiteShell>{body}</SiteShell>;
}

/* ------------------------------------------------------------------ */
/* popups                                                              */
/* ------------------------------------------------------------------ */

export function PopupHost() {
  const docs = useDocs();
  const { pathname } = useLocation();
  const route = routeKind(pathname);
  const popups = docs.filter((d) => d.kind === "popup" && d.active && d.status === "published" && (d.display === "all" || (d.display === "home" && route === "home") || (d.display === "not-home" && route !== "home") || (d.display === "shop" && route === "shop") || (d.display === "pages" && route === "page")));
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    setOpenId(null);
    const cleanups: (() => void)[] = [];
    const seen = (d: BDoc) => d.popup.once && localStorage.getItem(`velours.popup.${d.id}`) === "1";
    const show = (d: BDoc) => {
      if (seen(d)) return;
      setOpenId((cur) => cur ?? d.id);
    };
    for (const d of popups) {
      const t = d.popup;
      if (t.trigger === "load") show(d);
      else if (t.trigger === "delay") {
        const id = window.setTimeout(() => show(d), Math.max(0, t.delay) * 1000);
        cleanups.push(() => window.clearTimeout(id));
      } else if (t.trigger === "scroll") {
        const f = () => {
          const h = document.documentElement;
          const total = h.scrollHeight - h.clientHeight;
          if (total > 0 && (h.scrollTop / total) * 100 >= t.scroll) {
            show(d);
            window.removeEventListener("scroll", f);
          }
        };
        window.addEventListener("scroll", f, { passive: true });
        cleanups.push(() => window.removeEventListener("scroll", f));
      } else if (t.trigger === "exit") {
        const f = (e: MouseEvent) => {
          if (e.clientY <= 0) {
            show(d);
            document.removeEventListener("mouseleave", f);
          }
        };
        document.addEventListener("mouseleave", f);
        cleanups.push(() => document.removeEventListener("mouseleave", f));
      }
    }
    return () => cleanups.forEach((c) => c());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, popups.map((p) => `${p.id}:${p.updatedAt}`).join("|")]);

  const doc = popups.find((p) => p.id === openId);
  if (!doc) return null;
  const close = () => {
    if (doc.popup.once) localStorage.setItem(`velours.popup.${doc.id}`, "1");
    setOpenId(null);
  };
  return (
    <div className={`eb-popup-bg pos-${doc.popup.position}`} onMouseDown={(e) => e.target === e.currentTarget && doc.popup.position === "center" && close()}>
      <div className="eb-popup" role="dialog" aria-modal="true" aria-label={doc.title} style={{ maxWidth: doc.popup.width }}>
        <button type="button" className="eb-popup-x" aria-label="بستن" onClick={close}>
          <X width={16} height={16} />
        </button>
        <LiveDoc doc={doc} />
      </div>
    </div>
  );
}
