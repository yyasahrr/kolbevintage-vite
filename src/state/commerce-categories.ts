import {useEffect,useSyncExternalStore} from 'react';
import type {CommerceCategory} from '../../shared/visual-commerce-selection';
export type PublicCategory=CommerceCategory&{thumbnail?:string};
type Snapshot={status:'loading'|'ready'|'error';items:PublicCategory[];updatedAt:number};
let state:Snapshot={status:'loading',items:[],updatedAt:0};const listeners=new Set<()=>void>();
const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn)};const get=()=>state;
function set(next:Snapshot){state=next;listeners.forEach(fn=>fn())}
let pending:Promise<void>|null=null;
function refresh(){if(pending)return pending;pending=(async()=>{const controller=new AbortController();const timeout=window.setTimeout(()=>controller.abort(),10000);try{const response=await fetch('/api/bootstrap',{cache:'no-store',credentials:'same-origin',signal:controller.signal});if(!response.ok)throw Error();const data=await response.json();const items=data?.ops?.categories??[];if(!Array.isArray(items)||!items.every((c:PublicCategory)=>c&&typeof c.id==='string'&&typeof c.name==='string'&&typeof c.active==='boolean'&&Array.isArray(c.garments)&&c.garments.every(x=>typeof x==='string')))throw Error();set({status:'ready',items,updatedAt:Date.now()})}catch{set({status:'error',items:[],updatedAt:Date.now()})}finally{window.clearTimeout(timeout)}})().finally(()=>{pending=null});return pending}
let refs=0;let timer:number;
function check(){if(document.visibilityState==='visible'&&Date.now()-state.updatedAt>=60000)void refresh()}
function retain(){refs++;if(refs===1){if(!state.updatedAt||Date.now()-state.updatedAt>=60000)void refresh();timer=window.setInterval(check,60000);window.addEventListener('focus',check);document.addEventListener('visibilitychange',check)}return()=>{refs--;if(!refs){window.clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check)}}}
export function useCommerceCategories(enabled:boolean){const snapshot=useSyncExternalStore(subscribe,get,get);useEffect(()=>enabled?retain():undefined,[enabled]);return snapshot}
