#!/usr/bin/env node
/**
 * ui-audit — the panel's stylesheet, measured instead of eyeballed.
 *
 * Why this exists: the owner's verdict on the panel was "visually buggy", and most of
 * it came from three mechanical causes this script can catch without a browser:
 *
 *   1. physical sides (`margin-left`, `text-align: right`) that do not flip in RTL —
 *      every one of them is a bug waiting for the next screen;
 *   2. values outside the declared scale (29 font sizes, 24 radii, 86 pixel values),
 *      which is what makes two screens look like two products;
 *   3. a few known layout traps (`transition: all`, `outline: none`, `100vh`).
 *
 * It is a ratchet, not a rewrite: `scripts/ui-audit.baseline.json` records today's
 * counts, and the script fails only when a count grows. Fix something and the number
 * is lowered in the same commit (`--write-baseline`). That way the debt can only
 * shrink, and nobody has to "fix the whole stylesheet" in one unreviewable diff.
 *
 * Usage:
 *   node scripts/ui-audit.mjs             # check against the baseline
 *   node scripts/ui-audit.mjs --write-baseline
 *   node scripts/ui-audit.mjs --verbose   # print every finding, not just the count
 */
import { readFile, writeFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const BASELINE = path.join(ROOT, "scripts/ui-audit.baseline.json");
const args = new Set(process.argv.slice(2));
const VERBOSE = args.has("--verbose");

/**
 * Stylesheets, and how strict we are with each.
 *
 * `admin.css` is the panel the owner reviews, so it must hold the full line.
 * `builder.css` is the Studio's own chrome: it still carries physical sides from its
 * first week, and its canvas decorations (carousel arrows, price tags, badges) are
 * positioned physically on purpose. Those are reported as *deferred* debt — visible in
 * every run, never silently green, and not allowed to grow either.
 */
const FILES = [
  { path: "src/styles/admin.css", defer: false },
  { path: "src/styles/index.css", defer: false },
  { path: "src/builder/builder.css", defer: true },
];

/**
 * The frozen scale. These are the values the panel already uses; the point of the list
 * is that a *new* value has to be a deliberate decision, not a 9.5px accident.
 * The recommended target scale (what new work should reach for) is smaller and lives in
 * docs/DESIGN.md.
 */
const SCALE = {
  // the rhythm, not a catalogue of accidents. 4px base, one 2px hairline step, and the
  // three big stops the shell actually uses.
  // 1px is a hairline between stacked rows; 32/40/48/64 are page-bottom clearance only.
  space: [0, 1, 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 48, 64],
  // eight steps. 16 survives alone for iOS form fields (below that, focus zooms the page).
  font: [9, 10, 11, 12, 13, 15, 16, 19, 22],
  radius: [2, 4, 6, 8, 10, 12, 14, 18, 999],
};

const CHECKS = {
  physical: {
    label: "physical left/right properties (do not flip in RTL)",
    test: (line) =>
      /\b(?:margin|padding)-(?:left|right)\s*:/.test(line) ||
      /(?:^|[\s;{])(?:left|right)\s*:\s*(?:-?[0-9]|auto|0)/.test(line) ||
      /text-align\s*:\s*(?:left|right)\b/.test(line) ||
      /\btranslateX\(/.test(line),
  },
  transitionAll: {
    label: "`transition: all` (animates properties nobody meant to animate)",
    test: (line) => /transition\s*:\s*all\b/.test(line),
  },
  outlineNone: {
    label: "`outline: none` (removes the keyboard focus ring)",
    test: (line) => /outline\s*:\s*(?:none|0)\b/.test(line),
  },
  hardVh: {
    label: "`100vh` on a full-height surface (phones clip it; use dvh)",
    test: (line) => /\b(?:min-)?height\s*:\s*100vh\b/.test(line),
  },
};

function scaleOf(property) {
  if (property === "font-size") return { name: "font", values: SCALE.font };
  if (property === "border-radius") return { name: "radius", values: SCALE.radius };
  if (/^(?:margin|padding|gap|row-gap|column-gap)(?:-|$)/.test(property)) {
    return { name: "space", values: SCALE.space };
  }
  return null;
}

const findings = [];
const offScale = new Map();

for (const { path: rel, defer } of FILES) {
  let css;
  try {
    css = await readFile(path.join(ROOT, rel), "utf8");
  } catch {
    continue; // the file may not exist in a trimmed checkout
  }
  // blank block comments out of the code, keeping the line numbering intact: a comment
  // that *explains* a physical property is not a physical property
  const code = css.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "));
  const lines = code.split("\n");
  const raw = css.split("\n");
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    // an explicit exception, written where the decision is: `ui-audit:allow outlineNone`
    const allow = /ui-audit:allow\s+([a-zA-Z]+)/.exec(`${raw[index] ?? ""} ${raw[index + 1] ?? ""}`);
    const where = `${rel}:${index + 1}`;

    for (const [id, check] of Object.entries(CHECKS)) {
      if (allow && allow[1] === id) continue;
      if (check.test(trimmed)) findings.push({ id, where, line: trimmed, defer });
    }

    const decl = /^(?:[a-z-]+)\s*:\s*([^;]+)/i.exec(trimmed);
    if (!decl) return;
    const property = trimmed.slice(0, trimmed.indexOf(":")).trim();
    const scale = scaleOf(property);
    if (!scale) return;
    // a value may be a shorthand: `padding: 4px 10px 12px`
    for (const match of decl[1].matchAll(/(-?\d*\.?\d+)px/g)) {
      const value = Number(match[1]);
      if (!scale.values.includes(value)) {
        const key = defer ? `builder.${scale.name}` : scale.name;
        if (!offScale.has(key)) offScale.set(key, []);
        offScale.get(key).push({ where, property, value });
      }
    }
  });
}

const counts = {};
for (const finding of findings) {
  const key = finding.defer ? `builder.${finding.id}` : finding.id;
  counts[key] = (counts[key] ?? 0) + 1;
}
counts.offScaleSpace = offScale.get("space")?.length ?? 0;
counts.offScaleFont = offScale.get("font")?.length ?? 0;
counts.offScaleRadius = offScale.get("radius")?.length ?? 0;

let baseline = null;
try {
  baseline = JSON.parse(await readFile(BASELINE, "utf8"));
} catch {
  baseline = null;
}

if (args.has("--write-baseline")) {
  await writeFile(BASELINE, `${JSON.stringify({ updated: new Date().toISOString().slice(0, 10), counts }, null, 2)}\n`);
  console.log(`ui-audit: baseline written (${JSON.stringify(counts)})`);
  process.exit(0);
}

const LABELS = {
  ...Object.fromEntries(Object.entries(CHECKS).map(([id, c]) => [id, c.label])),
  ...Object.fromEntries(Object.entries(CHECKS).map(([id, c]) => [`builder.${id}`, `${c.label} — studio chrome, deferred`])),
  offScaleSpace: "spacing values outside the scale",
  offScaleFont: "font sizes outside the scale",
  offScaleRadius: "radii outside the scale",
  "builder.space": "studio spacing outside the scale — deferred",
  "builder.font": "studio font sizes outside the scale — deferred",
  "builder.radius": "studio radii outside the scale — deferred",
};

let failures = 0;
const rows = [];
for (const [id, value] of Object.entries(counts)) {
  // every row is a ratchet, deferred ones included: the studio's debt may shrink, never grow
  const allowed = baseline?.counts?.[id] ?? 0;
  const over = value > allowed;
  if (over) failures += value - allowed;
  rows.push({ id, now: value, allowed, over });
}

console.log("\nui-audit — panel stylesheet\n");
for (const row of rows) {
  const mark = row.id.startsWith("builder.") ? "⋯" : row.over ? "✗" : row.now < row.allowed ? "↓" : "·";
  console.log(`  ${mark} ${row.id.padEnd(16)} ${String(row.now).padStart(4)}  (baseline ${row.allowed})  ${LABELS[row.id] ?? ""}`);
}

if (VERBOSE || failures > 0) {
  for (const f of findings) {
    if (failures === 0 && !VERBOSE) continue;
    console.log(`      ${f.where}  ${f.line.slice(0, 96)}`);
  }
  for (const [name, list] of offScale) {
    const over = counts[`offScale${name[0].toUpperCase()}${name.slice(1)}`] > (baseline?.counts?.[`offScale${name[0].toUpperCase()}${name.slice(1)}`] ?? 0);
    if (!over && !VERBOSE) continue;
    console.log(`      off-scale ${name}:`);
    for (const item of list.slice(0, VERBOSE ? 200 : 12)) {
      console.log(`        ${item.where}  ${item.property}: ${item.value}px`);
    }
  }
}

if (failures > 0) {
  console.error(`\nui-audit: FAIL — ${failures} new problem(s) over the baseline.`);
  console.error("Fix them, or if the new count is a deliberate decision run: node scripts/ui-audit.mjs --write-baseline\n");
  process.exit(1);
}

const improved = rows.some((row) => row.now < row.allowed);
console.log(
  improved
    ? "\nui-audit: OK — and lower than the baseline. Run `node scripts/ui-audit.mjs --write-baseline` to lock the win.\n"
    : "\nui-audit: OK — nothing added over the baseline.\n",
);
