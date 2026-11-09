#!/usr/bin/env node
// Read-only check of the dedicated demo role. Does not seed or print secrets.
import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import pg from 'pg';
import {parseDemoUri,PROJECT_REF} from './demo-connection-uri.mjs';
import {describeDemoConnectionError} from './demo-connection-errors.mjs';
if(!process.stdin.isTTY || process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0'){
 console.error('ترمینال تعاملی و بررسی گواهی TLS لازم است.');process.exit(1);
}
const rl=createInterface({input:process.stdin,output:new Writable({write(_c,_e,done){done()}}),terminal:true});
async function prompt(label){process.stderr.write(label);try{return await rl.question('')}finally{process.stderr.write('\n')}}
let client;
try{
 const {host}=parseDemoUri(await prompt('URI پیش‌فرض Session pooler (مخفی): '));
 if(!host.endsWith('.pooler.supabase.com'))throw Error('pooler');
 const password=(await prompt('مقدار demo_password حاصل از SQL Editor (مخفی): ')).trim();
 if(!/^[0-9a-f]{64}$/.test(password))throw Error('demo_password_format');
 client=new pg.Client({host,port:5432,user:`kolbe_demo_app.${PROJECT_REF}`,password,database:'postgres',ssl:{rejectUnauthorized:true},connectionTimeoutMillis:10000});
 await client.connect();
 await client.query('begin read only');
 const res=await client.query("select current_user as role, current_database() as database, to_regclass('kolbe_demo.state_documents') is not null as demo_table");
 await client.query('rollback');
 if(res.rows[0]?.role!=='kolbe_demo_app'||res.rows[0]?.database!=='postgres'||!res.rows[0]?.demo_table)throw Error('identity');
 console.log('اتصال امن نقش اختصاصی دمو برقرار شد. این بررسی داده‌ای تغییر نداد.');
}catch(e){
 const code=e instanceof Error?e.message:'';
 if(code==='pooler')console.error('URI مربوط به Session pooler نیست.');
 else if(code==='demo_password_format')console.error('مقدار demo_password باید ۶۴ نویسهٔ عدد یا حروف a تا f باشد.');
 else if(code==='identity')console.error('اتصال به هویت مورد انتظار نقش دمو انجام نشده است.');
 else if(['invalid_uri','wrong_host','wrong_user','wrong_port','wrong_database'].includes(code))console.error('URI واردشده با URI پیش‌فرض Session pooler همین پروژه مطابقت ندارد.');
 else console.error(describeDemoConnectionError(e));
 process.exitCode=1;
}finally{rl.close();await client?.end().catch(()=>{});}
