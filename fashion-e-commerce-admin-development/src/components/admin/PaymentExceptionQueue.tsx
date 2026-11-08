"use client";
import {useEffect,useRef,useState} from 'react';
type Row={id:string;checkoutId:string;orderId:string|null;provider:string;amount:number;lastError:string|null;createdAt:string};
type Page={items:Row[];nextCursor:string|null};
type Api={get<T>(path:string):Promise<T>};
const reason=(v:string|null)=>v==='duplicate_checkout_capture'?'پرداخت تکراری برای یک تسویه':v==='payment_initiation_unconfirmed'?'نتیجه شروع پرداخت نامشخص است':'نیازمند بررسی درگاه';
export function PaymentExceptionQueue({api}:{api:Api}){
  const [input,setInput]=useState(''),[search,setSearch]=useState(''),[cursors,setCursors]=useState<(string|null)[]>([null]),[index,setIndex]=useState(0),[revision,setRevision]=useState(0);
  const [page,setPage]=useState<Page|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);const seq=useRef(0),cursor=cursors[index];
  useEffect(()=>{const request=++seq.current;setPage(null);setError('');setLoading(true);const q=new URLSearchParams({limit:'40'});if(cursor)q.set('before',cursor);if(search)q.set('search',search);
    api.get<Page>(`/api/commerce/admin/payment-exceptions/page?${q}`).then(v=>{if(seq.current===request)setPage(v)}).catch(e=>{if(seq.current===request)setError(e instanceof Error?e.message:'دریافت تراکنش‌ها ناموفق بود.')}).finally(()=>{if(seq.current===request)setLoading(false)});return()=>{seq.current++};
  },[api,cursor,search,revision]);
  function refresh(){setCursors([null]);setIndex(0);setRevision(v=>v+1)}
  return <section tabIndex={0} aria-label="پرداخت‌های نیازمند بررسی مالی" className="space-y-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">پرداخت‌های نیازمند بررسی مالی</h2><p className="text-sm leading-7 text-slate-600">جستجو و صفحه‌بندی روی همهٔ موارد نیازمند بررسی است. ثبت مغایرت یا پرداخت اضافه به معنی بازگشت خودکار وجه نیست؛ آن را با درگاه تطبیق دهید.</p>
    <form onSubmit={e=>{e.preventDefault();setSearch(input.trim());refresh()}} className="flex flex-wrap items-end gap-2"><label className="min-w-0 flex-1 text-sm">جستجوی تراکنش<input aria-label="جستجوی تراکنش" type="search" maxLength={120} value={input} onChange={e=>setInput(e.target.value)} placeholder="شناسه تراکنش، سفارش یا سبد پرداخت" className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2"/></label><button className="rounded-xl border border-slate-300 px-4 py-2 text-sm">جستجوی تراکنش</button></form>
    {loading&&<p role="status">در حال دریافت تراکنش‌ها…</p>}{error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error} <button type="button" className="underline" onClick={refresh}>بازگشت به صفحه اول و تلاش دوباره</button></p>}
    {page&&(page.items.length?<table className="w-full min-w-[700px] text-right text-sm"><thead><tr><th>شناسه تراکنش</th><th>سفارش مرتبط</th><th>مبلغ به واحد پایه</th><th>دلیل</th><th>درگاه</th></tr></thead><tbody>{page.items.map(p=><tr key={p.id} className="border-t border-slate-100"><td className="py-3"><bdi>{p.id}</bdi></td><td><bdi>{p.orderId??'—'}</bdi></td><td>{new Intl.NumberFormat('fa-IR').format(p.amount)}</td><td>{reason(p.lastError)}</td><td><bdi>{p.provider}</bdi></td></tr>)}</tbody></table>:<p>تراکنش نیازمند بررسی پیدا نشد.</p>)}
    {page&&<div className="flex flex-wrap items-center gap-3 text-sm"><button type="button" disabled={index===0||loading} onClick={()=>setIndex(v=>v-1)} className="rounded-xl border border-slate-300 px-3 py-2 disabled:opacity-50">صفحه جدیدتر تراکنش‌ها</button><span>صفحه {(index+1).toLocaleString('fa-IR')}</span><button type="button" disabled={!page.nextCursor||loading} onClick={()=>{if(page.nextCursor){setCursors(v=>[...v.slice(0,index+1),page.nextCursor]);setIndex(v=>v+1)}}} className="rounded-xl border border-slate-300 px-3 py-2 disabled:opacity-50">تراکنش‌های قدیمی‌تر</button></div>}
  </section>;
}
