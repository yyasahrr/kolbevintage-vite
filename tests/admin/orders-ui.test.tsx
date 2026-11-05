import test, { after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { JSDOM } from "jsdom";
import { createServer } from "vite";
import { todayTehran } from "../../src/utils/persian-calendar.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/#/admin/sales/orders", pretendToBeVisual: true });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  MouseEvent: dom.window.MouseEvent,
  KeyboardEvent: dom.window.KeyboardEvent,
  Event: dom.window.Event,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
});
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
// React was imported before this DOM existed, so its legacy jsdom input
// polyfill expects these no-op IE APIs during user-event keyboard input.
Object.assign(dom.window.HTMLElement.prototype, { attachEvent() {}, detachEvent() {} });
const media = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
Object.assign(dom.window, { matchMedia: media });
Object.assign(globalThis, { matchMedia: media });

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
const { OrdersList } = await vite.ssrLoadModule("/src/admin/OrdersList.tsx") as typeof import("../../src/admin/OrdersList.tsx");
after(async () => { await vite.close(); });

const order = {
  id: "kv-1001",
  customer: "آوا",
  created_at: "2026-11-05T10:00:00.000Z",
  status: "paid",
  payment_status: "settled",
  fulfillment_status: "unfulfilled",
  total: "125000",
  currency: "IRT",
  item_count: 2,
};
const result = (orders = [order], total = orders.length, page = 1) => ({ total, page, pageSize: 25, orders });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const roots: { root: Root; container: HTMLElement }[] = [];
afterEach(async () => {
  while (roots.length) {
    const mounted = roots.pop()!;
    await act(async () => mounted.root.unmount());
    mounted.container.remove();
  }
});
async function settle() {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
  });
}
async function renderOrders() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push({ root, container });
  await act(async () => { root.render(<MemoryRouter initialEntries={["/admin/sales/orders"]}><OrdersList /></MemoryRouter>); });
  await settle();
  return container;
}
async function click(element: Element) {
  await act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })); });
  await settle();
}
async function changeSelect(element: HTMLSelectElement, value: string) {
  await act(async () => {
    element.value = value;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await settle();
}
async function typeSearch(input: HTMLInputElement, value: string) {
  const user = userEvent.setup({ document });
  await act(async () => {
    await user.clear(input);
    await user.type(input, value);
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
  await settle();
}
const byText = <T extends Element>(container: ParentNode, selector: string, text: string) => {
  const found = Array.from(container.querySelectorAll<T>(selector)).find((element) => element.textContent?.trim() === text);
  assert.ok(found, `missing ${selector} with text ${text}`);
  return found;
};
const requestedUrls = (mock: { calls: { arguments: unknown[] }[] }) => mock.calls.map((call) => new URL(String(call.arguments[0]), "http://localhost"));

test("all eight status tabs are interactive and send the supported backend filter", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => json(result()));
  const container = await renderOrders();
  const tabs = container.querySelectorAll(".ord-tabs button");
  assert.equal(tabs.length, 8);
  assert.deepEqual(Array.from(tabs).map((tab) => tab.textContent), ["همه سفارش‌ها", "نیازمند اقدام", "در انتظار پرداخت", "پرداخت‌شده", "در حال آماده‌سازی", "ارسال‌شده", "تحویل‌شده", "لغوشده"]);
  await click(byText(container, ".ord-tabs button", "پرداخت‌شده"));
  assert.equal(byText(container, ".ord-tabs button", "پرداخت‌شده").getAttribute("aria-pressed"), "true");
  assert.equal(requestedUrls(fetchMock.mock).at(-1)?.searchParams.get("status"), "paid");
  await click(byText(container, ".ord-tabs button", "نیازمند اقدام"));
  assert.equal(requestedUrls(fetchMock.mock).at(-1)?.searchParams.get("status"), "attention");
});

test("payment and fulfillment filters update results independently", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => json(result()));
  const container = await renderOrders();
  const selects = container.querySelectorAll<HTMLSelectElement>(".ord-toolbar select");
  await changeSelect(selects[0], "settled");
  let url = requestedUrls(fetchMock.mock).at(-1)!;
  assert.equal(url.searchParams.get("payment"), "settled");
  assert.equal(url.searchParams.get("fulfillment"), "");
  await changeSelect(selects[1], "picking");
  url = requestedUrls(fetchMock.mock).at(-1)!;
  assert.equal(url.searchParams.get("payment"), "settled");
  assert.equal(url.searchParams.get("fulfillment"), "picking");
  assert.ok(container.querySelector(".ord-active-filters"));
});

test("the Jalali range applies ISO Gregorian dates to the API", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => json(result()));
  const container = await renderOrders();
  await click(container.querySelector(".ord-date-trigger")!);
  assert.ok(container.querySelector(".ord-calendar"));
  await click(byText(container, ".ord-presets button", "امروز"));
  await click(byText(container, ".ord-calendar footer button", "اعمال بازه"));
  const url = requestedUrls(fetchMock.mock).at(-1)!;
  assert.equal(url.searchParams.get("from"), todayTehran());
  assert.equal(url.searchParams.get("to"), todayTehran());
  assert.equal(container.querySelector(".ord-calendar"), null);
});

test("empty state appears for a valid empty response and zero-page pagination is disabled", async (t) => {
  t.mock.method(globalThis, "fetch", async () => json(result([], 0)));
  const container = await renderOrders();
  assert.ok(byText(container, ".ord-empty strong", "سفارشی پیدا نشد"));
  assert.equal(container.querySelector("[role='alert']"), null);
  assert.match(container.querySelector(".ord-pagination")?.textContent ?? "", /صفحه ۱ از ۱/);
  const buttons = container.querySelectorAll<HTMLButtonElement>(".ord-pagination button");
  assert.equal(buttons[0].disabled, true);
  assert.equal(buttons[1].disabled, true);
});

test("API error is distinct from empty state and Retry recovers", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return calls === 1 ? json({ error: "down" }, 500) : json(result());
  });
  const container = await renderOrders();
  assert.ok(byText(container, ".ord-error strong", "سرور سفارش‌ها پاسخ نداد"));
  assert.equal(container.querySelector(".ord-empty"), null);
  await click(byText(container, ".ord-error button", "تلاش دوباره"));
  assert.equal(container.querySelector(".ord-error"), null);
  assert.ok(container.querySelector(".ord-table"));
  assert.equal(calls, 2);
});

test("unauthorized response has its own error treatment", async (t) => {
  t.mock.method(globalThis, "fetch", async () => json({ error: "forbidden" }, 403));
  const container = await renderOrders();
  assert.ok(container.querySelector(".ord-error.is-denied"));
  assert.ok(byText(container, ".ord-error strong", "دسترسی به سفارش‌ها ندارید"));
  assert.equal(container.querySelector(".ord-empty"), null);
});

test("pagination requests page two when multiple pages exist", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const page = Number(new URL(String(input), "http://localhost").searchParams.get("page"));
    return json(result([{ ...order, id: `kv-${page}` }], 50, page));
  });
  const container = await renderOrders();
  assert.match(container.querySelector(".ord-pagination")?.textContent ?? "", /صفحه ۱ از ۲/);
  await click(byText(container, ".ord-pagination button", "بعدی"));
  assert.equal(requestedUrls(fetchMock.mock).at(-1)?.searchParams.get("page"), "2");
  assert.match(container.querySelector(".ord-pagination")?.textContent ?? "", /صفحه ۲ از ۲/);
  assert.equal((byText(container, ".ord-pagination button", "بعدی") as HTMLButtonElement).disabled, true);
});

test("search accepts Persian and Latin numerals", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => json(result()));
  const container = await renderOrders();
  const input = container.querySelector<HTMLInputElement>(".ord-search input")!;
  await typeSearch(input, "۱۲۳٤٥");
  assert.equal(requestedUrls(fetchMock.mock).at(-1)?.searchParams.get("q"), "12345");
  await typeSearch(input, "67890");
  assert.equal(requestedUrls(fetchMock.mock).at(-1)?.searchParams.get("q"), "67890");
});

test("advanced filters, date dialog and their controls are operable and Escape restores the page", async (t) => {
  t.mock.method(globalThis, "fetch", async () => json(result()));
  const container = await renderOrders();
  const advanced = container.querySelector<HTMLButtonElement>(".ord-advanced")!;
  assert.equal(advanced.disabled, false);
  await click(advanced);
  assert.ok(container.querySelector(".ord-sheet[aria-modal='true']"));
  const enabledControls = Array.from(container.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(".ord-sheet button, .ord-sheet select"));
  assert.ok(enabledControls.length >= 5);
  assert.ok(enabledControls.every((control) => !control.disabled));
  await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  await settle();
  assert.equal(container.querySelector(".ord-sheet"), null);
  assert.equal(advanced.getAttribute("aria-expanded"), "false");
  for (const button of Array.from(container.querySelectorAll<HTMLButtonElement>("button"))) {
    assert.ok((button.textContent ?? "").trim() || button.getAttribute("aria-label"), "a button has no accessible name");
  }
});
