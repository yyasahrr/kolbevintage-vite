export type RoleKey =
  | "super_admin"
  | "catalog_manager"
  | "warehouse_operator"
  | "order_operator"
  | "marketing_manager"
  | "support_agent"
  | "finance_operator"
  | "content_designer";

export type ModuleKey =
  | "dashboard"
  | "catalog"
  | "inventory"
  | "orders"
  | "returns"
  | "marketing"
  | "crm"
  | "content"
  | "appearance"
  | "try_on"
  | "finance"
  | "integrations"
  | "rules"
  | "staff"
  | "audit"
  | "settings";

export type ActionKey =
  | "view"
  | "create"
  | "edit"
  | "publish"
  | "approve"
  | "export"
  | "archive"
  | "sensitive_finance";

export interface RoleDefinition {
  key: RoleKey;
  persianTitle: string;
  englishTitle: string;
  actorName: string;
  summary: string;
  modules: Partial<Record<ModuleKey, ActionKey[]>>;
}

const ALL_ACTIONS: ActionKey[] = [
  "view",
  "create",
  "edit",
  "publish",
  "approve",
  "export",
  "archive",
  "sensitive_finance",
];

export const ROLE_DEFINITIONS: Record<RoleKey, RoleDefinition> = {
  super_admin: {
    key: "super_admin",
    persianTitle: "مالک فروشگاه / سوپر ادمین",
    englishTitle: "Store Owner / Super Admin",
    actorName: "سارا محمدی (مدیرعامل)",
    summary: "دسترسی کامل به سیاست‌ها، گزارش‌های مالی، کارکنان، کاتالوگ و اتصالات",
    modules: {
      dashboard: ALL_ACTIONS,
      catalog: ALL_ACTIONS,
      inventory: ALL_ACTIONS,
      orders: ALL_ACTIONS,
      returns: ALL_ACTIONS,
      marketing: ALL_ACTIONS,
      crm: ALL_ACTIONS,
      content: ALL_ACTIONS,
      appearance: ALL_ACTIONS,
      try_on: ALL_ACTIONS,
      finance: ALL_ACTIONS,
      integrations: ALL_ACTIONS,
      rules: ALL_ACTIONS,
      staff: ALL_ACTIONS,
      audit: ALL_ACTIONS,
      settings: ALL_ACTIONS,
    },
  },
  catalog_manager: {
    key: "catalog_manager",
    persianTitle: "مدیر کاتالوگ و محصول",
    englishTitle: "Catalog Manager",
    actorName: "نیما فرهادی (مدیر کاتالوگ)",
    summary: "ایجاد و ویرایش محصولات، تنوع رنگ و سایز، قیمت‌گذاری و رسانه‌های رنگ",
    modules: {
      dashboard: ["view"],
      catalog: ["view", "create", "edit", "publish", "archive"],
      inventory: ["view"],
      content: ["view", "create", "edit"],
      try_on: ["view"],
    },
  },
  warehouse_operator: {
    key: "warehouse_operator",
    persianTitle: "اپراتور انبار و لجستیک",
    englishTitle: "Warehouse Operator",
    actorName: "امیرحسین کاظمی (سرپرست انبار)",
    summary: "دریافت کالا، اسکن SKU، برداشت و بسته‌بندی سفارش‌ها و شمارش انبار",
    modules: {
      dashboard: ["view"],
      catalog: ["view"],
      inventory: ["view", "create", "edit"],
      orders: ["view", "edit"],
      returns: ["view", "edit"],
    },
  },
  order_operator: {
    key: "order_operator",
    persianTitle: "اپراتور سفارش و ارسال",
    englishTitle: "Order Operator",
    actorName: "مهسا رضایی (کارشناس پردازش سفارش)",
    summary: "مدیریت سفارش‌ها، ثبت سفارش دستی، رهگیری مرسوله و چاپ برچسب ارسال",
    modules: {
      dashboard: ["view"],
      catalog: ["view"],
      orders: ["view", "create", "edit", "export"],
      returns: ["view", "create", "edit"],
      crm: ["view"],
    },
  },
  marketing_manager: {
    key: "marketing_manager",
    persianTitle: "مدیر بازاریابی و کمپین",
    englishTitle: "Marketing Manager",
    actorName: "پریسا شریفی (مدیر کمپین)",
    summary: "طراحی جشنواره‌ها، تخفیف‌ها، پیامک مارکتینگ و گروه‌بندی مشتریان",
    modules: {
      dashboard: ["view"],
      catalog: ["view"],
      marketing: ["view", "create", "edit", "publish"],
      crm: ["view", "create", "edit", "export"],
      content: ["view", "create", "edit", "publish"],
    },
  },
  support_agent: {
    key: "support_agent",
    persianTitle: "کارشناس پشتیبانی مشتریان",
    englishTitle: "Customer Support Agent",
    actorName: "زهرا نادری (پشتیبانی)",
    summary: "بررسی سوابق خرید مشتری، ثبت درخواست مرجوعی و پیگیری وضعیت سفارش",
    modules: {
      dashboard: ["view"],
      orders: ["view"],
      returns: ["view", "create", "edit"],
      crm: ["view", "edit"],
      content: ["view", "edit"],
    },
  },
  finance_operator: {
    key: "finance_operator",
    persianTitle: "اپراتور مالی و حسابداری",
    englishTitle: "Financial Operator",
    actorName: "رضا موسوی (مدیر مالی)",
    summary: "بررسی تراکنش‌های تاییدشده، مغایرت‌های بانکی، بازپرداخت و خروجی حسابداری",
    modules: {
      dashboard: ["view"],
      orders: ["view", "export"],
      returns: ["view", "approve", "sensitive_finance"],
      finance: ["view", "approve", "export", "sensitive_finance"],
      audit: ["view", "export"],
    },
  },
  content_designer: {
    key: "content_designer",
    persianTitle: "طراح محتوا و استودیو",
    englishTitle: "Content Designer",
    actorName: "کیانا رستگار (طراح ارشد)",
    summary: "مدیریت بلاگ، گالری مشتریان، پک‌های ظاهری و قالب‌های استودیو طراحی",
    modules: {
      dashboard: ["view"],
      catalog: ["view"],
      content: ["view", "create", "edit", "publish"],
      appearance: ["view", "create", "edit", "publish"],
    },
  },
};

export function hasPermission(
  role: RoleKey,
  module: ModuleKey,
  action: ActionKey = "view"
): boolean {
  const def = ROLE_DEFINITIONS[role] ?? ROLE_DEFINITIONS.super_admin;
  const allowed = def.modules[module];
  if (!allowed) return false;
  return allowed.includes(action);
}

export function isValidRoleKey(val: string | undefined | null): val is RoleKey {
  if (!val) return false;
  return val in ROLE_DEFINITIONS;
}
