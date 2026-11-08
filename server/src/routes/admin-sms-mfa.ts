import type {FastifyInstance} from 'fastify';
import {account} from './admin-mfa';
import {roleForSubject,OWNER_ROLE} from '../http/rbac';
import {withTransaction} from '../db';
import {issueAdminSmsChallenge,settleAdminSmsChallenge,consumeAdminSmsChallenge} from '../admin-sms-challenge';
import {mfaKey,open,seal,tokenHash,verifyAdminPasscode,recoveryCodes,recoveryHash,type MfaData} from '../admin-mfa';
import {melipayamakOtpConfigured,sendMelipayamakOtp} from '../melipayamak-otp';
import {normalizePhone} from '../sms';
import {recordAudit} from '../commerce/audit';

type Pending={phone:string;token:string;subject:string;session:string;expires:number};
const fail={ok:false,message:'کد معتبر نیست، منقضی شده یا حساب موقتاً محدود است.'};
const unavailable={ok:false,message:'ارسال کد تأیید در دسترس نیست یا نتیجه نامشخص است. کمی بعد دوباره تلاش کنید.'};

export async function adminSmsMfaRoutes(app:FastifyInstance){
  /** Password + active session are checked both before and after provider I/O. */
  async function prepare(subject:string,sessionToken:string,passcode:string,kind:'enroll'|'stepup',requestedPhone?:string,action?:'disable'|'panel-path',requestId?:string){
    if(!mfaKey()||!melipayamakOtpConfigured())return null;
    const binding=kind==='stepup'?`${sessionToken}:${action}`:sessionToken;
    const issued=await withTransaction(async client=>{
      const row=(await client.query<{admin_mfa:MfaData|null}>("select admin_mfa from staff where subject=$1 and active and (expires_at is null or expires_at>now()) for update",[subject])).rows[0];
      const active=await client.query("select 1 from sessions where token=$1 and kind='admin' and subject=$2 and expires_at>now()",[sessionToken,subject]);
      if(!row||!active.rowCount||!await verifyAdminPasscode(subject,passcode,client))return null;
      let phone=requestedPhone,expectedSecret:string|null=null;
      if(kind==='enroll'){if(row.admin_mfa||!phone)return null}
      else {if(row.admin_mfa?.method!=='sms'||!action||row.admin_mfa.lockedUntil>Date.now())return null;try{phone=open<{phone:string}>(row.admin_mfa.secret,`admin-mfa:${subject}`).phone;expectedSecret=row.admin_mfa.secret}catch{return null}}
      if(!phone||normalizePhone(phone)!==phone)return null;
      const result=await issueAdminSmsChallenge(client,subject,kind,binding);if(!result.ok)return null;
      return {...result,phone,expectedSecret};
    });
    if(!issued)return null;
    const delivery=await sendMelipayamakOtp(issued.phone,issued.code);
    const settled=await withTransaction(async client=>{
      const row=(await client.query<{admin_mfa:MfaData|null}>("select admin_mfa from staff where subject=$1 and active and (expires_at is null or expires_at>now()) for update",[subject])).rows[0];
      const active=await client.query("select 1 from sessions where token=$1 and kind='admin' and subject=$2 and expires_at>now()",[sessionToken,subject]);
      const valid=!!row&&!!active.rowCount&&await verifyAdminPasscode(subject,passcode,client)&&(kind==='enroll'?!row.admin_mfa:row.admin_mfa?.method==='sms'&&row.admin_mfa.secret===issued.expectedSecret);
      const accepted=delivery.accepted&&valid;
      const state=await settleAdminSmsChallenge(client,subject,kind,binding,issued.token,accepted);
      await recordAudit({actor:subject,action:'security.sms_challenge_requested',targetType:'staff',targetId:subject,after:{purpose:kind,...(action?{action}:{}),accepted:accepted&&state==='ok'},requestId},client);
      return accepted&&state==='ok';
    });
    return settled?issued:null;
  }

  app.post<{Body:{passcode?:unknown;phone?:unknown}}>('/api/admin/mfa/sms/setup',async(req,reply)=>{
    reply.header('cache-control','no-store');const session=await account(req);if(!session)return reply.code(401).send(fail);
    const pass=typeof req.body?.passcode==='string'?req.body.passcode.trim():'';const phone=typeof req.body?.phone==='string'?normalizePhone(req.body.phone):null;
    if(!pass||pass.length>256||!phone)return reply.code(400).send({message:'رمز مدیریت و شماره موبایل معتبر لازم است.'});
    const result=await prepare(session.subject,session.token,pass,'enroll',phone,undefined,req.id);if(!result)return reply.code(503).send(unavailable);
    const pending=seal({phone,token:result.token,subject:session.subject,session:tokenHash(session.token),expires:result.expiresAt},'admin-sms-enroll');
    return {ok:true,pending,phoneHint:`09*******${phone.slice(-2)}`};
  });
  app.post<{Body:{pending?:unknown;code?:unknown}}>('/api/admin/mfa/sms/enable',async(req,reply)=>{
    reply.header('cache-control','no-store');const session=await account(req);if(!session)return reply.code(401).send(fail);if(!mfaKey())return reply.code(503).send(unavailable);
    if(typeof req.body?.pending!=='string'||req.body.pending.length>4096||typeof req.body?.code!=='string'||req.body.code.length>100)return reply.code(400).send(fail);
    let pending:Pending;try{pending=open<Pending>(req.body.pending,'admin-sms-enroll')}catch{return reply.code(400).send(fail)}
    if(!pending||pending.subject!==session.subject||pending.session!==tokenHash(session.token)||pending.expires<Date.now()||typeof pending.phone!=='string'||normalizePhone(pending.phone)!==pending.phone||typeof pending.token!=='string')return reply.code(400).send(fail);
    const codes=recoveryCodes();const data:MfaData={method:'sms',secret:seal({phone:pending.phone},`admin-mfa:${session.subject}`),lastStep:-1,recovery:codes.map(recoveryHash),failures:0,lockedUntil:0};
    const result=await withTransaction(async client=>{
      const row=(await client.query<{admin_mfa:MfaData|null}>("select admin_mfa from staff where subject=$1 and active and (expires_at is null or expires_at>now()) for update",[session.subject])).rows[0];
      const active=await client.query("select 1 from sessions where token=$1 and kind='admin' and subject=$2 and expires_at>now()",[session.token,session.subject]);
      if(!row||row.admin_mfa||!active.rowCount)return 'invalid';
      const verified=await consumeAdminSmsChallenge(client,session.subject,'enroll',session.token,pending.token,req.body!.code as string);if(verified!=='ok')return verified;
      await client.query('update staff set admin_mfa=$2::jsonb where subject=$1',[session.subject,JSON.stringify(data)]);
      await client.query("delete from sessions where kind='admin' and subject=$1 and token<>$2",[session.subject,session.token]);
      await recordAudit({actor:session.subject,action:'security.mfa_sms_enabled',targetType:'staff',targetId:session.subject,requestId:req.id},client);return 'ok';
    });
    if(result!=='ok')return reply.code(result==='unavailable'?503:403).send(fail);return {ok:true,recoveryCodes:codes};
  });
  app.post<{Body:{passcode?:unknown;action?:unknown}}>('/api/admin/mfa/sms/stepup',async(req,reply)=>{
    reply.header('cache-control','no-store');const session=await account(req);if(!session)return reply.code(401).send(fail);
    const pass=typeof req.body?.passcode==='string'?req.body.passcode.trim():'';const action=req.body?.action;if(!pass||pass.length>256||(action!=='disable'&&action!=='panel-path'))return reply.code(400).send(fail);
    if(action==='panel-path'&&(await roleForSubject(session.subject))?.roleId!==OWNER_ROLE)return reply.code(403).send(fail);
    const result=await prepare(session.subject,session.token,pass,'stepup',undefined,action,req.id);if(!result)return reply.code(503).send(unavailable);
    return {ok:true,challenge:result.token};
  });
}
