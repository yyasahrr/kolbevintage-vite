#!/usr/bin/env node
/* WCAG contrast check for the panel palette (decision 5).
   Run: node scripts/contrast-check.mjs — exits 1 if a text pair falls under 4.5:1.

   Two things are measured, and both read the stylesheet instead of a copy of it:

   1. every token pair the panel actually paints text with, in both themes;
   2. every literal `color: #hex` still in the file, against the lightest surface it can
      land on. A literal grey is how this file ended up with seven near-identical muted
      colours, four of which failed AA at 9–11px. */

import { readFileSync } from "node:fs";

const hex = (h) => h.replace("#", "").match(/../g).map((x) => parseInt(x, 16) / 255);
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => {
  const [r, g, b] = hex(h).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const css = readFileSync("src/styles/admin.css", "utf8");

/* ---- read the tokens out of the stylesheet ---- */
function tokenBlock(startMarker) {
  const at = css.indexOf(startMarker);
  if (at < 0) return {};
  const body = css.slice(css.indexOf("{", at) + 1, css.indexOf("}", at));
  const out = {};
  for (const m of body.matchAll(/(--ad-[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const light = tokenBlock("\n.ad-app {");
const dark = tokenBlock('.ad-app[data-ad-theme="dark"] {');

const TEXT = 4.5; // AA for normal-size text
const LARGE = 3; // AA for ≥19px bold / ≥24px

let failed = 0;
const check = (label, fg, bg, min = TEXT) => {
  if (!/^#[0-9a-f]{6}$/i.test(fg ?? "") || !/^#[0-9a-f]{6}$/i.test(bg ?? "")) return;
  const r = ratio(fg, bg);
  if (r < min) failed += 1;
  const verdict = r >= TEXT ? "AA" : r >= LARGE ? "AA-large only" : "FAIL";
  console.log(`  ${label.padEnd(30)} ${r.toFixed(2)}:1  ${r < min ? "FAIL" : verdict}`);
};

const themeLabel = (name, t) => {
  console.log(`\n${name}`);
  for (const surface of ["--ad-surface", "--ad-surface-2", "--ad-bg", "--ad-surface-3"]) {
    for (const ink of ["--ad-ink", "--ad-muted", "--ad-muted-2"]) {
      check(`${ink.replace("--ad-", "")} on ${surface.replace("--ad-", "")}`, t[ink], t[surface]);
    }
  }
  for (const [fg, bg] of [
    ["--ad-danger", "--ad-danger-bg"],
    ["--ad-ok", "--ad-ok-bg"],
    ["--ad-warn", "--ad-warn-bg"],
    ["--ad-danger", "--ad-surface"],
    ["--ad-ok", "--ad-surface"],
    ["--ad-warn", "--ad-surface"],
    ["--ad-brand", "--ad-surface"],
    ["--ad-info", "--ad-surface"],
  ]) {
    // the tinted backgrounds are alpha in the dark theme; fall back to the surface
    check(`${fg.replace("--ad-", "")} on ${bg.replace("--ad-", "")}`, t[fg], /^#/.test(t[bg] ?? "") ? t[bg] : t["--ad-surface"]);
  }
};
themeLabel("light", light);
themeLabel("dark", dark);

/* ---- literals: any remaining hardcoded text colour must also clear AA ---- */
console.log("\nliteral colours used as text");
const literal = new Map();
for (const m of css.matchAll(/(?:^|[;{\s])color\s*:\s*(#[0-9a-f]{6})\b/gi)) {
  const at = m.index ?? 0;
  // the dark theme block is allowed its own dark values
  if (at > css.indexOf('.ad-app[data-ad-theme="dark"] {')) continue;
  const value = m[1].toLowerCase();
  literal.set(value, (literal.get(value) ?? 0) + 1);
}
if (!literal.size) console.log("  none — every text colour comes from a token");
for (const [value, count] of [...literal.entries()].sort((a, b) => b[1] - a[1])) {
  // a literal may sit on the light page or on the dark chrome (top bar, rail, studio);
  // it has to be legible on one of them, and a literal that fails both is a bug
  const onLight = ratio(value, "#f2efe9");
  const onChrome = ratio(value, "#211d19");
  const best = Math.max(onLight, onChrome);
  const bad = best < TEXT;
  if (bad) failed += 1;
  console.log(
    `  ${value} ×${String(count).padEnd(3)} light ${onLight.toFixed(2)}:1 · chrome ${onChrome.toFixed(2)}:1 ${bad ? "FAIL (tokenise it)" : "ok"}`,
  );
}

/* every token a rule uses must be declared, or the browser falls back to nothing and a
   surface goes transparent in the dark theme */
const used = new Set([...css.matchAll(/var\((--ad-[a-z0-9-]+)/g)].map((m) => m[1]));
const declared = new Set([...css.matchAll(/^\s*(--ad-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
const missing = [...used].filter((t) => !declared.has(t));
console.log(`\ntokens: ${used.size} used, ${declared.size} declared${missing.length ? `, MISSING: ${missing.join(", ")}` : ", all defined"}`);
if (missing.length) failed += 1;

console.log(failed ? `\n${failed} contrast problem(s).` : "\ncontrast: every pair clears AA.");
process.exitCode = failed ? 1 : 0;
