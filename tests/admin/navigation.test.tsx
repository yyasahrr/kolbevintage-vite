import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, useLocation } from "react-router-dom";
import { JSDOM } from "jsdom";
import { Gauge, Package, ShoppingBag } from "lucide-react";
import { AdminNavMenu, useExpandedNavigationGroup, type AdminNavigationItem } from "../../src/admin/AdminNavigation.tsx";
import { useEscape } from "../../src/hooks/useOverlay.ts";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  MouseEvent: dom.window.MouseEvent,
  KeyboardEvent: dom.window.KeyboardEvent,
  getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
});
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });

const items: AdminNavigationItem[] = [
  { id: "dashboard", label: "داشبورد", icon: Gauge },
  { id: "sales", label: "فروش", icon: ShoppingBag, children: [{ id: "orders", label: "سفارش‌ها" }, { id: "campaigns", label: "تخفیف و کمپین" }] },
  { id: "stock", label: "کالا و انبار", icon: Package, children: [{ id: "products", label: "محصولات" }] },
];
const pathFor = (id: string) => id === "dashboard" ? "/admin" : `/admin/${items.find((item) => item.children?.some((child) => child.id === id))?.id}/${id}`;

function Harness({ mobile = false }: { mobile?: boolean }) {
  const location = useLocation();
  const activeRoute = location.pathname === "/admin" ? "dashboard" : location.pathname.split("/").filter(Boolean).pop() ?? "dashboard";
  const activeGroup = items.find((item) => item.children?.some((child) => child.id === activeRoute))?.id ?? null;
  const [expandedGroup, setExpandedGroup] = useExpandedNavigationGroup(activeGroup);
  const [drawerOpen, setDrawerOpen] = useState(true);
  useEscape(mobile && drawerOpen, () => setDrawerOpen(false));
  return <>
    <output data-testid="route">{location.pathname}</output>
    {drawerOpen && <nav aria-label="آزمون ناوبری"><AdminNavMenu items={items} activeRoute={activeRoute} expandedGroup={expandedGroup} getPath={pathFor} onToggleGroup={(id) => setExpandedGroup((current) => current === id ? null : id)} onNavigate={() => { if (mobile) setDrawerOpen(false); }} /></nav>}
  </>;
}

const cleanups: (() => void)[] = [];
afterEach(async () => {
  while (cleanups.length) cleanups.pop()?.();
  await act(async () => { await Promise.resolve(); });
});

async function render(initial = "/admin", mobile = false) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[initial]}><Harness mobile={mobile} /></MemoryRouter>);
    await Promise.resolve();
  });
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
  });
  return container;
}
async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    await Promise.resolve();
  });
}
const button = (container: ParentNode, label: string) => {
  const found = Array.from(container.querySelectorAll("button")).find((item) => item.textContent === label);
  assert.ok(found, `missing button ${label}`);
  return found;
};
const link = (container: ParentNode, label: string) => {
  const found = Array.from(container.querySelectorAll("a")).find((item) => item.textContent === label);
  assert.ok(found, `missing link ${label}`);
  return found;
};

test("Sales starts collapsed on Dashboard without conflating active route and expansion", async () => {
  const container = await render();
  const sales = button(container, "فروش");
  assert.equal(sales.getAttribute("aria-expanded"), "false");
  assert.equal(sales.getAttribute("aria-current"), null);
  assert.equal(document.querySelector("[data-testid='route']")?.textContent, "/admin");
  assert.equal(link(container, "داشبورد").getAttribute("aria-current"), "page");
  assert.equal(container.querySelector("#admin-nav-group-sales")?.getAttribute("aria-hidden"), "true");
});

test("the first click expands Sales immediately without navigating or closing a mobile drawer", async () => {
  const container = await render("/admin", true);
  const sales = button(container, "فروش");
  await click(sales);
  assert.equal(sales.getAttribute("aria-expanded"), "true");
  assert.equal(container.querySelector("#admin-nav-group-sales")?.getAttribute("aria-hidden"), "false");
  assert.equal(document.querySelector("[data-testid='route']")?.textContent, "/admin");
  assert.ok(container.querySelector("nav"));
  assert.equal(sales.getAttribute("aria-controls"), "admin-nav-group-sales");
});

test("the second click collapses Sales", async () => {
  const container = await render();
  const sales = button(container, "فروش");
  await click(sales);
  await click(sales);
  assert.equal(sales.getAttribute("aria-expanded"), "false");
  assert.equal(container.querySelector("#admin-nav-group-sales")?.getAttribute("aria-hidden"), "true");
});

test("a child link navigates to its real route", async () => {
  const container = await render();
  await click(button(container, "فروش"));
  await click(link(container, "سفارش‌ها"));
  assert.equal(document.querySelector("[data-testid='route']")?.textContent, "/admin/sales/orders");
  assert.equal(link(container, "سفارش‌ها").getAttribute("aria-current"), "page");
});

test("direct navigation to an Orders child expands Sales automatically", async () => {
  const container = await render("/admin/sales/orders");
  assert.equal(button(container, "فروش").getAttribute("aria-expanded"), "true");
  assert.equal(link(container, "سفارش‌ها").getAttribute("aria-current"), "page");
});

test("only the exact route receives active-page treatment", async () => {
  const container = await render("/admin/sales/orders");
  assert.equal(container.querySelectorAll("[aria-current='page']").length, 1);
  assert.equal(link(container, "داشبورد").getAttribute("aria-current"), null);
  assert.equal(button(container, "فروش").getAttribute("aria-current"), null);
  assert.ok(button(container, "فروش").classList.contains("is-ancestor"));
  assert.equal(button(container, "فروش").classList.contains("is-on"), false);
});

test("navigation state remains coherent after child and cross-group route changes", async () => {
  const container = await render("/admin/sales/orders");
  await click(link(container, "تخفیف و کمپین"));
  assert.equal(button(container, "فروش").getAttribute("aria-expanded"), "true");
  assert.equal(container.querySelectorAll("[aria-current='page']").length, 1);
  assert.equal(link(container, "تخفیف و کمپین").getAttribute("aria-current"), "page");
  await click(link(container, "داشبورد"));
  await act(async () => { await Promise.resolve(); });
  assert.equal(button(container, "فروش").getAttribute("aria-expanded"), "false");
  assert.equal(link(container, "داشبورد").getAttribute("aria-current"), "page");
});

test("Enter and Space activate a semantic parent button", async () => {
  const container = await render();
  const sales = button(container, "فروش");
  assert.equal(sales.tagName, "BUTTON");
  assert.equal(sales.getAttribute("type"), "button");
  for (const key of ["Enter", " "]) {
    await act(async () => {
      sales.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      // jsdom does not implement a button's native keyboard activation; .click()
      // supplies that platform default after the semantic assertion above.
      (sales as HTMLButtonElement).click();
      sales.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
      await Promise.resolve();
    });
    assert.equal(sales.getAttribute("aria-expanded"), key === "Enter" ? "true" : "false");
  }
});

test("Escape closes the mobile drawer", async () => {
  const container = await render("/admin", true);
  assert.ok(container.querySelector("nav"));
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await Promise.resolve();
  });
  assert.equal(container.querySelector("nav"), null);
});

test("mobile child navigation closes the drawer after navigating", async () => {
  const container = await render("/admin", true);
  await click(button(container, "فروش"));
  await click(link(container, "سفارش‌ها"));
  assert.equal(document.querySelector("[data-testid='route']")?.textContent, "/admin/sales/orders");
  assert.equal(container.querySelector("nav"), null);
});
