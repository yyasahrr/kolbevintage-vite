import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { getAdmin } from "./admin";
import { addLog, getOps, tryonBalance, cashbackBalance } from "./ops";

/* =====================================================================
   Customer accounts.

   Account writes wait for the server. Local state is never treated as proof
   that a profile, address or credential change was saved.
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

const DEFAULT: AuthState = { accounts: [], email: null, otp: null, lastError: null };

function read(): AuthState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<AuthState>;
    return { ...DEFAULT, ...p, email: null, otp: null, accounts: (p.accounts ?? []).map(account => ({ ...account, password: "" })) };
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


interface Result {
  ok: boolean;
  message: string;
  code?: string;
}

interface AuthValue {
  state: AuthState;
  account: Account | null;
  requestOtp: (email: string, phone: string, method: "sms" | "email") => Promise<Result>;
  verifyOtp: (code: string) => Promise<Result>;
  loginWithPassword: (email: string, password: string) => Promise<Result>;
  register: (a: { name: string; email: string; phone: string; password: string }) => Promise<Result>;
  logout: () => Promise<Result>;
  refreshAccount: () => Promise<Result>;
  savePhone: (phone: string, expectedPhone: string) => Promise<Result>;
  replaceAddresses: (addresses: Address[], expected: Address[]) => Promise<Result>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<Result>;
  purchaseTryon: (credits: number, price: number) => { ok: boolean; message: string };
  login: (email: string) => void;
  balance: { tryon: number; cashback: number };
  accountLoading: boolean;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(read);
  const [accountLoading, setAccountLoading] = useState(true);

  useEffect(() => persist(state), [state]);

  const account = useMemo(() => state.accounts.find((a) => a.email === state.email) ?? null, [state]);
  const sessionEpoch = useRef(0);
  const mutationEpoch = useRef(0);

  /** upsert the signed-in account coming from the API */
  const applyCustomer = useCallback((customer: Partial<Account>) => {
    if (!customer.email) return;
    sessionEpoch.current += 1;
    const email = customer.email;
    setState((s) => {
      const base =
        s.accounts.find((a) => a.email === email) ??
        ({ email, phone: "", name: email.split("@")[0], password: "", addresses: [], size: DEMO_SIZE, createdAt: Date.now(), loginMethod: "password", twoFactor: false } as Account);
      const merged: Account = { ...base, ...customer, email, password: "" };
      const accounts = s.accounts.some((a) => a.email === email)
        ? s.accounts.map((a) => (a.email === email ? merged : a))
        : [...s.accounts, merged];
      return { ...s, accounts, email, otp: null, lastError: null };
    });
  }, []);

  /* hydrate the session from the server on boot */
  useEffect(() => {
    let alive = true;
    api
      .get<{ customer: Partial<Account> | null }>("/api/auth/me")
      .then((res) => {
        if (alive && res.customer) applyCustomer(res.customer);
      })
      .catch(() => undefined)
      .finally(() => alive && setAccountLoading(false));
    return () => {
      alive = false;
    };
  }, [applyCustomer]);

  const requestOtp: AuthValue["requestOtp"] = useCallback(async (email, phone, method) => {
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return { ok: false, message: "ایمیل معتبر نیست." };
    const channels = getOps().security.otpChannels;
    if (method === "sms" && !channels.sms) return { ok: false, message: "ورود پیامکی توسط مدیر بسته شده است." };
    if (method === "email" && !channels.email) return { ok: false, message: "ورود ایمیلی توسط مدیر بسته شده است." };
    if (method === "sms" && !/^0?9\d{9}$/.test(phone.trim())) return { ok: false, message: "شمارهٔ موبایل معتبر نیست." };

    try {
      const res = await api.post<Result>("/api/auth/otp/request", { email: e, phone: phone.trim(), channel: method });
      if (!res.ok) return { ok: false, message: res.message };
      setState((s) => ({
        ...s,
        otp: { email: e, phone: phone.trim(), code: res.code ?? "", expires: Date.now() + 120000, method },
        lastError: null,
      }));
      addLog({ actor: e, action: "درخواست کد ورود", target: method === "sms" ? "پیامک" : "ایمیل" });
      return res;
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "اتصال به سرور برقرار نشد." };
    }
  }, []);

  const verifyOtp: AuthValue["verifyOtp"] = useCallback(
    async (code) => {
      const otp = state.otp;
      if (!otp) return { ok: false, message: "اول درخواست کد بده." };
      try {
        const res = await api.post<{ ok: boolean; message: string; customer?: Partial<Account> }>("/api/auth/otp/verify", {
          email: otp.email,
          code: code.trim(),
        });
        if (!res.ok) return { ok: false, message: res.message };
        if (res.customer) applyCustomer({ ...res.customer, loginMethod: "otp" });
        addLog({ actor: otp.email, action: "ورود موفق", target: "رمز یکبار مصرف" });
        return { ok: true, message: res.message || "خوش آمدی!" };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "اتصال به سرور برقرار نشد." };
      }
    },
    [state.otp, applyCustomer],
  );

  const loginWithPassword: AuthValue["loginWithPassword"] = useCallback(
    async (email, password) => {
      const e = email.trim().toLowerCase();
      try {
        const res = await api.post<{ ok: boolean; message: string; customer?: Partial<Account> }>("/api/auth/login", {
          email: e,
          password,
        });
        if (!res.ok) return { ok: false, message: res.message };
        if (res.customer) applyCustomer({ ...res.customer, loginMethod: "password" });
        addLog({ actor: e, action: "ورود موفق", target: "رمز عبور" });
        return { ok: true, message: res.message || "خوش آمدی!" };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "اتصال به سرور برقرار نشد." };
      }
    },
    [state.accounts, applyCustomer],
  );

  const register: AuthValue["register"] = useCallback(
    async ({ name, email, phone, password }) => {
      const e = email.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(e)) return { ok: false, message: "ایمیل معتبر نیست." };
      if (password.length < 8) return { ok: false, message: "رمز باید حداقل ۸ کاراکتر باشد." };
      if (!getOps().security.allowCustomerSignup) return { ok: false, message: "ثبت‌نام در حال حاضر بسته است." };

      try {
        const res = await api.post<{ ok: boolean; message: string; customer?: Partial<Account> }>("/api/auth/register", {
          name,
          email: e,
          phone,
          password,
        });
        if (!res.ok) return { ok: false, message: res.message };
        if (res.customer) applyCustomer({ ...res.customer, loginMethod: "password" });
        addLog({ actor: e, action: "ثبت‌نام", target: "حساب مشتری" });
        return { ok: true, message: res.message || "حساب ساخته شد." };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "اتصال به سرور برقرار نشد." };
      }
    },
    [state.accounts, applyCustomer],
  );

  const logout = useCallback(async ():Promise<Result> => {
    try {
      await api.post("/api/auth/logout");
      sessionEpoch.current += 1;
      setState(s=>({...s,email:null,otp:null}));
      return {ok:true,message:"خروج انجام شد."};
    } catch {
      return {ok:false,message:"خروج از حساب تأیید نشد. اتصال را بررسی و دوباره تلاش کنید؛ ممکن است نشست هنوز فعال باشد."};
    }
  }, []);

  /** Only apply a response to the same still-active UI session. */
  const acceptUpdate = useCallback((customer:Partial<Account>,subject:string,epoch:number,fields?: ("phone" | "addresses")[],expectedMutation?:number) => {
    if (!customer.email || customer.email !== subject || sessionEpoch.current !== epoch || (expectedMutation !== undefined && mutationEpoch.current !== expectedMutation)) return false;
    setState(s => {
      if (s.email !== subject || sessionEpoch.current !== epoch || (expectedMutation !== undefined && mutationEpoch.current !== expectedMutation)) return s;
      const patch = fields ? Object.fromEntries(fields.filter(key => customer[key] !== undefined).map(key => [key,customer[key]])) : customer;
      return {...s,accounts:s.accounts.map(a=>a.email === subject ? {...a,...patch,password:""} : a)};
    });
    return true;
  }, []);
  const writeError = (error:unknown):Result => {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500) return {ok:false,message:error.message,code:error.code};
    return {ok:false,message:"نتیجه ذخیره مشخص نیست. اتصال را بررسی کنید و پیش از تلاش دوباره اطلاعات حساب را تازه‌سازی کنید.",code:"uncertain"};
  };
  const refreshAccount = useCallback(async ():Promise<Result> => {
    const subject=account?.email, epoch=sessionEpoch.current, generation=mutationEpoch.current;
    if (!subject) return {ok:false,message:"ابتدا وارد حساب شوید."};
    try {
      const res=await api.get<{customer:Partial<Account>|null}>("/api/auth/me");
      if (!res.customer || !acceptUpdate(res.customer,subject,epoch,undefined,generation)) return {ok:false,message:"اطلاعات حساب هم‌زمان تغییر کرد یا نشست معتبر نیست؛ دوباره تلاش کنید."};
      return {ok:true,message:"اطلاعات حساب تازه شد."};
    } catch { return {ok:false,message:"دریافت اطلاعات حساب ناموفق بود؛ دوباره تلاش کنید."}; }
  }, [account?.email,acceptUpdate]);
  const savePhone = useCallback(async (phone:string,expectedPhone:string):Promise<Result> => {
    const subject=account?.email, epoch=sessionEpoch.current;
    if (!subject) return {ok:false,message:"ابتدا وارد حساب شوید."};
    try {
      mutationEpoch.current += 1;
      const res=await api.patch<{ok:boolean;customer:Partial<Account>}>("/api/auth/profile",{phone,expectedPhone});
      if (!res.ok || !acceptUpdate(res.customer,subject,epoch,["phone"])) return {ok:false,message:"نشست تغییر کرده است؛ دوباره وارد شوید."};
      return {ok:true,message:"شماره تماس ذخیره شد."};
    } catch(error) { return writeError(error); }
  }, [account?.email,acceptUpdate]);
  const replaceAddresses = useCallback(async (addresses:Address[],expected:Address[]):Promise<Result> => {
    const subject=account?.email, epoch=sessionEpoch.current;
    if (!subject) return {ok:false,message:"ابتدا وارد حساب شوید."};
    try {
      mutationEpoch.current += 1;
      const res=await api.put<{ok:boolean;customer:Partial<Account>}>("/api/auth/addresses",{addresses,expected});
      if (!res.ok || !acceptUpdate(res.customer,subject,epoch,["addresses"])) return {ok:false,message:"نشست تغییر کرده است؛ دوباره وارد شوید."};
      return {ok:true,message:"تغییر آدرس ذخیره شد."};
    } catch(error) { return writeError(error); }
  }, [account?.email,acceptUpdate]);
  const changePassword = useCallback(async (currentPassword:string,newPassword:string):Promise<Result> => {
    try { await api.post("/api/auth/password",{currentPassword,newPassword}); return {ok:true,message:"رمز تغییر کرد؛ نشست‌های دیگر حساب بسته شدند."}; }
    catch(error) { const result=writeError(error); return result.code === "uncertain" ? {...result,message:"نتیجه تغییر رمز مشخص نیست. برای اطمینان دوباره وارد حساب شوید."} : result; }
  }, []);

  // Do not grant an unpaid, local-only try-on credit.
  const purchaseTryon = useCallback((_credits: number, _price: number) => ({ ok: false, message: "خرید پرو مجازی هنوز به پرداخت و سرویس واقعی متصل نشده است." }), []);

  // A local action cannot create an authenticated customer session.
  const login = useCallback((_email: string) => {}, []);

  const balance = useMemo(
    () => ({ tryon: state.email ? tryonBalance(state.email) : 0, cashback: state.email ? cashbackBalance(state.email) : 0 }),
    [state.email, state.accounts],
  );

  const value = useMemo<AuthValue>(
    () => ({
      state,
      account,
      requestOtp,
      verifyOtp,
      loginWithPassword,
      register,
      logout,
      refreshAccount,
      savePhone,
      replaceAddresses,
      changePassword,
      purchaseTryon,
      login,
      balance,
      accountLoading,
    }),
    [state, account, requestOtp, verifyOtp, loginWithPassword, register, logout, refreshAccount, savePhone, replaceAddresses, changePassword, purchaseTryon, login, balance, accountLoading],
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
