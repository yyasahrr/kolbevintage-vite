import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { query, withTransaction } from "../db";
import { requirePermission } from "../http/rbac";
import { recordAudit } from "../commerce/audit";
import { validation, notFound, conflict } from "../commerce/errors";
import { hasUnsupportedCampaignRestrictions } from "../commerce/promotions";
import { labelAudience } from "../commerce/audiences";
import { definitions, lockedDefinitions } from "./customer-labels";

const number = (value: unknown, label: string, max = 99999999) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) throw validation(`${label} معتبر نیست.`);
  return value;
};
const text = (value: unknown, label: string, max: number, required = true) => {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw validation(`${label} معتبر نیست.`);
  return value.trim();
};
const dateOnly = (value: unknown) => {
  if (value === "" || value === null || value === undefined) return "";
  const v = text(value, "تاریخ", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) || new Date(`${v}T00:00:00Z`).toISOString().slice(0,10) !== v) throw validation("تاریخ معتبر نیست.");
  return v;
};

export async function adminLiveRoutes(app: FastifyInstance) {
  app.get("/api/admin/marketing", async req => {
    await requirePermission(req, "campaigns:view");
    const [rules, coupons, labels, docs] = await Promise.all([
      query("select id,name,kind,value,scope,scope_id,min_subtotal,max_discount,priority,starts_at,ends_at,active,free_shipping from price_rules order by created_at desc"),
      query("select code,kind,value,min_subtotal,max_discount,usage_limit,used_count,ends_at,active from coupons order by updated_at desc"),
      definitions(),
      query<{value:Record<string,any>}>("select value from state_documents where key='admin'"),
    ]);
    const campaigns = docs.rows[0]?.value?.campaigns;
    const byId = new Map((Array.isArray(campaigns) ? campaigns : []).filter((c:any)=>c && typeof c.id === "string").map((c:any)=>[c.id,c]));
    return { rules: rules.rows.map((row:any)=>{
      const draft:any=byId.get(row.id);
      return {...row, restrictedDraft:!!draft && hasUnsupportedCampaignRestrictions(draft), audience:draft?.audience ?? null, earlyAccess:draft?.earlyAccess ?? null};
    }), coupons: coupons.rows, labels:labels.map(label=>({id:label.id,name:label.name})) };
  });

  app.post<{Body: Record<string, unknown>}>("/api/admin/marketing/campaigns", async (req, reply) => {
    const actor = await requirePermission(req, "campaigns:edit");
    const b = req.body ?? {};
    const allowed = ["name","kind","scope","scopeId","value","minSpend","maxDiscount","start","end","freeShipping","audience","earlyAccess"];
    if (Object.keys(b).some(key => !allowed.includes(key))) throw validation("یکی از گزینه‌های کمپین پشتیبانی نمی‌شود.");
    const name = text(b.name,"نام کمپین",120), kind = text(b.kind,"نوع",20), scope = text(b.scope,"دامنه",20);
    if (!["percent","fixed","freeship"].includes(kind) || !["all","category"].includes(scope)) throw validation("نوع یا دامنه کمپین پشتیبانی نمی‌شود.");
    const value = number(b.value,"مقدار",kind === "percent" ? 100 : 99999999);
    const minSpend = number(b.minSpend,"حداقل خرید");
    const maxDiscount = b.maxDiscount == null || b.maxDiscount === 0 ? null : number(b.maxDiscount,"سقف تخفیف");
    const scopeId = scope === "category" ? text(b.scopeId,"دسته",160) : "";
    const start = dateOnly(b.start), end = dateOnly(b.end);
    if (start && end && start > end) throw validation("تاریخ پایان قبل از شروع است.");
    if (b.freeShipping !== undefined && typeof b.freeShipping !== "boolean") throw validation("گزینه ارسال رایگان معتبر نیست.");
    const freeShipping = b.freeShipping === true && kind !== "freeship";
    const audience = b.audience == null ? null : labelAudience(b.audience);
    let earlyAccess: {mode:"purchase" | "view_purchase"; startsAt:string} | null = null;
    if (b.earlyAccess != null) {
      const access=b.earlyAccess as Record<string,unknown>;
      if (!access || typeof access!=="object" || Array.isArray(access) || Object.keys(access).some(key=>key!=="mode" && key!=="startsAt") ||
          (access.mode!=="purchase" && access.mode!=="view_purchase") || !audience || !start ||
          typeof access.startsAt!=="string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(access.startsAt)) {
        throw validation("برای دسترسی زودهنگام مخاطب، زمان معتبر و تاریخ شروع عمومی لازم است.");
      }
      const inputTime=access.startsAt as string;
      const instant=new Date(inputTime);
      const canonical=inputTime.includes(".") ? inputTime : inputTime.replace(/Z$/, ".000Z");
      if (!Number.isFinite(instant.getTime()) || instant.toISOString() !== canonical || instant.getTime()>=new Date(`${start}T00:00:00Z`).getTime()) throw validation("زمان دسترسی زودهنگام باید معتبر و پیش از شروع عمومی باشد.");
      earlyAccess={mode:access.mode,startsAt:instant.toISOString()};
    }
    const id = `cmp-${randomUUID()}`;
    const campaign = { id, name, kind, value, minSpend, maxDiscount, scope, scopeId, start, end, freeShipping, audience, earlyAccess, active: false, uses: 0, banner: { title: "", text: "", active: false, tone: "gold" }, priority: 0, stackable: false, createdAt: Date.now() };
    await withTransaction(async client => {
      if (audience) {
        const labels=await lockedDefinitions(client);
        if (audience.labels.some(id=>!labels.some(label=>label.id===id))) throw validation("برچسب مخاطب پیدا نشد.");
      }
      const res = await client.query<{value:Record<string,any>}>("select value from state_documents where key='admin' for update");
      const doc = res.rows[0]?.value; if (!doc) throw notFound("سند فروشگاه پیدا نشد.");
      doc.campaigns = [campaign, ...(Array.isArray(doc.campaigns) ? doc.campaigns : [])];
      await client.query("update state_documents set value=$1::jsonb, updated_at=now() where key='admin'", [JSON.stringify(doc)]);
      await client.query(`insert into price_rules(id,name,kind,value,scope,scope_id,min_subtotal,max_discount,priority,stackable,starts_at,ends_at,active,free_shipping,audience,early_access)
        values($1,$2,$3,$4,$5,$6,$7,$8,0,false,$9,$10,false,$11,$12::jsonb,$13::jsonb)`, [id,name,kind === "fixed" ? "amount" : kind,value,scope,scopeId || null,minSpend,maxDiscount,start ? `${start}T00:00:00Z` : null,end ? `${end}T23:59:59.999Z` : null,freeShipping,audience === null ? null : JSON.stringify(audience),earlyAccess === null ? null : JSON.stringify(earlyAccess)]);
      await recordAudit({actor:actor.subject,action:"campaign.created",targetType:"campaign",targetId:id,after:campaign,requestId:req.id},client);
    });
    return reply.code(201).send({ok:true,id});
  });

  // Restricted campaigns are drafts only; discarding one cannot affect an
  // active promotion or historic order. Keep document and projection atomic.
  app.post<{Params:{id:string}}>("/api/admin/marketing/campaigns/:id/discard",async req=>{
    const actor=await requirePermission(req,"campaigns:edit");
    return withTransaction(async client=>{
      const row=(await client.query<{value:Record<string,any>}>("select value from state_documents where key='admin' for update")).rows[0];
      const doc=row?.value;if(!doc || !Array.isArray(doc.campaigns))throw notFound("پیش‌نویس پیدا نشد.");
      const index=doc.campaigns.findIndex((c:any)=>c?.id===req.params.id);
      if(index<0)throw notFound("پیش‌نویس پیدا نشد.");
      const draft=doc.campaigns[index];
      if(draft.audience == null && !hasUnsupportedCampaignRestrictions(draft))throw conflict("فقط پیش‌نویس محدود غیرفعال قابل حذف است.","campaign_draft_not_discardable");
      const projected=(await client.query<{active:boolean}>("select active from price_rules where id=$1 for update",[req.params.id])).rows[0];
      if(projected?.active)throw conflict("قانون قیمت‌گذاری فعال است و باید ابتدا غیرفعال شود.","campaign_draft_not_discardable");
      doc.campaigns.splice(index,1);
      await client.query("update state_documents set value=$1::jsonb,updated_at=now() where key='admin'",[JSON.stringify(doc)]);
      await client.query("delete from price_rules where id=$1 and active=false",[req.params.id]);
      await recordAudit({actor:actor.subject,action:"campaign.draft_discarded",targetType:"campaign",targetId:req.params.id,before:draft,requestId:req.id},client);
      return {ok:true};
    });
  });

  app.post<{Body: Record<string, unknown>}>("/api/admin/marketing/coupons", async (req,reply) => {
    const actor = await requirePermission(req,"campaigns:edit"); const b = req.body ?? {};
    const code = text(b.code,"کد",50).toUpperCase(), kind = text(b.kind,"نوع",20);
    if (!/^[A-Z0-9_-]{3,50}$/.test(code) || !["percent","fixed"].includes(kind)) throw validation("کد یا نوع تخفیف معتبر نیست.");
    const value = number(b.value,"مقدار",kind === "percent" ? 100 : 99999999), minSpend = number(b.minSpend,"حداقل خرید");
    const maxDiscount = b.maxDiscount == null || b.maxDiscount === 0 ? null : number(b.maxDiscount,"سقف تخفیف");
    const usageLimit = b.usageLimit == null ? null : number(b.usageLimit,"تعداد استفاده",100000000);
    if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) throw validation("تعداد استفاده باید عدد صحیح مثبت باشد.");
    const expires = dateOnly(b.expires), id = `coupon-${randomUUID()}`;
    const coupon = {id,code,kind,value,minSpend,maxDiscount,usageLimit,expires,uses:0,active:false,combinable:false};
    await withTransaction(async client => {
      const res = await client.query<{value:Record<string,any>}>("select value from state_documents where key='admin' for update");
      const doc = res.rows[0]?.value; if (!doc) throw notFound("سند فروشگاه پیدا نشد.");
      const existing = await client.query("select 1 from coupons where code=$1",[code]); if (existing.rowCount) throw conflict("این کد تخفیف قبلاً ثبت شده است.");
      doc.coupons = [coupon, ...(Array.isArray(doc.coupons) ? doc.coupons : [])];
      await client.query("update state_documents set value=$1::jsonb, updated_at=now() where key='admin'",[JSON.stringify(doc)]);
      await client.query("insert into coupons(code,kind,value,min_subtotal,max_discount,usage_limit,used_count,ends_at,active,combinable) values($1,$2,$3,$4,$5,$6,0,$7,false,false)", [code,kind === "fixed" ? "amount" : kind,value,minSpend,maxDiscount,usageLimit,expires ? `${expires}T23:59:59.999Z` : null]);
      await recordAudit({actor:actor.subject,action:"coupon.created",targetType:"coupon",targetId:code,after:{code,kind,value,usageLimit,active:false},requestId:req.id},client);
    });
    return reply.code(201).send({ok:true,code});
  });

  app.patch<{Params:{kind:string; id:string}; Body:{active?:boolean}}>("/api/admin/marketing/:kind/:id", async req => {
    const actor = await requirePermission(req,"campaigns:edit");
    const {kind,id} = req.params, active = req.body?.active;
    if (!["campaigns","coupons"].includes(kind) || typeof active !== "boolean") throw validation("وضعیت معتبر نیست.");
    await withTransaction(async client => {
      const labels=kind === "campaigns" ? await lockedDefinitions(client) : [];
      const result = await client.query<{value:Record<string,any>}>("select value from state_documents where key='admin' for update");
      const doc = result.rows[0]?.value; if (!doc) throw notFound("سند فروشگاه پیدا نشد.");
      const key = kind === "campaigns" ? "campaigns" : "coupons";
      const list = Array.isArray(doc[key]) ? doc[key] : [];
      const index = list.findIndex((item:any) => kind === "campaigns" ? item.id === id : String(item.code).toUpperCase() === id.toUpperCase());
      if (index < 0) throw notFound("کمپین یا کد در سند فروشگاه پیدا نشد.");
      if (kind === "campaigns" && active && hasUnsupportedCampaignRestrictions(list[index])) {
        throw conflict("تنظیمات مخاطب نامعتبر است یا دسترسی زودهنگام این کمپین هنوز پشتیبانی نمی‌شود.","campaign_restriction_unsupported");
      }
      const rawAudience=kind === "campaigns" ? list[index].audience ?? null : null;
      const rawAccess=kind === "campaigns" ? list[index].earlyAccess ?? null : null;
      if (active && rawAudience !== null) {
        const audience=labelAudience(rawAudience);
        if(audience.labels.some(labelId=>!labels.some(label=>label.id===labelId))) throw conflict("برچسب مخاطب پیدا نشد؛ فعال‌سازی ممکن نیست.","campaign_audience_invalid");
      }
      list[index] = { ...list[index], active }; doc[key] = list;
      const updated = kind === "campaigns" ? await client.query("update price_rules set active=$2,audience=$3::jsonb,early_access=$4::jsonb,updated_at=now() where id=$1 returning id", [id,active,rawAudience === null ? null : JSON.stringify(rawAudience),rawAccess === null ? null : JSON.stringify(rawAccess)]) : await client.query("update coupons set active=$2,updated_at=now() where code=$1 returning code", [id.toUpperCase(),active]);
      if (!updated.rowCount) throw notFound("کمپین یا کد در قیمت‌گذاری پیدا نشد.");
      await client.query("update state_documents set value=$1::jsonb,updated_at=now() where key='admin'",[JSON.stringify(doc)]);
      await recordAudit({actor:actor.subject,action:`${kind}.status`,targetType:kind,targetId:id,after:{active},requestId:req.id},client);
    });
    return {ok:true};
  });

  app.get("/api/admin/store-brand", async req => {
    await requirePermission(req,"design:view");
    const result = await query<{value:Record<string,any>}>("select value from state_documents where key='ops'");
    return result.rows[0]?.value?.brand ?? {};
  });
  app.patch<{Body:Record<string,unknown>}>("/api/admin/store-brand",async req => {
    const actor = await requirePermission(req,"design:edit"); const b = req.body ?? {};
    const allowed = ["name","logoText","tagline","announcement","announcementActive","footerNote"];
    if (!Object.keys(b).length || Object.keys(b).some(key => !allowed.includes(key))) throw validation("فیلد تنظیمات ظاهر معتبر نیست.");
    const patch:Record<string,unknown> = {};
    for (const key of allowed) if (key in b) {
      if (key === "announcementActive") { if (typeof b[key] !== "boolean") throw validation("وضعیت پیام معتبر نیست."); patch[key] = b[key]; }
      else patch[key] = text(b[key],"متن",key === "footerNote" ? 1000 : 300,key === "name");
    }
    await withTransaction(async client => {
      const result = await client.query<{value:Record<string,any>}>("select value from state_documents where key='ops' for update");
      const doc = result.rows[0]?.value; if (!doc) throw notFound("سند ظاهر پیدا نشد.");
      doc.brand = {...(doc.brand ?? {}),...patch};
      await client.query("update state_documents set value=$1::jsonb,updated_at=now() where key='ops'",[JSON.stringify(doc)]);
      await client.query("insert into settings(key,value,updated_at) values('brand',$1::jsonb,now()) on conflict(key) do update set value=excluded.value,updated_at=now()",[JSON.stringify(doc.brand)]);
      await recordAudit({actor:actor.subject,action:"design.brand_updated",targetType:"brand",targetId:"store",after:patch,requestId:req.id},client);
    });
    return {ok:true};
  });

  app.get("/api/admin/finance/summary", async req => {
    await requirePermission(req,"finance:view");
    const result = await query(`select coalesce(currency,'نامشخص') as currency, coalesce(payment_status,'نامشخص') as payment_status,
        count(*)::int as orders, coalesce(sum(total),0)::float8 as total
        from orders group by 1,2 order by 1,2`);
    return { groups: result.rows, note: "مبالغ ثبت‌شدهٔ سفارش‌اند و جایگزین گزارش تسویهٔ بانکی نیستند؛ پرداخت دستی ممکن است فقط تأیید مدیر باشد." };
  });
}
