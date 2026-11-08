// Emergency local operator recovery. Requires explicit database target and --yes.
import {initDb,closeDb,withTransaction} from '../server/src/db';
import {recordAudit} from '../server/src/commerce/audit';
if(!process.argv.includes('--yes') || !(process.env.DATABASE_URL || process.env.PGDATABASE)){
  console.error('مسیر پنل تغییر نکرد. هدف پایگاه داده را صریحاً تنظیم و --yes را وارد کنید.');process.exit(1);
}
try{
  await initDb();
  const old=await withTransaction(async client=>{
    await client.query('select pg_advisory_xact_lock(144777,2026)');
    const row=(await client.query<{value:{path?:unknown}}>("select value from state_documents where key='panel_entry' for update")).rows[0];
    const previous=row?.value?.path??'/panel';
    await client.query("insert into state_documents(key,value) values('panel_entry',$1::jsonb) on conflict(key) do update set value=excluded.value,updated_at=now()",[JSON.stringify({path:'/panel'})]);
    await recordAudit({actor:'local-recovery',action:'security.panel_path_recovered',targetType:'settings',targetId:'panel_entry',before:{path:previous},after:{path:'/panel'}},client);return previous;
  });
  console.log(`مسیر از ${String(old)} به /panel بازگردانده شد. دسترسی به پایگاه و این فرمان باید محدود باشد.`);
} catch(e){console.error('بازیابی مسیر ناموفق بود:',e instanceof Error?e.message:e);process.exitCode=1;} finally {await closeDb();}
