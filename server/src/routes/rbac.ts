import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { query } from "../db";
import { readSession } from "../sessions";
import { hashPassword } from "../security";
import { conflict, notFound, validation } from "../commerce/errors";
import { recordAudit } from "../commerce/audit";
import {
  OWNER_ROLE,
  PERMISSIONS,
  PERMISSION_GROUPS,
  cleanPermissions,
  listRoles,
  listStaff,
  permissionsFor,
  requirePermission,
  requireOwnerRole,
  roleForSubject,
  type Permission,
} from "../http/rbac";

/* =====================================================================
   Staff & role administration.

   The invariants that keep the panel usable:
     · the protected owner role cannot be edited, renamed or deleted
     · nobody may change their own role or deactivate themselves
     · the last active owner can never be removed (no lockout, ever)
   ===================================================================== */

const RE_ROLE_ID = /^[a-z][a-z0-9-]{1,30}$/;
const RESERVED_SUBJECTS = new Set(["admin", "superadmin"]);

/** an empty string or null clears the limit; anything else must be a real date */
function parseExpiry(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) throw validation("تاریخ پایان دسترسی معتبر نیست.");
  return date;
}

export async function rbacRoutes(app: FastifyInstance) {
  /** the panel's first call after login: who am I and what may I do */
  app.get("/api/admin/me", async (req) => {
    const session = await readSession(req);
    if (session?.kind !== "admin") {
      return { authenticated: false, subject: null, role: null, permissions: [], catalogue: PERMISSIONS, groups: PERMISSION_GROUPS };
    }
    const staffRow = await query(
      `select s.id, s.name, s.subject, r.id as role_id, r.name as role_name, r.permissions
       from staff s join roles r on r.id = s.role_id
       where s.subject = $1 and s.active`,
      [session.subject],
    );
    const me = staffRow.rows[0];
    return {
      authenticated: true,
      subject: session.subject,
      staff: me ? { id: me.id, name: me.name, roleId: me.role_id, roleName: me.role_name } : null,
      role: me?.role_id ?? null,
      permissions: cleanPermissions(me?.permissions),
      catalogue: PERMISSIONS,
      groups: PERMISSION_GROUPS,
    };
  });

  /* ------------------------------- roles ------------------------------- */

  app.get("/api/admin/roles", async (req) => {
    await requirePermission(req, "staff:manage");
    return { roles: await listRoles(), groups: PERMISSION_GROUPS };
  });

  app.post<{ Body: { id?: string; name?: string; description?: string; permissions?: unknown } }>(
    "/api/admin/roles",
    async (req, reply) => {
      const session = await requirePermission(req, "staff:manage");
      const id = String(req.body?.id ?? "").trim();
      const name = String(req.body?.name ?? "").trim();
      if (!RE_ROLE_ID.test(id)) throw validation("شناسهٔ نقش باید لاتین کوچک و با حرف شروع شود (مثل warehouse).");
      if (name.length < 2) throw validation("نام نقش را بنویس.");
      const permissions = cleanPermissions(req.body?.permissions);
      if (!permissions.length) throw validation("حداقل یک مجوز برای نقش انتخاب کن.");
      const exists = await query("select 1 from roles where id = $1", [id]);
      if (exists.rowCount) throw conflict("این شناسهٔ نقش قبلاً استفاده شده است.");
      await query("insert into roles (id, name, description, permissions) values ($1,$2,$3,$4)", [
        id,
        name,
        String(req.body?.description ?? "").trim(),
        JSON.stringify(permissions),
      ]);
      await recordAudit({
        actor: session.subject,
        action: "role.create",
        targetType: "role",
        targetId: id,
        after: { name, permissions },
        requestId: req.id,
      });
      return reply.code(201).send({ ok: true, roles: await listRoles() });
    },
  );

  app.put<{ Params: { id: string }; Body: { name?: string; description?: string; permissions?: unknown } }>(
    "/api/admin/roles/:id",
    async (req) => {
      const session = await requirePermission(req, "staff:manage");
      const { id } = req.params;
      const rows = await listRoles();
      const current = rows.find((r) => r.id === id);
      if (!current) throw notFound("نقش پیدا نشد.");
      if (current.protected) throw conflict("نقش محافظت‌شده (مالک) قابل تغییر نیست.");
      const name = String(req.body?.name ?? current.name).trim();
      const permissions = req.body?.permissions === undefined ? current.permissions : cleanPermissions(req.body.permissions);
      if (!permissions.length) throw validation("هر نقش باید حداقل یک مجوز داشته باشد؛ برای توقف دسترسی، کارمند را غیرفعال کن.");
      await query("update roles set name = $2, description = $3, permissions = $4, updated_at = now() where id = $1", [
        id,
        name,
        String(req.body?.description ?? current.description ?? "").trim(),
        JSON.stringify(permissions),
      ]);
      await recordAudit({
        actor: session.subject,
        action: "role.update",
        targetType: "role",
        targetId: id,
        before: { name: current.name, permissions: current.permissions },
        after: { name, permissions },
        requestId: req.id,
      });
      return { ok: true, roles: await listRoles() };
    },
  );

  app.delete<{ Params: { id: string } }>("/api/admin/roles/:id", async (req) => {
    const session = await requirePermission(req, "staff:manage");
    const { id } = req.params;
    const rows = await listRoles();
    const current = rows.find((r) => r.id === id);
    if (!current) throw notFound("نقش پیدا نشد.");
    if (current.protected) throw conflict("نقش محافظت‌شده قابل حذف نیست.");
    const inUse = await query("select count(*)::int as n from staff where role_id = $1", [id]);
    if (inUse.rows[0].n > 0) throw conflict("این نقش به کارمند اختصاص دارد؛ اول نقش آن‌ها را تغییر بده.");
    await query("delete from roles where id = $1", [id]);
    await recordAudit({
      actor: session.subject,
      action: "role.delete",
      targetType: "role",
      targetId: id,
      before: current,
      requestId: req.id,
    });
    return { ok: true, roles: await listRoles() };
  });

  /* ------------------------------- staff ------------------------------- */

  app.get("/api/admin/staff", async (req) => {
    await requirePermission(req, "staff:manage");
    return { staff: await listStaff(), roles: await listRoles() };
  });

  app.post<{ Body: { name?: string; subject?: string; passcode?: string; roleId?: string; expiresAt?: string | null } }>(
    "/api/admin/staff",
    async (req, reply) => {
      const session = await requirePermission(req, "staff:manage");
      const name = String(req.body?.name ?? "").trim();
      const subject = String(req.body?.subject ?? "").trim().toLowerCase();
      const passcode = String(req.body?.passcode ?? "");
      const roleId = String(req.body?.roleId ?? "").trim();
      if (name.length < 2) throw validation("نام کارمند را بنویس.");
      if (!/^[a-z0-9][a-z0-9_.-]{2,30}$/.test(subject)) {
        throw validation("شناسهٔ ورود باید لاتین کوچک باشد (حرف/عدد و _ . -).");
      }
      if (passcode.length < 6) throw validation("رمز کارمند باید حداقل ۶ نویسه باشد.");
      if (RESERVED_SUBJECTS.has(subject)) throw validation("این شناسهٔ ورود رزرو شده است.");
      const roles = await listRoles();
      if (!roles.some((r) => r.id === roleId)) throw validation("نقش انتخاب‌شده وجود ندارد.");
      if (roleId === OWNER_ROLE) await requireOwnerRole(session);
      const dup = await query("select 1 from staff where subject = $1", [subject]);
      if (dup.rowCount) throw conflict("این شناسهٔ ورود قبلاً ثبت شده است.");
      const expiresAt = parseExpiry(req.body?.expiresAt);
      const id = `staff-${randomUUID().slice(0, 8)}`;
      await query(
        "insert into staff (id, name, subject, role_id, passcode_hash, active, expires_at) values ($1,$2,$3,$4,$5,true,$6)",
        [id, name, subject, roleId, hashPassword(passcode), expiresAt],
      );
      await recordAudit({
        actor: session.subject,
        action: "staff.create",
        targetType: "staff",
        targetId: id,
        after: { name, subject, roleId, expiresAt: expiresAt?.toISOString() ?? null },
        requestId: req.id,
      });
      return reply.code(201).send({ ok: true, staff: await listStaff() });
    },
  );

  app.patch<{
    Params: { id: string };
    Body: { name?: string; roleId?: string; active?: boolean; passcode?: string; expiresAt?: string | null };
  }>("/api/admin/staff/:id", async (req) => {
    const session = await requirePermission(req, "staff:manage");
    await requireOwnerRole(session);
    const { id } = req.params;
    const rows = await listStaff();
    const current = rows.find((s) => s.id === id);
    if (!current) throw notFound("کارمند پیدا نشد.");
    if (current.subject === session.subject) {
      throw conflict("نقش و وضعیت حساب خودت را نمی‌توانی از همین‌جا تغییر بدهی.");
    }
    const roleId = String(req.body?.roleId ?? current.role_id);
    const roles = await listRoles();
    if (!roles.some((r) => r.id === roleId)) throw validation("نقش انتخاب‌شده وجود ندارد.");
    const active = req.body?.active === undefined ? current.active : Boolean(req.body.active);
    if (current.role_id === OWNER_ROLE && (!active || roleId !== OWNER_ROLE)) {
      const owners = await query(
        "select count(*)::int as n from staff s join roles r on r.id = s.role_id where s.active and r.id = $1",
        [OWNER_ROLE],
      );
      if (owners.rows[0].n <= 1) throw conflict("آخرین مالک فعال را نمی‌توان غیرفعال یا تنزل داد.");
    }
    const passcode = req.body?.passcode === undefined ? undefined : String(req.body.passcode);
    if (passcode !== undefined && passcode.length < 6) throw validation("رمز کارمند باید حداقل ۶ نویسه باشد.");
    // `expiresAt: null` clears the limit; leaving it out keeps the current one
    const expiresAt =
      req.body?.expiresAt === undefined
        ? current.expires_at
          ? new Date(current.expires_at)
          : null
        : parseExpiry(req.body.expiresAt);
    const name = String(req.body?.name ?? current.name).trim();
    if (passcode === undefined) {
      await query("update staff set name = $2, role_id = $3, active = $4, expires_at = $5 where id = $1", [
        id,
        name,
        roleId,
        active,
        expiresAt,
      ]);
    } else {
      await query(
        "update staff set name = $2, role_id = $3, active = $4, passcode_hash = $5, expires_at = $6 where id = $1",
        [id, name, roleId, active, hashPassword(passcode), expiresAt],
      );
    }
    if (passcode !== undefined) await query("delete from sessions where kind = 'admin' and subject = $1", [current.subject]);
    await recordAudit({
      actor: session.subject,
      action: "staff.update",
      targetType: "staff",
      targetId: id,
      before: { name: current.name, roleId: current.role_id, active: current.active, expiresAt: current.expires_at },
      after: { roleId, active, passcodeChanged: passcode !== undefined, expiresAt: expiresAt?.toISOString() ?? null },
      requestId: req.id,
    });
    return { ok: true, staff: await listStaff() };
  });

  /** login history (decision 88): success and refusals, newest first */
  app.get<{ Querystring: { limit?: string } }>("/api/admin/logins", async (req) => {
    await requirePermission(req, "security:view");
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));
    const res = await query(
      `select id::text, at, subject, ok, reason, ip, user_agent
         from login_events order by at desc, id desc limit $1`,
      [limit],
    );
    return {
      events: res.rows.map((row) => ({
        id: row.id,
        at: row.at,
        subject: row.subject,
        ok: row.ok,
        reason: row.reason,
        ip: row.ip,
        userAgent: row.user_agent,
      })),
      activeSessions: (await query("select count(*)::int as n from sessions where kind = 'admin' and expires_at > now()"))
        .rows[0].n,
    };
  });

  /** "sign out everywhere" (decision 88) — every admin session dies, this one too */
  app.post("/api/admin/sessions/revoke-all", async (req) => {
    const session = await requirePermission(req, "security:edit");
    const res = await query("delete from sessions where kind = 'admin'");
    await recordAudit({
      actor: session.subject,
      action: "sessions.revoke_all",
      targetType: "session",
      targetId: "admin",
      after: { revoked: res.rowCount ?? 0 },
      requestId: req.id,
    });
    return { ok: true, revoked: res.rowCount ?? 0 };
  });

  /** the matrix a role editor renders, fetched once */
  app.get("/api/admin/permissions", async (req) => {
    await requirePermission(req, "staff:manage");
    return { groups: PERMISSION_GROUPS, permissions: PERMISSIONS as readonly Permission[] };
  });

  /** self-check used by tests and by the panel's permission-denied state */
  app.get("/api/admin/permissions/check", async (req) => {
    const session = await readSession(req);
    const permission = String((req.query as { permission?: string })?.permission ?? "");
    const permissions = session?.kind === "admin" ? await permissionsFor(session.subject) : [];
    return {
      permission,
      allowed: (PERMISSIONS as readonly string[]).includes(permission) && permissions.includes(permission as Permission),
      role: session?.kind === "admin" ? ((await roleForSubject(session.subject))?.roleId ?? null) : null,
    };
  });
}
