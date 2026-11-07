/** DESTRUCTIVE integration smoke: only run on a disposable seeded local database.
 * ACCOUNT_SMOKE_ALLOW_MUTATIONS=1 BROWSER_TEST_BASE=http://127.0.0.1:8099
 * PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium node scripts/browser-account-smoke.mjs */
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const base = process.env.BROWSER_TEST_BASE;
if (process.env.ACCOUNT_SMOKE_ALLOW_MUTATIONS !== "1" || !base || !["127.0.0.1", "localhost", "::1"].includes(new URL(base).hostname)) throw new Error("Requires explicit opt-in and a disposable local test database.");
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
if (!executablePath) throw new Error("PLAYWRIGHT_CHROMIUM_PATH is required.");
const browser = await chromium.launch({executablePath,args:["--no-sandbox"]});
const page = await browser.newPage({viewport:{width:390,height:900},reducedMotion:"reduce"});
const errors = [];
page.on("pageerror",e=>errors.push(e.message));
try {
  await page.goto(`${base}/#/auth`,{waitUntil:"networkidle"});
  await page.getByRole("tab",{name:"رمز عبور"}).click();
  await page.getByLabel("ایمیل",{exact:true}).fill("ava@example.com");
  await page.getByLabel("رمز عبور",{exact:true}).fill("demo1234");
  await page.getByRole("button",{name:"ورود",exact:true}).click();
  await page.waitForURL(/#\/account/);
  // Create one real commerce order via the mock provider, not a local fixture.
  const placed = await page.evaluate(async () => {
    const csrf = await (await fetch('/api/csrf')).json();
    const post = async (path,body) => {
      const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf.token},body:JSON.stringify(body)});
      const data=await r.json(); if(!r.ok) throw new Error(`${path}: ${r.status} ${JSON.stringify(data)}`); return data;
    };
    const variants = await (await fetch('/api/products/p-leather-wide/variants')).json();
    const variant=variants.find(v=>v.active && v.available>0);
    if(!variant) throw new Error('Disposable seed has no stock');
    const c=await post('/api/commerce/checkout',{items:[{variantId:variant.id,quantity:1}],address:{receiver:'آوا رادمهر',city:'تهران',province:'تهران',street:'ولیعصر',postal:'1234567890'},shippingMethod:'standard'});
    const pay=await post(`/api/commerce/checkout/${c.checkout.id}/pay`,{method:'online'});
    return post(`/api/commerce/payments/${pay.attempt.id}/simulate`,{result:'success'});
  });
  assert.equal(placed.status,"settled");
  await page.route('**/api/commerce/orders?*',route=>route.abort());
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('alert').filter({hasText:'دریافت سفارش‌ها ناموفق بود'}).waitFor();
  await page.unroute('**/api/commerce/orders?*');
  await page.getByRole('button',{name:'تلاش دوباره'}).click();
  await page.getByText(placed.orderId,{exact:true}).waitFor();
  await page.locator('.acc-nav').getByRole('button',{name:'سفارش‌ها'}).click();
  await page.getByText('پرداخت آزمایشی، بدون پرداخت بانکی').first().waitFor();
  await page.getByRole('button',{name:`جزئیات سفارش ${placed.orderId}`}).click();
  await page.getByText('پرداخت این سفارش آزمایشی بوده و پرداخت بانکی انجام نشده است.').waitFor();
  await page.locator('.acc-nav').getByRole('button',{name:'مرجوعی'}).click();
  await page.getByLabel('سفارش',{exact:true}).selectOption(placed.orderId);
  const option=page.getByLabel('کالا',{exact:true}).locator('option').nth(1);
  await page.getByLabel('کالا',{exact:true}).selectOption(await option.getAttribute('value'));
  await page.getByRole('button',{name:'ثبت درخواست'}).click();
  await page.getByRole('status').filter({hasText:'درخواست ثبت شد'}).waitFor();
  await page.locator('.acc-orders li').filter({hasText:placed.orderId}).getByText('در انتظار بررسی',{exact:true}).waitFor();
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.acc-nav').getByRole('button',{name:'مرجوعی'}).click();
  await page.locator('.acc-orders li').filter({hasText:placed.orderId}).getByText('در انتظار بررسی',{exact:true}).waitFor();
  await page.getByLabel('سفارش',{exact:true}).selectOption(placed.orderId);
  const again=page.getByLabel('کالا',{exact:true}).locator('option').nth(1);
  await page.getByLabel('کالا',{exact:true}).selectOption(await again.getAttribute('value'));
  await page.getByRole('button',{name:'ثبت درخواست'}).click();
  await page.getByRole('alert').filter({hasText:'قابل مرجوع'}).waitFor();
  for (const tab of ['نمای کلی','سفارش‌ها','مرجوعی','کیف پول و کش‌بک','تیکت‌ها','اندازه‌های من','پرو آنلاین']) {
    await page.locator('.acc-nav').getByRole('button',{name:tab,exact:true}).click();
    await page.waitForTimeout(500);
    for(const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:900});
      const dimensions=await page.evaluate(()=>({actual:document.documentElement.scrollWidth,expected:innerWidth}));
      assert.ok(dimensions.actual<=dimensions.expected,`${tab} overflow at ${width}: ${JSON.stringify(dimensions)}`);
    }
    await page.setViewportSize({width:390,height:900});
    if (!await page.evaluate(()=>Boolean(window.axe))) await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
    const violations=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>v.impact==='serious'||v.impact==='critical').map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))));
    assert.deepEqual(violations,[],`${tab} serious/critical axe violations`);
  }
  await page.locator('.acc-nav').getByRole('button',{name:'تیکت‌ها',exact:true}).click();
  const supportSubject=`پیگیری آزمون مرورگر ${Date.now()}`;
  await page.getByLabel('موضوع درخواست').fill(supportSubject);
  await page.getByLabel('پیام درخواست').fill('سلام، درخواست آزمایشی مشتری');
  await page.getByRole('button',{name:'ثبت درخواست پشتیبانی'}).click();
  await page.getByRole('status').filter({hasText:'درخواست ثبت شد'}).waitFor();
  const admin=await browser.newPage({viewport:{width:390,height:900}});
  await admin.goto(`${base}/panel`,{waitUntil:'networkidle'});
  await admin.getByRole('button',{name:'باز کردن منوی ناوبری'}).click();
  await admin.getByRole('button',{name:'بازاریابی و مشتریان',exact:true}).click();
  await admin.getByRole('button',{name:'پشتیبانی مشتریان',exact:true}).click();
  await admin.locator('article').filter({hasText:supportSubject}).getByRole('button',{name:'مشاهده گفتگو'}).click();
  await admin.getByText('سلام، درخواست آزمایشی مشتری').waitFor();
  await admin.getByLabel('پاسخ پشتیبانی').fill('پاسخ آزمایشی فروشگاه');
  await admin.getByRole('button',{name:'ثبت پاسخ'}).click();
  await admin.getByRole('status').filter({hasText:'پاسخ ثبت شد'}).waitFor();
  await page.getByRole('button',{name:'تازه‌سازی گفتگو'}).click();
  await page.getByText('پاسخ آزمایشی فروشگاه').waitFor();
  await page.getByLabel('پاسخ شما').fill('دریافت شد، ممنون');
  await page.getByRole('button',{name:'ارسال پاسخ'}).click();
  await page.getByRole('status').filter({hasText:'پیام ثبت شد'}).waitFor();
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.acc-nav').getByRole('button',{name:'تیکت‌ها',exact:true}).click();
  await page.locator('.acc-orders li').filter({hasText:supportSubject}).getByRole('button',{name:'مشاهده گفتگو'}).click();
  await page.getByText('دریافت شد، ممنون').waitFor();
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:900});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`support overflow at ${width}`);
    await admin.setViewportSize({width,height:900});
    assert.ok(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`admin support overflow at ${width}`);
  }
  await admin.close();
  await page.locator('.acc-nav').getByRole('button',{name:'اندازه‌های من',exact:true}).click();
  await page.getByLabel('قد به سانتی‌متر').waitFor();
  assert.equal(await page.getByLabel('قد به سانتی‌متر').inputValue(),'','legacy sample must not appear as a real measurement');
  await page.getByLabel('قد به سانتی‌متر').fill('۱۷۳٫۵');
  await page.getByLabel('دور سینه به سانتی‌متر').fill('۹۴');
  await page.getByRole('button',{name:'ذخیره اندازه‌ها'}).click();
  await page.getByRole('status').filter({hasText:'در حساب ذخیره شدند'}).waitFor();
  assert.equal(await page.getByLabel('قد به سانتی‌متر').inputValue(),'173.5');
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.acc-nav').getByRole('button',{name:'اندازه‌های من',exact:true}).click();
  await page.getByLabel('قد به سانتی‌متر').waitFor();
  assert.equal(await page.getByLabel('قد به سانتی‌متر').inputValue(),'173.5');
  await page.evaluate(async()=>{
    const csrf=await (await fetch('/api/csrf')).json();
    const before=await (await fetch('/api/auth/measurements')).json();
    const response=await fetch('/api/auth/measurements',{method:'PUT',headers:{'content-type':'application/json','x-csrf-token':csrf.token},body:JSON.stringify({expected:before.measurements,measurements:{...before.measurements,height:180}})});
    if(!response.ok)throw new Error('competing measurement update failed');
  });
  await page.getByLabel('دور سینه به سانتی‌متر').fill('95');
  await page.getByRole('button',{name:'ذخیره اندازه‌ها'}).click();
  await page.getByRole('alert').filter({hasText:'در جای دیگری تغییر کرده‌اند'}).waitFor();
  assert.equal(await page.getByLabel('دور سینه به سانتی‌متر').inputValue(),'95','conflict must not erase unsaved draft');
  await page.getByRole('button',{name:'دریافت دوباره اندازه‌ها'}).click();
  await page.waitForFunction(()=>document.querySelector('input[aria-label="قد به سانتی‌متر"]')?.value==='180');
  await page.getByRole('button',{name:'حذف اندازه‌های ذخیره‌شده'}).click();
  await page.getByRole('button',{name:'بله، حذف شود'}).click();
  await page.getByRole('status').filter({hasText:'اندازه‌ها حذف شدند'}).waitFor();
  assert.equal(await page.getByLabel('قد به سانتی‌متر').inputValue(),'');
  await page.route('**/api/auth/measurements',route=>route.abort());
  await page.locator('.acc-nav').getByRole('button',{name:'نمای کلی',exact:true}).click();
  await page.locator('.acc-nav').getByRole('button',{name:'اندازه‌های من',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'دریافت اندازه‌ها ناموفق بود'}).waitFor();
  assert.equal(await page.getByLabel('قد به سانتی‌متر').count(),0,'network failures must not show local guesses');
  await page.unroute('**/api/auth/measurements');
  await page.locator('.acc-nav').getByRole('button',{name:'پرو آنلاین',exact:true}).click();
  await page.getByText('خرید و ثبت درخواست پرو تا اتصال سرویس و پرداخت معتبر غیرفعال است. درخواست یا اعتباری در این بخش ثبت نمی‌شود.').waitFor();
  assert.equal(await page.locator('.acc-main form').count(),0);
  // A failed wallet endpoint must not silently substitute browser-local balances.
  await page.route('**/api/commerce/cashback',route=>route.abort());
  await page.reload({waitUntil:'networkidle'});
  await page.locator('.acc-nav').getByRole('button',{name:'کیف پول و کش‌بک',exact:true}).click();
  await page.getByText('اطلاعات کیف پول در دسترس نیست؛ اتصال را بررسی و صفحه را تازه کنید.').waitFor();
  assert.equal(await page.getByText('هنوز تراکنش کش‌بکی ثبت نشده است.').count(),0);
  await page.unroute('**/api/commerce/cashback');
  assert.deepEqual(errors,[],'browser exceptions');
  console.log('Account smoke: real mock order, errors/retry, return submission, history after reload, quantity protection, support customer/admin round-trip, private measurements persistence/conflict/deletion, 4 widths, axe and wallet failure passed.');
} catch (err) {
  console.error('Account page text:', await page.locator('.acc-main').innerText().catch(()=>''));
  await page.screenshot({path:'/tmp/kv-account-smoke-failure.png',fullPage:true}).catch(()=>{});
  throw err;
} finally { await browser.close(); }
