// Read-only test, requires a local disposable database with 105 recent articles and one older category.
import {chromium} from 'playwright-core';import assert from 'node:assert/strict';
const base=process.env.BROWSER_TEST_BASE;if(!base||!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)||!process.env.PLAYWRIGHT_CHROMIUM_PATH)throw new Error('Use a local disposable database and Chromium');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});try{
for(const width of [320,390,768,1440]){const p=await browser.newPage({viewport:{width,height:900}});p.setDefaultTimeout(15000);const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto(`${base}/#/journal`,{waitUntil:'networkidle'});
  await p.getByRole('button',{name:'دسته قدیمی',exact:true}).click();await p.getByText('مقاله قدیمی انتخابی',{exact:true}).first().waitFor();assert.equal(await p.getByText('مقاله تازه ۱۰۵',{exact:true}).count(),0);
  if(width===390){await p.waitForTimeout(2000);await p.addScriptTag({path:'node_modules/axe-core/axe.min.js'});const issues=await p.evaluate(()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}).then(r=>r.violations.filter(v=>['serious','critical'].includes(v.impact)).map(v=>v.id)));assert.deepEqual(issues,[]);}
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow at ${width}`);assert.deepEqual(errors,[]);await p.close();console.log(`Journal categories ${width}: OK`);
}
}finally{await browser.close()}
