import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", {
  url: "http://localhost:4000/#/admin/experience/appearance",
  pretendToBeVisual: true,
});
const w = dom.window;
globalThis.window = w;
globalThis.document = w.document;
Object.defineProperty(globalThis, "navigator", { value: w.navigator, configurable: true });
globalThis.location = w.location;
globalThis.history = w.history;
globalThis.HTMLElement = w.HTMLElement;
globalThis.Element = w.Element;
globalThis.Node = w.Node;
globalThis.getComputedStyle = w.getComputedStyle.bind(w);
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.matchMedia = w.matchMedia ?? (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
w.matchMedia = globalThis.matchMedia;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
globalThis.scrollTo = () => {};
w.scrollTo = () => {};

const realFetch = globalThis.fetch;
const stub = (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  const abs = url.startsWith("http") ? url : `http://localhost:4000${url}`;
  return realFetch(abs, { ...init });
};
globalThis.fetch = stub;
w.fetch = stub;

setTimeout(() => { console.log("WATCHDOG: no result in 25s"); process.exit(2); }, 25000);
const { createServer } = await import("vite");
const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
try {
  const { default: App } = await vite.ssrLoadModule("/src/App.tsx");
  const { createRoot } = await import("react-dom/client");
  const React = await import("react");
  const root = createRoot(document.getElementById("root"));
  root.render(React.createElement(App));
  await new Promise((r) => setTimeout(r, 5000));

  const body = document.body;
  const main = body.querySelector(".ad-main");
  console.log("hash:", w.location.hash);
  console.log(".ad-themes:", body.querySelectorAll(".ad-themes").length, "| .ad-theme cards:", body.querySelectorAll(".ad-theme").length);
  console.log(".ad-main found:", !!main, "| children:", main?.children.length);
  console.log("nav items:", body.querySelectorAll(".ad-nav-item").length);
  console.log("main text:", (main?.textContent ?? "").replace(/\s+/g, " ").slice(0, 200));

  const htmlRoot = document.documentElement;
  console.log("\n--- theme application");
  console.log("dataset.theme:", htmlRoot.dataset.theme);
  console.log("--color-bone:", htmlRoot.style.getPropertyValue("--color-bone"));
  console.log("--font-display:", htmlRoot.style.getPropertyValue("--font-display").slice(0, 40));

  // apply the real stylesheet so computed styles mean something
  const { readFileSync } = await import("node:fs");
  const css = readFileSync("src/styles/admin.css", "utf8");
  const styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  const cards = body.querySelectorAll(".ad-theme");
  const cs = (el) => (el ? w.getComputedStyle(el) : null);
  const report = (label, el, props) => {
    const st = cs(el);
    if (!st) return console.log(label, "= (missing)");
    console.log(label, "=", props.map((p) => `${p}:${st.getPropertyValue(p)}`).join(" "));
  };
  console.log("\n--- computed styles");
  report(".ad-app", body.querySelector(".ad-app"), ["display", "color", "background-color"]);
  report(".ad-themes", body.querySelector(".ad-themes"), ["display", "grid-template-columns", "gap"]);
  report(".ad-theme", cards[0], ["display", "flex-direction", "background-color", "border-top-color", "padding"]);
  report(".ad-theme b", cards[0]?.querySelector(":scope > b"), ["font-size", "color", "display"]);
  report(".ad-theme small", cards[0]?.querySelector(":scope > small"), ["font-size", "color", "display"]);
  report(".ad-theme-prev", cards[0]?.querySelector(".ad-theme-prev"), ["height", "background-color", "border-top-color"]);
  console.log("card[0] full:", cards[0]?.outerHTML.slice(0, 600));
  console.log("card[0] outer:", cards[0]?.outerHTML.slice(0, 220));
  console.log("card[3] label:", cards[3]?.querySelector("b")?.textContent);

  cards[3]?.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 1500));
  console.log("\nafter clicking card[3]:");
  console.log("dataset.theme:", htmlRoot.dataset.theme);
  console.log("--color-bone:", htmlRoot.style.getPropertyValue("--color-bone"));
  console.log("--radius-lg:", htmlRoot.style.getPropertyValue("--radius-lg"));
  const ops = JSON.parse(w.localStorage.getItem("kv_ops_cache") ?? "null");
  console.log("cached siteTheme:", ops?.siteTheme ?? "(no cache key)");
  process.exit(0);
} catch (error) {
  console.error("PROBE ERROR:", error);
  process.exit(1);
} finally {
  void vite.close();
}
