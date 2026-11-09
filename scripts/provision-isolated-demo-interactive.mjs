#!/usr/bin/env node
// One-time remote demo provisioning with the restricted role only. Credentials
// are read from the terminal, not arguments, files, history, or printed output.
// The child receives the role URL via its process environment and the admin
// passcode via stdin. Run only on a trusted personal machine.
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {parseDemoUri, PROJECT_REF} from './demo-connection-uri.mjs';
import {describeDemoConnectionError} from './demo-connection-errors.mjs';

if (!process.stdin.isTTY || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
  console.error('ترمینال تعاملی و بررسی معتبر گواهی TLS لازم است.'); process.exit(1);
}
const silent=new Writable({write(_c,_e,done){done()}});
const rl=createInterface({input:process.stdin,output:silent,terminal:true});
async function prompt(label){process.stderr.write(label);try{return await rl.question('')}finally{process.stderr.write('\n')}}
let client;
try {
  const uri=await prompt('URI پیش‌فرض Session pooler پروژه (مخفی): ');
  const {host}=parseDemoUri(uri);
  if (!host.endsWith('.pooler.supabase.com')) throw Error('pooler');
  const dbPassword=(await prompt('رمز نقش اختصاصی دمو که SQL Editor نشان داد (مخفی): ')).trim();
  if (!/^[a-f0-9]{64}$/.test(dbPassword)) throw Error('db_password');
  const adminPassword=await prompt('یک رمز جدید برای ورود به پنل دمو انتخاب کنید (مخفی، دست‌کم ۱۶ نویسه): ');
  const confirm=await prompt('همان رمز پنل را تکرار کنید (مخفی): ');
  if(adminPassword!==confirm||adminPassword.length<16||adminPassword.length>256||adminPassword.trim()!==adminPassword||new Set(adminPassword).size<8) throw Error('admin_password');
  rl.close();
  const user=`kolbe_demo_app.${PROJECT_REF}`;
  const connectionString=`postgresql://${user}:${dbPassword}@${host}:5432/postgres?sslmode=verify-full`;
  client=new pg.Client({host,port:5432,user,password:dbPassword,database:'postgres',ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
  await client.connect();
  const identity=await client.query('select current_user as role, current_database() as database');
  if(identity.rows[0]?.role!=='kolbe_demo_app'||identity.rows[0]?.database!=='postgres') throw Error('identity');
  await client.end();client=undefined;
  const env={...process.env,NODE_ENV:'production',DATABASE_URL:connectionString,DATABASE_SCHEMA:'kolbe_demo',DEMO_BOOTSTRAP_CONFIRM:'kolbe_demo',PANEL_OPEN_ACCESS:'0',LOG_LEVEL:'silent'};
  delete env.VERCEL;
  const result=spawnSync(process.execPath,['--import','tsx','scripts/provision-demo.ts'],{env,input:adminPassword+'\n',encoding:'utf8',timeout:90000,maxBuffer:1024*1024});
  if(result.status!==0) throw Error('provision');
  console.log('داده‌های نمونه در schema مجزای دمو آماده شدند. رمز نقش و رمز پنل را نزد خود نگه دارید و در چت نفرستید. هنوز تنظیمات Vercel و دسترسی عمومی باید تکمیل و آزمایش شوند.');
} catch(e){
  const code=e instanceof Error?e.message:'';
  if(code==='pooler') console.error('لطفاً URI حالت Session pooler همین پروژه را انتخاب کنید.');
  else if(code==='db_password') console.error('رمز نقش دمو باید همان مقدار ۶۴ نویسه‌ای نتیجه SQL باشد.');
  else if(code==='admin_password') console.error('رمز پنل نامعتبر است یا تکرارش مطابقت ندارد.');
  else if(code==='provision') console.error('آماده‌سازی کامل نشد. ممکن است بخشی از داده‌های دمو ثبت شده باشد؛ بدون بررسی دوباره اجرا یا پاک‌سازی نکنید.');
  else if(code==='identity') console.error('اتصال به هویت مورد انتظار نقش دمو انجام نشده است.');
  else if(['invalid_uri','wrong_host','wrong_user','wrong_port','wrong_database'].includes(code)) console.error('URI واردشده با URI پیش‌فرض Session pooler همین پروژه مطابقت ندارد.');
  else console.error(describeDemoConnectionError(e));
  process.exitCode=1;
} finally {rl.close();await client?.end().catch(()=>{});}
