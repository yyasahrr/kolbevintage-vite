/* Read-only browser smoke: requires a running non-production preview and Chromium.
 * BROWSER_TEST_BASE=http://127.0.0.1:8080 PLAYWRIGHT_CHROMIUM_PATH=/tmp/chromium node scripts/browser-stock-label-smoke.mjs */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base=process.env.BROWSER_TEST_BASE || 'http://127.0.0.1:8080';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH, args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[],writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/') && !['GET','HEAD'].includes(request.method()))writes.push(`${request.method()} ${request.url()}`)});
  await page.goto(`${base}/panel`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'انبار و موجودی کالا',exact:true}).click();
  await page.getByRole('button',{name:'چاپ لیبل انبار',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'چاپ لیبل انبار'});
  await dialog.waitFor();
  const rows=dialog.locator('li');
  assert.ok(await rows.count()>=2,'at least two variants required in the preview database');
  const first=rows.nth(0),second=rows.nth(1);
  const input1=first.locator('input[type=number]'),input2=second.locator('input[type=number]');
  const sku1=(await input1.getAttribute('aria-label')).replace('تعداد لیبل ','');
  const sku2=(await input2.getAttribute('aria-label')).replace('تعداد لیبل ','');
  await first.locator('input[type=checkbox]').check();await input1.fill('2');
  await second.locator('input[type=checkbox]').check();await input2.fill('3');
  assert.match(await dialog.innerText(),/۵ لیبل/);
  const [popup]=await Promise.all([page.waitForEvent('popup'),dialog.getByRole('button',{name:'پیش‌نمایش و چاپ'}).click()]);
  await popup.locator('.label').first().waitFor();
  assert.equal(await popup.locator('.label').count(),5);
  const skus=await popup.locator('.sku').allTextContents();
  assert.equal(skus.filter(s=>s===sku1).length,2);assert.equal(skus.filter(s=>s===sku2).length,3);
  assert.equal(await popup.locator('.label svg').count(),5);assert.equal(await popup.locator('.label img[src^="data:image/png"]').count(),5);
  await popup.close();
  await input1.fill('500');await input2.fill('1');
  await dialog.getByRole('button',{name:'پیش‌نمایش و چاپ'}).click();
  assert.match(await dialog.getByRole('alert').innerText(),/مجموع لیبل‌ها/);
  await input1.fill('1');await input2.fill('0');
  await dialog.getByLabel('نوع کاغذ').selectOption('roll');
  const [roll]=await Promise.all([page.waitForEvent('popup'),dialog.getByRole('button',{name:'پیش‌نمایش و چاپ'}).click()]);
  await roll.locator('.label').first().waitFor();assert.equal(await roll.locator('.label').count(),1);
  assert.match(await roll.locator('style').innerText(),/break-after:page/);await roll.close();
  const search=dialog.getByLabel('جستجوی محصول، رنگ، سایز یا SKU');
  await search.fill(sku2);await dialog.getByLabel(/انتخاب همه نتایج جستجو/).uncheck();
  await search.fill('');assert.equal(await first.locator('input[type=checkbox]').isChecked(),true);assert.equal(await second.locator('input[type=checkbox]').isChecked(),false);
  await dialog.getByRole('button',{name:'بستن',exact:true}).click();
  await page.getByRole('button',{name:'موجودی کالا و هشدارها',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'انتخاب و چاپ لیبل‌ها'}).count(),1);
  await page.locator('button[aria-expanded]').last().click();
  await page.getByRole('button',{name:'چاپ لیبل',exact:true}).first().click();
  assert.equal(await page.getByRole('dialog',{name:'چاپ لیبل انبار'}).locator('li input[type=checkbox]:checked').count(),1);
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  console.log(`OK batch ${sku1} × ۲ + ${sku2} × ۳, selection/filter, limit, roll, single action; no API writes`);
} finally {await browser.close();}
