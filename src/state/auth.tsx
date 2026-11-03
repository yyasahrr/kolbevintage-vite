import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getAdmin } from "./admin";
import { addLog, getOps, tryonBalance, cashbackBalance } from "./ops";

/* =====================================================================
   Customer accounts — demo auth with one-time codes (OTP), saved
   addresses, size profile, wallet/cashback and try-on credits.
   All state lives in localStorage; nothing leaves the browser.
   ===================================================================== */

export interface Address {
  id: string;
  label: string;
  receiver: string;
  phone: string;
  province: string;
  city: string;
  street: string;
  postal: string;
  default: boolean;
}

export interface SizeProfile {
  height: number;
  weight: number;
  age: number;
  chest: number;
  waist: number;
  hip: number;
  shoulder: number;
  fit: "slim" | "regular" | "loose";
  shoe: number;
}

export interface Account {
  email: string;
  phone: string;
  name: string;
  password: string;
  addresses: Address[];
  size: SizeProfile;
  createdAt: number;
  loginMethod: "otp" | "password";
  twoFactor: boolean;
}

interface AuthState {
  accounts: Account[];
  email: string | null;
  otp: { email: string; phone: string; code: string; expires: number; method: "sms" | "email" } | null;
  lastError: string | null;
}

const KEY = "velours.auth.v1";

const DEMO_SIZE: SizeProfile = { height: 172, weight: 68, age: 30, chest: 92, waist: 74, hip: 98, shoulder: 42, fit: "regular", shoe: 39 };

const DEFAULT: AuthState = {
  accounts: [
    {
      email: "ava@example.com",
      phone: "09120000000",
      name: "آوا رادمهر",
      password: "demo1234",
      createdAt: Date.now() - 86400000 * 60,
      loginMethod: "otp",
      twoFactor: false,
      size: DEMO_SIZE,
      addresses: [
        { id: "a1", label: "خانه", receiver: "آوا رادمهر", phone: "09120000000", province: "تهران", city: "تهران", street: "خیابان ولیعصر، پلاک ۱۲، واحد ۳", postal: "1234567890", default: true },
        { id: "a2", label: "محل کار", receiver: "آوا رادمهر", phone: "09120000000", province: "تهران", city: "تهران", street: "خیابان جردن، برج آوا، طبقه ۷", postal: "1234567891", default: false },
      ],
    },
  ],
  email: null,
  otp: null,
  lastError: null,
};

function read(): AuthState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<AuthState>;
    return { ...DEFAULT, ...p, accounts: p.accounts?.length ? p.accounts : DEFAULT.accounts };
  } catch {
    return DEFAULT;
  }
}

function persist(s: AuthState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota */
  }
}

interface AuthValue {
  state: AuthState;
  account: Account | null;
  requestOtp: (email: string, phone: string, method: "sms" | "email") => { ok: boolean; code?: string; message: string };
  verifyOtp: (code: string) => { ok: boolean; message: string };
  loginWithPassword: (email: string, password: string) => { ok: boolean; message: string };
  register: (a: { name: string; email: string; phone: string; password: string }) => { ok: boolean; message: string };
  logout: () => void;
  updateAccount: (patch: Partial<Account>) => void;
  saveAddress: (a: Address) => void;
  removeAddress: (id: string) => void;
  setDefaultAddress: (id: string) => void;
  purchaseTryon: (credits: number, price: number) => { ok: boolean; message: string };
  login: (email: string) => void;
  balance: { tryon: number; cashback: number };
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(read);

  useEffect(() => persist(state), [state]);

  const account = useMemo(() => state.accounts.find((a) => a.email === state.email) ?? null, [state]);

  const findOrCreate = (email: string, phone = ""): Account => ({
    email,
    phone,
    name: email.split("@")[0],
    password: "",
    addresses: [],
    size: DEMO_SIZE,
    createdAt: Date.now(),
    loginMethod: "otp",
    twoFactor: false,
  });

  const requestOtp: AuthValue["requestOtp"] = useCallback((email, phone, method) => {
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return { ok: false, message: "ایمیل معتبر نیست." };
    const channels = getOps().security.otpChannels;
    if (method === "sms" && !channels.sms) return { ok: false, message: "ورود پیامکی توسط مدیر بسته شده است." };
    if (method === "email" && !channels.email) return { ok: false, message: "ورود ایمیلی توسط مدیر بسته شده است." };
    if (method === "sms" && !/^0?9\d{9}$/.test(phone.trim())) return { ok: false, message: "شمارهٔ موبایل معتبر نیست." };
    const code = String(Math.floor(100000 + Math.random() * 899999));
    setState((s) => ({ ...s, otp: { email: e, phone: phone.trim(), code, expires: Date.now() + 120000, method }, lastError: null }));
    addLog({ actor: e, action: "درخواست کد ورود", target: method === "sms" ? "پیامک" : "ایمیل" });
    return { ok: true, code, message: `کد ${method === "sms" ? "پیامکی" : "ایمیلی"} به ${method === "sms" ? phone : e} ارسال شد (نمایشی).` };
  }, []);

  const finishLogin = useCallback((email: string, method: "otp" | "password") => {
    setState((s) => {
      const exists = s.accounts.some((a) => a.email === email);
      const accounts = exists
        ? s.accounts.map((a) => (a.email === email ? { ...a, loginMethod: method } : a))
        : [...s.accounts, findOrCreate(email)];
      return { ...s, accounts, email, otp: null, lastError: null };
    });
    addLog({ actor: email, action: "ورود موفق", target: method === "otp" ? "رمز یکبار مصرف" : "رمز عبور" });
  }, []);

  const verifyOtp: AuthValue["verifyOtp"] = useCallback(
    (code) => {
      const otp = state.otp;
      if (!otp) return { ok: false, message: "اول درخواست کد بده." };
      if (Date.now() > otp.expires) return { ok: false, message: "کد منقضی شده؛ کد تازه بگیر." };
      if (code.trim() !== otp.code) return { ok: false, message: "کد درست نیست." };
      finishLogin(otp.email, "otp");
      return { ok: true, message: "خوش آمدی!" };
    },
    [state.otp, finishLogin],
  );

  const loginWithPassword: AuthValue["loginWithPassword"] = useCallback(
    (email, password) => {
      const e = email.trim().toLowerCase();
      const acc = state.accounts.find((a) => a.email === e);
      if (!acc || !acc.password) return { ok: false, message: "حسابی با این ایمیل و رمز پیدا نشد." };
      if (acc.password !== password) return { ok: false, message: "رمز عبور درست نیست." };
      finishLogin(e, "password");
      return { ok: true, message: "خوش آمدی!" };
    },
    [state.accounts, finishLogin],
  );

  const register: AuthValue["register"] = useCallback(
    ({ name, email, phone, password }) => {
      const e = email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(e)) return { ok: false, message: "ایمیل معتبر نیست." };
      if (password.length < 8) return { ok: false, message: "رمز باید حداقل ۸ کاراکتر باشد." };
      if (state.accounts.some((a) => a.email === e)) return { ok: false, message: "این ایمیل قبلاً ثبت شده؛ وارد شو." };
      if (!getOps().security.allowCustomerSignup) return { ok: false, message: "ثبت‌نام در حال حاضر بسته است." };
      setState((s) => ({ ...s, accounts: [...s.accounts, { ...findOrCreate(e, phone), name: name.trim() || e, password }], email: e, otp: null }));
      addLog({ actor: e, action: "ثبت‌نام", target: "حساب مشتری" });
      return { ok: true, message: "حساب ساخته شد." };
    },
    [state.accounts],
  );

  const logout = useCallback(() => setState((s) => ({ ...s, email: null, otp: null })), []);

  const updateAccount = useCallback(
    (patch: Partial<Account>) => {
      setState((s) => ({ ...s, accounts: s.accounts.map((a) => (a.email === s.email ? { ...a, ...patch } : a)) }));
    },
    [],
  );

  const saveAddress = useCallback(
    (addr: Address) => {
      setState((s) => ({
        ...s,
        accounts: s.accounts.map((a) => {
          if (a.email !== s.email) return a;
          const exists = a.addresses.some((x) => x.id === addr.id);
          const addresses = exists ? a.addresses.map((x) => (x.id === addr.id ? addr : x)) : [...a.addresses, addr];
          return { ...a, addresses: addr.default ? addresses.map((x) => ({ ...x, default: x.id === addr.id })) : addresses };
        }),
      }));
    },
    [],
  );

  const removeAddress = useCallback((id: string) => {
    setState((s) => ({ ...s, accounts: s.accounts.map((a) => (a.email === s.email ? { ...a, addresses: a.addresses.filter((x) => x.id !== id) } : a)) }));
  }, []);

  const setDefaultAddress = useCallback((id: string) => {
    setState((s) => ({ ...s, accounts: s.accounts.map((a) => (a.email === s.email ? { ...a, addresses: a.addresses.map((x) => ({ ...x, default: x.id === id })) } : a)) }));
  }, []);

  const purchaseTryon = useCallback(
    (credits: number, price: number) => {
      if (!state.email) return { ok: false, message: "اول وارد شو." };
      const ops = getOps();
      setState((s) => ({ ...s, accounts: s.accounts.map((a) => (a.email === s.email ? { ...a } : a)) }));
      // credits live in ops so the admin panel can see them too
      import("./ops").then((m) => m.grantTryon(state.email!, credits));
      addLog({ actor: state.email, action: "خرید بستهٔ پرو آنلاین", target: `${credits} پرو`, meta: `${price.toLocaleString("fa-IR")} تومان` });
      void ops;
      return { ok: true, message: `${credits} پرو به حسابت اضافه شد.` };
    },
    [state.email],
  );

  const login = useCallback((email: string) => setState((s) => ({ ...s, email })), []);

  const balance = useMemo(
    () => ({ tryon: state.email ? tryonBalance(state.email) : 0, cashback: state.email ? cashbackBalance(state.email) : 0 }),
    [state.email, state.accounts],
  );

  const value = useMemo<AuthValue>(
    () => ({ state, account, requestOtp, verifyOtp, loginWithPassword, register, logout, updateAccount, saveAddress, removeAddress, setDefaultAddress, purchaseTryon, login, balance }),
    [state, account, requestOtp, verifyOtp, loginWithPassword, register, logout, updateAccount, saveAddress, removeAddress, setDefaultAddress, purchaseTryon, login, balance],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** is this customer eligible for a given auto label? */
export function labelMatches(rule: { type: string; value: number }, stats: { orders: number; spend: number; idleDays: number }) {
  if (rule.type === "orders") return stats.orders >= rule.value;
  if (rule.type === "spend") return stats.spend >= rule.value;
  if (rule.type === "idle") return stats.orders > 0 && stats.idleDays >= rule.value;
  return false;
}

export { getAdmin };
