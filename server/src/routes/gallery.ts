import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { query, withTransaction } from "../db";
import { CommerceError } from "../commerce/errors";
import { actorOf } from "../commerce/auth";
import { recordAudit } from "../commerce/audit";
import { requirePermission } from "../http/rbac";

interface GalleryBody {
  handle?: string;
  email?: string;
  imageUrl?: string;
  caption?: string;
  consent?: boolean;
}

const publicRow = (row: any) => ({
  id: row.id,
  handle: row.customer_handle,
  imageUrl: row.image_url,
  caption: row.caption,
  status: row.moderation_status,
  consentVerified: row.consent_verified,
  submittedAt: row.submitted_at,
  moderatedAt: row.moderated_at,
  moderatedBy: row.moderated_by,
  version: row.moderation_version,
});

const visitorRow = (row:any)=>({id:row.id,handle:row.customer_handle,imageUrl:row.image_url,caption:row.caption,submittedAt:row.submitted_at});
const pageArgs=(q:{before?:unknown;limit?:unknown})=>{
  const {before,limit='12'}=q;
  if((before!==undefined&&(typeof before!=='string'||!before||before.length>200))||typeof limit!=='string'||!/^(?:[1-9]|1[0-9]|20)$/.test(limit))throw new CommerceError("نشانگر یا اندازهٔ صفحه معتبر نیست.",422,"validation_error");
  return {before:before as string|undefined,limit:Number(limit)};
};
export async function galleryRoutes(app: FastifyInstance) {
  app.get("/api/gallery", async (_req,reply) => {
    reply.header("cache-control","no-store");
    const rows = await query(
      `select * from gallery_items
        where moderation_status = 'approved' and consent_verified = true
        order by submitted_at desc limit 60`,
    );
    return rows.rows.map(visitorRow);
  });

  app.get<{Querystring:{before?:string;limit?:string}}>("/api/gallery/page",async(req,reply)=>{
    reply.header("cache-control","no-store");const {before,limit}=pageArgs(req.query);
    if(before&&!(await query("select 1 from gallery_items where id=$1 and moderation_status='approved' and consent_verified",[before])).rowCount)throw new CommerceError("نشانگر صفحه دیگر معتبر نیست؛ گالری را تازه کنید.",422,"invalid_cursor");
    const rows=await query(`select id,customer_handle,image_url,caption,submitted_at from gallery_items where moderation_status='approved' and consent_verified and ($1::text is null or (submitted_at,id)<(select submitted_at,id from gallery_items where id=$1 and moderation_status='approved' and consent_verified)) order by submitted_at desc,id desc limit $2`,[before??null,limit+1]);
    const items=rows.rows.slice(0,limit);return {items:items.map(visitorRow),nextCursor:rows.rows.length>limit?items[items.length-1].id:null};
  });

  app.post<{ Body: GalleryBody }>("/api/gallery", async (req, reply) => {
    const handle = String(req.body?.handle ?? "").trim().slice(0, 60);
    const email = String(req.body?.email ?? "").trim().toLowerCase().slice(0, 180);
    const imageUrl = String(req.body?.imageUrl ?? "").trim();
    const caption = String(req.body?.caption ?? "").trim().slice(0, 500);
    const isInlineImage = /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(imageUrl) && imageUrl.length <= 3_000_000;
    const isRemoteImage = /^https:\/\/[^\s]+$/i.test(imageUrl) && imageUrl.length <= 2000;
    const isUploadedImage = /^\/uploads\/[a-z0-9._-]+$/i.test(imageUrl);
    if (!handle || (!isInlineImage && !isRemoteImage && !isUploadedImage)) {
      return reply.code(400).send({ error: "نام نمایشی و یک تصویر معتبر لازم است." });
    }
    if (req.body?.consent !== true) {
      return reply.code(400).send({ error: "برای ارسال تصویر باید رضایت انتشار را تأیید کنی." });
    }
    const id = `gal_${randomUUID()}`;
    await query(
      `insert into gallery_items (id, customer_handle, email, image_url, caption, moderation_status, consent_verified)
       values ($1, $2, $3, $4, $5, 'pending', true)`,
      [id, handle, email || null, imageUrl, caption],
    );
    return reply.code(201).send({ ok: true, id, status: "pending" });
  });

  app.get<{Querystring:{before?:string;limit?:string;status?:string;search?:string}}>("/api/admin/gallery/page",async(req,reply)=>{
    reply.header("cache-control","private, no-store");await requirePermission(req,"content:view");const {before,limit}=pageArgs(req.query);const status=req.query.status??'all',search=req.query.search??'';
    if(typeof status!=='string'||!['all','pending','approved','rejected'].includes(status)||typeof search!=='string'||search.length>120)throw new CommerceError("فیلتر معتبر نیست.",422,"validation_error");
    const term=search.trim();
    const filters=`($2='all' or moderation_status=$2) and ($3='' or strpos(lower(id),lower($3))>0 or strpos(lower(customer_handle),lower($3))>0 or strpos(lower(caption),lower($3))>0)`;
    if(before&&!(await query(`select 1 from gallery_items where id=$1 and ${filters}`,[before,status,term])).rowCount)throw new CommerceError("نشانگر صفحه دیگر معتبر نیست؛ فهرست را تازه کنید.",422,"invalid_cursor");
    const rows=await query(`select * from gallery_items where ${filters} and ($1::text is null or (submitted_at,id)<(select submitted_at,id from gallery_items where id=$1)) order by submitted_at desc,id desc limit $4`,[before??null,status,term,limit+1]);
    const items=rows.rows.slice(0,limit);return {items:items.map(publicRow),nextCursor:rows.rows.length>limit?items[items.length-1].id:null};
  });

  app.get("/api/admin/gallery", async (req,reply) => {
    reply.header("cache-control","no-store");
    await requirePermission(req, "content:view");
    const rows = await query("select * from gallery_items order by submitted_at desc limit 200");
    return rows.rows.map(publicRow);
  });

  app.patch<{ Params: { id: string }; Body: { status?: unknown; expectedVersion?: unknown } }>(
    "/api/admin/gallery/:id", async (req,reply)=>{
      const session=await requirePermission(req,"content:edit");reply.header("cache-control","private, no-store");
      const status=req.body?.status,expected=req.body?.expectedVersion;
      if(typeof status!=="string"||!["approved","rejected","pending"].includes(status)||typeof expected!=="number"||!Number.isSafeInteger(expected)||expected<0) return reply.code(400).send({error:"وضعیت یا نسخهٔ بازبینی نامعتبر است."});
      const result=await withTransaction(async client=>{
        const row=(await client.query("select * from gallery_items where id=$1 for update",[req.params.id])).rows[0];
        if(!row)return {state:'missing' as const};
        if(row.moderation_version!==expected)return {state:'conflict' as const};
        if(status==='approved'&&!row.consent_verified)return {state:'consent' as const};
        if(row.moderation_status===status)return {state:'unchanged' as const,item:publicRow(row)};
        const changed=(await client.query(`update gallery_items set moderation_status=$2,moderated_at=now(),moderated_by=$3,moderation_version=moderation_version+1 where id=$1 returning *`,[req.params.id,status,actorOf(session)])).rows[0];
        await recordAudit({actor:actorOf(session),action:`gallery.${status}`,targetType:'gallery_item',targetId:req.params.id,before:{status:row.moderation_status,version:row.moderation_version},after:{status,version:changed.moderation_version},requestId:req.id},client);
        return {state:'ok' as const,item:publicRow(changed)};
      });
      if(result.state==='missing')return reply.code(404).send({error:"تصویر پیدا نشد."});
      if(result.state==='conflict')return reply.code(409).send({code:'gallery_conflict',error:"تصویر هم‌زمان تغییر کرده؛ فهرست را دوباره دریافت کنید."});
      if(result.state==='consent')return reply.code(409).send({code:'consent_required',error:"انتشار بدون رضایت ثبت‌شده ممکن نیست."});
      return {ok:true,item:result.item,unchanged:result.state==='unchanged'};
    },
  );
}
