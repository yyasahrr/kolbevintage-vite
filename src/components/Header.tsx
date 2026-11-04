import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ChevronDown, Heart, LayoutTemplate, Menu, Search, ShieldCheck, ShoppingBag, Sparkles, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { useCart } from "@/state/cart";
import { COLLECTIONS, liveCatalog, productsInCollection } from "@/data/catalog";
import { formatPrice } from "@/data/looks";
import { ProductThumb } from "./ProductThumb";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { useTheme } from "@/theme/ThemeProvider";
import { useAuth } from "@/state/auth";
import { useOps } from "@/state/ops";
import { useAdmin } from "@/state/admin";
import { useEscape, useScrollLock } from "@/hooks/useOverlay";
import { UserRound } from "lucide-react";

const NAV = [
  { to: "/products", label: "فروشگاه" },
  { to: "/style", label: "خرید بر اساس استایل" },
  { to: "/style-builder", label: "استایل بیلدر" },
  { to: "/journal", label: "ژورنال" },
];

export function Header() {
  const { count, setCartOpen, wishlist } = useCart();
  const { brand, megaMenus } = useOps();
  const mega = megaMenus.find((m) => m.active);
  const { account } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-black/[0.07] bg-bone/85 backdrop-blur-xl">
        <div className="border-b border-black/[0.05] bg-ink text-bone">
          <div className="mx-auto flex h-7 max-w-[1500px] items-center justify-center gap-3 px-4 sm:justify-between sm:px-6 lg:px-10">
            {brand.announcementActive && <p className="text-[9.5px] text-bone/65">{brand.announcement}</p>}
            <a href="#/account" className="hidden text-[9.5px] text-bone/45 hover:text-bone/80 sm:block">حساب من · پیگیری سفارش</a>
          </div>
        </div>

        <div className="mx-auto flex h-[58px] max-w-[1500px] items-center justify-between gap-3 px-4 sm:px-6 lg:h-[66px] lg:px-10">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="باز کردن منو"
            aria-expanded={menuOpen}
            className="tap -mr-1 flex h-9 w-9 items-center justify-center rounded-full text-ink-70 transition-colors hover:bg-ink/5 hover:text-ink xl:hidden"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>

          <nav aria-label="منوی اصلی" className="hidden flex-1 items-center gap-4 xl:flex xl:gap-6">
            {NAV.map((item) =>
              item.to === "/products" ? (
                <div key={item.to} className="group relative">
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "relative flex items-center gap-1 py-2 text-[11px] transition-colors",
                        isActive || location.pathname.startsWith("/product") ? "text-ink" : "text-ink-70 hover:text-ink",
                      )
                    }
                  >
                    {item.label}
                    <ChevronDown className="h-3 w-3 transition-transform group-hover:rotate-180" />
                    <span className="absolute inset-x-0 -bottom-0.5 h-px origin-right scale-x-0 bg-ink transition-transform duration-300 group-hover:scale-x-100" />
                  </NavLink>
                  <div className="pointer-events-none invisible absolute top-full right-0 z-50 w-[38rem] translate-y-2 pt-3 opacity-0 transition-all duration-250 group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                    <div className="grid grid-cols-2 gap-6 rounded-2xl border border-black/[0.07] bg-paper p-5 shadow-[0_28px_60px_-24px_rgba(22,19,15,0.4)]">
                      {mega && mega.columns.map((col) => (
                        <div key={col.title}>
                          <p className="mb-2.5 text-[9.5px] text-ink-45">{col.title}</p>
                          <ul className="space-y-1">
                            {col.links.map((ln) => (
                              <li key={ln.href + ln.label}>
                                <Link to={ln.href} className="block rounded-lg px-2 py-1.5 text-[11.5px] text-ink-70 transition-colors hover:bg-ink/[0.04] hover:text-ink">{ln.label}</Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                      <div>
                        <p className="mb-2.5 text-[9.5px] text-ink-45">دسته‌بندی‌ها</p>
                        {!mega && (<ul className="space-y-1">
                          {COLLECTIONS.map((c) => (
                            <li key={c.id}>
                              <Link
                                to={`/products?collection=${c.id}`}
                                className="flex items-center justify-between rounded-lg px-2 py-1.5 text-[11.5px] text-ink-70 transition-colors hover:bg-ink/[0.04] hover:text-ink"
                              >
                                {c.label}
                                <span className="text-[9.5px] text-ink-45">
                                  {productsInCollection(c.id).length}
                                </span>
                              </Link>
                            </li>
                          ))}
                        </ul>)}
                      </div>
                      <div className="flex flex-col justify-between gap-4 rounded-xl bg-[#f1ebe2] p-3">
                        <div>
                          <p className="text-[9.5px] text-ink-45">ویترین</p>
                          <p className="mt-1 font-display text-[16px] leading-snug font-medium text-ink">{mega?.cta.title ?? "خرید بر اساس استایل"}</p>
                          <p className="mt-1 text-[10.5px] leading-relaxed text-ink-70">{mega?.cta.text ?? "شش استایل کامل روی رانو؛ قطعه‌ها را تکی یا یک‌جا بردار."}</p>
                        </div>
                        <Link to={mega?.cta.href ?? "/style"} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink">
                          {mega?.cta.href ? "مشاهده" : "ورود به رانو"} <ArrowLeft className="h-3 w-3" />
                        </Link>
                      </div>
                      <div className="col-span-2 flex divide-x divide-black/[0.06] border-t border-black/[0.06] pt-3 text-[10.5px] text-ink-45 [direction:rtl]">
                        <Link to="/products?sort=newest" className="flex-1 px-2 transition-colors hover:text-ink">
                          تازه‌های فصل
                        </Link>
                        <Link to="/products?sort=price-asc" className="flex-1 px-2 transition-colors hover:text-ink">
                          از ارزان‌ترین
                        </Link>
                        <Link to="/products?collection=bags" className="flex-1 px-2 transition-colors hover:text-ink">
                          کیف و اکسسوری
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "group relative py-2 text-[11px] transition-colors",
                      isActive ? "text-ink" : "text-ink-70 hover:text-ink",
                    )
                  }
                >
                  {item.label}
                  <span className="absolute inset-x-0 -bottom-0.5 h-px origin-right scale-x-0 bg-ink transition-transform duration-300 group-hover:scale-x-100" />
                </NavLink>
              ),
            )}
          </nav>

          <Link to="/" className="flex items-center gap-2" aria-label={brand.name + " — خانه"}>
            {brand.logoImage ? (
              <img src={brand.logoImage} alt={brand.name} className="h-8 w-auto max-w-[130px] object-contain lg:h-9" />
            ) : (
              <span className="latin-track font-latin text-[21px] leading-none tracking-brand text-ink lg:text-[25px]">{brand.logoText}</span>
            )}
          </Link>

          <div className="flex flex-1 items-center justify-end gap-0.5 sm:gap-1.5">
            <Link
              to={account ? "/account" : "/auth"}
              aria-label={account ? "حساب من" : "ورود / ثبت‌نام"}
              title={account ? "حساب من" : "ورود / ثبت‌نام"}
              className="flex h-9 items-center gap-1.5 rounded-full border border-black/10 bg-white/50 px-2.5 text-ink transition-all duration-250 hover:border-ink hover:bg-ink hover:text-bone"
            >
              <UserRound className="h-[15px] w-[15px]" />
              <span className="hidden text-[11px] font-medium xl:inline">{account ? account.name.split(" ")[0] : "ورود"}</span>
            </Link>
            <ThemeSwitcher />
            <button type="button" onClick={() => setSearchOpen(true)}
              aria-label="جست‌وجو در فروشگاه"
              className="tap hidden h-9 w-9 items-center justify-center rounded-full text-ink-70 transition-colors hover:bg-ink/5 hover:text-ink sm:flex"
            >
              <Search className="h-[17px] w-[17px]" />
            </button>
            <Link
              to="/wishlist"
              aria-label={`علاقه‌مندی‌ها، ${wishlist.length} قطعه`}
              className="tap relative hidden h-9 w-9 items-center justify-center rounded-full text-ink-70 transition-colors hover:bg-ink/5 hover:text-ink sm:flex"
            >
              <Heart className="h-[17px] w-[17px]" />
              {wishlist.length > 0 && (
                <span className="absolute top-0.5 right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-ember px-0.5 text-[8.5px] text-white">
                  {wishlist.length.toLocaleString("fa-IR")}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              aria-label={`باز کردن سبد خرید، ${count} قلم`}
              className="flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-full border border-black/10 bg-white/50 px-2.5 text-ink transition-all duration-250 hover:border-ink hover:bg-ink hover:text-bone"
            >
              <ShoppingBag className="h-[15px] w-[15px]" />
              <span className="min-w-[0.8rem] text-[12px] leading-none font-medium tabular-nums">
                {count.toLocaleString("fa-IR")}
              </span>
            </button>
          </div>
        </div>
      </header>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} onSearch={() => setSearchOpen(true)} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* search                                                              */
/* ------------------------------------------------------------------ */

function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useAdmin();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 80);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return liveCatalog().filter((p) =>
      [p.name, p.category, p.lookName, ...p.colors.map((c) => c.name)].some((v) => v.includes(q)),
    ).slice(0, 5);
  }, [query]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/products?q=${encodeURIComponent(query.trim())}`);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[65]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink/45 backdrop-blur-sm"
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="جست‌وجو"
            initial={{ y: -24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 0.61, 0.24, 1] }}
            className="relative mx-auto mt-[76px] w-[min(46rem,calc(100%-2rem))] overflow-hidden rounded-2xl border border-black/[0.08] bg-paper shadow-2xl"
          >
            <form onSubmit={submit} className="flex items-center gap-3 border-b border-black/[0.07] px-4 py-3.5">
              <Search className="h-4 w-4 shrink-0 text-ink-45" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="نام محصول، دسته‌بندی یا رنگ…"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-45"
              />
              <button type="submit" className="rounded-full bg-ink px-4 py-1.5 text-[11px] text-bone">
                جست‌وجو
              </button>
              <button type="button" onClick={onClose} aria-label="بستن جست‌وجو" className="p-1 text-ink-45 hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </form>
            <div className="max-h-[60vh] overflow-y-auto p-3">
              {!query.trim() ? (
                <div className="px-2 py-2">
                  <p className="text-[10px] text-ink-45">جست‌وجوهای پرتکرار</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {["پالتو", "بافت کشمیر", "شلوار پشمی", "کیف چرمی", "کفش"].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setQuery(s)}
                        className="rounded-full border border-black/10 px-3 py-1.5 text-[11px] text-ink-70 transition-colors hover:border-ink/40 hover:text-ink"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : results.length === 0 ? (
                <p className="px-2 py-8 text-center text-[12px] text-ink-45">چیزی پیدا نشد. واژهٔ دیگری را امتحان کن.</p>
              ) : (
                <ul className="space-y-1">
                  {results.map((p) => (
                    <li key={p.id}>
                      <Link
                        to={`/product/${p.id}`}
                        onClick={onClose}
                        className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-ink/[0.04]"
                      >
                        <ProductThumb product={p} className="w-11" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] font-medium text-ink">{p.name}</span>
                          <span className="mt-0.5 block text-[10px] text-ink-45">
                            {p.category} · استایل {p.lookName}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11.5px] text-ink">{formatPrice(p.price)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {query.trim() && (
                <Link
                  to={`/products?q=${encodeURIComponent(query.trim())}`}
                  onClick={onClose}
                  className="mt-2 flex items-center justify-center gap-1.5 rounded-xl border border-black/[0.08] py-2.5 text-[11.5px] text-ink transition-colors hover:bg-ink/[0.04]"
                >
                  مشاهدهٔ همهٔ نتایج <ArrowLeft className="h-3 w-3" />
                </Link>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------------------------------------------ */
/* mobile menu                                                         */
/* ------------------------------------------------------------------ */

function MobileMenu({ open, onClose, onSearch }: { open: boolean; onClose: () => void; onSearch: () => void }) {
  const { themes, theme: activeTheme, setTheme } = useTheme();
  const { wishlist } = useCart();
  const { account } = useAuth();
  const { settings } = useAdmin();
  useEscape(open, onClose);
  useScrollLock(open);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[66] xl:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink/45"
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="منو"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.38, ease: [0.22, 0.61, 0.24, 1] }}
            className="absolute inset-y-0 right-0 flex w-[min(21rem,86vw)] flex-col bg-paper"
          >
            <div className="flex items-center justify-between border-b border-black/[0.07] px-5 py-4">
              <span className="latin-track font-latin text-[20px] tracking-brand text-ink">VELOURS</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="بستن منو"
                className="tap flex h-9 w-9 items-center justify-center rounded-full border border-black/10 text-ink-70 hover:bg-ink hover:text-bone"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <nav className="thin-scrollbar flex-1 overflow-y-auto px-5 py-5">
              <Link
                to="/style-builder"
                onClick={onClose}
                className="mb-2.5 flex items-center gap-3 rounded-2xl border border-ink/15 bg-white/70 px-4 py-3.5 text-ink transition-transform active:scale-[0.99]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink/[0.07]">
                  <Sparkles className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium">استایل بیلدر</span>
                  <span className="mt-0.5 block text-[10.5px] text-ink-70">بوم آزاد یا دستیار پرسش‌وپاسخ</span>
                </span>
                <ArrowLeft className="h-4 w-4 shrink-0" />
              </Link>
              <Link
                to="/builder"
                onClick={onClose}
                className="mb-5 flex items-center gap-3 rounded-2xl bg-ink px-4 py-3.5 text-bone shadow-[0_14px_30px_-16px_rgba(22,19,15,0.7)] transition-transform active:scale-[0.99]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bone/15">
                  <LayoutTemplate className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium">صفحه‌ساز (مثل Elementor)</span>
                  <span className="mt-0.5 block text-[10.5px] text-bone/65">ساخت صفحه، هدر، فوتر، بنر و پاپ‌آپ</span>
                </span>
                <ArrowLeft className="h-4 w-4 shrink-0" />
              </Link>
              <ul className="space-y-1">
                {NAV.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                          onClick={onClose}
                      className={({ isActive }) =>
                        cn(
                          "block rounded-lg px-2 py-2.5 font-display text-[16px] font-medium transition-colors",
                          isActive ? "bg-ink/[0.05] text-ink" : "text-ink-70 hover:bg-ink/[0.03] hover:text-ink",
                        )
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
                <li>
                  <NavLink
                    to="/wishlist"
                    onClick={onClose}
                    className="flex items-center justify-between rounded-lg px-2 py-2.5 font-display text-[16px] font-medium text-ink-70 hover:bg-ink/[0.03] hover:text-ink"
                  >
                    علاقه‌مندی‌ها
                    <span className="text-[11px] text-ink-45">{wishlist.length.toLocaleString("fa-IR")}</span>
                  </NavLink>
                </li>
                <li>
                  <button type="button" onClick={() => { onClose(); onSearch(); }} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2.5 text-[13px] text-ink-70 hover:bg-ink/[0.03] hover:text-ink">
                    <Search className="h-4 w-4" /> جست‌وجو
                  </button>
                </li>
                <li>
                  <Link to={account ? "/account" : "/auth"} onClick={onClose} className="flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-[13px] text-ink-70 hover:bg-ink/[0.03] hover:text-ink">
                    <UserRound className="h-4 w-4" /> {account ? "حساب من" : "ورود / ثبت‌نام"}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/admin"
                    onClick={onClose}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2.5 text-[13px] text-ink-70 hover:bg-ink/[0.03] hover:text-ink"
                  >
                    <ShieldCheck className="h-4 w-4" /> پنل مدیریت
                  </Link>
                </li>
              </ul>

              <details className="group mt-4 rounded-xl border border-black/[0.07] bg-white/50">
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-[12.5px] font-medium text-ink [&::-webkit-details-marker]:hidden">
                  دسته‌بندی‌ها
                  <ChevronDown className="h-4 w-4 text-ink-45 transition-transform group-open:rotate-180" />
                </summary>
                <ul className="space-y-0.5 border-t border-black/[0.06] px-1.5 py-2">
                  {COLLECTIONS.map((c) => (
                    <li key={c.id}>
                      <Link
                        to={`/products?collection=${c.id}`}
                        onClick={onClose}
                        className="flex items-center justify-between rounded-lg px-2 py-2 text-[12.5px] text-ink-70 hover:bg-ink/[0.04] hover:text-ink"
                      >
                        {c.label}
                        <span className="text-[10px] text-ink-45">{productsInCollection(c.id).length.toLocaleString("fa-IR")}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            <div className="mt-6 border-t border-black/[0.06] pt-4">
              <div className="mb-2.5 flex items-center justify-between px-2">
                <p className="text-[10px] text-ink-45">سبک و تم سایت</p>
                <span className="text-[9.5px] text-ink-45">۷ سبک متنوع</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 px-1 pb-2">
                {themes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTheme(t.id)}
                    aria-pressed={activeTheme.id === t.id}
                    className={cn(
                      "flex flex-col items-start rounded-lg border px-2.5 py-2 text-start transition-all",
                      activeTheme.id === t.id
                        ? "border-ink bg-ink text-bone shadow-sm"
                        : "border-black/10 bg-white/40 text-ink-70 hover:border-ink/40",
                    )}
                  >
                    <span className="flex w-full items-center justify-between gap-1">
                      <span className="text-[11px] font-medium">{t.label}</span>
                      {t.badge && (
                        <span
                          className={cn(
                            "rounded px-1 text-[8px]",
                            activeTheme.id === t.id ? "bg-bone/20 text-bone" : "bg-black/5 text-ink-45",
                          )}
                        >
                          {t.badge}
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 text-[9px]",
                        activeTheme.id === t.id ? "text-bone/70" : "text-ink-45",
                      )}
                      dir="ltr"
                    >
                      {t.tagline}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            </nav>
            <div className="border-t border-black/[0.07] px-5 py-4 text-[10.5px] leading-relaxed text-ink-45">
              <p>{settings.address}</p>
              <p className="mt-1" dir="ltr">{settings.email}</p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
