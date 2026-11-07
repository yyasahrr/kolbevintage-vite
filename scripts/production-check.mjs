#!/usr/bin/env node
// Read-only preflight. It never changes schema, starts a server or prints secrets.
import pg from 'pg';

const checks=[];
const add=(id,ok,detail,severity='blocker')=>checks.push({id,status:ok?'ok':severity,detail});
const httpsUrl=value=>{try {const u=new URL(value);return u.protocol==='https:' && !!u.hostname && !['localhost','127.0.0.1','::1'].includes(u.hostname);}catch{return false;}};
add('production_mode',process.env.NODE_ENV==='production','NODE_ENV باید production باشد.');
add('review_mode',process.env.PANEL_OPEN_ACCESS!=='1','حالت دسترسی باز پنل باید خاموش باشد.');
add('database_url',Boolean(process.env.DATABASE_URL),'پایگاه داده مدیریت‌شده و دائمی باید با DATABASE_URL تنظیم شود.');
add('public_https',httpsUrl(process.env.PUBLIC_BASE_URL),'نشانی عمومی HTTPS فروشگاه باید تنظیم شود.');
add('superadmin_secret',(process.env.SUPERADMIN_PASSCODE||'').length>=12,'رمز جداگانه Superadmin باید حداقل ۱۲ نویسه باشد.');
add('trusted_proxy',Boolean(process.env.TRUST_PROXY),'در صورت استفاده از پراکسی، فقط نشانی‌های مورد اعتماد در TRUST_PROXY مشخص شوند.','warning');
add('backup_cloud',httpsUrl(process.env.BACKUP_CLOUD_ENDPOINT)&&Boolean(process.env.BACKUP_CLOUD_TOKEN),'مقصد امن و مجوز ذخیره پشتیبان بیرونی باید تنظیم و آزموده شود.');
// These are deliberately hard blockers, not switches that can be asserted by
// environment variables. They need implemented and verified integrations.
add('payment_provider',false,'درگاه اختصاصی، تبدیل واحد و تسویه واقعی هنوز پیاده‌سازی/تأیید نشده است؛ پرداخت تولیدی مسدود است.');
add('customer_registration',false,'ثبت‌نام و ورود OTP تا اتصال احراز هویت تأییدشده غیرفعال است.');
add('outbox_delivery',false,'ارسال واقعی اعلان‌های صف هنوز متصل نشده است.');
add('media_storage',false,'پشتیبان و بازیابی فایل‌های آپلودشده و ذخیره‌سازی پایدار هنوز تأیید نشده است.');
add('restore_rehearsal',false,'آزمون بازیابی روی زیرساخت مستقل و پذیرش عملیاتی هنوز لازم است.');
add('storefront_content',false,'محتوای واقعی ویترین و مسیر امن انتشار هنوز نیازمند تکمیل و تأیید است.');
add('security_and_browser_acceptance',false,'ممیزی امنیت مستقل و آزمون مرورگری/پذیرش کاربران هنوز لازم است.');
if (process.env.DATABASE_URL) {
  const client=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:5000,statement_timeout:5000});
  try {
    await client.connect();
    const docs=await client.query("select key,value from state_documents where key in ('admin','ops')");
    const admin=docs.rows.find(r=>r.key==='admin')?.value;
    add('store_documents',docs.rows.length===2,'اسناد admin و ops باید عمداً برای فروشگاه آماده شوند.');
    const ops=docs.rows.find(r=>r.key==='ops')?.value;
    add('storefront_setup',ops?.siteUnderSetup === false,'وضعیت آماده‌سازی باید صریحاً پس از تأیید انتشار تعیین شود.');
    add('owner_hash',typeof admin?.settings?.passcodeHash==='string' && admin.settings.passcodeHash.startsWith('scrypt$'),'رمز مالک باید هش‌شده باشد؛ رمز قدیمی قوی در نخستین ورود تولیدی به هش مهاجرت می‌کند.');
    const demo=await client.query("select (select count(*)::int from customers where email='ava@example.com') as customers,(select count(*)::int from products where is_base=true) as base_products");
    add('demo_data',demo.rows[0].customers===0 && demo.rows[0].base_products===0,'حساب و محصولات پایه نمونه باید پیش از راه‌اندازی بررسی و جایگزین شوند.');
  } catch {
    add('database_read',false,'خواندن وضعیت پایگاه داده ناموفق بود؛ اتصال، دسترسی و ساختار را بررسی کنید.');
  } finally {await client.end().catch(()=>{});}
}
const ok=checks.every(c=>c.status!=='blocker');
console.log(JSON.stringify({ready:ok,checks},null,2));
process.exitCode=ok?0:1;
