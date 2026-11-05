import type { FastifyInstance } from "fastify";
import { query } from "../db";
import { requirePermission } from "../http/rbac";
import { recordAudit } from "../commerce/audit";

/* =====================================================================
   Clearing the demo shop (decisions 92 + 98).

   The owner asked for an empty shop before real products go in. This endpoint
   is the guarded version of `npm run clear-demo`:

     · it needs settings:edit   (a role that cannot change settings cannot wipe)
     · it needs the exact confirmation phrase, not a boolean
     · it refuses unless a backup was taken in the last 15 minutes
     · it is one TRUNCATE, so it either happens or it does not
     · it writes what it removed to the audit trail

   It is never called by anything else in the panel, and nothing here runs on
   its own: the owner presses the button.
   ===================================================================== */

const CONFIRM_PHRASE = "پاک‌سازی دادهٔ نمایشی";

/** children before parents; the same list as scripts/clear-demo-data.mjs */
const TABLES = [
  "outbox_events",
  "fulfillment_events",
  "payment_attempts",
  "refunds",
  "exchange_payments",
  "order_lines",
  "orders",
  "cart_lines",
  "carts",
  "checkout_sessions",
  "stock_reservations",
  "inventory_movements",
  "inventory_adjustments",
  "product_complements",
  "product_images",
  "product_variants",
  "products",
  "price_rules",
  "coupons",
  "customers",
];

const BACKUP_FRESH_MINUTES = 15;

export async function maintenanceRoutes(app: FastifyInstance) {
  /** what the panel needs to decide whether the button may be offered */
  app.get("/api/admin/maintenance/purge-preview", async (req) => {
    await requirePermission(req, "settings:view");
    const counts: Record<string, number> = {};
    for (const table of TABLES) {
      const res = await query<{ n: number }>(`select count(*)::int as n from ${table}`);
      if (res.rows[0].n) counts[table] = res.rows[0].n;
    }
    const last = await query<{ created_at: string | null; age_minutes: number | null }>(
      `select created_at::text, extract(epoch from (now() - created_at)) / 60 as age_minutes
         from backups order by created_at desc limit 1`,
    );
    const lastBackup = last.rows[0] ?? { created_at: null, age_minutes: null };
    const age = lastBackup.age_minutes === null ? null : Number(lastBackup.age_minutes);
    return {
      phrase: CONFIRM_PHRASE,
      counts,
      rows: Object.values(counts).reduce((n, c) => n + c, 0),
      lastBackupAt: lastBackup.created_at,
      lastBackupAgeMinutes: age === null ? null : Math.round(age),
      backupFreshEnough: age !== null && age <= BACKUP_FRESH_MINUTES,
      freshWindowMinutes: BACKUP_FRESH_MINUTES,
    };
  });

  app.post<{ Body: { confirm?: string } | undefined }>("/api/admin/maintenance/purge-demo", async (req, reply) => {
    const session = await requirePermission(req, "settings:edit");
    if ((req.body?.confirm ?? "").trim() !== CONFIRM_PHRASE) {
      return reply.code(400).send({ error: `عبارت تأیید درست نیست. باید دقیقاً «${CONFIRM_PHRASE}» نوشته شود.`, code: "bad_confirm" });
    }

    // a fresh backup is a precondition, not a suggestion
    const last = await query<{ age_minutes: number | null }>(
      `select extract(epoch from (now() - created_at)) / 60 as age_minutes
         from backups order by created_at desc limit 1`,
    );
    const age = last.rows[0]?.age_minutes;
    if (age === undefined || age === null || Number(age) > BACKUP_FRESH_MINUTES) {
      return reply.code(409).send({
        error: `پیش از پاک‌سازی باید پشتیبان تازه بگیری (کمتر از ${BACKUP_FRESH_MINUTES} دقیقه پیش). پاک‌سازی انجام نشد.`,
        code: "backup_too_old",
        lastBackupAgeMinutes: age === null || age === undefined ? null : Math.round(Number(age)),
      });
    }

    const before: Record<string, number> = {};
    for (const table of TABLES) {
      const res = await query<{ n: number }>(`select count(*)::int as n from ${table}`);
      if (res.rows[0].n) before[table] = res.rows[0].n;
    }

    await query(`truncate table ${TABLES.join(", ")} restart identity cascade`);

    await recordAudit({
      actor: session.subject,
      action: "maintenance.purge_demo",
      targetType: "database",
      targetId: "demo-data",
      before,
      after: { rows: Object.values(before).reduce((n, c) => n + c, 0) },
      requestId: req.id,
    });

    return { ok: true, removed: before };
  });
}
