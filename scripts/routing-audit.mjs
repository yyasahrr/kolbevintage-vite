#!/usr/bin/env node
/**
 * routing-audit — the panel's screens and their addresses, checked as text before anything renders.
 *
 * Why: `/admin/system/widgets` once painted the security panel because `TABS` offered the screen
 * while `GroupShell`'s section list for that group did not contain it, so the shell fell back to
 * its first section. Every render-based test passed. This script compares the two lists directly,
 * so that whole class of bug fails in a second, without an API or a DOM.
 *
 * Checks:
 *   1. every group in TABS has exactly the same children as its GroupShell sections;
 *   2. no screen id appears twice (two homes means one of them renders the wrong panel);
 *   3. every grouped screen has a unique address under its group.
 *
 * Run: npm run audit:routes
 */
import { readFileSync } from "node:fs";

const FILE = "src/pages/AdminPage.tsx";
const source = readFileSync(FILE, "utf8");

const problems = [];
const note = (msg) => problems.push(msg);

/* ---------- TABS: id + children ---------- */
const tabsStart = source.indexOf("const TABS");
const tabsEnd = source.indexOf("\n];", tabsStart);
if (tabsStart < 0 || tabsEnd < 0) {
  console.error(`routing-audit: could not find the TABS table in ${FILE}`);
  process.exit(2);
}
const tabsBlock = source.slice(tabsStart, tabsEnd);

const groups = new Map();
for (const match of tabsBlock.matchAll(/id:\s*"([a-z]+)"\s+as Tab,[\s\S]*?children:\s*\[([\s\S]*?)\n\s*\],/g)) {
  groups.set(match[1], [...match[2].matchAll(/id:\s*"([a-z]+)"/g)].map((m) => m[1]));
}
const singles = [...tabsBlock.matchAll(/\{\s*id:\s*"([a-z]+)",\s*label:\s*"[^"]+",\s*icon/g)].map((m) => m[1]);

if (!groups.size) note("no group with children was parsed out of TABS — the table's shape changed");

/* ---------- GroupShell: the strip each group paints ---------- */
const shells = new Map();
for (const match of source.matchAll(/group === "([a-z]+)"[\s\S]{0,80}?<GroupShell\s+sections=\{\[([\s\S]*?)\]\}/g)) {
  shells.set(match[1], [...match[2].matchAll(/id:\s*"([a-z]+)"/g)].map((m) => m[1]));
}

for (const [group, children] of groups) {
  const strip = shells.get(group);
  if (!strip) {
    note(`${group}: TABS has ${children.length} screens but no GroupShell sections were found`);
    continue;
  }
  for (const id of children) {
    if (!strip.includes(id)) note(`${group}: "${id}" is in TABS but not in the group's strip — it would paint "${strip[0]}"`);
  }
  for (const id of strip) {
    if (!children.includes(id)) note(`${group}: "${id}" is in the strip but not in TABS — its address points somewhere else`);
  }
  if (new Set(strip).size !== strip.length) note(`${group}: a section appears twice in the strip`);
}

/* ---------- one home per screen ---------- */
const homes = new Map();
for (const id of singles) {
  if (homes.has(id)) note(`"${id}" is listed twice (also under ${homes.get(id)})`);
  homes.set(id, "a single screen");
}
for (const [group, children] of groups) {
  for (const id of children) {
    if (homes.has(id)) note(`"${id}" is listed twice (${homes.get(id)} and ${group})`);
    homes.set(id, group);
  }
  if (new Set(children).size !== children.length) note(`${group}: TABS lists the same screen twice`);
}

const total = singles.length + [...groups.values()].reduce((n, c) => n + c.length, 0);
console.log(`routing-audit — ${FILE}`);
console.log(`  ${singles.length} single screen(s), ${groups.size} group(s), ${shells.size} strip(s), ${total} screens in total`);

if (problems.length) {
  for (const problem of problems) console.log(`  ✗ ${problem}`);
  console.log(`\nrouting: ${problems.length} problem(s). A screen whose strip does not list it paints the wrong panel.`);
  process.exit(1);
}
console.log("\nrouting: every screen has one home, and every strip lists exactly the screens TABS gives it.");
