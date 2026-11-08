"use client";
import { useRef, useState } from "react";
import type { Order } from "./LiveModules";

const num=(n:number)=>new Intl.NumberFormat("fa-IR").format(n);
type API={post<T>(path:string,body:object):Promise<T>};
export function PickingControls({order,api,onChange,editable,onBusyChange}:{order:Order;api:API;onChange:()=>Promise<void>;editable:boolean;onBusyChange?:(busy:boolean)=>void}) {
  const [sku,setSku]=useState(""); const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [success,setSuccess]=useState("");
  const pending=useRef<{sku:string;undo:boolean;scanKey:string}|null>(null);
  async function scan(undo:boolean) {
    const value=sku.trim().toUpperCase(); if(!value||busy)return;
    if (pending.current && (pending.current.sku!==value || pending.current.undo!==undo)) {setError("نتیجه عملیات قبلی نامشخص است؛ ابتدا همان عملیات را دوباره امتحان کنید.");return;}
    const body=pending.current ?? {sku:value,undo,scanKey:crypto.randomUUID()}; pending.current=body;
    setBusy(true);onBusyChange?.(true);setError("");setSuccess("");
    try { await api.post(`/api/commerce/orders/${encodeURIComponent(order.id)}/picking`,body); await onChange(); pending.current=null;setSku("");setSuccess(undo?"یک برداشت اصلاح شد.":"یک واحد ثبت شد."); }
    catch(e){const status=typeof e==="object"&&e!==null&&"status" in e ? Number(e.status) : 0; if(status>=400&&status<500&&status!==408&&status!==429) {pending.current=null;setError(e instanceof Error?e.message:"درخواست پذیرفته نشد.");} else setError(`${e instanceof Error?e.message:"ارتباط برقرار نشد."} نتیجه نامشخص است؛ همان عملیات را دوباره امتحان کنید یا صفحه را تازه‌سازی و شمارش را بررسی کنید.`);}
    finally{setBusy(false);onBusyChange?.(false);}
  }
  return <div className="space-y-2 text-sm"><p>پیشرفت برداشت:</p><ul className="space-y-1">{order.lines.map(l=><li key={l.id}>{l.name} · {l.colorName} / {l.sizeLabel} · <span dir="ltr">{l.sku||"بدون SKU"}</span> — {num(l.pickedQuantity ?? 0)} از {num(l.quantity)}</li>)}</ul><p className="text-xs text-slate-600">برای هر واحد یک بار اسکن کنید. کد مشترک واریانت تشخیص نمی‌دهد یک کالا دوبار اسکن شده است. برداشت‌های قدیمی باید دوباره اسکن شوند.</p>{editable&&["unfulfilled","picking"].includes(order.fulfillmentStatus)&&<><form onSubmit={e=>{e.preventDefault();void scan(false)}} className="flex flex-wrap gap-2"><input aria-label={`SKU برداشت ${order.id}`} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1" dir="ltr" placeholder="اسکن یا ورود SKU" value={sku} disabled={busy} onChange={e=>setSku(e.target.value)}/><button disabled={busy||!sku.trim()} className="rounded-lg border border-indigo-600 px-2 py-1 text-indigo-700 disabled:opacity-50">ثبت یک واحد</button><button type="button" disabled={busy||!sku.trim()} className="rounded-lg border border-slate-300 px-2 py-1 disabled:opacity-50" onClick={()=>{if(window.confirm("یک واحد از شمارش این SKU کم شود؟"))void scan(true)}}>اصلاح یک واحد</button></form>{error&&<p role="alert" className="text-red-700">{error}</p>}{success&&<p role="status" className="text-green-700">{success}</p>}</>}</div>;
}
