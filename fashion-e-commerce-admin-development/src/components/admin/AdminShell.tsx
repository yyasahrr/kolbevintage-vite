"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
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
  Bell,
  PanelRightClose,
  PanelRightOpen,
  Lock,
  Check,
} from "lucide-react";
import { useRole } from "./RoleContext";
import { ModuleKey, ROLE_DEFINITIONS, RoleKey } from "@/lib/permissions";

interface NavItem {
  label: string;
  href: string;
  module: ModuleKey;
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

function getBreadcrumbs(pathname: string): Array<{ label: string; href: string }> {
  const crumbs: Array<{ label: string; href: string }> = [
    { label: "کلبه وینتیج", href: "/" },
  ];
  if (pathname === "/") {
    crumbs.push({ label: "داشبورد عملیات", href: "/" });
    return crumbs;
  }

  for (const g of NAV_GROUPS) {
    for (const item of g.items) {
      if (item.href === pathname) {
        crumbs.push({ label: g.title, href: item.href });
        crumbs.push({ label: item.label, href: item.href });
        return crumbs;
      }
    }
  }

  if (pathname.startsWith("/products/")) {
    crumbs.push({ label: "محصولات", href: "/products" });
    crumbs.push({ label: "ویرایشگر پیشرفته محصول", href: pathname });
  } else if (pathname.startsWith("/orders/")) {
    crumbs.push({ label: "سفارش‌ها", href: "/orders" });
    crumbs.push({ label: "جزئیات کامل سفارش", href: pathname });
  } else {
    crumbs.push({ label: "پنل مدیریت", href: pathname });
  }
  return crumbs;
}

export function AdminShell({
  children,
  fullWidth = false,
}: {
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  const pathname = usePathname() || "/";
  const { activeRole, definition, switchRole, can, isSwitching } = useRole();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Determine which group contains active route so only active + overview are expanded by default
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = { overview: true, catalog: true };
    for (const g of NAV_GROUPS) {
      if (
        g.items.some(
          (it) =>
            it.href === pathname ||
            (it.href !== "/" && pathname.startsWith(it.href + "/"))
        )
      ) {
        initial[g.id] = true;
      }
    }
    return initial;
  });

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isActiveHref = (href: string) => {
    if (href === "/") return pathname === "/";
    if (pathname === href) return true;
    if (
      href === "/products" &&
      pathname.startsWith("/products/") &&
      pathname !== "/products/new"
    ) {
      return true;
    }
    if (
      href === "/orders" &&
      pathname.startsWith("/orders/") &&
      !["/orders/manual", "/orders/fulfillment", "/orders/print"].includes(
        pathname
      )
    ) {
      return true;
    }
    return false;
  };

  const breadcrumbs = getBreadcrumbs(pathname);

  const renderSidebarContent = (isMobileDrawer = false) => (
    <div className="flex h-full flex-col bg-white">
      {/* Brand Header */}
      <div className="flex h-[60px] items-center justify-between border-b border-[#EFEFF5] px-4 shrink-0">
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1813FB] text-white shadow-xs">
            <span className="text-sm font-bold tracking-tight">KV</span>
          </div>
          {(!collapsed || isMobileDrawer) && (
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-[#080707]">
                کلبه وینتیج
              </div>
              <div className="truncate text-[11px] text-[#626775]">
                پنل عملیات مد V3
              </div>
            </div>
          )}
        </Link>

        {isMobileDrawer ? (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="بستن منو"
            className="rounded-lg p-1.5 text-[#626775] hover:bg-[#F4F5F8] hover:text-[#080707]"
          >
            <X className="h-5 w-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "باز کردن نوار کناری" : "جمع کردن نوار کناری"}
            title={collapsed ? "باز کردن نوار کناری" : "جمع کردن نوار کناری"}
            className="hidden lg:inline-flex rounded-lg p-1.5 text-[#626775] hover:bg-[#F4F5F8] hover:text-[#080707]"
          >
            {collapsed ? (
              <PanelRightOpen className="h-4 w-4" />
            ) : (
              <PanelRightClose className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* Grouped Navigation */}
      <nav
        aria-label="منوی اصلی مدیریت"
        className="flex-1 overflow-y-auto px-2.5 py-3 space-y-2 kv-scroll-table"
      >
        {NAV_GROUPS.map((group) => {
          const isOpen = Boolean(openGroups[group.id]);
          const hasAnyPermitted = group.items.some((it) =>
            can(it.module, "view")
          );

          return (
            <div key={group.id} className="space-y-0.5">
              {(!collapsed || isMobileDrawer) && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-[#626775] hover:bg-[#F7F7FB] hover:text-[#080707]"
                >
                  <span>{group.title}</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${
                      isOpen ? "rotate-0" : "rotate-90"
                    }`}
                  />
                </button>
              )}

              {(isOpen || (collapsed && !isMobileDrawer)) && (
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = isActiveHref(item.href);
                    const permitted = can(item.module, "view");

                    if (!permitted && !hasAnyPermitted && collapsed) {
                      return null;
                    }

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        title={
                          collapsed && !isMobileDrawer ? item.label : undefined
                        }
                        className={`group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] transition-colors ${
                          active
                            ? "bg-[#F0EEFF] font-semibold text-[#1813FB]"
                            : permitted
                            ? "text-[#344054] hover:bg-[#F7F7FB] hover:text-[#080707]"
                            : "text-[#98A2B3] hover:bg-[#FAFAFE]"
                        }`}
                      >
                        {active && (
                          <span
                            className="absolute right-0 top-2 bottom-2 w-1 rounded-l-full bg-[#1813FB]"
                            aria-hidden="true"
                          />
                        )}
                        <Icon
                          className={`h-4 w-4 shrink-0 ${
                            active
                              ? "text-[#1813FB]"
                              : permitted
                              ? "text-[#626775] group-hover:text-[#080707]"
                              : "text-[#B0B7C3]"
                          }`}
                        />
                        {(!collapsed || isMobileDrawer) && (
                          <>
                            <span className="flex-1 truncate">{item.label}</span>
                            {!permitted && (
                              <Lock
                                className="h-3.5 w-3.5 text-[#B0B7C3] shrink-0"
                                aria-label="نیازمند دسترسی مجاز"
                              />
                            )}
                            {permitted && item.badge && (
                              <span className="rounded-md bg-[#F0EEFF] px-1.5 py-0.5 text-[10px] font-medium text-[#1813FB]">
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Active Role Footer Card */}
      {(!collapsed || isMobileDrawer) && (
        <div className="border-t border-[#EFEFF5] p-3 shrink-0">
          <div className="rounded-xl bg-[#F7F7FB] p-2.5 border border-[#EFEFF5]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-[#626775]">
                نقش فعال سیستم:
              </span>
              <span className="rounded-full bg-[#F0EEFF] px-2 py-0.5 text-[10px] font-semibold text-[#1813FB]">
                RBAC
              </span>
            </div>
            <div className="mt-1 truncate text-xs font-semibold text-[#080707]">
              {definition.persianTitle}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F7F7FB] text-[#080707] flex">
      {/* Desktop Persistent RTL Right Sidebar */}
      <aside
        className={`no-print hidden lg:block shrink-0 border-l border-[#E5E7EB] bg-white transition-all duration-200 ${
          collapsed ? "w-[72px]" : "w-[264px]"
        }`}
      >
        <div className="sticky top-0 h-screen">{renderSidebarContent(false)}</div>
      </aside>

      {/* Mobile Slide-Over RTL Drawer */}
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 w-[280px] max-w-[85vw] h-full border-l border-[#E5E7EB] bg-white shadow-xl">
            {renderSidebarContent(true)}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="no-print sticky top-0 z-30 flex h-[60px] items-center justify-between gap-3 border-b border-[#E5E7EB] bg-white/95 backdrop-blur-xs px-3 sm:px-6">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="باز کردن منوی ناوبری"
              className="inline-flex lg:hidden h-9 w-9 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#080707] hover:bg-[#F7F7FB]"
            >
              <Menu className="h-4 w-4" />
            </button>

            {/* Breadcrumbs */}
            <nav
              aria-label="مسیر راهنما"
              className="flex items-center gap-1.5 text-xs text-[#626775] min-w-0 overflow-hidden"
            >
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={`${crumb.href}-${idx}`}>
                  {idx > 0 && (
                    <ChevronLeft className="h-3.5 w-3.5 text-[#98A2B3] shrink-0" />
                  )}
                  <Link
                    href={crumb.href}
                    className={`truncate ${
                      idx === breadcrumbs.length - 1
                        ? "font-semibold text-[#080707]"
                        : "hover:text-[#1813FB]"
                    }`}
                  >
                    {crumb.label}
                  </Link>
                </React.Fragment>
              ))}
            </nav>
          </div>

          {/* Right/Left End Controls: Operational Notifications & Employee Role Switcher */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Operational Alerts Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((o) => !o);
                  setRoleMenuOpen(false);
                }}
                aria-label="هشدارهای عملیاتی"
                className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5E7EB] bg-white text-[#4B505E] hover:bg-[#F7F7FB] hover:text-[#080707]"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-[#1813FB]" />
              </button>

              {notifOpen && (
                <div className="absolute left-0 mt-2 w-80 max-w-[90vw] rounded-2xl border border-[#E5E7EB] bg-white p-3.5 shadow-lg z-40">
                  <div className="flex items-center justify-between border-b border-[#EFEFF5] pb-2">
                    <span className="text-xs font-semibold text-[#080707]">
                      هشدارهای عملیاتی زنده
                    </span>
                    <span className="rounded-full bg-[#F0EEFF] px-2 py-0.5 text-[10px] font-semibold text-[#1813FB]">
                      تاییدشده
                    </span>
                  </div>
                  <div className="mt-2.5 space-y-2 text-xs">
                    <Link
                      href="/inventory"
                      onClick={() => setNotifOpen(false)}
                      className="block rounded-xl bg-[#FFFAEB] border border-[#FEDF89] p-2.5 hover:bg-[#FEF3C7]/60"
                    >
                      <div className="font-semibold text-[#9A5B04]">
                        هشدار کم‌موجودی SKU در انبار
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#7A4905]">
                        برخی تنوع‌های پالتو آوین و پیراهن برکه به زیر آستانه مجاز رسیده‌اند.
                      </div>
                    </Link>
                    <Link
                      href="/orders"
                      onClick={() => setNotifOpen(false)}
                      className="block rounded-xl bg-[#FEF3F2] border border-[#FECDCA] p-2.5 hover:bg-[#FEE4E2]/60"
                    >
                      <div className="font-semibold text-[#B44F40]">
                        مغایرت استعلام درگاه پرداخت
                      </div>
                      <div className="mt-0.5 text-[11px] text-[#8A3427]">
                        سفارش KV-40984 در وضعیت انتظار استعلام بانکی است.
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Active Employee & Role Switcher */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setRoleMenuOpen((o) => !o);
                  setNotifOpen(false);
                }}
                disabled={isSwitching}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-2.5 sm:px-3 text-xs hover:bg-[#F7F7FB]"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#F0EEFF] text-[11px] font-bold text-[#1813FB]">
                  {definition.actorName.slice(0, 1)}
                </div>
                <div className="hidden md:block text-right">
                  <div className="font-semibold text-[#080707] leading-tight">
                    {definition.actorName.split(" (")[0]}
                  </div>
                  <div className="text-[10px] text-[#626775] leading-tight">
                    {definition.persianTitle}
                  </div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-[#626775]" />
              </button>

              {roleMenuOpen && (
                <div className="absolute left-0 mt-2 w-72 max-w-[92vw] rounded-2xl border border-[#E5E7EB] bg-white p-2 shadow-lg z-40">
                  <div className="px-2.5 py-1.5 border-b border-[#EFEFF5]">
                    <div className="text-[11px] font-semibold text-[#080707]">
                      شبیه‌سازی تغییر نقش کارمند (RBAC)
                    </div>
                    <div className="text-[10px] text-[#626775]">
                      سطح دسترسی منوها و APIها بر اساس نقش تغییر می‌کند
                    </div>
                  </div>
                  <div className="mt-1.5 max-h-80 overflow-y-auto space-y-0.5 kv-scroll-table">
                    {(Object.keys(ROLE_DEFINITIONS) as RoleKey[]).map((rKey) => {
                      const rDef = ROLE_DEFINITIONS[rKey];
                      const selected = rKey === activeRole;
                      return (
                        <button
                          key={rKey}
                          type="button"
                          onClick={() => switchRole(rKey)}
                          className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-right text-xs transition-colors ${
                            selected
                              ? "bg-[#F0EEFF] text-[#1813FB] font-semibold"
                              : "text-[#344054] hover:bg-[#F7F7FB]"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="truncate">{rDef.persianTitle}</div>
                            <div className="truncate text-[10px] text-[#626775]">
                              {rDef.actorName}
                            </div>
                          </div>
                          {selected && (
                            <Check className="h-4 w-4 text-[#1813FB] shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main
          className={`flex-1 min-w-0 ${
            fullWidth
              ? "p-0"
              : "mx-auto w-full max-w-[1440px] px-3 py-4 sm:px-6 sm:py-6"
          }`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
