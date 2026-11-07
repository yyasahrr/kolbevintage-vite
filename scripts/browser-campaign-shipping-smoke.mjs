/* Mutates campaigns; run only against an explicitly selected disposable DB.
 * CAMPAIGN_SMOKE_ALLOW_MUTATIONS=1 BROWSER_TEST_BASE=http://127.0.0.1:8099 PLAYWRIGHT_CHROMIUM_PATH=/tmp/chromium node scripts/browser-campaign-shipping-smoke.mjs */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
if(process.env.CAMPAIGN_SMOKE_ALLOW_MUTATIONS!=='1')throw new Error('Opt-in required; use a disposable database.');
const base=process.env.BROWSER_TEST_BASE;
if(!base || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw new Error('A disposable local preview URL is required.');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`${base}/panel`,{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'بازاریابی و مشتریان',exact:true}).click();
 await page.getByRole('button',{name:/کمپین‌ها و تخفیف‌ها/}).click();
 const form=page.locator('form').filter({has:page.getByRole('heading',{name:'پیش‌نویس کمپین'})});
 const name=`کمپین آزمون ${Date.now()}`;
 await form.getByLabel('نام',{exact:true}).fill(name);
 await form.getByLabel('مقدار',{exact:true}).fill('10');
 await form.getByLabel('ارسال رایگان همراه این کمپین').check();
 await form.getByRole('button',{name:'ثبت پیش‌نویس کمپین'}).click();
 await page.getByRole('status').filter({hasText:'پیش‌نویس ثبت شد'}).waitFor();
 const campaign=page.locator('article').filter({has:page.getByRole('heading',{name,exact:true})});
 assert.match(await campaign.innerText(),/ارسال رایگان/);
 await campaign.getByRole('button',{name:'فعال‌سازی'}).click();
 await page.getByRole('status').filter({hasText:'فعال شد'}).waitFor();
 assert.match(await campaign.innerText(),/فعال/);
 await form.getByLabel('نوع کمپین',{exact:true}).selectOption('freeship');
 await form.getByLabel('نام',{exact:true}).fill(`${name} فقط ارسال`);
 assert.equal(await form.getByLabel('مقدار',{exact:true}).count(),0);
 await form.getByRole('button',{name:'ثبت پیش‌نویس کمپین'}).click();
 await page.getByRole('status').filter({hasText:'پیش‌نویس ثبت شد'}).waitFor();
 for(const width of [320,390,768,1280]) {await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}`)}
 assert.deepEqual(errors,[]);
 console.log('OK monetary plus shipping, activation, shipping-only, four widths; isolated database only');
} finally {await browser.close();}
