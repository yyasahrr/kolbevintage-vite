"use client";
import {useEffect,useState} from 'react';
import {selectCommerceProducts,type CommerceProduct,type CommerceCategory,type OrderRank} from '../../../../shared/visual-commerce-selection';
import type {CommerceKind,CommerceProps} from '../../../../shared/visual-commerce-spec';
export type PreviewProduct=CommerceProduct&{price:number;images:{url:string;role:string}[]};
export type PreviewCategory=CommerceCategory&{order?:number;thumbnail?:string};
export function CommercePreview({kind,props,products,categories,productState,categoryState}:{kind:CommerceKind;props:CommerceProps;products:PreviewProduct[];categories:PreviewCategory[];productState:string;categoryState:string}){
 const [leaders,setLeaders]=useState<OrderRank[]>([]),[rankState,setRankState]=useState('loading');
 useEffect(()=>{if(kind!=='LiveOrderLeaders')return;let alive=true;const controller=new AbortController();fetch('/api/public/best-sellers?limit=24',{signal:controller.signal,cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{if(!Array.isArray(data.items)||!data.items.every((x:OrderRank)=>typeof x.productId==='string'&&Number.isFinite(x.sold)&&x.sold>0))throw Error();if(alive){setLeaders(data.items);setRankState('ready')}}).catch(()=>{if(alive)setRankState('error')});return()=>{alive=false;controller.abort()}},[kind]);
 let message='';const needsCategory=kind==='LiveCategory'||kind==='LiveCategorySpotlight';
 if(kind==='LiveWishlist'||kind==='LiveCartSummary')message='اطلاعات شخصی بازدیدکننده فقط در فروشگاه نمایش داده می‌شود.';
 else if(kind==='LiveSearch')message='جست‌وجو در صفحه منتشرشده به فهرست محصولات می‌رود.';
 else if(productState==='loading'||(needsCategory&&categoryState==='loading'))message='در حال دریافت داده‌های فروشگاه…';
 else if(productState==='error'||(needsCategory&&categoryState==='error'))message='داده فروشگاه در دسترس نیست.';
 else if(kind==='LiveOrderLeaders'&&rankState!=='ready')message=rankState==='error'?'آمار سفارش‌ها در دسترس نیست.':'در حال دریافت آمار سفارش‌ها…';
 const category=categories.find(c=>c.id===props.categoryId&&c.active);
 if(!message&&needsCategory&&!category)message='دسته انتخاب نشده یا دیگر فعال نیست.';
 if(!message&&['LiveProduct','LiveProductStatus','LiveRelated'].includes(kind)&&!products.some(p=>p.id===props.productId))message='محصول انتخاب نشده یا دیگر فعال نیست.';
 // Editor stock snapshots may age while editing; never present them as live stock.
 if(!message&&['LiveAvailable','LiveLowStock','LiveProductStatus'].includes(kind))message='موجودی لحظه‌ای در فروشگاه بررسی می‌شود.';
 const selected=selectCommerceProducts(kind,{products,categories,count:props.count??1,productId:props.productId,categoryId:props.categoryId,leaders,stockFresh:false});
 if(!message&&!selected.length&&kind!=='LiveCategorySpotlight')message='محصولی برای نمایش وجود ندارد.';
 return <section className="kv-commerce-section"><h2>{props.heading}</h2>{message?<p role="status">{message}</p>:kind==='LiveCategorySpotlight'?<p>{category?.name}</p>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:16}}>{selected.map(p=><div key={p.id}><strong>{p.name}</strong><p>{p.price.toLocaleString('fa-IR')} تومان</p></div>)}</div>}<small>پیش‌نمایش تقریبی؛ داده‌ها و ظاهر نهایی در فروشگاه بررسی می‌شوند.</small>{kind==='LiveOrderLeaders'&&<p className="kv-commerce-note">سفارش‌های لغونشده؛ لزوماً پرداخت‌شده نیستند.</p>}</section>;
}
