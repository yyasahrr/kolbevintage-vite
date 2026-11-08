import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, KeyRound, Mail, MessageSquare, ShieldCheck, Smartphone } from "lucide-react";
import { cn } from "@/utils/cn";
import { useAuth } from "@/state/auth";
import { useOps } from "@/state/ops";
import { buttonStyles } from "@/components/ui";
import "@/styles/account.css";

type Mode = "otp" | "password" | "register";

export function AuthPage() {
  const nav = useNavigate();
  const { requestOtp, verifyOtp, loginWithPassword, register } = useAuth();
  const ops = useOps();
  // the header links straight into a mode (ثبت‌نام / ورود) instead of a generic page
  const [params] = useSearchParams();
  const initialMode = params.get("mode");
  const nextTab = params.get("next");
  const destination = nextTab && ["overview","orders","addresses","tryon","wallet","returns","tickets","size","security"].includes(nextTab) ? `/account/${nextTab}` : "/account";
  const [mode, setMode] = useState<Mode>(
    initialMode === "register" || initialMode === "password" || initialMode === "otp" ? initialMode : "password",
  );
  const [channel, setChannel] = useState<"sms" | "email">("sms");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const flash = (r: { ok: boolean; message: string }) => setMsg({ ok: r.ok, text: r.message });

  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await requestOtp(email, phone, channel);
      flash(r);
      if (r.ok) {
        setSent(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await verifyOtp(code);
      flash(r);
      if (r.ok) nav(destination);
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await loginWithPassword(email, password);
      flash(r);
      if (r.ok) nav(destination);
    } finally {
      setBusy(false);
    }
  };

  const signUp = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await register({ name, email, phone, password });
      flash(r);
      if (r.ok) nav(destination);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-wrap">
        <aside className="auth-art">
          <Link to="/" className="auth-brand latin-track">KOLBE VINTAGE</Link>
          <div>
            <h1>حساب کلبه وینتیج</h1>
            <p>سفارش‌ها، آدرس‌ها، پرو آنلاین، کیف پول و علاقه‌مندی‌ها — همه در یک جا. وضعیت روش‌های ورود را در همین صفحه ببینید.</p>
            <ul>
              <li><Check width={13} height={13} /> پیگیری سفارش و مرجوعی</li>
              <li><Check width={13} height={13} /> کش‌بک روی هر خرید</li>
              <li><Check width={13} height={13} /> بسته‌های پرو آنلاین</li>
              <li><Check width={13} height={13} /> ذخیرهٔ اندازه‌های بدنت</li>
            </ul>
          </div>
          <p className="auth-art-foot">اتصال امن به سرور · نشست با کوکی HTTP-only</p>
        </aside>

        {/* the shell already provides <main id="main">; a second one splits the page in two */}
        <section className="auth-card">
          <div className="auth-modes" role="tablist">
            {([["otp", "کد یکبار مصرف"], ["password", "رمز عبور"], ...(ops.security.allowCustomerSignup ? [["register", "ثبت‌نام"]] : [])] as [Mode, string][]).map(([m, l]) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} className={cn("auth-mode", mode === m && "is-on")} onClick={() => { setMode(m); setMsg(null); setSent(false); }}>
                {l}
              </button>
            ))}
          </div>

          {mode === "otp" && (
            <>
              <header className="auth-head">
                <h2>ورود با کد یکبار مصرف</h2>
                <p>ورود با کد یک‌بارمصرف تا اتصال امن سرویس پیامک و ایمیل در دسترس نیست.</p>
              </header>
              <div className="auth-channels" role="group" aria-label="روش ارسال کد">
                <button type="button" disabled={!ops.security.otpChannels.sms} className={cn("auth-channel", channel === "sms" && "is-on")} onClick={() => setChannel("sms")} aria-pressed={channel === "sms"}>
                  <Smartphone width={15} height={15} /> پیامک
                </button>
                <button type="button" disabled={!ops.security.otpChannels.email} className={cn("auth-channel", channel === "email" && "is-on")} onClick={() => setChannel("email")} aria-pressed={channel === "email"}>
                  <Mail width={15} height={15} /> ایمیل
                </button>
              </div>
              <label className="auth-field">ایمیل<input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" type="email" /></label>
              {channel === "sms" && (
                <label className="auth-field">شمارهٔ موبایل<input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" /></label>
              )}
              <button type="button" className={buttonStyles("solid", "lg", "w-full")} onClick={() => void send()} disabled={busy}>
                <MessageSquare width={15} height={15} /> دریافت کد
              </button>

              {sent && (
                <div className="auth-otp">
                  <label className="auth-field">کد ۶ رقمی
                    <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} dir="ltr" inputMode="numeric" className="auth-code" placeholder="— — — — — —" />
                  </label>
                  <button type="button" className={buttonStyles("outline", "lg", "w-full")} onClick={() => void verify()} disabled={busy}>
                    <ArrowLeft width={15} height={15} /> ورود به حساب
                  </button>
                </div>
              )}
            </>
          )}

          {mode === "password" && (
            <>
              <header className="auth-head">
                <h2>ورود با رمز عبور</h2>
                <p>با ایمیل و رمز عبور حساب خود وارد شوید.</p>
              </header>
              <label className="auth-field">ایمیل<input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" type="email" /></label>
              <label className="auth-field">رمز عبور<input value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" type="password" /></label>
              <button type="button" className={buttonStyles("solid", "lg", "w-full")} onClick={() => void signIn()} disabled={busy}>
                <KeyRound width={15} height={15} /> ورود
              </button>
            </>
          )}

          {mode === "register" && (
            <>
              <header className="auth-head">
                <h2>ساخت حساب</h2>
                <p>با ثبت‌نام، کش‌بک روی خریدها فعال می‌شود و می‌توانی اندازه‌هایت را ذخیره کنی.</p>
              </header>
              <label className="auth-field">نام و نام خانوادگی<input value={name} onChange={(e) => setName(e.target.value)} /></label>
              <label className="auth-field">ایمیل<input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" type="email" /></label>
              <label className="auth-field">شمارهٔ موبایل<input value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" /></label>
              <label className="auth-field">رمز عبور (حداقل ۸ کاراکتر)<input value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" type="password" /></label>
              <button type="button" className={buttonStyles("solid", "lg", "w-full")} onClick={() => void signUp()} disabled={busy}>
                <ShieldCheck width={15} height={15} /> ثبت‌نام
              </button>
            </>
          )}

          {msg && <p className={cn("auth-msg", msg.ok ? "is-ok" : "is-bad")}>{msg.text}</p>}

          <p className="auth-terms">
            با ورود، <Link to="/about">شرایط استفاده</Link> و <Link to="/about">حریم خصوصی</Link> را می‌پذیری.
          </p>
        </section>
      </div>
    </div>
  );
}
