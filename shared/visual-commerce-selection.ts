import {belongsToCategory} from './commerce-category';
import type {CommerceKind} from './visual-commerce-spec';
export type CommerceProduct = {id:string;name:string;category:string;garment:string;featured:boolean;stock:Record<string,number>;complements:string[]};
export type CommerceCategory = {id:string;name:string;active:boolean;parentId?:string;garments:string[]};
export type OrderRank = {productId:string;sold:number};
/** Exclude explicitly inactive child categories, without reclassifying their products via legacy garment fallback. */
export function matchesActiveCommerceCategory(product:CommerceProduct,categoryId:string,categories:CommerceCategory[]):boolean {
 if(!categories.some(c=>c.id===categoryId&&c.active))return false;
 if(categories.some(c=>!c.active&&c.name===product.category))return false;
 return belongsToCategory(product,categoryId,categories.filter(c=>c.active));
}
/** Results are always restricted to the provided active public catalogue. */
export function selectCommerceProducts<T extends CommerceProduct>(kind:CommerceKind,options:{products:T[];categories:CommerceCategory[];count:number;productId?:string;categoryId?:string;wishlist?:string[];leaders?:OrderRank[];stockFresh:boolean}):T[] {
  const {products,categories,productId,categoryId,wishlist=[],leaders=[],stockFresh}=options;
  const byId=new Map(products.map(p=>[p.id,p]));let list:T[]=[];
  const total=(p:T)=>Object.values(p.stock).reduce((sum,value)=>sum+(Number.isFinite(value)&&value>0?value:0),0);
  switch(kind){
    case 'LiveFeatured':list=products.filter(p=>p.featured);break;
    case 'LiveAvailable':list=stockFresh?products.filter(p=>total(p)>0):[];break;
    case 'LiveLowStock':list=stockFresh?products.filter(p=>total(p)>0&&total(p)<=3).sort((a,b)=>total(a)-total(b)):[];break;
    case 'LiveCategory':list=categoryId&&categories.some(c=>c.id===categoryId&&c.active)?products.filter(p=>matchesActiveCommerceCategory(p,categoryId,categories)):[];break;
    case 'LiveProduct':case 'LiveProductStatus':{const p=productId?byId.get(productId):undefined;list=p?[p]:[];break}
    case 'LiveRelated':{const p=productId?byId.get(productId):undefined;const seen=new Set<string>();list=(p?.complements??[]).flatMap(id=>{const item=byId.get(id);if(!item||seen.has(id)||id===productId)return [];seen.add(id);return [item]});break}
    case 'LiveWishlist':{const wanted=new Set(wishlist);list=products.filter(p=>wanted.has(p.id));break}
    case 'LiveOrderLeaders':{const seen=new Set<string>();list=leaders.flatMap(row=>{const p=byId.get(row.productId);if(!p||seen.has(row.productId)||!Number.isFinite(row.sold)||row.sold<=0)return [];seen.add(row.productId);return [p]});break}
  }
  return list.slice(0,Math.max(0,Math.min(12,options.count)));
}
