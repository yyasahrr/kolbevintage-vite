import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  Lightbulb,
  MapPin,
  Ruler,
  Shirt,
  Sparkles,
  Target,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { ALL_COLORS } from "@/data/catalog";
import { formatPrice, stockOf } from "@/data/looks";
import {
  OCCASIONS,
  SHAPES,
  SLOTS,
  TASTES,
  adviseSize,
  budgetCheck,
  harmony,
  hexToHsl,
  paletteScore,
  stylistNote,
  suggestFor,
  type BodyShape,
  type Occasion,
  type Profile,
  type Slot,
  type StyleTaste,
  type Suggestion,
} from "@/lib/stylist";
import { ProductThumb } from "./ProductThumb";

interface Props {
  onFinish: (picks: { productId: string; colorId: string; sizeId: string; slot: string }[], profile: Profile) => void;
}

interface Pick {
  slot: Slot;
  suggestion: Suggestion;
}

const SEASONS: { id: Profile["season"]; label: string }[] = [
  { id: "spring", label: "بهار" },
  { id: "summer", label: "تابستان" },
  { id: "autumn", label: "پاییز" },
  { id: "winter", label: "زمستان" },
];

const AGES = [
  { id: "u25", label: "زیر ۲۵", value: 22 },
  { id: "25-34", label: "۲۵ تا ۳۴", value: 30 },
  { id: "35-44", label: "۳۵ تا ۴۴", value: 40 },
  { id: "45-54", label: "۴۵ تا ۵۴", value: 50 },
  { id: "55+", label: "۵۵ به بالا", value: 60 },
];

const QUESTION_STEPS = ["موقعیت", "مکان و هوا", "سن و قد", "فرم بدن", "سلیقه", "رنگ‌ها", "بودجه"] as const;

const DEFAULT_PROFILE: Profile = {
  occasion: "casual",
  city: "تهران",
  season: "autumn",
  temp: 14,
  age: 30,
  height: 172,
  weight: 68,
  shape: "rectangle",
  taste: "minimal",
  loveColors: [],
  avoidColors: [],
  budget: 1500,
};

export function StyleWizard({ onFinish }: Props) {
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [phase, setPhase] = useState<"ask" | "pick" | "done">("ask");
  const [slotIndex, setSlotIndex] = useState(0);

  const set = (patch: Partial<Profile>) => setProfile((p) => ({ ...p, ...patch }));

  /** slots relevant to this person: heavy outerwear only when it is cold or formal */
  const activeSlots = useMemo(() => {
    const needOuter = profile.temp <= 18 || profile.occasion === "formal" || profile.occasion === "office";
    const hasDress = picks.some((p) => p.slot.id === "dress" || p.suggestion.product.garment === "dress");
    return SLOTS.filter((s) => {
      if (s.id === "outer") return needOuter;
      if (s.id === "bottom") return !hasDress;
      return true;
    });
  }, [profile.temp, profile.occasion, picks]);

  const slot = activeSlots[Math.min(slotIndex, activeSlots.length - 1)];
  const chosenSoFar = picks.map((p) => ({
    color: p.suggestion.color.hex,
    colorName: p.suggestion.color.name,
    slotLabel: p.slot.label,
    product: p.suggestion.product,
  }));
  const suggestions = useMemo(() => (slot ? suggestFor(slot, profile, chosenSoFar, 5) : []), [slot, profile, picks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const palette = picks.map((p) => p.suggestion.color.hex);
  const harmonyNow = paletteScore(palette);
  const total = picks.reduce((n, p) => n + p.suggestion.product.price, 0);
  const money = budgetCheck(picks.map((p) => ({ price: p.suggestion.product.price })), profile.budget);

  const totalSteps = QUESTION_STEPS.length + activeSlots.length + 1;
  const progress =
    phase === "ask"
      ? (step / totalSteps) * 100
      : phase === "pick"
        ? ((QUESTION_STEPS.length + slotIndex) / totalSteps) * 100
        : 100;

  const choose = (sug: Suggestion) => {
    const next = [...picks.filter((p) => p.slot.id !== slot.id), { slot, suggestion: sug }];
    setPicks(next);
    if (slotIndex + 1 >= activeSlots.length) setPhase("done");
    else setSlotIndex((i) => i + 1);
  };

  const skip = () => {
    setPicks((p) => p.filter((x) => x.slot.id !== slot.id));
    if (slotIndex + 1 >= activeSlots.length) setPhase("done");
    else setSlotIndex((i) => i + 1);
  };

  const back = () => {
    if (phase === "pick") {
      if (slotIndex === 0) {
        setPhase("ask");
        setStep(QUESTION_STEPS.length - 1);
      } else setSlotIndex((i) => i - 1);
    } else if (phase === "done") {
      setPhase("pick");
      setSlotIndex(Math.max(0, activeSlots.length - 1));
    } else setStep((s) => Math.max(0, s - 1));
  };

  const finish = () =>
    onFinish(
      picks.map((p) => ({
        productId: p.suggestion.product.id,
        colorId: p.suggestion.color.id,
        sizeId: p.suggestion.sizeId,
        slot: p.slot.id,
      })),
      profile,
    );

  return (
    <div className="sb-wizard">
      {/* progress */}
      <div className="sb-wz-progress">
        <div className="sb-wz-bar">
          <span style={{ width: `${progress}%` }} />
        </div>
        <p className="sb-wz-step">
          {phase === "ask"
            ? `پرسش ${step + 1} از ${QUESTION_STEPS.length} — ${QUESTION_STEPS[step]}`
            : phase === "pick"
              ? `انتخاب ${slotIndex + 1} از ${activeSlots.length} — ${slot?.label}`
              : "ست آماده است"}
        </p>
      </div>

      {/* live memory strip: what the wizard already knows */}
      <div className="sb-memory">
        <span className="sb-mem-title">
          <Sparkles width={13} height={13} /> آنچه تا الان می‌دانم
        </span>
        <div className="sb-mem-chips">
          <MemChip icon={<Target width={11} height={11} />} text={OCCASIONS.find((o) => o.id === profile.occasion)?.label ?? ""} />
          <MemChip icon={<MapPin width={11} height={11} />} text={`${profile.city} · ${profile.temp}°`} />
          <MemChip icon={<User width={11} height={11} />} text={`${profile.age} سال · ${profile.height} سانتی‌متر`} />
          <MemChip icon={<Ruler width={11} height={11} />} text={SHAPES.find((s) => s.id === profile.shape)?.label ?? ""} />
          <MemChip icon={<Shirt width={11} height={11} />} text={TASTES.find((t) => t.id === profile.taste)?.label ?? ""} />
          <MemChip icon={<Wallet width={11} height={11} />} text={`${profile.budget} تومان`} />
          {picks.map((p) => (
            <span key={p.slot.id} className="sb-mem-pick" title={`${p.slot.label}: ${p.suggestion.product.name}`}>
              <i style={{ background: p.suggestion.color.hex }} />
              {p.slot.label}
            </span>
          ))}
        </div>
      </div>

      {/* ---------------- questions ---------------- */}
      {phase === "ask" && (
        <div className="sb-q">
          {step === 0 && (
            <>
              <QHead title="قرار است کجا بپوشی؟" sub="موقعیت، سطح رسمیت ست را تعیین می‌کند." />
              <div className="sb-opt-grid">
                {OCCASIONS.map((o) => (
                  <OptionCard key={o.id} active={profile.occasion === o.id} title={o.label} desc={o.desc} onClick={() => set({ occasion: o.id as Occasion })} />
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <QHead title="کجا و در چه هوایی؟" sub="دما تعیین می‌کند که لایهٔ بیرونی لازم داری یا نه." />
              <div className="sb-field-row">
                <label className="sb-field">
                  شهر
                  <input value={profile.city} onChange={(e) => set({ city: e.target.value })} placeholder="مثلاً پاریس" />
                </label>
                <div className="sb-field">
                  <span>فصل</span>
                  <div className="sb-chips">
                    {SEASONS.map((s) => (
                      <Chip key={s.id} active={profile.season === s.id} onClick={() => set({ season: s.id })}>
                        {s.label}
                      </Chip>
                    ))}
                  </div>
                </div>
              </div>
              <label className="sb-field">
                دمای هوا: <b>{profile.temp}°</b>
                <input type="range" min={-5} max={40} value={profile.temp} onChange={(e) => set({ temp: Number(e.target.value) })} />
                <span className="sb-hint">{profile.temp <= 8 ? "سرد — پالتو و بافت ضخیم" : profile.temp <= 18 ? "خنک — لایهٔ سبک کافی است" : profile.temp <= 26 ? "معتدل — بدون لایهٔ اضافه" : "گرم — پارچهٔ نازک و روشن"}</span>
              </label>
            </>
          )}

          {step === 2 && (
            <>
              <QHead title="سن، قد و وزن" sub="برای پیشنهاد سایز درست و برش مناسب." />
              <div className="sb-chips">
                {AGES.map((a) => (
                  <Chip key={a.id} active={profile.age === a.value} onClick={() => set({ age: a.value })}>
                    {a.label}
                  </Chip>
                ))}
              </div>
              <div className="sb-field-row">
                <label className="sb-field">
                  قد: <b>{profile.height} سانتی‌متر</b>
                  <input type="range" min={145} max={200} value={profile.height} onChange={(e) => set({ height: Number(e.target.value) })} />
                </label>
                <label className="sb-field">
                  وزن: <b>{profile.weight} کیلوگرم</b>
                  <input type="range" min={40} max={130} value={profile.weight} onChange={(e) => set({ weight: Number(e.target.value) })} />
                </label>
              </div>
              <p className="sb-note">
                BMI تقریبی: {(profile.weight / Math.pow(profile.height / 100, 2)).toFixed(1)} — سایزها بر همین اساس پیشنهاد می‌شوند.
              </p>
            </>
          )}

          {step === 3 && (
            <>
              <QHead title="فرم بدنت کدام است؟" sub="برای تعادل حجم بین بالاتنه و پایین‌تنه." />
              <div className="sb-opt-grid">
                {SHAPES.map((s) => (
                  <OptionCard key={s.id} active={profile.shape === s.id} title={s.label} desc={s.hint} onClick={() => set({ shape: s.id as BodyShape })} />
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <QHead title="سلیقه‌ات به کدام سمت است؟" sub="این انتخاب وزن برندها و برش‌ها را عوض می‌کند." />
              <div className="sb-opt-grid">
                {TASTES.map((t) => (
                  <OptionCard key={t.id} active={profile.taste === t.id} title={t.label} onClick={() => set({ taste: t.id as StyleTaste })} />
                ))}
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <QHead title="رنگ‌ها" sub="رنگ‌های مورد علاقه امتیاز می‌گیرند؛ رنگ‌های ممنوع حذف می‌شوند." />
              <p className="sb-sub-label">دوست داری</p>
              <ColorPick selected={profile.loveColors} onToggle={(hex) => set({ loveColors: toggle(profile.loveColors, hex) })} />
              <p className="sb-sub-label">نمی‌پسندی</p>
              <ColorPick selected={profile.avoidColors} onToggle={(hex) => set({ avoidColors: toggle(profile.avoidColors, hex) })} />
            </>
          )}

          {step === 6 && (
            <>
              <QHead title="بودجهٔ کل ست" sub="قطعه‌هایی که بیش از نصف بودجه را می‌گیرند پایین‌تر می‌آیند." />
              <label className="sb-field">
                <b>{formatPrice(profile.budget)}</b>
                <input type="range" min={200} max={5000} step={100} value={profile.budget} onChange={(e) => set({ budget: Number(e.target.value) })} />
              </label>
              <div className="sb-hint-row">
                {[500, 1000, 1500, 2500, 4000].map((v) => (
                  <Chip key={v} active={profile.budget === v} onClick={() => set({ budget: v })}>
                    {v.toLocaleString("fa-IR")}
                  </Chip>
                ))}
              </div>
            </>
          )}

          <div className="sb-nav-row">
            <button type="button" className="sb-ghost" onClick={back} disabled={step === 0}>
              <ArrowRight width={14} height={14} /> قبلی
            </button>
            <button
              type="button"
              className="sb-cta is-small"
              onClick={() => (step + 1 >= QUESTION_STEPS.length ? (setPhase("pick"), setSlotIndex(0)) : setStep((s) => s + 1))}
            >
              {step + 1 >= QUESTION_STEPS.length ? "شروع پیشنهادها" : "پرسش بعدی"} <ArrowLeft width={14} height={14} />
            </button>
          </div>
        </div>
      )}

      {/* ---------------- picks ---------------- */}
      {phase === "pick" && slot && (
        <div className="sb-pick">
          <QHead
            title={slot.label}
            sub={
              picks.length
                ? `با ${picks.length.toLocaleString("fa-IR")} قطعهٔ انتخابی هماهنگ است — هماهنگی فعلی ${harmonyNow.score.toLocaleString("fa-IR")} از ۱۰۰`
                : "اولین قطعه؛ بقیه بر اساس رنگ و سبک همین پیشنهاد می‌شوند"
            }
          />

          {palette.length > 0 && (
            <div className="sb-chosen">
              {picks.map((p) => (
                <span key={p.slot.id} className="sb-chosen-chip">
                  <i style={{ background: p.suggestion.color.hex }} />
                  {p.slot.label}: {p.suggestion.product.name}
                </span>
              ))}
            </div>
          )}

          <ul className="sb-sugg">
            {suggestions.map((sug, i) => {
              const p = sug.product;
              const lastColor = palette[palette.length - 1];
              const pair = lastColor ? harmony(lastColor, sug.color.hex) : null;
              const advice = adviseSize(p, profile);
              const stock = stockOf(p, sug.color.id, sug.sizeId);
              return (
                <li key={p.id}>
                  <button type="button" className="sb-sugg-card" onClick={() => choose(sug)} disabled={stock === 0}>
                    <span className="sb-sugg-rank">{i === 0 ? "بهترین" : `#${(i + 1).toLocaleString("fa-IR")}`}</span>
                    <ProductThumb product={p} tint={sug.color.hex} className="w-[74px]" />
                    <span className="sb-sugg-main">
                      <span className="sb-sugg-name">{p.name}</span>
                      <span className="sb-sugg-meta">
                        <i className="sb-dot" style={{ background: sug.color.hex }} /> {sug.color.name} · سایز {sug.sizeLabel}
                        {advice.size !== sug.sizeLabel && <em> (پیشنهاد تو: {advice.size})</em>} · {formatPrice(p.price)}
                      </span>
                      <span className="sb-sugg-reasons">
                        {sug.reasons.map((r) => (
                          <span key={r} className="sb-reason">
                            <Check width={10} height={10} /> {r}
                          </span>
                        ))}
                        {pair && (
                          <span className="sb-reason is-harmony">
                            <Sparkles width={10} height={10} /> {pair.note}
                          </span>
                        )}
                        {sug.warnings.map((w) => (
                          <span key={w} className="sb-reason is-warn">
                            <Lightbulb width={10} height={10} /> {w}
                          </span>
                        ))}
                      </span>
                      <span className="sb-sugg-score">
                        <span className="sb-score-bar">
                          <i style={{ width: `${Math.round(Math.max(0, Math.min(1, sug.score)) * 100)}%` }} />
                        </span>
                        <small>امتیاز تناسب</small>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="sb-nav-row">
            <button type="button" className="sb-ghost" onClick={back}>
              <ArrowRight width={14} height={14} /> قبلی
            </button>
            {slot.optional && (
              <button type="button" className="sb-ghost" onClick={skip}>
                این قطعه لازم نیست
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---------------- done ---------------- */}
      {phase === "done" && (
        <div className="sb-done">
          <QHead title="ست پیشنهادی تو آماده است" sub={`${picks.length.toLocaleString("fa-IR")} قطعه · هماهنگی ${harmonyNow.score.toLocaleString("fa-IR")} از ۱۰۰ · ${formatPrice(total)}`} />

          <div className="sb-harmony sb-harmony--wide">
            <div className="sb-harm-top">
              <span className="sb-harm-label">
                <Sparkles width={13} height={13} /> هماهنگی رنگ
              </span>
              <b className={cn("sb-harm-score", harmonyNow.score >= 74 ? "is-good" : harmonyNow.score >= 58 ? "is-mid" : "is-bad")}>
                {harmonyNow.score.toLocaleString("fa-IR")}
              </b>
            </div>
            <div className="sb-harm-bar">
              <span style={{ width: `${harmonyNow.score}%` }} />
            </div>
            <p className="sb-harm-verdict">{harmonyNow.verdict}</p>
            <div className="sb-palette">
              {palette.map((h, i) => (
                <span key={i} className="sb-swatch-lg" style={{ background: h }} title={`رنگ ${Math.round(hexToHsl(h).h)}°`} />
              ))}
            </div>
            <p className="sb-note">{stylistNote(profile, picks.map((p) => ({ color: p.suggestion.color.hex })), harmonyNow.score)}</p>
            <p className={cn("sb-budget-note", money.within ? "is-ok" : "is-over")}>
              بودجه: {formatProfileBudget(profile)} — {money.note}
            </p>
          </div>

          <ul className="sb-done-list">
            {picks.map((p) => {
              const advice = adviseSize(p.suggestion.product, profile);
              return (
                <li key={p.slot.id}>
                  <ProductThumb product={p.suggestion.product} tint={p.suggestion.color.hex} className="w-[62px]" />
                  <div>
                    <p className="sb-done-slot">{p.slot.label}</p>
                    <p className="sb-done-name">{p.suggestion.product.name}</p>
                    <p className="sb-done-meta">
                      <i className="sb-dot" style={{ background: p.suggestion.color.hex }} />
                      {p.suggestion.color.name} · سایز {p.suggestion.sizeLabel} · {formatPrice(p.suggestion.product.price)}
                    </p>
                    <p className="sb-done-advice">
                      <TrendingUp width={11} height={11} /> {advice.note}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="sb-nav-row">
            <button type="button" className="sb-ghost" onClick={back}>
              <ArrowRight width={14} height={14} /> ویرایش انتخاب‌ها
            </button>
            <button type="button" className="sb-cta is-small" onClick={finish}>
              <Eye width={14} height={14} /> دیدن و چیدن روی بوم
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* bits                                                                */
/* ------------------------------------------------------------------ */

const formatProfileBudget = (p: Profile) => formatPrice(p.budget);
const toggle = (list: string[], hex: string) => (list.includes(hex) ? list.filter((x) => x !== hex) : [...list, hex]);

function QHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="sb-qhead">
      <h3>{title}</h3>
      {sub && <p>{sub}</p>}
    </div>
  );
}

function MemChip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="sb-mem-chip">
      {icon} {text}
    </span>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn("sb-chip", active && "is-on")}>
      {children}
    </button>
  );
}

function OptionCard({ active, title, desc, onClick }: { active: boolean; title: string; desc?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn("sb-opt", active && "is-on")}>
      <b>{title}</b>
      {desc && <small>{desc}</small>}
      {active && <Check className="sb-opt-check" width={14} height={14} />}
    </button>
  );
}

function ColorPick({ selected, onToggle }: { selected: string[]; onToggle: (hex: string) => void }) {
  return (
    <div className="sb-colorpick">
      {ALL_COLORS.map((c) => (
        <button
          key={c.id}
          type="button"
          title={c.name}
          aria-label={c.name}
          aria-pressed={selected.includes(c.hex)}
          onClick={() => onToggle(c.hex)}
          className={cn("sb-cp", selected.includes(c.hex) && "is-on")}
          style={{ background: c.hex }}
        />
      ))}
    </div>
  );
}
