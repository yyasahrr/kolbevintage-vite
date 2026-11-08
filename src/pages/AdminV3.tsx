import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardList,
  PackagePlus,
  Plus,
  Printer,
  RefreshCw,
  ScanBarcode,
  ShieldCheck,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/utils/cn";
import { addOrder, type Order } from "@/state/admin";
import { formatPrice } from "@/data/looks";

const fa = (value: number) => value.toLocaleString("fa-IR");
const money = (value: number) => formatPrice(value);
const dateTime = (value: string) => new Date(value).toLocaleString("fa-IR");

function Head({ title, sub, action }: { title: string; sub: string; action?: React.ReactNode }) {
  return (
    <header className="ad-head">
      <div><h2>{title}</h2><p>{sub}</p></div>
      {action && <div className="ad-head-actions">{action}</div>}
    </header>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="ad-card">
      <header className="ad-card-head"><h3>{title}</h3>{action}</header>
      <div className="ad-card-body">{children}</div>
    </section>
  );
}

function Notice({ message }: { message: { ok: boolean; text: string } | null }) {
  if (!message) return null;
  return <p className={cn("ad-banner", !message.ok && "is-warn")} role="status">{message.text}</p>;
}

interface InventoryVariant {
  id: string;
  productId: string;
  name: string;
  category: string;
  price: number;
  sku: string;
  colorId: string;
  colorName: string;
  colorHex: string;
  sizeId: string;
  sizeLabel: string;
  onHand: number;
  stockVersion: string;
  quarantined: number;
  reserved: number;
  sellable: number;
  threshold: number;
  active: boolean;
  lowStock: boolean;
  outOfStock: boolean;
}

interface Adjustment {
  id: string;
  variantId: string;
  delta: number;
  reason: string;
  requestedBy: string;
  approvedBy?: string | null;
  status: string;
  note?: string | null;
  createdAt: string;
}

function useInventory() {
  const [variants, setVariants] = useState<InventoryVariant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setVariants(await api.get<InventoryVariant[]>("/api/commerce/admin/inventory"));
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "موجودی خوانده نشد.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { variants, loading, error, load };
}

/* =====================================================================
   SKU-centred stock: read-only physical/reserved/sellable values
   ===================================================================== */
export function InventoryWorkspace() {
  const { variants, loading, error, load } = useInventory();
  const [query, setQuery] = useState("");
  const [warningsOnly, setWarningsOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const navigate = useNavigate();
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = variants.filter((variant) =>
      (!warningsOnly || variant.lowStock || variant.outOfStock) &&
      (!needle || `${variant.name} ${variant.sku} ${variant.category}`.toLowerCase().includes(needle)),
    );
    const map = new Map<string, InventoryVariant[]>();
    for (const variant of filtered) map.set(variant.productId, [...(map.get(variant.productId) ?? []), variant]);
    return [...map.entries()];
  }, [variants, query, warningsOnly]);
  const warnings = variants.filter((variant) => variant.lowStock || variant.outOfStock).length;
  const sum = (key: "onHand" | "reserved" | "sellable") => variants.reduce((total, variant) => total + variant[key], 0);

  return (
    <>
      <Head
        title="موجودی کالا و هشدارهای انبار"
        sub="موجودی فیزیکی، قرنطینه، رزرو سفارش‌ها و قابل‌فروش از یک دفتر کل واقعی خوانده می‌شود؛ ویرایش فقط در عملیات انبار انجام می‌شود."
        action={<button type="button" className="ad-btn is-sm" onClick={() => void load()}><RefreshCw width={13} height={13} /> تازه‌سازی</button>}
      />
      <div className="ad-kpis">
        <div className="ad-kpi ad-kpi-static"><b>{fa(variants.length)}</b><span className="ad-kpi-label">کد SKU</span></div>
        <div className="ad-kpi ad-kpi-static"><b>{fa(sum("onHand"))}</b><span className="ad-kpi-label">موجودی فیزیکی</span></div>
        <div className="ad-kpi ad-kpi-static"><b>{fa(sum("reserved"))}</b><span className="ad-kpi-label">رزرو فعال</span></div>
        <div className="ad-kpi ad-kpi-static"><b>{fa(sum("sellable"))}</b><span className="ad-kpi-label">قابل فروش</span></div>
        <div className="ad-kpi ad-kpi-static"><b>{fa(warnings)}</b><span className="ad-kpi-label">هشدار SKU</span></div>
      </div>
      <div className="ad-toolbar">
        <input className="ad-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="محصول، دسته یا SKU…" aria-label="جست‌وجوی موجودی" />
        <label className="ad-check"><input type="checkbox" checked={warningsOnly} onChange={(event) => setWarningsOnly(event.target.checked)} /> فقط هشدارها</label>
        <button type="button" className="ad-btn is-sm is-primary" onClick={() => navigate("/admin/stock/inventoryops")}><PackagePlus width={13} height={13} /> دریافت و اصلاح</button>
        <button type="button" className="ad-btn is-sm" onClick={() => navigate("/admin/stock/ledger")}><ClipboardList width={13} height={13} /> دفتر گردش</button>
      </div>
      {error && <Notice message={{ ok: false, text: error }} />}
      {loading && <p className="ad-empty">در حال خواندن دفتر کل انبار…</p>}
      {!loading && !error && groups.length === 0 && <p className="ad-empty">با این فیلترها SKUای پیدا نشد.</p>}
      <div className="ad-cards">
        {groups.map(([productId, rows]) => {
          const first = rows[0];
          const isOpen = open === productId;
          const sellable = rows.reduce((total, row) => total + row.sellable, 0);
          const reserved = rows.reduce((total, row) => total + row.reserved, 0);
          return (
            <article className={cn("ad-inv", isOpen && "is-open")} key={productId}>
              <button type="button" className="ad-inv-head" onClick={() => setOpen(isOpen ? null : productId)} aria-expanded={isOpen}>
                <span className="ad-inv-main"><b>{first.name}</b><small>{first.category} · {fa(rows.length)} SKU</small></span>
                <span className="ad-pill is-pending">رزرو {fa(reserved)}</span>
                <span className={cn("ad-pill", sellable === 0 ? "is-cancelled" : "is-done")}>قابل‌فروش {fa(sellable)}</span>
                <span className="ad-inv-toggle">{isOpen ? "بستن" : "تنوع‌ها"}</span>
              </button>
              {isOpen && (
                <div className="ad-table-wrap">
                  <table className="ad-table">
                    <thead><tr><th>رنگ و سایز</th><th>SKU</th><th>فیزیکی</th><th>قرنطینه</th><th>رزرو</th><th>قابل‌فروش</th><th>وضعیت</th></tr></thead>
                    <tbody>{rows.map((row) => (
                      <tr key={row.id}>
                        <td><span className="ad-stock-color"><i style={{ background: row.colorHex }} />{row.colorName} · {row.sizeLabel}</span></td>
                        <td dir="ltr">{row.sku}</td>
                        <td className="ad-num">{fa(row.onHand)}</td>
                        <td className="ad-num">{fa(row.quarantined)}</td>
                        <td className="ad-num">{fa(row.reserved)}</td>
                        <td className="ad-num"><b>{fa(row.sellable)}</b></td>
                        <td><span className={cn("ad-pill", row.outOfStock ? "is-cancelled" : row.lowStock ? "is-pending" : "is-done")}>{row.outOfStock ? "ناموجود" : row.lowStock ? `کم‌موجود · حد ${fa(row.threshold)}` : "ایمن"}</span></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}

/* =====================================================================
   Receiving, stocktake and two-person corrections
   ===================================================================== */
export function InventoryOperationsPanel() {
  const { variants, loading:inventoryLoading, load: loadVariants } = useInventory();
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [variantId, setVariantId] = useState("");
  const [mode, setMode] = useState<"receive" | "count" | "correction">("receive");
  const [quantity, setQuantity] = useState(1);
  const [counted, setCounted] = useState(0);
  const [reason, setReason] = useState("خرید تأمین‌کننده");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [locked,setLocked]=useState(false);
  const [baseline,setBaseline]=useState<{id:string;onHand:number;version:string}|null>(null);
  const request=useRef<Record<string,unknown>|null>(null),submitLock=useRef(false),decisionLock=useRef(false);
  const selected = variants.find((variant) => variant.id === variantId);
  const delta = mode === "receive" ? quantity : mode === "count" && baseline ? counted - baseline.onHand : quantity;

  const loadAdjustments = useCallback(async () => {
    try { setAdjustments(await api.get<Adjustment[]>("/api/commerce/admin/inventory/adjustments")); }
    catch (reason) { setMessage({ ok: false, text: reason instanceof Error ? reason.message : "درخواست‌ها خوانده نشد." }); }
  }, []);
  useEffect(() => { void loadAdjustments(); }, [loadAdjustments]);

  const submit = async () => {
    if (submitLock.current || !selected || !baseline || baseline.id!==selected.id || !reason.trim() || (mode!=="count" && !delta) || (mode==="receive"&&quantity<1)) return;
    submitLock.current=true;setBusy(true);
    if(!request.current)request.current={operation:mode==='count'?'stocktake':mode==='receive'?'receive':'adjust',variantId,reference:reason.trim(),note:note.trim(),expectedVersion:baseline.version,idempotencyKey:`legacy-warehouse-${crypto.randomUUID()}`,...(mode==='count'?{countedQty:counted,expectedOnHand:baseline.onHand}:mode==='receive'?{acceptedQty:quantity,rejectedQty:0}:{delta:quantity})};
    setLocked(true);
    try {
      await api.post("/api/commerce/admin/inventory/operations",request.current);
      request.current=null;setLocked(false);setVariantId("");setBaseline(null);setNote("");
      setMessage({ ok: true, text: "درخواست ثبت شد؛ موجودی تنها پس از تأیید تغییر می‌کند." });
      await Promise.all([loadAdjustments(),loadVariants()]);
    } catch (error) {
      setMessage({ ok: false, text: `${error instanceof Error ? error.message : "ثبت درخواست ناموفق بود."} نتیجه را بررسی کنید یا با همین داده‌ها دوباره تلاش کنید.` });
    } finally { submitLock.current=false;setBusy(false); }
  };

  const decide = async (id: string, decision: "approve" | "reject") => {
    if(decisionLock.current || busy || !window.confirm(`${decision==='approve'?'تأیید':'رد'} درخواست ${id}؟ وضعیت و موجودی دوباره در سرور بررسی می‌شود.`))return;
    decisionLock.current=true;setBusy(true);
    try {
      const result=await api.post<{adjustment:{status:string};unchanged:boolean}>(`/api/commerce/admin/inventory/adjustments/${encodeURIComponent(id)}`, { decision });
      if(!['approved','rejected'].includes(result.adjustment?.status))throw new Error('پاسخ تصمیم نامعتبر است؛ وضعیت را بررسی کنید.');
      const actual=result.adjustment.status==='approved'?'تأییدشده':'ردشده';
      setMessage({ ok: true, text: result.unchanged?`درخواست قبلاً ${actual} بوده است؛ تصمیم تازه‌ای ثبت نشد.`:`درخواست ${actual} شد.` });
      await Promise.all([loadAdjustments(), loadVariants()]);
    } catch (error) { setMessage({ ok: false, text: `${error instanceof Error ? error.message : "تصمیم ثبت نشد."} ابتدا وضعیت را تازه‌سازی و بررسی کنید.` });await loadAdjustments(); }
    finally {decisionLock.current=false;setBusy(false)}
  };

  return (
    <>
      <Head title="دریافت کالا، شمارش و اصلاح موجودی" sub="هیچ عددی مستقیم روی موجودی نوشته نمی‌شود؛ درخواست‌ها با کنترل موجودی و ردیابی در دفتر کل بررسی می‌شوند؛ مالک می‌تواند درخواست خود را تأیید کند." />
      <Notice message={message} />
      <div className="ad-grid-2">
        <Panel title="ثبت عملیات جدید">
          <div className="ad-filters">
            {([['receive', 'دریافت کالا'], ['count', 'شمارش انبار'], ['correction', 'اصلاح علامت‌دار']] as const).map(([id, label]) => (
              <button type="button" key={id} disabled={locked||busy} className={cn("ad-chip", mode === id && "is-on")} onClick={() => setMode(id)}>{label}</button>
            ))}
          </div>
          <label className="ad-field">SKU
            <select className="ad-select" value={variantId} disabled={locked||busy||inventoryLoading} onChange={(event) => { setVariantId(event.target.value); const item = variants.find((row) => row.id === event.target.value); setBaseline(item?{id:item.id,onHand:item.onHand,version:item.stockVersion}:null); if (item) setCounted(item.onHand); }}>
              <option value="">انتخاب تنوع…</option>
              {variants.map((variant) => <option value={variant.id} key={variant.id}>{variant.name} — {variant.colorName} / {variant.sizeLabel} — {variant.sku}</option>)}
            </select>
          </label>
          {selected && <p className="ad-hint">فیزیکی هنگام انتخاب {fa(baseline?.onHand ?? selected.onHand)} · رزرو {fa(selected.reserved)} · قابل‌فروش {fa(selected.sellable)}</p>}
          {mode === "count" ? (
            <label className="ad-field">عدد شمارش‌شده<input className="ad-input" type="number" min={0} max={1000000} disabled={locked||busy} value={counted} onChange={(event) => setCounted(Math.max(0, Number(event.target.value) || 0))} /></label>
          ) : (
            <label className="ad-field">{mode === "receive" ? "تعداد دریافتی" : "تغییر (مثبت یا منفی)"}<input className="ad-input" type="number" min={mode === "receive" ? 1 : undefined} value={quantity} disabled={locked||busy} onChange={(event) => setQuantity(Number(event.target.value) || 0)} /></label>
          )}
          <label className="ad-field">دلیل<input className="ad-input" value={reason} maxLength={150} disabled={locked||busy} onChange={(event) => setReason(event.target.value)} /></label>
          <label className="ad-field">یادداشت و شماره سند<textarea className="ad-input" rows={2} maxLength={1000} disabled={locked||busy} value={note} onChange={(event) => setNote(event.target.value)} /></label>
          <p className="ad-hint">تغییر درخواستی: <b>{delta > 0 ? `+${fa(delta)}` : fa(delta)}</b>{mode === "count" && delta === 0 ? " — شمارش با دفتر یکسان است" : ""}</p>
          <button type="button" className="ad-btn is-primary" disabled={!selected || !baseline || (mode!=="count"&&!delta) || (mode==="receive"&&quantity<1) || !reason.trim() || (mode==="correction"&&!note.trim()) || busy || inventoryLoading} onClick={() => void submit()}><PackagePlus width={14} height={14} /> {busy ? "در حال ثبت…" : locked ? "تلاش مجدد برای همین درخواست" : "ثبت برای تأیید"}</button>{locked&&!busy&&<p className="ad-hint">ممکن است درخواست قبلی ثبت شده باشد؛ پیش از شروع فرم جدید، صف را بررسی کنید. <button type="button" className="ad-btn is-sm" onClick={()=>{request.current=null;setLocked(false);setVariantId("");setBaseline(null);void Promise.all([loadAdjustments(),loadVariants()]);}}>شروع فرم جدید و تازه‌سازی</button></p>}
        </Panel>
        <Panel title="قرارداد کنترل انبار" action={<ShieldCheck width={16} height={16} />}>
          <p>دریافت و اصلاح ابتدا در صف می‌ماند. تأییدکننده به مجوز نیاز دارد؛ مالک و superadmin می‌توانند درخواست خود را تأیید کنند.</p>
          <p className="ad-hint">بعد از تأیید، موجودی فیزیکی در همان تراکنش تغییر می‌کند و یک رویداد در دفتر گردش ساخته می‌شود؛ این دفتر جایگزین ثبت مستقل مقاوم به دستکاری نیست. رزرو سفارش‌ها دست‌نخورده می‌ماند.</p>
        </Panel>
      </div>
      <Panel title={`صف درخواست‌ها (${fa(adjustments.filter((item) => item.status === "pending").length)} در انتظار)`}>
        {adjustments.length === 0 ? <p className="ad-empty">درخواستی ثبت نشده است.</p> : (
          <div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>زمان</th><th>SKU</th><th>تغییر</th><th>دلیل</th><th>درخواست‌کننده</th><th>وضعیت</th><th>عملیات</th></tr></thead>
            <tbody>{adjustments.map((item) => {
              const variant = variants.find((row) => row.id === item.variantId);
              return <tr key={item.id}><td>{dateTime(item.createdAt)}</td><td dir="ltr">{variant?.sku ?? item.variantId}</td><td className="ad-num">{item.delta > 0 ? `+${fa(item.delta)}` : fa(item.delta)}</td><td>{item.reason}<small>{item.note}</small></td><td>{item.requestedBy}</td><td>{item.status === "pending" ? "در انتظار" : item.status === "approved" ? "تأییدشده" : "ردشده"}</td><td>{item.status === "pending" && <div className="ad-actions"><button type="button" disabled={busy} className="ad-btn is-sm is-primary" onClick={() => void decide(item.id, "approve")}>تأیید</button><button type="button" disabled={busy} className="ad-btn is-sm is-danger" onClick={() => void decide(item.id, "reject")}>رد</button></div>}</td></tr>;
            })}</tbody></table></div>
        )}
      </Panel>
    </>
  );
}

interface Movement {
  id: number;
  variant_id: string;
  sku: string;
  product_name: string;
  color_id: string;
  size_id: string;
  delta: number;
  reason: string;
  ref_type: string | null;
  ref_id: string | null;
  actor: string | null;
  note: string | null;
  created_at: string;
}

const MOVEMENT_LABEL: Record<string, string> = { sale: "فروش", adjustment: "اصلاح انبار", cancellation: "لغو سفارش", refund_return: "بازگشت مرجوعی", catalog_sync: "همگام‌سازی کاتالوگ" };

export function InventoryLedgerPanel() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    try { setMovements(await api.get<Movement[]>("/api/commerce/admin/inventory/movements?limit=500")); setMessage(null); }
    catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "دفتر گردش خوانده نشد." }); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const rows = movements.filter((item) => !query.trim() || `${item.sku} ${item.product_name} ${item.ref_id ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <>
      <Head title="دفتر کل گردش کالا" sub="تاریخچهٔ افزوده‌شوندهٔ همهٔ فروش‌ها، اصلاحات، لغوها و بازگشت‌ها؛ مرجع عدد فیزیکی انبار." action={<button type="button" className="ad-btn is-sm" onClick={() => void load()}><RefreshCw width={13} height={13} /> تازه‌سازی</button>} />
      <Notice message={message} />
      <div className="ad-toolbar"><input className="ad-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="SKU، محصول یا شماره مرجع…" aria-label="جست‌وجوی دفتر گردش" /></div>
      <Panel title={`${fa(rows.length)} رویداد ثبت‌شده`}>
        {rows.length === 0 ? <p className="ad-empty">رویدادی برای نمایش نیست.</p> : <div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>زمان</th><th>محصول و SKU</th><th>تغییر</th><th>علت</th><th>مرجع</th><th>کنشگر</th><th>یادداشت</th></tr></thead><tbody>
          {rows.map((item) => <tr key={item.id}><td>{dateTime(item.created_at)}</td><td>{item.product_name}<small dir="ltr">{item.sku}</small></td><td className="ad-num"><b>{item.delta > 0 ? `+${fa(item.delta)}` : fa(item.delta)}</b></td><td>{MOVEMENT_LABEL[item.reason] ?? item.reason}</td><td dir="ltr">{item.ref_id ?? "—"}</td><td>{item.actor ?? "سیستم"}</td><td>{item.note ?? "—"}</td></tr>)}
        </tbody></table></div>}
      </Panel>
    </>
  );
}

/* =====================================================================
   Six-step manual order, using the real commerce checkout on the server
   ===================================================================== */
interface CommerceOrderLine {
  id: string;
  variantId: string;
  productId: string;
  sku: string;
  name: string;
  colorName: string;
  sizeLabel: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}
interface CommerceOrder {
  id: string;
  createdAt: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  customer: string | null;
  email: string | null;
  phone: string;
  city: string;
  address: string;
  shipping: "standard" | "express";
  tracking: string;
  carrier: string;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  total: number;
  currency: string;
  lines: CommerceOrderLine[];
}

export function ManualOrderPanel() {
  const { variants } = useInventory();
  const [step, setStep] = useState(1);
  const [variantId, setVariantId] = useState("");
  const [lines, setLines] = useState<{ variantId: string; quantity: number }[]>([]);
  const [customer, setCustomer] = useState({ name: "", email: "", phone: "", province: "تهران", city: "", street: "", postal: "" });
  const [shipping, setShipping] = useState<"standard" | "express">("standard");
  const [coupon, setCoupon] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [created, setCreated] = useState<CommerceOrder | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const requestKey = useRef(`ui-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const chosen = lines.map((line) => ({ ...line, variant: variants.find((variant) => variant.id === line.variantId) })).filter((line) => line.variant);
  const merchandise = chosen.reduce((total, line) => total + (line.variant?.price ?? 0) * line.quantity, 0);
  const canContinue = step === 1 ? Boolean(customer.name.trim() && customer.phone.trim()) : step === 2 ? lines.length > 0 : step === 3 ? Boolean(customer.city.trim() && customer.street.trim()) : step === 4 ? Boolean(paymentReference.trim()) : true;

  const addLine = () => {
    if (!variantId) return;
    setLines((current) => current.some((line) => line.variantId === variantId) ? current : [...current, { variantId, quantity: 1 }]);
    setVariantId("");
  };
  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.post<{ order: CommerceOrder; legacy: Order }>("/api/commerce/admin/orders/manual", {
        items: lines,
        customerEmail: customer.email || null,
        address: { receiver: customer.name, phone: customer.phone, province: customer.province, city: customer.city, street: customer.street, postal: customer.postal },
        shippingMethod: shipping,
        couponCode: coupon || null,
        paymentReference,
        idempotencyKey: requestKey.current,
      });
      addOrder(result.legacy);
      setCreated(result.order);
      setStep(6);
      setMessage({ ok: true, text: "سفارش با قیمت قطعی سرور و اسنپ‌شات اقلام ثبت شد." });
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "سفارش ثبت نشد." }); }
    finally { setBusy(false); }
  };
  const reset = () => {
    setStep(1); setLines([]); setPaymentReference(""); setCreated(null); setMessage(null);
    requestKey.current = `ui-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  };
  const labels = ["مشتری", "اقلام", "نشانی", "ارسال و پرداخت", "بازبینی", "ثبت‌شده"];
  return (
    <>
      <Head title="ثبت سفارش دستی ۶ مرحله‌ای" sub="برای سفارش تلفنی با پرداخت خارجی تأییدشده؛ قیمت، تخفیف، رزرو و کسر موجودی دقیقاً از هستهٔ تجارت سایت انجام می‌شود." />
      <div className="ad-filters" role="tablist" aria-label="مراحل سفارش دستی">{labels.map((label, index) => <button type="button" key={label} className={cn("ad-chip", step === index + 1 && "is-on")} disabled={index + 1 > step} onClick={() => setStep(index + 1)}>{fa(index + 1)}. {label}</button>)}</div>
      <Notice message={message} />
      {step === 1 && <Panel title="مشخصات مشتری"><div className="ad-form-grid"><label className="ad-field">نام گیرنده<input className="ad-input" value={customer.name} onChange={(event) => setCustomer({ ...customer, name: event.target.value })} /></label><label className="ad-field">موبایل<input className="ad-input" dir="ltr" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} /></label><label className="ad-field">ایمیل (اختیاری)<input className="ad-input" dir="ltr" type="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} /></label></div></Panel>}
      {step === 2 && <Panel title="اقلام و تنوع‌ها"><div className="ad-toolbar"><select className="ad-select" value={variantId} onChange={(event) => setVariantId(event.target.value)}><option value="">انتخاب SKU…</option>{variants.filter((variant) => variant.active && variant.sellable > 0).map((variant) => <option key={variant.id} value={variant.id}>{variant.name} — {variant.colorName} / {variant.sizeLabel} · {fa(variant.sellable)} عدد</option>)}</select><button type="button" className="ad-btn is-sm is-primary" disabled={!variantId} onClick={addLine}><Plus width={13} height={13} /> افزودن</button></div>
        {chosen.length === 0 ? <p className="ad-empty">هنوز قلمی انتخاب نشده است.</p> : <div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>کالا</th><th>SKU</th><th>قیمت</th><th>موجود</th><th>تعداد</th><th /></tr></thead><tbody>{chosen.map((line) => <tr key={line.variantId}><td>{line.variant!.name}<small>{line.variant!.colorName} · {line.variant!.sizeLabel}</small></td><td dir="ltr">{line.variant!.sku}</td><td>{money(line.variant!.price)}</td><td>{fa(line.variant!.sellable)}</td><td><input className="ad-input is-tiny" type="number" min={1} max={line.variant!.sellable} value={line.quantity} onChange={(event) => setLines(lines.map((item) => item.variantId === line.variantId ? { ...item, quantity: Math.max(1, Math.min(line.variant!.sellable, Number(event.target.value) || 1)) } : item))} /></td><td><button type="button" className="ad-icon is-danger" aria-label="حذف قلم" onClick={() => setLines(lines.filter((item) => item.variantId !== line.variantId))}><Trash2 width={13} height={13} /></button></td></tr>)}</tbody></table></div>}
      </Panel>}
      {step === 3 && <Panel title="نشانی ارسال"><div className="ad-form-grid"><label className="ad-field">استان<input className="ad-input" value={customer.province} onChange={(event) => setCustomer({ ...customer, province: event.target.value })} /></label><label className="ad-field">شهر<input className="ad-input" value={customer.city} onChange={(event) => setCustomer({ ...customer, city: event.target.value })} /></label><label className="ad-field">کد پستی<input className="ad-input" dir="ltr" value={customer.postal} onChange={(event) => setCustomer({ ...customer, postal: event.target.value })} /></label><label className="ad-field">نشانی کامل<textarea className="ad-input" rows={3} value={customer.street} onChange={(event) => setCustomer({ ...customer, street: event.target.value })} /></label></div></Panel>}
      {step === 4 && <Panel title="ارسال و پرداخت خارجی"><div className="ad-form-grid"><label className="ad-field">روش ارسال<select className="ad-select" value={shipping} onChange={(event) => setShipping(event.target.value as "standard" | "express")}><option value="standard">پست استاندارد</option><option value="express">پست پیشتاز</option></select></label><label className="ad-field">کد تخفیف (اختیاری)<input className="ad-input" dir="ltr" value={coupon} onChange={(event) => setCoupon(event.target.value)} /></label><label className="ad-field">شماره مرجع پرداخت خارجی<input className="ad-input" dir="ltr" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="شماره رسید بانکی" /></label></div><p className="ad-hint is-warn">این فرم پرداخت را شبیه‌سازی نمی‌کند. فقط رسید واقعی کارت‌به‌کارت یا درگاه خارجی را ثبت کن؛ مبلغ نهایی در مرحلهٔ بعد توسط سرور محاسبه می‌شود.</p></Panel>}
      {step === 5 && <Panel title="بازبینی نهایی"><div className="ad-grid-2"><div><h3>{customer.name}</h3><p>{customer.phone} · {customer.email || "بدون ایمیل"}</p><p>{customer.province}، {customer.city} — {customer.street}</p><p>ارسال: {shipping === "express" ? "پیشتاز" : "استاندارد"} · مرجع پرداخت: <bdi dir="ltr">{paymentReference}</bdi></p></div><div><p>{fa(chosen.length)} تنوع و {fa(chosen.reduce((total, line) => total + line.quantity, 0))} قطعه</p><p>جمع کالاها پیش از تخفیف و ارسال: <b>{money(merchandise)}</b></p><p className="ad-hint">مبلغ قطعی پرداخت، تخفیف و کرایه هنگام ثبت دوباره توسط سرور محاسبه و در فاکتور منجمد می‌شود.</p></div></div></Panel>}
      {step === 6 && created && <Panel title={`سفارش ${created.id} ثبت شد`}><div className="ad-kpis"><div className="ad-kpi ad-kpi-static"><b>{money(created.total)}</b><span className="ad-kpi-label">مبلغ قطعی</span></div><div className="ad-kpi ad-kpi-static"><b>{fa(created.lines.length)}</b><span className="ad-kpi-label">ردیف کالا</span></div><div className="ad-kpi ad-kpi-static"><b>آماده‌سازی</b><span className="ad-kpi-label">وضعیت عملیات</span></div></div><div className="ad-actions"><Link className="ad-btn is-primary" to="/admin/sales/fulfillment"><ScanBarcode width={14} height={14} /> رفتن به ایستگاه برداشت</Link><Link className="ad-btn" to="/admin/sales/print"><Printer width={14} height={14} /> چاپ سند</Link><button type="button" className="ad-btn" onClick={reset}>سفارش بعدی</button></div></Panel>}
      {step < 5 && <div className="ad-actions"><button type="button" className="ad-btn" disabled={step === 1} onClick={() => setStep(step - 1)}>قبلی</button><button type="button" className="ad-btn is-primary" disabled={!canContinue} onClick={() => setStep(step + 1)}>ادامه<ArrowLeft width={13} height={13} /></button></div>}
      {step === 5 && <div className="ad-actions"><button type="button" className="ad-btn" onClick={() => setStep(4)}>قبلی</button><button type="button" className="ad-btn is-primary" disabled={busy} onClick={() => void submit()}>{busy ? "در حال استعلام و ثبت…" : "ثبت قطعی سفارش و کسر موجودی"}<Check width={14} height={14} /></button></div>}
    </>
  );
}

/* =====================================================================
   Warehouse fulfilment station
   ===================================================================== */
export function FulfillmentPanel() {
  const [orders, setOrders] = useState<CommerceOrder[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [sku, setSku] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("شرکت ملی پست");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const selected = orders.find((order) => order.id === selectedId) ?? null;
  const load = useCallback(async () => {
    try {
      const rows = await api.get<CommerceOrder[]>("/api/commerce/orders?all=1&limit=200");
      setOrders(rows);
      if (!selectedId && rows[0]) setSelectedId(rows[0].id);
      setMessage(null);
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "سفارش‌ها خوانده نشد." }); }
  }, [selectedId]);
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTracking(selected?.tracking ?? ""); setCarrier(selected?.carrier || "شرکت ملی پست"); setConfirmed(false); setSku(""); }, [selectedId, selected?.tracking, selected?.carrier]);

  const advance = async (action: "picking" | "packing" | "ship" | "deliver") => {
    if (!selected) return;
    setBusy(true);
    try {
      if (action === "ship") await api.patch(`/api/commerce/admin/orders/${selected.id}/shipment`, { tracking, carrier });
      await api.post(`/api/commerce/orders/${selected.id}/${action}`, action === "picking" ? { sku } : { confirm: confirmed });
      setMessage({ ok: true, text: "مرحله در سرور ثبت شد." });
      setSku(""); setConfirmed(false);
      await load();
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "مرحله ثبت نشد." }); }
    finally { setBusy(false); }
  };
  return (
    <>
      <Head title="ایستگاه برداشت، بسته‌بندی و ارسال" sub="انتخاب سفارش، اسکن SKU واقعی، تأیید بسته‌بندی، ثبت رهگیری و تحویل؛ هیچ پرش وضعیتی در مرورگر انجام نمی‌شود." action={<button type="button" className="ad-btn is-sm" onClick={() => void load()}><RefreshCw width={13} height={13} /> تازه‌سازی</button>} />
      <Notice message={message} />
      <div className="ad-toolbar"><select className="ad-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">انتخاب سفارش…</option>{orders.filter((order) => order.lines.length > 0 && order.status !== "cancelled").map((order) => <option key={order.id} value={order.id}>{order.id} — {order.customer} — {order.fulfillmentStatus}</option>)}</select><Link to="/admin/sales/print" className="ad-btn is-sm"><Printer width={13} height={13} /> مرکز چاپ</Link></div>
      {!selected ? <p className="ad-empty">سفارشی برای پردازش انتخاب نشده است.</p> : <div className="ad-grid-2">
        <Panel title={`${selected.id} — ${selected.customer ?? "مشتری"}`}>
          <p>{selected.phone} · {selected.city}</p><p className="ad-hint">{selected.address}</p>
          <div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>کالا</th><th>SKU</th><th>تعداد</th><th>اسکن سریع</th></tr></thead><tbody>{selected.lines.map((line) => <tr key={line.id}><td>{line.name}<small>{line.colorName} · {line.sizeLabel}</small></td><td dir="ltr">{line.sku}</td><td>{fa(line.quantity)}</td><td><button type="button" className="ad-btn is-sm" onClick={() => setSku(line.sku)}>کپی در فیلد</button></td></tr>)}</tbody></table></div>
          <label className="ad-field">اسکن یا نوشتن SKU<input className="ad-input" dir="ltr" autoComplete="off" value={sku} onChange={(event) => setSku(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void advance("picking"); } }} placeholder="بارکد کالا را اسکن کن" /></label>
          <button type="button" className="ad-btn is-primary" disabled={!sku.trim() || busy || !["paid", "preparing"].includes(selected.status)} onClick={() => void advance("picking")}><ScanBarcode width={14} height={14} /> ثبت برداشت</button>
        </Panel>
        <Panel title="بسته‌بندی و تحویل به پست">
          <p>وضعیت فعلی: <b>{selected.fulfillmentStatus}</b> · پرداخت: {selected.paymentStatus === "settled" ? "تأییدشده" : selected.paymentStatus}</p>
          <label className="ad-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> همهٔ اقلام، تعداد و سلامت بسته را بررسی کردم</label>
          <button type="button" className="ad-btn is-primary" disabled={!confirmed || busy || selected.fulfillmentStatus === "packed" || selected.status !== "preparing"} onClick={() => void advance("packing")}><CheckCircle2 width={14} height={14} /> تأیید بسته‌بندی</button>
          <div className="ad-two"><label className="ad-field">شرکت حمل<input className="ad-input" value={carrier} onChange={(event) => setCarrier(event.target.value)} /></label><label className="ad-field">کد رهگیری<input className="ad-input" dir="ltr" value={tracking} onChange={(event) => setTracking(event.target.value)} /></label></div>
          <div className="ad-actions"><button type="button" className="ad-btn is-primary" disabled={!tracking.trim() || busy || selected.fulfillmentStatus !== "packed"} onClick={() => void advance("ship")}><Truck width={14} height={14} /> ثبت ارسال</button><button type="button" className="ad-btn" disabled={busy || selected.status !== "shipped"} onClick={() => void advance("deliver")}>ثبت تحویل به مشتری</button></div>
          <p className="ad-hint">کد رهگیری پیش از ارسال در سند مشترک سفارش ذخیره می‌شود و در حساب مشتری هم دیده خواهد شد.</p>
        </Panel>
      </div>}
    </>
  );
}

/* =====================================================================
   A4 invoices and exact 100×150 mm shipping labels
   ===================================================================== */
const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] ?? char);

function printOrders(orders: CommerceOrder[], kind: "label" | "invoice") {
  const popup = window.open("", "_blank", "width=900,height=700");
  if (!popup) return false;
  const sheets = orders.map((order) => kind === "label" ? `<section class="sheet label"><h1>کلبه وینتیج</h1><h2>برچسب ارسال ${escapeHtml(order.id)}</h2><p><b>گیرنده:</b> ${escapeHtml(order.customer)}</p><p><b>موبایل:</b> <bdi dir="ltr">${escapeHtml(order.phone)}</bdi></p><p><b>نشانی:</b> ${escapeHtml(order.address || order.city)}</p><p><b>روش:</b> ${order.shipping === "express" ? "پست پیشتاز" : "پست استاندارد"}</p><p><b>شرکت حمل:</b> ${escapeHtml(order.carrier)}</p><p><b>رهگیری:</b> <bdi dir="ltr">${escapeHtml(order.tracking || "ثبت نشده")}</bdi></p><p><b>${fa(order.lines.reduce((total, line) => total + line.quantity, 0))} قطعه · ${fa(order.lines.length)} ردیف</b></p><footer>${order.lines.map((line) => escapeHtml(line.sku)).join(" · ")}</footer></section>` : `<section class="sheet invoice"><h1>فاکتور فروش ${escapeHtml(order.id)}</h1><p>${escapeHtml(order.customer)} · ${escapeHtml(order.phone)} · ${dateTime(order.createdAt)}</p><p>${escapeHtml(order.address || order.city)}</p><table><thead><tr><th>کالا</th><th>SKU</th><th>رنگ/سایز</th><th>تعداد</th><th>قیمت واحد</th><th>جمع</th></tr></thead><tbody>${order.lines.map((line) => `<tr><td>${escapeHtml(line.name)}</td><td dir="ltr">${escapeHtml(line.sku)}</td><td>${escapeHtml(line.colorName)} / ${escapeHtml(line.sizeLabel)}</td><td>${fa(line.quantity)}</td><td>${money(line.unitPrice)}</td><td>${money(line.lineTotal)}</td></tr>`).join("")}</tbody></table><div class="totals"><p>جمع کالاها: ${money(order.subtotal)}</p><p>تخفیف: ${money(order.discountTotal)}</p><p>ارسال: ${money(order.shippingTotal)}</p><h2>مبلغ نهایی: ${money(order.total)}</h2></div></section>`).join("");
  popup.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>${kind === "label" ? "برچسب ارسال" : "فاکتور"}</title><style>@font-face{font-family:system;src:local(Vazirmatn)}*{box-sizing:border-box}body{font-family:system,Tahoma,sans-serif;color:#16130f;margin:0}.sheet{padding:10mm;page-break-after:always}table{width:100%;border-collapse:collapse;margin-top:8mm}th,td{border:1px solid #bbb;padding:3mm;text-align:right;font-size:11pt}.totals{margin-top:8mm;margin-right:auto;width:70mm}.label{width:100mm;height:150mm;padding:6mm;border:1px solid #222;overflow:hidden}.label h1{font-size:16pt;margin:0}.label h2{font-size:13pt}.label p{font-size:10pt;line-height:1.7}.label footer{font-size:7pt;margin-top:5mm;direction:ltr}@page{size:${kind === "label" ? "100mm 150mm" : "A4"};margin:${kind === "label" ? "0" : "8mm"}}@media print{.sheet{border:0}}</style></head><body>${sheets}<script>window.onload=()=>window.print()</script></body></html>`);
  popup.document.close();
  return true;
}

export function PrintCenterPanel() {
  const [orders, setOrders] = useState<CommerceOrder[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [kind, setKind] = useState<"label" | "invoice">("label");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    try { setOrders(await api.get<CommerceOrder[]>("/api/commerce/orders?all=1&limit=200")); }
    catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "سفارش‌ها خوانده نشد." }); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const toggle = (id: string) => setPicked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const print = () => {
    const chosen = orders.filter((order) => picked.has(order.id));
    if (!chosen.length) return;
    if (!printOrders(chosen, kind)) setMessage({ ok: false, text: "مرورگر پنجرهٔ چاپ را بست؛ اجازهٔ باز شدن پنجره را بده." });
  };
  return (
    <>
      <Head title="مرکز یکپارچه چاپ اسناد" sub="فاکتور A4 با قیمت‌های منجمد سفارش و برچسب دقیق ۱۰۰×۱۵۰ میلی‌متر از داده‌های مشترک انبار و مشتری." />
      <Notice message={message} />
      <div className="ad-toolbar"><div className="ad-filters"><button type="button" className={cn("ad-chip", kind === "label" && "is-on")} onClick={() => setKind("label")}>برچسب ۱۰۰×۱۵۰</button><button type="button" className={cn("ad-chip", kind === "invoice" && "is-on")} onClick={() => setKind("invoice")}>فاکتور A4</button></div><button type="button" className="ad-btn is-primary" disabled={!picked.size} onClick={print}><Printer width={14} height={14} /> چاپ {fa(picked.size)} سند</button></div>
      {kind === "label" && <p className="ad-hint is-warn">برای جلوگیری از اشتباه ارسال، برچسب بدون کد رهگیری هم قابل چاپ است اما عبارت «ثبت نشده» روی آن می‌ماند؛ بهتر است ابتدا رهگیری را در ایستگاه ارسال ثبت کنی.</p>}
      <Panel title="انتخاب سفارش‌ها">
        <div className="ad-table-wrap"><table className="ad-table"><thead><tr><th>انتخاب</th><th>سفارش</th><th>مشتری</th><th>اقلام</th><th>وضعیت</th><th>رهگیری</th><th>مبلغ</th></tr></thead><tbody>{orders.filter((order) => order.lines.length > 0).map((order) => <tr key={order.id}><td><input type="checkbox" checked={picked.has(order.id)} onChange={() => toggle(order.id)} aria-label={`انتخاب ${order.id}`} /></td><td dir="ltr">{order.id}</td><td>{order.customer}<small>{order.city}</small></td><td>{fa(order.lines.reduce((total, line) => total + line.quantity, 0))}</td><td>{order.fulfillmentStatus}</td><td dir="ltr">{order.tracking || "—"}</td><td>{money(order.total)}</td></tr>)}</tbody></table></div>
      </Panel>
    </>
  );
}

/* =====================================================================
   Reusable colour library
   ===================================================================== */
export function ColorLibraryPanel() {
  return <>
    <Head title="کتابخانه رنگ‌های استاندارد" sub="مدیریت رنگ‌ها به پنل متصل فروشگاه منتقل شده است." />
    <Panel title="مدیریت رنگ‌ها"><p className="ad-hint">برای جلوگیری از ذخیرهٔ ظاهری و ناسازگاری داده‌ها، ویرایش کتابخانه در این پنل قدیمی غیرفعال است. رنگ‌های محصولات موجود با تغییر کتابخانه تغییر نمی‌کنند.</p><a className="ad-btn is-primary" href="/panel/catalog/colors">باز کردن کتابخانه رنگ در پنل متصل</a></Panel>
  </>;
}

/* =====================================================================
   Public customer gallery moderation
   ===================================================================== */
interface GalleryItem {
  id: string;
  handle: string;
  imageUrl: string;
  caption: string;
  status: "pending" | "approved" | "rejected";
  consentVerified: boolean;
  submittedAt: string;
  version: number;
  moderatedBy?: string | null;
}

export function GalleryModerationPanel() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [filter, setFilter] = useState("pending");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    try { setItems(await api.get<GalleryItem[]>("/api/admin/gallery")); }
    catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "گالری خوانده نشد." }); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const moderate = async (item: GalleryItem, status: GalleryItem["status"]) => {
    try { await api.patch(`/api/admin/gallery/${encodeURIComponent(item.id)}`, { status, expectedVersion:item.version }); await load(); setMessage({ ok: true, text: "وضعیت انتشار ذخیره شد." }); }
    catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : "بازبینی ثبت نشد." }); }
  };
  const rows = items.filter((item) => filter === "all" || item.status === filter);
  return (
    <>
      <Head title="گالری استایل مشتریان" sub="تصاویر ارسالی مشتری ابتدا در صف بازبینی می‌ماند؛ فقط تصویر تأییدشده با رضایت ثبت‌شده در صفحهٔ عمومی گالری دیده می‌شود." action={<Link className="ad-btn is-sm" to="/gallery" target="_blank">مشاهدهٔ صفحهٔ عمومی<ArrowLeft width={13} height={13} /></Link>} />
      <Notice message={message} />
      <div className="ad-filters">{[["pending", "در انتظار"], ["approved", "منتشرشده"], ["rejected", "ردشده"], ["all", "همه"]].map(([id, label]) => <button type="button" key={id} className={cn("ad-chip", filter === id && "is-on")} onClick={() => setFilter(id)}>{label} ({fa(id === "all" ? items.length : items.filter((item) => item.status === id).length)})</button>)}</div>
      {rows.length === 0 ? <p className="ad-empty">در این صف تصویری نیست.</p> : <div className="ad-media-grid">{rows.map((item) => <article className="ad-media-card" key={item.id}><img src={item.imageUrl} alt={item.caption || `استایل ${item.handle}`} referrerPolicy="no-referrer" /><span className="ad-media-name">{item.handle}</span><p>{item.caption}</p><small>{dateTime(item.submittedAt)} · {item.consentVerified ? "رضایت انتشار ثبت‌شده" : "بدون رضایت"}</small><div className="ad-actions">{item.status !== "approved" && <button type="button" className="ad-btn is-sm is-primary" onClick={() => void moderate(item, "approved")}><Check width={13} height={13} /> تأیید انتشار</button>}{item.status !== "rejected" && <button type="button" className="ad-btn is-sm is-danger" onClick={() => void moderate(item, "rejected")}><X width={13} height={13} /> رد</button>}{item.status !== "pending" && <button type="button" className="ad-btn is-sm" onClick={() => void moderate(item, "pending")}>بازگشت به صف</button>}</div></article>)}</div>}
    </>
  );
}

