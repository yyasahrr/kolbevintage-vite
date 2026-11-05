#!/usr/bin/env node
/**
 * a11y-audit — axe-core against the real markup, in jsdom.
 *
 * What this proves: names, roles, labels, heading order, ARIA wiring, duplicate ids, link
 * text, form control associations, lang/dir.
 * What it cannot prove: contrast and anything that needs layout or paint (axe disables those
 * rules without a renderer). Those stay with `npm run audit:contrast` and the goldens.
 *
 * Coverage: every panel screen in TABS (37), plus the storefront (15), including one look and
 * one journal article. Those two ids come from code (`src/data/looks.ts`,
 * `src/data/journal.ts`), not from the API, so the audit does not depend on demo data being
 * seeded.
 *
 * Run: npm run audit:a11y              (everything, ~5 min)
 *      npm run audit:a11y -- --panel   (37 panel screens)
 *      npm run audit:a11y -- --shop    (storefront)
 *      npm run audit:a11y -- --only=settings
 * Needs the API on port 4000.
 */
import { readFileSync } from "node:fs";
import { createPanelDom } from "./lib/panel-dom.mjs";

/** every screen the panel can reach: group/child pairs from TABS in AdminPage.tsx */
const GROUPS = {
  sales: ["orders", "campaigns", "commerce", "returns", "cashback", "tryon", "reports"],
  stock: ["products", "inventory", "categories", "media"],
  experience: ["looks", "brand", "megamenu", "content", "journal", "appearance", "forms"],
  people: ["crm", "messages", "tickets", "reviews"],
  system: [
    "security", "integrations", "logs", "analytics", "health", "backup", "settings",
    "staff", "launch", "manual", "changelog", "purge", "widgets", "issues",
  ],
};

const PANEL = [
  ["#/admin", "panel: dashboard"],
  ...Object.entries(GROUPS).flatMap(([group, children]) =>
    children.map((child) => [`#/admin/${group}/${child}`, `panel: ${group}/${child}`]),
  ),
];

const SHOP = [
  ["#/", "shop: home"],
  ["#/products", "shop: products"],
  ["#/product/p-grand-trench", "shop: product"],
  ["#/style", "shop: styles"],
  ["#/style-builder", "shop: style builder"],
  ["#/landing", "shop: landing"],
  ["#/journal", "shop: journal"],
  ["#/about", "shop: about"],
  ["#/wishlist", "shop: wishlist"],
  ["#/auth", "shop: auth"],
  ["#/account", "shop: account"],
  ["#/checkout", "shop: checkout"],
  ["#/style/look-01", "shop: style detail"],
  ["#/journal/poetry-of-the-long-coat", "shop: journal article"],
  ["#/this-address-does-not-exist", "shop: 404"],
];

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.slice(7);
const wantPanel = args.includes("--panel") || (!args.includes("--shop") && !only);
const wantShop = args.includes("--shop") || (!args.includes("--panel") && !only);

const axeSource = readFileSync(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const RULES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"];
const BLOCKING = new Set(["critical", "serious"]);

const panel = await createPanelDom({ settle: 3000 });

let total = 0;
let blocking = 0;
const byRule = new Map();
const rows = [];

async function audit(hash, name) {
  const { window, document, dispose } = await panel.render(hash);
  try {
    window.eval(axeSource);
    const results = await window.axe.run(document, { runOnly: { type: "tag", values: RULES } });
    let serious = 0;
    let minor = 0;
    for (const v of results.violations) {
      const isBlocking = BLOCKING.has(v.impact);
      if (isBlocking) serious += v.nodes.length;
      else minor += v.nodes.length;
      const entry = byRule.get(v.id) ?? { impact: v.impact, nodes: 0, screens: new Set(), example: v.nodes[0]?.target?.join(" ") };
      entry.nodes += v.nodes.length;
      entry.screens.add(name);
      byRule.set(v.id, entry);
    }
    total += serious + minor;
    blocking += serious;
    rows.push([name, serious, minor]);
    const mark = serious ? "✗" : "✓";
    console.log(`  ${mark} ${name.padEnd(26)} ${String(serious).padStart(2)} blocking, ${String(minor).padStart(2)} minor`);
    return { document, window };
  } finally {
    dispose();
  }
}

console.log(`a11y-audit — axe-core (${RULES.join(", ")})\n`);

if (only) {
  const target = [...PANEL, ...SHOP].find(([, name]) => name.includes(only));
  if (!target) {
    console.error(`no screen matches --only=${only}`);
    process.exit(2);
  }
  await audit(target[0], target[1]);
} else {
  if (wantPanel) {
    console.log(`panel — ${PANEL.length} screens`);
    for (const [hash, name] of PANEL) await audit(hash, name);
  }
  if (wantShop) {
    const screens = SHOP;
    console.log(`\nstorefront — ${screens.length} screens`);
    for (const [hash, name] of screens) await audit(hash, name);
  }
}

await panel.close();

console.log(`\nviolations by rule`);
if (!byRule.size) console.log("  none");
for (const [id, e] of [...byRule].sort((a, b) => b[1].nodes - a[1].nodes)) {
  console.log(`  [${e.impact}] ${id} — ${e.nodes} node(s) on ${e.screens.size} screen(s)`);
  console.log(`      e.g. ${e.example}`);
  console.log(`      ${[...e.screens].slice(0, 4).join(" · ")}${e.screens.size > 4 ? " …" : ""}`);
}
console.log(`\n${total} violation node(s) across ${rows.length} screen(s); ${blocking} blocking.`);
process.exit(blocking ? 1 : 0);
