// Mutating integration test: use only a disposable local database and uploads.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeVisualConfig} from '../shared/visual-config.tsx';
import {advancedVisualSpec} from '../shared/visual-advanced-spec.ts';
if(process.env.BROWSER_MUTATING_TEST!=='1')throw new Error('Requires BROWSER_MUTATING_TEST=1 and disposable DB/uploads');
const base=process.env.BROWSER_TEST_BASE||'http://127.0.0.1:8099', publicBase=process.env.BROWSER_PUBLIC_BASE||base;
for(const url of [base,publicBase])if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url))throw new Error('Only local disposable test servers allowed');
const panelPath=process.env.BROWSER_PANEL_PATH||'/panel?view=studio';
const config=makeVisualConfig(()=>null,()=>null);
const content=Object.keys(advancedVisualSpec).map(type=>({type,props:{...config.components[type].defaultProps,id:`test-${type}`}}));
const stack=content.find(item=>item.type==='Stack');stack.props.gap=48;stack.props.content=[{type:'Badge',props:{...config.components.Badge.defaultProps,id:'stack-badge-1',text:'نشان اول'}},{type:'Badge',props:{...config.components.Badge.defaultProps,id:'stack-badge-2',text:'نشان دوم'}}];
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
try {
 await page.goto(base+panelPath,{waitUntil:'networkidle'});
 const imageData='data:image/webp;base64,'+readFileSync('public/size-guide-figure.webp').toString('base64');
 const draft=await page.evaluate(async({content,imageData})=>{
  const csrf=(await(await fetch('/api/csrf')).json()).token;
  const call=async(path,method,body)=>{const r=await fetch(path,{method,headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(`${r.status} ${JSON.stringify(d)}`);return d};
  const upload=await call('/api/admin/studio/image','POST',{imageData});
  for(const n of content){for(const key of ['image','image1','image2','image3','image4','before','after','poster'])if(key in n.props)n.props[key]=upload.url;}
  const d=await call('/api/admin/studio/drafts','POST',{title:'ویجت‌های پیشرفته '+Date.now()});
  return call(`/api/admin/studio/drafts/${d.id}/visual`,'PATCH',{title:d.title,expectedVersion:d.version,visual:{root:{props:{}},content}});
 },{content,imageData});
 await page.reload({waitUntil:'networkidle'});await page.getByLabel('انتخاب پیش‌نویس تصویری').selectOption(draft.id);await page.getByRole('button',{name:'باز کردن صفحه‌ساز'}).click();
 const picker=page.getByLabel('انتخاب ویجت برای افزودن');await picker.waitFor();
 for(const name of Object.keys(advancedVisualSpec))assert.equal(await picker.locator(`option[value="${name}"]`).count(),1,`${name} in palette`);
 const previewMode=page.getByRole('button',{name:'حالت تعامل با پیش‌نمایش'});await previewMode.click();assert.equal(await previewMode.getAttribute('aria-pressed'),'true');await page.frameLocator('iframe').getByRole('tab',{name:'بخش دوم'}).click();assert.equal(await page.frameLocator('iframe').getByRole('tab',{name:'بخش دوم'}).getAttribute('aria-selected'),'true');await page.frameLocator('iframe').getByRole('link',{name:'مشاهده مجموعه'}).first().click();await page.frameLocator('iframe').getByRole('tab',{name:'بخش دوم'}).waitFor();await previewMode.click();assert.equal(await previewMode.getAttribute('aria-pressed'),'false');
 await page.getByLabel('جستجوی ویجت').fill('اسلایدر تصویر');assert(await page.getByTestId('drawer-item:ImageCarousel').isVisible());await page.getByLabel('جستجوی ویجت').fill('');
 await page.getByLabel('محل افزودن ویجت').selectOption('test-SplitLayout:second');await picker.selectOption('Heading');await page.getByRole('button',{name:'افزودن',exact:true}).click();await page.locator('input[title="متن"]:visible').first().fill('ستون پیشرفته');await page.frameLocator('iframe').getByText('ستون پیشرفته').waitFor();
 await page.getByLabel('محل افزودن ویجت').selectOption('root:default-zone');await picker.selectOption('ImageCaption');await page.getByRole('button',{name:'افزودن',exact:true}).click();await page.locator('input[aria-label="بارگذاری تصویر"]:visible').first().setInputFiles('public/size-guide-figure.webp');await page.waitForFunction(()=>[...document.querySelectorAll('input[aria-label="نشانی تصویر"]')].some(x=>x.value.startsWith('/uploads/')),null,{timeout:15000});
 await page.getByRole('button',{name:'ذخیره پیش‌نویس'}).click();await page.getByText('پیش‌نویس ذخیره شد؛ انتشار جداگانه انجام می‌شود.').waitFor();await page.getByRole('button',{name:'بازگشت به پنل'}).click();
 const saved=await page.evaluate(async id=>(await(await fetch('/api/admin/studio/drafts')).json()).find(x=>x.id===id),draft.id);
 assert.equal(saved.visual.content.find(x=>x.type==='SplitLayout').props.second[0].props.text,'ستون پیشرفته');assert.match(saved.visual.content.filter(x=>x.type==='ImageCaption').at(-1).props.image,/^\/uploads\//);
 // Close/reopen must preserve new node types and nested fields.
 await page.reload({waitUntil:'networkidle'});await page.getByLabel('انتخاب پیش‌نویس تصویری').selectOption(saved.id);await page.getByRole('button',{name:'باز کردن صفحه‌ساز'}).click();await page.frameLocator('iframe').getByText('ستون پیشرفته').waitFor();await page.getByRole('button',{name:'بازگشت به پنل'}).click();
 const slug=`advanced-${Date.now()}`;await page.getByLabel('نام نشانی انگلیسی').fill(slug);await page.getByRole('button',{name:'انتشار نسخهٔ ذخیره‌شده'}).click();await page.getByText('صفحه منتشر شد. برای دیدن آن پیوند عمومی را باز کنید.').waitFor();
 await page.goto(publicBase+'/#/studio/'+slug,{waitUntil:'networkidle'});await page.getByText('ستون پیشرفته').waitFor();const stackGap=await page.locator('.kv-advanced-stack > div').evaluate(e=>getComputedStyle(e).gap);assert.equal(stackGap,'48px');
 const tab1=page.getByRole('tab',{name:'بخش اول'}),tab2=page.getByRole('tab',{name:'بخش دوم'});await tab1.focus();await page.keyboard.press('ArrowRight');assert.equal(await tab2.getAttribute('aria-selected'),'true');await page.getByRole('tabpanel').getByText('متن بخش دوم').waitFor();
 const more=page.getByRole('button',{name:'ادامه مطلب'});await more.click();assert.equal(await page.getByRole('button',{name:'بستن متن'}).getAttribute('aria-expanded'),'true');await page.getByText('ادامه توضیحات را اینجا بنویسید.').waitFor();await page.getByRole('button',{name:'بستن متن'}).click();
 await page.getByRole('button',{name:'گزینه دوم'}).first().click();await page.getByText('محتوای گزینه دوم').waitFor();
 await page.getByRole('button',{name:'نظر بعدی'}).click();await page.getByText('تجربه خرید دوم').waitFor();
 const compare=page.getByLabel('میزان نمایش تصویر قبل');await compare.fill('75');assert.equal(await compare.inputValue(),'75');
 await page.getByRole('button',{name:'تصویر بعدی'}).click();assert(await page.getByText('۲ / ۳',{exact:true}).count());
 const zoom=page.getByRole('button',{name:'بزرگ‌نمایی تصویر'});await zoom.click();const dialog=page.getByRole('dialog',{name:'نمایش تصویر بزرگ'});await dialog.waitFor();await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert(await zoom.evaluate(e=>document.activeElement===e));
 const pricing=page.locator('.kv-advanced-price');await pricing.getByRole('button',{name:'گزینه دوم'}).click();await pricing.getByText('قیمت دوم').waitFor();
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{}},configurable:true}));await page.getByRole('button',{name:'کپی کد'}).click();await page.getByText('کپی شد.').waitFor();await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new Error('denied')}},configurable:true}));await page.getByRole('button',{name:'کپی کد'}).click();await page.getByText('کپی خودکار ممکن نبود؛ کد را دستی انتخاب کنید.').waitFor();
 const close=page.getByRole('button',{name:'بستن اطلاعیه'});await close.click();assert.equal(await close.count(),0);
 for(const width of [390,768,1440]){await page.setViewportSize({width,height:900});const columns=await page.locator('.kv-advanced-split').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);assert.equal(columns,width===390?1:2,`split layout at ${width}`);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`no horizontal overflow at ${width}`)}
 await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});const violations=await page.evaluate(async()=> (await window.axe.run(document.querySelector('[aria-label^="ویجت‌های پیشرفته"]'))).violations.map(v=>({id:v.id,impact:v.impact})));assert.deepEqual(violations,[]);
 assert.deepEqual(errors,[]);console.log(`${content.length} advanced widgets saved and published; upload, slots and interactions OK`);
} finally {await browser.close()}
