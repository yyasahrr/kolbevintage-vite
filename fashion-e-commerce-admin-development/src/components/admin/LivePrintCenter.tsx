"use client";

import {useEffect,useRef,useState} from "react";
import {createPortal,flushSync} from "react-dom";
import {Printer,RefreshCw} from "lucide-react";
import type {Order} from "./LiveModules";

type DocType="label"|"packing"|"picking"|"invoice";
type InvoiceOrder=Order & {subtotal:number;discountTotal:number;shippingTotal:number;manual:boolean};
type Invoice={order:InvoiceOrder;adjustments:{id:string;amount:number;quantity:number;status:string;at:string}[];issuedAt:string};
type Api={get:<T>(path:string)=>Promise<T>};
const n=(v:number)=>Number.isFinite(v)?v.toLocaleString("fa-IR"):"—";
const date=(value:string)=>{const d=new Date(value);return Number.isNaN(d.getTime())?"—":d.toLocaleString("fa-IR")};
const status:Record<string,string>={paid:"پرداخت ثبت‌شده",settled:"پرداخت ثبت‌شده",unpaid:"پرداخت‌نشده",pending:"در انتظار",requested:"درخواست‌شده",approved:"تأییدشده",rejected:"ردشده",received:"دریافت‌شده",qc_passed:"کنترل کیفیت موفق",qc_failed:"قرنطینه",refunded:"بازپرداخت‌شده",cancelled:"لغوشده",exception:"نیازمند بررسی",preparing:"در حال آماده‌سازی",picking:"در حال برداشت",packed:"بسته‌بندی‌شده",shipped:"ارسال‌شده",delivered:"تحویل‌شده",unfulfilled:"آماده‌سازی‌نشده"};
const label=(value:string|null|undefined)=>value?(status[value]??value):"ثبت نشده";
const eligible=(o:InvoiceOrder)=>o.paymentStatus==="settled" && ["paid","preparing","shipped","delivered"].includes(o.status);
const types:{id:DocType;label:string}[]=[{id:"label",label:"برچسب ارسال"},{id:"packing",label:"برگ بسته‌بندی"},{id:"picking",label:"فهرست برداشت"},{id:"invoice",label:"صورت‌حساب سفارش"}];
function Document({invoice,type}:{invoice:Invoice;type:DocType}){
  const o=invoice.order;const currency="واحد داخلی";
  return <article dir="rtl" className="kv-print-sheet mx-auto w-full rounded-2xl border border-[#D0D5DD] bg-white p-6 text-[#080707] shadow-xs">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-[#080707] pb-3"><div><h2 className="text-base font-bold">{types.find(t=>t.id===type)?.label}</h2><p className="mt-1 text-xs">کلبه وینتیج · سند داخلی سفارش</p></div><div className="text-left text-xs"><p>شماره سفارش: <bdi dir="ltr">{o.id}</bdi></p><p className="mt-1">زمان ثبت: {date(invoice.issuedAt)}</p></div></header>
    <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2"><p>گیرنده: {o.customer||"ثبت نشده"}</p><p>شماره تماس: <bdi dir="ltr">{o.phone||"ثبت نشده"}</bdi></p>{type!=="picking"&&<p className="sm:col-span-2">نشانی: {o.address||o.city||"نشانی ثبت نشده"}</p>}<p>پرداخت: {o.paymentKind==="simulated"?"آزمایشی — بدون پرداخت بانکی":label(o.paymentStatus)}</p>{o.paymentKind==="simulated"&&<p className="sm:col-span-2 font-bold">سند آزمایشی است؛ پرداخت واقعی انجام نشده است و برای ارسال واقعی معتبر نیست.</p>}<p>وضعیت سفارش: {label(o.status)} · {label(o.fulfillmentStatus)}</p>{o.manual&&<p className="sm:col-span-2">پرداخت خارجی توسط اپراتور ثبت شده است؛ این سند تأیید بانکی نیست.</p>}</div>
    {type==="label"?<div className="mt-6 space-y-3 rounded-xl border-2 border-[#080707] p-4 text-sm"><p>شرکت حمل: {o.carrier||"ثبت نشده"}</p><p>کد رهگیری: <bdi dir="ltr">{o.tracking||"ثبت نشده"}</bdi></p><p className="text-xs leading-6">نشانی فرستنده و کد پستی در اطلاعات سفارش موجود نیست؛ پیش از ارسال آن‌ها را جداگانه بررسی کنید. بارکد در این نسخه تولید نمی‌شود.</p></div>:<div className="mt-5 overflow-x-auto"><table className="w-full border-collapse text-right text-xs"><thead><tr className="border-b border-[#080707]"><th className="py-2">کالا</th><th>رنگ / سایز</th><th>کد کالا</th><th>تعداد</th>{type==="invoice"?<th>مبلغ قلم</th>:<th>کنترل</th>}</tr></thead><tbody>{o.lines.map(l=><tr key={l.id} className="border-b border-[#E5E7EB]"><td className="py-2">{l.name}</td><td>{l.colorName||"—"} / {l.sizeLabel||"—"}</td><td><bdi dir="ltr">{l.sku||"—"}</bdi></td><td>{n(l.quantity)}</td><td>{type==="invoice"?<span>{n(l.lineTotal)} {currency}</span>:"☐"}</td></tr>)}</tbody></table></div>}
    {type==="invoice"&&<><div className="mr-auto mt-4 max-w-sm space-y-1.5 text-xs"><p>جمع کالا: {n(o.subtotal)} {currency}</p><p>تخفیف ثبت‌شده: {n(o.discountTotal)} {currency}</p><p>هزینه ارسال: {n(o.shippingTotal)} {currency}</p><p className="border-t border-[#080707] pt-2 text-sm font-bold">جمع سفارش اولیه: {n(o.total)} {currency}</p></div><div className="mt-5 border-t border-[#E5E7EB] pt-3 text-xs"><h3 className="font-semibold">درخواست‌های مرجوعی و بازپرداخت مرتبط</h3>{invoice.adjustments.length===0?<p className="mt-2">موردی ثبت نشده است.</p>:<ul className="mt-2 space-y-1">{invoice.adjustments.map(a=><li key={a.id}><bdi dir="ltr">{a.id}</bdi> · {label(a.status)} · {n(a.quantity)} عدد · {n(a.amount)} {currency} · {date(a.at)}</li>)}</ul>}<p className="mt-2 leading-6">مبالغ با واحد داخلی ثبت‌شده نمایش داده شده‌اند (کد ارز: {o.currency||"ثبت نشده"})؛ تبدیل واحد به مبلغ قابل تسویه تأیید نشده است. مجموع سفارش اولیه با درخواست‌های مرجوعی تغییر داده نشده است. این برگه فاکتور رسمی یا تأیید تسویه بانکی نیست.</p></div></>}
  </article>;
}

export function LivePrintCenter({orders,api}:{orders:Order[]|null;api:Api}) {
  const [selected,setSelected]=useState("");const [type,setType]=useState<DocType>("label");
  const mounted=useRef(true);
  const [invoice,setInvoice]=useState<Invoice|null>(null);const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [printing,setPrinting]=useState(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[]);
  useEffect(()=>{setInvoice(null);setError("")},[selected,type]);
  useEffect(()=>{const end=()=>{document.body.classList.remove("kv-printing");setPrinting(false)};window.addEventListener("afterprint",end);return()=>{window.removeEventListener("afterprint",end);document.body.classList.remove("kv-printing")}},[]);
  async function load(print:boolean){
    if(!selected||busy)return;setBusy(true);setError("");setInvoice(null);
    try {
      const data=await api.get<Invoice>(`/api/commerce/orders/${encodeURIComponent(selected)}/invoice`);
      if(!mounted.current)return;
      if(!data?.order||data.order.id!==selected||!Array.isArray(data.order.lines)||!Array.isArray(data.adjustments))throw new Error("اطلاعات سند ناقص است.");
      if(!eligible(data.order))throw new Error("پرداخت سفارش ثبت نشده یا سفارش لغو شده / نیازمند بررسی است؛ سند آماده ارسال صادر نمی‌شود.");
      if(print){flushSync(()=>{setInvoice(data);setPrinting(true)});document.body.classList.add("kv-printing");window.print()}else setInvoice(data);
    }catch(e){document.body.classList.remove("kv-printing");if(mounted.current){setInvoice(null);setPrinting(false);setError(e instanceof Error?e.message:"دریافت سفارش ناموفق بود.")}}finally{if(mounted.current)setBusy(false)}
  }
  return <section dir="rtl" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-bold">مرکز چاپ اسناد عملیات</h1><p className="mt-1 text-sm text-[#626775]">برچسب، برگ بسته‌بندی، برداشت و صورت‌حساب از داده ثبت‌شده سفارش</p></div><button onClick={()=>void load(true)} disabled={!selected||busy||!invoice} className="inline-flex items-center gap-2 rounded-xl bg-[#1813FB] px-4 py-2.5 text-sm text-white disabled:opacity-50"><Printer size={16}/>{busy?"در حال بررسی…":"بررسی مجدد و چاپ"}</button></div>
    <div className="rounded-xl bg-indigo-50 p-3 text-xs leading-6 text-indigo-900">سند را پیش از استفاده کنترل کنید. چاپگر، اندازه کاغذ و برچسب فیزیکی هنوز کالیبره یا آزموده نشده‌اند. ثبت پرداخت دستی، تأیید بانکی نیست.</div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid gap-4 lg:grid-cols-2"><div className="space-y-4 rounded-2xl border border-[#E5E7EB] bg-white p-4"><div><h2 className="text-sm font-semibold">۱. نوع سند</h2><div className="mt-3 grid grid-cols-2 gap-2">{types.map(t=><button type="button" key={t.id} onClick={()=>{setInvoice(null);setType(t.id)}} disabled={busy} aria-pressed={type===t.id} className={`rounded-xl border px-3 py-2.5 text-right text-xs ${type===t.id?"border-[#1813FB] bg-[#F0EEFF] text-[#1813FB]":"border-[#E5E7EB]"}`}>{t.label}</button>)}</div></div><label className="block text-sm">۲. سفارش از حداکثر ۲۰۰ سفارش اخیر<select aria-label="انتخاب سفارش برای چاپ" className="mt-2 w-full rounded-xl border border-[#E5E7EB] px-3 py-2.5 text-sm" value={selected} disabled={busy} onChange={e=>{setInvoice(null);setSelected(e.target.value)}}><option value="">انتخاب سفارش</option>{orders?.map(o=><option key={o.id} value={o.id}>{o.id} · {o.customer||"مشتری ثبت نشده"} · {o.paymentKind==="simulated"?"آزمایشی":label(o.paymentStatus)}</option>)}</select></label>{orders===null?<p className="text-xs">اطلاعات سفارش در دسترس نیست.</p>:orders.length===0?<p className="text-xs">سفارشی ثبت نشده است.</p>:null}<button onClick={()=>void load(false)} disabled={!selected||busy} className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] px-4 py-2.5 text-sm disabled:opacity-50"><RefreshCw size={15}/>دریافت پیش‌نمایش</button><p className="text-xs leading-6 text-[#626775]">تنها سفارش با پرداخت ثبت‌شده و بدون وضعیت لغو یا مغایرت نمایش داده می‌شود. پیش از چاپ با دکمه بالا، اطلاعات دوباره از سرور دریافت می‌شود؛ وضعیت می‌تواند پس از دریافت تغییر کند.</p></div><div><h2 className="mb-3 text-sm font-semibold">پیش‌نمایش سند</h2>{invoice?<Document invoice={invoice} type={type}/>:<p className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-sm text-[#626775]">سفارش و نوع سند را انتخاب و پیش‌نمایش را دریافت کنید.</p>}</div></div>
    {printing&&invoice&&typeof document!=="undefined"&&createPortal(<div id="kv-print-document"><Document invoice={invoice} type={type}/></div>,document.body)}
  </section>;
}
