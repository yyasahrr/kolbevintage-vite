# KolbeVintage — Frontend Prototype

A Persian/RTL fashion storefront and visual site-builder prototype built with **React 19, TypeScript, Vite 7 and Tailwind CSS 4**.

## Requirements

- Node.js 22 (recommended)
- npm

## Run locally

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. To generate a production build:

```bash
npm run build
npm run preview
```

## Project layout

- `src/pages/` — storefront, product, checkout, account, admin and editorial pages
- `src/components/` — reusable storefront and styling components
- `src/builder/` — visual site-builder prototype
- `src/state/` — client-side application state
- `src/data/` — demo catalog/editorial data
- `src/assets/` — local imagery

The app uses a `HashRouter`; routes appear after `/#/` in the address bar.

## Security and operational limitations

**This is a browser-side prototype, not a production commerce backend.** Authentication/OTP, administration, order flows and other operational features may be simulated and/or saved in browser `localStorage`. The demo authentication implementation stores passwords in browser-readable state, so **do not use real passwords, payment credentials, or customer data** with this version.

Before publishing as a live store, implement server-side authentication, authorization, real OTP handling, secure credential storage, inventory and order persistence, payment verification, validation, and operational logging. The presence of an admin UI does not imply access control.

## Repository

The original uploaded project files are preserved; the repository adds documentation, a `.gitignore`, and a publishing helper. No license has been selected.
