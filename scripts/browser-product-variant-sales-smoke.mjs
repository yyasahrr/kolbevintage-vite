/** Mutates catalogue and stock: use only a disposable seeded database.
 * VARIANT_SMOKE_ALLOW_MUTATIONS=1 BROWSER_TEST_BASE=http://127.0.0.1:8099
 * BROWSER_TEST_DATABASE_URL=postgresql://.../kv_variant_ui_test
 * PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium node scripts/browser-product-variant-sales-smoke.mjs */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import pg from 'pg';
const base=process.env.BROWSER_TEST_BASE,dbUrl=process.env.BROWSER_TEST_DATABASE_URL;
if(process.env.VARIANT_SMOKE_ALLOW_MUTATIONS!=='1'||!base||!dbUrl||!['127.0.0.1','localhost','::1'].includes(new URL(base).hostname)||!new URL(dbUrl).pathname.startsWith('/kv_variant_ui_'))throw new Error('Requires opt-in and a disposable local test database.');
if(!process.env.PLAYWRIGHT_CHROMIUM_PATH)throw new Error('PLAYWRIGHT_CHROMIUM_PATH is required.');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});const ctx=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce'});const errors=[];
try{
  const setup=await ctx.newPage();await setup.goto(`${base}/panel`,{waitUntil:'domcontentloaded'});
  const id=await setup.evaluate(async()=>{const categories=await (await fetch('/api/admin/categories')).json();const csrf=await (await fetch('/api/csrf')).json();const headers={'content-type':'application/json','x-csrf-token':csrf.token};let r=await fetch('/api/admin/products',{method:'POST',headers,body:JSON.stringify({name:`تنوع آزمون ${Date.now()}`,category:categories.find(c=>c.active)?.name,garment:'coat',price:100,colorName:'مشکی',colorHex:'#111111',sizes:['M','L'],imageUrl:'https://example.com/one.jpg'})});if(!r.ok)throw new Error(await r.text());const id=(await r.json()).id;r=await fetch(`/api/admin/products/${encodeURIComponent(id)}`,{method:'PATCH',headers,body:JSON.stringify({active:true})});if(!r.ok)throw new Error(await r.text());return id});
  const db=new pg.Client({connectionString:dbUrl});await db.connect();const vars=await db.query('update product_variants set on_hand=5 where product_id=$1 returning id,color_id,size_id',[id]);await db.end();assert.equal(vars.rowCount,2);await setup.close();
  async function editor(){const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(`${base}/panel`,{waitUntil:'domcontentloaded'});await p.getByRole('button',{name:'باز کردن منوی ناوبری'}).click();await p.getByRole('button',{name:'محصولات بخشی متصل',exact:true}).click();await p.getByRole('searchbox',{name:'جستجو در محصولات'}).fill(id);await p.getByRole('button',{name:'ویرایش',exact:true}).click();await p.getByRole('button',{name:'توقف فروش مشکی M'}).waitFor();return p}
  const first=await editor(),second=await editor();const region=first.getByRole('region',{name:'وضعیت فروش تنوع‌ها'}),stale=second.getByRole('region',{name:'وضعیت فروش تنوع‌ها'});
  for(const width of [320,390,768,1440]){await first.setViewportSize({width,height:900});assert.ok(await first.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);assert.ok(await first.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth),`dialog overflow ${width}`)}
  await first.setViewportSize({width:390,height:900});await first.addScriptTag({path:'node_modules/axe-core/axe.min.js'});const violations=await first.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>v.impact==='serious'||v.impact==='critical').map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))));assert.deepEqual(violations,[]);
  await region.getByRole('button',{name:'توقف فروش مشکی M'}).click();await region.getByRole('button',{name:'فعال کردن فروش مشکی M'}).waitFor();
  await stale.getByRole('button',{name:'توقف فروش مشکی M'}).click();await stale.getByRole('alert').getByText(/وضعیت فروش تنوع تغییر کرده است/).waitFor();
  const details=await first.evaluate(async id=>{const [v,p]=await Promise.all([fetch(`/api/admin/products/${encodeURIComponent(id)}/variant-sales`).then(r=>r.json()),fetch(`/api/products/${encodeURIComponent(id)}`).then(r=>r.json())]);return {v,p}},id);
  const paused=details.v.find(v=>v.sizeLabel==='M'),other=details.v.find(v=>v.sizeLabel==='L');const key=vars.rows.find(v=>v.id===paused.id);assert.equal(paused.saleEnabled,false);assert.equal(other.saleEnabled,true);assert.equal(details.p.stock[`${key.color_id}:${key.size_id}`],0);
  await region.getByRole('button',{name:'فعال کردن فروش مشکی M'}).click();await region.getByRole('button',{name:'توقف فروش مشکی M'}).waitFor();
  const refreshed=await first.evaluate(async id=>(await (await fetch(`/api/products/${encodeURIComponent(id)}`)).json()).stock,id);assert.equal(refreshed[`${key.color_id}:${key.size_id}`],5);
  assert.deepEqual(errors,[]);console.log('Variant sales: real panel pause/resume, stale conflict, public stock, four widths and axe passed.');
}finally{await browser.close()}
