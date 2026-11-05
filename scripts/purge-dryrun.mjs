/* Proves the purge statement is valid and only touches what it should —
   inside a transaction that is always rolled back. Nothing is deleted. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { Pool } = require("pg");

const TABLES = ["outbox_events","fulfillment_events","payment_attempts","refunds","exchange_payments","order_lines","orders","cart_lines","carts","checkout_sessions","stock_reservations","inventory_movements","inventory_adjustments","product_complements","product_images","product_variants","products","price_rules","coupons","customers"];

const url = process.env.DATABASE_URL || "postgres://kolbe:kolbe@127.0.0.1:55432/kolbevintage";
const pool = new Pool({ connectionString: url });
const client = await pool.connect();
try {
  const before = await client.query("select (select count(*) from products) p, (select count(*) from staff) s, (select count(*) from settings) t, (select count(*) from orders) o");
  await client.query("begin");
  await client.query(`truncate table ${TABLES.join(", ")} restart identity cascade`);
  const during = await client.query("select (select count(*) from products) p, (select count(*) from staff) s, (select count(*) from settings) t, (select count(*) from orders) o");
  await client.query("rollback");
  const after = await client.query("select (select count(*) from products) p, (select count(*) from staff) s, (select count(*) from settings) t, (select count(*) from orders) o");
  console.log("before ", before.rows[0], "\nin-tx  ", during.rows[0], "\nafter  ", after.rows[0]);
  const ok = during.rows[0].p === "0" && during.rows[0].o === "0" && during.rows[0].s === before.rows[0].s && during.rows[0].t === before.rows[0].t && after.rows[0].p === before.rows[0].p;
  console.log(ok ? "OK: purge empties catalogue/orders, keeps staff+settings, rollback restores everything" : "FAIL");
  process.exitCode = ok ? 0 : 1;
} finally {
  client.release();
  await pool.end();
}
