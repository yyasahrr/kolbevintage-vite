process.env.PGDATABASE = process.env.PGDATABASE_TEST ?? "kolbevintage_test";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.SUPERADMIN_PASSCODE = "super-secret";

import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
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

  /** the API sets a readable kv_csrf cookie; every write must echo it */
  const ensureCsrf = async () => {
    if (jar.has("kv_csrf")) return;
    const res = await fetch(base + "/api/health", {
      headers: jar.size ? { cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ") } : {},
    });
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const index = pair.indexOf("=");
      jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    await res.text();
  };

  const call = async (
    method: string,
    path: string,
    body?: Json,
    extraHeaders: Record<string, string> = {},
  ): Promise<Res> => {
    if (method !== "GET") await ensureCsrf();
    const headers: Record<string, string> = { ...extraHeaders };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (jar.has("kv_csrf") && method !== "GET") headers["x-csrf-token"] = jar.get("kv_csrf") as string;
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
  return {
    id: row.id as string,
    onHand: Number(row.on_hand),
    quarantined: Number(row.quarantined),
    available: Number(row.available),
  };
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
  // Checkout fixtures now use an actual authenticated account, never a test-only bypass.
  const me = await client.get("/api/auth/me");
  if (!me.body.customer) {
    const login = await client.post("/api/auth/login", {email:"ava@example.com",password:"demo1234"});
    assert.equal(login.status, 200, JSON.stringify(login.body));
  }
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


/** provider callbacks must carry a valid HMAC signature (see payments.ts) */
async function signedCallback(client: Client, attemptId: string, body: Json) {
  const { signCallbackPayload } = await import("../src/commerce/payments");
  const settings = await import("../src/commerce/settings");
  const current = await settings.loadCommerceSettings(true);
  const headers = {
    "x-provider-signature": signCallbackPayload(current.providerWebhookSecret, attemptId, body),
  };
  const res = await fetch(`${base}/api/commerce/payments/${attemptId}/callback`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
      cookie: client.cookie(),
      "x-csrf-token": "",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
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
    bnpl4ProviderReady: false,
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
  const security = await import("../src/http/security");
  security.resetRateLimits();
  await query(
    `delete from refunds; delete from fulfillment_events; delete from order_lines; delete from orders;
     delete from payment_attempts; delete from checkout_sessions; delete from cart_lines; delete from carts;
     delete from stock_reservations; delete from inventory_movements; delete from inventory_adjustments;
     delete from outbox_events; delete from gallery_items;
     -- every test starts from a known shelf: seeded campaigns must not leak into
     -- coupon tests (on a fresh CI database they do, on a long-lived one they don't)
     delete from price_rules;
     update product_variants set on_hand = last_catalog_qty, quarantined = 0;
     update coupons set used_count = 0;`,
  );
  const settings = await import("../src/commerce/settings");
  await settings.saveCommerceSettings({
    allowMockControls: true,
    bnpl4Enabled: false,
    bnpl4ProviderReady: false,
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

test("public catalogue reports sellable stock, including quarantine and reservations", async () => {
  const variantId=await setStock(SKU,5);
  const variant=(await query("select product_id,color_id,size_id,active from product_variants where id=$1",[variantId])).rows[0];
  await query("update product_variants set quarantined=1,active=true where id=$1",[variantId]);
  const productId=variant.product_id as string; const key=`${variant.color_id}:${variant.size_id}`;
  const guest=makeClient(); const buyer=await customerClient();
  try {
    const before=await guest.get(`/api/products/${encodeURIComponent(productId)}`); assert.equal(before.status,200);assert.equal(before.body.stock[key],4);
    const checkout=await startCheckout(buyer,[{variantId,quantity:2}]);assert.equal(checkout.status,201,JSON.stringify(checkout.body));
    const during=await guest.get(`/api/products/${encodeURIComponent(productId)}`);assert.equal(during.body.stock[key],2);
    const list=await guest.get("/api/products");assert.equal(list.body.find((p:any)=>p.id===productId).stock[key],2);
    await query("update stock_reservations set expires_at=now()-interval '1 minute' where variant_id=$1 and status='active'",[variantId]);
    assert.equal((await guest.get(`/api/products/${encodeURIComponent(productId)}`)).body.stock[key],4);
    await query("update stock_reservations set expires_at=now()+interval '10 minutes' where variant_id=$1 and status='active'",[variantId]);
    assert.equal((await buyer.post(`/api/commerce/checkout/${checkout.body.checkout.id}/cancel`,{})).status,200);
    assert.equal((await guest.get(`/api/products/${encodeURIComponent(productId)}`)).body.stock[key],4);
    await query("update product_variants set active=false where id=$1",[variantId]);
    assert.equal((await guest.get(`/api/products/${encodeURIComponent(productId)}`)).body.stock[key],0);
  } finally {await query("update product_variants set quarantined=0,active=$2 where id=$1",[variantId,variant.active]);}
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

test("equal coupon and campaign never stack and the campaign wins the tie", async () => {
  const variantId = await setStock(SKU, 5);
  // the campaign is refreshed rather than skipped: a stale row from an earlier
  // run would silently disarm this test
  await query(
    `insert into price_rules (id, name, kind, value, scope, priority, starts_at, ends_at, active)
     values ('test-campaign', 'کمپین تست', 'percent', 10, 'all', 10, now() - interval '1 day', now() + interval '1 day', true)
     on conflict (id) do update set value = 10, priority = 10, active = true,
       starts_at = now() - interval '1 day', ends_at = now() + interval '1 day'`,
  );
  // and the test brings its own coupon; it must not depend on what a seed
  // happened to leave in a long-lived database
  await query(
    `insert into coupons (code, kind, value, min_subtotal, combinable, active)
     values ('TEST-NOSTACK', 'percent', 10, 0, false, true)
     on conflict (code) do update set active = true, used_count = 0, min_subtotal = 0`,
  );
  const client = makeClient();
  const checkout = await startCheckout(client, [{ variantId, quantity: 1 }]);
  const id = checkout.body.checkout.id;
  assert.ok(checkout.body.checkout.quote.campaignDiscount > 0);

  const quote = await client.post(`/api/commerce/checkout/${id}/quote`, { couponCode: "TEST-NOSTACK" });
  assert.equal(quote.status, 200);
  assert.equal(quote.body.quote.couponDiscount, 0);
  assert.ok(quote.body.quote.campaignDiscount > 0);
  assert.equal(quote.body.quote.discounts.length,1);
});

test("a campaign ceiling caps the percent it advertises", async () => {
  const variantId = await setStock(SKU, 3);
  await query(
    `insert into price_rules (id, name, kind, value, scope, max_discount, priority, starts_at, ends_at, active)
     values ('capped', 'کمپین سقف‌دار', 'percent', 50, 'all', 30, 20, now() - interval '1 day', now() + interval '1 day', true)
     on conflict (id) do update set value = 50, max_discount = 30, priority = 20, active = true`,
  );
  const client = makeClient();
  const checkout = await startCheckout(client, [{ variantId, quantity: 1 }]);
  assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
  const quote = checkout.body.checkout.quote;
  // 50% of one unit is far more than 30, so the ceiling is what the customer gets
  assert.equal(quote.campaignDiscount, 30);
  assert.equal(quote.lines[0].discountAmount, 30);
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

  const buyer = makeClient();
  const first = await startCheckout(buyer, [{ variantId, quantity: 1 }], { couponCode: "ONEUSE" });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.ok(first.body.checkout.quote.couponDiscount > 0);

  const pay = await first.body.checkout.id;
  const attempt = await buyer.post(`/api/commerce/checkout/${pay}/pay`, { method: "online" });
  assert.equal(attempt.status, 200, JSON.stringify(attempt.body));
  // the sandbox control is bound to the browser that opened this checkout
  const settled = await buyer.post(`/api/commerce/payments/${attempt.body.attempt.id}/simulate`, {
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

  const notReady = await admin.put("/api/commerce/admin/settings", { bnpl4Enabled: true });
  assert.equal(notReady.status, 409, "a master switch without a confirmed provider must be refused");
  assert.equal(notReady.body.code, "bnpl_provider_not_ready");
  await admin.put("/api/commerce/admin/settings", { bnpl4ProviderReady: true });
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

  await admin.put("/api/commerce/admin/settings", { reservationHoldMinutes: 10, bnpl4Enabled: false, bnpl4ProviderReady: false });
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

  const replay = await signedCallback(client, attempt.id, { result: "success" });
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
  await admin.put("/api/commerce/admin/settings", { bnpl4ProviderReady: true });
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
  const approved = await superAdmin.post(`/api/commerce/admin/refunds/${refundId}`, { decision: "approve" });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(approved.body.refund.status, "approved", "approval is a decision, not money");

  // fail-closed: the money step is refused while live refunds are off
  const blocked = await superAdmin.post(`/api/commerce/admin/refunds/${refundId}/settle`, {});
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, "live_refunds_blocked");

  const adminCannotEnable = await admin.put("/api/commerce/admin/settings", { liveRefundsEnabled: true });
  assert.equal(adminCannotEnable.status, 403);

  const on = await superAdmin.put("/api/commerce/admin/settings", { liveRefundsEnabled: true });
  assert.equal(on.status, 200);
  const settledRefund = await superAdmin.post(`/api/commerce/admin/refunds/${refundId}/settle`, {});
  assert.equal(settledRefund.status, 200, JSON.stringify(settledRefund.body));
  assert.equal(settledRefund.body.refund.status, "settled");
  assert.equal((await stockOf(SKU)).onHand, 1, "a money-only refund never puts stock back");

  const invoice = await admin.get(`/api/commerce/orders/${settled.orderId}/invoice`);
  assert.equal(invoice.body.order.total, Number(settled.total), "the original invoice is not rewritten");
  assert.equal(invoice.body.adjustments.length, 1);

  const replay = await superAdmin.post(`/api/commerce/admin/refunds/${refundId}/settle`, {});
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

test("concurrent return requests reserve each unit exactly once, including approved requests", async () => {
  const variantId = await setStock(SKU, 2);
  const client = await customerClient();
  const { settled } = await payAndSettle(client, [{ variantId, quantity: 1 }]);
  const order = await client.get(`/api/commerce/orders/${settled.orderId}`);
  const lineId = order.body.lines[0].id;
  const requests = await Promise.all([
    client.post(`/api/commerce/orders/${settled.orderId}/returns`, { lineId, quantity: 1, kind: "return" }),
    client.post(`/api/commerce/orders/${settled.orderId}/returns`, { lineId, quantity: 1, kind: "return" }),
  ]);
  assert.deepEqual(requests.map(r => r.status).sort(), [201, 409]);
  const refundId = requests.find(r => r.status === 201)!.body.refund.id;
  const superAdmin = await superAdminClient();
  const me = await superAdmin.get("/api/admin/me");
  assert.equal(me.body.role, "superadmin");
  assert.ok(me.body.permissions.includes("orders:view"));
  assert.equal((await superAdmin.post(`/api/commerce/admin/refunds/${refundId}`, { decision: "approve" })).status, 200);
  const repeated = await client.post(`/api/commerce/orders/${settled.orderId}/returns`, { lineId, quantity: 1, kind: "return" });
  assert.equal(repeated.status, 409, "an approved request still reserves the unit");
});

test("the owner can approve their own stock correction", async () => {
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
  assert.equal(selfApprove.status, 200, JSON.stringify(selfApprove.body));

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
  assert.equal(retry.done, 0);
  assert.ok(retry.failed >= 1);
  const events = await query("select result,last_error from outbox_events");
  assert.ok(events.rows.every((row:any) => !row.result && /not configured/.test(row.last_error)));
});

test("warehouse flow blocks a wrong SKU scan and moves the order forward", async () => {
  const variantId = await setStock(SKU, 2);
  const client = makeClient();
  const { settled } = await payAndSettle(client, [{ variantId, quantity: 1 }]);

  const admin = await adminClient();
  const earlyShip = await admin.post(`/api/commerce/orders/${settled.orderId}/ship`);
  assert.equal(earlyShip.status, 409);
  assert.equal(earlyShip.body.code, "packing_required");
  const earlyPack = await admin.post(`/api/commerce/orders/${settled.orderId}/packing`, { confirm: true });
  assert.equal(earlyPack.status, 409);
  assert.equal(earlyPack.body.code, "picking_required");
  const wrong = await admin.post(`/api/commerce/orders/${settled.orderId}/picking`, { sku: "NOT-THIS-SKU", scanKey: randomUUID() });
  assert.equal(wrong.status, 409);
  assert.equal(wrong.body.code, "sku_mismatch");

  const order = await admin.get(`/api/commerce/orders/${settled.orderId}`);
  const picking = await admin.post(`/api/commerce/orders/${settled.orderId}/picking`, { sku: order.body.lines[0].sku, scanKey: randomUUID() });
  assert.equal(picking.status, 200);
  assert.equal(picking.body.order.status, "preparing");

  const noConfirmation = await admin.post(`/api/commerce/orders/${settled.orderId}/packing`, {});
  assert.equal(noConfirmation.status, 400);
  assert.equal(noConfirmation.body.code, "packing_confirmation_required");
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
  assert.equal(before.body.order.paymentKind, "simulated", "a sandbox order must not look like a bank payment");
  const listing = await admin.get("/api/commerce/orders?all=1&limit=200");
  assert.equal(listing.body.find((o:any)=>o.id===settled.orderId)?.paymentKind,"simulated");
  const single = await admin.get(`/api/commerce/orders/${settled.orderId}`);
  assert.equal(single.body.paymentKind,"simulated");

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

test("the shipped default ladder is the owner's: ۱ million ⇒ ۳٪, ۲ million ⇒ ۵٪", async () => {
  const { computeCashback } = await import("../src/commerce/cashback");
  const { DEFAULT_COMMERCE_SETTINGS } = await import("../src/commerce/settings");
  const settings = { ...DEFAULT_COMMERCE_SETTINGS, cashbackEnabled: true, cashbackMaxAmount: 10_000 };

  /* prices are stored in 1,000-Toman units, so 1000 units is the one-million bracket */
  assert.deepEqual(
    settings.cashbackTiers.map((t) => [t.min, t.max, t.percent]),
    [
      [0, 1000, 1],
      [1000, 2000, 3],
      [2000, null, 5],
    ],
  );
  assert.equal(computeCashback(999, settings).percent, 1);
  assert.equal(computeCashback(1000, settings).percent, 3, "one million lands in the 3% bracket");
  assert.equal(computeCashback(1500, settings).percent, 3);
  assert.equal(computeCashback(2000, settings).percent, 5, "two million lands in the 5% bracket");
  assert.equal(computeCashback(3000, settings).amount, 150);
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
  // policy 2026-11-04: money is credited but NOT spendable before delivery
  assert.equal(wallet.body.balance, 0, "nothing is spendable before delivery");
  assert.equal(wallet.body.pending, settled.cashback.amount);
  assert.equal(wallet.body.transactions.length, 1);
  assert.equal(wallet.body.transactions[0].kind, "earn");

  // a duplicated callback must not credit again
  const attempts = await query("select id from payment_attempts where checkout_id = $1", [checkout.id]);
  await signedCallback(client, attempts.rows[0].id, { result: "success" });
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
  const money = await superAdmin.post(`/api/commerce/admin/refunds/${requested.body.refund.id}/settle`, {});
  assert.equal(money.status, 200, JSON.stringify(money.body));

  const afterRefund = await client.get("/api/commerce/cashback");
  assert.equal(afterRefund.body.pending, settled.cashback.amount / 2, "half of the pending cashback is clawed back");
  assert.equal(afterRefund.body.reversed, -settled.cashback.amount / 2);
});

test("a guest cannot create a checkout or earn cashback", async () => {
  const variantId = await setStock(SKU, 2);
  const guest = makeClient();
  const checkout = await guest.post("/api/commerce/checkout", {items:[{variantId,quantity:1}]});
  assert.equal(checkout.status,401);
  assert.equal((await query("select count(*)::int as n from checkout_sessions")).rows[0].n,0);
});

/* ---------------------------------------------------------------------
   Cashback financial policy (owner decision 2026-11-04):
   earn → hold until delivery (+ return window) → spend only on a LATER
   order → expire. Guests never touch the wallet.
   --------------------------------------------------------------------- */

async function deliverOrder(orderId: string, sku: string) {
  const admin = await adminClient();
  const order = await admin.get(`/api/commerce/orders/${orderId}`);
  assert.ok(order.body.lines.some((line: {sku:string})=>line.sku===sku));
  for (const line of order.body.lines) for (let i=0;i<line.quantity;i++) {
    const scan=await admin.post(`/api/commerce/orders/${orderId}/picking`,{sku:line.sku,scanKey:randomUUID()});
    assert.equal(scan.status,200,JSON.stringify(scan.body));
  }
  for (const [path, body] of [["packing", {confirm:true}], ["ship",{}], ["deliver",{}]] as const) {
    const res = await admin.post(`/api/commerce/orders/${orderId}/${path}`, body);
    assert.equal(res.status, 200, `${path}: ${JSON.stringify(res.body)}`);
  }
}

test("earned cashback stays pending until delivery and then becomes spendable", async () => {
  const variantId = await setStock(SKU, 6);
  const client = await customerClient();
  await query("delete from price_rules");
  const s = await import("../src/commerce/settings");
  await s.saveCommerceSettings({ cashbackHoldDays: 0, cashbackCreditTiming: "after_return_window" });

  const first = await payAndSettle(client, [{ variantId, quantity: 2 }]);
  assert.ok(first.settled.cashback.amount > 0);

  // 1) before delivery the balance cannot be used
  const blocked = await client.post(`/api/commerce/checkout/${
    (await startCheckout(client, [{ variantId, quantity: 1 }])).body.checkout.id
  }/pay`, { method: "online", useCashback: true });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(blocked.body.code, "cashback_unavailable");

  // 2) delivery releases it (hold = 0 days in this test)
  const order = await query("select sku from order_lines where order_id = $1 limit 1", [first.settled.orderId]);
  await deliverOrder(first.settled.orderId, order.rows[0].sku);
  const cashback = await import("../src/commerce/cashback");
  await cashback.releasePendingCashback();

  const wallet = await client.get("/api/commerce/cashback");
  assert.equal(wallet.body.pending, 0, "delivery releases the pending balance");
  assert.equal(wallet.body.available, first.settled.cashback.amount);

  // 3) the wallet now pays part of a newer order, the gateway collects the rest
  const checkout = await startCheckout(client, [{ variantId, quantity: 1 }]);
  const checkoutId = checkout.body.checkout.id;
  const pay = await client.post(`/api/commerce/checkout/${checkoutId}/pay`, { method: "online", useCashback: true });
  assert.equal(pay.status, 200, JSON.stringify(pay.body));
  const applied = pay.body.attempt.walletApplied;
  assert.ok(applied > 0, "the wallet must cover part of the order");
  assert.equal(pay.body.attempt.amount, Math.round((checkout.body.checkout.quote.grandTotal - applied) * 100) / 100);

  const settled = await client.post(`/api/commerce/payments/${pay.body.attempt.id}/simulate`, { result: "success" });
  assert.equal(settled.body.status, "settled", JSON.stringify(settled.body));

  const after = await client.get("/api/commerce/cashback");
  assert.equal(after.body.available, 0, "the spent part is gone from the wallet");
  assert.equal(after.body.spent, applied);

  const redeem = await query("select kind, amount from cashback_ledger where kind = 'redeem'");
  assert.equal(redeem.rows.length, 1);
  assert.equal(Number(redeem.rows[0].amount), -applied);
});

test("a guest cannot read, quote, cancel or pay another customer's checkout", async () => {
  const variantId = await setStock(SKU, 2);
  const buyer = await customerClient();
  const checkout = await startCheckout(buyer,[{variantId,quantity:1}], {idempotencyKey:"ownership-test-key"});
  const id = checkout.body.checkout.id;
  const guest = makeClient();
  for (const result of [await guest.get(`/api/commerce/checkout/${id}`), await guest.post(`/api/commerce/checkout/${id}/quote`,{}), await guest.post(`/api/commerce/checkout/${id}/cancel`,{}), await guest.post(`/api/commerce/checkout/${id}/pay`,{method:"online"})]) assert.equal(result.status,401);
  const other = makeClient();
  const email = `different-${Date.now()}@example.com`;
  const {hashPassword} = await import("../src/security");
  await query("insert into customers (email,name,password_hash,addresses) values ($1,$2,$3,'[]'::jsonb)",[email,"خریدار آزمون",hashPassword("demo1234")]);
  assert.equal((await other.post("/api/auth/login",{email,password:"demo1234"})).status,200);
  for (const result of [await other.get(`/api/commerce/checkout/${id}`), await other.post(`/api/commerce/checkout/${id}/quote`,{}), await other.post(`/api/commerce/checkout/${id}/cancel`,{}), await other.post(`/api/commerce/checkout/${id}/pay`,{method:"online"})]) assert.equal(result.status,404);
  const replay = await startCheckout(other,[{variantId,quantity:1}],{idempotencyKey:"ownership-test-key"});
  assert.equal(replay.status,409); assert.equal(replay.body.code,"idempotency_conflict");
  const paid = await buyer.post(`/api/commerce/checkout/${id}/pay`,{method:"online"});
  assert.equal(paid.status,200,JSON.stringify(paid.body));
  const forgedCookie = await fetch(`${base}/api/commerce/payments/${paid.body.attempt.id}`,{headers:{cookie:`kv_checkout=${id}`}});
  assert.equal(forgedCookie.status,403);
});

test("a refund returns the wallet share to the wallet, not to the gateway", async () => {
  const variantId = await setStock(SKU, 6);
  const client = await customerClient();
  await query("delete from price_rules");
  const settings = await import("../src/commerce/settings");
  await settings.saveCommerceSettings({ cashbackHoldDays: 0 });

  const first = await payAndSettle(client, [{ variantId, quantity: 2 }]);
  const sku = (await query("select sku from order_lines where order_id = $1 limit 1", [first.settled.orderId])).rows[0].sku;
  await deliverOrder(first.settled.orderId, sku);
  const cashback = await import("../src/commerce/cashback");
  await cashback.releasePendingCashback();

  const checkout = await startCheckout(client, [{ variantId, quantity: 1 }]);
  const pay = await client.post(`/api/commerce/checkout/${checkout.body.checkout.id}/pay`, {
    method: "online",
    useCashback: true,
  });
  const applied = pay.body.attempt.walletApplied;
  assert.ok(applied > 0);
  const settled = await client.post(`/api/commerce/payments/${pay.body.attempt.id}/simulate`, { result: "success" });
  assert.equal(settled.body.status, "settled");

  const order = await client.get(`/api/commerce/orders/${settled.body.orderId}`);
  const requested = await client.post(`/api/commerce/orders/${settled.body.orderId}/returns`, {
    lineId: order.body.lines[0].id,
    quantity: 1,
    reason: "مرجوعی تست کیف پول",
  });
  assert.equal(requested.status, 201, JSON.stringify(requested.body));

  const superAdmin = await superAdminClient();
  await superAdmin.put("/api/commerce/admin/settings", { liveRefundsEnabled: true });
  const approved = await superAdmin.post(`/api/commerce/admin/refunds/${requested.body.refund.id}`, {
    decision: "approve",
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  const money = await superAdmin.post(`/api/commerce/admin/refunds/${requested.body.refund.id}/settle`, {});
  assert.equal(money.status, 200, JSON.stringify(money.body));

  const credit = await query("select amount from cashback_ledger where kind = 'refund_credit'");
  assert.equal(credit.rows.length, 1);
  assert.ok(Number(credit.rows[0].amount) > 0, "the wallet share comes back to the wallet");
  const after = await client.get("/api/commerce/cashback");
  assert.ok(after.body.available > 0);
});

test("cashback is not withdrawable and never crosses accounts", async () => {
  // 1) there is no cash-out route at all: money only exists as a store credit
  const client = await customerClient();
  const withdraw = await client.post("/api/commerce/cashback/withdraw", { amount: 10 });
  assert.equal(withdraw.status, 404, "cashback must never be paid out as cash");

  // 2) a wallet belongs to its own account: another customer cannot spend it
  const variantId = await setStock(SKU, 4);
  await query("delete from price_rules");
  const settings = await import("../src/commerce/settings");
  await settings.saveCommerceSettings({ cashbackHoldDays: 0 });

  const owner = await customerClient();
  const first = await payAndSettle(owner, [{ variantId, quantity: 2 }]);
  assert.ok(first.settled.cashback.amount > 0);
  const sku = (await query("select sku from order_lines where order_id = $1 limit 1", [first.settled.orderId])).rows[0].sku;
  await deliverOrder(first.settled.orderId, sku);
  const cashback = await import("../src/commerce/cashback");
  await cashback.releasePendingCashback();
  const ownerWallet = await owner.get("/api/commerce/cashback");
  assert.ok(ownerWallet.body.available > 0);

  // a different signed-in customer has an empty wallet, even with the same basket
  const other = makeClient();
  const email = `second-${Date.now()}@example.com`;
  const { hashPassword } = await import("../src/security");
  await query("insert into customers (email,name,password_hash,addresses) values ($1,$2,$3,'[]'::jsonb)",[email,"خریدار آزمون",hashPassword("demo1234")]);
  const login = await other.post("/api/auth/login", {email,password:"demo1234"});
  assert.equal(login.status,200,JSON.stringify(login.body));
  const otherWallet = await other.get("/api/commerce/cashback");
  assert.equal(otherWallet.body.available, 0);

  const checkout = await startCheckout(other, [{ variantId, quantity: 1 }]);
  const pay = await other.post(`/api/commerce/checkout/${checkout.body.checkout.id}/pay`, {
    method: "online",
    useCashback: true,
  });
  assert.equal(pay.status, 409, JSON.stringify(pay.body));
  assert.equal(pay.body.code, "cashback_unavailable");

  const unchanged = await owner.get("/api/commerce/cashback");
  assert.equal(unchanged.body.available, ownerWallet.body.available, "another account must not touch this wallet");
});

/* ---------------------------------------------------------------------
   BNPL readiness gate + transport security.
   --------------------------------------------------------------------- */

test("BNPL has three states: enabled, provider-ready and actually available", async () => {
  const admin = await adminClient();
  await admin.put("/api/commerce/admin/settings", { bnpl4ProviderReady: false, bnpl4Enabled: false });

  const blocked = await admin.put("/api/commerce/admin/settings", { bnpl4Enabled: true });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.code, "bnpl_provider_not_ready");

  let config = await makeClient().get("/api/commerce/config");
  assert.equal(config.body.bnpl4.enabled, false);
  assert.equal(config.body.bnpl4.providerReady, false);
  assert.equal(config.body.bnpl4.availableForCheckout, false);

  await admin.put("/api/commerce/admin/settings", { bnpl4ProviderReady: true });
  config = await makeClient().get("/api/commerce/config");
  assert.equal(config.body.bnpl4.providerReady, true);
  assert.equal(config.body.bnpl4.availableForCheckout, false, "still off until the owner flips the switch");

  await admin.put("/api/commerce/admin/settings", { bnpl4Enabled: true });
  config = await makeClient().get("/api/commerce/config");
  assert.equal(config.body.bnpl4.availableForCheckout, true);

  // losing provider readiness immediately blocks new installment payments
  const variantId = await setStock(SKU, 2);
  const buyer = await customerClient();
  const checkout = await startCheckout(buyer, [{ variantId, quantity: 1 }]);
  await admin.put("/api/commerce/admin/settings", { bnpl4ProviderReady: false });
  const pay = await buyer.post(`/api/commerce/checkout/${checkout.body.checkout.id}/pay`, { method: "bnpl4" });
  assert.ok(pay.status === 409 || pay.status === 403, JSON.stringify(pay.body));
  assert.ok(
    ["bnpl_provider_not_ready", "bnpl_disabled"].includes(pay.body.code),
    `revoking readiness must stop the gateway, got ${pay.body.code}`,
  );

  await admin.put("/api/commerce/admin/settings", { bnpl4Enabled: false, bnpl4ProviderReady: false });
});

test("an unsigned provider callback is refused", async () => {
  const variantId = await setStock(SKU, 2);
  const client = makeClient();
  const checkout = await startCheckout(client, [{ variantId, quantity: 1 }]);
  const pay = await client.post(`/api/commerce/checkout/${checkout.body.checkout.id}/pay`, { method: "online" });
  assert.equal(pay.status, 200, JSON.stringify(pay.body));

  const forged = await client.post(`/api/commerce/payments/${pay.body.attempt.id}/callback`, { result: "success" });
  assert.equal(forged.status, 401, JSON.stringify(forged.body));
  assert.equal(forged.body.code, "invalid_callback_signature");

  const order = await query("select count(*)::int as n from orders");
  assert.equal(order.rows[0].n, 0, "an unsigned callback must never create an order");

  const signed = await signedCallback(client, pay.body.attempt.id, { result: "success" });
  assert.equal(signed.body.status, "settled", JSON.stringify(signed.body));
});

test("state-changing requests need the CSRF token and repeated attempts get rate limited", async () => {
  // a naked POST without the header is rejected before touching any handler
  const naked = await fetch(`${base}/api/commerce/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: [] }),
  });
  assert.equal(naked.status, 403);
  const payload = (await naked.json()) as { code?: string };
  assert.equal(payload.code, "csrf_token_invalid");

  // rate limit: shrink the window for one route class and hammer it
  const security = await import("../src/http/security");
  security.setRateLimit("admin_login", { max: 3, windowMs: 60_000 });
  security.resetRateLimits();
  const client = makeClient();
  let last = 0;
  for (let i = 0; i < 5; i += 1) {
    const res = await client.post("/api/admin/login", { passcode: "wrong" });
    last = res.status;
  }
  assert.equal(last, 429, "brute force must hit the limiter");
  security.setRateLimit("admin_login", { max: 20, windowMs: 60_000 });
  security.resetRateLimits();
});

test("production blocks every unverified payment provider and refuses mock callbacks", async () => {
  const variantId=await setStock(SKU,2); const buyer=await customerClient();
  const checkout=await startCheckout(buyer,[{variantId,quantity:1}]);
  const {config}=await import("../src/config"); const payment=await import("../src/commerce/payments");
  const was=config.isProd;const oldUrl=process.env.PAYMENT_GATEWAY_URL;process.env.PAYMENT_GATEWAY_URL="https://gateway.invalid";config.isProd=true;
  try {
    assert.deepEqual(payment.availableProviders(),{mock:false,gateway:false});
    for(const provider of ["mock","mock-bnpl4","gateway"]) assert.throws(()=>payment.providerFor(provider),(e:any)=>e.code==="production_provider_not_ready");
    const result=await buyer.post(`/api/commerce/checkout/${checkout.body.checkout.id}/pay`,{method:"online"});
    assert.equal(result.status,503,JSON.stringify(result.body));assert.equal(result.body.code,"production_provider_not_ready");
    assert.equal((await query("select id from payment_attempts where checkout_id=$1",[checkout.body.checkout.id])).rows.length,0);
    const cfg=await buyer.get("/api/commerce/config");assert.equal(cfg.body.bnpl4.availableForCheckout,false);assert.equal(cfg.body.checkoutAvailable,false);
    const before=(await query("select count(*)::int as n from checkout_sessions")).rows[0].n;
    const blocked=await buyer.post("/api/commerce/checkout",{items:[{variantId,quantity:1}]});assert.equal(blocked.status,503);assert.equal(blocked.body.code,"production_provider_not_ready");
    assert.equal((await query("select count(*)::int as n from checkout_sessions")).rows[0].n,before,"unpayable checkout must not reserve stock");
  } finally {config.isProd=was;if(oldUrl===undefined)delete process.env.PAYMENT_GATEWAY_URL;else process.env.PAYMENT_GATEWAY_URL=oldUrl;}
});

test("spoofed forwarded client addresses cannot bypass login rate limits", async () => {
  const security=await import("../src/http/security");security.setRateLimit("admin_login",{max:3,windowMs:60000});security.resetRateLimits();
  try {
    const csrf=await fetch(base+"/api/csrf");const {token}=await csrf.json() as {token:string};
    let result=0;
    for(let i=0;i<4;i++) {const r=await fetch(base+"/api/admin/login",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":token,"x-forwarded-for":`192.0.2.${i+1}`},body:JSON.stringify({passcode:"invalid"})});result=r.status;}
    assert.equal(result,429);
  } finally {security.setRateLimit("admin_login",{max:20,windowMs:60000});security.resetRateLimits();}
});

test("production sessions use only secure HttpOnly cookies and elevation needs prior permission", async () => {
  const {config}=await import("../src/config");const was=config.isProd;
  const guest=makeClient();assert.equal((await guest.post("/api/commerce/admin/elevate",{passcode:"super-secret"})).status,401);
  const admin=await adminClient();const elevated=await admin.post("/api/commerce/admin/elevate",{passcode:"super-secret"});assert.equal(elevated.status,200);
  const expires=(await query("select extract(epoch from (expires_at-now())) as ttl from sessions where token=$1",[elevated.body.sessionToken])).rows[0];
  assert.ok(Number(expires.ttl)>0 && Number(expires.ttl)<=900,"superadmin session is short lived");
  assert.ok((await query("select id from audit_events where actor='admin' and action='admin.elevated'")).rows.length);
  config.isProd=true;
  try {
    const csrf=await fetch(base+"/api/csrf");const {token}=await csrf.json() as {token:string};
    const login=await fetch(base+"/api/auth/login",{method:"POST",headers:{"content-type":"application/json","x-csrf-token":token},body:JSON.stringify({email:"ava@example.com",password:"demo1234"})});
    assert.equal(login.status,200);const body=await login.json() as any;assert.equal(body.sessionToken,undefined);
    const cookie=login.headers.getSetCookie().find(x=>x.startsWith("kv_session="));assert.ok(cookie);assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=Lax/i);
    const value=cookie.split(";")[0];const raw=value.slice("kv_session=".length);
    assert.equal((await (await fetch(base+"/api/auth/me",{headers:{"x-session-token":raw}})).json() as any).customer,null);
    assert.ok((await (await fetch(base+"/api/auth/me",{headers:{cookie:value}})).json() as any).customer);
  } finally {config.isProd=was;}
});

test("the public bootstrap never leaks the admin passcode, orders or provider secrets", async () => {
  const guest = makeClient();
  const health=await guest.get("/api/health");assert.equal(health.body.orders,undefined);assert.equal(health.body.customers,undefined);
  const boot = await guest.get("/api/bootstrap");
  assert.equal(boot.status, 200);
  const admin = boot.body.admin as Record<string, any>;
  assert.equal(admin.passcode, undefined, "staff passcode must never reach a visitor");
  assert.equal(admin.orders, undefined);
  assert.equal(admin.customers, undefined);
  assert.equal(admin.integrations?.payment?.key, undefined, "provider credentials are admin-only");
  // public capability flags have their own endpoint; the document is not the
  // place they come from any more, so assert against the real source
  const commerce = await guest.get("/api/commerce/config");
  assert.equal(commerce.status, 200);
  assert.equal(typeof commerce.body.bnpl4?.enabled, "boolean", "the checkout learns BNPL state from the capability endpoint");
  assert.equal(commerce.body.bnpl4?.providerReady, false, "the owner switch and the provider contract are separate facts");
  assert.equal(commerce.body.bnpl4?.availableForCheckout, false);
  assert.equal(commerce.body.paymentProvider === undefined || typeof commerce.body.paymentProvider === "string", true);
  assert.equal(/secret|token|key=/.test(JSON.stringify(commerce.body).toLowerCase()), false, "no credential in the public config");
  assert.equal(admin.settings?.passcode, undefined, "the passcode inside settings must be stripped too");
  assert.equal(boot.body.ops?.security?.passcode, undefined, "the ops document must not carry the passcode");

  // plant credential-looking fields straight in the document, then restore it,
  // so the shared test database is never left in a half-written state
  const snapshot = await query("select value from state_documents where key = 'admin'");
  const original = snapshot.rows[0].value as Record<string, any>;
  const tampered = {
    ...original,
    passcode: "1234",
    integrations: {
      ...(original.integrations ?? {}),
      payment: { ...(original.integrations?.payment ?? {}), key: "sk_live_super_secret" },
    },
  };
  await query("update state_documents set value = $1 where key = 'admin'", [JSON.stringify(tampered)]);
  try {
    const authed = await (await adminClient()).get("/api/bootstrap");
    assert.equal(authed.body.admin.integrations.payment.key, "***", "even an admin gets secrets masked");
    assert.equal(authed.body.admin.passcode, "***", "the staff passcode is never handed back raw");

    const guestAfter = await makeClient().get("/api/bootstrap");
    assert.equal(guestAfter.body.admin.integrations?.payment?.key, undefined);
    assert.equal(guestAfter.body.admin.passcode, undefined);
  } finally {
    await query("update state_documents set value = $1 where key = 'admin'", [JSON.stringify(original)]);
  }
});

/* ---------------------------------------------------------------------
   Staged RMA: goods → QC → money. Nothing becomes sellable on "approve".
   --------------------------------------------------------------------- */

test("a returned unit is not restocked before QC and a defective one is quarantined", async () => {
  const variantId = await setStock(SKU, 4);
  const client = await customerClient();
  await query("delete from price_rules");
  const { settled } = await payAndSettle(client, [{ variantId, quantity: 2 }]);

  const before = await stockOf(SKU);
  assert.equal(before.onHand, 2, "two units left the shelf");

  const order = await client.get(`/api/commerce/orders/${settled.orderId}`);
  const requested = await client.post(`/api/commerce/orders/${settled.orderId}/returns`, {
    lineId: order.body.lines[0].id,
    quantity: 2,
    reason: "مرجوعی با QC",
    kind: "return",
  });
  assert.equal(requested.status, 201, JSON.stringify(requested.body));
  const refundId = requested.body.refund.id;

  const superAdmin = await superAdminClient();
  await superAdmin.put("/api/commerce/admin/settings", { liveRefundsEnabled: true });

  const approved = await superAdmin.post(`/api/commerce/admin/refunds/${refundId}`, { decision: "approve" });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal((await stockOf(SKU)).onHand, 2, "approval must not restock anything");

  const early = await superAdmin.post(`/api/commerce/admin/refunds/${refundId}/settle`, {});
  assert.equal(early.status, 409, JSON.stringify(early.body));
  assert.equal(early.body.code, "qc_required");

  const received = await superAdmin.post(`/api/commerce/admin/refunds/${refundId}/receive`, {});
  assert.equal(received.status, 200, JSON.stringify(received.body));

  const defective = await superAdmin.post(`/api/commerce/admin/refunds/${refundId}/qc`, {
    result: "defective",
    note: "لکه روی پارچه",
  });
  assert.equal(defective.status, 200, JSON.stringify(defective.body));
  assert.equal(defective.body.refund.status, "qc_failed");

  const afterQc = await stockOf(SKU);
  assert.equal(afterQc.onHand, 4, "returned units are physically present in quarantine");
  assert.equal(afterQc.quarantined, 2, "it sits in quarantine instead");
  assert.equal(afterQc.available, 2, "quarantine must not consume unrelated sellable stock");

  const settledRefund = await superAdmin.post(`/api/commerce/admin/refunds/${refundId}/settle`, {});
  assert.equal(settledRefund.status, 200, JSON.stringify(settledRefund.body));
  assert.equal(settledRefund.body.refund.status, "settled");

  await query("update product_variants set quarantined = 0 where id = $1", [variantId]);
});

test("a saleable return goes back to stock only after QC", async () => {
  const variantId = await setStock(SKU, 3);
  const client = await customerClient();
  await query("delete from price_rules");
  const { settled } = await payAndSettle(client, [{ variantId, quantity: 1 }]);
  const order = await client.get(`/api/commerce/orders/${settled.orderId}`);
  const requested = await client.post(`/api/commerce/orders/${settled.orderId}/returns`, {
    lineId: order.body.lines[0].id,
    quantity: 1,
    kind: "return",
  });
  const refundId = requested.body.refund.id;

  const admin = await adminClient();
  await admin.post(`/api/commerce/admin/refunds/${refundId}`, { decision: "approve" }).catch(() => undefined);
  const superAdmin = await superAdminClient();
  await superAdmin.put("/api/commerce/admin/settings", { liveRefundsEnabled: true });
  await superAdmin.post(`/api/commerce/admin/refunds/${refundId}`, { decision: "approve" });
  await superAdmin.post(`/api/commerce/admin/refunds/${refundId}/receive`, {});
  const qc = await superAdmin.post(`/api/commerce/admin/refunds/${refundId}/qc`, { result: "saleable" });
  assert.equal(qc.body.refund.status, "qc_passed");
  assert.equal((await stockOf(SKU)).onHand, 3, "a clean unit returns to saleable stock");
});

test("exchange requests and old payment links fail closed until replacement fulfillment is implemented", async () => {
  const variantId=await setStock(SKU,3),targetId=await setStock(SKU2,3),buyer=await customerClient();
  const {settled}=await payAndSettle(buyer,[{variantId,quantity:1}]);const order=await buyer.get(`/api/commerce/orders/${settled.orderId}`);
  const result=await buyer.post(`/api/commerce/orders/${settled.orderId}/returns`,{lineId:order.body.lines[0].id,quantity:1,kind:"exchange",targetVariantId:targetId});
  assert.equal(result.status,503);assert.equal(result.body.code,'exchange_unavailable');
  assert.equal(Number((await query('select count(*)::int n from refunds where order_id=$1',[settled.orderId])).rows[0].n),0);
  const beforeStock=[await stockOf(SKU),await stockOf(SKU2)];
  const beforeLine=(await query('select refunded_quantity from order_lines where id=$1',[order.body.lines[0].id])).rows[0].refunded_quantity;
  const refundId=`rfd_${randomUUID()}`,token=`exc_${randomUUID()}`;
  await query(`insert into refunds(id,order_id,order_line_id,quantity,amount,kind,target_variant_id,status,qc_result,difference_amount)
    values($1,$2,$3,1,1,'exchange',$4,'qc_passed','saleable',1)`,[refundId,settled.orderId,order.body.lines[0].id,targetId]);
  await query("insert into exchange_payments(id,refund_id,amount,token,status,expires_at) values($1,$2,1,$3,'unpaid',now()+interval '1 day')",[`exp_${randomUUID()}`,refundId,token]);
  const payment=await buyer.post(`/api/commerce/exchange/${token}/pay`,{});assert.equal(payment.status,503);assert.equal(payment.body.code,'exchange_unavailable');
  assert.equal((await query('select status from exchange_payments where token=$1',[token])).rows[0].status,'unpaid');
  const admin=await superAdminClient();await admin.put('/api/commerce/admin/settings',{liveRefundsEnabled:true});
  const action=await admin.post(`/api/commerce/admin/refunds/${refundId}/settle`,{});assert.equal(action.status,503);assert.equal(action.body.code,'exchange_unavailable');
  assert.equal((await query('select status from refunds where id=$1',[refundId])).rows[0].status,'qc_passed');
  assert.deepEqual([await stockOf(SKU),await stockOf(SKU2)],beforeStock);
  assert.equal((await query('select refunded_quantity from order_lines where id=$1',[order.body.lines[0].id])).rows[0].refunded_quantity,beforeLine);
  assert.equal((await query("select count(*)::int n from cashback_ledger where ref_id=$1 or ref_id=$2",[refundId,`${refundId}:diff`])).rows[0].n,0);
});

test("an installment refund the provider cannot reverse is parked for a human", async () => {
  const admin = await adminClient();
  await admin.put("/api/commerce/admin/settings", { bnpl4ProviderReady: true });
  await admin.put("/api/commerce/admin/settings", { bnpl4Enabled: true });

  const variantId = await setStock(SKU, 3);
  const client = await customerClient();
  await query("delete from price_rules");
  const { settled } = await payAndSettle(client, [{ variantId, quantity: 1 }], "bnpl4");
  assert.equal(settled.status, "settled");

  const order = await client.get(`/api/commerce/orders/${settled.orderId}`);
  const requested = await client.post(`/api/commerce/orders/${settled.orderId}/returns`, {
    lineId: order.body.lines[0].id,
    quantity: 1,
    kind: "refund",
    reason: "بازگشت پول اقساطی",
  });
  const refundId = requested.body.refund.id;

  const superAdmin = await superAdminClient();
  await superAdmin.put("/api/commerce/admin/settings", { liveRefundsEnabled: true });
  await superAdmin.post(`/api/commerce/admin/refunds/${refundId}`, { decision: "approve" });
  const settle = await superAdmin.post(`/api/commerce/admin/refunds/${refundId}/settle`, {});
  assert.equal(settle.status, 200, JSON.stringify(settle.body));
  assert.equal(settle.body.refund.status, "manual_review", "no fake refund when the provider cannot reverse");

  const line = await query("select refunded_quantity from order_lines where order_id = $1", [settled.orderId]);
  assert.equal(line.rows[0].refunded_quantity, 0, "a parked refund must not close the line");

  await admin.put("/api/commerce/admin/settings", { bnpl4Enabled: false, bnpl4ProviderReady: false });
});

test("the panel's campaign ceiling and coupon limits reach the pricing tables", async () => {
  const { syncPromotions } = await import("../src/commerce/promotions");
  const couponSnapshot = (await query("select * from coupons")).rows;
  const docSnapshot=(await query("select value from state_documents where key='admin'")).rows[0].value;

  const desired={
    campaigns: [
      { id: "sync-cap", name: "کمپین سقف‌دار", kind: "percent", value: 20, minSpend: 100, maxDiscount: 5000, active: true, start: "2026-01-01", end: "2026-12-31" },
      { id: "sync-plain", name: "کمپین بی‌سقف", kind: "percent", value: 5, active: true },
    ],
    discountRules: [],
    coupons: [{ code: "CAPX", kind: "percent", value: 10, maxDiscount: 700, usageLimit: 5, active: true }],
  };
  await query("update state_documents set value=$1::jsonb where key='admin'",[JSON.stringify(desired)]);
  await syncPromotions(desired);

  const capped = await query(
    "select max_discount, min_subtotal from price_rules where id = 'sync-cap'",
  );
  assert.equal(Number(capped.rows[0].max_discount), 5000);
  assert.equal(Number(capped.rows[0].min_subtotal), 100);
  const plain = await query("select max_discount from price_rules where id = 'sync-plain'");
  assert.equal(plain.rows[0].max_discount, null, "no ceiling means no ceiling, not zero");

  const coupon = await query(
    "select max_discount, usage_limit from coupons where code = 'CAPX'",
  );
  assert.equal(Number(coupon.rows[0].max_discount), 700);
  assert.equal(coupon.rows[0].usage_limit, 5);

  // the sync mirrors the document, so put the seeded codes back for anything that follows
  await query("update state_documents set value=$1::jsonb where key='admin'",[JSON.stringify(docSnapshot)]);
  await query("delete from coupons");
  for (const row of couponSnapshot) {
    const cols = Object.keys(row);
    const values = cols.map((_, i) => `$${i + 1}`);
    await query(`insert into coupons (${cols.join(", ")}) values (${values.join(", ")})`, cols.map((c) => row[c]));
  }
  await query("delete from price_rules");
});

/* =====================================================================
   The real gateway (the last real gap before the shop can take money).

   The tests run against a stub provider on localhost that speaks the same
   tiny contract as a real one: /initiate hands back a reference and a
   redirect URL, /verify is the only source of truth about money. The point of
   each test is what the shop refuses to believe.
   ===================================================================== */

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

type StubMode = "settled" | "pending" | "down" | "wrongAmount";

async function startGatewayStub() {
  const calls: { path: string; body: Json; signature: string | null }[] = [];
  let mode: StubMode = "settled";

  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      void (async () => {
        const body: Json = raw ? JSON.parse(raw) : {};
        const signature = typeof req.headers["x-signature"] === "string" ? req.headers["x-signature"] : null;
        calls.push({ path: String(req.url), body, signature });
        res.setHeader("content-type", "application/json");

        if (req.url === "/initiate") {
          res.end(
            JSON.stringify({
              providerRef: `stub_${body.reference}`,
              redirectUrl: `https://sandbox.example/pay/${body.reference}`,
              instructions: "به صفحهٔ پرداخت آزمایشی منتقل شو.",
            }),
          );
          return;
        }
        if (req.url === "/verify") {
          if (mode === "down") {
            res.statusCode = 503;
            res.end(JSON.stringify({ message: "provider unavailable" }));
            return;
          }
          const settledAmount = Number(
            (await query("select amount from payment_attempts where id = $1", [body.reference])).rows[0]?.amount ?? 0,
          );
          if (mode === "pending") {
            res.end(JSON.stringify({ status: "pending", providerRef: `stub_${body.reference}` }));
            return;
          }
          res.end(
            JSON.stringify({
              status: "settled",
              providerRef: `stub_${body.reference}`,
              amount: mode === "wrongAmount" ? settledAmount + 250000 : settledAmount,
            }),
          );
          return;
        }
        res.statusCode = 404;
        res.end("{}");
      })();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    setMode: (next: StubMode) => {
      mode = next;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function useGatewaySettings(paymentProvider: string) {
  const settings = await import("../src/commerce/settings");
  await settings.saveCommerceSettings({ paymentProvider } as any);
}

async function clearGatewayEnv() {
  delete process.env.PAYMENT_GATEWAY_URL;
  delete process.env.PAYMENT_GATEWAY_SECRET;
  delete process.env.PAYMENT_GATEWAY_TOKEN;
  delete process.env.PAYMENT_GATEWAY_REFUNDS;
  delete process.env.PUBLIC_BASE_URL;
}

function gatewaySignature(reference: string, status: string) {
  return createHmac("sha256", "gw-secret").update(`${reference}:${status}`).digest("hex");
}

/** gateway callbacks carry two proofs: the route's shared-secret header and the
    body signature the provider checks before it asks the gateway again */
async function gatewayCallback(client: Client, attemptId: string, body: Json) {
  const { signCallbackPayload } = await import("../src/commerce/payments");
  const settings = await import("../src/commerce/settings");
  const current = await settings.loadCommerceSettings(true);
  const res = await fetch(`${base}/api/commerce/payments/${attemptId}/callback`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-provider-signature": signCallbackPayload(current.providerWebhookSecret, attemptId, body),
      cookie: client.cookie(),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test("a gateway that is not configured is refused, never faked with the mock", async () => {
  await clearGatewayEnv();
  await useGatewaySettings("gateway");
  try {
    const client = makeClient();
    const variantId = await setStock(SKU, 3);
    const checkout = await startCheckout(client, [{ variantId, quantity: 1 }]);
    assert.equal(checkout.status, 201, JSON.stringify(checkout.body));

    const pay = await client.post(`/api/commerce/checkout/${checkout.body.checkout.id}/pay`, { method: "online" });
    assert.equal(pay.status, 503, JSON.stringify(pay.body));
    assert.equal(pay.body.code, "provider_not_configured");

    const orders = await query("select count(*)::int as n from orders");
    assert.equal(Number(orders.rows[0].n), 0, "no order may exist for a payment that never started");
    const attempts = await query("select count(*)::int as n from payment_attempts where status = 'settled'");
    assert.equal(Number(attempts.rows[0].n), 0);

    // and the shop cannot pretend the gateway is available either
    const config = await client.get("/api/commerce/config");
    assert.equal(config.body.providers.gateway, false);
    assert.equal(config.body.providers.mock, true);
  } finally {
    await useGatewaySettings("mock");
    await clearGatewayEnv();
  }
});

test("the gateway settles only after its own verify call, and exactly once", async () => {
  const stub = await startGatewayStub();
  process.env.PAYMENT_GATEWAY_URL = stub.url;
  process.env.PAYMENT_GATEWAY_SECRET = "gw-secret";
  process.env.PUBLIC_BASE_URL = "https://shop.example";
  await useGatewaySettings("gateway");
  try {
    const client = makeClient();
    const variantId = await setStock(SKU, 3);
    const checkout = await startCheckout(client, [{ variantId, quantity: 1 }]);
    assert.equal(checkout.status, 201, JSON.stringify(checkout.body));

    const pay = await client.post(`/api/commerce/checkout/${checkout.body.checkout.id}/pay`, { method: "online" });
    assert.equal(pay.status, 200, JSON.stringify(pay.body));
    const attemptId = pay.body.attempt.id as string;
    assert.equal(pay.body.attempt.provider, "gateway");
    // a real gateway is never offered as a mock, even with mock controls on
    assert.equal(pay.body.payment.mock, false);
    assert.match(String(pay.body.payment.redirectUrl), /^https:\/\/sandbox\.example\/pay\//);

    // the provider was told where to call back and where to send the shopper
    const initiate = stub.calls.find((call) => call.path === "/initiate");
    assert.ok(initiate, "initiate must reach the provider");
    assert.equal(initiate.body.amount, Number(pay.body.attempt.amount));
    assert.equal(
      initiate.body.callbackUrl,
      `https://shop.example/api/commerce/payments/${attemptId}/callback`,
    );
    assert.equal(initiate.body.returnUrl, `https://shop.example/#/payment/${attemptId}`);
    assert.equal(initiate.signature?.length, 64, "requests are HMAC-signed when a secret exists");

    // 1. an unsigned callback is a claim, not a payment
    const unsigned = await gatewayCallback(client, attemptId, { status: "settled" });
    assert.equal(unsigned.status, 200, JSON.stringify(unsigned.body));
    assert.equal(unsigned.body.status, "pending_verification");
    assert.equal(stub.calls.filter((call) => call.path === "/verify").length, 0, "unsigned claims never reach verify");
    assert.equal((await query("select count(*)::int as n from orders")).rows[0].n, 0);

    // 2. a correctly signed callback makes the server ask the provider
    const signed = await gatewayCallback(client, attemptId, {
      status: "settled",
      signature: gatewaySignature(attemptId, "settled"),
    });
    assert.equal(signed.status, 200, JSON.stringify(signed.body));
    assert.equal(signed.body.status, "settled", JSON.stringify(signed.body));
    assert.ok(signed.body.orderId);

    // 3. the callback replayed settles once, with the same order
    const replay = await gatewayCallback(client, attemptId, {
      status: "settled",
      signature: gatewaySignature(attemptId, "settled"),
    });
    assert.equal(replay.body.status, "settled");
    assert.equal(replay.body.orderId, signed.body.orderId);
    assert.equal((await query("select count(*)::int as n from orders")).rows[0].n, 1);

    // 4. the shopper's return page reads the same truth
    const status = await client.get(`/api/commerce/payments/${attemptId}`);
    assert.equal(status.status, 200, JSON.stringify(status.body));
    assert.equal(status.body.status, "settled");
    assert.equal(status.body.order.id, signed.body.orderId);
    assert.equal(status.body.mock, false);

    const available = await client.get(`/api/commerce/config`);
    assert.equal(available.body.providers.gateway, true);
  } finally {
    await stub.close();
    await useGatewaySettings("mock");
    await clearGatewayEnv();
  }
});

test("a settled amount that does not match the order becomes an exception, not a sale", async () => {
  const stub = await startGatewayStub();
  stub.setMode("wrongAmount");
  process.env.PAYMENT_GATEWAY_URL = stub.url;
  process.env.PAYMENT_GATEWAY_SECRET = "gw-secret";
  await useGatewaySettings("gateway");
  try {
    const client = makeClient();
    const variantId = await setStock(SKU, 3);
    const checkout = await startCheckout(client, [{ variantId, quantity: 1 }]);
    const pay = await client.post(`/api/commerce/checkout/${checkout.body.checkout.id}/pay`, { method: "online" });
    const attemptId = pay.body.attempt.id as string;

    const res = await gatewayCallback(client, attemptId, {
      status: "settled",
      signature: gatewaySignature(attemptId, "settled"),
    });
    assert.equal(res.body.status, "exception", JSON.stringify(res.body));
    assert.equal((await query("select count(*)::int as n from orders")).rows[0].n, 0);
    const row = await query("select status, last_error from payment_attempts where id = $1", [attemptId]);
    assert.equal(row.rows[0].status, "exception");
    assert.equal(row.rows[0].last_error, "amount_mismatch");
  } finally {
    await stub.close();
    await useGatewaySettings("mock");
    await clearGatewayEnv();
  }
});

test("a provider we cannot reach parks the payment, and a later callback recovers it", async () => {
  const stub = await startGatewayStub();
  stub.setMode("down");
  process.env.PAYMENT_GATEWAY_URL = stub.url;
  process.env.PAYMENT_GATEWAY_SECRET = "gw-secret";
  await useGatewaySettings("gateway");
  try {
    const client = makeClient();
    const variantId = await setStock(SKU, 3);
    const checkout = await startCheckout(client, [{ variantId, quantity: 1 }]);
    const pay = await client.post(`/api/commerce/checkout/${checkout.body.checkout.id}/pay`, { method: "online" });
    const attemptId = pay.body.attempt.id as string;

    const parked = await gatewayCallback(client, attemptId, {
      status: "settled",
      signature: gatewaySignature(attemptId, "settled"),
    });
    assert.equal(parked.body.status, "pending_verification", JSON.stringify(parked.body));
    assert.equal((await query("select count(*)::int as n from orders")).rows[0].n, 0);

    // the provider comes back; the same signed callback now settles
    stub.setMode("settled");
    const recovered = await gatewayCallback(client, attemptId, {
      status: "settled",
      signature: gatewaySignature(attemptId, "settled"),
    });
    assert.equal(recovered.body.status, "settled", JSON.stringify(recovered.body));
    assert.ok(recovered.body.orderId);
  } finally {
    await stub.close();
    await useGatewaySettings("mock");
    await clearGatewayEnv();
  }
});

test("the gateway claims no capability it was not given (refunds stay off by default)", async () => {
  await clearGatewayEnv();
  const { providerCapabilities } = await import("../src/commerce/payments");
  const off = providerCapabilities("gateway");
  assert.equal(off.refund, false);
  assert.equal(off.bnpl4, false);
  assert.equal(off.signedCallbacks, true);

  process.env.PAYMENT_GATEWAY_REFUNDS = "1";
  assert.equal(providerCapabilities("gateway").refund, false, "a flag cannot implement a real refund adapter");
  await clearGatewayEnv();
});

/* =====================================================================
   The cookie-less browser (the framed preview, a locked-down browser).

   These are the two failures the owner actually hit: the panel refused the
   passcode and sign-up answered «توکن امنیتی معتبر نیست», because the CSRF
   cookie is dropped when the shop runs inside a frame on another origin.
   ===================================================================== */

test("a browser that cannot keep cookies still logs in, with a signed token", async () => {
  const tokenRes = await fetch(`${base}/api/csrf`);
  assert.equal(tokenRes.status, 200);
  const { token } = (await tokenRes.json()) as { token: string };
  assert.ok(token && token.split(".").length === 3, "a signed token comes back");

  const login = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": token },
    body: JSON.stringify({ passcode: "1234" }),
  });
  assert.equal(login.status, 200, await login.clone().text());
  const session = (login.headers.getSetCookie?.() ?? []).find((c) => c.startsWith("kv_session="));
  assert.ok(session, "a session cookie comes back even without a CSRF cookie");

  const me = await fetch(`${base}/api/admin/me`, { headers: { cookie: session.split(";")[0] } });
  assert.equal(me.status, 200);
  assert.equal(((await me.json()) as Json).authenticated, true);
});

test("unverified registration fails closed even without cookies", async () => {
  const { token } = (await (await fetch(`${base}/api/csrf`)).json()) as { token: string };
  const email = `frame-${Date.now()}@example.com`;
  const signup = await fetch(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": token },
    body: JSON.stringify({ email, password: "demo1234", name: "خریدار بدون کوکی" }),
  });
  assert.equal(signup.status, 503);
  assert.equal(((await signup.json()) as Json).code, "registration_unavailable");
  assert.equal((signup.headers.getSetCookie?.() ?? []).some((c) => c.startsWith("kv_session=")), false);
});

test("a write with no token at all is still refused", async () => {
  const res = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passcode: "1234" }),
  });
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as Json).code, "csrf_token_invalid");
});

test("the visit beacon records a page view without a CSRF pair", async () => {
  // a fresh session and path every run: page_views is intentionally not wiped
  const stamp = Date.now().toString(36);
  const session = `probe-${stamp}`;
  const path = `/journal/probe-${stamp}`;
  const res = await fetch(`${base}/api/track`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, session, device: "desktop" }),
  });
  assert.equal(res.status, 204, await res.clone().text());
  const row = await query("select count(*)::int as n from page_views where session = $1", [session]);
  assert.equal(Number(row.rows[0].n), 1);
  const views = (await (await fetch(`${base}/api/public/page-views?path=${path}`)).json()) as Json;
  assert.equal(views.views, 1);
});

test("a cross-site login returns the session so the panel still works without cookies", async () => {
  const { token } = (await (await fetch(`${base}/api/csrf`)).json()) as { token: string };
  const login = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": token, "sec-fetch-site": "cross-site" },
    body: JSON.stringify({ passcode: "1234" }),
  });
  assert.equal(login.status, 200);
  const body = (await login.json()) as Json;
  assert.ok(typeof body.sessionToken === "string" && body.sessionToken.length > 10, "the token comes back for cross-site logins");

  // no cookie at all — only the header
  const me = await fetch(`${base}/api/admin/me`, { headers: { "x-session-token": body.sessionToken } });
  assert.equal(me.status, 200);
  assert.equal(((await me.json()) as Json).authenticated, true);

  // and it stops working the moment it is logged out
  const out = await fetch(`${base}/api/admin/logout`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": token, "x-session-token": body.sessionToken },
    body: "{}",
  });
  assert.equal(out.status, 200);
  const after = await fetch(`${base}/api/admin/me`, { headers: { "x-session-token": body.sessionToken } });
  assert.equal(((await after.json()) as Json).authenticated, false);
});

test("every login hands the session back, so a lost cookie is not a lost login", async () => {
  const { token } = (await (await fetch(`${base}/api/csrf`)).json()) as { token: string };
  const login = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": token },
    body: JSON.stringify({ passcode: "1234" }),
  });
  assert.equal(login.status, 200);
  const body = (await login.json()) as Json;
  assert.ok(typeof body.sessionToken === "string" && body.sessionToken.length > 10);

  // the header alone is enough — the cookie is not required anywhere
  const me = await fetch(`${base}/api/admin/me`, { headers: { "x-session-token": body.sessionToken } });
  assert.equal(((await me.json()) as Json).authenticated, true);
});

test("review owner can make protected decisions in preview while money remains fail-closed", async () => {
  const variantId = await setStock(SKU, 3);
  const customer = await customerClient();
  const { settled } = await payAndSettle(customer, [{variantId,quantity:1}]);
  const admin = await adminClient();
  const order = await admin.get(`/api/commerce/orders/${settled.orderId}`);
  const request = await customer.post(`/api/commerce/orders/${settled.orderId}/returns`, {lineId:order.body.lines[0].id,quantity:1,reason:"test"});
  assert.equal(request.status,201,JSON.stringify(request.body));
  const id = request.body.refund.id;
  assert.equal((await admin.post(`/api/commerce/admin/refunds/${id}`,{decision:"approve"})).status,403);
  try {
    process.env.PANEL_OPEN_ACCESS="1";
    const preview=makeClient();
    const me=await preview.get("/api/admin/me");
    assert.equal(me.body.subject,"review-owner");
    const approved=await preview.post(`/api/commerce/admin/refunds/${id}`,{decision:"approve"});
    assert.equal(approved.status,200,JSON.stringify(approved.body));
    assert.equal(approved.body.refund.status,"approved");
    const settle=await preview.post(`/api/commerce/admin/refunds/${id}/settle`,{});
    assert.equal(settle.status,403); assert.equal(settle.body.code,"live_refunds_blocked");
    // An existing admin cookie must not make the preview less privileged.
    const existingAdmin=await admin.post(`/api/commerce/admin/refunds/${id}`,{decision:"approve"});
    assert.equal(existingAdmin.status,200,JSON.stringify(existingAdmin.body));
    const {config}=await import("../src/config");
    const original=config.isProd;
    try { config.isProd=true; assert.equal(config.panelOpenAccess,false,"preview cannot enable open access in production"); }
    finally { config.isProd=original; }
  } finally { delete process.env.PANEL_OPEN_ACCESS; }
});

test("review mode opens the panel without a passcode, and only when asked to", async () => {
  try {
    process.env.PANEL_OPEN_ACCESS = "1";

    const me = (await (await fetch(`${base}/api/admin/me`)).json()) as Json;
    assert.equal(me.authenticated, true, "review mode reports the owner");
    assert.equal(me.openAccess, true, "and says so out loud");
    assert.ok(me.permissions.length > 20, "with the full permission set");

    // a write that normally needs a session now goes through
    const settings = (await (await fetch(`${base}/api/commerce/admin/settings`)).json()) as Json;
    const { token } = (await (await fetch(`${base}/api/csrf`)).json()) as { token: string };
    const write = await fetch(`${base}/api/commerce/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-csrf-token": token },
      body: JSON.stringify(settings),
    });
    assert.equal(write.status, 200, await write.clone().text());
  } finally {
    delete process.env.PANEL_OPEN_ACCESS;
  }

  // and with the flag gone the same request is refused again
  const closed = (await (await fetch(`${base}/api/admin/me`)).json()) as Json;
  assert.equal(closed.authenticated, false);
  assert.equal(closed.openAccess, false);
  const { token } = (await (await fetch(`${base}/api/csrf`)).json()) as { token: string };
  const refused = await fetch(`${base}/api/commerce/admin/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-csrf-token": token },
    body: JSON.stringify({ shippingFlat: 12 }),
  });
  assert.equal(refused.status, 401);
});

test("manual orders reserve and consume real stock once, then share shipment tracking", async () => {
  const admin = await adminClient();
  await setStock(SKU, 5);
  const inventory = await admin.get("/api/commerce/admin/inventory");
  assert.equal(inventory.status, 200, JSON.stringify(inventory.body));
  const variant = inventory.body.find((row: any) => row.sku === SKU);
  assert.equal(variant.sellable, 5);

  const body = {
    items: [{ variantId: variant.id, quantity: 2 }],
    customerEmail: "ava@example.com",
    address: { receiver: "آوا رادمهر", phone: "09121234567", province: "تهران", city: "تهران", street: "ولیعصر، پلاک ۱", postal: "1234567890" },
    shippingMethod: "standard",
    paymentReference: "BANK-12345",
    idempotencyKey: "manual-test-1",
  };
  const created = await admin.post("/api/commerce/admin/orders/manual", body);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.order.paymentStatus, "settled");
  assert.equal(created.body.order.lines[0].quantity, 2);
  assert.equal(created.body.legacy.manual, true);
  assert.equal((await stockOf(SKU)).onHand, 3);

  const repeated = await admin.post("/api/commerce/admin/orders/manual", body);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.order.id, created.body.order.id);
  assert.equal((await stockOf(SKU)).onHand, 3);

  const shipment = await admin.patch(`/api/commerce/admin/orders/${created.body.order.id}/shipment`, { tracking: "POST-9988", carrier: "پست" });
  assert.equal(shipment.status, 200, JSON.stringify(shipment.body));
  const order = await admin.get(`/api/commerce/orders/${created.body.order.id}`);
  assert.equal(order.body.tracking, "POST-9988");
  assert.equal(order.body.carrier, "پست");

  const customer = await customerClient();
  const forbidden = await customer.post("/api/commerce/admin/orders/manual", { ...body, idempotencyKey: "manual-test-2" });
  assert.equal(forbidden.status, 401);
});

test("refund for externally paid manual order never fabricates a provider reversal", async () => {
  const admin = await adminClient();
  const variantId = await setStock(SKU, 2);
  const created = await admin.post("/api/commerce/admin/orders/manual", {
    items: [{ variantId, quantity: 1 }], address: { receiver: "مشتری", phone: "09121234567", province: "تهران", city: "تهران", street: "نشانی", postal: "1234567890" },
    paymentReference: "bank-reference", idempotencyKey: "external-refund-test", shippingMethod: "standard",
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const order = created.body.order;
  const requested = await admin.post(`/api/commerce/orders/${order.id}/returns`, { lineId: order.lines[0].id, quantity: 1, kind: "refund" });
  assert.equal(requested.status, 201, JSON.stringify(requested.body));
  const superAdmin = await superAdminClient();
  await superAdmin.put("/api/commerce/admin/settings", { liveRefundsEnabled: true });
  const id = requested.body.refund.id;
  await superAdmin.post(`/api/commerce/admin/refunds/${id}`, { decision: "approve" });
  const result = await superAdmin.post(`/api/commerce/admin/refunds/${id}/settle`, {});
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.refund.status, "manual_review");
  assert.equal(result.body.refund.providerRef, null);
});

test("customer gallery requires consent and publishes only moderated images", async () => {
  const visitor = makeClient();
  const imageUrl = "data:image/png;base64,iVBORw0KGgo=";
  const refused = await visitor.post("/api/gallery", { handle: "آوا", imageUrl, consent: false });
  assert.equal(refused.status, 400);
  const submitted = await visitor.post("/api/gallery", { handle: "آوا", imageUrl, caption: "استایل پاییزی", consent: true });
  assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
  assert.deepEqual((await visitor.get("/api/gallery")).body, []);

  const admin = await adminClient();
  const queue = await admin.get("/api/admin/gallery");
  assert.equal(queue.status, 200);
  assert.equal(queue.body[0].status, "pending");
  const approved = await admin.patch(`/api/admin/gallery/${submitted.body.id}`, { status: "approved",expectedVersion:0 });
  assert.equal(approved.status, 200);
  const published = await visitor.get("/api/gallery");
  assert.equal(published.body.length, 1);
  assert.equal(published.body[0].handle, "آوا");
});

test("receiving is idempotent and changes stock only after approval", async () => {
  const variantId=await setStock(SKU,3); const admin=await adminClient(); const approver=await superAdminClient();
  const payload={operation:"receive",variantId,acceptedQty:4,rejectedQty:2,reference:"RCPT-23",note:"بازبینی",idempotencyKey:"warehouse-receipt-0001"};
  const [first,second]=await Promise.all([admin.post("/api/commerce/admin/inventory/operations",payload),admin.post("/api/commerce/admin/inventory/operations",payload)]);
  assert.equal(first.status,201,JSON.stringify(first.body));assert.equal(second.status,201,JSON.stringify(second.body));assert.equal(first.body.adjustment.id,second.body.adjustment.id);
  assert.equal((await stockOf(SKU)).onHand,3);
  assert.equal((await admin.post("/api/commerce/admin/inventory/operations",{...payload,acceptedQty:5})).status,409);
  const id=first.body.adjustment.id;
  const result=await admin.post(`/api/commerce/admin/inventory/adjustments/${id}`,{decision:"approve"});assert.equal(result.status,200,JSON.stringify(result.body));
  assert.equal((await stockOf(SKU)).onHand,7);
  assert.equal((await approver.post(`/api/commerce/admin/inventory/adjustments/${id}`,{decision:"approve"})).status,200);
  const rows=await query("select count(*)::int as n from inventory_movements where ref_id=$1",[id]);assert.equal(rows.rows[0].n,1);
  assert.match(result.body.adjustment.note,/ردشده: 2/);
});

test("stocktake requires a fresh baseline at both request and approval and protects reserved stock", async () => {
  const variantId=await setStock(SKU,5);const admin=await adminClient();const approver=await superAdminClient();
  const inventory=await admin.get("/api/commerce/admin/inventory");const v=inventory.body.find((x:any)=>x.id===variantId);assert.ok(v.stockVersion);
  const payload={operation:"stocktake",variantId,countedQty:4,expectedOnHand:5,expectedVersion:v.stockVersion,reference:"COUNT-1",note:"",idempotencyKey:"warehouse-stocktake-001"};
  const created=await admin.post("/api/commerce/admin/inventory/operations",payload);assert.equal(created.status,201,JSON.stringify(created.body));assert.equal(created.body.adjustment.countedOnHand,4);
  await query("update product_variants set on_hand=on_hand+1,updated_at=clock_timestamp() where id=$1",[variantId]);
  await query("update product_variants set on_hand=on_hand-1,updated_at=clock_timestamp() where id=$1",[variantId]);
  const decision=await approver.post(`/api/commerce/admin/inventory/adjustments/${created.body.adjustment.id}`,{decision:"approve"});
  assert.equal(decision.status,409);assert.equal(decision.body.code,"stale_stocktake");assert.equal((await stockOf(SKU)).onHand,5);
  const replay=await admin.post("/api/commerce/admin/inventory/operations",payload);assert.equal(replay.body.adjustment.id,created.body.adjustment.id);
  const stale=await admin.post("/api/commerce/admin/inventory/operations",{...payload,idempotencyKey:"warehouse-stocktake-002"});assert.equal(stale.body.code,"stale_stocktake");
  const v2=(await admin.get("/api/commerce/admin/inventory")).body.find((x:any)=>x.id===variantId);
  const zero=await admin.post("/api/commerce/admin/inventory/operations",{...payload,countedQty:5,expectedVersion:v2.stockVersion,idempotencyKey:"warehouse-stocktake-003"});assert.equal(zero.status,201);assert.equal(zero.body.adjustment.delta,0);
  assert.equal((await approver.post(`/api/commerce/admin/inventory/adjustments/${zero.body.adjustment.id}`,{decision:"approve"})).status,200);
  const shopper=makeClient();assert.equal((await startCheckout(shopper,[{variantId,quantity:4}])).status,201);
  const correction=await admin.post("/api/commerce/admin/inventory/operations",{operation:"adjust",variantId,delta:-2,reference:"ADJ-1",note:"مغایرت",idempotencyKey:"warehouse-adjustment-001"});assert.equal(correction.status,201);
  const blocked=await approver.post(`/api/commerce/admin/inventory/adjustments/${correction.body.adjustment.id}`,{decision:"approve"});assert.equal(blocked.status,409);assert.equal(blocked.body.code,"stock_committed");
  const rejected=await approver.post(`/api/commerce/admin/inventory/adjustments/${correction.body.adjustment.id}`,{decision:"reject",note:"نیاز به بررسی"});assert.equal(rejected.status,200);assert.match(rejected.body.adjustment.note,/مغایرت/);assert.equal(rejected.body.adjustment.decisionNote,"نیاز به بررسی");
});

test("quick tracking preserves the carrier and concurrent lifecycle actions cannot rewind a packed order", async () => {
  const variantId=await setStock(SKU,2); const shopper=makeClient();const {settled}=await payAndSettle(shopper,[{variantId,quantity:1}]);const admin=await adminClient();const path=`/api/commerce/admin/orders/${settled.orderId}/shipment`;
  assert.equal((await admin.patch(path,{tracking:"old",carrier:"Post"})).status,200);
  const saved=await admin.patch(path,{tracking:"new"});assert.equal(saved.status,200);assert.equal(saved.body.carrier,"Post");
  assert.equal((await admin.get(`/api/commerce/orders/${settled.orderId}`)).body.carrier,"Post");
  assert.equal((await admin.post(`/api/commerce/orders/${settled.orderId}/picking`,{sku:SKU,scanKey:randomUUID()})).status,200);
  assert.equal((await admin.post(`/api/commerce/orders/${settled.orderId}/packing`,{confirm:true})).status,200);
  const [ship,rewind]=await Promise.all([admin.post(`/api/commerce/orders/${settled.orderId}/ship`,{}),admin.post(`/api/commerce/orders/${settled.orderId}/picking`,{sku:SKU,scanKey:randomUUID()})]);
  assert.equal(ship.status,200);assert.equal(rewind.status,409);assert.equal((await admin.get(`/api/commerce/orders/${settled.orderId}`)).body.fulfillmentStatus,"shipped");
});

test("customer order and return history are owner-scoped, validated and never include staff notes", async () => {
  const variantId = await setStock(SKU, 5);
  const buyer = await customerClient();
  const { settled } = await payAndSettle(buyer, [{variantId, quantity:2}]);
  const orders = await buyer.get("/api/commerce/orders?limit=200");
  assert.equal(orders.status,200);
  const order = orders.body.find((o:Json)=>o.id===settled.orderId);
  assert.ok(order);
  assert.equal(order.paymentKind,"simulated");
  assert.equal((await makeClient().get("/api/commerce/returns")).status,401);
  const other = makeClient();
  const email = `returns-${Date.now()}@example.com`;
  const {hashPassword} = await import("../src/security");
  await query("insert into customers (email,name,password_hash,addresses) values ($1,$2,$3,'[]'::jsonb)",[email,"خریدار آزمون",hashPassword("demo1234")]);
  assert.equal((await other.post("/api/auth/login",{email,password:"demo1234"})).status,200);
  assert.equal((await other.get(`/api/commerce/orders/${order.id}`)).status,404);
  assert.equal((await other.post(`/api/commerce/orders/${order.id}/returns`,{lineId:order.lines[0].id,quantity:1,kind:"return"})).status,404);
  for (const quantity of [0, -1, 1.2, "1"]) {
    assert.equal((await buyer.post(`/api/commerce/orders/${order.id}/returns`,{lineId:order.lines[0].id,quantity,kind:"return"})).status,400);
  }
  assert.equal((await buyer.post(`/api/commerce/orders/${order.id}/returns`,{lineId:order.lines[0].id,quantity:1,reason:"x".repeat(501),kind:"return"})).status,400);
  const created = await buyer.post(`/api/commerce/orders/${order.id}/returns`,{lineId:order.lines[0].id,quantity:1,reason:"سایز",kind:"return"});
  assert.equal(created.status,201,JSON.stringify(created.body));
  await query("update refunds set note='private note', qc_note='private QC' where id=$1",[created.body.refund.id]);
  const history = await buyer.get("/api/commerce/returns");
  assert.equal(history.status,200,JSON.stringify(history.body));
  const historyHeaders = await fetch(`${base}/api/commerce/returns`,{headers:{cookie:buyer.cookie()}});
  assert.match(historyHeaders.headers.get("cache-control") ?? "",/no-store/);
  await historyHeaders.text();
  assert.equal(history.body.length,1);
  assert.equal(history.body[0].orderId,order.id);
  assert.equal(history.body[0].status,"requested");
  assert.equal(history.body[0].kind,"return");
  assert.equal(history.body[0].quantity,1);
  assert.ok(!JSON.stringify(history.body).includes("private"));
  assert.deepEqual((await other.get("/api/commerce/orders")).body,[]);
  assert.deepEqual((await other.get("/api/commerce/returns")).body,[]);
  const tooMany = await buyer.post(`/api/commerce/orders/${order.id}/returns`,{lineId:order.lines[0].id,quantity:2,kind:"return"});
  assert.equal(tooMany.status,409);
});

test("customer pagination covers old history, stable ties, privacy and owned cursors",async()=>{
  const buyer=await customerClient(),guest=makeClient(),other=makeClient(),admin=await adminClient();
  const {hashPassword}=await import('../src/security');const email='customer-pages-other@example.com';
  await query("insert into customers(email,name,password_hash,addresses) values ($1,'Other',$2,'[]'::jsonb) on conflict(email) do update set password_hash=excluded.password_hash",[email,hashPassword('demo1234')]);
  assert.equal((await other.post('/api/auth/login',{email,password:'demo1234'})).status,200);
  await query(`insert into orders(id,created_at,email,status,total,data,exception_reason,fulfillment_status)
    select 'cust-page-'||lpad(n::text,4,'0'), '2099-01-01 00:00:00.123456+00'::timestamptz,'ava@example.com','paid',10,'{"externalPaymentRef":"PRIVATE-REF"}'::jsonb,'PRIVATE-REASON','unfulfilled' from generate_series(1,215) n`);
  await query(`insert into orders(id,created_at,email,status,total,data) values ('cust-page-other','2099-01-01','customer-pages-other@example.com','paid',10,'{}')`);
  await query(`insert into order_lines(id,order_id,name_snapshot,quantity,unit_price,line_total)
    select 'cust-line-'||lpad(n::text,4,'0'),'cust-page-'||lpad(n::text,4,'0'),'Fixture item',2,5,10 from generate_series(1,215) n`);
  await query(`insert into order_lines(id,order_id,name_snapshot,quantity,unit_price,line_total) values ('cust-line-other','cust-page-other','Other item',1,10,10)`);
  await query(`insert into refunds(id,order_id,order_line_id,quantity,amount,status,kind,note,qc_note,created_at)
    select 'cust-refund-'||lpad(n::text,4,'0'),'cust-page-'||lpad(n::text,4,'0'),'cust-line-'||lpad(n::text,4,'0'),1,5,'requested','return','PRIVATE-NOTE','PRIVATE-QC','2099-01-01 00:00:00.123456+00'::timestamptz from generate_series(1,215) n`);
  await query(`insert into refunds(id,order_id,order_line_id,quantity,amount,status,kind,created_at) values ('cust-refund-other','cust-page-other','cust-line-other',1,10,'requested','return','2099-01-01')`);
  for(const [path,prefix] of [['/api/commerce/customer/order-page','cust-page-'],['/api/commerce/customer/return-page','cust-refund-']]){
    assert.equal((await guest.get(path)).status,401);assert.equal((await admin.get(path)).status,401);
    assert.equal((await buyer.get(path+'?limit=0')).status,422);assert.equal((await buyer.get(path+'?limit=101')).status,422);
    assert.equal((await buyer.get(path+'?before=missing')).status,422);assert.equal((await buyer.get(path+'?before='+prefix+'other')).status,422);
    const headers=await fetch(base+path,{headers:{cookie:buyer.cookie()}});assert.match(headers.headers.get('cache-control')??'',/private, no-store/);await headers.text();
    let cursor='';const seen:string[]=[];do{const result=await buyer.get(path+'?limit=40'+(cursor?'&before='+encodeURIComponent(cursor):''));assert.equal(result.status,200,JSON.stringify(result.body));assert(!JSON.stringify(result.body).includes('PRIVATE-'));seen.push(...result.body.items.map((x:Json)=>x.id));cursor=result.body.nextCursor??'';}while(cursor);
    assert.equal(seen.length,215);assert.equal(new Set(seen).size,215);assert.equal(seen[0],prefix+'0215');assert.equal(seen[214],prefix+'0001');
    const noLeak=await other.get(path);assert.equal(noLeak.body.items.length,1);assert.equal(noLeak.body.items[0].id,prefix+'other');
  }
  const detail=await buyer.get('/api/commerce/customer/orders/cust-page-0001');assert.equal(detail.status,200);assert.equal(detail.body.lines[0].id,'cust-line-0001');assert(!JSON.stringify(detail.body).includes('PRIVATE-'));
  assert.equal((await other.get('/api/commerce/customer/orders/cust-page-0001')).status,404);assert.equal((await guest.get('/api/commerce/customer/orders/cust-page-0001')).status,401);
  await query("delete from orders where id='cust-page-0040'");assert.equal((await buyer.get('/api/commerce/customer/order-page?before=cust-page-0040')).status,422);assert.equal((await buyer.get('/api/commerce/customer/return-page?before=cust-refund-0040')).status,422);
});

test("customer addresses and profile changes are confirmed, isolated and conflict-safe", async () => {
  const {hashPassword} = await import("../src/security");
  const email=`account-address-${Date.now()}@example.com`;
  await query("insert into customers (email,name,phone,password_hash,addresses) values ($1,$2,$3,$4,'[]'::jsonb)",[email,"آزمون","09120000000",hashPassword("old-pass-123")]);
  const one=makeClient(), two=makeClient(), stranger=makeClient();
  assert.equal((await one.post("/api/auth/login",{email,password:"old-pass-123"})).status,200);
  assert.equal((await two.post("/api/auth/login",{email,password:"old-pass-123"})).status,200);
  const address=(id:string)=>({id,label:id,receiver:"گیرنده",phone:"09120000000",province:"تهران",city:"تهران",street:"نشانی",postal:"1234567890",default:true});
  assert.equal((await stranger.put("/api/auth/addresses",{expected:[],addresses:[address("x")]})).status,401);
  for (const body of [{password:"new-password"},{addresses:[address("x")]},{twoFactor:true},{phone:"09123456789"}]) assert.equal((await one.patch("/api/auth/profile",body)).status,400);
  assert.equal((await one.put("/api/auth/addresses",{expected:[],addresses:[{...address("x"),street:""}]})).status,400);
  assert.equal((await one.put("/api/auth/addresses",{expected:[],addresses:[{...address("x"),default:false}]})).status,400);
  assert.equal((await one.put("/api/auth/addresses",{expected:[],addresses:[address("x"),address("x")]})).status,400);
  const [first,second] = await Promise.all([
    one.put("/api/auth/addresses",{expected:[],addresses:[address("first")]}),
    two.put("/api/auth/addresses",{expected:[],addresses:[address("second")]}),
  ]);
  assert.deepEqual([first.status,second.status].sort(),[200,409]);
  const stored = (await one.get("/api/auth/me")).body.customer.addresses;
  assert.equal(stored.length,1);
  const original=stored[0];
  const addition={...address("another"),default:false};
  assert.equal((await one.put("/api/auth/addresses",{expected:stored,addresses:[original,addition]})).status,200);
  assert.equal((await two.put("/api/auth/addresses",{expected:stored,addresses:[]})).status,409,"stale deletion cannot erase a newer address");
  assert.equal((await two.get("/api/auth/me")).body.customer.addresses.length,2);
  assert.equal((await one.patch("/api/auth/profile",{phone:"09121111111",expectedPhone:"09120000000"})).status,200);
  assert.equal((await two.patch("/api/auth/profile",{phone:"09122222222",expectedPhone:"09120000000"})).status,409);
  const row=await query("select phone,addresses from customers where email=$1",[email]);
  assert.equal(row.rows[0].phone,"09121111111");assert.equal(row.rows[0].addresses.length,2);
});

test("password change requires current password and revokes other sessions without a legacy bypass", async () => {
  const {hashPassword,verifyPassword} = await import("../src/security");
  const email=`account-password-${Date.now()}@example.com`;
  await query("insert into customers (email,name,password_hash,addresses) values ($1,$2,$3,'[]'::jsonb)",[email,"آزمون",hashPassword("old-pass-123")]);
  const current=makeClient(),other=makeClient(),racing=makeClient();
  for (const client of [current,other]) assert.equal((await client.post("/api/auth/login",{email,password:"old-pass-123"})).status,200);
  assert.equal((await current.patch("/api/auth/profile",{password:"new-password-123"})).status,400);
  assert.equal((await current.post("/api/auth/password",{currentPassword:"incorrect",newPassword:"new-password-123"})).status,403);
  assert.equal((await current.post("/api/auth/password",{currentPassword:"old-pass-123",newPassword:"short"})).status,400);
  const [changed,login] = await Promise.all([
    current.post("/api/auth/password",{currentPassword:"old-pass-123",newPassword:"new-password-123"}),
    racing.post("/api/auth/login",{email,password:"old-pass-123"}),
  ]);
  assert.equal(changed.status,200,JSON.stringify(changed.body));
  assert.equal((await current.get("/api/auth/me")).body.customer.email,email);
  assert.equal((await other.get("/api/auth/me")).body.customer,null);
  assert.equal((await racing.get("/api/auth/me")).body.customer,null,`racing old-password login status ${login.status}`);
  assert.equal((await other.put("/api/auth/addresses",{expected:[],addresses:[]})).status,401);
  assert.equal((await makeClient().post("/api/auth/login",{email,password:"old-pass-123"})).status,401);
  assert.equal((await makeClient().post("/api/auth/login",{email,password:"new-password-123"})).status,200);
  const saved=(await query("select password_hash from customers where email=$1",[email])).rows[0].password_hash;
  assert.equal(verifyPassword("new-password-123",saved),true);assert.ok(!saved.includes("new-password-123"));
  const audit=await query("select before,after,reason from audit_events where action='customer.password_changed' and target_id=$1",[email]);
  assert.equal(audit.rows.length,1);assert.ok(!JSON.stringify(audit.rows).includes("password-123"));
});


test("unit scans are serialized, retry-safe and required before packing", async () => {
  const variantId=await setStock(SKU,4); const shopper=makeClient();
  const {settled}=await payAndSettle(shopper,[{variantId,quantity:2}]); const admin=await adminClient();
  const path=`/api/commerce/orders/${settled.orderId}`;
  assert.equal((await admin.post(`${path}/picking`,{sku:SKU})).body.code,"scan_key_required");
  const firstKey=randomUUID(); const first=await admin.post(`${path}/picking`,{sku:SKU,scanKey:firstKey});
  assert.equal(first.status,200);assert.equal(first.body.order.lines[0].pickedQuantity,1);
  assert.equal((await admin.post(`${path}/picking`,{sku:SKU,scanKey:firstKey})).body.unchanged,true);
  assert.equal((await admin.post(`${path}/picking`,{sku:"OTHER",scanKey:firstKey})).body.code,"scan_key_conflict");
  assert.equal((await admin.post(`${path}/packing`,{confirm:true})).body.code,"picking_incomplete");
  const [a,b]=await Promise.all([admin.post(`${path}/picking`,{sku:SKU,scanKey:randomUUID()}),admin.post(`${path}/picking`,{sku:SKU,scanKey:randomUUID()})]);
  assert.deepEqual([a.status,b.status].sort(),[200,409]);
  assert.equal((await admin.get(path)).body.lines[0].pickedQuantity,2);
  assert.equal((await admin.post(`${path}/picking`,{sku:SKU,scanKey:randomUUID(),undo:true})).body.order.lines[0].pickedQuantity,1);
  assert.equal((await admin.post(`${path}/packing`,{confirm:true})).body.code,"picking_incomplete");
  assert.equal((await admin.post(`${path}/picking`,{sku:SKU,scanKey:randomUUID()})).status,200);
  assert.equal((await admin.post(`${path}/packing`,{confirm:true})).status,200);
  assert.equal((await admin.post(`${path}/picking`,{sku:SKU,scanKey:firstKey})).body.unchanged,true);
});

test("legacy picking events require a fresh scan for every SKU", async () => {
  const a=await setStock(SKU,3), b=await setStock(SKU2,3);const shopper=makeClient();
  const {settled}=await payAndSettle(shopper,[{variantId:a,quantity:2},{variantId:b,quantity:1}]);
  const admin=await adminClient(),path=`/api/commerce/orders/${settled.orderId}`;
  await query("update orders set status='preparing',fulfillment_status='picking' where id=$1",[settled.orderId]);
  await query("insert into fulfillment_events(order_id,stage,sku,accepted) values($1,'picking',$2,true)",[settled.orderId,SKU]);
  let order=(await admin.get(path)).body;
  assert.ok(order.lines.every((line:{pickedQuantity:number})=>line.pickedQuantity===0));
  assert.equal((await admin.post(`${path}/packing`,{confirm:true})).body.code,"picking_incomplete");
  for(const sku of [SKU,SKU,SKU2]) assert.equal((await admin.post(`${path}/picking`,{sku,scanKey:randomUUID()})).status,200);
  order=(await admin.get(path)).body;
  assert.ok(order.lines.every((line:{pickedQuantity:number;quantity:number})=>line.pickedQuantity===line.quantity));
  assert.equal((await admin.post(`${path}/packing`,{confirm:true})).status,200);
});

test("customer labels support manual optimistic updates, live automatic rules and any/all audiences", async () => {
  await query("delete from commerce_settings where key='customer_labels_v1'");
  await query("update customers set manual_labels=null where email='ava@example.com'");
  const admin=await adminClient(),guest=makeClient();
  assert.equal((await guest.get('/api/admin/customer-labels')).status,401);
  const manual=await admin.post('/api/admin/customer-labels',{name:'برچسب دستی',minDeliveredOrders:null});assert.equal(manual.status,201,JSON.stringify(manual.body));
  const auto=await admin.post('/api/admin/customer-labels',{name:'خودکار',minDeliveredOrders:1});assert.equal(auto.status,201,JSON.stringify(auto.body));
  const mid=manual.body.label.id,aid=auto.body.label.id;
  const {labelsForCustomer}=await import('../src/routes/customer-labels');
  assert.deepEqual(await labelsForCustomer(null),[]);
  assert.deepEqual(await labelsForCustomer('no-such-customer@example.com'),[]);
  const modified=await admin.patch(`/api/admin/customer-labels/${aid}`,{name:'خودکار',minDeliveredOrders:2,expected:auto.body.label});assert.equal(modified.status,200);
  assert.equal((await admin.patch(`/api/admin/customer-labels/${aid}`,{name:'خودکار',minDeliveredOrders:1,expected:auto.body.label})).body.code,'label_conflict');
  assert.equal((await admin.patch(`/api/admin/customer-labels/${aid}`,{name:'خودکار',minDeliveredOrders:1,expected:modified.body.label})).status,200);
  assert.equal((await admin.post('/api/admin/customer-labels',{name:'خودکار'})).status,409);
  assert.equal((await admin.post('/api/admin/customer-labels',{name:'خراب',minDeliveredOrders:0})).status,422);
  const path='/api/admin/customers/ava%40example.com/labels';
  const [a,b]=await Promise.all([admin.put(path,{labels:[mid],expected:[]}),admin.put(path,{labels:[aid],expected:[]})]);
  assert.deepEqual([a.status,b.status].sort(),[200,409]);
  let customer=(await admin.get('/api/admin/customer-labels')).body.customers.find((c:any)=>c.email==='ava@example.com');
  const old=customer.manualLabels;assert.equal(old.length,1);
  assert.equal((await admin.put(path,{labels:[mid],expected:old})).status,200);
  assert.equal((await admin.post('/api/admin/customer-labels/audience',{labels:[mid,aid],mode:'all'})).body.count,0);
  const variantId=await setStock(SKU,3);const buyer=await customerClient();const {settled}=await payAndSettle(buyer,[{variantId,quantity:2}]);
  await deliverOrder(settled.orderId,SKU);
  customer=(await admin.get('/api/admin/customer-labels')).body.customers.find((c:any)=>c.email==='ava@example.com');
  assert.equal(customer.deliveredOrders,0,"simulated payments never grant loyalty");
  await query("update orders set data=data || '{\"manual\":true}'::jsonb where id=$1",[settled.orderId]);
  customer=(await admin.get('/api/admin/customer-labels')).body.customers.find((c:any)=>c.email==='ava@example.com');
  assert.equal(customer.deliveredOrders,1);assert.deepEqual(customer.manualLabels,[mid]);assert.deepEqual(customer.automaticLabels,[aid]);
  assert.deepEqual(new Set(await labelsForCustomer('AVA@EXAMPLE.COM')),new Set([mid,aid]));
  const all=await admin.post('/api/admin/customer-labels/audience',{labels:[mid,aid],mode:'all'});assert.ok(all.body.customers.some((c:any)=>c.email==='ava@example.com'));
  assert.equal((await admin.put(path,{labels:[],expected:[mid]})).status,200);
  const any=await admin.post('/api/admin/customer-labels/audience',{labels:[mid,aid],mode:'any'});assert.ok(any.body.customers.some((c:any)=>c.email==='ava@example.com'));
  assert.equal((await admin.post('/api/admin/customer-labels/audience',{labels:[mid,aid],mode:'all'})).body.count,0);
  await query("update order_lines set refunded_quantity=1 where order_id=$1",[settled.orderId]);
  customer=(await admin.get('/api/admin/customer-labels')).body.customers.find((c:any)=>c.email==='ava@example.com');assert.equal(customer.deliveredOrders,1,"partial refunds retain loyalty count");
  await query("update order_lines set refunded_quantity=quantity where order_id=$1",[settled.orderId]);
  customer=(await admin.get('/api/admin/customer-labels')).body.customers.find((c:any)=>c.email==='ava@example.com');assert.equal(customer.deliveredOrders,0,"fully refunded orders do not qualify");
  assert.deepEqual(await labelsForCustomer('ava@example.com'),[]);
  assert.equal((await admin.put(path,{labels:[`lbl-${randomUUID()}`],expected:[]})).status,422);
  assert.ok((await query("select id from audit_events where action='customer.labels_updated' and target_id='ava@example.com'")).rows.length>=2);
  await query("delete from commerce_settings where key='customer_labels_v1'");
  await query("update customers set manual_labels=null where email='ava@example.com'");
});

test("best single whole-order discount beats priority and free shipping remains separate", async () => {
  const a=await setStock(SKU,5),b=await setStock(SKU2,5);const client=makeClient();
  await query(`insert into price_rules(id,name,kind,value,scope,priority,active,max_discount) values
   ('priority','اولویت','amount',1,'all',100,true,null),('better','بهتر','percent',20,'all',1,true,150),('ship','ارسال','freeship',0,'all',0,true,null)`);
  await query(`insert into coupons(code,kind,value,min_subtotal,active,combinable,usage_limit,used_count) values ('SMALL','amount',1,0,true,false,1,0)
    on conflict(code) do update set kind='amount',value=1,min_subtotal=0,active=true,usage_limit=1,used_count=0`);
  const {checkout,settled}=await payAndSettle(client,[{variantId:a,quantity:1},{variantId:b,quantity:1}],"online",{couponCode:'SMALL'});
  const q=checkout.quote;assert.equal(q.discounts.length,1);assert.equal(q.discounts[0].id,'better');
  assert.equal(q.couponDiscount,0);assert.equal(q.campaignDiscount,150);assert.equal(q.freeShipping,true);assert.equal(q.shippingTotal,0);
  assert.equal(Math.round(q.lines.reduce((sum:number,l:any)=>sum+l.discountAmount,0)*100),15000);
  assert.equal(Math.round(q.lines.reduce((sum:number,l:any)=>sum+l.lineTotal,0)*100),Math.round((q.subtotal-150)*100));
  assert.equal(Number((await query("select used_count from coupons where code='SMALL'")).rows[0].used_count),0);
  const order=await (await adminClient()).get(`/api/commerce/orders/${settled.orderId}`);assert.equal(order.body.coupon,null);
});

test("winning coupon is allocated to refund line snapshots and coupon changes invalidate quotes", async () => {
  const a=await setStock(SKU,5),b=await setStock(SKU2,5);const client=makeClient();
  await query(`insert into price_rules(id,name,kind,value,scope,priority,active) values ('smaller','کوچک','amount',1,'all',100,true)`);
  await query(`insert into coupons(code,kind,value,min_subtotal,max_discount,active,combinable,usage_limit,used_count) values ('BEST','percent',30,0,125,true,false,2,0)
    on conflict(code) do update set kind='percent',value=30,min_subtotal=0,max_discount=125,active=true,usage_limit=2,used_count=0`);
  const started=await startCheckout(client,[{variantId:a,quantity:1},{variantId:b,quantity:1}],{couponCode:'BEST'});
  const q=started.body.checkout.quote;assert.equal(q.couponDiscount,125);assert.equal(q.campaignDiscount,0);assert.equal(q.discounts.length,1);
  assert.equal(Math.round(q.lines.reduce((sum:number,l:any)=>sum+l.discountAmount,0)*100),12500);
  await query("update coupons set max_discount=100 where code='BEST'");
  const path=`/api/commerce/checkout/${started.body.checkout.id}/pay`;
  const stale=await client.post(path,{method:'online'});assert.equal(stale.status,409);assert.equal(stale.body.code,'quote_stale');
  const paid=await client.post(path,{method:'online'});assert.equal(paid.status,200,JSON.stringify(paid.body));
  const done=await client.post(`/api/commerce/payments/${paid.body.attempt.id}/simulate`,{result:'success'});assert.equal(done.body.status,'settled');
  assert.equal(Number((await query("select used_count from coupons where code='BEST'")).rows[0].used_count),1);
  const order=(await (await adminClient()).get(`/api/commerce/orders/${done.body.orderId}`)).body;
  assert.equal(order.coupon,'BEST');assert.equal(Math.round(order.lines.reduce((sum:number,l:any)=>sum+l.lineTotal,0)*100),Math.round((q.subtotal-100)*100));
});

test("manual order consumes only a winning coupon exactly once", async () => {
  const admin=await adminClient(),variantId=await setStock(SKU,4);
  await query(`insert into coupons(code,kind,value,min_subtotal,active,usage_limit,used_count) values ('MANUALBEST','amount',20,0,true,2,0)
     on conflict(code) do update set kind='amount',value=20,min_subtotal=0,active=true,usage_limit=2,used_count=0`);
  const body={items:[{variantId,quantity:1}],customerEmail:'ava@example.com',address:{receiver:'مشتری',phone:'09121234567',street:'نشانی',city:'تهران'},paymentReference:'bank-reference',idempotencyKey:'manual-best-discount',couponCode:'MANUALBEST'};
  const first=await admin.post('/api/commerce/admin/orders/manual',body);assert.equal(first.status,201,JSON.stringify(first.body));
  assert.equal(first.body.order.coupon,'MANUALBEST');assert.equal((await admin.post('/api/commerce/admin/orders/manual',body)).status,200);
  assert.equal(Number((await query("select used_count from coupons where code='MANUALBEST'")).rows[0].used_count),1);
});

test("partial refund requests cannot exceed a discounted line after rounding", async () => {
  const variantId=await setStock(SKU,5), shopper=makeClient();
  const product=(await query("select product_id from product_variants where id=$1",[variantId])).rows[0].product_id;
  const original=(await query("select price from products where id=$1",[product])).rows[0].price;
  try {
    await query("update products set price=1 where id=$1",[product]);
    await query(`insert into coupons(code,kind,value,min_subtotal,active,used_count) values ('ROUNDING','amount',1,0,true,0)
      on conflict(code) do update set kind='amount',value=1,min_subtotal=0,max_discount=null,active=true,usage_limit=null,used_count=0`);
    const {settled}=await payAndSettle(shopper,[{variantId,quantity:3}],"online",{couponCode:'ROUNDING'});
    const admin=await adminClient();const order=(await admin.get(`/api/commerce/orders/${settled.orderId}`)).body;assert.equal(order.lines[0].lineTotal,2);
    const path=`/api/commerce/orders/${settled.orderId}/returns`;
    const results=await Promise.all([0,1,2].map(()=>admin.post(path,{lineId:order.lines[0].id,quantity:1,kind:'refund'})));
    assert.ok(results.every(r=>r.status===201),JSON.stringify(results));
    assert.equal(Math.round(results.reduce((n,r)=>n+Number(r.body.refund.amount),0)*100),200);
    assert.deepEqual(results.map(r=>Number(r.body.refund.amount)).sort(),[0.66,0.67,0.67]);
  } finally {await query("update products set price=$2 where id=$1",[product,original]);}
});

test("one monetary campaign can also grant shipping even when a coupon wins", async () => {
  const variantId=await setStock(SKU,4),client=makeClient();
  await query(`insert into price_rules(id,name,kind,value,scope,priority,active,free_shipping) values
    ('both','تخفیف و ارسال','amount',1,'all',0,true,true)`);
  await query(`insert into coupons(code,kind,value,min_subtotal,active,used_count) values ('SHIPBEST','amount',10,0,true,0)
    on conflict(code) do update set kind='amount',value=10,min_subtotal=0,max_discount=null,active=true,usage_limit=null,used_count=0`);
  const preview=await client.post('/api/commerce/quote',{items:[{variantId,quantity:1}],couponCode:'SHIPBEST'});
  assert.equal(preview.status,200,JSON.stringify(preview.body));
  assert.equal(preview.body.couponDiscount,10);assert.equal(preview.body.campaignDiscount,0);
  assert.equal(preview.body.freeShippingBy,'campaign');assert.equal(preview.body.shippingTotal,0);
  const begun=await startCheckout(client,[{variantId,quantity:1}],{couponCode:'SHIPBEST'});
  await query("update price_rules set free_shipping=false,updated_at=now() where id='both'");
  const stale=await client.post(`/api/commerce/checkout/${begun.body.checkout.id}/pay`,{method:'online'});
  assert.equal(stale.status,409);assert.equal(stale.body.code,'quote_stale');
});

test("an initiated payment settles its frozen quote after checkout is re-quoted", async () => {
  const variantId=await setStock(SKU,4),client=makeClient();
  await query(`insert into coupons(code,kind,value,min_subtotal,active,used_count) values ('REQUOTE','amount',30,0,true,0)
    on conflict(code) do update set kind='amount',value=30,min_subtotal=0,max_discount=null,active=true,usage_limit=null,used_count=0`);
  const started=await startCheckout(client,[{variantId,quantity:1}]);assert.equal(started.status,201);
  const checkout=started.body.checkout,original=checkout.quote;
  const pay=await client.post(`/api/commerce/checkout/${checkout.id}/pay`,{method:'online'});assert.equal(pay.status,200,JSON.stringify(pay.body));
  const reprice=await client.post(`/api/commerce/checkout/${checkout.id}/quote`,{couponCode:'REQUOTE'});
  assert.equal(reprice.status,200,JSON.stringify(reprice.body));assert.equal(reprice.body.quote.couponDiscount,30);
  const done=await client.post(`/api/commerce/payments/${pay.body.attempt.id}/simulate`,{result:'success'});
  assert.equal(done.status,200,JSON.stringify(done.body));assert.equal(done.body.orderStatus,'paid');
  const order=(await (await adminClient()).get(`/api/commerce/orders/${done.body.orderId}`)).body;
  assert.equal(order.total,original.grandTotal);assert.equal(order.coupon,null);
  assert.equal(Number((await query("select used_count from coupons where code='REQUOTE'")).rows[0].used_count),0);
});

test("a pre-migration payment without frozen invoice settles only for financial review", async () => {
  const variantId=await setStock(SKU,2),client=makeClient();
  const started=await startCheckout(client,[{variantId,quantity:1}]);
  const pay=await client.post(`/api/commerce/checkout/${started.body.checkout.id}/pay`,{method:'online'});
  assert.equal(pay.status,200,JSON.stringify(pay.body));
  await query('update payment_attempts set quote_snapshot=null where id=$1',[pay.body.attempt.id]);
  const result=await client.post(`/api/commerce/payments/${pay.body.attempt.id}/simulate`,{result:'success'});
  assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.orderStatus,'exception');
  const order=(await (await adminClient()).get(`/api/commerce/orders/${result.body.orderId}`)).body;
  assert.match(order.exceptionReason,/صورتحساب منجمد/);
});

test("shared audience matching handles any, all, malformed and deleted labels", async () => {
  const {labelAudience,matchesLabelAudience}=await import('../src/commerce/audiences');
  const a=`lbl-${randomUUID()}`,b=`lbl-${randomUUID()}`;
  const any=labelAudience({labels:[a,b],mode:'any'}),all=labelAudience({labels:[a,b],mode:'all'});
  assert.equal(matchesLabelAudience(any,[a],[a,b]),true);
  assert.equal(matchesLabelAudience(all,[a],[a,b]),false);
  assert.equal(matchesLabelAudience(all,[a,b],[a,b]),true);
  assert.equal(matchesLabelAudience(any,[],[a,b]),false);
  assert.equal(matchesLabelAudience(any,[a],[a]),false,'orphan label must not widen an audience');
  for(const value of [{labels:[],mode:'all'},{labels:[a,a],mode:'any'},{labels:[a],mode:'bogus'},{labels:['foo'],mode:'any'},null]) assert.throws(()=>labelAudience(value));
});

test("a frozen invoice with inconsistent attempted amount requires financial review", async () => {
  const variantId=await setStock(SKU,2),client=makeClient();
  const started=await startCheckout(client,[{variantId,quantity:1}]);
  const pay=await client.post(`/api/commerce/checkout/${started.body.checkout.id}/pay`,{method:'online'});
  assert.equal(pay.status,200,JSON.stringify(pay.body));
  await query('update payment_attempts set amount=amount-1 where id=$1',[pay.body.attempt.id]);
  const result=await client.post(`/api/commerce/payments/${pay.body.attempt.id}/simulate`,{result:'success'});
  assert.equal(result.status,200,JSON.stringify(result.body));assert.equal(result.body.orderStatus,'exception');
});

test("two captured attempts for one checkout create one order and park the extra capture for review", async () => {
  const variantId=await setStock(SKU,3),client=makeClient();
  const started=await startCheckout(client,[{variantId,quantity:1}]);
  const id=started.body.checkout.id;
  const one=await client.post(`/api/commerce/checkout/${id}/pay`,{method:'online',idempotencyKey:'duplicate-capture-one'});
  const two=await client.post(`/api/commerce/checkout/${id}/pay`,{method:'online',idempotencyKey:'duplicate-capture-two'});
  assert.equal(one.status,200);assert.equal(two.status,200);
  const results=await Promise.all([one,two].map(p=>signedCallback(client,p.body.attempt.id,{result:'success'})));
  assert.deepEqual(results.map(r=>r.body.status).sort(),['exception','settled']);
  const extra=results.find(r=>r.body.status==='exception')!;
  assert.equal(extra.body.reason,'duplicate_checkout_capture');
  const orders=await query('select id from orders where checkout_id=$1',[id]);assert.equal(orders.rows.length,1);
  const attempts=await query('select id,status,last_error,order_id from payment_attempts where checkout_id=$1',[id]);
  assert.equal(attempts.rows.length,2);assert.equal(attempts.rows.filter(a=>a.status==='settled').length,1);
  const marked=attempts.rows.find(a=>a.status==='exception');assert.equal(marked.last_error,'duplicate_checkout_capture');assert.equal(marked.order_id,orders.rows[0].id);
  const events=await query('select * from outbox_events where dedupe_key=$1',[`payment.exception:${marked.id}`]);assert.equal(events.rows.length,1);
  const replay=await signedCallback(client,marked.id,{result:'success'});assert.equal(replay.body.status,'exception');assert.equal(replay.body.duplicate,true);
  assert.equal((await stockOf(SKU)).onHand,2);
  const admin=await adminClient(),adminPayments=await admin.get('/api/commerce/admin/payments?status=exception');
  assert.ok(adminPayments.body.some((a:Json)=>a.id===marked.id && a.lastError==='duplicate_checkout_capture'));
});

test("a failed or timed-out callback cannot downgrade a settled payment", async () => {
  const variantId=await setStock(SKU,3),client=makeClient();
  const started=await startCheckout(client,[{variantId,quantity:1}]);
  const pay=await client.post(`/api/commerce/checkout/${started.body.checkout.id}/pay`,{method:'online'});
  const [success,timeout,fail]=await Promise.all(['success','timeout','fail'].map(result=>signedCallback(client,pay.body.attempt.id,{result})));
  assert.equal(success.body.status,'settled',JSON.stringify(success.body));
  const final=(await query('select status,order_id from payment_attempts where id=$1',[pay.body.attempt.id])).rows[0];
  assert.equal(final.status,'settled');assert.ok(final.order_id);
  assert.equal((await query('select id from orders where checkout_id=$1',[started.body.checkout.id])).rows.length,1);
  assert.ok(timeout.status===200 && fail.status===200);
});

test('payment idempotency never re-initiates an existing or uncertain provider request', async () => {
  const {mockProvider}=await import('../src/commerce/payments');
  const original=mockProvider.initiate;let calls=0;
  mockProvider.initiate=async attempt=>{calls++;return original(attempt)};
  try {
    const variantId=await setStock(SKU,2),client=makeClient();
    const started=await startCheckout(client,[{variantId,quantity:1}]),id=started.body.checkout.id;
    const body={method:'online',idempotencyKey:'same-provider-reference'};
    const first=await client.post(`/api/commerce/checkout/${id}/pay`,body),again=await client.post(`/api/commerce/checkout/${id}/pay`,body);
    assert.equal(first.status,200);assert.equal(again.status,200);assert.equal(calls,1);assert.equal(again.body.reused,true);
    await query('update payment_attempts set provider_ref=null where id=$1',[first.body.attempt.id]);
    const uncertain=await client.post(`/api/commerce/checkout/${id}/pay`,body);
    assert.equal(uncertain.status,409);assert.equal(uncertain.body.code,'payment_initiation_unconfirmed');assert.equal(calls,1);
  } finally { mockProvider.initiate=original; }
});

test('provider initiation timeout creates a review item and retry does not contact provider again', async () => {
  const {mockProvider}=await import('../src/commerce/payments');const original=mockProvider.initiate;let calls=0;
  mockProvider.initiate=async ()=>{calls++;throw new Error('timeout after remote creation')};
  try {
    const variantId=await setStock(SKU,2),client=makeClient();const started=await startCheckout(client,[{variantId,quantity:1}]);
    const path=`/api/commerce/checkout/${started.body.checkout.id}/pay`,body={method:'online',idempotencyKey:'unknown-provider-init'};
    const first=await client.post(path,body),retry=await client.post(path,body);
    assert.equal(first.body.code,'payment_initiation_unconfirmed');assert.equal(retry.body.code,'payment_initiation_unconfirmed');assert.equal(calls,1);
    const newKey=await client.post(path,{method:'online',idempotencyKey:'different-key-uncertain'});
    assert.equal(newKey.body.code,'payment_initiation_unconfirmed');assert.equal(calls,1);
    const attempt=(await query('select * from payment_attempts where idempotency_key=$1',[body.idempotencyKey])).rows[0];
    assert.equal(attempt.status,'exception');assert.equal(attempt.last_error,'payment_initiation_unconfirmed');
    assert.equal((await query('select id from outbox_events where dedupe_key=$1',[`payment.exception:${attempt.id}`])).rows.length,1);
    assert.equal((await query('select count(*)::int n from orders where checkout_id=$1',[started.body.checkout.id])).rows[0].n,0);
  } finally {mockProvider.initiate=original}
});

test('concurrent cancellation and successful payment never overwrite a completed checkout', async () => {
  const variantId=await setStock(SKU,2),client=makeClient();const started=await startCheckout(client,[{variantId,quantity:1}]);
  const checkoutId=started.body.checkout.id,pay=await client.post(`/api/commerce/checkout/${checkoutId}/pay`,{method:'online'});
  const [cancel,payment]=await Promise.all([
    client.post(`/api/commerce/checkout/${checkoutId}/cancel`,{}),
    client.post(`/api/commerce/payments/${pay.body.attempt.id}/simulate`,{result:'success'}),
  ]);
  assert.equal(payment.body.status,'settled',JSON.stringify(payment.body));
  assert.ok([200,409].includes(cancel.status));
  const checkout=(await query('select status from checkout_sessions where id=$1',[checkoutId])).rows[0];
  const order=(await query('select status from orders where checkout_id=$1',[checkoutId])).rows[0];
  assert.ok(order);assert.equal(checkout.status,order.status==='exception'?'exception':'completed');
});

test('concurrent re-quotes cannot overwrite one another using stale checkout state', async () => {
  const {getPool}=await import('../src/db');const variantId=await setStock(SKU,2),client=makeClient();
  await query(`insert into coupons(code,kind,value,min_subtotal,active,used_count) values ('RACEQUOTE','amount',17,0,true,0)
    on conflict(code) do update set kind='amount',value=17,min_subtotal=0,max_discount=null,active=true,usage_limit=null,used_count=0`);
  const started=await startCheckout(client,[{variantId,quantity:1}]),id=started.body.checkout.id;
  const blocker=await getPool().connect();await blocker.query('begin');await blocker.query('select id from checkout_sessions where id=$1 for update',[id]);
  try {
    const requests=[client.post(`/api/commerce/checkout/${id}/quote`,{shippingMethod:'express'}),client.post(`/api/commerce/checkout/${id}/quote`,{couponCode:'RACEQUOTE'})];
    let waiting=0;
    for(let i=0;i<100;i++){await blocker.query("select pg_stat_clear_snapshot()");const rows=await blocker.query("select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query ilike '%update checkout_sessions set quote = %'");waiting=rows.rows[0].n;if(waiting>=2)break;await new Promise(r=>setTimeout(r,20));}
    assert.ok(waiting>=2,'both re-quotes must wait on the held checkout row');
    await blocker.query('commit');
    const results=await Promise.all(requests);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    assert.equal(results.find(r=>r.status===409)?.body.code,'checkout_changed');
    const winner=results.find(r=>r.status===200)!.body;
    const stored=(await query('select quote,shipping_method,coupon_code from checkout_sessions where id=$1',[id])).rows[0];
    assert.equal(stored.quote.quoteVersion,winner.quote.quoteVersion);assert.equal(stored.shipping_method,winner.shippingMethod);
  } finally {await blocker.query('rollback').catch(()=>{});blocker.release()}
});

test('payment creation and re-quote serialize against the checkout snapshot', async () => {
  const {getPool}=await import('../src/db');const variantId=await setStock(SKU,2),client=makeClient();
  const started=await startCheckout(client,[{variantId,quantity:1}]),id=started.body.checkout.id,original=started.body.checkout.quote;
  const blocker=await getPool().connect();await blocker.query('begin');await blocker.query('select id from checkout_sessions where id=$1 for update',[id]);
  try {
    const requests=[client.post(`/api/commerce/checkout/${id}/pay`,{method:'online'}),client.post(`/api/commerce/checkout/${id}/quote`,{shippingMethod:'express'})];
    let waiting=0;
    for(let i=0;i<100;i++){await blocker.query("select pg_stat_clear_snapshot()");const rows=await blocker.query("select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and (query ilike '%update checkout_sessions set quote = %' or query ilike '%select * from checkout_sessions where id=%for update%')");waiting=rows.rows[0].n;if(waiting>=2)break;await new Promise(r=>setTimeout(r,20));}
    assert.ok(waiting>=2,'both operations must wait on the checkout lock');await blocker.query('commit');
    const [pay,requote]=await Promise.all(requests);assert.equal(requote.status,200,JSON.stringify(requote.body));
    assert.ok([200,409].includes(pay.status),JSON.stringify(pay.body));
    if(pay.status===200){const attempt=(await query('select quote_snapshot from payment_attempts where id=$1',[pay.body.attempt.id])).rows[0];assert.equal(attempt.quote_snapshot.quoteVersion,original.quoteVersion)}
    else assert.equal(pay.body.code,'checkout_changed');
  } finally {await blocker.query('rollback').catch(()=>{});blocker.release()}
});

test('manual orders reject stale prices and permit a safe anonymous retry', async () => {
  const {startCheckout:reserve}=await import('../src/commerce/checkout');const variantId=await setStock(SKU,4),admin=await adminClient();
  const body={items:[{variantId,quantity:1}],address:{receiver:'مشتری',phone:'09121234567',street:'نشانی'},paymentReference:'BANK-ANON',idempotencyKey:'manual-anon-fresh'};
  const started=await reserve({items:body.items,address:body.address,idempotencyKey:`manual:${body.idempotencyKey}`,allowAnonymousReuse:true});
  const productId=started.checkout.quote.lines[0].productId;
  const old=Number((await query('select price from products where id=$1',[productId])).rows[0].price);
  try {
    await query('update products set price=$2 where id=$1',[productId,old+20]);
    const stale=await admin.post('/api/commerce/admin/orders/manual',body);assert.equal(stale.status,409);assert.equal(stale.body.code,'quote_stale');
    assert.equal((await query('select id from orders where checkout_id=$1',[started.checkout.id])).rows.length,0);
    const unconfirmed=await admin.post('/api/commerce/admin/orders/manual',body);assert.equal(unconfirmed.body.code,'manual_quote_confirmation_required');
    const wrong=await admin.post('/api/commerce/admin/orders/manual',{...body,confirmedQuoteVersion:'incorrect'});assert.equal(wrong.body.code,'manual_quote_confirmation_required');
    const retry=await admin.post('/api/commerce/admin/orders/manual',{...body,confirmedQuoteVersion:stale.body.details.quote.quoteVersion});assert.equal(retry.status,201,JSON.stringify(retry.body));
    assert.equal(retry.body.order.lines[0].unitPrice,old+20);
    const replay=await admin.post('/api/commerce/admin/orders/manual',body);assert.equal(replay.status,200);assert.equal(replay.body.order.id,retry.body.order.id);
    const different=await admin.post('/api/commerce/admin/orders/manual',{...body,paymentReference:'OTHER-REF'});assert.equal(different.status,409);assert.equal(different.body.code,'idempotency_conflict');
    const differentItems=await admin.post('/api/commerce/admin/orders/manual',{...body,items:[{variantId,quantity:2}]});assert.equal(differentItems.status,409);assert.equal(differentItems.body.code,'idempotency_conflict');
  } finally {await query('update products set price=$2 where id=$1',[productId,old])}
});

test('simultaneous manual requests with the same key consume stock only once', async () => {
  const variantId=await setStock(SKU,5),admin=await adminClient();
  const body={items:[{variantId,quantity:2}],address:{receiver:'مشتری',phone:'09121234567',street:'نشانی'},paymentReference:'BANK-CONCURRENT',idempotencyKey:'manual-concurrent'};
  const responses=await Promise.all([admin.post('/api/commerce/admin/orders/manual',body),admin.post('/api/commerce/admin/orders/manual',body)]);
  assert.ok(responses.every(r=>[200,201,409].includes(r.status)),JSON.stringify(responses));assert.ok(responses.some(r=>r.status===201),JSON.stringify(responses));
  const orders=await query("select id from orders where checkout_id=(select id from checkout_sessions where idempotency_key='manual:manual-concurrent')");
  assert.equal(orders.rows.length,1);assert.equal((await stockOf(SKU)).onHand,3);
});

/** A private audience fixture isolated from previous customer and document state. */
async function audienceFixture() {
  const admin=await adminClient();
  const doc=(await query("select value from state_documents where key='admin'")).rows[0].value;
  const labels=(await query("select value from commerce_settings where key='customer_labels_v1'")).rows[0]?.value;
  const old=(await query("select manual_labels from customers where email='ava@example.com'")).rows[0].manual_labels;
  const manual=(await admin.post('/api/admin/customer-labels',{name:`manual-${randomUUID()}`})).body.label;
  const automatic=(await admin.post('/api/admin/customer-labels',{name:`auto-${randomUUID()}`,minDeliveredOrders:1})).body.label;
  const previous=old??[];
  const path='/api/admin/customers/ava%40example.com/labels';
  assert.equal((await admin.put(path,{labels:[...previous,manual.id],expected:previous})).status,200);
  const make=async (mode:'any'|'all',value:number,freeShipping=false)=>{
    const made=await admin.post('/api/admin/marketing/campaigns',{name:`target-${randomUUID()}`,kind:'percent',scope:'all',value,minSpend:0,start:'',end:'',freeShipping,audience:{mode,labels:[manual.id,automatic.id]}});
    assert.equal(made.status,201,JSON.stringify(made.body));
    const enabled=await admin.patch(`/api/admin/marketing/campaigns/${made.body.id}`,{active:true});assert.equal(enabled.status,200,JSON.stringify(enabled.body));
    return made.body.id as string;
  };
  const cleanup=async()=>{
    await query("update state_documents set value=$1::jsonb where key='admin'",[JSON.stringify(doc)]);
    await query("update customers set manual_labels=$1::jsonb where email='ava@example.com'",[old===null?null:JSON.stringify(old)]);
    if(labels===undefined)await query("delete from commerce_settings where key='customer_labels_v1'");else await query("update commerce_settings set value=$1::jsonb where key='customer_labels_v1'",[JSON.stringify(labels)]);
    const {syncPromotions}=await import('../src/commerce/promotions');await syncPromotions(doc);
  };
  return {admin,manual,automatic,path,previous,make,cleanup};
}

test('targeted any audience uses authenticated identity and keeps shipping separate from best discount', async () => {
  const fx=await audienceFixture();
  try {
    const {saveCommerceSettings}=await import('../src/commerce/settings');await saveCommerceSettings({freeShippingThreshold:99999999});
    const variantId=await setStock(SKU,4),id=await fx.make('any',20,true);
    const guest=makeClient(),ava=await customerClient();
    const other=makeClient(),email=`aud-other-${randomUUID()}@example.com`;
    const {hashPassword}=await import('../src/security');
    await query("insert into customers(email,name,password_hash) values($1,$2,$3)",[email,'مشتری دوم',hashPassword('demo1234')]);
    assert.equal((await other.post('/api/auth/login',{email,password:'demo1234'})).status,200);
    const body={items:[{variantId,quantity:1}],customerEmail:'ava@example.com'};
    const [g,o,a]=await Promise.all([guest.post('/api/commerce/quote',body),other.post('/api/commerce/quote',body),ava.post('/api/commerce/quote',body)]);
    assert.equal(g.status,200,JSON.stringify(g.body));assert.equal(o.status,200);assert.equal(a.status,200);
    assert.equal(g.body.campaignDiscount,0);assert.equal(o.body.campaignDiscount,0);assert.equal(g.body.freeShipping,false);assert.equal(o.body.freeShipping,false);
    assert.equal(a.body.lines[0].campaignId,id);assert.ok(a.body.campaignDiscount>0);assert.equal(a.body.freeShippingBy,'campaign');
    await query(`insert into coupons(code,kind,value,min_subtotal,active,used_count) values('TARGETWIN','percent',50,0,true,0) on conflict(code) do update set kind='percent',value=50,min_subtotal=0,max_discount=null,usage_limit=null,active=true`);
    const coupon=await ava.post('/api/commerce/quote',{...body,couponCode:'TARGETWIN'});assert.equal(coupon.status,200,JSON.stringify(coupon.body));
    assert.ok(coupon.body.couponDiscount>a.body.campaignDiscount);assert.equal(coupon.body.campaignDiscount,0);assert.equal(coupon.body.freeShippingBy,'campaign');
    const publicDoc=await guest.get('/api/bootstrap');assert.ok(!publicDoc.body.admin.campaigns.some((c:any)=>c.id===id));
    assert.equal((await fx.admin.put('/api/state/admin',{})).body.code,'campaign_draft_legacy_conflict');
    const res=await fetch(`${base}/api/commerce/quote`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    // CSRF may reject an anonymous write without a token; the regular guest path above verifies eligibility.
    if(res.ok)assert.equal(res.headers.get('cache-control'),'no-store');
  } finally {await fx.cleanup()}
});

test('all audience combines manual and automatic labels and excludes fully refunded loyalty orders', async () => {
  const fx=await audienceFixture();
  try {
    const variantId=await setStock(SKU,5),id=await fx.make('all',40),ava=await customerClient();
    const quote=()=>ava.post('/api/commerce/quote',{items:[{variantId,quantity:1}]});
    assert.equal((await quote()).body.campaignDiscount,0);
    const manual=await fx.admin.post('/api/commerce/admin/orders/manual',{items:[{variantId,quantity:2}],customerEmail:'ava@example.com',address:{receiver:'مشتری',phone:'09121234567',street:'نشانی'},paymentReference:'LOYALTY-TEST',idempotencyKey:'loyalty-real-audience'});
    assert.equal(manual.status,201,JSON.stringify(manual.body));await deliverOrder(manual.body.order.id,SKU);
    const eligible=await quote();assert.equal(eligible.status,200);assert.equal(eligible.body.lines[0].campaignId,id);
    await query('update order_lines set refunded_quantity=1 where order_id=$1',[manual.body.order.id]);assert.equal((await quote()).body.lines[0].campaignId,id);
    await query('update order_lines set refunded_quantity=quantity where order_id=$1',[manual.body.order.id]);assert.equal((await quote()).body.campaignDiscount,0);
    await query('update order_lines set refunded_quantity=0 where order_id=$1',[manual.body.order.id]);
    await query("update orders set data=data-'manual' where id=$1",[manual.body.order.id]);assert.equal((await quote()).body.campaignDiscount,0,'unknown or mock payment never grants loyalty');
  } finally {await fx.cleanup()}
});

test('membership changes invalidate payment quotes but not an already initiated attempt snapshot', async () => {
  const fx=await audienceFixture();
  try {
    const variantId=await setStock(SKU,5);await fx.make('any',25,true);const ava=await customerClient();
    const initial=await startCheckout(ava,[{variantId,quantity:1}]);const checkout=initial.body.checkout;
    assert.ok(checkout.quote.campaignDiscount>0);
    assert.equal((await fx.admin.put(fx.path,{labels:fx.previous,expected:[...fx.previous,fx.manual.id]})).status,200);
    const stale=await ava.post(`/api/commerce/checkout/${checkout.id}/pay`,{method:'online'});assert.equal(stale.status,409,JSON.stringify(stale.body));assert.equal(stale.body.code,'quote_stale');
    assert.equal(stale.body.details.quote.campaignDiscount,0);assert.notEqual(stale.body.details.quote.quoteVersion,checkout.quoteVersion);
    const pay=await ava.post(`/api/commerce/checkout/${checkout.id}/pay`,{method:'online'});assert.equal(pay.status,200,JSON.stringify(pay.body));
    assert.equal((await ava.post(`/api/commerce/payments/${pay.body.attempt.id}/simulate`,{result:'success'})).body.orderStatus,'paid');
    assert.equal((await fx.admin.put(fx.path,{labels:[...fx.previous,fx.manual.id],expected:fx.previous})).status,200);
    const next=await startCheckout(ava,[{variantId,quantity:1}]);const original=next.body.checkout.quote;assert.ok(original.campaignDiscount>0);
    const attempt=await ava.post(`/api/commerce/checkout/${next.body.checkout.id}/pay`,{method:'online',idempotencyKey:'audience-frozen-attempt'});assert.equal(attempt.status,200);
    assert.equal((await fx.admin.put(fx.path,{labels:fx.previous,expected:[...fx.previous,fx.manual.id]})).status,200);
    const replay=await ava.post(`/api/commerce/checkout/${next.body.checkout.id}/pay`,{method:'online',idempotencyKey:'audience-frozen-attempt'});assert.equal(replay.body.attempt.id,attempt.body.attempt.id);
    const settled=await ava.post(`/api/commerce/payments/${attempt.body.attempt.id}/simulate`,{result:'success'});assert.equal(settled.body.orderStatus,'paid');
    const order=(await fx.admin.get(`/api/commerce/orders/${settled.body.orderId}`)).body;assert.equal(order.total,original.grandTotal);assert.equal(order.discountTotal,original.discountTotal);
  } finally {await fx.cleanup()}
});

test('manual order uses the designated customer audience and unknown customer remains ineligible', async () => {
  const fx=await audienceFixture();
  try {
    const variantId=await setStock(SKU,4),id=await fx.make('any',30);
    const body={items:[{variantId,quantity:1}],address:{receiver:'مشتری',phone:'09121234567',street:'نشانی'},paymentReference:'AUD-MANUAL',idempotencyKey:'aud-manual-eligible'};
    const matched=await fx.admin.post('/api/commerce/admin/orders/manual',{...body,customerEmail:'AVA@EXAMPLE.COM'});assert.equal(matched.status,201,JSON.stringify(matched.body));
    const recorded=(await query("select quote from checkout_sessions where id=$1",[matched.body.order.checkoutId])).rows[0].quote;
    assert.equal(recorded.lines[0].campaignId,id);assert.equal(matched.body.order.email,'ava@example.com');assert.ok(matched.body.order.discountTotal>0);
    const unmatched=await fx.admin.post('/api/commerce/admin/orders/manual',{...body,idempotencyKey:'aud-manual-unknown',customerEmail:'nobody@example.com'});assert.equal(unmatched.status,201,JSON.stringify(unmatched.body));assert.equal(unmatched.body.order.discountTotal,0);
  } finally {await fx.cleanup()}
});

test('pricing reads membership and product prices from the same snapshot under the checkout lock', async () => {
  const fx=await audienceFixture();let productId:string|undefined,oldPrice:unknown;
  try {
    const variantId=await setStock(SKU,3);await fx.make('any',20);const ava=await customerClient();
    const created=await startCheckout(ava,[{variantId,quantity:1}]);const checkoutId=created.body.checkout.id;
    const product=(await query('select p.id,p.price from products p join product_variants v on v.product_id=p.id where v.id=$1',[variantId])).rows[0];productId=product.id;oldPrice=product.price;
    const {withTransaction}=await import('../src/db');const {refreshQuoteUnderLock}=await import('../src/commerce/payments');
    let ready!:()=>void,release!:()=>void;const locked=new Promise<void>(r=>ready=r),gate=new Promise<void>(r=>release=r);
    const pending=withTransaction(async client=>{
      await client.query('set transaction isolation level repeatable read');
      const checkout=(await client.query('select * from checkout_sessions where id=$1 for update',[checkoutId])).rows[0];ready();await gate;
      return refreshQuoteUnderLock(client,checkout);
    });
    await locked;
    try {
      assert.equal((await fx.admin.put(fx.path,{labels:fx.previous,expected:[...fx.previous,fx.manual.id]})).status,200);
      await query('update products set price=price+100 where id=$1',[productId]);
    } finally {release()}
    assert.equal(await pending,null,'the earlier snapshot cannot combine old eligibility with new prices');
    const fresh=await withTransaction(async client=>{
      await client.query('set transaction isolation level repeatable read');
      const checkout=(await client.query('select * from checkout_sessions where id=$1 for update',[checkoutId])).rows[0];
      return refreshQuoteUnderLock(client,checkout,true);
    });
    assert.ok(fresh);assert.equal(fresh.campaignDiscount,0);assert.equal(fresh.lines[0].unitPrice,Number(oldPrice)+100);
    const saved=(await query('select quote,manual_quote_confirm_required from checkout_sessions where id=$1',[checkoutId])).rows[0];assert.equal(saved.quote.quoteVersion,fresh.quoteVersion);assert.equal(saved.manual_quote_confirm_required,true);
  } finally {if(productId)await query('update products set price=$1 where id=$2',[oldPrice,productId]);await fx.cleanup()}
});

test('stale promotion projections cannot overwrite targeted rules, and invalid audiences fail closed', async () => {
  const fx=await audienceFixture();
  try {
    const variantId=await setStock(SKU,3),id=await fx.make('any',25);const ava=await customerClient();
    const doc=(await query("select value from state_documents where key='admin'")).rows[0].value;
    const old=structuredClone(doc);old.campaigns.find((r:any)=>r.id===id).audience=null;
    const {syncPromotions}=await import('../src/commerce/promotions');await syncPromotions(old);
    await query('update price_rules set active=false where id<>$1',[id]);
    const rule=(await query('select audience,active from price_rules where id=$1',[id])).rows[0];assert.equal(rule.active,true);assert.equal(rule.audience.labels.includes(fx.manual.id),true);
    const quote=()=>ava.post('/api/commerce/quote',{items:[{variantId,quantity:1}]});assert.ok((await quote()).body.campaignDiscount>0);
    for(const audience of [{mode:'any',labels:[]},{mode:'any',labels:[fx.manual.id],unknown:true},{mode:'any',labels:['deleted-label']}]) {
      await query('update price_rules set audience=$2::jsonb where id=$1',[id,JSON.stringify(audience)]);assert.equal((await quote()).body.campaignDiscount,0);
    }
    await syncPromotions(old);await query('update price_rules set active=false where id<>$1',[id]);assert.ok((await quote()).body.campaignDiscount>0);
  } finally {await fx.cleanup()}
});

test('manual order requires renewed confirmation when customer audience changes after quote', async () => {
  const fx=await audienceFixture();
  try {
    const variantId=await setStock(SKU,3);await fx.make('any',20);
    const body={items:[{variantId,quantity:1}],customerEmail:'ava@example.com',address:{receiver:'مشتری',phone:'09121234567',street:'نشانی'},paymentReference:'AUD-CONFIRM',idempotencyKey:'aud-confirmation'};
    const {startCheckout:reserve}=await import('../src/commerce/checkout');
    const initial=await reserve({items:body.items,customerEmail:body.customerEmail,address:body.address,idempotencyKey:`manual:${body.idempotencyKey}`,allowAnonymousReuse:true});assert.ok(initial.checkout.quote.campaignDiscount>0);
    assert.equal((await fx.admin.put(fx.path,{labels:fx.previous,expected:[...fx.previous,fx.manual.id]})).status,200);
    const stale=await fx.admin.post('/api/commerce/admin/orders/manual',body);assert.equal(stale.status,409,JSON.stringify(stale.body));assert.equal(stale.body.code,'quote_stale');assert.equal(stale.body.details.quote.campaignDiscount,0);
    const missing=await fx.admin.post('/api/commerce/admin/orders/manual',body);assert.equal(missing.status,409);assert.equal(missing.body.code,'manual_quote_confirmation_required');
    const confirmed=await fx.admin.post('/api/commerce/admin/orders/manual',{...body,confirmedQuoteVersion:stale.body.details.quote.quoteVersion});assert.equal(confirmed.status,201,JSON.stringify(confirmed.body));assert.equal(confirmed.body.order.discountTotal,0);
  } finally {await fx.cleanup()}
});

async function purchaseEarlyCampaign(fx:Awaited<ReturnType<typeof audienceFixture>>, scope:'all'|'category'='all', scopeId='') {
  const start=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
  const early=new Date(Date.now()-60000).toISOString();
  const made=await fx.admin.post('/api/admin/marketing/campaigns',{name:`early-${randomUUID()}`,kind:'percent',scope,scopeId,value:30,minSpend:0,start,end:'',freeShipping:true,
    audience:{mode:'any',labels:[fx.manual.id]},earlyAccess:{mode:'purchase',startsAt:early}});
  assert.equal(made.status,201,JSON.stringify(made.body));
  const enabled=await fx.admin.patch(`/api/admin/marketing/campaigns/${made.body.id}`,{active:true});assert.equal(enabled.status,200,JSON.stringify(enabled.body));
  return made.body.id as string;
}

test('purchase early access gates reservations, payments and manual orders by server-side labels', async () => {
  const fx=await audienceFixture();
  try {
    const variantId=await setStock(SKU,8),id=await purchaseEarlyCampaign(fx);const ava=await customerClient();
    const email=`early-${randomUUID()}@example.com`,other=makeClient(),{hashPassword}=await import('../src/security');
    await query("insert into customers(email,name,password_hash) values($1,$2,$3)",[email,'مشتری دوم',hashPassword('demo1234')]);assert.equal((await other.post('/api/auth/login',{email,password:'demo1234'})).status,200);
    const items=[{variantId,quantity:1}],avaQuote=await ava.post('/api/commerce/quote',{items}),otherQuote=await other.post('/api/commerce/quote',{items});
    assert.equal(avaQuote.body.lines[0].campaignId,id);assert.equal(avaQuote.body.freeShippingBy,'campaign');assert.equal(otherQuote.body.campaignDiscount,0);
    const denied=await startCheckout(other,items);assert.equal(denied.status,409,JSON.stringify(denied.body));assert.equal(denied.body.code,'early_purchase_restricted');
    assert.equal(Number((await query("select count(*)::int n from stock_reservations where status='active'")).rows[0].n),0);
    const manualBody={items,address:{receiver:'مشتری',phone:'09121234567',street:'نشانی'},paymentReference:'EARLY',idempotencyKey:'early-manual',customerEmail:email};
    const manualDenied=await fx.admin.post('/api/commerce/admin/orders/manual',manualBody);assert.equal(manualDenied.status,409);assert.equal(manualDenied.body.code,'early_purchase_restricted');
    const held=await startCheckout(ava,items);assert.equal(held.status,201,JSON.stringify(held.body));assert.equal(held.body.checkout.quote.lines[0].campaignId,id);
    assert.equal((await fx.admin.put(fx.path,{labels:fx.previous,expected:[...fx.previous,fx.manual.id]})).status,200);
    let deniedPay=await ava.post(`/api/commerce/checkout/${held.body.checkout.id}/pay`,{method:'online'});
    if(deniedPay.body.code==='quote_stale')deniedPay=await ava.post(`/api/commerce/checkout/${held.body.checkout.id}/pay`,{method:'online'});
    assert.equal(deniedPay.status,409,JSON.stringify(deniedPay.body));assert.equal(deniedPay.body.code,'early_purchase_restricted');
    assert.equal(Number((await query('select count(*)::int n from payment_attempts where checkout_id=$1',[held.body.checkout.id])).rows[0].n),0);
    await query("update price_rules set starts_at=now()-interval '1 minute' where id=$1",[id]);
    const afterPublic=await startCheckout(other,items);assert.equal(afterPublic.status,201,JSON.stringify(afterPublic.body));
  } finally {await fx.cleanup()}
});

test('early purchase uses all overlapping restrictions, is closed before the early start and remains scoped', async () => {
  const fx=await audienceFixture();let productId:string|undefined,previousCategory:string|undefined;
  try {
    const variant=await setStock(SKU,4),otherVariant=await setStock(SKU2,4);
    const product=(await query('select p.id,p.category from products p join product_variants v on v.product_id=p.id where v.id=$1',[variant])).rows[0];productId=product.id;previousCategory=product.category;
    const category=`early-category-${randomUUID()}`;await query('update products set category=$2 where id=$1',[productId,category]);
    const id=await purchaseEarlyCampaign(fx,'category',category),ava=await customerClient();
    const future=new Date(Date.now()+600000).toISOString();await query('update price_rules set early_access=$2::jsonb where id=$1',[id,JSON.stringify({mode:'purchase',startsAt:future})]);
    const tooEarly=await startCheckout(ava,[{variantId:variant,quantity:1}]);assert.equal(tooEarly.status,409);assert.equal(tooEarly.body.code,'early_purchase_restricted');
    // A different category is unaffected even though this campaign is active.
    const otherProduct=(await query('select product_id from product_variants where id=$1',[otherVariant])).rows[0].product_id;
    if(otherProduct!==productId)assert.equal((await startCheckout(ava,[{variantId:otherVariant,quantity:1}])).status,201);
    await query('update price_rules set early_access=$2::jsonb where id=$1',[id,JSON.stringify({mode:'purchase',startsAt:new Date(Date.now()-60000).toISOString()})]);
    const second=(await fx.admin.post('/api/admin/customer-labels',{name:`second-${randomUUID()}`})).body.label;
    const until=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
    const made=await fx.admin.post('/api/admin/marketing/campaigns',{name:'overlap',kind:'percent',scope:'all',value:5,minSpend:0,start:until,end:'',audience:{mode:'any',labels:[second.id]},earlyAccess:{mode:'purchase',startsAt:new Date(Date.now()-60000).toISOString()}});
    assert.equal(made.status,201);assert.equal((await fx.admin.patch(`/api/admin/marketing/campaigns/${made.body.id}`,{active:true})).status,200);
    const overlap=await startCheckout(ava,[{variantId:variant,quantity:1}]);assert.equal(overlap.status,409);assert.equal(overlap.body.code,'early_purchase_restricted');
    assert.equal((await fx.admin.put(fx.path,{labels:[...fx.previous,fx.manual.id,second.id],expected:[...fx.previous,fx.manual.id]})).status,200);
    assert.equal((await startCheckout(ava,[{variantId:variant,quantity:1}])).status,201);
  } finally {if(productId)await query('update products set category=$2 where id=$1',[productId,previousCategory]);await fx.cleanup()}
});

test('initiated early payment remains payable after eligibility changes while exchanges are disabled', async () => {
  const fx=await audienceFixture();
  try {
    const variant=await setStock(SKU,6),target=await setStock(SKU2,6),ava=await customerClient();
    const original=await payAndSettle(ava,[{variantId:variant,quantity:1}]);
    const originalOrder=await ava.get(`/api/commerce/orders/${original.settled.orderId}`);
    await purchaseEarlyCampaign(fx);
    const started=await startCheckout(ava,[{variantId:variant,quantity:1}]);assert.equal(started.status,201);
    const attempt=await ava.post(`/api/commerce/checkout/${started.body.checkout.id}/pay`,{method:'online'});assert.equal(attempt.status,200,JSON.stringify(attempt.body));
    assert.equal((await fx.admin.put(fx.path,{labels:fx.previous,expected:[...fx.previous,fx.manual.id]})).status,200);
    const completed=await ava.post(`/api/commerce/payments/${attempt.body.attempt.id}/simulate`,{result:'success'});assert.equal(completed.body.orderStatus,'paid');
    const exchange=await ava.post(`/api/commerce/orders/${original.settled.orderId}/returns`,{lineId:originalOrder.body.lines[0].id,quantity:1,kind:'exchange',targetVariantId:target});
    assert.equal(exchange.status,503,JSON.stringify(exchange.body));assert.equal(exchange.body.code,'exchange_unavailable');
  } finally {await fx.cleanup()}
});

test('invalid early access and missing label definitions fail closed and old projection cannot reopen buying', async () => {
  const fx=await audienceFixture();
  try {
    const variant=await setStock(SKU,3),id=await purchaseEarlyCampaign(fx),ava=await customerClient();
    const current=(await query("select value from state_documents where key='admin'")).rows[0].value;
    const stale=structuredClone(current);stale.campaigns.find((r:any)=>r.id===id).earlyAccess=null;
    const {syncPromotions}=await import('../src/commerce/promotions');await syncPromotions(stale);
    const projected=(await query('select early_access from price_rules where id=$1',[id])).rows[0];assert.equal(projected.early_access.mode,'purchase');
    for(const bad of [{mode:'purchase',startsAt:'bad'},{mode:'purchase',startsAt:new Date(Date.now()-60000).toISOString(),other:true},{mode:'view_purchase',startsAt:new Date(Date.now()-60000).toISOString()}]) {
      await query('update price_rules set early_access=$2::jsonb where id=$1',[id,JSON.stringify(bad)]);
      const denied=await startCheckout(ava,[{variantId:variant,quantity:1}]);assert.equal(denied.status,409);assert.equal(denied.body.code,'early_purchase_restricted');
    }
    await syncPromotions(stale);
    await query('update price_rules set audience=$2::jsonb where id=$1',[id,JSON.stringify({mode:'any',labels:['lbl-00000000-0000-0000-0000-000000000000']})]);
    const missing=await startCheckout(ava,[{variantId:variant,quantity:1}]);assert.equal(missing.status,409);assert.equal(missing.body.code,'early_purchase_restricted');
  } finally {await fx.cleanup()}
});

test('automatic loyalty labels govern early purchase and a full refund removes eligibility', async () => {
  const fx=await audienceFixture();
  try {
    const variant=await setStock(SKU,8),ava=await customerClient();
    const manual=await fx.admin.post('/api/commerce/admin/orders/manual',{items:[{variantId:variant,quantity:2}],customerEmail:'ava@example.com',address:{receiver:'مشتری',phone:'09121234567',street:'نشانی'},paymentReference:'EARLY-AUTO',idempotencyKey:'early-auto-source'});
    assert.equal(manual.status,201,JSON.stringify(manual.body));await deliverOrder(manual.body.order.id,SKU);
    const until=new Date(Date.now()+2*86400000).toISOString().slice(0,10);
    const draft=await fx.admin.post('/api/admin/marketing/campaigns',{name:'early-auto',kind:'percent',scope:'all',value:20,minSpend:0,start:until,end:'',audience:{mode:'any',labels:[fx.automatic.id]},earlyAccess:{mode:'purchase',startsAt:new Date(Date.now()-60000).toISOString()}});
    assert.equal(draft.status,201);assert.equal((await fx.admin.patch(`/api/admin/marketing/campaigns/${draft.body.id}`,{active:true})).status,200);
    await query('update order_lines set refunded_quantity=1 where order_id=$1',[manual.body.order.id]);
    assert.equal((await startCheckout(ava,[{variantId:variant,quantity:1}])).status,201);
    await query('update order_lines set refunded_quantity=quantity where order_id=$1',[manual.body.order.id]);
    const denied=await startCheckout(ava,[{variantId:variant,quantity:1}]);assert.equal(denied.status,409);assert.equal(denied.body.code,'early_purchase_restricted');
  } finally {await fx.cleanup()}
});

test('early-purchase eligibility uses one snapshot during concurrent membership changes', async () => {
  const fx=await audienceFixture();
  try {
    const variant=await setStock(SKU,3);await purchaseEarlyCampaign(fx);
    const {withTransaction}=await import('../src/db');const {requirePurchaseAccess}=await import('../src/commerce/early-access');
    let ready!:()=>void,release!:()=>void;const locked=new Promise<void>(r=>ready=r),gate=new Promise<void>(r=>release=r);
    const before=withTransaction(async client=>{
      await client.query('set transaction isolation level repeatable read');
      await client.query('select 1 from price_rules limit 1');ready();await gate;
      await requirePurchaseAccess(client,[variant],'AVA@EXAMPLE.COM');
    });
    await locked;
    try {assert.equal((await fx.admin.put(fx.path,{labels:fx.previous,expected:[...fx.previous,fx.manual.id]})).status,200)} finally {release()}
    await before;
    await assert.rejects(withTransaction(client=>requirePurchaseAccess(client,[variant],'ava@example.com')),(err:any)=>err.code==='early_purchase_restricted');
  } finally {await fx.cleanup()}
});


test('support tickets enforce ownership, idempotent replies, closed state and audit privacy', async () => {
  await query("delete from support_tickets where customer_email in ('ava@example.com','support-other@example.com')");
  await query(`insert into customers(email,name,password_hash) select 'support-other@example.com','Other',password_hash from customers where email='ava@example.com' on conflict(email) do update set password_hash=excluded.password_hash`);
  const customer=await customerClient(),other=makeClient(),guest=makeClient(),admin=await adminClient();
  assert.equal((await other.post('/api/auth/login',{email:'support-other@example.com',password:'demo1234'})).status,200);
  assert.equal((await guest.get('/api/support/tickets')).status,401);
  const body={subject:'موضوع محرمانه',message:'متن خصوصی <script>alert(1)</script>',requestKey:'support-create-key-001'};
  const created=await customer.post('/api/support/tickets',body);assert.equal(created.status,201,JSON.stringify(created.body));const id=created.body.ticket.id;
  assert.equal((await customer.post('/api/support/tickets',body)).body.ticket.id,id);
  assert.equal((await customer.post('/api/support/tickets',{...body,message:'دیگر'})).status,409);
  assert.equal((await other.get('/api/support/tickets')).body.tickets.length,0);
  assert.equal((await other.get(`/api/support/tickets/${id}`)).status,404);
  assert.equal((await other.post(`/api/support/tickets/${id}/messages`,{message:'test',requestKey:'other-message-key-001'})).status,404);
  const reply={message:'پیام دوم محرمانه',requestKey:'support-reply-key-001'};
  const [a,b]=await Promise.all([customer.post(`/api/support/tickets/${id}/messages`,reply),customer.post(`/api/support/tickets/${id}/messages`,reply)]);
  assert.equal(a.status,200,JSON.stringify(a.body));assert.equal(b.status,200,JSON.stringify(b.body));
  assert.equal((await customer.get(`/api/support/tickets/${id}`)).body.ticket.messages.length,2);
  const staff=await admin.post(`/api/admin/support/tickets/${id}/messages`,{message:'پاسخ',requestKey:'staff-reply-key-001'});assert.equal(staff.status,200,JSON.stringify(staff.body));assert.equal(staff.body.ticket.status,'answered');
  const closed=await admin.patch(`/api/admin/support/tickets/${id}`,{status:'closed',expectedVersion:staff.body.ticket.version});assert.equal(closed.status,200,JSON.stringify(closed.body));
  assert.equal((await customer.post(`/api/support/tickets/${id}/messages`,{message:'بعد از بسته شدن',requestKey:'support-reply-key-002'})).status,409);
  assert.equal((await customer.post(`/api/support/tickets/${id}/messages`,reply)).body.reused,true,'retry remains idempotent even after close');
  assert.equal((await admin.patch(`/api/admin/support/tickets/${id}`,{status:'open',expectedVersion:staff.body.ticket.version})).status,409);
  assert.equal((await admin.patch(`/api/admin/support/tickets/${id}`,{status:'open',expectedVersion:closed.body.ticket.version})).status,200);
  const audit=await query("select before,after from audit_events where target_type='support_ticket' and target_id=$1",[id]);
  assert.ok(audit.rows.length>=4);assert.doesNotMatch(JSON.stringify(audit.rows),/محرمانه|script|پاسخ/);
  assert.equal((await customer.post('/api/support/tickets',{...body,requestKey:'support-new-key-002',message:'x'.repeat(4001)})).status,422);
  await query(`insert into support_tickets(id,customer_email,subject,messages,create_key,created_at) select 'tkt-'||gen_random_uuid(),'ava@example.com','bulk','[]'::jsonb,'bulk-'||g,now()-g*interval '1 second' from generate_series(1,102) g`);
  const page1=await customer.get('/api/support/tickets');assert.equal(page1.body.tickets.length,100);assert.ok(page1.body.nextCursor);
  const page2=await customer.get(`/api/support/tickets?before=${page1.body.nextCursor}`);assert.equal(page2.body.tickets.length,3);assert.equal(page2.body.nextCursor,null);
  assert.equal(new Set([...page1.body.tickets,...page2.body.tickets].map((t:any)=>t.id)).size,103);
});

test('customer measurements are private, validated, concurrency-safe and never inferred from legacy sizes', async () => {
  await query("update customers set personal_measurements=null where email='ava@example.com'");
  await query(`insert into customers(email,name,password_hash) select 'measurements-other@example.com','Other',password_hash from customers where email='ava@example.com' on conflict(email) do update set password_hash=excluded.password_hash,personal_measurements=null`);
  const buyer=await customerClient(),other=makeClient(),guest=makeClient(),admin=await adminClient();
  assert.equal((await other.post('/api/auth/login',{email:'measurements-other@example.com',password:'demo1234'})).status,200);
  const legacy=(await query("select size from customers where email='ava@example.com'")).rows[0].size;
  assert.ok(legacy,"seeded legacy size exists but must not be imported");
  assert.equal((await guest.get('/api/auth/measurements')).status,401);
  assert.equal((await admin.get('/api/auth/measurements')).status,401);
  assert.equal((await buyer.get('/api/auth/measurements')).body.measurements,null);
  const protectedResponse=await fetch(`${base}/api/auth/measurements`,{headers:{cookie:buyer.cookie()}});assert.match(protectedResponse.headers.get('cache-control')||'',/no-store/);
  const values={height:173.5,chest:94,waist:null,hip:101,shoulder:null,sleeve:null,inseam:null};
  const invalids=[{...values,chest:0},{...values,chest:301},{...values,chest:1.11},{...values,chest:'94'},{...values,foo:2},{chest:90},{height:null,chest:null,waist:null,hip:null,shoulder:null,sleeve:null,inseam:null}];
  for(const measurements of invalids) assert.equal((await buyer.put('/api/auth/measurements',{expected:null,measurements})).status,422);
  assert.equal((await buyer.put('/api/auth/measurements',{expected:null,measurements:values,extra:true})).status,422);
  assert.equal((await fetch(`${base}/api/auth/measurements`,{method:'PUT',headers:{cookie:buyer.cookie(),'content-type':'application/json'},body:JSON.stringify({expected:null,measurements:values})})).status,403);
  const saved=await buyer.put('/api/auth/measurements',{expected:null,measurements:values});assert.equal(saved.status,200,JSON.stringify(saved.body));
  const retry=await buyer.put('/api/auth/measurements',{expected:null,measurements:values});assert.equal(retry.status,200);assert.equal(retry.body.unchanged,true);
  assert.deepEqual((await buyer.get('/api/auth/measurements')).body.measurements,values);
  assert.equal((await other.get('/api/auth/measurements')).body.measurements,null);
  assert.deepEqual((await query("select size from customers where email='ava@example.com'")).rows[0].size,legacy,'legacy data is preserved');
  assert.equal(Object.prototype.hasOwnProperty.call((await buyer.get('/api/auth/me')).body.customer,'personal_measurements'),false);
  const one={...values,chest:95},two={...values,chest:96};
  const writes=await Promise.all([buyer.put('/api/auth/measurements',{expected:values,measurements:one}),buyer.put('/api/auth/measurements',{expected:values,measurements:two})]);
  assert.deepEqual(writes.map(r=>r.status).sort(),[200,409]);assert.equal(writes.find(r=>r.status===409)?.body.code,'measurements_conflict');
  const current=(await buyer.get('/api/auth/measurements')).body.measurements;
  assert.equal((await buyer.put('/api/auth/measurements',{expected:values,measurements:null})).status,409);
  assert.equal((await buyer.put('/api/auth/measurements',{expected:current,measurements:null})).status,200);
  assert.equal((await buyer.get('/api/auth/measurements')).body.measurements,null);
  const logs=await query("select before,after,reason from audit_events where actor='ava@example.com' and action like 'customer.measurements_%'");assert.ok(logs.rows.length>=3);assert.doesNotMatch(JSON.stringify(logs.rows),/173\.5|94|95|96|101/);
  await query("update customers set personal_measurements=$1::jsonb where email='ava@example.com'",[JSON.stringify({unknown:92})]);
  assert.equal((await buyer.get('/api/auth/measurements')).body.code,'measurements_unrecognized');
  assert.equal((await buyer.put('/api/auth/measurements',{expected:null,measurements:values})).body.code,'measurements_unrecognized');
  assert.deepEqual((await query("select personal_measurements from customers where email='ava@example.com'")).rows[0].personal_measurements,{unknown:92});
  await query("update customers set personal_measurements=null where email='ava@example.com'");
});

test('pausing a variant blocks new carts and checkout but preserves an existing hold', async () => {
  const admin=await adminClient(), buyer=await customerClient();const variantId=await setStock(SKU,5);
  const variant=(await query('select product_id,sale_enabled,sale_version from product_variants where id=$1',[variantId])).rows[0];
  const path=`/api/admin/products/${variant.product_id}/variant-sales/${variantId}`;
  try{
    const held=await startCheckout(buyer,[{variantId,quantity:1}]);assert.equal(held.status,201,JSON.stringify(held.body));
    const pause=await admin.patch(path,{saleEnabled:false,expectedEnabled:true,expectedVersion:variant.sale_version});assert.equal(pause.status,200,JSON.stringify(pause.body));
    const cart=await makeClient().post('/api/commerce/cart/lines',{variantId,quantity:1});assert.equal(cart.status,409);assert.equal(cart.body.code,'variant_inactive');
    const next=await startCheckout(buyer,[{variantId,quantity:1}]);assert.equal(next.status,409);assert.equal(next.body.code,'variant_inactive');
    const payment=await buyer.post(`/api/commerce/checkout/${held.body.checkout.id}/pay`,{method:'online'});assert.equal(payment.status,200,JSON.stringify(payment.body));
    const settle=await buyer.post(`/api/commerce/payments/${payment.body.attempt.id}/simulate`,{result:'success'});assert.equal(settle.status,200,JSON.stringify(settle.body));
    assert.equal((await query('select on_hand from product_variants where id=$1',[variantId])).rows[0].on_hand,4);
  } finally {await query('update product_variants set sale_enabled=$2,sale_version=$3 where id=$1',[variantId,variant.sale_enabled,variant.sale_version]);}
});

test('a sale pause committed while checkout waits on variant lock prevents new reservation', async () => {
  const variantId=await setStock(SKU,3);const buyer=await customerClient();const original=(await query('select sale_enabled,sale_version from product_variants where id=$1',[variantId])).rows[0];
  const {getPool}=await import('../src/db');const locker=await getPool().connect();await locker.query('begin');
  try{
    await locker.query('update product_variants set sale_enabled=false,sale_version=sale_version+1 where id=$1',[variantId]);
    const pending=startCheckout(buyer,[{variantId,quantity:1}]);let waiting=0;
    try{
      for(let i=0;i<100;i++){await locker.query('select pg_stat_clear_snapshot()');waiting=(await locker.query("select count(*)::int n from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and query ilike '%from product_variants where id = $1 for update%'")).rows[0].n;if(waiting)break;await new Promise(r=>setTimeout(r,20));}
      assert.ok(waiting,'checkout should be blocked by the changed variant row');
    }finally{await locker.query('commit')}
    const result=await pending;assert.equal(result.status,409);assert.equal(result.body.code,'insufficient_stock');
    assert.equal((await query("select count(*)::int n from stock_reservations where variant_id=$1 and status='active' and expires_at>now()",[variantId])).rows[0].n,0);
  }finally{await locker.query('rollback').catch(()=>{});locker.release();await query('update product_variants set sale_enabled=$2,sale_version=$3 where id=$1',[variantId,original.sale_enabled,original.sale_version])}
});
