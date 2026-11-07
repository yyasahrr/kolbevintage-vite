"use client";

import {useCallback,useEffect,useState} from "react";
import {BookOpen,Plus,RefreshCw} from "lucide-react";

type Article={id:string;slug:string;title:string;excerpt:string;category:string;body:string;coverUrl:string;seoTitle:string;seoDescription:string;status:"draft"|"published";publishedAt:string|null;version:number;updatedAt:string};
type Draft={slug:string;title:string;excerpt:string;category:string;body:string;seoTitle:string;seoDescription:string;publishedLocal:string};
type Api={get:<T>(path:string)=>Promise<T>;post:<T>(path:string,body:object)=>Promise<T>;patch:<T>(path:string,body:object)=>Promise<T>};
const blank=():Draft=>({slug:"",title:"",excerpt:"",category:"",body:"",seoTitle:"",seoDescription:"",publishedLocal:""});
function localTime(value:string|null) {if(!value)return "";const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function fromArticle(a:Article):Draft{return {slug:a.slug,title:a.title,excerpt:a.excerpt,category:a.category,body:a.body,seoTitle:a.seoTitle,seoDescription:a.seoDescription,publishedLocal:localTime(a.publishedAt)}}
const input="w-full rounded-xl border border-[#E4E7EC] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1813FB] disabled:bg-slate-50";
const button="rounded-xl bg-[#1813FB] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50";
const secondary="rounded-xl border border-[#E4E7EC] bg-white px-4 py-2.5 text-sm text-[#344054] disabled:opacity-50";

export function LiveJournal({api,can}:{api:Api;can:(permission:string)=>boolean}) {
  const [items,setItems]=useState<Article[]|null>(null);const [enabled,setEnabled]=useState(false);
  const [selected,setSelected]=useState<Article|null>(null);const [draft,setDraft]=useState<Draft>(blank());const [creating,setCreating]=useState(false);
  const [image,setImage]=useState("");const [removeCover,setRemoveCover]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");
  const load=useCallback(async()=>{try{const data=await api.get<{items:Article[];enabled:boolean}>("/api/admin/journal");setItems(data.items);setEnabled(data.enabled);setError("")}catch(e){setItems(null);setError(e instanceof Error?e.message:"دریافت مقالات ناموفق بود.")}},[api]);
  useEffect(()=>{void load()},[load]);
  function choose(item:Article){setSelected(item);setDraft(fromArticle(item));setCreating(false);setImage("");setRemoveCover(false);setError("");setNotice("")}
  function create(){setSelected(null);setDraft(blank());setCreating(true);setImage("");setRemoveCover(false);setError("");setNotice("")}
  function change(key:keyof Draft,value:string){setDraft(old=>({...old,[key]:value}))}
  async function save(status:"draft"|"published") {
    setBusy(true);setError("");setNotice("");
    try {
      const common={title:draft.title,excerpt:draft.excerpt,category:draft.category,body:draft.body,seoTitle:draft.seoTitle,seoDescription:draft.seoDescription};
      let saved:Article;
      if(creating) saved=await api.post<Article>("/api/admin/journal",{...common,slug:draft.slug});
      else if(selected) saved=await api.patch<Article>(`/api/admin/journal/${encodeURIComponent(selected.id)}`,{...common,expectedVersion:selected.version,status,publishedAt:status==="published"&&draft.publishedLocal?(selected.publishedAt&&draft.publishedLocal===localTime(selected.publishedAt)?selected.publishedAt:new Date(draft.publishedLocal).toISOString()):null,...(image?{coverData:image}:{}),...(removeCover?{removeCover:true}:{})});
      else return;
      await load();choose(saved);setNotice(creating?"پیش‌نویس ثبت شد. برای تصویر یا انتشار، آن را ویرایش کنید.":"تغییرات مقاله ثبت شد.");
    }catch(e){setError(e instanceof Error?e.message:"ذخیره ناموفق بود.")}finally{setBusy(false)}
  }
  async function toggle(){setBusy(true);setError("");setNotice("");try{const result=await api.patch<{enabled:boolean}>("/api/admin/journal-settings",{enabled:!enabled,expectedEnabled:enabled});setEnabled(result.enabled);setNotice(result.enabled?"ژورنال برای بازدیدکنندگان فعال شد.":"ژورنال برای بازدیدکنندگان غیرفعال شد.")}catch(e){setError(e instanceof Error?e.message:"تغییر وضعیت ناموفق بود.")}finally{setBusy(false)}}
  async function readImage(file:File|undefined){if(!file)return;if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>8*1024*1024){setError("تصویر باید JPEG، PNG یا WebP و حداکثر ۸ مگابایت باشد.");return}const reader=new FileReader();reader.onload=()=>{if(typeof reader.result==="string"){setImage(reader.result);setRemoveCover(false);setError("")}};reader.onerror=()=>setError("خواندن تصویر ناموفق بود.");reader.readAsDataURL(file)}
  const editing=creating||!!selected;
  const canEdit=can("content:edit") && (selected?.status!=="published" || can("content:publish"));
  return <section className="space-y-5" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-xl font-bold text-[#080707]"><BookOpen size={20}/>ژورنال و مقالات</h1><p className="mt-1 text-sm text-[#626775]">محتوای واقعی فروشگاه؛ پیش‌نویس‌ها فقط در پنل دیده می‌شوند.</p></div><div className="flex gap-2"><button className={secondary} onClick={()=>void load()} disabled={busy}><RefreshCw size={15} className="ml-1 inline"/>تازه‌سازی</button>{can("content:edit")&&<button className={button} onClick={create} disabled={busy}><Plus size={15} className="ml-1 inline"/>مقاله جدید</button>}</div></div>
    {error&&<div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error} در صورت تعارض، فهرست را تازه و مقاله را دوباره انتخاب کنید.</div>}
    {notice&&<div role="status" className="rounded-xl bg-indigo-50 p-3 text-sm text-indigo-700">{notice}</div>}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#EFEFF5] bg-white p-4"><div><p className="text-sm font-semibold">نمایش عمومی ژورنال: {enabled?"فعال":"غیرفعال"}</p><p className="mt-1 text-xs text-[#626775]">خاموش کردن، تمام مقاله‌ها را از مسیر عمومی پنهان می‌کند.</p></div><button className={secondary} disabled={!can("content:publish")||busy||items===null} onClick={()=>void toggle()}>{enabled?"غیرفعال کردن ژورنال":"فعال کردن ژورنال"}</button></div>
    <p className="text-xs leading-6 text-[#626775]">فهرست پنل حداکثر ۲۰۰ مورد آخر و فهرست ویترین ۱۰۰ مقالهٔ منتشرشدهٔ آخر را نشان می‌دهد؛ لینک مستقیم مقالات قدیمی همچنان قابل دسترسی است. متن ساده است و ویدیو و صفحه‌بندی هنوز پشتیبانی نمی‌شوند. زمان‌بندی بر اساس ساعت دستگاه شما ثبت می‌شود.</p>
    <div className="grid gap-5 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.7fr)]"><div className="rounded-2xl border border-[#EFEFF5] bg-white p-4"><h2 className="mb-3 text-sm font-bold">مقالات ({items?.length.toLocaleString("fa-IR") ?? "…"})</h2>{items?.length===0&&<p className="text-sm text-[#626775]">هنوز مقاله‌ای ثبت نشده است.</p>}{items?.map(a=><button key={a.id} onClick={()=>choose(a)} className={`mb-2 block w-full rounded-xl border p-3 text-right ${selected?.id===a.id?"border-indigo-300 bg-indigo-50":"border-[#EFEFF5] hover:bg-slate-50"}`}><span className="block truncate text-sm font-semibold">{a.title}</span><span className="mt-1 block text-xs text-[#626775]">{a.status==="draft"?"پیش‌نویس":a.publishedAt && new Date(a.publishedAt).getTime()>Date.now()?"زمان‌بندی‌شده":"منتشرشده"} · {a.slug}</span></button>)}</div>
    <div className="rounded-2xl border border-[#EFEFF5] bg-white p-5">{!editing?<p className="text-sm text-[#626775]">یک مقاله را انتخاب کنید یا پیش‌نویس جدید بسازید.</p>:<form className="space-y-4" onSubmit={e=>{e.preventDefault();void save("draft")}}>
      <h2 className="text-base font-bold">{creating?"پیش‌نویس جدید":"ویرایش مقاله"}</h2>{!canEdit&&<p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">برای تغییر مقالهٔ منتشرشده، مجوز انتشار نیز لازم است.</p>}
      <label className="block space-y-1 text-sm">عنوان<input className={input} value={draft.title} maxLength={160} required disabled={!canEdit||busy} onChange={e=>change("title",e.target.value)}/></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-1 text-sm">شناسهٔ لاتین (پس از ثبت تغییر نمی‌کند)<input className={input} dir="ltr" value={draft.slug} maxLength={80} pattern="[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*" required disabled={!creating||!canEdit||busy} onChange={e=>change("slug",e.target.value)}/></label><label className="block space-y-1 text-sm">دسته<input className={input} value={draft.category} maxLength={80} required disabled={!canEdit||busy} onChange={e=>change("category",e.target.value)}/></label></div>
      <label className="block space-y-1 text-sm">خلاصه<textarea className={input} value={draft.excerpt} maxLength={500} rows={2} disabled={!canEdit||busy} onChange={e=>change("excerpt",e.target.value)}/></label>
      <label className="block space-y-1 text-sm">متن مقاله (بین پاراگراف‌ها یک خط خالی بگذارید)<textarea className={input} value={draft.body} maxLength={30000} rows={10} disabled={!canEdit||busy} onChange={e=>change("body",e.target.value)}/></label>
      {!creating&&<div className="space-y-2"><p className="text-sm">تصویر شاخص</p>{selected?.coverUrl&&!removeCover&&<img src={selected.coverUrl} alt="تصویر شاخص فعلی" className="h-24 rounded-lg object-cover"/>}<input aria-label="انتخاب تصویر شاخص" type="file" accept="image/jpeg,image/png,image/webp" disabled={!canEdit||busy} onChange={e=>void readImage(e.target.files?.[0])}/>{image&&<p className="text-xs">تصویر جدید آمادهٔ ذخیره است.</p>}{selected?.coverUrl&&<label className="block text-xs"><input type="checkbox" checked={removeCover} disabled={!canEdit||busy} onChange={e=>{setRemoveCover(e.target.checked);if(e.target.checked)setImage("")}}/> حذف تصویر فعلی پس از ذخیره</label>}</div>}
      <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-1 text-sm">عنوان سئو (اختیاری)<input className={input} value={draft.seoTitle} maxLength={160} disabled={!canEdit||busy} onChange={e=>change("seoTitle",e.target.value)}/></label><label className="block space-y-1 text-sm">توضیح سئو (اختیاری)<input className={input} value={draft.seoDescription} maxLength={320} disabled={!canEdit||busy} onChange={e=>change("seoDescription",e.target.value)}/></label></div>
      {!creating&&<label className="block space-y-1 text-sm">زمان انتشار (خالی: همین حالا)<input type="datetime-local" className={input} dir="ltr" value={draft.publishedLocal} disabled={!canEdit||busy||!can("content:publish")} onChange={e=>change("publishedLocal",e.target.value)}/></label>}
      <div className="flex flex-wrap gap-2"><button type="submit" className={secondary} disabled={!canEdit||busy}>{selected?.status==="published"?"بازگرداندن به پیش‌نویس":"ذخیره پیش‌نویس"}</button>{!creating&&<button type="button" className={button} disabled={!canEdit||!can("content:publish")||busy} onClick={()=>void save("published")}>انتشار / ذخیره منتشرشده</button>}</div>
    </form>}</div></div>
  </section>;
}
