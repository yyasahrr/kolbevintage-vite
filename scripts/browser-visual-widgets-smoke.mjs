// Mutates drafts, uploads and pages. Use only a disposable local DB and uploads.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {makeVisualConfig} from '../shared/visual-config.tsx';
import {extraVisualSpec} from '../shared/visual-extra-spec.ts';
if(process.env.BROWSER_MUTATING_TEST!=='1')throw new Error('Requires BROWSER_MUTATING_TEST=1 and disposable DB/uploads');
const base=process.env.BROWSER_TEST_BASE||'http://127.0.0.1:8099';
const publicBase=process.env.BROWSER_PUBLIC_BASE||base;
for(const url of [base,publicBase])if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url))throw new Error('Only local disposable test servers allowed');
const panelPath=process.env.BROWSER_PANEL_PATH||'/panel?view=studio';
const config=makeVisualConfig(()=>null,()=>null);
const content=Object.keys(extraVisualSpec).map(type=>({type,props:{...config.components[type].defaultProps,id:`test-${type}`}}));
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
try {
  await page.goto(base+panelPath,{waitUntil:'networkidle'});
  const draft=await page.evaluate(async(content)=>{
    const csrf=(await(await fetch('/api/csrf')).json()).token;
    const call=async(path,method,body)=>{const r=await fetch(path,{method,headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(`${r.status} ${JSON.stringify(d)}`);return d};
    const d=await call('/api/admin/studio/drafts','POST',{title:'مجموعه ویجت‌ها '+Date.now()});
    return call(`/api/admin/studio/drafts/${d.id}/visual`,'PATCH',{title:d.title,expectedVersion:d.version,visual:{root:{props:{}},content}});
  },content);
  await page.reload({waitUntil:'networkidle'});
  await page.getByLabel('انتخاب پیش‌نویس تصویری').selectOption(draft.id);
  await page.getByRole('button',{name:'باز کردن صفحه‌ساز'}).click();
  const picker=page.getByLabel('انتخاب ویجت برای افزودن');
  await picker.waitFor();
  for(const type of Object.keys(extraVisualSpec))assert.equal(await picker.locator(`option[value="${type}"]`).count(),1,`${type} in palette`);
  await page.getByLabel('جستجوی ویجت').fill('پرسش‌های متداول');
  assert(await page.getByTestId('drawer-item:FAQ').isVisible());
  assert.equal(await page.getByTestId('drawer-item:Gallery').isVisible(),false);
  await page.getByLabel('جستجوی ویجت').fill('');
  // New container exposes slots in the quick-add destination picker.
  const fourth=await page.getByLabel('محل افزودن ویجت').locator('option[value="test-ColumnsFour:fourth"]').count();assert.equal(fourth,1);
  await page.getByLabel('محل افزودن ویجت').selectOption('test-ColumnsFour:fourth');
  await picker.selectOption('Badge');await page.getByRole('button',{name:'افزودن',exact:true}).click();
  await page.locator('input[title="متن"]:visible').first().fill('برچسب داخل ستون');
  await page.frameLocator('iframe').getByText('برچسب داخل ستون').waitFor();
  await page.getByLabel('محل افزودن ویجت').selectOption('root:default-zone');await picker.selectOption('Gallery');await page.getByRole('button',{name:'افزودن',exact:true}).click();await page.locator('input[aria-label="بارگذاری تصویر"]:visible').first().setInputFiles('public/size-guide-figure.webp');await page.waitForFunction(()=>[...document.querySelectorAll('input[aria-label="نشانی تصویر"]')].some(x=>x.value.startsWith('/uploads/')),null,{timeout:15000});
  await page.getByRole('button',{name:'ذخیره پیش‌نویس'}).click();
  await page.getByText('پیش‌نویس ذخیره شد؛ انتشار جداگانه انجام می‌شود.').waitFor();
  await page.getByRole('button',{name:'بازگشت به پنل'}).click();
  const saved=await page.evaluate(async(id)=>(await(await fetch('/api/admin/studio/drafts')).json()).find(x=>x.id===id),draft.id);
  assert.equal(saved.visual.content.find(x=>x.type==='ColumnsFour').props.fourth[0].props.text,'برچسب داخل ستون');const gallery=saved.visual.content.filter(x=>x.type==='Gallery').at(-1);assert.match(gallery.props.image1,/^\/uploads\//);
  const slug=`widgets-${Date.now()}`;
  await page.getByLabel('نام نشانی انگلیسی').fill(slug);await page.getByRole('button',{name:'انتشار نسخهٔ ذخیره‌شده'}).click();
  await page.getByText('صفحه منتشر شد. برای دیدن آن پیوند عمومی را باز کنید.').waitFor();
  await page.goto(publicBase+'/#/studio/'+slug,{waitUntil:'networkidle'});
  await page.getByText('برچسب داخل ستون').waitFor();await page.locator(`img[src="${gallery.props.image1}"]`).waitFor();
  const question=page.locator('details').filter({has:page.getByText('چگونه سفارش بدهم؟',{exact:true})});
  assert.equal(await question.getAttribute('open'),null);await question.locator('summary').click();assert.notEqual(await question.getAttribute('open'),null);await question.getByText('محصول و اندازه را انتخاب کنید و به سبد خرید بروید.').waitFor();
  for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`no horizontal overflow at ${width}`)}
  assert.deepEqual(errors,[]);
  console.log(`${content.length} extra widgets saved, reopened and published; search, four-column slot, gallery upload, FAQ and responsive widths OK`);
} finally {await browser.close()}
