import type { FastifyInstance } from "fastify";
import { THEMES, DEFAULT_THEME, isThemeId } from "../../../src/theme/themes";
import { query, withTransaction } from "../db";
import { requirePermission } from "../http/rbac";
import { recordAudit } from "../commerce/audit";
import { conflict, notFound, validation } from "../commerce/errors";

const currentTheme = (value: unknown) => isThemeId(value) ? value : DEFAULT_THEME;

export async function stylePackRoutes(app: FastifyInstance) {
  app.get("/api/public/store-theme", async (_req, reply) => {
    reply.header("cache-control", "no-store");
    const doc = await query<{value:Record<string,unknown>}>("select value from state_documents where key='ops'");
    return { theme: currentTheme(doc.rows[0]?.value?.siteTheme) };
  });

  app.get("/api/admin/style-packs", async (req,reply) => {
    await requirePermission(req,"design:view");
    reply.header("cache-control","no-store");
    const result = await query<{value:Record<string,unknown>}>("select value from state_documents where key='ops'");
    const doc=result.rows[0]?.value; if(!doc) throw notFound("تنظیمات ظاهر فروشگاه پیدا نشد.");
    return {active:currentTheme(doc.siteTheme), previous:isThemeId(doc.previousSiteTheme) ? doc.previousSiteTheme : null, packs:THEMES};
  });

  app.patch<{Body:{theme?:unknown;expectedTheme?:unknown}}>("/api/admin/style-packs", async req => {
    const actor=await requirePermission(req,"design:edit");
    const body=req.body ?? {};
    if(Object.keys(body).some(key=>!["theme","expectedTheme"].includes(key)) || !isThemeId(body.theme) || !isThemeId(body.expectedTheme)) throw validation("سبک یا نسخهٔ فعلی معتبر نیست.");
    const next=body.theme, expected=body.expectedTheme;
    return withTransaction(async client=>{
      const result=await client.query<{value:Record<string,unknown>}>("select value from state_documents where key='ops' for update");
      const doc=result.rows[0]?.value; if(!doc) throw notFound("تنظیمات ظاهر فروشگاه پیدا نشد.");
      const before=currentTheme(doc.siteTheme);
      if(before!==expected) throw conflict("ظاهر فروشگاه هم‌زمان تغییر کرده است؛ اطلاعات را تازه کنید.","theme_stale");
      if(before===next) return {ok:true,active:before,previous:isThemeId(doc.previousSiteTheme) ? doc.previousSiteTheme : null,unchanged:true};
      doc.siteTheme=next;doc.previousSiteTheme=before;
      await client.query("update state_documents set value=$1::jsonb,updated_at=now() where key='ops'",[JSON.stringify(doc)]);
      await recordAudit({actor:actor.subject,action:"design.theme_published",targetType:"store_theme",targetId:"store",before:{theme:before},after:{theme:next},requestId:req.id},client);
      return {ok:true,active:next,previous:before,unchanged:false};
    });
  });
}
