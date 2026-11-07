/** DESTRUCTIVE: changes the demo customer's addresses, phone and password.
 * Only run against a disposable seeded local database with explicit opt-in:
 * ACCOUNT_SMOKE_ALLOW_MUTATIONS=1 BROWSER_TEST_BASE=http://127.0.0.1:8099
 * PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium node scripts/browser-profile-smoke.mjs */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const base=process.env.BROWSER_TEST_BASE;
if(process.env.ACCOUNT_SMOKE_ALLOW_MUTATIONS!=='1' || !base || !['127.0.0.1','localhost','::1'].includes(new URL(base).hostname)) throw new Error('Disposable local database and explicit opt-in required.');
if(!process.env.PLAYWRIGHT_CHROMIUM_PATH) throw new Error('PLAYWRIGHT_CHROMIUM_PATH is required.');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:900},reducedMotion:'reduce'});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const nav=name=>page.locator('.acc-nav').getByRole('button',{name,exact:true});
const axe=async label=>{
  if(!await page.evaluate(()=>Boolean(window.axe))) await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
  const issues=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))));
  assert.deepEqual(issues,[],`${label}: axe violations`);
};
try {
  await page.goto(`${base}/#/auth`,{waitUntil:'networkidle'});
  await page.getByRole('tab',{name:'رمز عبور'}).click();
  await page.getByLabel('ایمیل',{exact:true}).fill('ava@example.com');
  await page.getByLabel('رمز عبور',{exact:true}).fill('demo1234');
  await page.getByRole('button',{name:'ورود',exact:true}).click();await page.waitForURL(/#\/account/);
  await nav('آدرس‌ها').click();
  const add=page.getByRole('button',{name:'آدرس جدید'});
  await add.click();
  const dialog=page.getByRole('dialog',{name:'آدرس جدید'});
  await dialog.waitFor();
  assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)),'focus enters the dialog');
  await page.keyboard.press('Escape');assert.equal(await dialog.count(),0);assert.ok(await add.evaluate(el=>el===document.activeElement),'focus restored');
  await add.click();
  await dialog.getByLabel('عنوان',{exact:true}).fill('آدرس آزمون');
  await dialog.getByLabel('گیرنده',{exact:true}).fill('آوا');
  await dialog.getByLabel('استان',{exact:true}).fill('گیلان');
  await dialog.getByLabel('شهر',{exact:true}).fill('رشت');
  await dialog.getByLabel('نشانی',{exact:true}).fill('خیابان آزمایشی');
  await dialog.getByLabel('آدرس پیش‌فرض').check();
  await axe('address dialog');
  await page.route('**/api/auth/addresses',route=>route.abort());
  await dialog.getByRole('button',{name:'ذخیره',exact:true}).click();
  await dialog.getByRole('alert').filter({hasText:'نتیجه ذخیره مشخص نیست'}).waitFor();
  assert.equal(await page.locator('.acc-address-label').filter({hasText:'آدرس آزمون'}).count(),0,'failed write did not update list');
  await page.unroute('**/api/auth/addresses');
  await dialog.getByRole('button',{name:'ذخیره',exact:true}).click();
  await page.getByRole('status').filter({hasText:'تغییر آدرس ذخیره شد'}).waitFor();
  const added=page.locator('.acc-address').filter({hasText:'آدرس آزمون'});
  await added.getByText('پیش‌فرض',{exact:true}).waitFor();
  await page.reload({waitUntil:'networkidle'});await nav('آدرس‌ها').click();
  await page.locator('.acc-address').filter({hasText:'آدرس آزمون'}).getByText('پیش‌فرض',{exact:true}).waitFor();
  await page.getByRole('button',{name:'ویرایش آدرس آدرس آزمون'}).click();
  const edit=page.getByRole('dialog',{name:'ویرایش آدرس'});
  await edit.getByLabel('نشانی',{exact:true}).fill('تغییر محلی قدیمی');
  // Another tab saves first: the older draft must not overwrite it.
  const changed=await page.evaluate(async()=>{
    const me=await (await fetch('/api/auth/me')).json(); const csrf=await (await fetch('/api/csrf')).json();
    const expected=me.customer.addresses; const addresses=expected.map(a=>a.label==='آدرس آزمون'?{...a,street:'تغییر از تب دیگر'}:a);
    const r=await fetch('/api/auth/addresses',{method:'PUT',headers:{'content-type':'application/json','x-csrf-token':csrf.token},body:JSON.stringify({expected,addresses})});return r.status;
  });
  assert.equal(changed,200);
  await edit.getByRole('button',{name:'ذخیره',exact:true}).click();
  await edit.getByRole('alert').filter({hasText:'جای دیگری تغییر'}).waitFor();
  await edit.getByRole('button',{name:'انصراف'}).click();
  await page.getByText(/تغییر از تب دیگر/).waitFor();
  assert.equal(await page.getByText(/تغییر محلی قدیمی/).count(),0);
  await page.getByRole('button',{name:'حذف آدرس آدرس آزمون'}).click();
  const remove=page.getByRole('dialog',{name:'حذف آدرس'});await remove.getByRole('button',{name:'حذف',exact:true}).click();
  await page.getByRole('status').filter({hasText:'تغییر آدرس ذخیره شد'}).waitFor();
  assert.equal(await page.locator('.acc-address').filter({hasText:'آدرس آزمون'}).count(),0);
  assert.equal(await page.locator('.acc-address .acc-default').count(),1);
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});const d=await page.evaluate(()=>({actual:document.documentElement.scrollWidth,expected:innerWidth}));assert.ok(d.actual<=d.expected,`addresses overflow ${width}: ${JSON.stringify(d)}`);}
  await page.setViewportSize({width:390,height:900});await axe('addresses');
  await nav('امنیت').click();
  const phone=page.getByLabel('شمارهٔ تماس',{exact:true});await phone.fill('09121111111');
  await page.route('**/api/auth/profile',route=>route.abort());
  await page.getByRole('button',{name:'ذخیرهٔ شماره'}).click();
  await page.getByRole('alert').filter({hasText:'نتیجه ذخیره مشخص نیست'}).waitFor();
  await page.unroute('**/api/auth/profile');
  await nav('نمای کلی').click();await nav('امنیت').click();
  assert.notEqual(await page.getByLabel('شمارهٔ تماس',{exact:true}).inputValue(),'09121111111');
  await page.getByLabel('شمارهٔ تماس',{exact:true}).fill('09121111111');await page.getByRole('button',{name:'ذخیرهٔ شماره'}).click();
  await page.getByRole('status').filter({hasText:'شماره تماس ذخیره شد'}).waitFor();
  await page.reload({waitUntil:'networkidle'});await nav('امنیت').click();assert.equal(await page.getByLabel('شمارهٔ تماس',{exact:true}).inputValue(),'09121111111');
  await page.getByLabel('رمز فعلی',{exact:true}).fill('wrong-password');await page.getByLabel('رمز جدید',{exact:true}).fill('new-demo-pass-123');await page.getByLabel('تکرار رمز جدید',{exact:true}).fill('new-demo-pass-123');
  await page.getByRole('button',{name:'تغییر رمز'}).click();await page.getByRole('alert').filter({hasText:'رمز فعلی درست نیست'}).waitFor();
  await page.getByLabel('رمز فعلی',{exact:true}).fill('demo1234');
  await page.route('**/api/auth/password',route=>route.abort());await page.getByRole('button',{name:'تغییر رمز'}).click();
  await page.getByRole('alert').filter({hasText:'نتیجه تغییر رمز مشخص نیست'}).waitFor();await page.unroute('**/api/auth/password');
  await page.getByRole('button',{name:'تغییر رمز'}).click();await page.getByRole('status').filter({hasText:'رمز تغییر کرد'}).waitFor();
  for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});const d=await page.evaluate(()=>({actual:document.documentElement.scrollWidth,expected:innerWidth}));assert.ok(d.actual<=d.expected,`security overflow ${width}: ${JSON.stringify(d)}`);}
  await page.setViewportSize({width:390,height:900});await axe('security');
  await page.route('**/api/auth/logout',route=>route.abort());
  await page.getByRole('button',{name:'خروج',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'خروج از حساب تأیید نشد'}).waitFor();
  assert.equal(await page.locator('.acc-nav').count(),1,'failed logout must not claim success');
  await page.unroute('**/api/auth/logout');
  await page.getByRole('button',{name:'خروج',exact:true}).click();await page.waitForURL(/#\/$/);
  await page.goto(`${base}/#/auth`,{waitUntil:'networkidle'});await page.getByRole('tab',{name:'رمز عبور'}).click();
  await page.getByLabel('ایمیل',{exact:true}).fill('ava@example.com');await page.getByLabel('رمز عبور',{exact:true}).fill('demo1234');await page.getByRole('button',{name:'ورود',exact:true}).click();
  await page.getByText('حسابی با این ایمیل و رمز پیدا نشد.').waitFor();
  await page.getByLabel('رمز عبور',{exact:true}).fill('new-demo-pass-123');await page.getByRole('button',{name:'ورود',exact:true}).click();await page.waitForURL(/#\/account/);
  assert.deepEqual(errors,[],'browser exceptions');
  console.log('Profile smoke: focus, create/edit/conflict/delete/default, offline safety, persistence, phone, password, logout and 4 widths/axe passed.');
} catch(error) {console.error('Page:',await page.locator('.acc-main').innerText().catch(()=>''));await page.screenshot({path:'/tmp/kv-profile-failure.png',fullPage:true}).catch(()=>{});throw error;} finally {await browser.close();}
