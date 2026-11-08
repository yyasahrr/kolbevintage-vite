import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Headset, MessageCircle, MessageSquareText, Send, X } from "lucide-react";
import { useOps } from "@/state/ops";

// Ignore placeholders and untrusted schemes/hosts: these are owner-configured links.
function socialUrl(value: string | undefined, hosts: string[]) {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && !url.username && !url.password && hosts.includes(url.hostname.toLowerCase()) && url.pathname !== "/" ? url.href : null; } catch { return null; }
}
export function SupportLauncher() {
  const [open,setOpen]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  const location=useLocation();
  const {brand}=useOps();
  const whatsapp=socialUrl(brand.socials?.whatsapp,["wa.me","api.whatsapp.com","web.whatsapp.com"]);
  const telegram=socialUrl(brand.socials?.telegram,["t.me","telegram.me"]);
  useEffect(()=>setOpen(false),[location.pathname]);
  useEffect(()=>{if(!open)return;const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){setOpen(false);ref.current?.querySelector<HTMLButtonElement>("button")?.focus()}};const outside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false)};window.addEventListener("keydown",key);document.addEventListener("pointerdown",outside);return()=>{window.removeEventListener("keydown",key);document.removeEventListener("pointerdown",outside)}},[open]);
  return <div ref={ref} className="fixed bottom-4 left-4 z-[60] flex max-w-[calc(100vw-2rem)] flex-col items-start gap-2" dir="rtl">
    <button type="button" onClick={()=>setOpen(v=>!v)} aria-expanded={open} aria-controls="support-options" className="order-last flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 text-xs font-medium text-bone shadow-lg hover:bg-ink/85"><Headset size={17}/>{open?"بستن پشتیبانی":"مشکل دارم"}{open&&<X size={14}/>}</button>
    {open&&<section id="support-options" aria-label="راه‌های پشتیبانی" className="w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-black/10 bg-paper p-4 shadow-xl"><h2 className="text-sm font-semibold">چطور کمکت کنیم؟</h2><p className="mt-1 text-xs leading-6 text-ink-70">از حساب خود تیکت ثبت کن یا از راه‌های فعال ارتباط بگیر.</p><div className="mt-3 grid gap-1.5">
      <Link to="/account/tickets" onClick={()=>setOpen(false)} className="flex min-h-11 items-center gap-2 rounded-lg bg-ink/[0.05] px-3 text-xs text-ink hover:bg-ink/10"><MessageSquareText size={16}/>ثبت و پیگیری تیکت</Link>
      {whatsapp&&<a href={whatsapp} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs text-ink hover:bg-ink/5"><MessageCircle size={16}/>واتساپ</a>}
      {telegram&&<a href={telegram} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-xs text-ink hover:bg-ink/5"><Send size={16}/>تلگرام</a>}
      {!whatsapp&&!telegram&&<p className="px-3 py-1 text-[11px] leading-5 text-ink-70">راه‌های پیام‌رسان هنوز تنظیم نشده‌اند.</p>}
    </div></section>}
  </div>;
}
