#!/usr/bin/env node
/**
 * Populate an already-migrated, empty isolated demo schema. This is not a reset
 * tool. Never run on a live store. A session-level transaction holds an
 * advisory lock while separately committed projection steps run. On failure,
 * no completion marker is written and the API adapter refuses to start; a
 * human must inspect the partial schema rather than rerun or delete data.
 * Passphrase is read privately from stdin, never CLI args or environment.
 */
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import pg from "pg";
import { hashPassword } from "../server/src/security";

if (process.argv.length!==2 || process.env.NODE_ENV!=="production" || process.env.DATABASE_SCHEMA!=="kolbe_demo" || process.env.DEMO_BOOTSTRAP_CONFIRM!=="kolbe_demo" || !process.env.DATABASE_URL || process.env.PANEL_OPEN_ACCESS==="1") {
  console.error("آماده‌سازی فقط برای schema خالی kolbe_demo و با تأیید صریح مجاز است.");process.exit(1);
}
async function readSecret(){
  if(process.stdin.isTTY){const rl=createInterface({input:process.stdin,output:new Writable({write(_c,_e,cb){cb()}}),terminal:true});try{process.stderr.write("رمز یکتای مدیریت (نمایش داده نمی‌شود): ");const a=await rl.question("");process.stderr.write("\nتکرار رمز: ");const b=await rl.question("");process.stderr.write("\n");if(a!==b)throw Error("password");return a}finally{rl.close()}}
  let s="";for await(const chunk of process.stdin){s+=String(chunk);if(s.length>260)throw Error("password")}return s.replace(/\r?\n$/,"");
}
let pool:pg.Pool|undefined,lock:pg.PoolClient|undefined,db:typeof import("../server/src/db")|undefined;
let stage="input";
try{
 const password=await readSecret();if(password.length<16||password.length>256||password.trim()!==password||new Set(password).size<8)throw Error("password");
 stage="connect";pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000});lock=await pool.connect();await lock.query("begin");
 stage="lock";if(!(await lock.query<{locked:boolean}>("select pg_try_advisory_xact_lock(hashtext('kolbe:isolated-demo-provision')) as locked")).rows[0].locked)throw Error("busy");
 stage="role";const role=(await lock.query<{safe:boolean}>(`select (not r.rolsuper and not r.rolcreatedb and not r.rolcreaterole and not r.rolinherit and not r.rolbypassrls and has_schema_privilege(r.oid,'kolbe_demo','USAGE') and not has_schema_privilege(r.oid,'kolbe_demo','CREATE') and not exists(select 1 from pg_auth_members m where m.member=r.oid) and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m') and (has_table_privilege(r.oid,c.oid,'SELECT') or has_table_privilege(r.oid,c.oid,'INSERT') or has_table_privilege(r.oid,c.oid,'UPDATE') or has_table_privilege(r.oid,c.oid,'DELETE'))) and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema','pg_toast') and p.prosecdef and has_schema_privilege(r.oid,n.oid,'USAGE') and has_function_privilege(r.oid,p.oid,'EXECUTE'))) as safe from pg_roles r where r.rolname='kolbe_demo_app'`)).rows[0];
 if(!role?.safe)throw Error("role");
 stage="schema";const privateSchema=await lock.query<{safe:boolean}>(`select not exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='kolbe_demo' and a.grantee=0 and a.privilege_type in ('USAGE','CREATE')) and not has_schema_privilege('anon','kolbe_demo','USAGE,CREATE') and not has_schema_privilege('authenticated','kolbe_demo','USAGE,CREATE') as safe`);if(!privateSchema.rows[0].safe)throw Error("schema");
 stage="empty";const tables=(await lock.query<{name:string}>("select c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kolbe_demo' and c.relkind in ('r','p') order by c.relname")).rows;
 if(tables.length<30 || !tables.some(x=>x.name==='state_documents') || !tables.some(x=>x.name==='security_rate_limits'))throw Error("schema");
 for(const {name} of tables){const id='"'+name.replace(/"/g,'""')+'"';if((await lock.query(`select 1 from kolbe_demo.${id} limit 1`)).rowCount)throw Error("nonempty")}
 stage="db_import";db=await import("../server/src/db");stage="db_init";await db.initDb({migrate:false});
 stage="imports";const {seed,syncProjection}=await import("../server/src/projection");const {putDocument}=await import("../server/src/seed");const {seedRbac}=await import("../server/src/http/rbac");const {ensureCommerceSettings}=await import("../server/src/commerce/settings");
 if(process.env.DEMO_BOOTSTRAP_PREFLIGHT==="1"){
   await lock.query("rollback");console.log("Demo preflight passed; no data modified.");
 } else {
 const admin=structuredClone(seed.admin),ops=structuredClone(seed.ops);
 admin.settings={...admin.settings,name:"Kolbe Vintage",tagline:"",address:"",phone:"",email:"",passcodeHash:hashPassword(password)};delete admin.settings.passcode;
 for(const k of ["orders","coupons","reviews","customProducts","movements","campaigns","rules"])admin[k]=[];admin.customers={};
 admin.integrations={ai:{provider:"",baseUrl:"",apiKey:"",model:"",enabled:false},payment:{gateway:"none",key:"",mode:"test",enabled:false},sms:{provider:"",sender:"",key:"",enabled:false},email:{provider:"",from:"",key:"",enabled:false},shipping:{courier:"",apiKey:"",enabled:false}};
 ops.brand={name:"Kolbe Vintage",logoText:"Kolbe Vintage",logoImage:"/kolbe-mark.png",favicon:"",tagline:"",announcement:"",announcementActive:false,footerNote:"",socials:{instagram:"",telegram:"",whatsapp:""}};
 ops.security={requireOtp:false,sessionMinutes:30,twoFactor:false,allowCustomerSignup:false,otpChannels:{sms:false,email:false},failedAttempts:[],blocked:[]};
 for(const k of ["tickets","returns","logs","smsTemplates","smsCampaigns","cashbackTxns","tryonRequests"])ops[k]=[];ops.tryonCredits={};ops.siteUnderSetup=false;
 stage="documents";await putDocument("admin",admin);await putDocument("ops",ops);stage="projection";await syncProjection(admin,ops);stage="rbac";await seedRbac();stage="commerce";await ensureCommerceSettings();
 stage="validation";const result=await db.query<{products:number;variants:number}>("select (select count(*)::int from products) as products,(select count(*)::int from product_variants) as variants");if(!result.rows[0].products||!result.rows[0].variants)throw Error("projection");
 stage="marker";await db.query("insert into state_documents(key,value) values ('demo_provisioning',$1::jsonb)",[JSON.stringify({complete:true,kind:"isolated_demo",version:1})]);
 await lock.query("commit");console.log(`دموی ایزوله آماده شد: ${result.rows[0].products} محصول و ${result.rows[0].variants} واریانت نمونه. پرداخت و پیامک واقعی فعال نشده‌اند.`);
 }
}catch(error){await lock?.query("rollback").catch(()=>undefined);const known=error instanceof Error?error.message:"";const rawCode=(error as {code?:unknown})?.code;const allowCodes=new Set(["42501","42P01","42883","3F000","28P01","53300","XX000","ECONNREFUSED","ETIMEDOUT","ERR_MODULE_NOT_FOUND","MODULE_NOT_FOUND","ERR_DLOPEN_FAILED","SELF_SIGNED_CERT_IN_CHAIN","UNABLE_TO_VERIFY_LEAF_SIGNATURE","ERR_TLS_CERT_ALTNAME_INVALID"]);const safeCode=typeof rawCode==="string"&&allowCodes.has(rawCode)?rawCode:known==="DATABASE_SCHEMA is missing or is not accessible to the database role."?"SCHEMA_ACCESS":/Unsupported (arch|platform)/i.test(known)?"UNSUPPORTED_PLATFORM":"unknown";console.error(`DEMO_FAILURE=${stage}:${safeCode}`);console.error(known==="password"?"رمز مدیر باید ۱۶ تا ۲۵۶ نویسه و غیرساده باشد.":known==="nonempty"?"schema خالی نیست؛ هیچ عملیات پاک‌سازی انجام نشد.":"آماده‌سازی انجام نشد؛ پیش از تلاش دوباره وضعیت schema را بررسی کنید. هیچ پاک‌سازی خودکاری انجام نشده است.");process.exitCode=1}
finally{await db?.closeDb();lock?.release();await pool?.end().catch(()=>undefined)}
