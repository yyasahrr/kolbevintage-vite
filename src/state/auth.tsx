import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, api } from "@/lib/api";
import { getAdmin } from "./admin";
import { addLog, getOps, tryonBalance, cashbackBalance } from "./ops";

/* =====================================================================
   Customer accounts.

   The provider talks to the Fastify/PostgreSQL backend when it is reachable
   (register, password login, OTP, profile, addresses) and keeps the previous
   demo behaviour as an offline fallback so the static build still works.
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

const isNetworkError = (error: unknown) => !(error instanceof ApiError);

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
  logout: () => void;
  updateAccount: (patch: Partial<Account>) => void;
  saveAddress: (a: Address) => void;
  removeAddress: (id: string) => void;
  setDefaultAddress: (id: string) => void;
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
  const accountRef = useRef<Account | null>(account);
  accountRef.current = account;

  /** upsert the signed-in account coming from the API */
  const applyCustomer = useCallback((customer: Partial<Account>) => {
    if (!customer.email) return;
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

  /* debounced profile write */
  const profileTimer = useRef<number | undefined>(undefined);
  const pushProfile = useCallback((patch: Record<string, unknown>) => {
    if (profileTimer.current) window.clearTimeout(profileTimer.current);
    profileTimer.current = window.setTimeout(() => {
      api.patch("/api/auth/profile", patch).catch(() => undefined);
    }, 500);
  }, []);

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
      if (!isNetworkError(error)) return { ok: false, message: error instanceof Error ? error.message : "ارسال کد ناموفق بود." };
      // offline demo
      const code = String(Math.floor(100000 + Math.random() * 899999));
      setState((s) => ({ ...s, otp: { email: e, phone: phone.trim(), code, expires: Date.now() + 120000, method }, lastError: null }));
      addLog({ actor: e, action: "درخواست کد ورود", target: method === "sms" ? "پیامک" : "ایمیل" });
      return { ok: true, code, message: `کد ${method === "sms" ? "پیامکی" : "ایمیلی"} به ${method === "sms" ? phone : e} ارسال شد (نمایشی).` };
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
        if (!isNetworkError(error)) return { ok: false, message: error instanceof Error ? error.message : "کد درست نیست." };
        if (Date.now() > otp.expires) return { ok: false, message: "کد منقضی شده؛ کد تازه بگیر." };
        if (code.trim() !== otp.code) return { ok: false, message: "کد درست نیست." };
        applyCustomer({ email: otp.email, phone: otp.phone, loginMethod: "otp" });
        addLog({ actor: otp.email, action: "ورود موفق", target: "رمز یکبار مصرف" });
        return { ok: true, message: "خوش آمدی!" };
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
        if (!isNetworkError(error)) return { ok: false, message: error instanceof Error ? error.message : "ورود ناموفق بود." };
        const acc = state.accounts.find((a) => a.email === e);
        if (!acc || !acc.password) return { ok: false, message: "حسابی با این ایمیل و رمز پیدا نشد." };
        if (acc.password !== password) return { ok: false, message: "رمز عبور درست نیست." };
        applyCustomer({ ...acc, loginMethod: "password" });
        addLog({ actor: e, action: "ورود موفق", target: "رمز عبور" });
        return { ok: true, message: "خوش آمدی!" };
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
        if (!isNetworkError(error)) return { ok: false, message: error instanceof Error ? error.message : "ثبت‌نام ناموفق بود." };
        if (state.accounts.some((a) => a.email === e)) return { ok: false, message: "این ایمیل قبلاً ثبت شده؛ وارد شو." };
        const acc: Account = {
          email: e,
          phone,
          name: name.trim() || e,
          password,
          addresses: [],
          size: DEMO_SIZE,
          createdAt: Date.now(),
          loginMethod: "password",
          twoFactor: false,
        };
        setState((s) => ({ ...s, accounts: [...s.accounts, acc], email: e, otp: null }));
        addLog({ actor: e, action: "ثبت‌نام", target: "حساب مشتری" });
        return { ok: true, message: "حساب ساخته شد." };
      }
    },
    [state.accounts, applyCustomer],
  );

  const logout = useCallback(() => {
    setState((s) => ({ ...s, email: null, otp: null }));
    api.post("/api/auth/logout").catch(() => undefined);
  }, []);

  const updateAccount = useCallback(
    (patch: Partial<Account>) => {
      setState((s) => ({
        ...s,
        accounts: s.accounts.map((a) => (a.email === s.email ? { ...a, ...patch } : a)),
      }));
      const serverPatch: Record<string, unknown> = {};
      if (patch.name !== undefined) serverPatch.name = patch.name;
      if (patch.phone !== undefined) serverPatch.phone = patch.phone;
      if (patch.size !== undefined) serverPatch.size = patch.size;
      if (patch.twoFactor !== undefined) serverPatch.twoFactor = patch.twoFactor;
      if (patch.password) serverPatch.password = patch.password;
      if (Object.keys(serverPatch).length) pushProfile(serverPatch);
    },
    [pushProfile],
  );

  const saveAddress = useCallback(
    (addr: Address) => {
      setState((s) => {
        const accounts = s.accounts.map((a) => {
          if (a.email !== s.email) return a;
          const exists = a.addresses.some((x) => x.id === addr.id);
          const addresses = exists ? a.addresses.map((x) => (x.id === addr.id ? addr : x)) : [...a.addresses, addr];
          const normalized = addr.default ? addresses.map((x) => ({ ...x, default: x.id === addr.id })) : addresses;
          pushProfile({ addresses: normalized });
          return { ...a, addresses: normalized };
        });
        return { ...s, accounts };
      });
    },
    [pushProfile],
  );

  const removeAddress = useCallback(
    (id: string) => {
      setState((s) => {
        const accounts = s.accounts.map((a) => {
          if (a.email !== s.email) return a;
          const addresses = a.addresses.filter((x) => x.id !== id);
          pushProfile({ addresses });
          return { ...a, addresses };
        });
        return { ...s, accounts };
      });
    },
    [pushProfile],
  );

  const setDefaultAddress = useCallback(
    (id: string) => {
      setState((s) => {
        const accounts = s.accounts.map((a) => {
          if (a.email !== s.email) return a;
          const addresses = a.addresses.map((x) => ({ ...x, default: x.id === id }));
          pushProfile({ addresses });
          return { ...a, addresses };
        });
        return { ...s, accounts };
      });
    },
    [pushProfile],
  );

  const purchaseTryon = useCallback(
    (credits: number, price: number) => {
      if (!state.email) return { ok: false, message: "اول وارد شو." };
      import("./ops").then((m) => m.grantTryon(state.email!, credits));
      addLog({ actor: state.email, action: "خرید بستهٔ پرو آنلاین", target: `${credits} پرو`, meta: `${price.toLocaleString("fa-IR")} تومان` });
      return { ok: true, message: `${credits} پرو به حسابت اضافه شد.` };
    },
    [state.email],
  );

  const login = useCallback((email: string) => {
    setState((s) => {
      const exists = s.accounts.some((a) => a.email === email);
      return { ...s, email, accounts: exists ? s.accounts : [...s.accounts, { ...DEFAULT.accounts[0], email }] };
    });
  }, []);

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
      updateAccount,
      saveAddress,
      removeAddress,
      setDefaultAddress,
      purchaseTryon,
      login,
      balance,
      accountLoading,
    }),
    [state, account, requestOtp, verifyOtp, loginWithPassword, register, logout, updateAccount, saveAddress, removeAddress, setDefaultAddress, purchaseTryon, login, balance, accountLoading],
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
