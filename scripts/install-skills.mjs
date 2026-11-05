#!/usr/bin/env node
/**
 * skills:install — fetch the design skills this repository works with.
 *
 * `.agents/` is gitignored here on purpose: skills are tool configuration, not product
 * code, and vendoring megabytes of markdown into every clone is not a trade this repo
 * wants. So the list lives in code, the installer is one command, and `docs/skills.md`
 * says what each one is for.
 *
 * Usage:
 *   node scripts/install-skills.mjs            # install what is missing
 *   node scripts/install-skills.mjs --check    # report what is present, change nothing
 *   node scripts/install-skills.mjs --force    # re-download everything
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "..");
const TARGET = path.join(ROOT, ".agents", "skills");
const args = new Set(process.argv.slice(2));

/** repo + the directory inside it that holds the skill */
const SKILLS = [
  { id: "make-interfaces-feel-better", repo: "jakubkrehel/make-interfaces-feel-better", dir: "skills/make-interfaces-feel-better" },
  { id: "webapp-testing", repo: "anthropics/skills", dir: "skills/webapp-testing" },
  { id: "theme-factory", repo: "anthropics/skills", dir: "skills/theme-factory" },
  { id: "accessibility", repo: "addyosmani/web-quality-skills", dir: "skills/accessibility" },
  { id: "core-web-vitals", repo: "addyosmani/web-quality-skills", dir: "skills/core-web-vitals" },
  { id: "web-quality-audit", repo: "addyosmani/web-quality-skills", dir: "skills/web-quality-audit" },
  { id: "userinterface-wiki", repo: "raphaelsalaja/userinterface-wiki", dir: "skills" },
  { id: "visual-regression-tester", repo: "patricio0312rev/skills", dir: "testing/visual-regression-tester" },
];

/** skills this repository already carries; listed so `--check` reports the whole set */
const LOCAL = ["impeccable", "ui-ux-pro-max", "emil-design-eng", "web-design-guidelines", "frontend-design", "design-md", "animate", "review-animations"];

const check = args.has("--check");
const force = args.has("--force");

let installed = 0;
let present = 0;
let failed = 0;

for (const skill of SKILLS) {
  const dest = path.join(TARGET, skill.id);
  if (existsSync(path.join(dest, "SKILL.md")) && !force) {
    present += 1;
    console.log(`  · ${skill.id.padEnd(30)} already present`);
    continue;
  }
  if (check) {
    console.log(`  ✗ ${skill.id.padEnd(30)} missing`);
    failed += 1;
    continue;
  }
  const tmp = await mkdtemp(path.join(os.tmpdir(), "skill-"));
  try {
    await run("git", ["clone", "--depth", "1", "--quiet", `https://github.com/${skill.repo}.git`, path.join(tmp, "repo")], { timeout: 180_000 });
    const source = path.join(tmp, "repo", skill.dir);
    if (!existsSync(source)) throw new Error(`path ${skill.dir} not found in ${skill.repo}`);
    await cp(source, dest, { recursive: true });
    installed += 1;
    console.log(`  ✓ ${skill.id.padEnd(30)} installed`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${skill.id.padEnd(30)} ${error instanceof Error ? error.message.split("\n")[0] : "failed"}`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

const onDisk = existsSync(TARGET) ? (await readdir(TARGET)).filter((id) => existsSync(path.join(TARGET, id, "SKILL.md"))) : [];

console.log(
  `\nskills: ${onDisk.length} on disk (${present} already present, ${installed} installed, ${failed} missing)` +
    `\n  complete set expected: ${[...LOCAL, ...SKILLS.map((s) => s.id)].length} — see docs/skills.md` +
    (failed ? "\n  a network that blocks github.com will cause the misses above; the stylesheet and test gates do not need them." : "") +
    "\n",
);
process.exit(failed && check ? 1 : 0);
