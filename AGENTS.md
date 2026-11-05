# AGENTS.md — working rules for this repository

A Persian (RTL) vintage-clothing shop: React 19 + TypeScript + Vite single-file build, Tailwind v4
for the storefront, a hand-written design system for the admin panel, an Express/Postgres API, and
a 100-widget studio. The copy is Persian; the code is English.

## Commands that must pass before a commit touches the UI

| Command | Proves | Needs |
| --- | --- | --- |
| `npx tsc --noEmit` | the types, including the visual specs | — |
| `npm test` | commerce 54 + rbac 13 | — |
| `npm run build` | the single-file bundle still builds | — |
| `npm run audit` | token contrast, mobile passes, bundled widgets, stylesheet ratchet (`lint:ui`, zero-tolerance for both stylesheets), responsive arithmetic at 19 widths (`lint:responsive`), class coverage (`lint:classes`) | — |
| `npm run smoke:panel` | every panel screen renders content in a DOM (jsdom) | API on `:4000` |
| `npm run audit:a11y` | axe-core (WCAG 2.1 A/AA + best practice) on **37 panel screens + 15 storefront screens** | API on `:4000` |
| `npm run goldens` | pixel baselines for 7 surfaces × 4 widths × 2 themes | a Chromium — this sandbox has none; the preflight says so |

`npm run goldens:update` writes the baselines; run it once on a machine with a browser.

## Design contract

- `docs/DESIGN.md` — the enforceable rules: palette + measured contrast, type scale, 4px spacing
  rhythm, radii, layout breakpoints, layers, motion, focus policy.
- `docs/quality-gate.md` — the local skill `ui-quality-gate` (audit / fix / redesign modes) and
  where the installed design skills live. `.agents/` is gitignored; `npm run skills:install`
  fetches the external ones.
- `docs/admin-decisions-fa.md` — why each panel decision was made, in Persian.

## Hard rules

1. **Persian, RTL, ZWNJ.** No English UI strings; Persian digits in figures.
2. **No invented numbers.** If a value cannot be computed, say so in the interface.
3. **Money never ellipsises.** The unit wraps to a second line instead.
4. **Tokens, not literals.** Text colours come from `--ad-*` (panel) or `--color-*` (shop) tokens;
   `npm run audit:contrast` reads the stylesheet and fails a literal that cannot clear AA.
5. **Logical properties.** `inset-inline-*`, `padding-inline-*`, `margin-block-*`. Direction-aware
   animation flips with `:dir(ltr)`.
6. **Scales are closed.** Type 9/10/11/12/13/15/19/22 (+16 only for iOS form fields), spacing
   0/1/2/4/6/8/10/12/14/16/20/24 (+32–64 page clearance), radii 2/4/6/8/10/12/14/18/999.
   `npm run lint:ui` refuses anything else.
7. **No dead CSS.** A rule a later rule silently overwrites is a bug (`lint:responsive` reports it);
   a class the JSX uses with no rule is a bug (`lint:classes`).
8. **Focus is never deleted.** If `outline: none` is right, an equivalent ring must exist in the
   same rule, and the line carries `/* ui-audit:allow outlineNone */`.
9. **Motion under 280ms**, one curve (`--ad-ease`); no `transition: all`.
10. **Data paths are contracts.** The API, the ops document and the `localStorage` keys
    (`kv_admin_theme`, `kv_*`) keep their shape and names.

## Report format

Every UI claim in a report carries its evidence: the command, the number, the viewport, or the
screenshot path. "Looks better" is not a result.
