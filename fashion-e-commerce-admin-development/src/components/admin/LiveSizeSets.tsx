"use client";
import {useCallback,useEffect,useState} from "react";
import {Plus,Ruler,RefreshCw} from "lucide-react";
import {PageHeader} from "./ui/PageHeader";

type MeasureKey="chest"|"waist"|"hip"|"shoulder"|"height";
type Measurements=Record<string,Partial<Record<MeasureKey,number>>>;
export type SizeSet={id:string;name:string;sizes:string[];measurements?:Measurements;measurementBasis?:"body"|"garment"};
type API={get:<T>(path:string)=>Promise<T>;post:<T>(path:string,body:object)=>Promise<T>;patch:<T>(path:string,body:object)=>Promise<T>};
const fields:{key:MeasureKey;label:string}[]=[{key:"chest",label:"دور سینه"},{key:"waist",label:"دور کمر"},{key:"hip",label:"دور باسن"},{key:"shoulder",label:"عرض شانه"},{key:"height",label:"قد"}];
const input="mt-2 w-full rounded-xl border border-[#E5E7EB] bg-white px-3 py-2.5 text-sm focus:border-[#1813FB] focus:outline-2 focus:outline-[#1813FB]";
const btn="rounded-xl border border-[#E5E7EB] px-3 py-2 text-xs text-[#344054] disabled:opacity-50";
function supported(set:SizeSet){
  if(set.measurementBasis && !["body","garment"].includes(set.measurementBasis))return false;
  if(set.measurements===undefined)return true;
  if(!set.measurements||typeof set.measurements!=="object"||Array.isArray(set.measurements))return false;
  return Object.entries(set.measurements).every(([size,row])=>set.sizes.includes(size)&&!!row&&typeof row==="object"&&!Array.isArray(row)&&Object.keys(row).length>0&&Object.entries(row).every(([key,value])=>fields.some(f=>f.key===key)&&typeof value==="number"&&Number.isFinite(value)&&value>0&&value<=500&&Math.abs(value*100-Math.round(value*100))<1e-8));
}
function toNumber(value:string){
  const normal=value.trim().replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-1776)).replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632)).replace(/[٫,]/g,".");
  if(!/^\d+(?:\.\d{1,2})?$/.test(normal))return null;
  const n=Number(normal);return n>0&&n<=500?n:null;
}
function MeasurementsForm({set,busy,onCancel,onSave}:{set:SizeSet;busy:boolean;onCancel:()=>void;onSave:(set:SizeSet,values:Measurements,basis:"body"|"garment"|null)=>Promise<void>}) {
  const [basis,setBasis]=useState<"body"|"garment"|"">(set.measurementBasis??"");
  const [values,setValues]=useState(()=>new Map(set.sizes.map(size=>[size,Object.fromEntries(fields.map(f=>[f.key,String(set.measurements?.[size]?.[f.key]??"")]))])));
  const [error,setError]=useState("");const editable=supported(set);
  async function submit(e:React.FormEvent){
    e.preventDefault();setError("");const next:Measurements=Object.create(null);
    for(const size of set.sizes){const row:Partial<Record<MeasureKey,number>>={};for(const f of fields){const raw=values.get(size)?.[f.key]?.trim()??"";if(!raw)continue;const n=toNumber(raw);if(n===null){setError(`عدد «${f.label}» برای سایز ${size} باید بیشتر از صفر، حداکثر ۵۰۰ و تا دو رقم اعشار باشد.`);return}row[f.key]=n}if(Object.keys(row).length)next[size]=row}
    if(Object.keys(next).length&&!basis){setError("مشخص کنید اعداد اندازهٔ بدن هستند یا اندازهٔ لباس.");return}
    const removed=Object.entries(set.measurements??{}).some(([size,row])=>Object.keys(row).some(key=>next[size]?.[key as MeasureKey]===undefined));
    const changedBasis=Object.keys(next).length>0&&!!set.measurementBasis&&set.measurementBasis!==basis;
    if((removed||changedBasis)&&!window.confirm("بخشی از اندازه‌گیری‌های قبلی حذف می‌شود یا مبنای جدول تغییر می‌کند. ادامه می‌دهید؟"))return;
    await onSave(set,next,basis||null);
  }
  return <form onSubmit={e=>void submit(e)} aria-label="جدول اندازه‌گیری" className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-4"><h2 className="font-bold">جدول اندازه‌گیری «{set.name}»</h2><p className="text-xs leading-6 text-[#626775]">اعداد دقیق را بر حسب سانتی‌متر وارد کنید. خانه خالی یعنی اطلاعات آن اندازه موجود نیست؛ هیچ سایزی خودکار پیشنهاد نمی‌شود.</p>
    {!editable&&<p role="alert" className="rounded-lg bg-amber-50 p-3 text-xs">جدول قبلی ساختار متفاوتی دارد؛ برای جلوگیری از حذف داده امکان ویرایش خودکار آن نیست.</p>}{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    <label className="block text-sm">این اندازه‌ها مربوط به<select className={input} aria-label="مبنای اندازه‌گیری" value={basis} disabled={!editable||busy} onChange={e=>setBasis(e.target.value as typeof basis)}><option value="">انتخاب کنید</option><option value="body">اندازه بدن</option><option value="garment">اندازه لباس</option></select></label>
    <div className="max-h-[360px] overflow-auto rounded-xl border border-[#E5E7EB]"><table className="w-full min-w-[680px] text-right text-xs"><thead className="bg-[#FAFAFE]"><tr><th className="p-2">سایز</th>{fields.map(f=><th key={f.key} className="p-2">{f.label}</th>)}</tr></thead><tbody>{set.sizes.map(size=><tr key={size} className="border-t border-[#E5E7EB]"><th className="p-2">{size}</th>{fields.map(f=><td key={f.key} className="p-1"><input aria-label={`${f.label} ${size}`} inputMode="decimal" className="w-24 rounded-lg border border-[#E5E7EB] p-2" dir="ltr" disabled={!editable||busy} value={values.get(size)?.[f.key]??""} onChange={e=>{const value=e.target.value;setValues(old=>{const next=new Map(old);next.set(size,{...next.get(size),[f.key]:value});return next})}}/></td>)}</tr>)}</tbody></table></div>
    <div className="flex gap-2"><button disabled={busy||!editable} className="rounded-xl bg-[#1813FB] px-4 py-2 text-sm text-white disabled:opacity-50">ذخیره جدول</button><button type="button" disabled={busy} onClick={onCancel} className={btn}>انصراف</button></div></form>;
}
export function LiveSizeSets({api,can}:{api:API;can:(p:string)=>boolean}) {
 const [sets,setSets]=useState<SizeSet[]|null>(null);const [editing,setEditing]=useState<SizeSet|"new"|null>(null);const [measuring,setMeasuring]=useState<SizeSet|null>(null);const [name,setName]=useState("");const [sizes,setSizes]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");
 const load=useCallback(async()=>{try{setSets(await api.get<SizeSet[]>("/api/admin/size-sets"));setError("")}catch(e){setSets(null);setError(e instanceof Error?e.message:"دریافت الگوها ناموفق بود.")}},[api]);
 useEffect(()=>{void load()},[load]);
 function edit(s?:SizeSet){setMeasuring(null);setEditing(s??"new");setName(s?.name??"");setSizes(s?.sizes.join("، ")??"");setError("");setNotice("")}
 function measure(s:SizeSet){setEditing(null);setMeasuring(s);setError("");setNotice("")}
 async function save(e:React.FormEvent){e.preventDefault();if(!editing)return;const labels=sizes.split(/[,،\n]/).map(s=>s.trim()).filter(Boolean);setBusy(true);setError("");setNotice("");try{
  const result=editing==="new"?await api.post<{sizeSet:SizeSet}>("/api/admin/size-sets",{name,sizes:labels}):await api.patch<{sizeSet:SizeSet}>(`/api/admin/size-sets/${encodeURIComponent(editing.id)}`,{name,sizes:labels,expected:editing});
  setSets(old=>editing==="new"?[...(old??[]),result.sizeSet]:(old??[]).map(s=>s.id===result.sizeSet.id?result.sizeSet:s));setEditing(null);setNotice("الگوی سایز ذخیره شد.");
 }catch(e){setError(e instanceof Error?e.message:"ذخیره الگو ناموفق بود.")}finally{setBusy(false)}}
 async function saveMeasurements(set:SizeSet,values:Measurements,basis:"body"|"garment"|null){setBusy(true);setError("");setNotice("");try{const result=await api.patch<{sizeSet:SizeSet}>(`/api/admin/size-sets/${encodeURIComponent(set.id)}/measurements`,{expected:set,measurements:values,basis});setSets(old=>old?.map(s=>s.id===set.id?result.sizeSet:s)??null);setMeasuring(null);setNotice("جدول اندازه‌گیری ذخیره شد.")}catch(e){setError(e instanceof Error?e.message:"ذخیره جدول ناموفق بود.")}finally{setBusy(false)}}
 async function remove(s:SizeSet){if(!window.confirm(`الگوی «${s.name}» حذف شود؟ اگر به دسته‌ای اختصاص دارد یا اندازه‌گیری دارد، حذف مجاز نیست.`))return;setBusy(true);setError("");setNotice("");try{await api.post(`/api/admin/size-sets/${encodeURIComponent(s.id)}/delete`,{expected:s});setSets(old=>old?.filter(item=>item.id!==s.id)??null);setEditing(null);setMeasuring(null);setNotice("الگو حذف شد؛ سایز و موجودی محصولات تغییر نکرد.")}catch(e){setError(e instanceof Error?e.message:"حذف الگو ناموفق بود.")}finally{setBusy(false)}}
 return <div className="space-y-4" dir="rtl"><PageHeader title="الگوهای سایز و اندازه‌گیری" description="الگوهای مشترک برای پیشنهاد سایز هنگام ساخت محصول" secondaryActions={<button onClick={()=>void load()} disabled={busy} className="inline-flex items-center gap-1 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm disabled:opacity-50"><RefreshCw size={15}/>تازه‌سازی</button>} primaryAction={can("catalog:edit")?<button onClick={()=>edit()} disabled={busy||!sets} className="inline-flex items-center gap-1 rounded-xl bg-[#1813FB] px-4 py-2 text-sm text-white disabled:opacity-50"><Plus size={15}/>الگوی جدید</button>:undefined}/>
 <p className="rounded-xl bg-[#F0EEFF] p-3 text-xs leading-6 text-[#344054]">الگو فقط مقادیر پیشنهادی است؛ تغییر آن موجودی یا سایز محصول‌های موجود را تغییر نمی‌دهد. حذف الگوی دارای دسته یا اندازه‌گیری ثبت‌شده مجاز نیست. جدولِ دسته ممکن است برای همه کالاهای آن دسته دقیق نباشد؛ قبل از ثبت بررسی کنید.</p>
 {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error} اگر الگو هم‌زمان تغییر کرده، فهرست را تازه و دوباره انتخاب کنید.</p>}{notice&&<p role="status" className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-700">{notice}</p>}
 <div className="grid gap-5 lg:grid-cols-12"><div className="space-y-3 lg:col-span-8">{sets===null?<p className="rounded-2xl bg-white p-4 text-sm">فهرست الگوها در دسترس نیست.</p>:sets.length===0?<p className="rounded-2xl bg-white p-4 text-sm">هنوز الگویی ثبت نشده است.</p>:sets.map(s=><article key={s.id} className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2.5"><span className="rounded-xl bg-[#F0EEFF] p-2 text-[#1813FB]"><Ruler size={18}/></span><div><h3 className="text-sm font-semibold">{s.name}</h3><p className="mt-1 text-xs text-[#626775]">{s.sizes.length.toLocaleString("fa-IR")} سایز {s.measurements&&Object.keys(s.measurements).length?`· ${Object.keys(s.measurements).length.toLocaleString("fa-IR")} ردیف اندازه‌گیری`:""}</p></div></div>{can("catalog:edit")&&<div className="flex flex-wrap gap-2"><button type="button" className="text-xs text-[#1813FB] underline disabled:opacity-50" disabled={busy} onClick={()=>edit(s)}>ویرایش الگو</button><button type="button" className="text-xs text-[#1813FB] underline disabled:opacity-50" disabled={busy} onClick={()=>measure(s)}>جدول اندازه‌گیری</button><button type="button" aria-label={`حذف ${s.name}`} className="text-xs text-red-700 underline disabled:opacity-50" disabled={busy} onClick={()=>void remove(s)}>حذف</button></div>}</div><div className="flex flex-wrap gap-1.5">{s.sizes.map(z=><span key={z} className="rounded-lg bg-[#F7F7FB] px-2 py-1 text-xs">{z}</span>)}</div></article>)}</div>
 <div className="lg:col-span-4">{editing&&<form onSubmit={save} className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-4" aria-label={editing==="new"?"افزودن الگوی سایز":"ویرایش الگوی سایز"}><h2 className="font-bold">{editing==="new"?"الگوی جدید":"ویرایش الگو"}</h2><label className="block text-sm">نام الگو<input required maxLength={100} className={input} value={name} onChange={e=>setName(e.target.value)}/></label><label className="block text-sm">سایزها با ویرگول جدا شوند<textarea required rows={4} className={input} value={sizes} onChange={e=>setSizes(e.target.value)}/></label><div className="flex gap-2"><button disabled={busy} className="rounded-xl bg-[#1813FB] px-4 py-2 text-sm text-white disabled:opacity-50">ذخیره الگو</button><button disabled={busy} type="button" onClick={()=>setEditing(null)} className={btn}>انصراف</button></div></form>}</div></div>
 {measuring&&<MeasurementsForm key={measuring.id} set={measuring} busy={busy} onCancel={()=>setMeasuring(null)} onSave={saveMeasurements}/>}
 </div>;
}
