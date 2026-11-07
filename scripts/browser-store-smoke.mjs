/** Non-destructive browser check: supply a running local preview and Chromium.
 * PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium npm run test:browser-store
 * Does not place orders; normal page telemetry may still be sent. */
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_PATH;
if(!executablePath) throw new Error("Set PLAYWRIGHT_CHROMIUM_PATH to a working Chromium executable.");
const base=process.env.BROWSER_TEST_BASE || "http://127.0.0.1:8080";
if(!["127.0.0.1","localhost","::1"].includes(new URL(base).hostname)) throw new Error("Run only against a local preview.");
const products=await (await fetch(`${base}/api/products`)).json();
const product=products.find(p=>p.active && p.colors?.length && p.sizes?.length);
const paths=["/","/products",...(product?[`/product/${encodeURIComponent(product.id)}`]:[]),"/style","/style-builder","/landing","/journal","/about","/wishlist","/auth","/account","/checkout","/not-found"];
const browser=await chromium.launch({executablePath,args:["--no-sandbox"]});
try {
  for(const width of [320,390,768,1440]) {
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:"reduce"});
    const errors=[];page.on("pageerror",e=>errors.push(e.message));
    for(const path of paths){
      await page.goto(`${base}/#${path}`,{waitUntil:"networkidle"});
      const dimensions=await page.evaluate(()=>({actual:document.documentElement.scrollWidth,expected:innerWidth}));
      assert.ok(dimensions.actual<=dimensions.expected,`${width} ${path} overflows: ${JSON.stringify(dimensions)}`);
      assert.deepEqual(errors.splice(0),[],`${width} ${path}: runtime exception`);
    }
    await page.goto(`${base}/#/products`,{waitUntil:"networkidle"});
    assert.equal(await page.locator('select[aria-label="مرتب‌سازی"]').count(),1,"sort has an accessible name");
    assert.equal(await page.locator('img[src=""]').count(),0,"no empty image source");
    const categories=page.locator('.sb-cat-tile');
    if(await categories.count()>1){
      const box=await categories.first().boundingBox();
      assert.ok(box.width >= 44 && box.width <= 64, "category tiles remain compact and tappable");
      await categories.nth(1).click();
      await page.waitForFunction(()=>document.querySelectorAll('.sb-cat-tile')[1]?.getAttribute('aria-pressed')==='true');
      await categories.first().click();
      await page.waitForFunction(()=>document.querySelector('.sb-cat-tile')?.getAttribute('aria-pressed')==='true');
    }
    if(product && width<900){
      await page.goto(`${base}/#/product/${encodeURIComponent(product.id)}`,{waitUntil:"networkidle"});
      const dots=page.locator(".pg-mobile .pg-dots button");
      if(await dots.count()>1){
        await page.getByRole("button",{name:"تصویر بعدی"}).first().click();
        await page.waitForTimeout(500);
        assert.equal(await page.locator(".pg-mobile .pg-dots button.is-on").getAttribute("aria-label"),"تصویر 2","RTL gallery advances to second image");
      }
    }
    console.log(`Store routes: ${width}px passed`);
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:390,height:900},reducedMotion:"reduce"});
  for(const path of ["/","/products",...(product?[`/product/${encodeURIComponent(product.id)}`]:[]),"/auth","/checkout"]){
    await page.goto(`${base}/#${path}`,{waitUntil:"networkidle"});await page.waitForTimeout(1300);
    await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
    const violations=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa"]}}).then(r=>r.violations.filter(v=>v.impact==="serious"||v.impact==="critical").map(v=>({id:v.id,nodes:v.nodes.length}))));
    assert.deepEqual(violations,[],`${path}: serious/critical axe violations`);
    console.log(`Axe (390px, reduced motion) ${path}: no serious/critical violations`);
  }
  for(const theme of ["soft","minimal","material","neo-brutalism","glassmorphism","noir","cyber","editorial","liquid-glass","bento","neumorphism","brutalism"]){
    await page.goto(`${base}/?themePreview=${theme}#/products`,{waitUntil:"networkidle"});await page.waitForTimeout(500);
    await page.addScriptTag({path:"node_modules/axe-core/axe.min.js"});
    const violations=await page.evaluate(()=>window.axe.run(document,{runOnly:{type:"tag",values:["wcag2a","wcag2aa","wcag21aa"]}}).then(r=>r.violations.filter(v=>v.impact==="serious"||v.impact==="critical").map(v=>({id:v.id,nodes:v.nodes.length}))));
    assert.deepEqual(violations,[],`${theme}: serious/critical axe violations on products`);
  }
  console.log("Axe (390px, reduced motion) products: 12 theme previews passed");
  await page.close();
} finally {await browser.close();}
