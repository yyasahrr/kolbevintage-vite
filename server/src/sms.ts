import { createHmac } from "node:crypto";

/* Generic SMS gateway. A 2xx alone is not acceptance and acceptance is not
 * handset delivery. The provider must explicitly respond with {accepted:true}. */
export interface SmsResult {
  ok: boolean;
  messageId?: string;
  code?: "provider_not_configured" | "invalid_number" | "provider_error" | "timeout";
  error?: string;
}
export const smsConfigured = () => {
  try { const url=new URL(process.env.SMS_PROVIDER_URL ?? '');return url.protocol==='https:'&&!url.username&&!url.password; }
  catch{return false}
};
export const smsSender = () => process.env.SMS_SENDER ?? "";

/** Iranian mobile numbers: convert Persian/Arabic digits and reject unexpected characters. */
export function normalizePhone(raw: string): string | null {
  if(typeof raw!=="string"||raw.length>40)return null;
  const ascii=raw.replace(/[۰-۹٠-٩]/g,c=>String(c.charCodeAt(0)-(c>='۰'&&c<='۹'?0x06f0:0x0660)));
  if(!/^[+\d\s().-]+$/.test(ascii))return null;
  const digits=ascii.replace(/[\s().-]/g,'').replace(/^\+98/,'0').replace(/^0098/,'0').replace(/^98/,'0');
  const local=/^9\d{9}$/.test(digits)?`0${digits}`:digits;
  return /^09\d{9}$/.test(local)?local:null;
}

/** Cap untrusted provider bodies, including chunked responses. */
export async function readSmsResponse(response:Response):Promise<string> {
  const max=16*1024,declared=response.headers.get('content-length');
  if(declared&&/^\d+$/.test(declared)&&Number(declared)>max)throw Error('response too large');
  if(!response.body)return '';
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let length=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>max)throw Error('response too large');chunks.push(value)}}
  finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
  return Buffer.concat(chunks.map(chunk=>Buffer.from(chunk))).toString('utf8');
}

export async function sendSms(to: string, body: string, transport:typeof fetch=fetch): Promise<SmsResult> {
  const endpoint = process.env.SMS_PROVIDER_URL;
  if (!endpoint || !smsConfigured()) return { ok: false, code: "provider_not_configured", error: "درگاه HTTPS پیامک تنظیم نشده است." };
  const phone = normalizePhone(to);
  if (!phone) return { ok: false, code: "invalid_number", error: "شمارهٔ موبایل معتبر نیست." };
  // Do not send a credential or customer message over cleartext or redirect.
  const payload = JSON.stringify({ to: phone, body, sender: smsSender() });
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = process.env.SMS_PROVIDER_TOKEN, secret = process.env.SMS_PROVIDER_SECRET;
  if (token) headers.authorization = `Bearer ${token}`;
  if (!token && secret) headers["x-signature"] = createHmac("sha256", secret).update(payload).digest("hex");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const unknown={ok:false,code:'provider_error',error:'درگاه پذیرش پیام را تأیید نکرد؛ نتیجه ممکن است نامشخص باشد. پیش از تلاش دوباره وضعیت را بررسی کنید.'} as const;
  try {
    const res = await transport(endpoint, { method: "POST", headers, body: payload, signal: controller.signal,redirect:'error' });
    if (!res.ok) return unknown;
    const parsed:unknown = JSON.parse(await readSmsResponse(res));
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||(parsed as Record<string,unknown>).accepted!==true)return unknown;
    const id=(parsed as Record<string,unknown>).messageId;
    return { ok: true, ...(typeof id==='string' && id.length<=200 && /^[\w-]+$/.test(id)?{messageId:id}:{}) };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return aborted ? {ok:false,code:'timeout',error:'پاسخ درگاه به‌موقع دریافت نشد؛ نتیجه ممکن است نامشخص باشد.'} : unknown;
  } finally { clearTimeout(timer); }
}
