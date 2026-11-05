import test from "node:test";
import assert from "node:assert/strict";
import { api, ApiError } from "../../src/lib/api.ts";
import {
  buildOrdersQuery,
  fetchOrders,
  normalizeOrderSearch,
  parseOrdersResult,
  type OrderFilters,
  type OrdersResult,
} from "../../src/admin/orders-api.ts";
import { addDays, persianParts } from "../../src/utils/persian-calendar.ts";

const filters: OrderFilters = { q: "", status: "", payment: "", fulfillment: "", from: "", to: "", sort: "date", dir: "desc", page: 1 };
const order = {
  id: "kv-1001",
  customer: "آوا",
  created_at: "2026-11-05T10:00:00.000Z",
  status: "paid",
  payment_status: "settled",
  fulfillment_status: "unfulfilled",
  total: "125000",
  currency: "IRT",
  item_count: 2,
};
const result = (orders = [order], total = orders.length): OrdersResult => ({ total, page: 1, pageSize: 25, orders });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function expectApiError(promise: Promise<unknown>, check: (error: ApiError) => void) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof ApiError, `expected ApiError, received ${String(error)}`);
    check(error);
    return true;
  });
}

test("successful Orders response returns validated orders", async (t) => {
  t.mock.method(globalThis, "fetch", async () => json(result()));
  const data = await fetchOrders(filters);
  assert.equal(data.orders.length, 1);
  assert.equal(data.orders[0].id, "kv-1001");
});

test("successful Orders response with zero orders stays a valid empty result", async (t) => {
  t.mock.method(globalThis, "fetch", async () => json(result([], 0)));
  const data = await fetchOrders(filters);
  assert.deepEqual(data.orders, []);
  assert.equal(data.total, 0);
});

test("undefined and malformed Orders responses are errors, never empty success", async (t) => {
  t.mock.method(globalThis, "fetch", async () => undefined as unknown as Response);
  await expectApiError(fetchOrders(filters), (error) => assert.equal(error.code, "invalid_response"));
  assert.throws(() => parseOrdersResult(undefined), (error: unknown) => error instanceof ApiError && error.code === "malformed_response");
  assert.throws(() => parseOrdersResult({ total: 0, page: 1, pageSize: 25 }), (error: unknown) => error instanceof ApiError && error.code === "malformed_response");
  assert.throws(() => parseOrdersResult({ total: 0, page: 1, pageSize: 25, orders: [{}] }), (error: unknown) => error instanceof ApiError && error.code === "malformed_response");
});

test("an empty 204 list response is explicitly missing data, not a fabricated empty list", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 204 }));
  await expectApiError(fetchOrders(filters), (error) => assert.equal(error.code, "malformed_response"));
});

test("malformed JSON is a protocol error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("not-json", { status: 200 }));
  await expectApiError(api.get("/api/admin/orders-list"), (error) => assert.equal(error.code, "malformed_response"));
});

test("network failure is distinct from an empty result", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("connection refused"); });
  await expectApiError(fetchOrders(filters), (error) => {
    assert.equal(error.code, "network_error");
    assert.equal(error.status, 0);
  });
});

test("server error preserves its HTTP status", async (t) => {
  t.mock.method(globalThis, "fetch", async () => json({ error: "database unavailable" }, 500));
  await expectApiError(fetchOrders(filters), (error) => {
    assert.equal(error.status, 500);
    assert.equal(error.message, "database unavailable");
  });
});

test("unauthorized and forbidden responses remain authorization errors", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => json({ error: "unauthorized" }, 401));
  await expectApiError(fetchOrders(filters), (error) => assert.equal(error.status, 401));
  fetchMock.mock.mockImplementation(async () => json({ error: "forbidden" }, 403));
  await expectApiError(fetchOrders(filters), (error) => assert.equal(error.status, 403));
});

test("retry after failure performs a new request and can succeed", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return calls === 1 ? json({ error: "down" }, 503) : json(result());
  });
  await expectApiError(fetchOrders(filters), (error) => assert.equal(error.status, 503));
  const retried = await fetchOrders(filters);
  assert.equal(retried.orders.length, 1);
  assert.equal(calls, 2);
});

test("request cancellation is explicit", async (t) => {
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, init?: RequestInit) => {
    init?.signal?.throwIfAborted();
    throw new DOMException("aborted", "AbortError");
  });
  const controller = new AbortController();
  controller.abort();
  await expectApiError(fetchOrders(filters, { signal: controller.signal }), (error) => assert.equal(error.code, "request_cancelled"));
});

test("an injected demo adapter succeeds and fails without a hidden fallback", async () => {
  const demoSuccess = async () => result();
  const demoFailure = async () => { throw new ApiError("demo unavailable", 503); };
  assert.equal((await fetchOrders(filters, { transport: demoSuccess })).orders.length, 1);
  await expectApiError(fetchOrders(filters, { transport: demoFailure }), (error) => assert.equal(error.status, 503));
  await expectApiError(fetchOrders(filters, { transport: async () => undefined }), (error) => assert.equal(error.code, "malformed_response"));
});

test("Persian and Latin search digits normalize at the API boundary", () => {
  assert.equal(normalizeOrderSearch("  kv-۱۲۳٤٥۶  "), "kv-123456");
  assert.equal(normalizeOrderSearch("kv-123456"), "kv-123456");
  const query = new URLSearchParams(buildOrdersQuery({ ...filters, q: "۱۲۳", status: "attention" }));
  assert.equal(query.get("q"), "123");
  assert.equal(query.get("status"), "attention");
});

test("Jalali conversion is correct while API dates remain Gregorian ISO days", () => {
  assert.deepEqual(persianParts("2024-03-20"), { year: 1403, month: 1, day: 1 });
  assert.deepEqual(persianParts("2025-03-21"), { year: 1404, month: 1, day: 1 });
  assert.equal(addDays("2024-03-20", 1), "2024-03-21");
  const query = new URLSearchParams(buildOrdersQuery({ ...filters, from: "2024-03-20", to: "2024-03-21" }));
  assert.equal(query.get("from"), "2024-03-20");
  assert.equal(query.get("to"), "2024-03-21");
});
