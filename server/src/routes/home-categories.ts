import type { FastifyInstance } from "fastify";
import { query, withTransaction } from "../db";
import { requirePermission } from "../http/rbac";
import { recordAudit } from "../commerce/audit";
import { conflict, notFound, validation } from "../commerce/errors";

// null keeps the original built-in selection; [] intentionally displays none.
type Selection = string[] | null;
const valid = (v: unknown): v is Selection => v === null || (Array.isArray(v) && v.length <= 4 && v.every(id => typeof id === "string" && id.length > 0 && id.length <= 100) && new Set(v).size === v.length);
function selection(doc: Record<string, unknown>): Selection {
  const value = doc.homeCategoryIds ?? null;
  if (!valid(value)) throw conflict("تنظیم قبلی دسته‌های صفحه اصلی معتبر نیست؛ نیاز به بررسی دارد.", "home_categories_invalid");
  return value;
}
export async function homeCategoryRoutes(app: FastifyInstance) {
  app.get("/api/admin/home-categories", async (req, reply) => {
    await requirePermission(req, "catalog:view");
    reply.header("cache-control", "private, no-store");
    const result = await query<{value:Record<string,unknown>}>("select value from state_documents where key='ops'");
    const doc = result.rows[0]?.value;
    if (!doc) throw notFound("تنظیمات فروشگاه پیدا نشد.");
    return {ids:selection(doc)};
  });
  app.patch<{Body:{ids?:unknown;expectedIds?:unknown}}>("/api/admin/home-categories", async req => {
    const actor = await requirePermission(req, "catalog:edit");
    const body = req.body;
    if (!body || typeof body !== "object" || Object.keys(body).some(k => !["ids","expectedIds"].includes(k)) || !valid(body.ids) || !valid(body.expectedIds)) throw validation("انتخاب یا نسخهٔ قبلی دسته‌ها معتبر نیست.");
    const ids = body.ids, expected = body.expectedIds;
    return withTransaction(async client => {
      const result = await client.query<{value:Record<string,any>}>("select value from state_documents where key='ops' for update");
      const doc = result.rows[0]?.value;
      if (!doc) throw notFound("تنظیمات فروشگاه پیدا نشد.");
      const before = selection(doc);
      if (JSON.stringify(before) !== JSON.stringify(expected)) throw conflict("انتخاب دسته‌ها هم‌زمان تغییر کرده است؛ اطلاعات را تازه کنید.", "home_categories_stale");
      if (ids && (!Array.isArray(doc.categories) || ids.some(id => !doc.categories.some((c:any) => c?.id === id && c.active === true)))) throw validation("فقط دسته‌های فعال فروشگاه را انتخاب کنید.");
      if (JSON.stringify(ids) === JSON.stringify(before)) return {ids,unchanged:true};
      doc.homeCategoryIds = ids;
      await client.query("update state_documents set value=$1::jsonb,updated_at=now() where key='ops'", [JSON.stringify(doc)]);
      await recordAudit({actor:actor.subject,action:"catalog.home_categories_updated",targetType:"home_categories",targetId:"store",before:{ids:before},after:{ids},requestId:req.id},client);
      return {ids,unchanged:false};
    });
  });
}
