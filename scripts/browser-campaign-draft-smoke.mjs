/* MUTATES labels and campaigns. Only run against an explicit disposable DB. */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
if(process.env.CAMPAIGN_SMOKE_ALLOW_MUTATIONS!=='1')throw new Error('Opt-in required; use a disposable database.');
const base=process.env.BROWSER_TEST_BASE;
if(!base || !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))throw new Error('A disposable local preview URL is required.');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:850}}), errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`${base}/panel`,{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'بازاریابی و مشتریان',exact:true}).click();
 await page.getByRole('button',{name:/مشتریان و گروه‌بندی CRM/}).click();
 const suffix=Date.now(),label=`برچسب آزمون ${suffix}`,name=`پیش‌نویس محدود ${suffix}`;
 await page.getByLabel('نام برچسب').fill(label);await page.getByRole('button',{name:'ساخت برچسب'}).click();
 await page.getByRole('status').filter({hasText:'برچسب ساخته شد'}).waitFor();
 await page.getByRole('button',{name:/کمپین‌ها و تخفیف‌ها/}).click();
 const form=page.locator('form').filter({has:page.getByRole('heading',{name:'پیش‌نویس کمپین'})});
 await form.getByLabel('نام',{exact:true}).fill(name);await form.getByLabel('مقدار',{exact:true}).fill('20');
 await form.getByLabel(label,{exact:true}).check();await form.getByLabel('نحوه تطبیق مخاطب').selectOption('all');
 await form.getByRole('button',{name:'ثبت پیش‌نویس کمپین'}).click();
 await page.getByRole('status').filter({hasText:'پیش‌نویس ثبت شد'}).waitFor();
 let article=page.locator('article').filter({has:page.getByRole('heading',{name,exact:true})});
 await article.getByRole('button',{name:'فعال‌سازی'}).click();
 await page.getByRole('status').filter({hasText:'فعال شد'}).waitFor();
 assert.match(await article.innerText(),/فعال/);
 await article.getByRole('button',{name:'غیرفعال‌سازی'}).click();
 page.once('dialog',d=>d.accept());await article.getByRole('button',{name:'حذف پیش‌نویس'}).click();
 await page.getByRole('status').filter({hasText:'پیش‌نویس محدود حذف شد'}).waitFor();
 await form.getByLabel('نام',{exact:true}).fill(name);await form.getByLabel('مقدار',{exact:true}).fill('20');
 await form.getByLabel(label,{exact:true}).check();await form.getByLabel('نحوه تطبیق مخاطب').selectOption('all');
 await form.getByLabel('حالت دسترسی زودهنگام').selectOption('view_purchase');
 await form.getByLabel('زمان آغاز زودهنگام').fill('2029-01-02T12:00');
 await form.getByLabel('شروع',{exact:true}).fill('2030-01-03');
 await form.getByRole('button',{name:'ثبت پیش‌نویس کمپین'}).click();
 await page.getByRole('status').filter({hasText:'پیش‌نویس دسترسی زودهنگام ذخیره شد'}).waitFor();
 article=page.locator('article').filter({has:page.getByRole('heading',{name,exact:true})});
 assert.match(await article.innerText(),/مشاهده و خرید/);assert.match(await article.innerText(),new RegExp(label));
 assert.equal(await article.getByRole('button',{name:'فعال‌سازی'}).isDisabled(),true);
 for(const width of [320,390,768,1280]) {await page.setViewportSize({width,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow ${width}`)}
 page.once('dialog',d=>d.accept());await article.getByRole('button',{name:'حذف پیش‌نویس'}).click();
 await page.getByRole('status').filter({hasText:'پیش‌نویس محدود حذف شد'}).waitFor();assert.equal(await article.count(),0);
 assert.deepEqual(errors,[]);console.log('OK audience activation and discard, early access draft, blocked activation, discard, four widths; isolated database only');
} finally {await browser.close();}
