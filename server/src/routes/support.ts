import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { query, withTransaction } from "../db";
import { requireCustomerSession } from "../commerce/auth";
import { requirePermission } from "../http/rbac";
import { conflict, notFound, unauthorized, validation } from "../commerce/errors";
import { recordAudit } from "../commerce/audit";

type Message={id:string;role:"customer"|"staff";text:string;at:string};
type Ticket={id:string;customer_email:string;subject:string;status:"open"|"answered"|"closed";messages:Message[];created_at:Date;updated_at:Date};
const summary=(t:Ticket,staff=false)=>({id:t.id,subject:t.subject,status:t.status,createdAt:t.created_at,updatedAt:t.updated_at,...(staff?{customerEmail:t.customer_email}:{})});
const detail=(t:Ticket,staff=false)=>({...summary(t,staff),messages:t.messages.map(m=>({role:m.role,text:m.text,at:m.at}))});
const clean=(v:unknown,label:string,max:number)=>{if(typeof v!=="string" || !v.trim() || v.trim().length>max)throw validation(`${label} باید بین ۱ تا ${max} نویسه باشد.`);return v.trim()};
const keyOf=(v:unknown)=>{if(typeof v!=="string" || !/^[a-zA-Z0-9_-]{12,100}$/.test(v))throw validation("شناسهٔ درخواست معتبر نیست.");return v};
const bodyOf=(value:unknown,allowed:string[])=>{if(!value || typeof value!=="object" || Array.isArray(value) || Object.keys(value).some(k=>!allowed.includes(k)))throw validation("اطلاعات درخواست معتبر نیست.");return value as Record<string,unknown>};
const ticketId=(id:string)=>{if(!/^tkt-[a-f0-9-]{36}$/.test(id))throw notFound("درخواست پیدا نشد.");return id};
const customerSession=async(req:Parameters<typeof requireCustomerSession>[0])=>{const session=await requireCustomerSession(req);const exists=await query('select 1 from customers where email=$1',[session.subject]);if(!exists.rowCount)throw unauthorized('حساب مشتری در دسترس نیست.');return session};

export async function supportRoutes(app:FastifyInstance) {
  app.get<{Querystring:{before?:string}}>('/api/support/tickets',async(req,reply)=>{
    reply.header('cache-control','private, no-store');const session=await customerSession(req);
    const before=req.query.before ? ticketId(req.query.before) : null;
    const rows=await query<Ticket>(`select id,customer_email,subject,status,created_at,updated_at from support_tickets
      where customer_email=$1 and ($2::text is null or (created_at,id)<(select created_at,id from support_tickets where id=$2 and customer_email=$1))
      order by created_at desc,id desc limit 101`,[session.subject,before]);
    const page=rows.rows.slice(0,100);return {tickets:page.map(t=>summary(t)),nextCursor:rows.rows.length>100?page[page.length-1].id:null};
  });
  app.get<{Params:{id:string}}>('/api/support/tickets/:id',async(req,reply)=>{
    reply.header('cache-control','private, no-store');const session=await customerSession(req);
    const row=(await query<Ticket>('select * from support_tickets where id=$1 and customer_email=$2',[ticketId(req.params.id),session.subject])).rows[0];
    if(!row)throw notFound("درخواست پیدا نشد.");return {ticket:detail(row)};
  });
  app.post<{Body:unknown}>('/api/support/tickets',async(req,reply)=>{
    reply.header('cache-control','private, no-store');const session=await customerSession(req);
    const body=bodyOf(req.body,['subject','message','requestKey']);const subject=clean(body.subject,'موضوع',160),message=clean(body.message,'پیام',4000),key=keyOf(body.requestKey);
    const result=await withTransaction(async client=>{
      const id=`tkt-${randomUUID()}`,msg:Message={id:key,role:'customer',text:message,at:new Date().toISOString()};
      const inserted=await client.query<Ticket>(`insert into support_tickets(id,customer_email,subject,messages,create_key) values($1,$2,$3,$4::jsonb,$5)
        on conflict(customer_email,create_key) do nothing returning *`,[id,session.subject,subject,JSON.stringify([msg]),key]);
      if(inserted.rows[0]){
        await recordAudit({actor:session.subject,action:'support.created',targetType:'support_ticket',targetId:id,after:{status:'open'},requestId:req.id},client);
        return {ticket:detail(inserted.rows[0]),reused:false};
      }
      const prior=(await client.query<Ticket>('select * from support_tickets where customer_email=$1 and create_key=$2',[session.subject,key])).rows[0];
      if(!prior || prior.subject!==subject || prior.messages[0]?.text!==message)throw conflict('این شناسه قبلاً برای پیام دیگری استفاده شده است.','idempotency_conflict');
      return {ticket:detail(prior),reused:true};
    });
    return reply.code(result.reused?200:201).send(result);
  });
  async function replyTo(id:string,body:unknown,actor:string,role:'customer'|'staff',requestId:string) {
    const input=bodyOf(body,['message','requestKey']),message=clean(input.message,'پیام',4000),key=keyOf(input.requestKey);
    return withTransaction(async client=>{
      const row=(await client.query<Ticket>('select * from support_tickets where id=$1 for update',[ticketId(id)])).rows[0];
      if(!row || (role==='customer' && row.customer_email!==actor))throw notFound('درخواست پیدا نشد.');
      const old=row.messages.find(m=>m.id===key);
      if(old) {if(old.text!==message || old.role!==role)throw conflict('این شناسه قبلاً برای پیام دیگری استفاده شده است.','idempotency_conflict');return {ticket:detail(row,role==='staff'),reused:true};}
      if(row.status==='closed')throw conflict('این درخواست بسته شده است؛ درخواست جدید ثبت کنید.','ticket_closed');
      if(row.messages.length>=200)throw conflict('این گفتگو به سقف پیام رسیده است؛ درخواست جدید ثبت کنید.','ticket_full');
      const msg:Message={id:key,role,text:message,at:new Date().toISOString()},status=role==='staff'?'answered':'open';
      const updated=(await client.query<Ticket>(`update support_tickets set messages=messages || $2::jsonb,status=$3,updated_at=now() where id=$1 returning *`,[id,JSON.stringify([msg]),status])).rows[0];
      await recordAudit({actor,action:'support.replied',targetType:'support_ticket',targetId:id,after:{role,status},requestId},client);
      return {ticket:detail(updated,role==='staff'),reused:false};
    });
  }
  app.post<{Params:{id:string};Body:unknown}>('/api/support/tickets/:id/messages',async(req,reply)=>{
    reply.header('cache-control','private, no-store');const session=await customerSession(req);return replyTo(req.params.id,req.body,session.subject,'customer',req.id);
  });
  app.get<{Querystring:{before?:string}}>('/api/admin/support/tickets',async(req,reply)=>{
    reply.header('cache-control','private, no-store');await requirePermission(req,'customers:view');
    const before=req.query.before ? ticketId(req.query.before) : null;
    const rows=await query<Ticket>(`select id,customer_email,subject,status,created_at,updated_at from support_tickets
      where ($1::text is null or (created_at,id)<(select created_at,id from support_tickets where id=$1))
      order by created_at desc,id desc limit 101`,[before]);
    const page=rows.rows.slice(0,100);return {tickets:page.map(t=>summary(t,true)),nextCursor:rows.rows.length>100?page[page.length-1].id:null};
  });
  app.get<{Params:{id:string}}>('/api/admin/support/tickets/:id',async(req,reply)=>{
    reply.header('cache-control','private, no-store');await requirePermission(req,'customers:view');
    const row=(await query<Ticket>('select * from support_tickets where id=$1',[ticketId(req.params.id)])).rows[0];if(!row)throw notFound('درخواست پیدا نشد.');return {ticket:detail(row,true)};
  });
  app.post<{Params:{id:string};Body:unknown}>('/api/admin/support/tickets/:id/messages',async(req,reply)=>{
    reply.header('cache-control','private, no-store');const actor=await requirePermission(req,'customers:edit');return replyTo(req.params.id,req.body,actor.subject,'staff',req.id);
  });
  app.patch<{Params:{id:string};Body:unknown}>('/api/admin/support/tickets/:id',async(req,reply)=>{
    reply.header('cache-control','private, no-store');const actor=await requirePermission(req,'customers:edit');const body=bodyOf(req.body,['status','expectedStatus']);
    if(!['open','closed'].includes(String(body.status)) || !['open','answered','closed'].includes(String(body.expectedStatus)))throw validation('وضعیت معتبر نیست.');
    return withTransaction(async client=>{
      const row=(await client.query<Ticket>('select * from support_tickets where id=$1 for update',[ticketId(req.params.id)])).rows[0];if(!row)throw notFound('درخواست پیدا نشد.');
      if(row.status!==body.expectedStatus)throw conflict('وضعیت گفتگو تغییر کرده؛ دوباره بارگذاری کنید.','ticket_conflict');
      if(row.status===body.status)return {ticket:detail(row,true),unchanged:true};
      const changed=(await client.query<Ticket>('update support_tickets set status=$2,updated_at=now() where id=$1 returning *',[row.id,body.status])).rows[0];
      await recordAudit({actor:actor.subject,action:'support.status',targetType:'support_ticket',targetId:row.id,before:{status:row.status},after:{status:changed.status},requestId:req.id},client);
      return {ticket:detail(changed,true),unchanged:false};
    });
  });
}
