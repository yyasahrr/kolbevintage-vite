/* Structural audit of the widget catalogue (decision 75).

   The widget registry is TSX, so it cannot be imported by node without Vite's
   asset pipeline. This parses the file instead and checks the things that can
   be checked without a browser: every widget has a unique kind, a legal zone,
   a component, and the panel's zone names match the registry's.

   node scripts/widget-audit.mjs  (exit 1 on any problem)
*/
import { readFileSync } from "node:fs";

const src = readFileSync("src/widgets/registry.tsx", "utf8");
const zoneFile = readFileSync("src/widgets/types.ts", "utf8");

const ZONES = [...zoneFile.matchAll(/^\s{2}"([a-z-]+)":/gm)].map((m) => m[1]);
const findings = [];

// one block per widget: from `kind: "x"` to the next one
const blocks = src.split(/\n  \{\n/).slice(1);
const widgets = blocks
  .map((block) => {
    const kind = block.match(/kind: "([a-z-]+)"/)?.[1];
    if (!kind) return null;
    const zones = [...(block.match(/zones: \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
    const group = block.match(/group: "([^"]+)"/)?.[1] ?? "";
    const hasComponent = /Component: \(/.test(block);
    const needsData = /needsData: true/.test(block);
    return { kind, zones, group, hasComponent, needsData };
  })
  .filter(Boolean);

const seen = new Set();
for (const w of widgets) {
  if (seen.has(w.kind)) findings.push(`duplicate kind: ${w.kind}`);
  seen.add(w.kind);
  if (!w.zones.length) findings.push(`${w.kind}: no zone`);
  for (const z of w.zones) if (!ZONES.includes(z)) findings.push(`${w.kind}: unknown zone "${z}"`);
  if (!w.hasComponent) findings.push(`${w.kind}: no component`);
}

const byZone = Object.fromEntries(ZONES.map((z) => [z, widgets.filter((w) => w.zones.includes(z)).length]));
const byGroup = {};
for (const w of widgets) byGroup[w.group] = (byGroup[w.group] ?? 0) + 1;

console.log(`widgets: ${widgets.length}`);
console.log(`zones: ${ZONES.join(", ")}`);
console.log(`per zone: ${Object.entries(byZone).map(([z, n]) => `${z} ${n}`).join(" · ")}`);
console.log(`per group: ${Object.entries(byGroup).map(([g, n]) => `${g} ${n}`).join(" · ")}`);
console.log(`data-driven: ${widgets.filter((w) => w.needsData).length}`);

/* the built bundle should carry every widget's name; a widget that never made
   it into the build is a widget the storefront cannot show */
try {
  const bundle = readFileSync("dist/index.html", "utf8");
  const missing = widgets.filter((w) => {
    const def = src.slice(src.indexOf(`kind: "${w.kind}"`));
    const name = def.match(/name: "([^"]+)"/)?.[1];
    return name ? !bundle.includes(name) : false;
  });
  console.log(`bundle: ${widgets.length - missing.length}/${widgets.length} widget names found in dist/index.html`);
  if (missing.length) findings.push(`not in the build: ${missing.map((w) => w.kind).join(", ")}`);
} catch {
  console.log("bundle: dist/index.html not built — skipped");
}

if (findings.length) {
  console.log(`\n${findings.length} problem(s):`);
  for (const f of findings) console.log("  · " + f);
  process.exitCode = 1;
} else {
  console.log("\nno structural problems in the catalogue");
}
