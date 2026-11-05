import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CalendarDays, PackageOpen, Search, SlidersHorizontal, X } from "lucide-react";
import { ApiError, isRequestCancellation } from "@/lib/api";
import { formatJalaliDateTime } from "@/utils/date";
import { persianDate } from "@/utils/persian-calendar";
import { useDialogFocus, useEscape, useScrollLock } from "@/hooks/useOverlay";
import {
  fetchOrderDetail,
  fetchOrders,
  ORDER_STATUS_TABS,
  type OrderDetail,
  type OrderFilters,
  type OrdersResult,
} from "@/admin/orders-api";
import { PersianDateRange } from "@/admin/PersianDateRange";
import "./orders-list.css";

const fa = (n: number) => n.toLocaleString("fa-IR");
const IS_DEMO = import.meta.env?.VITE_DEMO_MODE === "1";
const labels: Record<string, string> = {
  pending_payment: "در انتظار پرداخت",
  paid: "پرداخت‌شده",
  preparing: "در حال آماده‌سازی",
  shipped: "ارسال‌شده",
  delivered: "تحویل‌شده",
  cancelled: "لغوشده",
  exception: "نیازمند بررسی",
  pending: "در انتظار",
  processing: "در حال پردازش",
  done: "تکمیل‌شده",
  settled: "تسویه‌شده",
  unpaid: "پرداخت‌نشده",
  unfulfilled: "انجام‌نشده",
  picking: "برداشت",
  packed: "بسته‌بندی‌شده",
};
const label = (value: string | null) => value ? labels[value] ?? `نامشخص (${value})` : "نامشخص";

// Display recorded currency without inventing an exchange rate or changing precision.
const money = (value: string | null, currency: string | null) => {
  if (value == null) return "نامشخص";
  const code = currency === "IRT" ? "تومان" : currency === "IRR" ? "ریال" : currency || "ارز نامشخص";
  const localized = value.replace(/\B(?=(\d{3})+(?!\d))/g, "٬").replace(/[0-9]/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
  return `${localized} ${code}`;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "success"; data: OrdersResult }
  | { kind: "error"; title: string; message: string; denied: boolean };

function errorState(error: unknown): LoadState {
  const denied = error instanceof ApiError && (error.status === 401 || error.status === 403);
  if (denied) {
    return { kind: "error", denied: true, title: "دسترسی به سفارش‌ها ندارید", message: "برای مشاهده این فهرست، ورود معتبر و مجوز مشاهده سفارش‌ها لازم است." };
  }
  if (error instanceof ApiError && error.code === "malformed_response") {
    return { kind: "error", denied: false, title: "پاسخ سرور قابل استفاده نیست", message: "ساختار داده‌های دریافتی معتبر نیست. هیچ فهرست جایگزینی نمایش داده نشد." };
  }
  if (error instanceof ApiError && error.status >= 500) {
    return { kind: "error", denied: false, title: "سرور سفارش‌ها پاسخ نداد", message: `خطای ${fa(error.status)} ثبت شد. بعداً دوباره تلاش کنید.` };
  }
  return { kind: "error", denied: false, title: "خواندن سفارش‌ها ناموفق بود", message: "اتصال به سرور را بررسی کنید و دوباره تلاش کنید." };
}

function Preview({ id, close }: { id: string; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useDialogFocus(true, ref);
  useEscape(true, close);
  useScrollLock(true);

  useEffect(() => {
    const controller = new AbortController();
    setDetail(null);
    setError("");
    fetchOrderDetail(id, { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setDetail(result); })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || isRequestCancellation(reason)) return;
        setError(reason instanceof ApiError && (reason.status === 401 || reason.status === 403)
          ? "مجوز مشاهده سفارش را ندارید."
          : "جزئیات سفارش دریافت نشد.");
      });
    return () => controller.abort();
  }, [id, attempt]);

  return (
    <div className="ord-overlay" onClick={close}>
      <div className="ord-drawer" role="dialog" aria-modal="true" aria-label={`پیش‌نمایش سفارش ${id}`} ref={ref} tabIndex={-1} onClick={(event) => event.stopPropagation()}>
        <header className="ord-drawer-head">
          <div><small>پیش‌نمایش سفارش</small><h2><bdi dir="ltr">{id}</bdi></h2></div>
          <button type="button" className="ord-icon" onClick={close} aria-label="بستن پیش‌نمایش"><X size={18} /></button>
        </header>
        {!detail && !error && <p role="status" className="ord-message">در حال دریافت جزئیات…</p>}
        {error && <div role="alert" className="ord-message ord-inline-error"><p>{error}</p><button type="button" className="ord-control" onClick={() => setAttempt((value) => value + 1)}>تلاش دوباره</button></div>}
        {detail && (
          <div className="ord-drawer-body">
            <section><h3>اطلاعات سفارش</h3><p>مشتری: {detail.order.customer || "نامشخص"}</p><p>پرداخت: {label(detail.order.payment_status)}</p><p>آماده‌سازی: {label(detail.order.fulfillment_status)}</p><p>منبع سفارش و نشانی: در این نما در دسترس نیست.</p></section>
            <section>
              <h3>اقلام سفارش</h3>
              {detail.lines.length === 0 ? <p>جزئیات اقلام در دسترس نیست.</p> : detail.lines.map((line, index) => (
                <div className="ord-line" key={`${line.sku ?? "line"}-${index}`}>
                  <b>{line.name_snapshot}</b>
                  <small>{line.color_name || "رنگ نامشخص"} · {line.size_label || "سایز نامشخص"} · {fa(line.quantity)} عدد</small>
                  <small><bdi dir="ltr">{line.sku || "SKU نامشخص"}</bdi></small>
                  <span>{money(line.line_total, detail.order.currency)}</span>
                </div>
              ))}
            </section>
            <section><h3>خلاصه مالی ثبت‌شده</h3><p>جمع اقلام: {money(detail.order.subtotal, detail.order.currency)}</p><p>تخفیف: {money(detail.order.discount_total, detail.order.currency)}</p><p>ارسال: {money(detail.order.shipping_total, detail.order.currency)}</p><strong>مبلغ کل: {money(detail.order.total, detail.order.currency)}</strong></section>
            <p className="ord-muted">رویدادهای زمانی و اطلاعات ارسال در این نما ارائه نشده‌اند.</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface AdvancedFiltersProps {
  payment: string;
  fulfillment: string;
  sort: string;
  dense: boolean;
  onPayment: (value: string) => void;
  onFulfillment: (value: string) => void;
  onSort: (value: string) => void;
  onDense: (value: boolean) => void;
  onClear: () => void;
  close: () => void;
}

function AdvancedFiltersSheet(props: AdvancedFiltersProps) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(true, ref);
  useEscape(true, props.close);
  useScrollLock(true);
  return (
    <div className="ord-overlay ord-sheet-overlay" onClick={props.close}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ord-advanced-title" className="ord-sheet" onClick={(event) => event.stopPropagation()}>
        <header className="ord-sheet-head"><div><small>فیلتر و نمایش</small><h2 id="ord-advanced-title">فیلترهای پیشرفته</h2></div><button type="button" className="ord-icon" onClick={props.close} aria-label="بستن فیلترها"><X size={18} /></button></header>
        <div className="ord-sheet-body">
          <label className="ord-field">وضعیت پرداخت<select value={props.payment} onChange={(event) => props.onPayment(event.target.value)}><option value="">همه پرداخت‌ها</option><option value="settled">تسویه‌شده</option><option value="unpaid">پرداخت‌نشده</option></select></label>
          <label className="ord-field">وضعیت آماده‌سازی<select value={props.fulfillment} onChange={(event) => props.onFulfillment(event.target.value)}><option value="">همه وضعیت‌ها</option><option value="unfulfilled">انجام‌نشده</option><option value="picking">برداشت</option><option value="packed">بسته‌بندی‌شده</option><option value="shipped">ارسال‌شده</option><option value="delivered">تحویل‌شده</option></select></label>
          <label className="ord-field">مرتب‌سازی<select value={props.sort} onChange={(event) => props.onSort(event.target.value)}><option value="date-desc">جدیدترین</option><option value="date-asc">قدیمی‌ترین</option><option value="amount-desc">مبلغ بیشتر</option><option value="amount-asc">مبلغ کمتر</option></select></label>
          <label className="ord-check"><input type="checkbox" checked={props.dense} onChange={(event) => props.onDense(event.target.checked)} /><span>نمای فشرده جدول</span></label>
        </div>
        <footer className="ord-sheet-foot"><button type="button" className="ord-control" onClick={props.onClear}>پاک کردن فیلترها</button><button type="button" className="ord-control ord-primary" onClick={props.close}>نمایش نتایج</button></footer>
      </div>
    </div>
  );
}

export function OrdersList() {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [payment, setPayment] = useState("");
  const [fulfillment, setFulfillment] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("date");
  const [dir, setDir] = useState("desc");
  const [page, setPage] = useState(1);
  const [dense, setDense] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const tabListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => { setTerm(q); setPage(1); }, 350);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const controller = new AbortController();
    const filters: OrderFilters = { q: term, status: orderStatus, payment, fulfillment, from, to, sort, dir, page };
    setState({ kind: "loading" });
    setPicked(new Set());
    fetchOrders(filters, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setState({ kind: "success", data }); })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isRequestCancellation(error)) return;
        setState(errorState(error));
      });
    return () => controller.abort();
  }, [term, orderStatus, payment, fulfillment, from, to, sort, dir, page, retry]);

  useEffect(() => {
    const selected = tabListRef.current?.querySelector<HTMLElement>("[aria-pressed='true']");
    if (!selected || typeof selected.scrollIntoView !== "function") return;
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    selected.scrollIntoView({ block: "nearest", inline: "center", behavior: reduced ? "auto" : "smooth" });
  }, [orderStatus]);

  const change = (update: (value: string) => void, value: string) => { update(value); setPage(1); };
  const changeSort = (value: string) => {
    const [nextSort, nextDir] = value.split("-");
    setSort(nextSort);
    setDir(nextDir);
    setPage(1);
  };
  const clear = () => {
    setQ(""); setTerm(""); setOrderStatus(""); setPayment(""); setFulfillment("");
    setFrom(""); setTo(""); setSort("date"); setDir("desc"); setPage(1);
  };

  const data = state.kind === "success" ? state.data : null;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const all = Boolean(data?.orders.length) && Boolean(data?.orders.every((order) => picked.has(order.id)));
  const toggleAll = () => setPicked(all ? new Set() : new Set(data?.orders.map((order) => order.id) ?? []));
  const toggle = (id: string) => setPicked((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const activeCount = [term, orderStatus, payment, fulfillment, from, to].filter(Boolean).length;
  const statusText = ORDER_STATUS_TABS.find((tab) => tab.value === orderStatus)?.label;
  const activeFilters = [
    term ? { key: "q", text: `جست‌وجو: ${term}`, clear: () => { setQ(""); setTerm(""); setPage(1); } } : null,
    orderStatus ? { key: "status", text: statusText ?? label(orderStatus), clear: () => change(setOrderStatus, "") } : null,
    payment ? { key: "payment", text: `پرداخت: ${label(payment)}`, clear: () => change(setPayment, "") } : null,
    fulfillment ? { key: "fulfillment", text: `آماده‌سازی: ${label(fulfillment)}`, clear: () => change(setFulfillment, "") } : null,
    from || to ? { key: "date", text: `${from ? `از ${persianDate(from)}` : ""}${from && to ? " " : ""}${to ? `تا ${persianDate(to)}` : ""}`, clear: () => { setFrom(""); setTo(""); setPage(1); } } : null,
  ].filter((item): item is { key: string; text: string; clear: () => void } => item !== null);

  return (
    <div className={`ord ${dense ? "is-dense" : ""}`} dir="rtl" data-source={IS_DEMO ? "demo" : "live"}>
      <nav className="ord-breadcrumb" aria-label="مسیر صفحه"><Link to="/admin">داشبورد</Link><span aria-hidden="true">/</span><span>فروش</span><span aria-hidden="true">/</span><span aria-current="page">سفارش‌ها</span></nav>
      <header className="ord-heading">
        <div><div className="ord-title-line"><h1>مدیریت سفارش‌ها</h1>{IS_DEMO && <span className="ord-demo-badge">داده آزمایشی</span>}</div><p>{data ? `${fa(data.total)} سفارش مطابق فیلترها` : state.kind === "loading" ? "در حال به‌روزرسانی فهرست سفارش‌ها" : "فهرست سفارش‌های فروشگاه"}</p></div>
      </header>

      <div className="ord-tabs-viewport">
        <div className="ord-tabs" ref={tabListRef} role="group" aria-label="فیلتر وضعیت سفارش">
          {ORDER_STATUS_TABS.map((tab) => <button key={tab.value || "all"} type="button" aria-pressed={orderStatus === tab.value} className={orderStatus === tab.value ? "is-active" : ""} onClick={() => change(setOrderStatus, tab.value)}>{tab.label}</button>)}
        </div>
      </div>

      <section className="ord-surface" aria-label="فهرست و فیلترهای سفارش">
        <div className="ord-toolbar">
          <label className="ord-search"><Search size={16} aria-hidden="true" /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="شناسه یا نام مشتری" aria-label="جست‌وجوی شناسه یا نام مشتری" inputMode="search" /></label>
          <div className="ord-date-field"><span>بازه سفارش</span><PersianDateRange value={{ from, to }} onChange={(range) => { setFrom(range.from); setTo(range.to); setPage(1); }} /></div>
          <label className="ord-field ord-desktop-filter">پرداخت<select value={payment} onChange={(event) => change(setPayment, event.target.value)}><option value="">همه</option><option value="settled">تسویه‌شده</option><option value="unpaid">پرداخت‌نشده</option></select></label>
          <label className="ord-field ord-desktop-filter">آماده‌سازی<select value={fulfillment} onChange={(event) => change(setFulfillment, event.target.value)}><option value="">همه</option><option value="unfulfilled">انجام‌نشده</option><option value="picking">برداشت</option><option value="packed">بسته‌بندی‌شده</option><option value="shipped">ارسال‌شده</option><option value="delivered">تحویل‌شده</option></select></label>
          <label className="ord-field ord-sort-field">مرتب‌سازی<select value={`${sort}-${dir}`} onChange={(event) => changeSort(event.target.value)}><option value="date-desc">جدیدترین</option><option value="date-asc">قدیمی‌ترین</option><option value="amount-desc">مبلغ بیشتر</option><option value="amount-asc">مبلغ کمتر</option></select></label>
          <button type="button" className="ord-control ord-advanced" aria-haspopup="dialog" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen(true)}><SlidersHorizontal size={16} aria-hidden="true" /><span>فیلترهای پیشرفته</span>{activeCount > 0 && <b aria-label={`${fa(activeCount)} فیلتر فعال`}>{fa(activeCount)}</b>}</button>
        </div>

        {activeFilters.length > 0 && <div className="ord-active-filters" aria-label="فیلترهای فعال"><span>فیلترهای فعال:</span>{activeFilters.map((filter) => <button type="button" key={filter.key} onClick={filter.clear} aria-label={`حذف فیلتر ${filter.text}`}>{filter.text}<X size={12} aria-hidden="true" /></button>)}<button type="button" className="ord-clear-all" onClick={clear}>پاک کردن همه</button></div>}
        <p className="ord-filter-note"><CalendarDays size={13} aria-hidden="true" /> تاریخ‌های نمایشی جلالی‌اند؛ مرز API و مرتب‌سازی مبلغ بدون تغییر ارز انجام می‌شود.</p>

        {picked.size > 0 && <div className="ord-selection">{fa(picked.size)} سفارش انتخاب شده <button type="button" className="ord-control" onClick={() => setPicked(new Set())}>لغو انتخاب</button><span>عملیات گروهی در این نما فعال نیست.</span></div>}

        {state.kind === "loading" && <div role="status" className="ord-message ord-loading"><span className="ord-spinner" aria-hidden="true" />در حال دریافت سفارش‌ها…</div>}
        {state.kind === "error" && <div role="alert" className={`ord-message ord-error ${state.denied ? "is-denied" : ""}`}><AlertCircle size={22} aria-hidden="true" /><div><strong>{state.title}</strong><p>{state.message}</p></div><button type="button" className="ord-control" onClick={() => setRetry((value) => value + 1)}>تلاش دوباره</button></div>}
        {state.kind === "success" && data?.orders.length === 0 && <div className="ord-message ord-empty"><PackageOpen size={26} aria-hidden="true" /><strong>سفارشی پیدا نشد</strong><p>{activeCount > 0 ? "هیچ سفارش معتبری با این فیلترها مطابقت ندارد." : "هنوز سفارشی ثبت نشده است."}</p>{activeCount > 0 && <button type="button" className="ord-control" onClick={clear}>پاک کردن فیلترها</button>}</div>}

        {state.kind === "success" && data && data.orders.length > 0 && <>
          <div className="ord-table-wrap">
            <table className="ord-table">
              <thead><tr><th><input type="checkbox" checked={all} onChange={toggleAll} aria-label="انتخاب سفارش‌های این صفحه" /></th><th>شماره سفارش</th><th>مشتری</th><th>تاریخ</th><th>اقلام</th><th>مبلغ ثبت‌شده</th><th>پرداخت</th><th>آماده‌سازی</th><th>منبع</th><th>عملیات</th></tr></thead>
              <tbody>{data.orders.map((order) => <tr key={order.id} onClick={() => setPreview(order.id)}><td onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={picked.has(order.id)} onChange={() => toggle(order.id)} aria-label={`انتخاب ${order.id}`} /></td><td><button type="button" className="ord-id" onClick={(event) => { event.stopPropagation(); setPreview(order.id); }}><bdi dir="ltr">{order.id}</bdi></button></td><td>{order.customer || "نامشخص"}</td><td>{formatJalaliDateTime(order.created_at)}</td><td>{order.item_count == null ? "نامشخص" : fa(order.item_count)}</td><td className="ord-money">{money(order.total, order.currency)}</td><td><span className="ord-badge">{label(order.payment_status)}</span></td><td><span className="ord-badge">{label(order.fulfillment_status)}</span></td><td>نامشخص</td><td><button type="button" className="ord-control" onClick={(event) => { event.stopPropagation(); setPreview(order.id); }}>مشاهده</button></td></tr>)}</tbody>
            </table>
          </div>
          <div className="ord-mobile-list">
            <label className="ord-select-all"><input type="checkbox" checked={all} onChange={toggleAll} /> انتخاب سفارش‌های این صفحه</label>
            {data.orders.map((order) => <article className="ord-mobile-card" key={order.id}><div className="ord-mobile-head"><label><input type="checkbox" checked={picked.has(order.id)} onChange={() => toggle(order.id)} aria-label={`انتخاب ${order.id}`} /> <bdi dir="ltr">{order.id}</bdi></label><button type="button" className="ord-control" onClick={() => setPreview(order.id)}>مشاهده</button></div><strong>{order.customer || "مشتری نامشخص"}</strong><p>{formatJalaliDateTime(order.created_at)} · {order.item_count == null ? "تعداد نامشخص" : `${fa(order.item_count)} قلم`}</p><div className="ord-mobile-foot"><span className="ord-badge">پرداخت: {label(order.payment_status)}</span><span className="ord-badge">آماده‌سازی: {label(order.fulfillment_status)}</span></div><b>{money(order.total, order.currency)}</b></article>)}
          </div>
        </>}

        {state.kind === "success" && data && <footer className="ord-pagination"><span>صفحه {fa(page)} از {fa(totalPages)}</span><div><button type="button" className="ord-control" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>قبلی</button><button type="button" className="ord-control" disabled={data.total === 0 || page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>بعدی</button></div></footer>}
      </section>

      {advancedOpen && <AdvancedFiltersSheet payment={payment} fulfillment={fulfillment} sort={`${sort}-${dir}`} dense={dense} onPayment={(value) => change(setPayment, value)} onFulfillment={(value) => change(setFulfillment, value)} onSort={changeSort} onDense={setDense} onClear={clear} close={() => setAdvancedOpen(false)} />}
      {preview && <Preview id={preview} close={() => setPreview(null)} />}
    </div>
  );
}
