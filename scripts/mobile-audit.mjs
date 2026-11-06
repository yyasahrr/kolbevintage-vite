/* A static audit of the panel's small-screen CSS (decisions 6 + 76).

   It cannot replace a phone: it cannot see whether something looks wrong. It
   can find the mechanical causes of a broken small screen — tap targets under
   44px, tables that can overflow without a scroll wrapper, fixed widths wider
   than a phone, and `100vh` bars that hide behind mobile browser chrome.

   Run: node scripts/mobile-audit.mjs  (exit 1 if anything is found)
*/
import { readFileSync } from "node:fs";

const raw = readFileSync("src/styles/admin.css", "utf8");
/* mask at-rule preludes so `@media (min-width: 900px)` is not mistaken for a
   declaration that forces a 900px element */
const css = raw.replace(/@[a-z-]+[^{]*\{/gi, "@rule {");
const phone = 390; // iPhone-ish CSS width, the narrow target
const findings = [];

/* 1. tap targets: an explicit height/padding that cannot reach 44px */
const buttonRule = /\.ad-(?:icon|btn)[^{]*\{([^}]*)\}/g;
for (const m of css.matchAll(buttonRule)) {
  const body = m[1];
  const h = body.match(/(?:^|\s)(?:min-)?height:\s*(\d+(?:\.\d+)?)px/);
  const pad = body.match(/padding:\s*(\d+(?:\.\d+)?)px/);
  if (h && Number(h[1]) < 30) findings.push(`tap target ${m[0].slice(0, 40)}… height ${h[1]}px`);
  if (pad && Number(pad[1]) < 6) findings.push(`tap padding ${m[0].slice(0, 40)}… ${pad[1]}px`);
}

/* 2. fixed minimum widths that cannot fit a phone.
      `.ad-table` is exempt: it lives inside `.ad-table-wrap`, which scrolls. */
for (const m of css.matchAll(/([^{}]+)\{[^}]*min-width:\s*(\d+)px/g)) {
  const selector = m[1].trim();
  if (selector.includes(".ad-table") && !selector.includes("-wrap")) continue;
  if (Number(m[2]) > phone) findings.push(`${selector.slice(0, 40)} needs ${m[2]}px, wider than a ${phone}px screen`);
}

/* 2b. declarations that browsers will silently drop (a token glued to a stray
       hex tail — exactly the bug this audit just caught) */
for (const m of css.matchAll(/var\(--ad-[a-z0-9-]+\)[0-9a-f]{2,3}\b/g)) {
  findings.push(`invalid value ${m[0]} (dropped by the browser)`);
}

/* 3. every table must be inside a horizontal scroll wrapper */
const tables = [...css.matchAll(/\.ad-table\s*\{/g)].length;
const wrappers = [...css.matchAll(/\.ad-table-wrap\s*\{/g)].length;
if (tables && !wrappers) findings.push("ad-table has no ad-table-wrap");

/* 4. 100vh on fixed bars: mobile chrome eats it */
for (const m of css.matchAll(/([^{}]+)\{[^}]*height:\s*100vh/g)) {
  findings.push(`100vh used on ${m[1].trim().slice(0, 40)} (use 100dvh)`);
}

/* 5. touch rules: 16px fields and 44px targets must actually be declared */
const coarseFiles = ["src/styles/admin.css", "src/styles/account.css", "src/index.css"].map((f) => ({
  file: f,
  text: readFileSync(f, "utf8"),
}));
const coarse = coarseFiles.filter((f) => /@media \(pointer: coarse\)/.test(f.text));
if (coarse.length < 3) findings.push(`only ${coarse.length}/3 stylesheets declare a coarse-pointer block`);
for (const f of coarse) {
  const block = f.text.match(/@media \(pointer: coarse\)[^{]*\{([\s\S]*?)\n\}/);
  if (!block) continue;
  if (!/font-size:\s*1[6-9]px/.test(block[1])) findings.push(`${f.file}: coarse block has no 16px field size`);
  // index.css only fixes the zoom; the panel and account sheets own the 44px targets
  if (f.file !== "src/index.css" && !/min-height:\s*4[4-9]px/.test(block[1])) {
    findings.push(`${f.file}: coarse block has no 44px target`);
  }
}
if (!/env\(safe-area-inset-bottom\)/.test(css)) findings.push("no safe-area-inset-bottom — bars slide under the home indicator");
if (!/dvh/.test(css)) findings.push("no dvh unit — mobile browser chrome will overlap full-height screens");

/* 6. the narrow breakpoints we claim to have */
const narrow = [...raw.matchAll(/@media \(max-width:\s*(\d+)px\)/g)].map((m) => Number(m[1]));
const wide = [...raw.matchAll(/@media \(min-width:\s*(\d+)px\)/g)].map((m) => Number(m[1]));
console.log(`rules: ${raw.split("\n").length} lines, ${narrow.length} max-width breakpoints, ${wide.length} min-width breakpoints`);
console.log(`narrow breakpoints: ${[...new Set(narrow)].sort((a, b) => a - b).join(", ") || "none"}`);

if (findings.length) {
  console.log(`\n${findings.length} finding(s):`);
  for (const f of [...new Set(findings)]) console.log("  · " + f);
  process.exitCode = 1;
} else {
  console.log("\nno mechanical small-screen problems found");
}
