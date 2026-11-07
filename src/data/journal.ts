import hero from "@/assets/editorial/hero.jpg";
import atelier from "@/assets/editorial/atelier.jpg";
import campaign from "@/assets/editorial/campaign.jpg";
import look2 from "@/assets/models/look-2.webp";
import look6 from "@/assets/models/look-6.webp";
import {useEffect,useState,useSyncExternalStore} from "react";

export interface ArticleBlock { type: "p" | "h" | "quote" | "image" | "gallery"; text:string; src?:string; images?:string[] }
export interface Post {slug:string;title:string;excerpt:string;category:string;date:string;readTime:number;image:string;imageTone:string;cutout?:boolean;featured?:boolean;blocks:ArticleBlock[];seoTitle?:string;seoDescription?:string}
type Article={slug:string;title:string;excerpt:string;category:string;body:string;coverUrl:string;publishedAt:string;seoTitle:string;seoDescription:string};
// Neutral placeholder, not sample editorial content or a remote request.
const placeholder="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='4' height='3'%3E%3C/svg%3E";
function toPost(a:Article):Post {
  return {slug:a.slug,title:a.title,excerpt:a.excerpt,category:a.category,date:new Date(a.publishedAt).toLocaleDateString("fa-IR",{year:"numeric",month:"long",day:"numeric"}),readTime:Math.max(1,Math.ceil(a.body.trim().split(/\s+/).length/200)),image:a.coverUrl || placeholder,imageTone:"#eee8df",blocks:a.body.split(/\n\s*\n/).filter(Boolean).map(text=>({type:"p",text})),seoTitle:a.seoTitle,seoDescription:a.seoDescription};
}
function valid(a:unknown):a is Article {
  if(!a||typeof a!=="object")return false;
  const x=a as Article;return [x.slug,x.title,x.excerpt,x.category,x.body,x.coverUrl,x.publishedAt,x.seoTitle,x.seoDescription].every(v=>typeof v==="string") && !!x.slug && !!x.title && Number.isFinite(Date.parse(x.publishedAt)) && (!x.coverUrl || /^\/uploads\/product-[a-f0-9-]+\.webp$/.test(x.coverUrl));
}
export const POSTS:Post[]=[];
type Status="loading"|"online"|"offline";
type JournalPageData={status:Status;enabled:boolean;items:Post[];nextCursor:string|null};
let snapshot:{status:Status;enabled:boolean;nextCursor:string|null}={status:"loading",enabled:false,nextCursor:null};
const listeners=new Set<()=>void>();
const subscribe=(fn:()=>void)=>{listeners.add(fn);return ()=>listeners.delete(fn)};
const getSnapshot=()=>snapshot;
export const useJournal=()=>useSyncExternalStore(subscribe,getSnapshot,getSnapshot);
function publish(status:Status,enabled:boolean,posts:Post[],nextCursor:string|null=null) {POSTS.splice(0,POSTS.length,...posts);snapshot={status,enabled,nextCursor};listeners.forEach(fn=>fn())}
async function fetchJournalPage(cursor:string|null) {
  const url=cursor ? `/api/public/journal?before=${encodeURIComponent(cursor)}` : "/api/public/journal";
  const response=await fetch(url,{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error("offline");const data:unknown=await response.json();
  if(!data || typeof data!=="object")throw new Error("invalid");
  const d=data as {items:unknown;enabled:unknown;nextCursor?:unknown};
  if(typeof d.enabled!=="boolean" || !Array.isArray(d.items) || d.items.length>100 || !d.items.every(valid) || (!d.enabled && d.items.length) || (d.nextCursor != null && (typeof d.nextCursor!=="string" || !/^article-[a-f0-9-]{36}$/.test(d.nextCursor))) || (!d.enabled && d.nextCursor != null)) throw new Error("invalid");
  return {enabled:d.enabled,posts:(d.items as Article[]).map(toPost),nextCursor:typeof d.nextCursor==="string"?d.nextCursor:null};
}
let pending:Promise<void>|null=null;
let refreshGeneration=0;
export function refreshJournal():Promise<void> {
  if(pending)return pending;
  const generation=++refreshGeneration;
  pending=(async()=>{try{
    const data=await fetchJournalPage(null);if(generation!==refreshGeneration)return;
    if(data.posts[0])data.posts[0].featured=true;publish("online",data.enabled,data.posts,data.nextCursor);
  }catch {if(generation===refreshGeneration)publish("offline",false,[])}finally{if(generation===refreshGeneration)pending=null}})();return pending;
}
/** One page at a time. Refreshing the shared first page revalidates the
 * currently viewed page, so unpublishing, disabling and network failures never
 * leave a previously fetched page visible indefinitely. */
export function useJournalPage(cursor:string|null,navigationKey:number):JournalPageData {
  const journal=useJournal();
  const [other,setOther]=useState<{cursor:string;navigationKey:number;revision:typeof journal;data:JournalPageData}|null>(null);
  useEffect(()=>{
    if(!cursor || journal.status!=="online" || !journal.enabled)return;
    let cancelled=false;
    setOther({cursor,navigationKey,revision:journal,data:{status:"loading",enabled:true,items:[],nextCursor:null}});
    fetchJournalPage(cursor).then(data=>{if(!cancelled)setOther({cursor,navigationKey,revision:journal,data:{status:"online",enabled:data.enabled,items:data.posts,nextCursor:data.nextCursor}})})
      .catch(()=>{if(!cancelled)setOther({cursor,navigationKey,revision:journal,data:{status:"offline",enabled:false,items:[],nextCursor:null}})});
    return ()=>{cancelled=true};
  },[cursor,journal,navigationKey]);
  if(journal.status!=="online" || !journal.enabled) return {status:journal.status,enabled:journal.enabled,items:[],nextCursor:null};
  if(!cursor)return {status:"online",enabled:true,items:POSTS,nextCursor:journal.nextCursor};
  if(other?.cursor!==cursor || other.navigationKey!==navigationKey || other.revision!==journal)return {status:"loading",enabled:true,items:[],nextCursor:null};
  return other.data;
}
let started=false;
export function startJournal(){if(started)return;started=true;void refreshJournal();window.setInterval(()=>{if(document.visibilityState==="visible")void refreshJournal()},30000);window.addEventListener("focus",()=>void refreshJournal());window.addEventListener("online",()=>void refreshJournal());window.addEventListener("offline",()=>{refreshGeneration++;pending=null;publish("offline",false,[])});}
export function useArticle(slug:string|undefined) {
  const journal=useJournal();
  const [result,setResult]=useState<{slug:string|undefined;status:"loading"|"online"|"not-found"|"offline";post?:Post}>({slug,status:"loading"});
  useEffect(()=>{
    let cancelled=false;
    async function load(){
      if(!slug){setResult({slug,status:"not-found"});return}
      try {const response=await fetch(`/api/public/journal/${encodeURIComponent(slug)}`,{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(10000)});
        if(response.status===404){if(!cancelled)setResult({slug,status:"not-found"});return}if(!response.ok)throw new Error("offline");const data:unknown=await response.json();if(!valid(data))throw new Error("invalid");if(!cancelled)setResult({slug,status:"online",post:toPost(data)});
      } catch {if(!cancelled)setResult({slug,status:"offline"})}
    }
    setResult({slug,status:"loading"});void load();return ()=>{cancelled=true};
  },[slug,journal]);
  return result.slug===slug?result:{slug,status:"loading" as const};
}
export const getPost=(slug:string|undefined)=>POSTS.find(p=>p.slug===slug);
export {hero as HERO_IMAGE,atelier as ATELIER_IMAGE,campaign as CAMPAIGN_IMAGE,look2 as LOOK2_IMAGE,look6 as LOOK6_IMAGE};
