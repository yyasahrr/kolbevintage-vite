import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, ChevronDown, Heart, Menu, Search, ShieldCheck, ShoppingBag, X } from "lucide-react";
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
  { to: "/products", label: "فروشگاه", mega: true },
  { to: "/style", label: "خرید بر اساس استایل" },
  { to: "/style-builder", label: "استایل بیلدر" },
  { to: "/journal", label: "ژورنال" },
];

/** category groups, used when the owner has not curated a mega menu yet */
const CATEGORY_GROUP_LABEL: Record<string, string> = {
  clothing: "پوشاک",
  shoes: "کفش",
  accessories: "کیف و اکسسوری",
};

export function Header() {
  const { count, setCartOpen, wishlist } = useCart();
  const { brand, megaMenus } = useOps();
  const mega = megaMenus.find((m) => m.active);
  const { account } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);
  const megaTimer = useRef<number | undefined>(undefined);
  const location = useLocation();

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    setMegaOpen(false);
  }, [location.pathname, location.search]);

  /*
    Hover intent instead of pure :hover — the panel hangs under the header while
    the trigger is only as tall as its text, so a few pixels of pointer travel
    used to fall outside the trigger and shut the menu before it was reachable.
    Opening is immediate, closing waits a beat so diagonal moves survive.
  */
  const openMega = () => {
    window.clearTimeout(megaTimer.current);
    setMegaOpen(true);
  };
  const closeMegaSoon = () => {
    window.clearTimeout(megaTimer.current);
    megaTimer.current = window.setTimeout(() => setMegaOpen(false), 160);
  };
  useEffect(() => () => window.clearTimeout(megaTimer.current), []);
  useEscape(megaOpen, () => setMegaOpen(false));

  const grouped = useMemo(() => {
    const map = new Map<string, typeof COLLECTIONS>();
    for (const c of COLLECTIONS) {
      const key = c.group ?? "clothing";
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.entries()];
  }, []);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-black/[0.07] bg-bone/85 backdrop-blur-xl">
        <div className="border-b border-black/[0.05] bg-ink text-bone">
          <div className="mx-auto flex h-7 max-w-[1500px] items-center justify-center gap-3 px-4 sm:justify-between sm:px-6 lg:px-10">
            {brand.announcementActive && <p className="truncate text-[9.5px] text-bone/65">{brand.announcement}</p>}
            <a href="#/account" className="hidden shrink-0 text-[9.5px] text-bone/45 hover:text-bone/80 sm:block">
              حساب من · پیگیری سفارش
            </a>
          </div>
        </div>

        {/*
          three balanced zones keep the wordmark optically centred regardless of
          how many nav items or utilities are shown: nav (start) · logo · actions (end)
        */}
        <div className="mx-auto grid h-[58px] max-w-[1500px] grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 sm:px-6 lg:h-[70px] lg:px-10">
          <div className="flex h-full min-w-0 items-center self-stretch">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="باز کردن منو"
              aria-expanded={menuOpen}
              className="tap -ms-1 flex h-10 w-10 items-center justify-center rounded-full text-ink-70 transition-colors hover:bg-ink/5 hover:text-ink lg:hidden"
            >
              <Menu className="h-[19px] w-[19px]" />
            </button>

            <nav aria-label="منوی اصلی" className="hidden h-full items-center gap-4 self-stretch lg:flex xl:gap-7">
              {NAV.map((item) =>
                item.mega ? (
                  <div
                    key={item.to}
                    className="flex h-full items-center"
                    onMouseEnter={openMega}
                    onMouseLeave={closeMegaSoon}
                    onFocus={openMega}
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setMegaOpen(false);
                    }}
                  >
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        cn(
                          "relative flex items-center gap-1 py-2 text-[11.5px] whitespace-nowrap transition-colors",
                          isActive || location.pathname.startsWith("/product") ? "text-ink" : "text-ink-70 hover:text-ink",
                        )
                      }
                    >
                      {item.label}
                      <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", megaOpen && "rotate-180")} />
                      <span
                        className={cn(
                          "absolute inset-x-0 -bottom-0.5 h-px origin-right bg-ink transition-transform duration-300",
                          megaOpen ? "scale-x-100" : "scale-x-0",
                        )}
                      />
                    </NavLink>

                    {/* mega menu: categories first, then a curated showcase card */}
                    <div
                      className={cn(
                        "absolute inset-x-0 top-full z-50 transition-[opacity,transform] duration-200",
                        megaOpen ? "visible translate-y-0 opacity-100" : "pointer-events-none invisible translate-y-1 opacity-0",
                      )}
                    >
                      <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-10">
                        <div className="grid gap-6 rounded-b-2xl rounded-t-none border border-t-0 border-black/[0.07] bg-paper p-6 shadow-[0_30px_60px_-30px_rgba(22,19,15,0.45)] lg:grid-cols-[1.35fr_0.8fr]">
                          <div>
                            <p className="mb-3 text-[9.5px] text-ink-45">دسته‌بندی‌ها</p>
                            {mega && mega.columns.length > 0 ? (
                              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                {mega.columns.map((col) => (
                                  <div key={col.title}>
                                    <p className="mb-1.5 text-[10.5px] font-medium text-ink">{col.title}</p>
                                    <ul className="space-y-0.5">
                                      {col.links.map((ln) => (
                                        <li key={ln.href + ln.label}>
                                          <Link
                                            to={ln.href}
                                            className="block rounded-md px-2 py-1.5 text-[12px] text-ink-70 transition-colors hover:bg-ink/[0.05] hover:text-ink"
                                          >
                                            {ln.label}
                                          </Link>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                {grouped.map(([group, items]) => (
                                  <div key={group}>
                                    <p className="mb-1.5 text-[10.5px] font-medium text-ink">
                                      {CATEGORY_GROUP_LABEL[group] ?? "دسته‌بندی"}
                                    </p>
                                    <ul className="space-y-0.5">
                                      {items.map((c) => (
                                        <li key={c.id}>
                                          <Link
                                            to={`/products?collection=${c.id}`}
                                            className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[12px] text-ink-70 transition-colors hover:bg-ink/[0.05] hover:text-ink"
                                          >
                                            {c.label}
                                            <span className="text-[10px] text-ink-45">
                                              {productsInCollection(c.id).length.toLocaleString("fa-IR")}
                                            </span>
                                          </Link>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <Link
                            to={mega?.cta.href || "/style"}
                            className="group/promo flex flex-col justify-between gap-5 rounded-xl bg-[#f1ebe2] p-4 transition-colors hover:bg-[#ece4d8]"
                          >
                            <div>
                              <p className="text-[9.5px] text-ink-45">ویترین</p>
                              <p className="mt-1 font-display text-[17px] leading-snug font-medium text-ink">
                                {mega?.cta.title || "خرید بر اساس استایل"}
                              </p>
                              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-70">
                                {mega?.cta.text || "شش استایل کامل روی رانو؛ قطعه‌ها را تکی یا یک‌جا بردار."}
                              </p>
                            </div>
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink">
                              ورود به رانو
                              <ArrowLeft className="h-3 w-3 transition-transform duration-200 group-hover/promo:-translate-x-0.5" />
                            </span>
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
                        "group relative py-2 text-[11.5px] whitespace-nowrap transition-colors",
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
          </div>

          <Link to="/" className="flex items-center justify-center justify-self-center" aria-label={brand.name + " — خانه"}>
            {brand.logoImage ? (
              <img src={brand.logoImage} alt={brand.name} className="h-8 w-auto max-w-[132px] object-contain lg:h-9" />
            ) : (
              <span className="latin-track font-latin text-[21px] leading-none tracking-brand text-ink lg:text-[25px]">
                {brand.logoText}
              </span>
            )}
          </Link>

          <div className="flex min-w-0 items-center justify-end gap-0.5 sm:gap-1.5">
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
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
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
  const { brand } = useOps();
  useEscape(open, onClose);
  useScrollLock(open);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[66] lg:hidden">
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
              {brand.logoImage ? (
                <img src={brand.logoImage} alt={brand.name} className="h-7 w-auto max-w-[120px] object-contain" />
              ) : (
                <span className="latin-track font-latin text-[20px] tracking-brand text-ink">{brand.logoText}</span>
              )}
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
              {/* account entry points first: same pill switch the style builder uses */}
              {account ? (
                <Link
                  to="/account"
                  onClick={onClose}
                  className="mb-5 flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-4 text-[12.5px] font-medium text-bone shadow-[0_8px_20px_-10px_rgba(22,19,15,0.7)] transition-transform active:scale-[0.99]"
                >
                  <UserRound className="h-4 w-4" />
                  حساب من · {account.name.split(" ")[0]}
                </Link>
              ) : (
                <div className="mb-5 grid grid-cols-2 gap-1 rounded-full border border-black/[0.08] bg-ink/[0.06] p-1">
                  <Link
                    to="/auth?mode=register"
                    onClick={onClose}
                    className="flex h-11 items-center justify-center rounded-full bg-ink text-[12.5px] font-medium text-bone shadow-[0_8px_20px_-10px_rgba(22,19,15,0.7)] transition-transform active:scale-[0.99]"
                  >
                    ثبت‌نام
                  </Link>
                  <Link
                    to="/auth?mode=password"
                    onClick={onClose}
                    className="flex h-11 items-center justify-center rounded-full text-[12.5px] font-medium text-ink-70 transition-colors hover:text-ink"
                  >
                    ورود
                  </Link>
                </div>
              )}

              <ul className="space-y-0.5">
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
              </ul>

              <div className="mt-4 rounded-xl border border-black/[0.07] bg-white/50">
                <p className="px-3 pt-3 text-[10px] text-ink-45">دسته‌بندی‌ها</p>
                <ul className="px-1.5 py-2">
                  {COLLECTIONS.map((c) => (
                    <li key={c.id}>
                      <Link
                        to={`/products?collection=${c.id}`}
                        onClick={onClose}
                        className="flex min-h-11 items-center justify-between rounded-lg px-2 text-[12.5px] text-ink-70 hover:bg-ink/[0.04] hover:text-ink"
                      >
                        {c.label}
                        <span className="text-[10px] text-ink-45">{productsInCollection(c.id).length.toLocaleString("fa-IR")}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-black/[0.06] pt-3 text-[12px] text-ink-70">
                <Link to="/wishlist" onClick={onClose} className="flex min-h-11 items-center gap-1.5 hover:text-ink">
                  <Heart className="h-3.5 w-3.5" /> علاقه‌مندی‌ها
                  <span className="text-[10px] text-ink-45">({wishlist.length.toLocaleString("fa-IR")})</span>
                </Link>
                <button type="button" onClick={() => { onClose(); onSearch(); }} className="flex min-h-11 items-center gap-1.5 hover:text-ink">
                  <Search className="h-3.5 w-3.5" /> جست‌وجو
                </button>
                <Link to="/admin" onClick={onClose} className="flex min-h-11 items-center gap-1.5 hover:text-ink">
                  <ShieldCheck className="h-3.5 w-3.5" /> پنل مدیریت
                </Link>
              </div>

              <details className="group mt-4 rounded-xl border border-black/[0.07] bg-white/50">
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-[11.5px] text-ink-70 [&::-webkit-details-marker]:hidden">
                  سبک و تم سایت
                  <ChevronDown className="h-4 w-4 text-ink-45 transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid grid-cols-2 gap-1.5 border-t border-black/[0.06] p-2">
                  {themes.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTheme(t.id)}
                      aria-pressed={activeTheme.id === t.id}
                      className={cn(
                        "flex items-center justify-between gap-1 rounded-lg border px-2.5 py-2 text-start transition-all",
                        activeTheme.id === t.id
                          ? "border-ink bg-ink text-bone"
                          : "border-black/10 bg-white/40 text-ink-70 hover:border-ink/40",
                      )}
                    >
                      <span className="text-[11px] font-medium">{t.label}</span>
                      {activeTheme.id === t.id && <Check className="h-3 w-3" />}
                    </button>
                  ))}
                </div>
              </details>
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
