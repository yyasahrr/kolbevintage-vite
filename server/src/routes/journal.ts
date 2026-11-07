import {randomUUID} from "node:crypto";
import type {FastifyInstance} from "fastify";
import {query,withTransaction} from "../db";
import {requirePermission} from "../http/rbac";
import {recordAudit} from "../commerce/audit";
import {conflict,notFound,validation} from "../commerce/errors";
import {prepareProductImage} from "../image-upload";

type Article={id:string;slug:string;title:string;excerpt:string;category:string;body:string;cover_url:string;seo_title:string;seo_description:string;status:"draft"|"published";published_at:Date|null;version:number;created_at:Date;updated_at:Date};
const fields="id,slug,title,excerpt,category,body,cover_url,seo_title,seo_description,status,published_at,version,created_at,updated_at";
const requiredText=(value:unknown,label:string,max:number,required=false)=>{
  if(typeof value!=="string" || value.trim().length>max || (required && !value.trim())) throw validation(`${label} معتبر نیست.`);
  return value.trim();
};
const slugOf=(value:unknown)=>{
  const slug=requiredText(value,"شناسهٔ مقاله",80,true).toLowerCase();
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw validation("شناسهٔ مقاله باید لاتین و شامل خط تیره باشد.");
  return slug;
};
const dto=(a:Article)=>({id:a.id,slug:a.slug,title:a.title,excerpt:a.excerpt,category:a.category,body:a.body,coverUrl:a.cover_url,seoTitle:a.seo_title,seoDescription:a.seo_description,status:a.status,publishedAt:a.published_at,version:a.version,createdAt:a.created_at,updatedAt:a.updated_at});
const isEnabled=async()=>{
  const row=await query<{enabled:boolean}>("select coalesce((value->'features'->>'journal')::boolean,false) as enabled from state_documents where key='ops'");
  return row.rows[0]?.enabled === true;
};
function cleanFields(b:Record<string,unknown>) {
  return {title:requiredText(b.title,"عنوان",160,true),excerpt:requiredText(b.excerpt,"خلاصه",500),category:requiredText(b.category,"دسته",80,true),body:requiredText(b.body,"متن",30000),seoTitle:requiredText(b.seoTitle,"عنوان سئو",160),seoDescription:requiredText(b.seoDescription,"توضیح سئو",320)};
}

export async function journalRoutes(app:FastifyInstance) {
  app.get<{Querystring:{before?:unknown}}>("/api/public/journal",async (req,reply)=>{
    reply.header("cache-control","no-store");
    const before=req.query.before;
    if(before!==undefined && (typeof before!=="string" || !/^article-[a-f0-9-]{36}$/.test(before))) throw validation("نشانگر صفحه معتبر نیست.");
    if(!await isEnabled()) return {items:[],enabled:false,nextCursor:null};
    // Recheck visibility in the same statement as the list so an intervening
    // disable cannot expose articles. Cursor anchors are also public articles.
    const rows=await query<Article>(`select ${fields} from journal_articles
      where status='published' and published_at<=now()
        and exists(select 1 from state_documents where key='ops' and value->'features'->>'journal'='true')
        and ($1::text is null or (published_at,id)<(select published_at,id from journal_articles where id=$1 and status='published' and published_at<=now()))
      order by published_at desc,id desc limit 101`,[before ?? null]);
    const page=rows.rows.slice(0,100);
    return {items:page.map(dto),enabled:true,nextCursor:rows.rows.length>100?page[page.length-1].id:null};
  });
  app.get<{Params:{slug:string}}>("/api/public/journal/:slug",async (req,reply)=>{
    reply.header("cache-control","no-store");
    if(!await isEnabled()) throw notFound("مقاله پیدا نشد.");
    const rows=await query<Article>(`select ${fields} from journal_articles where slug=$1 and status='published' and published_at<=now() and exists(select 1 from state_documents where key='ops' and value->'features'->>'journal'='true')`,[req.params.slug]);
    if(!rows.rows[0]) throw notFound("مقاله پیدا نشد.");
    return dto(rows.rows[0]);
  });
  app.get<{Querystring:{before?:unknown}}>("/api/admin/journal",async (req,reply)=>{
    await requirePermission(req,"content:view");reply.header("cache-control","no-store");
    const before=req.query.before;
    if(before!==undefined && (typeof before!=="string" || !/^article-[a-f0-9-]{36}$/.test(before))) throw validation("نشانگر صفحه معتبر نیست.");
    // Stable creation order keeps edits from silently shifting articles between
    // pages. Compare inside Postgres so timestamps keep microsecond precision.
    const rows=await query<Article>(`select ${fields} from journal_articles
      where ($1::text is null or (created_at,id)<(select created_at,id from journal_articles where id=$1))
      order by created_at desc,id desc limit 201`,[before ?? null]);
    const page=rows.rows.slice(0,200);
    return {items:page.map(dto),enabled:await isEnabled(),nextCursor:rows.rows.length>200?page[page.length-1].id:null};
  });
  app.post<{Body:Record<string,unknown>}>("/api/admin/journal",async (req,reply)=>{
    const actor=await requirePermission(req,"content:edit");const b=req.body;
    if(!b || typeof b!=="object" || Object.keys(b).some(k=>!["slug","title","excerpt","category","body","seoTitle","seoDescription"].includes(k))) throw validation("فیلد مقاله معتبر نیست.");
    const slug=slugOf(b.slug);const f=cleanFields(b);const id=`article-${randomUUID()}`;
    try {
      const result=await withTransaction(async client=>{
        const row=await client.query<Article>(`insert into journal_articles(id,slug,title,excerpt,category,body,seo_title,seo_description) values($1,$2,$3,$4,$5,$6,$7,$8) returning ${fields}`,[id,slug,f.title,f.excerpt,f.category,f.body,f.seoTitle,f.seoDescription]);
        await recordAudit({actor:actor.subject,action:"journal.created",targetType:"article",targetId:id,after:{slug,title:f.title,status:"draft"},requestId:req.id},client);
        return row.rows[0];
      });return reply.code(201).send(dto(result));
    } catch(e) {if((e as {code?:string}).code==="23505") throw conflict("این شناسهٔ مقاله قبلاً ثبت شده است.","journal_slug_taken");throw e;}
  });
  app.patch<{Params:{id:string};Body:Record<string,unknown>}>("/api/admin/journal/:id",async req=>{
    const actor=await requirePermission(req,"content:edit");const b=req.body;
    const allowed=["expectedVersion","title","excerpt","category","body","seoTitle","seoDescription","status","publishedAt","coverData","removeCover"];
    if(!b || typeof b!=="object" || Object.keys(b).some(k=>!allowed.includes(k)) || !Number.isInteger(b.expectedVersion) || Number(b.expectedVersion)<1) throw validation("نسخه یا فیلد مقاله معتبر نیست.");
    const f=cleanFields(b);
    if(b.status!=="draft" && b.status!=="published") throw validation("وضعیت مقاله معتبر نیست.");
    if(b.removeCover!==undefined && typeof b.removeCover!=="boolean") throw validation("عملیات تصویر معتبر نیست.");
    if(b.coverData!==undefined && (typeof b.coverData!=="string" || !b.coverData)) throw validation("تصویر معتبر نیست.");
    if(b.coverData && b.removeCover) throw validation("تصویر جدید و حذف تصویر هم‌زمان مجاز نیست.");
    if(b.status==="published" && !f.body) throw validation("برای انتشار متن مقاله را وارد کنید.");
    let scheduled:Date|null=null;
    if(b.status==="published") {
      if(b.publishedAt == null || b.publishedAt === "") scheduled=new Date();
      else if(typeof b.publishedAt === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(b.publishedAt) && Number.isFinite(Date.parse(b.publishedAt))) scheduled=new Date(b.publishedAt);
      else throw validation("زمان انتشار معتبر نیست.");
    }
    // Publication permission is needed for entering, leaving or editing the
    // published state, including changing a future scheduled article.
    const initial=await query<{status:string}>("select status from journal_articles where id=$1",[req.params.id]);
    if(!initial.rows[0]) throw notFound("مقاله پیدا نشد.");
    if(b.status==="published" || initial.rows[0].status==="published") await requirePermission(req,"content:publish");
    const upload=b.coverData ? await prepareProductImage(b.coverData) : null;
    try {
      return await withTransaction(async client=>{
        const rows=await client.query<Article>(`select ${fields} from journal_articles where id=$1 for update`,[req.params.id]);
        const old=rows.rows[0];if(!old) throw notFound("مقاله پیدا نشد.");
        if(old.version!==b.expectedVersion) throw conflict("این مقاله هم‌زمان تغییر کرده است؛ ابتدا آن را تازه کنید.","journal_stale");
        // Version check is authoritative even if the status changed between the
        // permission check and acquiring the lock.
        const cover=upload?.url ?? (b.removeCover ? "" : old.cover_url);
        const result=await client.query<Article>(`update journal_articles set title=$2,excerpt=$3,category=$4,body=$5,seo_title=$6,seo_description=$7,status=$8,published_at=$9,cover_url=$10,version=version+1,updated_at=now() where id=$1 returning ${fields}`,[old.id,f.title,f.excerpt,f.category,f.body,f.seoTitle,f.seoDescription,b.status,scheduled,cover]);
        await recordAudit({actor:actor.subject,action:"journal.updated",targetType:"article",targetId:old.id,before:{title:old.title,status:old.status,publishedAt:old.published_at,version:old.version},after:{title:f.title,status:b.status,publishedAt:scheduled,version:old.version+1,coverChanged:cover!==old.cover_url},requestId:req.id},client);
        return dto(result.rows[0]);
      });
    } catch(e) {await upload?.discard();throw e;}
  });
  app.patch<{Body:{enabled?:unknown;expectedEnabled?:unknown}}>("/api/admin/journal-settings",async req=>{
    const actor=await requirePermission(req,"content:publish");const b=req.body;
    if(!b || typeof b.enabled!=="boolean" || typeof b.expectedEnabled!=="boolean" || Object.keys(b).some(k=>!["enabled","expectedEnabled"].includes(k))) throw validation("وضعیت ژورنال معتبر نیست.");
    return withTransaction(async client=>{
      const result=await client.query<{value:Record<string,any>}>("select value from state_documents where key='ops' for update");const doc=result.rows[0]?.value;if(!doc) throw notFound("تنظیمات فروشگاه پیدا نشد.");
      const current=doc.features?.journal === true;if(current!==b.expectedEnabled) throw conflict("وضعیت ژورنال تغییر کرده است؛ اطلاعات را تازه کنید.","journal_settings_stale");
      if(current!==b.enabled){doc.features={...(doc.features ?? {}),journal:b.enabled};await client.query("update state_documents set value=$1::jsonb,updated_at=now() where key='ops'",[JSON.stringify(doc)]);await recordAudit({actor:actor.subject,action:"journal.visibility",targetType:"journal",targetId:"store",before:{enabled:current},after:{enabled:b.enabled},requestId:req.id},client);}
      return {enabled:b.enabled};
    });
  });
}
