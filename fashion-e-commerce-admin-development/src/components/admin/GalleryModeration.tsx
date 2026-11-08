"use client";
import {useEffect,useRef,useState} from "react";
import {Check,ShieldCheck,X} from "lucide-react";
import {PageHeader} from "./ui/PageHeader";
import {StatusBadge} from "./ui/StatusBadge";

type Gallery={id:string;handle:string;imageUrl:string;caption:string;status:"pending"|"approved"|"rejected";consentVerified:boolean;submittedAt:string;version:number};
type Api={get<T>(path:string):Promise<T>;patch<T>(path:string,body:object):Promise<T>};
type Page={items:Gallery[];nextCursor:string|null};
export function GalleryModule({api,can}:{api:Api;can:(permission:string)=>boolean}){
  const [filter,setFilter]=useState("pending"),[input,setInput]=useState(""),[search,setSearch]=useState("");
  const [cursors,setCursors]=useState<(string|null)[]>([null]),[index,setIndex]=useState(0),[revision,setRevision]=useState(0);
  const [page,setPage]=useState<Page|null>(null),[loading,setLoading]=useState(true),[pageError,setPageError]=useState(""),[error,setError]=useState(""),[success,setSuccess]=useState(""),[busy,setBusy]=useState(false);
  const seq=useRef(0),lock=useRef(false);const cursor=cursors[index];
  useEffect(()=>{
    const request=++seq.current;setPage(null);setPageError("");setLoading(true);
    const params=new URLSearchParams({status:filter,limit:"12"});if(cursor)params.set("before",cursor);if(search)params.set("search",search);
    api.get<Page>(`/api/admin/gallery/page?${params}`).then(v=>{if(request===seq.current)setPage(v)}).catch(e=>{if(request===seq.current)setPageError(e instanceof Error?e.message:"دریافت تصاویر ناموفق بود.")}).finally(()=>{if(request===seq.current)setLoading(false)});
    return()=>{seq.current++};
  },[api,filter,search,cursor,revision]);
  function refresh(){setCursors([null]);setIndex(0);setRevision(v=>v+1)}
  async function change(item:Gallery,status:Gallery["status"]){
    if(lock.current)return;lock.current=true;setBusy(true);setError("");setSuccess("");
    try{await api.patch(`/api/admin/gallery/${encodeURIComponent(item.id)}`,{status,expectedVersion:item.version});setSuccess("وضعیت تصویر ثبت شد؛ فهرست دوباره دریافت می‌شود.")}
    catch(e){setError(`${e instanceof Error?e.message:"خطا در ثبت بازبینی."} نتیجه را در فهرست تازه بررسی کنید؛ در خطای شبکه ممکن است ثبت انجام شده باشد.`)}
    finally{refresh();lock.current=false;setBusy(false)}
  }
  return <div className="space-y-4"><PageHeader title="صف بازبینی گالری استایل مشتریان (Customer Gallery Moderation)" description="بازبینی تصاویر و رضایت انتشار در کل گالری"/>
    <p className="text-sm leading-6 text-slate-600">هر صفحه حداکثر ۱۲ تصویر دارد. تغییر وضعیت در سرور و با نسخهٔ همان تصویر کنترل می‌شود؛ نشانی تصویر ممکن است پیش از بازبینی نزد ارائه‌دهندهٔ فایل در دسترس باشد.</p>
    <div className="flex flex-wrap gap-2">{[{v:"pending",l:"در انتظار"},{v:"approved",l:"منتشرشده"},{v:"rejected",l:"ردشده"},{v:"all",l:"همه"}].map(t=><button key={t.v} type="button" disabled={busy} aria-pressed={filter===t.v} onClick={()=>{setFilter(t.v);refresh()}} className={`rounded-xl border px-3 py-2 text-sm disabled:opacity-50 ${filter===t.v?"border-indigo-700 bg-indigo-50 text-indigo-800":"border-slate-300 bg-white"}`}>{t.l}</button>)}</div>
    <form onSubmit={e=>{e.preventDefault();setSearch(input.trim());refresh()}} className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-sm">جستجوی گالری<input type="search" aria-label="جستجوی گالری" maxLength={120} value={input} onChange={e=>setInput(e.target.value)} className="mt-1 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2" placeholder="شناسه، نام نمایشی یا متن"/></label><button className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm">جستجو</button></form>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{success&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{success}</p>}
    {loading&&<p role="status">در حال دریافت تصاویر…</p>}{pageError&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{pageError} <button type="button" className="underline" onClick={refresh}>بازگشت به صفحه اول و تلاش دوباره</button></p>}
    {page&&(!page.items.length?<p className="rounded-2xl border border-slate-200 bg-white p-5">تصویری در این صف پیدا نشد.</p>:<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{page.items.map(i=><article key={i.id} className="flex flex-col justify-between overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white"><div><div className="relative aspect-[4/3] bg-[#F7F7FB]"><img src={i.imageUrl} alt={i.caption||`استایل ${i.handle}`} className="h-full w-full object-cover" referrerPolicy="no-referrer"/><div className="absolute right-2.5 top-2.5"><StatusBadge label={i.status==="approved"?"تأییدشده برای نمایش":i.status==="rejected"?"ردشده":"در صف بازبینی"} tone={i.status==="approved"?"success":i.status==="rejected"?"danger":"warning"}/></div></div><div className="space-y-2 p-4"><div className="flex items-center justify-between gap-2 text-xs"><span className="break-all font-mono font-bold text-indigo-700" dir="ltr">{i.handle}</span><span>{new Date(i.submittedAt).toLocaleString("fa-IR")}</span></div><p className="break-words text-xs leading-relaxed text-slate-700">{i.caption}</p><div className={`inline-flex items-center gap-1 text-xs ${i.consentVerified?"text-green-800":"text-red-800"}`}><ShieldCheck className="h-3.5 w-3.5"/>{i.consentVerified?"رضایت انتشار تصویر ثبت شده است":"رضایت انتشار ثبت نشده است"}</div></div></div>{can("content:edit")&&<div className="flex flex-wrap gap-2 border-t border-slate-200 bg-slate-50 p-3">{i.status!=="approved"&&<button type="button" disabled={busy||loading||!i.consentVerified} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-green-800 px-2 py-2 text-xs text-white disabled:opacity-50" onClick={()=>void change(i,"approved")}><Check className="h-3.5 w-3.5"/>تأیید انتشار</button>}{i.status!=="rejected"&&<button type="button" disabled={busy||loading} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-red-300 bg-white px-2 py-2 text-xs text-red-800 disabled:opacity-50" onClick={()=>void change(i,"rejected")}><X className="h-3.5 w-3.5"/>رد</button>}{i.status!=="pending"&&<button type="button" disabled={busy||loading} className="rounded-lg border border-slate-300 px-3 py-2 text-xs disabled:opacity-50" onClick={()=>void change(i,"pending")}>بازگشت به صف</button>}</div>}</article>)}</div>)}
    {page&&<div className="flex flex-wrap items-center gap-3 text-sm"><button type="button" disabled={index===0||loading||busy} onClick={()=>setIndex(v=>v-1)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 disabled:opacity-50">صفحه جدیدتر</button><span>صفحه {(index+1).toLocaleString("fa-IR")}</span><button type="button" disabled={!page.nextCursor||loading||busy} onClick={()=>{if(page.nextCursor){setCursors(v=>[...v.slice(0,index+1),page.nextCursor]);setIndex(v=>v+1)}}} className="rounded-xl border border-slate-300 bg-white px-3 py-2 disabled:opacity-50">تصاویر قدیمی‌تر</button></div>}
  </div>;
}
