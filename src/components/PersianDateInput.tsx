"use client";
import {useEffect, useRef} from "react";
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persianFa from "react-date-object/locales/persian_fa";

// State remains the same local Gregorian YYYY-MM-DD[THH:mm] contract expected
// by the API. Only presentation/selection is Jalali; no UTC day conversion.
export function PersianDateInput({value,onChange,label,disabled=false,withTime=false}:{value:string;onChange:(v:string)=>void;label:string;disabled?:boolean;withTime?:boolean}) {
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{const el=root.current;if(!el)return;const label=()=>{el.querySelectorAll<HTMLElement>('.rmdp-day').forEach(day=>{if(day.classList.contains('rmdp-day-hidden')){day.removeAttribute('aria-label');day.setAttribute('aria-hidden','true');day.removeAttribute('role');return}day.setAttribute('role','button');day.setAttribute('aria-pressed',String(day.classList.contains('rmdp-selected')));const old=day.getAttribute('aria-label')||'';if(old.startsWith('Choose '))day.setAttribute('aria-label',old.replace(/^Choose /,'انتخاب ').replace(' of ',' '))});el.querySelectorAll<HTMLElement>('.rmdp-arrow-container').forEach(button=>{const name=button.classList.contains('rmdp-left')?'ماه قبل':'ماه بعد';if(button.getAttribute('aria-label')!==name)button.setAttribute('aria-label',name);button.removeAttribute('aria-roledescription')})};label();const observer=new window.MutationObserver(label);observer.observe(el,{childList:true,subtree:true});return()=>observer.disconnect()},[]);
  const day=value.slice(0,10), time=value.slice(11,16) || "00:00";
  const selected=/^\d{4}-\d\d-\d\d$/.test(day)?new Date(`${day}T12:00:00`):null;
  const fa=(n:number)=>n.toLocaleString("fa-IR",{minimumIntegerDigits:2,useGrouping:false});
  return <div ref={root} className="mt-2 space-y-2" dir="rtl">
    <div className="flex items-center gap-2">
      <DatePicker key={day ? "selected" : "empty"} calendar={persian} locale={persianFa} value={selected} format="YYYY/MM/DD" disabled={disabled} editable={false}
        onChange={date=>{if(!date){onChange("");return}const d=date.toDate();const iso=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;onChange(iso+(withTime?`T${time}`:""))}}
        render={(display,open)=><button type="button" disabled={disabled} onClick={open} aria-label={label} className="min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-right text-sm disabled:opacity-50">{display || "انتخاب تاریخ شمسی"}</button>}/>
      {value&&<button type="button" disabled={disabled} onClick={()=>onChange("")} className="min-h-10 rounded-lg border border-slate-300 px-2 text-xs">پاک کردن</button>}
    </div>
    {withTime&&<div className="flex items-center gap-2 text-xs"><span>ساعت دستگاه</span><select aria-label={`${label} ساعت`} disabled={disabled||!day} value={time.slice(0,2)} onChange={e=>onChange(`${day}T${e.target.value}:${time.slice(3,5)}`)} className="rounded-lg border border-slate-300 bg-white p-2">{Array.from({length:24},(_,i)=><option key={i} value={String(i).padStart(2,"0")}>{fa(i)}</option>)}</select><span>:</span><select aria-label={`${label} دقیقه`} disabled={disabled||!day} value={time.slice(3,5)} onChange={e=>onChange(`${day}T${time.slice(0,2)}:${e.target.value}`)} className="rounded-lg border border-slate-300 bg-white p-2">{Array.from({length:60},(_,i)=><option key={i} value={String(i).padStart(2,"0")}>{fa(i)}</option>)}</select></div>}
  </div>;
}
