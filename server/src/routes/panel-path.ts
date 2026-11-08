import type {FastifyInstance} from 'fastify';
import {withTransaction} from '../db';
import {requirePermission,requireOwnerRole,OWNER_ROLE} from '../http/rbac';
import {verifyAdminPasscode,type MfaData} from '../admin-mfa';
import {verifyAdminFactor} from '../admin-factor';
import {recordAudit} from '../commerce/audit';
import {DEFAULT_PANEL_PATH,panelPath,validPanelPath} from '../panel-path';

export async function panelPathRoutes(app:FastifyInstance){
  app.get('/api/admin/panel-path',async(req,reply)=>{
    const session=await requirePermission(req,'security:edit');await requireOwnerRole(session);
    if(session.subject==='review-owner')return reply.code(403).send({message:'این تنظیم در حالت بررسی در دسترس نیست.'});
    reply.header('cache-control','no-store');return {path:await panelPath()};
  });
  app.patch<{Body:{path?:unknown;expectedPath?:unknown;passcode?:unknown;code?:unknown;challenge?:unknown}}>('/api/admin/panel-path',async(req,reply)=>{
    const session=await requirePermission(req,'security:edit');await requireOwnerRole(session);
    if(session.subject==='review-owner'||session.subject==='superadmin')return reply.code(403).send({message:'از حساب واقعی مالک استفاده کنید.'});
    const b=req.body;if(!b||!validPanelPath(b.path)||!validPanelPath(b.expectedPath)||typeof b.passcode!=='string'||b.passcode.length>256||typeof (b.code??'')!=='string'||String(b.code??'').length>100 ||typeof (b.challenge??'')!=='string'||String(b.challenge??'').length>100 || Object.keys(b).some(k=>!['path','expectedPath','passcode','code','challenge'].includes(k)))return reply.code(400).send({message:'مسیر یا اطلاعات تأیید معتبر نیست.'});
    const path=b.path,expected=b.expectedPath,passcode=b.passcode.trim(),code=String(b.code??'').trim();
    const result=await withTransaction(async client=>{
      await client.query('select pg_advisory_xact_lock(144777,2026)');
      const staff=(await client.query<{admin_mfa:MfaData|null;role_id:string}>("select admin_mfa,role_id from staff where subject=$1 and active and (expires_at is null or expires_at>now()) for update",[session.subject])).rows[0];
      const active=await client.query("select 1 from sessions where token=$1 and kind='admin' and subject=$2 and expires_at>now()",[session.token,session.subject]);
      if(!staff||staff.role_id!==OWNER_ROLE||!active.rowCount||!await verifyAdminPasscode(session.subject,passcode,client))return 'forbidden';
      await client.query("insert into state_documents(key,value) values('panel_entry',$1::jsonb) on conflict(key) do nothing",[JSON.stringify({path:DEFAULT_PANEL_PATH})]);
      const row=(await client.query<{value:{path:unknown}}>("select value from state_documents where key='panel_entry' for update")).rows[0];
      if(!row||!validPanelPath(row.value?.path))return 'invalid';if(row.value.path!==expected)return 'conflict';
      if(path===expected)return 'unchanged';
      if(staff.admin_mfa){const factor=await verifyAdminFactor(client,staff.admin_mfa,session.subject,code,{purpose:'stepup',binding:`${session.token}:panel-path`,challenge:String(b.challenge??'')});await client.query('update staff set admin_mfa=$2::jsonb where subject=$1',[session.subject,JSON.stringify(staff.admin_mfa)]);if(factor!=='ok')return factor==='unavailable'?'unavailable':'forbidden';}
      await client.query("update state_documents set value=$1::jsonb,updated_at=now() where key='panel_entry'",[JSON.stringify({path})]);
      await recordAudit({actor:session.subject,action:'security.panel_path_changed',targetType:'settings',targetId:'panel_entry',before:{path:expected},after:{path},requestId:req.id},client);return 'ok';
    });
    if(result==='conflict')return reply.code(409).send({code:'panel_path_stale',message:'مسیر هم‌زمان تغییر کرده است؛ صفحه را تازه کنید.'});
    if(result==='invalid'||result==='unavailable')return reply.code(503).send({message:'تنظیم امنیتی در دسترس نیست؛ مسئول سرور باید آن را بررسی کند.'});
    if(result==='forbidden')return reply.code(403).send({message:'رمز یا کد دومرحله‌ای معتبر نیست، یا دسترسی تغییر کرده است.'});
    return {ok:true,path,changed:result==='ok'};
  });
}
