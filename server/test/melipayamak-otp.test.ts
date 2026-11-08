import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {melipayamakOtpConfigured,sendMelipayamakOtp} from '../src/melipayamak-otp';
import {normalizePhone} from '../src/sms';
const names=['MELIPAYAMAK_USERNAME','MELIPAYAMAK_API_KEY','MELIPAYAMAK_OTP_TEMPLATE_ID'] as const;
const old=new Map(names.map(name=>[name,process.env[name]]));
before(()=>{process.env.MELIPAYAMAK_USERNAME='test-user';process.env.MELIPAYAMAK_API_KEY='test-private-key';process.env.MELIPAYAMAK_OTP_TEMPLATE_ID='12345'});
after(()=>{for(const [name,value] of old){if(value===undefined)delete process.env[name];else process.env[name]=value}});
const make=(json:string,status=200):typeof fetch=>async()=>new Response(json,{status,headers:{'content-type':'application/json'}});
test('local mobile normalization accepts Iranian digits and rejects unexpected text',()=>{
  for(const value of ['09121234567','9121234567','+98 912 123 4567','0098-912-123-4567','۰۹۱۲۱۲۳۴۵۶۷','٠٩١٢١٢٣٤٥٦٧'])assert.equal(normalizePhone(value),'09121234567');
  for(const value of ['abc09121234567','091212345678','++989121234567','0912;1234567','+001234',''])assert.equal(normalizePhone(value),null);
});
test('pattern request has fixed HTTPS endpoint, server credentials, exact variables, and preserves large receipt',async()=>{
  assert.equal(melipayamakOtpConfigured(),true);let called=0;
  const fetcher:typeof fetch=async(url,init)=>{called++;assert.equal(String(url),'https://rest.payamak-panel.com/api/SendSMS/BaseServiceNumber');assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');assert.ok(init?.signal);const form=new URLSearchParams(String(init?.body));assert.deepEqual(Object.fromEntries(form),{username:'test-user',password:'test-private-key',to:'09121234567',bodyId:'12345',text:'012345'});return new Response('{"Value":12345678901234567,"RetStatus":1,"StrRetStatus":"Ok"}',{status:200})};
  assert.deepEqual(await sendMelipayamakOtp('۰۹۱۲۱۲۳۴۵۶۷','012345',fetcher),{accepted:true,messageId:'12345678901234567'});assert.equal(called,1);
});
test('configuration and inputs fail without making a network request',async()=>{
  let calls=0;const fetcher:typeof fetch=async()=>{calls++;throw Error('unexpected')};
  delete process.env.MELIPAYAMAK_API_KEY;assert.equal(melipayamakOtpConfigured(),false);assert.deepEqual(await sendMelipayamakOtp('09121234567','123456',fetcher),{accepted:false,code:'not_configured'});
  process.env.MELIPAYAMAK_API_KEY='test-private-key';process.env.MELIPAYAMAK_OTP_TEMPLATE_ID='0';assert.equal(melipayamakOtpConfigured(),false);process.env.MELIPAYAMAK_OTP_TEMPLATE_ID='12345';
  for(const [phone,code] of [['invalid','123456'],['09121234567','12345'],['09121234567','۱۲۳۴۵۶'],['09121234567','123456;evil']])assert.deepEqual(await sendMelipayamakOtp(phone,code,fetcher),{accepted:false,code:'invalid_input'});
  assert.equal(calls,0);
});
test('provider errors and ambiguous outcomes never claim acceptance or expose sensitive content',async()=>{
  for(const value of ['0','2','35','-4'])assert.deepEqual(await sendMelipayamakOtp('09121234567','123456',make(JSON.stringify({RetStatus:1,Value:value}))),{accepted:false,code:'rejected'});
  const responses=[make('{"RetStatus":0,"Value":"12345678901234567"}'),make('{"Value":"12345678901234567"}'),make('not-json'),make('"12345678901234567"'),make('{"RetStatus":1,"Value":"test-private-key 123456"}'),make('{"RetStatus":1,"Value":null}'),make('x'.repeat(16*1024+1)),make('{"secret":"test-private-key"}',500),async()=>{throw Error('test-private-key 123456')}];
  for(const fetcher of responses){const result=await sendMelipayamakOtp('09121234567','123456',fetcher as typeof fetch);assert.deepEqual(result,{accepted:false,code:'unconfirmed'});assert.doesNotMatch(JSON.stringify(result),/test-private-key|123456/)}
});
test('accepted receipt is not a delivery claim',async()=>{
  const result=await sendMelipayamakOtp('09121234567','123456',make('{"RetStatus":"1","Value":"1234567890123456"}'));
  assert.deepEqual(result,{accepted:true,messageId:'1234567890123456'});assert.equal('delivered' in result,false);
});

test('generic SMS adapter rejects ambiguous success and never echoes provider body',async()=>{
  const {sendSms}=await import('../src/sms');const oldUrl=process.env.SMS_PROVIDER_URL,oldToken=process.env.SMS_PROVIDER_TOKEN;
  try{
    process.env.SMS_PROVIDER_URL='https://sms.example.test/send';process.env.SMS_PROVIDER_TOKEN='private-token';
    for(const response of [make('ok'),make('{"ok":true,"Value":2}'),make('{"accepted":false,"secret":"private-token"}'),make('{"accepted":true}',500),make('x'.repeat(16*1024+1))]){
      const result=await sendSms('۰۹۱۲۱۲۳۴۵۶۷','private message',response);assert.equal(result.ok,false);assert.doesNotMatch(JSON.stringify(result),/private-token|private message/);
    }
    const fetcher:typeof fetch=async(url,init)=>{assert.equal(String(url),'https://sms.example.test/send');assert.equal(init?.redirect,'error');assert.equal((init?.headers as Record<string,string>).authorization,'Bearer private-token');assert.equal(JSON.parse(String(init?.body)).to,'09121234567');return new Response('{"accepted":true,"messageId":"AB-123"}',{status:200})};
    assert.deepEqual(await sendSms('09121234567','private message',fetcher),{ok:true,messageId:'AB-123'});
    process.env.SMS_PROVIDER_URL='http://sms.example.test/send';assert.equal((await sendSms('09121234567','test',fetcher)).code,'provider_not_configured');
  }finally{if(oldUrl===undefined)delete process.env.SMS_PROVIDER_URL;else process.env.SMS_PROVIDER_URL=oldUrl;if(oldToken===undefined)delete process.env.SMS_PROVIDER_TOKEN;else process.env.SMS_PROVIDER_TOKEN=oldToken;}
});
