/* Mutates payments, product price and stock; only on an explicitly selected disposable local database.
 * FINANCE_SMOKE_ALLOW_MUTATIONS=1 DATABASE_URL=postgresql://.../kv_follow_ui_b2a99 BROWSER_TEST_BASE=http://127.0.0.1:8099 PLAYWRIGHT_CHROMIUM_PATH=/tmp/chromium node --import tsx scripts/browser-finance-manual-smoke.mjs */
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
if(process.env.FINANCE_SMOKE_ALLOW_MUTATIONS!=='1')throw new Error('Explicit opt-in required.');
const base=process.env.BROWSER_TEST_BASE,dburl=new URL(process.env.DATABASE_URL||'postgres://invalid');
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base||'') || !['127.0.0.1','localhost'].includes(dburl.hostname) || !/^\/kv_[a-z0-9_]*ui[a-z0-9_]*$/.test(dburl.pathname))throw new Error('Use a disposable local UI database and local API only.');
const db=await import('../server/src/db.ts');await db.initDb();
const {startCheckout}=await import('../server/src/commerce/checkout.ts');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});
let productId,originalPrice;
try {
 const buyer=await browser.newContext(),req=buyer.request;
 async function post(path,body){const csrf=await (await req.get(base+'/api/csrf')).json();const r=await req.post(base+path,{data:body,headers:{'x-csrf-token':csrf.token}});const data=await r.json();assert.ok(r.ok(),`${path} ${r.status()} ${JSON.stringify(data)}`);return data}
 const stock=await (await req.get(base+'/api/commerce/admin/inventory')).json();
 const variant=stock.find(v=>v.active && v.sellable>=3);assert.ok(variant,'seed stock required');
 await post('/api/auth/login',{email:'ava@example.com',password:'demo1234'});
 const started=await post('/api/commerce/checkout',{items:[{variantId:variant.id,quantity:1}],address:{receiver:'مشتری',phone:'09121234567',street:'نشانی'}});
 const id=started.checkout.id;
 const first=await post(`/api/commerce/checkout/${id}/pay`,{method:'online',idempotencyKey:'finance-smoke-first'});
 const second=await post(`/api/commerce/checkout/${id}/pay`,{method:'online',idempotencyKey:'finance-smoke-second'});
 await post(`/api/commerce/payments/${first.attempt.id}/simulate`,{result:'success'});
 const extra=await post(`/api/commerce/payments/${second.attempt.id}/simulate`,{result:'success'});assert.equal(extra.status,'exception');
 await buyer.close();
 const page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/panel',{waitUntil:'networkidle'});
 await page.getByRole('button',{name:'مالی، اتصالات و تنظیمات',exact:true}).click();await page.getByRole('button',{name:/نمای مالی و تراکنش‌ها/}).click();
 const review=page.locator('section').filter({has:page.getByRole('heading',{name:'پرداخت‌های نیازمند بررسی مالی'})});
 await review.getByText(second.attempt.id,{exact:true}).waitFor();assert.match(await review.innerText(),/پرداخت تکراری برای یک تسویه/);
 for(const width of [320,390,768,1280]){await page.setViewportSize({width,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`overflow ${width}`)}
 await page.setViewportSize({width:1280,height:850});
 await page.getByRole('button',{name:'سفارش‌ها و مرجوعی',exact:true}).click();await page.getByRole('button',{name:'سفارش دستی',exact:true}).click();
 const form=page.locator('form').filter({has:page.getByLabel('نام گیرنده',{exact:true})});
 await form.getByLabel('نام گیرنده',{exact:true}).fill('مشتری آزمایشی');await form.getByLabel('موبایل',{exact:true}).fill('09121234567');await form.getByLabel('شهر',{exact:true}).fill('تهران');await form.getByLabel('نشانی کامل',{exact:true}).fill('نشانی آزمایشی');
 await form.getByLabel('افزودن تنوع').selectOption(variant.id);await form.getByRole('button',{name:'افزودن قلم'}).click();await form.getByLabel('مرجع پرداخت خارجی').fill('BANK-UI-TEST');await form.getByLabel('پرداخت مربوط به این سفارش را بررسی و دریافت کرده‌ام.').check();
 let intercepted=false;
 await page.route('**/api/commerce/admin/orders/manual',async route=>{
   if(!intercepted){intercepted=true;const body=route.request().postDataJSON();const created=await startCheckout({items:body.items,address:body.address,customerEmail:body.customerEmail,shippingMethod:body.shippingMethod,couponCode:body.couponCode,idempotencyKey:`manual:${body.idempotencyKey}`,allowAnonymousReuse:true});
     productId=created.checkout.quote.lines[0].productId;originalPrice=Number((await db.query('select price from products where id=$1',[productId])).rows[0].price);await db.query('update products set price=$2 where id=$1',[productId,originalPrice+20]);}
   await route.continue();
 });
 await form.getByRole('button',{name:'ثبت سفارش و کسر موجودی'}).click();await page.getByText(/مبلغ جدید سرور:/).waitFor();
 const retry=form.getByRole('button',{name:'تلاش مجدد برای همین سفارش'});assert.equal(await retry.isDisabled(),true);
 await form.getByLabel('مبلغ جدید را با پرداخت خارجی تطبیق دادم و تأیید می‌کنم.').check();assert.equal(await retry.isEnabled(),true);await retry.click();await page.getByRole('heading',{name:/سفارش .* ثبت شد/}).waitFor();
 await page.setViewportSize({width:390,height:850});await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});const violations=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))));assert.deepEqual(violations,[]);assert.deepEqual(errors,[]);
 console.log('OK real duplicate capture shown in finance, real stale manual quote confirmed before retry, 4 widths and axe; isolated database only');
} finally {if(productId)await db.query('update products set price=$2 where id=$1',[productId,originalPrice]);await browser.close();await db.closeDb()}
