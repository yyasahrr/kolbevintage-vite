"use client";

import React, { useState } from "react";
import {
  LayoutDashboard,
  ChartNoAxesCombined,
  ShoppingBag,
  PlusCircle,
  FolderTree,
  Palette,
  Ruler,
  Layers,
  Boxes,
  PackagePlus,
  ClipboardList,
  ShoppingCart,
  FilePlus2,
  ScanBarcode,
  Printer,
  RotateCcw,
  Megaphone,
  MessageSquareMore,
  Users,
  FileText,
  Image as ImageIcon,
  Sparkles,
  LayoutTemplate,
  Wallet,
  PlugZap,
  ShieldCheck,
  Wand2,
  UserCog,
  History,
  Settings,
  ChevronDown,
  ChevronLeft,
  Menu,
  X,
  PanelRightClose,
  PanelRightOpen,
  Lock,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  module: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface NavGroup {
  id: string;
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "overview",
    title: "نمای کلی",
    items: [
      {
        label: "داشبورد عملیات",
        href: "/",
        module: "dashboard",
        icon: LayoutDashboard,
      },
      {
        label: "آمار بازدید فروشگاه",
        href: "/analytics",
        module: "dashboard",
        icon: ChartNoAxesCombined,
      },
    ],
  },
  {
    id: "catalog",
    title: "کاتالوگ و محصولات",
    items: [
      {
        label: "محصولات",
        href: "/products",
        module: "catalog",
        icon: ShoppingBag,
      },
      {
        label: "افزودن سریع محصول",
        href: "/products/new",
        module: "catalog",
        icon: PlusCircle,
      },
      {
        label: "دسته‌بندی‌ها",
        href: "/catalog/categories",
        module: "catalog",
        icon: FolderTree,
      },
      {
        label: "کتابخانه رنگ‌ها",
        href: "/catalog/colors",
        module: "catalog",
        icon: Palette,
      },
      {
        label: "الگوهای سایز و اندازه‌گیری",
        href: "/catalog/sizes",
        module: "catalog",
        icon: Ruler,
      },
      {
        label: "استایل‌ها و ست‌های لباس",
        href: "/catalog/outfits",
        module: "catalog",
        icon: Layers,
      },
    ],
  },
  {
    id: "inventory",
    title: "انبار و موجودی کالا",
    items: [
      {
        label: "موجودی کالا و هشدارها",
        href: "/inventory",
        module: "inventory",
        icon: Boxes,
      },
      {
        label: "چاپ لیبل انبار",
        href: "/inventory/labels",
        module: "inventory",
        icon: Printer,
      },
      {
        label: "دریافت، شمارش و اصلاح",
        href: "/inventory/operations",
        module: "inventory",
        icon: PackagePlus,
      },
      {
        label: "گردش کالا (دفتر کل)",
        href: "/inventory/ledger",
        module: "inventory",
        icon: ClipboardList,
      },
    ],
  },
  {
    id: "orders",
    title: "سفارش‌ها و مرجوعی",
    items: [
      {
        label: "سفارش‌ها",
        href: "/orders",
        module: "orders",
        icon: ShoppingCart,
      },
      {
        label: "سفارش دستی",
        href: "/orders/manual",
        module: "orders",
        icon: FilePlus2,
      },
      {
        label: "برداشت، بسته‌بندی و ارسال",
        href: "/orders/fulfillment",
        module: "orders",
        icon: ScanBarcode,
      },
      {
        label: "مرکز چاپ اسناد",
        href: "/orders/print",
        module: "orders",
        icon: Printer,
      },
      {
        label: "مرجوعی و کنترل کیفیت",
        href: "/returns",
        module: "returns",
        icon: RotateCcw,
      },
    ],
  },
  {
    id: "marketing",
    title: "بازاریابی و مشتریان",
    items: [
      {
        label: "کمپین‌ها و تخفیف‌ها",
        href: "/marketing/campaigns",
        module: "marketing",
        icon: Megaphone,
      },
      {
        label: "پیامک مارکتینگ و گزارش",
        href: "/marketing/sms",
        module: "marketing",
        icon: MessageSquareMore,
      },
      {
        label: "مشتریان و گروه‌بندی CRM",
        href: "/crm/customers",
        module: "crm",
        icon: Users,
      },
      {
        label: "پشتیبانی مشتریان",
        href: "/crm/support",
        module: "crm",
        icon: MessageSquareMore,
      },
    ],
  },
  {
    id: "content",
    title: "محتوا و ظاهر سایت",
    items: [
      {
        label: "بلاگ و محتوای ویدیویی",
        href: "/content/blog",
        module: "content",
        icon: FileText,
      },
      {
        label: "گالری مشتریان و نظرات",
        href: "/content/gallery",
        module: "content",
        icon: ImageIcon,
      },
      {
        label: "پک‌های ظاهری (Style Packs)",
        href: "/appearance/style-packs",
        module: "appearance",
        icon: Sparkles,
      },
      {
        label: "استودیو طراحی (Site Studio)",
        href: "/appearance/studio",
        module: "appearance",
        icon: LayoutTemplate,
      },
    ],
  },
  {
    id: "admin",
    title: "مالی، اتصالات و تنظیمات",
    items: [
      {
        label: "نمای مالی و تراکنش‌ها",
        href: "/finance",
        module: "finance",
        icon: Wallet,
      },
      {
        label: "اتصالات و درگاه‌های BNPL",
        href: "/integrations",
        module: "integrations",
        icon: PlugZap,
      },
      {
        label: "قوانین فروش و محدودیت‌ها",
        href: "/rules",
        module: "rules",
        icon: ShieldCheck,
      },
      {
        label: "پرو مجازی (مستند تصمیم)",
        href: "/try-on",
        module: "try_on",
        icon: Wand2,
        badge: "تصمیم تجاری",
      },
      {
        label: "کارکنان و ماتریس دسترسی",
        href: "/settings/staff",
        module: "staff",
        icon: UserCog,
      },
      {
        label: "گزارش فعالیت‌ها (Audit Log)",
        href: "/settings/audit",
        module: "audit",
        icon: History,
      },
      {
        label: "تنظیمات و مستندات تحویل",
        href: "/settings",
        module: "settings",
        icon: Settings,
      },
    ],
  },
];


// Only routes migrated to the store API are interactive. The rest remain
// visible in their original location, but never expose prototype data.
const ROUTES: Record<string,{ section:string; permission:string; extra?:string; partial?:boolean }> = {
  "/": {section:"dashboard",permission:"dashboard:view"},
  "/account/security": {section:"accountSecurity",permission:""},
  "/analytics": {section:"analytics",permission:"dashboard:view"},
  "/products": {section:"products",permission:"catalog:view",partial:true},
  "/products/new": {section:"create",permission:"catalog:edit"},
  "/inventory": {section:"inventory",permission:"inventory:view"},
  "/inventory/labels": {section:"inventoryLabels",permission:"inventory:view"},
  "/catalog/outfits": {section:"looks",permission:"looks:view",partial:true},
  "/catalog/colors": {section:"colors",permission:"catalog:view"},
  "/catalog/sizes": {section:"sizeSets",permission:"catalog:view",partial:true},
  "/catalog/categories": {section:"categories",permission:"catalog:view"},
  "/inventory/operations": {section:"inventoryActivity",permission:"inventory:view"},
  "/inventory/ledger": {section:"inventoryActivity",permission:"inventory:view"},
  "/orders": {section:"orders",permission:"orders:view"},
  "/orders/manual": {section:"manual",permission:"orders:edit",extra:"inventory:view"},
  "/orders/print": {section:"print",permission:"orders:view",partial:true},
  "/orders/fulfillment": {section:"fulfillment",permission:"orders:view"},
  "/returns": {section:"returns",permission:"orders:view"},
  "/marketing/campaigns": {section:"marketing",permission:"campaigns:view",partial:true},
  "/crm/customers": {section:"customers",permission:"customers:view",partial:true},
  "/crm/support": {section:"support",permission:"customers:view"},
  "/content/blog": {section:"journal",permission:"content:view",partial:true},
  "/content/gallery": {section:"gallery",permission:"content:view",partial:true},
  "/appearance/studio": {section:"brand",permission:"design:view",partial:true},
  "/appearance/style-packs": {section:"stylePacks",permission:"design:view"},
  "/finance": {section:"finance",permission:"finance:view",partial:true},
  "/settings/staff": {section:"staff",permission:"staff:manage",partial:true},
  "/settings/audit": {section:"audit",permission:"security:view"},
  "/settings": {section:"settings",permission:"settings:view",partial:true},
};

export function LiveShell({children,section,can,onNavigate,onCreate,onRefresh,onLogout,identity,busy}:{
  children:React.ReactNode;section:string;can:(permission:string)=>boolean;
  onNavigate:(section:string)=>void;onCreate:()=>void;onRefresh:()=>void;onLogout:()=>void;
  identity:{name:string;role:string;openAccess:boolean};busy:boolean;
}) {
  const [collapsed,setCollapsed]=useState(false); const [mobileOpen,setMobileOpen]=useState(false);
  const [openGroups,setOpenGroups]=useState<Record<string,boolean>>({overview:true,catalog:true});
  const current=NAV_GROUPS.flatMap(g=>g.items).find(i=>ROUTES[i.href]?.section===section);
  const title=current?.label ?? "داشبورد عملیات";
  function nav(href:string){const route=ROUTES[href];if(!route||(route.permission&&!can(route.permission))||(route.extra&&!can(route.extra)))return;setMobileOpen(false);if(route.section==="create")onCreate();else onNavigate(route.section)}
  function sidebar(mobile=false){return <div className="flex h-full flex-col bg-white">
    <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-[#EFEFF5] px-4">
      <button onClick={()=>nav("/")} className="flex min-w-0 items-center gap-2.5 text-right"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1813FB] text-white shadow-xs"><span className="text-sm font-bold tracking-tight">KV</span></div>{(!collapsed||mobile)&&<div className="min-w-0"><div className="truncate text-sm font-bold text-[#080707]">کلبه وینتیج</div><div className="truncate text-[11px] text-[#626775]">پنل عملیات مد V3</div></div>}</button>
      {mobile?<button onClick={()=>setMobileOpen(false)} aria-label="بستن منو" className="rounded-lg p-1.5 text-[#626775] hover:bg-[#F4F5F8]"><X className="h-5 w-5"/></button>:<button onClick={()=>setCollapsed(c=>!c)} aria-label={collapsed?"باز کردن نوار کناری":"جمع کردن نوار کناری"} className="hidden rounded-lg p-1.5 text-[#626775] hover:bg-[#F4F5F8] lg:inline-flex">{collapsed?<PanelRightOpen className="h-4 w-4"/>:<PanelRightClose className="h-4 w-4"/>}</button>}
    </div>
    <nav aria-label="منوی اصلی مدیریت" className="kv-scroll-table flex-1 space-y-2 overflow-y-auto px-2.5 py-3">{NAV_GROUPS.map(group=><div key={group.id} className="space-y-0.5">{(!collapsed||mobile)&&<button type="button" onClick={()=>setOpenGroups(v=>({...v,[group.id]:!v[group.id]}))} className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-[#626775] hover:bg-[#F7F7FB] hover:text-[#080707]"><span>{group.title}</span><ChevronDown className={`h-3.5 w-3.5 transition-transform ${openGroups[group.id]?"rotate-0":"rotate-90"}`}/></button>}
      {(openGroups[group.id]||(collapsed&&!mobile))&&<div className="space-y-0.5">{group.items.map(item=>{const route=ROUTES[item.href];const permitted=!!route&&(!route.permission||can(route.permission))&&(!route.extra||can(route.extra));const active=route?.section===section&&route.section!=="create";const Icon=item.icon;return <button key={item.href} type="button" disabled={!permitted} onClick={()=>nav(item.href)} title={!route?"این بخش هنوز به فروشگاه متصل نیست":!permitted?"مجوز این بخش را ندارید":collapsed&&!mobile?item.label:undefined} className={`group relative flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-right text-[13px] transition-colors ${active?"bg-[#F0EEFF] font-semibold text-[#1813FB]":permitted?"text-[#344054] hover:bg-[#F7F7FB] hover:text-[#080707]":"text-[#98A2B3]"}`}>
        {active&&<span className="absolute bottom-2 right-0 top-2 w-1 rounded-l-full bg-[#1813FB]" aria-hidden="true"/>}<Icon className={`h-4 w-4 shrink-0 ${active?"text-[#1813FB]":permitted?"text-[#626775]":"text-[#B0B7C3]"}`}/>{(!collapsed||mobile)&&<><span className="flex-1 truncate">{item.label}</span>{!route?<span className="shrink-0 rounded-md bg-[#F4F5F8] px-1.5 py-0.5 text-[10px] text-[#626775]">متصل نشده</span>:!permitted?<Lock className="h-3.5 w-3.5 shrink-0 text-[#B0B7C3]" aria-label="نیازمند دسترسی مجاز"/>:route?.partial?<span className="shrink-0 rounded-md bg-[#F0EEFF] px-1.5 py-0.5 text-[10px] text-[#1813FB]">بخشی متصل</span>:null}</>}
      </button>})}</div>}</div>)}
    </nav>
    {(!collapsed||mobile)&&<div className="shrink-0 border-t border-[#EFEFF5] p-3"><a href="/" className="mb-3 block px-2 text-xs text-[#1813FB] hover:underline">بازگشت به فروشگاه</a><div className="rounded-xl border border-[#EFEFF5] bg-[#F7F7FB] p-2.5"><div className="flex items-center justify-between"><span className="text-[11px] font-medium text-[#626775]">نقش فعال سیستم:</span><span className="rounded-full bg-[#F0EEFF] px-2 py-0.5 text-[10px] font-semibold text-[#1813FB]">RBAC</span></div><div className="mt-1 truncate text-xs font-semibold text-[#080707]">{identity.role}</div></div></div>}
  </div>}
  return <div className="flex min-h-screen bg-[#F7F7FB] text-[#080707]">
    <aside className={`no-print hidden shrink-0 border-l border-[#E5E7EB] bg-white transition-all duration-200 lg:block ${collapsed?"w-[72px]":"w-[264px]"}`}><div className="sticky top-0 h-screen">{sidebar()}</div></aside>
    {mobileOpen&&<div className="no-print fixed inset-0 z-50 flex lg:hidden"><div className="fixed inset-0 bg-black/30 backdrop-blur-[1px]" onClick={()=>setMobileOpen(false)}/><aside className="relative z-10 h-full w-[280px] max-w-[85vw] border-l border-[#E5E7EB] bg-white shadow-xl">{sidebar(true)}</aside></div>}
    <div className="flex min-w-0 flex-1 flex-col"><header className="no-print sticky top-0 z-30 flex h-[60px] items-center justify-between gap-3 border-b border-[#E5E7EB] bg-white/95 px-3 backdrop-blur-xs sm:px-6"><div className="flex min-w-0 items-center gap-2.5"><button onClick={()=>setMobileOpen(true)} aria-label="باز کردن منوی ناوبری" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white lg:hidden"><Menu className="h-4 w-4"/></button><nav aria-label="مسیر راهنما" className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-[#626775]"><button onClick={()=>nav("/")} className="truncate hover:text-[#1813FB]">کلبه وینتیج</button><ChevronLeft className="h-3.5 w-3.5 shrink-0 text-[#98A2B3]"/><span className="truncate font-semibold text-[#080707]">{title}</span></nav></div><div className="flex shrink-0 items-center gap-2">{!identity.openAccess&&<button onClick={()=>nav("/account/security")} className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-xs">امنیت حساب</button>}<button onClick={onRefresh} disabled={busy} className="inline-flex h-9 items-center rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs hover:bg-[#F7F7FB]">به‌روزرسانی</button><div className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-2.5 text-xs sm:px-3"><div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#F0EEFF] text-[11px] font-bold text-[#1813FB]">{identity.name.slice(0,1)}</div><div className="hidden text-right md:block"><div className="font-semibold leading-tight text-[#080707]">{identity.name}</div><div className="text-[10px] leading-tight text-[#626775]">{identity.role}</div></div></div>{!identity.openAccess&&<button onClick={onLogout} disabled={busy} className="rounded-xl border border-[#E5E7EB] px-3 py-2 text-xs">خروج</button>}</div></header><main className="mx-auto w-full max-w-[1440px] min-w-0 flex-1 px-3 py-4 sm:px-6 sm:py-6">{children}</main></div>
  </div>;
}
