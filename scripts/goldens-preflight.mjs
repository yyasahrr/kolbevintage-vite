#!/usr/bin/env node
/**
 * goldens-preflight — say why the visual suite cannot run, in one sentence and a fix.
 *
 * Playwright's own failure ("Executable doesn't exist … npx playwright install") is only
 * true half the time. The other half is a Chromium that exists but cannot load: a sandbox
 * with no libnss3, a container without fonts. This script separates those cases so the next
 * person does not spend an hour on the wrong fix.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const candidates = [];
if (process.env.PLAYWRIGHT_CHROMIUM_PATH) candidates.push({ path: process.env.PLAYWRIGHT_CHROMIUM_PATH, source: "PLAYWRIGHT_CHROMIUM_PATH" });

for (const base of ["/usr/bin", "/usr/local/bin", "/opt"]) {
  for (const name of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    const p = path.join(base, name);
    if (existsSync(p)) candidates.push({ path: p, source: "system" });
  }
}

// an npm-packaged build, if a project chooses to add one (a sandbox that blocks browser
// downloads can still extract a binary this way). Optional by design: no hard dependency.
try {
  const mod = await import("@sparticuz/chromium");
  const extracted = await mod.default?.executablePath?.();
  if (extracted && existsSync(extracted)) candidates.push({ path: extracted, source: "@sparticuz/chromium" });
} catch {
  /* not installed: fine */
}

// Playwright keeps its downloads here; an empty cache directory is not a browser
const cacheDir = path.join(os.homedir(), ".cache", "ms-playwright");
for (const entry of existsSync(cacheDir) ? await readdir(cacheDir) : []) {
  for (const rel of ["chrome-linux/chrome", "chrome-linux/headless_shell", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]) {
    const p = path.join(cacheDir, entry, rel);
    if (existsSync(p)) candidates.push({ path: p, source: "playwright cache" });
  }
}

if (!candidates.length) {
  console.error(
    [
      "",
      "goldens: no browser found.",
      "",
      "  On a machine with network:   npx playwright install chromium",
      "  With a local Chromium:       PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npm run goldens",
      "",
      "The stylesheet gate still runs without a browser: npm run lint:ui",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

const candidate = candidates[0];
if (candidate.source === "playwright cache") {
  console.log(`goldens: using Playwright's browser cache at ${candidate.path}`);
  process.exit(0);
}

/** a binary that exists is not a binary that runs */
function missingLibraries(bin) {
  try {
    const out = execFileSync("ldd", [bin], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return out
      .split("\n")
      .filter((line) => line.includes("not found"))
      .map((line) => line.trim().split(" ")[0]);
  } catch {
    return []; // ldd unavailable (macOS): let Playwright try
  }
}

const missing = missingLibraries(candidate.path);
if (missing.length) {
  console.error(
    [
      "",
      `goldens: found a browser (${candidate.source}) at ${candidate.path}, but it cannot start.`,
      `  missing shared libraries: ${missing.join(", ")}`,
      "",
      "  That is a host problem, not a test problem. Either install them:",
      "    Debian/Ubuntu: sudo apt-get install -y libnss3 libnspr4 libatk1.0-0 libgbm1 libasound2",
      "  or run the suite where a browser is already healthy (a laptop or CI image).",
      "",
      "  Nothing else is blocked: npm run lint:ui, npm test and npm run build all run here.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(`goldens: using ${candidate.path} (${candidate.source})`);
