"use client";
import { useEffect, useState } from "react";

import type { LibraryColor } from "./LiveColors";
type Color = {id:string;name:string;hex:string};
type Size = {id:string;label:string};
type API = {get<T>(path:string):Promise<T>;post<T>(path:string,body:object):Promise<T>};
type Props = {api:API; productId:string; initialColors:Color[]; initialSizes:Size[]; onColors:(colors:Color[])=>void; onChange:()=>Promise<void>; onBusy:(busy:boolean)=>void};
const input="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-indigo-500";
const button="rounded-xl border border-slate-300 px-3 py-2 text-xs disabled:opacity-50";

/** Option edits preserve IDs. Inventory is only changed via the inventory workflow. */
export function ProductOptions({api,productId,initialColors,initialSizes,onColors,onChange,onBusy}:Props) {
  const [library,setLibrary]=useState<LibraryColor[]|null>(null);const [libraryError,setLibraryError]=useState(false);
  useEffect(()=>{let mounted=true;api.get<LibraryColor[]>("/api/admin/color-library").then(rows=>{if(mounted)setLibrary(rows.filter(c=>c.active))}).catch(()=>{if(mounted)setLibraryError(true)});return()=>{mounted=false}},[api]);
  const [colors,setColors]=useState(initialColors);
  const [sizes,setSizes]=useState(initialSizes);
  const [colorDrafts,setColorDrafts]=useState<Record<string,{name:string;hex:string}>>({});
  const [sizeDrafts,setSizeDrafts]=useState<Record<string,string>>({});
  const [name,setName]=useState(""); const [hex,setHex]=useState("#16130f"); const [label,setLabel]=useState("");
  const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [success,setSuccess]=useState("");
  async function change(body:{action:string;id?:string;[key:string]:unknown}) {
    setBusy(true);onBusy(true);setError("");setSuccess("");
    try {
      const result=await api.post<{colors:Color[];sizes:Size[]}>(`/api/admin/products/${encodeURIComponent(productId)}/options`,body);
      setColors(result.colors);setSizes(result.sizes);onColors(result.colors);
      if(body.action==="update_color" && body.id) setColorDrafts(previous=>{const next={...previous};delete next[body.id!];return next;});
      if(body.action==="update_size" && body.id) setSizeDrafts(previous=>{const next={...previous};delete next[body.id!];return next;});
      if(body.action==="add_color") setName("");
      if(body.action==="add_size") setLabel("");
      await onChange();setSuccess("تنوع ذخیره شد. موجودی ترکیب‌های جدید صفر است؛ از انبار دریافت ثبت کنید.");
    } catch(e) {setError(e instanceof Error ? e.message : "ثبت تنوع ناموفق بود.");}
    finally {setBusy(false);onBusy(false);}
  }
  return <section className="space-y-4 rounded-xl border border-slate-200 p-3" aria-label="رنگ و سایز محصول">
    <div><h3 className="font-bold">رنگ و سایز محصول</h3><p className="mt-1 text-xs leading-6 text-slate-500">افزودن رنگ یا سایز برای همه ترکیب‌های جدید، تنوع با موجودی صفر می‌سازد. برای حفظ هویت کالا، ویرایش نام یا کد رنگ فقط تا پیش از ثبت موجودی، درخواست انبار، رزرو یا سفارش مجاز است. شناسه و سوابق تغییر نمی‌کنند؛ حذف تنوع فعلاً امکان‌پذیر نیست.</p></div>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
    {success && <p role="status" className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">{success}</p>}
    {!colors.length || !sizes.length ? <p className="text-sm text-red-700">اطلاعات تنوع دریافت نشده است؛ صفحه را تازه‌سازی کنید.</p> : <>
      <div className="space-y-2"><h4 className="text-sm font-semibold">رنگ‌ها</h4><label className="block text-xs">رنگ پیشنهادی برای افزودن<select aria-label="رنگ پیشنهادی برای تنوع" className={`${input} mt-1`} value="" disabled={busy||!library?.length} onChange={e=>{const c=library?.find(c=>c.id===e.target.value);if(c){setName(c.name);setHex(c.hex)}}}><option value="">انتخاب اختیاری…</option>{library?.map(c=><option key={c.id} value={c.id}>{c.name} · {c.hex}</option>)}</select></label>{libraryError&&<p className="text-xs text-amber-700">کتابخانه دریافت نشد؛ رنگ را دستی وارد کنید.</p>}{colors.map(color=>{
        const value=colorDrafts[color.id] ?? {name:color.name,hex:color.hex};
        return <div key={color.id} className="grid grid-cols-[1fr_3rem_auto] items-center gap-2"><input aria-label={`نام رنگ ${color.name}`} className={input} maxLength={80} disabled={busy} value={value.name} onChange={e=>setColorDrafts({...colorDrafts,[color.id]:{...value,name:e.target.value}})}/><input aria-label={`کد رنگ ${color.name}`} type="color" className="h-10 w-12 rounded border border-slate-300" disabled={busy} value={value.hex} onChange={e=>setColorDrafts({...colorDrafts,[color.id]:{...value,hex:e.target.value}})}/><button type="button" className={button} disabled={busy||!value.name.trim()||(value.name===color.name&&value.hex===color.hex)} onClick={()=>void change({action:"update_color",id:color.id,...value,expected:{name:color.name,hex:color.hex}})}>ذخیره رنگ</button></div>;
      })}<div className="grid grid-cols-[1fr_3rem_auto] items-center gap-2"><input aria-label="نام رنگ جدید" placeholder="نام رنگ جدید" className={input} maxLength={80} disabled={busy} value={name} onChange={e=>setName(e.target.value)}/><input aria-label="کد رنگ جدید" type="color" className="h-10 w-12 rounded border border-slate-300" disabled={busy} value={hex} onChange={e=>setHex(e.target.value)}/><button type="button" className={button} disabled={busy||!name.trim()} onClick={()=>void change({action:"add_color",name,hex})}>افزودن رنگ</button></div></div>
      <div className="space-y-2"><h4 className="text-sm font-semibold">سایزها</h4>{sizes.map(size=>{
        const value=sizeDrafts[size.id] ?? size.label;
        return <div key={size.id} className="flex items-center gap-2"><input aria-label={`سایز ${size.label}`} className={input} maxLength={40} disabled={busy} value={value} onChange={e=>setSizeDrafts({...sizeDrafts,[size.id]:e.target.value})}/><button type="button" className={`${button} shrink-0`} disabled={busy||!value.trim()||value===size.label} onClick={()=>void change({action:"update_size",id:size.id,label:value,expected:{label:size.label}})}>ذخیره سایز</button></div>;
      })}<div className="flex items-center gap-2"><input aria-label="سایز جدید" placeholder="سایز جدید" className={input} maxLength={40} disabled={busy} value={label} onChange={e=>setLabel(e.target.value)}/><button type="button" className={`${button} shrink-0`} disabled={busy||!label.trim()} onClick={()=>void change({action:"add_size",label})}>افزودن سایز</button></div></div>
    </>}
  </section>;
}
