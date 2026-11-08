import {createHash,createHmac,randomBytes,randomInt,timingSafeEqual} from 'node:crypto';
import type {PoolClient} from 'pg';
import {mfaKey} from './admin-mfa';

/** Server-only primitives. These do not authenticate anyone or send SMS.
 * All functions require the caller's transaction and lock the staff row first.
 * Callers must verify passcode/session, active role and intended phone inside
 * that transaction, and MUST commit failed verification attempts. Never return
 * the OTP to a browser. A login/session must be created in the same transaction
 * as successful consumption. */
type Purpose='enroll'|'login'|'stepup';
type State='sending'|'ready'|'used'|'cancelled';
interface Row {purpose:Purpose;token_hash:string;code_mac:string;binding_mac:string;state:State;issued_ms:string;expires_ms:string;window_ms:string;issued_count:number;failures:number;locked_ms:string|null;now_ms:string}
type Issue={ok:true;token:string;code:string;expiresAt:number}|{ok:false;reason:'unavailable'|'invalid'|'limited'};
type Result='ok'|'invalid'|'locked'|'unavailable';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const mac=(key:Buffer,purpose:string,subject:string,token:string,value:string)=>createHmac('sha256',key).update(JSON.stringify(['kolbe-admin-sms-v1',purpose,subject,token,value])).digest('hex');
const equal=(a:string,b:string)=>/^[a-f0-9]{64}$/.test(a)&&/^[a-f0-9]{64}$/.test(b)&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));
const validSubject=(s:string)=>typeof s==='string'&&s.length>0&&s.length<=200;
const validBinding=(s:string)=>typeof s==='string'&&s.length>=16&&s.length<=512;
const validToken=(s:string)=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const validPurpose=(p:string):p is Purpose=>['enroll','login','stepup'].includes(p);
async function lockStaff(client:PoolClient,subject:string):Promise<boolean>{
  return !!(await client.query("select 1 from staff where subject=$1 and active and (expires_at is null or expires_at>now()) for update",[subject])).rowCount;
}
async function read(client:PoolClient,subject:string):Promise<Row|undefined>{
  return (await client.query<Row>(`select purpose,token_hash,code_mac,binding_mac,state,
    (extract(epoch from issued_at)*1000)::bigint::text as issued_ms,
    (extract(epoch from expires_at)*1000)::bigint::text as expires_ms,
    (extract(epoch from window_started)*1000)::bigint::text as window_ms,issued_count,failures,
    (extract(epoch from locked_until)*1000)::bigint::text as locked_ms,
    (extract(epoch from clock_timestamp())*1000)::bigint::text as now_ms
    from admin_sms_challenges where subject=$1 for update`,[subject])).rows[0];
}
/** Issue a random six-digit code and opaque token. Caller sends outside the DB
 * transaction, then activates only after confirmed provider acceptance. */
export async function issueAdminSmsChallenge(client:PoolClient,subject:string,purpose:Purpose,binding:string):Promise<Issue>{
  const key=mfaKey();if(!key)return {ok:false,reason:'unavailable'};
  if(!validSubject(subject)||!validPurpose(purpose)||!validBinding(binding)||!await lockStaff(client,subject))return {ok:false,reason:'invalid'};
  const previous=await read(client,subject);
  const now=previous?Number(previous.now_ms):Number((await client.query<{ms:string}>("select (extract(epoch from clock_timestamp())*1000)::bigint::text as ms")).rows[0].ms);
  const locked=previous?.locked_ms?Number(previous.locked_ms):0;
  if(locked>now)return {ok:false,reason:'limited'};
  const sameWindow=!!previous&&now-Number(previous.window_ms)<10*60_000;
  if(previous&&(now-Number(previous.issued_ms)<60_000||(sameWindow&&previous.issued_count>=3)))return {ok:false,reason:'limited'};
  const count=sameWindow?previous!.issued_count+1:1,windowStart=sameWindow?Number(previous!.window_ms):now;
  // A lock that has expired starts a fresh failure budget; issuing alone never resets it.
  const failures=locked&&locked<=now?0:(previous?.failures??0);
  const token=randomBytes(32).toString('hex'),code=String(randomInt(1_000_000)).padStart(6,'0'),expires=now+120_000;
  await client.query(`insert into admin_sms_challenges(subject,purpose,token_hash,code_mac,binding_mac,state,issued_at,expires_at,window_started,issued_count,failures,locked_until)
    values($1,$2,$3,$4,$5,'sending',to_timestamp($6::double precision/1000),to_timestamp($7::double precision/1000),to_timestamp($8::double precision/1000),$9,$10,null)
    on conflict(subject) do update set purpose=excluded.purpose,token_hash=excluded.token_hash,code_mac=excluded.code_mac,binding_mac=excluded.binding_mac,state=excluded.state,issued_at=excluded.issued_at,expires_at=excluded.expires_at,window_started=excluded.window_started,issued_count=excluded.issued_count,failures=excluded.failures,locked_until=null`,
    [subject,purpose,sha(token),mac(key,'code:'+purpose,subject,token,code),mac(key,'binding:'+purpose,subject,token,binding),now,expires,windowStart,count,failures]);
  return {ok:true,token,code,expiresAt:expires};
}
/** Only call accepted=true after the configured provider confirms acceptance;
 * failure or ambiguous delivery must leave the code unusable. */
export async function settleAdminSmsChallenge(client:PoolClient,subject:string,purpose:Purpose,binding:string,token:string,accepted:boolean):Promise<Result>{
  const key=mfaKey();if(!key)return 'unavailable';
  if(!validSubject(subject)||!validPurpose(purpose)||!validBinding(binding)||!validToken(token)||!await lockStaff(client,subject))return 'invalid';
  const row=await read(client,subject);
  if(!row||row.state!=='sending'||row.purpose!==purpose||Number(row.expires_ms)<=Number(row.now_ms)||!equal(row.token_hash,sha(token))||!equal(row.binding_mac,mac(key,'binding:'+purpose,subject,token,binding)))return 'invalid';
  await client.query('update admin_sms_challenges set state=$2 where subject=$1',[subject,accepted?'ready':'cancelled']);
  return 'ok';
}
/** Atomic, purpose/session-bound consumption. Failed guesses must be committed. */
export async function consumeAdminSmsChallenge(client:PoolClient,subject:string,purpose:Purpose,binding:string,token:string,code:string):Promise<Result>{
  const key=mfaKey();if(!key)return 'unavailable';
  if(!validSubject(subject)||!validPurpose(purpose)||!validBinding(binding)||!validToken(token)||typeof code!=='string'||code.length>100||!await lockStaff(client,subject))return 'invalid';
  const row=await read(client,subject);if(!row)return 'invalid';const now=Number(row.now_ms);
  if(row.locked_ms&&Number(row.locked_ms)>now)return 'locked';
  if(row.state!=='ready'||row.purpose!==purpose||Number(row.expires_ms)<=now||!equal(row.token_hash,sha(token))||!equal(row.binding_mac,mac(key,'binding:'+purpose,subject,token,binding)))return 'invalid';
  const correct=/^\d{6}$/.test(code)&&equal(row.code_mac,mac(key,'code:'+purpose,subject,token,code));
  if(correct){await client.query("update admin_sms_challenges set state='used',failures=0,locked_until=null where subject=$1",[subject]);return 'ok'}
  const failures=row.locked_ms&&Number(row.locked_ms)<=now?1:row.failures+1;
  await client.query("update admin_sms_challenges set failures=$2,locked_until=case when $2>=5 then clock_timestamp()+interval '10 minutes' else null end where subject=$1",[subject,Math.min(failures,5)]);
  return 'invalid';
}
