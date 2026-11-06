# KolbeVintage V3 — Cross-Agent Integration Handoff & Business-Decision Register

## Cross-Agent Ownership Boundaries
- **Agent 1 (OMS)**: Owns authoritative payment verification, historical order price locking (`recordedUnitPrice`), picking/packing validation, shipment tracking handoff, 100×150mm shipping label print eligibility, and return/refund provider confirmation.
- **Agent 2 (Catalog & Inventory)**: Owns explicit color-size variant combinations, tri-state SKU discounts, color-dependent media collections, and the authoritative warehouse ledger (`inventory_movements`, `inventory_adjustments`).
- **Agent 3 (Site Studio & CMS)**: Owns visual page rendering, draft/publish versioning, and storefront Style Pack token publication. Agent 4 provides the Layer-Panel visual shell (`/appearance/studio`) and Style Pack selector (`/appearance/style-packs`).

## Open Business-Decision Register
1. **BD-01 (Try-On)**: Pending business approval across 4 documented models (Virtual AI Fitting, At-Home Trial, Showroom Appointment, Prepaid 5-Use Digital Styling Service) at `/try-on`.
2. **BD-02 (Outfit Pricing)**: Fixed look price (`fixed_look_price_pending_approval`) and partial-item return rules require financial sign-off; stock reservation remains strictly at the underlying SKU level.
3. **BD-03 (Campaign Stacking)**: Explicit SKU discounts do not stack with festival discounts unless approved by Commerce & Agent 1.
4. **BD-04 (BNPL — Digipay & SnappPay)**: Marked `pending_contract` in `/integrations` until official merchant credentials and installment API contracts are signed.
5. **BD-05 (IRR/IRT Historical Currency)**: All new orders record `IRT` explicitly; historical migrated records are never silently converted.
