import { useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useDialogFocus, useEscape, useScrollLock } from "@/hooks/useOverlay";
import { addDays, monthDays, monthStart, persianDate, persianMonth, persianParts, saturdayOffset, todayTehran } from "@/utils/persian-calendar";
import { faNumber } from "@/utils/admin-localization";

type Range = { from: string; to: string };
export function PersianDateRange({ value, onChange }: { value: Range; onChange: (value: Range) => void }) {
  const [open, setOpen] = useState(false);
  const text = value.from && value.to ? `${persianDate(value.from)} تا ${persianDate(value.to)}` : value.from ? `از ${persianDate(value.from)}` : value.to ? `تا ${persianDate(value.to)}` : "همه تاریخ‌ها";
  return <><button type="button" className="ord-control ord-date-trigger" onClick={() => setOpen(true)}><CalendarDays size={16} /><span>{text}</span></button>{open && <CalendarDialog value={value} close={() => setOpen(false)} apply={range => { onChange(range); setOpen(false); }} />}</>;
}
function CalendarDialog({ value, close, apply }: { value: Range; close: () => void; apply: (range: Range) => void }) {
  const ref = useRef<HTMLDivElement>(null); useDialogFocus(true, ref); useEscape(true, close); useScrollLock(true);
  const today = todayTehran(); const [range, setRange] = useState(value); const [month, setMonth] = useState(monthStart(value.from || today)); const [field, setField] = useState<"from" | "to">("from");
  const days = monthDays(month); const previousMonth = () => setMonth(monthStart(addDays(month,-1))); const nextMonth = () => setMonth(addDays(month,days.length));
  const presets: [string, () => Range][] = [
    ["امروز", () => ({ from:today, to:today })], ["دیروز", () => ({ from:addDays(today,-1), to:addDays(today,-1) })],
    ["۷ روز گذشته", () => ({ from:addDays(today,-6), to:today })], ["۳۰ روز گذشته", () => ({ from:addDays(today,-29), to:today })],
    ["این ماه", () => ({ from:monthStart(today), to:today })], ["ماه گذشته", () => { const end = addDays(monthStart(today),-1); return { from:monthStart(end), to:end }; }],
  ];
  const select = (day: string) => { if (field === "from") { setRange({ from:day, to:"" }); setField("to"); } else { setRange(v => ({ ...v, to:day })); } };
  const invalid = !!range.from && !!range.to && range.from > range.to;
  return <div className="ord-overlay ord-calendar-overlay" onClick={close}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="انتخاب بازه سفارش‌ها" className="ord-calendar" onClick={e => e.stopPropagation()}>
    <header><strong>بازه سفارش‌ها</strong><button className="ord-icon" onClick={close} aria-label="بستن"><X size={18}/></button></header>
    <div className="ord-presets">{presets.map(([name,make]) => <button key={name} className="ord-control" onClick={() => { const r = make(); setRange(r); setMonth(monthStart(r.from)); }}>{name}</button>)}<button className="ord-control" onClick={() => { setRange({from:"",to:""}); setField("from"); }}>بازه دلخواه</button></div>
    <div className="ord-date-fields"><button className="ord-control" aria-pressed={field === "from"} onClick={() => setField("from")}>از: {range.from ? persianDate(range.from) : "انتخاب کنید"}</button><button className="ord-control" aria-pressed={field === "to"} onClick={() => setField("to")}>تا: {range.to ? persianDate(range.to) : "انتخاب کنید"}</button></div>
    <div className="ord-calendar-month"><button className="ord-icon" aria-label="ماه قبل" onClick={previousMonth}><ChevronRight size={18}/></button><strong>{persianMonth(month)}</strong><button className="ord-icon" aria-label="ماه بعد" onClick={nextMonth}><ChevronLeft size={18}/></button></div>
    <div className="ord-calendar-grid" aria-label={`روزهای ${persianMonth(month)}`}><span>ش</span><span>ی</span><span>د</span><span>س</span><span>چ</span><span>پ</span><span>ج</span>{Array.from({length:saturdayOffset(days[0])},(_,i) => <span key={`blank-${i}`} />)}{days.map(day => <button key={day} type="button" aria-label={persianDate(day)} aria-pressed={range.from === day || range.to === day} className={day === range.from || day === range.to ? "is-selected" : ""} onClick={() => select(day)}>{faNumber(persianParts(day).day)}</button>)}</div>
    {invalid && <p role="alert" className="ord-calendar-error">تاریخ شروع باید پیش از پایان یا برابر آن باشد.</p>}
    <footer><button className="ord-control" onClick={() => setRange({from:"",to:""})}>پاک کردن</button><button className="ord-control ord-primary" disabled={invalid} onClick={() => apply(range)}>اعمال بازه</button></footer>
  </div></div>;
}
