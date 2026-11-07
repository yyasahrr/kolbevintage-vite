"use client";
import { useCallback, useEffect, useState } from "react";

type Category = {id:string;name:string;active:boolean;order:number};
type Selection = string[] | null;
type API = {get<T>(path:string):Promise<T>;patch<T>(path:string,body:object):Promise<T>};
const button = "rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50";

export function HomeCategoryEditor({api,can,categories,onDirtyChange}:{api:API;can:(permission:string)=>boolean;categories:Category[]|null;onDirtyChange:(dirty:boolean)=>void}) {
  const [saved,setSaved]=useState<Selection>(null), [chosen,setChosen]=useState<Selection>(null), [loaded,setLoaded]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState(""), [success,setSuccess]=useState("");
  const dirty=loaded && JSON.stringify(saved)!==JSON.stringify(chosen);
  useEffect(()=>{onDirtyChange(dirty);return ()=>onDirtyChange(false)},[dirty,onDirtyChange]);
  useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=""};window.addEventListener("beforeunload",warn);return ()=>window.removeEventListener("beforeunload",warn)},[dirty]);
  const load=useCallback(async()=>{setBusy(true);setError("");try{const data=await api.get<{ids:Selection}>("/api/admin/home-categories");setSaved(data.ids);setChosen(data.ids);setLoaded(true)}catch(e){setLoaded(false);setError(e instanceof Error?e.message:"دریافت تنظیمات ناموفق بود.")}finally{setBusy(false)}},[api]);
  useEffect(()=>{void load()},[load]);
  async function save(){setBusy(true);setError("");setSuccess("");try{const result=await api.patch<{ids:Selection}>("/api/admin/home-categories",{ids:chosen,expectedIds:saved});setSaved(result.ids);setChosen(result.ids);setSuccess("انتخاب صفحه اصلی ذخیره شد. برای مشاهده، صفحه فروشگاه را تازه کنید.")}catch(e){setError(e instanceof Error?e.message:"ذخیره ناموفق بود؛ پیش از تلاش مجدد اطلاعات را تازه کنید.")}finally{setBusy(false)}}
  function move(index:number,delta:number){if(!chosen)return;const target=index+delta;if(target<0||target>=chosen.length)return;const copy=[...chosen];[copy[index],copy[target]]=[copy[target],copy[index]];setChosen(copy)}
  return <section aria-label="دسته‌های صفحه اصلی" className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
    <div><h2 className="font-bold">دسته‌های صفحه اصلی</h2><p className="mt-1 text-xs leading-6 text-slate-600">تا چهار دستهٔ فعال را انتخاب و مرتب کنید. تصویر ثبت‌شدهٔ دسته نمایش داده می‌شود؛ در نبود تصویر، اولین محصول آن استفاده می‌شود. غیرفعال‌کردن دسته آن را از صفحه اصلی پنهان می‌کند. تغییرات پس از ذخیره و تازه‌سازی فروشگاه دیده می‌شوند.</p></div>
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{success&&<p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{success}</p>}
    {!loaded?<button type="button" className={button} disabled={busy} onClick={()=>void load()}>دریافت دوباره</button>:<>
      <p className="text-sm">{chosen===null?"انتخاب پیش‌فرض فروشگاه فعال است.":`انتخاب اختصاصی: ${new Intl.NumberFormat("fa-IR").format(chosen.length)} از ۴ دسته`}</p>
      {can("catalog:edit")&&<div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy||chosen!==null} onClick={()=>{setChosen([]);setSuccess("")}}>انتخاب اختصاصی</button><button type="button" className={button} disabled={busy||chosen===null} onClick={()=>{setChosen(null);setSuccess("")}}>بازگشت به پیش‌فرض</button><button type="button" className={button} disabled={busy} onClick={()=>{if(!dirty||window.confirm("تغییرات ذخیره‌نشده کنار گذاشته شوند؟")){setSuccess("");void load()}}}>تازه‌سازی</button></div>}
      {chosen!==null&&<>
        {chosen.length===0?<p className="text-sm text-slate-600">دسته‌ای انتخاب نشده؛ در این حالت کارتی نمایش داده نمی‌شود.</p>:<ol className="space-y-2">{chosen.map((id,index)=>{const category=categories?.find(c=>c.id===id);return <li key={id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm"><span className="flex-1">{category?.name ?? "دسته ناموجود"}{category&&!category.active?" · غیرفعال":!category?" · حذف‌شده":""}</span>{can("catalog:edit")&&<><button type="button" aria-label={`انتقال ${category?.name ?? id} به قبل`} className={button} disabled={busy||index===0} onClick={()=>move(index,-1)}>↑</button><button type="button" aria-label={`انتقال ${category?.name ?? id} به بعد`} className={button} disabled={busy||index===chosen.length-1} onClick={()=>move(index,1)}>↓</button><button type="button" aria-label={`حذف ${category?.name ?? id} از صفحه اصلی`} className={button} disabled={busy} onClick={()=>setChosen(chosen.filter(item=>item!==id))}>حذف</button></>}</li>})}</ol>}
        {can("catalog:edit")&&<fieldset disabled={busy||!categories} className="space-y-2"><legend className="mb-2 text-sm font-semibold">افزودن دسته‌های فعال</legend>{categories?.filter(c=>c.active&&!chosen.includes(c.id)).sort((a,b)=>(a.order??0)-(b.order??0)).map(c=><label key={c.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={false} disabled={chosen.length>=4} onChange={()=>setChosen([...chosen,c.id])}/>{c.name}</label>)}{!categories&&<p className="text-sm text-red-700">فهرست دسته‌ها در دسترس نیست.</p>}</fieldset>}
      </>}
      {can("catalog:edit")&&<div className="flex flex-wrap items-center gap-3"><button type="button" disabled={busy||!dirty||!!(chosen && chosen.some(id=>!categories?.some(c=>c.id===id&&c.active)))} onClick={()=>void save()} className="rounded-lg bg-indigo-700 px-4 py-2 text-sm text-white disabled:opacity-50">ذخیره دسته‌های صفحه اصلی</button>{dirty&&<span className="text-xs text-amber-700">تغییرات هنوز ذخیره نشده‌اند.</span>}</div>}
    </>}
  </section>;
}
