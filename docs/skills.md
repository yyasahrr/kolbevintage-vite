# Skills

`.agents/` is gitignored in this repository, so the skills themselves are not in Git — this
file is the inventory, and `npm run skills:install` fetches them.

```bash
npm run skills:install      # install what is missing
npm run skills:install -- --check
```

Skills are small, self-contained playbooks an agent loads before a kind of work. They live
here (not in a global config) so the rules travel with the code they govern.

## Installed for this round (2026-11-05)

| Skill | What it is for | Source | Licence |
| --- | --- | --- | --- |
| `impeccable` | Design direction, `critique` / `audit` / `polish` / `document` passes, `craft-floor` bans, DESIGN.md | already present | see folder |
| `ui-ux-pro-max` | Searchable UX/layout/typography rules (`scripts/search.py --rtl`) | already present | see folder |
| `emil-design-eng` | Interaction and motion craft | already present | see folder |
| `web-design-guidelines` | Vercel's interface rules as a file:line review | already present | MIT |
| `frontend-design` | Commits to one visual direction instead of a template | already present | see `LICENSE.txt` |
| **`make-interfaces-feel-better`** | 16 polish rules: concentric radii, optical alignment, tabular numerals, 40px hit areas, layered shadows, `text-wrap: balance` | `jakubkrehel/make-interfaces-feel-better` | MIT |
| **`webapp-testing`** | Driving a real browser: screenshots, console errors, flows | `anthropics/skills` | see `LICENSE.txt` |
| **`visual-regression-tester`** | Playwright screenshot diffing setup and checklist (baselines, viewports, dark mode, CI) | `patricio0312rev/skills` | see folder |
| **`accessibility`** | WCAG review: focus, labels, contrast, keyboard order | `addyosmani/web-quality-skills` | MIT |
| **`core-web-vitals`** | LCP / INP / CLS budgets | `addyosmani/web-quality-skills` | MIT |
| **`web-quality-audit`** | The audit that ties the three above together | `addyosmani/web-quality-skills` | MIT |
| **`userinterface-wiki`** | Interface principles: motion, typography, interaction, content | `raphaelsalaja/userinterface-wiki` | see folder |
| **`theme-factory`** | Turning a look into design tokens | `anthropics/skills` | see `LICENSE.txt` |
| **`design-md`** | The DESIGN.md format (`docs/DESIGN.md` is this project's file) | `google-labs-code/design.md` | see folder |

## Which one for which job

| The work | Load |
| --- | --- |
| "the panel looks wrong somewhere" | `impeccable` (`critique`, then `audit`), then `make-interfaces-feel-better` for the detail pass |
| spacing / radius / type drift | `docs/DESIGN.md` + `npm run lint:ui`; `impeccable typeset` when the hierarchy itself is wrong |
| RTL, Persian text, mixed digits | `ui-ux-pro-max --rtl`, `docs/DESIGN.md` §4 |
| a screen must be proven, not claimed | `visual-regression-tester` + `tests/visual/` |
| accessibility review | `accessibility`, then `npm run audit:contrast` |
| motion that feels wrong | `emil-design-eng`, `review-animations` |
| a new surface from zero | `frontend-design`, `impeccable shape` |

## Notes

- Skills are read, not executed: they are markdown plus optional helper scripts. Nothing
  here runs at build time or ships to the browser.
- `impeccable` and `ui-ux-pro-max` carry their own helpers (`scripts/impeccable`,
  `scripts/search.py`); everything else is plain markdown.
- Vendored copies are pinned to the commit they were cloned at; update deliberately, not by
  running a sync command in a hurry.

## Skills this project added for itself

| Skill | Where | Use |
| --- | --- | --- |
| `design-taste-frontend` (tasteskill 2.5) | `Leonxlnx/taste-skill` → `skills/taste-skill` | art direction, composition, escaping templated layout |
| `ui-quality-gate` | this repo: `docs/quality-gate.md` → `.agents/skills/ui-quality-gate/` | audit / fix / redesign modes, wired to this project's gates |

`ui-quality-gate` is not fetched from anywhere: it is the project's own procedure. Edit
`docs/quality-gate.md` and copy it into `.agents/skills/ui-quality-gate/SKILL.md`
(`npm run skills:install -- --check` reports it like the others).
