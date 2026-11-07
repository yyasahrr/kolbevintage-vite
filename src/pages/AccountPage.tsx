import { MeasurementsTab } from "@/components/account/Measurements";
import { SupportTickets } from "@/components/account/SupportTickets";
import { useEffect, useRef, useState } from "react";
import { formatJalali } from "@/utils/date";
import { Link, useNavigate } from "react-router-dom";
import {
  Check,
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
  Trash2,
  Undo2,
  User,
  Wallet,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useAuth, type Address } from "@/state/auth";
import { formatPrice } from "@/data/looks";
import { commerce, type CashbackWallet, type CommerceConfig, type CustomerOrder, type CustomerReturn } from "@/lib/commerce";
import { ApiError } from "@/lib/api";
import { useDialogFocus, useEscape, useScrollLock } from "@/hooks/useOverlay";
import { PageIntro, buttonStyles } from "@/components/ui";
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

type Remote<T> = { status: "loading" | "ready" | "error"; data: T | null; reload: () => void };
function useRemote<T>(email:string, fetcher:()=>Promise<T>): Remote<T> {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{status:"loading"|"ready"|"error";data:T|null}>({status:"loading",data:null});
  useEffect(()=>{
    let alive = true;
    setState({status:"loading",data:null});
    fetcher().then(data=>{if(alive) setState({status:"ready",data});}).catch(()=>{if(alive) setState({status:"error",data:null});});
    return ()=>{alive=false;};
  },[email,fetcher,version]);
  return {...state,reload:()=>setVersion(v=>v+1)};
}
function useCustomerOrders(email:string) { return useRemote(email,commerce.orders); }
const orderStatus = (status:string) => ({paid:"ثبت شده",preparing:"آماده‌سازی",shipped:"ارسال شده",delivered:"تحویل شده",cancelled:"لغو شده",exception:"نیازمند بررسی"} as Record<string,string>)[status] ?? "وضعیت نامشخص";
const paymentKindLabel = (kind:CustomerOrder["paymentKind"]) => ({simulated:"پرداخت آزمایشی، بدون پرداخت بانکی",manual:"پرداخت دستی ثبت شده؛ تأیید بانکی خودکار نیست",unknown:"منشأ پرداخت مشخص نیست",provider:"پرداخت از طریق ارائه‌دهنده ثبت شده است"} as Record<string,string>)[kind] ?? "منشأ پرداخت مشخص نیست";
const returnStatus = (status:string) => ({requested:"در انتظار بررسی",approved:"تأیید شده",rejected:"رد شده",received:"کالا دریافت شده",qc_passed:"بررسی کالا انجام شد",qc_failed:"کالا شرایط بررسی را نداشت",manual_review:"نیازمند بررسی دستی",settled:"تسویه ثبت شده"} as Record<string,string>)[status] ?? "وضعیت نامشخص";

export function AccountPage() {
  const auth = useAuth();
  if (auth.accountLoading) return <div className="acc-guest"><p role="status">در حال دریافت اطلاعات حساب…</p></div>;
  if (!auth.account) return <div className="acc-guest"><div><User width={30} height={30}/><h1>برای دیدن حساب وارد شو</h1><p>برای دسترسی به سفارش‌ها وارد حساب کاربری خود شوید.</p><Link to="/auth" className={buttonStyles("solid", "lg", "mt-4")}>ورود / ثبت‌نام</Link></div></div>;
  return <AccountContent key={auth.account.email} />;
}

function AccountContent() {
  const auth = useAuth();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("overview");
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [loggingOut,setLoggingOut] = useState(false);
  const [logoutError,setLogoutError] = useState("");
  const logoutLock = useRef(false);
  const acc = auth.account!;
  const orderState = useCustomerOrders(acc.email);
  const orders = orderState.data ?? [];
  const wallet = useServerWallet(acc.email);

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
          <button type="button" className={buttonStyles("ghost", "sm")} disabled={loggingOut} onClick={async () => {
            if (logoutLock.current) return;
            logoutLock.current=true;setLoggingOut(true);setLogoutError("");
            try {const result=await auth.logout();if(result.ok) nav("/");else setLogoutError(result.message);}
            finally {logoutLock.current=false;setLoggingOut(false);}
          }}>
            <LogOut width={13} height={13} /> {loggingOut ? "در حال خروج…" : "خروج"}
          </button>
          {logoutError && <p role="alert">{logoutError}</p>}
        </div>
      </PageIntro>

      <div className="acc-shell">
        <nav className="acc-nav" aria-label="بخش‌های حساب">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={cn("acc-nav-item", tab === t.id && "is-on")} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}>
              <t.icon width={15} height={15} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <main className="acc-main">
          {tab === "overview" && (
            <>
              <div className="acc-kpis">
                <Stat icon={<Package width={15} height={15} />} label="سفارش‌های اخیر" value={orderState.data ? orders.length.toLocaleString("fa-IR") : "—"} />
                <Stat icon={<Wallet width={15} height={15} />} label="کش‌بک" value={wallet ? formatPrice(wallet.balance) : "—"} />
              </div>

              <section className="acc-card">
                <header><h3><Package width={15} height={15} /> آخرین سفارش</h3><button type="button" className="acc-link" onClick={() => setTab("orders")}>همه</button></header>
                {orderState.status === "loading" ? <p role="status" className="acc-muted">در حال دریافت سفارش‌ها…</p> : orderState.status === "error" ? <p role="alert" className="acc-muted">دریافت سفارش‌ها ناموفق بود. <button type="button" className="acc-link" onClick={orderState.reload}>تلاش دوباره</button></p> : orders.length === 0 ? (
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
              <p className="acc-muted">حداکثر ۲۰۰ سفارش اخیر نمایش داده می‌شود. مبلغ هر سفارش، مبلغ اولیه است و بازپرداخت‌های احتمالی از آن کم نشده‌اند.</p>
              {orderState.status === "loading" ? <p role="status" className="acc-muted">در حال دریافت سفارش‌ها…</p> : orderState.status === "error" ? <p role="alert" className="acc-muted">دریافت سفارش‌ها ناموفق بود. <button type="button" className="acc-link" onClick={orderState.reload}>تلاش دوباره</button></p> : orders.length === 0 ? (
                <p className="acc-muted">سفارشی نیست. <Link to="/products">از فروشگاه شروع کن.</Link></p>
              ) : (
                <ul className="acc-orders">
                  {orders.map((o) => (
                    <li key={o.id}>
                      <div className="acc-order-row">
                        <div>
                          <p className="acc-order-id" dir="ltr">{o.id}</p>
                          <p className="acc-muted">{formatJalali(o.createdAt)} · {o.lines.length.toLocaleString("fa-IR")} قلم</p>
                          <p className="acc-muted">{paymentKindLabel(o.paymentKind)}</p>
                        </div>
                        <span className={cn("acc-pill", o.status === "delivered" ? "is-done" : o.status === "cancelled" || o.status === "exception" ? "is-bad" : "is-open")}>
                          {orderStatus(o.status)}
                        </span>
                        <b>{formatPrice(o.total)}</b>
                        <button
                          type="button"
                          className="acc-link"
                          onClick={() => setOpenOrder(openOrder === o.id ? null : o.id)}
                          aria-expanded={openOrder === o.id}
                          aria-label={`جزئیات سفارش ${o.id}`}
                        >
                          {openOrder === o.id ? "بستن" : "جزئیات"}
                        </button>
                      </div>
                      {openOrder === o.id && (
                        <div className="acc-order-detail">
                          {/* the carrier code the shop entered in the panel (decision 84) */}
                          <p>
                            کد رهگیری:{" "}
                            {o.tracking ? <b className="acc-track" dir="ltr">{o.tracking}</b> : <span className="acc-muted">هنوز ثبت نشده است.</span>}
                          </p>
                          <ul>
                            {o.lines.map((l, i) => (
                              <li key={i}>
                                {l.name} · {l.colorName || "—"} / {l.sizeLabel || "—"} × {l.quantity.toLocaleString("fa-IR")}
                              </li>
                            ))}
                          </ul>
                          <p className="acc-muted">شرکت حمل: {o.carrier || "ثبت نشده"}</p>
                          <p className="acc-muted">ارسال به: {o.address || o.city || "ثبت نشده"}</p>
                          {o.paymentKind === "simulated" && <p className="acc-muted">پرداخت این سفارش آزمایشی بوده و پرداخت بانکی انجام نشده است.</p>}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "addresses" && <Addresses />}

          {tab === "tryon" && <Unavailable title="پرو آنلاین" message="خرید و ثبت درخواست پرو تا اتصال سرویس و پرداخت معتبر غیرفعال است. درخواست یا اعتباری در این بخش ثبت نمی‌شود." />}

          {tab === "wallet" && <WalletTab email={acc.email} />}

          {tab === "returns" && <Returns email={acc.email} orderState={orderState} />}

          {tab === "tickets" && <SupportTickets />}

          {tab === "size" && <MeasurementsTab />}

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

function OrderRowCompact({ order }: { order: CustomerOrder }) {
  return (
    <div className="acc-order-mini">
      <div>
        <p className="acc-order-id" dir="ltr">{order.id}</p>
        <p className="acc-muted">{formatJalali(order.createdAt)}</p>
      </div>
      <b>{formatPrice(order.total)}</b>
    </div>
  );
}

function Addresses() {
  const auth = useAuth();
  const acc = auth.account!;
  const [draft,setDraft] = useState<{address:Address;expected:Address[]}|null>(null);
  const [confirm,setConfirm] = useState<{address:Address;expected:Address[]}|null>(null);
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState<{ok:boolean;text:string}|null>(null);
  const lock=useRef(false);
  const dialog=useRef<HTMLDivElement>(null);
  const open=!!draft || !!confirm;
  const close=()=>{if (!lock.current) {setDraft(null);setConfirm(null);setMessage(null);}};
  useEscape(open,close); useDialogFocus(open,dialog); useScrollLock(open);
  const blank = (): Address => ({id:`a_${crypto.randomUUID()}`,label:"خانه",receiver:acc.name,phone:acc.phone,province:"",city:"",street:"",postal:"",default:acc.addresses.length === 0});
  const normalize = (addresses:Address[]) => addresses.length && !addresses.some(a=>a.default) ? addresses.map((a,i)=>({...a,default:i===0})) : addresses;
  async function write(addresses:Address[],expected:Address[]) {
    if (lock.current) return;
    lock.current=true; setBusy(true); setMessage(null);
    try {
      const result=await auth.replaceAddresses(normalize(addresses),expected);
      if (result.ok) { setDraft(null);setConfirm(null);setMessage({ok:true,text:result.message}); }
      else {
        let text=result.message;
        if (result.code === "address_conflict" || result.code === "uncertain") {
          const refresh=await auth.refreshAccount();
          text += refresh.ok ? " اطلاعات تازه دریافت شد؛ پنجره را ببندید و پیش از اقدام دوباره آن را بررسی کنید." : " دریافت اطلاعات تازه ناموفق بود؛ قبل از تلاش دوباره اتصال را بررسی کنید.";
        }
        setMessage({ok:false,text});
      }
    } finally { lock.current=false;setBusy(false); }
  }
  async function refresh() {
    if (lock.current) return;
    lock.current=true;setBusy(true);setMessage(null);
    try {const result=await auth.refreshAccount();setMessage({ok:result.ok,text:result.message});} finally {lock.current=false;setBusy(false);}
  }
  function saveDraft(e:React.FormEvent) {
    e.preventDefault();
    if(!draft || !draft.address.street.trim()) return;
    const a={...draft.address,street:draft.address.street.trim()};
    const exists=draft.expected.some(x=>x.id===a.id);
    let next=exists ? draft.expected.map(x=>x.id===a.id ? a : x) : [...draft.expected,a];
    if(a.default) next=next.map(x=>({...x,default:x.id===a.id}));
    void write(next,draft.expected);
  }
  return <section className="acc-card">
    <header><h3><MapPin width={15} height={15}/> آدرس‌های من</h3><div className="acc-address-actions">
      <button type="button" className="acc-link" disabled={busy} onClick={()=>void refresh()}>تازه‌سازی</button>
      <button type="button" className={buttonStyles("outline","sm")} disabled={busy} onClick={()=>{setMessage(null);setDraft({address:blank(),expected:acc.addresses});}}><Plus width={13} height={13}/> آدرس جدید</button>
    </div></header>
    {!open && message && <p role={message.ok ? "status" : "alert"} className="acc-muted">{message.text}</p>}
    {acc.addresses.length===0 ? <p className="acc-muted">آدرسی ذخیره نشده است.</p> : <ul className="acc-addresses">{acc.addresses.map(a=><li key={a.id} className={cn("acc-address",a.default && "is-default")}>
      <div><p className="acc-address-label">{a.label} {a.default && <span className="acc-default">پیش‌فرض</span>}</p><p className="acc-address-text">{a.receiver} · {a.province}، {a.city}، {a.street} {a.postal && `· ${a.postal}`}</p><p className="acc-muted" dir="ltr">{a.phone}</p></div>
      <div className="acc-address-actions">
        {!a.default && <button type="button" disabled={busy} className="acc-link" onClick={()=>void write(acc.addresses.map(x=>({...x,default:x.id===a.id})),acc.addresses)}>پیش‌فرض</button>}
        <button type="button" disabled={busy} className="acc-icon-btn" aria-label={`ویرایش آدرس ${a.label}`} onClick={()=>{setMessage(null);setDraft({address:{...a},expected:acc.addresses});}}><Pencil width={13} height={13}/></button>
        <button type="button" disabled={busy} className="acc-icon-btn is-danger" aria-label={`حذف آدرس ${a.label}`} onClick={()=>{setMessage(null);setConfirm({address:a,expected:acc.addresses});}}><Trash2 width={13} height={13}/></button>
      </div>
    </li>)}</ul>}
    {draft && <div className="acc-modal" onMouseDown={e=>{if(e.target===e.currentTarget) close();}}>
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={draft.expected.some(x=>x.id===draft.address.id) ? "ویرایش آدرس" : "آدرس جدید"}>
        <header><h3>{draft.expected.some(x=>x.id===draft.address.id) ? "ویرایش آدرس" : "آدرس جدید"}</h3></header>
        <form onSubmit={saveDraft}><div className="acc-form-grid">
          {([ ["label","عنوان",80], ["receiver","گیرنده",120], ["phone","موبایل",30], ["province","استان",100], ["city","شهر",100], ["postal","کد پستی",30], ["street","نشانی",500] ] as const).map(([key,label,max])=><label key={key} className={key==="street" ? "is-full" : undefined}>{label}<input aria-label={label} required={key==="street"} maxLength={max} value={draft.address[key]} disabled={busy} dir={key==="phone" || key==="postal" ? "ltr" : undefined} onChange={e=>setDraft({...draft,address:{...draft.address,[key]:e.target.value}})}/></label>)}
          <label className="acc-check"><input type="checkbox" checked={draft.address.default} disabled={busy} onChange={e=>setDraft({...draft,address:{...draft.address,default:e.target.checked}})}/> آدرس پیش‌فرض</label>
        </div><p className="acc-muted">اگر پیش‌فرضی انتخاب نشود، اولین آدرس پیش‌فرض خواهد بود.</p>
        {message && <p role={message.ok ? "status" : "alert"} className="acc-muted">{message.text}</p>}
        <footer><button type="button" className="acc-btn" disabled={busy} onClick={close}>انصراف</button><button type="submit" className="acc-btn is-primary" disabled={busy || !draft.address.street.trim()}><Check width={14} height={14}/>{busy ? "در حال ذخیره…" : "ذخیره"}</button></footer></form>
      </div></div>}
    {confirm && <div className="acc-modal" onMouseDown={e=>{if(e.target===e.currentTarget) close();}}>
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label="حذف آدرس" className="is-narrow"><header><h3>حذف آدرس؟</h3></header>
        <p className="acc-muted">آدرس «{confirm.address.label}» از حساب حذف می‌شود. در صورت حذف پیش‌فرض، اولین آدرس باقی‌مانده پیش‌فرض می‌شود.</p>
        {message && <p role={message.ok ? "status" : "alert"} className="acc-muted">{message.text}</p>}
        <footer><button type="button" className="acc-btn" disabled={busy} onClick={close}>انصراف</button><button type="button" className="acc-btn is-danger" disabled={busy} onClick={()=>void write(confirm.expected.filter(a=>a.id!==confirm.address.id),confirm.expected)}>{busy ? "در حال حذف…" : "حذف"}</button></footer>
      </div></div>}
  </section>;
}

function Unavailable({title,message}:{title:string;message:string}) {
  return <section className="acc-card"><header><h3>{title}</h3></header><p className="acc-muted">{message}</p></section>;
}

/** Never replace an unavailable server wallet with unrelated local data. */
function useServerWallet(email: string) {
  const [wallet, setWallet] = useState<CashbackWallet | null>(null);
  useEffect(() => {
    let alive = true;
    commerce
      .cashback()
      .then((data) => {
        if (alive && data.email === email) setWallet(data);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [email]);
  return wallet;
}

function WalletTab({ email }: { email: string }) {
  const wallet = useServerWallet(email);
  const [cfg, setCfg] = useState<CommerceConfig | null>(null);
  useEffect(() => {
    commerce.config().then(setCfg).catch(() => undefined);
  }, []);

  const cashes = wallet?.transactions.map((t) => ({ id:t.id, kind:t.kind === "earn" || t.kind === "refund_credit" ? "earn" as const : "spend" as const, at:new Date(t.at).getTime(), amount:Math.abs(t.amount), orderId:t.orderId ?? "" })) ?? [];
  const tiers = cfg?.cashback.tiers ?? [];
  return (
    <section className="acc-card">
      <header><h3><Wallet width={15} height={15} /> کیف پول و کش‌بک</h3></header>
      <div className="acc-wallet-hero">
        <span>موجودی کش‌بک</span>
        <b>{wallet ? formatPrice(wallet.balance) : "در دسترس نیست"}</b>
        <small>
          امکان استفاده از موجودی به وضعیت و تنظیمات فروشگاه بستگی دارد.
        </small>
        <small>
          {tiers.length > 0 ? "درصد کش‌بک بر اساس تنظیمات فروشگاه:" : "جزئیات کش‌بک در زمان پرداخت بررسی می‌شود."}
        </small>
        {wallet && (
          <small className="acc-muted" style={{ display: "block", marginTop: 6 }}>
            قابل استفاده همین حالا: <b>{formatPrice(wallet.available)}</b>
            {wallet.pending > 0
              ? ` · در انتظار آزادسازی: ${formatPrice(wallet.pending)}`
              : ""}
            {wallet.nextExpiry
              ? ` · نزدیک‌ترین انقضا: ${formatJalali(wallet.nextExpiry)}`
              : ""}
          </small>
        )}
        {tiers.length > 0 && (
          <span className="acc-cashback-tiers">
            {tiers.map((tier, index) => (
              <em key={`${tier.min}-${index}`}>
                {index === 0 ? "تا " : ""}
                {(tier.max ?? 0) > 0 ? `${tier.max == null ? "" : formatPrice(tier.max)} → ` : "بیشتر از همه → "}
                {tier.percent.toLocaleString("fa-IR")}٪
              </em>
            ))}
          </span>
        )}
      </div>
      {!wallet ? <p role="status" className="acc-muted">اطلاعات کیف پول در دسترس نیست؛ اتصال را بررسی و صفحه را تازه کنید.</p> : cashes.length === 0 ? (
        <p className="acc-muted">هنوز تراکنش کش‌بکی ثبت نشده است.</p>
      ) : (
        <ul className="acc-txns">
          {cashes.map((t) => (
            <li key={t.id}>
              <span>{t.kind === "earn" ? "کش‌بک خرید" : "استفاده"}</span>
              <small>{formatJalali(t.at)} · {t.orderId}</small>
              <b className={t.kind === "earn" ? "is-ok" : ""}>{t.kind === "earn" ? "+" : "−"} {formatPrice(t.amount)}</b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Returns({email,orderState}:{email:string;orderState:Remote<CustomerOrder[]>}) {
  const history = useRemote<CustomerReturn[]>(email,commerce.returns);
  const [orderId,setOrderId] = useState("");
  const [lineId,setLineId] = useState("");
  const [quantity,setQuantity] = useState(1);
  const [reason,setReason] = useState("سایز مناسب نبود");
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState<{text:string;error:boolean}|null>(null);
  const inFlight = useRef(false);
  const eligible = (orderState.data ?? []).filter(o=>["paid","preparing","shipped","delivered"].includes(o.status) && o.lines.length);
  const selected = eligible.find(o=>o.id===orderId);
  const line = selected?.lines.find(l=>l.id===lineId);
  async function submit(e:React.FormEvent) {
    e.preventDefault();
    if(inFlight.current || !selected || !line || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > line.quantity) return;
    inFlight.current = true; setBusy(true); setMessage(null);
    try {
      await commerce.requestReturn(selected.id,line.id,quantity,reason);
      setMessage({text:"درخواست ثبت شد و در انتظار بررسی است؛ ثبت درخواست به معنی تأیید یا بازپرداخت نیست.",error:false});
      setLineId(""); setQuantity(1);
      history.reload(); orderState.reload();
    } catch(err) {
      setMessage({text:err instanceof ApiError && err.status >= 400 && err.status < 500 ? err.message : "نتیجه ثبت مشخص نیست. پیش از تلاش دوباره، تاریخچه درخواست‌ها را بررسی و تازه‌سازی کنید.",error:true});
      history.reload(); orderState.reload();
    } finally { inFlight.current=false; setBusy(false); }
  }
  return <>
    <section className="acc-card">
      <header><h3><Undo2 width={15} height={15}/> درخواست مرجوعی</h3></header>
      <p className="acc-muted">برای هر ردیف سفارش یک درخواست جدا ثبت کنید. تأیید درخواست و مبلغ احتمالی پس از بررسی مشخص می‌شود.</p>
      {orderState.status === "loading" ? <p role="status">در حال دریافت سفارش‌ها…</p> : orderState.status === "error" ? <p role="alert">دریافت سفارش‌ها ناموفق بود. <button type="button" className="acc-link" onClick={orderState.reload}>تلاش دوباره</button></p> : eligible.length === 0 ? <p className="acc-muted">سفارش قابل درخواست در ۲۰۰ سفارش اخیر یافت نشد.</p> : <form className="acc-return-form" onSubmit={submit}>
        <label className="acc-field">سفارش<select aria-label="سفارش" required value={orderId} onChange={e=>{setOrderId(e.target.value);setLineId("");setQuantity(1);}}><option value="">انتخاب سفارش</option>{eligible.map(o=><option key={o.id} value={o.id}>{o.id} — {formatJalali(o.createdAt)}</option>)}</select></label>
        <label className="acc-field">کالا<select aria-label="کالا" required value={lineId} onChange={e=>{setLineId(e.target.value);setQuantity(1);}} disabled={!selected}><option value="">انتخاب کالا</option>{selected?.lines.map(l=><option key={l.id} value={l.id}>{l.name} — {l.colorName} / {l.sizeLabel}</option>)}</select></label>
        <label className="acc-field">تعداد<input aria-label="تعداد" type="number" required min={1} max={line?.quantity ?? 1} step={1} value={quantity} onChange={e=>setQuantity(Number(e.target.value))} disabled={!line}/></label>
        <label className="acc-field">دلیل<select aria-label="دلیل" value={reason} onChange={e=>setReason(e.target.value)}>{["سایز مناسب نبود","رنگ متفاوت بود","کیفیت مطابق انتظار نبود","سفارش اشتباه","سایر"].map(r=><option key={r}>{r}</option>)}</select></label>
        <button className="acc-btn is-primary" type="submit" disabled={busy || !line}>{busy ? "در حال ثبت…" : "ثبت درخواست"}</button>
      </form>}
      {message && <p role={message.error ? "alert" : "status"} className="acc-muted">{message.text}</p>}
    </section>
    <section className="acc-card">
      <header><h3>تاریخچه درخواست‌ها</h3><button type="button" className="acc-link" onClick={history.reload} disabled={history.status === "loading"}>تازه‌سازی</button></header>
      <p className="acc-muted">حداکثر ۲۰۰ درخواست اخیر نمایش داده می‌شود. وضعیت تسویه به‌تنهایی تأیید انتقال بانکی نیست.</p>
      {history.status === "loading" ? <p role="status">در حال دریافت درخواست‌ها…</p> : history.status === "error" ? <p role="alert">دریافت درخواست‌ها ناموفق بود. <button type="button" className="acc-link" onClick={history.reload}>تلاش دوباره</button></p> : history.data?.length ? <ul className="acc-orders">{history.data.map(r=><li key={r.id}><div className="acc-order-row"><div><b>{r.name}</b><p className="acc-muted">{r.kind === "exchange" ? "تعویض" : r.kind === "refund" ? "بازپرداخت" : r.kind === "return" ? "مرجوعی" : "درخواست"}</p><p className="acc-muted">{r.color || "—"} / {r.size || "—"} · {r.quantity.toLocaleString("fa-IR")} عدد</p><p className="acc-muted">{formatJalali(r.createdAt)} · سفارش <span dir="ltr">{r.orderId}</span></p></div><span className="acc-pill is-open">{returnStatus(r.status)}</span></div></li>)}</ul> : <p className="acc-muted">درخواستی ثبت نشده است.</p>}
    </section>
  </>;
}

function SecurityTab() {
  const auth=useAuth();
  const acc=auth.account!;
  const [phone,setPhone]=useState(acc.phone);
  const [basePhone,setBasePhone]=useState(acc.phone);
  const [current,setCurrent]=useState("");
  const [pw,setPw]=useState("");
  const [pw2,setPw2]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<{ok:boolean;text:string}|null>(null);
  const lock=useRef(false);
  async function savePhone(e:React.FormEvent) {
    e.preventDefault();if(lock.current) return;
    lock.current=true;setBusy(true);setMessage(null);
    try {
      const result=await auth.savePhone(phone,basePhone);
      if(result.ok) setBasePhone(phone.trim());
      else if(result.code === "profile_conflict" || result.code === "uncertain") {
        const fresh=await auth.refreshAccount();
        result.message+=fresh.ok ? " اطلاعات تازه دریافت شد؛ برای ویرایش مجدد این بخش را باز کنید." : " دریافت اطلاعات تازه ناموفق بود.";
      }
      setMessage({ok:result.ok,text:result.message});
    } finally {lock.current=false;setBusy(false);}
  }
  async function savePassword(e:React.FormEvent) {
    e.preventDefault();if(lock.current) return;
    if (pw.length < 8 || pw.length > 256) {setMessage({ok:false,text:"رمز جدید باید بین ۸ تا ۲۵۶ نویسه باشد."});return;}
    if (pw !== pw2) {setMessage({ok:false,text:"رمزهای جدید یکسان نیستند."});return;}
    lock.current=true;setBusy(true);setMessage(null);
    try { const result=await auth.changePassword(current,pw);if(result.ok){setCurrent("");setPw("");setPw2("");}setMessage({ok:result.ok,text:result.message}); }
    finally {lock.current=false;setBusy(false);}
  }
  return <section className="acc-card">
    <header><h3><ShieldCheck width={15} height={15}/> امنیت حساب</h3></header>
    <p className="acc-muted">ورود با کد یک‌بارمصرف و احراز هویت دومرحله‌ای هنوز فعال نیستند.</p>
    <form onSubmit={savePhone} className="acc-security-form"><label className="acc-field">ایمیل<input aria-label="ایمیل" value={acc.email} readOnly dir="ltr"/></label><label className="acc-field">شمارهٔ تماس<input aria-label="شمارهٔ تماس" value={phone} maxLength={30} disabled={busy} onChange={e=>setPhone(e.target.value)} dir="ltr"/></label><button type="submit" className="acc-btn" disabled={busy || phone === basePhone}>{busy ? "در حال ذخیره…" : "ذخیرهٔ شماره"}</button></form>
    <form onSubmit={savePassword} className="acc-security-form"><label className="acc-field">رمز فعلی<input aria-label="رمز فعلی" autoComplete="current-password" type="password" value={current} maxLength={256} required disabled={busy} onChange={e=>setCurrent(e.target.value)} dir="ltr"/></label><label className="acc-field">رمز جدید<input aria-label="رمز جدید" autoComplete="new-password" type="password" value={pw} minLength={8} maxLength={256} required disabled={busy} onChange={e=>setPw(e.target.value)} dir="ltr"/></label><label className="acc-field">تکرار رمز جدید<input aria-label="تکرار رمز جدید" autoComplete="new-password" type="password" value={pw2} minLength={8} maxLength={256} required disabled={busy} onChange={e=>setPw2(e.target.value)} dir="ltr"/></label><button type="submit" className="acc-btn is-primary" disabled={busy}>{busy ? "در حال ذخیره…" : "تغییر رمز"}</button></form>
    {message && <p role={message.ok ? "status" : "alert"} className="acc-muted">{message.text}</p>}
  </section>;
}
