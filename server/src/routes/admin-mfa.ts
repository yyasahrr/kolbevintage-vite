import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { withTransaction, query } from '../db';
import { readSession } from '../sessions';
import { roleForSubject } from '../http/rbac';
import { recordAudit } from '../commerce/audit';
import { base32, matchTotp, mfaKey, open, recoveryCodes, recoveryHash, seal, tokenHash, verifyAdminPasscode, verifyFactor, type MfaData } from '../admin-mfa';

async function account(req:FastifyRequest) {
  const session=await readSession(req);
  if(!session || session.kind!=='admin' || session.subject==='review-owner' || session.subject==='superadmin' || !await roleForSubject(session.subject))return null;
  return session;
}
const unavailable={ok:false,code:'mfa_unavailable',message:'کلید امن تأیید دومرحله‌ای سرور تنظیم نشده یا معتبر نیست.'};
const fail={ok:false,code:'invalid_factor',message:'کد صحیح نیست، قبلاً استفاده شده یا حساب موقتاً محدود شده است.'};
export async function adminMfaRoutes(app:FastifyInstance){
  app.get('/api/admin/mfa',async(req,reply)=>{reply.header('cache-control','no-store');const session=await account(req);if(!session)return reply.code(401).send({message:'ابتدا با حساب مدیریت وارد شوید.'});const row=await query<{admin_mfa:MfaData|null}>('select admin_mfa from staff where subject=$1',[session.subject]);return {enabled:!!row.rows[0]?.admin_mfa,configured:!!mfaKey(),smsAvailable:false,recoveryRemaining:row.rows[0]?.admin_mfa?.recovery.length??0};});
  app.post<{Body:{passcode?:unknown}}>('/api/admin/mfa/setup',async(req,reply)=>{
    const session=await account(req);if(!session)return reply.code(401).send({message:'ابتدا با حساب مدیریت وارد شوید.'});if(!mfaKey())return reply.code(503).send(unavailable);
    const pass=typeof req.body?.passcode==='string'?req.body.passcode.trim():'';if(!await verifyAdminPasscode(session.subject,pass))return reply.code(403).send({message:'رمز مدیریت درست نیست.'});
    const row=await query<{admin_mfa:MfaData|null}>('select admin_mfa from staff where subject=$1',[session.subject]);if(!row.rows[0]||row.rows[0].admin_mfa)return reply.code(409).send({message:'برای این حساب تأیید دومرحله‌ای فعال است یا حساب معتبر نیست.'});
    const secret=base32(randomBytes(20));const pending=seal({secret,subject:session.subject,session:tokenHash(session.token),expires:Date.now()+10*60*1000},'admin-mfa-setup');
    reply.header('cache-control','no-store');return {secret,pending,uri:`otpauth://totp/${encodeURIComponent('Kolbe Vintage:'+session.subject)}?secret=${secret}&issuer=${encodeURIComponent('Kolbe Vintage')}&algorithm=SHA1&digits=6&period=30`};
  });
  app.post<{Body:{pending?:unknown;code?:unknown}}>('/api/admin/mfa/enable',async(req,reply)=>{
    const session=await account(req);if(!session)return reply.code(401).send({message:'ابتدا با حساب مدیریت وارد شوید.'});if(!mfaKey())return reply.code(503).send(unavailable);
    if(typeof req.body?.pending!=='string'||req.body.pending.length>4096||typeof req.body?.code!=='string')return reply.code(400).send(fail);
    let pending:{secret:string;subject:string;session:string;expires:number};try{pending=open(req.body.pending,'admin-mfa-setup');}catch{return reply.code(400).send(fail)}
    if(pending.subject!==session.subject||pending.session!==tokenHash(session.token)||pending.expires<Date.now())return reply.code(400).send(fail);
    const step=matchTotp(pending.secret,req.body.code.trim(),-1);if(step===null)return reply.code(400).send(fail);
    const codes=recoveryCodes();const data:MfaData={secret:seal({secret:pending.secret},`admin-mfa:${session.subject}`),lastStep:step,recovery:codes.map(recoveryHash),failures:0,lockedUntil:0};
    const ok=await withTransaction(async client=>{const row=await client.query('select admin_mfa from staff where subject=$1 and active and (expires_at is null or expires_at>now()) for update',[session.subject]);const active=await client.query("select 1 from sessions where token=$1 and subject=$2 and kind='admin' and expires_at>now()",[session.token,session.subject]);if(!row.rows[0]||row.rows[0].admin_mfa||!active.rowCount)return false;
      await client.query('update staff set admin_mfa=$2::jsonb where subject=$1',[session.subject,JSON.stringify(data)]);await client.query("delete from sessions where kind='admin' and subject=$1 and token<>$2",[session.subject,session.token]);await recordAudit({actor:session.subject,action:'security.mfa_enabled',targetType:'staff',targetId:session.subject,requestId:req.id},client);return true;});
    if(!ok)return reply.code(409).send({message:'وضعیت حساب تغییر کرده است؛ دوباره تلاش کنید.'});reply.header('cache-control','no-store');return {ok:true,recoveryCodes:codes};
  });
  app.post<{Body:{passcode?:unknown;code?:unknown}}>('/api/admin/mfa/disable',async(req,reply)=>{
    const session=await account(req);if(!session)return reply.code(401).send({message:'ابتدا با حساب مدیریت وارد شوید.'});if(!mfaKey())return reply.code(503).send(unavailable);
    const pass=typeof req.body?.passcode==='string'?req.body.passcode.trim():'';const code=typeof req.body?.code==='string'?req.body.code:'';if(!await verifyAdminPasscode(session.subject,pass))return reply.code(403).send(fail);
    const result=await withTransaction(async client=>{const row=await client.query<{admin_mfa:MfaData|null}>('select admin_mfa from staff where subject=$1 and active and (expires_at is null or expires_at>now()) for update',[session.subject]);const active=await client.query("select 1 from sessions where token=$1 and subject=$2 and kind='admin' and expires_at>now()",[session.token,session.subject]);const mfa=row.rows[0]?.admin_mfa;if(!mfa||!active.rowCount||!await verifyAdminPasscode(session.subject,pass,client))return 'invalid';const result=verifyFactor(mfa,session.subject,code);
      if(result!=='ok'){await client.query('update staff set admin_mfa=$2::jsonb where subject=$1',[session.subject,JSON.stringify(mfa)]);return result;}
      await client.query('update staff set admin_mfa=null where subject=$1',[session.subject]);await client.query("delete from sessions where kind='admin' and subject=$1 and token<>$2",[session.subject,session.token]);await recordAudit({actor:session.subject,action:'security.mfa_disabled',targetType:'staff',targetId:session.subject,requestId:req.id},client);return 'ok';});
    if(result==='unavailable')return reply.code(503).send(unavailable);if(result!=='ok')return reply.code(403).send(fail);return {ok:true};
  });
}
