import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { query, withTransaction } from "../db";
import { requirePermission } from "../http/rbac";
import { recordAudit } from "../commerce/audit";
import { conflict, notFound, validation } from "../commerce/errors";
import { labelAudience, matchesLabelAudience } from "../commerce/audiences";

// A separate settings key makes definitions part of ordinary backups without a
// new table. No automatic label exists until an administrator defines it.
const KEY = "customer_labels_v1";
type Label = { id:string; name:string; rule: null | {type:"delivered_orders"; minCount:number} };
type CustomerRow = {email:string;name:string|null;phone:string|null;created_at:Date;manual_labels:unknown;delivered_count:number};
const parseLabels = (value: unknown): Label[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 200 || value.some(v => !v || typeof v.id !== "string" || typeof v.name !== "string" || !(v.rule === null || (v.rule?.type === "delivered_orders" && Number.isInteger(v.rule.minCount) && v.rule.minCount >= 1)))) throw conflict("تعاریف برچسب نیاز به بررسی دارد.","invalid_label_definitions");
  return value as Label[];
};
const ids = (value:unknown, label:string):string[] => {
  if (!Array.isArray(value) || value.length > 200 || value.some(v => typeof v !== "string" || !/^lbl-[a-f0-9-]{36}$/.test(v)) || new Set(value).size !== value.length) throw validation(`${label} معتبر نیست.`);
  return [...value].sort();
};
const storedIds = (value:unknown):string[] => value === null ? [] : ids(value,"برچسب‌های ذخیره‌شده");
export async function lockedDefinitions(client:PoolClient) {
  await client.query("insert into commerce_settings(key,value,updated_at) values($1,'[]'::jsonb,now()) on conflict(key) do nothing",[KEY]);
  const res=await client.query<{value:unknown}>("select value from commerce_settings where key=$1 for update",[KEY]);
  return parseLabels(res.rows[0].value);
}
function withLabels(row:CustomerRow, definitions:Label[]) {
  const manual=storedIds(row.manual_labels);
  const valid=new Set(definitions.map(d=>d.id));
  const manualLabels=manual.filter(id=>valid.has(id));
  const automaticLabels=definitions.filter(d=>d.rule?.type === "delivered_orders" && Number(row.delivered_count)>=d.rule.minCount).map(d=>d.id);
  return {email:row.email,name:row.name,phone:row.phone,createdAt:row.created_at,deliveredOrders:Number(row.delivered_count),manualLabels,automaticLabels,labels:[...new Set([...manualLabels,...automaticLabels])]};
}
async function customersWithLabels(definitions:Label[], email?:string) {
  const rows=await query<CustomerRow>(`select c.email,c.name,c.phone,c.created_at,c.manual_labels,
    count(o.id)::int as delivered_count from customers c left join orders o
    on o.email=c.email and o.status='delivered' and o.payment_status='settled'
    and (o.data->>'manual'='true' or exists (select 1 from payment_attempts p where p.id=o.data->'commerce'->>'paymentAttemptId' and p.order_id=o.id and p.status='settled' and p.provider not like 'mock%'))
    and exists (select 1 from order_lines line where line.order_id=o.id and line.refunded_quantity<line.quantity)
    where ($1::text is null or c.email=$1)
    group by c.email order by c.created_at desc,c.email`,[email ?? null]);
  return rows.rows.map(row=>withLabels(row,definitions));
}
export async function definitions() {
  const result=await query<{value:unknown}>("select value from commerce_settings where key=$1",[KEY]);
  return parseLabels(result.rows[0]?.value);
}
/** The same live definitions and delivered-order rule drive previews and pricing. */
export async function labelsForCustomer(email:string | null | undefined):Promise<string[]> {
  if (!email) return [];
  const all=await definitions();
  const rows=await customersWithLabels(all,email.trim().toLowerCase());
  return rows[0]?.labels ?? [];
}

export async function customerLabelRoutes(app:FastifyInstance) {
  app.get("/api/admin/customer-labels",async (req,reply)=>{
    await requirePermission(req,"customers:view");
    reply.header("cache-control","no-store");
    const labels=await definitions();
    return {labels,customers:await customersWithLabels(labels)};
  });
  app.post<{Body:{name?:unknown;minDeliveredOrders?:unknown}}>("/api/admin/customer-labels",async (req,reply)=>{
    const actor=await requirePermission(req,"customers:edit");
    const name=typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const count=req.body?.minDeliveredOrders;
    if(!name || name.length>80)throw validation("نام برچسب باید بین ۱ تا ۸۰ نویسه باشد.");
    if(count!==null && count!==undefined && (typeof count!=="number"||!Number.isInteger(count)||count<1||count>10000))throw validation("حداقل تعداد سفارش باید عدد صحیح بین ۱ و ۱۰۰۰۰ باشد.");
    const label:Label={id:`lbl-${randomUUID()}`,name,rule:count==null?null:{type:"delivered_orders",minCount:count as number}};
    await withTransaction(async client=>{
      const all=await lockedDefinitions(client);
      if(all.length>=200)throw validation("حداکثر ۲۰۰ برچسب مجاز است.");
      if(all.some(item=>item.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw conflict("نام این برچسب قبلاً ثبت شده است.");
      await client.query("update commerce_settings set value=$2::jsonb,updated_at=now() where key=$1",[KEY,JSON.stringify([...all,label])]);
      await recordAudit({actor:actor.subject,action:"customer_label.created",targetType:"customer_label",targetId:label.id,after:label,requestId:req.id},client);
    });
    return reply.code(201).send({label});
  });
  app.patch<{Params:{id:string};Body:{name?:unknown;minDeliveredOrders?:unknown;expected?:unknown}}>("/api/admin/customer-labels/:id",async req=>{
    const actor=await requirePermission(req,"customers:edit");
    const name=typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const count=req.body?.minDeliveredOrders;
    if(!name || name.length>80)throw validation("نام برچسب باید بین ۱ تا ۸۰ نویسه باشد.");
    if(count!==null && count!==undefined && (typeof count!=="number"||!Number.isInteger(count)||count<1||count>10000))throw validation("حداقل تعداد سفارش باید عدد صحیح بین ۱ و ۱۰۰۰۰ باشد.");
    const exp=req.body?.expected;
    if(!exp || typeof exp!=="object")throw validation("نسخه قبلی برچسب لازم است.");
    const expected=exp as Partial<Label>;
    return withTransaction(async client=>{
      const all=await lockedDefinitions(client),index=all.findIndex(label=>label.id===req.params.id);
      if(index<0)throw notFound("برچسب پیدا نشد.");
      const previous=all[index];
      if(expected.id!==previous.id || expected.name!==previous.name || (expected.rule?.type ?? null)!==(previous.rule?.type ?? null) || (expected.rule?.minCount ?? null)!==(previous.rule?.minCount ?? null))throw conflict("تعریف برچسب تغییر کرده است؛ فهرست را تازه‌سازی کنید.","label_conflict");
      if(all.some((item,i)=>i!==index && item.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw conflict("نام این برچسب قبلاً ثبت شده است.");
      const label:Label={id:previous.id,name,rule:count==null?null:{type:"delivered_orders",minCount:count as number}};
      all[index]=label;await client.query("update commerce_settings set value=$2::jsonb,updated_at=now() where key=$1",[KEY,JSON.stringify(all)]);
      await recordAudit({actor:actor.subject,action:"customer_label.updated",targetType:"customer_label",targetId:label.id,before:previous,after:label,requestId:req.id},client);
      return {label};
    });
  });
  app.post<{Params:{id:string};Body:{expected?:unknown}}>("/api/admin/customer-labels/:id/delete",async req=>{
    const actor=await requirePermission(req,"customers:edit");
    const expected=req.body?.expected;
    if(!expected || typeof expected!=="object")throw validation("نسخه قبلی برچسب لازم است.");
    const exp=expected as Partial<Label>;
    return withTransaction(async client=>{
      // Same lock order as assignment and campaign creation: definitions first,
      // then campaign document. Concurrent assignment cannot race deletion.
      const all=await lockedDefinitions(client);
      const index=all.findIndex(item=>item.id===req.params.id);
      if(index<0)throw notFound("برچسب پیدا نشد.");
      const previous=all[index];
      if(exp.id!==previous.id || exp.name!==previous.name || (exp.rule?.type ?? null)!==(previous.rule?.type ?? null) || (exp.rule?.minCount ?? null)!==(previous.rule?.minCount ?? null))throw conflict("تعریف برچسب تغییر کرده است؛ فهرست را تازه‌سازی کنید.","label_conflict");
      const doc=(await client.query<{value:Record<string,unknown>}>("select value from state_documents where key='admin' for update")).rows[0]?.value ?? {};
      // Conservatively retain definitions referenced by any campaign or rule,
      // including unsupported future formats nested at arbitrary depth.
      const containsId=(value:unknown):boolean=>{
        if(value===previous.id)return true;
        if(Array.isArray(value))return value.some(containsId);
        return !!value && typeof value==="object" && Object.values(value as Record<string,unknown>).some(containsId);
      };
      if(containsId(doc.campaigns) || containsId(doc.discountRules))throw conflict("این برچسب در یک کمپین یا قانون استفاده شده است؛ ابتدا پیش‌نویس مرتبط را حذف یا اصلاح کنید.","label_in_campaign");
      const assigned=await client.query<{n:number}>("select count(*)::int as n from customers where manual_labels @> jsonb_build_array($1::text)",[previous.id]);
      if(Number(assigned.rows[0].n)>0)throw conflict("این برچسب به مشتری اختصاص دارد؛ ابتدا تخصیص‌های دستی آن را حذف کنید.","label_assigned");
      all.splice(index,1);
      await client.query("update commerce_settings set value=$2::jsonb,updated_at=now() where key=$1",[KEY,JSON.stringify(all)]);
      await recordAudit({actor:actor.subject,action:"customer_label.deleted",targetType:"customer_label",targetId:previous.id,before:previous,requestId:req.id},client);
      return {ok:true};
    });
  });
  app.put<{Params:{email:string};Body:{labels?:unknown;expected?:unknown}}>("/api/admin/customers/:email/labels",async req=>{
    const actor=await requirePermission(req,"customers:edit");
    const email=req.params.email.trim().toLowerCase();
    const desired=ids(req.body?.labels,"برچسب‌ها"), expected=ids(req.body?.expected,"نسخه برچسب‌ها");
    return withTransaction(async client=>{
      const all=await lockedDefinitions(client);
      if(desired.some(id=>!all.some(label=>label.id===id)))throw validation("برچسب انتخاب‌شده وجود ندارد.");
      const res=await client.query<{manual_labels:unknown}>("select manual_labels from customers where email=$1 for update",[email]);
      if(!res.rows[0])throw notFound("مشتری پیدا نشد.");
      const before=storedIds(res.rows[0].manual_labels);
      if(JSON.stringify(before)!==JSON.stringify(expected))throw conflict("برچسب‌های مشتری تغییر کرده‌اند؛ فهرست را تازه‌سازی کنید.","customer_labels_conflict");
      if(JSON.stringify(before)!==JSON.stringify(desired)){
        await client.query("update customers set manual_labels=$2::jsonb where email=$1",[email,JSON.stringify(desired)]);
        await recordAudit({actor:actor.subject,action:"customer.labels_updated",targetType:"customer",targetId:email,before,after:desired,requestId:req.id},client);
      }
      return {ok:true,manualLabels:desired};
    });
  });
  app.post<{Body:{labels?:unknown;mode?:unknown}}>("/api/admin/customer-labels/audience",async (req,reply)=>{
    await requirePermission(req,"customers:view");
    reply.header("cache-control","no-store");
    const audience=labelAudience(req.body);
    const all=await definitions();const defined=all.map(label=>label.id);
    if(audience.labels.some(id=>!defined.includes(id)))throw validation("برچسب انتخاب‌شده وجود ندارد.");
    const customers=await customersWithLabels(all);
    const matched=customers.filter(c=>matchesLabelAudience(audience,c.labels,defined));
    return {count:matched.length,customers:matched.map(c=>({email:c.email,name:c.name,labels:c.labels}))};
  });
}
