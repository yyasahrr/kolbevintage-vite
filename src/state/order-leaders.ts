import {useEffect,useSyncExternalStore} from 'react';
import type {OrderRank} from '../../shared/visual-commerce-selection';

type Snapshot={status:'loading'|'ready'|'error';items:OrderRank[];updatedAt:number};
let snapshot:Snapshot={status:'loading',items:[],updatedAt:0};
const listeners=new Set<()=>void>();
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener)};
const getSnapshot=()=>snapshot;
function publish(value:Snapshot){snapshot=value;listeners.forEach(listener=>listener())}
let pending:Promise<void>|null=null;
async function refresh(){
 if(pending)return pending;
 pending=(async()=>{const controller=new AbortController();const timeout=window.setTimeout(()=>controller.abort(),10000);
  try {const response=await fetch('/api/public/best-sellers?limit=24',{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('request');const data:unknown=await response.json();
   if(!data||typeof data!=='object'||!('items' in data)||!Array.isArray(data.items)||!data.items.every((x:unknown)=>!!x&&typeof x==='object'&&'productId' in x&&typeof x.productId==='string'&&'sold' in x&&typeof x.sold==='number'&&Number.isFinite(x.sold)&&x.sold>0))throw Error('response');
   publish({status:'ready',items:data.items as OrderRank[],updatedAt:Date.now()});
  }catch{publish({status:'error',items:[],updatedAt:Date.now()})}finally{window.clearTimeout(timeout)}
 })().finally(()=>{pending=null});return pending;
}
let references=0;let timer:number|undefined;
function onFocus(){if(document.visibilityState==='visible'&&Date.now()-snapshot.updatedAt>=60000)void refresh()}
function retain(){references++;if(references===1){if(!snapshot.updatedAt||Date.now()-snapshot.updatedAt>=60000)void refresh();timer=window.setInterval(onFocus,60000);window.addEventListener('focus',onFocus);document.addEventListener('visibilitychange',onFocus)}return()=>{references--;if(references===0){window.clearInterval(timer);window.removeEventListener('focus',onFocus);document.removeEventListener('visibilitychange',onFocus)}}}
/** One aggregate request shared by all order-ranking widgets; contains no customer details. */
export function useOrderLeaders(enabled:boolean){const state=useSyncExternalStore(subscribe,getSnapshot,getSnapshot);useEffect(()=>enabled?retain():undefined,[enabled]);return state}
