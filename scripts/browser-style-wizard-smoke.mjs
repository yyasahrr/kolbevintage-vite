// Read-only catalogue checks; board and wizard state live only in this browser context.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const base = process.env.BROWSER_TEST_BASE, executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
if (!base || !['127.0.0.1','localhost','::1'].includes(new URL(base).hostname) || !executablePath) throw Error('Use a local test server and Chromium.');
const browser = await chromium.launch({executablePath,args:['--no-sandbox']});
const errors=[];
async function axe(page) {
  await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
  return page.evaluate(() => window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))));
}
try {
  for (const width of [320,390,768,1024,1440]) {
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/#/style-builder`,{waitUntil:'networkidle'});
    if(width<768) await page.getByRole('button',{name:'محصولات',exact:true}).click();
    const tray=page.getByRole('region',{name:'محصولات برای بوم'});
    assert.ok(await tray.isVisible());
    assert.ok(await tray.locator('.sb-tray-card').count()>0);
    const search=tray.getByRole('textbox',{name:'جست‌وجوی محصول'});
    await search.fill('نامِ غیرممکن xyz');
    assert.ok(await tray.getByText('قطعه‌ای با این فیلتر پیدا نشد.').isVisible());
    await tray.getByRole('button',{name:'پاک کردن فیلترها'}).click();
    assert.ok(await tray.locator('.sb-tray-card').count()>0);
    await tray.getByRole('button',{name:'فقط موجودها'}).click();
    assert.equal(await tray.getByRole('button',{name:'فقط موجودها'}).getAttribute('aria-pressed'),'true');
    await tray.getByRole('button',{name:'فقط موجودها'}).click();
    await tray.getByRole('button',{name:'تصویر بوم'}).click();
    const visibleCount=await tray.locator('.sb-tray-card').count();
    if(visibleCount) assert.equal(await tray.getByText('بدون تصویر بوم').count(),0);
    await tray.getByRole('button',{name:'تصویر بوم'}).click();
    assert.deepEqual(await axe(page),[],`tray axe ${width}`);
    if(width<768) { await tray.getByRole('button',{name:'بستن محصولات'}).click(); assert.equal(await tray.isVisible(),false); }
    await page.getByRole('tab',{name:'دستیار استایل'}).click();
    assert.ok(await page.getByRole('progressbar',{name:'پیشرفت دستیار'}).isVisible());
    assert.deepEqual(await axe(page),[],`wizard axe ${width}`);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
    await page.goto(`${base}/#/product/p-leather-wide`,{waitUntil:'networkidle'});
    await page.getByRole('button',{name:'راهنمای سایز'}).first().click();
    const guide=page.getByRole('dialog',{name:'راهنمای سایز'});
    assert.ok(await guide.isVisible());
    assert.ok(await guide.locator('.ssg-illustration img').evaluate(img=>img.complete && img.naturalWidth>0),'guide image loaded');
    assert.ok(await guide.getByText('این راهنما سایز را خودکار تعیین نمی‌کند و مناسب‌بودن آن را تضمین نمی‌کند.').isVisible());
    assert.deepEqual(await axe(page),[],`size guide axe ${width}`);
    await guide.getByRole('button',{name:'بستن'}).click();
    assert.equal(await guide.count(),0);
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:390,height:900},reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/#/style-builder`,{waitUntil:'networkidle'});
  await page.getByRole('button',{name:'محصولات',exact:true}).click();
  await page.locator('.sb-tray-add').first().click();
  const original=await page.locator('.sb-canvas-item').first().getAttribute('aria-label');
  await page.getByRole('tab',{name:'دستیار استایل'}).click();
  await page.getByRole('button',{name:'پرسش بعدی'}).click();
  await page.getByRole('tab',{name:'بوم آزاد'}).click();
  await page.getByRole('tab',{name:'دستیار استایل'}).click();
  assert.ok(await page.getByText(/پرسش ۲ از ۶/).isVisible(),'progress remains when switching tabs');
  for(let i=0;i<3;i++) await page.getByRole('button',{name:'پرسش بعدی'}).click();
  const favorite=page.getByRole('button',{name:/رنگ مورد علاقه:/}).first();
  const color=(await favorite.getAttribute('aria-label')).split(': ')[1];
  const avoided=page.getByRole('button',{name:`رنگ ناپسند: ${color}`});
  await favorite.click(); await avoided.click();
  assert.equal(await favorite.getAttribute('aria-pressed'),'false');
  assert.equal(await avoided.getAttribute('aria-pressed'),'true');
  await page.getByRole('button',{name:'پرسش بعدی'}).click();
  await page.getByRole('button',{name:'شروع پیشنهادها'}).click();
  assert.ok(await page.getByText(/سایز اولیه فقط بر اساس موجودی/).isVisible());
  const first=page.locator('.sb-sugg-card').first();
  assert.ok(await first.count()); await first.click();
  // Changing an earlier selection discards dependent later choices.
  await page.locator('.sb-sugg-card').first().click();
  await page.locator('.sb-sugg-card').first().click();
  await page.getByRole('button',{name:'قبلی',exact:true}).click();
  await page.getByRole('button',{name:'قبلی',exact:true}).click();
  assert.equal(await page.locator('.sb-chosen-chip').count(),1);
  await page.locator('.sb-sugg-card').last().click();
  assert.equal(await page.locator('.sb-chosen-chip').count(),2);
  assert.deepEqual(await axe(page),[], 'suggestions axe');
  while(!(await page.getByText('ست پیشنهادی تو آماده است').isVisible())) {
    const skip=page.getByRole('button',{name:/این قطعه لازم نیست|رد کردن این مرحله/});
    assert.ok(await skip.count()); await skip.click();
  }
  assert.equal(await page.locator('.sb-done-list li').count(),2);
  assert.deepEqual(await axe(page),[], 'finished wizard axe');
  // A changed catalogue must block stale variant selection before replacing the board.
  await page.route('**/api/products',async route=>{const response=await route.fetch();const data=await response.json();for(const product of data) for(const key of Object.keys(product.stock)) product.stock[key]=0;await route.fulfill({response,json:data});});
  const staleResponse=page.waitForResponse(r=>r.url().endsWith('/api/products'));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus'))); await staleResponse;
  await page.getByRole('button',{name:'دیدن و چیدن روی بوم'}).click();
  assert.ok(await page.getByRole('alert').getByText(/موجودی برخی انتخاب‌ها/).isVisible());
  await page.unroute('**/api/products');
  const restoredResponse=page.waitForResponse(r=>r.url().endsWith('/api/products'));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus'))); await restoredResponse;
  page.once('dialog',d=>d.dismiss());
  await page.getByRole('button',{name:'دیدن و چیدن روی بوم'}).click();
  assert.ok(await page.getByText('ست پیشنهادی تو آماده است').isVisible(),'cancel keeps wizard result');
  await page.getByRole('tab',{name:'بوم آزاد'}).click();
  assert.equal(await page.locator('.sb-canvas-item').first().getAttribute('aria-label'),original,'cancel keeps existing board');
  await page.getByRole('tab',{name:'دستیار استایل'}).click();
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'دیدن و چیدن روی بوم'}).click();
  assert.ok(await page.getByText(/سایزهای اولیه فقط بر اساس موجودی/).isVisible());
  assert.equal(await page.getByLabel('بودجهٔ من').inputValue(), '1500000', 'summary budget is in displayed toman');
  await page.close();
  // No available products must never trap the shopper on a required slot.
  const empty=await browser.newPage({viewport:{width:390,height:900},reducedMotion:'reduce'});
  await empty.route('**/api/products',async route=>{const response=await route.fetch();const data=await response.json();for(const product of data) for(const key of Object.keys(product.stock)) product.stock[key]=0;await route.fulfill({response,json:data});});
  await empty.goto(`${base}/#/style-builder`,{waitUntil:'networkidle'});
  await empty.getByRole('tab',{name:'دستیار استایل'}).click();
  for(let i=0;i<5;i++) await empty.getByRole('button',{name:'پرسش بعدی'}).click();
  await empty.getByRole('button',{name:'شروع پیشنهادها'}).click();
  for(let i=0;i<6 && !(await empty.getByText('ست پیشنهادی تو آماده است').isVisible());i++) {
    assert.ok(await empty.getByText(/محصول موجودی پیدا نشد/).isVisible());
    await empty.getByRole('button',{name:/این قطعه لازم نیست|رد کردن این مرحله/}).click();
  }
  assert.ok(await empty.getByText('ست پیشنهادی تو آماده است').isVisible());
  assert.ok(await empty.getByRole('button',{name:'دیدن و چیدن روی بوم'}).isDisabled());
  await empty.close();
  assert.deepEqual(errors,[]);
  console.log('Style tray, wizard, empty slots, board protection and size guide: five widths and axe passed.');
} finally { await browser.close(); }
