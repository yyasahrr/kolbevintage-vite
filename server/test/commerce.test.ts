process.env.PGDATABASE = process.env.PGDATABASE_TEST ?? "kolbevintage_test";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.SUPERADMIN_PASSCODE = "super-secret";

import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import type { FastifyInstance } from "fastify";

/* =====================================================================
   Commerce core integration tests (real PostgreSQL, real HTTP).

   They cover the scenarios the PRD asks for: oversell races, expiry,
   double callbacks, late payments, coupons vs campaigns, BNPL scope,
   refund permissions, the two-person stock rule, outbox failures and
   immutable invoices.
   ===================================================================== */

type Json = Record<string, any>;

interface Res {
  status: number;
  body: any;
}

interface Client {
  get: (path: string) => Promise<Res>;
  post: (path: string, body?: Json) => Promise<Res>;
  put: (path: string, body?: Json) => Promise<Res>;
  patch: (path: string, body?: Json) => Promise<Res>;
  cookie: () => string;
}

let app: FastifyInstance;
let base = "";
let query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

function makeClient(): Client {
  const jar = new Map<string, string>();
  const call = async (method: string, path: string, body?: Json): Promise<Res> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (jar.size) headers.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (!value || value === "") jar.delete(name);
      else jar.set(name, value);
    }
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed };
  };
  return {
    get: (path) => call("GET", path),
    post: (path, body) => call("POST", path, body),
    put: (path, body) => call("PUT", path, body),
    patch: (path, body) => call("PATCH", path, body),
    cookie: () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
  };
}

async function adminClient(): Promise<Client> {
  const client = makeClient();
  const res = await client.post("/api/admin/login", { passcode: "1234" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return client;
}

async function customerClient(): Promise<Client> {
  const client = makeClient();
  const res = await client.post("/api/auth/login", { email: "ava@example.com", password: "demo1234" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return client;
}

async function superAdminClient(): Promise<Client> {
  const client = await adminClient();
  const res = await client.post("/api/commerce/admin/elevate", { passcode: "super-secret" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return client;
}

async function stockOf(sku: string) {
  const res = await query(
    `select v.id, v.on_hand, v.quarantined,
            (v.on_hand - v.quarantined - coalesce((
              select sum(r.quantity) from stock_reservations r
              where r.variant_id = v.id and r.status = 'active' and r.expires_at > now()
            ), 0))::int as available
       from product_variants v where v.sku = $1`,
    [sku],
  );
  const row = res.rows[0];
  assert.ok(row, `variant ${sku} not found`);
  return { id: row.id as string, onHand: Number(row.on_hand), available: Number(row.available) };
}

async function setStock(sku: string, qty: number) {
  const variant = await stockOf(sku);
  await query("update product_variants set on_hand = $2, last_catalog_qty = $2, quarantined = 0 where id = $1", [
    variant.id,
    qty,
  ]);
  return variant.id;
}

async function startCheckout(client: Client, items: { variantId: string; quantity: number }[], extra: Json = {}) {
  return client.post("/api/commerce/checkout", {
    items,
    address: { receiver: "آوا رادمهر", city: "تهران", province: "تهران", street: "ولیعصر", postal: "1234567890" },
    shippingMethod: "standard",
    ...extra,
  });
}

async function payAndSettle(client: Client, items: { variantId: string; quantity: number }[], method: "online" | "bnpl4" = "online", extra: Json = {}) {
  const checkout = await startCheckout(client, items, extra);
  assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
  const pay = await client.post(`/api/commerce/checkout/${checkout.body.checkout.id}/pay`, { method });
  assert.equal(pay.status, 200, JSON.stringify(pay.body));
  const settled = await client.post(`/api/commerce/payments/${pay.body.attempt.id}/simulate`, { result: "success" });
  return { checkout: checkout.body.checkout, attempt: pay.body.attempt, settled: settled.body, payStatus: pay.status };
}

const SKU = "P-RIVE-COAT-NOIR-M";
const SKU2 = "P-RIVE-COAT-CAMEL-L";

before(async () => {
  const db = await import("../src/db");
  query = db.query as unknown as typeof query;
  await db.initDb();
  const seed = await import("../src/seed");
  await seed.seedDatabase();
  const settings = await import("../src/commerce/settings");
  await settings.ensureCommerceSettings();
  await settings.saveCommerceSettings({
    allowMockControls: true,
    bnpl4Enabled: false,
    liveRefundsEnabled: false,
    smsSimulateDown: false,
    reservationHoldMinutes: 10,
    paymentWindowMinutes: 15,
    shippingFlat: 12,
    shippingExpress: 25,
    freeShippingThreshold: 200,
    shippingThresholdBasis: "after_discount",
    discountStacking: "none",
    superadmins: ["superadmin"],
    cashbackEnabled: true,
    cashbackMode: "tier_rate",
    cashbackBase: "merchandise",
    cashbackTiers: [
      { min: 0, max: 1000, percent: 5 },
      { min: 1000, max: 3000, percent: 3 },
      { min: 3000, max: null, percent: 1 },
    ],
    cashbackMaxAmount: 500,
  });
  const index = await import("../src/index");
  app = await index.buildServer();
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

beforeEach(async () => {
  await query(
    `delete from refunds; delete from fulfillment_events; delete from order_lines; delete from orders;
     delete from payment_attempts; delete from checkout_sessions; delete from cart_lines; delete from carts;
     delete from stock_reservations; delete from inventory_movements; delete from inventory_adjustments;
     delete from outbox_events; delete from price_rules where id like 'test-%';
     update product_variants set on_hand = last_catalog_qty, quarantined = 0;
     update coupons set used_count = 0;`,
  );
  const settings = await import("../src/commerce/settings");
  await settings.saveCommerceSettings({
    allowMockControls: true,
    bnpl4Enabled: false,
    liveRefundsEnabled: false,
    smsSimulateDown: false,
    reservationHoldMinutes: 10,
    paymentWindowMinutes: 15,
    shippingFlat: 12,
    shippingExpress: 25,
    freeShippingThreshold: 200,
    shippingThresholdBasis: "after_discount",
    discountStacking: "none",
    superadmins: ["superadmin"],
    cashbackEnabled: true,
    cashbackMode: "tier_rate",
    cashbackBase: "merchandise",
    cashbackTiers: [
      { min: 0, max: 1000, percent: 5 },
      { min: 1000, max: 3000, percent: 3 },
      { min: 3000, max: null, percent: 1 },
    ],
    cashbackMaxAmount: 500,
  });
});

after(async () => {
  await app?.close().catch(() => undefined);
});

test("adding to the cart does not reserve stock", async () => {
  const variantId = await setStock(SKU, 3);
  const client = makeClient();
  const added = await client.post("/api/commerce/cart/lines", { variantId, quantity: 2 });
  assert.equal(added.status, 200, JSON.stringify(added.body));
  assert.equal(added.body.count, 2);
  const stock = await stockOf(SKU);
  assert.equal(stock.available, 3, "cart lines must never hold inventory");
  assert.equal((await client.get("/api/commerce/cart")).body.lines[0].variantId, variantId);
});

test("two simultaneous checkouts for the last unit: exactly one wins", async () => {
  const variantId = await setStock(SKU, 1);
  const a = makeClient();
  const b = makeClient();
  const [first, second] = await Promise.all([
    startCheckout(a, [{ variantId, quantity: 1 }]),
    startCheckout(b, [{ variantId, quantity: 1 }]),
  ]);
  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, [201, 409], `expected one success and one conflict, got ${statuses}`);
  const loser = first.status === 409 ? first : second;
  assert.equal(loser.body.code, "insufficient_stock");
  assert.equal((await stockOf(SKU)).available, 0);
});

test("expiring a hold releases it exactly once", async () => {
  const variantId = await setStock(SKU, 1);
  const client = makeClient();
  const checkout = await startCheckout(client, [{ variantId, quantity: 1 }]);
  assert.equal(checkout.status, 201);
  const id = checkout.body.checkout.id;

  await query("update stock_reservations set expires_at = now() - interval '1 minute' where checkout_id = $1", [id]);
  await query("update checkout_sessions set reservation_expires_at = now() - interval '1 minute' where id = $1", [id]);

  const { expireReservations } = await import("../src/commerce/inventory");
  const first = await expireReservations();
  assert.ok(first.expired >= 1);
  assert.equal((await stockOf(SKU)).available, 1);

  const second = await expireReservations();
  assert.equal(second.expired, 0, "a second worker tick must not release anything again");
  assert.equal((await stockOf(SKU)).available, 1);

  const rows = await query("select status from stock_reservations where checkout_id = $1", [id]);
  assert.deepEqual(rows.rows.map((r) => r.status), ["expired"]);
});

test("cancelling checkout twice is idempotent", async () => {
  const variantId = await setStock(SKU, 2);
  const client = makeClient();
  const checkout = await startCheckout(client, [{ variantId, quantity: 1 }]);
  const id = checkout.body.checkout.id;
  const first = await client.post(`/api/commerce/checkout/${id}/cancel`);
  const second = await client.post(`/api/commerce/checkout/${id}/cancel`);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.body.released, 0);
  assert.equal((await stockOf(SKU)).available, 2);
});

test("a price change between quote and payment forces a re-quote", async () => {
  const variantId = await setStock(SKU, 2);
  const client = makeClient();
  const checkout = await startCheckout(client, [{ variantId, quantity: 1 }]);
  const id = checkout.body.checkout.id;
  const originalTotal = checkout.body.checkout.quote.grandTotal;

  const { rows } = await query("select product_id, price from product_variants v join products p on p.id = v.product_id where v.id = $1", [variantId]);
  await query("update products set price = price + 100 where id = $1", [rows[0].product_id]);

  const pay = await client.post(`/api/commerce/checkout/${id}/pay`, { method: "online" });
  assert.equal(pay.status, 409);
  assert.equal(pay.body.code, "quote_stale");
  assert.ok(pay.body.details.quote.grandTotal > originalTotal);

  const refreshed = await client.get(`/api/commerce/checkout/${id}`);
  assert.equal(refreshed.body.quote.grandTotal, pay.body.details.quote.grandTotal);
  await query("update products set price = price - 100 where id = $1", [rows[0].product_id]);
});

test("a coupon is refused when an active campaign is already applied", async () => {
  const variantId = await setStock(SKU, 5);
  await query(
    `insert into price_rules (id, name, kind, value, scope, priority, starts_at, ends_at, active)
     values ('test-campaign', 'کمپین تست', 'percent', 10, 'all', 10, now() - interval '1 day', now() + interval '1 day', true)
     on conflict (id) do nothing`,
  );
  const client = makeClient();
  const checkout = await startCheckout(client, [{ variantId, quantity: 1 }]);
  const id = checkout.body.checkout.id;
  assert.ok(checkout.body.checkout.quote.campaignDiscount > 0);

  const quote = await client.post(`/api/commerce/checkout/${id}/quote`, { couponCode: "VELOURS10" });
  assert.equal(quote.status, 409);
  assert.equal(quote.body.code, "coupon_not_combinable");
});

/* ---------------------------------------------------------------------
   Coupon capacity, coupon ceiling, audit trail, legacy order write path.
   --------------------------------------------------------------------- */

test("coupon capacity is consumed once and the last unit cannot be sold twice", async () => {
  const variantId = await setStock(SKU, 5);
  await query(
    `insert into coupons (code, kind, value, min_subtotal, combinable, usage_limit, used_count, active)
     values ('ONEUSE', 'percent', 10, 0, false, 1, 0, true)
     on conflict (code) do update set kind = 'percent', value = 10, min_subtotal = 0,
       combinable = false, usage_limit = 1, used_count = 0, max_discount = null, active = true`,
  );

  const first = await startCheckout(makeClient(), [{ variantId, quantity: 1 }], { couponCode: "ONEUSE" });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.ok(first.body.checkout.quote.couponDiscount > 0);

  const pay = await first.body.checkout.id;
  const attempt = await makeClient().post(`/api/commerce/checkout/${pay}/pay`, { method: "online" });
  assert.equal(attempt.status, 200, JSON.stringify(attempt.body));
  const settled = await makeClient().post(`/api/commerce/payments/${attempt.body.attempt.id}/simulate`, {
    result: "success",
  });
  assert.equal(settled.body.status, "settled", JSON.stringify(settled.body));

  const after = await query("select used_count, usage_limit from coupons where code = 'ONEUSE'");
  assert.equal(Number(after.rows[0].used_count), 1, "a paid order must consume one unit of capacity");

  const second = await startCheckout(makeClient(), [{ variantId, quantity: 1 }], { couponCode: "ONEUSE" });
  assert.equal(second.status, 400, JSON.stringify(second.body));
  assert.equal(second.body.code, "coupon_exhausted");
});

test("a percent coupon never exceeds its max_discount or the payable subtotal", async () => {
  const variantId = await setStock(SKU, 3);
  await query(
    `insert into coupons (code, kind, value, min_subtotal, combinable, usage_limit, used_count, max_discount, active)
     values ('CAP5', 'percent', 80, 0, false, null, 0, 5, true)
     on conflict (code) do update set kind = 'percent', value = 80, max_discount = 5, active = true, used_count = 0`,
  );
  const checkout = await startCheckout(makeClient(), [{ variantId, quantity: 1 }], { couponCode: "CAP5" });
  assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
  const quote = checkout.body.checkout.quote;
  assert.equal(quote.couponDiscount, 5, "a 80% coupon must be capped at its configured ceiling");
  assert.ok(quote.grandTotal >= quote.shippingTotal, "the basket can never go negative");
  await query("delete from coupons where code = 'CAP5'");
});

test("the minimum-spend rule uses the same base as the discount", async () => {
  const variantId = await setStock(SKU, 3);
  const price = await query("select p.price from product_variants v join products p on p.id = v.product_id where v.id = $1", [variantId]);
  const unit = Number(price.rows[0].price);
  await query(
    `insert into coupons (code, kind, value, min_subtotal, combinable, usage_limit, used_count, active)
     values ('MINX', 'amount', 1, $1, false, null, 0, true)
     on conflict (code) do update set kind = 'amount', value = 1, min_subtotal = $1, used_count = 0, active = true`,
    [unit + 1],
  );
  const checkout = await startCheckout(makeClient(), [{ variantId, quantity: 1 }], { couponCode: "MINX" });
  assert.equal(checkout.status, 400, JSON.stringify(checkout.body));
  assert.equal(checkout.body.code, "coupon_min_subtotal");
  await query("delete from coupons where code = 'MINX'");
});

test("the legacy order endpoint is not writable from the storefront", async () => {
  const anonymous = await makeClient().post("/api/orders", {
    lines: [{ name: "جعل", price: 1 }],
    total: 1,
    status: "paid",
  });
  assert.equal(anonymous.status, 401, JSON.stringify(anonymous.body));

  const admin = await adminClient();
  const manual = await admin.post("/api/orders", { lines: [{ name: "سفارش تلفنی", price: 10 }], total: 10 });
  assert.equal(manual.status, 200, JSON.stringify(manual.body));
  const audit = await admin.get("/api/commerce/admin/audit?targetType=order&limit=10");
  assert.ok(audit.body.some((row: any) => row.action === "order.legacy_create"), "manual entry must be audited");

  // a commerce order can no longer be moved by a free-text status write
  const variantId = await setStock(SKU, 2);
  const { settled } = await payAndSettle(makeClient(), [{ variantId, quantity: 1 }]);
  const blocked = await admin.patch(`/api/orders/${settled.orderId}`, { status: "done" });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(blocked.body.code, "commerce_order_status_locked");
});

test("settings changes are audited with before and after, and the trail is append-only", async () => {
  const admin = await adminClient();
  const saved = await admin.put("/api/commerce/admin/settings", { reservationHoldMinutes: 11 });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));

  const audit = await admin.get("/api/commerce/admin/audit?targetType=commerce_settings&limit=20");
  const entry = audit.body.find((row: any) => row.after?.reservationHoldMinutes === 11);
  assert.ok(entry, "the settings change must appear in the audit trail");
  assert.equal(entry.before.reservationHoldMinutes, 10);
  assert.equal(entry.action, "settings.update");

  const toggle = await admin.put("/api/commerce/admin/settings", { bnpl4Enabled: true });
  assert.equal(toggle.status, 200, JSON.stringify(toggle.body));
  const afterToggle = await admin.get("/api/commerce/admin/audit?targetType=commerce_settings&limit=20");
  const bnpl = afterToggle.body.find((row: any) => row.action === "settings.bnpl_toggle");
  assert.ok(bnpl, "the BNPL master switch gets its own audit action");
  assert.equal(bnpl.before.bnpl4Enabled, false);
  assert.equal(bnpl.after.bnpl4Enabled, true);

  await assert.rejects(
    () => query("update audit_events set actor = 'rewritten' where id = $1", [entry.id]),
    /append-only/,
  );

  await admin.put("/api/commerce/admin/settings", { reservationHoldMinutes: 10, bnpl4Enabled: false });
});

test("an exception order is stored with its own status instead of looking pending", async () => {
  const variantId = await setStock(SKU, 1);
  const client = makeClient();
  const checkout = await startCheckout(client, [{ variantId, quantity: 1 }]);
  assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
  const checkoutId = checkout.body.checkout.id;
  const pay = await client.post(`/api/commerce/checkout/${checkoutId}/pay`, { method: "online" });
  assert.equal(pay.status, 200, JSON.stringify(pay.body));

  // the hold dies before the gateway confirms: money captured, stock gone
  await query("update stock_reservations set status = 'expired' where checkout_id = $1", [checkoutId]);
  const settled = await client.post(`/api/commerce/payments/${pay.body.attempt.id}/simulate`, { result: "success" });
  assert.equal(settled.body.status, "settled", JSON.stringify(settled.body));

  const row = await query("select status, data->>'status' as admin_status from orders where id = $1", [
    settled.body.orderId,
  ]);
  assert.equal(row.rows[0].status, "exception");
  assert.equal(row.rows[0].admin_status, "exception", "the admin document must keep the exception bucket");
});

test("a duplicated payment callback settles once and creates one order", async () => {
  const variantId = await setStock(SKU, 2);
  const client = makeClient();
  const { settled, attempt } = await payAndSettle(client, [{ variantId, quantity: 1 }]);
  assert.equal(settled.status, "settled");
  assert.equal(settled.orderStatus, "paid");

  const replay = await client.post(`/api/commerce/payments/${attempt.id}/callback`, { result: "success" });
  assert.equal(replay.status, 200);
  assert.equal(replay.body.duplicate ?? replay.body.replayed, true);
  assert.equal(replay.body.orderId, settled.orderId);

  const orders = await query("select id from orders where checkout_id = (select checkout_id from payment_attempts where id = $1)", [attempt.id]);
  assert.equal(orders.rows.length, 1);
  const events = await query("select id from outbox_events where dedupe_key = $1", [`order.paid:${settled.orderId}`]);
  assert.equal(events.rows.length, 1);
  const stock = await stockOf(SKU);
  assert.equal(stock.onHand, 1, "the sold unit is claimed exactly once");
});

test("a verify timeout never marks the order as paid", async () => {
  const variantId = await setStock(SKU, 2);
  const client = makeClient();
  const checkout = await startCheckout(client, [{ variantId, quantity: 1 }]);
  const pay = await client.post(`/api/commerce/checkout/${checkout.body.checkout.id}/pay`, { method: "online" });
  const timeout = await client.post(`/api/commerce/payments/${pay.body.attempt.id}/simulate`, { result: "timeout" });
  assert.equal(timeout.body.status, "pending_verification");
  const orders = await query("select count(*)::int as n from orders where checkout_id = $1", [checkout.body.checkout.id]);
  assert.equal(orders.rows[0].n, 0);
  assert.equal((await stockOf(SKU)).available, 1, "the hold is still valid");

  const admin = await adminClient();
  const reconciled = await admin.post(`/api/commerce/payments/${pay.body.attempt.id}/reconcile`, { result: "success" });
  assert.equal(reconciled.body.status, "settled");
  const after = await query("select count(*)::int as n from orders where checkout_id = $1", [checkout.body.checkout.id]);
  assert.equal(after.rows[0].n, 1);
});

test("a payment confirmed after the hold expired becomes an EXCEPTION order", async () => {
  const variantId = await setStock(SKU, 1);
  const client = makeClient();
  const checkout = await startCheckout(client, [{ variantId, quantity: 1 }]);
  const id = checkout.body.checkout.id;
  const pay = await client.post(`/api/commerce/checkout/${id}/pay`, { method: "online" });
  assert.equal(pay.status, 200);

  await query("update stock_reservations set expires_at = now() - interval '1 minute' where checkout_id = $1", [id]);
  await query("update checkout_sessions set reservation_expires_at = now() - interval '1 minute' where id = $1", [id]);
  const { expireReservations } = await import("../src/commerce/inventory");
  await expireReservations();
  assert.equal((await stockOf(SKU)).available, 1, "the unit went back to stock");

  const late = await client.post(`/api/commerce/payments/${pay.body.attempt.id}/simulate`, { result: "success" });
  assert.equal(late.body.status, "settled");
  assert.equal(late.body.orderStatus, "exception");
  assert.equal(late.body.late, true);

  const admin = await adminClient();
  const order = await admin.get(`/api/commerce/orders/${late.body.orderId}`);
  assert.equal(order.body.status, "exception");
  assert.equal(order.body.paymentStatus, "settled");
  assert.match(order.body.exceptionReason, /رزرو/);
  assert.equal((await stockOf(SKU)).available, 1, "a late payment must not re-reserve stock");
  const events = await query("select type from outbox_events where dedupe_key = $1", [`order.exception:${late.body.orderId}`]);
  assert.equal(events.rows.length, 1);
});

test("the installment gateway is store-wide, not per product", async () => {
  const variantA = await setStock(SKU, 3);
  const variantB = await setStock(SKU2, 3);
  const client = makeClient();

  const blocked = await startCheckout(client, [{ variantId: variantA, quantity: 1 }]);
  const denied = await client.post(`/api/commerce/checkout/${blocked.body.checkout.id}/pay`, { method: "bnpl4" });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, "bnpl_disabled");

  const admin = await adminClient();
  const enabled = await admin.put("/api/commerce/admin/settings", { bnpl4Enabled: true });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.body.bnpl4Enabled, true);

  // a mixed bag (two different products) still gets one installment plan for the whole order
  const { checkout, settled } = await payAndSettle(
    client,
    [
      { variantId: variantA, quantity: 1 },
      { variantId: variantB, quantity: 1 },
    ],
    "bnpl4",
  );
  const plan = checkout.quote.installments.find((i: Json) => i.method === "bnpl4");
  assert.ok(plan, "installments are offered for the whole cart");
  assert.equal(plan.perInstallment, Math.round((checkout.quote.grandTotal / 4) * 100) / 100);
  assert.equal(settled.orderStatus, "paid");

  const config = await client.get("/api/commerce/config");
  assert.equal(config.body.bnpl4.scope, "store");
  assert.equal(config.body.bnpl4.enabled, true);
});

test("only a superadmin can approve a refund, and live refunds stay fail-closed", async () => {
  const variantId = await setStock(SKU, 3);
  const client = await customerClient();
  const { settled } = await payAndSettle(client, [{ variantId, quantity: 2 }]);
  const admin = await adminClient();
  const order = await admin.get(`/api/commerce/orders/${settled.orderId}`);
  const line = order.body.lines[0];

  const requested = await client.post(`/api/commerce/orders/${settled.orderId}/returns`, {
    lineId: line.id,
    quantity: 1,
    reason: "سایز بزرگ بود",
  });
  assert.equal(requested.status, 201, JSON.stringify(requested.body));
  const refundId = requested.body.refund.id;

  const notSuper = await admin.post(`/api/commerce/admin/refunds/${refundId}`, { decision: "approve" });
  assert.equal(notSuper.status, 403);

  const superAdmin = await superAdminClient();
  const blocked = await superAdmin.post(`/api/commerce/admin/refunds/${refundId}`, { decision: "approve" });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, "live_refunds_blocked");

  const adminCannotEnable = await admin.put("/api/commerce/admin/settings", { liveRefundsEnabled: true });
  assert.equal(adminCannotEnable.status, 403);

  const on = await superAdmin.put("/api/commerce/admin/settings", { liveRefundsEnabled: true });
  assert.equal(on.status, 200);
  const approved = await superAdmin.post(`/api/commerce/admin/refunds/${refundId}`, { decision: "approve" });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.refund.status, "settled");
  assert.equal((await stockOf(SKU)).onHand, 2, "the returned unit is back in stock");

  const invoice = await admin.get(`/api/commerce/orders/${settled.orderId}/invoice`);
  assert.equal(invoice.body.order.total, Number(settled.total), "the original invoice is not rewritten");
  assert.equal(invoice.body.adjustments.length, 1);

  const replay = await superAdmin.post(`/api/commerce/admin/refunds/${refundId}`, { decision: "approve" });
  assert.equal(replay.body.unchanged, true);
});

test("a partial return cannot exceed the remaining quantity", async () => {
  const variantId = await setStock(SKU, 3);
  const client = await customerClient();
  const { settled } = await payAndSettle(client, [{ variantId, quantity: 2 }]);
  const admin = await adminClient();
  const order = await admin.get(`/api/commerce/orders/${settled.orderId}`);
  const line = order.body.lines[0];

  const tooMany = await client.post(`/api/commerce/orders/${settled.orderId}/returns`, { lineId: line.id, quantity: 3 });
  assert.equal(tooMany.status, 409);
  assert.equal(tooMany.body.code, "refund_quantity_exceeded");

  const first = await client.post(`/api/commerce/orders/${settled.orderId}/returns`, { lineId: line.id, quantity: 1 });
  assert.equal(first.status, 201);
  const second = await client.post(`/api/commerce/orders/${settled.orderId}/returns`, { lineId: line.id, quantity: 1 });
  assert.equal(second.status, 201);
  const third = await client.post(`/api/commerce/orders/${settled.orderId}/returns`, { lineId: line.id, quantity: 1 });
  assert.equal(third.status, 409);
});

test("manual stock corrections need two different people", async () => {
  const variantId = await setStock(SKU, 1);
  const admin = await adminClient();
  const created = await admin.post("/api/commerce/admin/inventory/adjustments", {
    variantId,
    delta: 4,
    reason: "شمارش انبار",
  });
  assert.equal(created.status, 201);
  const id = created.body.adjustment.id;

  const selfApprove = await admin.post(`/api/commerce/admin/inventory/adjustments/${id}`, { decision: "approve" });
  assert.equal(selfApprove.status, 403);
  assert.equal(selfApprove.body.code, "two_person_rule");

  const superAdmin = await superAdminClient();
  const approved = await superAdmin.post(`/api/commerce/admin/inventory/adjustments/${id}`, { decision: "approve" });
  assert.equal(approved.status, 200);
  assert.equal((await stockOf(SKU)).onHand, 5);
});

test("a broken SMS provider never invalidates a paid order", async () => {
  const variantId = await setStock(SKU, 2);
  const client = makeClient();
  const { settled } = await payAndSettle(client, [{ variantId, quantity: 1 }]);

  const settings = await import("../src/commerce/settings");
  await settings.saveCommerceSettings({ smsSimulateDown: true });
  const outbox = await import("../src/commerce/outbox");
  const tick = await outbox.processOutbox();
  assert.ok(tick.failed >= 1);

  const admin = await adminClient();
  const order = await admin.get(`/api/commerce/orders/${settled.orderId}`);
  assert.equal(order.status, 200);
  assert.equal(order.body.status, "paid");

  await settings.saveCommerceSettings({ smsSimulateDown: false });
  await query("update outbox_events set available_at = now()");
  const retry = await outbox.processOutbox();
  assert.ok(retry.done >= 1);
  const pending = await query("select count(*)::int as n from outbox_events where status = 'pending'");
  assert.equal(pending.rows[0].n, 0);
});

test("warehouse flow blocks a wrong SKU scan and moves the order forward", async () => {
  const variantId = await setStock(SKU, 2);
  const client = makeClient();
  const { settled } = await payAndSettle(client, [{ variantId, quantity: 1 }]);

  const admin = await adminClient();
  const wrong = await admin.post(`/api/commerce/orders/${settled.orderId}/picking`, { sku: "NOT-THIS-SKU" });
  assert.equal(wrong.status, 409);
  assert.equal(wrong.body.code, "sku_mismatch");

  const order = await admin.get(`/api/commerce/orders/${settled.orderId}`);
  const picking = await admin.post(`/api/commerce/orders/${settled.orderId}/picking`, { sku: order.body.lines[0].sku });
  assert.equal(picking.status, 200);
  assert.equal(picking.body.order.status, "preparing");

  const packing = await admin.post(`/api/commerce/orders/${settled.orderId}/packing`, { confirm: true });
  assert.equal(packing.status, 200);
  const shipped = await admin.post(`/api/commerce/orders/${settled.orderId}/ship`);
  assert.equal(shipped.body.order.status, "shipped");
  const delivered = await admin.post(`/api/commerce/orders/${settled.orderId}/deliver`);
  assert.equal(delivered.body.order.status, "delivered");

  const replay = await admin.post(`/api/commerce/orders/${settled.orderId}/deliver`);
  assert.equal(replay.body.unchanged, true);
});

test("order placement is idempotent per idempotency key", async () => {
  const variantId = await setStock(SKU, 2);
  const client = makeClient();
  const checkout = await startCheckout(client, [{ variantId, quantity: 1 }]);
  const id = checkout.body.checkout.id;
  const key = `key-${Date.now()}`;

  const first = await client.post(`/api/commerce/checkout/${id}/pay`, { method: "online", idempotencyKey: key });
  const second = await client.post(`/api/commerce/checkout/${id}/pay`, { method: "online", idempotencyKey: key });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(second.body.attempt.id, first.body.attempt.id);
  assert.equal(second.body.reused, true);

  await client.post(`/api/commerce/payments/${first.body.attempt.id}/simulate`, { result: "success" });
  const orders = await query("select count(*)::int as n from orders where checkout_id = $1", [id]);
  assert.equal(orders.rows[0].n, 1);
});

test("the invoice keeps its snapshot after the product price changes", async () => {
  const variantId = await setStock(SKU, 2);
  const client = makeClient();
  const { settled } = await payAndSettle(client, [{ variantId, quantity: 1 }]);
  const admin = await adminClient();
  const before = await admin.get(`/api/commerce/orders/${settled.orderId}/invoice`);

  const { rows } = await query(
    "select p.id, p.price from product_variants v join products p on p.id = v.product_id where v.id = $1",
    [variantId],
  );
  await query("update products set price = price * 2 where id = $1", [rows[0].id]);
  const after = await admin.get(`/api/commerce/orders/${settled.orderId}/invoice`);
  assert.equal(after.body.order.total, before.body.order.total);
  assert.equal(after.body.order.lines[0].unitPrice, before.body.order.lines[0].unitPrice);
  await query("update products set price = $2 where id = $1", [rows[0].id, rows[0].price]);
});

test("guest cart merges into the account cart on sign-in", async () => {
  const variantId = await setStock(SKU, 3);
  const guest = makeClient();
  await guest.post("/api/commerce/cart/lines", { variantId, quantity: 1 });

  const merged = await guest.post("/api/auth/login", { email: "ava@example.com", password: "demo1234" });
  assert.equal(merged.status, 200, JSON.stringify(merged.body));
  const merge = await guest.post("/api/commerce/cart/merge");
  assert.equal(merge.status, 200);
  const cart = await guest.get("/api/commerce/cart");
  assert.equal(cart.body.customerEmail, "ava@example.com");
  assert.equal(cart.body.lines.length, 1);
  assert.equal(cart.body.lines[0].quantity, 1);
});

test("the cashback rate comes from the bracket that contains the basket", async () => {
  const { computeCashback } = await import("../src/commerce/cashback");
  const settings = {
    ...(await import("../src/commerce/settings")).DEFAULT_COMMERCE_SETTINGS,
    cashbackEnabled: true,
    cashbackMode: "tier_rate" as const,
    cashbackTiers: [
      { min: 0, max: 1000, percent: 5 },
      { min: 1000, max: 3000, percent: 3 },
      { min: 3000, max: null, percent: 1 },
    ],
    cashbackMaxAmount: 10_000,
  };

  assert.equal(computeCashback(500, settings).percent, 5);
  assert.equal(computeCashback(500, settings).amount, 25);
  assert.equal(computeCashback(1000, settings).percent, 3, "the lower bracket is [min, max)");
  assert.equal(computeCashback(2999, settings).percent, 3);
  assert.equal(computeCashback(3000, settings).percent, 1);
  assert.equal(computeCashback(10_000, settings).amount, 100);

  // the owner can switch to marginal brackets: each rate only on its own slice
  const marginal = { ...settings, cashbackMode: "marginal" as const };
  assert.equal(computeCashback(2500, marginal).amount, 95); // 1000×5% + 1500×3%
  assert.equal(computeCashback(0, settings).amount, 0);
  assert.equal(computeCashback(500, { ...settings, cashbackEnabled: false }).amount, 0);
});

test("a paid order credits exactly one cashback entry and a refund claws back its share", async () => {
  const variantId = await setStock(SKU, 3);
  const client = await customerClient();
  // neutralise campaigns so the basket value is predictable
  await query("delete from price_rules");
  const { checkout, settled } = await payAndSettle(client, [{ variantId, quantity: 2 }]);

  const base = checkout.quote.cashback.base;
  assert.ok(base > 0);
  assert.equal(settled.cashback.percent, checkout.quote.cashback.percent);
  assert.equal(settled.cashback.amount, checkout.quote.cashback.amount);

  const wallet = await client.get("/api/commerce/cashback");
  assert.equal(wallet.body.balance, settled.cashback.amount);
  assert.equal(wallet.body.transactions.length, 1);
  assert.equal(wallet.body.transactions[0].kind, "earn");

  // a duplicated callback must not credit again
  const attempts = await query("select id from payment_attempts where checkout_id = $1", [checkout.id]);
  await client.post(`/api/commerce/payments/${attempts.rows[0].id}/callback`, { result: "success" });
  const again = await query("select count(*)::int as n from cashback_ledger where kind = 'earn'");
  assert.equal(again.rows[0].n, 1);

  // returning part of the order reverses the matching share of the cashback
  const admin = await adminClient();
  const order = await admin.get(`/api/commerce/orders/${settled.orderId}`);
  const requested = await client.post(`/api/commerce/orders/${settled.orderId}/returns`, {
    lineId: order.body.lines[0].id,
    quantity: 1,
    reason: "تعویض سایز",
  });
  assert.equal(requested.status, 201);

  const superAdmin = await superAdminClient();
  await superAdmin.put("/api/commerce/admin/settings", { liveRefundsEnabled: true });
  const approved = await superAdmin.post(`/api/commerce/admin/refunds/${requested.body.refund.id}`, { decision: "approve" });
  assert.equal(approved.status, 200);

  const afterRefund = await client.get("/api/commerce/cashback");
  assert.ok(afterRefund.body.balance < wallet.body.balance, "half of the cashback is clawed back");
  assert.equal(afterRefund.body.reversed, -settled.cashback.amount / 2);
});

test("guest orders never earn cashback", async () => {
  const variantId = await setStock(SKU, 2);
  const guest = makeClient();
  const { checkout, settled } = await payAndSettle(guest, [{ variantId, quantity: 1 }]);
  assert.equal(settled.orderStatus, "paid");
  assert.ok(checkout.quote.cashback.amount > 0, "the quote still advertises the earn rate");
  const rows = await query("select count(*)::int as n from cashback_ledger where order_id = $1", [settled.orderId]);
  assert.equal(rows.rows[0].n, 0);
});
