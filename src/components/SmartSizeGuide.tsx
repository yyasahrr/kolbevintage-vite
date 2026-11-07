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

/** Displays only the merchant's measurements; there is no inferred size or
 * invented confidence score. Category-level tables are not product-specific. */
export function SmartSizeGuide({sizes,measurements,measurementBasis,availableIds,onPick,onClose}:Props) {
  const dialog=useRef<HTMLDivElement>(null);
  useEscape(true,onClose);useScrollLock(true);useDialogFocus(true,dialog);
  const rows=sizes.map(size=>({size,values:measurements && Object.prototype.hasOwnProperty.call(measurements,size.label) ? measurements[size.label] : undefined}));
  const hasValues=rows.some(row=>row.values && columns.some(column=>typeof row.values?.[column.key]==="number" && Number.isFinite(row.values[column.key])));
  return <div className="ssg-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
    <div ref={dialog} tabIndex={-1} className="ssg" role="dialog" aria-modal="true" aria-label="راهنمای سایز">
      <header className="ssg-head"><div><p className="ssg-eyebrow"><Ruler width={13} height={13}/> راهنمای سایز</p><h3>جدول اندازه‌گیری فروشگاه</h3></div><button type="button" className="ssg-x" onClick={onClose} aria-label="بستن"><X width={16} height={16}/></button></header>
      <div className="space-y-4 p-5 text-sm">
        {hasValues?<><p>{measurementBasis==="body"?"اعداد مربوط به اندازهٔ بدن هستند.":measurementBasis==="garment"?"اعداد مربوط به اندازهٔ لباس هستند.":"مبنای این اندازه‌ها مشخص نشده است؛ پیش از خرید با فروشگاه بررسی کنید."} واحد: سانتی‌متر.</p><p className="text-xs text-ink-70">این جدول متعلق به دسته است و ممکن است اندازهٔ دقیق این محصول نباشد. خانهٔ خالی یعنی اطلاعاتی ثبت نشده است.</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-right text-xs"><thead><tr><th className="p-2">سایز</th>{columns.map(c=><th key={c.key} className="p-2">{c.label}</th>)}</tr></thead><tbody>{rows.map(({size,values})=><tr key={size.id} className="border-t border-black/10"><th className="p-2">{size.label}</th>{columns.map(c=><td key={c.key} className="p-2">{typeof values?.[c.key]==="number"&&Number.isFinite(values[c.key])?values[c.key]?.toLocaleString("fa-IR"):"—"}</td>)}</tr>)}</tbody></table></div></>:<p role="status">برای این سایزها جدول اندازه‌گیری ثبت نشده است. برای انتخاب سایز با فروشگاه تماس بگیرید.</p>}
        <p className="text-xs text-ink-70">این راهنما سایز را خودکار تعیین نمی‌کند و مناسب‌بودن آن را تضمین نمی‌کند.</p>
        {onPick&&<div className="flex flex-wrap gap-2" aria-label="انتخاب سایز">{sizes.map(size=><button key={size.id} type="button" disabled={!!availableIds&&!availableIds.includes(size.id)} className="rounded-lg border border-black/15 px-3 py-2 text-xs disabled:opacity-40" onClick={()=>{onPick(size.label);onClose()}}>انتخاب {size.label}{availableIds&&!availableIds.includes(size.id)?" — ناموجود":""}</button>)}</div>}
      </div>
    </div>
  </div>;
}
