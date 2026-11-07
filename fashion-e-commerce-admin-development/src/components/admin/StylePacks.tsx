"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Eye, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { PageHeader } from "./ui/PageHeader";

type Pack = {id:string;label:string;tagline:string;description:string;category:string;tokens:Record<string,string>};
type Result = {active:string;previous:string|null;packs:Pack[]};
type API = {get<T>(path:string):Promise<T>;patch<T>(path:string,body:object):Promise<T>};
const button="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#1813FB] px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50";
const outline="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-medium text-[#344054] disabled:opacity-50";
export function StylePacks({api,can}:{api:API;can:(permission:string)=>boolean}) {
  const [data,setData]=useState<Result|null>(null); const [selected,setSelected]=useState("");
  const [page,setPage]=useState<"home"|"products">("home"); const [busy,setBusy]=useState(false);
  const [error,setError]=useState(""); const [success,setSuccess]=useState("");
  const load=useCallback(async()=>{try{const next=await api.get<Result>("/api/admin/style-packs");setData(next);setSelected(old=>next.packs.some(p=>p.id===old)?old:next.active);setError("");}catch(e){setError(e instanceof Error?e.message:"دریافت سبک‌ها ناموفق بود.");}},[api]);
  useEffect(()=>{void load()},[load]);
  const chosen=data?.packs.find(p=>p.id===selected);
  const active=data?.packs.find(p=>p.id===data.active);
  const previous=data?.packs.find(p=>p.id===data.previous);
  const previewUrl=chosen ? `/?themePreview=${encodeURIComponent(chosen.id)}${page==="products"?"#/products":""}` : "";
  async function publish(id:string){if(!data)return;setBusy(true);setError("");setSuccess("");try{
    const result=await api.patch<{active:string;previous:string|null}>("/api/admin/style-packs",{theme:id,expectedTheme:data.active});
    setData({...data,active:result.active,previous:result.previous});setSelected(result.active);
    setSuccess("ظاهر منتشر شد. بازدیدکنندگان در بارگذاری بعدی یا هنگام به‌روزرسانی خودکار تغییر را می‌بینند.");
  }catch(e){setError(e instanceof Error?e.message:"انتشار ناموفق بود.");}finally{setBusy(false)}}
  return <div className="space-y-5">
    <PageHeader title="گالری پک‌های ظاهری ویترین فروشگاه (Storefront Style Packs)" description="پیش‌نمایش و انتشار ظاهر فروشگاه با امکان بازگشت به سبک قبلی" secondaryActions={previous && can("design:edit") ? <button type="button" className={outline} disabled={busy} onClick={()=>void publish(previous.id)}><RotateCcw className="h-4 w-4"/>بازگشت به {previous.label}</button>:undefined}/>
    <div className="flex items-start gap-2 rounded-2xl border border-[#C1BCF2] bg-[#F0EEFF]/60 p-4 text-xs leading-6 text-[#344054]"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#1813FB]"/><span>این سبک‌ها رنگ، گوشه‌ها، سایه و بخشی از نمای ویترین را تغییر می‌دهند؛ ظاهر پنل مدیریت ثابت می‌ماند. محتوای سفارشی صفحه‌ساز ممکن است استایل مستقل داشته باشد. انتخاب کارت فقط پیش‌نمایش است؛ انتشار جداگانه انجام می‌شود.</span></div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error} <button type="button" className="underline" onClick={()=>void load()}>تازه‌سازی</button></p>}
    {success&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{success}</p>}
    {!data ? <p className="rounded-2xl border border-[#E5E7EB] bg-white p-5 text-sm">{error?"دریافت سبک‌ها ناموفق بود.":"در حال دریافت سبک‌ها…"}</p> : <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
      <div className="grid gap-3 sm:grid-cols-2 xl:col-span-7">{data.packs.map(pack=>{
        const isSelected=pack.id===selected,isActive=pack.id===data.active;
        return <article key={pack.id} className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 ${isSelected?"border-[#1813FB] ring-2 ring-[#1813FB]/10":"border-[#E5E7EB]"}`}>
          <button type="button" aria-pressed={isSelected} aria-label={`پیش‌نمایش ${pack.label}`} onClick={()=>{setSelected(pack.id);setSuccess("");}} className="w-full space-y-3 text-right">
            <span className="flex h-20 items-center justify-between rounded-xl border border-black/10 px-4" style={{background:pack.tokens["--color-bone"]}}>
              <span className="space-y-2 rounded-lg p-2" style={{background:pack.tokens["--color-paper"],boxShadow:pack.tokens["--card-shadow"]}}><i className="block h-2 w-16 rounded" style={{background:pack.tokens["--color-ink"]}}/><i className="block h-1.5 w-11 rounded" style={{background:pack.tokens["--color-ink-45"]}}/></span>
              <span className="flex gap-1"><i className="h-5 w-5 rounded-full border border-black/10" style={{background:pack.tokens["--color-ink"]}}/><i className="h-5 w-5 rounded-full border border-black/10" style={{background:pack.tokens["--color-ember"]}}/></span>
            </span>
            <span className="flex items-center justify-between gap-2"><strong className="text-sm text-[#080707]">{pack.label}</strong>{isActive&&<span className="rounded-full bg-[#ECFDF3] px-2 py-1 text-[10px] text-[#127A4B]">فعال در ویترین</span>}</span>
            <span className="block text-[11px] text-[#626775]" dir="ltr">{pack.tagline}</span><span className="block text-xs leading-6 text-[#626775]">{pack.description}</span>
          </button>
          <div className="mt-auto flex justify-between border-t border-[#EFEFF5] pt-3"><button type="button" className={outline} onClick={()=>setSelected(pack.id)}><Eye className="h-3.5 w-3.5"/>پیش‌نمایش</button>{isActive?<span className="inline-flex items-center gap-1 text-xs text-[#127A4B]"><Check className="h-4 w-4"/>منتشرشده</span>:<button type="button" className={button} disabled={busy||!can("design:edit")} onClick={()=>void publish(pack.id)}><Sparkles className="h-3.5 w-3.5"/>انتشار</button>}</div>
        </article>;
      })}</div>
      {chosen&&<aside className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-4 xl:sticky xl:top-20 xl:col-span-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs text-[#626775]">پیش‌نمایش اختصاصی، بدون انتشار</p><h3 className="font-bold">{chosen.label}</h3></div><a href={previewUrl} target="_blank" rel="noopener noreferrer" className={outline}><ExternalLink className="h-4 w-4"/>باز کردن پیش‌نمایش</a></div><div className="flex items-center gap-2 text-xs"><label htmlFor="theme-preview-page">صفحه:</label><select id="theme-preview-page" className="rounded-lg border border-[#E5E7EB] px-2 py-1" value={page} onChange={e=>setPage(e.target.value as "home"|"products")}><option value="home">صفحه اصلی</option><option value="products">فهرست محصولات</option></select></div><iframe title={`پیش‌نمایش ${chosen.label}`} src={previewUrl} sandbox="allow-scripts allow-same-origin" className="h-[540px] w-full rounded-xl border border-[#E5E7EB] bg-white"/><p className="text-xs leading-6 text-[#626775]">سبک فعال: {active?.label || data.active}. پیش‌نمایش هیچ تغییری در سایت منتشر نمی‌کند؛ دکمه انتشار برای همه بازدیدکنندگان اعمال می‌شود.</p></aside>}
    </div>}
  </div>;
}
