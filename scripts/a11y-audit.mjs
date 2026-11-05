#!/usr/bin/env node
/**
 * a11y-audit — axe-core against the real panel markup, in jsdom.
 *
 * What this proves: names, roles, labels, heading order, ARIA wiring, duplicate ids, link
 * text, form control associations, lang/dir.
 * What it cannot prove: contrast and anything that needs layout or paint (axe disables those
 * rules without a renderer). Those stay with `npm run audit:contrast` and the goldens.
 *
 * Run: npm run audit:a11y   (needs the API on port 4000)
 */
import { readFileSync } from "node:fs";
import { createPanelDom } from "./lib/panel-dom.mjs";

const ROUTES = [
  ["#/admin", "dashboard"],
  ["#/admin/sales/orders", "orders"],
  ["#/admin/stock/products", "products"],
  ["#/admin/sales/returns", "returns"],
  ["#/admin/sales/reports", "reports"],
  ["#/admin/experience/appearance", "appearance"],
  ["#/admin/experience/looks", "looks"],
  ["#/admin/experience/widgets", "widgets"],
  ["#/admin/settings", "settings"],
  ["#/admin/system/health", "health"],
];

const axeSource = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");

const panel = await createPanelDom({ settle: 4200 });
let total = 0;
const byRule = new Map();

console.log(`a11y-audit — axe-core on ${ROUTES.length} panel screens\n`);
for (const [hash, name] of ROUTES) {
  const { window, document, dispose } = await panel.render(hash);
  // axe needs a DOM but no layout: the rules that need geometry simply do not run
  window.eval(axeSource);
  const results = await window.axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
    resultTypes: ["violations"],
  });

  const violations = results.violations.filter((v) => v.impact !== "minor");
  const minor = results.violations.length - violations.length;
  total += results.violations.reduce((n, v) => n + v.nodes.length, 0);
  console.log(
    `  ${name.padEnd(12)} ${violations.length ? "✗" : "✓"} ${String(violations.length).padStart(2)} blocking, ${String(minor).padStart(2)} minor`,
  );
  for (const v of results.violations) {
    const key = `${v.id} — ${v.help}`;
    if (!byRule.has(key)) byRule.set(key, { impact: v.impact, rule: v.id, screens: new Set(), examples: [] });
    const entry = byRule.get(key);
    entry.screens.add(name);
    for (const node of v.nodes.slice(0, 2)) {
      const target = Array.isArray(node.target) ? node.target.join(" ") : String(node.target);
      if (entry.examples.length < 3) entry.examples.push(`${target} ${node.failureSummary?.split("\n")[1]?.trim() ?? ""}`.trim());
    }
  }
  dispose();
}
await panel.close();

console.log("\nviolations by rule");
if (!byRule.size) console.log("  none");
for (const [key, entry] of [...byRule.entries()].sort((a, b) => b[1].screens.size - a[1].screens.size)) {
  console.log(`  [${entry.impact}] ${key}  (${entry.screens.size} screens)`);
  for (const example of entry.examples) console.log(`      ${example.slice(0, 130)}`);
}
console.log(`\n${total} violation node(s).`);
process.exitCode = [...byRule.values()].some((e) => e.impact === "critical" || e.impact === "serious") ? 1 : 0;
