"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { VisualStudio } from "@/components/admin/VisualStudio";
import { StudioDrafts } from "@/components/admin/StudioDrafts";
import { LiveLooks } from "@/components/admin/LiveLooks";
import { LiveColors, type LibraryColor } from "@/components/admin/LiveColors";
import { SupportTickets } from "@/components/admin/SupportTickets";
import { LivePrintCenter } from "@/components/admin/LivePrintCenter";
import { LiveJournal } from "@/components/admin/LiveJournal";
import { LiveSizeSets, type SizeSet } from "@/components/admin/LiveSizeSets";
import { LiveCategories } from "@/components/admin/LiveCategories";
import { InventoryOperations } from "@/components/admin/InventoryOperations";
import { LiveOrders } from "@/components/admin/LiveOrders";
import { LiveInventory } from "@/components/admin/LiveInventory";
import { LiveProducts } from "@/components/admin/LiveProducts";
import { LiveShell } from "@/components/admin/LiveShell";
import { StylePacks } from "@/components/admin/StylePacks";
import { LiveDashboard } from "@/components/admin/LiveDashboard";
import { MarketingModule, BrandModule, SettingsModule, FinanceModule, AnalyticsModule } from "@/components/admin/CommerceModules";
import { ProductCreate } from "@/components/admin/ProductCreate";
import { ReturnsModule } from "@/components/admin/ReturnsModule";
import { GalleryModule, CustomersModule, ManualOrder, Fulfillment, StaffModule, AuditModule, ProductEditor, type Product, type Order, type Stock } from "@/components/admin/LiveModules";

type Section = "looks" | "colors" | "support" | "sizeSets" | "print" | "journal" | "dashboard" | "categories" | "products" | "inventory" | "inventoryLabels" | "inventoryActivity" | "orders" | "manual" | "fulfillment" | "gallery" | "customers" | "staff" | "audit" | "returns" | "marketing" | "brand" | "stylePacks" | "settings" | "finance" | "analytics";
type Identity = { authenticated: boolean; subject: string | null; staff?: { name: string; roleName: string } | null; permissions: string[]; openAccess: boolean };
type InventoryStock = Stock & { stockVersion:string; productId:string; reserved: number; quarantined: number; lowStock: boolean; outOfStock: boolean };

const SESSION_KEY = "kv_session_token";
let memorySession = "";
function getSession(): string {
  try { return sessionStorage.getItem(SESSION_KEY) || memorySession; } catch { return memorySession; }
}
function setSession(value: string) {
  memorySession = value;
  try { if (value) sessionStorage.setItem(SESSION_KEY, value); else sessionStorage.removeItem(SESSION_KEY); } catch { /* in-memory fallback */ }
}
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = getSession();
  if (token) headers.set("x-session-token", token);
  const res = await fetch(path, { cache: "no-store", credentials: "same-origin", ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || data.message || "خطا در ارتباط با فروشگاه"), { status: res.status, code:data.code, details:data.details });
  return data as T;
}
async function post<T>(path: string, body: object): Promise<T> {
  const { token } = await json<{ token: string }>("/api/csrf");
  return json<T>(path, { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": token }, body: JSON.stringify(body) });
}
async function patch<T>(path: string, body: object): Promise<T> {
  const { token } = await json<{ token: string }>("/api/csrf");
  return json<T>(path, { method: "PATCH", headers: { "Content-Type": "application/json", "x-csrf-token": token }, body: JSON.stringify(body) });
}
async function put<T>(path: string, body: object): Promise<T> {
  const { token } = await json<{ token: string }>("/api/csrf");
  return json<T>(path, { method: "PUT", headers: { "Content-Type": "application/json", "x-csrf-token": token }, body: JSON.stringify(body) });
}
async function upload<T>(path:string,file:File):Promise<T> {
  const {token}=await json<{token:string}>("/api/csrf");const body=new FormData();body.append("file",file);
  return json<T>(path,{method:"POST",headers:{"x-csrf-token":token},body});
}
const liveApi = { get: json, post, patch, put, upload };
const getCategories = () => json<{name:string;active:boolean;sizeSetId?:string}[]>("/api/admin/categories");
const getColors = () => json<LibraryColor[]>("/api/admin/color-library");
const getSizeSets = () => json<SizeSet[]>("/api/admin/size-sets");

export default function DashboardPage() {
  const [me, setMe] = useState<Identity | null>(null);
  const [section, setSection] = useState<Section>("dashboard");
  const appliedDirectLink=useRef(false);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [stock, setStock] = useState<InventoryStock[] | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [studioDirty,setStudioDirty]=useState(false);
  const [visualDirty,setVisualDirty]=useState(false);
  const [categoriesDirty,setCategoriesDirty]=useState(false);
  const [looksDirty,setLooksDirty]=useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<InventoryStock | null>(null);
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    setLoadRevision(n => n + 1);
    setError("");
    try {
      const identity = await json<Identity>("/api/admin/me");
      setMe(identity);
      if (!identity.authenticated) return;
      const allowed = (permission: string) => identity.permissions.includes(permission);
      const results = await Promise.allSettled([
        allowed("catalog:view") ? json<Product[]>("/api/products?all=1") : Promise.resolve(null),
        allowed("inventory:view") ? json<InventoryStock[]>("/api/commerce/admin/inventory") : Promise.resolve(null),
        allowed("orders:view") ? json<Order[]>("/api/commerce/orders?all=1&limit=200") : Promise.resolve(null),
      ]);
      setProducts(results[0].status === "fulfilled" ? results[0].value : null);
      setStock(results[1].status === "fulfilled" ? results[1].value : null);
      setOrders(results[2].status === "fulfilled" ? results[2].value : null);
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      if (failures.length) setError(`بعضی اطلاعات بارگذاری نشد: ${failures.map((f) => f.reason?.message || "خطای ارتباط").join("، ")}`);
    } catch (e) { setError(e instanceof Error ? e.message : "ارتباط با فروشگاه برقرار نشد."); }
  }, []);
  useEffect(() => { void load(); if (new URLSearchParams(window.location.search).has("unavailable")) setNotice("این بخش هنوز به فروشگاه متصل نشده و برای جلوگیری از نمایش دادهٔ نمونه غیرفعال است."); }, [load]);
  useEffect(() => {
    if (!me?.authenticated || appliedDirectLink.current) return;
    appliedDirectLink.current = true;
    if (new URLSearchParams(window.location.search).get("view") === "custom-looks") {
      if (me.permissions.includes("looks:view")) setSection("looks");
      else setNotice("برای مشاهده استایل‌ها مجوز مشاهده استایل لازم است.");
    }
    if (new URLSearchParams(window.location.search).get("view") === "color-library") {
      if (me.permissions.includes("catalog:view")) setSection("colors");
      else setNotice("برای مشاهده کتابخانه رنگ مجوز مشاهده کاتالوگ لازم است.");
    }
    if (new URLSearchParams(window.location.search).get("view") === "studio") {
      if (me.permissions.includes("design:view")) setSection("brand");
      else setNotice("برای مشاهده استودیو مجوز مشاهده طراحی لازم است.");
    }
    if (new URLSearchParams(window.location.search).get("view") === "stock-labels") {
      if (me.permissions.includes("inventory:view")) setSection("inventoryLabels");
      else setNotice("برای چاپ لیبل مجوز مشاهده انبار لازم است.");
    }
  }, [me]);
  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try { const result = await post<{ sessionToken?: string }>("/api/admin/login", { passcode }); setSession(result.sessionToken ?? ""); setPasscode(""); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "ورود ناموفق بود."); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    if((studioDirty||visualDirty||categoriesDirty||looksDirty)&&!window.confirm("تغییرات ذخیره‌نشده کنار گذاشته شوند؟"))return;
    setBusy(true); setError("");
    try { await post("/api/admin/logout", {}); setSession(""); setMe(null); setProducts(null); setStock(null); setOrders(null); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "خروج ناموفق بود."); }
    finally { setBusy(false); }
  };
  const adjust = async (e: React.FormEvent) => {
    e.preventDefault(); if (!adjusting) return;
    const amount = Number(delta);
    if (!Number.isInteger(amount) || amount === 0 || !note.trim()) { setError("تعداد صحیح غیرصفر و توضیح تغییر موجودی را وارد کنید."); return; }
    setBusy(true); setError("");
    try {
      await post("/api/commerce/admin/inventory/adjustments", { variantId: adjusting.id, delta: amount, reason: "manual", note: note.trim(), expectedVersion: adjusting.stockVersion });
      setAdjusting(null); setDelta(""); setNote("");
      await load(); setNotice("درخواست تغییر موجودی ثبت شد. وضعیت و نیاز به تأیید طبق قوانین انبار بررسی می‌شود.");
    } catch (e) { setError(e instanceof Error ? e.message : "ثبت تغییر موجودی ناموفق بود."); }
    finally { setBusy(false); }
  };
  const can = (p: string) => me?.permissions.includes(p) ?? false;
  const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
  const button = "rounded-xl bg-[#1813fb] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50";
  const input = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500";
  if (!me?.authenticated) return <main className="flex min-h-screen items-center justify-center p-5"><form onSubmit={login} className={`${card} w-full max-w-md space-y-5`}><h1 className="text-xl font-bold">ورود به پنل مدیریت کلبه وینتیج</h1><p className="text-sm leading-7 text-slate-500">با رمز مدیریت فروشگاه وارد شوید. این پنل از نشست واقعی فروشگاه استفاده می‌کند.</p>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}<label className="block text-sm">رمز مدیریت<input type="password" autoComplete="current-password" className={`${input} mt-2`} value={passcode} onChange={(e) => setPasscode(e.target.value)} required /></label><button className={`${button} w-full`} disabled={busy}>{busy ? "در حال ورود…" : "ورود"}</button><a className="block text-center text-sm text-indigo-700" href="/">بازگشت به فروشگاه</a></form></main>;
  const navigate = (next: string) => { if(((section==="brand"&&next!=="brand"&&(studioDirty||visualDirty))||(section==="categories"&&next!=="categories"&&categoriesDirty)||(section==="looks"&&next!=="looks"&&looksDirty))&&!window.confirm("تغییرات ذخیره‌نشده کنار گذاشته شوند؟"))return;setSection(next as Section); };
  return <LiveShell section={section} can={can} onNavigate={navigate} onCreate={() => setCreating(true)} onRefresh={() => void load()} onLogout={() => void logout()} busy={busy} identity={{name: me.openAccess ? "حالت بررسی" : me.staff?.name || me.subject || "مدیر", role: me.openAccess ? "دسترسی بررسی" : me.staff?.roleName || "حساب مدیریت", openAccess: me.openAccess}}>
      <div className="space-y-5">
        {me.openAccess && <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">حالت بررسی بدون رمز فعال است؛ برای محیط عملیاتی باید غیرفعال شود.</div>}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900"><AlertTriangle className="ml-2 inline" size={17}/>این نسخه فقط بخش‌های متصل‌شده را نشان می‌دهد؛ سایر قابلیت‌ها هنوز کامل نیستند. اطلاعات از پایگاه فعلی فروشگاه خوانده می‌شود و ممکن است آزمایشی باشد.</div>
        {notice && <div className="rounded-xl bg-indigo-50 p-4 text-sm text-indigo-800">{notice}<button onClick={() => setNotice("")} className="mr-3 underline">بستن</button></div>}
        {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {section === "dashboard" && <LiveDashboard api={liveApi} orders={orders} stock={stock} productsCount={products?.length ?? null} can={can} navigate={navigate} create={() => setCreating(true)}/>}
        {section === "looks" && <LiveLooks api={liveApi} can={can} onDirtyChange={setLooksDirty}/>}
        {section === "colors" && <LiveColors api={liveApi} can={can}/>}
        {section === "sizeSets" && <LiveSizeSets api={liveApi} can={can}/>}
        {section === "categories" && <LiveCategories api={liveApi} can={can} onDirtyChange={setCategoriesDirty}/>}
        {section === "products" && <LiveProducts products={products} stock={stock} can={can} create={() => setCreating(true)} edit={setEditing}/>}
        {section === "inventory" && <LiveInventory stock={stock} products={products} can={can} activity={() => navigate("inventoryActivity")} adjust={item => { setError(""); setAdjusting(item); }}/>}
        {section === "inventoryLabels" && <LiveInventory openLabels stock={stock} products={products} can={can} activity={() => navigate("inventoryActivity")} adjust={item => { setError(""); setAdjusting(item); }}/>}
        {section === "orders" && <LiveOrders refreshKey={loadRevision} can={can} navigate={navigate} api={liveApi} onChange={load}/>}
        {section === "inventoryActivity" && stock && <InventoryOperations api={liveApi} can={can} stock={stock} onChange={load}/>}
        {section === "manual" && stock && <ManualOrder api={liveApi} can={can} stock={stock} onChange={load}/>}
        {section === "fulfillment" && orders && <Fulfillment api={liveApi} can={can} orders={orders} onChange={load}/>}
        {section === "returns" && orders && <ReturnsModule api={liveApi} can={can} orders={orders} subject={me.subject} openAccess={me.openAccess} onChange={load} onElevate={async passcode => { const result = await post<{sessionToken?: string}>("/api/commerce/admin/elevate", {passcode}); setSession(result.sessionToken ?? ""); await load(); }}/>}
        {section === "marketing" && <MarketingModule api={liveApi} can={can}/>}
        {section === "stylePacks" && <StylePacks api={liveApi} can={can}/>}
        {section === "brand" && <><VisualStudio api={liveApi} can={can} onDirtyChange={setVisualDirty}/><details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-semibold">پیش‌نویس‌های قدیمی و تنظیمات برند</summary><BrandModule api={liveApi} can={can}/><StudioDrafts api={liveApi} can={can} onDirtyChange={setStudioDirty}/></details></>}
        {section === "settings" && <SettingsModule api={liveApi} can={can}/>}
        {section === "finance" && <FinanceModule api={liveApi} can={can}/>}
        {section === "analytics" && <AnalyticsModule api={liveApi} can={can}/>}
        {section === "customers" && <CustomersModule api={liveApi} can={can}/>}
        {section === "support" && <SupportTickets api={liveApi} can={can}/>}
        {section === "print" && <LivePrintCenter orders={orders} api={liveApi}/>}
        {section === "journal" && <LiveJournal api={liveApi} can={can}/>}
        {section === "gallery" && <GalleryModule api={liveApi} can={can}/>}
        {section === "staff" && <StaffModule api={liveApi} can={can}/>}
        {section === "audit" && <AuditModule api={liveApi} can={can}/>}
        {creating && <ProductCreate getCategories={getCategories} getSizeSets={getSizeSets} getColors={getColors} create={body => post("/api/admin/products",body)} onClose={() => setCreating(false)} onChange={load}/>}
        {editing && <ProductEditor api={liveApi} can={can} product={editing} onClose={() => setEditing(null)} onChange={load}/>}
        {adjusting && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={adjust} className={`${card} w-full max-w-md space-y-4`}><h2 className="font-bold">درخواست تغییر موجودی</h2><p className="text-sm">{adjusting.name} · {adjusting.sku}</p><label className="block text-sm">تعداد تغییر (برای کاهش، منفی وارد کنید)<input className={`${input} mt-2`} type="number" value={delta} onChange={(e) => setDelta(e.target.value)} required /></label><label className="block text-sm">توضیح<input className={`${input} mt-2`} value={note} onChange={(e) => setNote(e.target.value)} required /></label>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<div className="flex gap-2"><button disabled={busy} className={button}>ثبت درخواست</button><button type="button" onClick={() => setAdjusting(null)} className="px-4 text-sm">انصراف</button></div></form></div>}
      </div>
    </LiveShell>;
}
