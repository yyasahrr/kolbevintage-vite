import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { readFileSync } from "node:fs";

// Optional local font for network-isolated visual QA; production CSS is unchanged.
const QA_FONT = process.env.ADMIN_QA_FONT_PATH ? readFileSync(process.env.ADMIN_QA_FONT_PATH).toString("base64") : null;

const WIDTHS = [320, 390, 768, 1024, 1280, 1440] as const;
const PERMISSIONS = [
  "dashboard:view", "orders:view", "orders:edit", "orders:export", "catalog:view", "catalog:edit", "catalog:publish",
  "looks:view", "looks:edit", "looks:publish", "content:view", "content:edit", "content:publish", "design:view", "design:edit",
  "customers:view", "customers:edit", "customers:export", "campaigns:view", "campaigns:edit", "inventory:view", "inventory:adjust",
  "inventory:approve", "finance:view", "finance:refund", "finance:approve", "integrations:view", "integrations:manage",
  "settings:view", "settings:edit", "security:view", "security:edit", "staff:manage",
];
const orders = [
  { id: "kv-1001", customer: "آوا محمدی", created_at: "2026-11-05T10:00:00.000Z", status: "paid", payment_status: "settled", fulfillment_status: "unfulfilled", total: "1250000", currency: "IRT", item_count: 2 },
  { id: "kv-1002", customer: "نگار احمدی", created_at: "2026-11-04T10:00:00.000Z", status: "shipped", payment_status: "settled", fulfillment_status: "shipped", total: "780000", currency: "IRT", item_count: 1 },
  { id: "kv-1003", customer: "سارا رضایی", created_at: "2026-11-03T10:00:00.000Z", status: "pending_payment", payment_status: "unpaid", fulfillment_status: "unfulfilled", total: "940000", currency: "IRT", item_count: 3 },
];
const list = { total: 53, page: 1, pageSize: 25, orders };

async function mockApi(page: Page, mode: { value: "data" | "empty" | "error" }) {
  // External font hosts are not part of the UI under test and may be blocked in CI.
  const fontCss = QA_FONT ? `@font-face{font-family:Vazirmatn;src:url(data:font/woff2;base64,${QA_FONT}) format('woff2');font-weight:100 900;font-style:normal;font-display:swap;}` : "";
  await page.route("https://fonts.googleapis.com/**", (route) => route.fulfill({ status: 200, contentType: "text/css", body: fontCss }));
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/admin/me") return json({ authenticated: true, subject: "owner", staff: null, role: "owner", permissions: PERMISSIONS, openAccess: false });
    if (path === "/api/bootstrap") return json({ admin: null, ops: { setup: { done: true, step: 0 } }, auth: { admin: true, customer: null }, updatedAt: {}, server: { version: 1, time: "2026-11-05T10:00:00.000Z" } });
    if (path === "/api/health") return json({ adminUrl: null, ok: true });
    if (path === "/api/admin/dashboard") return json({ counts: { total: 3, settled: 2, attention: 2 }, statuses: [{ status: "paid", count: 1 }], recent: orders, products: [] });
    if (path === "/api/admin/orders-list") {
      if (mode.value === "error") return json({ error: "QA server error" }, 500);
      if (mode.value === "empty") return json({ total: 0, page: 1, pageSize: 25, orders: [] });
      return json({ ...list, page: Number(url.searchParams.get("page") ?? 1) });
    }
    if (path.startsWith("/api/admin/orders-list/")) return json({ order: { ...orders[0], subtotal: "1200000", discount_total: "0", shipping_total: "50000" }, lines: [] });
    if (path === "/api/commerce/orders" || path === "/api/commerce/admin/payments") return json([]);
    if (path === "/api/track") return route.fulfill({ status: 204, body: "" });
    return json({});
  });
}

async function openOrders(page: Page) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator(".ord")).toBeVisible();
  await expect(page.locator(".ord-pagination, .ord-error")).toBeVisible();
}

async function noHorizontalOverflow(page: Page) {
  const sizes = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>(".ad-main");
    const orders = document.querySelector<HTMLElement>(".ord");
    return {
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
      orders: orders ? orders.scrollWidth - orders.clientWidth : 0,
    };
  });
  for (const [surface, overflow] of Object.entries(sizes)) expect(overflow, `${surface} horizontal overflow`).toBeLessThanOrEqual(1);
}

async function checkDialog(page: Page, selector: string) {
  await expect.poll(() => page.locator(selector).evaluate((element) => element.contains(document.activeElement))).toBe(true);
  // Opening drawers may intentionally begin beyond the viewport; inspect the
  // settled position rather than disabling or racing their shared motion.
  await expect.poll(() => page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return Math.max(-rect.left, rect.right - window.innerWidth, -rect.top, rect.bottom - window.innerHeight);
  })).toBeLessThanOrEqual(1);
  const result = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      focused: element.contains(document.activeElement),
      scrollLocked: document.body.style.overflow === "hidden",
    };
  });
  expect(result.left, `${selector} escapes the left viewport edge`).toBeGreaterThanOrEqual(-1);
  expect(result.right, `${selector} escapes the right viewport edge`).toBeLessThanOrEqual(result.viewportWidth + 1);
  expect(result.top, `${selector} escapes the top viewport edge`).toBeGreaterThanOrEqual(-1);
  expect(result.bottom, `${selector} escapes the bottom viewport edge`).toBeLessThanOrEqual(result.viewportHeight + 1);
  expect(result.focused, `${selector} did not receive/trap focus`).toBe(true);
  expect(result.scrollLocked, `${selector} did not lock background scrolling`).toBe(true);
}

async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true, animations: "disabled" });
}

for (const width of WIDTHS) {
  test(`Admin and Orders regression QA — ${width}px`, async ({ page }, testInfo) => {
    const mode = { value: "data" as "data" | "empty" | "error" };
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      sessionStorage.setItem("velours.admin.session.v1", "1");
      localStorage.setItem("kv_admin_theme", "light");
      localStorage.setItem("kv_admin_nav", "0");
    });
    await mockApi(page, mode);

    // Dashboard: the first click expands, the second collapses, and keyboard
    // activation follows the same transition without navigating the parent.
    await page.goto("/#/admin", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".ad-app")).toBeVisible();
    if (width < 900) {
      await page.getByRole("button", { name: "باز کردن منوی پنل" }).click();
      await checkDialog(page, "#admin-navigation");
    }
    const navigation = page.locator("#admin-navigation");
    const sales = navigation.getByRole("button", { name: "فروش", exact: true });
    if (width === 1280) {
      await expect(page.locator("html")).not.toHaveClass(/theme-switching/);
      const motion = await navigation.locator(".ad-nav-submenu").first().evaluate((element) => {
        const style = getComputedStyle(element);
        return { property: style.transitionProperty, seconds: Number.parseFloat(style.transitionDuration) };
      });
      expect(motion.property).toContain("grid-template-rows");
      expect(motion.seconds).toBeGreaterThanOrEqual(0.15);
      expect(motion.seconds).toBeLessThanOrEqual(0.2);
    }
    await expect(sales).toHaveAttribute("aria-expanded", "false");
    await sales.click();
    await expect(sales).toHaveAttribute("aria-expanded", "true");
    await expect(navigation.getByRole("link", { name: "سفارش‌ها", exact: true })).toBeVisible();
    if (width < 900) await expect(navigation).toBeVisible();
    await sales.click();
    await expect(sales).toHaveAttribute("aria-expanded", "false");
    await sales.focus();
    await page.keyboard.press("Enter");
    await expect(sales).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Space");
    await expect(sales).toHaveAttribute("aria-expanded", "false");
    for (const label of ["کالا و انبار", "ویترین", "مشتریان", "سیستم"]) {
      const group = navigation.getByRole("button", { name: label, exact: true });
      await group.click();
      await expect(group).toHaveAttribute("aria-expanded", "true");
      await group.click();
      await expect(group).toHaveAttribute("aria-expanded", "false");
    }
    await sales.click();
    await expect(sales).toHaveAttribute("aria-expanded", "true");
    await screenshot(page, testInfo, `navigation-${width}`);
    await navigation.getByRole("link", { name: "سفارش‌ها", exact: true }).click();
    await expect(page).toHaveURL(/#\/admin\/sales\/orders$/);
    await expect(page.locator(".ord-pagination")).toBeVisible();
    if (width < 900) await expect(navigation).toBeHidden();

    if (width < 900) await page.getByRole("button", { name: "باز کردن منوی پنل" }).click();
    await expect(sales).toHaveAttribute("aria-expanded", "true");
    await expect(navigation.locator("[aria-current='page']")).toHaveCount(1);
    await expect(navigation.getByRole("link", { name: "سفارش‌ها", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(sales).not.toHaveAttribute("aria-current", "page");
    if (width < 900) {
      await page.getByRole("button", { name: "بستن منوی پنل" }).click();
      await expect(navigation).toBeHidden();
      await page.getByRole("button", { name: "باز کردن منوی پنل" }).click();
      await expect(navigation).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(navigation).toBeHidden();
    }

    await expect(page.locator(".ad-top")).toBeVisible();
    await expect(page.locator(".ord-breadcrumb")).toBeVisible();
    await expect(page.locator(".ord-tabs button")).toHaveCount(8);
    await expect(page.locator(".ord-search input")).toBeVisible();
    await expect(page.locator(".ord-date-trigger")).toBeVisible();
    await expect(page.locator(".ord-sort-field select")).toBeVisible();
    await expect(page.locator(".ord-advanced")).toBeVisible();
    if (width >= 700) {
      await expect(page.locator(".ord-table")).toBeVisible();
      await expect(page.locator(".ord-toolbar .ord-desktop-filter").first()).toBeVisible();
    } else {
      await expect(page.locator(".ord-mobile-card").first()).toBeVisible();
      await expect(page.locator(".ord-toolbar .ord-desktop-filter").first()).toBeHidden();
    }

    const tabGeometry = await page.locator(".ord-tabs button").evaluateAll((buttons) => buttons.map((button) => {
      const rect = button.getBoundingClientRect();
      return { left: rect.left, right: rect.right, width: rect.width, scrollWidth: button.scrollWidth, clientWidth: button.clientWidth };
    }));
    const sorted = [...tabGeometry].sort((a, b) => a.left - b.left);
    for (let index = 1; index < sorted.length; index += 1) expect(sorted[index - 1].right, "tab labels/buttons overlap").toBeLessThanOrEqual(sorted[index].left + 1);
    for (const tab of tabGeometry) expect(tab.scrollWidth, "tab label is clipped").toBeLessThanOrEqual(tab.clientWidth + 1);
    await page.getByRole("button", { name: "لغوشده", exact: true }).click();
    await expect(page.getByRole("button", { name: "لغوشده", exact: true })).toHaveAttribute("aria-pressed", "true");
    const selectedInView = await page.getByRole("button", { name: "لغوشده", exact: true }).evaluate((button) => {
      const tab = button.getBoundingClientRect();
      const viewport = button.parentElement!.getBoundingClientRect();
      return tab.left >= viewport.left - 1 && tab.right <= viewport.right + 1;
    });
    expect(selectedInView, "selected tab did not scroll into view").toBe(true);

    await page.locator(".ord-advanced").click();
    await expect(page.locator(".ord-sheet[aria-modal='true']")).toBeVisible();
    await expect(page.locator(".ord-sheet select")).toHaveCount(3);
    await checkDialog(page, ".ord-sheet");
    await noHorizontalOverflow(page);
    await screenshot(page, testInfo, `advanced-${width}`);
    await page.keyboard.press("Escape");
    await expect(page.locator(".ord-sheet")).toHaveCount(0);
    await page.locator(".ord-date-trigger").click();
    await expect(page.locator(".ord-calendar[aria-modal='true']")).toBeVisible();
    await checkDialog(page, ".ord-calendar");
    await noHorizontalOverflow(page);
    await screenshot(page, testInfo, `calendar-${width}`);
    await page.keyboard.press("Escape");
    await expect(page.locator(".ord-calendar")).toHaveCount(0);

    await page.getByRole("button", { name: "مشاهده", exact: true }).first().click();
    await expect(page.locator(".ord-drawer[aria-modal='true']")).toBeVisible();
    await checkDialog(page, ".ord-drawer");
    await noHorizontalOverflow(page);
    await screenshot(page, testInfo, `preview-${width}`);
    await page.keyboard.press("Escape");
    await expect(page.locator(".ord-drawer")).toHaveCount(0);

    await page.locator(".ad-cmd-trigger").click();
    await expect(page.locator(".ad-palette[aria-modal='true']")).toBeVisible();
    await checkDialog(page, ".ad-palette");
    await page.getByRole("textbox", { name: "جست‌وجوی بخش" }).fill("فروش");
    await expect(page.locator(".ad-palette-item")).toHaveCount(7);
    await expect(page.locator(".ad-palette-item").first()).toContainText("سفارش‌ها");
    await noHorizontalOverflow(page);
    await screenshot(page, testInfo, `palette-${width}`);
    await page.keyboard.press("Escape");
    await expect(page.locator(".ad-palette")).toHaveCount(0);
    await page.locator(".ad-bell > button").click();
    await expect(page.locator(".ad-bell-pop")).toBeVisible();
    await noHorizontalOverflow(page);
    await screenshot(page, testInfo, `notifications-${width}`);
    await page.keyboard.press("Escape");
    await expect(page.locator(".ad-bell-pop")).toHaveCount(0);

    await noHorizontalOverflow(page);
    await screenshot(page, testInfo, `orders-data-${width}`);

    mode.value = "empty";
    await openOrders(page);
    await expect(page.locator(".ord-empty")).toBeVisible();
    await expect(page.locator(".ord-error")).toHaveCount(0);
    await noHorizontalOverflow(page);
    await screenshot(page, testInfo, `orders-empty-${width}`);

    mode.value = "error";
    await openOrders(page);
    await expect(page.locator(".ord-error")).toBeVisible();
    await expect(page.locator(".ord-empty")).toHaveCount(0);
    await noHorizontalOverflow(page);
    await screenshot(page, testInfo, `orders-error-${width}`);

    // Retry must issue a real new request and recover when the transport recovers.
    mode.value = "data";
    await page.locator(".ord-error").getByRole("button", { name: "تلاش دوباره" }).click();
    await expect(page.locator(".ord-pagination")).toBeVisible();
    await expect(page.locator(".ord-error")).toHaveCount(0);
    if (width === 1280) {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const seconds = await navigation.locator(".ad-nav-submenu").first().evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration));
      expect(seconds, "reduced-motion submenu transition").toBeLessThanOrEqual(0.001);
    }
    expect(runtimeErrors, "uncaught browser runtime errors").toEqual([]);
  });
}
