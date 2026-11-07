"use client";
import { useEffect, useRef, useState } from "react";
import { toSVG } from "bwip-js/browser";
import QRCode from "qrcode";
import type { Stock } from "./LiveModules";

const field="w-full rounded-lg border border-slate-300 px-2 py-1";
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c] as string));
const num=(n:number)=>new Intl.NumberFormat("fa-IR").format(n);

/** A print job uses an inventory snapshot; no inventory writes are made. */
export function StockLabel({items,initialSelected=[],onClose}:{items:Stock[];initialSelected?:string[];onClose:()=>void}) {
  const dialogRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{const previous=document.activeElement as HTMLElement | null; const dialog=dialogRef.current; dialog?.querySelector<HTMLElement>("input,select,button")?.focus();function key(e:KeyboardEvent){if(e.key==="Escape"){e.preventDefault();onClose();return;}if(e.key!=="Tab"||!dialog)return;const controls=[...dialog.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled]),select:not([disabled])")];if(!controls.length)return;const first=controls[0],last=controls[controls.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}document.addEventListener("keydown",key);return()=>{document.removeEventListener("keydown",key);previous?.focus()};},[onClose]);
  const [selected,setSelected]=useState<Set<string>>(()=>new Set(initialSelected));
  const [counts,setCounts]=useState<Record<string,string>>(()=>Object.fromEntries(items.map(item=>[item.id,String(Math.max(0,item.onHand))])));
  const [search,setSearch]=useState("");
  const [paper,setPaper]=useState<"a4"|"roll">("a4");
  const [width,setWidth]=useState("60"),[height,setHeight]=useState("40"),[columns,setColumns]=useState("3"),[gap,setGap]=useState("3"),[margin,setMargin]=useState("5");
  const [name,setName]=useState(true),[variant,setVariant]=useState(true),[price,setPrice]=useState(false);
  const [error,setError]=useState(""),[busy,setBusy]=useState(false);
  const matching=items.filter(item=>`${item.name} ${item.sku} ${item.colorName} ${item.sizeLabel}`.toLowerCase().includes(search.trim().toLowerCase()));
  const chosen=items.filter(item=>selected.has(item.id));
  const total=chosen.reduce((sum,item)=>sum+(Number.isInteger(Number(counts[item.id]))&&Number(counts[item.id])>=0?Number(counts[item.id]):0),0);
  function toggle(id:string,checked:boolean){setSelected(old=>{const next=new Set(old);if(checked)next.add(id);else next.delete(id);return next;});}
  function selectMatching(checked:boolean){setSelected(old=>{const next=new Set(old);for(const item of matching){if(checked)next.add(item.id);else next.delete(item.id);}return next;});}
  async function print() {
    const w=Number(width),h=Number(height),cols=paper==="roll"?1:Number(columns),g=Number(gap),m=paper==="roll"?0:Number(margin);
    if(!chosen.length){setError("ابتدا حداقل یک واریانت را انتخاب کنید.");return;}
    if(chosen.some(item=>counts[item.id].trim()===""||!Number.isInteger(Number(counts[item.id]))||Number(counts[item.id])<0||Number(counts[item.id])>500)||total<1||total>500){setError("تعداد هر واریانت باید بین صفر تا ۵۰۰ و مجموع لیبل‌ها بین ۱ تا ۵۰۰ باشد.");return;}
    if(!Number.isFinite(w)||w<35||w>200||!Number.isFinite(h)||h<25||h>290||!Number.isInteger(cols)||cols<1||cols>6||!Number.isFinite(g)||g<0||g>20||!Number.isFinite(m)||m<0||m>30|| (paper==="a4"&&(cols*w+(cols-1)*g+2*m>210||h+2*m>297))){setError("ابعاد را بررسی کنید؛ لیبل‌ها باید در صفحه جا شوند.");return;}
    // Open synchronously inside the click, before asynchronous QR generation,
    // so popup blockers do not treat the print preview as unsolicited.
    const win=window.open("","_blank");if(!win){setError("باز شدن پنجره چاپ در مرورگر مسدود شده است.");return;}
    win.document.write('<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>آماده‌سازی لیبل‌ها</title><body>در حال ساخت لیبل‌ها…</body></html>');
    setBusy(true);setError("");
    try {
      const active=chosen.filter(item=>Number(counts[item.id])>0);
      const labels=await Promise.all(active.map(async item=>{
        if(!item.sku)throw new Error(`SKU برای «${item.name}» ثبت نشده است.`);
        const barcode=toSVG({bcid:"code128",text:item.sku,scale:2,height:10,paddingwidth:10,includetext:false});
        const qr=await QRCode.toDataURL(item.sku,{errorCorrectionLevel:"M",margin:4,width:180});
        const content=`<div class="label" dir="rtl">${name?`<div class="name">${escape(item.name)}</div>`:""}${variant?`<div>${escape(item.colorName)} · ${escape(item.sizeLabel)}</div>`:""}${price?`<div>قیمت: ${num(item.price)} واحد پایه</div>`:""}<div class="codes"><div class="linear">${barcode}<div class="sku" dir="ltr">${escape(item.sku)}</div></div><img src="${qr}" alt="QR"></div></div>`;
        return content.repeat(Number(counts[item.id]));
      }));
      if(win.closed){setError("پنجره پیش‌نمایش بسته شد؛ دوباره تلاش کنید.");return;}
      win.document.open();win.document.write(`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>لیبل‌های انبار</title><style>@page{size:${paper==="a4"?"A4":`${w}mm ${h}mm`};margin:${m}mm}*{box-sizing:border-box}body{margin:0;font-family:Tahoma,Arial,sans-serif}.sheet{display:grid;grid-template-columns:repeat(${cols},${w}mm);gap:${paper==="roll"?0:g}mm;direction:ltr}.label{width:${w}mm;height:${h}mm;border:0.2mm solid #ddd;padding:1.5mm;display:flex;flex-direction:column;justify-content:center;gap:1mm;break-inside:avoid;overflow:hidden;text-align:center;font-size:8pt;line-height:1.15}.name{font-weight:bold}.codes{display:flex;direction:ltr;align-items:center;justify-content:center;gap:1mm;min-height:13mm}.linear{min-width:0;flex:1}.linear svg{display:block;width:100%;height:9mm}.sku{font:7pt monospace;overflow-wrap:anywhere}.codes img{width:13mm;height:13mm}@media print{.label{border-color:transparent;${paper==="roll"?"break-after:page;":""}}.hint{display:none}}.hint{padding:12px;background:#fff4cc;font-size:13px}</style></head><body><div class="hint">در تنظیمات چاپ، مقیاس ۱۰۰٪، اندازه کاغذ و حاشیه‌ها را بررسی کنید. پیش از استفاده، روی کاغذ و با اسکنر واقعی آزمایش کنید. <button onclick="window.print()">چاپ</button></div><main class="sheet">${labels.join("")}</main></body></html>`);win.document.close();
    } catch(e) {win.close();setError(e instanceof Error?`ساخت لیبل ناموفق بود: ${e.message}`:"ساخت لیبل ناموفق بود.");} finally {setBusy(false);}
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="چاپ لیبل انبار"><div ref={dialogRef} className="max-h-[90vh] w-full max-w-3xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5"><h2 className="font-bold">چاپ لیبل انبار · انتخاب تکی یا دسته‌جمعی</h2><p className="text-sm">واریانت‌ها را انتخاب و تعداد هر کدام را ویرایش کنید. تعداد اولیه از موجودی فیزیکی است؛ چاپ موجودی را تغییر نمی‌دهد.</p>
    <label className="block text-sm">جستجوی محصول، رنگ، سایز یا SKU<input className={`${field} mt-1`} type="search" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={matching.length>0&&matching.every(item=>selected.has(item.id))} disabled={!matching.length} onChange={e=>selectMatching(e.target.checked)}/> انتخاب همه نتایج جستجو ({num(matching.length)} واریانت)</label><span aria-live="polite">انتخاب‌شده: {num(chosen.length)} واریانت · {num(total)} لیبل</span></div>
    <div className="max-h-64 overflow-auto rounded-xl border border-slate-200">{matching.length===0?<p className="p-3 text-sm">واریانتی پیدا نشد.</p>:<ul className="divide-y divide-slate-100">{matching.map(item=><li key={item.id} className="flex flex-wrap items-center gap-2 p-3 text-sm"><label className="flex min-w-0 flex-1 items-start gap-2"><input type="checkbox" checked={selected.has(item.id)} onChange={e=>toggle(item.id,e.target.checked)}/><span>{item.name} · {item.colorName} / {item.sizeLabel}<span className="block text-xs" dir="ltr">{item.sku}</span><span className="text-xs text-slate-600">موجودی فیزیکی: {num(item.onHand)}</span></span></label><label className="w-24 text-xs">تعداد لیبل<input aria-label={`تعداد لیبل ${item.sku}`} className={field} type="number" min="0" max="500" step="1" disabled={!selected.has(item.id)} value={counts[item.id]} onChange={e=>setCounts(old=>({...old,[item.id]:e.target.value}))}/></label></li>)}</ul>}</div>
    <div className="grid grid-cols-2 gap-3 text-sm"><label>نوع کاغذ<select className={field} value={paper} onChange={e=>setPaper(e.target.value as "a4"|"roll")}><option value="a4">A4</option><option value="roll">رول</option></select></label>{([["عرض لیبل (میلی‌متر)",width,setWidth],["ارتفاع لیبل (میلی‌متر)",height,setHeight]] as const).map(([title,value,set])=><label key={title}>{title}<input className={field} type="number" value={value} onChange={e=>set(e.target.value)}/></label>)}{paper==="a4"&&<>{([["تعداد ستون",columns,setColumns],["فاصله لیبل‌ها (میلی‌متر)",gap,setGap],["حاشیه صفحه (میلی‌متر)",margin,setMargin]] as const).map(([title,value,set])=><label key={title}>{title}<input className={field} type="number" value={value} onChange={e=>set(e.target.value)}/></label>)}</>}</div>
    <fieldset className="flex flex-wrap gap-3 text-sm"><legend>فیلدهای قابل نمایش</legend><label><input type="checkbox" checked={name} onChange={e=>setName(e.target.checked)}/> نام محصول</label><label><input type="checkbox" checked={variant} onChange={e=>setVariant(e.target.checked)}/> رنگ و سایز</label><label><input type="checkbox" checked={price} onChange={e=>setPrice(e.target.checked)}/> قیمت</label></fieldset><p className="text-xs text-slate-600">بارکد خطی Code 128 و QR هر دو حاوی SKU واریانت هستند. هر نوبت حداکثر ۵۰۰ لیبل؛ خوانایی را با دستگاه واقعی امتحان کنید.</p>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex gap-2"><button type="button" onClick={()=>void print()} disabled={busy||!chosen.length} className="rounded-xl bg-indigo-700 px-4 py-2 text-sm text-white disabled:opacity-50">پیش‌نمایش و چاپ</button><button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">بستن</button></div></div></div>;
}
