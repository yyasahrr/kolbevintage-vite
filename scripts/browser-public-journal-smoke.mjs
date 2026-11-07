/** Mutates journal visibility; only run on an isolated seeded database with
 * 105 public-fixture-N published articles and the journal enabled.
 * PUBLIC_JOURNAL_SMOKE_ALLOW_MUTATIONS=1 BROWSER_TEST_BASE=http://127.0.0.1:8099
 * PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium node scripts/browser-public-journal-smoke.mjs */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const base=process.env.BROWSER_TEST_BASE;
if(process.env.PUBLIC_JOURNAL_SMOKE_ALLOW_MUTATIONS!=='1'||!base||!['127.0.0.1','localhost','::1'].includes(new URL(base).hostname))throw new Error('Requires explicit opt-in and a disposable local test database.');
if(!process.env.PLAYWRIGHT_CHROMIUM_PATH)throw new Error('PLAYWRIGHT_CHROMIUM_PATH is required.');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:900},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(`${base}/#/journal`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'مقالات قدیمی‌تر'}).waitFor();
  assert.equal(await page.locator('a[href^="#/journal/public-fixture-"]').count(),101);
  await page.getByRole('button',{name:'مقالات قدیمی‌تر'}).click();
  await page.locator('a[href="#/journal/public-fixture-105"]').waitFor();
  assert.equal(await page.locator('a[href^="#/journal/public-fixture-"]').count(),5);
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`)}
  await page.setViewportSize({width:390,height:900});await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
  const violations=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>v.impact==='serious'||v.impact==='critical').map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))));
  assert.deepEqual(violations,[]);
  await page.getByRole('button',{name:'صفحهٔ قبل'}).click();await page.getByRole('button',{name:'مقالات قدیمی‌تر'}).waitFor();
  assert.equal(await page.locator('a[href^="#/journal/public-fixture-"]').count(),101);
  await page.getByRole('button',{name:'مقالات قدیمی‌تر'}).click();await page.locator('a[href="#/journal/public-fixture-105"]').waitFor();
  await page.evaluate(async()=>{const csrf=await (await fetch('/api/csrf')).json();const r=await fetch('/api/admin/journal-settings',{method:'PATCH',headers:{'content-type':'application/json','x-csrf-token':csrf.token},body:JSON.stringify({enabled:false,expectedEnabled:true})});if(!r.ok)throw new Error('disable failed')});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.getByText('ژورنال فعلاً خاموش است').waitFor();
  assert.equal(await page.locator('a[href^="#/journal/public-fixture-"]').count(),0);
  assert.deepEqual(errors,[]);
  console.log('Public journal pagination: 100 + 5, previous/next, disabling, four widths and axe passed.');
} finally {await browser.close()}
