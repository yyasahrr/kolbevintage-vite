# KolbeVintage — Full-Stack Storefront

A Persian/RTL fashion storefront, an admin panel and a visual site-builder
prototype. The frontend is **React 19 + TypeScript + Vite 7 + Tailwind CSS 4**;
the backend is **Fastify 5 + PostgreSQL** with real sessions, file uploads and
a relational catalogue.

## Requirements

- Node.js 22 (recommended) and npm
- No external database is required for development: an embedded PostgreSQL
  cluster is started automatically by `server/src/db.ts`
  (binaries come from the `embedded-postgres` npm package)

## Run locally

```bash
npm ci
npm run dev
```

`npm run dev` starts both processes:

| Process | URL | What it is |
| --- | --- | --- |
| `web` | http://localhost:5173 | Vite dev server (the preview) |
| `api` | http://localhost:4000 | Fastify API + PostgreSQL |

Vite proxies `/api` and `/uploads` to the API, so the browser only ever talks
to one origin. The first run initialises PostgreSQL in `server/.pgdata`
(git-ignored), applies `server/src/schema.sql`, seeds the demo catalogue from
`server/seed/state.json` and creates the demo customer.

Useful commands:

```bash
npm run api         # only the backend (port 4000)
npm run dev:web     # only the frontend (port 5173)
npm run seed        # regenerate server/seed/state.json from the demo data
npm run typecheck   # frontend + backend TypeScript
npm run build       # production SPA build into dist/
npm run test:commerce  # integration tests for the commerce core (real PostgreSQL)
```

### Admin panel

Open `/#/admin` — demo passcode **1234**. Logging in also opens a real
server session (`POST /api/admin/login`); every product, image, complement,
order, customer and settings change is written to PostgreSQL and survives a
reload or a different browser.

### Production

```bash
npm run build
npm start
```

`npm start` runs Fastify with `SERVE_STATIC=1 REQUIRE_ADMIN_AUTH=1`, serving
`dist/` and the API from the same origin on port 4000. Set `DATABASE_URL` to
use an external PostgreSQL instead of the embedded cluster. See
`.env.example` for every variable.

## Backend

- **Database**: `state_documents` keeps the full admin/ops documents (so the
  prototype UI stays compatible), while products, images, complements,
  orders, customers and sessions are projected into relational tables.
- **Sessions**: HTTP-only `kv_session` cookie, server-side session rows,
  expiry and logout; admin writes/uploads require it when
  `REQUIRE_ADMIN_AUTH=1`.
- **Uploads**: `POST /api/uploads` stores images under `server/uploads`
  (8 MB limit, images only) and returns a relative `/uploads/...` URL.
  The media editor falls back to an inline data URL when the API is offline.
- **Deep linking**: the embedded PostgreSQL is reused when its cluster is
  already running, so restarting the API does not lose data.

## Commerce core (V3)

Stock, pricing, checkout, payments, orders, refunds and events now live in a
dedicated commerce module (`server/src/commerce/`) — see
[`docs/commerce-core.md`](docs/commerce-core.md) for the full contract.

- **Variants**: every colour × size combination has a stable variant id and SKU;
  stock and orders attach to the variant, never to the product name.
- **Reservation**: adding to the cart reserves nothing. Entering checkout holds
  the whole bag atomically (default 10 minutes, configurable) and a second
  shopper gets `409 insufficient_stock` instead of overselling.
- **Pricing**: quotes are computed and versioned on the server; a price change
  between quote and payment returns `409 quote_stale`. Campaigns are chosen by
  priority → age → id and never stack with a coupon by default.
- **Payments**: callback ≠ proof. The backend verifies with the provider, keeps
  uncertain answers in `pending_verification`, settles exactly once, and turns a
  payment that arrives after the hold expired into an `exception` order.
- **BNPL**: one store-wide switch for the 4-installment gateway, applied to the
  whole order (owner decision replacing the old per-product eligibility rule).
- **Refunds**: partial per order line, adjustment documents only, and live
  refunds are fail-closed until a protected Superadmin enables them.
- **Outbox**: `order.paid`, `order.exception`, `order.cancelled` and
  `refund.settled` are delivered asynchronously with retries, so a dead SMS
  provider cannot invalidate an order.

The storefront checkout now calls this module end to end (server-priced totals,
installment option, out-of-stock warnings), and the admin panel gets a new
**«تجارت و پرداخت»** tab for the store-wide switches.

### API overview

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | DB status and row counts |
| GET | `/api/bootstrap` | Admin + ops documents, session state |
| PUT | `/api/state/:kind` | Save the `admin` or `ops` document (projected) |
| GET | `/api/products` | Public catalogue (`?all=1`, `?q=`, `?category=`) |
| GET | `/api/products/:id` | Product with images and complements |
| POST | `/api/orders` | Checkout — create an order |
| PATCH | `/api/orders/:id` | Update order status (admin) |
| GET | `/api/orders`, `/api/customers` | Admin lists |
| POST | `/api/uploads` | Multipart image upload (admin) |
| POST | `/api/admin/login` · `/logout` · GET `/api/admin/session` | Admin auth |
| POST | `/api/auth/register` · `/login` · `/logout` · GET `/api/auth/me` | Customer auth |
| POST | `/api/auth/otp/request` · `/verify` | Demo OTP login (code returned) |
| PATCH | `/api/auth/profile` | Profile, addresses and sizes |

## Project layout

- `src/pages/` — storefront, product, checkout, account, admin, editorial
- `src/components/` — reusable storefront and styling components
- `src/builder/` — visual site-builder prototype
- `src/state/` — stores (`admin`, `ops`, `cart`, `auth`) + API sync bridge
- `src/lib/api.ts` — typed API client (relative URLs, cookies included)
- `server/src/` — Fastify app, routes, schema, projection, sessions, seed
- `server/src/commerce/` — variants, inventory ledger, pricing, cart, checkout,
  payments, orders, refunds, outbox
- `server/test/commerce.test.ts` — commerce integration tests
- `docs/commerce-core.md` — commerce contracts and decisions
- `server/seed/state.json` — initial catalogue + admin/ops documents

## Security and operational limitations

This remains a demo/prototype, not a production commerce backend:

- The OTP code is returned in the API response (and shown in the UI) instead
  of being sent by SMS/email; wire a real provider before launch.
- The payment gateway is a mock adapter: the server-side verify/idempotency
  contract is real, but no bank is contacted. Replace `mock`/`mock-bnpl4` with a
  provider adapter before launch.
- Live refunds stay disabled (fail-closed) until `SUPERADMIN_PASSCODE` is set
  and a Superadmin turns them on in the admin panel.
- `REQUIRE_ADMIN_AUTH` is off in development so the demo works offline.
  Always enable it (as `npm start` does) and change the default passcode.
- Uploaded files are stored locally; use object storage for multi-instance
  deployments. CORS is permissive in the prototype.
- Before going live add: rate limiting, CSRF protection, image sanitising,
  backups and audit logs (price and stock are already validated server-side).

## Repository

Original uploaded project files are preserved; this repository adds the
Fastify/PostgreSQL backend, documentation and ignore rules. No license has been
selected.
