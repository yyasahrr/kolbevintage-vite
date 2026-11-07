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
let snapshot:{status:Status;enabled:boolean}={status:"loading",enabled:false};
const listeners=new Set<()=>void>();
const subscribe=(fn:()=>void)=>{listeners.add(fn);return ()=>listeners.delete(fn)};
const getSnapshot=()=>snapshot;
export const useJournal=()=>useSyncExternalStore(subscribe,getSnapshot,getSnapshot);
function publish(status:Status,enabled:boolean,posts:Post[]) {POSTS.splice(0,POSTS.length,...posts);snapshot={status,enabled};listeners.forEach(fn=>fn())}
let pending:Promise<void>|null=null;
export function refreshJournal():Promise<void> {
  if(pending)return pending;
  pending=(async()=>{try{
    const response=await fetch("/api/public/journal",{cache:"no-store",credentials:"same-origin",signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error("offline");const data:unknown=await response.json();
    if(!data || typeof data!=="object")throw new Error("invalid");
    const d=data as {items:unknown;enabled:unknown};if(typeof d.enabled!=="boolean" || !Array.isArray(d.items) || !d.items.every(valid) || (!d.enabled && d.items.length)) throw new Error("invalid");
    const posts=(d.items as Article[]).map(toPost);if(posts[0])posts[0].featured=true;publish("online",d.enabled,posts);
  }catch {publish("offline",false,[])}finally{pending=null}})();return pending;
}
let started=false;
export function startJournal(){if(started)return;started=true;void refreshJournal();window.setInterval(()=>{if(document.visibilityState==="visible")void refreshJournal()},30000);window.addEventListener("focus",()=>void refreshJournal());window.addEventListener("online",()=>void refreshJournal());window.addEventListener("offline",()=>publish("offline",false,[]));}
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
