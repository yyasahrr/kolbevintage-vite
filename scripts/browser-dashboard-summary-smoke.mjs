// Read-only browser test. Requires a local disposable server with 215 fixtures
// described in docs/production-readiness-fa.md. It simulates HTTP failures.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const base=process.env.BROWSER_TEST_BASE;
if(!base||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)||!process.env.PLAYWRIGHT_CHROMIUM_PATH)throw Error('Use a local disposable server and Chromium');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});
try {
 for(const width of [320,390,768,1440]){
  const p=await browser.newPage({viewport:{width,height:900}});p.setDefaultTimeout(15000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  let shouldFail=width===390;
  const handler=async route=>{if(shouldFail){shouldFail=false;await route.fulfill({status:503,contentType:'application/json',body:'{"error":"test failure"}'})}else await route.continue()};
  await p.route('**/api/commerce/admin/order-summary',handler);
  await p.goto(base+'/panel',{waitUntil:'networkidle'});
  const card=(name)=>p.getByRole('button',{name:new RegExp(name)});
  if(width===390){await p.getByText('دریافت شاخص‌های سفارش ناموفق بود.').waitFor();assert.match(await card('سفارش‌های ثبت‌شده').innerText(),/—/);await p.getByRole('button',{name:'تلاش دوباره',exact:true}).click();}
  await p.getByRole('button',{name:/سفارش‌های ثبت‌شده.*۲۱۵/}).waitFor();
  for(const [name,value] of [['در انتظار آماده‌سازی','۲۱۰'],['در مرحله برداشت','۱'],['آماده ارسال','۱'],['مغایرت‌های سفارش','۱']])assert.match(await card(name).innerText(),new RegExp(value));
  if(width===1440){
    await p.unroute('**/api/commerce/admin/order-summary',handler);
    let release,seen;const gate=new Promise(r=>release=r),caught=new Promise(r=>seen=r);let first=true;
    const delay=async route=>{if(first){first=false;seen();await gate;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({total:999,awaiting:999,picking:999,packed:999,exception:999})})}else await route.continue()};
    await p.route('**/api/commerce/admin/order-summary',delay);await p.getByRole('button',{name:'به‌روزرسانی'}).click();await caught;
    await p.getByRole('button',{name:'به‌روزرسانی'}).click();await p.getByRole('button',{name:/سفارش‌های ثبت‌شده.*۲۱۵/}).waitFor();release();await p.waitForTimeout(300);assert.doesNotMatch(await card('سفارش‌های ثبت‌شده').innerText(),/۹۹۹/);await p.unroute('**/api/commerce/admin/order-summary',delay);
  }
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`overflow ${width}`);
  if(width===390){await p.addScriptTag({path:'node_modules/axe-core/axe.min.js'});const violations=await p.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id)));assert.deepEqual(violations,[]);}
  assert.deepEqual(errors,[]);await p.close();console.log(`Dashboard summary ${width}: OK`);
 }
}finally{await browser.close()}
