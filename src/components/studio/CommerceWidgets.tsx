import {useEffect,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import type {CommerceKind,CommerceProps} from '../../../shared/visual-commerce-spec';
import {selectCommerceProducts,matchesActiveCommerceCategory} from '../../../shared/visual-commerce-selection';
import {useLiveCatalog,sellableStock} from '@/state/live-catalog';
import {useCart} from '@/state/cart';
import {useCommerceCategories} from '@/state/commerce-categories';
import {useOrderLeaders} from '@/state/order-leaders';
import {formatPrice} from '@/data/looks';
import {visibleProducts} from '@/data/catalog';
import {ProductCard} from '@/components/ProductCard';
import {resolveImg} from '@/builder/stock';

function Search({heading,placeholder,buttonText}:CommerceProps){
 const [query,setQuery]=useState('');const navigate=useNavigate();
 return <section className="kv-commerce-section"><h2>{heading}</h2><form className="kv-commerce-search" role="search" onSubmit={e=>{e.preventDefault();const value=query.trim();navigate(value?`/products?q=${encodeURIComponent(value)}`:'/products')}}><label className="kv-commerce-search-label">جست‌وجوی محصولات<input maxLength={160} value={query} onChange={e=>setQuery(e.target.value)} placeholder={placeholder}/></label><button type="submit">{buttonText||'جست‌وجو'}</button></form></section>;
}
export function CommerceWidget({kind,props}:{kind:CommerceKind;props:CommerceProps}){
 const catalog=useLiveCatalog(),cart=useCart(),leaders=useOrderLeaders(kind==='LiveOrderLeaders');
 const needsCategory=kind==='LiveCategory'||kind==='LiveCategorySpotlight';const categoryData=useCommerceCategories(needsCategory);const categories=categoryData.items;
 const [,tick]=useState(0);
 useEffect(()=>{if(!catalog.loadedAt)return;const delay=catalog.loadedAt+90001-Date.now();if(delay<=0)return;const timer=window.setTimeout(()=>tick(n=>n+1),delay);return()=>window.clearTimeout(timer)},[catalog.loadedAt]);
 const fresh=catalog.status==='online'&&!!catalog.loadedAt&&Date.now()-catalog.loadedAt<=90000;
 const selected=selectCommerceProducts(kind,{products:catalog.products,categories:categories,count:props.count??1,productId:props.productId,categoryId:props.categoryId,wishlist:cart.wishlist,leaders:leaders.items,stockFresh:fresh});
 const byId=new Map(visibleProducts().map(product=>[product.id,product]));
 const products=selected.map(item=>byId.get(item.id)).filter((item):item is NonNullable<typeof item>=>!!item);
 const category=categories.find(c=>c.id===props.categoryId&&c.active);
 if(kind==='LiveSearch')return <Search {...props}/>;
 if(kind==='LiveCartSummary'){
  const valid=fresh&&cart.lines.every(line=>catalog.products.some(p=>p.id===line.productId&&p.colors.some(c=>c.id===line.colorId)&&p.sizes.some(z=>z.id===line.sizeId)&&Number.isFinite(line.qty)&&line.qty>0));
  const estimate=cart.lines.reduce((sum,line)=>sum+(catalog.products.find(p=>p.id===line.productId)?.price??0)*line.qty,0);
  const stockIssue=fresh&&cart.lines.some(line=>line.qty>sellableStock(line.productId,line.colorId,line.sizeId));
  return <section className="kv-commerce-section kv-commerce-summary"><h2>{props.heading}</h2><p>{cart.count?`${cart.count.toLocaleString('fa-IR')} کالا در سبد شما`:'سبد خرید شما خالی است.'}</p>{cart.count>0&&(valid?<p>جمع تقریبی کالاها: <strong>{formatPrice(estimate)}</strong></p>:<p role="status">قیمت فعلی سبد قابل تأیید نیست.</p>)}{stockIssue&&<p role="status">موجودی برخی کالاها نیاز به بررسی دارد.</p>}<p className="kv-commerce-note">قیمت نهایی، تخفیف، ارسال و موجودی در سبد و هنگام ثبت سفارش دوباره بررسی می‌شوند.</p><button className="kv-commerce-button" type="button" onClick={()=>cart.setCartOpen(true)}>{props.buttonText||'مشاهده سبد'}</button></section>;
 }
 if(needsCategory&&categoryData.status!=='ready')return <section className="kv-commerce-section"><h2>{props.heading}</h2><p role="status">{categoryData.status==='loading'?'در حال دریافت دسته‌ها…':'دسته‌ها در دسترس نیستند.'}</p></section>;
 if(catalog.status==='loading')return <section className="kv-commerce-section"><h2>{props.heading}</h2><p role="status">در حال دریافت کاتالوگ…</p></section>;
 if(catalog.status!=='online')return <section className="kv-commerce-section"><h2>{props.heading}</h2><p role="status">کاتالوگ در دسترس نیست؛ اطلاعات محصولات قابل تأیید نیست.</p></section>;
 if(kind==='LiveProductStatus'){
  const item=selected[0];return <section className="kv-commerce-section kv-commerce-summary"><h2>{props.heading}</h2>{item?<><h3>{item.name}</h3><p>{formatPrice(item.price)}</p><p role="status">{!fresh?'موجودی فعلی قابل تأیید نیست.':Object.values(item.stock).some(n=>n>0)?'دست‌کم یک تنوع موجود است.':'در حال حاضر ناموجود است.'}</p><p className="kv-commerce-note">موجودی هر رنگ و سایز در صفحه محصول و هنگام سفارش دوباره بررسی می‌شود.</p><Link className="kv-commerce-link" to={`/product/${encodeURIComponent(item.id)}`}>مشاهده محصول</Link></>:<p>محصول انتخاب نشده یا دیگر فعال نیست.</p>}</section>;
 }
 if(kind==='LiveCategorySpotlight'){
  const count=category?catalog.products.filter(p=>matchesActiveCommerceCategory(p,category.id,categories)).length:0;
  return <section className="kv-commerce-section kv-commerce-summary"><h2>{props.heading}</h2>{category?<><h3>{category.name}</h3>{category.thumbnail&&<img className="kv-commerce-category-image" src={resolveImg(category.thumbnail)} alt="" loading="lazy"/>}<p>{count.toLocaleString('fa-IR')} محصول فعال</p><Link className="kv-commerce-link" to={`/products?collection=${encodeURIComponent(category.id)}`}>مشاهده دسته</Link></>:<p>دسته انتخاب نشده یا دیگر فعال نیست.</p>}</section>;
 }
 let message='';
 if((kind==='LiveAvailable'||kind==='LiveLowStock')&&!fresh)message='موجودی فعلی قابل تأیید نیست.';
 else if(kind==='LiveOrderLeaders'&&leaders.status==='loading')message='در حال دریافت آمار سفارش‌ها…';
 else if(kind==='LiveOrderLeaders'&&leaders.status==='error')message='آمار سفارش‌ها در دسترس نیست.';
 else if(kind==='LiveCategory'&&!category)message='دسته انتخاب نشده یا دیگر فعال نیست.';
 else if((kind==='LiveProduct'||kind==='LiveRelated')&&!catalog.products.some(p=>p.id===props.productId))message='محصول انتخاب نشده یا دیگر فعال نیست.';
 else if(!products.length)message=kind==='LiveWishlist'?'هنوز محصول فعالی در علاقه‌مندی‌های شما نیست.':kind==='LiveRelated'?'برای این محصول مکمل فعالی ثبت نشده است.':kind==='LiveOrderLeaders'?'سفارش ثبت‌شده‌ای برای نمایش وجود ندارد.':'محصولی برای نمایش وجود ندارد.';
 return <section className="kv-commerce-section"><h2>{props.heading}</h2>{message?<p role="status">{message}</p>:<div className="kv-commerce-grid">{products.map(product=><ProductCard key={product.id} product={product}/>)}</div>}{kind==='LiveOrderLeaders'&&!message&&<p className="kv-commerce-note">بر اساس اقلام سفارش‌های ثبت‌شده به‌جز سفارش‌های لغوشده؛ لزوماً پرداخت‌شده نیستند.</p>}{products.length>0&&<p className="kv-commerce-note">قیمت نهایی، تخفیف و موجودی در زمان سفارش بررسی می‌شود.</p>}</section>;
}
