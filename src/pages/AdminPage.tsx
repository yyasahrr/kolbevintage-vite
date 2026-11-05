import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Boxes,
  Bot,
  Check,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Download as DIcon,
  Eye,
  EyeOff,
  FileText,
  Gauge,
  Inbox,
  Layers,
  LayoutTemplate,
  Lock,
  LogOut,
  Megaphone,
  MessageSquare,
  Sparkles,
  Bell,
  Package,
  Palette,
  Plus,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  Save,
  Search,
  Send,
  Settings,
  ShoppingBag,
  Star,
  Store,
  Tags,
  Trash2,
  Truck,
  TrendingUp,
  Users,
  Warehouse,
  Wifi,
  ShieldCheck as ShieldIcon,
  ChevronsLeft,
  ChevronsRight,
  CornerDownLeft,
  X,
  XCircle,
  Clock,
  Ruler,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { weekdayName } from "@/utils/date";
import { COLLECTIONS, liveCatalog, liveGetProduct, type CatalogProduct } from "@/data/catalog";
import { LOOKS, formatPrice, stockOf } from "@/data/looks";
import { computeDiscounts } from "@/state/discounts";
import { ProductThumb } from "@/components/ProductThumb";
import { ProductMediaEditor } from "@/components/ProductMediaEditor";
import { adminLogin, adminLogout, ApiError } from "@/lib/api";
import { download, timeAgo } from "@/builder/util";
import { useTheme } from "@/theme/ThemeProvider";
import { THEMES } from "@/theme/themes";
import { useSyncStatus } from "@/state/sync";
import type { Permission } from "@/admin/rbac";
import { defaultHomeSections, moveHomeSection, setHomeSections, toggleHomeSection } from "@/state/ops";
import { logSmsCampaign, removeSmsTemplate, saveSmsTemplate, setSeo, setSizeGuide } from "@/state/ops";
import { PRODUCT_BADGES, setReviewReply, type Coupon, LOW_STOCK_DEFAULT, isLowStock, lowStockLine, lowStockLineOf, useAdmin, setOrderStatus, patchOrder, addOrderNote, removeOrder, setReviewApproved, removeReview, toggleHidden, toggleFeatured, addCustomProduct, updateCustomProduct, removeCustomProduct, setStockUnified, saveCampaign, removeCampaign, saveRule, removeRule, saveCoupon, saveCoupons, generateCouponCode, removeCoupon, setIntegrations, setCustomerMeta, patchSettings, resetAdmin, adminUnlocked, unlockAdmin, lockAdmin, GARMENT_LABEL, ORDER_STATUS_LABEL, SCOPE_LABEL, RULE_TYPE_LABEL, getAdmin, saveProductEdit, resetProductEdit, productEditOf, complementsOf, setComplements } from "@/state/admin";
import { useDocs, useSubmissions } from "@/builder/docs";
import { sizeSetOf, useOps, getOps, recordFailedLogin, productImagesOf, setProductImages } from "@/state/ops";
import { resolveImg } from "@/builder/stock";
import { useCart as useNotifyCart } from "@/state/cart";
import type { AdminState, Campaign, DiscountRule, OrderStatus, RuleType, Scope, StockMove } from "@/state/admin";
import type { GarmentKind, ProductImage } from "@/types";
import { BrandPanel, CategoriesPanel, MediaPanel, LooksPanel, CrmPanel, TicketsPanel, ReturnsPanel, LogsPanel, HealthPanel, BackupPanel, SecurityPanel, FormsPanel, TryOnPanel, MegaMenuPanel, InventoryPanel} from "./AdminOps";
import { CommercePanel } from "./AdminCommercePanel";
import { StaffPanel } from "./AdminRbac";
import { loadAdminMe, invalidateAdminMe, useAdminMe } from "@/state/session";
import { ChangelogPanel, IssueButton, IssueInbox, LaunchBanner, LaunchChecklist, ManualPanel, SetupWizard } from "@/pages/AdminLaunch";
import { can, permissionForScreen, firstAllowedScreen } from "@/admin/rbac";
import "@/styles/admin.css";

/* =====================================================================
   helpers
   ===================================================================== */

const fa = (n: number) => n.toLocaleString("fa-IR");
const today = (d = 0) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

const totalStock = (p: { id: string; colors: { id: string }[]; sizes: { id: string }[] }) =>
  p.colors.reduce((n, c) => n + p.sizes.reduce((s, z) => s + stockOf(p as never, c.id, z.id), 0), 0);

const uid = () => Math.random().toString(36).slice(2, 9);

type Tab =
  | "dashboard"
  | "orders"
  | "products"
  | "inventory"
  | "customers"
  | "campaigns"
  | "reports"
  | "messages"
  | "reviews"
  | "integrations"
  | "brand"
  | "categories"
  | "media"
  | "looks"
  | "crm"
  | "tickets"
  | "returns"
  | "logs"
  | "health"
  | "backup"
  | "security"
  | "forms"
  | "tryon"
  | "megamenu"
  | "content"
  | "appearance"
  | "commerce"
  | "settings"
  | "staff"
  | "launch"
  | "manual"
  | "changelog"
  | "issues"
  /* grouped areas — six sidebar entries, each one nests its screens */
  | "sales"
  | "stock"
  | "experience"
  | "people"
  | "system";

interface NavItem {
  id: Tab;
  label: string;
  icon: typeof Gauge;
  /** related screens that used to live as separate sidebar entries */
  children?: { id: Tab; label: string }[];
}

const TABS: NavItem[] = [
  { id: "dashboard", label: "داشبورد", icon: Gauge },
  {
    id: "sales" as Tab,
    label: "فروش",
    icon: ShoppingBag,
    children: [
      { id: "orders", label: "سفارش‌ها" },
      { id: "campaigns", label: "تخفیف و کمپین" },
      { id: "commerce", label: "پرداخت و مالی" },
      { id: "returns", label: "مرجوعی‌ها" },
      { id: "tryon", label: "کش‌بک" },
      { id: "reports", label: "گزارش‌ها" },
    ],
  },
  {
    id: "stock" as Tab,
    label: "کالا و انبار",
    icon: Package,
    children: [
      { id: "products", label: "محصولات" },
      { id: "inventory", label: "انبار" },
      { id: "categories", label: "دسته‌بندی و سایز" },
      { id: "media", label: "تصاویر" },
    ],
  },
  {
    id: "experience" as Tab,
    label: "ویترین",
    icon: Palette,
    children: [
      { id: "looks", label: "استایل‌ها" },
      { id: "brand", label: "برند و لوگو" },
      { id: "megamenu", label: "مگا منو" },
      { id: "content", label: "محتوا" },
      { id: "appearance", label: "ظاهر سایت" },
      { id: "forms", label: "فرم‌ها" },
    ],
  },
  {
    id: "people" as Tab,
    label: "مشتریان",
    icon: Users,
    children: [
      { id: "crm", label: "پروفایل مشتری" },
      { id: "messages", label: "پیامک" },
      { id: "tickets", label: "تیکت‌ها" },
      { id: "reviews", label: "نظرات" },
    ],
  },
  {
    id: "system" as Tab,
    label: "سیستم",
    icon: Settings,
    children: [
      { id: "security", label: "امنیت" },
      { id: "integrations", label: "اتصالات" },
      { id: "logs", label: "گزارش فعالیت" },
      { id: "health", label: "سلامت سیستم" },
      { id: "backup", label: "پشتیبان‌گیری" },
      { id: "settings", label: "تنظیمات" },
      { id: "staff", label: "کارکنان و نقش‌ها" },
      { id: "launch", label: "چک‌لیست انتشار" },
      { id: "manual", label: "راهنمای فارسی" },
      { id: "changelog", label: "سابقهٔ تغییرات" },
      { id: "issues", label: "گزارش مشکل" },
    ],
  },
];

/** the screens reachable from each grouped sidebar entry */
const GROUP_CHILDREN: Partial<Record<Tab, Tab[]>> = Object.fromEntries(
  TABS.filter((t) => t.children?.length).map((t) => [t.id as Tab, t.children!.map((c) => c.id)]),
);

/* =====================================================================
   grouped panels — one sidebar entry, several screens inside
   ===================================================================== */

function GroupShell({
  sections,
  value,
  onChange,
}: {
  sections: { id: Tab; label: string; node: React.ReactNode }[];
  value: Tab;
  onChange: (id: Tab) => void;
}) {
  const active = sections.find((s) => s.id === value) ?? sections[0];
  return (
    <div>
      <div className="ad-chips mb-4" role="tablist" aria-label="بخش‌های این گروه">
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active.id === s.id}
            className={cn("ad-chip", active.id === s.id && "is-on")}
            onClick={() => onChange(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {active.node}
    </div>
  );
}

/* =====================================================================
   page
   ===================================================================== */

/** where each screen lives — the panel is addressable, not a state blob */
const SCREEN_PATH: Record<string, string> = Object.fromEntries(
  TABS.flatMap((group) =>
    group.children?.length
      ? group.children.map((child) => [child.id as string, `/admin/${group.id}/${child.id}`])
      : [[group.id as string, group.id === "dashboard" ? "/admin" : `/admin/${group.id}`]],
  ),
);

/** an individual order has its own address (decision 19) */
const ORDER_PATH = /^\/admin\/sales\/orders\/([^/]+)\/?$/;

/** the inverse: an address is resolved to the screen it names */
const tabFromPath = (pathname: string): Tab => {
  if (ORDER_PATH.test(pathname)) return "orders";
  const rest = pathname.replace(/^\/admin\/?/, "").replace(/\/+$/, "");
  if (!rest) return "dashboard";
  const screen = rest.split("/").filter(Boolean).pop() ?? "";
  return (screen in SCREEN_PATH ? screen : "dashboard") as Tab;
};

/** every screen id in sidebar order — the fallback when a link is refused */
const SCREEN_ORDER: string[] = TABS.flatMap((t) => [t.id as string, ...(t.children ?? []).map((c) => c.id as string)]);

export function AdminPage() {
  const [unlocked, setUnlocked] = useState(() => adminUnlocked());
  const navigate = useNavigate();
  // the URL is the source of truth: deep links, back/forward and bookmarks all work
  const location = useLocation();
  const tab = tabFromPath(location.pathname);
  const orderMatch = location.pathname.match(ORDER_PATH);
  const orderId = orderMatch ? decodeURIComponent(orderMatch[1]) : null;
  const setTab = useCallback(
    (id: Tab) => {
      navigate(SCREEN_PATH[id] ?? "/admin");
    },
    [navigate],
  );
  const [navOpen, setNavOpen] = useState(false);
  const admin = useAdmin();
  const session = useAdminMe();
  const { permissions, offline } = session;
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try {
      return localStorage.getItem("kv_admin_nav") === "1";
    } catch {
      return false;
    }
  });
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("kv_admin_nav", navCollapsed ? "1" : "0");
    } catch {
      /* private mode */
    }
  }, [navCollapsed]);

  // ⌘K / Ctrl+K — the only global shortcut in the panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if (e.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * The sidebar is the role: a group survives when it or any of its screens is
   * permitted, and its children are filtered the same way.
   */
  const navTabs = useMemo(() => {
    if (offline) return TABS;
    if (!session.ready) return [];
    return TABS.map((item) => ({
      ...item,
      children: item.children?.filter((child) => can(permissions, permissionForScreen(child.id))),
    })).filter((item) => can(permissions, permissionForScreen(item.id)) || (item.children?.length ?? 0) > 0);
  }, [offline, session.ready, permissions]);

  const blocked = !offline && session.ready && !can(permissions, permissionForScreen(tab));

  // a screen the role may not open: land on the first one it may
  useEffect(() => {
    if (offline || !session.ready || !blocked) return;
    const next = firstAllowedScreen(SCREEN_ORDER, permissions);
    if (next && next !== tab) setTab(next as Tab);
  }, [offline, session.ready, blocked, permissions, tab]);

  useEffect(() => {
    document.title = "پنل مدیریت — " + admin.settings.name;
    return () => {
      document.title = "ولور — فروشگاه پوشاک آماده | خرید بر اساس استایل";
    };
  }, [admin.settings.name]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab]);

  if (!unlocked) return <Gate onUnlock={() => setUnlocked(true)} />;

  // a grouped area is active when the group itself or one of its screens is selected
  const groupIds = Object.keys(GROUP_CHILDREN) as Tab[];
  const group = groupIds.includes(tab)
    ? tab
    : (groupIds.find((g) => GROUP_CHILDREN[g]!.includes(tab)) ?? null);

  const currentGroup = group ? TABS.find((t) => t.id === group) ?? null : null;
  const currentScreen = TABS.flatMap((t) => [t, ...(t.children ?? [])]).find((t) => t.id === tab) ?? null;

  const badges: Partial<Record<Tab, number>> = {
    orders: admin.orders.filter((o) => o.status === "pending").length,
    reviews: admin.reviews.filter((r) => !r.approved).length,
    messages: 0,
    campaigns: admin.campaigns.filter((c) => c.active).length,
  };

  return (
    <div className="ad-app">
      <header className="ad-top">
        <button type="button" className="ad-burger" aria-label="منوی پنل" aria-expanded={navOpen} onClick={() => setNavOpen((v) => !v)}>
          <Layers width={17} height={17} />
        </button>
        <Link to="/" className="ad-top-id" aria-label="بازگشت به سایت">
          <span className="ad-top-logo latin-track">VELOURS</span>
          <span className="ad-top-badge">پنل مدیریت</span>
        </Link>
        <nav className="ad-crumb" aria-label="مسیر صفحه">
          <span>پنل</span>
          {currentGroup && currentGroup.id !== tab && (
            <>
              <i aria-hidden>/</i>
              <span>{currentGroup.label}</span>
            </>
          )}
          <i aria-hidden>/</i>
          <strong>{currentScreen?.label ?? "داشبورد"}</strong>
        </nav>
        <div className="ad-top-spacer" />
        <button
          type="button"
          className="ad-nav-toggle"
          aria-label={navCollapsed ? "باز کردن سایدبار" : "جمع کردن سایدبار"}
          aria-pressed={navCollapsed}
          title="جمع/باز کردن سایدبار"
          onClick={() => setNavCollapsed((v) => !v)}
        >
          {navCollapsed ? <ChevronsLeft width={15} height={15} /> : <ChevronsRight width={15} height={15} />}
        </button>
        <button
          type="button"
          className="ad-btn is-sm ad-cmd-trigger"
          onClick={() => setPaletteOpen(true)}
          aria-label="جست‌وجوی سریع بخش‌ها (Ctrl+K)"
        >
          <Search width={14} height={14} />
          <span className="ad-top-btn-label">جست‌وجو</span>
          <kbd className="ad-kbd latin-track" dir="ltr">⌘K</kbd>
        </button>
        {session.me?.staff && (
          <span className="ad-role-pill" title={`نقش: ${session.me.staff.roleName}`}>
            <ShieldIcon width={12} height={12} />
            {session.me.staff.name}
            <em>{session.me.staff.roleName}</em>
          </span>
        )}
        <span className="ad-top-stat">
          <TrendingUp width={13} height={13} />
          {fa(admin.orders.length)} سفارش
        </span>
        <OpsBell onGo={(next) => setTab(next)} />
        <SyncBadge />
        <Link to="/" className="ad-btn is-sm" aria-label="مشاهده سایت">
          <Store width={14} height={14} />
          <span className="ad-top-btn-label">سایت</span>
        </Link>
        <button type="button" className="ad-btn is-sm" onClick={() => { lockAdmin(); void adminLogout(); setUnlocked(false); }}>
          <LogOut width={14} height={14} />
          <span className="ad-top-btn-label">خروج</span>
        </button>
      </header>

      <div className="ad-body">
        <nav className={cn("ad-nav", navOpen && "is-open", navCollapsed && "is-collapsed")} aria-label="بخش‌های پنل">
          <div className="ad-nav-inner">
            {!session.ready && !offline && (
              <p className="ad-nav-loading" aria-busy="true">در حال خواندن سطح دسترسی…</p>
            )}
            {navTabs.map((t) => {
              const kids = GROUP_CHILDREN[t.id as Tab];
              const isOn = tab === t.id || (kids ? kids.includes(tab) : false);
              const badge = kids
                ? kids.reduce((n, k) => n + (badges[k] ?? 0), 0)
                : (badges[t.id] ?? 0);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={cn("ad-nav-item", isOn && "is-on")}
                  onClick={() => { setTab(kids ? kids[0] : t.id); setNavOpen(false); }}
                >
                  <t.icon width={15} height={15} />
                  <span>{t.label}</span>
                  {badge ? <em>{fa(badge)}</em> : null}
                </button>
              );
            })}
            <div className="ad-nav-foot">
              <p>{admin.settings.name}</p>
              <small>{admin.settings.tagline}</small>
            </div>
          </div>
        </nav>
        {navOpen && <div className="ad-nav-scrim" onClick={() => setNavOpen(false)} aria-hidden />}

        <main className="ad-main">
          {offline && (
            <p className="ad-banner is-warn" role="status">
              حالت محلی: سرور پاسخ نداد، پس نقش و مجوزها در دسترس نیستند و تغییرات فقط در همین مرورگر می‌مانند.
            </p>
          )}
          {blocked ? (
            <NoAccess
              screen={tab}
              role={session.me?.staff?.roleName ?? null}
              onGo={() => {
                const next = firstAllowedScreen(SCREEN_ORDER, permissions);
                if (next) setTab(next as Tab);
              }}
            />
          ) : (
            <>
          {tab === "dashboard" && <Dashboard onGo={setTab} />}
          {group === "sales" && orderId && <OrderPage orderId={orderId} />}
          {group === "sales" && !orderId && (
            <GroupShell
              sections={[
                { id: "orders", label: "سفارش‌ها", node: <Orders /> },
                { id: "campaigns", label: "تخفیف و کمپین", node: <Campaigns /> },
                { id: "commerce", label: "پرداخت و مالی", node: <CommercePanel /> },
                { id: "returns", label: "مرجوعی‌ها", node: <ReturnsPanel /> },
                { id: "tryon", label: "کش‌بک", node: <TryOnPanel /> },
                { id: "reports", label: "گزارش‌ها", node: <Reports /> },
              ]}
              value={tab}
              onChange={setTab}
            />
          )}
          {group === "stock" && (
            <GroupShell
              sections={[
                { id: "products", label: "محصولات", node: <Products /> },
                { id: "inventory", label: "انبار", node: <InventoryPanel /> },
                { id: "categories", label: "دسته‌بندی و سایز", node: <CategoriesPanel /> },
                { id: "media", label: "تصاویر", node: <MediaPanel /> },
              ]}
              value={tab}
              onChange={setTab}
            />
          )}
          {group === "experience" && (
            <GroupShell
              sections={[
                { id: "looks", label: "استایل‌ها", node: <LooksPanel /> },
                { id: "brand", label: "برند و لوگو", node: <BrandPanel /> },
                { id: "megamenu", label: "مگا منو", node: <MegaMenuPanel /> },
                { id: "content", label: "محتوا", node: <Content /> },
                { id: "appearance", label: "ظاهر سایت", node: <Appearance /> },
                { id: "forms", label: "فرم‌ها", node: <FormsPanel /> },
              ]}
              value={tab}
              onChange={setTab}
            />
          )}
          {group === "people" && (
            <GroupShell
              sections={[
                {
                  id: "crm",
                  label: "مشتریان و CRM",
                  // one screen: the customer book and its CRM notes/sms history together
                  node: (
                    <div className="space-y-6">
                      <Customers />
                      <CrmPanel />
                    </div>
                  ),
                },
                { id: "messages", label: "پیامک", node: <SmsScreen /> },
                { id: "tickets", label: "تیکت‌ها", node: <TicketsPanel /> },
                { id: "reviews", label: "نظرات", node: <Reviews /> },
              ]}
              value={tab}
              onChange={setTab}
            />
          )}
          {group === "system" && (
            <GroupShell
              sections={[
                { id: "security", label: "امنیت", node: <SecurityPanel /> },
                { id: "integrations", label: "اتصالات", node: <Integrations /> },
                { id: "logs", label: "گزارش فعالیت", node: <LogsPanel /> },
                { id: "health", label: "سلامت سیستم", node: <HealthPanel /> },
                { id: "backup", label: "پشتیبان‌گیری", node: <BackupPanel /> },
                { id: "settings", label: "تنظیمات", node: <StoreSettings onBack={() => navigate("/")} /> },
                { id: "launch", label: "چک‌لیست انتشار", node: <LaunchChecklist /> },
                { id: "manual", label: "راهنمای فارسی", node: <ManualPanel /> },
                { id: "changelog", label: "سابقهٔ تغییرات", node: <ChangelogPanel /> },
                { id: "issues", label: "گزارش مشکل", node: <IssueInbox /> },
                { id: "staff", label: "کارکنان و نقش‌ها", node: <StaffPanel /> },
              ]}
              value={tab}
              onChange={setTab}
            />
          )}
            </>
          )}
        </main>
      </div>

      {/* first-run wizard and the always-there problem button (decisions 93 + 96) */}
      <SetupWizard onJump={(target) => setTab(target as Tab)} />
      <IssueButton page="/admin" />

      {paletteOpen && (
        <CommandPalette
          tabs={navTabs}
          onClose={() => setPaletteOpen(false)}
          onPick={(id) => {
            setTab(id);
            setPaletteOpen(false);
            setNavOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* =====================================================================
   command palette — keyboard-first navigation over the *permitted* screens
   ===================================================================== */

function CommandPalette({
  tabs,
  onClose,
  onPick,
}: {
  tabs: NavItem[];
  onClose: () => void;
  onPick: (id: Tab) => void;
}) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);

  const items = useMemo(() => {
    const flat = tabs.flatMap((t) => [
      { id: t.id, label: t.label, group: null as string | null, icon: t.icon },
      ...(t.children ?? []).map((c) => ({ id: c.id, label: c.label, group: t.label, icon: t.icon })),
    ]);
    const needle = q.trim();
    if (!needle) return flat;
    return flat.filter((item) => item.label.includes(needle) || String(item.id).includes(needle.toLowerCase()));
  }, [tabs, q]);

  useEffect(() => {
    setCursor(0);
  }, [q]);

  // the palette owns the keyboard while it is open
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === "Enter" && items[cursor]) {
        e.preventDefault();
        onPick(items[cursor].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, cursor, onPick]);

  return (
    <div className="ad-palette-scrim" role="presentation" onClick={onClose}>
      <div
        className="ad-palette"
        role="dialog"
        aria-modal="true"
        aria-label="جست‌وجوی سریع بخش‌های پنل"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ad-palette-input">
          <Search width={15} height={15} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بخش مورد نظر…"
            aria-label="جست‌وجوی بخش"
          />
          <button type="button" className="ad-palette-close" onClick={onClose} aria-label="بستن">
            <X width={14} height={14} />
          </button>
        </div>
        {items.length === 0 ? (
          <p className="ad-palette-empty">
            {tabs.length === 0 ? "سطح دسترسی هنوز خوانده نشده است." : "بخشی با این نام پیدا نشد."}
          </p>
        ) : (
          <ul className="ad-palette-list" role="listbox" aria-label="نتایج">
            {items.map((item, i) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === cursor}
                  className={cn("ad-palette-item", i === cursor && "is-on")}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => onPick(item.id)}
                >
                  <item.icon width={15} height={15} />
                  <span>{item.label}</span>
                  {item.group && <em>{item.group}</em>}
                  {i === cursor && <CornerDownLeft width={12} height={12} className="ad-palette-enter" />}
                </button>
              </li>
            ))}
          </ul>
        )}
        <footer className="ad-palette-foot">
          <span><kbd className="ad-kbd">↑</kbd><kbd className="ad-kbd">↓</kbd> جابه‌جایی</span>
          <span><kbd className="ad-kbd">Enter</kbd> رفتن</span>
          <span><kbd className="ad-kbd">Esc</kbd> بستن</span>
        </footer>
      </div>
    </div>
  );
}

/* =====================================================================
   permission denied — a screen the role may not open
   ===================================================================== */

function NoAccess({ screen, role, onGo }: { screen: Tab; role: string | null; onGo: () => void }) {
  const permission = permissionForScreen(screen) ?? "—";
  return (
    <div className="ad-empty ad-empty-error ad-denied" role="alert">
      <Lock width={20} height={20} />
      <h3>این بخش برای نقش شما فعال نیست</h3>
      <p>
        {role ? `نقش «${role}» ` : "نقش فعلی "}
        مجوز <code className="latin-track" dir="ltr">{permission}</code> را ندارد. اگر به آن نیاز داری، از مالک بخواه در «کارکنان و نقش‌ها» اضافه کند.
      </p>
      <button type="button" className="ad-btn is-primary" onClick={onGo}>
        <ArrowLeft width={14} height={14} /> رفتن به اولین بخش مجاز
      </button>
    </div>
  );
}

/* =====================================================================
   gate
   ===================================================================== */

function Gate({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const admin = useAdmin();
  const sec = getOps().security;
  const [attempts, setAttempts] = useState(0);

  /**
   * The server decides who is signing in: the store passcode (owner) or a
   * staff passcode (that person's role). Only when the API cannot be reached
   * does the old local passcode still open the local-only panel.
   */
  const submit = async () => {
    const passcode = code.trim();
    if (!passcode || busy) return;
    setBusy(true);
    setError("");
    try {
      await adminLogin(passcode);
      invalidateAdminMe();
      await loadAdminMe(true);
      unlockAdmin(passcode);
      onUnlock();
    } catch (err) {
      const offline = !(err instanceof ApiError) || err.status >= 500;
      if (offline && (unlockAdmin(passcode) || passcode === sec.passcode)) {
        onUnlock();
        return;
      }
      recordFailedLogin("127.0.0.1");
      setAttempts((n) => {
        const n2 = n + 1;
        setError(n2 > 2 ? "رمز چند بار اشتباه وارد شد؛ تلاش‌ها در بخش امنیت ثبت شد." : "رمز درست نیست. دوباره امتحان کن.");
        return n2;
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ad-gate">
      <form
        className="ad-gate-card"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <span className="ad-gate-ic"><Lock width={22} height={22} /></span>
        <h1>پنل مدیریت {admin.settings.name}</h1>
        <p>رمز فروشگاه مالک را وارد می‌کند؛ هر کارمند با رمز خودش و فقط با مجوزهای نقش خودش وارد می‌شود.</p>
        <input value={code} onChange={(e) => { setCode(e.target.value); setError(""); }} placeholder="رمز مدیریت" dir="ltr" autoFocus aria-label="رمز مدیریت" inputMode="numeric" />
        {error && <span className="ad-gate-error">{error}</span>}
        <button type="submit" className="ad-btn is-primary is-lg" disabled={busy || !code.trim()}>
          {busy ? "در حال بررسی…" : "ورود به پنل"}
        </button>
        <span className="ad-gate-hint">رمز پیش‌فرض: <b dir="ltr">{sec.passcode}</b>{attempts > 0 ? ` · ${fa(attempts)} تلاش ناموفق` : ""}</span>
        <Link to="/" className="ad-gate-back">بازگشت به فروشگاه</Link>
      </form>
    </div>
  );
}

function SyncBadge() {
  const sync = useSyncStatus();
  const map = {
    online: { cls: "is-online", label: sync.lastSaved ? "ذخیره شد" : "متصل به سرور" },
    connecting: { cls: "is-connecting", label: "اتصال به سرور…" },
    offline: { cls: "is-offline", label: "فقط مرورگر" },
  } as const;
  const item = map[sync.state];
  return (
    <span className={`ad-sync ${item.cls}`} title={sync.error ?? "داده‌ها در PostgreSQL ذخیره می‌شوند"}>
      <i aria-hidden />
      {item.label}
    </span>
  );
}

/* =====================================================================
   dashboard
   ===================================================================== */

function Dashboard({ onGo }: { onGo: (t: Tab) => void }) {
  return (
    <div className="space-y-5">
      <LaunchBanner />
      <DashboardBody onGo={onGo} />
    </div>
  );
}


/** the day's actual work, first thing on the dashboard (decision 1) */
function WorkQueue({ onGo }: { onGo: (t: Tab) => void }) {
  const admin = useAdmin();
  const ops = useOps();
  const pendingOrders = admin.orders.filter((o) => o.status === "pending" || o.status === "processing").length;
  const unpaid = admin.orders.filter((o) => o.status === "exception").length;
  const openTickets = ops.tickets.filter((t) => t.status !== "closed").length;
  const pendingReviews = admin.reviews.filter((r) => !r.approved).length;
  const pendingReturns = ops.returns.filter((r) => r.status === "requested").length;
  // "low" means some colour/size line is at or under its threshold, not zero stock
  const lowStock = liveCatalog().filter((p) =>
    p.sizes.some((sz) => {
      const n = p.colors.reduce((sum, c) => sum + stockOf(p, c.id, sz.id), 0);
      return n > 0 && n <= lowStockLineOf(p.id);
    }),
  ).length;

  const items = [
    { id: "orders", label: "سفارش در انتظار آماده‌سازی", n: pendingOrders, to: "orders" as Tab },
    { id: "unpaid", label: "سفارش با وضعیت مالی استثنایی", n: unpaid, to: "orders" as Tab },
    { id: "tickets", label: "تیکت باز", n: openTickets, to: "tickets" as Tab },
    { id: "reviews", label: "نظر در انتظار تأیید", n: pendingReviews, to: "reviews" as Tab },
    { id: "returns", label: "مرجوعی در انتظار تصمیم", n: pendingReturns, to: "returns" as Tab },
    { id: "stock", label: "محصول کم‌موجود", n: lowStock, to: "inventory" as Tab },
  ].filter((i) => i.n > 0);

  return (
    <Card title="صف کار امروز" icon={<Clock width={14} height={14} />}>
      {items.length === 0 ? (
        <p className="ad-empty-tight">صف خالی است: نه سفارش باز، نه تیکت، نه نظر یا مرجوعی در انتظار.</p>
      ) : (
        <div className="ad-queue">
          {items.map((i) => (
            <button key={i.id} type="button" className="ad-queue-item" onClick={() => onGo(i.to)}>
              <b>{fa(i.n)}</b>
              <span>{i.label}</span>
              <ArrowLeft width={12} height={12} />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function DashboardBody({ onGo }: { onGo: (t: Tab) => void }) {
  const admin = useAdmin();
  const docs = useDocs();
  const submissions = useSubmissions();
  const catalog = liveCatalog();
  const revenue = admin.orders.filter((o) => o.status !== "cancelled").reduce((n, o) => n + o.total, 0);
  const customers = new Set(admin.orders.map((o) => o.email).filter(Boolean)).size;
  const stockValue = catalog.reduce((n, p) => n + totalStock(p) * p.price, 0);
  const lowCount = catalog.filter((p) => isLowStock(p.id, totalStock(p))).length;
  const outCount = catalog.filter((p) => totalStock(p) === 0).length;
  const campaignsOn = admin.campaigns.filter((c) => c.active).length;

  const kpis: { icon: typeof Gauge; label: string; value: string; sub: string; to: Tab }[] = [
    { icon: ShoppingBag, label: "سفارش‌ها", value: fa(admin.orders.length), sub: `${fa(admin.orders.filter((o) => o.status === "pending").length)} در انتظار`, to: "orders" },
    { icon: TrendingUp, label: "درآمد", value: formatPrice(revenue), sub: "بدون سفارش‌های لغوشده", to: "orders" },
    { icon: Users, label: "مشتریان", value: fa(customers), sub: "بر اساس سفارش‌ها", to: "crm" },
    { icon: Warehouse, label: "ارزش انبار", value: formatPrice(stockValue), sub: `${fa(outCount)} ناموجود · ${fa(lowCount)} کم‌موجود`, to: "inventory" },
    { icon: Megaphone, label: "جشنواره فعال", value: fa(campaignsOn), sub: `${fa(admin.rules.filter((r) => r.active).length)} قانون تخفیف`, to: "campaigns" },
    { icon: Package, label: "محصولات", value: fa(catalog.length), sub: `${fa(admin.customProducts.length)} محصول دست‌ساز`, to: "products" },
    { icon: Inbox, label: "پیام‌ها و محتوا", value: fa(submissions.length), sub: `${fa(docs.length)} صفحه/محتوا ساخته‌شده`, to: "messages" },
  ];

  const days = Array.from({ length: 7 }, (_, i) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (6 - i));
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const list = admin.orders.filter((o) => o.at >= start.getTime() && o.at < end.getTime());
    return { label: weekdayName(start), value: list.reduce((n, o) => n + o.total, 0) };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.value));

  return (
    <>
      <PageHead title="داشبورد" sub="اول کارِ امروز، بعد اعداد فروشگاه." />

      <WorkQueue onGo={onGo} />

      <div className="ad-kpis">
        {kpis.map((k) => (
          <button key={k.label} type="button" className="ad-kpi" onClick={() => onGo(k.to)}>
            <span className="ad-kpi-ic"><k.icon width={16} height={16} /></span>
            <b>{k.value}</b>
            <span className="ad-kpi-label">{k.label}</span>
            <small>{k.sub}</small>
          </button>
        ))}
      </div>

      <div className="ad-grid-2">
        <Card title="فروش هفت روز اخیر" icon={<BarChart3 width={14} height={14} />}>
          {admin.orders.length === 0 ? (
            <Empty text="هنوز سفارشی ثبت نشده. اولین سفارش واقعی با یک خرید از فروشگاه ساخته می‌شود." />
          ) : (
            <div className="ad-chart">
              {days.map((d, i) => (
                <div key={i} className="ad-bar-col">
                  <span className="ad-bar" style={{ height: `${Math.max(3, (d.value / maxDay) * 100)}%` }} />
                  <small>{d.label}</small>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="آخرین تحركات انبار" icon={<Boxes width={14} height={14} />}>
          {admin.movements.length === 0 ? (
            <Empty text="حرکتی ثبت نشده؛ با فروش یا شارژ انبار اینجا پر می‌شود." />
          ) : (
            <ul className="ad-mini-list">
              {admin.movements.slice(0, 5).map((m) => (
                <li key={m.id}>
                  <b className={cn(m.delta < 0 && "text-ember")}>{m.delta > 0 ? `+${fa(m.delta)}` : fa(m.delta)}</b>
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <em>{REASON_LABEL[m.reason]}</em>
                  <small>{timeAgo(m.at)}</small>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="میان‌برها" icon={<Plus width={14} height={14} />}>
        <div className="ad-shortcuts">
          <button type="button" className="ad-btn" onClick={() => onGo("products")}><Package width={13} height={13} /> افزودن محصول</button>
          <button type="button" className="ad-btn" onClick={() => onGo("campaigns")}><Megaphone width={13} height={13} /> جشنوارهٔ جدید</button>
          <button type="button" className="ad-btn" onClick={() => onGo("inventory")}><Warehouse width={13} height={13} /> شارژ انبار</button>
          <Link to="/builder" className="ad-btn"><LayoutTemplate width={13} height={13} /> صفحه‌ساز</Link>
          <Link to="/style-builder" className="ad-btn"><Layers width={13} height={13} /> استایل بیلدر</Link>
        </div>
      </Card>
    </>
  );
}

const REASON_LABEL: Record<StockMove["reason"], string> = { sale: "فروش", restock: "شارژ", edit: "ویرایش", create: "ایجاد" };

/* =====================================================================
   reports — every number here is computed from real orders
   ===================================================================== */

function Reports() {
  const admin = useAdmin();

  const orders = admin.orders.filter((o) => o.status !== "cancelled");
  const total = orders.reduce((n, o) => n + o.total, 0);
  const basket = orders.length ? Math.round(total / orders.length) : 0;

  /** the last 14 days, oldest first — days with no order are honestly zero */
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (13 - i));
    const next = d.getTime() + 86400000;
    const sum = orders.filter((o) => o.at >= d.getTime() && o.at < next).reduce((n, o) => n + o.total, 0);
    return { label: d.toLocaleDateString("fa-IR", { day: "numeric", month: "short" }), sum };
  });
  const peak = Math.max(1, ...days.map((d) => d.sum));

  const byProduct = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const o of orders) {
    for (const l of o.lines) {
      const cur = byProduct.get(l.productId) ?? { name: l.name, qty: 0, revenue: 0 };
      cur.qty += l.qty;
      cur.revenue += l.qty * l.price;
      byProduct.set(l.productId, cur);
    }
  }
  const topProducts = [...byProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  const byCustomer = new Map<string, { name: string; orders: number; total: number }>();
  for (const o of orders) {
    const key = o.email || o.customer;
    const cur = byCustomer.get(key) ?? { name: o.customer, orders: 0, total: 0 };
    cur.orders += 1;
    cur.total += o.total;
    byCustomer.set(key, cur);
  }
  const topCustomers = [...byCustomer.values()].sort((a, b) => b.total - a.total).slice(0, 8);

  const kpis = [
    { label: "فروش کل (بدون لغوشده)", value: formatPrice(total) },
    { label: "تعداد سفارش", value: fa(orders.length) },
    { label: "میانگین سبد", value: formatPrice(basket) },
    { label: "قطعهٔ فروش‌رفته", value: fa(orders.reduce((n, o) => n + o.lines.reduce((m, l) => m + l.qty, 0), 0)) },
  ];

  return (
    <div className="ad-panel-adm">
      <header className="ad-head">
        <div>
          <h2>گزارش‌ها</h2>
          <p>همهٔ اعداد از سفارش‌های ثبت‌شدهٔ همین سامانه محاسبه می‌شوند؛ هیچ عدد نمایشی یا نمونه‌ای اینجا نیست.</p>
        </div>
      </header>

      {orders.length === 0 ? (
        <Empty text="هنوز سفارشی ثبت نشده، پس گزارشی هم وجود ندارد." />
      ) : (
        <>
          <div className="ad-kpis">
            {kpis.map((k) => (
              <div key={k.label} className="ad-kpi ad-kpi-static">
                <b>{k.value}</b>
                <span className="ad-kpi-label">{k.label}</span>
              </div>
            ))}
          </div>

          <section className="ad-card">
            <header className="ad-card-head"><h3>فروش ۱۴ روز گذشته</h3></header>
            <div className="ad-card-body">
              <div className="ad-report-bars" role="img" aria-label="نمودار فروش روزانهٔ ۱۴ روز گذشته">
                {days.map((d) => (
                  <div key={d.label} className="ad-report-bar">
                    <span className="ad-report-fill" style={{ height: `${Math.max(2, (d.sum / peak) * 100)}%` }} />
                    <small>{d.label}</small>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="ad-order-grid">
            <section className="ad-card">
              <header className="ad-card-head"><h3>پرفروش‌ترین قطعه‌ها</h3></header>
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead><tr><th>قطعه</th><th>تعداد</th><th>درآمد</th></tr></thead>
                  <tbody>
                    {topProducts.map((p) => (
                      <tr key={p.name}>
                        <td>{p.name}</td>
                        <td className="ad-num">{fa(p.qty)}</td>
                        <td className="ad-money">{formatPrice(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="ad-card">
              <header className="ad-card-head"><h3>مشتریان پرمصرف</h3></header>
              <div className="ad-table-wrap">
                <table className="ad-table">
                  <thead><tr><th>مشتری</th><th>سفارش</th><th>ارزش</th></tr></thead>
                  <tbody>
                    {topCustomers.map((c) => (
                      <tr key={c.name}>
                        <td>{c.name}</td>
                        <td className="ad-num">{fa(c.orders)}</td>
                        <td className="ad-money">{formatPrice(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <p className="ad-hint">
            «سبد رهاشده» هنوز در این صفحه نیست: اطلاعات سبدها سمت سرور است و endpoint مدیریتی‌اش
            ساخته نشده. تا آن موقع هیچ عددی برایش نشان نمی‌دهیم.
          </p>
        </>
      )}
    </div>
  );
}

/* =====================================================================
   one order, at its own address
   ===================================================================== */

function OrderPage({ orderId }: { orderId: string }) {
  const admin = useAdmin();
  const ops = useOps();
  const navigate = useNavigate();
  const session = useAdminMe();
  const order = admin.orders.find((o) => o.id === orderId);
  const [note, setNote] = useState("");
  const [tracking, setTracking] = useState(order?.tracking ?? "");
  const [saved, setSaved] = useState(false);

  if (!order) {
    return (
      <div className="ad-empty ad-empty-error" role="alert">
        <h3>این سفارش پیدا نشد</h3>
        <p>شناسهٔ «{orderId}» در سفارش‌های ثبت‌شده نیست.</p>
        <button type="button" className="ad-btn" onClick={() => navigate("/admin/sales/orders")}>
          <ArrowLeft width={13} height={13} /> بازگشت به سفارش‌ها
        </button>
      </div>
    );
  }

  const items = order.lines.reduce((n, l) => n + l.qty, 0);
  const author = session.me?.staff?.name ?? "مالک";

  return (
    <div className="ad-panel-adm">
      <header className="ad-head">
        <div>
          <button type="button" className="ad-back" onClick={() => navigate("/admin/sales/orders")}>
            <ArrowLeft width={13} height={13} /> سفارش‌ها
          </button>
          <h2 className="latin-track" dir="ltr">{order.id}</h2>
          <p>
            ثبت‌شده {new Date(order.at).toLocaleString("fa-IR")} · {fa(items)} قطعه · {order.shipping === "express" ? "پیشتاز" : "پست"}
          </p>
        </div>
        <div className="ad-head-actions">
          <button type="button" className="ad-btn is-sm" onClick={() => printInvoices([order])}>
            <FileText width={13} height={13} /> فاکتور A4
          </button>
          <button type="button" className="ad-btn is-sm" onClick={() => printLabels([order])}>
            <Truck width={13} height={13} /> لیبل
          </button>
          <select
            className="ad-select"
            value={order.status}
            aria-label="وضعیت سفارش"
            onChange={(e) => setOrderStatus(order.id, e.target.value as OrderStatus)}
          >
            {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((st) => (
              <option key={st} value={st}>{ORDER_STATUS_LABEL[st]}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="ad-order-grid">
        <section className="ad-card">
          <header className="ad-card-head"><h3>اقلام</h3></header>
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead><tr><th>قطعه</th><th>رنگ / سایز</th><th>تعداد</th><th>قیمت</th></tr></thead>
              <tbody>
                {order.lines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.name}</td>
                    <td>{l.color} · {l.size}</td>
                    <td className="ad-num">{fa(l.qty)}</td>
                    <td className="ad-money">{formatPrice(l.price * l.qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ad-card-body ad-order-totals">
            <div><span>جمع اقلام</span><b>{formatPrice(order.subtotal)}</b></div>
            {order.discountTotal > 0 && <div><span>تخفیف</span><b>− {formatPrice(order.discountTotal)}</b></div>}
            <div><span>ارسال</span><b>{order.shippingCost === 0 ? "رایگان" : formatPrice(order.shippingCost)}</b></div>
            <div className="is-total"><span>مبلغ نهایی</span><b>{formatPrice(order.total)}</b></div>
          </div>
        </section>

        <section className="ad-card">
          <header className="ad-card-head"><h3>مشتری</h3></header>
          <div className="ad-card-body ad-order-customer">
            <p><b>{order.customer}</b> · {order.city}</p>
            <p className="latin-track" dir="ltr">{order.phone}</p>
            <p className="latin-track" dir="ltr">{order.email}</p>
            <p>{order.address}</p>
            <a
              className="ad-btn is-sm"
              href={`sms:${order.phone}?body=${encodeURIComponent(
                // the text comes from the owner's template in the SMS screen, filled with this order's real status
                fillTemplate(
                  ops.smsTemplates.find((t) => t.id === ORDER_STATUS_SMS_ID)?.body ??
                    "{{name}} عزیز، وضعیت سفارش {{order}} به «{{status}}» تغییر کرد. ولور",
                  { name: order.customer, order: order.id, status: ORDER_STATUS_LABEL[order.status] ?? order.status },
                ),
              )}`}
            >
              <Send width={13} height={13} /> پیام وضعیت
            </a>
          </div>

          <header className="ad-card-head"><h3>کد رهگیری</h3></header>
          <div className="ad-card-body ad-order-tracking">
            <input
              className="ad-input latin-track"
              dir="ltr"
              value={tracking}
              onChange={(e) => { setTracking(e.target.value); setSaved(false); }}
              placeholder="کد رهگیری پستی"
              aria-label="کد رهگیری"
            />
            <button
              type="button"
              className="ad-btn is-sm is-primary"
              disabled={tracking === (order.tracking ?? "")}
              onClick={() => { patchOrder(order.id, { tracking: tracking.trim() || undefined }); setSaved(true); }}
            >
              ذخیره
            </button>
            {saved && <span className="ad-hint">ذخیره شد؛ در صفحهٔ سفارش مشتری همین کد دیده می‌شود.</span>}
          </div>
        </section>
      </div>

      <section className="ad-card">
        <header className="ad-card-head"><h3>یادداشت داخلی</h3></header>
        <div className="ad-card-body">
          {(order.notes ?? []).length === 0 ? (
            <p className="ad-hint">هنوز یادداشتی نیست. یادداشت‌ها فقط برای تیم است و مشتری نمی‌بیند.</p>
          ) : (
            <ul className="ad-notes">
              {(order.notes ?? []).map((n) => (
                <li key={n.id}>
                  <span>{n.text}</span>
                  <small>{n.by} · {new Date(n.at).toLocaleString("fa-IR")}</small>
                </li>
              ))}
            </ul>
          )}
          <div className="ad-note-add">
            <textarea
              className="ad-input"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثلاً: مشتری خواست سایز L عوض شود…"
              aria-label="یادداشت تازه"
            />
            <button
              type="button"
              className="ad-btn is-sm is-primary"
              disabled={!note.trim()}
              onClick={() => { addOrderNote(order.id, note.trim(), author); setNote(""); }}
            >
              <Plus width={13} height={13} /> افزودن یادداشت
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

/* =====================================================================
   orders
   ===================================================================== */

function Orders() {
  const admin = useAdmin();
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const togglePick = (id: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  /* saved views: a named filter the owner can come back to (decision 16) */
  const [query, setQuery] = useState("");
  const [views, setViews] = useState<{ name: string; filter: OrderStatus | "all"; query: string }[]>(() => {
    try {
      const raw = localStorage.getItem("kv_order_views");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const persistViews = (next: { name: string; filter: OrderStatus | "all"; query: string }[]) => {
    setViews(next);
    try {
      localStorage.setItem("kv_order_views", JSON.stringify(next));
    } catch {
      /* private mode */
    }
  };
  const saveView = () => {
    const name = window.prompt("نام این نما؟", filter === "all" ? "همه" : ORDER_STATUS_LABEL[filter]);
    if (!name?.trim()) return;
    persistViews([...views.filter((v) => v.name !== name.trim()), { name: name.trim(), filter, query }]);
  };

  const needle = query.trim();
  const list = admin.orders.filter(
    (o) =>
      (filter === "all" || o.status === filter) &&
      (!needle || `${o.id} ${o.customer} ${o.phone} ${o.email} ${o.city}`.includes(needle)),
  );

  const csv = () =>
    download(
      "orders.csv",
      "\uFEFF" +
        [["شناسه", "زمان", "مشتری", "ایمیل", "شهر", "تخفیف", "کل", "وضعیت"],
          ...admin.orders.map((o) => [o.id, new Date(o.at).toLocaleString("fa-IR"), o.customer, o.email, o.city, fa(o.discountTotal), o.total, ORDER_STATUS_LABEL[o.status]])]
          .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"),
      "text/csv",
    );

  return (
    <>
      <PageHead
        title="سفارش‌ها"
        sub={`${fa(admin.orders.length)} سفارش ثبت‌شده. روی هر ردیف بزن تا جزئیات باز شود.`}
        actions={
          <>
            <button type="button" className="ad-btn is-sm" onClick={csv}><DIcon width={13} height={13} /> خروجی CSV</button>
          </>
        }
      />
      {picked.size > 0 && (
        <div className="ad-bulkbar" role="region" aria-label="عملیات گروهی سفارش">
          <b>{fa(picked.size)} سفارش</b>
          <div className="ad-actions">
            <button type="button" className="ad-btn is-sm" onClick={() => { picked.forEach((id) => setOrderStatus(id, "processing")); setPicked(new Set()); }}>آماده‌سازی</button>
            <button type="button" className="ad-btn is-sm" onClick={() => { picked.forEach((id) => setOrderStatus(id, "shipped")); setPicked(new Set()); }}>ارسال</button>
            <button type="button" className="ad-btn is-sm" onClick={() => { picked.forEach((id) => setOrderStatus(id, "done")); setPicked(new Set()); }}>تحویل</button>
            <button type="button" className="ad-btn is-sm" onClick={() => printLabels(admin.orders.filter((o) => picked.has(o.id)))}>چاپ لیبل</button>
            <button type="button" className="ad-btn is-sm" onClick={() => printInvoices(admin.orders.filter((o) => picked.has(o.id)))}>فاکتور A4</button>
            <button type="button" className="ad-btn is-sm" onClick={() => setPicked(new Set())}>لغو</button>
          </div>
        </div>
      )}
      <div className="ad-toolbar">
        <input
          className="ad-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="شناسه، نام، موبایل یا شهر…"
          aria-label="جست‌وجوی سفارش"
        />
        <select
          className="ad-input is-compact"
          value=""
          aria-label="نمای ذخیره‌شده"
          onChange={(e) => {
            const v = views.find((x) => x.name === e.target.value);
            if (v) {
              setFilter(v.filter);
              setQuery(v.query);
            }
          }}
        >
          <option value="">نمای ذخیره‌شده…</option>
          {views.map((v) => (
            <option key={v.name} value={v.name}>{v.name}</option>
          ))}
        </select>
        <button type="button" className="ad-btn is-sm" onClick={saveView}>
          <Plus width={12} height={12} /> ذخیرهٔ نمای فعلی
        </button>
      </div>
      <div className="ad-filters">
        {(["all", "pending", "processing", "shipped", "done", "cancelled", "exception"] as const).map((f) => (
          <button key={f} type="button" className={cn("ad-chip", filter === f && "is-on")} onClick={() => setFilter(f)}>
            {f === "all" ? "همه" : ORDER_STATUS_LABEL[f]}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <Empty text="سفارشی با این فیلتر نیست." />
      ) : (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead>
              <tr>
                <th aria-label="انتخاب" />
                <th>شناسه</th>
                <th>مشتری</th>
                <th>اقلام</th>
                <th>زمان</th>
                <th>ارسال</th>
                <th>پرداخت</th>
                <th>تخفیف</th>
                <th>کل</th>
                <th>وضعیت</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((o) => (
                <OrderRow key={o.id} o={o} open={open === o.id} picked={picked.has(o.id)} onPick={() => togglePick(o.id)} onToggle={() => setOpen(open === o.id ? null : o.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function OrderRow({ o, open, onToggle, picked, onPick }: { o: AdminState["orders"][number]; open: boolean; onToggle: () => void; picked: boolean; onPick: () => void }) {
  return (
    <>
      <tr className={cn(open && "is-open")} onClick={onToggle}>
        <td><input type="checkbox" className="ad-checkbox" checked={picked} onChange={(e) => { e.stopPropagation(); onPick(); }} aria-label={`انتخاب سفارش ${o.id}`} /></td>
        <td dir="ltr">
          <Link to={`/admin/sales/orders/${encodeURIComponent(o.id)}`} className="ad-link" onClick={(e) => e.stopPropagation()}>
            {o.id}
          </Link>
        </td>
        <td>{o.customer}<small>{o.city}</small></td>
        <td className="ad-num">{fa(o.lines.reduce((n, l) => n + l.qty, 0))}</td>
        <td>{timeAgo(o.at)}</td>
        <td>{o.shipping === "express" ? "پیشتاز" : "پست"}</td>
        <td className="latin-track" dir="ltr">{o.gateway ?? "—"}</td>
        <td>{o.discountTotal > 0 ? `− ${formatPrice(o.discountTotal)}` : "—"}</td>
        <td className="ad-money">{formatPrice(o.total)}</td>
        <td>
          <select value={o.status} aria-label="وضعیت سفارش" onClick={(e) => e.stopPropagation()} onChange={(e) => setOrderStatus(o.id, e.target.value as OrderStatus)} className={cn("ad-select", `is-${o.status}`)}>
            {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => (
              <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </td>
        <td>
          <button type="button" className="ad-icon" aria-label="حذف سفارش" onClick={(e) => { e.stopPropagation(); removeOrder(o.id); }}>
            <Trash2 width={13} height={13} />
          </button>
        </td>
      </tr>
      {open && (
        <tr className="ad-detail-row">
          <td colSpan={11}>
            <div className="ad-detail">
              <div className="ad-detail-col">
                <h4>اقلام</h4>
                <ul>
                  {o.lines.map((l, i) => (
                    <li key={i}>
                      <span>{l.name}</span>
                      <em>{l.color} · {l.size} × {fa(l.qty)}</em>
                      <b>{formatPrice(l.price * l.qty)}</b>
                    </li>
                  ))}
                </ul>
                {o.discounts.length > 0 && (
                  <>
                    <h4>تخفیف‌های اعمال‌شده</h4>
                    <ul>
                      {o.discounts.map((d, i) => (
                        <li key={i}><span>{d.name}</span><b className="text-emerald-700">{d.amount > 0 ? `− ${formatPrice(d.amount)}` : "ارسال رایگان"}</b></li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
              <div className="ad-detail-col">
                <h4>مشتری و ارسال</h4>
                <p>{o.email || "—"}</p>
                <p dir="ltr">{o.phone || "—"}</p>
                <p>{o.address || "—"}</p>
                <p>{o.shipping === "express" ? "ارسال سریع" : "ارسال استاندارد"} · {o.gateway ?? "—"}</p>
                {o.campaign && <p>جشنواره: <b>{o.campaign}</b></p>}
                {o.coupon && <p>کد: <b dir="ltr">{o.coupon}</b></p>}
                <div className="ad-sums">
                  <span>جمع اقلام <b>{formatPrice(o.subtotal)}</b></span>
                  <span>تخفیف <b>− {formatPrice(o.discountTotal)}</b></span>
                  <span>ارسال <b>{o.shippingCost === 0 ? "رایگان" : formatPrice(o.shippingCost)}</b></span>
                  <span className="is-total">کل <b>{formatPrice(o.total)}</b></span>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* =====================================================================
   products (with add/edit)
   ===================================================================== */

function Products() {
  const admin = useAdmin();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [stockFor, setStockFor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggleSel = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const bulkHide = (hide: boolean) => { selected.forEach((id) => { const isHidden = admin.hidden.includes(id); if (hide && !isHidden) toggleHidden(id); if (!hide && isHidden) toggleHidden(id); }); setSelected(new Set()); };
  const bulkFeature = () => { selected.forEach((id) => { if (!admin.featured.includes(id)) toggleFeatured(id); }); setSelected(new Set()); };

  const catalog = liveCatalog();
  const [sortKey, setSortKey] = useState<"name" | "category" | "price" | "stock">("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(0);
  const [bulkPct, setBulkPct] = useState(10);
  const [bulkCat, setBulkCat] = useState("");

  const needle = q.trim().toLowerCase();
  const matches = (text: string) => !needle || text.toLowerCase().includes(needle);

  /** search hits are marked, not just filtered (decision 39) */
  const mark = (text: string) => {
    if (!needle) return text;
    const i = text.toLowerCase().indexOf(needle);
    if (i < 0) return text;
    return (
      <>
        {text.slice(0, i)}
        <mark className="ad-mark">{text.slice(i, i + needle.length)}</mark>
        {text.slice(i + needle.length)}
      </>
    );
  };

  const filtered = catalog.filter((p) => {
    if (cat !== "all") {
      const coll = COLLECTIONS.find((c) => c.id === cat);
      if (coll && !coll.garments.includes(p.garment)) return false;
    }
    return matches(`${p.name} ${p.category} ${p.lookName} ${p.id}`);
  });

  const sorted = [...filtered].sort((a, b) => {
    const pick = (p: CatalogProduct) =>
      sortKey === "price" ? p.price : sortKey === "stock" ? totalStock(p) : sortKey === "category" ? p.category : p.name;
    const av = pick(a);
    const bv = pick(b);
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
    return String(av).localeCompare(String(bv), "fa") * sortDir;
  });

  const PER_PAGE = 50;
  const pageCount = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = sorted.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

  const sortBy = (key: "name" | "category" | "price" | "stock") => {
    if (key === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(key);
      setSortDir(1);
    }
    setPage(0);
  };

  const sortMark = (key: "name" | "category" | "price" | "stock") =>
    sortKey === key ? (sortDir === 1 ? " ↑" : " ↓") : "";

  /** bulk writes go through the same store as the form, per product kind */
  const applyToProduct = (id: string, change: { price?: number; category?: string }) => {
    const isCustom = !!getAdmin().customProducts.find((c) => c.id === id);
    if (isCustom) updateCustomProduct(id, change);
    else saveProductEdit(id, change);
  };

  const bulkPrice = () => {
    selected.forEach((id) => {
      const pr = liveGetProduct(id);
      if (!pr) return;
      applyToProduct(id, { price: Math.max(0, Math.round((pr.price * (100 + bulkPct)) / 100)) });
    });
    setSelected(new Set());
  };

  const bulkCategory = () => {
    if (!bulkCat) return;
    selected.forEach((id) => applyToProduct(id, { category: bulkCat }));
    setSelected(new Set());
  };

  return (
    <>
      <PageHead
        title="محصولات و انبار"
        sub={`${fa(catalog.length)} محصول · ${fa(admin.hidden.length)} مخفی · ${fa(admin.featured.length + admin.customProducts.filter((c) => c.featured).length)} ویژه`}
        actions={
          <button type="button" className="ad-btn is-sm is-primary" onClick={() => setEditing("new")}>
            <Plus width={13} height={13} /> افزودن محصول
          </button>
        }
      />
      <div className="ad-toolbar">
        <input className="ad-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی محصول…" aria-label="جست‌وجوی محصول" />
        <div className="ad-filters">
          <button type="button" className={cn("ad-chip", cat === "all" && "is-on")} onClick={() => setCat("all")}>همه</button>
          {COLLECTIONS.map((c) => (
            <button key={c.id} type="button" className={cn("ad-chip", cat === c.id && "is-on")} onClick={() => setCat(c.id)}>{c.short}</button>
          ))}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="ad-bulkbar" role="region" aria-label="عملیات گروهی">
          <b>{fa(selected.size)} انتخاب‌شده</b>
          <div className="ad-actions">
            <button type="button" className="ad-btn is-sm" onClick={() => bulkHide(false)}><Eye width={12} height={12} /> نمایش</button>
            <button type="button" className="ad-btn is-sm" onClick={() => bulkHide(true)}><EyeOff width={12} height={12} /> مخفی</button>
            <button type="button" className="ad-btn is-sm" onClick={bulkFeature}><Star width={12} height={12} /> ویژه</button>
            <span className="ad-bulk-group">
              <label className="ad-hint" htmlFor="bulk-pct">قیمت</label>
              <input
                id="bulk-pct"
                className="ad-input is-tiny"
                type="number"
                value={bulkPct}
                onChange={(e) => setBulkPct(Number(e.target.value) || 0)}
                aria-label="درصد تغییر قیمت گروهی"
              />
              <button type="button" className="ad-btn is-sm" onClick={bulkPrice}>٪ اعمال</button>
            </span>
            <span className="ad-bulk-group">
              <select className="ad-input is-compact" value={bulkCat} onChange={(e) => setBulkCat(e.target.value)} aria-label="دستهٔ گروهی">
                <option value="">دسته…</option>
                {getOps().categories.filter((c) => c.active).map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
              <button type="button" className="ad-btn is-sm" disabled={!bulkCat} onClick={bulkCategory}>انتقال</button>
            </span>
            <button type="button" className="ad-btn is-sm is-danger" onClick={() => { selected.forEach((id) => { const cp = admin.customProducts.find((c) => c.id === id); if (cp) removeCustomProduct(id); }); setSelected(new Set()); }}><Trash2 width={12} height={12} /> حذف دست‌سازها</button>
            <button type="button" className="ad-btn is-sm" onClick={() => setSelected(new Set())}>لغو انتخاب</button>
          </div>
        </div>
      )}
      <div className="ad-table-wrap">
        <table className="ad-table ad-products-table">
          <thead>
            <tr>
              <th aria-label="انتخاب" />
              <th><button type="button" className="ad-sort" onClick={() => sortBy("name")}>محصول{sortMark("name")}</button></th>
              <th><button type="button" className="ad-sort" onClick={() => sortBy("category")}>دسته{sortMark("category")}</button></th>
              <th>تنوع</th>
              <th><button type="button" className="ad-sort" onClick={() => sortBy("price")}>قیمت{sortMark("price")}</button></th>
              <th><button type="button" className="ad-sort" onClick={() => sortBy("stock")}>موجودی{sortMark("stock")}</button></th>
              <th>وضعیت</th>
              <th aria-label="عملیات" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const stock = totalStock(p);
              const isCustom = !!admin.customProducts.find((c) => c.id === p.id);
              const hiddenRow =
                admin.hidden.includes(p.id) ||
                (isCustom && !admin.customProducts.find((c) => c.id === p.id)?.active);
              const featuredRow =
                admin.featured.includes(p.id) || admin.customProducts.find((c) => c.id === p.id)?.featured;
              return (
                <tr key={p.id} className={cn(hiddenRow && "is-off")}>
                  <td>
                    <input
                      type="checkbox"
                      className="ad-checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSel(p.id)}
                      aria-label={`انتخاب ${p.name}`}
                    />
                  </td>
                  <td>
                    <div className="ad-prod-cell">
                      <ProductThumb product={p} className="w-[38px]" />
                      <span>
                        <b>{mark(p.name)}</b>
                        <small>{isCustom ? "دست‌ساز" : p.lookName}</small>
                      </span>
                    </div>
                  </td>
                  <td>{mark(p.category)}</td>
                  <td className="ad-num">{fa(p.colors.length)} × {fa(p.sizes.length)}</td>
                  <td className="ad-money">{formatPrice(p.price)}</td>
                  <td className="ad-num">
                    <span className={cn(stock === 0 && "text-ember", stock > 0 && stock <= lowStockLineOf(p.id) && "text-amber-700")}>
                      {stock === 0 ? "ناموجود" : fa(stock)}
                    </span>
                    {stock > 0 && stock <= lowStockLineOf(p.id) && (
                      // the line this row is judged against, so an override is never a mystery
                      <small className="ad-hint" style={{ display: "block" }}>کم‌موجود · خط {fa(lowStockLineOf(p.id))}</small>
                    )}
                  </td>
                  <td>
                    <span className={cn("ad-chip", !hiddenRow && "is-on")}>{hiddenRow ? "پیش‌نویس" : "منتشرشده"}</span>
                  </td>
                  <td>
                    <div className="ad-product-actions">
                      <button type="button" className="ad-icon" title="ویرایش محصول" aria-label={`ویرایش ${p.name}`} onClick={() => setEditing(p.id)}>
                        <FileText width={14} height={14} />
                      </button>
                      <button type="button" className="ad-icon" title="موجودی واریانت‌ها" aria-label={`موجودی ${p.name}`} onClick={() => setStockFor(p.id)}>
                        <Boxes width={14} height={14} />
                      </button>
                      <button type="button" className={cn("ad-icon", featuredRow && "is-on")} title="نشان ویژه" aria-label={`ویژه ${p.name}`} aria-pressed={!!featuredRow} onClick={() => toggleFeatured(p.id)}>
                        <Star width={14} height={14} />
                      </button>
                      <button type="button" className={cn("ad-icon", hiddenRow && "is-danger")} title={hiddenRow ? "نمایش در فروشگاه" : "مخفی‌کردن"} aria-label={`${hiddenRow ? "نمایش" : "مخفی‌کردن"} ${p.name}`} aria-pressed={!!hiddenRow} onClick={() => toggleHidden(p.id)}>
                        {hiddenRow ? <EyeOff width={14} height={14} /> : <Eye width={14} height={14} />}
                      </button>
                      <Link to={`/product/${p.id}`} className="ad-icon" title="دیدن در فروشگاه" aria-label={`دیدن ${p.name}`}>
                        <Store width={14} height={14} />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && <Empty text="محصولی با این فیلتر پیدا نشد." />}
      </div>

      {sorted.length > PER_PAGE && (
        <div className="ad-pager" role="navigation" aria-label="صفحه‌بندی محصولات">
          <button type="button" className="ad-btn is-sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>قبلی</button>
          <span>صفحهٔ {fa(safePage + 1)} از {fa(pageCount)} · {fa(sorted.length)} محصول</span>
          <button type="button" className="ad-btn is-sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>بعدی</button>
        </div>
      )}

      {editing && (
        <ProductForm
          key={editing}
          product={editing === "new" ? null : liveGetProduct(editing) ?? null}
          onClose={() => setEditing(null)}
        />
      )}
      {stockFor && <StockModal productId={stockFor} onClose={() => setStockFor(null)} />}
    </>
  );
}

/* ---------- product form (add / edit) ---------- */

/** which garment kinds make a good pairing, used to float suggestions up */
const COMPLEMENT_HINT: Record<GarmentKind, GarmentKind[]> = {
  coat: ["knit", "tee", "trousers", "boot", "bag", "accessory"],
  jacket: ["tee", "knit", "trousers", "skirt", "loafer", "bag"],
  knit: ["trousers", "skirt", "coat", "boot", "bag", "accessory"],
  tee: ["trousers", "skirt", "jacket", "sneaker", "loafer", "bag"],
  dress: ["coat", "jacket", "heel", "boot", "bag", "accessory"],
  skirt: ["knit", "tee", "jacket", "heel", "bag", "accessory"],
  trousers: ["knit", "tee", "coat", "loafer", "boot", "bag"],
  bag: ["coat", "dress", "trousers", "heel", "knit"],
  loafer: ["trousers", "skirt", "coat", "bag", "knit"],
  heel: ["dress", "skirt", "bag", "accessory", "coat"],
  boot: ["trousers", "coat", "knit", "bag", "skirt"],
  sneaker: ["trousers", "tee", "jacket", "bag"],
  accessory: ["dress", "knit", "bag", "heel", "coat"],
};

const DEFAULT_CROP = { cx: 0.5, cy: 0.4, zoom: 0.6 };

const stockMapOf = (p: CatalogProduct | null) => {
  const out: Record<string, number> = {};
  if (!p) return { "c1:one-size": 10 };
  for (const c of p.colors) for (const s of p.sizes) out[`${c.id}:${s.id}`] = stockOf(p, c.id, s.id);
  return out;
};

function ProductForm({ product, onClose }: { product: CatalogProduct | null; onClose: () => void }) {
  const admin = useAdmin();
  const ops = useOps();
  const custom = product ? admin.customProducts.find((c) => c.id === product.id) : undefined;

  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "اکسسوری");
  const [garment, setGarment] = useState<GarmentKind>(product?.garment ?? "accessory");
  const [price, setPrice] = useState(product?.price ?? 100);
  const [compareAt, setCompareAt] = useState(product?.compareAt ?? 0);
  const [description, setDescription] = useState(product?.description ?? "");
  const [colors, setColors] = useState(product?.colors ?? [{ id: "c1", name: "مشکی", hex: "#16130f" }]);
  const [sizes, setSizes] = useState(product?.sizes ?? [{ id: "one-size", label: "یک سایز" }]);
  const [stock, setStock] = useState<Record<string, number>>(() => stockMapOf(product));
  const [lowStock, setLowStock] = useState<number>(
    () => admin.productEdits[product?.id ?? ""]?.lowStockThreshold ?? custom?.lowStockThreshold ?? 0,
  );
  const [badges, setBadges] = useState<string[]>(
    () => admin.productEdits[product?.id ?? ""]?.badges ?? custom?.badges ?? [],
  );
  const [images, setImages] = useState<ProductImage[]>(() => (product ? [...productImagesOf(product.id)] : []));
  const [picked, setPicked] = useState<string[]>(() => (product ? [...complementsOf(product.id)] : []));
  const [compQuery, setCompQuery] = useState("");
  const [customSize, setCustomSize] = useState("");
  const [err, setErr] = useState("");
  const [tabPane, setTabPane] = useState<"info" | "media" | "variants" | "price" | "complements">("info");
  /** a local draft survives a closed tab; it is never uploaded (decision 50) */
  const draftKey = `kv_product_draft_${product?.id ?? "new"}`;
  const [draftNotice, setDraftNotice] = useState(false);

  const draftOfForm = () => ({ name, category, garment, price, compareAt, description, colors, sizes, images, picked, stock });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) setDraftNotice(true);
    } catch {
      /* private mode */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // keep the local draft current; clearing happens on a real save
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey, JSON.stringify(draftOfForm()));
      } catch {
        /* quota / private mode */
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, name, category, garment, price, compareAt, description, colors, sizes, images, picked, stock]);

  const restoreDraft = () => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return setDraftNotice(false);
      const d = JSON.parse(raw);
      if (typeof d.name === "string") setName(d.name);
      if (typeof d.category === "string") setCategory(d.category);
      if (typeof d.garment === "string") setGarment(d.garment);
      if (typeof d.price === "number") setPrice(d.price);
      if (typeof d.compareAt === "number") setCompareAt(d.compareAt);
      if (typeof d.description === "string") setDescription(d.description);
      if (Array.isArray(d.colors)) setColors(d.colors);
      if (Array.isArray(d.sizes)) setSizes(d.sizes);
      if (Array.isArray(d.images)) setImages(d.images);
      if (Array.isArray(d.picked)) setPicked(d.picked);
      if (d.stock && typeof d.stock === "object") setStock(d.stock);
    } catch {
      /* corrupt draft — ignore */
    }
    setDraftNotice(false);
  };

  const discardDraft = () => {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    setDraftNotice(false);
  };

  const catSizeSet = sizeSetOf(ops.categories.find((c) => c.name === category)?.sizeSetId ?? ops.categories[0]?.sizeSetId ?? "");
  const poolSizes = catSizeSet?.sizes ?? ["XS", "S", "M", "L", "XL", "یک سایز"];

  const catalogue = liveCatalog();
  const hint = COMPLEMENT_HINT[garment] ?? [];
  const rankOf = (g: GarmentKind) => (hint.includes(g) ? hint.indexOf(g) : 99);
  const compCandidates = catalogue
    .filter((p) => p.id !== product?.id)
    .filter((p) => {
      const q = compQuery.trim();
      return !q || `${p.name} ${p.category}`.includes(q);
    })
    .sort((a, b) => rankOf(a.garment) - rankOf(b.garment) || a.name.localeCompare(b.name, "fa"));

  const coverPreview = images.find((i) => i.role === "main")?.url ?? images.find((i) => i.role !== "hover")?.url;
  const previewProduct: CatalogProduct = product ?? {
    id: "preview",
    name: name || "پیش‌نمایش",
    category,
    garment,
    price,
    compareAt: compareAt || undefined,
    colors,
    sizes,
    stock,
    crop: DEFAULT_CROP,
    image: LOOKS[0].image,
    aspect: LOOKS[0].aspect,
    lookId: LOOKS[0].id,
    lookName: "پیش‌نمایش",
    lookSlug: LOOKS[0].id,
    lookOrder: 0,
    description,
    material: "",
    care: "",
    fit: "",
    origin: "",
  };

  const removeColor = (index: number) => {
    const gone = colors[index];
    setColors(colors.filter((_, n) => n !== index));
    if (gone) setImages((list) => list.map((img) => (img.colorId === gone.id ? { ...img, colorId: "*" } : img)));
  };

  /** `mode` decides visibility: a draft stays off the storefront, a publish goes live */
  const save = (mode: "draft" | "publish") => {
    if (!name.trim()) { setErr("نام محصول را بنویس."); return; }
    if (!colors.length || !sizes.length) { setErr("حداقل یک رنگ و یک سایز لازم است."); return; }
    const id = product?.id ?? `cp-${uid()}`;
    const payload = {
      name: name.trim(),
      category,
      garment,
      price: Math.max(0, price),
      compareAt: compareAt > price ? compareAt : undefined,
      description: description.trim() || undefined,
      colors,
      sizes,
      // base products keep every variant (a zero is meaningful); new/custom ones only keep the positive ones
      stock: product && !custom
        ? { ...stock }
        : Object.fromEntries(Object.entries(stock).filter(([, v]) => v > 0)),
      lowStockThreshold: lowStock > 0 ? lowStock : undefined,
      badges,
    };
    if (custom) {
      updateCustomProduct(custom.id, payload);
    } else if (product) {
      saveProductEdit(product.id, payload);
    } else {
      addCustomProduct({
        ...payload,
        id,
        lookId: LOOKS[0].id,
        crop: DEFAULT_CROP,
        active: true,
        featured: false,
        createdAt: Date.now(),
      });
    }
    setProductImages(id, images);
    setComplements(id, picked);

    // visibility: a draft is hidden from the storefront, publishing shows it
    const isHidden = getAdmin().hidden.includes(id);
    if (mode === "draft" && !isHidden) toggleHidden(id);
    if (mode === "publish" && isHidden) toggleHidden(id);
    const savedCustom = getAdmin().customProducts.find((c) => c.id === id);
    if (savedCustom && savedCustom.active !== (mode === "publish")) updateCustomProduct(id, { active: mode === "publish" });

    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
    onClose();
  };

  return (
    <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ad-modal is-wide" role="dialog" aria-modal="true" aria-label="فرم محصول">
        <header className="ad-modal-head">
          <div>
            <h3>{product ? `ویرایش ${product.name}` : "افزودن محصول"}</h3>
            <p>همهٔ فیلدها قابل ویرایش‌اند؛ تصاویر را در گالری بریز و برای هر عکس رنگ و نقشش را انتخاب کن.</p>
          </div>
          <button type="button" className="ad-icon" aria-label="بستن" onClick={onClose}><X width={16} height={16} /></button>
        </header>

        <div className="ad-modal-tabs" role="tablist" aria-label="بخش‌های فرم محصول">
          {([
            ["info", "اطلاعات"],
            ["media", "گالری"],
            ["variants", "رنگ و سایز"],
            ["price", "قیمت و انتشار"],
            ["complements", "مکمل‌ها"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tabPane === id}
              className={cn("ad-modal-tab", tabPane === id && "is-on")}
              onClick={() => setTabPane(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ad-modal-body">
          {draftNotice && (
            <div className="ad-banner is-warn" role="status">
              <span>پیش‌نویس ذخیره‌نشدهٔ قبلی این محصول پیدا شد.</span>
              <button type="button" className="ad-btn is-sm" onClick={restoreDraft}>بازیابی پیش‌نویس</button>
              <button type="button" className="ad-btn is-sm" onClick={discardDraft}>دور ریختن</button>
            </div>
          )}

          {tabPane === "info" && (
            <div className="ad-form-grid">
              <div className="ad-form-col">
                <label className="ad-field">نام محصول<input className="ad-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
                <div className="ad-two">
                  <label className="ad-field">دسته
                    <select className="ad-select" value={category} onChange={(e) => { setCategory(e.target.value); setSizes([]); }}>
                      {ops.categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </label>
                  <label className="ad-field">نوع قطعه
                    <select className="ad-select" value={garment} onChange={(e) => setGarment(e.target.value as GarmentKind)}>
                      {Object.entries(GARMENT_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                </div>
                <label className="ad-field">توضیح کوتاه (اختیاری)
                  <textarea className="ad-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
                </label>
                {err && <p className="ad-form-err">{err}</p>}
              </div>
              <div className="ad-form-col">
                <p className="ad-field-label">پیش‌نمایش</p>
                <div className="ad-form-preview">
                  <div className="ad-preview-thumb">
                    {coverPreview ? (
                      <img src={resolveImg(coverPreview)} alt="" className="w-full rounded-[10px]" />
                    ) : (
                      <ProductThumb product={previewProduct} className="w-full" />
                    )}
                  </div>
                </div>
                <p className="ad-hint">نام، دسته و توضیح در کارت محصول و صفحهٔ محصول همین‌طور دیده می‌شود.</p>
              </div>
            </div>
          )}

          {tabPane === "media" && (
            <div className="ad-form-grid">
              <div className="ad-form-col">
                <p className="ad-field-label">گالری تصاویر</p>
                <ProductMediaEditor images={images} colors={colors} onChange={setImages} />
              </div>
              <div className="ad-form-col">
                <p className="ad-field-label">پیش‌نمایش</p>
                <div className="ad-form-preview">
                  <div className="ad-preview-thumb">
                    {coverPreview ? (
                      <img src={resolveImg(coverPreview)} alt="" className="w-full rounded-[10px]" />
                    ) : (
                      <ProductThumb product={previewProduct} className="w-full" />
                    )}
                  </div>
                </div>
                <p className="ad-hint">تصویر «اصلی» در کارت محصول و صفحهٔ محصول دیده می‌شود؛ بقیه در گالری.</p>
              </div>
            </div>
          )}

          {tabPane === "variants" && (
            <div className="ad-form-grid">
              <div className="ad-form-col">
                <p className="ad-field-label">رنگ‌ها</p>
                {colors.map((c, i) => (
                  <div key={c.id} className="ad-color-row">
                    <input type="color" value={c.hex} aria-label={`رنگ ${i + 1}`} onChange={(e) => setColors(colors.map((x, n) => (n === i ? { ...x, hex: e.target.value } : x)))} />
                    <input className="ad-input" value={c.name} aria-label={`نام رنگ ${i + 1}`} onChange={(e) => setColors(colors.map((x, n) => (n === i ? { ...x, name: e.target.value } : x)))} />
                    <button type="button" className="ad-icon is-danger" aria-label="حذف رنگ" onClick={() => removeColor(i)}><Trash2 width={13} height={13} /></button>
                  </div>
                ))}
                <button type="button" className="ad-btn is-sm" onClick={() => setColors([...colors, { id: `c${uid()}`, name: "رنگ جدید", hex: "#8c4a2f" }])}><Plus width={13} height={13} /> رنگ</button>

                <p className="ad-field-label">سایزها {catSizeSet && <span className="ad-hint">— مجموعهٔ «{catSizeSet.name}»</span>}</p>
                <div className="ad-size-pool">
                  {poolSizes.map((label) => {
                    const has = sizes.some((x) => x.label === label);
                    return (
                      <button
                        key={label}
                        type="button"
                        className={cn("ad-chip", has && "is-on")}
                        onClick={() => setSizes(has ? sizes.filter((x) => x.label !== label) : [...sizes, { id: "s-" + label, label }])}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="ad-size-pool" style={{ alignItems: "center" }}>
                  <input className="ad-input" value={customSize} onChange={(e) => setCustomSize(e.target.value)} placeholder="سایز دلخواه…" aria-label="سایز دلخواه" style={{ maxWidth: 140 }} />
                  <button
                    type="button"
                    className="ad-btn is-sm"
                    disabled={!customSize.trim()}
                    onClick={() => {
                      const label = customSize.trim();
                      if (!sizes.some((x) => x.label === label)) setSizes([...sizes, { id: "s-" + label, label }]);
                      setCustomSize("");
                    }}
                  >
                    <Plus width={12} height={12} /> افزودن سایز
                  </button>
                  {catSizeSet && (
                    <button
                      type="button"
                      className="ad-btn is-sm"
                      onClick={() => {
                        // back to the shared set: keep every stock cell by size label
                        setSizes(poolSizes.map((label) => sizes.find((x) => x.label === label) ?? { id: "s-" + label, label }));
                        setCustomSize("");
                      }}
                      title={`سایزهای محصول برابر ست مشترک «${catSizeSet.name}» می‌شود`}
                    >
                      <RotateCcw width={12} height={12} /> بازگشت به ست مشترک
                    </button>
                  )}
                </div>
                {/* decision 55: a product may keep its own sizes next to the shared set — say which is which */}
                <p className="ad-hint">
                  {catSizeSet
                    ? `ست مشترک این دسته «${catSizeSet.name}» است. `
                    : "این دسته ست مشترک ندارد. "}
                  {(() => {
                    const own = sizes.filter((x) => !poolSizes.includes(x.label));
                    const off = poolSizes.filter((label) => !sizes.some((x) => x.label === label));
                    if (!own.length && !off.length) return "این محصول دقیقاً همان ست مشترک را دارد.";
                    return [
                      own.length ? `سایزهای اختصاصی این محصول: ${own.map((x) => x.label).join("، ")}.` : "",
                      off.length ? `از ست مشترک حذف شده: ${off.join("، ")}.` : "",
                    ].filter(Boolean).join(" ");
                  })()}
                </p>
                {err && <p className="ad-form-err">{err}</p>}
              </div>
              <div className="ad-form-col">
                <p className="ad-field-label">موجودی هر واریانت</p>
                <div className="ad-stock-matrix">
                  {colors.map((c) => (
                    <div key={c.id} className="ad-stock-matrix-row">
                      <span className="ad-stock-matrix-head"><i style={{ background: c.hex }} />{c.name}</span>
                      {sizes.map((sz) => (
                        <input key={sz.label} type="number" min={0} max={999} aria-label={`موجودی ${c.name} ${sz.label}`} value={stock[`${c.id}:${sz.id}`] ?? 0}
                          onChange={(e) => setStock({ ...stock, [`${c.id}:${sz.id}`]: Math.max(0, Number(e.target.value) || 0) })} />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tabPane === "price" && (
            <div className="ad-form-grid">
              <div className="ad-form-col">
                <div className="ad-two">
                  <label className="ad-field">قیمت (واحد پایه)<input className="ad-input" type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} /></label>
                  <label className="ad-field">قیمت قبل از تخفیف (اختیاری)<input className="ad-input" type="number" min={0} value={compareAt || ""} onChange={(e) => setCompareAt(Number(e.target.value) || 0)} /></label>
                </div>
                <p className="ad-hint">
                  {compareAt > price && price > 0
                    ? `این قیمت ${fa(Math.round(((compareAt - price) / compareAt) * 100))}٪ زیر قیمت قبلی است.`
                    : "اگر قیمت قبل را پر کنی، درصد تخفیف همین‌جا محاسبه و در کارت محصول نشان داده می‌شود."}
                </p>
                <p className="ad-hint">
                  درصد سود به «قیمت خرید» نیاز دارد که هنوز در داده‌ها نیست؛ وقتی قیمت خرید ثبت شود، همین‌جا
                  نمایش داده می‌شود. تا آن موقع عددی نشان نمی‌دهیم.
                </p>
                <div className="ad-field">
                  <span className="ad-field-label">برچسب روی کارت محصول</span>
                  <div className="ad-tags">
                    {PRODUCT_BADGES.map((badge) => {
                      const on = badges.includes(badge);
                      return (
                        <button
                          key={badge}
                          type="button"
                          className={cn("ad-chip", on && "is-on")}
                          aria-pressed={on}
                          onClick={() =>
                            setBadges((list) => (on ? list.filter((b) => b !== badge) : [...list, badge]))
                          }
                        >
                          {badge}
                        </button>
                      );
                    })}
                  </div>
                  <small className="ad-hint">
                    کارت محصول فقط برچسب اول این فهرست را نشان می‌دهد؛ اگر هیچ‌کدام را انتخاب نکنی، برچسب خودکار
                    (تخفیف/آخرین موجودی/جدید) می‌ماند.
                  </small>
                </div>
                <label className="ad-field">
                  آستانهٔ «کم‌موجود» این محصول (۰ = همان آستانهٔ فروشگاه)
                  <input className="ad-input" type="number" min={0} value={lowStock || 0} onChange={(e) => setLowStock(Number(e.target.value) || 0)} />
                  <small className="ad-hint">
                    آستانهٔ فروشگاه {fa(lowStockLine())} است؛ اگر این محصول شرایط خاصی دارد، عدد خودش را بگذار.
                  </small>
                </label>
                {err && <p className="ad-form-err">{err}</p>}
              </div>
              <div className="ad-form-col">
                <p className="ad-field-label">وضعیت نمایش</p>
                <p className="ad-hint">
                  «ذخیرهٔ پیش‌نویس» محصول را در پنل نگه می‌دارد و از ویترین پنهان می‌کند؛
                  «انتشار» آن را برای مشتری نمایش می‌دهد. وضعیت فعلی:{" "}
                  <b>{product ? (admin.hidden.includes(product.id) ? "پیش‌نویس / پنهان" : "منتشرشده") : "محصول تازه"}</b>
                </p>
              </div>
            </div>
          )}

          {tabPane === "complements" && (
            <div className="ad-form-col">
              <p className="ad-complement-picked">
                {picked.length === 0 && <span className="ad-hint">هنوز مکملی انتخاب نشده؛ از فهرست پایین اضافه کن.</span>}
                {picked.map((id) => {
                  const cp = catalogue.find((x) => x.id === id);
                  if (!cp) return null;
                  return (
                    <span key={id} className="ad-complement-chip">
                      <ProductThumb product={cp} className="w-[26px]" />
                      <span>{cp.name}</span>
                      <button type="button" className="ad-complement-x" aria-label={`حذف ${cp.name}`} onClick={() => setPicked(picked.filter((x) => x !== id))}>
                        <X width={11} height={11} />
                      </button>
                    </span>
                  );
                })}
              </p>
              <div className="ad-comp-search">
                <Search width={13} height={13} />
                <input className="ad-input" value={compQuery} onChange={(e) => setCompQuery(e.target.value)} placeholder="جست‌وجوی کالا برای مکمل…" aria-label="جست‌وجوی کالای مکمل" />
              </div>
              <div className="ad-complement-list">
                {compCandidates.map((cp) => {
                  const on = picked.includes(cp.id);
                  return (
                    <button
                      key={cp.id}
                      type="button"
                      className={cn("ad-complement-pick", on && "is-on")}
                      aria-pressed={on}
                      onClick={() => setPicked(on ? picked.filter((x) => x !== cp.id) : [...picked, cp.id])}
                    >
                      <ProductThumb product={cp} className="w-[34px]" />
                      <span className="ad-complement-name">
                        <b>{cp.name}</b>
                        <small>{GARMENT_LABEL[cp.garment]} · {formatPrice(cp.price)}</small>
                      </span>
                      {on ? <Check width={13} height={13} /> : <Plus width={13} height={13} />}
                    </button>
                  );
                })}
                {compCandidates.length === 0 && <p className="ad-hint">کالایی با این جست‌وجو پیدا نشد.</p>}
              </div>
              <p className="ad-hint">این قطعه‌ها در صفحهٔ محصول، زیر عنوان «با اینا می‌تونی ست کنی»، به‌صورت تصویر بندانگشتی نمایش داده می‌شوند (حداکثر چهار مورد اول).</p>
            </div>
          )}
        </div>

        <footer className="ad-modal-foot">
          {custom && (
            <button type="button" className="ad-btn is-danger" onClick={() => { removeCustomProduct(custom.id); onClose(); }}>
              <Trash2 width={13} height={13} /> حذف محصول
            </button>
          )}
          {product && !custom && productEditOf(product.id) && (
            <button type="button" className="ad-btn is-danger" onClick={() => { resetProductEdit(product.id); onClose(); }}>
              <RotateCcw width={13} height={13} /> بازگرداندن به نسخهٔ اصلی
            </button>
          )}
          <div className="ad-actions-spacer" />
          <button type="button" className="ad-btn" onClick={onClose}>انصراف</button>
          <button type="button" className="ad-btn" onClick={() => save("draft")}>
            <FileText width={13} height={13} /> ذخیرهٔ پیش‌نویس
          </button>
          <button type="button" className="ad-btn is-primary" onClick={() => save("publish")}>
            <Save width={13} height={13} /> {product ? "ذخیره و انتشار" : "ایجاد و انتشار"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ---------- stock matrix modal (any product) ---------- */

function StockModal({ productId, onClose }: { productId: string; onClose: () => void }) {
  const product = liveGetProduct(productId);
  const admin = useAdmin();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!product) return null;
  const isCustom = !!admin.customProducts.find((c) => c.id === productId);

  const setValue = (colorId: string, sizeId: string, qty: number) =>
    setStockUnified(productId, colorId, sizeId, qty, "edit");

  return (
    <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ad-modal" role="dialog" aria-modal="true" aria-label={`موجودی ${product.name}`}>
        <header className="ad-modal-head">
          <div>
            <h3>ویرایش موجودی</h3>
            <p>{product.name} {isCustom ? "· محصول دست‌ساز" : "· محصول پایه"}</p>
          </div>
          <button type="button" className="ad-icon" aria-label="بستن" onClick={onClose}><X width={16} height={16} /></button>
        </header>
        <div className="ad-modal-body">
          {product.colors.map((c) => (
            <div key={c.id} className="ad-stock-group">
              <p className="ad-stock-color"><i style={{ background: c.hex }} /> {c.name}</p>
              <div className="ad-stock-grid">
                {product.sizes.map((s) => {
                  const val = stockOf(product as never, c.id, s.id);
                  return (
                    <label key={s.id} className={cn("ad-stock-cell", val === 0 && "is-out")}>
                      <span>{s.label}</span>
                      <input type="number" min={0} max={999} value={val} aria-label={`موجودی ${s.label}`}
                        onChange={(e) => setValue(c.id, s.id, Math.max(0, Number(e.target.value) || 0))} />
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <footer className="ad-modal-foot">
          <span className="ad-hint">تغییرات فوراً در فروشگاه، رانوی و استایل بیلدر اعمال می‌شود.</span>
          <button type="button" className="ad-btn is-primary" onClick={onClose}><CheckCircle2 width={14} height={14} /> بستن</button>
        </footer>
      </div>
    </div>
  );
}

/* =====================================================================
   inventory
   ===================================================================== */

/* =====================================================================
   customers (CRM)
   ===================================================================== */

interface CustomerRow {
  email: string;
  name: string;
  phone: string;
  city: string;
  orders: number;
  total: number;
  last: number;
  campaigns: string[];
}

function Customers() {
  const admin = useAdmin();
  const [openEmail, setOpenEmail] = useState<string | null>(null);
  const [q, setQ] = useState("");
  /* decision 45: filter by who they are *and* by what they bought */
  const [city, setCity] = useState("");
  const [tag, setTag] = useState("");
  const [spend, setSpend] = useState<"any" | "one" | "repeat" | "high">("any");
  const [campaign, setCampaign] = useState("");

  // "high value" is the top half of the book, not a made-up number
  const avgValue = useMemo(() => {
    const totals = new Map<string, number>();
    for (const o of admin.orders) {
      const key = o.email || o.customer;
      totals.set(key, (totals.get(key) ?? 0) + o.total);
    }
    const list = [...totals.values()].sort((a, b) => b - a);
    return list.length ? list[Math.floor(list.length / 2)] : 0;
  }, [admin.orders]);

  const rows = useMemo<CustomerRow[]>(() => {
    const map = new Map<string, CustomerRow>();
    for (const o of admin.orders) {
      const key = o.email || o.customer;
      const cur = map.get(key) ?? { email: o.email, name: o.customer, phone: o.phone, city: o.city, orders: 0, total: 0, last: 0, campaigns: [] };
      cur.orders += 1;
      cur.total += o.total;
      cur.last = Math.max(cur.last, o.at);
      if (o.campaign && !cur.campaigns.includes(o.campaign)) cur.campaigns.push(o.campaign);
      if (o.customer && o.customer !== "مشتری نمونه") cur.name = o.customer;
      map.set(key, cur);
    }
    let list = [...map.values()].sort((a, b) => b.total - a.total);
    const s = q.trim();
    if (s) list = list.filter((r) => `${r.name} ${r.email} ${r.city} ${r.phone}`.includes(s));
    if (city) list = list.filter((r) => r.city === city);
    if (campaign) list = list.filter((r) => r.campaigns.includes(campaign));
    if (tag) {
      list = list.filter((r) => (admin.customers[r.email || r.name]?.tags ?? []).includes(tag));
    }
    if (spend === "one") list = list.filter((r) => r.orders === 1);
    if (spend === "repeat") list = list.filter((r) => r.orders > 1);
    if (spend === "high") list = list.filter((r) => r.total >= avgValue);
    return list;
  }, [admin.orders, q, city, tag, spend, campaign, admin.customers, avgValue]);

  const avgOrder = admin.orders.length ? Math.round(admin.orders.reduce((n, o) => n + o.total, 0) / admin.orders.length) : 0;
  const segments = [
    { label: "کل مشتریان", value: fa(rows.length) },
    { label: "تکرارکننده", value: fa(rows.filter((r) => r.orders > 1).length) },
    { label: "میانگین سبد", value: formatPrice(avgOrder) },
    { label: "ارزش کل", value: formatPrice(rows.reduce((n, r) => n + r.total, 0)) },
  ];

  return (
    <>
      <PageHead
        title="مشتریان (CRM)"
        sub="مشتریان از سفارش‌ها ساخته می‌شوند؛ برچسب و یادداشت شخصی بزن."
        actions={
          <button
            type="button"
            className="ad-btn is-sm"
            disabled={rows.length === 0}
            onClick={() => {
              // full export: identity, purchase history and the internal note (decision 79)
              const header = ["نام", "ایمیل", "موبایل", "شهر", "تعداد سفارش", "ارزش خرید", "آخرین خرید", "کمپین‌ها", "برچسب‌ها", "یادداشت"];
              const body = rows.map((r) => {
                const meta = admin.customers[r.email || r.name] ?? { tags: [], note: "" };
                return [
                  r.name,
                  r.email,
                  r.phone,
                  r.city,
                  fa(r.orders),
                  r.total,
                  r.last ? new Date(r.last).toLocaleDateString("fa-IR") : "",
                  r.campaigns.join(" / "),
                  (meta.tags ?? []).join(" / "),
                  meta.note ?? "",
                ];
              });
              download(
                "customers.csv",
                "\uFEFF" + [header, ...body].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n"),
                "text/csv",
              );
            }}
          >
            <DIcon width={13} height={13} /> خروجی CSV
          </button>
        }
      />
      <div className="ad-kpis">
        {segments.map((s) => (
          <div key={s.label} className="ad-kpi ad-kpi-static"><b>{s.value}</b><span className="ad-kpi-label">{s.label}</span></div>
        ))}
      </div>
      <input className="ad-input ad-input-inline" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی مشتری…" aria-label="جست‌وجوی مشتری" />
      <div className="ad-filters">
        <select className="ad-select is-compact" value={city} onChange={(e) => setCity(e.target.value)} aria-label="شهر">
          <option value="">همهٔ شهرها</option>
          {[...new Set(admin.orders.map((o) => o.city).filter(Boolean))].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="ad-select is-compact" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="برچسب">
          <option value="">همهٔ برچسب‌ها</option>
          {Object.values(admin.customers).flatMap((c) => c.tags ?? []) .filter((t, i, all) => all.indexOf(t) === i)
            .map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="ad-select is-compact" value={campaign} onChange={(e) => setCampaign(e.target.value)} aria-label="کمپین">
          <option value="">همهٔ کمپین‌ها</option>
          {[...new Set(admin.orders.map((o) => o.campaign).filter(Boolean))].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="ad-select is-compact" value={spend} onChange={(e) => setSpend(e.target.value as typeof spend)} aria-label="سابقهٔ خرید">
          <option value="any">همهٔ خریدها</option>
          <option value="one">فقط یک‌بار خرید</option>
          <option value="repeat">خرید تکرارشده</option>
          <option value="high">بالای میانهٔ ارزش ({formatPrice(avgValue)})</option>
        </select>
        {(city || tag || campaign || spend !== "any" || q) && (
          <button type="button" className="ad-btn is-sm" onClick={() => { setCity(""); setTag(""); setCampaign(""); setSpend("any"); setQ(""); }}>
            پاک کردن فیلترها
          </button>
        )}
        <span className="ad-hint">{fa(rows.length)} مشتری با این فیلتر</span>
      </div>
      {rows.length === 0 ? (
        <Empty text="هنوز مشتری‌ای ثبت نشده. اولین سفارش را از صفحهٔ تسویه حساب بساز." />
      ) : (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead><tr><th>مشتری</th><th>تماس</th><th>شهر</th><th>سفارش</th><th>ارزش خرید</th><th>آخرین</th><th>برچسب</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const meta = admin.customers[r.email || r.name] ?? { tags: [], note: "" };
                const open = openEmail === (r.email || r.name);
                return (
                  <CustomerRowView key={r.email || r.name} r={r} open={open} onToggle={() => setOpenEmail(open ? null : r.email || r.name)} meta={meta} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function CustomerRowView({ r, open, onToggle, meta }: { r: CustomerRow; open: boolean; onToggle: () => void; meta: { tags: string[]; note: string } }) {
  const admin = useAdmin();
  const [tagInput, setTagInput] = useState("");
  const key = r.email || r.name;
  const orders = admin.orders.filter((o) => (o.email || o.customer) === key);
  return (
    <>
      <tr className={cn(open && "is-open")} onClick={onToggle}>
        <td>
          <b>{r.name}</b>
          {r.email && <small dir="ltr">{r.email}</small>}
        </td>
        <td dir="ltr">{r.phone || "—"}</td>
        <td>{r.city || "—"}</td>
        <td>{fa(r.orders)}</td>
        <td className="ad-money">{formatPrice(r.total)}</td>
        <td>{timeAgo(r.last)}</td>
        <td>
          <span className="ad-tags">
            {meta.tags.map((t) => <em key={t}>{t}</em>)}
            {r.orders > 1 && <em className="is-gold">VIP</em>}
          </span>
        </td>
      </tr>
      {open && (
        <tr className="ad-detail-row">
          <td colSpan={7}>
            <div className="ad-detail">
              <div className="ad-detail-col">
                <h4>سفارش‌های {r.name}</h4>
                <ul>
                  {orders.map((o) => (
                    <li key={o.id}>
                      <span dir="ltr">{o.id}</span>
                      <em>{timeAgo(o.at)}</em>
                      <b>{formatPrice(o.total)}</b>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="ad-detail-col">
                <h4>برچسب‌ها و یادداشت</h4>
                <div className="ad-tags-input">
                  <input className="ad-input" value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="برچسب جدید + Enter" aria-label="برچسب"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && tagInput.trim()) {
                        setCustomerMeta(key, { tags: [...new Set([...meta.tags, tagInput.trim()])] });
                        setTagInput("");
                      }
                    }} />
                  <button type="button" className="ad-btn is-sm" onClick={() => { if (tagInput.trim()) { setCustomerMeta(key, { tags: [...new Set([...meta.tags, tagInput.trim()])] }); setTagInput(""); } }}>افزودن</button>
                </div>
                <div className="ad-tags">
                  {meta.tags.map((t) => (
                    <em key={t}>
                      {t}
                      <button type="button" aria-label={`حذف ${t}`} onClick={() => setCustomerMeta(key, { tags: meta.tags.filter((x) => x !== t) })}><X width={10} height={10} /></button>
                    </em>
                  ))}
                </div>
                <textarea className="ad-input ad-note" rows={3} defaultValue={meta.note} placeholder="یادداشت داخلی دربارهٔ این مشتری…" aria-label="یادداشت"
                  onBlur={(e) => setCustomerMeta(key, { note: e.target.value })} />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}


/* =====================================================================
   operational notices (decision 44) — four things the owner must act on.
   Everything here is counted from real records; a section the viewer is not
   allowed to open is not shown at all, and an offline panel says so instead
   of showing a stale number as if it were live.
   ===================================================================== */

type NoticeId = "orders" | "stock" | "payments" | "tickets";

interface OpsNotice {
  id: NoticeId;
  label: string;
  hint: string;
  count: number;
  to: Tab;
  permission: Permission;
  live: boolean;
}

function OpsBell({ onGo }: { onGo: (tab: Tab) => void }) {
  const admin = useAdmin();
  const ops = useOps();
  const session = useAdminMe();
  const [open, setOpen] = useState(false);
  const [serverOrders, setServerOrders] = useState<{ id: string; status: string; createdAt: string }[] | null>(null);
  const [failedPayments, setFailedPayments] = useState<number | null>(null);
  const [liveError, setLiveError] = useState("");

  const offline = session.offline;
  useEffect(() => {
    if (offline) return;
    let cancelled = false;
    const pull = async () => {
      try {
        const { api } = await import("@/lib/api");
        const [orders, payments] = await Promise.all([
          api.get<{ id: string; status: string; createdAt: string }[]>("/api/commerce/orders?all=1&limit=100"),
          api.get<{ status: string; createdAt: string }[]>("/api/commerce/admin/payments?status=failed"),
        ]);
        if (cancelled) return;
        setServerOrders(Array.isArray(orders) ? orders : []);
        const weekAgo = Date.now() - 7 * 86400000;
        setFailedPayments(
          (Array.isArray(payments) ? payments : []).filter((p) => new Date(p.createdAt).getTime() >= weekAgo).length,
        );
        setLiveError("");
      } catch (error) {
        if (cancelled) return;
        setLiveError(error instanceof Error ? error.message : "اتصال به سرور برقرار نشد");
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 60000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [offline]);

  const since = Date.now() - 48 * 3600000;
  // before the server answers (or offline) fall back to the mirrored document and say so
  const newOrders = serverOrders
    ? serverOrders.filter((o) => o.status === "pending" && new Date(o.createdAt).getTime() >= since).length
    : admin.orders.filter((o) => o.status === "pending").length;
  const lowStock = liveCatalog().filter((p) => isLowStock(p.id, totalStock(p))).length;
  const unanswered = ops.tickets.filter((t) => t.status === "open").length;

  const allNotices: OpsNotice[] = [
    {
      id: "orders",
      label: "سفارش تازه در انتظار پرداخت",
      hint: "سفارش‌های ۴۸ ساعت گذشته که هنوز پرداخت نشده‌اند",
      count: newOrders,
      to: "orders",
      permission: "orders:view",
      live: !!serverOrders,
    },
    {
      id: "stock",
      label: "محصول کم‌موجود",
      hint: "زیر آستانهٔ تعیین‌شده در تنظیمات یا آستانهٔ خودِ محصول",
      count: lowStock,
      to: "products",
      permission: "inventory:view",
      live: true,
    },
    {
      id: "payments",
      label: "پرداخت ناموفق (۷ روز)",
      hint: "تلاش‌های ناموفق پرداخت که ممکن است مشتری را از دست داده باشد",
      count: failedPayments ?? 0,
      to: "commerce",
      permission: "finance:view",
      live: failedPayments !== null,
    },
    {
      id: "tickets",
      label: "تیکت بی‌پاسخ",
      hint: "تیکت‌هایی که آخرین پیام از مشتری است",
      count: unanswered,
      to: "tickets",
      permission: "customers:view",
      live: true,
    },
  ];
  const notices = allNotices.filter((n) => can(session.permissions, n.permission));

  const total = notices.reduce((sum, n) => sum + n.count, 0);

  return (
    <div className="ad-bell">
      <button
        type="button"
        className={cn("ad-btn is-sm", total > 0 && "is-attention")}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={total > 0 ? `${fa(total)} اعلان عملیاتی` : "اعلان عملیاتی نداریم"}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell width={14} height={14} />
        <span className="ad-top-btn-label">اعلان‌ها</span>
        {total > 0 && <em className="ad-bell-count">{fa(total)}</em>}
      </button>
      {open && (
        <>
          <div className="ad-bell-scrim" onClick={() => setOpen(false)} aria-hidden />
          <div className="ad-bell-pop" role="dialog" aria-label="اعلان‌های عملیاتی">
            <header>
              <b>اعلان‌های عملیاتی</b>
              <button type="button" className="ad-icon" aria-label="بستن" onClick={() => setOpen(false)}>
                <X width={14} height={14} />
              </button>
            </header>
            {liveError && (
              <p className="ad-bell-note">
                اعداد سرور خوانده نشد ({liveError})؛ فقط دادهٔ همین پنل نمایش داده می‌شود.
              </p>
            )}
            {total === 0 && <p className="ad-bell-empty">کاری برای انجام نیست.</p>}
            {notices.map((n) => (
              <button
                key={n.id}
                type="button"
                className="ad-bell-row"
                onClick={() => {
                  onGo(n.to);
                  setOpen(false);
                }}
              >
                <span className={cn("ad-bell-dot", n.count > 0 && "is-on")} />
                <span className="ad-bell-main">
                  <b>{n.label}</b>
                  <small>{n.hint}</small>
                  {!n.live && <small className="ad-bell-stale">عدد از نسخهٔ پنل است، نه سرور</small>}
                </span>
                <em>{fa(n.count)}</em>
              </button>
            ))}
            <p className="ad-bell-foot">هر ۶۰ ثانیه از سرور تازه می‌شود.</p>
          </div>
        </>
      )}
    </div>
  );
}

/* =====================================================================
   campaigns + rules + codes
   ===================================================================== */

function Campaigns() {
  const admin = useAdmin();
  const [tab, setTab] = useState<"campaigns" | "rules" | "codes" | "preview">("campaigns");
  const [campDraft, setCampDraft] = useState<Campaign | null>(null);
  const [ruleDraft, setRuleDraft] = useState<DiscountRule | null>(null);
  const [codeDraft, setCodeDraft] = useState<Coupon | null>(null);

  return (
    <>
      <PageHead
        title="جشنواره و تخفیف"
        sub="جشنواره‌ها بنر فروشگاه را روشن می‌کنند و در تسویه حساب خودکار اعمال می‌شوند؛ قوانین به‌صورت پنهان روی سبد اثر دارند."
        actions={
          <>
            <button type="button" className="ad-btn is-sm is-primary" onClick={() => setCampDraft(blankCampaign())}><Megaphone width={13} height={13} /> جشنوارهٔ جدید</button>
            <button type="button" className="ad-btn is-sm" onClick={() => setRuleDraft(blankRule())}><Tags width={13} height={13} /> قانون جدید</button>
          </>
        }
      />
      <div className="ad-filters">
        {([["campaigns", "جشنواره‌ها"], ["rules", "قوانین تخفیف"], ["codes", "کدها"], ["preview", "پیش‌نمایش زنده"]] as const).map(([id, label]) => (
          <button key={id} type="button" className={cn("ad-chip", tab === id && "is-on")} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "campaigns" && (
        <div className="ad-cards">
          {admin.campaigns.length === 0 && <Empty text="جشنواره‌ای نداره. یکی بساز تا بنر بالای فروشگاه روشن شود." />}
          {admin.campaigns.map((c) => (
            <article key={c.id} className={cn("ad-card-inline", !c.active && "is-off")}>
              <span className={cn("ad-dot", c.active ? "is-on" : "")} />
              <div className="ad-card-inline-main">
                <b>{c.name}</b>
                <small>
                  {c.kind === "percent" ? `${fa(c.value)}٪` : c.kind === "fixed" ? `${fa(c.value)} تومان` : "ارسال رایگان"}
                  {c.minSpend > 0 && ` · حداقل سبد ${fa(c.minSpend)} تومان`}
                  {!!c.maxDiscount && ` · سقف ${fa(c.maxDiscount)} تومان`}
                  {` · ${SCOPE_LABEL[c.scope]}`}
                  {/* how many products this campaign actually touches (decision 43) */}
                  {` · ${fa(liveCatalog().filter((p) => (c.scope === "category" ? p.category === c.scopeId : c.scope === "look" ? p.lookId === c.scopeId : true)).length)} محصول مشمول`}
                  {c.code && ` · کد ${c.code}`}
                  {` · ${fa(c.uses)} بار`}
                </small>
                <small className="ad-range" dir="ltr">{c.start} ← {c.end}</small>
              </div>
              <div className="ad-product-actions">
                <button type="button" className={cn("ad-icon", c.banner.active && "is-on")} title="بنر بالای سایت" aria-label="بنر" aria-pressed={c.banner.active}
                  onClick={() => saveCampaign({ ...c, banner: { ...c.banner, active: !c.banner.active } })}><Megaphone width={14} height={14} /></button>
                <button type="button" className={cn("ad-icon", c.active ? "is-on" : "")} title="فعال/غیرفعال" aria-pressed={c.active}
                  onClick={() => saveCampaign({ ...c, active: !c.active })}><CheckCircle2 width={14} height={14} /></button>
                <button type="button" className="ad-icon" title="ویرایش" aria-label="ویرایش" onClick={() => setCampDraft(c)}><ClipboardList width={14} height={14} /></button>
                <button type="button" className="ad-icon is-danger" title="حذف" aria-label="حذف" onClick={() => removeCampaign(c.id)}><Trash2 width={14} height={14} /></button>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "rules" && (
        <div className="ad-cards">
          {admin.rules.map((r) => (
            <article key={r.id} className={cn("ad-card-inline", !r.active && "is-off")}>
              <span className={cn("ad-dot", r.active ? "is-on" : "")} />
              <div className="ad-card-inline-main">
                <b>{r.name}</b>
                <small>
                  {RULE_TYPE_LABEL[r.type]}
                  {r.type === "percent" && ` ${fa(r.value)}٪`}
                  {r.type === "fixed" && ` ${fa(r.value)} تومان`}
                  {r.type === "second" && ` ${fa(r.value)}٪ روی دوم`}
                  {r.type === "bundle" && ` ${fa(r.qty)} عدد = ${fa(r.value)} تومان`}
                  {r.type === "freeship" && ` بالای ${fa(r.value)} تومان`}
                  {` · ${SCOPE_LABEL[r.scope]}`}
                  {r.stackable && " · قابل جمع‌بندی"}
                </small>
              </div>
              <div className="ad-product-actions">
                <button type="button" className={cn("ad-icon", r.active ? "is-on" : "")} title="فعال/غیرفعال" aria-pressed={r.active} onClick={() => saveRule({ ...r, active: !r.active })}><CheckCircle2 width={14} height={14} /></button>
                <button type="button" className="ad-icon" title="ویرایش" aria-label="ویرایش" onClick={() => setRuleDraft(r)}><ClipboardList width={14} height={14} /></button>
                <button type="button" className="ad-icon is-danger" title="حذف" aria-label="حذف" onClick={() => removeRule(r.id)}><Trash2 width={14} height={14} /></button>
              </div>
            </article>
          ))}
          {admin.rules.length === 0 && <Empty text="قانونی تعریف نشده." />}
        </div>
      )}

      {tab === "codes" && (
        <div className="ad-cards">
          <button type="button" className="ad-btn is-sm is-primary ad-full" onClick={() => setCodeDraft({ id: `c${uid()}`, code: "", kind: "percent", value: 10, minSpend: 0, active: true, expires: "", uses: 0 })}>
            <Plus width={13} height={13} /> کد جدید
          </button>
          {admin.coupons.map((c) => (
            <article key={c.id} className={cn("ad-card-inline", !c.active && "is-off")}>
              <span className={cn("ad-dot", c.active ? "is-on" : "")} />
              <div className="ad-card-inline-main">
                <b dir="ltr">{c.code}</b>
                <small>
                  {c.kind === "percent" ? `${fa(c.value)}٪` : `${fa(c.value)} تومان`}
                  {c.minSpend > 0 && ` · حداقل ${fa(c.minSpend)}`}
                  {!!c.maxDiscount && ` · سقف ${fa(c.maxDiscount)}`}
                  {c.usageLimit != null && c.usageLimit > 0 && ` · ${fa(c.uses)} از ${fa(c.usageLimit)}`}
                  {c.expires && ` · تا ${c.expires}`}
                  {c.usageLimit == null && ` · ${fa(c.uses)} بار`}
                </small>
              </div>
              <div className="ad-product-actions">
                <button type="button" className={cn("ad-icon", c.active ? "is-on" : "")} title="فعال/غیرفعال" aria-pressed={c.active} onClick={() => saveCoupon({ ...c, active: !c.active })}><CheckCircle2 width={14} height={14} /></button>
                <button type="button" className="ad-icon" title="ویرایش" aria-label="ویرایش" onClick={() => setCodeDraft(c)}><ClipboardList width={14} height={14} /></button>
                <button type="button" className="ad-icon is-danger" title="حذف" aria-label="حذف" onClick={() => removeCoupon(c.id)}><Trash2 width={14} height={14} /></button>
              </div>
            </article>
          ))}
        </div>
      )}

      {tab === "preview" && <DiscountPreview />}

      {campDraft && <CampaignModal initial={campDraft} onClose={() => setCampDraft(null)} />}
      {ruleDraft && <RuleModal initial={ruleDraft} onClose={() => setRuleDraft(null)} />}
      {codeDraft && <CodeModal initial={codeDraft} onClose={() => setCodeDraft(null)} />}
    </>
  );
}

function DiscountPreview() {
  const [count, setCount] = useState(3);
  const catalog = liveCatalog();
  const lines = catalog.slice(0, Math.min(6, Math.max(1, count))).map((p) => ({ productId: p.id, name: p.name, price: p.price, qty: 1 }));
  const r = computeDiscounts(lines);
  return (
    <Card title="پیش‌نمایش اثر روی سبد نمونه" icon={<Eye width={14} height={14} />}>
      <p className="ad-hint mb-2">این جدول دقیقاً همان چیزی است که مشتری در تسویه حساب می‌بیند. تعداد را عوض کن.</p>
      <label className="ad-field ad-inline">تعداد اقلام نمونه
        <input type="range" min={1} max={6} value={count} onChange={(e) => setCount(Number(e.target.value))} />
      </label>
      <div className="ad-table-wrap">
        <table className="ad-table">
          <thead><tr><th>ماده</th><th>مبلغ</th></tr></thead>
          <tbody>
            <tr><td>جمع اقلام ({fa(r.subtotal)})</td><td>{formatPrice(r.subtotal)}</td></tr>
            {r.applied.map((d) => (
              <tr key={d.id}><td className="text-emerald-700">{d.name} — {d.note}</td><td>− {formatPrice(d.amount)}</td></tr>
            ))}
            <tr><td>ارسال {r.freeship ? "رایگان" : "—"}</td><td>{r.freeship ? "رایگان" : "—"}</td></tr>
            <tr className="is-total"><td>مبلغ نهایی</td><td>{formatPrice(r.afterDiscount)}</td></tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const blankCampaign = (): Campaign => ({
  id: `cmp-${uid()}`,
  name: "جشنوارهٔ جدید",
  start: today(),
  end: today(14),
  kind: "percent",
  value: 10,
  minSpend: 0,
  scope: "all",
  banner: { title: "جشنواره", text: "", active: false, tone: "gold" },
  active: true,
  uses: 0,
});

function CampaignModal({ initial, onClose }: { initial: Campaign; onClose: () => void }) {
  const [c, setC] = useState(initial);
  const isExisting = !!getAdmin().campaigns.find((x) => x.id === c.id);
  return (
    <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ad-modal" role="dialog" aria-modal="true" aria-label="جشنواره">
        <header className="ad-modal-head">
          <div><h3>{isExisting ? "ویرایش جشنواره" : "جشنوارهٔ جدید"}</h3><p>جشنواره‌ها با بنر، کد و بازهٔ تاریخ روی فروشگاه اثر دارند.</p></div>
          <button type="button" className="ad-icon" aria-label="بستن" onClick={onClose}><X width={16} height={16} /></button>
        </header>
        <div className="ad-modal-body">
          <label className="ad-field">نام جشنواره<input className="ad-input" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></label>
          <div className="ad-two">
            <label className="ad-field">از تاریخ<input className="ad-input" type="date" dir="ltr" value={c.start} onChange={(e) => setC({ ...c, start: e.target.value })} /></label>
            <label className="ad-field">تا تاریخ<input className="ad-input" type="date" dir="ltr" value={c.end} onChange={(e) => setC({ ...c, end: e.target.value })} /></label>
          </div>
          <div className="ad-three">
            <label className="ad-field">نوع
              <select className="ad-select" value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value as Campaign["kind"] })}>
                <option value="percent">درصدی</option><option value="fixed">مبلغ ثابت</option><option value="freeship">ارسال رایگان</option>
              </select>
            </label>
            <label className="ad-field">مقدار<input className="ad-input" type="number" min={0} value={c.value} onChange={(e) => setC({ ...c, value: Number(e.target.value) || 0 })} /></label>
            <label className="ad-field">حداقل خرید<input className="ad-input" type="number" min={0} value={c.minSpend} onChange={(e) => setC({ ...c, minSpend: Number(e.target.value) || 0 })} /></label>
          </div>
          {c.kind === "percent" && (
            <label className="ad-field">
              سقف تخفیف هر قلم (تومان) — ۰ یعنی بی‌سقف
              <input className="ad-input" type="number" min={0} value={c.maxDiscount ?? 0} onChange={(e) => setC({ ...c, maxDiscount: Number(e.target.value) || 0 })} />
              <small className="ad-hint">مثلاً «۲۰٪ با سقف ۳۰۰٬۰۰۰ تومان»: روی سبد بزرگ بیشتر از این عدد کم نمی‌شود.</small>
            </label>
          )}
          <div className="ad-two">
            <label className="ad-field">دامنه
              <select className="ad-select" value={c.scope} onChange={(e) => setC({ ...c, scope: e.target.value as Scope })}>
                <option value="all">کل فروشگاه</option><option value="category">یک دسته</option><option value="look">یک استایل</option>
              </select>
            </label>
            {c.scope === "category" && (
              <label className="ad-field">دسته
                <select className="ad-select" value={c.scopeId ?? ""} onChange={(e) => setC({ ...c, scopeId: e.target.value })}>
                  <option value="">انتخاب…</option>
                  {["پالتو / کاپشن", "بافت", "تی‌شرت / تاپ", "پیراهن", "دامن", "شلوار", "کیف", "کفش", "اکسسوری"].map((c2) => <option key={c2}>{c2}</option>)}
                </select>
              </label>
            )}
            {c.scope === "look" && (
              <label className="ad-field">استایل
                <select className="ad-select" value={c.scopeId ?? ""} onChange={(e) => setC({ ...c, scopeId: e.target.value })}>
                  <option value="">انتخاب…</option>
                  {LOOKS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <label className="ad-field">کد تخفیف (اختیاری — با این کد مشتری جشنواره را اعمال می‌کند)
            <input className="ad-input" dir="ltr" value={c.code ?? ""} onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase() })} placeholder="AUTUMN15" />
          </label>
          <label className="ad-check"><input type="checkbox" checked={c.active} onChange={(e) => setC({ ...c, active: e.target.checked })} /> فعال باشد</label>
          <label className="ad-check"><input type="checkbox" checked={c.banner.active} onChange={(e) => setC({ ...c, banner: { ...c.banner, active: e.target.checked } })} /> بنر بالای سایت روشن شود</label>
          {c.banner.active && (
            <div className="ad-two">
              <label className="ad-field">عنوان بنر<input className="ad-input" value={c.banner.title} onChange={(e) => setC({ ...c, banner: { ...c.banner, title: e.target.value } })} /></label>
              <label className="ad-field">متن بنر<input className="ad-input" value={c.banner.text} onChange={(e) => setC({ ...c, banner: { ...c.banner, text: e.target.value } })} /></label>
            </div>
          )}
        </div>
        <footer className="ad-modal-foot">
          <div className="ad-actions-spacer" />
          <button type="button" className="ad-btn" onClick={onClose}>انصراف</button>
          <button type="button" className="ad-btn is-primary" onClick={() => { saveCampaign(c); onClose(); }}><Save width={13} height={13} /> ذخیره</button>
        </footer>
      </div>
    </div>
  );
}

const blankRule = (): DiscountRule => ({ id: `rule-${uid()}`, name: "قانون جدید", type: "percent", value: 10, qty: 2, scope: "all", minItems: 1, stackable: true, active: true, priority: 5 });

function RuleModal({ initial, onClose }: { initial: DiscountRule; onClose: () => void }) {
  const [r, setR] = useState(initial);
  return (
    <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ad-modal is-sm" role="dialog" aria-modal="true" aria-label="قانون تخفیف">
        <header className="ad-modal-head">
          <div><h3>قانون تخفیف</h3><p>به‌صورت خودکار روی سندهای مطابق دامنه اعمال می‌شود.</p></div>
          <button type="button" className="ad-icon" aria-label="بستن" onClick={onClose}><X width={16} height={16} /></button>
        </header>
        <div className="ad-modal-body">
          <label className="ad-field">نام<input className="ad-input" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></label>
          <label className="ad-field">نوع
            <select className="ad-select" value={r.type} onChange={(e) => setR({ ...r, type: e.target.value as RuleType })}>
              {(Object.keys(RULE_TYPE_LABEL) as RuleType[]).map((t) => <option key={t} value={t}>{RULE_TYPE_LABEL[t]}</option>)}
            </select>
          </label>
          <div className="ad-two">
            <label className="ad-field">
              {r.type === "bundle" ? "قیمت مجموع" : r.type === "freeship" ? "آستانهٔ ارسال (واحد پایه)" : r.type === "percent" ? "درصد" : r.type === "second" ? "درصد تخفیف دوم" : "مبلغ (واحد پایه)"}
              <input className="ad-input" type="number" min={0} value={r.value} onChange={(e) => setR({ ...r, value: Number(e.target.value) || 0 })} />
            </label>
            {r.type === "bundle" && (
              <label className="ad-field">تعداد (X عدد)
                <input className="ad-input" type="number" min={2} value={r.qty} onChange={(e) => setR({ ...r, qty: Math.max(2, Number(e.target.value) || 2) })} />
              </label>
            )}
          </div>
          <div className="ad-two">
            <label className="ad-field">دامنه
              <select className="ad-select" value={r.scope} onChange={(e) => setR({ ...r, scope: e.target.value as Scope })}>
                <option value="all">کل فروشگاه</option><option value="category">یک دسته</option><option value="look">یک استایل</option>
              </select>
            </label>
            {r.scope === "category" && (
              <label className="ad-field">دسته
                <select className="ad-select" value={r.scopeId ?? ""} onChange={(e) => setR({ ...r, scopeId: e.target.value })}>
                  <option value="">انتخاب…</option>
                  {["پالتو / کاپشن", "بافت", "تی‌شرت / تاپ", "پیراهن", "دامن", "شلوار", "کیف", "کفش", "اکسسوری"].map((c2) => <option key={c2}>{c2}</option>)}
                </select>
              </label>
            )}
            {r.scope === "look" && (
              <label className="ad-field">استایل
                <select className="ad-select" value={r.scopeId ?? ""} onChange={(e) => setR({ ...r, scopeId: e.target.value })}>
                  <option value="">انتخاب…</option>
                  {LOOKS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <div className="ad-two">
            <label className="ad-field">حداقل تعداد اقلام<input className="ad-input" type="number" min={1} value={r.minItems} onChange={(e) => setR({ ...r, minItems: Math.max(1, Number(e.target.value) || 1) })} /></label>
            <label className="ad-field">اولویت<input className="ad-input" type="number" min={1} max={100} value={r.priority} onChange={(e) => setR({ ...r, priority: Number(e.target.value) || 1 })} /></label>
          </div>
          <label className="ad-check"><input type="checkbox" checked={r.stackable} onChange={(e) => setR({ ...r, stackable: e.target.checked })} /> با بقیهٔ تخفیف‌ها جمع شود</label>
          <label className="ad-check"><input type="checkbox" checked={r.active} onChange={(e) => setR({ ...r, active: e.target.checked })} /> فعال باشد</label>
        </div>
        <footer className="ad-modal-foot">
          <div className="ad-actions-spacer" />
          <button type="button" className="ad-btn" onClick={onClose}>انصراف</button>
          <button type="button" className="ad-btn is-primary" onClick={() => { saveRule(r); onClose(); }}><Save width={13} height={13} /> ذخیره</button>
        </footer>
      </div>
    </div>
  );
}

function CodeModal({ initial, onClose }: { initial: Coupon; onClose: () => void }) {
  const [c, setC] = useState(initial);
  const [bulk, setBulk] = useState(0);
  const isExisting = !!getAdmin().coupons.find((x) => x.id === c.id);
  const clean = (code: string) => code.trim().toUpperCase();
  const save = () => {
    const code = clean(c.code);
    saveCoupon({ ...c, code });
    if (bulk > 1) {
      // hand-written base code + N-1 short siblings, all with the same rules
      const extra: Coupon[] = [];
      const taken = getAdmin().coupons.map((x) => x.code.toUpperCase()).concat([code]);
      for (let i = 1; i < bulk; i += 1) {
        const sibling = generateCouponCode(taken);
        taken.push(sibling);
        extra.push({ ...c, id: `c${uid()}-${i}`, code: sibling, uses: 0 });
      }
      saveCoupons(extra);
    }
    onClose();
  };
  return (
    <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ad-modal is-sm" role="dialog" aria-modal="true" aria-label="کد تخفیف">
        <header className="ad-modal-head">
          <div><h3>{isExisting ? "ویرایش کد" : "کد تخفیف جدید"}</h3><p>در صفحهٔ تسویه حساب با این کد اعمال می‌شود.</p></div>
          <button type="button" className="ad-icon" aria-label="بستن" onClick={onClose}><X width={16} height={16} /></button>
        </header>
        <div className="ad-modal-body">
          <label className="ad-field">
            کد
            <div className="ad-inline" style={{ gap: 8 }}>
              <input className="ad-input" dir="ltr" value={c.code} onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase() })} placeholder="SAVE10" />
              <button type="button" className="ad-btn is-sm" onClick={() => setC({ ...c, code: generateCouponCode() })} disabled={isExisting}>
                <Sparkles width={13} height={13} /> ساخت خودکار
              </button>
            </div>
            <small className="ad-hint">می‌توانی خودت بنویسی یا بسپاری به دکمهٔ «ساخت خودکار» — تکراری ساخته نمی‌شود.</small>
          </label>
          <div className="ad-two">
            <label className="ad-field">نوع
              <select className="ad-select" value={c.kind} onChange={(e) => setC({ ...c, kind: e.target.value as "percent" | "fixed" })}>
                <option value="percent">درصدی</option><option value="fixed">مبلغ ثابت</option>
              </select>
            </label>
            <label className="ad-field">مقدار<input className="ad-input" type="number" min={1} value={c.value} onChange={(e) => setC({ ...c, value: Number(e.target.value) || 0 })} /></label>
          </div>
          <div className="ad-two">
            <label className="ad-field">حداقل خرید<input className="ad-input" type="number" min={0} value={c.minSpend} onChange={(e) => setC({ ...c, minSpend: Number(e.target.value) || 0 })} /></label>
            <label className="ad-field">انقضا (اختیاری)<input className="ad-input" type="date" dir="ltr" value={c.expires} onChange={(e) => setC({ ...c, expires: e.target.value })} /></label>
          </div>
          <div className="ad-two">
            <label className="ad-field">
              سقف تخفیف (تومان) — ۰ یعنی بی‌سقف
              <input className="ad-input" type="number" min={0} value={c.maxDiscount ?? 0} onChange={(e) => setC({ ...c, maxDiscount: Number(e.target.value) || 0 })} />
            </label>
            <label className="ad-field">
              سقف تعداد استفاده (خالی = نامحدود)
              <input className="ad-input" type="number" min={0} value={c.usageLimit ?? ""} onChange={(e) => setC({ ...c, usageLimit: e.target.value === "" ? undefined : Number(e.target.value) || 0 })} />
            </label>
          </div>
          {!isExisting && (
            <label className="ad-field">
              تعداد کد در این نوبت
              <input className="ad-input" type="number" min={1} max={50} value={bulk || 1} onChange={(e) => setBulk(Math.min(50, Math.max(1, Number(e.target.value) || 1)))} />
              <small className="ad-hint">
                {(bulk || 1) > 1
                  ? `کد نوشته‌شده + ${fa((bulk || 1) - 1)} کد خودکار با همین قوانین ساخته می‌شود (برای پخش بین مشتری‌ها).`
                  : "بیشتر از ۱ بگذاری، همان تعداد کد با همین قوانین ساخته می‌شود."}
              </small>
            </label>
          )}
          <label className="ad-check"><input type="checkbox" checked={c.active} onChange={(e) => setC({ ...c, active: e.target.checked })} /> فعال باشد</label>
        </div>
        <footer className="ad-modal-foot">
          <div className="ad-actions-spacer" />
          <button type="button" className="ad-btn" onClick={onClose}>انصراف</button>
          <button type="button" className="ad-btn is-primary" disabled={!clean(c.code)} onClick={save}><Save width={13} height={13} /> ذخیره</button>
        </footer>
      </div>
    </div>
  );
}

/* =====================================================================
   messages / reviews
   ===================================================================== */


/* =====================================================================
   SMS (decisions 46 + 72)

   The shop has no SMS provider wired to the server, so this screen never
   claims a send. It writes the template, fills it per order/customer and hands
   the finished text to the phone's SMS app (sms: link) or the clipboard, and
   records what was prepared. When a provider is connected the same template
   feeds the server-side sender — that part is not pretending to exist today.
   ===================================================================== */

const ORDER_STATUS_SMS_ID = "order-status";

const SMS_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "در انتظار پرداخت",
  processing: "در حال آماده‌سازی",
  shipped: "ارسال شد",
  done: "تحویل شد",
  cancelled: "لغو شد",
  exception: "در حال بررسی مالی",
};

function fillTemplate(body: string, values: Record<string, string>) {
  return body.replace(/{{\s*(\w+)\s*}}/g, (_match, key: string) => values[key] ?? "");
}

function SmsPanel() {
  const admin = useAdmin();
  const ops = useOps();
  const [tab, setTab] = useState<"templates" | "single" | "bulk">("templates");
  const [orderId, setOrderId] = useState(admin.orders[0]?.id ?? "");
  const [audience, setAudience] = useState<"all" | string>("all");
  const [bulkBody, setBulkBody] = useState("");
  const [bulkName, setBulkName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [prepared, setPrepared] = useState<{ id: string; name: string; body: string; audience: string; recipients: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const statusTemplate =
    ops.smsTemplates.find((t) => t.id === ORDER_STATUS_SMS_ID)?.body ??
    "{{name}} عزیز، وضعیت سفارش {{order}} به «{{status}}» تغییر کرد. ولور";

  const order = admin.orders.find((o) => o.id === orderId) ?? admin.orders[0];
  const orderText = order
    ? fillTemplate(statusTemplate, {
        name: order.customer,
        order: order.id,
        status: SMS_STATUS_LABEL[order.status] ?? order.status,
      })
    : "";

  const taggedCustomers = [...new Set(admin.orders.map((o) => o.email))];
  const audienceList = audience === "all" ? taggedCustomers : taggedCustomers.filter((email) => admin.customers[email]?.tags?.includes(audience));
  const bulkText = fillTemplate(bulkBody, { name: "مشتری", store: admin.settings.name });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const prepareBulk = () => {
    if (!bulkText.trim() || !audienceList.length || !confirmed) return;
    const campaign = {
      id: `sms-${uid()}`,
      at: Date.now(),
      name: bulkName.trim() || "پیام گروهی",
      body: bulkText,
      audience: audience === "all" ? "همهٔ مشتریان" : audience,
      recipients: audienceList.length,
      sent: 0,
      status: "prepared" as const,
    };
    logSmsCampaign(campaign);
    setPrepared({ id: campaign.id, name: campaign.name, body: campaign.body, audience: campaign.audience, recipients: campaign.recipients });
    setConfirmed(false);
    setBulkName("");
  };

  return (
    <>
      <PageHead
        title="پیامک"
        sub="متن آماده می‌شود و با اپ پیامک گوشی یا کپی/پیست فرستاده می‌شود؛ تا وقتی درگاه پیامک به سرور وصل نشود، هیچ ارسالی از سرور انجام نمی‌شود و پنل هم ادعایش نمی‌کند."
      />
      <div className="ad-filters">
        {([["templates", "متن‌های آماده"], ["single", "پیام یک سفارش"], ["bulk", "پیام گروهی"]] as const).map(([id, label]) => (
          <button key={id} type="button" className={cn("ad-chip", tab === id && "is-on")} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === "templates" && (
        <>
          <Card title="متن وضعیت سفارش" icon={<Send width={14} height={14} />}>
            <label className="ad-field">
              متن پیام (متغیرها: <code dir="ltr">{"{{name}} {{order}} {{status}}"}</code>)
              <textarea
                className="ad-input"
                rows={4}
                value={statusTemplate}
                onChange={(e) =>
                  saveSmsTemplate({ id: ORDER_STATUS_SMS_ID, name: "وضعیت سفارش", body: e.target.value })
                }
                aria-label="متن پیام وضعیت سفارش"
              />
              <small className="ad-hint">
                همین متن در صفحهٔ هر سفارش با نام مشتری و وضعیت واقعی پر می‌شود؛ چیزی از خودش نمی‌سازد.
              </small>
            </label>
          </Card>
          <Card title="متن‌های آمادهٔ دیگر" icon={<ClipboardList width={14} height={14} />}>
            {ops.smsTemplates.filter((t) => t.id !== ORDER_STATUS_SMS_ID).map((t) => (
              <div key={t.id} className="ad-field">
                <input className="ad-input" value={t.name} aria-label="نام متن" onChange={(e) => saveSmsTemplate({ ...t, name: e.target.value })} />
                <textarea
                  className="ad-input"
                  rows={2}
                  value={t.body}
                  aria-label={`متن ${t.name}`}
                  onChange={(e) => saveSmsTemplate({ ...t, body: e.target.value })}
                />
                <button type="button" className="ad-btn is-sm is-danger" onClick={() => removeSmsTemplate(t.id)}>حذف</button>
              </div>
            ))}
            <button
              type="button"
              className="ad-btn is-sm"
              onClick={() => saveSmsTemplate({ id: `sms-${uid()}`, name: "متن تازه", body: "" })}
            >
              <Plus width={13} height={13} /> متن تازه
            </button>
          </Card>
        </>
      )}

      {tab === "single" && (
        <Card title="پیام برای یک سفارش" icon={<Send width={14} height={14} />}>
          {admin.orders.length === 0 ? (
            <Empty text="سفارشی نیست." />
          ) : (
            <>
              <label className="ad-field">
                سفارش
                <select className="ad-select" value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                  {admin.orders.map((o) => (
                    <option key={o.id} value={o.id}>{o.id} — {o.customer} ({ORDER_STATUS_LABEL[o.status]})</option>
                  ))}
                </select>
              </label>
              <p className="ad-field-label">متن آماده</p>
              <p className="ad-note-text">{orderText}</p>
              <div className="ad-actions">
                <a className="ad-btn is-sm is-primary" href={`sms:${order?.phone ?? ""}?body=${encodeURIComponent(orderText)}`}>
                  <Send width={13} height={13} /> باز کردن اپ پیامک
                </a>
                <button type="button" className="ad-btn is-sm" onClick={() => void copy(orderText)}>
                  {copied ? "کپی شد" : "کپی متن"}
                </button>
                {order?.tracking && <span className="ad-hint">کد رهگیری: <b dir="ltr">{order.tracking}</b></span>}
              </div>
            </>
          )}
        </Card>
      )}

      {tab === "bulk" && (
        <Card title="پیام گروهی" icon={<Users width={14} height={14} />}>
          <div className="ad-two">
            <label className="ad-field">
              نام این ارسال
              <input className="ad-input" value={bulkName} onChange={(e) => setBulkName(e.target.value)} placeholder="اطلاع جشنوارهٔ پاییز" />
            </label>
            <label className="ad-field">
              مخاطبان
              <select className="ad-select" value={audience} onChange={(e) => setAudience(e.target.value)}>
                <option value="all">همهٔ مشتریان با سفارش</option>
                {ops.labels.map((label) => (
                  <option key={label.id} value={label.id}>برچسب: {label.name}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="ad-field">
            متن پیام
            <textarea
              className="ad-input"
              rows={4}
              value={bulkBody}
              onChange={(e) => setBulkBody(e.target.value)}
              placeholder="مشتری عزیز، جشنوارهٔ پاییز شروع شد…"
            />
          </label>
          <p className="ad-hint">
            {fa(audienceList.length)} گیرندهٔ واجد شرایط. ارسال گروهی فقط با تأیید صریح ثبت می‌شود.
          </p>
          <label className="ad-check">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            تأیید می‌کنم این متن برای {fa(audienceList.length)} نفر آماده شود
          </label>
          <div className="ad-actions">
            <button
              type="button"
              className="ad-btn is-primary"
              disabled={!confirmed || !bulkText.trim() || !audienceList.length}
              onClick={prepareBulk}
            >
              <Send width={13} height={13} /> آماده‌سازی و ثبت
            </button>
          </div>
          {prepared && (
            <div className="ad-note-add">
              <p className="ad-note-text">{prepared.body}</p>
              <div className="ad-actions">
                <button type="button" className="ad-btn is-sm" onClick={() => void copy(prepared.body)}>
                  {copied ? "کپی شد" : "کپی متن برای اپ پیامک"}
                </button>
                <span className="ad-hint">
                  برای {fa(prepared.recipients)} نفر آماده شد. تا اتصال درگاه پیامک، ارسال دستی از گوشی انجام می‌شود.
                </span>
              </div>
            </div>
          )}
          <p className="ad-hint">
            تاریخچهٔ آماده‌سازی‌ها پایین همین صفحه است؛ تعداد «ارسال‌شده» تا وقتی درگاه تأیید نکند صفر می‌ماند.
          </p>
        </Card>
      )}

      {ops.smsCampaigns.length > 0 && (
        <Card title="تاریخچهٔ پیام‌های آماده‌شده">
          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead><tr><th>زمان</th><th>نام</th><th>مخاطب</th><th>گیرنده</th><th>وضعیت</th></tr></thead>
              <tbody>
                {ops.smsCampaigns.map((c) => (
                  <tr key={c.id}>
                    <td>{timeAgo(c.at)}</td>
                    <td>{c.name}</td>
                    <td>{c.audience}</td>
                    <td className="ad-num">{fa(c.recipients)}</td>
                    <td>{c.status === "sent" ? `ارسال‌شده (${fa(c.sent)})` : "آماده — ارسال دستی"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}

function Messages() {
  const submissions = useSubmissions();
  const [open, setOpen] = useState<string | null>(null);
  const csv = () => {
    const keys = [...new Set(submissions.flatMap((x) => Object.keys(x.data)))];
    const rows = [
      ["فرم", "صفحه", "زمان", ...keys],
      ...submissions.map((x) => [x.form, x.page, new Date(x.at).toLocaleString("fa-IR"), ...keys.map((k) => x.data[k] ?? "")]),
    ];
    download("messages.csv", "\uFEFF" + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n"), "text/csv");
  };
  return (
    <>
      <PageHead
        title="پیام‌ها"
        sub="پیام‌های فرم‌های صفحه‌ساز و سایت اینجا ثبت می‌شوند."
        actions={
          <button type="button" className="ad-btn is-sm" onClick={csv} disabled={!submissions.length}>
            <DIcon width={13} height={13} /> خروجی CSV
          </button>
        }
      />
      {submissions.length === 0 ? (
        <Empty text="پیامی ثبت نشده. یک ویجت «فرم» روی صفحهٔ ساخته‌شده بگذار و یک پیام آزمایشی بفرست؛ اینجا نمایش داده می‌شود." />
      ) : (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead>
              <tr><th>فرم</th><th>صفحه</th><th>زمان</th><th>خلاصه</th></tr>
            </thead>
            <tbody>
              {submissions.map((x) => (
                <>
                  <tr key={x.id} className={cn(open === x.id && "is-open")} onClick={() => setOpen(open === x.id ? null : x.id)}>
                    <td>{x.form}</td>
                    <td>{x.page.slice(0, 30)}</td>
                    <td>{timeAgo(x.at)}</td>
                    <td>{Object.values(x.data).join(" · ").slice(0, 40)}</td>
                  </tr>
                  {open === x.id && (
                    <tr className="ad-detail-row" key={x.id + "-d"}>
                      <td colSpan={4}>
                        <div className="ad-detail">
                          <div className="ad-detail-col">
                            <h4>اطلاعات پیام</h4>
                            {Object.entries(x.data).map(([k, v]) => (
                              <p key={k}><b>{k}:</b> {v || "—"}</p>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SmsScreen() {
  const [tab, setTab] = useState<"sms" | "forms">("sms");
  return (
    <>
      <div className="ad-filters">
        <button type="button" className={cn("ad-chip", tab === "sms" && "is-on")} onClick={() => setTab("sms")}>پیامک</button>
        <button type="button" className={cn("ad-chip", tab === "forms" && "is-on")} onClick={() => setTab("forms")}>پیام‌های فرم‌ها</button>
      </div>
      {tab === "sms" ? <SmsPanel /> : <Messages />}
    </>
  );
}

function Reviews() {
  const admin = useAdmin();
  const session = useAdminMe();
  const [replying, setReplying] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const approved = admin.reviews.filter((r) => r.approved);
  // a review without a star is not counted in the average (decision 59)
  const rated = approved.filter((r) => r.rating > 0);
  const avg = rated.length ? rated.reduce((n, r) => n + r.rating, 0) / rated.length : 0;
  return (
    <>
      <PageHead
        title="نظرات مشتریان"
        sub={`${fa(approved.length)} نظر تأییدشده · ${fa(rated.length)} نظر ستاره‌دار · میانگین ${avg ? avg.toFixed(1).replace(".", "/") : "—"}`}
      />
      <div className="ad-reviews">
        {admin.reviews.map((r) => (
          <article key={r.id} className={cn("ad-review", !r.approved && "is-pending")}>
            <header>
              {r.rating > 0 ? (
                <span className="ad-stars">{"★".repeat(r.rating)}<i>{"★".repeat(5 - r.rating)}</i></span>
              ) : (
                <span className="ad-stars is-none" title="مشتری ستاره نداده">بدون امتیاز</span>
              )}
              <b>{r.author}</b>
              <small>{timeAgo(r.at)}</small>
              <span className={cn("ad-pill", r.approved ? "is-done" : "is-pending")}>{r.approved ? "تأییدشده" : "در انتظار"}</span>
            </header>
            <p className="ad-review-product">{r.product}</p>
            <p className="ad-review-text">{r.text}</p>
            {r.reply && (
              <div className="ad-review-reply">
                <b>پاسخ فروشگاه</b>
                <p>{r.reply.text}</p>
                <small>{r.reply.by} · {timeAgo(r.reply.at)}</small>
              </div>
            )}
            {replying === r.id ? (
              <div className="ad-note-add">
                <textarea
                  className="ad-input"
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="پاسخ عمومی فروشگاه؛ زیر همین نظر در صفحهٔ محصول دیده می‌شود."
                  aria-label="متن پاسخ"
                />
                <div className="ad-actions">
                  <button
                    type="button"
                    className="ad-btn is-sm is-primary"
                    disabled={!replyText.trim()}
                    onClick={() => {
                      setReviewReply(r.id, replyText, session.me?.staff?.name ?? "فروشگاه");
                      setReplying(null);
                      setReplyText("");
                    }}
                  >
                    <Save width={13} height={13} /> ثبت پاسخ
                  </button>
                  <button type="button" className="ad-btn is-sm" onClick={() => { setReplying(null); setReplyText(""); }}>انصراف</button>
                </div>
              </div>
            ) : (
              <footer>
                <button
                  type="button"
                  className="ad-btn is-sm"
                  onClick={() => { setReplying(r.id); setReplyText(r.reply?.text ?? ""); }}
                >
                  <MessageSquare width={13} height={13} /> {r.reply ? "ویرایش پاسخ" : "پاسخ"}
                </button>
                {r.reply && (
                  <button
                    type="button"
                    className="ad-btn is-sm"
                    onClick={() => setReviewReply(r.id, "", session.me?.staff?.name ?? "فروشگاه")}
                  >
                    حذف پاسخ
                  </button>
                )}
                <button type="button" className="ad-btn is-sm" onClick={() => setReviewApproved(r.id, !r.approved)}>
                {r.approved ? <XCircle width={13} height={13} /> : <CheckCircle2 width={13} height={13} />}
                {r.approved ? "لغو تأیید" : "تأیید"}
              </button>
              <button type="button" className="ad-btn is-sm is-danger" onClick={() => removeReview(r.id)}><Trash2 width={13} height={13} /> حذف</button>
              </footer>
            )}
          </article>
        ))}
        {admin.reviews.length === 0 && <Empty text="نظری ثبت نشده." />}
      </div>
    </>
  );
}

/* =====================================================================
   integrations
   ===================================================================== */

function Integrations() {
  const admin = useAdmin();
  const integ = admin.integrations;
  const { notify } = useNotify();
  const [aiBusy, setAiBusy] = useState(false);

  const statusOf = (enabled: boolean, key: string) => (key ? (enabled ? "active" : "configured") : "off");

  const testAi = async () => {
    setAiBusy(true);
    const t0 = performance.now();
    try {
      const ai = integ.ai;
      const base = (ai.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
      const res = await fetch(
        ai.provider === "anthropic" ? `${base}/messages` : `${base}/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(ai.provider === "anthropic"
              ? { "x-api-key": ai.apiKey, "anthropic-version": "2023-06-01" }
              : { authorization: `Bearer ${ai.apiKey}` }),
          },
          body: JSON.stringify(
            ai.provider === "anthropic"
              ? { model: ai.model, max_tokens: 16, messages: [{ role: "user", content: "ping" }] }
              : { model: ai.model, max_tokens: 16, messages: [{ role: "user", content: "ping" }] },
          ),
        },
      );
      const ms = Math.round(performance.now() - t0);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setIntegrations({ ai: { ...ai, lastTest: { ok: true, at: Date.now(), ms } } });
      notify("اتصال هوش مصنوعی برقرار شد", `${ms} ms — مدل ${ai.model}`);
    } catch (e) {
      setIntegrations({ ai: { ...integ.ai, lastTest: { ok: false, at: Date.now(), error: String(e instanceof Error ? e.message : e) } } });
      notify("اتصال برقرار نشد", "کلید یا آدرس سرویس را بررسی کن.");
    } finally {
      setAiBusy(false);
    }
  };

  const testGateway = (provider: string) => {
    const ms = 40 + Math.floor(Math.random() * 90);
    notify(`درگاه ${provider} پاسخ داد (شبیه‌سازی)`, `${ms} ms — حالت تست`);
  };

  return (
    <>
      <PageHead title="اتصالات" sub="هوش مصنوعی، درگاه پرداخت، پیامک، ایمیل و باربری. همهٔ این‌ها به بخش‌های دیگر پنل و فروشگاه وصل‌اند." />

      <Card title="هوش مصنوعی" icon={<Bot width={14} height={14} />}
        action={<span className={cn("ad-status", `is-${statusOf(integ.ai.enabled, integ.ai.apiKey)}`)}>{STATUS_LABEL[statusOf(integ.ai.enabled, integ.ai.apiKey)]}</span>}>
        <p className="ad-hint mb-2">در دستیار استایل بیلدر، یادداشت نهایی می‌تواند با همین کلید ساخته شود؛ در این پنل فقط اتصال آزمایش می‌شود.</p>
        <div className="ad-two">
          <label className="ad-field">پراوایدر
            <select className="ad-select" value={integ.ai.provider} onChange={(e) => setIntegrations({ ai: { ...integ.ai, provider: e.target.value as "openai" | "anthropic" | "custom" } })}>
              <option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="custom">سرویس سازگار با OpenAI</option>
            </select>
          </label>
          <label className="ad-field">مدل
            <input className="ad-input" dir="ltr" value={integ.ai.model} onChange={(e) => setIntegrations({ ai: { ...integ.ai, model: e.target.value } })} placeholder="gpt-4o-mini" />
          </label>
        </div>
        <label className="ad-field">آدرس سرویس
          <input className="ad-input" dir="ltr" value={integ.ai.baseUrl} onChange={(e) => setIntegrations({ ai: { ...integ.ai, baseUrl: e.target.value } })} placeholder="https://api.openai.com/v1" />
        </label>
        <label className="ad-field">کلید API
          <input className="ad-input" dir="ltr" type="password" value={integ.ai.apiKey} onChange={(e) => setIntegrations({ ai: { ...integ.ai, apiKey: e.target.value } })} placeholder="sk-…" />
        </label>
        <label className="ad-check"><input type="checkbox" checked={integ.ai.enabled} onChange={(e) => setIntegrations({ ai: { ...integ.ai, enabled: e.target.checked } })} /> هوش مصنوعی فعال باشد</label>
        <div className="ad-actions">
          <button type="button" className="ad-btn" onClick={testAi} disabled={aiBusy || !integ.ai.apiKey}>{aiBusy ? "در حال آزمایش…" : <><Wifi width={13} height={13} /> آزمایش اتصال</>}</button>
          {integ.ai.lastTest && (
            <span className={cn("ad-status", integ.ai.lastTest.ok ? "is-active" : "is-off")}>
              {integ.ai.lastTest.ok ? `پاسخ ${integ.ai.lastTest.ms} ms` : `خطا: ${integ.ai.lastTest.error}`}
            </span>
          )}
        </div>
      </Card>

      <div className="ad-grid-2">
        <Card title="درگاه پرداخت" icon={<CreditCard width={14} height={14} />}
          action={<span className={cn("ad-status", `is-${statusOf(integ.payment.enabled, integ.payment.key)}`)}>{STATUS_LABEL[statusOf(integ.payment.enabled, integ.payment.key)]}</span>}>
          <div className="ad-two">
            <label className="ad-field">درگاه
              <select className="ad-select" value={integ.payment.gateway} onChange={(e) => setIntegrations({ payment: { ...integ.payment, gateway: e.target.value as "zarinpal" | "sadad" | "stripe" | "none" } })}>
                <option value="none">بدون درگاه</option><option value="zarinpal">زرین‌پال</option><option value="sadad">سداد</option><option value="stripe">Stripe</option>
              </select>
            </label>
            <label className="ad-field">حالت
              <select className="ad-select" value={integ.payment.mode} onChange={(e) => setIntegrations({ payment: { ...integ.payment, mode: e.target.value as "test" | "live" } })}>
                <option value="test">تست</option><option value="live">حقیقی</option>
              </select>
            </label>
          </div>
          <label className="ad-field">کلید API
            <input className="ad-input" dir="ltr" type="password" value={integ.payment.key} onChange={(e) => setIntegrations({ payment: { ...integ.payment, key: e.target.value } })} placeholder="API Key" />
          </label>
          <label className="ad-check"><input type="checkbox" checked={integ.payment.enabled} onChange={(e) => setIntegrations({ payment: { ...integ.payment, enabled: e.target.checked } })} /> درگاه فعال باشد (نشان در صفحهٔ تسویه)</label>
          <div className="ad-actions">
            <button type="button" className="ad-btn" onClick={() => testGateway(GATEWAY_LABEL_PERSIA[integ.payment.gateway])} disabled={integ.payment.gateway === "none"}><Wifi width={13} height={13} /> آزمایش (شبیه‌سازی)</button>
          </div>
        </Card>

        <Card title="پیامک و ایمیل" icon={<Send width={14} height={14} />}>
          <label className="ad-field">پراوایدر پیامک
            <input className="ad-input" value={integ.sms.provider} onChange={(e) => setIntegrations({ sms: { ...integ.sms, provider: e.target.value } })} placeholder="کاسپیس / ملی‌پیامک" />
          </label>
          <label className="ad-field">نام گیرنده (SenderID)
            <input className="ad-input" dir="ltr" value={integ.sms.sender} onChange={(e) => setIntegrations({ sms: { ...integ.sms, sender: e.target.value } })} placeholder="1000543210" />
          </label>
          <label className="ad-check"><input type="checkbox" checked={integ.sms.enabled} onChange={(e) => setIntegrations({ sms: { ...integ.sms, enabled: e.target.checked } })} /> کد رهگیری پیامکی ارسال شود</label>
          <label className="ad-field">پراوایدر ایمیل
            <input className="ad-input" value={integ.email.provider} onChange={(e) => setIntegrations({ email: { ...integ.email, provider: e.target.value } })} placeholder="Resend / SMTP" />
          </label>
          <label className="ad-check"><input type="checkbox" checked={integ.email.enabled} onChange={(e) => setIntegrations({ email: { ...integ.email, enabled: e.target.checked } })} /> ایمیل تایید سفارش ارسال شود</label>
        </Card>
      </div>

      <Card title="باربری" icon={<Truck width={14} height={14} />}>
        <div className="ad-two">
          <label className="ad-field">شرکت
            <input className="ad-input" value={integ.shipping.courier} onChange={(e) => setIntegrations({ shipping: { ...integ.shipping, courier: e.target.value } })} placeholder="تپیکس / پیکس" />
          </label>
          <label className="ad-field">کلید API
            <input className="ad-input" dir="ltr" type="password" value={integ.shipping.apiKey} onChange={(e) => setIntegrations({ shipping: { ...integ.shipping, apiKey: e.target.value } })} />
          </label>
        </div>
        <label className="ad-check"><input type="checkbox" checked={integ.shipping.enabled} onChange={(e) => setIntegrations({ shipping: { ...integ.shipping, enabled: e.target.checked } })} /> برگهٔ بار برای سفارش‌ها ثبت شود (شبیه‌سازی)</label>
      </Card>
    </>
  );
}

const GATEWAY_LABEL_PERSIA: Record<string, string> = { zarinpal: "زرین‌پال", sadad: "سداد", stripe: "Stripe", none: "—" };
const STATUS_LABEL: Record<string, string> = { active: "فعال", configured: "پیکربندی‌شده", off: "خاموش" };

/* notify through the shared cart toasts */
function useNotify() {
  const { notify } = useNotifyCart();
  return { notify };
}

/* =====================================================================
   content / appearance / settings
   ===================================================================== */

const KIND_PERSIA: Record<string, string> = { page: "صفحه", landing: "لندینگ", header: "هدر", footer: "فوتر", section: "بخش", popup: "پاپ‌آپ" };


/* =====================================================================
   home page block order (decision 67) — drag, hide, reset.
   The storefront reads the same list, so this is not a mock-up.
   ===================================================================== */

function HomeOrderPanel() {
  const ops = useOps();
  const list = ops.homeSections?.length ? ops.homeSections : defaultHomeSections();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const commit = (next: { id: string; label: string; active: boolean }[]) => setHomeSections(next);

  const drop = (targetId: string) => {
    if (!dragging || dragging === targetId) return;
    const from = list.findIndex((s) => s.id === dragging);
    const to = list.findIndex((s) => s.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    commit(next);
    setDragging(null);
    setOver(null);
  };

  return (
    <Card title="ترتیب بخش‌های صفحهٔ اصلی" icon={<Layers width={14} height={14} />}>
      <p className="ad-hint" style={{ marginTop: 0 }}>
        با گرفتن دستهٔ هر ردیف بکش و بینداز (یا با دکمه‌های بالا/پایین جابه‌جا کن). هر بخش را می‌توانی موقتاً پنهان کنی؛
        ویترین همین ترتیب را نشان می‌دهد.
      </p>
      <ul className="ad-order-list">
        {list.map((section, index) => (
          <li
            key={section.id}
            className={cn("ad-order-row", !section.active && "is-off", over === section.id && "is-over")}
            draggable
            onDragStart={() => setDragging(section.id)}
            onDragEnd={() => { setDragging(null); setOver(null); }}
            onDragOver={(e) => { e.preventDefault(); setOver(section.id); }}
            onDrop={(e) => { e.preventDefault(); drop(section.id); }}
          >
            <span className="ad-order-grip" aria-hidden>⋮⋮</span>
            <span className="ad-order-index">{fa(index + 1)}</span>
            <span className="ad-order-label">{section.label}</span>
            <label className="ad-rbac-toggle">
              <input
                type="checkbox"
                checked={section.active}
                onChange={() => toggleHomeSection(section.id)}
                aria-label={`نمایش ${section.label}`}
              />
              <span>{section.active ? "نمایش" : "پنهان"}</span>
            </label>
            <div className="ad-product-actions">
              <button type="button" className="ad-icon" disabled={index === 0} aria-label={`${section.label} بالاتر`} title="بالا" onClick={() => moveHomeSection(section.id, -1)}><ArrowUp width={14} height={14} /></button>
              <button type="button" className="ad-icon" disabled={index === list.length - 1} aria-label={`${section.label} پایین‌تر`} title="پایین" onClick={() => moveHomeSection(section.id, 1)}><ArrowDown width={14} height={14} /></button>
            </div>
          </li>
        ))}
      </ul>
      <div className="ad-actions">
        <button type="button" className="ad-btn is-sm" onClick={() => commit(defaultHomeSections())}>
          <RotateCcw width={13} height={13} /> ترتیب پیش‌فرض
        </button>
      </div>
    </Card>
  );
}

function Content() {
  const docs = useDocs();
  return (
    <>
      <PageHead
        title="محتوا و صفحات"
        sub="هرچه با صفحه‌ساز ساخته شده اینجا می‌بینی و ویرایشش می‌کنی."
        actions={
          <Link to="/builder" className="ad-btn is-sm is-primary">
            <LayoutTemplate width={13} height={13} /> باز کردن صفحه‌ساز
          </Link>
        }
      />
      <HomeOrderPanel />
      {docs.length === 0 ? (
        <Empty text="هنوز چیزی نساخته‌ای. از صفحه‌ساز یک صفحه، هدر، فوتر یا پاپ‌آپ بساز." />
      ) : (
        <div className="ad-table-wrap">
          <table className="ad-table">
            <thead>
              <tr><th>عنوان</th><th>نوع</th><th>وضعیت</th><th>به‌روزرسانی</th><th /></tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td><b>{d.title}</b></td>
                  <td>{KIND_PERSIA[d.kind] ?? d.kind}</td>
                  <td>
                    <span className={cn("ad-pill", d.status === "published" ? "is-done" : "is-pending")}>{d.status === "published" ? "منتشرشده" : "پیش‌نویس"}</span>
                    {d.active && <span className="ad-pill is-shipped">فعال</span>}
                  </td>
                  <td>{timeAgo(d.updatedAt)}</td>
                  <td>
                    <Link to={`/builder/edit/${d.id}`} className="ad-btn is-sm">ویرایش</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}


/* ------------------------------------------------------------------ */
/* size guides, search preview and the 404 copy (decisions 56/64/66)  */
/* ------------------------------------------------------------------ */

function SizeGuidePanel() {
  const ops = useOps();
  const categories = [...new Set([...ops.categories.map((c) => c.name)])];
  const [picked, setPicked] = useState(categories[0] ?? "");
  const guide = ops.sizeGuides[picked] ?? { note: "", rows: [] };
  const write = (rows: typeof guide.rows, note = guide.note) => setSizeGuide(picked, { rows, note });

  if (!categories.length) return <Card title="جدول اندازه"><Empty text="اول یک دستهٔ محصول بساز." /></Card>;

  return (
    <Card title="جدول اندازهٔ هر دسته" icon={<Ruler width={14} height={14} />}>
      <p className="ad-hint" style={{ marginTop: 0 }}>
        همان جدولی که در صفحهٔ محصول همان دسته باز می‌شود؛ خالی بماند، جدولی هم نمایش داده نمی‌شود.
      </p>
      <label className="ad-field">
        دسته
        <select className="ad-select" value={picked} onChange={(e) => setPicked(e.target.value)}>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <div className="ad-table-wrap">
        <table className="ad-table">
          <thead><tr><th>سایز</th><th>دور سینه</th><th>دور کمر</th><th>دور باسن</th><th /></tr></thead>
          <tbody>
            {guide.rows.map((row, i) => (
              <tr key={i}>
                {(["size", "chest", "waist", "hips"] as const).map((field) => (
                  <td key={field}>
                    <input
                      className="ad-input is-cell"
                      dir={field === "size" ? "ltr" : "ltr"}
                      value={row[field]}
                      aria-label={field}
                      onChange={(e) =>
                        write(guide.rows.map((r, j) => (j === i ? { ...r, [field]: e.target.value } : r)))
                      }
                    />
                  </td>
                ))}
                <td>
                  <button
                    type="button"
                    className="ad-icon"
                    aria-label="حذف ردیف"
                    onClick={() => write(guide.rows.filter((_, j) => j !== i))}
                  >
                    <Trash2 width={13} height={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ad-actions">
        <button type="button" className="ad-btn is-sm" onClick={() => write([...guide.rows, { size: "", chest: "", waist: "", hips: "" }])}>
          <Plus width={13} height={13} /> ردیف تازه
        </button>
      </div>
      <label className="ad-field">
        یادداشت جدول
        <input className="ad-input" value={guide.note} onChange={(e) => write(guide.rows, e.target.value)} placeholder="مثلاً: اندازه‌ها با خطای ±۱ سانتی‌متر" />
      </label>
    </Card>
  );
}

function SeoPanel() {
  const ops = useOps();
  const seo = ops.seo;
  // length hints follow what search engines actually cut off
  const titleLen = seo.title.length;
  const descLen = seo.description.length;
  return (
    <Card title="عنوان و توضیح در جست‌وجو" icon={<Search width={14} height={14} />}>
      <label className="ad-field">
        عنوان صفحهٔ اصلی ({fa(titleLen)} نویسه — تا ۶۰)
        <input className="ad-input" value={seo.title} onChange={(e) => setSeo({ title: e.target.value })} aria-label="عنوان سئو" />
      </label>
      <label className="ad-field">
        توضیح ({fa(descLen)} نویسه — تا ۱۶۰)
        <textarea className="ad-input" rows={3} value={seo.description} onChange={(e) => setSeo({ description: e.target.value })} aria-label="توضیح سئو" />
      </label>
      {titleLen > 60 && <p className="ad-hint is-warn">عنوان بلندتر از ۶۰ نویسه در نتایج بریده می‌شود.</p>}
      {descLen > 160 && <p className="ad-hint is-warn">توضیح بلندتر از ۱۶۰ نویسه بریده می‌شود.</p>}
      {/* an honest preview: it is exactly what the fields say, nothing generated */}
      <div className="ad-seo-preview" role="group" aria-label="پیش‌نمایش نتیجهٔ جست‌وجو">
        <span className="ad-seo-url" dir="ltr">velours.ir</span>
        <b>{seo.title || "بدون عنوان"}</b>
        <p>{seo.description || "بدون توضیح"}</p>
      </div>
      <label className="ad-field">
        عنوان صفحهٔ ۴۰۴
        <input className="ad-input" value={seo.notFoundTitle} onChange={(e) => setSeo({ notFoundTitle: e.target.value })} aria-label="عنوان ۴۰۴" />
      </label>
      <label className="ad-field">
        متن صفحهٔ ۴۰۴
        <textarea className="ad-input" rows={2} value={seo.notFoundText} onChange={(e) => setSeo({ notFoundText: e.target.value })} aria-label="متن ۴۰۴" />
      </label>
      <a className="ad-btn is-sm" href="/this-page-does-not-exist" target="_blank" rel="noreferrer">
        دیدن صفحهٔ ۴۰۴
      </a>
    </Card>
  );
}

function Appearance() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <PageHead title="ظاهر سایت" sub="یک تصمیم سطح فروشگاه: تم انتخابی برای همهٔ بازدیدکنندگان اعمال می‌شود و مشتری کلید تغییر ظاهر ندارد." />
      <div className="ad-themes">
        {THEMES.map((t) => (
          <button key={t.id} type="button" className={cn("ad-theme", theme.id === t.id && "is-on")} onClick={() => setTheme(t.id)} aria-pressed={theme.id === t.id}>
            <span className="ad-theme-prev" style={{ background: t.tokens["--color-bone"], borderColor: t.tokens["--line"] }}>
              <i style={{ background: t.tokens["--color-paper"], borderRadius: t.tokens["--radius-xl"], boxShadow: t.tokens["--card-shadow"] }}>
                <b style={{ background: t.tokens["--color-ink"] }} />
                <small style={{ background: t.tokens["--color-ink-45"] }} />
                <em style={{ background: t.tokens["--color-ink"], borderRadius: t.tokens["--btn-radius"] }} />
              </i>
              <u style={{ background: t.tokens["--color-sand"], borderRadius: t.tokens["--radius-lg"] }} />
            </span>
            <b>{t.label}</b>
            <small>{t.description}</small>
          </button>
        ))}
      </div>
      <div className="ad-grid-2">
        <SizeGuidePanel />
        <SeoPanel />
      </div>
    </>
  );
}

function StoreSettings({ onBack }: { onBack: () => void }) {
  const admin = useAdmin();
  const s = admin.settings;
  const [draft, setD] = useState(s);
  useEffect(() => setD(admin.settings), [admin.settings]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(admin.settings);
  const { notify } = useNotify();

  return (
    <>
      <PageHead title="تنظیمات فروشگاه" sub="مشخصات برند، ارسال، ارز و دسترسی پنل." />
      <div className="ad-grid-2">
        <Card title="مشخصات فروشگاه" icon={<Store width={14} height={14} />}>
          <label className="ad-field">نام فروشگاه<input className="ad-input" value={draft.name} onChange={(e) => setD({ ...draft, name: e.target.value })} /></label>
          <label className="ad-field">شعار<input className="ad-input" value={draft.tagline} onChange={(e) => setD({ ...draft, tagline: e.target.value })} /></label>
          <label className="ad-field">نشانی<input className="ad-input" value={draft.address} onChange={(e) => setD({ ...draft, address: e.target.value })} /></label>
          <div className="ad-two">
            <label className="ad-field">تلفن<input className="ad-input" dir="ltr" value={draft.phone} onChange={(e) => setD({ ...draft, phone: e.target.value })} /></label>
            <label className="ad-field">ایمیل<input className="ad-input" dir="ltr" value={draft.email} onChange={(e) => setD({ ...draft, email: e.target.value })} /></label>
          </div>
        </Card>
        <Card title="ارسال و پرداخت" icon={<Truck width={14} height={14} />}>
          <div className="ad-two">
            <label className="ad-field">آستانهٔ ارسال رایگان (واحد پایه)
              <input className="ad-input" type="number" min={0} value={draft.freeShipping} onChange={(e) => setD({ ...draft, freeShipping: Number(e.target.value) || 0 })} />
            </label>
            <label className="ad-field">هزینهٔ ارسال سریع (تومان)
              <input className="ad-input" type="number" min={0} value={draft.expressCost} onChange={(e) => setD({ ...draft, expressCost: Number(e.target.value) || 0 })} />
            </label>
          </div>
          <div className="ad-two">
            <label className="ad-field">مهلت مرجوعی (روز)
              <input className="ad-input" type="number" min={0} value={draft.returnDays} onChange={(e) => setD({ ...draft, returnDays: Number(e.target.value) || 0 })} />
            </label>
            <label className="ad-field">ضریب تبدیل به تومان
              <input
                className="ad-input"
                dir="ltr"
                type="number"
                min={1}
                value={draft.currencyRate ?? 1000}
                onChange={(e) => setD({ ...draft, currencyRate: Number(e.target.value) || 1 })}
              />
              <span className="ad-hint">قیمت‌های ذخیره‌شده در این عدد ضرب می‌شوند تا مبلغ تومانی نمایش داده شود.</span>
            </label>
          </div>
          <label className="ad-field">آستانهٔ «کم‌موجود» (تعداد کل هر محصول)
            <input
              className="ad-input"
              type="number"
              min={0}
              value={draft.lowStockThreshold ?? LOW_STOCK_DEFAULT}
              onChange={(e) => setD({ ...draft, lowStockThreshold: Number(e.target.value) || 0 })}
            />
            <span className="ad-hint">
              هر محصولی که جمع موجودی‌اش از این عدد کمتر یا مساوی باشد در فهرست‌ها «کم‌موجود» علامت می‌خورد.
              هر محصول می‌تواند برای خودش عدد دیگری داشته باشد (در فرم محصول، تب «قیمت و انتشار»).
            </span>
          </label>
          <label className="ad-check"><input type="checkbox" checked={draft.maintenance} onChange={(e) => setD({ ...draft, maintenance: e.target.checked })} /> حالت تعمیرات (نشان در پنل؛ سایت باز می‌ماند)</label>
        </Card>
      </div>
      <Card title="دسترسی پنل" icon={<Lock width={14} height={14} />}>
        <label className="ad-field">رمز مدیریت
          <input className="ad-input" dir="ltr" value={draft.passcode} onChange={(e) => setD({ ...draft, passcode: e.target.value })} />
        </label>
        <p className="ad-hint">پس از تغییر، دفعهٔ بعد رمز جدید را وارد کن.</p>
      </Card>
      <div className="ad-actions">
        <button type="button" className="ad-btn is-primary" disabled={!dirty} onClick={() => { patchSettings(draft); notify("تنظیمات ذخیره شد"); }}>
          <Save width={14} height={14} /> ذخیرهٔ تنظیمات
        </button>
        <div className="ad-actions-spacer" />
        <button type="button" className="ad-btn is-danger" onClick={() => { if (window.confirm("همهٔ دادهٔ پنل پاک شود؟")) { resetAdmin(); setD(admin.settings); } }}>
          <Trash2 width={13} height={13} /> بازنشانی پنل
        </button>
        <button type="button" className="ad-btn" onClick={onBack}><ArrowLeft width={13} height={13} /> بازگشت به سایت</button>
      </div>
    </>
  );
}

/* =====================================================================
   shared bits
   ===================================================================== */

function PageHead({ title, sub, actions }: { title: string; sub?: string; actions?: React.ReactNode }) {
  return (
    <header className="ad-head">
      <div>
        <h2>{title}</h2>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="ad-head-actions">{actions}</div>}
    </header>
  );
}

function Card({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="ad-card">
      <header className="ad-card-head">
        <h3>{icon} {title}</h3>
        {action}
      </header>
      <div className="ad-card-body">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="ad-empty">{text}</p>;
}

/* =====================================================================
   printing — a real A4 invoice and a real shipping label

   No PDF library: the browser's own print dialog produces the PDF, so the
   Persian type, the RTL layout and the fonts are exactly what the shop uses.
   ===================================================================== */

function printDocument(title: string, page: "A4" | "A5", body: string) {
  const win = window.open("", "_blank", "width=920,height=1040");
  if (!win) return false;
  win.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${title}</title>
    <style>
      @page { size: ${page}; margin: 12mm; }
      *{ box-sizing:border-box }
      body{ margin:0; background:#fff; color:#16130f; font-family:"Vazirmatn",Tahoma,system-ui,sans-serif; font-size:12px; line-height:1.9 }
      .sheet{ padding:6mm 0 }
      .row{ display:flex; justify-content:space-between; align-items:flex-start; gap:16px }
      .brand{ font-size:20px; letter-spacing:.28em; font-weight:600 }
      .muted{ color:#6b6255 }
      h1{ font-size:15px; margin:0 0 4px }
      table{ width:100%; border-collapse:collapse; margin-top:14px }
      th,td{ padding:8px 6px; border-block-end:1px solid #e2dbcf; text-align:start; font-size:12px }
      th{ background:#f5f0e7; font-weight:600 }
      .num{ font-variant-numeric:tabular-nums }
      .totals{ margin-top:14px; display:grid; gap:5px; width:min(320px,100%); margin-inline-start:auto }
      .totals div{ display:flex; justify-content:space-between }
      .totals .grand{ font-weight:700; font-size:13.5px; border-block-start:1px solid #16130f; padding-block-start:6px }
      .box{ border:1px solid #cfc6b7; border-radius:8px; padding:10px 12px; margin-top:10px }
      .label-sheet{ border:2px dashed #16130f; border-radius:10px; padding:12mm 10mm; min-height:120mm }
      .label-line{ font-size:13px; margin:6px 0 }
      footer{ margin-top:18px; font-size:10.5px; color:#6b6255; border-block-start:1px dashed #cfc6b7; padding-block-start:8px }
    </style></head><body>${body}
    <script>window.addEventListener("load",function(){setTimeout(function(){window.print()},150)})</script>
    </body></html>`);
  win.document.close();
  return true;
}

const shopIdentity = () => {
  const admin = getAdmin();
  return {
    name: admin.settings?.name || "ولور",
    tagline: admin.settings?.tagline || "",
    phone: (getOps().brand as { phone?: string } | undefined)?.phone ?? "",
  };
};

/** one A4 invoice per order, ready to print or save as PDF */
function printInvoices(orders: ReturnType<typeof useAdmin>["orders"]) {
  const shop = shopIdentity();
  const sheets = orders
    .map((o) => {
      const lines = o.lines
        .map(
          (l) =>
            `<tr><td>${l.name}</td><td>${l.color} · ${l.size}</td><td class="num">${fa(l.qty)}</td><td class="num">${formatPrice(l.price)}</td><td class="num">${formatPrice(l.price * l.qty)}</td></tr>`,
        )
        .join("");
      return `<section class="sheet" style="page-break-after:always">
        <div class="row">
          <div>
            <div class="brand">${shop.name}</div>
            <div class="muted">${shop.tagline}</div>
          </div>
          <div class="muted">
            <div>شمارهٔ فاکتور: <b class="num" dir="ltr">${o.id}</b></div>
            <div>تاریخ: ${new Date(o.at).toLocaleDateString("fa-IR")}</div>
            <div>وضعیت: ${ORDER_STATUS_LABEL[o.status]}</div>
          </div>
        </div>
        <div class="box">
          <div class="label-line"><b>${o.customer}</b> · ${o.phone}</div>
          <div class="label-line muted">${o.city} — ${o.address}</div>
        </div>
        <table>
          <thead><tr><th>قطعه</th><th>رنگ / سایز</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr></thead>
          <tbody>${lines}</tbody>
        </table>
        <div class="totals">
          <div><span>جمع اقلام</span><b class="num">${formatPrice(o.subtotal)}</b></div>
          ${o.discountTotal > 0 ? `<div><span>تخفیف</span><b class="num">− ${formatPrice(o.discountTotal)}</b></div>` : ""}
          <div><span>ارسال</span><b class="num">${o.shippingCost === 0 ? "رایگان" : formatPrice(o.shippingCost)}</b></div>
          <div class="grand"><span>مبلغ نهایی</span><b class="num">${formatPrice(o.total)}</b></div>
        </div>
        <footer>${shop.name}${shop.phone ? ` · ${shop.phone}` : ""} — این فاکتور بر پایهٔ سفارش ثبت‌شده در سامانه صادر شده است.</footer>
      </section>`;
    })
    .join("");
  return printDocument(`فاکتور ${orders.length === 1 ? orders[0].id : ""}`, "A4", sheets);
}

/** A5 shipping label — one per parcel, receiver-facing */
function printLabels(orders: ReturnType<typeof useAdmin>["orders"]) {
  const shop = shopIdentity();
  const sheets = orders
    .map((o) => {
      const items = o.lines.reduce((n, l) => n + l.qty, 0);
      return `<section class="label-sheet" style="page-break-after:always">
        <div class="row">
          <div class="brand" style="font-size:14px">${shop.name}</div>
          <div class="muted">سفارش <b class="num" dir="ltr">${o.id}</b></div>
        </div>
        <div class="label-line" style="margin-top:10mm"><span class="muted">گیرنده:</span> <b>${o.customer}</b></div>
        <div class="label-line"><span class="muted">تلفن:</span> <b class="num" dir="ltr">${o.phone}</b></div>
        <div class="label-line"><span class="muted">نشانی:</span> ${o.city} — ${o.address}</div>
        <div class="label-line"><span class="muted">تعداد اقلام:</span> ${fa(items)}</div>
        <div class="label-line"><span class="muted">نوع ارسال:</span> ${o.shipping === "express" ? "پیشتاز" : "پست"}</div>
        ${o.tracking ? `<div class="label-line"><span class="muted">کد رهگیری:</span> <b class="num" dir="ltr">${o.tracking}</b></div>` : ""}
      </section>`;
    })
    .join("");
  return printDocument("لیبل ارسال", "A5", sheets);
}
