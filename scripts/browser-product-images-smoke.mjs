/** Mutates catalogue: only use a disposable seeded DB and local server.
 * PRODUCT_IMAGES_SMOKE_ALLOW_MUTATIONS=1 BROWSER_TEST_BASE=http://127.0.0.1:8099
 * PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium node scripts/browser-product-images-smoke.mjs */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const base=process.env.BROWSER_TEST_BASE;
if(process.env.PRODUCT_IMAGES_SMOKE_ALLOW_MUTATIONS!=='1'||!base||!['localhost','127.0.0.1','::1'].includes(new URL(base).hostname))throw new Error('Requires opt-in and a disposable local database.');
if(!process.env.PLAYWRIGHT_CHROMIUM_PATH)throw new Error('PLAYWRIGHT_CHROMIUM_PATH is required.');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});const ctx=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce'});const errors=[];
try {
  const setup=await ctx.newPage();await setup.goto(`${base}/panel`,{waitUntil:'domcontentloaded'});
  const id=await setup.evaluate(async()=>{const cats=await (await fetch('/api/admin/categories')).json();const category=cats.find(c=>c.active)?.name;const csrf=await (await fetch('/api/csrf')).json();const res=await fetch('/api/admin/products',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf.token},body:JSON.stringify({name:`تصویر آزمون ${Date.now()}`,category,garment:'coat',price:100,colorName:'مشکی',colorHex:'#111111',sizes:['M'],imageUrl:'https://example.com/one.jpg'})});if(!res.ok)throw new Error(await res.text());return (await res.json()).id});await setup.close();
  async function editor(){const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(`${base}/panel`,{waitUntil:'domcontentloaded'});await p.getByRole('button',{name:'باز کردن منوی ناوبری'}).click();await p.getByRole('button',{name:'محصولات بخشی متصل',exact:true}).click();await p.getByRole('searchbox',{name:'جستجو در محصولات'}).fill(id);await p.getByRole('button',{name:'ویرایش',exact:true}).click();await p.getByRole('dialog',{name:'ویرایش محصول'}).waitFor();return p}
  const p=await editor(),stale=await editor();const images=p.getByRole('region',{name:'مدیریت تصاویر محصول'});const staleImages=stale.getByRole('region',{name:'مدیریت تصاویر محصول'});
  await images.getByLabel('یا نشانی HTTPS تصویر جدید').fill('https://example.com/two.jpg');await images.getByRole('button',{name:'افزودن تصویر'}).click();await images.getByRole('button',{name:'ذخیره تصویر 2'}).waitFor();
  await images.getByLabel('نقش تصویر 2').selectOption('main');await images.getByLabel('رنگ تصویر 2').selectOption('c1');await images.getByRole('button',{name:'ذخیره تصویر 2'}).click();await images.getByRole('status').getByText('تغییر تصویر ذخیره شد.').waitFor();
  await images.getByRole('button',{name:'تصویر 2 بالاتر'}).click();await images.getByLabel('نقش تصویر 1').waitFor();
  await staleImages.getByLabel('یا نشانی HTTPS تصویر جدید').fill('https://example.com/stale.jpg');await staleImages.getByRole('button',{name:'افزودن تصویر'}).click();await staleImages.getByRole('alert').getByText(/تصاویر هم‌زمان تغییر کرده‌اند/).waitFor();
  const list=await p.evaluate(async id=>(await (await fetch(`/api/products/${encodeURIComponent(id)}`)).json()).images,id);
  assert.equal(list.length,2);assert.equal(list[0].url,'https://example.com/two.jpg');assert.equal(list[0].role,'main');assert.equal(list[0].colorId,'c1');assert.equal(list[1].role,'gallery');
  for(const width of [320,390,768,1440]){await p.setViewportSize({width,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);assert.ok(await p.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),`dialog overflow ${width}`)}
  await p.setViewportSize({width:390,height:900});await p.addScriptTag({path:'node_modules/axe-core/axe.min.js'});const violations=await p.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>v.impact==='serious'||v.impact==='critical').map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))));assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);
  console.log('Product images: add, edit, order, stale conflict, four widths and axe passed.');
}finally{await browser.close()}
