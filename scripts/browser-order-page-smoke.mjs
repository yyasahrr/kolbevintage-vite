// Read-only browser test. Requires a disposable local database with at least
// 85 BROWSER-ORDER-NNNN fixtures (see docs/production-readiness-fa.md).
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const base=process.env.BROWSER_TEST_BASE||'http://127.0.0.1:8099';
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('Only an explicit local disposable test server is allowed');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});
try {
  for (const width of [320,390,768,1440]) {
    const page=await browser.newPage({viewport:{width,height:900}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`${base}/panel`,{waitUntil:'networkidle'});
    if(width<1024)await page.getByRole('button',{name:'باز کردن منوی ناوبری'}).click();
    await page.getByRole('button',{name:'سفارش‌ها و مرجوعی'}).click();
    await page.getByRole('button',{name:'سفارش‌ها',exact:true}).click();
    await page.getByText('BROWSER-ORDER-0085',{exact:true}).waitFor();
    await page.getByRole('button',{name:'سفارش‌های قدیمی‌تر'}).click();
    await page.getByText('BROWSER-ORDER-0045',{exact:true}).waitFor();
    await page.getByRole('button',{name:'سفارش‌های قدیمی‌تر'}).click();
    await page.getByText('BROWSER-ORDER-0005',{exact:true}).waitFor();
    await page.getByRole('button',{name:'صفحه جدیدتر'}).click();
    await page.getByText('BROWSER-ORDER-0045',{exact:true}).waitFor();
    await page.getByLabel('جستجو در سفارش‌ها').fill('TRACK-123');
    await page.getByRole('button',{name:'جستجو',exact:true}).click();
    await page.getByText('BROWSER-ORDER-0001',{exact:true}).waitFor();
    await page.getByRole('button',{name:'آماده ارسال',exact:true}).click();
    await page.getByText('BROWSER-ORDER-0001',{exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'آماده ارسال',exact:true}).getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:'پیش‌نمایش سفارش BROWSER-ORDER-0001'}).click();
    await page.getByRole('dialog',{name:'پیش‌نمایش سفارش'}).waitFor();
    await page.getByRole('button',{name:'بستن پیش‌نمایش'}).click();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`overflow at ${width}`);
    if(width===390){
      await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
      const violations=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>v.impact==='serious'||v.impact==='critical').map(v=>v.id)));
      assert.deepEqual(violations,[]);
    }
    if(width===390){
      await page.getByRole('button',{name:'باز کردن منوی ناوبری'}).click();
      await page.getByRole('button',{name:'مرکز چاپ اسناد'}).click();
      await page.getByLabel('شماره سفارش برای چاپ').fill('BROWSER-ORDER-0001');
      await page.getByRole('button',{name:'دریافت پیش‌نمایش'}).click();
      await page.getByRole('article').getByText('BROWSER-ORDER-0001',{exact:true}).waitFor();
    }
    assert.deepEqual(errors,[]);
    await page.close();console.log(`Order pages ${width}: OK`);
  }
} finally {await browser.close();}
