# KolbeVintage V3 — Frontend Component & Data Contracts

1. **Approved Specialist Products Table (`src/app/products/page.tsx`)**:
   - Preserves horizontal scroll on mobile (`320px–768px`) with sticky RTL-side product identity (`sticky right-0 z-10`).
   - Expandable product rows display explicit valid color-size combinations from `product_variants` (never forced Cartesian products).
   - Main row shows minimum valid effective price (`از X تومان` when variants differ) without implying all variants share the lowest price.
   - Publication status (`published | draft | needs_review | archived`) is strictly decoupled from stock availability.

2. **Two-Stage Product Creation & Variant Matrix (`src/app/products/new/page.tsx`, `src/app/products/[id]/page.tsx`)**:
   - Stage 1 creates strictly a `draft` product (`status = 'draft'`).
   - Stage 2 organizes editing into 7 tabs with unsaved-changes protection and a single primary save action.
   - Pricing resolution (`src/lib/pricing.ts`) follows `skuPriceOverride ?? colorPriceOverride ?? productBasePrice` plus tri-state direct discount (`inherit | none | explicit`).
   - Stock fields inside Catalog Editor are strictly read-only; stock mutations occur exclusively through `/api/inventory/operations`.
