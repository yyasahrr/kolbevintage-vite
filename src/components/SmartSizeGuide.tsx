import { useRef } from "react";
import { useDialogFocus, useEscape, useScrollLock } from "@/hooks/useOverlay";
import { Ruler, X } from "lucide-react";
import type { SizeOption } from "@/types";

type Measurements = Record<string, { chest?: number; waist?: number; hip?: number; shoulder?: number; height?: number }>;
interface Props {
  sizes: SizeOption[];
  garment?: string;
  measurements?: Measurements;
  measurementBasis?: "body" | "garment";
  availableIds?: string[];
  onPick?: (size: string) => void;
  onClose: () => void;
}
const columns = [{key:"chest",label:"دور سینه"},{key:"waist",label:"دور کمر"},{key:"hip",label:"دور باسن"},{key:"shoulder",label:"عرض شانه"},{key:"height",label:"قد"}] as const;

/** Only the merchant's category measurements are shown; the figure is illustrative. */
export function SmartSizeGuide({sizes,measurements,measurementBasis,availableIds,onPick,onClose}:Props) {
  const dialog=useRef<HTMLDivElement>(null);
  useEscape(true,onClose);useScrollLock(true);useDialogFocus(true,dialog);
  const rows=sizes.map(size=>({size,values:measurements && Object.prototype.hasOwnProperty.call(measurements,size.label) ? measurements[size.label] : undefined}));
  const hasValues=rows.some(row=>row.values && columns.some(column=>typeof row.values?.[column.key]==="number" && Number.isFinite(row.values[column.key])));
  return <div className="ssg-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <div ref={dialog} tabIndex={-1} className="ssg" role="dialog" aria-modal="true" aria-label="راهنمای سایز">
      <header className="ssg-head"><div><p className="ssg-eyebrow"><Ruler width={13} height={13}/> راهنمای سایز</p><h3>اندازه‌گیری و جدول سایز</h3></div><button type="button" className="ssg-x" onClick={onClose} aria-label="بستن"><X width={16} height={16}/></button></header>
      <div className="ssg-content">
        <div className="ssg-measure-guide">
          <div className="ssg-illustration"><img src="/size-guide-figure.webp" alt="" width="270" height="800" /></div>
          <div><p className="ssg-guide-kicker">راهنمای اندازه‌گیری</p><h4>با یک متر نرم شروع کن</h4><p>متر را صاف و بدون کشیدن، روی بدن نگه دار.</p><ul>
            <li><b>سینه</b><span>دور برجسته‌ترین قسمت سینه</span></li>
            <li><b>کمر</b><span>دور باریک‌ترین قسمت کمر</span></li>
            <li><b>باسن</b><span>دور پهن‌ترین قسمت باسن</span></li>
          </ul><small>تصویر صرفاً برای راهنمایی است و مقیاس اندازه‌گیری نیست.</small></div>
        </div>
        <div className="ssg-table-content">
          <h4>جدول اندازهٔ فروشگاه</h4>
          {hasValues?<><p>{measurementBasis==="body"?"اعداد مربوط به اندازهٔ بدن هستند.":measurementBasis==="garment"?"اعداد مربوط به اندازهٔ لباس هستند.":"مبنای این اندازه‌ها مشخص نشده است؛ پیش از خرید با فروشگاه بررسی کنید."} واحد: سانتی‌متر.</p><p>این جدول متعلق به دسته است و ممکن است اندازهٔ دقیق این محصول نباشد. خانهٔ خالی یعنی اطلاعاتی ثبت نشده است.</p>
            <div className="ssg-table-scroll" role="region" aria-label="جدول اندازه‌ها" tabIndex={0}><table><thead><tr><th scope="col">سایز</th>{columns.map(c=><th scope="col" key={c.key}>{c.label}</th>)}</tr></thead><tbody>{rows.map(({size,values})=><tr key={size.id}><th scope="row">{size.label}</th>{columns.map(c=><td key={c.key}>{typeof values?.[c.key]==="number"&&Number.isFinite(values[c.key])?values[c.key]?.toLocaleString("fa-IR"):"—"}</td>)}</tr>)}</tbody></table></div></>:<p role="status">برای این سایزها جدول اندازه‌گیری ثبت نشده است. برای انتخاب سایز با فروشگاه تماس بگیرید.</p>}
          <p>این راهنما سایز را خودکار تعیین نمی‌کند و مناسب‌بودن آن را تضمین نمی‌کند.</p>
          {onPick&&<div className="ssg-size-options" aria-label="انتخاب سایز">{sizes.map(size=><button key={size.id} type="button" disabled={!!availableIds&&!availableIds.includes(size.id)} onClick={()=>{onPick(size.label);onClose()}}>انتخاب {size.label}{availableIds&&!availableIds.includes(size.id)?" — ناموجود":""}</button>)}</div>}
        </div>
      </div>
    </div>
  </div>;
}
