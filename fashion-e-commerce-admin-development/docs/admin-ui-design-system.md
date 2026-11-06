# KolbeVintage V3 — ThreadCraft-Inspired Admin Design System

## 1. Visual Direction & Color Tokens
Informed by ThreadCraft's clean operational aesthetic, adapted for Persian (`fa-IR`) RTL fashion commerce with WCAG AA contrast compliance:

| Token | CSS Variable | Value | Usage & Contrast Notes |
|---|---|---|---|
| App Background | `--kv-bg-app` | `#F7F7FB` | Calm neutral workspace canvas |
| Main Surface | `--kv-bg-surface` | `#FFFFFF` | Primary cards, specialist tables, modals |
| Subtle Surface | `--kv-bg-subtle` | `#FAFAFE` | Table headers, expanded sub-rows |
| Primary Text | `--kv-text-primary` | `#080707` | Headings, primary data (>18:1 on white) |
| Muted Text | `--kv-text-muted` | `#626775` | Metadata, helper labels (>5.4:1 on white) |
| Primary Action | `--kv-primary` | `#1813FB` | Primary CTA buttons, active focus (>8.1:1 with white text) |
| Secondary Accent | `--kv-accent-secondary` | `#A9A4E7` | Chart bars, subtle highlights |
| Accent Surface | `--kv-accent-surface` | `#F0EEFF` | Active nav items, selection tint |
| Border | `--kv-border` | `#E5E7EB` | Hairline 1px card & table borders |
| Danger | `--kv-danger` | `#B44F40` | Out-of-stock, wrong-SKU alerts, exceptions |

## 2. Typography & Bidi Isolation
- **Font Family**: Bundled `@fontsource/vazirmatn` (400, 500, 600, 700) — zero external network font dependency.
- **Calendar & Timezone**: Jalali (`fa-IR-u-ca-persian`) in `Asia/Tehran`.
- **Currency**: Iranian Toman (`IRT` / `تومان`) without silent conversion of historical IRR/IRT records.
- **Bidi Isolation**: All SKUs, order codes, tracking numbers, emails, and HEX values wrapped in `<bdi dir="ltr">`.
