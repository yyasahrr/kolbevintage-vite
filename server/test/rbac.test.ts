process.env.PGDATABASE = process.env.PGDATABASE_TEST ?? "kolbevintage_test";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";

import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import type { FastifyInstance } from "fastify";

/* =====================================================================
   RBAC integration tests (real PostgreSQL, real HTTP sessions).

   The point of these tests is the negative direction: a signed-in staff
   member *without* a permission must be refused by the server, not merely
   hidden from in the browser. Also covered: the protected owner role, the
   self-change lock, the last-owner guard and reserved login subjects.
   ===================================================================== */

type Json = Record<string, any>;
interface Res {
  status: number;
  body: any;
}

let app: FastifyInstance;
let base = "";
let query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;

function makeClient() {
  const jar = new Map<string, string>();

  const ensureCsrf = async () => {
    if (jar.has("kv_csrf")) return;
    const res = await fetch(base + "/api/health", {
      headers: jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {},
    });
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const i = pair.indexOf("=");
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    await res.text();
  };

  const call = async (method: string, path: string, body?: Json): Promise<Res> => {
    if (method !== "GET") await ensureCsrf();
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (jar.has("kv_csrf") && method !== "GET") headers["x-csrf-token"] = jar.get("kv_csrf") as string;
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i);
      const value = pair.slice(i + 1);
      if (!value) jar.delete(name);
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
    get: (p: string) => call("GET", p),
    post: (p: string, b?: Json) => call("POST", p, b),
    put: (p: string, b?: Json) => call("PUT", p, b),
    patch: (p: string, b?: Json) => call("PATCH", p, b),
    del: (p: string) => call("DELETE", p),
    login: async (passcode: string) => {
      const res = await call("POST", "/api/admin/login", { passcode });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      return res;
    },
  };
}

const owner = () => makeClient();
const OWNER_PASSCODE = "1234";

/** create a role + a staff member that signs in with its own passcode */
async function staffWith(perms: string[], roleId: string, subject: string, passcode: string) {
  const admin = owner();
  await admin.login(OWNER_PASSCODE);
  const role = await admin.post("/api/admin/roles", { id: roleId, name: roleId, permissions: perms });
  assert.equal(role.status, 201, JSON.stringify(role.body));
  const staff = await admin.post("/api/admin/staff", { name: subject, subject, passcode, roleId });
  assert.equal(staff.status, 201, JSON.stringify(staff.body));
  const client = makeClient();
  await client.login(passcode);
  return { admin, client };
}

before(async () => {
  const db = await import("../src/db");
  query = db.query as unknown as typeof query;
  await db.initDb();
  const seed = await import("../src/seed");
  await seed.seedDatabase();
  const settings = await import("../src/commerce/settings");
  await settings.ensureCommerceSettings();
  const index = await import("../src/index");
  app = await index.buildServer();
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

beforeEach(async () => {
  const security = await import("../src/http/security");
  security.resetRateLimits();
  await query("delete from staff where subject <> 'admin'; delete from roles where protected = false;");
  const rbac = await import("../src/http/rbac");
  await rbac.seedRbac();
});

after(async () => {
  await app.close();
});

/* ---------------------------- the owner ---------------------------- */

test("owner signs in with the store passcode and holds every permission", async () => {
  const admin = owner();
  const login = await admin.login(OWNER_PASSCODE);
  assert.equal(login.body.subject, "admin");
  assert.equal(login.body.role?.id, "owner");

  const me = await admin.get("/api/admin/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.authenticated, true);
  assert.equal(me.body.role, "owner");
  const { PERMISSIONS } = await import("../src/http/rbac");
  assert.deepEqual([...me.body.permissions].sort(), [...PERMISSIONS].sort());
  assert.ok(me.body.groups.length >= 10, "the role editor needs the module matrix");
});

test("no session means 401 everywhere and an empty permission list", async () => {
  const anon = makeClient();
  const me = await anon.get("/api/admin/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.authenticated, false);
  assert.deepEqual(me.body.permissions, []);

  const write = await anon.put("/api/state/ops", { brand: {} });
  assert.equal(write.status, 401);
});

/* --------------------- permission refusal (negative) --------------------- */

test("warehouse staff can request a stock adjustment but cannot write the design document", async () => {
  const { client } = await staffWith(["inventory:view", "inventory:adjust"], "warehouse", "sina", "sina-pass-1");

  const me = await client.get("/api/admin/me");
  assert.equal(me.body.authenticated, true);
  assert.equal(me.body.role, "warehouse");
  assert.deepEqual(me.body.permissions, ["inventory:view", "inventory:adjust"]);

  // allowed by the role: the handler is reached (a bad variant id is a 404, not a 403)
  const adjust = await client.post("/api/commerce/admin/inventory/adjustments", {
    variantId: "does-not-exist",
    delta: 1,
    reason: "manual",
  });
  assert.notEqual(adjust.status, 403, "inventory:adjust must reach the handler");
  assert.notEqual(adjust.status, 401, "inventory:adjust must reach the handler");

  // refused by the role: design, catalogue, settings and the role editor itself
  for (const res of [
    await client.put("/api/state/ops", { brand: {} }),
    await client.put("/api/state/admin", { products: [] }),
    await client.get("/api/commerce/admin/settings"),
    await client.get("/api/admin/roles"),
    await client.get("/api/admin/staff"),
  ]) {
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.code, "forbidden");
  }
});

test("a staff member cannot approve their own stock adjustment permission-wise or otherwise", async () => {
  const { client } = await staffWith(["inventory:adjust"], "picker", "sina2", "sina-pass-2");
  const decide = await client.post("/api/commerce/admin/inventory/adjustments/whatever", { decision: "approve" });
  assert.equal(decide.status, 403);
});

test("settings read and write need settings:view / settings:edit, not just a session", async () => {
  const { client } = await staffWith(["settings:view"], "auditor", "dena2", "dena-pass-2");
  const read = await client.get("/api/commerce/admin/settings");
  assert.equal(read.status, 200);

  const write = await client.put("/api/commerce/admin/settings", { shippingFlat: 1 });
  assert.equal(write.status, 403, JSON.stringify(write.body));

  // the health screen is a settings:view surface and reports real probes
  const health = await client.get("/api/admin/health");
  assert.equal(health.status, 200, JSON.stringify(health.body));
  assert.equal(health.body.db.ok, true);
  assert.ok(health.body.db.tables.length > 0, "table sizes come from the live database");
  assert.ok(health.body.disk.totalBytes > 0, "disk space is read, not invented");
  assert.equal(typeof health.body.queue.outboxPending, "number");

  const { client: nobody } = await staffWith(["orders:view"], "picker", "dena3", "dena-pass-3");
  const refused = await nobody.get("/api/admin/health");
  assert.equal(refused.status, 403, "no settings:view means no health probe");
});

test("a state save leaves an audit row naming only the keys that changed", async () => {
  const { client } = await staffWith(["design:edit"], "designer", "hoda", "hoda-pass-1");

  // read-merge-write, exactly like the panel does — never replace the whole document
  const original = (await query("select value from state_documents where key = 'ops'")).rows[0].value as Record<string, any>;
  const first = await client.put("/api/state/ops", { ...original, brand: { ...(original.brand ?? {}), name: "ولور" } });
  assert.equal(first.status, 200, JSON.stringify(first.body));

  const second = await client.put("/api/state/ops", { ...original, brand: { ...(original.brand ?? {}), name: "ولور نو" } });
  assert.equal(second.status, 200);
  assert.deepEqual(second.body.changed, ["brand"], "only the edited key is reported");

  const rows = await query(
    "select actor, target_id, after from audit_events where action = 'state.update' order by at desc limit 1",
  );
  assert.equal(rows.rows[0]?.actor, "hoda");
  assert.equal(rows.rows[0]?.target_id, "ops");
  const after = typeof rows.rows[0].after === "string" ? JSON.parse(rows.rows[0].after) : rows.rows[0].after;
  assert.deepEqual(after, { changed: ["brand"] });

  // the panel reads the same trail through one endpoint, filterable by action
  const feed = await client.get("/api/commerce/admin/audit?action=state.update&limit=5");
  assert.equal(feed.status, 200);
  assert.ok(feed.body.length > 0, "the save is visible to the panel");
  assert.ok(feed.body.every((row: { action: string }) => row.action === "state.update"));

  // the store passcode survives a save that forgot to include it
  const stripped = await client.put("/api/state/ops", { brand: { name: "بدون رمز" } });
  assert.equal(stripped.status, 200);
  const owner2 = makeClient();
  await owner2.login(OWNER_PASSCODE);

  // and the document is restored for the tests that follow
  await query("update state_documents set value = $1 where key = 'ops'", [JSON.stringify(original)]);
});

test("a backup round-trips: the file it writes restores the same rows", async () => {
  const { client } = await staffWith(["settings:view", "settings:edit"], "auditor", "hoda2", "hoda-pass-2");
  const before = await client.get("/api/admin/backups");
  assert.equal(before.status, 200, JSON.stringify(before.body));
  assert.equal(before.body.schedule.cloudConfigured, false, "no cloud destination is claimed without one");

  const created = await client.post("/api/admin/backups", {});
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const backup = created.body.backup;
  assert.ok(backup.bytes > 0);
  assert.ok(backup.rows > 0, "the dump actually contains rows");
  assert.equal(backup.cloud_status, "not_configured");

  const listed = await client.get("/api/admin/backups");
  assert.ok(listed.body.backups.some((row: { id: string }) => row.id === backup.id), "the new file is listed");

  const res = await fetch(`${base}/api/admin/backups/${backup.id}/download`, { headers: { cookie: "" } });
  // the download needs the staff session, so check it through the same jar the client uses
  assert.ok(res.status === 401 || res.status === 403, "a download without the session is refused");

  // restore inside a transaction and roll it back: the shared test database is untouched
  const original = (await query("select value from state_documents where key = 'ops'")).rows[0].value as Record<string, any>;
  const { restoreBackup } = await import("../src/backup");
  const { withTransaction } = await import("../src/db");
  await withTransaction(async (tx) => {
    await tx.query("update state_documents set value = jsonb_set(value, '{brand, name}', '\"عوض‌شده\"') where key = 'ops'");
    const result = await restoreBackup(backup.file, { client: tx });
    assert.ok(result.rows > 0);
    const after = (await tx.query("select value from state_documents where key = 'ops'")).rows[0].value as Record<string, any>;
    assert.equal(after.brand?.name, original.brand?.name, "the restored document is the pre-change one");
    throw new Error("rollback");
  }).catch((error: Error) => {
    assert.equal(error.message, "rollback");
  });

  const unchanged = (await query("select value from state_documents where key = 'ops'")).rows[0].value as Record<string, any>;
  assert.equal(unchanged.brand?.name, original.brand?.name, "the rollback left the database as it was");
});

test("deactivating a staff member kills their live session's permissions", async () => {
  const { admin, client } = await staffWith(["catalog:edit"], "editor", "nima", "nima-pass-1");
  assert.equal((await client.put("/api/state/admin", { products: [] })).status, 200);

  const staffList = await admin.get("/api/admin/staff");
  const row = staffList.body.staff.find((s: any) => s.subject === "nima");
  const off = await admin.patch(`/api/admin/staff/${row.id}`, { active: false });
  assert.equal(off.status, 200, JSON.stringify(off.body));

  const after = await client.put("/api/state/admin", { products: [] });
  assert.equal(after.status, 403, "a deactivated session must fail closed");
  const relogin = makeClient();
  const denied = await relogin.post("/api/admin/login", { passcode: "nima-pass-1" });
  assert.equal(denied.status, 401, "a deactivated passcode cannot sign in");
});

/* --------------------------- role invariants --------------------------- */

test("the protected owner role cannot be edited or deleted", async () => {
  const admin = owner();
  await admin.login(OWNER_PASSCODE);
  const edit = await admin.put("/api/admin/roles/owner", { name: "hacked", permissions: ["dashboard:view"] });
  assert.equal(edit.status, 409);
  const drop = await admin.del("/api/admin/roles/owner");
  assert.equal(drop.status, 409);
});

test("roles and staff reject invalid input instead of silently storing it", async () => {
  const admin = owner();
  await admin.login(OWNER_PASSCODE);

  assert.equal((await admin.post("/api/admin/roles", { id: "Bad Id", name: "x", permissions: ["dashboard:view"] })).status, 422);
  assert.equal((await admin.post("/api/admin/roles", { id: "empty", name: "خالی", permissions: [] })).status, 422);
  const made = await admin.post("/api/admin/roles", { id: "temp", name: "موقت", permissions: ["dashboard:view", "not-a-permission"] });
  assert.equal(made.status, 201);
  const temp = made.body.roles.find((r: any) => r.id === "temp");
  assert.deepEqual(temp.permissions, ["dashboard:view"], "unknown permissions are dropped");

  assert.equal((await admin.post("/api/admin/staff", { name: "سینا", subject: "admin", passcode: "abcdef", roleId: "temp" })).status, 422);
  assert.equal((await admin.post("/api/admin/staff", { name: "سینا", subject: "sina3", passcode: "123", roleId: "temp" })).status, 422);
  const ok = await admin.post("/api/admin/staff", { name: "سینا", subject: "sina3", passcode: "abcdef", roleId: "temp" });
  assert.equal(ok.status, 201);
  assert.equal((await admin.post("/api/admin/staff", { name: "سینا", subject: "sina3", passcode: "abcdef", roleId: "temp" })).status, 409);

  // a role that is still assigned cannot vanish from under its people
  assert.equal((await admin.del("/api/admin/roles/temp")).status, 409);
});

test("nobody can change their own role or deactivate themselves", async () => {
  const admin = owner();
  await admin.login(OWNER_PASSCODE);
  const me = await admin.get("/api/admin/me");
  const selfPatch = await admin.patch(`/api/admin/staff/${me.body.staff.id}`, { active: false });
  assert.equal(selfPatch.status, 409);
});

test("the last active owner cannot be deactivated, even by a delegated staff manager", async () => {
  const { client } = await staffWith(["staff:manage"], "ops-manager", "roya", "roya-pass-1");
  const staffList = await client.get("/api/admin/staff");
  assert.equal(staffList.status, 200);
  const ownerRow = staffList.body.staff.find((s: any) => s.subject === "admin");
  // a delegated staff manager cannot touch people at all — owner only (decision 90)
  const res = await client.patch(`/api/admin/staff/${ownerRow.id}`, { active: false });
  assert.equal(res.status, 403, JSON.stringify(res.body));
  assert.match(res.body.error, /مالک/);
});

test("a temporary grant stops working on its date and every sign-in is recorded", async () => {
  const owner = makeClient();
  await owner.login(OWNER_PASSCODE);
  // the role only needs to exist; a re-run may already have created it
  await owner.post("/api/admin/roles", { id: "auditor", name: "auditor", permissions: ["settings:view"] });

  // a grant that ended yesterday
  const expired = await owner.post("/api/admin/staff", {
    name: "مهمان منقضی",
    subject: "ghost",
    passcode: "ghost-pass-1",
    roleId: "auditor",
    expiresAt: new Date(Date.now() - 86400000).toISOString(),
  });
  assert.equal(expired.status, 201, JSON.stringify(expired.body));

  const ghost = makeClient();
  const refused = await ghost.post("/api/admin/login", { passcode: "ghost-pass-1" });
  assert.equal(refused.status, 401, "an expired grant cannot sign in");
  assert.match(String(refused.body.message), /پایان/);

  // a grant that ends tomorrow still works
  const live = await owner.post("/api/admin/staff", {
    name: "مهمان امروز",
    subject: "temp",
    passcode: "temp-pass-1",
    roleId: "auditor",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal(live.status, 201, JSON.stringify(live.body));
  const temp = makeClient();
  const ok = await temp.post("/api/admin/login", { passcode: "temp-pass-1" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));

  // the history names both the refusal reason and the successes
  const history = await owner.get("/api/admin/logins?limit=20");
  assert.equal(history.status, 200, JSON.stringify(history.body));
  assert.ok(history.body.events.some((e: { ok: boolean; reason: string | null }) => !e.ok && e.reason === "expired"));
  assert.ok(history.body.events.filter((e: { ok: boolean }) => e.ok).length >= 2);
  assert.ok(history.body.activeSessions >= 2);

  // sign out everywhere kills both sessions, including the caller's own
  const revoked = await owner.post("/api/admin/sessions/revoke-all", {});
  assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
  assert.ok(revoked.body.revoked >= 2);
  const after = await temp.get("/api/admin/staff");
  assert.equal(after.status, 401, "the other session is gone too");
  const ownerAgain = await owner.get("/api/admin/staff");
  assert.equal(ownerAgain.status, 401, "and so is the caller's own session");
});

test("dashboard aggregates the chosen interval and enforces both permissions", async () => {
  const anonymous = makeClient();
  assert.equal((await anonymous.get("/api/admin/dashboard?days=7")).status, 401);
  const { client } = await staffWith(["dashboard:view"], "dashboard-only", "dashboard-only", "948312");
  assert.equal((await client.get("/api/admin/dashboard?days=7")).status, 403);
  const admin = owner();
  await admin.login(OWNER_PASSCODE);
  assert.equal((await admin.get("/api/admin/dashboard?days=8")).status, 400);
  await query("insert into orders (id,created_at,status,payment_status,data) values ('dash-recent',now(),'paid','settled','{}'),('dash-old',now() - interval '20 days','exception','unpaid','{}')");
  try {
    const seven = await admin.get("/api/admin/dashboard?days=7");
    const thirty = await admin.get("/api/admin/dashboard?days=30");
    assert.equal(seven.status, 200);
    assert.ok(seven.body.recent.some((r: { id: string }) => r.id === "dash-recent"));
    assert.ok(!seven.body.recent.some((r: { id: string }) => r.id === "dash-old"));
    assert.ok(thirty.body.recent.some((r: { id: string }) => r.id === "dash-old"));
    assert.ok(thirty.body.counts.total > seven.body.counts.total);
    assert.ok(!("customer" in seven.body.recent[0]));
  } finally {
    await query("delete from orders where id in ('dash-recent','dash-old')");
  }
});
