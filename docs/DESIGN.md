# DESIGN.md — the panel's visual contract

This file exists because the panel's look used to live only in CSS, and the CSS had grown
**29 font sizes, 24 radii and 86 distinct pixel values**. Two screens could not agree on a
gap because nobody had ever written down what a gap is.

Everything below is enforceable: `npm run lint:ui` (`scripts/ui-audit.mjs`) reads it against
`src/styles/admin.css` and refuses new values outside these scales.

## 1. Spacing

One rhythm, applied by the shell, not by screens:

| token | value | where |
| --- | --- | --- |
| `--ad-stack` | `14px` | between panels on any screen |
| `--ad-stack-lg` | `20px` | before a section that starts a new task |
| `--ad-pad-card` | `14px` | inside `.ad-card`, `.ad-stat`, `.ad-return` |
| `--ad-radius-box` | `14px` | the same box everywhere |

Inside a component the allowed distances are `4 / 6 / 8 / 10 / 12 / 16 / 20 / 24`. A `5px`
or `13px` is not a decision, it is drift. `.ad-main > * + *` provides the screen rhythm;
screens must not add their own top margins to fake it.

## 2. Type

The panel is dense; the scale is small on purpose.

| role | size | weight | line-height |
| --- | --- | --- | --- |
| screen title (`.ad-head h2`) | 19px | 600 | 1.35 |
| card title (`.ad-card-head h3`) | 13px | 600 | 1.5 |
| body / table cell | 11.5px | 400 | 1.75 |
| label / hint | 10.5–11px | 400–600 | 1.6 |
| micro (badge, rank) | 9–9.5px | 600 | 1.4 |
| number in a money column | same as body | 400 | `tabular-nums` |

Persian text: **line-height 1.8–2 for reading blocks**, **letter-spacing 0 always** (the
script is cursive; tracking breaks the joins). Numbers that change on screen get
`font-variant-numeric: tabular-nums` so the table does not jitter.

## 3. Radii

`6 / 8 / 10 / 12 / 14 / 18 / 999`. Nested corners stay concentric: an inner box inside a
14px padded 12px-radius parent uses 12px, never 14px.

## 4. Sides are logical

`margin-inline-start`, `padding-inline-end`, `inset-inline-start`, `border-inline-start`,
`text-align: start`. A physical `left` or `right` is a bug in an RTL product unless it is a
deliberate decorative offset, and then it carries a `/* ui-audit:allow physical */` note
next to it with the reason. The drawer's entry animation uses `--ad-enter-x`, which flips
under `:dir(ltr)`.

## 5. Focus

Every interactive element keeps a visible keyboard ring. `outline: none` is allowed only
when the same element paints an equivalent ring another way, and the line says so
(`/* ui-audit:allow outlineNone */`). The palette field does this with `:focus-within` on its
wrapper; the studio draws a 2px ring on `:focus-visible`.

## 6. Motion

Transitions name their properties. `transition: all` is banned: it animates layout and
paint properties nobody meant to move. Standard set for a surface:
`color .18s, background-color .18s, border-color .18s, box-shadow .2s, transform .2s, opacity .2s`.
`prefers-reduced-motion: reduce` removes transforms and animations, keeps opacity changes.

## 7. Content states

A number that cannot be computed says so in words ("دورهٔ قبل دادهای ندارد") instead of
showing `0`. An empty list says what would fill it. Nothing on screen is sample data.

## 8. Where this is checked

| gate | command | runs without a browser |
| --- | --- | --- |
| stylesheet rules | `npm run lint:ui` | yes |
| screen rendering | `npm run goldens` | no — needs Chromium |
| contrast | `npm run audit:contrast` | yes |
| small screens | `npm run audit:mobile` | yes |

The golden suite (`tests/visual/`) covers dashboard, orders, products, returns, cashback,
reports and the product-editor modal in light and dark at 390/768/1280/1600px.

## Sizes: what each breakpoint is for

There are four layout breakpoints, and every component picks one of them — not its own.

| Width | What changes | Why |
| --- | --- | --- |
| `< 560` | single motion: sheets instead of modals, 44px targets, 16px inputs, tables scroll inside their own box | a phone gets its own shell, not a squeezed desktop |
| `≥ 640` | two-column forms, 3-across KPIs, centred modal | a tablet has room for two fields per row |
| `≥ 900` | the rail appears (224px) — **the shell's switch** | one place where navigation changes shape |
| `≥ 960` | two-up card grids (`.ad-grid-2`, `.ad-report-grid`) | two 300px cards only fit once the rail is out of the way |
| `≥ 1100` | 4-across KPIs | density for a laptop |
| `≥ 1440` | 6-across KPIs | a card is finally wide enough for a price and its unit |

Two rules that follow from the table:

- **A media query that changes a component's shape must also change at one of these
  widths.** 720/760/800/860 are leftovers; `npm run lint:responsive` lists them so they
  are not mistaken for intent.
- **A grid may not squeeze a card below the width its content needs** (110px for a
  separated price, 300px for a card holding a table). `scripts/responsive-audit.mjs`
  does that arithmetic for 15 viewports and fails the build when it stops adding up.

### Text that does not fit

Money is never ellipsised. A price is one unbreakable token plus a unit; when the column
is narrow the unit wraps to a second line. An ellipsised price is a wrong price.

Chart axes have a floor: a column narrower than its label turns the axis into a smear, so
the column has `min-width: 34px` and the chart scrolls horizontally instead of compressing.
Labels wrap at their space («۱۲ آبان» on two lines) rather than rotating into the neighbour.
