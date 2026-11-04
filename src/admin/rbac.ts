/* =====================================================================
   Client mirror of the server's permission vocabulary.

   This file decides *visibility* only. Every action is re-checked on the
   server (`requirePermission`), so a tampered bundle gains nothing: the
   panel hides what a role cannot do, it never grants anything.
   ===================================================================== */

export const PERMISSIONS = [
  "dashboard:view",
  "orders:view",
  "orders:edit",
  "orders:export",
  "catalog:view",
  "catalog:edit",
  "catalog:publish",
  "looks:view",
  "looks:edit",
  "looks:publish",
  "content:view",
  "content:edit",
  "content:publish",
  "design:view",
  "design:edit",
  "customers:view",
  "customers:edit",
  "customers:export",
  "campaigns:view",
  "campaigns:edit",
  "inventory:view",
  "inventory:adjust",
  "inventory:approve",
  "finance:view",
  "finance:refund",
  "finance:approve",
  "integrations:view",
  "integrations:manage",
  "settings:view",
  "settings:edit",
  "security:view",
  "security:edit",
  "staff:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_GROUPS: { module: string; label: string; actions: Permission[] }[] = [
  { module: "dashboard", label: "داشبورد", actions: ["dashboard:view"] },
  { module: "orders", label: "سفارش‌ها", actions: ["orders:view", "orders:edit", "orders:export"] },
  { module: "catalog", label: "کاتالوگ", actions: ["catalog:view", "catalog:edit", "catalog:publish"] },
  { module: "looks", label: "استایل‌ها", actions: ["looks:view", "looks:edit", "looks:publish"] },
  { module: "content", label: "محتوا و صفحه‌ها", actions: ["content:view", "content:edit", "content:publish"] },
  { module: "design", label: "ظاهر و مگامنو", actions: ["design:view", "design:edit"] },
  { module: "customers", label: "مشتریان", actions: ["customers:view", "customers:edit", "customers:export"] },
  { module: "campaigns", label: "کمپین و تخفیف", actions: ["campaigns:view", "campaigns:edit"] },
  { module: "inventory", label: "انبار", actions: ["inventory:view", "inventory:adjust", "inventory:approve"] },
  { module: "finance", label: "مالی و بازپرداخت", actions: ["finance:view", "finance:refund", "finance:approve"] },
  { module: "integrations", label: "اتصال‌ها", actions: ["integrations:view", "integrations:manage"] },
  { module: "settings", label: "تنظیمات", actions: ["settings:view", "settings:edit"] },
  { module: "security", label: "امنیت", actions: ["security:view", "security:edit"] },
  { module: "staff", label: "کارکنان و نقش‌ها", actions: ["staff:manage"] },
];

export const ACTION_LABELS: Record<string, string> = {
  view: "دیدن",
  edit: "ویرایش",
  export: "خروجی",
  publish: "انتشار",
  adjust: "ثبت اصلاح",
  approve: "تأیید",
  refund: "بازپرداخت",
  manage: "مدیریت",
};

/**
 * The permission a panel screen needs in order to be *listed*. Screens whose
 * writes cost more (price publish, refund approval) still check again inline.
 */
export const SCREEN_PERMISSION: Record<string, Permission> = {
  dashboard: "dashboard:view",

  /* the six sidebar groups need their own entry so the group survives filtering */
  sales: "orders:view",
  stock: "catalog:view",
  experience: "looks:view",
  people: "customers:view",
  system: "settings:view",

  orders: "orders:view",

  catalog: "catalog:view",
  products: "catalog:view",
  inventory: "inventory:view",
  categories: "catalog:view",
  media: "catalog:view",
  reviews: "content:view",

  looks: "looks:view",

  design: "design:view",
  brand: "design:view",
  megamenu: "design:view",
  content: "content:view",
  appearance: "design:view",
  forms: "content:view",

  customers: "customers:view",
  crm: "customers:view",
  messages: "customers:view",
  tickets: "customers:view",

  campaigns: "campaigns:view",

  finance: "finance:view",
  commerce: "finance:view",
  returns: "orders:view",
  tryon: "finance:view",
  reports: "finance:view",
  logs: "security:view",
  health: "settings:view",
  backup: "settings:view",

  security: "security:view",
  integrations: "integrations:view",

  settings: "settings:view",

  staff: "staff:manage",
  roles: "staff:manage",
};

export const can = (permissions: readonly string[], permission: Permission | undefined) =>
  permission === undefined ? true : permissions.includes(permission);

export const permissionForScreen = (screen: string): Permission | undefined =>
  SCREEN_PERMISSION[screen as Permission] ?? undefined;

/** the first screen this role may open — used when a deep link is refused */
export function firstAllowedScreen(order: readonly string[], permissions: readonly string[]): string | null {
  return order.find((screen) => can(permissions, permissionForScreen(screen))) ?? null;
}
