/** Mutating integration test: use only an isolated local database and explicit opt-in. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const base=process.env.BROWSER_TEST_BASE;
if(process.env.STUDIO_SMOKE_ALLOW_MUTATIONS!=='1'||!base||!['127.0.0.1','localhost','::1'].includes(new URL(base).hostname)||!process.env.PLAYWRIGHT_CHROMIUM_PATH)throw new Error('Use a disposable local database and explicit opt-in.');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});
const ctx=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce'});const errors=[];const draftName=`طراحی آزمایشی ${Date.now()}`;
try{
 const a=await ctx.newPage();a.on('pageerror',e=>errors.push(e.message));await a.goto(`${base}/panel/appearance/studio`,{waitUntil:'domcontentloaded'});
 const studio=a.getByRole('region',{name:'استودیو پیش‌نویس'});await studio.getByRole('heading',{name:'آزمایشگاه صفحه‌ساز · پیش‌نویس'}).waitFor();
 await studio.getByLabel('عنوان پیش‌نویس جدید').fill(draftName);await studio.getByRole('button',{name:'ساخت پیش‌نویس'}).click();await studio.getByRole('status').getByText(/ساخته شد/).waitFor();
 await studio.getByRole('button',{name:'افزودن هیرو'}).click();await studio.getByRole('button',{name:'افزودن بنر'}).click();await studio.getByRole('button',{name:'افزودن متن'}).click();const hero=studio.locator('article').nth(0);await hero.getByLabel('عنوان',{exact:true}).fill('هیرو ویژه مرورگر');await hero.getByLabel('متن',{exact:true}).fill('تغییر فوری');await hero.getByLabel('نشانی تصویر HTTPS یا فایل فروشگاه').fill('javascript:alert(1)');assert.equal(await studio.locator('img').count(),0);await hero.getByLabel('نشانی تصویر HTTPS یا فایل فروشگاه').fill('');assert.ok(await studio.getByText('هیرو ویژه مرورگر',{exact:true}).count()>0);
 await studio.getByRole('button',{name:'بردن بخش متن 3 به بالا'}).click();assert.match(await studio.locator('article').nth(1).textContent(),/بخش متن/);
 await studio.getByRole('button',{name:'ذخیره پیش‌نویس'}).click();await studio.getByRole('status').getByText(/سایت عمومی تغییر نکرد/).waitFor();
 const b=await ctx.newPage();b.on('pageerror',e=>errors.push(e.message));await b.goto(`${base}/panel/appearance/studio`,{waitUntil:'domcontentloaded'});const sb=b.getByRole('region',{name:'استودیو پیش‌نویس'});await sb.getByLabel('انتخاب پیش‌نویس استودیو').selectOption({label:`${draftName} · نسخه 1`});assert.equal(await sb.locator('article').count(),3);
 await studio.getByLabel('عنوان صفحه').fill('نسخه تازه');await studio.getByRole('button',{name:'ذخیره پیش‌نویس'}).click();await studio.getByRole('status').getByText(/سایت عمومی تغییر نکرد/).waitFor();await sb.getByLabel('عنوان صفحه').fill('نسخه قدیمی');await sb.getByRole('button',{name:'ذخیره پیش‌نویس'}).click();await sb.getByRole('alert').getByText(/هم‌زمان تغییر کرده/).waitFor();
 b.once('dialog',d=>d.accept());await sb.getByRole('button',{name:'تازه‌سازی پیش‌نویس‌ها'}).click();await sb.getByRole('status').getByText(/فهرست تازه شد/).waitFor();assert.equal(await sb.getByLabel('عنوان صفحه').inputValue(),'نسخه تازه');
 await studio.getByRole('button',{name:'کشیدن بنر تبلیغاتی 3'}).dragTo(studio.locator('article').nth(0));assert.match(await studio.locator('article').nth(0).textContent(),/بنر تبلیغاتی/);await studio.getByRole('button',{name:'ذخیره پیش‌نویس'}).click();await studio.getByRole('status').getByText(/سایت عمومی تغییر نکرد/).waitFor();
 for(const width of [320,390,768,1440]){await a.setViewportSize({width,height:900});assert.ok(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`)}
 await a.setViewportSize({width:390,height:900});await a.addScriptTag({path:'node_modules/axe-core/axe.min.js'});const issues=await a.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>v.impact==='serious'||v.impact==='critical').map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))));assert.deepEqual(issues,[]);
 const publicBody=await (await ctx.request.get(`${base}/api/bootstrap`)).text();assert.ok(!publicBody.includes('هیرو ویژه مرورگر'));assert.deepEqual(errors,[]);console.log('Studio: create, immediate preview, keyboard and drag reorder, persistence, conflict, public isolation, four widths and axe passed.');
}finally{await browser.close()}
