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
  const res = await client.patch(`/api/admin/staff/${ownerRow.id}`, { active: false });
  assert.equal(res.status, 409, JSON.stringify(res.body));
  assert.match(res.body.error, /مالک/);
});
