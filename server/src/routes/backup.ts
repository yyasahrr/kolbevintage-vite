import type { FastifyInstance } from "fastify";
import { requireOwnerRole, requirePermission } from "../http/rbac";
import { recordAudit } from "../commerce/audit";
import { backupSchedule, createBackup, listBackups, readBackup } from "../backup";

/* =====================================================================
   Backup endpoints — list, take one now, download.
   Restore is deliberately CLI-only (`npm run restore -- <file>`) so a panel
   session can never overwrite the shop by accident.
   ===================================================================== */

export async function backupRoutes(app: FastifyInstance) {
  app.get("/api/admin/backups", async (req) => {
    await requirePermission(req, "settings:view");
    return { schedule: backupSchedule(), backups: await listBackups() };
  });

  app.post<{ Body: { dryRun?: boolean } | undefined }>("/api/admin/backups", async (req) => {
    const session = await requirePermission(req, "settings:edit");
    // a dry run only reports the format the panel would get; it writes nothing
    if (req.body?.dryRun) {
      return { ok: true, dryRun: true, format: "kv-logical-backup" };
    }
    const backup = await createBackup("manual");
    await recordAudit({
      actor: session.subject,
      action: "backup.create",
      targetType: "backup",
      targetId: backup.id,
      after: { bytes: backup.bytes, rows: backup.rows, cloud: backup.cloud_status },
      requestId: req.id,
    });
    return { ok: true, backup };
  });

  app.get<{ Params: { id: string } }>("/api/admin/backups/:id/download", async (req, reply) => {
    const actor = await requirePermission(req, "settings:view");
    await requireOwnerRole(actor);
    const found = await readBackup(req.params.id);
    if (!found) return reply.code(404).send({ error: "این پشتیبان پیدا نشد یا فایلش روی دیسک نیست." });
    await recordAudit({actor:actor.subject,action:"backup.download",targetType:"backup",targetId:found.meta.id,requestId:req.id});
    reply
      .header("content-type", "application/gzip")
      .header("content-disposition", `attachment; filename="${found.meta.file.split("/").pop()}"`);
    return reply.send(found.buffer);
  });
}
