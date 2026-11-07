import {randomUUID} from "node:crypto";
import {isDeepStrictEqual} from "node:util";
import type {FastifyInstance} from "fastify";
import type {PoolClient} from "pg";
import {query,withTransaction} from "../db";
import {requirePermission} from "../http/rbac";
import {recordAudit} from "../commerce/audit";
import {conflict,notFound,validation} from "../commerce/errors";

type SizeSet={id:string;name:string;sizes:string[];measurements?:Record<string,unknown>;measurementBasis?:"body"|"garment"};
type Input={name?:unknown;sizes?:unknown;expected?:unknown};
const fields=["chest","waist","hip","shoulder","height"] as const;
const clean=(v:unknown)=>typeof v==="string"?v.normalize("NFKC").trim():"";
const norm=(v:string)=>v.toLocaleLowerCase();
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
function checked(body:Input,editing:boolean) {
  if(!object(body)||Object.keys(body).some(k=>!(editing?["name","sizes","expected"]:["name","sizes"]).includes(k)))throw validation("فیلد الگوی سایز معتبر نیست.");
  const name=clean(body.name);if(!name||name.length>100||!Array.isArray(body.sizes)||!body.sizes.length||body.sizes.length>30)throw validation("نام و ۱ تا ۳۰ سایز لازم است.");
  const sizes=body.sizes.map(clean);if(sizes.some(s=>!s||s.length>40)||new Set(sizes.map(norm)).size!==sizes.length)throw validation("سایزها باید یکتا و حداکثر ۴۰ نویسه باشند.");
  if(editing&&!object(body.expected))throw validation("نسخهٔ قبلی الگو لازم است.");
  return {name,sizes};
}
async function lockSet(client:PoolClient,id:string,expected:unknown){
  if(!object(expected))throw validation("نسخهٔ قبلی الگو لازم است.");
  const res=await client.query<{value:Record<string,any>}>("select value from state_documents where key='ops' for update");
  const doc=res.rows[0]?.value;if(!doc)throw notFound("تنظیمات فروشگاه پیدا نشد.");
  const sets:SizeSet[]=Array.isArray(doc.sizeSets)?doc.sizeSets:[];const index=sets.findIndex(s=>s.id===id);
  if(index<0)throw notFound("الگوی سایز پیدا نشد.");const before=sets[index];
  if(!isDeepStrictEqual(before,expected))throw conflict("الگو هم‌زمان تغییر کرده است؛ ابتدا آن را تازه کنید.","size_set_stale");
  return {doc,sets,index,before};
}
async function writeSets(client:PoolClient,doc:Record<string,any>,sets:SizeSet[]) {
  doc.sizeSets=sets;
  await client.query("update state_documents set value=$1::jsonb,updated_at=now() where key='ops'",[JSON.stringify(doc)]);
  await client.query("insert into settings(key,value,updated_at) values('sizeSets',$1::jsonb,now()) on conflict(key) do update set value=excluded.value,updated_at=now()",[JSON.stringify(sets)]);
}
function checkedMeasurements(raw:unknown,sizes:string[]) {
  if(!object(raw)||Object.keys(raw).length>sizes.length)throw validation("جدول اندازه‌گیری معتبر نیست.");
  const out:Record<string,Record<string,number>>=Object.create(null);
  for(const [size,row] of Object.entries(raw)){
    if(!sizes.includes(size)||!object(row)||!Object.keys(row).length||Object.keys(row).some(k=>!fields.includes(k as typeof fields[number])))throw validation("سایز یا نوع اندازه‌گیری معتبر نیست.");
    const values:Record<string,number>=Object.create(null);
    for(const [key,v] of Object.entries(row)){
      if(typeof v!=="number"||!Number.isFinite(v)||v<=0||v>500||Math.abs(v*100-Math.round(v*100))>1e-8)throw validation("اندازه‌ها باید بر حسب سانتی‌متر، بزرگ‌تر از صفر، تا ۵۰۰ و حداکثر دو رقم اعشار باشند.");
      values[key]=v;
    }
    out[size]=values;
  }
  return out;
}
function assertExistingMeasurementsEditable(set:SizeSet){
  if(set.measurements===undefined)return;
  try {checkedMeasurements(set.measurements,set.sizes)} catch {throw conflict("جدول قبلی ساختار پشتیبانی‌نشده دارد؛ برای جلوگیری از حذف داده باید جداگانه بررسی شود.","size_set_legacy_measurements");}
  if(set.measurementBasis!==undefined && set.measurementBasis!=="body" && set.measurementBasis!=="garment")throw conflict("مبنای اندازه‌گیری قبلی پشتیبانی نمی‌شود.","size_set_legacy_measurements");
}
export async function sizeSetRoutes(app:FastifyInstance) {
  app.get("/api/admin/size-sets",async(req,reply)=>{
    await requirePermission(req,"catalog:view");reply.header("cache-control","private, no-store");
    const result=await query<{value:Record<string,unknown>}>("select value from state_documents where key='ops'");
    if(!result.rows[0])throw notFound("تنظیمات فروشگاه پیدا نشد.");
    return Array.isArray(result.rows[0].value.sizeSets)?result.rows[0].value.sizeSets:[];
  });
  async function save(id:string|null,body:Input,actor:string,requestId:string) {
    const values=checked(body,!!id);
    return withTransaction(async client=>{
      let doc:Record<string,any>,sets:SizeSet[],index:number,before:SizeSet|null;
      if(id){const locked=await lockSet(client,id,body.expected);({doc,sets,index,before}=locked)}
      else {const result=await client.query<{value:Record<string,any>}>("select value from state_documents where key='ops' for update");doc=result.rows[0]?.value;if(!doc)throw notFound("تنظیمات فروشگاه پیدا نشد.");sets=Array.isArray(doc.sizeSets)?doc.sizeSets:[];index=-1;before=null;}
      if(sets.some(s=>s.id!==id&&norm(clean(s.name))===norm(values.name)))throw conflict("نام الگوی سایز تکراری است.","size_set_duplicate");
      if(before?.measurements&&typeof before.measurements==="object"&&Object.keys(before.measurements).some(key=>!values.sizes.includes(key)))throw conflict("این الگو اندازه‌گیری ثبت‌شده برای سایز حذف‌شده دارد؛ ابتدا آن اندازه‌گیری‌ها را بررسی کنید.","size_set_measurement_in_use");
      const next:SizeSet=before?{...before,...values}:{id:`size-set-${randomUUID()}`,...values};
      if(id)sets[index]=next;else sets.push(next);await writeSets(client,doc,sets);
      await recordAudit({actor,action:id?"catalog.size_set_updated":"catalog.size_set_created",targetType:"size_set",targetId:next.id,before,after:next,requestId},client);
      return next;
    });
  }
  app.post<{Body:Input}>("/api/admin/size-sets",async(req,reply)=>{const session=await requirePermission(req,"catalog:edit");return reply.code(201).send({sizeSet:await save(null,req.body,session.subject,req.id)});});
  app.patch<{Params:{id:string};Body:Input}>("/api/admin/size-sets/:id",async req=>{const session=await requirePermission(req,"catalog:edit");return {sizeSet:await save(req.params.id,req.body,session.subject,req.id)};});
  app.patch<{Params:{id:string};Body:{expected?:unknown;measurements?:unknown;basis?:unknown}}>("/api/admin/size-sets/:id/measurements",async req=>{
    const actor=await requirePermission(req,"catalog:edit");const b=req.body;
    if(!object(b)||Object.keys(b).some(k=>!["expected","measurements","basis"].includes(k)))throw validation("فیلد اندازه‌گیری معتبر نیست.");
    return withTransaction(async client=>{
      const {doc,sets,index,before}=await lockSet(client,req.params.id,b.expected);assertExistingMeasurementsEditable(before);
      const values=checkedMeasurements(b.measurements,before.sizes);
      if(Object.keys(values).length && b.basis!=="body" && b.basis!=="garment")throw validation("مبنای جدول را انتخاب کنید: اندازه بدن یا اندازه لباس.");
      if(!Object.keys(values).length && b.basis!==null && b.basis!=="body" && b.basis!=="garment")throw validation("مبنای اندازه‌گیری معتبر نیست.");
      const next:SizeSet={...before};
      if(Object.keys(values).length){next.measurements=values;next.measurementBasis=b.basis as "body"|"garment";}else {delete next.measurements;delete next.measurementBasis;}
      sets[index]=next;await writeSets(client,doc,sets);
      await recordAudit({actor:actor.subject,action:"catalog.size_measurements_updated",targetType:"size_set",targetId:before.id,before:{measurements:before.measurements??{},basis:before.measurementBasis??null},after:{measurements:next.measurements??{},basis:next.measurementBasis??null},requestId:req.id},client);
      return {sizeSet:next};
    });
  });
  app.post<{Params:{id:string};Body:{expected?:unknown}}>("/api/admin/size-sets/:id/delete",async req=>{
    const actor=await requirePermission(req,"catalog:edit");const b=req.body;
    if(!object(b)||Object.keys(b).some(k=>k!=="expected"))throw validation("درخواست حذف معتبر نیست.");
    return withTransaction(async client=>{
      const {doc,sets,index,before}=await lockSet(client,req.params.id,b.expected);
      if(Array.isArray(doc.categories)&&doc.categories.some((c:any)=>c?.sizeSetId===before.id))throw conflict("این الگو به دسته‌ای اختصاص دارد؛ ابتدا اتصال را از دسته بردارید.","size_set_in_use");
      if(before.measurements!==undefined && (!object(before.measurements)||Object.keys(before.measurements).length))throw conflict("این الگو اندازه‌گیری ثبت‌شده دارد؛ ابتدا جدول را بررسی و خالی کنید.","size_set_measurement_in_use");
      sets.splice(index,1);await writeSets(client,doc,sets);
      await recordAudit({actor:actor.subject,action:"catalog.size_set_deleted",targetType:"size_set",targetId:before.id,before,requestId:req.id},client);
      return {ok:true};
    });
  });
}
