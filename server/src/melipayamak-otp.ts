import {isLosslessNumber, parse} from 'lossless-json';
import {normalizePhone,readSmsResponse} from './sms';

/** Pattern transport only: a request accepted by the provider is not delivery.
 * This module is NOT an OTP verification or login implementation. */
const ENDPOINT='https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber';
type OtpSendResult=
  | {accepted:true;messageId:string}
  | {accepted:false;code:'not_configured'|'invalid_input'|'rejected'|'unconfirmed'};

type OtpConfig={username:string;apiKey:string;templateId:string};
function configuration():OtpConfig|null {
  const username=process.env.MELIPAYAMAK_USERNAME?.trim()||'';
  const apiKey=process.env.MELIPAYAMAK_API_KEY?.trim()||'';
  const templateId=process.env.MELIPAYAMAK_OTP_TEMPLATE_ID?.trim()||'';
  // Bound inputs; credentials are server-side and never supplied by a client.
  if(!username||username.length>200||!apiKey||apiKey.length>512||!/^[1-9]\d{0,9}$/.test(templateId))return null;
  return {username,apiKey,templateId};
}
export function melipayamakOtpConfigured():boolean{return configuration()!==null}

function scalar(value:unknown):string|null {
  if(typeof value==='string')return value;
  if(isLosslessNumber(value))return value.toString();
  return null;
}
/** `transport` exists for isolated tests; application callers use global fetch.
 * No URL override is accepted, preventing credential/OTP redirection to a caller URL. */
export async function sendMelipayamakOtp(to:string,code:string,transport:typeof fetch=fetch):Promise<OtpSendResult>{
  const settings=configuration();if(!settings)return {accepted:false,code:'not_configured'};
  const phone=normalizePhone(to);if(!phone||!/^\d{6}$/.test(code))return {accepted:false,code:'invalid_input'};
  const form=new URLSearchParams({username:settings.username,password:settings.apiKey,to:phone,bodyId:settings.templateId,text:code});
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
  try {
    const response=await transport(ENDPOINT,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded; charset=UTF-8'},body:form.toString(),signal:controller.signal,redirect:'error'});
    // Non-2xx and transport errors may still mean that the provider received the request.
    if(!response.ok)return {accepted:false,code:'unconfirmed'};
    const decoded:unknown=parse(await readSmsResponse(response));
    if(!decoded||typeof decoded!=='object'||Array.isArray(decoded))return {accepted:false,code:'unconfirmed'};
    const data=decoded as Record<string,unknown>,status=scalar(data.RetStatus),id=scalar(data.Value);
    if(status!=='1'||!id)return {accepted:false,code:'unconfirmed'};
    // Documented short/negative Value codes are rejections, not IDs. Conservatively
    // accept only a long decimal receipt, preserved without JS number rounding.
    if(/^-?\d{1,15}$/.test(id))return {accepted:false,code:'rejected'};
    if(!/^[1-9]\d{15,29}$/.test(id))return {accepted:false,code:'unconfirmed'};
    return {accepted:true,messageId:id};
  } catch {return {accepted:false,code:'unconfirmed'}}
  finally {clearTimeout(timer)}
}
