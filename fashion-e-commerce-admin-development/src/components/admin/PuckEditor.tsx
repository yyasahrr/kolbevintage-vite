"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { Puck, type Data } from '@puckeditor/core';
import '@puckeditor/core/no-external.css';
import '../../../../shared/visual.css';
import { makeVisualConfig } from '../../../../shared/visual-config';

const dictionary={
  'header-publish':'ذخیره پیش‌نویس','header-undo':'واگرد','header-redo':'بازانجام',
  'header-toggle-leftsidebar':'نمایش پنل ویجت‌ها','header-toggle-rightsidebar':'نمایش پنل تنظیمات',
  'action-selectparent':'انتخاب والد','action-drag':'کشیدن برای جابه‌جایی','action-duplicate':'تکثیر','action-delete':'حذف',
  'label-page':'صفحه','label-component':'ویجت','outline-empty':'هنوز ویجتی وجود ندارد','outline-header-title':'ساختار صفحه',
  'outline-item-collapse':'بستن','outline-item-expand':'باز کردن','outline-item-duplicate':'تکثیر','outline-item-delete':'حذف',
  'drawer-category-other':'سایر','plugin-blocks':'ویجت‌ها','plugin-outline':'لایه‌ها','plugin-fields':'تنظیمات','plugin-components':'ویجت‌ها',
  'viewport-switch':'پیش‌نمایش {label}','viewport-switch-default':'تغییر اندازه پیش‌نمایش','field-readonly':'فقط خواندنی',
};
function ProductPreview({heading,count}:{heading:string;count:number}){
  return <section style={{padding:'32px 20px',background:'#fafafa',color:'#171429'}}><h2 style={{fontWeight:700,fontSize:24}}>{heading}</h2><p style={{margin:'12px 0',fontSize:13}}>پیش‌نمایش جایگاه {count} محصول؛ در صفحهٔ منتشرشده محصولات فعال فروشگاه نمایش داده می‌شوند.</p><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:12}}>{Array.from({length:Math.min(count,4)},(_,i)=><div key={i} style={{height:130,background:'#e7e6eb',borderRadius:12}}/>)}</div></section>
}
function ImageField({value,onChange,upload}:{value:string;onChange:(v:string)=>void;upload:(f:File)=>Promise<string>}){
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  async function choose(file?:File){if(!file)return;setBusy(true);setError('');try{onChange(await upload(file));}catch(e){setError(e instanceof Error?e.message:'بارگذاری تصویر ناموفق بود.')}finally{setBusy(false)}}
  return <div style={{display:'grid',gap:8}}><label>نشانی تصویر<input aria-label="نشانی تصویر" disabled={busy} value={value||''} onChange={e=>onChange(e.target.value)} dir="ltr" style={{width:'100%',border:'1px solid #aaa',borderRadius:5,padding:8}}/></label><label>بارگذاری تصویر<input aria-label="بارگذاری تصویر" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.currentTarget.value='';void choose(file)}}/></label><small>تصویر فوراً ذخیره می‌شود و لغو ویرایش آن را از حافظه پاک نمی‌کند.</small>{error&&<p role="alert">{error}</p>}</div>
}
function VideoField({value,onChange,upload}:{value:string;onChange:(v:string)=>void;upload:(f:File)=>Promise<string>}){
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);
  async function choose(file?:File){if(!file)return;setBusy(true);setError('');try{onChange(await upload(file));}catch(e){setError(e instanceof Error?e.message:'بارگذاری ویدیو ناموفق بود.')}finally{setBusy(false)}}
  return <div style={{display:'grid',gap:8}}><label>نشانی ویدیو<input aria-label="نشانی ویدیو" disabled={busy} value={value||''} onChange={e=>onChange(e.target.value)} dir="ltr" style={{width:'100%',border:'1px solid #aaa',borderRadius:5,padding:8}}/></label><label>بارگذاری ویدیو<input aria-label="بارگذاری ویدیو" type="file" accept="video/mp4,video/webm,video/quicktime" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.currentTarget.value='';void choose(file)}}/></label><small>ویدیو بلافاصله بارگذاری می‌شود؛ حذف ارجاع یا لغو ویرایش فایل را پاک نمی‌کند. حداکثر ۲۰ مگابایت.</small>{error&&<p role="alert">{error}</p>}</div>
}
export default function PuckEditor({data,onChange,onSave,upload}:{data:Data;onChange:(value:Data)=>void;onSave:(value:Data)=>void;upload:(f:File,kind:'image'|'video')=>Promise<string>}){
  const config=useMemo(()=>{const config=makeVisualConfig(p=><ProductPreview {...p}/>,p=><section style={{padding:24,background:'#f7f6f4'}}><h2 style={{fontSize:24,fontWeight:700}}>{p.heading}</h2><p>در صفحهٔ منتشرشده حداکثر {p.count} دستهٔ فعال فروشگاه نمایش داده می‌شود.</p></section>);const imageField={type:'custom' as const,label:'تصویر',render:({value,onChange}:{value:string;onChange:(v:string)=>void})=><ImageField value={value} onChange={onChange} upload={f=>upload(f,'image')}/>};config.components.Image.fields!.url=imageField;config.components.Hero.fields!.image=imageField;config.components.Video.fields!.poster=imageField;config.components.Video.fields!.url={type:'custom',label:'ویدیو',render:({value,onChange}:{value:string;onChange:(v:string)=>void})=><VideoField value={value} onChange={onChange} upload={f=>upload(f,'video')}/>};return config},[upload]);
  // Puck 0.24 does not label its preview iframe and zoom selector. Keep the
  // small accessibility bridge scoped to this editor until upstream exposes props.
  const editorRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{const root=editorRef.current;if(!root)return;const labelControls=()=>{const frame=root.querySelector('iframe#preview-frame');if(frame&&!frame.hasAttribute('title'))frame.setAttribute('title','پیش‌نمایش صفحه');const zoom=root.querySelector('select[class*="ViewportControls-zoomSelect"]');if(zoom&&!zoom.hasAttribute('aria-label'))zoom.setAttribute('aria-label','بزرگ‌نمایی پیش‌نمایش');root.querySelectorAll('span[aria-label="loading"]').forEach(el=>{if(!el.hasAttribute('role'))el.setAttribute('role','status')});};labelControls();const observer=new MutationObserver(labelControls);observer.observe(root,{childList:true,subtree:true});return()=>observer.disconnect()},[]);
  return <div ref={editorRef} dir="rtl" className="kv-puck-editor"><Puck config={config} data={data} onChange={onChange} onPublish={onSave} dictionary={dictionary} viewports={[{width:1440,label:'دسکتاپ'},{width:768,label:'تبلت'},{width:390,label:'موبایل'}]} height="100%" /></div>;
}
