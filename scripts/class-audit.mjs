#!/usr/bin/env node
/**
 * class-audit — every `ad-*` class the panel writes must have a rule in the stylesheet.
 *
 * A class with no rule is invisible in review and obvious on screen: the browser falls
 * back to its own defaults. That is how a `<hr>` ended up with a 3D inset border, a chip
 * row with no gaps, and a `<pre>` overflowing its card. `npm run lint:classes`.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SHEETS = ["src/styles/admin.css", "src/styles/admin-shell.css", "src/builder/builder.css", "src/styles/index.css"];

const defined = new Set();
for (const sheet of SHEETS) {
  let css = "";
  try {
    css = readFileSync(path.join(ROOT, sheet), "utf8");
  } catch {
    continue;
  }
  // blank comments: a class named in a comment is not a rule
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of css.matchAll(/\.(ad-[\w-]+)/g)) defined.add(m[1]);
}

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel);
    else if (/\.tsx$/.test(entry.name)) files.push(rel);
  }
};
walk("src");

const used = new Map();
for (const file of files) {
  const src = readFileSync(path.join(ROOT, file), "utf8");
  // static string literals only: `ad-kpi-${kind}` is decided at runtime and cannot be checked
  for (const m of src.matchAll(/"([^"\n]*)"|`([^`\n]*)`/g)) {
    const text = m[1] ?? m[2] ?? "";
    if (text.includes("${")) continue;
    for (const token of text.split(/\s+/)) {
      if (!/^ad-[\w-]+$/.test(token)) continue;
      if (!used.has(token)) used.set(token, new Set());
      used.get(token).add(path.basename(file));
    }
  }
}

const missing = [...used.entries()].filter(([name]) => !defined.has(name)).sort((a, b) => a[0].localeCompare(b[0]));
const unused = [...defined].filter((name) => name.startsWith("ad-") && !used.has(name));

console.log(`class-audit — ${used.size} panel classes used, ${defined.size} defined`);
if (missing.length) {
  console.log(`\n  used in the panel with no rule (they render as browser defaults):`);
  for (const [name, where] of missing) console.log(`    .${name.padEnd(28)} ${[...where].slice(0, 3).join(", ")}`);
}
if (unused.length) {
  console.log(`\n  defined but never used (dead weight, not a bug): ${unused.length}`);
  for (const name of unused.slice(0, 12)) console.log(`    .${name}`);
}
console.log(missing.length ? `\n${missing.length} class(es) need a rule.` : "\nclasses: every panel class has a rule.");
process.exitCode = missing.length ? 1 : 0;
