#!/usr/bin/env node
/**
 * panel-smoke — renders the panel in a DOM (jsdom) and proves each screen has content.
 *
 * There is no browser in this environment, and "the page is empty" is exactly the kind of
 * bug a stylesheet audit cannot see. This one can: it mounts the real app, waits for the
 * data, and counts what actually landed in <main> for a list of routes.
 *
 * Needs the API on `PORT` (default 4000), because the panel loads real data.
 * Run: npm run smoke:panel
 */
import { JSDOM } from "jsdom";

const PORT = Number(process.env.GOLDENS_PORT ?? 4000);
const BASE = process.env.PANEL_BASE ?? `http://localhost:${PORT}`;
const ROUTES = [
  ["#/admin", "dashboard", ".ad-kpis"],
  ["#/admin/sales/orders", "orders", ".ad-head"],
  ["#/admin/stock/products", "products", ".ad-table, .ad-empty"],
  ["#/admin/sales/returns", "returns", ".ad-head"],
  ["#/admin/sales/cashback", "cashback", ".ad-ladder, .ad-form-grid, .ad-card"],
  ["#/admin/sales/reports", "reports", ".ad-report, .ad-report-grid, .ad-report-chart"],
  ["#/admin/experience/appearance", "appearance", ".ad-theme"],
  ["#/admin/experience/looks", "looks", ".ad-head"],
  ["#/admin/experience/widgets", "widgets", ".ad-widget-row, .ad-empty, .ad-card"],
  ["#/admin/settings", "settings", ".ad-card, .ad-form-grid"],
  ["#/admin/system/health", "health", ".ad-card, .ad-kpi, .ad-empty"],
];

function globals(window) {
  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
  globalThis.location = window.location;
  globalThis.history = window.history;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  const media = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.matchMedia = window.matchMedia ?? media;
  window.matchMedia = globalThis.matchMedia;
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
  globalThis.scrollTo = () => {};
  window.scrollTo = () => {};
  const realFetch = globalThis.fetch;
  const proxy = (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    return realFetch(url.startsWith("http") ? url : `${BASE}${url}`, init);
  };
  globalThis.fetch = proxy;
  window.fetch = proxy;
}

async function main() {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
  const { createRoot } = await import("react-dom/client");
  const React = await import("react");
  const { default: App } = await vite.ssrLoadModule("/src/App.tsx");

  let failed = 0;
  console.log(`panel-smoke — ${ROUTES.length} routes against ${BASE}\n`);
  console.log("  screen        main?  nodes  expected selector      text");
  for (const [hash, name, selector] of ROUTES) {
    const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
      url: `${BASE}/${hash}`,
      pretendToBeVisual: true,
    });
    globals(dom.window);
    const root = createRoot(dom.window.document.getElementById("root"));
    root.render(React.createElement(App));
    await new Promise((r) => setTimeout(r, 4500));

    const main = dom.window.document.querySelector(".ad-main");
    const hit = dom.window.document.querySelectorAll(selector).length;
    const clone = main?.cloneNode(true);
    clone?.querySelectorAll(".ad-banner").forEach((b) => b.remove());
    const text = (clone?.textContent ?? "").replace(/\s+/g, " ").trim();
    const ok = Boolean(main) && hit > 0 && text.length > 40;
    if (!ok) failed += 1;
    console.log(
      `  ${name.padEnd(13)} ${(main ? "yes" : "NO").padEnd(6)} ${String(main?.children.length ?? 0).padEnd(6)} ${String(hit).padEnd(22)} ${(ok ? "ok  " : "✗   ") + text.slice(0, 46)}`,
    );
    if (!ok && process.env.SMOKE_VERBOSE) {
      const body = clone?.querySelector(".ad-group-body");
      console.log("      body:", (body?.innerHTML ?? "(no .ad-group-body)").replace(/\s+/g, " ").slice(0, 240));
    }
    root.unmount();
    dom.window.close();
  }

  await vite.close();
  console.log(failed ? `\n${failed} screen(s) rendered nothing.` : "\nsmoke: every screen rendered content.");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("panel-smoke failed:", error);
  process.exit(1);
});
