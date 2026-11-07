import {randomUUID} from 'node:crypto';
import type {FastifyInstance} from 'fastify';
import {query,withTransaction} from '../db';
import {requirePermission} from '../http/rbac';
import {recordAudit} from '../commerce/audit';
import {conflict,notFound,validation} from '../commerce/errors';

type Block={id:string;type:'hero'|'banner'|'text';heading:string;text:string;buttonText:string;href:string;image:string};
type Draft={id:string;title:string;version:number;blocks:Block[];updatedAt:string};
const obj=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const string=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max;
function safeUrl(value:string,image:boolean){
  if(!value)return true;
  if(/[\u0000-\u0020\\]/.test(value))return false;
  if(value.startsWith('/'))return !value.startsWith('//')&&(!image||/^\/uploads\/[a-zA-Z0-9._-]+$/.test(value));
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password}catch{return false}
}
function checkedBlocks(value:unknown):Block[]{
  if(!Array.isArray(value)||value.length>30)throw validation('حداکثر ۳۰ بلوک معتبر مجاز است.');
  const result:Block[]=value.map(v=>{
    if(!obj(v)||Object.keys(v).sort().join(',')!=='buttonText,heading,href,id,image,text,type'||!string(v.id,80)||!v.id||!/^[a-zA-Z0-9_-]+$/.test(v.id as string)||typeof v.type!=='string'||!['hero','banner','text'].includes(v.type)||!string(v.heading,160)||!string(v.text,2000)||!string(v.buttonText,80)||!string(v.href,2000)||!string(v.image,2000)||!safeUrl(v.href as string,false)||!safeUrl(v.image as string,true))throw validation('اطلاعات یا نشانی بلوک معتبر نیست.');
    return {id:v.id as string,type:v.type as Block['type'],heading:v.heading as string,text:v.text as string,buttonText:v.buttonText as string,href:v.href as string,image:v.image as string};
  });
  if(new Set(result.map(b=>b.id)).size!==result.length)throw validation('شناسهٔ بلوک‌ها باید یکتا باشد.');return result;
}
function title(value:unknown){if(!string(value,120)||!(value as string).trim())throw validation('عنوان پیش‌نویس لازم است.');return (value as string).trim()}
function data(raw:unknown):Draft[]{if(!obj(raw)||!Array.isArray(raw.drafts))throw conflict('ساختار پیش‌نویس‌ها معتبر نیست؛ ابتدا داده بررسی شود.','studio_data_invalid');return raw.drafts as Draft[]}
export async function studioDraftRoutes(app:FastifyInstance){
 app.get('/api/admin/studio/drafts',async(req,reply)=>{await requirePermission(req,'design:view');reply.header('cache-control','private, no-store');const res=await query<{value:unknown}>("select value from state_documents where key='studio_drafts'");return res.rows.length?data(res.rows[0].value):[]});
 app.post<{Body:unknown}>('/api/admin/studio/drafts',async(req,reply)=>{const actor=await requirePermission(req,'design:edit');const body=req.body;if(!obj(body)||Object.keys(body).join(',')!=='title')throw validation('درخواست معتبر نیست.');const name=title(body.title);const result=await withTransaction(async client=>{
   await client.query("insert into state_documents(key,value) values('studio_drafts','{\"drafts\":[]}'::jsonb) on conflict(key) do nothing");const locked=await client.query<{value:unknown}>("select value from state_documents where key='studio_drafts' for update");const drafts=data(locked.rows[0].value);if(drafts.length>=100)throw conflict('حداکثر ۱۰۰ پیش‌نویس مجاز است.','studio_draft_limit');const draft:Draft={id:`draft-${randomUUID()}`,title:name,version:0,blocks:[],updatedAt:new Date().toISOString()};drafts.push(draft);await client.query("update state_documents set value=$1::jsonb,updated_at=now() where key='studio_drafts'",[JSON.stringify({drafts})]);await recordAudit({actor:actor.subject,action:'design.studio_draft_created',targetType:'studio_draft',targetId:draft.id,after:{version:0},requestId:req.id},client);return draft;
 });return reply.code(201).send(result)});
 app.patch<{Params:{id:string};Body:unknown}>('/api/admin/studio/drafts/:id',async req=>{const actor=await requirePermission(req,'design:edit');const body=req.body;if(!obj(body)||Object.keys(body).sort().join(',')!=='blocks,expectedVersion,title'||!Number.isInteger(body.expectedVersion)||Number(body.expectedVersion)<0)throw validation('نسخه و اطلاعات پیش‌نویس لازم است.');const name=title(body.title),blocks=checkedBlocks(body.blocks);return withTransaction(async client=>{
   const locked=await client.query<{value:unknown}>("select value from state_documents where key='studio_drafts' for update");if(!locked.rows.length)throw notFound('پیش‌نویس پیدا نشد.');const drafts=data(locked.rows[0].value),index=drafts.findIndex(d=>d.id===req.params.id);if(index<0)throw notFound('پیش‌نویس پیدا نشد.');const old=drafts[index];if(old.version!==body.expectedVersion)throw conflict('پیش‌نویس هم‌زمان تغییر کرده است؛ ابتدا فهرست را تازه و تغییرات را بررسی کنید.','studio_draft_stale');if(old.version>=2147483647)throw conflict('نسخه بیش از حد مجاز است.','studio_version_exhausted');const next:Draft={...old,title:name,blocks,version:old.version+1,updatedAt:new Date().toISOString()};drafts[index]=next;await client.query("update state_documents set value=$1::jsonb,updated_at=now() where key='studio_drafts'",[JSON.stringify({drafts})]);await recordAudit({actor:actor.subject,action:'design.studio_draft_updated',targetType:'studio_draft',targetId:next.id,before:{version:old.version},after:{version:next.version,blocks:blocks.length},requestId:req.id},client);return next;
 })});
}
