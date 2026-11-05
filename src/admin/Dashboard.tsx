import { useEffect, useState } from "react";
import { Activity, ArrowLeft, BarChart3, Clock3, Package, WalletCards } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatJalaliShort } from "@/utils/date";
import "./dashboard.css";

type Overview = {
  counts: { total: number; settled: number; attention: number };
  statuses: { status: string | null; count: number }[];
  recent: { id: string; created_at: string; status: string | null; payment_status: string | null }[];
  products: { product_id: string; name: string; quantity: number }[];
};
type Load = { kind: "loading" } | { kind: "error"; denied: boolean } | { kind: "ready"; data: Overview };
const fa = (n: number) => n.toLocaleString("fa-IR");
const labels: Record<string, string> = { paid: "پرداخت‌شده", preparing: "در حال آماده‌سازی", shipped: "ارسال‌شده", delivered: "تحویل‌شده", exception: "نیازمند بررسی", cancelled: "لغوشده", pending_payment: "در انتظار پرداخت", pending: "در انتظار", processing: "در حال پردازش", done: "تکمیل‌شده" };
const statusLabel = (status: string | null) => status ? labels[status] ?? "سایر وضعیت‌ها" : "نامشخص";

function Panel({ title, detail, children }: { title: string; detail?: string; children: React.ReactNode }) {
  return <section className="dash-panel"><header className="dash-panel-head"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div></header>{children}</section>;
}
function Metric({ icon: Icon, label, value, detail }: { icon: typeof Activity; label: string; value: string; detail: string }) {
  return <div className="dash-metric" title={detail}><span className="dash-metric-icon"><Icon size={19} aria-hidden="true" /></span><span className="dash-metric-label">{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}

export function Dashboard({ onOrders }: { onOrders: () => void }) {
  const [days, setDays] = useState(30);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<Load>({ kind: "loading" });
  const [ascending, setAscending] = useState(false);
  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    api.get<Overview>(`/api/admin/dashboard?days=${days}`).then(data => { if (active) setState({ kind: "ready", data }); }).catch((error: unknown) => {
      if (active) setState({ kind: "error", denied: error instanceof ApiError && (error.status === 401 || error.status === 403) });
    });
    return () => { active = false; };
  }, [days, attempt]);
  return <div className="dash" dir="rtl">
    <header className="dash-heading"><div><span className="dash-eyebrow">نمای کلی فروشگاه</span><h1>داشبورد مدیریت</h1><p>نگاهی به وضعیت سفارش‌ها و کارهای نیازمند پیگیری</p></div>
      <label className="dash-range"><span>بازه گزارش</span><select value={days} onChange={e => setDays(Number(e.target.value))} aria-label="بازه گزارش"><option value={7}>۷ روز گذشته</option><option value={30}>۳۰ روز گذشته</option><option value={90}>۹۰ روز گذشته</option></select></label>
    </header>
    <p className="dash-note">بازه‌ها شامل ۲۴ ساعت‌های گذشته‌اند. صف عملیات خارج از این گزارش ممکن است موارد دیگری داشته باشد.</p>
    {state.kind === "loading" && <div className="dash-state" role="status">در حال دریافت اطلاعات داشبورد…</div>}
    {state.kind === "error" && <div className="dash-state" role="alert"><strong>{state.denied ? "دسترسی به اطلاعات سفارش ندارید" : "دریافت اطلاعات ناموفق بود"}</strong><p>{state.denied ? "برای مشاهده این گزارش، مجوز مشاهده داشبورد و سفارش‌ها لازم است." : "اتصال به سرور را بررسی و دوباره تلاش کنید."}</p>{!state.denied && <button className="ad-btn is-primary" onClick={() => setAttempt(n => n + 1)}>تلاش دوباره</button>}</div>}
    {state.kind === "ready" && <>
      <div className="dash-metrics">
        <Metric icon={BarChart3} label="فروش خالص" value="در دسترس نیست" detail="در انتظار تعریف و تطبیق مالی" />
        <Metric icon={WalletCards} label="سفارش‌های پرداخت‌شده" value={fa(state.data.counts.settled)} detail="پرداخت تسویه‌شده در بازه انتخابی" />
        <Metric icon={Clock3} label="در انتظار آماده‌سازی" value="در دسترس نیست" detail="تفکیک دقیق آماده‌سازی در این گزارش فراهم نیست" />
        <Metric icon={Package} label="هشدار کم‌موجودی" value="در دسترس نیست" detail="منبع قابل اتکای هشدار در این گزارش فراهم نیست" />
      </div>
      <div className="dash-grid dash-primary-grid">
        <Panel title="روند فروش" detail="گزارش مالی در بازه انتخابی"><div className="dash-placeholder"><span className="dash-placeholder-icon"><BarChart3 size={20} /></span><div><strong>نمودار فروش هنوز در دسترس نیست</strong><p>پس از تأیید تعریف فروش خالص و تطبیق پرداخت‌ها و بازپرداخت‌ها نمایش داده می‌شود.</p></div></div></Panel>
        <Panel title="صف پیگیری" detail="فقط سفارش‌های ثبت‌شده در بازه انتخابی"><div className="dash-queue"><span className="dash-queue-icon"><Activity size={18} /></span><div><strong>{fa(state.data.counts.attention)} سفارش نیازمند پیگیری</strong><p>سفارش‌های باز یا استثنایی، نه کل صف عملیات</p></div><button className="dash-link" onClick={onOrders}>مشاهده سفارش‌ها <ArrowLeft size={15} /></button></div></Panel>
      </div>
      <Panel title="سفارش‌های اخیر" detail="۱۰ سفارش آخر در بازه انتخابی"><div className="dash-table-wrap"><table className="dash-table"><thead><tr><th>شماره سفارش</th><th><button className="dash-sort" onClick={() => setAscending(v => !v)} aria-label={`مرتب‌سازی تاریخ؛ ترتیب فعلی ${ascending ? "صعودی" : "نزولی"}`}>تاریخ {ascending ? "↑" : "↓"}</button></th><th>وضعیت سفارش</th><th>پرداخت</th></tr></thead><tbody>{state.data.recent.length === 0 ? <tr><td colSpan={4}>سفارشی در این بازه وجود ندارد.</td></tr> : [...state.data.recent].sort((a,b) => (Date.parse(a.created_at) - Date.parse(b.created_at)) * (ascending ? 1 : -1)).map(o => <tr key={o.id}><td><bdi dir="ltr">{o.id}</bdi></td><td>{formatJalaliShort(o.created_at)}</td><td><span className="dash-badge">{statusLabel(o.status)}</span></td><td>{o.payment_status === "settled" ? "تسویه‌شده" : o.payment_status === "unpaid" ? "پرداخت‌نشده" : "نامشخص"}</td></tr>)}</tbody></table></div><div className="dash-table-foot"><button className="dash-link" onClick={onOrders}>همه سفارش‌ها <ArrowLeft size={15} /></button></div></Panel>
      <div className="dash-grid dash-summary-grid">
        <Panel title="محصولات پرفروش" detail="تعداد اقلام تسویه‌شده؛ پیش از کسر مرجوعی">{state.data.products.length === 0 ? <div className="dash-empty">قلم واجد شرایطی در داده‌های این بازه یافت نشد.</div> : <ol className="dash-products">{state.data.products.map((p, i) => <li key={p.product_id}><span className="dash-rank">{fa(i + 1)}</span><span className="dash-product-name" title={p.name}>{p.name}</span><strong>{fa(p.quantity)} عدد</strong></li>)}</ol>}</Panel>
        <Panel title="خلاصه سفارش‌ها" detail="همه سفارش‌های ثبت‌شده در بازه انتخابی"><div className="dash-summary-total"><span>کل سفارش‌ها</span><strong>{fa(state.data.counts.total)}</strong></div>{state.data.statuses.length === 0 ? <div className="dash-empty">در این بازه سفارشی ثبت نشده است.</div> : <div className="dash-status-list">{state.data.statuses.map((row, i) => <div key={`${row.status}-${i}`} className="dash-status"><div><span>{statusLabel(row.status)}</span><b>{fa(row.count)}</b></div><span className="dash-track"><span style={{ width: `${state.data.counts.total ? row.count / state.data.counts.total * 100 : 0}%` }} /></span></div>)}</div>}</Panel>
      </div>
    </>}
  </div>;
}
