#!/usr/bin/env node
/* =====================================================================
   Clear the demo shop (decisions 92 + 98)

   The catalogue that ships with this repository is demonstration data: 28
   products, the demo customer, the demo orders. Before the real shop goes
   live, all of it goes.

   This script refuses to run unless BOTH of these are true:
     1. a real backup file is passed with --backup=<file>, and
     2. the owner types --yes.

   Order of operations (documented in docs/admin-decisions-fa.md):
     backup → restore test → announce → clear → enter real products.

   What is kept: staff/roles, sessions, settings documents (state_documents),
   because throwing away the login would lock the owner out of the empty shop.
   What is cleared: products and everything commerce-shaped around them.
   ===================================================================== */

import fs from "node:fs";
import path from "node:path";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const backupFile = arg("backup");
const dryRun = process.argv.includes("--dry-run");

/** everything the demo filled, children before parents */
const TABLES = [
  "outbox_events",
  "fulfillment_events",
  "payment_attempts",
  "refunds",
  "exchange_payments",
  "order_lines",
  "orders",
  "cart_lines",
  "carts",
  "checkout_sessions",
  "stock_reservations",
  "inventory_movements",
  "inventory_adjustments",
  "product_complements",
  "product_images",
  "product_variants",
  "products",
  "price_rules",
  "coupons",
  "customers",
];

if (!backupFile) {
  console.error("این اسکریپت بدون پشتیبان قبلی اجرا نمی‌شود.");
  console.error("اول از پنل (سیستم → پشتیبان‌گیری) یک پشتیبان بگیر، بعد:");
  console.error("  npm run clear-demo -- --backup=server/.backups/<file>.json.gz --yes");
  process.exit(1);
}
const resolved = path.isAbsolute(backupFile) ? backupFile : path.resolve(process.cwd(), backupFile);
if (!fs.existsSync(resolved)) {
  console.error(`فایل پشتیبان پیدا نشد: ${resolved}`);
  process.exit(1);
}
if (!dryRun && !process.argv.includes("--yes")) {
  console.error("این کار محصولات، سفارش‌ها و مشتریان نمایشی را برای همیشه پاک می‌کند.");
  console.error("برای انجام، همان دستور را با --yes اجرا کن (یا با --dry-run فقط بشمار).");
  process.exit(1);
}

const { initDb, closeDb, query } = await import("../server/src/db.ts");

await initDb();
try {
  const counts = [];
  for (const table of TABLES) {
    const res = await query(`select count(*)::int as n from ${table}`);
    counts.push([table, res.rows[0].n]);
  }
  const total = counts.reduce((n, [, c]) => n + c, 0);
  console.log(`فایل پشتیبان: ${resolved}`);
  console.log(`ردیف‌هایی که پاک می‌شوند: ${total}`);
  for (const [table, n] of counts) if (n) console.log(`  ${table}: ${n}`);
  if (dryRun) {
    console.log("حالت --dry-run: هیچ‌چیز پاک نشد.");
  } else {
    await query(`truncate table ${TABLES.join(", ")} restart identity cascade`);
    const after = await query(`select count(*)::int as n from products`);
    console.log(`پاک شد. محصولات باقی‌مانده: ${after.rows[0].n}`);
    console.log("حالا محصولات واقعی را از پنل وارد کن؛ صفحهٔ سلامت را هم یک‌بار ببین.");
  }
} catch (error) {
  console.error("پاک‌سازی ناموفق بود:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
