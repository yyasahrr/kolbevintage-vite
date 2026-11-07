"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [rows, setRows] = useState<ReturnRequest[] | null>(null);
  const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [busy, setBusy] = useState(false);
  const [orderId, setOrderId] = useState(""); const [lineId, setLineId] = useState(""); const [quantity, setQuantity] = useState("1");
  const [kind, setKind] = useState<"return" | "refund">("return"); const [reason, setReason] = useState("");
  const [passcode, setPasscode] = useState(""); const [confirmedId, setConfirmedId] = useState("");
  const order = orders.find(o => o.id === orderId); const line = order?.lines.find(l => l.id === lineId);
  const load = useCallback(async () => { try { setRows(await api.get<ReturnRequest[]>("/api/commerce/admin/refunds")); setError(""); } catch (e) { setError(msg(e)); } }, [api]);
  useEffect(() => { void load(); }, [load]);
  async function request(e: React.FormEvent) {
    e.preventDefault(); setError(""); setSuccess(""); const count = Number(quantity);
    if (!order || !line || !Number.isInteger(count) || count < 1 || count > line.quantity || !reason.trim()) { setError("سفارش، قلم، تعداد صحیح و دلیل مرجوعی لازم است."); return; }
    setBusy(true); try {
      await api.post(`/api/commerce/orders/${encodeURIComponent(order.id)}/returns`, { lineId, quantity: count, kind, reason: reason.trim() });
      setOrderId(""); setLineId(""); setQuantity("1"); setReason(""); await load(); setSuccess("درخواست ثبت شد؛ هنوز هیچ وجهی بازگردانده نشده است.");
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  async function action(row: ReturnRequest, step: "approve" | "reject" | "receive" | "saleable" | "defective" | "settle") {
    setError(""); setSuccess(""); setBusy(true);
    try {
      const base = `/api/commerce/admin/refunds/${encodeURIComponent(row.id)}`;
      const url = step === "approve" || step === "reject" ? base : step === "saleable" || step === "defective" ? `${base}/qc` : `${base}/${step}`;
      const body = step === "approve" || step === "reject" ? { decision: step } : step === "saleable" || step === "defective" ? { result: step } : {};
      const result = await api.post<{ refund: ReturnRequest; manualReview?: boolean; unchanged?: boolean }>(url, body);
      await Promise.all([load(), onChange()]); setConfirmedId("");
      setSuccess(result.manualReview ? "ارائه‌دهنده بازپرداخت خودکار را پشتیبانی نمی‌کند؛ درخواست در صف بررسی دستی است و پرداختی تأیید نشده است." : `وضعیت ثبت‌شده: ${label(result.refund.status)}${result.unchanged ? " (بدون تغییر)" : ""}.`);
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  }
  async function elevate(e: React.FormEvent) { e.preventDefault(); setError(""); setBusy(true); try { await onElevate(passcode); setPasscode(""); setSuccess("نشست مدیر مالی محافظت‌شده فعال شد."); } catch (e) { setError(msg(e)); } finally { setBusy(false); } }
  return <div className="space-y-4">
    <PageHeader title="مدیریت مرجوعی، بازرسی کنترل کیفیت (QC) و بازپرداخت وجه" description="درخواست، دریافت کالا، کنترل کیفیت و بازپرداخت مراحل جداگانه‌اند. تأیید درخواست به معنی پرداخت وجه نیست."/>
    {error && <p role="alert" className="rounded-xl border border-[#FECDCA] bg-[#FEF3F2] px-4 py-2.5 text-xs font-medium text-[#B44F40]">{error}</p>}{success && <p role="status" className="rounded-xl border border-[#A6F4C5] bg-[#ECFDF3] px-4 py-2.5 text-xs font-medium text-[#127A4B]">{success}</p>}
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <section className="space-y-3 lg:col-span-8"><h3 className="text-sm font-semibold">درخواست‌های ثبت‌شده · حداکثر ۲۰۰ مورد اخیر</h3>{rows === null ? <p className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-sm">در حال دریافت…</p> : !rows.length ? <p className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-sm">درخواستی ثبت نشده است.</p> : rows.map(row => <article key={row.id} className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="font-mono text-sm font-bold text-[#1813FB]" dir="ltr">{row.id}</span><span className="text-xs text-[#626775]">سفارش <bdi dir="ltr">{row.orderId}</bdi> · {label(row.kind)}</span></div><StatusBadge label={label(row.status)} tone={row.status==="rejected"||row.status==="qc_failed"?"danger":row.status==="settled"||row.status==="qc_passed"?"success":row.status==="manual_review"?"warning":"indigo"}/></div>
        <div className="space-y-1 text-xs"><p className="font-semibold">تعداد درخواست: {n(row.quantity)} · مبلغ ثبت‌شده: {n(row.amount)} (واحد پایهٔ سفارش)</p><p className="rounded-xl bg-[#FAFAFE] p-2.5 text-[#344054]">دلیل مشتری: {row.reason || "—"}</p><p className="text-[#626775]">درخواست‌کننده: {row.requestedBy || "—"} · {new Date(row.createdAt).toLocaleString("fa-IR")}</p>{row.note && <p className="text-[#626775]">یادداشت: {row.note}</p>}</div>
        <div className="flex flex-wrap gap-2 border-t border-[#EFEFF5] pt-3">{row.status === "requested" && privileged && <><button type="button" className={primary} disabled={busy} onClick={() => void action(row,"approve")}>تأیید درخواست</button><button type="button" className={secondary} disabled={busy} onClick={() => void action(row,"reject")}>رد درخواست</button></>}{row.status === "approved" && row.kind !== "refund" && can("orders:edit") && <button type="button" className={secondary} disabled={busy} onClick={() => void action(row,"receive")}>ثبت دریافت کالا</button>}{row.status === "received" && can("orders:edit") && <><button type="button" className={secondary} disabled={busy} onClick={() => void action(row,"saleable")}>کنترل کیفیت: قابل فروش</button><button type="button" className={secondary} disabled={busy} onClick={() => void action(row,"defective")}>کنترل کیفیت: قرنطینه</button></>}</div>
        {privileged && ((row.kind === "refund" && row.status === "approved") || ["qc_passed","qc_failed"].includes(row.status)) && <div className="space-y-2 rounded-xl border border-[#FEDF89] bg-[#FFFAEB] p-3 text-xs"><p>تسویه فقط با فعال‌بودن کنترل مالی و پشتیبانی ارائه‌دهنده انجام می‌شود. درگاه آزمایشی پرداخت واقعی انجام نمی‌دهد.</p><label className="flex gap-2"><input type="checkbox" checked={confirmedId === row.id} onChange={e=>setConfirmedId(e.target.checked ? row.id : "")}/> این درخواست و مبلغ را بررسی کرده‌ام.</label><button type="button" className={primary} disabled={busy || confirmedId !== row.id} onClick={() => void action(row,"settle")}>اقدام برای تسویه</button></div>}
      </article>)}</section>
      <aside className="space-y-4 lg:col-span-4">
      {can("orders:edit") && <form onSubmit={request} className="space-y-4 rounded-2xl border border-[#E5E7EB] bg-white p-5"><h3 className="text-sm font-semibold">ثبت درخواست مرجوعی جدید</h3><p className="text-xs leading-relaxed text-[#626775]">انتخاب از ۲۰۰ سفارش اخیر؛ مبلغ بر اساس قیمت ثبت‌شده در سفارش محاسبه می‌شود.</p>
        <label className="block text-xs">سفارش<select required className={`${input} mt-2`} value={orderId} onChange={e => {setOrderId(e.target.value); setLineId("");}}><option value="">انتخاب سفارش…</option>{orders.filter(o => ["paid","preparing","shipped","delivered"].includes(o.status)).map(o => <option key={o.id} value={o.id}>{o.id} · {o.customer || "مشتری"}</option>)}</select></label>
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
