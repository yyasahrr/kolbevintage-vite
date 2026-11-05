import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatJalaliDateTime } from "@/utils/date";
import { useDialogFocus, useEscape, useScrollLock } from "@/hooks/useOverlay";
import "./orders-list.css";

type Order = { id: string; customer: string | null; created_at: string; status: string | null; payment_status: string | null; fulfillment_status: string | null; total: string | null; currency: string | null; item_count: number | null };
type Detail = { order: Order & { subtotal: string | null; discount_total: string | null; shipping_total: string | null }; lines: { name_snapshot: string; sku: string | null; color_name: string | null; size_label: string | null; quantity: number; unit_price: string; line_total: string }[] };
type Result = { total: number; page: number; pageSize: number; orders: Order[] };
const fa = (n: number) => n.toLocaleString("fa-IR");
const status: Record<string, string> = { pending_payment: "در انتظار پرداخت", paid: "پرداخت‌شده", preparing: "آماده‌سازی", shipped: "ارسال‌شده", delivered: "تحویل‌شده", cancelled: "لغوشده", exception: "نیازمند بررسی", pending: "در انتظار", processing: "در حال پردازش", done: "تکمیل‌شده", settled: "تسویه‌شده", unpaid: "پرداخت‌نشده", unfulfilled: "انجام‌نشده", picking: "برداشت", packed: "بسته‌بندی‌شده" };
const label = (s: string | null) => s ? status[s] ?? `نامشخص (${s})` : "نامشخص";
// Display recorded currency without inventing an exchange rate or changing precision.
const money = (value: string | null, currency: string | null) => {
  if (value == null) return "نامشخص";
  const code = currency === "IRT" ? "تومان" : currency === "IRR" ? "ریال" : currency || "ارز نامشخص";
  return `${value.replace(/\B(?=(\d{3})+(?!\d))/g, "٬").replace(/[0-9]/g, d => "۰۱۲۳۴۵۶۷۸۹"[Number(d)])} ${code}`;
};
const tabs = [["", "همه"], ["pending_payment", "در انتظار پرداخت"], ["paid", "پرداخت‌شده"], ["preparing", "آماده‌سازی"], ["shipped", "ارسال‌شده"], ["delivered", "تحویل‌شده"], ["cancelled", "لغوشده"]];

function Preview({ id, close }: { id: string; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  useDialogFocus(true, ref); useEscape(true, close); useScrollLock(true);
  useEffect(() => { let alive = true; setDetail(null); setError(""); api.get<Detail>(`/api/admin/orders-list/${encodeURIComponent(id)}`).then(d => { if (alive) setDetail(d); }).catch((e: unknown) => { if (alive) setError(e instanceof ApiError && e.status === 403 ? "مجوز مشاهده سفارش را ندارید." : "جزئیات سفارش دریافت نشد."); }); return () => { alive = false; }; }, [id]);
  return <div className="ord-overlay" onClick={close}><div className="ord-drawer" role="dialog" aria-modal="true" aria-label={`پیش‌نمایش سفارش ${id}`} ref={ref} tabIndex={-1} onClick={e => e.stopPropagation()}><header className="ord-drawer-head"><div><small>پیش‌نمایش سفارش</small><h2><bdi dir="ltr">{id}</bdi></h2></div><button className="ord-icon" onClick={close} aria-label="بستن پیش‌نمایش"><X size={18}/></button></header>
    {!detail && !error && <p role="status" className="ord-message">در حال دریافت جزئیات…</p>}{error && <p role="alert" className="ord-message">{error}</p>}
    {detail && <div className="ord-drawer-body"><section><h3>اطلاعات سفارش</h3><p>مشتری: {detail.order.customer || "نامشخص"}</p><p>پرداخت: {label(detail.order.payment_status)}</p><p>آماده‌سازی: {label(detail.order.fulfillment_status)}</p><p>منبع سفارش و نشانی: در این نما در دسترس نیست.</p></section><section><h3>اقلام سفارش</h3>{detail.lines.length === 0 ? <p>جزئیات اقلام در دسترس نیست.</p> : detail.lines.map((l,i) => <div className="ord-line" key={i}><b>{l.name_snapshot}</b><small>{l.color_name || "رنگ نامشخص"} · {l.size_label || "سایز نامشخص"} · {fa(l.quantity)} عدد</small><small><bdi dir="ltr">{l.sku || "SKU نامشخص"}</bdi></small><span>{money(l.line_total, detail.order.currency)}</span></div>)}</section><section><h3>خلاصه مالی ثبت‌شده</h3><p>جمع اقلام: {money(detail.order.subtotal,detail.order.currency)}</p><p>تخفیف: {money(detail.order.discount_total,detail.order.currency)}</p><p>ارسال: {money(detail.order.shipping_total,detail.order.currency)}</p><strong>مبلغ کل: {money(detail.order.total,detail.order.currency)}</strong></section><p className="ord-muted">رویدادهای زمانی و اطلاعات ارسال در این نما ارائه نشده‌اند.</p></div>}
  </div></div>;
}

export function OrdersList() {
  const [q, setQ] = useState(""); const [term, setTerm] = useState("");
  const [orderStatus, setStatus] = useState(""); const [payment, setPayment] = useState(""); const [fulfillment, setFulfillment] = useState("");
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [sort, setSort] = useState("date"); const [dir, setDir] = useState("desc"); const [page, setPage] = useState(1);
  const [dense, setDense] = useState(false); const [picked, setPicked] = useState<Set<string>>(new Set()); const [preview, setPreview] = useState<string | null>(null);
  const [data, setData] = useState<Result | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [retry, setRetry] = useState(0);
  useEffect(() => { const t = window.setTimeout(() => { setTerm(q); setPage(1); }, 350); return () => window.clearTimeout(t); }, [q]);
  useEffect(() => { let alive = true; setLoading(true); setError(""); setPicked(new Set()); const params = new URLSearchParams({ q: term, status: orderStatus, payment, fulfillment, from, to, sort, dir, page: String(page) });
    api.get<Result>(`/api/admin/orders-list?${params}`).then(d => { if (alive) setData(d); }).catch((e: unknown) => { if (alive) { setData(null); setError(e instanceof ApiError && (e.status === 403 || e.status === 401) ? "مجوز مشاهده سفارش‌ها در دسترس نیست." : "خواندن سفارش‌ها ناموفق بود؛ فیلترها یا اتصال را بررسی کنید."); } }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [term, orderStatus, payment, fulfillment, from, to, sort, dir, page, retry]);
  const clear = () => { setQ(""); setTerm(""); setStatus(""); setPayment(""); setFulfillment(""); setFrom(""); setTo(""); setSort("date"); setDir("desc"); setPage(1); };
  const toggle = (id: string) => setPicked(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = !!data?.orders.length && data.orders.every(o => picked.has(o.id));
  const toggleAll = () => setPicked(all ? new Set() : new Set(data?.orders.map(o => o.id) ?? []));
  const change = (fn: (v: string) => void, v: string) => { fn(v); setPage(1); };
  return <div className={`ord ${dense ? "is-dense" : ""}`} dir="rtl">
    <header className="ord-heading"><div><span className="ord-kicker">فروش / سفارش‌ها</span><h1>مدیریت سفارش‌ها</h1><p>{data ? `${fa(data.total)} سفارش مطابق فیلترها` : "فهرست سفارش‌های فروشگاه"}</p></div></header>
    <div className="ord-tabs" aria-label="فیلتر وضعیت سفارش">{tabs.map(([v,t]) => <button key={v} type="button" aria-pressed={orderStatus === v} className={orderStatus === v ? "is-active" : ""} onClick={() => change(setStatus,v)}>{t}</button>)}</div>
    <section className="ord-surface"><div className="ord-toolbar"><label className="ord-search"><Search size={16}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="شناسه یا نام مشتری" aria-label="جست‌وجوی شناسه یا نام مشتری" /></label><label>پرداخت<select value={payment} onChange={e => change(setPayment,e.target.value)}><option value="">همه</option><option value="settled">تسویه‌شده</option><option value="unpaid">پرداخت‌نشده</option></select></label><label>آماده‌سازی<select value={fulfillment} onChange={e => change(setFulfillment,e.target.value)}><option value="">همه</option><option value="unfulfilled">انجام‌نشده</option><option value="picking">برداشت</option><option value="packed">بسته‌بندی‌شده</option><option value="shipped">ارسال‌شده</option><option value="delivered">تحویل‌شده</option></select></label><label>از تاریخ <input type="date" dir="ltr" value={from} onChange={e => change(setFrom,e.target.value)} /></label><label>تا تاریخ <input type="date" dir="ltr" value={to} onChange={e => change(setTo,e.target.value)} /></label><label>مرتب‌سازی<select value={`${sort}-${dir}`} onChange={e => { const [s,d] = e.target.value.split("-"); setSort(s); setDir(d); setPage(1); }}><option value="date-desc">جدیدترین</option><option value="date-asc">قدیمی‌ترین</option><option value="amount-desc">مبلغ بیشتر</option><option value="amount-asc">مبلغ کمتر</option></select></label><button className="ord-control" onClick={clear}>پاک کردن فیلترها</button><button className="ord-control" aria-pressed={dense} onClick={() => setDense(v => !v)}>{dense ? "نمای استاندارد" : "نمای فشرده"}</button></div>
      <p className="ord-filter-note">تاریخ‌ها بر اساس زمان پایگاه داده‌اند؛ مرتب‌سازی مبلغ بدون تبدیل ارز انجام می‌شود.</p>
      {picked.size > 0 && <div className="ord-selection">{fa(picked.size)} سفارش انتخاب شده <button className="ord-control" onClick={() => setPicked(new Set())}>لغو انتخاب</button><span>عملیات گروهی در این نما فعال نیست.</span></div>}
      {loading ? <p role="status" className="ord-message">در حال دریافت سفارش‌ها…</p> : error ? <div role="alert" className="ord-message">{error} <button className="ord-control" onClick={() => setRetry(n => n+1)}>تلاش دوباره</button></div> : data?.orders.length === 0 ? <p className="ord-message">سفارشی با این فیلترها پیدا نشد.</p> : <>
      <div className="ord-table-wrap"><table className="ord-table"><thead><tr><th><input type="checkbox" checked={all} onChange={toggleAll} aria-label="انتخاب سفارش‌های این صفحه" /></th><th>شماره سفارش</th><th>مشتری</th><th>تاریخ</th><th>اقلام</th><th>مبلغ ثبت‌شده</th><th>پرداخت</th><th>آماده‌سازی</th><th>منبع</th><th>عملیات</th></tr></thead><tbody>{data?.orders.map(o => <tr key={o.id} onClick={() => setPreview(o.id)}><td onClick={e => e.stopPropagation()}><input type="checkbox" checked={picked.has(o.id)} onChange={() => toggle(o.id)} aria-label={`انتخاب ${o.id}`} /></td><td><button className="ord-id" onClick={e => { e.stopPropagation(); setPreview(o.id); }}><bdi dir="ltr">{o.id}</bdi></button></td><td>{o.customer || "نامشخص"}</td><td>{formatJalaliDateTime(o.created_at)}</td><td>{o.item_count == null ? "نامشخص" : fa(o.item_count)}</td><td className="ord-money">{money(o.total,o.currency)}</td><td><span className="ord-badge">{label(o.payment_status)}</span></td><td><span className="ord-badge">{label(o.fulfillment_status)}</span></td><td>نامشخص</td><td><button className="ord-control" onClick={e => { e.stopPropagation(); setPreview(o.id); }}>مشاهده</button></td></tr>)}</tbody></table></div>
      <div className="ord-mobile-list"><label className="ord-select-all"><input type="checkbox" checked={all} onChange={toggleAll} /> انتخاب سفارش‌های این صفحه</label>{data?.orders.map(o => <article className="ord-mobile-card" key={o.id}><div className="ord-mobile-head"><label><input type="checkbox" checked={picked.has(o.id)} onChange={() => toggle(o.id)} aria-label={`انتخاب ${o.id}`} /> <bdi dir="ltr">{o.id}</bdi></label><button className="ord-control" onClick={() => setPreview(o.id)}>مشاهده</button></div><strong>{o.customer || "مشتری نامشخص"}</strong><p>{formatJalaliDateTime(o.created_at)} · {o.item_count == null ? "تعداد نامشخص" : `${fa(o.item_count)} قلم`}</p><div className="ord-mobile-foot"><span className="ord-badge">پرداخت: {label(o.payment_status)}</span><span className="ord-badge">آماده‌سازی: {label(o.fulfillment_status)}</span></div><b>{money(o.total,o.currency)}</b></article>)}</div>
      </>}
      {data && <footer className="ord-pagination"><span>صفحه {fa(page)} از {fa(Math.max(1,Math.ceil(data.total / data.pageSize)))}</span><div><button className="ord-control" disabled={page <= 1 || loading} onClick={() => setPage(p => p-1)}>قبلی</button><button className="ord-control" disabled={page * data.pageSize >= data.total || loading} onClick={() => setPage(p => p+1)}>بعدی</button></div></footer>}
    </section>{preview && <Preview id={preview} close={() => setPreview(null)} />}
  </div>;
}
