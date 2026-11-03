import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
  Package,
  Palette,
  Plus,
  RotateCcw,
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
  Palette as PaletteIcon,
  Image as ImageIcon,
  Ticket as TicketIcon,
  Undo2 as UndoIcon,
  ScrollText as ScrollIcon,
  ShieldCheck as ShieldIcon,
  FolderTree,
  Sparkles as SparkIcon,
  LayoutGrid,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { COLLECTIONS, liveCatalog, liveGetProduct, type CatalogProduct } from "@/data/catalog";
import { LOOKS, formatPrice, stockOf } from "@/data/looks";
import { computeDiscounts } from "@/state/discounts";
import { ProductThumb } from "@/components/ProductThumb";
import { ProductMediaEditor } from "@/components/ProductMediaEditor";
import { adminLogin, adminLogout } from "@/lib/api";
import { download, timeAgo } from "@/builder/util";
import { useTheme } from "@/theme/ThemeProvider";
import { THEMES } from "@/theme/themes";
import { useSyncStatus } from "@/state/sync";
import { useAdmin, addOrder, setOrderStatus, removeOrder, setReviewApproved, removeReview, toggleHidden, toggleFeatured, addCustomProduct, updateCustomProduct, removeCustomProduct, setStockUnified, saveCampaign, removeCampaign, saveRule, removeRule, saveCoupon, removeCoupon, setIntegrations, setCustomerMeta, patchSettings, resetAdmin, adminUnlocked, unlockAdmin, lockAdmin, GARMENT_LABEL, ORDER_STATUS_LABEL, SCOPE_LABEL, RULE_TYPE_LABEL, getAdmin, consumeStock, saveProductEdit, resetProductEdit, productEditOf, complementsOf, setComplements } from "@/state/admin";
import { useDocs, useSubmissions } from "@/builder/docs";
import { sizeSetOf, useOps, getOps, recordFailedLogin, productImagesOf, setProductImages } from "@/state/ops";
import { resolveImg } from "@/builder/stock";
import { useCart as useNotifyCart } from "@/state/cart";
import type { AdminState, Campaign, DiscountRule, OrderLine, OrderStatus, RuleType, Scope, StockMove } from "@/state/admin";
import type { GarmentKind, ProductImage } from "@/types";
import { BrandPanel, CategoriesPanel, MediaPanel, LooksPanel, CrmPanel, TicketsPanel, ReturnsPanel, LogsPanel, SecurityPanel, FormsPanel, TryOnPanel, MegaMenuPanel, InventoryPanel } from "./AdminOps";
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
  | "security"
  | "forms"
  | "tryon"
  | "megamenu"
  | "content"
  | "appearance"
  | "settings";

const TABS: { id: Tab; label: string; icon: typeof Gauge }[] = [
  { id: "dashboard", label: "داشبورد", icon: Gauge },
  { id: "orders", label: "سفارش‌ها", icon: ShoppingBag },
  { id: "products", label: "محصولات و انبار", icon: Package },
  { id: "inventory", label: "انبارداری", icon: Warehouse },
  { id: "categories", label: "دسته‌بندی و سایز", icon: FolderTree },
  { id: "media", label: "تصاویر محصول", icon: ImageIcon },
  { id: "looks", label: "استایل‌ها و قطعه‌ها", icon: Layers },
  { id: "brand", label: "برند و لوگو", icon: PaletteIcon },
  { id: "megamenu", label: "مگا منو", icon: LayoutGrid },
  { id: "crm", label: "CRM و پیامک", icon: Users },
  { id: "tryon", label: "پرو و کش‌بک", icon: SparkIcon },
  { id: "tickets", label: "تیکت‌ها", icon: TicketIcon },
  { id: "returns", label: "مرجوعی‌ها", icon: UndoIcon },
  { id: "forms", label: "فرم‌ها", icon: ClipboardList },
  { id: "logs", label: "گزارش فعالیت", icon: ScrollIcon },
  { id: "security", label: "امنیت", icon: ShieldIcon },
  { id: "customers", label: "مشتریان (CRM)", icon: Users },
  { id: "campaigns", label: "جشنواره و تخفیف", icon: Megaphone },
  { id: "messages", label: "پیام‌ها", icon: Inbox },
  { id: "reviews", label: "نظرات", icon: MessageSquare },
  { id: "integrations", label: "اتصالات", icon: Wifi },
  { id: "content", label: "محتوا", icon: LayoutTemplate },
  { id: "appearance", label: "ظاهر", icon: Palette },
  { id: "settings", label: "تنظیمات", icon: Settings },
];

/* =====================================================================
   page
   ===================================================================== */

export function AdminPage() {
  const [unlocked, setUnlocked] = useState(() => adminUnlocked());
  const [tab, setTab] = useState<Tab>("dashboard");
  const [navOpen, setNavOpen] = useState(false);
  const admin = useAdmin();
  const navigate = useNavigate();

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
        <div className="ad-top-spacer" />
        <span className="ad-top-stat">
          <TrendingUp width={13} height={13} />
          {fa(admin.orders.length)} سفارش
        </span>
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
        <nav className={cn("ad-nav", navOpen && "is-open")} aria-label="بخش‌های پنل">
          <div className="ad-nav-inner">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={cn("ad-nav-item", tab === t.id && "is-on")} onClick={() => { setTab(t.id); setNavOpen(false); }}>
                <t.icon width={15} height={15} />
                <span>{t.label}</span>
                {badges[t.id] ? <em>{fa(badges[t.id] as number)}</em> : null}
              </button>
            ))}
            <div className="ad-nav-foot">
              <p>{admin.settings.name}</p>
              <small>{admin.settings.tagline}</small>
            </div>
          </div>
        </nav>
        {navOpen && <div className="ad-nav-scrim" onClick={() => setNavOpen(false)} aria-hidden />}

        <main className="ad-main">
          {tab === "dashboard" && <Dashboard onGo={setTab} />}
          {tab === "orders" && <Orders />}
          {tab === "products" && <Products />}
          {tab === "inventory" && <InventoryPanel />}
          {tab === "categories" && <CategoriesPanel />}
          {tab === "media" && <MediaPanel />}
          {tab === "looks" && <LooksPanel />}
          {tab === "brand" && <BrandPanel />}
          {tab === "megamenu" && <MegaMenuPanel />}
          {tab === "crm" && <CrmPanel />}
          {tab === "tryon" && <TryOnPanel />}
          {tab === "tickets" && <TicketsPanel />}
          {tab === "returns" && <ReturnsPanel />}
          {tab === "forms" && <FormsPanel />}
          {tab === "logs" && <LogsPanel />}
          {tab === "security" && <SecurityPanel />}
          {tab === "customers" && <Customers />}
          {tab === "campaigns" && <Campaigns />}
          {tab === "messages" && <Messages />}
          {tab === "reviews" && <Reviews />}
          {tab === "integrations" && <Integrations />}
          {tab === "content" && <Content />}
          {tab === "appearance" && <Appearance />}
          {tab === "settings" && <StoreSettings onBack={() => navigate("/")} />}
        </main>
      </div>
    </div>
  );
}

/* =====================================================================
   gate
   ===================================================================== */

function Gate({ onUnlock }: { onUnlock: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const admin = useAdmin();
  const sec = getOps().security;
  const [attempts, setAttempts] = useState(0);
  return (
    <div className="ad-gate">
      <form
        className="ad-gate-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (unlockAdmin(code) || code.trim() === sec.passcode) {
            // also open a real server session for uploads and protected writes
            void adminLogin(code.trim()).catch(() => undefined);
            onUnlock();
          }
          else {
            recordFailedLogin("127.0.0.1");
            setAttempts((n) => n + 1);
            setError(attempts + 1 > 2 ? "رمز چند بار اشتباه وارد شد؛ تلاش‌ها در بخش امنیت ثبت شد." : "رمز درست نیست. دوباره امتحان کن.");
          }
        }}
      >
        <span className="ad-gate-ic"><Lock width={22} height={22} /></span>
        <h1>پنل مدیریت {admin.settings.name}</h1>
        <p>برای ورود رمز مدیریت را وارد کن. این نسخه نمایشی است و داده‌ها فقط در همین مرورگر می‌مانند.</p>
        <input value={code} onChange={(e) => { setCode(e.target.value); setError(""); }} placeholder="رمز مدیریت" dir="ltr" autoFocus aria-label="رمز مدیریت" inputMode="numeric" />
        {error && <span className="ad-gate-error">{error}</span>}
        <button type="submit" className="ad-btn is-primary is-lg">ورود به پنل</button>
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
  const admin = useAdmin();
  const docs = useDocs();
  const submissions = useSubmissions();
  const catalog = liveCatalog();
  const revenue = admin.orders.filter((o) => o.status !== "cancelled").reduce((n, o) => n + o.total, 0);
  const customers = new Set(admin.orders.map((o) => o.email).filter(Boolean)).size;
  const stockValue = catalog.reduce((n, p) => n + totalStock(p) * p.price, 0);
  const lowCount = catalog.filter((p) => { const s = totalStock(p); return s > 0 && s <= 12; }).length;
  const outCount = catalog.filter((p) => totalStock(p) === 0).length;
  const campaignsOn = admin.campaigns.filter((c) => c.active).length;

  const kpis: { icon: typeof Gauge; label: string; value: string; sub: string; to: Tab }[] = [
    { icon: ShoppingBag, label: "سفارش‌ها", value: fa(admin.orders.length), sub: `${fa(admin.orders.filter((o) => o.status === "pending").length)} در انتظار`, to: "orders" },
    { icon: TrendingUp, label: "درآمد", value: formatPrice(revenue), sub: "بدون سفارش‌های لغوشده", to: "orders" },
    { icon: Users, label: "مشتریان", value: fa(customers), sub: "بر اساس سفارش‌ها", to: "customers" },
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
    return { label: start.toLocaleDateString("fa-IR", { weekday: "short" }), value: list.reduce((n, o) => n + o.total, 0) };
  });
  const maxDay = Math.max(1, ...days.map((d) => d.value));

  return (
    <>
      <PageHead title="داشبورد" sub="نمای کلی فروشگاه، انبار، مشتریان و جشنواره‌ها در یک نگاه." />

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
            <Empty text="هنوز سفارشی ثبت نشده. یک خرید در صفحهٔ تسویه حساب انجام بده یا سفارش نمونه بساز." />
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
          <button type="button" className="ad-btn" onClick={() => seedOrder()}><ShoppingBag width={13} height={13} /> سفارش نمونه</button>
          <Link to="/builder" className="ad-btn"><LayoutTemplate width={13} height={13} /> صفحه‌ساز</Link>
          <Link to="/style-builder" className="ad-btn"><Layers width={13} height={13} /> استایل بیلدر</Link>
        </div>
      </Card>
    </>
  );
}

const REASON_LABEL: Record<StockMove["reason"], string> = { sale: "فروش", restock: "شارژ", edit: "ویرایش", create: "ایجاد" };

function seedOrder() {
  const picks = liveCatalog().slice(0, 3);
  const lines: OrderLine[] = picks.map((p) => {
    const c = p.colors[0];
    const s = p.sizes[Math.min(2, p.sizes.length - 1)];
    return { name: p.name, productId: p.id, color: c.name, colorId: c.id, size: s.label, sizeId: s.id, qty: 1, price: p.price };
  });
  const subtotal = lines.reduce((n, l) => n + l.price * l.qty, 0);
  const disc = computeDiscounts(lines.map((l) => ({ productId: l.productId, name: l.name, price: l.price, qty: l.qty })));
  const ship = disc.freeship ? 0 : 12;
  addOrder({
    id: `VL-${Math.floor(10000 + Math.random() * 89999)}`,
    at: Date.now(),
    customer: "مشتری نمونه",
    email: "demo@velours.store",
    phone: "09120000000",
    city: "تهران",
    address: "خیابان ولیعصر، پلاک ۱۲",
    shipping: "standard",
    lines,
    subtotal,
    discounts: disc.applied.map((d) => ({ name: d.name, amount: d.amount })),
    discountTotal: disc.discountTotal,
    shippingCost: ship,
    total: Math.max(0, disc.afterDiscount + ship),
    status: "pending",
    campaign: disc.applied.find((a) => a.id.startsWith("cmp-"))?.name,
    gateway: "نمونه",
  });
  consumeStock(lines.map((l) => ({ productId: l.productId, colorId: l.colorId, sizeId: l.sizeId, qty: l.qty, name: l.name })));
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
  const list = admin.orders.filter((o) => filter === "all" || o.status === filter);

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
            <button type="button" className="ad-btn is-sm" onClick={seedOrder}><Plus width={13} height={13} /> سفارش نمونه</button>
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
            <button type="button" className="ad-btn is-sm" onClick={() => download("shipping-labels.txt", pickedOrdersLabel(admin.orders.filter((o) => picked.has(o.id))), "text/plain")}>چاپ لیبل</button>
            <button type="button" className="ad-btn is-sm" onClick={() => download("invoices.txt", pickedOrdersInvoice(admin.orders.filter((o) => picked.has(o.id))), "text/plain")}>چاپ فاکتور</button>
            <button type="button" className="ad-btn is-sm" onClick={() => setPicked(new Set())}>لغو</button>
          </div>
        </div>
      )}
      <div className="ad-filters">
        {(["all", "pending", "processing", "shipped", "done", "cancelled"] as const).map((f) => (
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
              <tr><th>شناسه</th><th>مشتری</th><th>زمان</th><th>تخفیف</th><th>کل</th><th>وضعیت</th><th /></tr>
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
        <td dir="ltr">{o.id}</td>
        <td>{o.customer}<small>{o.city}</small></td>
        <td>{timeAgo(o.at)}</td>
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
          <td colSpan={7}>
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
  const list = catalog.filter((p) => {
    if (cat !== "all") {
      const coll = COLLECTIONS.find((c) => c.id === cat);
      if (coll && !coll.garments.includes(p.garment)) return false;
    }
    const s = q.trim();
    return !s || `${p.name} ${p.category} ${p.lookName}`.includes(s);
  });

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
            <button type="button" className="ad-btn is-sm is-danger" onClick={() => { selected.forEach((id) => { const cp = admin.customProducts.find((c) => c.id === id); if (cp) removeCustomProduct(id); }); setSelected(new Set()); }}><Trash2 width={12} height={12} /> حذف دست‌سازها</button>
            <button type="button" className="ad-btn is-sm" onClick={() => setSelected(new Set())}>لغو انتخاب</button>
          </div>
        </div>
      )}
      <div className="ad-products">
        {list.map((p) => {
          const stock = totalStock(p);
          const isCustom = !!admin.customProducts.find((c) => c.id === p.id);
          const hidden = admin.hidden.includes(p.id) || (isCustom && !admin.customProducts.find((c) => c.id === p.id)?.active);
          const featured = admin.featured.includes(p.id) || admin.customProducts.find((c) => c.id === p.id)?.featured;
          return (
            <article key={p.id} className={cn("ad-product", hidden && "is-hidden")}>
              <input type="checkbox" className="ad-checkbox" checked={selected.has(p.id)} onChange={() => toggleSel(p.id)} aria-label={`انتخاب ${p.name}`} />
              <ProductThumb product={p} className="w-[60px]" />
              <div className="ad-product-main">
                <p className="ad-product-cat">{p.category}{isCustom ? " · دست‌ساز" : ""}</p>
                <h4>{p.name}</h4>
                <p className="ad-product-meta">
                  {formatPrice(p.price)} · {fa(p.colors.length)} رنگ · {fa(p.sizes.length)} سایز
                  {(admin.complements[p.id]?.length ?? 0) > 0 && <> · {fa(admin.complements[p.id].length)} مکمل</>}
                  {isCustom ? "" : admin.productEdits[p.id] ? " · ویرایش‌شده" : ""}
                </p>
                <div className="ad-stock-bar"><span style={{ width: `${Math.min(100, (stock / 60) * 100)}%` }} className={stock === 0 ? "is-out" : stock <= 12 ? "is-low" : ""} /></div>
                <p className={cn("ad-stock-label", stock === 0 && "is-out", stock > 0 && stock <= 12 && "is-low")}>
                  {stock === 0 ? "ناموجود" : `${fa(stock)} عدد در انبار`}
                </p>
              </div>
              <div className="ad-product-actions">
                <button type="button" className="ad-icon" title="ویرایش محصول" aria-label={`ویرایش ${p.name}`}
                  onClick={() => setEditing(p.id)}>
                  <FileText width={14} height={14} />
                </button>
                <button type="button" className="ad-icon" title="موجودی واریانت‌ها" aria-label={`موجودی ${p.name}`} onClick={() => setStockFor(p.id)}>
                  <Boxes width={14} height={14} />
                </button>
                <button type="button" className={cn("ad-icon", featured && "is-on")} title="نشان ویژه" aria-label={`ویژه ${p.name}`} aria-pressed={!!featured} onClick={() => toggleFeatured(p.id)}>
                  <Star width={14} height={14} />
                </button>
                <button type="button" className={cn("ad-icon", hidden && "is-danger")} title={hidden ? "نمایش در فروشگاه" : "مخفی‌کردن"} aria-label={`${hidden ? "نمایش" : "مخفی‌کردن"} ${p.name}`} aria-pressed={!!hidden} onClick={() => toggleHidden(p.id)}>
                  {hidden ? <EyeOff width={14} height={14} /> : <Eye width={14} height={14} />}
                </button>
                <Link to={`/product/${p.id}`} className="ad-icon" title="دیدن در فروشگاه" aria-label={`دیدن ${p.name}`}>
                  <Store width={14} height={14} />
                </Link>
              </div>
            </article>
          );
        })}
        {list.length === 0 && <Empty text="محصولی با این فیلتر پیدا نشد." />}
      </div>

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
  const [images, setImages] = useState<ProductImage[]>(() => (product ? [...productImagesOf(product.id)] : []));
  const [picked, setPicked] = useState<string[]>(() => (product ? [...complementsOf(product.id)] : []));
  const [compQuery, setCompQuery] = useState("");
  const [customSize, setCustomSize] = useState("");
  const [err, setErr] = useState("");

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

  const save = () => {
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

        <div className="ad-modal-body ad-form-grid">
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
            <div className="ad-two">
              <label className="ad-field">قیمت (یورو)<input className="ad-input" type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)} /></label>
              <label className="ad-field">قیمت قبل از تخفیف (اختیاری)<input className="ad-input" type="number" min={0} value={compareAt || ""} onChange={(e) => setCompareAt(Number(e.target.value) || 0)} /></label>
            </div>
            <label className="ad-field">توضیح کوتاه (اختیاری)
              <textarea className="ad-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>

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
            </div>

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

            <p className="ad-field-label">گالری تصاویر</p>
            <ProductMediaEditor images={images} colors={colors} onChange={setImages} />

            <p className="ad-field-label" style={{ marginTop: 16 }}>کالاهای مکمل</p>
            <div className="ad-complement-picked">
              {picked.length === 0 && <span className="ad-hint">هنوز مکملی انتخاب نشده؛ از فهرست پایین اضافه کن.</span>}
              {picked.map((id) => {
                const p = catalogue.find((x) => x.id === id);
                if (!p) return null;
                return (
                  <span key={id} className="ad-complement-chip">
                    <ProductThumb product={p} className="w-[26px]" />
                    <span>{p.name}</span>
                    <button type="button" className="ad-complement-x" aria-label={`حذف ${p.name}`} onClick={() => setPicked(picked.filter((x) => x !== id))}>
                      <X width={11} height={11} />
                    </button>
                  </span>
                );
              })}
            </div>
            <div className="ad-comp-search">
              <Search width={13} height={13} />
              <input className="ad-input" value={compQuery} onChange={(e) => setCompQuery(e.target.value)} placeholder="جست‌وجوی کالا برای مکمل…" aria-label="جست‌وجوی کالای مکمل" />
            </div>
            <div className="ad-complement-list">
              {compCandidates.map((p) => {
                const on = picked.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={cn("ad-complement-pick", on && "is-on")}
                    aria-pressed={on}
                    onClick={() => setPicked(on ? picked.filter((x) => x !== p.id) : [...picked, p.id])}
                  >
                    <ProductThumb product={p} className="w-[34px]" />
                    <span className="ad-complement-name">
                      <b>{p.name}</b>
                      <small>{GARMENT_LABEL[p.garment]} · {formatPrice(p.price)}</small>
                    </span>
                    {on ? <Check width={13} height={13} /> : <Plus width={13} height={13} />}
                  </button>
                );
              })}
              {compCandidates.length === 0 && <p className="ad-hint">کالایی با این جست‌وجو پیدا نشد.</p>}
            </div>
            <p className="ad-hint">قطعه‌هایی که با این کالا ست می‌شوند؛ مثلاً برای پیراهن نارنجی: شلوار مشکی، شلوار سرمه‌ای، ساعت و کفش چرمی. در صفحهٔ محصول زیر «تکمیل استایل» نمایش داده می‌شوند.</p>

            <p className="ad-field-label">موجودی هر واریانت</p>
            <div className="ad-stock-matrix">
              {colors.map((c) => (
                <div key={c.id} className="ad-stock-matrix-row">
                  <span className="ad-stock-matrix-head"><i style={{ background: c.hex }} />{c.name}</span>
                  {sizes.map((s) => (
                    <input key={s.label} type="number" min={0} max={999} aria-label={`موجودی ${c.name} ${s.label}`} value={stock[`${c.id}:${s.id}`] ?? 0}
                      onChange={(e) => setStock({ ...stock, [`${c.id}:${s.id}`]: Math.max(0, Number(e.target.value) || 0) })} />
                  ))}
                </div>
              ))}
            </div>
          </div>
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
          <button type="button" className="ad-btn is-primary" onClick={save}><Save width={13} height={13} /> {product ? "ذخیرهٔ تغییرات" : "ایجاد محصول"}</button>
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
    if (s) list = list.filter((r) => `${r.name} ${r.email} ${r.city}`.includes(s));
    return list;
  }, [admin.orders, q]);

  const avgOrder = admin.orders.length ? Math.round(admin.orders.reduce((n, o) => n + o.total, 0) / admin.orders.length) : 0;
  const segments = [
    { label: "کل مشتریان", value: fa(rows.length) },
    { label: "تکرارکننده", value: fa(rows.filter((r) => r.orders > 1).length) },
    { label: "میانگین سبد", value: formatPrice(avgOrder) },
    { label: "ارزش کل", value: formatPrice(rows.reduce((n, r) => n + r.total, 0)) },
  ];

  return (
    <>
      <PageHead title="مشتریان (CRM)" sub="مشتریان از سفارش‌ها ساخته می‌شوند؛ برچسب و یادداشت شخصی بزن." />
      <div className="ad-kpis">
        {segments.map((s) => (
          <div key={s.label} className="ad-kpi ad-kpi-static"><b>{s.value}</b><span className="ad-kpi-label">{s.label}</span></div>
        ))}
      </div>
      <input className="ad-input ad-input-inline" value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجوی مشتری…" aria-label="جست‌وجوی مشتری" />
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
   campaigns + rules + codes
   ===================================================================== */

function Campaigns() {
  const admin = useAdmin();
  const [tab, setTab] = useState<"campaigns" | "rules" | "codes" | "preview">("campaigns");
  const [campDraft, setCampDraft] = useState<Campaign | null>(null);
  const [ruleDraft, setRuleDraft] = useState<DiscountRule | null>(null);
  const [codeDraft, setCodeDraft] = useState<{ id: string; code: string; kind: "percent" | "fixed"; value: number; minSpend: number; active: boolean; expires: string; uses: number } | null>(null);

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
                  {c.kind === "percent" ? `${fa(c.value)}٪` : c.kind === "fixed" ? `${fa(c.value)} یورو` : "ارسال رایگان"}
                  {c.minSpend > 0 && ` · حداقل ${fa(c.minSpend)} یورو`}
                  {` · ${SCOPE_LABEL[c.scope]}`}
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
                  {r.type === "fixed" && ` ${fa(r.value)} یورو`}
                  {r.type === "second" && ` ${fa(r.value)}٪ روی دوم`}
                  {r.type === "bundle" && ` ${fa(r.qty)} عدد = ${fa(r.value)} یورو`}
                  {r.type === "freeship" && ` بالای ${fa(r.value)} یورو`}
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
                  {c.kind === "percent" ? `${fa(c.value)}٪` : `${fa(c.value)} یورو`}
                  {c.minSpend > 0 && ` · حداقل ${fa(c.minSpend)}`}
                  {c.expires && ` · تا ${c.expires}`}
                  {` · ${fa(c.uses)} بار`}
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
              {r.type === "bundle" ? "قیمت مجموع" : r.type === "freeship" ? "آستانهٔ ارسال (یورو)" : r.type === "percent" ? "درصد" : r.type === "second" ? "درصد تخفیف دوم" : "مبلغ (یورو)"}
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

function CodeModal({ initial, onClose }: { initial: { id: string; code: string; kind: "percent" | "fixed"; value: number; minSpend: number; active: boolean; expires: string; uses: number }; onClose: () => void }) {
  const [c, setC] = useState(initial);
  const isExisting = !!getAdmin().coupons.find((x) => x.id === c.id);
  return (
    <div className="ad-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ad-modal is-sm" role="dialog" aria-modal="true" aria-label="کد تخفیف">
        <header className="ad-modal-head">
          <div><h3>{isExisting ? "ویرایش کد" : "کد تخفیف جدید"}</h3><p>در صفحهٔ تسویه حساب با این کد اعمال می‌شود.</p></div>
          <button type="button" className="ad-icon" aria-label="بستن" onClick={onClose}><X width={16} height={16} /></button>
        </header>
        <div className="ad-modal-body">
          <label className="ad-field">کد<input className="ad-input" dir="ltr" value={c.code} onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase() })} placeholder="SAVE10" /></label>
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
          <label className="ad-check"><input type="checkbox" checked={c.active} onChange={(e) => setC({ ...c, active: e.target.checked })} /> فعال باشد</label>
        </div>
        <footer className="ad-modal-foot">
          <div className="ad-actions-spacer" />
          <button type="button" className="ad-btn" onClick={onClose}>انصراف</button>
          <button type="button" className="ad-btn is-primary" disabled={!c.code.trim()} onClick={() => { saveCoupon({ ...c, code: c.code.trim().toUpperCase() }); onClose(); }}><Save width={13} height={13} /> ذخیره</button>
        </footer>
      </div>
    </div>
  );
}

/* =====================================================================
   messages / reviews
   ===================================================================== */

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

function Reviews() {
  const admin = useAdmin();
  const approved = admin.reviews.filter((r) => r.approved);
  const avg = approved.length ? approved.reduce((n, r) => n + r.rating, 0) / approved.length : 0;
  return (
    <>
      <PageHead title="نظرات مشتریان" sub={`${fa(approved.length)} نظر تأییدشده · میانگین ${avg ? avg.toFixed(1).replace(".", "/") : "—"}`} />
      <div className="ad-reviews">
        {admin.reviews.map((r) => (
          <article key={r.id} className={cn("ad-review", !r.approved && "is-pending")}>
            <header>
              <span className="ad-stars">{"★".repeat(r.rating)}<i>{"★".repeat(5 - r.rating)}</i></span>
              <b>{r.author}</b>
              <small>{timeAgo(r.at)}</small>
              <span className={cn("ad-pill", r.approved ? "is-done" : "is-pending")}>{r.approved ? "تأییدشده" : "در انتظار"}</span>
            </header>
            <p className="ad-review-product">{r.product}</p>
            <p className="ad-review-text">{r.text}</p>
            <footer>
              <button type="button" className="ad-btn is-sm" onClick={() => setReviewApproved(r.id, !r.approved)}>
                {r.approved ? <XCircle width={13} height={13} /> : <CheckCircle2 width={13} height={13} />}
                {r.approved ? "لغو تأیید" : "تأیید"}
              </button>
              <button type="button" className="ad-btn is-sm is-danger" onClick={() => removeReview(r.id)}><Trash2 width={13} height={13} /> حذف</button>
            </footer>
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

function Appearance() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      <PageHead title="ظاهر سایت" sub="تم پیش‌فرضی که بازدیدکنندگان می‌بینند. مشتری همچنان می‌تواند از هدر عوضش کند." />
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
            <label className="ad-field">آستانهٔ ارسال رایگان (یورو)
              <input className="ad-input" type="number" min={0} value={draft.freeShipping} onChange={(e) => setD({ ...draft, freeShipping: Number(e.target.value) || 0 })} />
            </label>
            <label className="ad-field">هزینهٔ ارسال سریع (یورو)
              <input className="ad-input" type="number" min={0} value={draft.expressCost} onChange={(e) => setD({ ...draft, expressCost: Number(e.target.value) || 0 })} />
            </label>
          </div>
          <div className="ad-two">
            <label className="ad-field">مهلت مرجوعی (روز)
              <input className="ad-input" type="number" min={0} value={draft.returnDays} onChange={(e) => setD({ ...draft, returnDays: Number(e.target.value) || 0 })} />
            </label>
            <label className="ad-field">نماد ارز
              <input className="ad-input" dir="ltr" value={draft.currency} onChange={(e) => setD({ ...draft, currency: e.target.value })} />
            </label>
          </div>
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

/* print helpers (browser text files — real labels/invoices would be PDFs server-side) */
function pickedOrdersLabel(orders: ReturnType<typeof useAdmin>["orders"]) {
  return orders
    .map((o) => ["ولور — برچسب بستهٔ ارسالی", "گیرنده: " + o.customer, "تلفن: " + o.phone, "نشانی: " + o.address + "، " + o.city, "سفارش: " + o.id, "تعداد اقلام: " + o.lines.reduce((n, l) => n + l.qty, 0), "—".repeat(30)].join("\n"))
    .join("\n\n");
}
function pickedOrdersInvoice(orders: ReturnType<typeof useAdmin>["orders"]) {
  return orders
    .map((o) =>
      ["فاکتور ولور", "شماره: " + o.id, "مشتری: " + o.customer, "تاریخ: " + new Date(o.at).toLocaleString("fa-IR"), "", ...o.lines.map((l) => l.name + " × " + l.qty + " = " + l.price * l.qty), "جمع: " + o.subtotal, "تخفیف: " + o.discountTotal, "ارسال: " + o.shippingCost, "مبلغ نهایی: " + o.total, "—".repeat(30)].join("\n"),
    )
    .join("\n\n");
}
