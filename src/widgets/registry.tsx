import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Clock, Copy, Mail, MapPin, Phone, ShieldCheck, Sparkles, Truck, Undo2 } from "lucide-react";
import { useState } from "react";
import { liveCatalog, liveGetProduct, newArrivals, totalStock, visibleProducts, type CatalogProduct } from "@/data/catalog";
import { formatPrice, LOOKS } from "@/data/looks";
import { POSTS } from "@/data/journal";
import { resolveImg } from "@/builder/stock";
import { ProductCard } from "@/components/ProductCard";
import { SectionHeading } from "@/components/ui";
import { useAdmin } from "@/state/admin";
import { useOps } from "@/state/ops";
import { useCart } from "@/state/cart";
import { recentViews } from "./recent";
import { useApiGet } from "./useApi";
import type { WidgetInstance, WidgetOption, WidgetZone } from "./types";

/* =====================================================================
   The widget catalogue (decision 75).

   Every entry below renders real shop data or nothing at all. None of them
   invent a product, a review, a number or a deadline: when the data is not
   there the widget returns null, and the panel says so before you install it.
   ===================================================================== */

export interface WidgetProps {
  title: string;
  options: Record<string, string | number | boolean>;
  productId?: string;
  articleSlug?: string;
}

export interface WidgetDef {
  kind: string;
  name: string;
  blurb: string;
  group: string;
  zones: WidgetZone[];
  defaultTitle: string;
  options?: WidgetOption[];
  /** true when the widget needs sales/visitor data that a new shop has none of */
  needsData?: boolean;
  Component: ComponentType<WidgetProps>;
}

const num = (o: WidgetProps["options"], key: string, fallback: number) =>
  typeof o[key] === "number" ? (o[key] as number) : Number(o[key] ?? fallback) || fallback;

/* ---------------- shared pieces ---------------- */

function Shell({ title, description, action, children }: { title: string; description?: string; action?: { to: string; label: string }; children: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-[1500px] px-3 py-8 sm:px-5 lg:px-8 lg:py-10">
      <SectionHeading eyebrow="ویجت" title={title} description={description} action={action} />
      {children}
    </section>
  );
}

function Grid({ items, cols = 4 }: { items: CatalogProduct[]; cols?: number }) {
  const cls =
    cols === 2
      ? "grid grid-cols-2 gap-3 sm:gap-4"
      : cols === 3
        ? "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3"
        : "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4";
  return (
    <div className={cls}>
      {items.map((p) => (
        <ProductCard key={p.id} product={p} />
      ))}
    </div>
  );
}

const byIds = (ids: string[]) => ids.map((id) => liveGetProduct(id)).filter((p): p is CatalogProduct => Boolean(p));

/* ---------------- catalogue ---------------- */

export const WIDGETS: WidgetDef[] = [
  /* ---------------------------------------------------------- home-top */
  {
    kind: "usp-bar",
    name: "نوار تعهدها",
    blurb: "ارسال، مرجوعی و پرداخت امن — همه از اعداد واقعی تنظیمات فروشگاه.",
    group: "اعتماد",
    zones: ["home-top", "home-bottom"],
    defaultTitle: "",
    Component: () => {
      const admin = useAdmin();
      const s = admin.settings;
      const facts = [
        {
          icon: <Truck className="h-4 w-4" />,
          text: s.freeShipping > 0 ? `ارسال رایگان بالای ${formatPrice(s.freeShipping)}` : `ارسال از ${formatPrice(s.expressCost)}`,
        },
        { icon: <Undo2 className="h-4 w-4" />, text: `مرجوعی تا ${s.returnDays.toLocaleString("fa-IR")} روز` },
        { icon: <ShieldCheck className="h-4 w-4" />, text: "پرداخت درگاه امن" },
      ].filter((f) => f.text);
      return (
        <section className="border-y border-black/[0.07] bg-[#efe8dd]">
          <ul className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-3 px-3 py-3 text-[11px] text-ink-70 sm:px-5 lg:px-8">
            {facts.map((f) => (
              <li key={f.text} className="flex items-center gap-2">
                {f.icon}
                {f.text}
              </li>
            ))}
          </ul>
        </section>
      );
    },
  },
  {
    kind: "store-counters",
    name: "شمارندهٔ فروشگاه",
    blurb: "تعداد محصول منتشرشده، دسته و استایل — از خود کاتالوگ شمرده می‌شود.",
    group: "اعتماد",
    zones: ["home-top", "home-middle", "home-bottom"],
    defaultTitle: "",
    Component: () => {
      const ops = useOps();
      const products = visibleProducts().length;
      const categories = ops.categories.filter((c) => c.active).length;
      const looks = LOOKS.length;
      const fa = (n: number) => n.toLocaleString("fa-IR");
      return (
        <div className="mx-auto grid w-full max-w-[1500px] grid-cols-3 gap-3 px-3 py-6 text-center sm:px-5 lg:px-8">
          {[
            { label: "قطعه در فروش", value: products },
            { label: "دسته", value: categories },
            { label: "استایل", value: looks },
          ].map((row) => (
            <div key={row.label} className="border border-black/[0.07] py-4">
              <p className="font-display text-[26px] leading-none">{fa(row.value)}</p>
              <p className="mt-1.5 text-[10.5px] text-ink-45">{row.label}</p>
            </div>
          ))}
        </div>
      );
    },
  },
  {
    kind: "quick-search",
    name: "جست‌وجوی سریع",
    blurb: "کادر جست‌وجو و میان‌بر دسته‌ها؛ بدون شمارش ساختگی و بدون پیشنهاد جعلی.",
    group: "کشف",
    zones: ["home-top", "home-middle"],
    defaultTitle: "دنبال چه می‌گردی؟",
    Component: ({ title }) => {
      const ops = useOps();
      const cats = ops.categories.filter((c) => c.active).sort((a, b) => a.order - b.order).slice(0, 6);
      return (
        <Shell title={title}>
          <form action="#" onSubmit={(e) => e.preventDefault()} className="flex flex-wrap gap-2">
            <input
              type="search"
              name="q"
              aria-label="جست‌وجوی محصول"
              placeholder="نام قطعه، رنگ یا دسته…"
              className="min-w-0 flex-1 border border-black/12 bg-transparent px-3 py-2.5 text-[12.5px] outline-none focus:border-ink/40"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const value = (e.target as HTMLInputElement).value.trim();
                  window.location.hash = value ? `#/products?q=${encodeURIComponent(value)}` : "#/products";
                }
              }}
            />
            <button type="submit" className="border border-ink bg-ink px-4 py-2.5 text-[11.5px] text-bone">
              جست‌وجو
            </button>
          </form>
          {cats.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {cats.map((c) => (
                <Link key={c.id} to={`/products?cat=${c.slug}`} className="border border-black/10 px-2.5 py-1 text-[10.5px] text-ink-70 hover:border-ink/40">
                  {c.name}
                </Link>
              ))}
            </div>
          )}
        </Shell>
      );
    },
  },
  {
    kind: "campaign-deadline",
    name: "شمارش معکوس کمپین",
    blurb: "فقط وقتی کمپینی با تاریخ پایان واقعی فعال است نمایش داده می‌شود.",
    group: "کمپین",
    zones: ["home-top", "home-middle"],
    defaultTitle: "کمپین جاری",
    needsData: true,
    Component: ({ title }) => {
      const admin = useAdmin();
      const now = Date.now();
      const live = admin.campaigns.find((c) => c.active && new Date(c.end).getTime() > now);
      if (!live) return null;
      const days = Math.ceil((new Date(live.end).getTime() - now) / 86400000);
      return (
        <Shell title={title} description={live.banner?.active && live.banner.text ? live.banner.text : undefined}>
          <div className="flex flex-wrap items-center justify-between gap-3 border border-ink/15 bg-[#efe8dd] px-4 py-3">
            <p className="text-[12.5px] font-medium">{live.name}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-ink-70">
              <Clock className="h-3.5 w-3.5" />
              {days.toLocaleString("fa-IR")} روز تا پایان
            </p>
          </div>
        </Shell>
      );
    },
  },

  /* ------------------------------------------------------- home-middle */
  {
    kind: "best-sellers",
    name: "پرفروش‌ها (از سفارش‌های واقعی)",
    blurb: "از تعداد فروخته‌شده در سفارش‌های ثبت‌شده حساب می‌شود؛ فروشگاه تازه، ویجت خالی.",
    group: "کاتالوگ",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "پرفروش‌ها",
    needsData: true,
    options: [{ key: "count", label: "تعداد", type: "number", default: 4 }],
    Component: ({ title, options }) => {
      const count = num(options, "count", 4);
      // orders never reach a shopper's browser, so the ranking comes from the
      // server as an aggregate (product id + units, no customer data)
      const { data } = useApiGet<{ items: { productId: string; sold: number }[] }>(`/api/public/best-sellers?limit=${count}`);
      const list = (data?.items ?? [])
        .map((row) => liveGetProduct(row.productId))
        .filter((p): p is CatalogProduct => Boolean(p))
        .slice(0, count);
      if (!list.length) return null;
      return (
        <Shell title={title} action={{ to: "/products", label: "همهٔ محصولات" }}>
          <Grid items={list} />
        </Shell>
      );
    },
  },
  {
    kind: "new-arrivals",
    name: "تازه رسیده‌ها",
    blurb: "آخرین محصولات منتشرشده به ترتیب ورود.",
    group: "کاتالوگ",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "تازه رسیده‌ها",
    options: [{ key: "count", label: "تعداد", type: "number", default: 4 }],
    Component: ({ title, options }) => {
      const list = newArrivals().slice(0, num(options, "count", 4));
      if (!list.length) return null;
      return (
        <Shell title={title} action={{ to: "/products?sort=newest", label: "همهٔ تازه‌ها" }}>
          <Grid items={list} />
        </Shell>
      );
    },
  },
  {
    kind: "on-sale",
    name: "تخفیف‌دارها",
    blurb: "قطعه‌هایی که قیمت قبل از تخفیف دارند و واقعاً ارزان‌تر شده‌اند.",
    group: "کاتالوگ",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "با تخفیف",
    options: [{ key: "count", label: "تعداد", type: "number", default: 4 }],
    Component: ({ title, options }) => {
      const list = visibleProducts()
        .filter((p) => typeof p.compareAt === "number" && p.compareAt > p.price)
        .sort((a, b) => (b.compareAt! - b.price) / b.compareAt! - (a.compareAt! - a.price) / a.compareAt!)
        .slice(0, num(options, "count", 4));
      if (!list.length) return null;
      return (
        <Shell title={title} action={{ to: "/products?sale=1", label: "همهٔ تخفیف‌ها" }}>
          <Grid items={list} />
        </Shell>
      );
    },
  },
  {
    kind: "last-units",
    name: "آخرین واحدها",
    blurb: "محصولاتی که موجودی کلشان سه عدد یا کمتر است — عدد واقعی انبار.",
    group: "کاتالوگ",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "آخرین واحدها",
    options: [{ key: "count", label: "تعداد", type: "number", default: 4 }],
    Component: ({ title, options }) => {
      const list = visibleProducts()
        .map((p) => ({ p, stock: totalStock(p) }))
        .filter((row) => row.stock > 0 && row.stock <= 3)
        .sort((a, b) => a.stock - b.stock)
        .slice(0, num(options, "count", 4))
        .map((row) => row.p);
      if (!list.length) return null;
      return (
        <Shell title={title} description="تعداد محدود، همان‌قدر که در انبار هست.">
          <Grid items={list} />
        </Shell>
      );
    },
  },
  {
    kind: "editor-picks",
    name: "پیشنهاد سردبیر",
    blurb: "همان قطعه‌هایی که خودت در پنل «ویژه» یا «پیشنهاد سردبیر» علامت زده‌ای.",
    group: "کاتالوگ",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "پیشنهاد سردبیر",
    options: [{ key: "count", label: "تعداد", type: "number", default: 4 }],
    Component: ({ title, options }) => {
      const admin = useAdmin();
      const list = visibleProducts()
        .filter((p) => p.badge === "پیشنهاد سردبیر" || admin.featured.includes(p.id))
        .slice(0, num(options, "count", 4));
      if (!list.length) return null;
      return (
        <Shell title={title} action={{ to: "/products", label: "همه" }}>
          <Grid items={list} />
        </Shell>
      );
    },
  },
  {
    kind: "category-tiles",
    name: "کاشی دسته‌ها",
    blurb: "دسته‌های فعال با تصویر شاخص خودشان؛ لینک به فهرست همان دسته.",
    group: "کشف",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "دسته‌بندی‌ها",
    options: [{ key: "count", label: "تعداد", type: "number", default: 6 }],
    Component: ({ title, options }) => {
      const ops = useOps();
      const cats = ops.categories
        .filter((c) => c.active)
        .sort((a, b) => a.order - b.order)
        .slice(0, num(options, "count", 6));
      if (!cats.length) return null;
      return (
        <Shell title={title}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {cats.map((c) => {
              const count = liveCatalog().filter((p) => p.category === c.name).length;
              return (
                <Link key={c.id} to={`/products?cat=${c.slug}`} className="group block border border-black/[0.07] bg-[#efe8dd]">
                  {c.thumbnail ? (
                    <img src={resolveImg(c.thumbnail)} alt={c.name} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="aspect-[4/3] w-full bg-[#e2d8c9]" />
                  )}
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-[12px] font-medium">{c.name}</span>
                    <span className="text-[10px] text-ink-45">{count.toLocaleString("fa-IR")} قطعه</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </Shell>
      );
    },
  },
  {
    kind: "looks-grid",
    name: "استایل‌ها",
    blurb: "استایل‌های منتشرشده با لینک صفحهٔ رانوی.",
    group: "کشف",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "استایل‌ها",
    options: [{ key: "count", label: "تعداد", type: "number", default: 3 }],
    Component: ({ title, options }) => {
      const admin = useAdmin();
      const ops = useOps();
      const looks = LOOKS.filter((l) => !admin.hiddenLooks.includes(l.id)).slice(0, num(options, "count", 3));
      if (!looks.length) return null;
      return (
        <Shell title={title} action={{ to: "/style", label: "همهٔ استایل‌ها" }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {looks.map((look) => (
              <Link key={look.id} to={`/style/${look.id}`} className="group block border border-black/[0.07]">
                <img src={ops.lookImages?.[look.id] ?? look.image} alt={look.name} className="aspect-[4/5] w-full object-cover" loading="lazy" />
                <div className="px-3 py-2">
                  <p className="text-[12px] font-medium">{look.name}</p>
                  <p className="mt-0.5 line-clamp-1 text-[10.5px] text-ink-45">{look.tagline}</p>
                </div>
              </Link>
            ))}
          </div>
        </Shell>
      );
    },
  },
  {
    kind: "journal-latest",
    name: "آخرین مقاله‌های ژورنال",
    blurb: "سه مقالهٔ آخر با عنوان و خلاصه؛ اگر ژورنال خاموش باشد نمایش داده نمی‌شود.",
    group: "محتوا",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "از ژورنال",
    options: [{ key: "count", label: "تعداد", type: "number", default: 3 }],
    Component: ({ title, options }) => {
      const ops = useOps();
      if (!ops.features.journal) return null;
      const posts = POSTS.slice(0, num(options, "count", 3));
      if (!posts.length) return null;
      return (
        <Shell title={title} action={{ to: "/journal", label: "همهٔ مقاله‌ها" }}>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {posts.map((post) => (
              <li key={post.slug}>
                <Link to={`/journal/${post.slug}`} className="group block border border-black/[0.07]">
                  <img src={post.image} alt={post.title} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                  <div className="px-3 py-2">
                    <p className="text-[10px] text-ink-45">
                      {post.category} · {post.readTime.toLocaleString("fa-IR")} دقیقه
                    </p>
                    <p className="mt-0.5 text-[12.5px] font-medium group-hover:text-ink-70">{post.title}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Shell>
      );
    },
  },
  {
    kind: "reviews-wall",
    name: "دیوار نظرات",
    blurb: "نظرهایی که خودت تأیید کرده‌ای — با نام مشتری و متن واقعی، بدون ستارهٔ ساختگی.",
    group: "اعتماد",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "مشتری‌ها چه می‌گویند",
    needsData: true,
    options: [{ key: "count", label: "تعداد", type: "number", default: 3 }],
    Component: ({ title, options }) => {
      const admin = useAdmin();
      const ops = useOps();
      if (!ops.features.reviews) return null;
      const list = admin.reviews.filter((r) => r.approved).slice(0, num(options, "count", 3));
      if (!list.length) return null;
      return (
        <Shell title={title}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {list.map((r) => (
              <figure key={r.id} className="border border-black/[0.07] p-4">
                <blockquote className="text-[12px] leading-[1.9] text-ink-70">«{r.text}»</blockquote>
                <figcaption className="mt-2 text-[10.5px] text-ink-45">
                  {r.author}
                  {r.product ? ` · ${r.product}` : ""}
                  {r.rating > 0 ? ` · ${r.rating.toLocaleString("fa-IR")} از ۵` : ""}
                </figcaption>
              </figure>
            ))}
          </div>
        </Shell>
      );
    },
  },
  {
    kind: "rating-summary",
    name: "میانگین امتیاز",
    blurb: "میانگین نظرهای ستاره‌دار تأییدشده؛ نظر بدون ستاره در میانگین نمی‌آید.",
    group: "اعتماد",
    zones: ["home-top", "home-middle", "home-bottom"],
    defaultTitle: "",
    needsData: true,
    Component: () => {
      const admin = useAdmin();
      const ops = useOps();
      if (!ops.features.reviews) return null;
      const rated = admin.reviews.filter((r) => r.approved && r.rating > 0);
      if (!rated.length) return null;
      const avg = rated.reduce((n, r) => n + r.rating, 0) / rated.length;
      return (
        <div className="mx-auto flex w-full max-w-[1500px] items-center gap-3 px-3 py-5 sm:px-5 lg:px-8">
          <div className="flex gap-0.5" aria-hidden>
            {[1, 2, 3, 4, 5].map((n) => (
              <span key={n} className={n <= Math.round(avg) ? "text-[#b08d57]" : "text-ink/20"}>★</span>
            ))}
          </div>
          <p className="text-[11.5px] text-ink-70">
            {avg.toFixed(1).replace(".", "٫")} از ۵ — از {rated.length.toLocaleString("fa-IR")} نظر تأییدشده
          </p>
        </div>
      );
    },
  },
  {
    kind: "wishlist-peek",
    name: "علاقه‌مندی‌های من",
    blurb: "قطعه‌هایی که همین بازدیدکننده قلب کرده است؛ برای کسی که چیزی ذخیره نکرده دیده نمی‌شود.",
    group: "شخصی",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "علاقه‌مندی‌های تو",
    needsData: true,
    options: [{ key: "count", label: "تعداد", type: "number", default: 4 }],
    Component: ({ title, options }) => {
      const cart = useCart();
      const ops = useOps();
      if (!ops.features.wishlist) return null;
      const list = byIds(cart.wishlist).slice(0, num(options, "count", 4));
      if (!list.length) return null;
      return (
        <Shell title={title} action={{ to: "/wishlist", label: "همهٔ علاقه‌مندی‌ها" }}>
          <Grid items={list} />
        </Shell>
      );
    },
  },
  {
    kind: "recently-viewed",
    name: "بازدیدهای اخیر",
    blurb: "از حافظهٔ همین مرورگر خوانده می‌شود؛ برای بازدیدکنندهٔ تازه خالی است.",
    group: "شخصی",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "اخیراً دیده‌ای",
    needsData: true,
    options: [{ key: "count", label: "تعداد", type: "number", default: 4 }],
    Component: ({ title, options }) => {
      const list = byIds(recentViews()).slice(0, num(options, "count", 4));
      if (!list.length) return null;
      return (
        <Shell title={title}>
          <Grid items={list} />
        </Shell>
      );
    },
  },
  {
    kind: "shipping-tiers",
    name: "روش‌های ارسال",
    blurb: "هزینهٔ پست عادی، پیشتاز و آستانهٔ ارسال رایگان — همان اعداد تنظیمات.",
    group: "اعتماد",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "ارسال",
    Component: ({ title }) => {
      const s = useAdmin().settings;
      const rows = [
        s.expressCost > 0 ? `پیشتاز: ${formatPrice(s.expressCost)}` : "",
        s.freeShipping > 0 ? `رایگان برای خرید بالای ${formatPrice(s.freeShipping)}` : "",
        `مرجوعی تا ${s.returnDays.toLocaleString("fa-IR")} روز`,
      ].filter(Boolean);
      if (!rows.length) return null;
      return (
        <Shell title={title}>
          <ul className="space-y-2 text-[12px] text-ink-70">
            {rows.map((row) => (
              <li key={row} className="flex items-center gap-2">
                <Truck className="h-3.5 w-3.5 text-ink-45" /> {row}
              </li>
            ))}
          </ul>
        </Shell>
      );
    },
  },
  {
    kind: "contact-card",
    name: "تماس و نشانی",
    blurb: "تلفن، ایمیل و نشانی از تنظیمات فروشگاه؛ فیلد خالی نمایش داده نمی‌شود.",
    group: "اعتماد",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "با ما در تماس باش",
    Component: ({ title }) => {
      const s = useAdmin().settings;
      const rows: { icon: ReactNode; text: string; href: string }[] = [];
      if (s.phone) rows.push({ icon: <Phone className="h-3.5 w-3.5" />, text: s.phone, href: `tel:${s.phone}` });
      if (s.email) rows.push({ icon: <Mail className="h-3.5 w-3.5" />, text: s.email, href: `mailto:${s.email}` });
      if (s.address) rows.push({ icon: <MapPin className="h-3.5 w-3.5" />, text: s.address, href: "" });
      if (!rows.length) return null;
      return (
        <Shell title={title}>
          <ul className="space-y-2 text-[12px]">
            {rows.map((row) => (
              <li key={row.text} className="flex items-start gap-2 text-ink-70">
                <span className="mt-0.5 text-ink-45">{row.icon}</span>
                {row.href ? (
                  <a href={row.href} className="hover:text-ink" dir={row.href.startsWith("tel") ? "ltr" : undefined}>
                    {row.text}
                  </a>
                ) : (
                  <span>{row.text}</span>
                )}
              </li>
            ))}
          </ul>
        </Shell>
      );
    },
  },
  {
    kind: "social-links",
    name: "شبکه‌های اجتماعی",
    blurb: "فقط شبکه‌هایی که نشانی‌شان در تنظیمات برند پر شده است.",
    group: "محتوا",
    zones: ["home-bottom"],
    defaultTitle: "ما را دنبال کن",
    Component: ({ title }) => {
      const brand = useOps().brand;
      const links = [
        { id: "instagram", label: "اینستاگرام", url: brand.socials.instagram },
        { id: "telegram", label: "تلگرام", url: brand.socials.telegram },
        { id: "whatsapp", label: "واتس‌اپ", url: brand.socials.whatsapp },
      ].filter((l) => (l.url ?? "").trim().length > 0);
      if (!links.length) return null;
      return (
        <Shell title={title}>
          <ul className="flex flex-wrap gap-2">
            {links.map((l) => (
              <li key={l.id}>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 border border-black/12 px-3 py-1.5 text-[11.5px] hover:border-ink/40"
                >
                  {l.label} <ArrowLeft className="h-3 w-3 -rotate-45" />
                </a>
              </li>
            ))}
          </ul>
        </Shell>
      );
    },
  },
  {
    kind: "brand-statement",
    name: "جملهٔ برند",
    blurb: "همان «یادداشت فوتر» که در برند نوشته‌ای، بزرگ‌تر و تنها.",
    group: "محتوا",
    zones: ["home-bottom"],
    defaultTitle: "",
    Component: () => {
      const brand = useOps().brand;
      if (!brand.footerNote?.trim()) return null;
      return (
        <section className="mx-auto w-full max-w-[1100px] px-3 py-10 text-center sm:px-5">
          <p className="font-display text-[clamp(1.1rem,2.4vw,1.6rem)] leading-[1.8] text-ink-70">{brand.footerNote}</p>
          <p className="mt-3 text-[10.5px] tracking-[0.18em] text-ink-45">{brand.logoText}</p>
        </section>
      );
    },
  },
  {
    kind: "category-links",
    name: "فهرست لینک دسته‌ها",
    blurb: "یک ردیف لینک ساده برای پایین صفحه؛ مناسب فوتر.",
    group: "کشف",
    zones: ["home-bottom"],
    defaultTitle: "دسته‌ها",
    Component: ({ title }) => {
      const cats = useOps().categories.filter((c) => c.active).sort((a, b) => a.order - b.order);
      if (!cats.length) return null;
      return (
        <section className="mx-auto w-full max-w-[1500px] px-3 py-6 sm:px-5 lg:px-8">
          <p className="text-[10.5px] tracking-[0.16em] text-ink-45">{title}</p>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
            {cats.map((c) => (
              <li key={c.id}>
                <Link to={`/products?cat=${c.slug}`} className="text-[12px] text-ink-70 hover:text-ink">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );
    },
  },

  /* ------------------------------------------------------ product-side */
  {
    kind: "complements",
    name: "کالاهای مکمل",
    blurb: "همان مکمل‌هایی که در فرم محصول برای این قطعه انتخاب کرده‌ای.",
    group: "محصول",
    zones: ["product-side"],
    defaultTitle: "با این قطعه ببین",
    needsData: true,
    options: [{ key: "count", label: "تعداد", type: "number", default: 4 }],
    Component: ({ title, productId, options }) => {
      const admin = useAdmin();
      if (!productId) return null;
      const list = byIds(admin.complements?.[productId] ?? []).slice(0, num(options, "count", 4));
      if (!list.length) return null;
      return (
        <Shell title={title}>
          <Grid items={list} />
        </Shell>
      );
    },
  },
  {
    kind: "same-category",
    name: "هم‌دسته",
    blurb: "قطعه‌های دیگر همان دسته، بدون تکرار خودِ محصول.",
    group: "محصول",
    zones: ["product-side", "article-side"],
    defaultTitle: "از همین دسته",
    options: [{ key: "count", label: "تعداد", type: "number", default: 4 }],
    Component: ({ title, options, productId }) => {
      const product = productId ? liveGetProduct(productId) : undefined;
      if (!product) return null;
      const list = visibleProducts()
        .filter((p) => p.category === product.category && p.id !== product.id)
        .slice(0, num(options, "count", 4));
      if (!list.length) return null;
      return (
        <Shell title={title}>
          <Grid items={list} />
        </Shell>
      );
    },
  },
  {
    kind: "product-reviews",
    name: "نظرهای همین محصول",
    blurb: "نظرهای تأییدشدهٔ همین قطعه با نام و متن واقعی.",
    group: "محصول",
    zones: ["product-side"],
    defaultTitle: "نظرها",
    needsData: true,
    options: [{ key: "count", label: "تعداد", type: "number", default: 3 }],
    Component: ({ title, productId, options }) => {
      const admin = useAdmin();
      const ops = useOps();
      if (!ops.features.reviews || !productId) return null;
      const product = liveGetProduct(productId);
      if (!product) return null;
      const list = admin.reviews.filter((r) => r.approved && r.product === product.name).slice(0, num(options, "count", 3));
      if (!list.length) return null;
      return (
        <Shell title={title}>
          <ul className="space-y-3">
            {list.map((r) => (
              <li key={r.id} className="border-b border-black/[0.07] pb-3 last:border-0">
                <p className="text-[12px] leading-[1.9] text-ink-70">{r.text}</p>
                <p className="mt-1 text-[10.5px] text-ink-45">
                  {r.author}
                  {r.rating > 0 ? ` · ${r.rating.toLocaleString("fa-IR")} از ۵` : " · بدون امتیاز"}
                </p>
              </li>
            ))}
          </ul>
        </Shell>
      );
    },
  },
  {
    kind: "variant-stock",
    name: "موجودی زندهٔ سایزها",
    blurb: "برای هر رنگ و سایز همین محصول، عدد واقعی انبار و صفر برای ناموجود.",
    group: "محصول",
    zones: ["product-side"],
    defaultTitle: "موجودی",
    needsData: true,
    Component: ({ title, productId }) => {
      const product = productId ? liveGetProduct(productId) : undefined;
      if (!product) return null;
      const rows = product.colors.map((color) => ({
        color,
        cells: product.sizes.map((size) => ({ size, qty: product.stock[`${color.id}:${size.id}`] ?? 0 })),
      }));
      if (!rows.length) return null;
      return (
        <Shell title={title}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-[11.5px]">
              <thead>
                <tr className="text-ink-45">
                  <th className="border-b border-black/10 px-2 py-2 text-start">رنگ</th>
                  {product.sizes.map((s) => (
                    <th key={s.id} className="border-b border-black/10 px-2 py-2">{s.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.color.id}>
                    <td className="border-b border-black/[0.06] px-2 py-2">{row.color.name}</td>
                    {row.cells.map((cell) => (
                      <td key={cell.size.id} className="border-b border-black/[0.06] px-2 py-2 text-center">
                        {cell.qty > 0 ? cell.qty.toLocaleString("fa-IR") : <span className="text-ink-45/70">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10.5px] text-ink-45">عددها همان لحظه از انبار خوانده می‌شوند؛ «—» یعنی ناموجود.</p>
        </Shell>
      );
    },
  },
  {
    kind: "size-table",
    name: "جدول اندازهٔ دسته",
    blurb: "جدولی که خودت برای این دسته در پنل ساخته‌ای (سینه، کمر، باسن).",
    group: "محصول",
    zones: ["product-side"],
    defaultTitle: "راهنمای اندازه",
    needsData: true,
    Component: ({ title, productId }) => {
      const ops = useOps();
      const product = productId ? liveGetProduct(productId) : undefined;
      const guide = product ? ops.sizeGuides[product.category] : undefined;
      if (!guide || !guide.rows.length) return null;
      return (
        <Shell title={title} description={guide.note || undefined}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-[11.5px]">
              <thead>
                <tr className="text-ink-45">
                  {["سایز", "سینه", "کمر", "باسن"].map((h) => (
                    <th key={h} className="border-b border-black/10 px-2 py-2 text-start">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {guide.rows.map((row) => (
                  <tr key={row.size}>
                    <td className="border-b border-black/[0.06] px-2 py-2">{row.size}</td>
                    <td className="border-b border-black/[0.06] px-2 py-2">{row.chest || "—"}</td>
                    <td className="border-b border-black/[0.06] px-2 py-2">{row.waist || "—"}</td>
                    <td className="border-b border-black/[0.06] px-2 py-2">{row.hips || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Shell>
      );
    },
  },
  {
    kind: "care-note",
    name: "جنس و نگهداری",
    blurb: "پارچه، جنس و دستور شست‌وشو از فیلدهای خود محصول.",
    group: "محصول",
    zones: ["product-side"],
    defaultTitle: "جنس و نگهداری",
    Component: ({ title, productId }) => {
      const product = productId ? liveGetProduct(productId) : undefined;
      if (!product) return null;
      const rows = [
        product.material ? { k: "پارچه", v: product.material } : null,
        product.care ? { k: "نگهداری", v: product.care } : null,
        product.fit ? { k: "فرم", v: product.fit } : null,
        product.origin ? { k: "ساخت", v: product.origin } : null,
      ].filter((r): r is { k: string; v: string } => Boolean(r));
      if (!rows.length) return null;
      return (
        <Shell title={title}>
          <dl className="grid grid-cols-1 gap-2 text-[12px] sm:grid-cols-2">
            {rows.map((row) => (
              <div key={row.k} className="border border-black/[0.07] px-3 py-2">
                <dt className="text-[10px] text-ink-45">{row.k}</dt>
                <dd className="mt-0.5 text-ink-70">{row.v}</dd>
              </div>
            ))}
          </dl>
        </Shell>
      );
    },
  },

  /* ------------------------------------------------------ article-side */
  {
    kind: "related-articles",
    name: "مقاله‌های هم‌موضوع",
    blurb: "مقاله‌های دیگر همان دسته، بدون تکرار مقالهٔ باز.",
    group: "محتوا",
    zones: ["article-side"],
    defaultTitle: "بیشتر بخوان",
    needsData: true,
    options: [{ key: "count", label: "تعداد", type: "number", default: 2 }],
    Component: ({ title, articleSlug, options }) => {
      const current = POSTS.find((p) => p.slug === articleSlug);
      if (!current) return null;
      const list = POSTS.filter((p) => p.slug !== current.slug && p.category === current.category).slice(0, num(options, "count", 2));
      if (!list.length) return null;
      return (
        <Shell title={title}>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {list.map((post) => (
              <li key={post.slug}>
                <Link to={`/journal/${post.slug}`} className="group flex gap-3 border border-black/[0.07] p-2">
                  <img src={post.image} alt={post.title} className="h-16 w-20 shrink-0 object-cover" loading="lazy" />
                  <div>
                    <p className="text-[12px] font-medium group-hover:text-ink-70">{post.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[10.5px] text-ink-45">{post.excerpt}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Shell>
      );
    },
  },
  {
    kind: "journal-index",
    name: "فهرست مقاله‌ها",
    blurb: "عنوان همهٔ مقاله‌ها با تاریخ و زمان خواندن؛ برای پایان مقاله.",
    group: "محتوا",
    zones: ["article-side", "home-bottom"],
    defaultTitle: "همهٔ مقاله‌ها",
    Component: ({ title }) => {
      const ops = useOps();
      if (!ops.features.journal) return null;
      return (
        <Shell title={title} action={{ to: "/journal", label: "صفحهٔ ژورنال" }}>
          <ul className="divide-y divide-black/[0.07]">
            {POSTS.map((post) => (
              <li key={post.slug}>
                <Link to={`/journal/${post.slug}`} className="flex items-baseline justify-between gap-3 py-2 text-[12px] hover:text-ink-70">
                  <span>{post.title}</span>
                  <span className="shrink-0 text-[10px] text-ink-45">{post.date}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Shell>
      );
    },
  },
  {
    kind: "article-picks",
    name: "قطعه‌های پیشنهادی برای مقاله",
    blurb: "پیشنهاد سردبیر برای خوانندهٔ مقاله — همان قطعه‌های علامت‌خوردهٔ پنل.",
    group: "محتوا",
    zones: ["article-side"],
    defaultTitle: "قطعه‌های مرتبط",
    options: [{ key: "count", label: "تعداد", type: "number", default: 3 }],
    Component: ({ title, options }) => {
      const admin = useAdmin();
      const list = visibleProducts()
        .filter((p) => p.badge === "پیشنهاد سردبیر" || admin.featured.includes(p.id))
        .slice(0, num(options, "count", 3));
      if (!list.length) return null;
      return (
        <Shell title={title}>
          <Grid items={list} cols={3} />
        </Shell>
      );
    },
  },
  {
    kind: "journal-quote",
    name: "جملهٔ برند در پایان مقاله",
    blurb: "همان یادداشت برند، کوچک‌تر، برای بستن متن.",
    group: "محتوا",
    zones: ["article-side"],
    defaultTitle: "",
    Component: () => {
      const brand = useOps().brand;
      if (!brand.footerNote?.trim()) return null;
      return (
        <section className="mx-auto w-full max-w-[900px] px-3 py-8 sm:px-5">
          <p className="flex items-start gap-2 text-[12px] leading-[2] text-ink-70">
            <Sparkles className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-45" />
            {brand.footerNote}
          </p>
        </section>
      );
    },
  },

  /* ------------------------------------------------------ batch 2 ---- */
  {
    kind: "newsletter",
    name: "خبرنامه",
    blurb: "فرم ایمیل که واقعاً ثبت می‌کند: نشانی در سرور ذخیره می‌شود و در پنل دیده می‌شود.",
    group: "کشف",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "اول از همه خبردار شو",
    Component: ({ title }) => {
      const [email, setEmail] = useState("");
      const [state, setState] = useState<{ busy: boolean; message?: string; ok?: boolean }>({ busy: false });
      const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) return;
        setState({ busy: true });
        try {
          const { api } = await import("@/lib/api");
          const res = await api.post<{ ok: boolean; already: boolean }>("/api/newsletter", { email: email.trim(), source: "widget" });
          setState({ busy: false, ok: true, message: res.already ? "این نشانی از قبل ثبت شده بود." : "ثبت شد؛ خبرهای تازه برایت می‌آید." });
          setEmail("");
        } catch {
          setState({ busy: false, ok: false, message: "ثبت نشد؛ اتصال را بررسی کن و دوباره بفرست." });
        }
      };
      return (
        <Shell title={title} description="فقط نشانی ایمیل؛ هر وقت خواستی از همان لینک پایین صفحه لغو می‌کنی.">
          <form onSubmit={submit} className="flex flex-wrap gap-2">
            <input
              type="email"
              required
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-label="نشانی ایمیل برای خبرنامه"
              className="min-w-0 flex-1 border border-black/12 bg-transparent px-3 py-2.5 text-[12.5px] outline-none focus:border-ink/40"
            />
            <button type="submit" disabled={state.busy} className="border border-ink bg-ink px-4 py-2.5 text-[11.5px] text-bone disabled:opacity-50">
              {state.busy ? "در حال ثبت…" : "عضو می‌شوم"}
            </button>
          </form>
          {state.message && (
            <p className={state.ok ? "mt-2 text-[11px] text-[#2f6f4e]" : "mt-2 text-[11px] text-ember"} role="status">
              {state.message}
            </p>
          )}
        </Shell>
      );
    },
  },
  {
    kind: "faq",
    name: "پرسش‌های متداول",
    blurb: "پرسش و پاسخ‌هایی که خودت در پنل نوشته‌ای؛ بدون متن نمونه.",
    group: "اعتماد",
    zones: ["home-middle", "home-bottom", "product-side"],
    defaultTitle: "پرسش‌های متداول",
    needsData: true,
    Component: ({ title }) => {
      const faqs = useOps().faqs ?? [];
      if (!faqs.length) return null;
      return (
        <Shell title={title}>
          <div className="divide-y divide-black/[0.07] border-y border-black/[0.07]">
            {faqs.map((f) => (
              <details key={f.id} className="group py-3">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[12.5px] font-medium">
                  {f.q}
                  <span className="text-ink-45 transition-transform group-open:rotate-45">＋</span>
                </summary>
                <p className="mt-2 text-[12px] leading-[1.95] text-ink-70">{f.a}</p>
              </details>
            ))}
          </div>
        </Shell>
      );
    },
  },
  {
    kind: "cart-complements",
    name: "کامل‌کنندهٔ سبد",
    blurb: "بر اساس همین سبد، کالاهای مکملی که خودت برای آن قطعه‌ها تعیین کرده‌ای.",
    group: "کشف",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "سبدت را کامل کن",
    needsData: true,
    options: [{ key: "count", label: "تعداد", type: "number", default: 4 }],
    Component: ({ title, options }) => {
      const admin = useAdmin();
      const cart = useCart();
      const inCart = new Set(cart.lines.map((line) => line.productId));
      const ids = [...new Set(cart.lines.flatMap((line) => admin.complements?.[line.productId] ?? []))].filter((id) => !inCart.has(id));
      const list = byIds(ids).slice(0, num(options, "count", 4));
      if (!list.length) return null;
      return (
        <Shell title={title}>
          <Grid items={list} />
        </Shell>
      );
    },
  },
  {
    kind: "free-shipping-progress",
    name: "نوار ارسال رایگان",
    blurb: "از جمع سبد و آستانهٔ تنظیمات حساب می‌شود؛ برای هر بازدیدکننده عدد واقعی خودش.",
    group: "اعتماد",
    zones: ["home-top", "home-middle", "home-bottom"],
    defaultTitle: "",
    Component: () => {
      const admin = useAdmin();
      const cart = useCart();
      const threshold = admin.settings.freeShipping;
      if (!threshold || threshold <= 0) return null;
      const remaining = Math.max(0, threshold - cart.subtotal);
      return (
        <section className="border-y border-black/[0.07] bg-[#efe8dd]">
          <div className="mx-auto w-full max-w-[1500px] px-3 py-2.5 text-[11.5px] text-ink-70 sm:px-5 lg:px-8">
            {cart.lines.length === 0
              ? `ارسال رایگان برای خرید بالای ${formatPrice(threshold)}`
              : remaining > 0
                ? `${formatPrice(remaining)} تا ارسال رایگان مانده`
                : "سبدت ارسال رایگان دارد"}
          </div>
        </section>
      );
    },
  },
  {
    kind: "store-hours",
    name: "ساعت کاری",
    blurb: "ساعت‌هایی که خودت در تنظیمات ویجت می‌نویسی، هر خط با | جدا شود.",
    group: "اعتماد",
    zones: ["home-bottom", "product-side"],
    defaultTitle: "ساعت کاری",
    options: [
      {
        key: "lines",
        label: "ساعت‌ها (با | جدا کن)",
        type: "text",
        default: "",
        hint: "مثال: شنبه تا چهارشنبه ۱۰ تا ۱۹ | پنجشنبه ۱۰ تا ۱۴ | جمعه تعطیل",
      },
    ],
    Component: ({ title, options }) => {
      const raw = String(options.lines ?? "");
      const lines = raw.split("|").map((v) => v.trim()).filter(Boolean);
      if (!lines.length) return null;
      return (
        <Shell title={title}>
          <ul className="space-y-1.5 text-[12px] text-ink-70">
            {lines.map((line) => (
              <li key={line} className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-ink-45" />
                {line}
              </li>
            ))}
          </ul>
        </Shell>
      );
    },
  },
  {
    kind: "map-link",
    name: "نشانی و مسیریابی",
    blurb: "نشانی از تنظیمات فروشگاه و یک لینک مسیریابی؛ بدون iframe و ردیاب بیرونی.",
    group: "اعتماد",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "کجا هستیم",
    Component: ({ title }) => {
      const address = useAdmin().settings.address;
      if (!address?.trim()) return null;
      return (
        <Shell title={title}>
          <p className="flex items-start gap-2 text-[12px] leading-[1.9] text-ink-70">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-45" />
            {address}
          </p>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-flex items-center gap-1.5 text-[11.5px] text-ink underline decoration-ink/30 underline-offset-4"
          >
            مسیریابی در نقشه <ArrowLeft className="h-3 w-3 -rotate-45" />
          </a>
        </Shell>
      );
    },
  },
  {
    kind: "product-view-count",
    name: "تعداد بازدید محصول",
    blurb: "از شمارش اول‌طرف صفحه‌ها؛ اگر هنوز بازدیدی ثبت نشده باشد نمایش داده نمی‌شود.",
    group: "محصول",
    zones: ["product-side"],
    defaultTitle: "",
    needsData: true,
    Component: ({ productId }) => {
      const { data } = useApiGet<{ views: number }>(productId ? `/api/public/product-views/${productId}` : null);
      const views = data?.views ?? 0;
      if (views < 1) return null;
      return (
        <p className="mx-auto w-full max-w-[1500px] px-3 py-2 text-[10.5px] text-ink-45 sm:px-5 lg:px-8">
          این صفحه {views.toLocaleString("fa-IR")} بار باز شده است.
        </p>
      );
    },
  },
  {
    kind: "campaign-products",
    name: "قطعه‌های کمپین",
    blurb: "محصولاتی که در دامنهٔ یک کمپین فعال قرار می‌گیرند؛ کمپین «کل فروشگاه» نمایش داده نمی‌شود.",
    group: "کمپین",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "قطعه‌های کمپین",
    needsData: true,
    options: [{ key: "count", label: "تعداد", type: "number", default: 4 }],
    Component: ({ title, options }) => {
      const admin = useAdmin();
      const now = Date.now();
      const live = admin.campaigns.filter((c) => c.active && new Date(c.end).getTime() > now && c.scope !== "all");
      if (!live.length) return null;
      const inScope = (p: CatalogProduct) =>
        live.some((c) =>
          c.scope === "category" ? p.category === c.scopeId || p.category === admin.settings.name : p.lookId === c.scopeId,
        );
      const list = visibleProducts().filter(inScope).slice(0, num(options, "count", 4));
      if (!list.length) return null;
      return (
        <Shell title={title} description={live.map((c) => c.name).join(" · ")}>
          <Grid items={list} />
        </Shell>
      );
    },
  },
  {
    kind: "best-rated",
    name: "بهترین امتیازها",
    blurb: "محصولاتی که میانگین نظرهای ستاره‌دارشان ۴ یا بیشتر است.",
    group: "اعتماد",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "بالاترین امتیاز",
    needsData: true,
    options: [{ key: "count", label: "تعداد", type: "number", default: 4 }],
    Component: ({ title, options }) => {
      const admin = useAdmin();
      const ops = useOps();
      if (!ops.features.reviews) return null;
      const byProduct = new Map<string, { sum: number; n: number }>();
      for (const review of admin.reviews) {
        if (!review.approved || review.rating <= 0) continue;
        const cur = byProduct.get(review.product) ?? { sum: 0, n: 0 };
        cur.sum += review.rating;
        cur.n += 1;
        byProduct.set(review.product, cur);
      }
      const list = [...byProduct.entries()]
        .map(([name, agg]) => ({ name, avg: agg.sum / agg.n, n: agg.n }))
        .filter((row) => row.avg >= 4)
        .sort((a, b) => b.avg - a.avg || b.n - a.n)
        .map((row) => liveCatalog().find((p) => p.name === row.name))
        .filter((p): p is CatalogProduct => Boolean(p))
        .slice(0, num(options, "count", 4));
      if (!list.length) return null;
      return (
        <Shell title={title}>
          <Grid items={list} />
        </Shell>
      );
    },
  },
  {
    kind: "look-products",
    name: "قطعه‌های یک استایل",
    blurb: "یک استایل را انتخاب کن؛ محصولات همان استایل نمایش داده می‌شوند.",
    group: "کشف",
    zones: ["home-middle", "home-bottom", "product-side"],
    defaultTitle: "از این استایل",
    needsData: true,
    options: [
      { key: "look", label: "استایل", type: "select", choicesSource: "looks", default: LOOKS[0]?.id ?? "" },
      { key: "count", label: "تعداد", type: "number", default: 4 },
    ],
    Component: ({ title, options }) => {
      const lookId = String(options.look ?? "");
      const list = liveCatalog().filter((p) => p.lookId === lookId).slice(0, num(options, "count", 4));
      if (!list.length) return null;
      return (
        <Shell title={title} action={{ to: `/style/${lookId}`, label: "صفحهٔ استایل" }}>
          <Grid items={list} />
        </Shell>
      );
    },
  },
  {
    kind: "article-toc",
    name: "فهرست مطالب مقاله",
    blurb: "از تیترهای همان مقاله ساخته می‌شود؛ مقالهٔ بدون تیتر فهرست ندارد.",
    group: "محتوا",
    zones: ["article-side"],
    defaultTitle: "در این مقاله",
    needsData: true,
    Component: ({ title, articleSlug }) => {
      const post = POSTS.find((p) => p.slug === articleSlug);
      const headings = (post?.blocks ?? []).filter((b) => b.type === "h" && b.text.trim());
      if (headings.length < 2) return null;
      return (
        <Shell title={title}>
          <ol className="list-decimal space-y-1.5 ps-5 text-[12px] text-ink-70">
            {headings.map((h, i) => (
              <li key={`${h.text}-${i}`}>{h.text}</li>
            ))}
          </ol>
        </Shell>
      );
    },
  },
  {
    kind: "journal-categories",
    name: "دسته‌های ژورنال",
    blurb: "شمار مقاله‌های هر دسته، از خود ژورنال شمرده می‌شود.",
    group: "محتوا",
    zones: ["article-side", "home-bottom"],
    defaultTitle: "موضوع‌ها",
    Component: ({ title }) => {
      const ops = useOps();
      if (!ops.features.journal) return null;
      const counts = new Map<string, number>();
      for (const post of POSTS) counts.set(post.category, (counts.get(post.category) ?? 0) + 1);
      if (!counts.size) return null;
      return (
        <Shell title={title}>
          <ul className="flex flex-wrap gap-1.5">
            {[...counts.entries()].map(([category, count]) => (
              <li key={category} className="border border-black/10 px-2.5 py-1 text-[10.5px] text-ink-70">
                {category} · {count.toLocaleString("fa-IR")}
              </li>
            ))}
          </ul>
        </Shell>
      );
    },
  },
  {
    kind: "product-badges",
    name: "وضعیت این قطعه",
    blurb: "برچسب، درصد تخفیف واقعی و موجودی کم — هر کدام که راست باشد.",
    group: "محصول",
    zones: ["product-side"],
    defaultTitle: "",
    Component: ({ productId }) => {
      const product = productId ? liveGetProduct(productId) : undefined;
      if (!product) return null;
      const chips: { text: string; tone: "ink" | "ember" }[] = [];
      if (product.badge) chips.push({ text: product.badge, tone: "ink" });
      if (typeof product.compareAt === "number" && product.compareAt > product.price) {
        const pct = Math.round(((product.compareAt - product.price) / product.compareAt) * 100);
        if (pct > 0) chips.push({ text: `${pct.toLocaleString("fa-IR")}٪ تخفیف`, tone: "ember" });
      }
      const stock = totalStock(product);
      if (stock > 0 && stock <= 3) chips.push({ text: `فقط ${stock.toLocaleString("fa-IR")} عدد مانده`, tone: "ember" });
      if (!chips.length) return null;
      return (
        <div className="mx-auto flex w-full max-w-[1500px] flex-wrap gap-1.5 px-3 py-3 sm:px-5 lg:px-8">
          {chips.map((chip) => (
            <span
              key={chip.text}
              className={
                chip.tone === "ember"
                  ? "border border-ember/30 bg-ember/[0.06] px-2 py-0.5 text-[10px] text-ember"
                  : "border border-black/12 px-2 py-0.5 text-[10px] text-ink-70"
              }
            >
              {chip.text}
            </span>
          ))}
        </div>
      );
    },
  },
  {
    kind: "product-share",
    name: "اشتراک‌گذاری محصول",
    blurb: "یک دکمه که نشانی همین صفحه را کپی می‌کند؛ بدون شمارش اشتراک ساختگی.",
    group: "محصول",
    zones: ["product-side"],
    defaultTitle: "",
    Component: () => {
      const cart = useCart();
      const [copied, setCopied] = useState(false);
      return (
        <div className="mx-auto w-full max-w-[1500px] px-3 pb-2 sm:px-5 lg:px-8">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 border border-black/12 px-3 py-1.5 text-[11px] text-ink-70 hover:border-ink/40"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
              } catch {
                cart.notify("کپی نشد", "نشانی را از نوار مرورگر بردار.");
              }
            }}
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "نشانی کپی شد" : "کپی نشانی این صفحه"}
          </button>
        </div>
      );
    },
  },
  {
    kind: "cart-mini",
    name: "خلاصهٔ سبد",
    blurb: "تعداد و جمع سبد همین بازدیدکننده؛ سبد خالی نمایش داده نمی‌شود.",
    group: "شخصی",
    zones: ["home-top", "home-middle"],
    defaultTitle: "",
    needsData: true,
    Component: () => {
      const cart = useCart();
      if (!cart.lines.length) return null;
      return (
        <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center justify-between gap-3 px-3 py-3 sm:px-5 lg:px-8">
          <p className="text-[11.5px] text-ink-70">
            {cart.count.toLocaleString("fa-IR")} قطعه در سبد · {formatPrice(cart.subtotal)}
          </p>
          <button type="button" className="border border-ink px-3 py-1.5 text-[11px] text-ink" onClick={() => cart.setCartOpen(true)}>
            دیدن سبد
          </button>
        </div>
      );
    },
  },
  {
    kind: "payment-methods",
    name: "روش‌های پرداخت",
    blurb: "از تنظیمات واقعی تجارت: پرداخت آنلاین، و اقساط فقط اگر ارائه‌دهنده آماده باشد.",
    group: "اعتماد",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "پرداخت",
    Component: ({ title }) => {
      const { data } = useApiGet<{ bnpl4?: { availableForCheckout?: boolean; installments?: number } }>("/api/commerce/config");
      const rows = ["پرداخت آنلاین از درگاه امن"];
      if (data?.bnpl4?.availableForCheckout) rows.push(`پرداخت ${(data.bnpl4.installments ?? 4).toLocaleString("fa-IR")} قسطی`);
      return (
        <Shell title={title}>
          <ul className="space-y-1.5 text-[12px] text-ink-70">
            {rows.map((row) => (
              <li key={row} className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-ink-45" />
                {row}
              </li>
            ))}
          </ul>
        </Shell>
      );
    },
  },
  {
    kind: "journal-featured",
    name: "مقالهٔ ویژه",
    blurb: "مقاله‌ای که خودت «ویژه» علامت زده‌ای؛ یکی، بزرگ.",
    group: "محتوا",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "مقالهٔ ویژه",
    needsData: true,
    Component: ({ title }) => {
      const post = POSTS.find((p) => p.featured);
      if (!post) return null;
      return (
        <Shell title={title} action={{ to: `/journal/${post.slug}`, label: "خواندن مقاله" }}>
          <Link to={`/journal/${post.slug}`} className="group grid gap-3 border border-black/[0.07] sm:grid-cols-[1.1fr_1fr]">
            <img src={post.image} alt={post.title} className="aspect-[16/10] w-full object-cover" loading="lazy" />
            <div className="p-4">
              <p className="text-[10px] text-ink-45">
                {post.category} · {post.readTime.toLocaleString("fa-IR")} دقیقه
              </p>
              <h3 className="mt-1 font-display text-[clamp(1.1rem,2vw,1.5rem)] leading-[1.5] group-hover:text-ink-70">{post.title}</h3>
              <p className="mt-2 text-[12px] leading-[1.95] text-ink-70">{post.excerpt}</p>
            </div>
          </Link>
        </Shell>
      );
    },
  },
  {
    kind: "category-spotlight",
    name: "دستهٔ ویژه",
    blurb: "یک دسته را انتخاب کن؛ چهار قطعهٔ اول همان دسته بزرگ‌تر نمایش داده می‌شوند.",
    group: "کشف",
    zones: ["home-middle", "home-bottom"],
    defaultTitle: "این هفته از این دسته",
    needsData: true,
    options: [
      { key: "category", label: "دسته", type: "select", choicesSource: "categories", default: "" },
      { key: "count", label: "تعداد", type: "number", default: 4 },
    ],
    Component: ({ title, options }) => {
      const ops = useOps();
      const slug = String(options.category ?? "");
      const category = ops.categories.find((c) => c.slug === slug || c.name === slug);
      if (!category) return null;
      const list = visibleProducts().filter((p) => p.category === category.name).slice(0, num(options, "count", 4));
      if (!list.length) return null;
      return (
        <Shell title={title} action={{ to: `/products?cat=${category.slug}`, label: `همهٔ ${category.name}` }}>
          <Grid items={list} />
        </Shell>
      );
    },
  },
  {
    kind: "top-categories",
    name: "دسته‌های پرجمعیت",
    blurb: "دسته‌ها به ترتیب تعداد قطعه‌های واقعی‌شان، با همان عدد.",
    group: "کشف",
    zones: ["home-bottom", "home-middle"],
    defaultTitle: "کجا چه داریم",
    Component: ({ title }) => {
      const ops = useOps();
      const products = visibleProducts();
      const rows = ops.categories
        .filter((c) => c.active)
        .map((c) => ({ category: c, count: products.filter((p) => p.category === c.name).length }))
        .filter((row) => row.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);
      if (!rows.length) return null;
      return (
        <Shell title={title}>
          <ul className="divide-y divide-black/[0.07]">
            {rows.map((row) => (
              <li key={row.category.id}>
                <Link to={`/products?cat=${row.category.slug}`} className="flex items-center justify-between py-2 text-[12px] hover:text-ink-70">
                  <span>{row.category.name}</span>
                  <span className="text-[10.5px] text-ink-45">{row.count.toLocaleString("fa-IR")} قطعه</span>
                </Link>
              </li>
            ))}
          </ul>
        </Shell>
      );
    },
  },
  {
    kind: "product-video",
    name: "ویدیوی محصول",
    blurb: "همان کلیپی که در فرم محصول برای این قطعه گذاشته‌ای؛ بدون کلیپ، دیده نمی‌شود.",
    group: "محصول",
    zones: ["product-side"],
    defaultTitle: "در حرکت",
    needsData: true,
    Component: ({ title, productId }) => {
      const ops = useOps();
      const video = productId ? ops.productVideos?.[productId] : "";
      if (!video) return null;
      return (
        <Shell title={title}>
          <video src={video} controls playsInline preload="metadata" className="w-full max-w-[640px] border border-black/[0.07]" />
        </Shell>
      );
    },
  },
];

export const widgetDef = (kind: string) => WIDGETS.find((w) => w.kind === kind);

export const widgetsForZone = (list: WidgetInstance[], zone: WidgetZone) =>
  list.filter((w) => w.active && w.zone === zone && Boolean(widgetDef(w.kind)));
