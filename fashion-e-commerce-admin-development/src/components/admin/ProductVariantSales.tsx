"use client";
import {useCallback,useEffect,useRef,useState} from "react";

type Variant={id:string;sku:string;colorName:string;sizeLabel:string;saleEnabled:boolean;version:number;variantActive:boolean;productActive:boolean};
type API={get<T>(path:string):Promise<T>;patch<T>(path:string,body:object):Promise<T>};
const button="rounded-xl border border-slate-300 px-3 py-2 text-xs disabled:opacity-50";

export function ProductVariantSales({api,productId,canEdit,onChange,onBusy,refreshKey}:{api:API;productId:string;canEdit:boolean;onChange:()=>Promise<void>;onBusy:(busy:boolean)=>void;refreshKey:number}){
  const [rows,setRows]=useState<Variant[]|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [success,setSuccess]=useState("");
  const path=`/api/admin/products/${encodeURIComponent(productId)}/variant-sales`;const requestVersion=useRef(0);
  const load=useCallback(async()=>{const n=++requestVersion.current;setError("");try{const result=await api.get<Variant[]>(path);if(n!==requestVersion.current)return false;setRows(result);return true}catch(e){if(n===requestVersion.current){setRows(null);setError(e instanceof Error?e.message:"تنوع‌ها دریافت نشدند.")}return false}},[api,path]);
  useEffect(()=>{void load();return()=>{requestVersion.current++}},[load,refreshKey]);
  async function toggle(row:Variant){
    setBusy(true);onBusy(true);setError("");setSuccess("");
    try{await api.patch(`${path}/${encodeURIComponent(row.id)}`,{saleEnabled:!row.saleEnabled,expectedEnabled:row.saleEnabled,expectedVersion:row.version});const loaded=await load();await onChange();setSuccess(loaded?"وضعیت فروش تنوع ثبت شد.":"وضعیت ثبت شد؛ برای دیدن اطلاعات تازه، دوباره تلاش کنید.")}
    catch(e){setError(`${e instanceof Error?e.message:"ثبت وضعیت ناموفق بود."} اگر اتصال قطع شده، نتیجه را پیش از تلاش مجدد تازه‌سازی و بررسی کنید.`)}
    finally{setBusy(false);onBusy(false)}
  }
  return <section className="space-y-3 rounded-xl border border-slate-200 p-3" aria-label="وضعیت فروش تنوع‌ها">
    <h3 className="font-bold">فروش هر رنگ و سایز</h3>
    <p className="text-xs leading-6 text-slate-500">توقف فروش فقط مانع سفارش و رزرو جدید این ترکیب می‌شود؛ موجودی، SKU و سفارش‌ها تغییر نمی‌کنند. رزروهای قبلی لغو نمی‌شوند و ممکن است پرداخت و تکمیل شوند. اگر کل محصول غیرفعال باشد، تنوع فعال هم قابل فروش نیست.</p>
    <button type="button" className={button} disabled={busy} onClick={()=>void load()}>تازه‌سازی تنوع‌ها</button>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{success&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{success}</p>}
    {rows===null?<p className="text-sm">فهرست تنوع‌ها دریافت نشده است.</p>:!rows.length?<p className="text-sm">تنوعی ثبت نشده است.</p>:<ul className="max-h-80 space-y-2 overflow-y-auto">{rows.map(row=><li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"><div className="min-w-0"><b>{row.colorName} · {row.sizeLabel}</b><div className="break-all text-xs text-slate-500"><bdi dir="ltr">{row.sku}</bdi></div><div className="mt-1 text-xs">{row.saleEnabled?(!row.productActive?"تنوع فعال، محصول غیرفعال":row.variantActive?"فروش تنوع فعال":"تنوع در کاتالوگ غیرفعال است"):"فروش تنوع متوقف"}</div></div>{canEdit&&<button type="button" className={button} disabled={busy} onClick={()=>void toggle(row)}>{row.saleEnabled?`توقف فروش ${row.colorName} ${row.sizeLabel}`:`فعال کردن فروش ${row.colorName} ${row.sizeLabel}`}</button>}</li>)}</ul>}
  </section>;
}
