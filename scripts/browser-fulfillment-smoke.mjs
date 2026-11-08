// Destructive: run only against an explicitly disposable local server/database.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const base=process.env.BROWSER_TEST_BASE;
if(process.env.BROWSER_MUTATING_TEST!=='1'||!base||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)||!process.env.PLAYWRIGHT_CHROMIUM_PATH)throw Error('Explicit disposable local server and Chromium required');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});
try{
 for(const width of [320,768,1440,390]){
  const p=await browser.newPage({viewport:{width,height:900}});p.setDefaultTimeout(20000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/panel',{waitUntil:'networkidle'});if(width<1024)await p.getByRole('button',{name:'باز کردن منوی ناوبری'}).click();
  await p.getByRole('button',{name:'سفارش‌ها و مرجوعی'}).click();await p.getByRole('button',{name:'برداشت، بسته‌بندی و ارسال',exact:true}).click();
  const select=p.getByRole('combobox',{name:'انتخاب سفارش',exact:true});await select.locator('option[value="BROWSER-FULFILL-0215"]').waitFor({state:'attached'});
  for(let i=0;i<5;i++){await p.getByRole('button',{name:'سفارش‌های قدیمی‌تر'}).click();await select.locator(`option[value="BROWSER-FULFILL-${String(175-i*40).padStart(4,'0')}"]`).waitFor({state:'attached'});}
  await select.selectOption('BROWSER-FULFILL-0001');await p.getByRole('heading',{name:'BROWSER-FULFILL-0001 · آزمون انبار'}).waitFor();
  await p.getByRole('button',{name:'صفحه جدیدتر'}).click();await select.locator('option[value="BROWSER-FULFILL-0055"]').waitFor({state:'attached'});
  assert.equal(await p.getByRole('heading',{name:'BROWSER-FULFILL-0001 · آزمون انبار'}).count(),1);
  await p.getByLabel('جستجو در سفارش‌های پردازش').fill('BROWSER-FULFILL-0001');await p.getByRole('button',{name:'جستجو',exact:true}).click();await select.locator('option[value="BROWSER-FULFILL-0001"]').waitFor({state:'attached'});
  await p.getByLabel('وضعیت پردازش').selectOption('packed');await p.getByText('سفارشی برای این جستجو یا وضعیت پیدا نشد.').waitFor();
  // A late older query must not overwrite the current filter results.
  if(width===1440){
   let release;let caught;const gate=new Promise(r=>release=r),seen=new Promise(r=>caught=r);
   const handler=async route=>{const u=new URL(route.request().url());if(u.searchParams.get('search')==='LATE-QUERY'){caught();await gate;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[{id:'STALE-ORDER',customer:'old',fulfillmentStatus:'packed'}],nextCursor:null})})}else await route.continue()};
   await p.route('**/api/commerce/admin/order-page?*',handler);
   await p.getByLabel('جستجو در سفارش‌های پردازش').fill('LATE-QUERY');await p.getByRole('button',{name:'جستجو',exact:true}).click();await seen;
   await p.getByLabel('جستجو در سفارش‌های پردازش').fill('BROWSER-FULFILL-0001');await p.getByRole('button',{name:'جستجو',exact:true}).click();await p.getByText('سفارشی برای این جستجو یا وضعیت پیدا نشد.').waitFor();release();await p.waitForTimeout(300);assert.equal(await p.locator('option[value="STALE-ORDER"]').count(),0);await p.unroute('**/api/commerce/admin/order-page?*',handler);
  }
  // A selected order remains explicit and can be refreshed even outside the filter.
  await p.getByLabel('شماره دقیق سفارش').fill('BROWSER-FULFILL-0001');await p.getByRole('button',{name:'دریافت سفارش'}).click();await p.getByRole('heading',{name:'BROWSER-FULFILL-0001 · آزمون انبار'}).waitFor();
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`overflow ${width}`);
  if(width===390){
   await p.addScriptTag({path:'node_modules/axe-core/axe.min.js'});const violations=await p.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id)));assert.deepEqual(violations,[]);
   // Simulate a successful scan whose follow-up GET fails; stale state must not permit more operations.
   let failed=false;const failRefresh=async route=>{if(!failed){failed=true;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'test refresh failure'})})}else await route.continue()};
   await p.route('**/api/commerce/orders/BROWSER-FULFILL-0001',failRefresh);
   await p.getByLabel('SKU برداشت BROWSER-FULFILL-0001').fill('TEST-SKU');await p.getByRole('button',{name:'ثبت یک واحد'}).click();await p.getByText('تا تازه‌سازی موفق، عملیات غیرفعال است.',{exact:false}).waitFor();
   assert.equal(await p.getByRole('button',{name:'تأیید بسته‌بندی'}).isDisabled(),true);await p.unroute('**/api/commerce/orders/BROWSER-FULFILL-0001',failRefresh);await p.getByRole('button',{name:'تازه‌سازی سفارش انتخاب‌شده'}).click();

   await p.getByText('۱ از ۱',{exact:false}).waitFor();await p.getByLabel('اقلام و سلامت بسته را بررسی کردم.').check();await p.getByRole('button',{name:'تأیید بسته‌بندی'}).click();await p.getByText('مرحله در سفارش ثبت شد.').waitFor();
   await p.getByLabel('شرکت حمل').fill('پست');await p.getByLabel('کد رهگیری').fill('TEST-TRACK');assert.equal(await p.getByRole('button',{name:'ثبت ارسال'}).isDisabled(),true);
   await p.getByRole('button',{name:'ذخیره مشخصات ارسال'}).click();await p.getByText('مشخصات ارسال ذخیره شد.').waitFor();await p.getByRole('button',{name:'ثبت ارسال'}).click();await p.getByText('مرحله در سفارش ثبت شد.').waitFor();
   await p.getByRole('button',{name:'ثبت تحویل'}).click();await p.getByText('مرحله در سفارش ثبت شد.').waitFor();await p.getByText('وضعیت: تحویل‌شده',{exact:false}).waitFor();
  }
  assert.deepEqual(errors,[]);await p.close();console.log(`Fulfillment ${width}: OK`);
 }
}finally{await browser.close()}
