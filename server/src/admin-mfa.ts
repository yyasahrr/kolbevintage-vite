import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { PoolClient } from 'pg';
import { config } from './config';
import { getDocument } from './seed';
import { query } from './db';
import { verifyPassword } from './security';

/** ADMIN_MFA_KEY must be stable, random and held outside the database/backups. */
export function mfaKey(): Buffer | null {
  const raw=process.env.ADMIN_MFA_KEY ?? '';
  return /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw,'hex') : null;
}
function key(): Buffer { const result=mfaKey();if(!result)throw new Error('کلید امن تأیید دومرحله‌ای در سرور تنظیم نشده است.');return result; }
export function seal(value: unknown, purpose: string): string {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(purpose));
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
export function open<T>(value:string,purpose:string):T {
  const bytes=Buffer.from(value,'base64url');if(bytes.length<29)throw new Error('invalid encrypted value');
  const cipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));cipher.setAAD(Buffer.from(purpose));cipher.setAuthTag(bytes.subarray(12,28));
  return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString('utf8')) as T;
}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes:Buffer):string {let bits=0,value=0,out='';for(const b of bytes){value=(value<<8)|b;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;}
export function unbase32(s:string):Buffer {let bits=0,value=0,out:number[]=[];for(const c of s){const index=alphabet.indexOf(c);if(index<0)throw new Error('invalid base32');value=(value<<5)|index;bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8}}return Buffer.from(out);}
export function totpAt(secret:string,step:number):string {const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(step));const h=createHmac('sha1',unbase32(secret)).update(counter).digest(),o=h[h.length-1]&15;return String((h.readUInt32BE(o)&0x7fffffff)%1000000).padStart(6,'0');}
export function matchTotp(secret:string,code:string,lastStep:number,now=Date.now()):number|null {
  if(!/^\d{6}$/.test(code))return null;const step=Math.floor(now/30000);
  for(const candidate of [step,step-1,step+1]){if(candidate<=lastStep)continue;const a=Buffer.from(totpAt(secret,candidate)),b=Buffer.from(code);if(timingSafeEqual(a,b))return candidate;}return null;
}
export const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export function recoveryCodes():string[]{return Array.from({length:8},()=>randomBytes(10).toString('hex'));}
export const recoveryHash=(code:string)=>createHash('sha256').update(code.trim().toLowerCase()).digest('hex');
export interface MfaData { secret:string; lastStep:number; recovery:string[]; failures:number; lockedUntil:number }

/** Caller holds a staff row lock and must persist changes even on failure. */
export function verifyFactor(data:MfaData,subject:string,code:string):'ok'|'invalid'|'locked'|'unavailable' {
  if(!mfaKey())return 'unavailable';if(data.lockedUntil>Date.now())return 'locked';
  let secret:string;try { secret=open<{secret:string}>(data.secret,`admin-mfa:${subject}`).secret; } catch {return 'unavailable';}
  const clean=code.trim();const step=matchTotp(secret,clean,Number(data.lastStep));
  const hash=recoveryHash(clean);const idx=data.recovery.findIndex(v=>v.length===hash.length&&timingSafeEqual(Buffer.from(v),Buffer.from(hash)));
  if(step!==null||idx>=0){if(step!==null)data.lastStep=step;else data.recovery.splice(idx,1);data.failures=0;data.lockedUntil=0;return 'ok';}
  data.failures=(data.failures||0)+1;if(data.failures>=5){data.failures=0;data.lockedUntil=Date.now()+10*60*1000;}return 'invalid';
}
export async function verifyAdminPasscode(subject:string,passcode:string,client?:PoolClient):Promise<boolean>{
  if(!passcode||passcode.length>256)return false;
  if(subject==='admin'){
    const docs=client?await client.query<{key:string;value:Record<string,any>}>("select key,value from state_documents where key in ('admin','ops') order by key for share"):null;
    const admin=(docs?docs.rows.find(r=>r.key==='admin')?.value:await getDocument<Record<string,any>>('admin'))??{},ops=(docs?docs.rows.find(r=>r.key==='ops')?.value:await getDocument<Record<string,any>>('ops'))??{};
    const hash=typeof admin.settings?.passcodeHash==='string'?admin.settings.passcodeHash:'';
    const expected=String(admin.settings?.passcode??ops.security?.passcode??'');
    return (!config.isProd||passcode.length>=12)&&(hash?verifyPassword(passcode,hash):!!expected&&(!config.isProd||expected.length>=12)&&passcode===expected);
  }
  if(subject==='superadmin')return false;
  const result=client?await client.query('select passcode_hash from staff where subject=$1 and active and (expires_at is null or expires_at>now())',[subject]):await query('select passcode_hash from staff where subject=$1 and active and (expires_at is null or expires_at>now())',[subject]);
  return verifyPassword(passcode,result.rows[0]?.passcode_hash);
}
