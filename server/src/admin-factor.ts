import type {PoolClient} from 'pg';
import {verifyFactor,mfaKey,open,type MfaData} from './admin-mfa';
import {normalizePhone} from './sms';
import {consumeAdminSmsChallenge} from './admin-sms-challenge';

/** Caller holds staff lock, validates credentials/session and persists MfaData.
 * Both SMS consumption and the privileged action must commit atomically. */
export async function verifyAdminFactor(client:PoolClient,data:MfaData,subject:string,code:string,opts:{purpose:'login'|'stepup';binding:string;challenge:string}){
  const clean=code.trim();
  if(data.method==='sms' && /^\d{6}$/.test(clean)){
    if(!mfaKey())return 'unavailable' as const;
    if(data.lockedUntil>Date.now())return 'locked' as const;
    try { const phone=open<{phone:string}>(data.secret,`admin-mfa:${subject}`).phone;if(!phone||normalizePhone(phone)!==phone)return 'unavailable' as const; }
    catch{return 'unavailable' as const;}
    return consumeAdminSmsChallenge(client,subject,opts.purpose,opts.binding,opts.challenge,clean);
  }
  return verifyFactor(data,subject,clean);
}
