/** Run only against an isolated seeded database with 205 draft fixtures named
 * browser-fixture-1..205, never a live store. This test opens the preview-mode panel.
 * JOURNAL_SMOKE_ALLOW_DISPOSABLE=1 BROWSER_TEST_BASE=http://127.0.0.1:4001
 * PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium node scripts/browser-journal-pagination-smoke.mjs */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const base=process.env.BROWSER_TEST_BASE;
if(process.env.JOURNAL_SMOKE_ALLOW_DISPOSABLE!=='1'||!base||!['127.0.0.1','localhost','::1'].includes(new URL(base).hostname))throw new Error('Requires explicit opt-in and a disposable local test database.');
if(!process.env.PLAYWRIGHT_CHROMIUM_PATH)throw new Error('PLAYWRIGHT_CHROMIUM_PATH is required.');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(`${base}/panel`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'محتوا و ظاهر سایت',exact:true}).click();
  await page.getByRole('button',{name:/بلاگ و محتوای ویدیویی/}).click();
  await page.getByRole('button',{name:'مقالات قدیمی‌تر'}).waitFor();
  assert.equal(await page.getByRole('button',{name:/مقاله مرورگر /}).count(),200);
  await page.getByRole('button',{name:'مقالات قدیمی‌تر'}).click();
  await page.getByRole('button',{name:/مقاله مرورگر 205/}).waitFor();
  assert.equal(await page.getByRole('button',{name:/مقاله مرورگر /}).count(),205);
  assert.equal(await page.getByRole('button',{name:'مقالات قدیمی‌تر'}).count(),0);
  for(const width of [320,390,768,1440]){
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
  }
  await page.setViewportSize({width:390,height:900});await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
  const violations=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>v.impact==='serious'||v.impact==='critical').map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))));
  assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);
  console.log('Journal admin pagination: 205 actual drafts, 200 + 5 pages, four widths and axe passed.');
} finally {await browser.close()}
