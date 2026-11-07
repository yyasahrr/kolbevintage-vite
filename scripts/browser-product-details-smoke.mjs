/** DESTRUCTIVE test: edits the first product. Use a disposable seeded database only.
 * PRODUCT_SMOKE_ALLOW_MUTATIONS=1 BROWSER_TEST_BASE=http://127.0.0.1:8099
 * PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium node scripts/browser-product-details-smoke.mjs */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const base=process.env.BROWSER_TEST_BASE;
if(process.env.PRODUCT_SMOKE_ALLOW_MUTATIONS!=='1'||!base||!['localhost','127.0.0.1','::1'].includes(new URL(base).hostname))throw new Error('Requires opt-in and a disposable local database.');
if(!process.env.PLAYWRIGHT_CHROMIUM_PATH)throw new Error('PLAYWRIGHT_CHROMIUM_PATH is required.');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce'});
const errors=[];
async function openEditor(){const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(`${base}/panel`,{waitUntil:'networkidle'});await p.getByRole('button',{name:'باز کردن منوی ناوبری'}).click();await p.getByRole('button',{name:'محصولات بخشی متصل',exact:true}).click();await p.getByRole('button',{name:'ویرایش',exact:true}).first().click();await p.getByRole('dialog',{name:'ویرایش محصول'}).waitFor();return p;}
try {
  const first=await openEditor();const stale=await openEditor();const material=`پشم آزمایشی ${Date.now()}`;
  const dialog=first.getByRole('dialog',{name:'ویرایش محصول'});
  for(const width of [320,390,768,1440]){await first.setViewportSize({width,height:900});assert.ok(await first.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),`dialog overflow at ${width}`)}
  await first.setViewportSize({width:390,height:900});await first.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
  const violations=await first.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>v.impact==='serious'||v.impact==='critical').map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))));assert.deepEqual(violations,[]);
  await dialog.getByLabel('قیمت پایه (واحد پایه فروشگاه)').fill('100');
  await dialog.getByLabel('قیمت مقایسه‌ای (اختیاری)').fill('200');
  await dialog.getByLabel('جنس و پارچه').fill(material);await dialog.getByLabel('راهنمای نگهداری').fill('خشکشویی');await dialog.getByLabel('فرم و فیت').fill('آزاد');await dialog.getByLabel('محل ساخت').fill('ایران');
  const saved=first.waitForResponse(r=>r.request().method()==='PATCH'&&/\/api\/admin\/products\/[^/]+$/.test(new URL(r.url()).pathname));await dialog.getByRole('button',{name:'ذخیره تغییرات'}).click();const response=await saved;assert.equal(response.status(),200,await response.text());const productId=decodeURIComponent(new URL(response.url()).pathname.split('/').pop());
  await dialog.waitFor({state:'hidden'});
  const staleDialog=stale.getByRole('dialog',{name:'ویرایش محصول'});await staleDialog.getByLabel('جنس و پارچه').fill('تغییر قدیمی');await staleDialog.getByRole('button',{name:'ذخیره تغییرات'}).click();await staleDialog.getByRole('alert').getByText(/محصول هم‌زمان تغییر کرده است/).waitFor();
  const detail=await first.evaluate(async id=>{const r=await fetch(`/api/products/${encodeURIComponent(id)}`);return r.json()},productId);assert.equal(detail.price,100);assert.equal(detail.compareAt,200);assert.equal(detail.material,material);assert.equal(detail.care,'خشکشویی');assert.equal(detail.fit,'آزاد');assert.equal(detail.origin,'ایران');
  await first.getByRole('searchbox',{name:'جستجو در محصولات'}).fill(productId);await first.getByRole('button',{name:'ویرایش',exact:true}).first().click();const reopened=first.getByRole('dialog',{name:'ویرایش محصول'});assert.equal(await reopened.getByLabel('جنس و پارچه').inputValue(),material);assert.equal(await reopened.getByLabel('قیمت مقایسه‌ای (اختیاری)').inputValue(),'200');
  assert.deepEqual(errors,[]);console.log('Product editor: four widths, axe, persistence and stale concurrent edit passed.');
} finally {await browser.close()}
