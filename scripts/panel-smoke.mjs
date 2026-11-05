#!/usr/bin/env node
/**
 * panel-smoke — renders the panel in a DOM (jsdom) and proves each screen is the screen it says.
 *
 * Two things are checked per route:
 *   1. it rendered something (the selector below found a node);
 *   2. it rendered the *right* screen — `[data-screen]` from GroupShell must equal the screen the
 *      route names. That second check exists because `/admin/system/widgets` once painted the
 *      security panel while every "did it render" test passed.
 *
 * Needs the API on `PORT` (default 4000), because the panel loads real data.
 * Run: npm run smoke:panel           SMOKE_VERBOSE=1 npm run smoke:panel
 */
import { createPanelDom } from "./lib/panel-dom.mjs";

/** [hash, expected data-screen, selector that must exist] */
const ROUTES = [
  ["#/admin", null, ".ad-kpis"],
  ["#/admin/sales/orders", "orders", ".ad-head"],
  ["#/admin/stock/products", "products", ".ad-table, .ad-empty"],
  ["#/admin/sales/returns", "returns", ".ad-head"],
  ["#/admin/sales/cashback", "cashback", ".ad-ladder, .ad-form-grid, .ad-card"],
  ["#/admin/sales/reports", "reports", ".ad-report, .ad-report-grid, .ad-report-chart"],
  ["#/admin/experience/appearance", "appearance", ".ad-theme"],
  ["#/admin/experience/looks", "looks", ".ad-head"],
  ["#/admin/system/widgets", "widgets", ".ad-table, .ad-empty, .ad-card"],
  ["#/admin/settings", "settings", ".ad-card, .ad-form-grid"],
  ["#/admin/system/health", "health", ".ad-card, .ad-kpi, .ad-empty"],
];

const VERBOSE = process.env.SMOKE_VERBOSE === "1";
const panel = await createPanelDom({ settle: 3200 });
const rows = [];
let failed = 0;

for (const [hash, screen, selector] of ROUTES) {
  const { document, dispose } = await panel.render(hash);
  const node = document.querySelector(selector);
  const painted = document.querySelector("[data-screen]")?.getAttribute("data-screen") ?? null;
  const requested = document.querySelector("[data-screen]")?.getAttribute("data-screen-requested") ?? null;
  const who = document.querySelector(".ad-main h2")?.textContent?.trim() ?? "(no h2)";
  const text = (document.querySelector(".ad-main")?.textContent ?? "").replace(/\s+/g, " ").trim();

  const reasons = [];
  if (!node) reasons.push(`nothing matched ${selector}`);
  if (!document.querySelector(".ad-main h2, .ad-main h1")) reasons.push("no page-level heading");
  if (text.length < 40) reasons.push(`the screen painted ${text.length} characters`);
  if (screen && painted !== screen) reasons.push(`asked for "${screen}", painted "${painted}"`);

  rows.push({ hash, screen, who, chars: text.length, reasons });
  if (reasons.length) {
    failed += 1;
    console.log(`  ✗ ${hash.padEnd(34)} ${reasons.join("; ")}`);
    if (VERBOSE) console.log(`\n${document.querySelector(".ad-group-body")?.innerHTML?.slice(0, 1200) ?? text.slice(0, 600)}\n`);
  } else {
    console.log(
      `  ✓ ${hash.padEnd(34)} ${String(text.length).padStart(5)} chars  «${who.slice(0, 28)}»` +
        (requested && painted && requested !== painted ? `  (rewritten to ${painted})` : ""),
    );
  }
  dispose();
}

await panel.close();
console.log(
  failed
    ? `\nsmoke: ${failed} of ${ROUTES.length} screens are empty or are the wrong screen.`
    : `\nsmoke: every screen rendered content, and every grouped screen painted the one its route names.`,
);
process.exit(failed ? 1 : 0);
