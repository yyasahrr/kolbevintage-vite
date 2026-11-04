import type { FastifyRequest } from "fastify";
import { query } from "../db";
import { readSession, type Session } from "../sessions";
import { forbidden, unauthorized } from "../commerce/errors";

/* =====================================================================
   Server-side RBAC.

   Permission is decided here, never in the browser: the admin panel only
   *hides* what a role cannot do, while every write goes through
   `requirePermission`. The vocabulary is module:action so a role editor can
   present it as a matrix and an endpoint can ask for the smallest grant.
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

/** module → the actions the matrix shows for it */
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

export const OWNER_ROLE = "owner";

const isPermission = (value: string): value is Permission => (PERMISSIONS as readonly string[]).includes(value);

export const cleanPermissions = (list: unknown): Permission[] =>
  Array.isArray(list) ? [...new Set(list.filter((p): p is Permission => typeof p === "string" && isPermission(p)))] : [];

export interface RoleRow {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  protected: boolean;
}

export interface StaffRow {
  id: string;
  name: string;
  subject: string;
  role_id: string;
  role_name?: string;
  active: boolean;
  has_passcode: boolean;
}

/**
 * First boot: the store passcode always maps to the protected owner role, so an
 * empty staff table can never lock the owner out of their own panel.
 */
export async function seedRbac() {
  await query(
    `insert into roles (id, name, description, permissions, protected)
     values ($1, $2, $3, $4, true)
     on conflict (id) do nothing`,
    [OWNER_ROLE, "مالک فروشگاه", "دسترسی کامل به همهٔ ماژول‌ها", JSON.stringify(PERMISSIONS)],
  );
  // keep the protected role in sync with the catalogue as it grows
  await query("update roles set permissions = $2, updated_at = now() where id = $1 and protected = true", [
    OWNER_ROLE,
    JSON.stringify(PERMISSIONS),
  ]);
  await query(
    `insert into staff (id, name, subject, role_id, active)
     values ($1, $2, $3, $4, true)
     on conflict (subject) do nothing`,
    ["staff-owner", "مالک فروشگاه", "admin", OWNER_ROLE],
  );
}

export const listRoles = async (): Promise<RoleRow[]> => {
  const res = await query<RoleRow>("select id, name, description, permissions, protected from roles order by protected desc, name");
  return res.rows.map((r) => ({ ...r, permissions: cleanPermissions(r.permissions) }));
};

export const listStaff = async (): Promise<StaffRow[]> => {
  const res = await query<StaffRow>(
    `select s.id, s.name, s.subject, s.role_id, r.name as role_name, s.active,
            (s.passcode_hash is not null) as has_passcode
     from staff s join roles r on r.id = s.role_id
     order by s.active desc, s.created_at`,
  );
  return res.rows;
};

export const roleForSubject = async (subject: string, executor?: { query: typeof query }) => {
  // the elevated superadmin subject (separate passcode) holds every permission
  if (subject === "superadmin") return { roleId: "superadmin", permissions: [...PERMISSIONS] };
  const run = executor?.query ?? query;
  const res = await run(
    "select r.id, r.permissions from staff s join roles r on r.id = s.role_id where s.subject = $1 and s.active",
    [subject],
  );
  const row = res.rows[0] as { id: string; permissions: unknown } | undefined;
  if (!row) return null;
  return { roleId: row.id, permissions: cleanPermissions(row.permissions) };
};

export const permissionsFor = async (subject: string): Promise<Permission[]> => {
  const role = await roleForSubject(subject);
  return role?.permissions ?? [];
};

/**
 * Session + permission in one call. Unknown staff, deactivated staff and a
 * missing role all end in 403 — this is fail-closed by construction.
 */
/** owner-only actions: staff lifecycle and granting the owner role itself */
export async function requireOwnerRole(session: Session) {
  const role = await roleForSubject(session.subject);
  if (role?.roleId !== OWNER_ROLE) {
    throw forbidden("این کار فقط از مالک فروشگاه پذیرفته می‌شود.");
  }
}

export async function requirePermission(req: FastifyRequest, permission: Permission): Promise<Session> {
  const session = await readSession(req);
  if (session?.kind !== "admin") {
    throw unauthorized("برای این عملیات باید با رمز مدیریت وارد شوی.");
  }
  const permissions = await permissionsFor(session.subject);
  if (!permissions.includes(permission)) {
    throw forbidden(`نقش شما مجوز «${permission}» را ندارد.`);
  }
  return session;
}
