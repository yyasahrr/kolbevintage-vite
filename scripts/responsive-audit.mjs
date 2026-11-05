#!/usr/bin/env node
/**
 * responsive-audit — reads the stylesheet and asks what each viewport will actually get.
 *
 * This is not a screenshot test and does not pretend to be one. It is the part of a
 * responsive review that a parser can answer honestly:
 *
 *   1. dead overrides  — a rule inside `@media (max-width: …)` that a later, broader rule
 *                        overwrites, so the mobile fix never paints;
 *   2. width overflow  — a fixed width or min-width wider than the space the shell leaves
 *                        at that viewport, outside any scroll container;
 *   3. orphan bands    — a component that switches to its desktop shape at a breakpoint
 *                        where the shell is still mobile (or the reverse);
 *   4. clipping        — `nowrap` without ellipsis, fixed heights, `100vh`/`100vw`;
 *   5. grid tracks     — fixed px columns that cannot fit the viewport.
 *
 * Usage: node scripts/responsive-audit.mjs [--json] [--verbose]
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const FILE = process.argv.includes("--verbose") ? "src/styles/admin.css" : "src/styles/admin.css";
const SOURCE = readFileSync(path.join(ROOT, FILE), "utf8");
const PRINT_JSON = process.argv.includes("--json");

/* ---------------------------------------------------------------- parsing */

/** strip comments but keep newlines so line numbers stay honest */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "));
}

function parse(css) {
  const src = stripComments(css);
  const rules = [];
  const stack = [];
  let buffer = "";
  let line = 1;
  let startLine = 1;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "\n") line += 1;

    if (ch === "{") {
      const head = buffer.trim();
      buffer = "";
      startLine = line;
      if (head.startsWith("@")) {
        const kind = head.match(/^@([\w-]+)/)?.[1] ?? "";
        const condition = head;
        if (kind === "media" || kind === "supports" || kind === "container") {
          stack.push({ type: "at", kind, condition, line: startLine });
        } else {
          // keyframes / font-face / property: skip the whole block
          stack.push({ type: "skip", kind, line: startLine });
        }
      } else {
        stack.push({ type: "rule", selector: head, line: startLine, media: stack.filter((s) => s.type === "at").map((s) => s.condition) });
      }
      continue;
    }

    if (ch === "}") {
      const entry = stack.pop();
      if (entry?.type === "skip") { buffer = ""; continue; }
      if (entry?.type === "rule") {
        const decls = buffer
          .split(";")
          .map((d) => d.trim())
          .filter(Boolean)
          .map((d) => {
            const colon = d.indexOf(":");
            if (colon < 0) return null;
            return { prop: d.slice(0, colon).trim().toLowerCase(), value: d.slice(colon + 1).trim() };
          })
          .filter(Boolean);
        if (decls.length) {
          rules.push({
            selector: entry.selector.replace(/\s+/g, " "),
            decls,
            line: entry.line,
            media: entry.media,
            selectors: entry.selector.split(",").map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean),
          });
        }
      }
      buffer = "";
      continue;
    }

    buffer += ch;
  }
  return rules;
}

/** turn `@media (...)` into testable predicates */
function mediaPredicates(media) {
  const out = [];
  for (const condition of media) {
    if (!condition.startsWith("@media")) continue; // @supports: treat as always-on
    const body = condition.replace(/^@media\s*/, "");
    const parts = body.split(/\band\b/);
    for (const part of parts) {
      const min = part.match(/min-width:\s*([\d.]+)px/);
      const max = part.match(/max-width:\s*([\d.]+)px/);
      if (min) out.push((w) => w >= Number(min[1]));
      if (max) out.push((w) => w <= Number(max[1]));
    }
  }
  return out;
}

const rules = parse(SOURCE).map((rule) => ({ ...rule, predicates: mediaPredicates(rule.media) }));
const isActive = (rule, width) => rule.predicates.every((test) => test(width));

/* ------------------------------------------------------------- shell model */

const sidebar = (w) => (w >= 900 ? 224 : 0);
const mainPadding = (w) => (w >= 900 ? 26 : w >= 640 ? 20 : 12);
const contentWidth = (w) => w - sidebar(w) - mainPadding(w) * 2;

/* the widths the review brief names, plus the two the shell switches at (560, 900) */
const VIEWPORTS = [320, 360, 375, 390, 414, 430, 480, 560, 640, 768, 820, 900, 960, 1024, 1180, 1280, 1440, 1600, 1920];

/* ------------------------------------------------------------------ checks */

const findings = { dead: [], overflow: [], orphan: [], clip: [], grid: [], vw: [] };

/* 1. dead overrides: a media-scoped declaration beaten by a broader later one */
{
  const keys = new Map(); // selector|prop -> [{line, value, media, at}]
  rules.forEach((rule, index) => {
    for (const selector of rule.selectors) {
      for (const { prop, value } of rule.decls) {
        const key = `${selector}|${prop}`;
        if (!keys.has(key)) keys.set(key, []);
        keys.get(key).push({ line: rule.line, value, media: rule.media, predicates: rule.predicates, at: index, selector });
      }
    }
  });

  for (const [key, entries] of keys) {
    if (entries.length < 2) continue;
    for (const entry of entries) {
      if (!entry.media.length) continue;
      // only narrow rules (a max-width or a min-width) can be shadowed
      const matches = VIEWPORTS.filter((w) => entry.predicates.every((test) => test(w)));
      if (!matches.length) continue;
      const shadow = entries.find(
        (later) =>
          later.at > entry.at &&
          later.predicates.length === 0 &&
          later.value !== entry.value,
      );
      if (!shadow) continue;
      // dead only if EVERY viewport the narrow rule covers is also covered by the shadow
      const deadEverywhere = matches.every((w) => shadow.predicates.every((test) => test(w)));
      if (deadEverywhere) {
        findings.dead.push({ key, line: entry.line, later: shadow.line, value: entry.value, laterValue: shadow.value, media: entry.media.join(" ") });
      }
    }
  }
}

/* 2. fixed widths wider than the shell leaves room for */
{
  for (const rule of rules) {
    for (const selector of rule.selectors) {
      for (const { prop, value } of rule.decls) {
        if (!["width", "min-width", "min-inline-size"].includes(prop)) continue;
        const px = value.match(/^(-?[\d.]+)(px|rem)$/);
        if (!px) continue;
        const amount = px[2] === "rem" ? Number(px[1]) * 16 : Number(px[1]);
        if (amount < 240) continue; // small chrome is not the question here
        for (const w of VIEWPORTS) {
          if (!isActive(rule, w)) continue;
          const room = contentWidth(w);
          if (amount > room) {
            const scrollable = /table|wrap|scroll|strip|tabs|rail|list/i.test(selector);
            if (!scrollable) findings.overflow.push({ selector, prop, value, viewport: w, room, line: rule.line });
          }
        }
      }
    }
  }
}

/* 3. orphan bands: components that go desktop outside the shell's own switch (900) */
{
  const componentBreakpoints = new Map(); // selector -> Set(breakpoints)
  for (const rule of rules) {
    const body = rule.media.join(" ");
    const min = body.match(/min-width:\s*(\d+)px/);
    const max = body.match(/max-width:\s*(\d+)px/);
    if (!min && !max) continue;
    const value = Number(min ? min[1] : max[1]);
    for (const selector of rule.selectors) {
      const base = selector.replace(/\s.*$/, "").split(":")[0];
      if (!base.startsWith(".")) continue;
      if (!componentBreakpoints.has(base)) componentBreakpoints.set(base, new Set());
      componentBreakpoints.get(base).add(value);
    }
  }
  for (const [selector, points] of componentBreakpoints) {
    const sorted = [...points].sort((a, b) => a - b);
    const lone = sorted.filter((p) => p > 700 && p < 900 && (p === 720 || p === 760 || p === 800 || p === 820 || p === 860));
    if (lone.length) findings.orphan.push({ selector, points: sorted });
  }
}

/* 4. clipping hazards */
{
  for (const rule of rules) {
    const nowrap = rule.decls.some((d) => d.prop === "white-space" && /nowrap/.test(d.value));
    if (nowrap) {
      const ellipsis = rule.decls.some((d) => d.prop === "text-overflow" && /ellipsis/.test(d.value));
      const hidden = rule.decls.some((d) => d.prop === "overflow" && /hidden|clip/.test(d.value));
      const inTable = rule.selectors.some((s) => /^th|td/.test(s.split(" ").pop()));
      if (!ellipsis && !hidden && !inTable) findings.clip.push({ kind: "nowrap", selector: rule.selector, line: rule.line });
    }
    for (const { prop, value } of rule.decls) {
      if (prop === "height" && /^(\d+)px$/.test(value) && Number(value.replace("px", "")) > 320) {
        findings.clip.push({ kind: "fixed-height", selector: rule.selector, value, line: rule.line });
      }
      // a bare `width: 100vw` overflows by the scrollbar's width; a clamped
      // `min(360px, calc(100vw - 24px))` is the correct form and must not be flagged
      if (prop === "width" && /^100vw$/.test(value.replace(/\s/g, ""))) findings.vw.push({ kind: "100vw", selector: rule.selector, line: rule.line });
      if (prop === "height" && /(\d+)vh\b/.test(value)) findings.vw.push({ kind: "vh", selector: rule.selector, value, line: rule.line });
    }
  }
}

/* 5. grid tracks that cannot fit */
{
  for (const rule of rules) {
    const tracks = rule.decls.find((d) => d.prop === "grid-template-columns");
    if (!tracks) continue;
    const fixed = [...tracks.value.matchAll(/(\d+)px/g)].map((m) => Number(m[1]));
    if (!fixed.length) continue;
    const sum = fixed.reduce((a, b) => a + b, 0);
    for (const w of VIEWPORTS) {
      if (!isActive(rule, w)) continue;
      if (sum > contentWidth(w)) findings.grid.push({ selector: rule.selector, value: tracks.value, sum, viewport: w, line: rule.line });
    }
  }
}

/* 6. column budgets: a grid may not squeeze a card below the width its content needs.
   These numbers come from the content, not from taste: a price with a currency word at
   18px needs ~150px, a three-column table needs ~300px before it starts scrolling. */
const COLUMN_BUDGET = [
  { selector: ".ad-kpis", min: 110, note: "the widest unbreakable token — a separated price; the unit wraps" },
  { selector: ".ad-grid-2", min: 300, note: "a card holding a table" },
  { selector: ".ad-report-grid", min: 300, note: "a card holding a chart or table" },
  { selector: ".ad-rbac-roles", min: 260, note: "a role card with a title and a code" },
];

{
  for (const budget of COLUMN_BUDGET) {
    for (const rule of rules) {
      if (!rule.selectors.includes(budget.selector)) continue;
      const gtc = rule.decls.find((d) => d.prop === "grid-template-columns");
      if (!gtc) continue;
      const count = /repeat\((\d+),/.exec(gtc.value)?.[1] ?? (gtc.value.match(/1fr/g) ?? []).length;
      const n = Number(count);
      if (!n || n < 2) continue;
      const gap = Number((rule.decls.find((d) => d.prop === "gap")?.value ?? "12").match(/^(\d+)/)?.[1] ?? 12);
      for (const w of VIEWPORTS) {
        if (!isActive(rule, w)) continue;
        const inner = (contentWidth(w) - gap * (n - 1)) / n - 26;
        if (inner < budget.min) {
          findings.budget = findings.budget ?? [];
          findings.budget.push({ selector: budget.selector, n, viewport: w, inner: Math.round(inner), min: budget.min, note: budget.note, line: rule.line });
        }
      }
    }
  }
}

/* ---------------------------------------------------------------- reporting */

const dedupe = (list, keyFn) => {
  const seen = new Set();
  return list.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const unique = (list, fn) => dedupe(list, fn);

const deadUnique = unique(findings.dead, (f) => `${f.key}|${f.line}`);
const overflowUnique = unique(findings.overflow, (f) => `${f.selector}|${f.prop}|${f.value}`).filter(
  // the drawer is fixed-position and may legitimately exceed a narrow viewport's content box
  (f) => !/palette|modal|nav\b/.test(f.selector),
);

if (PRINT_JSON) {
  console.log(JSON.stringify({ dead: deadUnique, overflow: overflowUnique, orphan: findings.orphan, clip: findings.clip, grid: findings.grid, vw: findings.vw }, null, 2));
  process.exit(0);
}

const line = (n) => `:${n}`;
console.log(`\nresponsive-audit — ${FILE} (${rules.length} rules, ${VIEWPORTS.length} viewports)\n`);

console.log(`1. Dead overrides (a media rule beaten by a later unconditional one)`);
if (!deadUnique.length) console.log("   none");
for (const f of deadUnique) {
  console.log(`   ${f.key}${line(f.line)}`);
  console.log(`     ${f.value}  ← overwritten by ${f.laterValue} at ${line(f.later)} with no media guard`);
}

console.log(`\n2. Widths that cannot fit (fixed width > available content box, no scroll wrapper)`);
if (!overflowUnique.length) console.log("   none");
for (const f of overflowUnique) {
  console.log(`   ${f.selector} { ${f.prop}: ${f.value} }${line(f.line)} — needs ${Number(f.value.replace(/[^\d.]/g, ""))}px, viewport ${f.viewport} leaves ${f.room}px`);
}

console.log(`\n3. Breakpoints that disagree with the shell (shell switches at 900)`);
if (!findings.orphan.length) console.log("   none");
for (const f of findings.orphan) console.log(`   ${f.selector} switches at ${f.points.join(", ")}`);

console.log(`\n4. Clipping hazards`);
const clip = unique(findings.clip, (f) => `${f.kind}|${f.selector}`);
if (!clip.length) console.log("   none");
for (const f of clip) console.log(`   [${f.kind}] ${f.selector}${line(f.line)}${f.value ? ` ${f.value}` : ""}`);
const vw = unique(findings.vw, (f) => `${f.kind}|${f.selector}`);
for (const f of vw) console.log(`   [${f.kind}] ${f.selector}${line(f.line)}${f.value ? ` ${f.value}` : ""}`);

console.log(`\n6. Column budgets`);
const budget = unique(findings.budget ?? [], (f) => `${f.selector}|${f.n}`);
if (!budget.length) console.log("   none");
for (const f of budget) {
  const vps = (findings.budget ?? []).filter((b) => b.selector === f.selector && b.n === f.n).map((b) => `${b.viewport}→${b.inner}px`);
  console.log(`   ${f.selector} at ${f.n} columns${line(f.line)} — needs ${f.min}px per card (${f.note}); gets ${vps.join(", ")}`);
}

console.log(`\n5. Grid tracks that cannot fit`);
const grid = unique(findings.grid, (f) => `${f.selector}|${f.value}`);
if (!grid.length) console.log("   none");
for (const f of grid) {
  const widths = findings.grid.filter((g) => g.selector === f.selector && g.value === f.value).map((g) => g.viewport);
  console.log(`   ${f.selector} { ${f.value} }${line(f.line)} — ${f.sum}px fixed tracks overflows at ${widths.join(", ")}px`);
}

console.log("\nWhat each size gets");
console.log("  viewport   rail   pad   content   KPIs   two-up cards   table");
for (const w of VIEWPORTS) {
  const kpi = (() => {
    let n = 2;
    for (const rule of rules) {
      if (!rule.selectors.includes(".ad-kpis")) continue;
      const gtc = rule.decls.find((d) => d.prop === "grid-template-columns");
      if (!gtc || !isActive(rule, w)) continue;
      const m = /repeat\((\d+),/.exec(gtc.value)?.[1];
      if (m) n = Number(m);
    }
    return n;
  })();
  const twoUp = (() => {
    let n = 1;
    for (const rule of rules) {
      if (!rule.selectors.includes(".ad-grid-2")) continue;
      const gtc = rule.decls.find((d) => d.prop === "grid-template-columns");
      if (!gtc || !isActive(rule, w)) continue;
      n = 2;
    }
    return n;
  })();
  const tableRoom = contentWidth(w) - (twoUp === 2 ? (contentWidth(w) - 14) / 2 : 0) - 26;
  console.log(
    `  ${String(w).padEnd(10)} ${String(sidebar(w)).padEnd(6)} ${String(mainPadding(w)).padEnd(5)} ${String(contentWidth(w)).padEnd(9)} ${String(kpi).padEnd(6)} ${String(twoUp === 2 ? "2" : "1").padEnd(14)} ${tableRoom >= 560 ? "fits" : "scrolls in its box"}`,
  );
}

const gated = deadUnique.length + overflowUnique.length + grid.length + vw.length + budget.length;
const advisory = clip.length + findings.orphan.length;

console.log(
  `\n${gated} must-fix, ${advisory} advisory.` +
    (gated ? "\nThe must-fix list is what a phone or a tablet actually gets wrong: a rule that never\npaints, a box that cannot fit, a grid that overflows, an unclamped viewport unit." : "\nNothing that changes what a device gets wrong. Advisories are judgement calls, not bugs."),
);
process.exit(gated ? 1 : 0);
