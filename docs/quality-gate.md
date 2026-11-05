> This is the source of the local skill `.agents/skills/ui-quality-gate/SKILL.md` (that tree is
> gitignored — skills are tool configuration, not product code). Edit here; copy it back with
> `cp docs/quality-gate.md .agents/skills/ui-quality-gate/SKILL.md`.

---
name: ui-quality-gate
description: "Use when the task is to audit, fix or redesign the KolbeVintage interface: panel (src/pages/Admin*), storefront pages, studio/widgets. Runs this project's own evidence-gathering commands (stylesheet ratchet, responsive arithmetic, contrast, class coverage, jsdom render smoke, axe-core) and then edits code with the project's design contract. Three modes: audit (report only), fix (small defects with tests), redesign (level 3-5 work with regression checks). Not for backend-only or copy-only tasks."
metadata:
  version: 1.0.0
  project: kolbevintage-vite
---

# ui-quality-gate

This skill does not restate generic UI advice. It encodes **how this project proves a UI claim**,
and it routes the actual craft work to the installed design skills.

## Modes

**audit** — change nothing, produce evidence:

```bash
npm run audit            # contrast tokens, mobile passes, widget bundle, stylesheet ratchet,
                         # responsive arithmetic, class coverage (offline, ~20s)
npm run audit:a11y       # axe-core on 10 panel screens in jsdom (needs the API on :4000)
npm run smoke:panel      # every panel screen rendered content (needs the API)
npm run goldens          # pixel baselines — needs a Chromium; the preflight says if there is one
```

**fix** — one defect class at a time, with the gate re-run before the commit:

1. write the finding down with its number (which viewport, which selector, which contrast ratio);
2. fix the cause, not the instance (token, scale, component), because the panel has four places
   that paint the same thing;
3. re-run `npm run audit` and, for markup, `npm run audit:a11y`;
4. commit with the measurement in the message.

**redesign** — level 3–5 work on a screen:

1. capture the "before" evidence: `smoke:panel` output for that route, the axe result, the
   stylesheet findings that touch it, plus a screenshot if a browser exists;
2. design against `docs/DESIGN.md` (tokens, type scale, spacing rhythm, radii, layers, motion);
3. keep the data path untouched — the API, the ops document and localStorage keys are contracts;
4. after the change: `npm run audit && npm run smoke:panel && npm run audit:a11y`, and re-check
   the screens the shared component also appears on.

## Non-negotiables for this project

- Persian, RTL, ZWNJ in copy. No English UI strings. Numbers in Persian digits.
- Never invent a number: if a figure cannot be computed, say so in place.
- Logical CSS properties only (`inset-inline-*`, `padding-inline-*`); the translate that opens the
  drawer flips with `:dir(ltr)`.
- Money is never ellipsised; the unit wraps.
- Text colours come from tokens, and tokens are measured (`npm run audit:contrast`).
- No `transition: all`, no `100vh` on a full-height surface, no removed focus ring without an
  equivalent, no `!important` when a more specific selector will do.
- A rule that a later rule silently overwrites is a bug, not a style (`lint:responsive` finds it).

## Where the craft knowledge lives

| Job | Skill |
| --- | --- |
| long-form critique, hierarchy, polish, DESIGN.md discipline | `impeccable` |
| design-system search, palettes, RTL patterns, stack-specific UI | `ui-ux-pro-max` |
| art direction, composition, escaping generic layout | `design-taste-frontend` |
| accessibility, forms, focus, semantic HTML review | `web-design-guidelines` |
| interaction rules (concentric radii, hit areas, optical alignment) | `make-interfaces-feel-better` |
| browser QA scenarios | `webapp-testing`, `visual-regression-tester` |
| Core Web Vitals, performance budgets | `core-web-vitals`, `web-quality-audit` |

## Evidence rules

- jsdom proves structure, names and roles. It never proves layout, colour or contrast.
- Anything that says "looks right" needs either a golden screenshot or a measured ratio.
- If a tool is missing (no Chromium in the sandbox), say so in the report and leave the exact
  command that would run it.
