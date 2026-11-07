"use client";
import {useState} from "react";
import {readProductImage} from "./productImage";

type Image={id:string;url:string;colorId:string;role:string};
type Props={api:{post<T>(path:string,body:object):Promise<T>};productId:string;initialImages:Image[];colors:{id:string;name:string}[];onChange:()=>Promise<void>;onBusy:(busy:boolean)=>void};
const input="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-2 focus:outline-indigo-500";
const button="rounded-xl border border-slate-300 px-3 py-2 text-xs disabled:opacity-50";
const roles=[{id:"main",label:"تصویر شاخص"},{id:"gallery",label:"گالری"},{id:"detail",label:"جزئیات"},{id:"hover",label:"هاور"},{id:"cutout",label:"تصویر شفاف برای بوم استایل"}];
export function ProductImages({api,productId,initialImages,colors,onChange,onBusy}:Props){
  const [images,setImages]=useState(initialImages);
  const [drafts,setDrafts]=useState<Record<string,{role:string;colorId:string}>>({});
  const [imageUrl,setImageUrl]=useState("");const [imageData,setImageData]=useState("");const [imageName,setImageName]=useState("");
  const [imageRole,setImageRole]=useState("gallery");const [imageColor,setImageColor]=useState("*");
  const [reading,setReading]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [success,setSuccess]=useState("");
  async function selectImage(file?:File){if(!file)return;setError("");onBusy(true);setReading(true);try{setImageData(await readProductImage(file));setImageName(file.name);setImageUrl("")}catch(e){setImageData("");setImageName("");setError(e instanceof Error?e.message:"فایل معتبر نیست.")}finally{setReading(false);onBusy(false)}}
  async function change(body:Record<string,unknown>){
    onBusy(true);setBusy(true);setError("");setSuccess("");
    try{
      const result=await api.post<{images:Image[]}>(`/api/admin/products/${encodeURIComponent(productId)}/images`,{...body,expected:images});
      setImages(result.images);
      if(body.action==="add"){setImageUrl("");setImageData("");setImageName("")}
      if((body.action==="update"||body.action==="remove") && typeof body.imageId==="string")setDrafts(previous=>{const next={...previous};delete next[body.imageId as string];return next});
      await onChange();setSuccess("تغییر تصویر ذخیره شد.");
    }catch(e){setError(`${e instanceof Error?e.message:"ثبت تصویر ناموفق بود."} در خطای شبکه ممکن است نتیجه نامشخص باشد؛ پیش از تلاش دوباره اطلاعات را تازه کنید.`)}finally{setBusy(false);onBusy(false)}
  }
  return <section className="space-y-3 rounded-xl border border-slate-200 p-3" aria-label="مدیریت تصاویر محصول">
    <h3 className="font-bold">تصاویر محصول</h3><p className="text-xs leading-6 text-slate-500">تصاویر جداگانه و بلافاصله ذخیره می‌شوند؛ انصراف فرم محصول آنها را بازنمی‌گرداند. انتخاب تصویر شاخص، شاخص قبلی را به گالری تبدیل می‌کند. فایل حذف‌شده از حافظه پاک نمی‌شود. برای بوم استایل، فایل PNG یا WebP شفاف شامل خودِ محصول را با نقش «تصویر شفاف برای بوم استایل» بارگذاری کنید؛ برچسب‌زدن به تصویر قدیمی یا نشانی خارجی جایگزین بارگذاری فایل نیست.</p>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{success&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{success}</p>}
    {images.length===0?<p className="text-sm">تصویر اختصاصی ثبت نشده است.</p>:<ol className="space-y-3">{images.map((image,index)=>{const value=drafts[image.id]??{role:image.role,colorId:image.colorId};return <li key={image.id} className="space-y-2 rounded-xl border border-slate-200 p-3"><div className="flex items-center gap-2 text-xs"><img src={image.url} alt="" className="h-12 w-12 rounded object-cover"/><span className="min-w-0 flex-1 truncate" dir="ltr">{image.url}</span><span>{index+1}</span></div><div className="grid gap-2 sm:grid-cols-2"><label className="text-xs">نقش تصویر {index+1}<select className={`${input} mt-1`} value={value.role} disabled={busy} onChange={e=>setDrafts({...drafts,[image.id]:{...value,role:e.target.value}})}>{!roles.some(r=>r.id===value.role)&&<option value={value.role}>{value.role} (قدیمی)</option>}{roles.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label><label className="text-xs">رنگ تصویر {index+1}<select className={`${input} mt-1`} value={value.colorId} disabled={busy} onChange={e=>setDrafts({...drafts,[image.id]:{...value,colorId:e.target.value}})}><option value="*">همه رنگ‌ها</option>{value.colorId!=="*"&&!colors.some(c=>c.id===value.colorId)&&<option value={value.colorId}>{value.colorId} (رنگ ناموجود)</option>}{colors.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy||(value.role===image.role&&value.colorId===image.colorId)} onClick={()=>void change({action:"update",imageId:image.id,...value})}>ذخیره تصویر {index+1}</button><button type="button" className={button} disabled={busy||index===0} onClick={()=>void change({action:"move",imageId:image.id,direction:"earlier"})}>تصویر {index+1} بالاتر</button><button type="button" className={button} disabled={busy||index===images.length-1} onClick={()=>void change({action:"move",imageId:image.id,direction:"later"})}>تصویر {index+1} پایین‌تر</button><button type="button" className={button} disabled={busy||images.length===1} onClick={()=>void change({action:"remove",imageId:image.id})}>حذف تصویر {index+1}</button></div></li>})}</ol>}
    <label className="block text-sm">فایل تصویر جدید<input type="file" accept="image/jpeg,image/png,image/webp" className={`${input} mt-2`} disabled={busy||reading} onChange={e=>{const file=e.target.files?.[0];e.currentTarget.value="";void selectImage(file)}}/></label>{imageName&&<p className="text-xs">فایل انتخاب‌شده: {imageName}</p>}
    <label className="block text-sm">یا نشانی HTTPS تصویر جدید<input dir="ltr" disabled={busy||reading} className={`${input} mt-2`} value={imageUrl} onChange={e=>{setImageData("");setImageName("");setImageUrl(e.target.value)}}/></label>
    <div className="grid gap-2 sm:grid-cols-2"><label className="text-sm">نقش تصویر جدید<select className={`${input} mt-2`} value={imageRole} disabled={busy} onChange={e=>setImageRole(e.target.value)}>{roles.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}</select></label><label className="text-sm">رنگ تصویر جدید<select className={`${input} mt-2`} value={imageColor} disabled={busy} onChange={e=>setImageColor(e.target.value)}><option value="*">همه رنگ‌ها</option>{colors.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>
    <button type="button" className={button} disabled={busy||reading||(!imageData&&!imageUrl.trim())} onClick={()=>void change({action:"add",...(imageData?{imageData}:{url:imageUrl}),role:imageRole,colorId:imageColor})}>افزودن تصویر</button>
  </section>;
}
