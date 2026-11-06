/**
 * A DOM for the panel, without a browser.
 *
 * jsdom gives us the tree, Vite gives us the modules, and the API gives us real data. There
 * is no layout engine and no paint, so this can answer "did the screen render", "what
 * attributes ended up on the controls" and "what does axe think of this markup" — but never
 * "does it look right". Anything visual still needs `npm run goldens` on a machine with a
 * Chromium.
 */
import { JSDOM } from "jsdom";

export const PORT = Number(process.env.GOLDENS_PORT ?? 4000);
export const BASE = process.env.PANEL_BASE ?? `http://localhost:${PORT}`;

function installGlobals(window) {
  globalThis.window = window;
  globalThis.document = window.document;
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
  globalThis.location = window.location;
  globalThis.history = window.history;
  globalThis.HTMLElement = window.HTMLElement;
  // React's legacy input-value watcher probes these IE-era methods after
  // programmatic focus; jsdom does not provide them (real browsers never need them).
  window.HTMLElement.prototype.attachEvent ??= () => {};
  window.HTMLElement.prototype.detachEvent ??= () => {};
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

export async function createPanelDom({ settle = 4500 } = {}) {
  const { createServer } = await import("vite");
  const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "error" });
  const { createRoot } = await import("react-dom/client");
  const React = await import("react");
  const { default: App } = await vite.ssrLoadModule("/src/App.tsx");
  // main.tsx is not part of the module graph we mount, so the server hydration it triggers has to
  // be done here — read-only on purpose: an audit must never push state into the database
  const sync = await vite.ssrLoadModule("/src/state/sync.ts");

  return {
    /** mount the app at one route and wait for its data */
    async render(hash) {
      const dom = new JSDOM("<!doctype html><html lang='fa' dir='rtl'><body><div id='root'></div></body></html>", {
        url: `${BASE}/${hash}`,
        pretendToBeVisual: true,
        runScripts: "dangerously",
      });
      installGlobals(dom.window);
      const root = createRoot(dom.window.document.getElementById("root"));
      root.render(React.createElement(App));
      void sync.hydrateFromServer();
      await new Promise((resolve) => setTimeout(resolve, settle));
      return {
        window: dom.window,
        document: dom.window.document,
        dispose() {
          root.unmount();
          dom.window.close();
        },
      };
    },
    close: () => vite.close(),
  };
}
