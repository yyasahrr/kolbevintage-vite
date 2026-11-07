#!/usr/bin/env node
/**
 * Initialize a brand-new, empty PostgreSQL database. No demo data is imported.
 * The password is read from a hidden terminal prompt or standard input, never
 * from command arguments or environment variables. Nothing is overwritten.
 */
import fs from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import pg from "pg";
import { hashPassword } from "../server/src/security";

const nameArg = process.argv.find(arg => arg.startsWith("--store-name="));
const name = nameArg?.slice("--store-name=".length).trim() ?? "";
const allowed = process.argv.slice(2).every(arg => arg === "--confirm-new-empty-store" || arg.startsWith("--store-name="));
if (!allowed || !process.argv.includes("--confirm-new-empty-store") || process.env.NODE_ENV !== "production" || !process.env.DATABASE_URL || name.length < 2 || name.length > 100) {
  console.error("فقط برای پایگاه تازه و خالی: NODE_ENV=production DATABASE_URL=… npm run provision:store -- --confirm-new-empty-store --store-name=نام‌فروشگاه");
  console.error("رمز مالک را فقط در ورودی امن برنامه وارد کنید؛ دستور هیچ پایگاه موجودی را بازنویسی نمی‌کند.");
  process.exit(1);
}

async function readSecret(): Promise<string> {
  if (process.stdin.isTTY) {
    // readline controls the terminal in raw mode; the sink prevents echoing.
    const sink = new Writable({write(_chunk, _encoding, callback) {callback();}});
    const rl = createInterface({input:process.stdin,output:sink,terminal:true});
    try {
      process.stderr.write("رمز یکتای مالک (نمایش داده نمی‌شود): ");
      const first = await rl.question("");
      process.stderr.write("\nتکرار رمز مالک: ");
      const second = await rl.question("");
      process.stderr.write("\n");
      if (first !== second) throw new Error("رمزهای واردشده یکسان نیستند.");
      return first;
    } finally { rl.close(); }
  }
  let value="";
  for await (const chunk of process.stdin) {
    value += String(chunk);
    if (value.length > 260) throw new Error("ورودی رمز بیش از حد طولانی است.");
  }
  return value.replace(/\r?\n$/, "");
}

const homeSections = ["hero","collections","newArrivals","runway","atelier","looks","journal"].map(id => ({id,label:id,active:false}));
function emptyDocuments(storeName:string, passwordHash:string) {
  const brand = {name:storeName,logoText:storeName,logoImage:"",favicon:"",tagline:"",announcement:"",announcementActive:false,footerNote:"",socials:{instagram:"",telegram:"",whatsapp:""}};
  return {
    admin:{settings:{name:storeName,tagline:"",address:"",phone:"",email:"",currency:"تومان",currencyRate:1000,freeShipping:0,expressCost:0,returnDays:0,passcodeHash:passwordHash,maintenance:false,notice:{on:false,text:"",href:"",tone:"info"}},orders:[],coupons:[],reviews:[],hidden:[],featured:[],hiddenLooks:[],stock:[],lookOrder:[],customLooks:[],customProducts:[],productEdits:{},complements:{},movements:[],campaigns:[],rules:[],discountRules:[],integrations:{ai:{provider:"",baseUrl:"",apiKey:"",model:"",enabled:false},payment:{gateway:"none",key:"",mode:"test",enabled:false},sms:{provider:"",sender:"",key:"",enabled:false},email:{provider:"",from:"",key:"",enabled:false},shipping:{courier:"",apiKey:"",enabled:false}},customers:{}},
    ops:{siteTheme:"soft",siteUnderSetup:true,brand,categories:[],colorLibrary:[],sizeSets:[],homeSections,productImages:{},productVideos:{},colorMedia:{},hoverMedia:{},labels:[],smsTemplates:[],smsCampaigns:[],replyTemplates:[],sizeGuides:{},features:{tryon:false,reviews:false,journal:false,wishlist:false},categorySort:{},journalBlocks:{},journalVideos:{},setup:{done:false,step:0},launchChecks:{},issues:[],developerEmail:"",seo:{title:storeName,description:"",notFoundTitle:"این صفحه پیدا نشد",notFoundText:"نشانی را بررسی کنید."},cashbackRate:0,cashbackTxns:[],tryonPackages:[],tryonRequests:[],tryonCredits:{},tickets:[],returns:[],logs:[],security:{requireOtp:false,sessionMinutes:30,twoFactor:false,allowCustomerSignup:false,otpChannels:{sms:false,email:false},failedAttempts:[],blocked:[]},formFields:[],megaMenus:[],widgets:[],faqs:[],lookProducts:{},lookImages:{}}
  };
}

let client: pg.Client | undefined;
try {
  const password=await readSecret();
  if (password.length < 12 || password.length > 256 || password.trim() !== password || new Set(password).size < 6) throw new Error("رمز مالک باید ۱۲ تا ۲۵۶ نویسه و بدون فاصله ابتدا یا انتها باشد؛ رمز تکراری ساده پذیرفته نمی‌شود.");
  const docs=emptyDocuments(name,hashPassword(password));
  client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000});
  await client.connect();
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(hashtext('kolbe:new-store-provision'))");
  // Refuse any existing objects, even if they happen to contain zero rows. The
  // command is not a migration, reset, demo-clearing, or recovery mechanism.
  const existing=await client.query<{n:number}>(`select (
    (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')) +
    (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public')
  )::int as n`);
  if (existing.rows[0].n !== 0) throw new Error("پایگاه خالی نیست؛ هیچ تغییری اعمال نشد.");
  const schema=await fs.readFile(new URL("../server/src/schema.sql",import.meta.url),"utf8");
  await client.query(schema);
  for (const [key,value] of Object.entries(docs)) await client.query("insert into state_documents(key,value) values($1,$2::jsonb)",[key,JSON.stringify(value)]);
  await client.query("insert into audit_events(actor,action,target_type,target_id,after) values('provisioning','store.initialized','store','store',$1::jsonb)",[JSON.stringify({siteUnderSetup:true})]);
  await client.query("commit");
  console.log("فروشگاه خالی ایجاد شد. ویترین در حالت آماده‌سازی است؛ هیچ محصول، مشتری یا سفارش نمونه‌ای وارد نشد.");
  console.log("پیش از انتشار، راهنمای docs/production-readiness-fa.md و بررسی production:check را دنبال کنید.");
} catch (error) {
  await client?.query("rollback").catch(()=>undefined);
  // Do not print connection errors: connection strings may contain credentials.
  console.error(error instanceof Error && (error.message.includes("پایگاه خالی نیست") || error.message.includes("رمز") || error.message.includes("ورودی")) ? error.message : "آماده‌سازی ناموفق بود؛ هیچ تغییری ثبت نشد. اتصال و مجوز پایگاه را بررسی کنید.");
  process.exitCode=1;
} finally {await client?.end().catch(()=>undefined);}
