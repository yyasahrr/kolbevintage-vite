import { test, expect, type Page } from "@playwright/test";

/**
 * The seven surfaces the owner actually opens, in both themes, at four widths.
 *
 * The list is deliberately short: a golden that nobody looks at is just a slow test. These
 * are the screens where the review found real problems (touching panels, a drifting
 * product form, a returns table nobody could read), so a regression here is the expensive
 * kind.
 */
const SCREENS = [
  { id: "dashboard", path: "/#/admin", label: "داشبورد" },
  { id: "orders", path: "/#/admin/sales/orders", label: "سفارش‌ها" },
  { id: "products", path: "/#/admin/stock/products", label: "محصولات" },
  { id: "returns", path: "/#/admin/sales/returns", label: "مرجوعی‌ها" },
  { id: "cashback", path: "/#/admin/sales/cashback", label: "کشبک" },
  { id: "reports", path: "/#/admin/sales/reports", label: "گزارش‌ها" },
] as const;

const THEMES = ["light", "dark"] as const;

async function openPanel(page: Page, path: string, theme: (typeof THEMES)[number]) {
  // Hide the first-run wizard only in the intercepted test response; never
  // write the store's real settings just to take a screenshot.
  await page.route("**/api/bootstrap", async route => {
    const response = await route.fetch();
    if (!response.ok()) { await route.fulfill({response}); return; }
    const body = await response.json();
    if (body.ops && typeof body.ops === "object") body.ops.setup = {done:true,step:0};
    await route.fulfill({response,json:body});
  });
  await page.addInitScript((value) => {
    try {
      localStorage.setItem("kv_admin_theme", value);
      // the review-mode banner is environment state, not design: keep it out of the diff
      sessionStorage.setItem("kv_goldens", "1");
    } catch {
      /* private mode */
    }
  }, theme);

  await page.goto(path, { waitUntil: "domcontentloaded" });

  // the panel shell exists and the screen behind it has painted
  await page.waitForSelector(".ad-app", { timeout: 30_000 });
  await page.waitForFunction(() => document.fonts?.status === "loaded", undefined, { timeout: 15_000 }).catch(() => undefined);
  await page.waitForLoadState("networkidle").catch(() => undefined);

  // no animation may be mid-flight when the shutter clicks
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      scroll-behavior: auto !important;
    }`,
  });
  await page.waitForTimeout(250);
}

for (const theme of THEMES) {
  for (const screen of SCREENS) {
    test(`${screen.label} — ${theme}`, async ({ page }, testInfo) => {
      await openPanel(page, screen.path, theme);
      await expect(page).toHaveScreenshot(`${screen.id}-${theme}-${testInfo.project.name}.png`, {
        fullPage: true,
      });
    });
  }
}

/**
 * The product editor is its own case: the owner's complaint was indentation inside the
 * modal, so the modal is captured open, on the tab where the two columns live.
 */
for (const theme of THEMES) {
  test(`فرم محصول — ${theme}`, async ({ page }, testInfo) => {
    await openPanel(page, "/#/admin/stock/products", theme);
    const edit = page.locator('button[aria-label^="ویرایش "]').first();
    await expect(edit).toBeVisible({ timeout: 15_000 });
    await edit.click();
    await page.waitForSelector(".ad-modal.is-wide", { timeout: 10_000 });
    await page.waitForTimeout(200);
    await expect(page.locator(".ad-modal.is-wide")).toHaveScreenshot(`product-form-${theme}-${testInfo.project.name}.png`);
  });
}
