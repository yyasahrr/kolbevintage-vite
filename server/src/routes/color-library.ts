import {randomUUID} from "node:crypto";
import type {FastifyInstance} from "fastify";
import type {PoolClient} from "pg";
import {query,withTransaction} from "../db";
import {requirePermission} from "../http/rbac";
import {recordAudit} from "../commerce/audit";
import {conflict,notFound,validation} from "../commerce/errors";

type Color={id:string;name:string;hex:string;family:string;active:boolean;order:number;version?:number;[key:string]:unknown};
type Body={name?:unknown;hex?:unknown;family?:unknown;active?:unknown;order?:unknown;expectedVersion?:unknown};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
const clean=(v:unknown)=>typeof v==="string"?v.normalize("NFKC").trim():"";
function list(doc:Record<string,unknown>):Color[]{
  if(doc.colorLibrary===undefined)return [];
  if(!Array.isArray(doc.colorLibrary)||doc.colorLibrary.some((c:unknown)=>!object(c)||typeof c.id!=="string"||!c.id||typeof c.name!=="string"||typeof c.hex!=="string"||typeof c.family!=="string"||typeof c.active!=="boolean"||typeof c.order!=="number"||!Number.isSafeInteger(c.order)||(c.version!==undefined&&(!Number.isSafeInteger(c.version)||Number(c.version)<0)))||new Set(doc.colorLibrary.map((c:Color)=>c.id)).size!==doc.colorLibrary.length)throw conflict("ساختار کتابخانهٔ رنگ قبلی قابل ویرایش نیست؛ ابتدا داده‌ها را بررسی کنید.","color_library_invalid");
  return doc.colorLibrary as Color[];
}
function checked(body:Body,edit:boolean){
  if(!object(body)||Object.keys(body).some(k=>!(edit?["name","hex","family","active","order","expectedVersion"]:["name","hex","family","active","order"]).includes(k)))throw validation("فیلد رنگ معتبر نیست.");
  const name=clean(body.name),family=clean(body.family),hex=clean(body.hex).toLowerCase();
  if(!name||name.length>80||family.length>80||!/^#[0-9a-f]{6}$/.test(hex)||typeof body.active!=="boolean"||!Number.isInteger(body.order)||Number(body.order)<0||Number(body.order)>1000000)throw validation("نام، کد شش‌رقمی رنگ، وضعیت و ترتیب معتبر لازم است.");
  if(edit&&(!Number.isSafeInteger(body.expectedVersion)||Number(body.expectedVersion)<0))throw validation("نسخهٔ قبلی رنگ لازم است.");
  return {name,family,hex,active:body.active,order:body.order as number};
}
async function locked(client:PoolClient){const result=await client.query<{value:Record<string,unknown>}>("select value from state_documents where key='ops' for update");const doc=result.rows[0]?.value;if(!doc)throw notFound("تنظیمات فروشگاه پیدا نشد.");return {doc,colors:list(doc)}}
async function saveDoc(client:PoolClient,doc:Record<string,unknown>,colors:Color[]){doc.colorLibrary=colors;await client.query("update state_documents set value=$1::jsonb,updated_at=now() where key='ops'",[JSON.stringify(doc)])}
export async function colorLibraryRoutes(app:FastifyInstance){
  app.get("/api/admin/color-library",async(req,reply)=>{await requirePermission(req,"catalog:view");reply.header("cache-control","private, no-store");const result=await query<{value:Record<string,unknown>}>("select value from state_documents where key='ops'");if(!result.rows[0])throw notFound("تنظیمات فروشگاه پیدا نشد.");return list(result.rows[0].value).map(c=>({...c,version:c.version??0})).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));});
  async function save(id:string|null,body:Body,actor:string,requestId:string){const value=checked(body,!!id);return withTransaction(async client=>{const {doc,colors}=await locked(client);if(!id&&colors.length>=500)throw conflict("حداکثر ۵۰۰ رنگ در کتابخانه مجاز است.","color_library_limit");const index=id?colors.findIndex(c=>c.id===id):-1;const before=id?colors[index]:undefined;if(id&&!before)throw notFound("رنگ پیدا نشد.");if(before&&(before.version??0)!==body.expectedVersion)throw conflict("رنگ هم‌زمان تغییر کرده است؛ فهرست را تازه کنید.","color_stale");if(colors.some(c=>c.id!==id&&clean(c.name).toLocaleLowerCase()===value.name.toLocaleLowerCase()))throw conflict("نام رنگ تکراری است.","color_duplicate");if(before&&(before.version??0)>=2147483647)throw conflict("نسخه رنگ بیش از حد مجاز است.","color_version_exhausted");const next:Color=before?{...before,...value,version:(before.version??0)+1}:{id:`color-${randomUUID()}`,...value,version:0};if(before)colors[index]=next;else colors.push(next);await saveDoc(client,doc,colors);await recordAudit({actor,action:id?"catalog.color_updated":"catalog.color_created",targetType:"color_library",targetId:next.id,before:before??null,after:next,requestId},client);return next;});}
  app.post<{Body:Body}>("/api/admin/color-library",async(req,reply)=>{const actor=await requirePermission(req,"catalog:edit");return reply.code(201).send({color:await save(null,req.body,actor.subject,req.id)});});
  app.patch<{Params:{id:string};Body:Body}>("/api/admin/color-library/:id",async req=>{const actor=await requirePermission(req,"catalog:edit");return {color:await save(req.params.id,req.body,actor.subject,req.id)};});
  app.post<{Params:{id:string};Body:{expectedVersion?:unknown}}>("/api/admin/color-library/:id/delete",async req=>{const actor=await requirePermission(req,"catalog:edit");const body=req.body;if(!object(body)||Object.keys(body).some(k=>k!=="expectedVersion")||!Number.isSafeInteger(body.expectedVersion)||Number(body.expectedVersion)<0)throw validation("نسخهٔ قبلی رنگ لازم است.");return withTransaction(async client=>{const {doc,colors}=await locked(client);const index=colors.findIndex(c=>c.id===req.params.id);if(index<0)throw notFound("رنگ پیدا نشد.");const before=colors[index];if((before.version??0)!==body.expectedVersion)throw conflict("رنگ هم‌زمان تغییر کرده است؛ فهرست را تازه کنید.","color_stale");colors.splice(index,1);await saveDoc(client,doc,colors);await recordAudit({actor:actor.subject,action:"catalog.color_deleted",targetType:"color_library",targetId:before.id,before,requestId:req.id},client);return {ok:true};});});
}
