import { useEffect, useRef, useState } from "react";
import { Ruler } from "lucide-react";
import { api, ApiError } from "@/lib/api";

const fields = [
  ["height", "قد"], ["chest", "دور سینه"], ["waist", "دور کمر"], ["hip", "دور باسن"],
  ["shoulder", "عرض شانه"], ["sleeve", "طول آستین"], ["inseam", "قد داخل پا"],
] as const;
type Field = (typeof fields)[number][0];
type Measurements = Record<Field, number | null>;
type Form = Record<Field, string>;
const blank = (): Form => Object.fromEntries(fields.map(([name])=>[name, ""])) as Form;
const toForm = (data:Measurements|null):Form => Object.fromEntries(fields.map(([name])=>[name, data?.[name] == null ? "" : String(data[name])])) as Form;
function parse(form:Form):Measurements|null {
  const result={} as Measurements;
  for (const [name,label] of fields) {
    const value=form[name].trim().replace(/[۰-۹]/g,c=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(c))).replace(/[٠-٩]/g,c=>String("٠١٢٣٤٥٦٧٨٩".indexOf(c))).replace(/[٫،,]/g,".");
    if (!value) { result[name]=null; continue; }
    if (!/^\d{1,3}(?:\.\d)?$/.test(value) || Number(value)<1 || Number(value)>300) throw new Error(`${label} باید بین ۱ تا ۳۰۰ سانتی‌متر و حداکثر یک رقم اعشار باشد.`);
    result[name]=Number(value);
  }
  return fields.some(([name])=>result[name]!==null) ? result : null;
}

export function MeasurementsTab() {
  const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[expected,setExpected]=useState<Measurements|null>(null),[form,setForm]=useState<Form>(blank),[confirm,setConfirm]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const lock=useRef(false),alive=useRef(true);
  async function load() {
    if(lock.current)return;lock.current=true;setBusy(true);setError("");setNotice("");
    try {const data=await api.get<{measurements:Measurements|null}>("/api/auth/measurements");if(!alive.current)return;setExpected(data.measurements);setForm(toForm(data.measurements));setLoaded(true);setConfirm(false);}
    catch(err){if(alive.current){setLoaded(false);setError(err instanceof ApiError && err.status<500 ? err.message : "دریافت اندازه‌ها ناموفق بود؛ دوباره تلاش کنید.");}}
    finally{lock.current=false;if(alive.current)setBusy(false)}
  }
  useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false}},[]);
  async function save(next:Measurements|null) {
    if(lock.current||!loaded)return;lock.current=true;setBusy(true);setError("");setNotice("");
    try {const data=await api.put<{measurements:Measurements|null}>("/api/auth/measurements",{expected,measurements:next});if(!alive.current)return;setExpected(data.measurements);setForm(toForm(data.measurements));setConfirm(false);setNotice(next===null?"اندازه‌ها حذف شدند.":"اندازه‌ها در حساب ذخیره شدند.");}
    catch(err){if(alive.current)setError(err instanceof ApiError && err.status<500 ? err.message : "نتیجه ذخیره مشخص نیست؛ با همین اطلاعات دوباره تلاش کنید یا ابتدا اطلاعات سرور را دریافت کنید.");}
    finally{lock.current=false;if(alive.current)setBusy(false)}
  }
  function submit(e:React.FormEvent){e.preventDefault();try{const next=parse(form);if(next===null && expected!==null){setConfirm(true);setError("");setNotice("");return;}void save(next)}catch(err){setError(err instanceof Error?err.message:"اندازه‌ها معتبر نیستند.");setNotice("")}}
  return <section className="acc-card">
    <header><h3><Ruler width={15} height={15}/> اندازه‌های بدن من</h3></header>
    <p className="acc-muted">ثبت اندازه اختیاری است. فقط اندازه‌هایی را که می‌دانید به سانتی‌متر وارد کنید؛ جای خالی یعنی نامشخص. این اطلاعات در حساب و نسخه پشتیبان فروشگاه نگهداری می‌شود؛ در دستگاه مشترک مراقب نمایش آن باشید.</p>
    <p className="acc-muted">این صفحه فعلاً سایز پیشنهاد نمی‌دهد و تناسب لباس را تضمین نمی‌کند. جدول هر محصول را جداگانه بررسی کنید. اندازه‌های نمونه یا قدیمی به‌طور خودکار وارد نشده‌اند.</p>
    {error&&<p role="alert" className="acc-muted">{error}</p>}{notice&&<p role="status" className="acc-muted">{notice}</p>}
    {!loaded ? <p role="status" className="acc-muted">{busy?"در حال دریافت اندازه‌ها…":"اندازه‌ها در دسترس نیستند."}</p> : <form className="acc-return-form" onSubmit={submit}>
      {fields.map(([name,label])=><label className="acc-field" key={name}>{label} (سانتی‌متر)<input aria-label={`${label} به سانتی‌متر`} type="text" inputMode="decimal" maxLength={8} autoComplete="off" disabled={busy} value={form[name]} onChange={e=>{setForm(old=>({...old,[name]:e.target.value}));setConfirm(false)}} /></label>)}
      <button type="submit" className="acc-btn is-primary" disabled={busy}>{busy?"در حال ذخیره…":"ذخیره اندازه‌ها"}</button>
    </form>}
    <p className="acc-muted">بارگیری دوباره، تغییرات ذخیره‌نشده این فرم را کنار می‌گذارد.</p>
    <button type="button" className="acc-link" disabled={busy} onClick={()=>void load()}>دریافت دوباره اندازه‌ها</button>
    {loaded && expected!==null && !confirm && <p><button type="button" className="acc-btn is-danger" disabled={busy} onClick={()=>setConfirm(true)}>حذف اندازه‌های ذخیره‌شده</button></p>}
    {loaded && confirm && <div><p className="acc-muted">اندازه‌های ثبت‌شده از حساب حذف شوند؟ نسخه‌های پشتیبان قبلی ممکن است همچنان آن‌ها را داشته باشند.</p><button type="button" className="acc-btn is-danger" disabled={busy} onClick={()=>void save(null)}>بله، حذف شود</button>{" "}<button type="button" className="acc-btn" disabled={busy} onClick={()=>setConfirm(false)}>انصراف</button></div>}
  </section>;
}
