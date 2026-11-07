import type { FastifyInstance } from "fastify";
import { requirePermission } from "../http/rbac";

/**
 * The historical purge labeled all rows as demo and TRUNCATEd orders, stock,
 * customers and other tables, including records made by actual users. It is
 * intentionally retired. A backup cannot prove which rows are safe to delete.
 */
export async function maintenanceRoutes(app: FastifyInstance) {
  app.get("/api/admin/maintenance/purge-preview", async req => {
    await requirePermission(req,"settings:view");
    return {enabled:false,reason:"پاک‌سازی کلی غیرفعال است؛ ممکن است داده‌های واقعی حذف شوند."};
  });
  app.post("/api/admin/maintenance/purge-demo", async (req,reply) => {
    await requirePermission(req,"settings:edit");
    return reply.code(410).send({error:"پاک‌سازی کلی غیرفعال است؛ هیچ داده‌ای حذف نشد.",code:"purge_disabled"});
  });
}
