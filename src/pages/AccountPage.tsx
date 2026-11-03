import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BadgeCheck,
  Check,
  CreditCard,
  Home,
  LogOut,
  MapPin,
  MessageSquare,
  Package,
  Pencil,
  Plus,
  Ruler,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trash2,
  Undo2,
  User,
  Wallet,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useAuth, type Address } from "@/state/auth";
import { useAdmin } from "@/state/admin";
import { addTicketMessage, cashbackBalance, createTicket, createReturn, requestTryon, tryonBalance, useOps } from "@/state/ops";
import { formatPrice } from "@/data/looks";
import { liveGetProduct } from "@/data/catalog";
import { ProductThumb } from "@/components/ProductThumb";
import { PageIntro, buttonStyles } from "@/components/ui";
import { SmartSizeGuide } from "@/components/SmartSizeGuide";
import "@/styles/account.css";

type Tab = "overview" | "orders" | "addresses" | "tryon" | "wallet" | "returns" | "tickets" | "size" | "security";

const TABS: { id: Tab; label: string; icon: typeof Package }[] = [
  { id: "overview", label: "نمای کلی", icon: Home },
  { id: "orders", label: "سفارش‌ها", icon: Package },
  { id: "addresses", label: "آدرس‌ها", icon: MapPin },
  { id: "tryon", label: "پرو آنلاین", icon: Sparkles },
  { id: "wallet", label: "کیف پول و کش‌بک", icon: Wallet },
  { id: "returns", label: "مرجوعی", icon: Undo2 },
  { id: "tickets", label: "تیکت‌ها", icon: MessageSquare },
  { id: "size", label: "اندازه‌های من", icon: Ruler },
  { id: "security", label: "امنیت", icon: ShieldCheck },
];

export function AccountPage() {
  const auth = useAuth();
  const admin = useAdmin();
  const ops = useOps();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");

  if (!auth.account) {
    return (
      <div className="acc-guest">
        <div>
          <User width={30} height={30} />
          <h1>برای دیدن حساب وارد شو</h1>
          <p>سفارش‌ها، آدرس‌ها، پرو آنلاین و کش‌بک در حساب تو ذخیره می‌شود.</p>
          <Link to="/auth" className={buttonStyles("solid", "lg", "mt-4")}>ورود / ثبت‌نام</Link>
        </div>
      </div>
    );
  }

  const acc = auth.account;
  const orders = admin.orders.filter((o) => o.email.toLowerCase() === acc.email.toLowerCase());
  const tickets = ops.tickets.filter((t) => t.email === acc.email);
  const cashback = cashbackBalance(acc.email);
  const tryon = tryonBalance(acc.email);
  const spend = orders.reduce((n, o) => n + o.total, 0);
  const labels = ops.labels.filter((l) => {
    if (l.rule.type === "orders") return orders.length >= l.rule.value;
    if (l.rule.type === "spend") return spend >= l.rule.value;
    if (l.rule.type === "idle") return orders.length > 0 && Date.now() - Math.max(...orders.map((o) => o.at)) > l.rule.value * 86400000;
    return false;
  });

  return (
    <div className="acc-page">
      <PageIntro
        crumbs={[{ label: "حساب من" }]}
        eyebrow={`${acc.name} · ${acc.email}`}
        title="حساب من"
        description="سفارش‌ها، آدرس‌های ذخیره‌شده، پرو آنلاین، کش‌بک و پشتیبانی."
      >
        <div className="acc-head-actions">
          <Link to="/products" className={buttonStyles("outline", "sm")}>ادامهٔ خرید</Link>
          <button type="button" className={buttonStyles("ghost", "sm")} onClick={() => { auth.logout(); nav("/"); }}>
            <LogOut width={13} height={13} /> خروج
          </button>
        </div>
      </PageIntro>

      <div className="acc-shell">
        <nav className="acc-nav" aria-label="بخش‌های حساب">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={cn("acc-nav-item", tab === t.id && "is-on")} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}>
              <t.icon width={15} height={15} />
              <span>{t.label}</span>
              {t.id === "tryon" && tryon > 0 && <em>{tryon.toLocaleString("fa-IR")}</em>}
              {t.id === "tickets" && tickets.filter((x) => x.status !== "closed").length > 0 && <em>{tickets.filter((x) => x.status !== "closed").length.toLocaleString("fa-IR")}</em>}
            </button>
          ))}
        </nav>

        <main className="acc-main">
          {tab === "overview" && (
            <>
              <div className="acc-kpis">
                <Stat icon={<Package width={15} height={15} />} label="سفارش‌ها" value={orders.length.toLocaleString("fa-IR")} />
                <Stat icon={<Wallet width={15} height={15} />} label="کش‌بک" value={`${cashback.toLocaleString("fa-IR")} تومان`} />
                <Stat icon={<Sparkles width={15} height={15} />} label="اعتبار پرو آنلاین" value={`${tryon.toLocaleString("fa-IR")} بار`} />
                <Stat icon={<CreditCard width={15} height={15} />} label="مجموع خرید" value={formatPrice(spend)} />
              </div>

              <section className="acc-card">
                <header><h3><BadgeCheck width={15} height={15} /> برچسب‌های حساب</h3></header>
                <div className="acc-labels">
                  {labels.length === 0 && <span className="acc-muted">هنوز برچسبی نداری — با هر خرید برچسب می‌گیری.</span>}
                  {labels.map((l) => (
                    <span key={l.id} className="acc-label" style={{ background: `${l.color}18`, color: l.color }}>{l.name}</span>
                  ))}
                </div>
              </section>

              <section className="acc-card">
                <header><h3><Package width={15} height={15} /> آخرین سفارش</h3><button type="button" className="acc-link" onClick={() => setTab("orders")}>همه</button></header>
                {orders.length === 0 ? (
                  <p className="acc-muted">هنوز سفارشی ثبت نشده. <Link to="/products">شروع خرید</Link></p>
                ) : (
                  <OrderRowCompact order={orders[0]} />
                )}
              </section>
            </>
          )}

          {tab === "orders" && (
            <section className="acc-card">
              <header><h3><Package width={15} height={15} /> سفارش‌ها</h3></header>
              {orders.length === 0 ? (
                <p className="acc-muted">سفارشی نیست. <Link to="/products">از فروشگاه شروع کن.</Link></p>
              ) : (
                <ul className="acc-orders">
                  {orders.map((o) => (
                    <li key={o.id}>
                      <div className="acc-order-row">
                        <div>
                          <p className="acc-order-id" dir="ltr">{o.id}</p>
                          <p className="acc-muted">{new Date(o.at).toLocaleDateString("fa-IR")} · {o.lines.length.toLocaleString("fa-IR")} قلم</p>
                        </div>
                        <span className={cn("acc-pill", o.status === "done" ? "is-done" : o.status === "cancelled" ? "is-bad" : "is-open")}>
                          {o.status === "pending" ? "در انتظار" : o.status === "processing" ? "آماده‌سازی" : o.status === "shipped" ? "ارسال شده" : o.status === "done" ? "تحویل شده" : "لغو شده"}
                        </span>
                        <b>{formatPrice(o.total)}</b>
                        <button type="button" className="acc-link" onClick={() => setTab("orders")} aria-label={`سفارش ${o.id}`}>جزئیات</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "addresses" && <Addresses />}

          {tab === "tryon" && <TryOn acc={acc.email} />}

          {tab === "wallet" && <WalletTab email={acc.email} />}

          {tab === "returns" && <Returns email={acc.email} />}

          {tab === "tickets" && <Tickets email={acc.email} />}

          {tab === "size" && <SizeTab />}

          {tab === "security" && <SecurityTab />}
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* sub views                                                          */
/* ------------------------------------------------------------------ */

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="acc-kpi">
      <span className="acc-kpi-ic">{icon}</span>
      <b>{value}</b>
      <small>{label}</small>
    </div>
  );
}

function OrderRowCompact({ order }: { order: ReturnType<typeof useAdmin>["orders"][number] }) {
  return (
    <div className="acc-order-mini">
      <div>
        <p className="acc-order-id" dir="ltr">{order.id}</p>
        <p className="acc-muted">{new Date(order.at).toLocaleDateString("fa-IR")}</p>
      </div>
      <b>{formatPrice(order.total)}</b>
    </div>
  );
}

function Addresses() {
  const auth = useAuth();
  const [draft, setDraft] = useState<Address | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const acc = auth.account!;

  const blank = (): Address => ({ id: `a${Date.now()}`, label: "خانه", receiver: acc.name, phone: acc.phone, province: "تهران", city: "تهران", street: "", postal: "", default: acc.addresses.length === 0 });

  return (
    <section className="acc-card">
      <header>
        <h3><MapPin width={15} height={15} /> آدرس‌های من</h3>
        <button type="button" className={buttonStyles("outline", "sm")} onClick={() => setDraft(blank())}><Plus width={13} height={13} /> آدرس جدید</button>
      </header>

      {acc.addresses.length === 0 ? (
        <p className="acc-muted">آدرسی ذخیره نکرده‌ای. آدرس اول را اضافه کن تا در تسویه‌حساب سریع‌تر شود.</p>
      ) : (
        <ul className="acc-addresses">
          {acc.addresses.map((a) => (
            <li key={a.id} className={cn("acc-address", a.default && "is-default")}>
              <div>
                <p className="acc-address-label">{a.label} {a.default && <span className="acc-default">پیش‌فرض</span>}</p>
                <p className="acc-address-text">{a.receiver} · {a.province}, {a.city}, {a.street} {a.postal && `· ${a.postal}`}</p>
                <p className="acc-muted" dir="ltr">{a.phone}</p>
              </div>
              <div className="acc-address-actions">
                {!a.default && <button type="button" className="acc-link" onClick={() => auth.setDefaultAddress(a.id)}>پیش‌فرض</button>}
                <button type="button" className="acc-icon-btn" aria-label="ویرایش" onClick={() => setDraft(a)}><Pencil width={13} height={13} /></button>
                <button type="button" className="acc-icon-btn is-danger" aria-label="حذف" onClick={() => setConfirm(a.id)}><Trash2 width={13} height={13} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {draft && (
        <div className="acc-modal" onMouseDown={(e) => e.target === e.currentTarget && setDraft(null)}>
          <div role="dialog" aria-modal="true" aria-label="آدرس">
            <header><h3>{acc.addresses.some((x) => x.id === draft.id) ? "ویرایش آدرس" : "آدرس جدید"}</h3></header>
            <div className="acc-form-grid">
              <label>عنوان<input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></label>
              <label>گیرنده<input value={draft.receiver} onChange={(e) => setDraft({ ...draft, receiver: e.target.value })} /></label>
              <label>موبایل<input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} dir="ltr" /></label>
              <label>استان<input value={draft.province} onChange={(e) => setDraft({ ...draft, province: e.target.value })} /></label>
              <label>شهر<input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} /></label>
              <label>کد پستی<input value={draft.postal} onChange={(e) => setDraft({ ...draft, postal: e.target.value })} dir="ltr" /></label>
              <label className="is-full">نشانی<input value={draft.street} onChange={(e) => setDraft({ ...draft, street: e.target.value })} /></label>
              <label className="acc-check"><input type="checkbox" checked={draft.default} onChange={(e) => setDraft({ ...draft, default: e.target.checked })} /> آدرس پیش‌فرض</label>
            </div>
            <footer>
              <button type="button" className="acc-btn" onClick={() => setDraft(null)}>انصراف</button>
              <button type="button" className="acc-btn is-primary" disabled={!draft.street.trim()} onClick={() => { auth.saveAddress(draft); setDraft(null); }}>
                <Check width={14} height={14} /> ذخیره
              </button>
            </footer>
          </div>
        </div>
      )}

      {confirm && (
        <div className="acc-modal" onMouseDown={(e) => e.target === e.currentTarget && setConfirm(null)}>
          <div role="dialog" aria-modal="true" className="is-narrow">
            <header><h3>حذف آدرس؟</h3></header>
            <p className="acc-muted">این آدرس از حساب تو پاک می‌شود.</p>
            <footer>
              <button type="button" className="acc-btn" onClick={() => setConfirm(null)}>انصراف</button>
              <button type="button" className="acc-btn is-danger" onClick={() => { auth.removeAddress(confirm); setConfirm(null); }}>حذف</button>
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}

function TryOn({ acc }: { acc: string }) {
  const ops = useOps();
  const auth = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const credits = tryonBalance(acc);
  const requests = ops.tryonRequests.filter((r) => r.email === acc);

  return (
    <>
      <section className="acc-card">
        <header><h3><Sparkles width={15} height={15} /> پرو آنلاین</h3><span className="acc-badge">{credits.toLocaleString("fa-IR")} اعتبار</span></header>
        <p className="acc-muted">لباس را روی تصویر خودت ببین. یک اعتبار برای هر درخواست مصرف می‌شود و تیم استایل نتایج را برایت آماده می‌کند.</p>
        <div className="acc-tryon-grid">
          {ops.tryonPackages.map((p) => (
            <article key={p.id} className={cn("acc-pack", p.popular && "is-popular")}>
              {p.popular && <span className="acc-popular">پیشنهاد ویژه</span>}
              <b>{p.name}</b>
              <p>{p.credits.toLocaleString("fa-IR")} پرو</p>
              <strong>{p.price.toLocaleString("fa-IR")} تومان</strong>
              <button type="button" className={buttonStyles("solid", "sm", "mt-2 w-full")} onClick={() => { const r = auth.purchaseTryon(p.credits, p.price); setMsg({ ok: r.ok, text: r.message }); }}>
                خرید بسته
              </button>
            </article>
          ))}
        </div>
        {msg && <p className={cn("acc-msg", msg.ok ? "is-ok" : "is-bad")}>{msg.text}</p>}
      </section>

      <section className="acc-card">
        <header><h3>درخواست پرو جدید</h3></header>
        <p className="acc-muted">یک محصول انتخاب کن؛ تیم استایل نسخهٔ روی‌تنی را برایت آماده می‌کند.</p>
        <div className="acc-tryon-products">
          {propsProducts().map((p) => (
            <button key={p.id} type="button" className={cn("acc-tryon-product", selected === p.id && "is-on")} onClick={() => setSelected(p.id)}>
              <ProductThumb product={p} className="w-full" />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className={buttonStyles("solid", "md", "mt-3")}
          disabled={!selected}
          onClick={() => {
            const p = liveGetProduct(selected!);
            if (!p) return;
            const r = requestTryon({ email: acc, productId: p.id, productName: p.name });
            setMsg({ ok: r.ok, text: r.message });
            if (r.ok) setSelected(null);
          }}
        >
          ثبت درخواست پرو ({credits.toLocaleString("fa-IR")} اعتبار)
        </button>
        {msg && <p className={cn("acc-msg", msg.ok ? "is-ok" : "is-bad")}>{msg.text}</p>}
      </section>

      <section className="acc-card">
        <header><h3>درخواست‌های من</h3></header>
        {requests.length === 0 ? (
          <p className="acc-muted">هنوز درخواستی ثبت نکرده‌ای.</p>
        ) : (
          <ul className="acc-tryons">
            {requests.map((r) => (
              <li key={r.id}>
                <div>
                  <p className="acc-order-id" dir="ltr">{r.id}</p>
                  <p className="acc-muted">{r.productName} · {new Date(r.at).toLocaleDateString("fa-IR")}</p>
                </div>
                <span className={cn("acc-pill", r.status === "ready" ? "is-done" : r.status === "rejected" ? "is-bad" : "is-open")}>
                  {r.status === "queued" ? "در صف" : r.status === "ready" ? "آماده" : "رد شد"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function propsProducts() {
  return getFirstProducts();
}

function getFirstProducts() {
  const products: ReturnType<typeof liveGetProduct>[] = [];
  for (const id of ["p-rive-coat", "p-sienna-blazer", "p-nuage-sweater", "p-bias-slip"]) {
    const p = liveGetProduct(id);
    if (p) products.push(p);
  }
  return products as NonNullable<(typeof products)[number]>[];
}

function WalletTab({ email }: { email: string }) {
  const ops = useOps();
  const cashes = ops.cashbackTxns.filter((t) => t.email === email);
  const balance = cashbackBalance(email);
  return (
    <section className="acc-card">
      <header><h3><Wallet width={15} height={15} /> کیف پول و کش‌بک</h3></header>
      <div className="acc-wallet-hero">
        <span>موجودی کش‌بک</span>
        <b>{balance.toLocaleString("fa-IR")} تومان</b>
        <small>با هر خرید، {ops.cashbackRate.toLocaleString("fa-IR")}٪ از مبلغ کالاها به کیف پول تو برمی‌گردد.</small>
      </div>
      {cashes.length === 0 ? (
        <p className="acc-muted">هنوز تراکنش کش‌بکی نداری. با اولین خرید فعال می‌شود.</p>
      ) : (
        <ul className="acc-txns">
          {cashes.map((t) => (
            <li key={t.id}>
              <span>{t.kind === "earn" ? "کش‌بک خرید" : "استفاده"}</span>
              <small>{new Date(t.at).toLocaleDateString("fa-IR")} · {t.orderId}</small>
              <b className={t.kind === "earn" ? "is-ok" : ""}>{t.kind === "earn" ? "+" : "−"} {t.amount.toLocaleString("fa-IR")}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Returns({ email }: { email: string }) {
  const ops = useOps();
  const admin = useAdmin();
  const mine = ops.returns.filter((r) => r.email === email);
  const orders = admin.orders.filter((o) => o.email.toLowerCase() === email.toLowerCase());
  const [open, setOpen] = useState(false);
  const [orderId, setOrderId] = useState(orders[0]?.id ?? "");
  const [reason, setReason] = useState("سایز مناسب نبود");
  const [done, setDone] = useState<string | null>(null);

  return (
    <>
      <section className="acc-card">
        <header><h3><Undo2 width={15} height={15} /> مرجوعی</h3><button type="button" className={buttonStyles("outline", "sm")} disabled={!orders.length} onClick={() => setOpen(true)}>درخواست مرجوعی</button></header>
        {mine.length === 0 ? <p className="acc-muted">درخواست مرجوعی نداری.</p> : (
          <ul className="acc-tryons">
            {mine.map((r) => (
              <li key={r.id}>
                <div>
                  <p className="acc-order-id" dir="ltr">{r.id} · {r.orderId}</p>
                  <p className="acc-muted">{r.items.map((i) => i.name).join("، ")} · {formatPrice(r.refund)}</p>
                </div>
                <span className={cn("acc-pill", r.status === "refunded" ? "is-done" : r.status === "rejected" ? "is-bad" : "is-open")}>
                  {r.status === "requested" ? "ثبت شده" : r.status === "approved" ? "تأیید" : r.status === "received" ? "دریافت شد" : r.status === "refunded" ? "بازپرداخت" : "رد شد"}
                </span>
              </li>
            ))}
          </ul>
        )}
        {done && <p className="acc-msg is-ok">{done}</p>}
      </section>

      {open && (
        <div className="acc-modal" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="درخواست مرجوعی">
            <header><h3>درخواست مرجوعی</h3></header>
            <label className="acc-field">سفارش
              <select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
                {orders.map((o) => <option key={o.id} value={o.id}>{o.id} — {formatPrice(o.total)}</option>)}
              </select>
            </label>
            <label className="acc-field">دلیل
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                {["سایز مناسب نبود", "رنگ متفاوت بود", "کیفیت مطابق انتظار نبود", "سفارش اشتباه", "سایر"].map((r) => <option key={r}>{r}</option>)}
              </select>
            </label>
            <p className="acc-muted">کارشناس پشتیبانی حداکثر ۲۴ ساعت آینده پیگیری می‌کند.</p>
            <footer>
              <button type="button" className="acc-btn" onClick={() => setOpen(false)}>انصراف</button>
              <button
                type="button"
                className="acc-btn is-primary"
                onClick={() => {
                  const order = orders.find((o) => o.id === orderId);
                  if (!order) return;
                  createReturn({ orderId: order.id, email: email, items: order.lines.map((l) => ({ name: l.name, qty: l.qty, reason })), refund: Math.round(order.total * 0.6) });
                  setOpen(false);
                  setDone("درخواست مرجوعی ثبت شد.");
                }}
              >
                ثبت
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function Tickets({ email }: { email: string }) {
  const ops = useOps();
  const auth = useAuth();
  const mine = ops.tickets.filter((t) => t.email === email);
  const [open, setOpen] = useState<string | null>(mine[0]?.id ?? null);
  const [draft, setDraft] = useState({ subject: "", body: "" });
  const [newOpen, setNewOpen] = useState(false);

  return (
    <>
      <section className="acc-card">
        <header><h3><Ticket width={15} height={15} /> تیکت‌ها</h3><button type="button" className={buttonStyles("outline", "sm")} onClick={() => setNewOpen(true)}><Plus width={13} height={13} /> تیکت جدید</button></header>
        {mine.length === 0 ? <p className="acc-muted">تیکتی نداری.</p> : (
          <ul className="acc-tickets">
            {mine.map((t) => (
              <li key={t.id} className={cn(open === t.id && "is-open")}>
                <button type="button" className="acc-ticket-head" onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>
                  <b>{t.subject}</b>
                  <span className="acc-muted">{t.id} · {new Date(t.at).toLocaleDateString("fa-IR")}</span>
                  <span className={cn("acc-pill", t.status === "closed" ? "is-done" : t.status === "pending" ? "is-open" : "is-bad")}>
                    {t.status === "open" ? "باز" : t.status === "pending" ? "منتظر پاسخ" : "بسته"}
                  </span>
                </button>
                {open === t.id && (
                  <div className="acc-ticket-body">
                    <ul>
                      {t.messages.map((m) => (
                        <li key={m.id} className={m.from === "customer" ? "is-me" : "is-staff"}>
                          <p>{m.body}</p>
                          <small>{m.author} · {new Date(m.at).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</small>
                        </li>
                      ))}
                    </ul>
                    {t.status !== "closed" && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const input = (e.currentTarget.elements.namedItem("msg") as HTMLInputElement)!;
                          if (!input.value.trim()) return;
                          addTicketMessage(t.id, { from: "customer", author: auth.account?.name ?? "مشتری", body: input.value.trim() });
                          input.value = "";
                        }}
                        className="acc-ticket-form"
                      >
                        <input name="msg" placeholder="پاسخ خود را بنویس…" aria-label="پاسخ" />
                        <button type="submit" className="acc-btn is-primary"><SendIcon /></button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {newOpen && (
        <div className="acc-modal" onMouseDown={(e) => e.target === e.currentTarget && setNewOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="تیکت جدید">
            <header><h3>تیکت جدید</h3></header>
            <label className="acc-field">موضوع<input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></label>
            <label className="acc-field">پیام<textarea rows={4} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} /></label>
            <footer>
              <button type="button" className="acc-btn" onClick={() => setNewOpen(false)}>انصراف</button>
              <button
                type="button"
                className="acc-btn is-primary"
                disabled={!draft.subject.trim() || !draft.body.trim()}
                onClick={() => {
                  const t = createTicket({ email, subject: draft.subject.trim(), dept: "other", priority: "normal", body: draft.body.trim(), author: auth.account?.name });
                  setNewOpen(false);
                  setOpen(t.id);
                  setDraft({ subject: "", body: "" });
                }}
              >
                ارسال
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function SizeTab() {
  const auth = useAuth();
  const ops = useOps();
  const [open, setOpen] = useState(false);
  const s = auth.account!.size;
  const bmi = (s.weight / Math.pow(s.height / 100, 2)).toFixed(1);
  const firstSet = ops.sizeSets.find((x) => x.id === "apparel-w") ?? ops.sizeSets[0];
  return (
    <>
      <section className="acc-card">
        <header><h3><Ruler width={15} height={15} /> اندازه‌های من</h3><button type="button" className={buttonStyles("outline", "sm")} onClick={() => setOpen(true)}>اندازه‌گیری مجدد</button></header>
        <div className="acc-size-grid">
          {[
            ["قد", s.height, "سانتی‌متر"],
            ["وزن", s.weight, "کیلوگرم"],
            ["سن", s.age, "سال"],
            ["دور سینه", s.chest, "سانتی‌متر"],
            ["دور کمر", s.waist, "سانتی‌متر"],
            ["دور باسن", s.hip, "سانتی‌متر"],
            ["عرض شانه", s.shoulder, "سانتی‌متر"],
            ["سایز کفش", s.shoe, "EU"],
          ].map(([l, v, u]) => (
            <div key={l as string} className="acc-size-cell">
              <small>{l}</small>
              <b>{(v as number).toLocaleString("fa-IR")} <em>{u}</em></b>
            </div>
          ))}
        </div>
        <p className="acc-muted">شاخص تودهٔ بدنی: {Number(bmi).toLocaleString("fa-IR")} — سایز پیشنهادی کلی: {firstSet?.sizes[Math.min(2, firstSet.sizes.length - 1)]}</p>
      </section>
      {open && (
        <SmartSizeGuide
          sizes={(firstSet?.sizes ?? ["S", "M", "L"]).map((l) => ({ id: l, label: l }))}
          onClose={() => setOpen(false)}
          onPick={() => {
            auth.updateAccount({ size: { ...s } });
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

function SecurityTab() {
  const auth = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const acc = auth.account!;
  return (
    <section className="acc-card">
      <header><h3><ShieldCheck width={15} height={15} /> امنیت حساب</h3></header>
      <p className="acc-muted">می‌توانی رمز عبور را تغییر دهی و ورود با کد یکبار مصرف را فعال نگه داری.</p>
      <div className="acc-form-grid">
        <label>ایمیل<input value={acc.email} readOnly dir="ltr" /></label>
        <label>شمارهٔ موبایل<input value={acc.phone} onChange={(e) => auth.updateAccount({ phone: e.target.value })} dir="ltr" /></label>
        <label>رمز جدید<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} dir="ltr" /></label>
        <label>تکرار رمز<input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} dir="ltr" /></label>
      </div>
      <button
        type="button"
        className={buttonStyles("solid", "md", "mt-3")}
        onClick={() => {
          if (pw.length < 8) return setMsg({ ok: false, text: "رمز باید حداقل ۸ کاراکتر باشد." });
          if (pw !== pw2) return setMsg({ ok: false, text: "رمزها یکسان نیستند." });
          auth.updateAccount({ password: pw });
          setPw("");
          setPw2("");
          setMsg({ ok: true, text: "رمز عبور به‌روز شد." });
        }}
      >
        <ShieldCheck width={14} height={14} /> ذخیرهٔ رمز
      </button>
      {msg && <p className={cn("acc-msg", msg.ok ? "is-ok" : "is-bad")}>{msg.text}</p>}
      <label className="acc-check"><input type="checkbox" checked={acc.twoFactor} onChange={(e) => auth.updateAccount({ twoFactor: e.target.checked })} /> ورود دو مرحله‌ای (نمایشی)</label>
    </section>
  );
}
