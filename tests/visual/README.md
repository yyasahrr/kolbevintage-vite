# Visual goldens

One screenshot per panel screen × width × theme, diffed against `__screenshots__/`.

```bash
npx playwright install chromium   # once, on a machine that can download browsers
npm run dev:api                   # or: SERVE_STATIC=1 PANEL_OPEN_ACCESS=1 npx tsx server/src/index.ts
npm run goldens:update            # first run: accept the current rendering as the baseline
npm run goldens                   # afterwards: fail on any pixel drift
```

**Screens covered** (`panel.visual.spec.ts`): dashboard, orders, products, returns, cashback,
reports, and the product-editor modal — in light and dark, at 390 / 768 / 1280 / 1600 px.

**Why the list is short:** a golden nobody looks at is a slow test. These are the screens
where the panel review found real defects, so a diff here is the expensive kind.

**Baselines are environment-owned.** Font rendering differs between operating systems, so
generate them on the machine (or CI image) that will run the comparison, and commit that
set. A baseline generated on Linux will not match a macOS runner pixel for pixel.

**When a diff is real:** open the two images, fix the layout, regenerate the golden in the
same commit, and say in the message *what* changed. A golden updated without a layout
change is a test being switched off.

**If browsers cannot be installed** (sandboxed network), point at any local Chromium:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npm run goldens
```

The panel's stylesheet is also gated without a browser by `npm run lint:ui`
(`scripts/ui-audit.mjs`): physical left/right properties, values outside the frozen scale,
`transition: all`, killed focus rings and `100vh` are ratcheted against
`scripts/ui-audit.baseline.json`.
