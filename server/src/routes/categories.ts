import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import type { FastifyInstance } from "fastify";
import { ROOT, config } from "../config";
import { query, withTransaction } from "../db";
import { requirePermission } from "../http/rbac";
import { recordAudit } from "../commerce/audit";
import { conflict, notFound, validation } from "../commerce/errors";

const stockFiles: Record<string,string> = {
  hero:"editorial/hero.jpg", atelier:"editorial/atelier.jpg", campaign:"editorial/campaign.jpg",
  look1:"models/look-1.webp", look2:"models/look-2.webp", look3:"models/look-3.webp",
  look4:"models/look-4.webp", look5:"models/look-5.webp", look6:"models/look-6.webp",
};
export async function categoryRoutes(app: FastifyInstance) {
  app.get<{Params:{key:string}}>("/api/catalog/stock-image/:key", async (req,reply) => {
    const file=Object.hasOwn(stockFiles,req.params.key) ? stockFiles[req.params.key] : undefined;
    if (!file) throw notFound("تصویر پیدا نشد.");
    return reply.type(file.endsWith(".jpg") ? "image/jpeg" : "image/webp").header("Cache-Control","public, max-age=86400").send(fs.createReadStream(path.join(ROOT,"src/assets",file)));
  });
  app.get("/api/admin/categories", async req => {
    await requirePermission(req,"catalog:view");
    const result=await query<{value:{categories?:unknown[]}}>("select value from state_documents where key='ops'");
    return result.rows[0]?.value?.categories ?? [];
  });
  // Categories are deliberately flat: products refer to their category name,
  // so renaming an in-use category is rejected rather than orphaning products
  // or silently changing campaign applicability.
  const cleanName = (value: unknown) => typeof value === "string" ? value.normalize("NFKC").trim() : "";
  const key = (value: unknown) => cleanName(value).toLocaleLowerCase();
  type CategoryInput = {name?:unknown; slug?:unknown; active?:unknown; order?:unknown; sizeSetId?:unknown; expected?:unknown};
  const snapshot = (c:Record<string,any>) => ({name:c.name,active:c.active,order:c.order ?? 0,sizeSetId:c.sizeSetId ?? ""});
  async function saveCategory(id: string | null, body: CategoryInput, actor: string, requestId: string) {
    const allowed = id ? ["name","active","order","sizeSetId","expected"] : ["name","slug","active","order","sizeSetId"];
    if (!body || typeof body !== "object" || Object.keys(body).some(k=>!allowed.includes(k))) throw validation("فیلد دسته‌بندی معتبر نیست؛ زیردسته پشتیبانی نمی‌شود.");
    return withTransaction(async client => {
      const result = await client.query<{value:Record<string,any>}>("select value from state_documents where key='ops' for update");
      const doc = result.rows[0]?.value; if (!doc) throw notFound("سند فروشگاه پیدا نشد.");
      const categories:Record<string,any>[] = Array.isArray(doc.categories) ? doc.categories : [];
      const index = id ? categories.findIndex(c=>c.id===id) : -1;
      if (id && index < 0) throw notFound("دسته‌بندی پیدا نشد.");
      const previous = id ? categories[index] : null;
      if (previous && body.expected !== undefined) {
        const expected = body.expected;
        if (!expected || typeof expected !== "object" || Array.isArray(expected) || Object.keys(expected).sort().join(",") !== "active,name,order,sizeSetId") throw validation("نسخهٔ قبلی دسته معتبر نیست.");
        const old=expected as Record<string,unknown>, actual=snapshot(previous);
        if (old.name!==actual.name || old.active!==actual.active || old.order!==actual.order || old.sizeSetId!==actual.sizeSetId) throw conflict("دسته هم‌زمان تغییر کرده است؛ فهرست را تازه کنید.","category_stale");
      }
      const name = body.name === undefined && previous ? previous.name : cleanName(body.name);
      const slug = previous?.slug ?? (typeof body.slug === "string" ? body.slug.trim().toLowerCase() : "");
      const active = body.active === undefined ? previous?.active ?? true : body.active;
      const order = body.order === undefined ? previous?.order ?? (categories.reduce((n,c)=>Math.max(n,Number(c.order)||0),0)+1) : body.order;
      const sizeSetId = body.sizeSetId === undefined ? previous?.sizeSetId ?? "" : body.sizeSetId;
      if (!name || name.length > 100 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length>80 || typeof active !== "boolean" || typeof order !== "number" || !Number.isInteger(order) || order<0 || order>100000 || typeof sizeSetId !== "string" || sizeSetId.length>80) throw validation("نام، شناسه لاتین، وضعیت یا ترتیب معتبر نیست.");
      if (sizeSetId && !(Array.isArray(doc.sizeSets) && doc.sizeSets.some((set:any)=>set.id===sizeSetId))) throw validation("الگوی سایز پیدا نشد.");
      if (categories.some(c=>c.id!==id && (key(c.name)===key(name) || key(c.slug)===slug))) throw conflict("نام یا شناسه دسته‌بندی تکراری است.","category_duplicate");
      if (previous && previous.name !== name) {
        const used = await client.query<{used:boolean}>(`select exists(select 1 from products where category=$1) or exists(select 1 from price_rules where scope='category' and scope_id=$1) as used`,[previous.name]);
        if (used.rows[0].used) throw conflict("نام دسته در محصولات یا کمپین‌ها استفاده شده است؛ ابتدا وابستگی‌ها را تغییر دهید.","category_in_use");
      }
      const category = previous ? {...previous,name,active,order,sizeSetId} : {id:`cat-${randomUUID()}`,name,slug,garments:[],thumbnail:"",sizeSetId,active,order};
      if (id) categories[index]=category; else categories.push(category);
      doc.categories=categories;
      await client.query("update state_documents set value=$1::jsonb,updated_at=now() where key='ops'",[JSON.stringify(doc)]);
      await client.query(`insert into settings(key,value,updated_at) values('categories',$1::jsonb,now()) on conflict(key) do update set value=excluded.value,updated_at=now()`,[JSON.stringify(categories)]);
      await recordAudit({actor,action:id?"category.update":"category.create",targetType:"category",targetId:category.id,before:previous?{name:previous.name,active:previous.active,order:previous.order,sizeSetId:previous.sizeSetId}:null,after:{name,slug,active,order,sizeSetId},requestId},client);
      return category;
    });
  }
  app.post<{Body:CategoryInput}>("/api/admin/categories", async (req,reply) => {
    const session=await requirePermission(req,"catalog:edit");
    const category=await saveCategory(null,req.body,session.subject,req.id);
    return reply.code(201).send({ok:true,category});
  });
  app.patch<{Params:{id:string};Body:CategoryInput}>("/api/admin/categories/:id", async req => {
    const session=await requirePermission(req,"catalog:edit");
    return {ok:true,category:await saveCategory(req.params.id,req.body,session.subject,req.id)};
  });
  app.patch<{Params:{id:string};Body:{image?:string;expectedThumbnail?:unknown}}>("/api/admin/categories/:id/thumbnail", async req => {
    const actor=await requirePermission(req,"catalog:edit");
    const image=req.body?.image;
    if (!req.body || Object.keys(req.body).some(k=>!["image","expectedThumbnail"].includes(k)) || typeof image !== "string" || (req.body.expectedThumbnail !== undefined && typeof req.body.expectedThumbnail !== "string")) throw validation("تصویر یا نسخهٔ قبلی معتبر نیست.");
    let filename:string|undefined;
    let thumbnail=image;
    if (image.startsWith("data:")) {
      const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
      if (!match || match[2].length > 11_184_812) throw validation("فایل باید تصویر JPEG، PNG یا WebP حداکثر ۸ مگابایت باشد.");
      const bytes=Buffer.from(match[2],"base64");
      if (!bytes.length || bytes.length > 8*1024*1024) throw validation("حجم تصویر معتبر نیست.");
      let processed:Buffer;
      try {
        const input=sharp(bytes,{limitInputPixels:40000000,failOn:"error"});
        const metadata=await input.metadata();
        if (!["jpeg","png","webp"].includes(metadata.format ?? "")) throw new Error("invalid image");
        processed=await input.rotate().resize(600,600,{fit:"cover",withoutEnlargement:true}).webp({quality:82}).toBuffer();
      } catch { throw validation("فایل تصویر قابل خواندن نیست."); }
      await fsp.mkdir(config.uploadsDir,{recursive:true});
      filename=`category-${randomUUID()}.webp`;
      await fsp.writeFile(path.join(config.uploadsDir,filename),processed,{flag:"wx"});
      thumbnail=`/uploads/${filename}`;
    } else if (image !== "" && !/^https:\/\//i.test(image) && !/^\/uploads\/[a-zA-Z0-9._-]+$/.test(image) && !(image.startsWith("stock:") && Object.hasOwn(stockFiles,image.slice(6)))) {
      throw validation("نشانی تصویر باید HTTPS یا تصویر موجود فروشگاه باشد.");
    }
    if (thumbnail.length > 2048) throw validation("نشانی تصویر بیش از حد طولانی است.");
    try {
      const category = await withTransaction(async client => {
        const res=await client.query<{value:Record<string,any>}>("select value from state_documents where key='ops' for update");
        const doc=res.rows[0]?.value;
        const categories=Array.isArray(doc?.categories)?doc.categories:[];
        const index=categories.findIndex((c:any)=>c.id===req.params.id);
        if(index<0) throw notFound("دسته‌بندی پیدا نشد.");
        const before=categories[index].thumbnail ?? "";
        if (req.body.expectedThumbnail !== undefined && before !== req.body.expectedThumbnail) throw conflict("تصویر دسته هم‌زمان تغییر کرده است؛ فهرست را تازه کنید.","category_thumbnail_stale");
        categories[index]={...categories[index],thumbnail}; doc.categories=categories;
        await client.query("update state_documents set value=$1::jsonb,updated_at=now() where key='ops'",[JSON.stringify(doc)]);
        await client.query(`insert into settings(key,value,updated_at) values('categories',$1::jsonb,now()) on conflict(key) do update set value=excluded.value,updated_at=now()`,[JSON.stringify(categories)]);
        await recordAudit({actor:actor.subject,action:"category.thumbnail",targetType:"category",targetId:req.params.id,before:{thumbnail:typeof before === "string" && before.startsWith("data:") ? "[inline image]" : before},after:{thumbnail},requestId:req.id},client);
        return categories[index];
      });
      return {ok:true,category};
    } catch(err) {
      if (filename) await fsp.unlink(path.join(config.uploadsDir,filename)).catch(()=>{});
      throw err;
    }
  });
}
