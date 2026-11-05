#!/usr/bin/env node
/* WCAG contrast check for the panel palette (decision 5).
   Run: node scripts/contrast-check.mjs — exits 1 if a pair falls under 3:1. */

const hex = (h) => h.replace("#", "").match(/../g).map((x) => parseInt(x, 16) / 255);
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (h) => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const themes = {
  light: { bg: "#f2efe9", surface: "#ffffff", surface2: "#f7f3ed", ink: "#1b1815", muted: "#7d7367" },
  dark: { bg: "#14110d", surface: "#1e1a15", surface2: "#262119", ink: "#f3ede3", muted: "#a99d8d" },
};

let failed = 0;
for (const [name, t] of Object.entries(themes)) {
  console.log(`\n${name}`);
  for (const [label, fg, bg] of [
    ["ink on surface", t.ink, t.surface],
    ["ink on bg", t.ink, t.bg],
    ["ink on surface2", t.ink, t.surface2],
    ["muted on surface", t.muted, t.surface],
    ["muted on bg", t.muted, t.bg],
  ]) {
    const r = ratio(fg, bg);
    const verdict = r >= 4.5 ? "AA" : r >= 3 ? "AA-large only" : "FAIL";
    if (r < 3) failed += 1;
    console.log(`  ${label.padEnd(17)} ${r.toFixed(2)}:1  ${verdict}`);
  }
}
process.exitCode = failed ? 1 : 0;

/* every token a rule uses must be declared, or the browser falls back to
   nothing and a surface goes transparent in the dark theme */
import { readFileSync } from "node:fs";
const css = readFileSync("src/styles/admin.css", "utf8");
const used = new Set([...css.matchAll(/var\((--ad-[a-z0-9-]+)/g)].map((m) => m[1]));
const declared = new Set([...css.matchAll(/^\s*(--ad-[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
const missing = [...used].filter((t) => !declared.has(t));
console.log(`tokens: ${used.size} used, ${declared.size} declared${missing.length ? `, MISSING: ${missing.join(", ")}` : ", all defined"}`);
if (missing.length) process.exitCode = 1;
