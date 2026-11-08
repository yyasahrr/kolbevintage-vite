// Mutates fixtures: local server and disposable database only.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const base=process.env.BROWSER_TEST_BASE;
if(process.env.BROWSER_MUTATING_TEST!=='1'||!base||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)||!process.env.PLAYWRIGHT_CHROMIUM_PATH)throw new Error('Use opt-in with a local disposable database and Chromium');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});
try {
  for(const width of [320,390,768,1440]) {
    const p=await browser.newPage({viewport:{width,height:900}});p.setDefaultTimeout(15000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
    await p.goto(base+'/panel',{waitUntil:'networkidle'});
    if(width<1024)await p.getByRole('button',{name:'باز کردن منوی ناوبری'}).click();
    await p.getByRole('button',{name:'سفارش‌ها و مرجوعی'}).click();await p.getByRole('button',{name:'مرجوعی و کنترل کیفیت',exact:true}).click();
    await p.getByText('BROWSER-RETURN-REFUND-0085',{exact:true}).waitFor();
    await p.getByRole('button',{name:'درخواست‌های قدیمی‌تر'}).click();await p.getByText('BROWSER-RETURN-REFUND-0045',{exact:true}).waitFor();
    await p.getByRole('button',{name:'درخواست‌های قدیمی‌تر'}).click();await p.getByText('BROWSER-RETURN-REFUND-0001',{exact:true}).waitFor();
    await p.getByRole('button',{name:'صفحه جدیدتر'}).click();await p.getByText('BROWSER-RETURN-REFUND-0045',{exact:true}).waitFor();
    await p.getByLabel('جستجوی شماره درخواست یا سفارش').fill('BROWSER-RETURN-REFUND-0001');await p.getByRole('button',{name:'جستجوی درخواست'}).click();await p.getByText('BROWSER-RETURN-REFUND-0001',{exact:true}).waitFor();
    await p.getByLabel('وضعیت').selectOption('requested');await p.getByText('درخواستی یافت نشد.').waitFor();
    await p.getByLabel('شماره سفارش برای مرجوعی').fill('BROWSER-RETURN-ORDER-0001');await p.getByRole('button',{name:'دریافت سفارش'}).click();
    await p.getByText('سفارش انتخاب‌شده:',{exact:false}).waitFor();await p.getByLabel('قلم سفارش').selectOption('BROWSER-RETURN-LINE-0001');
    assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`overflow ${width}`);
    if(width===390) {
      await p.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
      const violations=await p.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id)));
      assert.deepEqual(violations,[]);
      await p.getByLabel('دلیل درخواست').fill('تست مرجوعی قدیمی');await p.getByRole('button',{name:'ثبت درخواست',exact:true}).click();await p.getByText('درخواست ثبت شد؛ هنوز هیچ وجهی بازگردانده نشده است.').waitFor();
    }
    assert.deepEqual(errors,[]);await p.close();console.log(`Returns ${width}: OK`);
  }
} finally {await browser.close()}
