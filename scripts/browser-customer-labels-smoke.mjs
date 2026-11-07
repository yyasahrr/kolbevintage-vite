/* MUTATES customers and label definitions. Only use against a disposable local database.
 * CUSTOMER_LABEL_SMOKE_ALLOW_MUTATIONS=1 BROWSER_TEST_BASE=http://127.0.0.1:8099 PLAYWRIGHT_CHROMIUM_PATH=/tmp/chromium node scripts/browser-customer-labels-smoke.mjs */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
if(process.env.CUSTOMER_LABEL_SMOKE_ALLOW_MUTATIONS!=='1')throw new Error('Opt-in required; use a disposable local database.');
const base=process.env.BROWSER_TEST_BASE;
if(!base || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw new Error('A disposable local preview URL is required.');
const b=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});
try{
 const p=await b.newPage({viewport:{width:1280,height:850}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(`${base}/panel`,{waitUntil:'networkidle'});await p.getByRole('button',{name:'بازاریابی و مشتریان',exact:true}).click();await p.getByRole('button',{name:/مشتریان و گروه‌بندی CRM/}).click();
 const nonce=Date.now().toString(),manual=`دستی ${nonce}`,automatic=`خودکار ${nonce}`;
 await p.getByLabel('نام برچسب').fill(manual);await p.getByRole('button',{name:'ساخت برچسب'}).click();await p.getByRole('status').filter({hasText:'برچسب ساخته شد'}).waitFor();
 await p.getByLabel('نام برچسب').fill(automatic);await p.getByLabel('اختصاص خودکار بر اساس تعداد سفارش تحویل‌شده').check();await p.getByLabel('حداقل تعداد سفارش').fill('2');await p.getByRole('button',{name:'ساخت برچسب'}).click();await p.getByText(automatic,{exact:false}).first().waitFor();
 await p.getByRole('button',{name:`ویرایش ${automatic}`}).click();await p.getByLabel('حداقل تعداد سفارش').fill('1');await p.getByRole('button',{name:'ذخیره تعریف'}).click();await p.getByRole('status').filter({hasText:'تعریف برچسب به‌روز شد'}).waitFor();
 const row=p.locator('tr').filter({hasText:'ava@example.com'});await row.getByRole('button',{name:'ویرایش برچسب دستی'}).click();const editor=p.getByRole('region',{name:'ویرایش برچسب‌های دستی مشتری'});await editor.getByLabel(manual,{exact:true}).check();await editor.getByRole('button',{name:'ذخیره برچسب‌ها'}).click();await p.getByRole('status').filter({hasText:'برچسب‌های دستی ذخیره شدند'}).waitFor();assert.match(await row.innerText(),new RegExp(manual));
 const audience=p.locator('section').filter({has:p.getByRole('heading',{name:'پیش‌نمایش مخاطب'})});await audience.getByLabel(manual,{exact:true}).check();await audience.getByLabel(automatic,{exact:true}).check();await audience.getByLabel('نحوه تطبیق').selectOption('any');await audience.getByRole('button',{name:'محاسبه مخاطب'}).click();await audience.getByText(/مشتری مطابق با انتخاب فعلی/).waitFor();assert.match(await audience.innerText(),/ava@example.com/);
 await audience.getByLabel('نحوه تطبیق').selectOption('all');await audience.getByRole('button',{name:'محاسبه مخاطب'}).click();await audience.getByText(/مشتری مطابق با انتخاب فعلی/).waitFor();assert.doesNotMatch(await audience.innerText(),/ava@example.com/);
 for(const width of [320,390,768,1280]){await p.setViewportSize({width,height:850});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`overflow ${width}`)}
 await p.setViewportSize({width:390,height:850});await p.addScriptTag({path:'node_modules/axe-core/axe.min.js'});const violations=await p.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))));assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);
 console.log('OK create, edit, manual assignment, any/all audience, four widths and axe; isolated database only');
}finally{await b.close()}
