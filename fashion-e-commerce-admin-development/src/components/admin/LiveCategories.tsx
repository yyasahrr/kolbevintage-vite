"use client";
import { useEffect, useState } from "react";
import { FolderTree, Search, ImagePlus } from "lucide-react";
import type { SizeSet } from "./LiveSizeSets";
import { PageHeader } from "./ui/PageHeader";

type Category = { id:string; name:string; slug:string; thumbnail?:string; active:boolean; order:number; sizeSetId?:string; parentId?:string };
type API = {get<T>(path:string):Promise<T>;post<T>(path:string,body:object):Promise<T>;patch<T>(path:string,body:object):Promise<T>};
const src = (image?:string) => image?.startsWith("stock:") ? `/api/catalog/stock-image/${encodeURIComponent(image.slice(6))}` : image || "";
export function LiveCategories({api,can}:{api:API;can:(p:string)=>boolean}) {
  const [categories,setCategories]=useState<Category[]|null>(null), [search,setSearch]=useState(""), [error,setError]=useState(""), [success,setSuccess]=useState(""), [busy,setBusy]=useState("");
  const [sizeSets,setSizeSets]=useState<SizeSet[]|null>(null);
  const [editing,setEditing]=useState<Category | "new" | null>(null);
  const [form,setForm]=useState({name:"",slug:"",order:"",active:true,sizeSetId:""});
  function open(c?:Category){setError("");setSuccess("");setEditing(c ?? "new");setForm({name:c?.name ?? "",slug:c?.slug ?? "",order:c ? String(c.order ?? 0) : "",active:c?.active ?? true,sizeSetId:c?.sizeSetId ?? ""});}
  async function save(e:React.FormEvent){
    e.preventDefault();if(!editing)return;setBusy("form");setError("");setSuccess("");
    const order=form.order.trim() ? Number(form.order) : undefined;
    const body={name:form.name,active:form.active,...(sizeSets ? {sizeSetId:form.sizeSetId} : {}),...(order === undefined ? {} : {order}),...(editing === "new" ? {slug:form.slug} : {})};
    try {const result=editing === "new" ? await api.post<{category:Category}>("/api/admin/categories",body) : await api.patch<{category:Category}>(`/api/admin/categories/${encodeURIComponent(editing.id)}`,body);
      setCategories(old=>editing === "new" ? [...(old??[]),result.category] : (old??[]).map(c=>c.id===result.category.id?result.category:c));setEditing(null);setSuccess("دسته‌بندی ذخیره شد.");
    } catch(err){setError(err instanceof Error?err.message:"ذخیره دسته‌بندی ناموفق بود.");}finally{setBusy("");}
  }
  useEffect(()=>{api.get<Category[]>("/api/admin/categories").then(setCategories).catch(e=>setError(e.message));api.get<SizeSet[]>("/api/admin/size-sets").then(setSizeSets).catch(()=>setSizeSets(null));},[api]);
  async function change(c:Category,image:string) {
    setBusy(c.id);setError("");setSuccess("");
    try { const result=await api.patch<{category:Category}>(`/api/admin/categories/${encodeURIComponent(c.id)}/thumbnail`,{image});setCategories(old=>old?.map(item=>item.id===c.id?result.category:item)??null);setSuccess(`تصویر «${c.name}» در فروشگاه ذخیره شد.`); }
    catch(e){setError(e instanceof Error?e.message:"خطا در ذخیره تصویر");}finally{setBusy("");}
  }
  function upload(c:Category,file:File|undefined){if(!file)return;if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>8*1024*1024){setError("فایل JPEG، PNG یا WebP تا ۸ مگابایت انتخاب کنید.");return;}const reader=new FileReader();reader.onerror=()=>setError("خواندن فایل ناموفق بود.");reader.onload=()=>void change(c,String(reader.result));reader.readAsDataURL(file);}
  const filtered=categories?.filter(c=>`${c.name} ${c.slug}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>(a.order??0)-(b.order??0));
  return <div className="space-y-4"><PageHeader title="مدیریت دسته‌بندی‌ها" description="دسته‌های یک‌سطحی فروشگاه و تصاویر آنها را مدیریت کنید"/>
    {can("catalog:edit") && <button type="button" className="rounded-xl bg-[#1813FB] px-4 py-2 text-sm text-white disabled:opacity-50" disabled={!!busy || !categories} onClick={()=>open()}>افزودن دسته‌بندی</button>}
    {editing && <form onSubmit={save} className="space-y-3 rounded-2xl border border-[#E5E7EB] bg-white p-4" aria-label={editing === "new" ? "افزودن دسته‌بندی" : "ویرایش دسته‌بندی"}>
      <h2 className="font-bold">{editing === "new" ? "افزودن دسته‌بندی" : `ویرایش ${editing.name}`}</h2>
      <p className="text-xs leading-6 text-[#626775]">دسته‌ها یک سطح دارند. نام دسته‌ای که در کالا یا کمپین استفاده شده قابل تغییر نیست؛ می‌توانید آن را غیرفعال کنید.</p>
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm">نام دسته<input required maxLength={100} className="mt-2 w-full rounded-xl border p-2" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      <label className="text-sm">شناسه لاتین<input required disabled={editing !== "new"} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} dir="ltr" className="mt-2 w-full rounded-xl border p-2 disabled:bg-slate-50" value={form.slug} onChange={e=>setForm({...form,slug:e.target.value.toLowerCase()})}/></label>
      <label className="text-sm">ترتیب نمایش<input type="number" min="0" max="100000" step="1" className="mt-2 w-full rounded-xl border p-2" placeholder="خودکار" value={form.order} onChange={e=>setForm({...form,order:e.target.value})}/></label></div>
      <label className="block text-sm">الگوی پیشنهادی سایز<select aria-label="الگوی پیشنهادی سایز" className="mt-2 w-full rounded-xl border p-2" disabled={sizeSets===null} value={form.sizeSetId} onChange={e=>setForm({...form,sizeSetId:e.target.value})}><option value="">بدون الگو</option>{form.sizeSetId && sizeSets && !sizeSets.some(s=>s.id===form.sizeSetId) && <option value={form.sizeSetId}>الگوی قبلی در دسترس نیست</option>}{sizeSets?.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select>{sizeSets===null&&<span className="text-xs text-amber-700">الگوها بارگذاری نشدند؛ انتخاب قبلی حفظ می‌شود.</span>}</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/>نمایش دسته در فروشگاه</label>
      <div className="flex gap-2"><button className="rounded-lg bg-[#1813FB] px-4 py-2 text-sm text-white disabled:opacity-50" disabled={!!busy}>ذخیره دسته‌بندی</button><button type="button" disabled={!!busy} onClick={()=>setEditing(null)} className="rounded-lg border px-4 py-2 text-sm">انصراف</button></div>
    </form>}
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{success&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{success}</p>}
    <div className="flex items-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white p-4"><Search className="h-4 w-4 text-[#626775]"/><input className="w-full text-sm outline-none" aria-label="جستجوی دسته‌بندی" placeholder="جستجو در دسته‌بندی‌ها..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <section className="overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white"><div className="border-b border-[#E5E7EB] p-4 text-sm font-semibold"><FolderTree className="ml-2 inline h-4 w-4 text-[#1813FB]"/>دسته‌بندی‌های فروشگاه</div>
    {!filtered?<p className="p-5 text-sm">در حال بارگذاری…</p>:!filtered.length?<p className="p-5 text-sm">دسته‌ای یافت نشد.</p>:<div className="overflow-x-auto"><table className="w-full min-w-[620px] text-right text-xs"><thead className="bg-[#FAFAFE] text-[#626775]"><tr><th className="p-4">تصویر</th><th>نام دسته</th><th>شناسه</th><th>وضعیت</th><th>تصویر بندانگشتی</th><th>تنظیمات</th></tr></thead><tbody className="divide-y divide-[#EFEFF5]">{filtered.map(c=><tr key={c.id}><td className="p-3">{src(c.thumbnail)?<img src={src(c.thumbnail)} alt={`تصویر ${c.name}`} className="h-14 w-14 rounded-xl bg-[#F7F7FB] object-cover"/>:<div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#F7F7FB] text-[#626775]">بدون تصویر</div>}</td><td className="font-semibold">{c.name}</td><td dir="ltr">{c.slug}</td><td>{c.active?"فعال":"غیرفعال"}</td><td>{can("catalog:edit")?<div className="flex flex-wrap items-center gap-2"><label className={`inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[#E5E7EB] px-3 py-2 ${busy?"pointer-events-none opacity-50":"hover:border-[#1813FB]"}`}><ImagePlus className="h-4 w-4"/>انتخاب تصویر<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={!!busy} onChange={e=>{upload(c,e.target.files?.[0]);e.currentTarget.value="";}}/></label>{c.thumbnail&&<button className="text-[#B44F40] underline disabled:opacity-50" disabled={!!busy} onClick={()=>void change(c,"")}>حذف تصویر</button>}{busy===c.id&&<span>در حال ذخیره…</span>}</div>:"فقط مشاهده"}</td><td>{can("catalog:edit") && <button type="button" disabled={!!busy} onClick={()=>open(c)} className="px-2 text-[#1813FB] underline disabled:opacity-50">ویرایش دسته</button>}</td></tr>)}</tbody></table></div>}</section><p className="text-xs text-[#626775]">تصویر پس از ذخیره در نوار دسته‌های فروشگاه نمایش داده می‌شود. برای دیدن تغییر، صفحه فروشگاه را تازه کنید.</p></div>;
}
