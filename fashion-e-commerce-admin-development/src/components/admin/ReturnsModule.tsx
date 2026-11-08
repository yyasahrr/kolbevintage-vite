"use client";

import { useEffect, useRef, useState } from "react";
import type { Order } from "./LiveModules";
import { PageHeader } from "./ui/PageHeader";
import { StatusBadge } from "./ui/StatusBadge";

type API = { get<T>(path: string): Promise<T>; post<T>(path: string, body: object): Promise<T> };
type ReturnRequest = { id: string; orderId: string; orderLineId: string; quantity: number; amount: number; reason: string | null; status: string; kind: string; note: string | null; requestedBy: string | null; createdAt: string };
type Props = { api: API; can: (permission: string) => boolean; orders: Order[]; subject: string | null; openAccess: boolean; onElevate: (passcode: string) => Promise<void>; onChange: () => Promise<void> };
const input = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-indigo-500";
const primary = "rounded-xl bg-[#1813fb] px-4 py-2 text-sm text-white disabled:opacity-50";
const secondary = "rounded-xl border border-slate-300 px-4 py-2 text-sm disabled:opacity-50";
const n = (value: number) => new Intl.NumberFormat("fa-IR").format(value);
const labels: Record<string,string> = { requested: "درخواست‌شده", approved: "تأییدشده", rejected: "ردشده", received: "دریافت‌شده", qc_passed: "کنترل کیفیت: قابل فروش", qc_failed: "کنترل کیفیت: قرنطینه", settled: "تسویه‌شده", manual_review: "نیازمند بررسی دستی", return: "مرجوعی کالا", refund: "بازپرداخت بدون کالا", exchange: "تعویض" };
const label = (value: string) => labels[value] || value;
const msg = (err: unknown) => err instanceof Error ? err.message : "ارتباط با فروشگاه برقرار نشد.";

export function ReturnsModule({ api, can, orders, subject, openAccess, onElevate, onChange }: Props) {
  const privileged = subject === "superadmin" || openAccess;
  const [page, setPage] = useState<{items:ReturnRequest[];nextCursor:string|null} | null>(null);
  const [filterInput,setFilterInput]=useState(""); const [filter,setFilter]=useState(""); const [status,setStatus]=useState("all");
  const [cursors,setCursors]=useState<(string|null)[]>([null]); const [pageIndex,setPageIndex]=useState(0); const [revision,setRevision]=useState(0); const [loading,setLoading]=useState(true); const sequence=useRef(0);
  const cursor=cursors[pageIndex];
  const [orderInput,setOrderInput]=useState(""); const [selectedOrder,setSelectedOrder]=useState<Order|null>(null); const [orderLoading,setOrderLoading]=useState(false); const orderSequence=useRef(0);
  const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState(""); const [lineId, setLineId] = useState(""); const [quantity, setQuantity] = useState("1");
  const [kind, setKind] = useState<"return" | "refund">("return"); const [reason, setReason] = useState("");
  const [passcode, setPasscode] = useState(""); const [confirmedId, setConfirmedId] = useState("");
  const order = selectedOrder?.id === orderId ? selectedOrder : orders.find(o => o.id === orderId); const line = order?.lines.find(l => l.id === lineId);
  useEffect(()=>{
    const request=++sequence.current; setLoading(true);setPage(null);
    const params=new URLSearchParams({limit:"40",status}); if(filter)params.set("search",filter); if(cursor)params.set("before",cursor);
    api.get<{items:ReturnRequest[];nextCursor:string|null}>(`/api/commerce/admin/refund-page?${params}`).then(data=>{if(sequence.current===request){setPage(data);setError("");}}).catch(e=>{if(sequence.current===request)setError(msg(e));}).finally(()=>{if(sequence.current===request)setLoading(false);});
    return ()=>{sequence.current++;};
  },[api,filter,status,cursor,revision]);
  const reload=()=>setRevision(n=>n+1);
  async function findOrder(){
    const id=orderInput.trim(); const request=++orderSequence.current; setSelectedOrder(null); setOrderId("");setLineId("");setError("");setSuccess("");
    if(!id||id.length>200){setError("شماره سفارش معتبر وارد کنید.");return;}
    setOrderLoading(true);
    try {const found=await api.get<Order>(`/api/commerce/orders/${encodeURIComponent(id)}`);if(orderSequence.current!==request)return;if(!["paid","preparing","shipped","delivered"].includes(found.status)){setError("این سفارش در وضعیت قابل مرجوعی نیست.");return;}setSelectedOrder(found);setOrderId(found.id);}
    catch(e){if(orderSequence.current===request)setError(msg(e));} finally {if(orderSequence.current===request)setOrderLoading(false);}
  }
  async function request(e: React.FormEvent) {
    e.preventDefault(); setError(""); setSuccess(""); const count = Number(quantity);
    if (!order || !line || !Number.isInteger(count) || count < 1 || count > line.quantity || !reason.trim()) { setError("سفارش، قلم، تعداد صحیح و دلیل مرجوعی لازم است."); return; }
    setBusy(true); try {
      await api.post(`/api/commerce/orders/${encodeURIComponent(order.id)}/returns`, { lineId, quantity: count, kind, reason: reason.trim() });
      setOrderId(""); setSelectedOrder(null); setOrderInput(""); setLineId(""); setQuantity("1"); setReason(""); reload(); setSuccess("درخواست ثبت شد؛ هنوز هیچ وجهی بازگردانده نشده است.");
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  async function action(row: ReturnRequest, step: "approve" | "reject" | "receive" | "saleable" | "defective" | "settle") {
    setError(""); setSuccess(""); setBusy(true);
    try {
      const base = `/api/commerce/admin/refunds/${encodeURIComponent(row.id)}`;
      const url = step === "approve" || step === "reject" ? base : step === "saleable" || step === "defective" ? `${base}/qc` : `${base}/${step}`;
      const body = step === "approve" || step === "reject" ? { decision: step } : step === "saleable" || step === "defective" ? { result: step } : {};
      const result = await api.post<{ refund: ReturnRequest; manualReview?: boolean; unchanged?: boolean }>(url, body);
      await onChange(); reload(); setConfirmedId("");
      setSuccess(result.manualReview ? "ارائه‌دهنده بازپرداخت خودکار را پشتیبانی نمی‌کند؛ درخواست در صف بررسی دستی است و پرداختی تأیید نشده است." : `وضعیت ثبت‌شده: ${label(result.refund.status)}${result.unchanged ? " (بدون تغییر)" : ""}.`);
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  async function elevate(e: React.FormEvent) { e.preventDefault(); setError(""); setBusy(true); try { await onElevate(passcode); setPasscode(""); setSuccess("نشست مدیر مالی محافظت‌شده فعال شد."); } catch (e) { setError(msg(e)); } finally { setBusy(false); } }
  return <div className="space-y-4">
    <PageHeader title="مدیریت مرجوعی، بازرسی کنترل کیفیت (QC) و بازپرداخت وجه" description="درخواست، دریافت کالا، کنترل کیفیت و بازپرداخت مراحل جداگانه‌اند. تأیید درخواست به معنی پرداخت وجه نیست."/>
    {error && <p role="alert" className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-2.5 text-xs font-medium text-[#B44F40]">{error}</p>}{success && <p role="status" className="rounded-xl border border-[#A6F4C5] bg-[#ECFDF3] px-4 py-2.5 text-xs font-medium text-[#127A4B]">{success}</p>}
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <section className="space-y-3 lg:col-span-8"><h3 className="text-sm font-semibold">درخواست‌های ثبت‌شده</h3>
        <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();setFilter(filterInput.trim());setCursors([null]);setPageIndex(0);reload();}}><label className="min-w-0 flex-1 text-xs">جستجوی شماره درخواست یا سفارش<input className={`${input} mt-1`} maxLength={120} value={filterInput} onChange={e=>setFilterInput(e.target.value)}/></label><label className="text-xs">وضعیت<select className={`${input} mt-1`} value={status} onChange={e=>{setStatus(e.target.value);setCursors([null]);setPageIndex(0);}}><option value="all">همه وضعیت‌ها</option>{["requested","approved","rejected","received","qc_passed","qc_failed","settled","manual_review"].map(v=><option key={v} value={v}>{label(v)}</option>)}</select></label><button className={`${secondary} self-end`}>جستجوی درخواست</button></form>
        {!loading && !page && error && <button type="button" className={secondary} onClick={()=>{setCursors([null]);setPageIndex(0);reload();}}>بازگشت به صفحه اول و تلاش دوباره</button>}
        {loading ? <p role="status" className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-sm">در حال دریافت…</p> : page && !page.items.length ? <p className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-sm">درخواستی یافت نشد.</p> : page?.items.map(row => <article key={row.id} className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="font-mono text-sm font-bold text-[#1813FB]" dir="ltr">{row.id}</span><span className="text-xs text-[#626775]">سفارش <bdi dir="ltr">{row.orderId}</bdi> · {label(row.kind)}</span></div><StatusBadge label={label(row.status)} tone={row.status==="rejected"||row.status==="qc_failed"?"danger":row.status==="settled"||row.status==="qc_passed"?"success":row.status==="manual_review"?"warning":"indigo"}/></div>
        <div className="space-y-1 text-xs"><p className="font-semibold">تعداد درخواست: {n(row.quantity)} · مبلغ ثبت‌شده: {n(row.amount)} (واحد پایهٔ سفارش)</p><p className="rounded-xl bg-[#FAFAFE] p-2.5 text-[#344054]">دلیل مشتری: {row.reason || "—"}</p><p className="text-[#626775]">درخواست‌کننده: {row.requestedBy || "—"} · {new Date(row.createdAt).toLocaleString("fa-IR")}</p>{row.note && <p className="text-[#626775]">یادداشت: {row.note}</p>}</div>
        <div className="flex flex-wrap gap-2 border-t border-[#EFEFF5] pt-3">{row.status === "requested" && privileged && <><button type="button" className={primary} disabled={busy} onClick={() => void action(row,"approve")}>تأیید درخواست</button><button type="button" className={secondary} disabled={busy} onClick={() => void action(row,"reject")}>رد درخواست</button></>}{row.status === "approved" && row.kind !== "refund" && can("orders:edit") && <button type="button" className={secondary} disabled={busy} onClick={() => void action(row,"receive")}>ثبت دریافت کالا</button>}{row.status === "received" && can("orders:edit") && <><button type="button" className={secondary} disabled={busy} onClick={() => void action(row,"saleable")}>کنترل کیفیت: قابل فروش</button><button type="button" className={secondary} disabled={busy} onClick={() => void action(row,"defective")}>کنترل کیفیت: قرنطینه</button></>}</div>
        {privileged && ((row.kind === "refund" && row.status === "approved") || ["qc_passed","qc_failed"].includes(row.status)) && <div className="space-y-2 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] p-3 text-xs"><p>تسویه فقط با فعال‌بودن کنترل مالی و پشتیبانی ارائه‌دهنده انجام می‌شود. درگاه آزمایشی پرداخت واقعی انجام نمی‌دهد.</p><label className="flex gap-2"><input type="checkbox" checked={confirmedId === row.id} onChange={e=>setConfirmedId(e.target.checked ? row.id : "")}/> این درخواست و مبلغ را بررسی کرده‌ام.</label><button type="button" className={primary} disabled={busy || confirmedId !== row.id} onClick={() => void action(row,"settle")}>اقدام برای تسویه</button></div>}
      </article>)}{page && <div className="flex flex-wrap items-center gap-2 text-sm"><button className={secondary} disabled={loading||pageIndex===0} onClick={()=>setPageIndex(n=>n-1)}>صفحه جدیدتر</button><span>صفحه {n(pageIndex+1)}</span><button className={secondary} disabled={loading||!page.nextCursor} onClick={()=>{if(page.nextCursor){setCursors(c=>[...c.slice(0,pageIndex+1),page.nextCursor]);setPageIndex(n=>n+1);}}}>درخواست‌های قدیمی‌تر</button></div>}</section>
      <aside className="space-y-4 lg:col-span-4">
      {can("orders:edit") && <form onSubmit={request} className="space-y-4 rounded-2xl border border-[#E5E7EB] bg-white p-5"><h3 className="text-sm font-semibold">ثبت درخواست مرجوعی جدید</h3><p className="text-xs leading-relaxed text-[#626775]">سفارش‌های اخیر را انتخاب کنید یا با شماره، هر سفارش قدیمی را پیدا کنید. مبلغ بر اساس قیمت ثبت‌شده در سفارش محاسبه می‌شود.</p>
        <div className="flex items-end gap-2"><label className="min-w-0 flex-1 text-xs">شماره سفارش برای مرجوعی<input className={`${input} mt-2`} dir="ltr" maxLength={200} value={orderInput} onChange={e=>{setOrderInput(e.target.value);orderSequence.current++;setOrderLoading(false);setSelectedOrder(null);setOrderId("");setLineId("");}}/></label><button type="button" className={secondary} disabled={busy||orderLoading} onClick={()=>void findOrder()}>دریافت سفارش</button></div>
        {selectedOrder && <p className="text-xs">سفارش انتخاب‌شده: <bdi dir="ltr">{selectedOrder.id}</bdi> · {selectedOrder.customer || "مشتری"}</p>}
        <label className="block text-xs">یا انتخاب از سفارش‌های اخیر<select required className={`${input} mt-2`} value={orderId} onChange={e => {orderSequence.current++;setOrderLoading(false);setSelectedOrder(null);setOrderId(e.target.value); setLineId("");}}><option value="">انتخاب سفارش…</option>{selectedOrder && !orders.some(o=>o.id===selectedOrder.id && ["paid","preparing","shipped","delivered"].includes(o.status)) && <option value={selectedOrder.id}>{selectedOrder.id} · {selectedOrder.customer || "مشتری"}</option>}{orders.filter(o => ["paid","preparing","shipped","delivered"].includes(o.status)).map(o => <option key={o.id} value={o.id}>{o.id} · {o.customer || "مشتری"}</option>)}</select></label>
        <label className="block text-xs">قلم سفارش<select required className={`${input} mt-2`} value={lineId} onChange={e => setLineId(e.target.value)}><option value="">انتخاب قلم…</option>{order?.lines.map(l => <option key={l.id} value={l.id}>{l.name} · {l.sku} · {n(l.quantity)} عدد</option>)}</select></label>
        <label className="block text-xs">نوع درخواست<select className={`${input} mt-2`} value={kind} onChange={e => setKind(e.target.value as "return" | "refund")}><option value="return">مرجوعی کالا</option><option value="refund">بازپرداخت بدون بازگشت کالا</option></select></label>
        <label className="block text-xs">تعداد<input required type="number" min="1" max={line?.quantity} step="1" className={`${input} mt-2`} value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
        <label className="block text-xs">دلیل درخواست<input required maxLength={500} className={`${input} mt-2`} value={reason} onChange={e => setReason(e.target.value)} /></label><button className={primary} disabled={busy}>ثبت درخواست</button>
      </form>}
      {can("finance:approve") && !privileged && <form onSubmit={elevate} className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-5"><h3 className="text-sm font-semibold">دسترسی محافظت‌شدهٔ مالی</h3><p className="text-xs leading-relaxed text-[#626775]">برای تصمیم یا تسویه، رمز جداگانهٔ مدیر مالی باید در سرور تنظیم شده باشد.</p><label className="block text-xs">رمز مدیر محافظت‌شده<input required type="password" autoComplete="current-password" className={`${input} mt-2`} value={passcode} onChange={e=>setPasscode(e.target.value)}/></label><button className={secondary} disabled={busy}>ورود به دسترسی مالی</button></form>}
      </aside>
    </div>
  </div>;
}
