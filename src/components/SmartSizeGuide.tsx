import { useMemo, useState } from "react";
import { useEscape, useScrollLock } from "@/hooks/useOverlay";
import { Check, Ruler, Sparkles, X } from "lucide-react";
import { cn } from "@/utils/cn";
import { useAuth } from "@/state/auth";
import type { SizeOption } from "@/types";

interface Props {
  sizes: SizeOption[];
  garment?: string;
  /** optional size-set measurements supplied by the admin */
  measurements?: Record<string, { chest?: number; waist?: number; hip?: number; shoulder?: number; height?: number }>;
  onPick: (size: string) => void;
  onClose: () => void;
}

interface Answers {
  height: number;
  weight: number;
  age: number;
  chest: number;
  waist: number;
  hip: number;
  shoulder: number;
  fit: "slim" | "regular" | "loose";
  fitPreference: "tight" | "normal" | "loose";
  belly: "flat" | "normal" | "round";
  shoulderShape: "narrow" | "normal" | "broad";
  braSize?: number;
}

const DEFAULT_A: Answers = { height: 170, weight: 68, age: 30, chest: 92, waist: 74, hip: 98, shoulder: 42, fit: "regular", fitPreference: "normal", belly: "normal", shoulderShape: "normal" };

const GARMENT_HINT: Record<string, { usesChest: boolean; usesWaist: boolean; label: string }> = {
  coat: { usesChest: true, usesWaist: false, label: "پالتو با آستر و فرم اورسایز" },
  jacket: { usesChest: true, usesWaist: false, label: "جاکت با لایهٔ سبک" },
  knit: { usesChest: true, usesWaist: false, label: "بافت با حجم ملایم" },
  tee: { usesChest: true, usesWaist: false, label: "تی‌شرت با برش مستقیم" },
  dress: { usesChest: true, usesWaist: true, label: "پیراهن با برش اریب" },
  skirt: { usesChest: false, usesWaist: true, label: "دامن با کمر کشدار" },
  trousers: { usesChest: false, usesWaist: true, label: "شلوار با کمر قابل تنظیم" },
  loafer: { usesChest: false, usesWaist: false, label: "کفش چرمی" },
  heel: { usesChest: false, usesWaist: false, label: "کفش پاشنه‌دار" },
  boot: { usesChest: false, usesWaist: false, label: "بوت" },
  sneaker: { usesChest: false, usesWaist: false, label: "کفش ورزشی" },
  bag: { usesChest: false, usesWaist: false, label: "کیف" },
  accessory: { usesChest: false, usesWaist: false, label: "اکسسوری" },
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

/** map the body measurements onto the shop's size labels */
export function recommendSize(sizes: SizeOption[], a: Answers, garment?: string): { size: string; confidence: number; reasons: string[]; warn?: string } {
  const labels = sizes.map((s) => s.label);
  if (labels.length === 1) return { size: labels[0], confidence: 96, reasons: ["این قطعه تک‌سایز است و با فرم آزاد طراحی شده."] };

  const numeric = labels.every((l) => /^\d+$/.test(l));
  const shoe = labels.every((l) => Number(l) >= 35 && Number(l) <= 46);
  const reasons: string[] = [];

  if (shoe) {
    const eu = Math.round(a.height / 6.6 - (a.weight > 85 ? 0 : 0.5));
    const best = labels.reduce((x, y) => (Math.abs(Number(x) - eu) <= Math.abs(Number(y) - eu) ? x : y));
    return { size: best, confidence: 78, reasons: [`بر اساس قد ${a.height} سانتی‌متر، سایز تقریبی ${best} است.`, "برای پای پهن، نیم سایز بزرگ‌تر توصیه می‌شود."] };
  }

  if (numeric) {
    const est = Math.round(a.waist + (a.fitPreference === "loose" ? 3 : a.fitPreference === "tight" ? -1 : 1));
    const best = labels.reduce((x, y) => (Math.abs(Number(x) - est) <= Math.abs(Number(y) - est) ? x : y));
    reasons.push(`دور کمر ${a.waist} سانتی‌متر؛ اندازهٔ کمر قابل تنظیم است.`);
    return { size: best, confidence: 84, reasons };
  }

  const order = ["XS", "S", "M", "L", "XL", "XXL"];
  const bmi = a.weight / Math.pow(a.height / 100, 2);
  let idx = bmi < 18.5 ? 0 : bmi < 22 ? 1 : bmi < 26 ? 2 : bmi < 30 ? 3 : 4;
  reasons.push(`شاخص تودهٔ بدنی ${bmi.toFixed(1)}`);

  if (a.chest >= 100) { idx += 1; reasons.push(`دور سینه ${a.chest} سانتی‌متر — یک سایز بالاتر`); }
  if (a.chest < 84) { idx -= 1; reasons.push(`دور سینه زیر ۸۴ سانتی‌متر`); }
  if (a.shoulderShape === "broad") { idx += 1; reasons.push("شانهٔ پهن — فضای بیشتر در ناحیهٔ شانه"); }
  if (a.shoulderShape === "narrow") reasons.push("شانهٔ باریک — خط شانه جمع‌تر");
  if (a.belly === "round") { idx += 1; reasons.push("برای راحتی ناحیهٔ شکم، سایز بالاتر"); }
  if (garment === "trousers" || garment === "skirt") {
    if (a.hip >= 104) { idx += 1; reasons.push(`دور باسن ${a.hip} سانتی‌متر`); }
    if (a.waist <= 66) { idx -= 1; reasons.push("کمر باریک"); }
  }
  if (a.fitPreference === "loose") { idx += 1; reasons.push("سلیقهٔ گشاد"); }
  if (a.fitPreference === "tight") { idx -= 1; reasons.push("سلیقهٔ تنگ"); }
  if (a.height >= 185 && (garment === "coat" || garment === "dress")) reasons.push("قد بلند — طول آستین و آستین‌های بلندتر را بررسی کن");
  if (a.height <= 158 && garment === "coat") reasons.push("قد کوتاه — طول پالتو ممکن است بلند باشد");

  idx = clamp(idx, 0, order.length - 1);
  const target = order[idx];
  const best = labels.find((l) => l === target) ?? sizes[Math.min(idx, sizes.length - 1)].label;
  const confidence = Math.round(clamp(72 + reasons.length * 4 + (labels.includes(target) ? 8 : 0), 62, 96));

  const warn = bmi >= 30 && !labels.includes("XXL") ? "این برند تا XL تولید می‌کند؛ برای فرم آزادتر با پشتیبانی تماس بگیر." : undefined;
  return { size: best, confidence, reasons: reasons.slice(0, 4), warn };
}

/** little proportional figure that morphs with the answers */
function BodyFigure({ a }: { a: Answers }) {
  const shoulderW = clamp(48 + (a.shoulder - 42) * 1.9, 30, 82);
  const chestW = clamp(40 + (a.chest - 92) * 0.7, 26, 76);
  const waistW = clamp(30 + (a.waist - 74) * 0.8 + (a.belly === "round" ? 8 : 0), 18, 68);
  const hipW = clamp(42 + (a.hip - 98) * 0.65 + (a.belly === "round" ? 4 : 0), 26, 80);
  return (
    <svg viewBox="0 0 120 190" className="ssg-figure" role="img" aria-label="نمای بدنه بر اساس اندازه‌های وارد‌شده">
      <circle cx="60" cy="24" r="15" className="ssg-head-svg" />
      <path d={`M${60 - shoulderW / 2},50 L${60 + shoulderW / 2},50 L${60 + chestW / 2 + 3},84 L${60 + waistW / 2},108 L${60 + hipW / 2},142 L${60 + hipW / 2 - 10},142 L${60 + 8},112 L${60 - 8},112 L${60 - hipW / 2 + 10},142 L${60 - hipW / 2},142 L${60 - waistW / 2},108 L${60 - chestW / 2 - 3},84 Z`} className="ssg-body-svg" />
      <line x1={60 - shoulderW / 2} y1="50" x2={60 + shoulderW / 2} y2="50" className="ssg-shoulder" />
      <line x1={60 - waistW / 2} y1="108" x2={60 + waistW / 2} y2="108" className="ssg-waist" />
      <line x1={60 - hipW / 2} y1="142" x2={60 + hipW / 2} y2="142" className="ssg-hip" />
      <text x={60} y="166" textAnchor="middle" className="ssg-cap">
        شانه {a.shoulder} · کمر {a.waist} · باسن {a.hip}
      </text>
    </svg>
  );
}

export function SmartSizeGuide({ sizes, garment, onPick, onClose }: Props) {
  useEscape(true, onClose);
  useScrollLock(true);
  const { account } = useAuth();
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>(() => {
    if (!account) return DEFAULT_A;
    const fp: Answers["fitPreference"] = account.size.fit === "slim" ? "tight" : account.size.fit === "loose" ? "loose" : "normal";
    return { ...DEFAULT_A, height: account.size.height, weight: account.size.weight, age: account.size.age, chest: account.size.chest, waist: account.size.waist, hip: account.size.hip, shoulder: account.size.shoulder, fitPreference: fp };
  });
  const result = useMemo(() => recommendSize(sizes, a, garment), [sizes, a, garment]);
  const hint = GARMENT_HINT[garment ?? ""] ?? { usesChest: true, usesWaist: false, label: "قطعهٔ پوشاک" };

  return (
    <div className="ssg-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ssg" role="dialog" aria-modal="true" aria-label="راهنمای سایز هوشمند">
        <header className="ssg-head">
          <div>
            <p className="ssg-eyebrow"><Sparkles width={13} height={13} /> راهنمای سایز هوشمند</p>
            <h3>{hint.label}</h3>
          </div>
          <button type="button" className="ssg-x" onClick={onClose} aria-label="بستن"><X width={16} height={16} /></button>
        </header>

        <div className="ssg-body">
          <div className="ssg-figure-wrap">
            <BodyFigure a={a} />
            <div className="ssg-result">
              <span className="ssg-result-label">پیشنهاد: سایز</span>
              <span className="ssg-result-size">{result.size}</span>
              <span className="ssg-result-conf">اطمینان {result.confidence.toLocaleString("fa-IR")}٪</span>
            </div>
            <button type="button" className="ssg-pick" onClick={() => { onPick(result.size); onClose(); }}>
              <Check width={15} height={15} /> انتخاب سایز {result.size}
            </button>
          </div>

          <div className="ssg-form">
            <div className="ssg-steps" role="tablist">
              {["اندازه‌ها", "فرم بدن", "سلیقه"].map((t, i) => (
                <button key={t} type="button" role="tab" aria-selected={step === i} className={cn("ssg-step", step === i && "is-on")} onClick={() => setStep(i)}>
                  {(i + 1).toLocaleString("fa-IR")}. {t}
                </button>
              ))}
            </div>

            {step === 0 && (
              <>
                <Range label="قد" value={a.height} min={145} max={205} unit="سانتی‌متر" onChange={(v) => setA({ ...a, height: v })} />
                <Range label="وزن" value={a.weight} min={40} max={140} unit="کیلوگرم" onChange={(v) => setA({ ...a, weight: v })} />
                <Range label="سن" value={a.age} min={14} max={80} unit="سال" onChange={(v) => setA({ ...a, age: v })} />
                <Range label="دور سینه" value={a.chest} min={70} max={140} unit="سانتی‌متر" onChange={(v) => setA({ ...a, chest: v })} />
                <Range label="دور کمر" value={a.waist} min={56} max={130} unit="سانتی‌متر" onChange={(v) => setA({ ...a, waist: v })} />
                <Range label="دور باسن" value={a.hip} min={78} max={140} unit="سانتی‌متر" onChange={(v) => setA({ ...a, hip: v })} />
                <Range label="عرض شانه" value={a.shoulder} min={34} max={58} unit="سانتی‌متر" onChange={(v) => setA({ ...a, shoulder: v })} />
              </>
            )}

            {step === 1 && (
              <>
                <Choice label="فرم شکم" value={a.belly} options={[["flat", "صاف"], ["normal", "عادی"], ["round", "برجسته"]]} onChange={(v) => setA({ ...a, belly: v as Answers["belly"] })} />
                <Choice label="فرم شانه" value={a.shoulderShape} options={[["narrow", "باریک"], ["normal", "عادی"], ["broad", "پهن"]]} onChange={(v) => setA({ ...a, shoulderShape: v as Answers["shoulderShape"] })} />
                <p className="ssg-hint">
                  <Ruler width={12} height={12} /> برای اندازه‌گیری عرض شانه، فاصلهٔ بین دو استخوان شانه را از پشت اندازه بگیر. دور سینه را از برجسته‌ترین نقطه و دور کمر را از باریک‌ترین نقطه بگیر.
                </p>
              </>
            )}

            {step === 2 && (
              <>
                <Choice label="چقدر تنگ یا گشاد دوست داری؟" value={a.fitPreference} options={[["tight", "تنگ"], ["normal", "معمولی"], ["loose", "گشاد"]]} onChange={(v) => setA({ ...a, fitPreference: v as Answers["fitPreference"] })} />
                <div className="ssg-reasons">
                  <p className="ssg-reasons-title">چرا این سایز پیشنهاد شد؟</p>
                  <ul>
                    {result.reasons.map((r) => (
                      <li key={r}><Check width={11} height={11} /> {r}</li>
                    ))}
                  </ul>
                  {result.warn && <p className="ssg-warn">{result.warn}</p>}
                </div>
              </>
            )}

            {step < 2 && (
              <button type="button" className="ssg-next" onClick={() => setStep(step + 1)}>
                مرحلهٔ بعد
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Range({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="ssg-range">
      <span className="ssg-range-label">
        {label}
        <b>{value.toLocaleString("fa-IR")} <small>{unit}</small></b>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </label>
  );
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: string) => void }) {
  return (
    <div className="ssg-choice">
      <span className="ssg-range-label">{label}</span>
      <div className="ssg-choice-row">
        {options.map(([v, l]) => (
          <button key={v} type="button" className={cn("ssg-opt", value === v && "is-on")} onClick={() => onChange(v)} aria-pressed={value === v}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
