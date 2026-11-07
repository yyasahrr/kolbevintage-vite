import { defineConfig, devices } from "@playwright/test";

/**
 * Visual goldens for the panel.
 *
 * Why: every "does the panel look right" claim used to be code-reading. This config takes
 * one screenshot per screen × width × theme and diffs it against the committed baseline,
 * so a spacing regression shows up as a red image instead of a complaint three weeks later.
 *
 * It needs a Chromium binary. `npx playwright install chromium` fetches one; in an
 * environment that cannot download browsers, point PLAYWRIGHT_CHROMIUM_PATH at any local
 * Chromium and it will be used instead.
 *
 *   npm run goldens          # compare against tests/visual/__screenshots__
 *   npm run goldens:update   # accept the current rendering as the new baseline
 */
const PORT = Number(process.env.GOLDENS_PORT ?? 4000);
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH;

export default defineConfig({
  testDir: ".",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [["list"]],
  expect: {
    toHaveScreenshot: {
      // a font hinting difference on another OS should fail loudly; a caret or a
      // sub-pixel scrollbar should not
      maxDiffPixelRatio: 0.005,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  use: {
    baseURL: process.env.GOLDENS_BASE_URL ?? `http://127.0.0.1:${PORT}`,
    // the panel is a Persian RTL app; the browser must not decide the direction
    locale: "fa-IR",
    timezoneId: "Asia/Tehran",
    colorScheme: "light",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
    ...(CHROMIUM ? { launchOptions: { executablePath: CHROMIUM, args: ["--no-sandbox"] } } : {}),
  },
  projects: [
    { name: "phone", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: false } },
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } } },
    { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } } },
  ],
});
