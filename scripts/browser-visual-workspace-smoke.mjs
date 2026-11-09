// Destructive browser test: only a disposable local database and uploads directory.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
if (process.env.BROWSER_MUTATING_TEST !== '1') throw new Error('Requires BROWSER_MUTATING_TEST=1 and disposable DB/uploads');
const base = process.env.BROWSER_TEST_BASE || 'http://127.0.0.1:8099';
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error('Only local disposable test servers allowed');
const panelPath = process.env.BROWSER_PANEL_PATH || '/panel?view=studio';
const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_PATH,args:['--no-sandbox']});
try {
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({viewport:{width,height:844}});
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + panelPath, {waitUntil:'networkidle'});
    await page.getByLabel('نام صفحه جدید').fill(`آزمون محیط ${width} ${Date.now()}`);
    await page.getByRole('button',{name:'ساخت صفحه',exact:true}).click();
    const dialog = page.getByRole('dialog',{name:'ویرایشگر تصویری صفحه'});
    await dialog.waitFor();
    const name = page.getByLabel('نام صفحه تصویری');
    await name.fill('صفحه آزمایشی');
    assert.equal(await name.inputValue(), 'صفحه آزمایشی');
    if (width <= 390) {
      const tab = dialog.getByRole('button',{name:'ویجت‌ها',exact:true});
      await tab.focus();
      await page.keyboard.press('Enter');
    }
    await page.getByLabel('جستجوی ویجت').fill('هیچ‌چیزی');
    await page.getByText('ویجتی پیدا نشد.').waitFor();
    await page.getByLabel('جستجوی ویجت').fill('');
    await page.getByLabel('انتخاب ویجت برای افزودن').selectOption('Heading');
    await dialog.getByRole('button',{name:'افزودن',exact:true}).click();
    if(width <= 390) await dialog.getByRole('button',{name:'تنظیمات',exact:true}).click();
    await page.locator('input[title="متن"]:visible').first().fill('عنوان آزمایشی');
    await page.frameLocator('iframe').getByText('عنوان آزمایشی').waitFor();
    const saveButton=dialog.getByRole('button',{name:'ذخیره پیش‌نویس'});assert(await saveButton.isVisible());const bounds=await saveButton.boundingBox();assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width,'save button fits viewport');
    await dialog.getByRole('button',{name:'ذخیره پیش‌نویس'}).click();
    await page.getByText('پیش‌نویس ذخیره شد؛ انتشار جداگانه انجام می‌شود.').waitFor();
    await page.addScriptTag({path:'node_modules/axe-core/axe.min.js'});
    const violations = await page.evaluate(async()=> (await window.axe.run(document.querySelector('[role="dialog"]'))).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
    assert.deepEqual(violations, []);
    assert.deepEqual(errors, []);
    console.log(`visual workspace ${width}px: insertion, edit, save, keyboard and axe OK`);
    await page.close();
  }
} finally { await browser.close(); }
