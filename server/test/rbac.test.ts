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
    cookie: () => [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    csrf: () => jar.get("kv_csrf") ?? "",
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

test("style packs use real storefront settings, authorization, concurrency and rollback", async () => {
  const {admin,client:viewer}=await staffWith(["design:view"],"theme-viewer","theme-viewer-user","theme-viewer-pass");
  const guest=makeClient();
  assert.equal((await guest.get("/api/admin/style-packs")).status,401);
  const initial=await viewer.get("/api/admin/style-packs");assert.equal(initial.status,200);assert.ok(initial.body.packs.length>=10);
  assert.ok(initial.body.packs.some((p:any)=>p.id==="glassmorphism"));assert.ok(initial.body.packs.some((p:any)=>p.id==="soft"));
  assert.equal((await guest.get("/api/public/store-theme")).body.theme,initial.body.active);
  assert.equal((await viewer.patch("/api/admin/style-packs",{theme:"glassmorphism",expectedTheme:initial.body.active})).status,403);
  assert.equal((await admin.patch("/api/admin/style-packs",{theme:"not-a-theme",expectedTheme:initial.body.active})).status,422);
  const original=(await query("select value from state_documents where key='ops'")).rows[0].value;
  try {
    const target=initial.body.active === "glassmorphism" ? "soft" : "glassmorphism";
    const change=await admin.patch("/api/admin/style-packs",{theme:target,expectedTheme:initial.body.active});assert.equal(change.status,200,JSON.stringify(change.body));
    assert.equal((await guest.get("/api/public/store-theme")).body.theme,target);
    const legacy=await admin.put("/api/state/ops",{...original,siteTheme:initial.body.active});assert.equal(legacy.status,200,JSON.stringify(legacy.body));
    assert.equal((await guest.get("/api/public/store-theme")).body.theme,target,"legacy whole-document save must preserve published theme");
    const updated=(await query("select value from state_documents where key='ops'")).rows[0].value;
    assert.equal(updated.siteTheme,target);assert.deepEqual(updated.brand,original.brand);assert.deepEqual(updated.categories,original.categories);
    assert.equal((await admin.patch("/api/admin/style-packs",{theme:"bento",expectedTheme:initial.body.active})).status,409);
    const [a,b]=await Promise.all([admin.patch("/api/admin/style-packs",{theme:"editorial",expectedTheme:target}),admin.patch("/api/admin/style-packs",{theme:"liquid-glass",expectedTheme:target})]);
    assert.deepEqual([a.status,b.status].sort(),[200,409]);
    const current=(await admin.get("/api/admin/style-packs")).body;assert.equal(current.previous,target);
    const rollback=await admin.patch("/api/admin/style-packs",{theme:current.previous,expectedTheme:current.active});assert.equal(rollback.status,200);
    assert.equal((await guest.get("/api/public/store-theme")).body.theme,target);
    assert.ok((await query("select id from audit_events where action='design.theme_published' and target_id='store' order by id desc limit 3")).rows.length===3);
  } finally {await query("update state_documents set value=$1 where key='ops'",[JSON.stringify(original)]);}
});

test("production upgrades an owner plaintext credential without exposing its hash", async () => {
  const {config}=await import("../src/config");const was=config.isProd;
  const adminOriginal=(await query("select value from state_documents where key='admin'")).rows[0].value;
  const opsOriginal=(await query("select value from state_documents where key='ops'")).rows[0].value;
  const password="a-strong-owner-passcode-2026";
  const doc={...adminOriginal,settings:{...adminOriginal.settings,passcode:password}};delete doc.settings.passcodeHash;
  await query("update state_documents set value=$1 where key='admin'",[JSON.stringify(doc)]);
  try {
    config.isProd=true;const client=owner();const login=await client.post("/api/admin/login",{passcode:password});assert.equal(login.status,200,JSON.stringify(login.body));assert.equal(login.body.sessionToken,undefined);
    const after=(await query("select value from state_documents where key='admin'")).rows[0].value;
    assert.equal(after.settings.passcode,undefined);assert.match(after.settings.passcodeHash,/^scrypt\$/);
    const ops=(await query("select value from state_documents where key='ops'")).rows[0].value;assert.equal(ops.security?.passcode,undefined);
    const publicBoot=await makeClient().get("/api/bootstrap");assert.equal(publicBoot.body.admin.settings.passcodeHash,undefined);
    const again=await owner().post("/api/admin/login",{passcode:password});assert.equal(again.status,200);
    assert.ok((await query("select id from audit_events where action='security.owner_credential_migrated'")).rows.length>0);
  } finally {config.isProd=was;await query("update state_documents set value=$1 where key='admin'",[JSON.stringify(adminOriginal)]);await query("update state_documents set value=$1 where key='ops'",[JSON.stringify(opsOriginal)]);}
});

test("production disables legacy whole-document writes and permits only same-origin theme preview frames", async () => {
  const admin=owner();await admin.login(OWNER_PASSCODE);
  const {config}=await import("../src/config");const was=config.isProd;config.isProd=true;
  try {
    const denied=await admin.put("/api/state/ops",{});assert.equal(denied.status,403);assert.equal(denied.body.code,"legacy_write_disabled");
    const preview=await fetch(base+"/?themePreview=soft");assert.equal(preview.headers.get("x-frame-options"),"SAMEORIGIN");
    const normal=await fetch(base+"/");assert.equal(normal.headers.get("x-frame-options"),"DENY");
  } finally {config.isProd=was;}
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

test("bootstrap restricts private data to appropriately authorised staff", async () => {
  const original = (await query("select value from state_documents where key='ops'")).rows[0].value;
  const modified = {...original,tickets:[{id:"private-ticket",email:"secret@example.com"}],returns:[{id:"private-return"}],logs:[{id:"private-log"}],tryonCredits:{"secret@example.com":9}, security:{...original.security,failedAttempts:[{email:"secret@example.com"}]}};
  try {
    await query("update state_documents set value=$1 where key='ops'",[JSON.stringify(modified)]);
    const {client,admin} = await staffWith(["dashboard:view"],"limited-bootstrap","limited-bootstrap-user","limited-bootstrap-pass");
    for (const browser of [makeClient(),client]) {
      const boot = await browser.get("/api/bootstrap");
      assert.equal(boot.status,200,JSON.stringify(boot.body));
      assert.deepEqual(boot.body.ops.tickets,[]);
      assert.deepEqual(boot.body.ops.returns,[]);
      assert.deepEqual(boot.body.ops.logs,[]);
      assert.deepEqual(boot.body.ops.tryonCredits,{});
      assert.equal(boot.body.ops.security.failedAttempts,undefined);
      assert.equal(boot.body.admin.orders,undefined);
      assert.equal(boot.body.admin.customers,undefined);
      assert.ok(!JSON.stringify(boot.body).includes("private-ticket"));
    }
    const ownerBoot = await admin.get("/api/bootstrap");
    assert.equal(ownerBoot.body.ops.tickets[0].id,"private-ticket");
  } finally { await query("update state_documents set value=$1 where key='ops'",[JSON.stringify(original)]); }
});

test("OTP and unverified registration fail closed without a provider", async () => {
  const browser = makeClient();
  const otp = await browser.post("/api/auth/otp/request",{email:"victim@example.com",channel:"email"});
  assert.equal(otp.status,503); assert.equal(otp.body.code,"otp_unavailable");
  assert.equal((await browser.post("/api/auth/otp/verify",{email:"victim@example.com",code:"123456"})).status,503);
  assert.equal((await browser.post("/api/auth/register",{email:"victim@example.com",password:"password123"})).status,503);
  assert.equal((await browser.get("/api/auth/me")).body.customer,null);
});

/* --------------------- permission refusal (negative) --------------------- */

test("order list requires orders:view for staff", async () => {
  const { client } = await staffWith(["inventory:view"], "stockreader", "stock-reader", "stock-reader-pass");
  const orders = await client.get("/api/commerce/orders?all=1");
  assert.equal(orders.status, 403, JSON.stringify(orders.body));
  const admin = owner();
  await admin.login(OWNER_PASSCODE);
  assert.equal((await admin.get("/api/commerce/orders?all=1")).status, 200);
});

test("sensitive panel data and fulfillment require explicit permissions", async () => {
  const { client } = await staffWith(["dashboard:view"], "dashboardreader", "dashboard-reader", "dashboard-reader-pass");
  for (const path of ["/api/customers", "/api/products?all=1", "/api/commerce/admin/inventory/movements", "/api/commerce/admin/inventory/adjustments", "/api/commerce/admin/audit", "/api/commerce/admin/refunds"]) {
    const res = await client.get(path);
    assert.equal(res.status, 403, `${path}: ${JSON.stringify(res.body)}`);
  }
  for (const action of ["receive", "qc"]) {
    const res = await client.post(`/api/commerce/admin/refunds/missing/${action}`, { result: "saleable" });
    assert.equal(res.status, 403, action);
  }
  for (const action of ["picking", "packing", "ship", "deliver", "cancel"]) {
    const res = await client.post(`/api/commerce/orders/missing/${action}`, { confirm: true });
    assert.equal(res.status, 403, action);
  }
});

test("storefront category matching respects explicit assignment and older garment mappings", async () => {
  const {belongsToCategory}=await import("../../src/utils/category-collection");
  const categories=[{id:"coats",name:"پالتو",garments:["coat"]},{id:"gifts",name:"هدیه",garments:[]}];
  assert.equal(belongsToCategory({category:"هدیه",garment:"coat"},"gifts",categories),true);
  assert.equal(belongsToCategory({category:"هدیه",garment:"coat"},"coats",categories),false);
  assert.equal(belongsToCategory({category:"نام قدیمی",garment:"coat"},"coats",categories),true);
  assert.equal(belongsToCategory({category:"نام قدیمی",garment:"coat"},"missing",categories),false);
});

test("flat categories are permission checked, reflected in bootstrap and protect linked data", async () => {
  const {client,admin} = await staffWith(["catalog:view"],"category-reader","category-reader-user","category-reader-pass");
  const ops = (await query("select value from state_documents where key='ops'")).rows[0].value;
  const adminDoc = (await query("select value from state_documents where key='admin'")).rows[0].value;
  const savedSettings = await query("select value from settings where key='categories'");
  let productId = "";
  try {
    const payload={name:"دسته آزمایش",slug:"category-test",active:true};
    assert.equal((await client.post("/api/admin/categories",payload)).status,403);
    assert.equal((await admin.post("/api/admin/categories",{...payload,parentId:"outerwear"})).status,422);
    const created=await admin.post("/api/admin/categories",payload); assert.equal(created.status,201,JSON.stringify(created.body));
    const id=created.body.category.id;
    assert.equal((await admin.post("/api/admin/categories",payload)).status,409);
    assert.equal((await admin.post("/api/admin/categories",{name:"نام دیگر",slug:"category-test"})).status,409);
    const renamed=await admin.patch(`/api/admin/categories/${id}`,{name:"دسته جدید",order:27});
    assert.equal(renamed.status,200,JSON.stringify(renamed.body));
    assert.equal(renamed.body.category.order,27);
    const boot=await makeClient().get("/api/bootstrap");
    assert.ok(boot.body.ops.categories.some((c:any)=>c.id===id && c.name==="دسته جدید"));
    const saved=(await query("select value from settings where key='categories'")).rows[0].value;
    assert.ok(saved.some((c:any)=>c.id===id));
    const product={name:"کالای دسته",category:"دسته جدید",garment:"coat",price:100,colorName:"مشکی",colorHex:"#000000",sizes:["M"],imageUrl:"https://example.com/item.jpg"};
    assert.equal((await admin.post("/api/admin/products",{...product,category:"نام ناشناخته"})).status,422);
    const added=await admin.post("/api/admin/products",product); assert.equal(added.status,201,JSON.stringify(added.body)); productId=added.body.id;
    const blocked=await admin.patch(`/api/admin/categories/${id}`,{name:"نام گمشده"});
    assert.equal(blocked.status,409); assert.equal(blocked.body.code,"category_in_use");
    assert.equal((await admin.patch(`/api/admin/products/${productId}`,{category:"نام ناشناخته"})).status,422);
    const disabled=await admin.patch(`/api/admin/categories/${id}`,{active:false}); assert.equal(disabled.status,200);
    assert.equal((await admin.post("/api/admin/products",product)).status,422);
    assert.equal((await admin.get(`/api/products/${productId}`)).body.category,"دسته جدید");
    const audit=await query("select action from audit_events where target_id=$1",[id]);
    assert.ok(audit.rows.some(a=>a.action==="category.create")); assert.ok(audit.rows.some(a=>a.action==="category.update"));
  } finally {
    if(productId) await query("delete from products where id=$1",[productId]);
    await query("update state_documents set value=$2 where key=$1",["ops",JSON.stringify(ops)]);
    await query("update state_documents set value=$2 where key=$1",["admin",JSON.stringify(adminDoc)]);
    if(savedSettings.rows.length) await query("insert into settings(key,value) values('categories',$1) on conflict(key) do update set value=excluded.value",[JSON.stringify(savedSettings.rows[0].value)]);
    else await query("delete from settings where key='categories'");
  }
});

test("new product is a zero-stock draft shared by catalogue, images and variants", async () => {
  const { client, admin } = await staffWith(["dashboard:view"], "readeronly", "reader-only", "reader-only-pass");
  const payload = { name: "کت آزمایشی", category: "پالتو و کاپشن", garment: "coat", price: 320, description: "توضیح", colorName: "مشکی", colorHex: "#16130f", sizes: ["S", "M"], imageUrl: "https://example.com/item.jpg" };
  assert.equal((await client.post("/api/admin/products", payload)).status, 403);
  const created = await admin.post("/api/admin/products", payload);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.id;
  try {
    const before = await admin.get(`/api/products/${id}`);
    assert.equal(before.body.active, false);
    assert.equal(before.body.name, payload.name);
    assert.equal(before.body.images[0].url, payload.imageUrl);
    const variants = await query("select on_hand, active from product_variants where product_id = $1", [id]);
    assert.equal(variants.rows.length, 2);
    assert.ok(variants.rows.every(v => v.on_hand === 0 && !v.active));
    const boot = await admin.get("/api/bootstrap");
    assert.ok(boot.body.admin.customProducts.some((p: { id: string }) => p.id === id));
    assert.equal(boot.body.ops.productImages[id][0].url, payload.imageUrl);
    assert.equal((await client.post(`/api/admin/products/${id}/images`, {action:"add",url:"https://example.com/photo.jpg"})).status,403);
    const addImage = await admin.post(`/api/admin/products/${id}/images`, {action:"add",url:"https://example.com/photo.jpg",role:"main",colorId:"c1"});
    assert.equal(addImage.status,200,JSON.stringify(addImage.body));
    assert.equal(addImage.body.images.length,2);
    assert.equal(addImage.body.images[0].role,"gallery");
    assert.equal((await admin.get("/api/bootstrap")).body.ops.productImages[id][1].url,"https://example.com/photo.jpg");
    assert.equal((await admin.post(`/api/admin/products/${id}/images`,{action:"remove",imageId:addImage.body.images[0].id})).status,200);
    assert.equal((await admin.post(`/api/admin/products/${id}/images`,{action:"remove",imageId:addImage.body.images[1].id})).status,422);
    const publish = await admin.patch(`/api/admin/products/${id}`, { active: true });
    assert.equal(publish.status, 200, JSON.stringify(publish.body));
    assert.equal((await admin.get(`/api/products/${id}`)).body.active, true);
  } finally {
    const doc = (await query("select value from state_documents where key='admin'")).rows[0].value;
    doc.customProducts = doc.customProducts.filter((p: { id: string }) => p.id !== id);
    const ops = (await query("select value from state_documents where key='ops'")).rows[0].value;
    delete ops.productImages[id];
    await query("update state_documents set value=$2 where key=$1", ["admin", JSON.stringify(doc)]);
    await query("update state_documents set value=$2 where key=$1", ["ops", JSON.stringify(ops)]);
    await query("delete from products where id=$1", [id]);
  }
});

test("product options preserve inventory, reservations and stable variant IDs", async () => {
  const {client,admin}=await staffWith(["catalog:view"],"option-reader","option-reader-user","option-reader-pass");
  const made=await admin.post("/api/admin/products",{name:"تنوع آزمایشی",category:"پالتو و کاپشن",garment:"coat",price:300,colorName:"مشکی",colorHex:"#111111",sizes:["S","M"],imageUrl:"https://example.com/item.jpg"});
  assert.equal(made.status,201,JSON.stringify(made.body));const id=made.body.id as string;
  try {
    const url=`/api/admin/products/${id}/options`;
    assert.equal((await client.post(url,{action:"add_size",label:"XL"})).status,403);
    assert.equal((await admin.post(url,{action:"add_size",label:"XL",stock:900})).status,422);
    assert.equal((await admin.post(url,{action:"add_color",id:"c1",name:"مشکی",hex:"#111111"})).status,422);
    const old=(await query("select * from product_variants where product_id=$1 order by id",[id])).rows;
    await query("update product_variants set on_hand=7,quarantined=1 where id=$1",[old[0].id]);
    await query("insert into stock_reservations(id,checkout_id,variant_id,quantity,status,expires_at) values($1,'fake-checkout',$2,2,'active',now()+interval '15 minutes')",[`option-test-${id}`,old[0].id]);
    const [addColor,addSize]=await Promise.all([admin.post(url,{action:"add_color",name:"آبی",hex:"#123456"}),admin.post(url,{action:"add_size",label:"XL"})]);
    assert.equal(addColor.status,200,JSON.stringify(addColor.body));assert.equal(addSize.status,200,JSON.stringify(addSize.body));
    assert.equal((await admin.post(url,{action:"add_color",name:"  آبی  ",hex:"#123456"})).status,409);
    assert.equal((await admin.post(url,{action:"add_size",label:"xl"})).status,409);
    const detail=(await admin.get(`/api/products/${id}`)).body;
    assert.equal(detail.colors.length,2);assert.equal(detail.sizes.length,3);
    let rows=(await query("select * from product_variants where product_id=$1 order by id",[id])).rows;
    assert.equal(rows.length,6);assert.equal(rows.find(v=>v.id===old[0].id).on_hand,7);assert.equal(rows.find(v=>v.id===old[0].id).quarantined,1);
    assert.ok(rows.filter(v=>!old.some(o=>o.id===v.id)).every(v=>v.on_hand===0 && !v.active));
    assert.equal((await query("select quantity from stock_reservations where id=$1",[`option-test-${id}`])).rows[0].quantity,2);
    const blue=detail.colors.find((c:any)=>c.name==="آبی"), xl=detail.sizes.find((z:any)=>z.label==="XL");
    const blueVariant=(await query("select id,updated_at::text as version from product_variants where product_id=$1 and color_id=$2 limit 1",[id,blue.id])).rows[0];
    const black=detail.colors.find((c:any)=>c.name==="مشکی");
    assert.equal((await admin.post(url,{action:"update_color",id:black.id,name:"ذغالی",hex:black.hex,expected:{name:black.name,hex:black.hex}})).status,409, "used variant identity cannot be changed");
    assert.equal((await admin.post(url,{action:"update_color",id:blue.id,name:"آبی تیره",hex:"#234567",expected:{name:"قدیمی",hex:blue.hex}})).status,409);
    const edited=await admin.post(url,{action:"update_color",id:blue.id,name:"آبی تیره",hex:"#234567",expected:{name:blue.name,hex:blue.hex}});assert.equal(edited.status,200,JSON.stringify(edited.body));
    const staleReceipt=await admin.post("/api/commerce/admin/inventory/operations",{operation:"receive",variantId:blueVariant.id,acceptedQty:2,rejectedQty:0,reference:"test",idempotencyKey:"option-test-receipt-01",expectedVersion:blueVariant.version});
    assert.equal(staleReceipt.status,409);assert.equal(staleReceipt.body.code,"stale_inventory");
    assert.equal((await admin.post(url,{action:"update_size",id:xl.id,label:"XXL",expected:{label:xl.label}})).status,200);
    const after=(await admin.get(`/api/products/${id}`)).body;assert.equal(after.colors.find((c:any)=>c.id===blue.id).name,"آبی تیره");assert.equal(after.sizes.find((z:any)=>z.id===xl.id).label,"XXL");
    const stored=(await query("select value from state_documents where key='admin'")).rows[0].value.customProducts.find((p:any)=>p.id===id);
    assert.deepEqual(stored.colors,after.colors);assert.deepEqual(stored.sizes,after.sizes);
    assert.equal((await admin.patch(`/api/admin/products/${id}`,{active:true})).status,200);
    const published=(await makeClient().get(`/api/products/${id}`)).body;
    assert.equal(published.stock[`${old[0].color_id}:${old[0].size_id}`],4);
    await (await import("../src/commerce/variants")).syncVariants();
    rows=(await query("select * from product_variants where product_id=$1 order by id",[id])).rows;
    assert.equal(rows.length,6);assert.equal(rows.find(v=>v.id===old[0].id).on_hand,7);assert.ok(rows.every(v=>v.active));
    assert.ok((await query("select id from audit_events where target_id=$1 and action like 'catalog.option_%'",[id])).rows.length>=4);
  } finally {
    await query("delete from stock_reservations where id=$1",[`option-test-${id}`]);
    const doc=(await query("select value from state_documents where key='admin'")).rows[0].value;doc.customProducts=doc.customProducts.filter((p:any)=>p.id!==id);
    const ops=(await query("select value from state_documents where key='ops'")).rows[0].value;delete ops.productImages[id];
    await query("update state_documents set value=$2 where key=$1",["admin",JSON.stringify(doc)]);await query("update state_documents set value=$2 where key=$1",["ops",JSON.stringify(ops)]);
    await query("delete from products where id=$1",[id]);
  }
});

test("option changes on legacy products update the projection document without changing existing stock", async () => {
  const admin=owner();await admin.login(OWNER_PASSCODE);
  const original=(await query("select id,colors,sizes from products where is_base=true and jsonb_array_length(sizes)>0 limit 1")).rows[0];assert.ok(original);
  const before=(await query("select id,on_hand,quarantined,sku from product_variants where product_id=$1 order by id",[original.id])).rows;
  const doc=(await query("select value from state_documents where key='admin'")).rows[0].value;const oldEdit=doc.productEdits?.[original.id];
  let addedId="";
  try {
    const result=await admin.post(`/api/admin/products/${original.id}/options`,{action:"add_size",label:"سایز آزمون منحصربه‌فرد"});
    assert.equal(result.status,200,JSON.stringify(result.body));addedId=result.body.sizes.find((size:any)=>size.label==="سایز آزمون منحصربه‌فرد").id;
    const saved=(await query("select value from state_documents where key='admin'")).rows[0].value.productEdits[original.id];
    assert.ok(saved.sizes.some((size:any)=>size.id===addedId));
    const rows=(await query("select id,on_hand,quarantined,sku from product_variants where product_id=$1 and size_id<>$2 order by id",[original.id,addedId])).rows;
    assert.deepEqual(rows,before);
    const created=(await query("select on_hand from product_variants where product_id=$1 and size_id=$2",[original.id,addedId])).rows;
    assert.equal(created.length,original.colors.length);assert.ok(created.every(v=>v.on_hand===0));
  } finally {
    if(addedId) await query("delete from product_variants where product_id=$1 and size_id=$2",[original.id,addedId]);
    await query("update products set colors=$2,sizes=$3 where id=$1",[original.id,JSON.stringify(original.colors),JSON.stringify(original.sizes)]);
    const current=(await query("select value from state_documents where key='admin'")).rows[0].value;
    if(oldEdit===undefined) delete current.productEdits[original.id];else current.productEdits[original.id]=oldEdit;
    await query("update state_documents set value=$1 where key='admin'",[JSON.stringify(current)]);
  }
});

test("product image upload validates pixels, stores WebP and rolls back failed writes", async () => {
  const {client,admin} = await staffWith(["catalog:view"],"image-reader","image-reader-user","image-reader-pass");
  const sharp=(await import("sharp")).default;
  const fs=await import("node:fs/promises"); const path=await import("node:path");
  const {config}=await import("../src/config");
  const input=await sharp({create:{width:4,height:4,channels:3,background:"#880000"}}).png().toBuffer();
  const imageData=`data:image/png;base64,${input.toString("base64")}`;
  const payload={name:"محصول تصویری",category:"پالتو و کاپشن",garment:"coat",price:10,colorName:"قرمز",colorHex:"#880000",sizes:["M"],imageData};
  const uploadedFiles:string[]=[];
  let id="";
  try {
    assert.equal((await client.post("/api/admin/products",payload)).status,403);
    assert.equal((await admin.post("/api/admin/products",{...payload,imageData:`data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`})).status,422);
    const before=new Set(await fs.readdir(config.uploadsDir));
    assert.equal((await admin.post("/api/admin/products",{...payload,category:"نامعتبر"})).status,422);
    assert.deepEqual((await fs.readdir(config.uploadsDir)).filter(f=>f.startsWith("product-")&&!before.has(f)),[]);
    const created=await admin.post("/api/admin/products",payload); assert.equal(created.status,201,JSON.stringify(created.body)); id=created.body.id;
    assert.equal((await makeClient().get(`/api/products/${id}`)).status,401);
    const product=(await admin.get(`/api/products/${id}`)).body;
    const url=product.images[0].url as string; assert.match(url,/^\/uploads\/product-.*\.webp$/);uploadedFiles.push(url);
    const image=await fetch(base+url); assert.equal(image.status,200);
    assert.match(image.headers.get("content-security-policy")??"",/sandbox/);
    assert.equal(image.headers.get("x-content-type-options"),"nosniff");
    const meta=await sharp(Buffer.from(await image.arrayBuffer())).metadata(); assert.equal(meta.format,"webp");
    const extra=await admin.post(`/api/admin/products/${id}/images`,{action:"add",imageData,role:"gallery",colorId:"c1"});
    assert.equal(extra.status,200,JSON.stringify(extra.body)); uploadedFiles.push(extra.body.images[1].url);
    assert.equal((await client.post(`/api/admin/products/${id}/images`,{action:"add",imageData})).status,403);
    assert.equal((await admin.post(`/api/admin/products/${id}/images`,{action:"add",imageData,role:"gallery",colorId:"invalid"})).status,422);
    const after=new Set(await fs.readdir(config.uploadsDir));
    assert.deepEqual([...after].filter(f=>f.startsWith("product-")&&!before.has(f)).sort(),uploadedFiles.map(url=>path.basename(url)).sort());
  } finally {
    if(id){await query("delete from products where id=$1",[id]);
      const doc=(await query("select value from state_documents where key='admin'")).rows[0].value; doc.customProducts=doc.customProducts.filter((p:any)=>p.id!==id);
      const ops=(await query("select value from state_documents where key='ops'")).rows[0].value; delete ops.productImages[id];
      await query("update state_documents set value=$2 where key=$1",["admin",JSON.stringify(doc)]);
      await query("update state_documents set value=$2 where key=$1",["ops",JSON.stringify(ops)]);
    }
    for(const url of uploadedFiles) await fs.unlink(path.join(config.uploadsDir,path.basename(url))).catch(()=>{});
  }
});

test("legacy multipart uploads reject SVG, spoofed images and bogus videos", async () => {
  const admin=owner(); await admin.login(OWNER_PASSCODE);
  const fs=await import("node:fs/promises"); const path=await import("node:path"); const {config}=await import("../src/config");
  async function upload(content:Buffer,mime:string,name:string){
    const form=new FormData(); form.append("file",new Blob([new Uint8Array(content)],{type:mime}),name);
    return fetch(`${base}/api/uploads`,{method:"POST",headers:{cookie:admin.cookie(),"x-csrf-token":admin.csrf()},body:form});
  }
  assert.equal((await upload(Buffer.from("<svg onload='alert(1)'/>"),"image/svg+xml","evil.svg")).status,415);
  assert.equal((await upload(Buffer.from("<html>bad</html>"),"image/png","fake.png")).status,422);
  assert.equal((await upload(Buffer.from("not video"),"video/mp4","fake.mp4")).status,415);
  const sharp=(await import("sharp")).default; const input=await sharp({create:{width:2,height:2,channels:3,background:"#ff0000"}}).png().toBuffer();
  const response=await upload(input,"image/png","safe.png"); assert.equal(response.status,200,await response.clone().text());
  const result=await response.json() as {url:string;mime:string}; assert.equal(result.mime,"image/webp");
  try { const image=await fetch(base+result.url); assert.equal(image.status,200); assert.equal(image.headers.get("x-content-type-options"),"nosniff"); }
  finally { await fs.unlink(path.join(config.uploadsDir,path.basename(result.url))).catch(()=>{}); }
});

test("marketing uses the live pricing tables and never resets coupon usage on sync", async () => {
  const { client, admin } = await staffWith(["dashboard:view"], "norules", "norules-user", "norules-pass");
  assert.equal((await client.get("/api/admin/marketing")).status, 403);
  const before = (await query("select value from state_documents where key='admin'")).rows[0].value;
  const snapshot = JSON.stringify(before);
  const code = "PANELTEST2026";
  let campaignId = "";
  try {
    const campaign = await admin.post("/api/admin/marketing/campaigns", { name:"کمپین آزمون", kind:"percent", scope:"all", value:10, minSpend:0, start:"", end:"", freeShipping:true });
    assert.equal(campaign.status, 201, JSON.stringify(campaign.body)); campaignId = campaign.body.id;
    const coupon = await admin.post("/api/admin/marketing/coupons", {code,kind:"percent",value:5,minSpend:0,usageLimit:10,expires:""});
    assert.equal(coupon.status, 201, JSON.stringify(coupon.body));
    assert.equal((await admin.patch(`/api/admin/marketing/campaigns/${campaignId}`,{active:true})).status, 200);
    assert.equal((await admin.patch(`/api/admin/marketing/coupons/${code}`,{active:true})).status, 200);
    assert.equal((await query("select active from price_rules where id=$1",[campaignId])).rows[0].active,true);
    const variant = (await query("select v.id from product_variants v join products p on p.id=v.product_id where p.price>0 limit 1")).rows[0];
    assert.ok(variant);
    // Isolate the rule from seeded campaigns, which can offer a larger discount.
    await query("update price_rules set active=false where id<>$1",[campaignId]);
    const quote = await makeClient().post("/api/commerce/quote",{items:[{variantId:variant.id,quantity:1}]});
    assert.equal(quote.status,200,JSON.stringify(quote.body));
    assert.equal(quote.body.lines[0].campaignId,campaignId);
    assert.ok(quote.body.campaignDiscount>0);
    assert.equal(quote.body.freeShipping,true);
    assert.equal(quote.body.freeShippingBy,'campaign');
    await query("update coupons set used_count=3 where code=$1",[code]);
    const doc = (await query("select value from state_documents where key='admin'")).rows[0].value;
    const { syncPromotions } = await import("../src/commerce/promotions"); await syncPromotions(doc);
    assert.equal((await query("select used_count from coupons where code=$1",[code])).rows[0].used_count,3);
    assert.equal((await query("select free_shipping from price_rules where id=$1",[campaignId])).rows[0].free_shipping,true);
    assert.ok(doc.campaigns.find((c:any)=>c.id===campaignId)?.active);
    assert.ok(doc.coupons.find((c:any)=>c.code===code)?.active);
  } finally {
    await query("update state_documents set value=$1 where key='admin'",[snapshot]);
    const { syncPromotions } = await import("../src/commerce/promotions"); await syncPromotions(JSON.parse(snapshot));
  }
});

test("brand updates are permission checked and reach public bootstrap", async () => {
  const { client, admin } = await staffWith(["dashboard:view"], "nobrand", "nobrand-user", "nobrand-pass");
  assert.equal((await client.patch("/api/admin/store-brand", {name:"نام تازه"})).status,403);
  const original = (await query("select value from state_documents where key='ops'")).rows[0].value;
  const snapshot = JSON.stringify(original);
  try {
    assert.equal((await admin.patch("/api/admin/store-brand", {name:"نام آزمون",announcement:"سلام",announcementActive:true})).status,200);
    const result = await makeClient().get("/api/bootstrap");
    assert.equal(result.body.ops.brand.name,"نام آزمون");
    assert.equal(result.body.ops.brand.announcement,"سلام");
  } finally {
    await query("update state_documents set value=$1 where key='ops'",[snapshot]);
    await query("update settings set value=$1 where key='brand'",[JSON.stringify(original.brand)]);
  }
});

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

test("non-owner staff with approval permission cannot approve their own adjustment", async () => {
  const {client,admin} = await staffWith(["inventory:adjust","inventory:approve"],"warehouse-both","warehouse-both-user","warehouse-both-pass");
  const variant = (await query("select id from product_variants limit 1")).rows[0];
  assert.ok(variant);
  const created = await client.post("/api/commerce/admin/inventory/adjustments",{variantId:variant.id,delta:1,reason:"آزمون"});
  assert.equal(created.status,201,JSON.stringify(created.body));
  const id = created.body.adjustment.id;
  const self = await client.post(`/api/commerce/admin/inventory/adjustments/${id}`,{decision:"approve"});
  assert.equal(self.status,403); assert.equal(self.body.code,"two_person_rule");
  const approved = await admin.post(`/api/commerce/admin/inventory/adjustments/${id}`,{decision:"approve"});
  assert.equal(approved.status,200,JSON.stringify(approved.body));
});

test("settings read and write need settings:view / settings:edit, not just a session", async () => {
  const { client } = await staffWith(["settings:view"], "auditor", "dena2", "dena-pass-2");
  const read = await client.get("/api/commerce/admin/settings");
  assert.equal(read.status, 200);

  const owner = makeClient(); await owner.login(OWNER_PASSCODE);
  assert.equal((await owner.put("/api/commerce/admin/settings", {shippingFlat:-1})).status,400);
  assert.equal((await owner.put("/api/commerce/admin/settings", {reservationHoldMinutes:0})).status,400);
  assert.equal((await client.get("/api/admin/finance/summary")).status,403);
  const finance = await owner.get("/api/admin/finance/summary");
  assert.equal(finance.status,200,JSON.stringify(finance.body));
  assert.ok(Array.isArray(finance.body.groups));
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
  const { client, admin } = await staffWith(["design:edit"], "designer", "hoda", "hoda-pass-1");

  // read-merge-write, exactly like the panel does — never replace the whole document
  const original = (await query("select value from state_documents where key = 'ops'")).rows[0].value as Record<string, any>;
  assert.equal((await client.put("/api/state/ops", { ...original })).status,403);
  const first = await admin.put("/api/state/ops", { ...original, brand: { ...(original.brand ?? {}), name: "ولور" } });
  assert.equal(first.status, 200, JSON.stringify(first.body));

  const second = await admin.put("/api/state/ops", { ...original, brand: { ...(original.brand ?? {}), name: "ولور نو" } });
  assert.equal(second.status, 200);
  assert.deepEqual(second.body.changed, ["brand"], "only the edited key is reported");

  const rows = await query(
    "select actor, target_id, after from audit_events where action = 'state.update' order by at desc limit 1",
  );
  assert.equal(rows.rows[0]?.actor, "admin");
  assert.equal(rows.rows[0]?.target_id, "ops");
  const after = typeof rows.rows[0].after === "string" ? JSON.parse(rows.rows[0].after) : rows.rows[0].after;
  assert.deepEqual(after, { changed: ["brand"] });

  // the panel reads the same trail through one endpoint, filterable by action
  const feed = await admin.get("/api/commerce/admin/audit?action=state.update&limit=5");
  assert.equal(feed.status, 200);
  assert.ok(feed.body.length > 0, "the save is visible to the panel");
  assert.ok(feed.body.every((row: { action: string }) => row.action === "state.update"));

  // the store passcode survives a save that forgot to include it
  const stripped = await admin.put("/api/state/ops", { brand: { name: "بدون رمز" } });
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
  assert.ok(res.status === 401 || res.status === 403, "a download without the session is refused");
  const staffDownload=await fetch(`${base}/api/admin/backups/${backup.id}/download`,{headers:{cookie:client.cookie()}});
  assert.equal(staffDownload.status,403,"settings privileges alone do not expose full customer backups");
  const ownerClient=owner();await ownerClient.login(OWNER_PASSCODE);
  const ownerDownload=await fetch(`${base}/api/admin/backups/${backup.id}/download`,{headers:{cookie:ownerClient.cookie()}});
  assert.equal(ownerDownload.status,200);assert.ok((await query("select id from audit_events where action='backup.download' and target_id=$1",[backup.id])).rows.length>0);

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
    const max=(await tx.query("select coalesce(max(id),0)::text as n from login_events")).rows[0].n;
    const next=(await tx.query("insert into login_events(subject,ok) values ('restore-test',true) returning id::text")).rows[0].id;
    assert.ok(BigInt(next)>BigInt(max),"restored sequences must not reuse existing IDs");
    assert.equal((await tx.query("select count(*)::int as n from sessions")).rows[0].n,0,"restore invalidates sessions");
    throw new Error("rollback");
  }).catch((error: Error) => {
    assert.equal(error.message, "rollback");
  });

  const unchanged = (await query("select value from state_documents where key = 'ops'")).rows[0].value as Record<string, any>;
  assert.equal(unchanged.brand?.name, original.brand?.name, "the rollback left the database as it was");
});

test("backups preserve large numeric JSON exactly and reject unrecognized restore tables", async () => {
  const {createBackup,restoreBackup}=await import("../src/backup");
  const {withTransaction}=await import("../src/db");
  const fs=await import("node:fs/promises");const os=await import("node:os");const path=await import("node:path");
  const probe="test-backup-precision";
  await query("insert into state_documents(key,value) values($1,$2::jsonb) on conflict(key) do update set value=excluded.value",[probe,'{"amount":900719925474099312345,"fraction":123456789012345.678901}']);
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),"kv-backup-test-"));
  try {
    const [a,b]=await Promise.all([createBackup("manual"),createBackup("manual")]);assert.notEqual(a.file,b.file,"concurrent backups must not overwrite one another");
    await withTransaction(async tx=>{
      await restoreBackup(a.file,{client:tx});
      const value=(await tx.query("select (value->'amount')::text as amount, (value->'fraction')::text as fraction from state_documents where key=$1",[probe])).rows[0];
      assert.equal(String(value.amount),"900719925474099312345");assert.equal(String(value.fraction),"123456789012345.678901");
      throw new Error("rollback");
    }).catch((error:Error)=>assert.equal(error.message,"rollback"));
    const malformed=path.join(directory,"malformed.json");const bad='evil";drop table products;--';
    await fs.writeFile(malformed,JSON.stringify({format:"kv-logical-backup",version:1,tables:[bad],data:{[bad]:[]}}));
    await assert.rejects(()=>restoreBackup(malformed));
    assert.ok((await query("select id from products limit 1")).rows.length,"invalid backup must not modify tables");
  } finally {await query("delete from state_documents where key=$1",[probe]);await fs.rm(directory,{recursive:true,force:true});}
});

test("deactivating a staff member kills their live session's permissions", async () => {
  const { admin, client } = await staffWith(["catalog:view", "catalog:edit"], "editor", "nima", "nima-pass-1");
  assert.equal((await client.get("/api/products?all=1")).status, 200);

  const staffList = await admin.get("/api/admin/staff");
  const row = staffList.body.staff.find((s: any) => s.subject === "nima");
  const off = await admin.patch(`/api/admin/staff/${row.id}`, { active: false });
  assert.equal(off.status, 200, JSON.stringify(off.body));

  const after = await client.get("/api/products?all=1");
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

test("category thumbnail edits are authorized, audited, and reach the storefront document", async () => {
  const admin=owner();await admin.login(OWNER_PASSCODE);
  const all=await admin.get("/api/admin/categories");assert.equal(all.status,200);assert.ok(all.body.length>0);
  const category=all.body[0];const original=category.thumbnail||"";
  const {client}=await staffWith(["catalog:view"],"category-reader","category-reader-user","reader123");
  assert.equal((await client.patch(`/api/admin/categories/${category.id}/thumbnail`,{image:""})).status,403);
  assert.equal((await admin.patch(`/api/admin/categories/${category.id}/thumbnail`,{image:"data:image/png;base64,bm90YW5pbWFnZQ=="})).status,422);
  const sharp=(await import("sharp")).default;const bytes=await sharp({create:{width:4,height:4,channels:3,background:"#123456"}}).png().toBuffer();
  const changed=await admin.patch(`/api/admin/categories/${category.id}/thumbnail`,{image:`data:image/png;base64,${bytes.toString("base64")}`});assert.equal(changed.status,200,JSON.stringify(changed.body));
  const url=changed.body.category.thumbnail;assert.match(url,/^\/uploads\/category-.*\.webp$/);
  const image=await fetch(base+url);assert.equal(image.status,200);assert.match(image.headers.get("content-type")||"",/image\/webp/);
  const boot=await makeClient().get("/api/bootstrap");assert.equal(boot.body.ops.categories.find((c:any)=>c.id===category.id).thumbnail,url);
  const settings=await query("select value from settings where key='categories'");assert.equal(settings.rows[0].value.find((c:any)=>c.id===category.id).thumbnail,url);
  const audit=await query("select * from audit_events where action='category.thumbnail' and target_id=$1 order by id desc limit 1",[category.id]);assert.equal(audit.rows.length,1);
  assert.equal((await admin.patch(`/api/admin/categories/${category.id}/thumbnail`,{image:original})).status,200);
  const {config}=await import("../src/config");const fs=await import("node:fs/promises");await fs.unlink(`${config.uploadsDir}/${url.split("/").pop()}`);
});

test("new-store provisioning is atomic, refuses existing databases and does not seed demo data", async () => {
  const {getPool}=await import("../src/db");const pg=(await import("pg")).default;
  const {randomUUID}=await import("node:crypto");const {spawnSync}=await import("node:child_process");
  const options=getPool().options;
  const baseUrl=options.connectionString ? new URL(options.connectionString) : new URL(`postgresql://${encodeURIComponent(String(options.user))}:${encodeURIComponent(String(options.password))}@${options.host}:${options.port}/postgres`);
  const database=`kv_init_${randomUUID().replace(/-/g,"")}`;const adminUrl=new URL(baseUrl);adminUrl.pathname="/postgres";
  const target=new URL(baseUrl);target.pathname=`/${database}`;
  const admin=new pg.Client({connectionString:adminUrl.toString()});await admin.connect();
  let created=false;
  try {
    await admin.query(`create database "${database}"`);created=true;
    const env={...process.env,NODE_ENV:"production",DATABASE_URL:target.toString(),LOG_LEVEL:"silent"};
    const password="Unique-Store-Owner-9827!";
    const args=["--import","tsx","scripts/provision-store.ts","--confirm-new-empty-store","--store-name=فروشگاه تازه"];
    const weak=spawnSync(process.execPath,args,{env,input:"short\n",encoding:"utf8",timeout:30000});assert.equal(weak.status,1);
    const conn=new pg.Client({connectionString:target.toString()});await conn.connect();
    assert.equal((await conn.query("select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m','S','f')")).rows[0].n,0);
    const ok=spawnSync(process.execPath,args,{env,input:password+"\n",encoding:"utf8",timeout:30000});assert.equal(ok.status,0,ok.stderr);assert.ok(!ok.stdout.includes(password)&&!ok.stderr.includes(password));
    const docs=await conn.query("select key,value from state_documents order by key");assert.deepEqual(docs.rows.map(r=>r.key),["admin","ops"]);
    const adminDoc=docs.rows.find(r=>r.key==="admin")!.value,ops=docs.rows.find(r=>r.key==="ops")!.value;
    assert.equal(adminDoc.settings.passcode,undefined);assert.match(adminDoc.settings.passcodeHash,/^scrypt\$/);const {verifyPassword}=await import("../src/security");assert.equal(verifyPassword(password,adminDoc.settings.passcodeHash),true);
    assert.equal(ops.siteUnderSetup,true);assert.deepEqual(ops.categories,[]);assert.ok(ops.homeSections.every((s:any)=>!s.active));assert.deepEqual(adminDoc.customProducts,[]);
    for(const table of ["products","customers","orders"]) assert.equal((await conn.query(`select count(*)::int as n from ${table}`)).rows[0].n,0);
    const retry=spawnSync(process.execPath,args,{env,input:password+"\n",encoding:"utf8",timeout:30000});assert.equal(retry.status,1);assert.match(retry.stderr,/پایگاه خالی نیست/);
    assert.equal((await conn.query("select count(*)::int as n from audit_events where action='store.initialized'")).rows[0].n,1);
    await conn.end();
    // Boot exactly the real production seed and Fastify routes on this isolated DB.
    const program=`import {initDb,closeDb,query} from './server/src/db.ts'; import {seedDatabase} from './server/src/seed.ts'; import {buildServer} from './server/src/index.ts'; let pass=''; for await (const chunk of process.stdin) pass+=chunk; await initDb(); await seedDatabase(); const app=await buildServer(); const c=await app.inject({method:'GET',url:'/api/csrf'}); const token=JSON.parse(c.body).token; const login=await app.inject({method:'POST',url:'/api/admin/login',headers:{'x-csrf-token':token},payload:{passcode:pass.trim()}}); const boot=await app.inject({method:'GET',url:'/api/bootstrap'}); const data=JSON.parse(boot.body); if(login.statusCode!==200||!data.ops.siteUnderSetup||data.admin.settings.passcodeHash!==undefined) process.exitCode=1; const counts=await query('select (select count(*) from products)::int as products, (select count(*) from customers)::int as customers'); if(counts.rows[0].products||counts.rows[0].customers) process.exitCode=1; await app.close();await closeDb();`;
    const boot=spawnSync(process.execPath,["--import","tsx","--input-type=module","-e",program],{env,input:password,encoding:"utf8",timeout:30000});assert.equal(boot.status,0,boot.stderr);assert.ok(!boot.stdout.includes(password));
  } finally {if(created)await admin.query(`drop database "${database}"`);await admin.end();}
});

test("retired demo-clearing command never truncates data", async () => {
  const {spawnSync}=await import("node:child_process");
  const before=(await query("select count(*)::int as n from products")).rows[0].n;
  const admin=owner();await admin.login(OWNER_PASSCODE);
  const preview=await admin.get("/api/admin/maintenance/purge-preview");assert.equal(preview.body.enabled,false);
  const purge=await admin.post("/api/admin/maintenance/purge-demo",{confirm:"پاک‌سازی دادهٔ نمایشی"});assert.equal(purge.status,410);assert.equal(purge.body.code,"purge_disabled");
  const result=spawnSync(process.execPath,["scripts/clear-demo-data.mjs","--backup=anything","--yes"],{encoding:"utf8"});assert.equal(result.status,1);
  assert.equal((await query("select count(*)::int as n from products")).rows[0].n,before);
});

test("journal keeps drafts private, enforces publication permission, scheduling and version conflicts", async () => {
  const guest=makeClient();const {admin,client:editor}=await staffWith(["content:view","content:edit"],"journal-editor","journal-editor-user","journal-editor-pass");
  const {client:viewer}=await staffWith(["content:view"],"journal-viewer","journal-viewer-user","journal-viewer-pass");
  const original=(await query("select value from state_documents where key='ops'")).rows[0].value;
  const slug=`journal-test-${Date.now()}`;
  const payload={slug,title:"مقاله واقعی",excerpt:"خلاصه",category:"استایل",body:"متن اول\n\nمتن دوم",seoTitle:"",seoDescription:""};
  let id="";let imageUrl="";
  try {
    assert.equal((await guest.get("/api/admin/journal")).status,401);
    const publicBoot=await guest.get("/api/bootstrap");assert.equal(publicBoot.status,200);assert.equal(publicBoot.body.ops.journalBlocks,undefined);assert.equal(publicBoot.body.ops.journalVideos,undefined);
    assert.equal((await viewer.post("/api/admin/journal",payload)).status,403);
    assert.equal((await editor.post("/api/admin/journal",{...payload,slug:"bad/slug"})).status,422);
    const created=await editor.post("/api/admin/journal",payload);assert.equal(created.status,201,JSON.stringify(created.body));id=created.body.id;assert.equal(created.body.status,"draft");
    assert.equal((await editor.post("/api/admin/journal",payload)).status,409);
    assert.equal((await guest.get(`/api/public/journal/${slug}`)).status,404);
    const base={title:payload.title,excerpt:payload.excerpt,category:payload.category,body:payload.body,seoTitle:"",seoDescription:""};
    assert.equal((await editor.patch(`/api/admin/journal/${id}`,{...base,expectedVersion:1,status:"published"})).status,403);
    const settings=await admin.get("/api/admin/journal");
    assert.equal((await editor.patch("/api/admin/journal-settings",{enabled:true,expectedEnabled:settings.body.enabled})).status,403);
    if(!settings.body.enabled) assert.equal((await admin.patch("/api/admin/journal-settings",{enabled:true,expectedEnabled:false})).status,200);
    assert.equal((await admin.patch("/api/admin/journal-settings",{enabled:false,expectedEnabled:false})).status,409);
    const future=new Date(Date.now()+86400000).toISOString();
    const scheduled=await admin.patch(`/api/admin/journal/${id}`,{...base,expectedVersion:1,status:"published",publishedAt:future});assert.equal(scheduled.status,200,JSON.stringify(scheduled.body));assert.equal(scheduled.body.version,2);
    assert.equal((await guest.get(`/api/public/journal/${slug}`)).status,404);
    assert.equal((await editor.patch(`/api/admin/journal/${id}`,{...base,expectedVersion:2,status:"draft"})).status,403);
    assert.equal((await admin.patch(`/api/admin/journal/${id}`,{...base,expectedVersion:1,status:"draft"})).status,409);
    assert.equal((await admin.patch(`/api/admin/journal/${id}`,{...base,expectedVersion:2,status:"published",coverData:"data:image/svg+xml;base64,PHN2Zz4="})).status,422);
    const published=await admin.patch(`/api/admin/journal/${id}`,{...base,expectedVersion:2,status:"published",publishedAt:new Date(Date.now()-1000).toISOString()});assert.equal(published.status,200,JSON.stringify(published.body));
    assert.equal((await guest.get(`/api/public/journal/${slug}`)).body.body,payload.body);
    const sharp=(await import("sharp")).default;const fs=await import("node:fs/promises");const {config}=await import("../src/config");
    const bytes=await sharp({create:{width:3,height:3,channels:3,background:"#123456"}}).png().toBuffer();const data=`data:image/png;base64,${bytes.toString("base64")}`;
    const before=new Set(await fs.readdir(config.uploadsDir));
    assert.equal((await admin.patch(`/api/admin/journal/${id}`,{...base,expectedVersion:1,status:"published",coverData:data})).status,409);
    assert.deepEqual((await fs.readdir(config.uploadsDir)).filter(f=>f.startsWith("product-")&&!before.has(f)),[]);
    const imaged=await admin.patch(`/api/admin/journal/${id}`,{...base,expectedVersion:3,status:"published",publishedAt:published.body.publishedAt,coverData:data});assert.equal(imaged.status,200,JSON.stringify(imaged.body));imageUrl=imaged.body.coverUrl;
    assert.match(imageUrl,/^\/uploads\/product-.*\.webp$/);assert.equal((await guest.get(`/api/public/journal/${slug}`)).body.coverUrl,imageUrl);
    assert.ok((await guest.get("/api/public/journal")).body.items.some((a:any)=>a.slug===slug));
    const [a,b]=await Promise.all([admin.patch(`/api/admin/journal/${id}`,{...base,title:"الف",expectedVersion:4,status:"published",publishedAt:published.body.publishedAt}),admin.patch(`/api/admin/journal/${id}`,{...base,title:"ب",expectedVersion:4,status:"published",publishedAt:published.body.publishedAt})]);
    assert.deepEqual([a.status,b.status].sort(),[200,409]);
    assert.equal((await admin.patch("/api/admin/journal-settings",{enabled:false,expectedEnabled:true})).status,200);
    assert.equal((await guest.get(`/api/public/journal/${slug}`)).status,404);
    assert.deepEqual((await guest.get("/api/public/journal")).body.items,[]);
    const audit=await query("select action from audit_events where target_id=$1",[id]);assert.ok(audit.rows.some((r:any)=>r.action==="journal.created"));assert.ok(audit.rows.some((r:any)=>r.action==="journal.updated"));
  } finally {if(id)await query("delete from journal_articles where id=$1",[id]);await query("update state_documents set value=$1::jsonb where key='ops'",[JSON.stringify(original)]);if(imageUrl){const fs=await import("node:fs/promises");const {config}=await import("../src/config");await fs.unlink(`${config.uploadsDir}/${imageUrl.split("/").pop()}`).catch(()=>{});}}
});

test("print invoice uses order permissions, immutable snapshots, and no-store responses", async () => {
  const {admin,client:restricted}=await staffWith(["inventory:view"],"print-restricted","print-restricted-user","print-restricted-pass");
  const {client:reader}=await staffWith(["orders:view"],"print-reader","print-reader-user","print-reader-pass");
  const id=`print-test-${Date.now()}`;const line=`${id}-line`;const refund=`${id}-refund`;
  try {
    await query(`insert into orders(id,created_at,customer,email,status,total,data,subtotal,discount_total,shipping_total,currency,payment_status,fulfillment_status,tracking_code,carrier_name) values($1,now(),'خریدار','print@example.test','paid',100,$2::jsonb,120,20,0,'IRT','settled','packed','TRACK','پست')`,[id,JSON.stringify({phone:"09120000000",city:"شهر",address:"نشانی واقعی",manual:true})]);
    await query("insert into order_lines(id,order_id,sku,name_snapshot,color_name,size_label,quantity,unit_price,line_total) values($1,$2,'SKU-TEST','کالای ثبت‌شده','آبی','M',1,120,100)",[line,id]);
    await query("insert into refunds(id,order_id,order_line_id,quantity,amount,status) values($1,$2,$3,1,30,'requested')",[refund,id,line]);
    const url=`/api/commerce/orders/${id}/invoice`;
    assert.equal((await makeClient().get(url)).status,404);
    assert.equal((await restricted.get(url)).status,403);
    const result=await reader.get(url);assert.equal(result.status,200,JSON.stringify(result.body));
    assert.equal(result.body.order.lines[0].name,"کالای ثبت‌شده");assert.equal(result.body.order.total,100);assert.equal(result.body.order.address,"نشانی واقعی");
    assert.equal(result.body.adjustments[0].status,"requested");assert.equal(result.body.adjustments[0].amount,30);
    const response=await fetch(base+url,{headers:{cookie:reader.cookie()}});assert.match(response.headers.get("cache-control")||"",/no-store/);
    const orderList=await fetch(base+"/api/commerce/orders?all=1",{headers:{cookie:reader.cookie()}});assert.match(orderList.headers.get("cache-control")||"",/no-store/);
    assert.equal((await admin.get(url)).status,200);
  } finally {await query("delete from orders where id=$1",[id]);}
});

test("older journal-free backups require explicit opt-in and restore only in an isolated database", async () => {
  const {getPool}=await import("../src/db");const {dumpAll}=await import("../src/backup");const pg=(await import("pg")).default;
  const {randomUUID}=await import("node:crypto");const {spawnSync}=await import("node:child_process");const {stringify}=await import("lossless-json");
  const fs=await import("node:fs/promises");const os=await import("node:os");const path=await import("node:path");
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"kv-old-backup-"));const options=getPool().options;
  const baseUrl=options.connectionString?new URL(options.connectionString):new URL(`postgresql://${encodeURIComponent(String(options.user))}:${encodeURIComponent(String(options.password))}@${options.host}:${options.port}/postgres`);
  const name=`kv_restore_${randomUUID().replace(/-/g,"")}`;const adminUrl=new URL(baseUrl);adminUrl.pathname="/postgres";const target=new URL(baseUrl);target.pathname=`/${name}`;
  const admin=new pg.Client({connectionString:adminUrl.toString()});await admin.connect();let created=false;let conn:InstanceType<typeof pg.Client>|undefined;
  const precision=`restore-precision-${randomUUID()}`;
  try {
    await query("insert into state_documents(key,value) values($1,$2::jsonb)",[precision,'{"amount":900719925474099312345,"fraction":123456789012345.678901}']);
    const payload=await dumpAll();for (const row of payload.data.customers) {delete (row as Record<string,unknown>).manual_labels;delete (row as Record<string,unknown>).personal_measurements;}for (const row of payload.data.price_rules) delete (row as Record<string,unknown>).free_shipping;for (const row of payload.data.payment_attempts) delete (row as Record<string,unknown>).quote_snapshot;for (const row of payload.data.checkout_sessions) delete (row as Record<string,unknown>).manual_quote_confirm_required;payload.tables=payload.tables.filter(t=>t!=="journal_articles" && t!=="support_tickets");delete payload.data.journal_articles;delete payload.data.support_tickets;
    const file=path.join(dir,"before-journal.json");await fs.writeFile(file,stringify(payload)!);
    const badFile=path.join(dir,"missing-two.json");const other={...payload,tables:payload.tables.filter(t=>t!=="products"),data:{...payload.data}};delete other.data.products;await fs.writeFile(badFile,stringify(other)!);
    await admin.query(`create database "${name}"`);created=true;conn=new pg.Client({connectionString:target.toString()});await conn.connect();await conn.query(await fs.readFile("server/src/schema.sql","utf8"));
    await conn.query("insert into journal_articles(id,slug,title) values('sentinel','sentinel','should survive refused restore')");
    await conn.query("insert into customers(email,name,password_hash) values('a@example.com','A','test')");
    await conn.query("insert into support_tickets(id,customer_email,subject,create_key) values('sentinel','a@example.com','must survive','sentinel')");
    const env={...process.env,DATABASE_URL:target.toString(),LOG_LEVEL:"silent"};const script=["--import","tsx","scripts/restore-backup.mjs"];
    const noYes=spawnSync(process.execPath,[...script,file,"--allow-empty-journal"],{env,encoding:"utf8",timeout:30000});assert.equal(noYes.status,1);
    const noOptIn=spawnSync(process.execPath,[...script,file,"--yes"],{env,encoding:"utf8",timeout:30000});assert.equal(noOptIn.status,1);assert.match(noOptIn.stderr,/جدول‌های پشتیبان/);
    const missingSupport=spawnSync(process.execPath,[...script,file,"--yes","--allow-empty-journal"],{env,encoding:"utf8",timeout:30000});assert.equal(missingSupport.status,1);
    const missingJournal=spawnSync(process.execPath,[...script,file,"--yes","--allow-empty-support"],{env,encoding:"utf8",timeout:30000});assert.equal(missingJournal.status,1);
    const mismatch=spawnSync(process.execPath,[...script,badFile,"--yes","--allow-empty-journal","--allow-empty-support"],{env,encoding:"utf8",timeout:30000});assert.equal(mismatch.status,1);assert.match(mismatch.stderr,/جدول‌های پشتیبان/);
    assert.equal((await conn.query("select count(*)::int n from journal_articles where id='sentinel'")).rows[0].n,1,"failed restores cannot touch target data");
    assert.equal((await conn.query("select count(*)::int n from support_tickets where id='sentinel'")).rows[0].n,1);
    const ok=spawnSync(process.execPath,[...script,file,"--yes","--allow-empty-journal","--allow-empty-support"],{env,encoding:"utf8",timeout:30000});assert.equal(ok.status,0,ok.stderr);assert.match(ok.stderr,/ژورنال خالی/);
    assert.equal((await conn.query("select count(*)::int n from support_tickets")).rows[0].n,0);
    assert.equal((await conn.query("select count(*)::int n from journal_articles")).rows[0].n,0);assert.equal((await conn.query("select count(*)::int n from products")).rows[0].n,payload.data.products.length);
    assert.equal((await conn.query("select count(*)::int n from customers where manual_labels is not null")).rows[0].n,0,"old backup customers restore without labels");
    assert.equal((await conn.query("select count(*)::int n from customers where personal_measurements is not null")).rows[0].n,0,"old backup cannot manufacture personal measurements");
    assert.equal((await conn.query("select count(*)::int n from price_rules where free_shipping")).rows[0].n,0,"old campaigns restore without the new shipping benefit");
    assert.equal((await conn.query("select count(*)::int n from checkout_sessions where manual_quote_confirm_required is not null")).rows[0].n,0,"old checkouts remain compatible without confirmation column");
    const restored=(await conn.query("select (value->'amount')::text amount,(value->'fraction')::text fraction from state_documents where key=$1",[precision])).rows[0];assert.equal(restored.amount,"900719925474099312345");assert.equal(restored.fraction,"123456789012345.678901");
  }finally {await query("delete from state_documents where key=$1",[precision]);await conn?.end();if(created)await admin.query(`drop database "${name}"`);await admin.end();await fs.rm(dir,{recursive:true,force:true});}
});

test("size templates use real permissions, version conflicts, category assignment and preserve measurements", async () => {
  const {admin,client:viewer}=await staffWith(["catalog:view"],"size-view","size-view-user","size-view-pass");
  const {client:editor}=await staffWith(["catalog:view","catalog:edit"],"size-editor","size-editor-user","size-editor-pass");
  const original=(await query("select value from state_documents where key='ops'")).rows[0].value;
  const previousSettings=(await query("select key,value from settings where key in ('categories','sizeSets')")).rows;
  const guest=makeClient();let id="";
  try {
    assert.equal((await guest.get("/api/admin/size-sets")).status,401);
    assert.equal((await viewer.get("/api/admin/size-sets")).status,200);
    assert.equal((await viewer.post("/api/admin/size-sets",{name:"ممنوع",sizes:["S"]})).status,403);
    assert.equal((await editor.post("/api/admin/size-sets",{name:"آزمون",sizes:["S","s"]})).status,422);
    const name=`الگوی آزمون ${Date.now()}`;const made=await editor.post("/api/admin/size-sets",{name,sizes:["S","M"]});assert.equal(made.status,201,JSON.stringify(made.body));const initial=made.body.sizeSet;id=initial.id;
    assert.equal((await editor.post("/api/admin/size-sets",{name,sizes:["L"]})).status,409);
    const category=await editor.post("/api/admin/categories",{name:`دسته تست ${Date.now()}`,slug:`size-test-${Date.now()}`,sizeSetId:id,active:true});assert.equal(category.status,201,JSON.stringify(category.body));assert.equal(category.body.category.sizeSetId,id);
    const productBefore=(await query("select id,colors,sizes from products order by id limit 1")).rows[0];
    const [a,b]=await Promise.all([editor.patch(`/api/admin/size-sets/${id}`,{name,sizes:["S","M","L"],expected:initial}),editor.patch(`/api/admin/size-sets/${id}`,{name,sizes:["S","M","XL"],expected:initial})]);assert.deepEqual([a.status,b.status].sort(),[200,409]);
    const current=(await editor.get("/api/admin/size-sets")).body.find((s:any)=>s.id===id);assert.equal(current.sizes.length,3);
    const productAfter=(await query("select id,colors,sizes from products where id=$1",[productBefore.id])).rows[0];assert.deepEqual(productAfter,productBefore,"template edits do not mutate product variants");
    const doc=(await query("select value from state_documents where key='ops'")).rows[0].value;doc.sizeSets.find((s:any)=>s.id===id).measurements={S:{chest:92}};await query("update state_documents set value=$1 where key='ops'",[JSON.stringify(doc)]);
    const measured=(await editor.get("/api/admin/size-sets")).body.find((s:any)=>s.id===id);
    assert.equal((await editor.patch(`/api/admin/size-sets/${id}`,{name,sizes:["M"],expected:measured})).body.code,"size_set_measurement_in_use");
    const changed=await editor.patch(`/api/admin/size-sets/${id}`,{name,sizes:["S","M"],expected:measured});assert.equal(changed.status,200,JSON.stringify(changed.body));assert.equal(changed.body.sizeSet.measurements.S.chest,92);
    const staleOps={...doc,sizeSets:original.sizeSets};const legacy=await admin.put("/api/state/ops",staleOps);assert.equal(legacy.status,200,JSON.stringify(legacy.body));
    assert.ok((await editor.get("/api/admin/size-sets")).body.some((s:any)=>s.id===id),"legacy document save cannot erase targeted size sets");
    assert.ok((await query("select action from audit_events where target_id=$1",[id])).rows.some((r:any)=>r.action==="catalog.size_set_updated"));
    const catId=category.body.category.id;
    const endpoint=`/api/admin/size-sets/${id}/measurements`;
    const deletion=`/api/admin/size-sets/${id}/delete`;
    const expected=changed.body.sizeSet;
    assert.equal((await viewer.patch(endpoint,{expected,measurements:{S:{chest:95}},basis:"body"})).status,403);
    assert.equal((await viewer.post(deletion,{expected})).status,403);
    for(const measurements of [{S:{chest:-1}},{S:{chest:501}},{S:{chest:1.123}},{S:{unknown:1}},{XXL:{chest:1}},{S:{}}]) assert.equal((await editor.patch(endpoint,{expected,measurements,basis:"body"})).status,422,JSON.stringify(measurements));
    assert.equal((await editor.patch(endpoint,{expected,measurements:{S:{chest:95}},basis:null})).status,422);
    assert.equal((await editor.patch(endpoint,{expected:initial,measurements:{},basis:null})).status,409);
    assert.equal((await editor.post(deletion,{expected})).body.code,"size_set_in_use");
    const [first,second]=await Promise.all([
      editor.patch(endpoint,{expected,measurements:{S:{chest:95.25},M:{waist:70}},basis:"body"}),
      editor.patch(endpoint,{expected,measurements:{S:{chest:96}},basis:"garment"})
    ]);assert.deepEqual([first.status,second.status].sort(),[200,409]);
    let latest=(await editor.get("/api/admin/size-sets")).body.find((s:any)=>s.id===id);
    assert.equal((await editor.patch(`/api/admin/categories/${catId}`,{sizeSetId:""})).status,200);
    assert.equal((await editor.post(deletion,{expected:latest})).body.code,"size_set_measurement_in_use");
    // Unknown legacy measurements must never be silently rewritten or deleted.
    const injected=(await query("select value from state_documents where key='ops'")).rows[0].value;
    injected.sizeSets.find((s:any)=>s.id===id).measurements={S:{custom:42}};
    await query("update state_documents set value=$1::jsonb where key='ops'",[JSON.stringify(injected)]);
    const unknown=(await editor.get("/api/admin/size-sets")).body.find((s:any)=>s.id===id);
    assert.equal((await editor.patch(endpoint,{expected:unknown,measurements:{},basis:null})).body.code,"size_set_legacy_measurements");
    assert.equal((await editor.post(deletion,{expected:unknown})).body.code,"size_set_measurement_in_use");
    injected.sizeSets[injected.sizeSets.findIndex((s:any)=>s.id===id)]=latest;
    await query("update state_documents set value=$1::jsonb where key='ops'",[JSON.stringify(injected)]);
    const empty=await editor.patch(endpoint,{expected:latest,measurements:{},basis:null});assert.equal(empty.status,200,JSON.stringify(empty.body));latest=empty.body.sizeSet;
    assert.equal((await editor.post(deletion,{expected})).status,409);
    assert.equal((await editor.post(deletion,{expected:latest})).status,200);
    // A stale legacy whole-document write may not restore a dangling category reference.
    const stale=await admin.put("/api/state/ops",{...doc,categories:doc.categories,sizeSets:doc.sizeSets});assert.equal(stale.status,200);
    const saved=(await query("select value from state_documents where key='ops'")).rows[0].value;
    assert.equal(saved.categories.find((c:any)=>c.id===catId).sizeSetId,"");
    assert.ok(!saved.sizeSets.some((s:any)=>s.id===id));
    const actions=(await query("select action from audit_events where target_id=$1",[id])).rows.map((r:any)=>r.action);
    assert.ok(actions.includes("catalog.size_measurements_updated") && actions.includes("catalog.size_set_deleted"));

  } finally {
    await query("update state_documents set value=$1::jsonb where key='ops'",[JSON.stringify(original)]);
    await query("delete from settings where key in ('categories','sizeSets')");for(const row of previousSettings)await query("insert into settings(key,value) values($1,$2::jsonb)",[row.key,JSON.stringify(row.value)]);
  }
});

test("customer labels require customer permissions, independently of campaign permissions", async () => {
  const {admin,client:viewer}=await staffWith(['customers:view'],'labels-view-role','labels-viewer','labels-view-pass');
  const {client:campaign}=await staffWith(['campaigns:view','campaigns:edit'],'labels-campaign-role','labels-campaign-user','labels-campaign-pass');
  const guest=makeClient();
  assert.equal((await guest.get('/api/admin/customer-labels')).status,401);
  assert.equal((await viewer.get('/api/admin/customer-labels')).status,200);
  assert.equal((await campaign.get('/api/admin/customer-labels')).status,403);
  assert.equal((await campaign.post('/api/admin/customer-labels/audience',{labels:[],mode:'any'})).status,403);
  assert.equal((await viewer.post('/api/admin/customer-labels',{name:'ممنوع'})).status,403);
  assert.equal((await viewer.put('/api/admin/customers/ava%40example.com/labels',{labels:[],expected:[]})).status,403);
  const label=await admin.post('/api/admin/customer-labels',{name:`تست ${Date.now()}`});assert.equal(label.status,201);
  assert.equal((await viewer.post('/api/admin/customer-labels/audience',{labels:[label.body.label.id],mode:'any'})).status,200);
  await query("delete from commerce_settings where key='customer_labels_v1'");
});

test("unsupported campaign targeting is never projected or activated as a public discount", async () => {
  const {admin}=await staffWith(["dashboard:view"],"campaign-guard-view","campaign-guard-user","campaign-guard-pass");
  const create=await admin.post('/api/admin/marketing/campaigns',{name:'ناامن',kind:'percent',scope:'all',value:10,minSpend:0,start:'',end:'',audience:{mode:'any',labels:['example']}});
  assert.equal(create.status,422);
  const snapshot=(await query("select value from state_documents where key='admin'")).rows[0].value;
  const saved=JSON.stringify(snapshot),id=`cmp-guard-${Date.now()}`;
  const guarded={id,name:'کمپین محافظت‌شده',kind:'percent',value:90,scope:'all',minSpend:0,start:'',end:'',active:true,audience:{mode:'all',labels:['example']}};
  try {
    const doc={...snapshot,campaigns:[guarded,...(snapshot.campaigns||[])]};
    await query("update state_documents set value=$1::jsonb where key='admin'",[JSON.stringify(doc)]);
    const {syncPromotions}=await import('../src/commerce/promotions');await syncPromotions(doc);
    assert.equal((await query('select active from price_rules where id=$1',[id])).rows[0].active,false);
    const toggled=await admin.patch(`/api/admin/marketing/campaigns/${id}`,{active:true});
    assert.equal(toggled.status,409);assert.equal(toggled.body.code,'campaign_restriction_unsupported');
    const bootstrap=await makeClient().get('/api/bootstrap');assert.equal(bootstrap.status,200);
    assert.ok(!bootstrap.body.admin.campaigns.some((c:any)=>c.id===id));
  } finally {
    await query("update state_documents set value=$1::jsonb where key='admin'",[saved]);
    const {syncPromotions}=await import('../src/commerce/promotions');await syncPromotions(JSON.parse(saved));
  }
});

test("restricted campaign settings save as non-activatable drafts and cannot be silently widened", async () => {
  const {admin}=await staffWith(["dashboard:view"],"campaign-draft-view","campaign-draft-user","campaign-draft-pass");
  const doc=(await query("select value from state_documents where key='admin'")).rows[0].value;
  const snapshot=JSON.stringify(doc);
  const priorLabels=(await query("select value from commerce_settings where key='customer_labels_v1'")).rows[0]?.value;
  const label=await admin.post('/api/admin/customer-labels',{name:`audience-${Date.now()}`,minDeliveredOrders:null});
  assert.equal(label.status,201,JSON.stringify(label.body));
  const audience={mode:'all',labels:[label.body.label.id]};
  const body={name:'پیش‌نویس محدود',kind:'percent',scope:'all',value:20,minSpend:0,start:'2030-01-03',end:'',audience,
    earlyAccess:{mode:'view_purchase',startsAt:'2030-01-02T12:00:00.000Z'}};
  try {
    assert.equal((await admin.post('/api/admin/marketing/campaigns',{...body,earlyAccess:{mode:'view_purchase',startsAt:'2030-01-04T12:00:00.000Z'}})).status,422);
    assert.equal((await admin.post('/api/admin/marketing/campaigns',{...body,earlyAccess:{mode:'view_purchase',startsAt:'2029-02-30T12:00:00.000Z'}})).status,422);
    assert.equal((await admin.post('/api/admin/marketing/campaigns',{...body,audience:null})).status,422);
    const made=await admin.post('/api/admin/marketing/campaigns',body);assert.equal(made.status,201,JSON.stringify(made.body));
    const id=made.body.id;
    const list=await admin.get('/api/admin/marketing');
    assert.equal(list.body.rules.find((r:any)=>r.id===id).restrictedDraft,true);
    assert.equal(list.body.rules.find((r:any)=>r.id===id).audience.mode,'all');
    assert.equal(list.body.rules.find((r:any)=>r.id===id).earlyAccess.mode,'view_purchase');
    assert.ok(list.body.labels.some((l:any)=>l.id===label.body.label.id));
    assert.equal((await query('select active from price_rules where id=$1',[id])).rows[0].active,false);
    const activate=await admin.patch(`/api/admin/marketing/campaigns/${id}`,{active:true});
    assert.equal(activate.status,409);assert.equal(activate.body.code,'campaign_restriction_unsupported');
    const bootstrap=await makeClient().get('/api/bootstrap');assert.ok(!bootstrap.body.admin.campaigns.some((c:any)=>c.id===id));
    const overwritten=await admin.put('/api/state/admin',doc);assert.equal(overwritten.status,409,JSON.stringify(overwritten.body));assert.equal(overwritten.body.code,'campaign_draft_legacy_conflict');
    const latest=(await query("select value from state_documents where key='admin'")).rows[0].value;
    const {syncPromotions}=await import('../src/commerce/promotions');await syncPromotions(latest);
    assert.equal((await query('select active from price_rules where id=$1',[id])).rows[0].active,false);
    const discarded=await admin.post(`/api/admin/marketing/campaigns/${id}/discard`,{});assert.equal(discarded.status,200,JSON.stringify(discarded.body));
    assert.equal((await query('select 1 from price_rules where id=$1',[id])).rowCount,0);
  } finally {
    await query("update state_documents set value=$1::jsonb where key='admin'",[snapshot]);
    const {syncPromotions}=await import('../src/commerce/promotions');await syncPromotions(JSON.parse(snapshot));
    if(priorLabels===undefined)await query("delete from commerce_settings where key='customer_labels_v1'");
    else await query("update commerce_settings set value=$1::jsonb where key='customer_labels_v1'",[JSON.stringify(priorLabels)]);
  }
});

test('customer labels can be deleted only by editors when unchanged and unused', async () => {
  const {admin,client:viewer}=await staffWith(['customers:view'],'label-delete-view','label-delete-viewer','label-delete-pass');
  const before=(await query("select value from commerce_settings where key='customer_labels_v1'")).rows[0]?.value;
  const snapshot=JSON.stringify((await query("select value from state_documents where key='admin'")).rows[0].value);
  const prior=(await query("select manual_labels from customers where email='ava@example.com'")).rows[0].manual_labels;
  const label=(await admin.post('/api/admin/customer-labels',{name:`حذف ${Date.now()}`,minDeliveredOrders:2})).body.label;
  const path=`/api/admin/customer-labels/${label.id}/delete`;
  try {
    assert.equal((await viewer.post(path,{expected:label})).status,403);
    assert.equal((await admin.post(path,{expected:{...label,name:'old'}})).body.code,'label_conflict');
    assert.equal((await admin.put('/api/admin/customers/ava%40example.com/labels',{labels:[label.id],expected:prior??[]})).status,200);
    assert.equal((await admin.post(path,{expected:label})).body.code,'label_assigned');
    assert.equal((await admin.put('/api/admin/customers/ava%40example.com/labels',{labels:[],expected:[label.id]})).status,200);
    const draft=await admin.post('/api/admin/marketing/campaigns',{name:'برچسب در کمپین',kind:'percent',scope:'all',value:10,minSpend:0,start:'',end:'',audience:{mode:'any',labels:[label.id]}});
    assert.equal(draft.status,201,JSON.stringify(draft.body));
    assert.equal((await admin.post(path,{expected:label})).body.code,'label_in_campaign');
    assert.equal((await admin.post(`/api/admin/marketing/campaigns/${draft.body.id}/discard`,{})).status,200);
    assert.equal((await admin.post(path,{expected:label})).status,200);
    assert.ok((await query("select id from audit_events where action='customer_label.deleted' and target_id=$1",[label.id])).rows.length);
  } finally {
    await query("update state_documents set value=$1::jsonb where key='admin'",[snapshot]);
    await query("update customers set manual_labels=$1::jsonb where email='ava@example.com'",[prior===null?null:JSON.stringify(prior)]);
    if(before===undefined)await query("delete from commerce_settings where key='customer_labels_v1'");
    else await query("update commerce_settings set value=$1::jsonb where key='customer_labels_v1'",[JSON.stringify(before)]);
    const {syncPromotions}=await import('../src/commerce/promotions');await syncPromotions(JSON.parse(snapshot));
  }
});

test('label deletion serializes with draft campaign creation', async () => {
  const {admin}=await staffWith(['dashboard:view'],'label-race-view','label-race-viewer','label-race-pass');
  const before=(await query("select value from commerce_settings where key='customer_labels_v1'")).rows[0]?.value;
  const snapshot=JSON.stringify((await query("select value from state_documents where key='admin'")).rows[0].value);
  const label=(await admin.post('/api/admin/customer-labels',{name:`race-${Date.now()}`})).body.label;
  try {
    const [deleted,draft]=await Promise.all([
      admin.post(`/api/admin/customer-labels/${label.id}/delete`,{expected:label}),
      admin.post('/api/admin/marketing/campaigns',{name:'race',kind:'percent',scope:'all',value:10,minSpend:0,start:'',end:'',audience:{mode:'any',labels:[label.id]}}),
    ]);
    assert.ok((deleted.status===200 && draft.status===422) || (deleted.status===409 && draft.status===201),JSON.stringify({deleted,draft}));
    if(draft.status===201) {
      assert.equal(deleted.body.code,'label_in_campaign');
      assert.ok((await admin.get('/api/admin/customer-labels')).body.labels.some((l:any)=>l.id===label.id));
    }
  } finally {
    await query("update state_documents set value=$1::jsonb where key='admin'",[snapshot]);
    if(before===undefined)await query("delete from commerce_settings where key='customer_labels_v1'");
    else await query("update commerce_settings set value=$1::jsonb where key='customer_labels_v1'",[JSON.stringify(before)]);
    const {syncPromotions}=await import('../src/commerce/promotions');await syncPromotions(JSON.parse(snapshot));
  }
});

test('label deletion serializes with customer assignment', async () => {
  const {admin}=await staffWith(['dashboard:view'],'label-assign-race-view','label-assign-race-viewer','label-assign-race-pass');
  const before=(await query("select value from commerce_settings where key='customer_labels_v1'")).rows[0]?.value;
  const prior=(await query("select manual_labels from customers where email='ava@example.com'")).rows[0].manual_labels;
  const oldLabels=prior??[];
  const label=(await admin.post('/api/admin/customer-labels',{name:`assign-race-${Date.now()}`})).body.label;
  try {
    const [deleted,assigned]=await Promise.all([
      admin.post(`/api/admin/customer-labels/${label.id}/delete`,{expected:label}),
      admin.put('/api/admin/customers/ava%40example.com/labels',{labels:[...oldLabels,label.id],expected:oldLabels}),
    ]);
    assert.ok((deleted.status===200 && assigned.status===422) || (deleted.status===409 && assigned.status===200),JSON.stringify({deleted,assigned}));
    if(assigned.status===200)assert.equal(deleted.body.code,'label_assigned');
  } finally {
    await query("update customers set manual_labels=$1::jsonb where email='ava@example.com'",[prior===null?null:JSON.stringify(prior)]);
    if(before===undefined)await query("delete from commerce_settings where key='customer_labels_v1'");
    else await query("update commerce_settings set value=$1::jsonb where key='customer_labels_v1'",[JSON.stringify(before)]);
  }
});

test('payment review list is restricted to staff with finance view permission', async () => {
  const {client:viewer}=await staffWith(['finance:view'],'payment-review-view','payment-review-viewer','payment-review-pass');
  const {client:nonfinance}=await staffWith(['orders:view'],'payment-review-orders','payment-review-orders-user','payment-review-orders-pass');
  const guest=makeClient();
  assert.equal((await guest.get('/api/commerce/admin/payments?status=exception')).status,401);
  assert.equal((await nonfinance.get('/api/commerce/admin/payments?status=exception')).status,403);
  const list=await viewer.get('/api/commerce/admin/payments?status=exception');assert.equal(list.status,200);assert.ok(Array.isArray(list.body));
});

test('support admin permissions separate viewing from replying and closing', async () => {
  const {admin,client:viewer}=await staffWith(['customers:view'],'support-view','support-viewer','support-view-password');
  const {client:editor}=await staffWith(['customers:view','customers:edit'],'support-edit','support-editor','support-edit-password');
  const {client:outsider}=await staffWith(['catalog:view'],'support-other','support-outsider','support-other-password');
  const {randomUUID}=await import('node:crypto');const id=`tkt-${randomUUID()}`;
  await query(`insert into customers(email,name,password_hash) select 'private@example.com','Private',password_hash from customers where email='ava@example.com' on conflict(email) do nothing`);
  await query(`insert into support_tickets(id,customer_email,subject,messages,create_key) values($1,'private@example.com','secret',$2::jsonb,$3)`,[id,JSON.stringify([{id:'original-key-001',role:'customer',text:'private body',at:new Date().toISOString()}]),`key-${randomUUID()}`]);
  try{
    assert.equal((await outsider.get('/api/admin/support/tickets')).status,403);
    assert.equal((await viewer.get(`/api/admin/support/tickets/${id}`)).body.ticket.messages[0].text,'private body');
    assert.equal((await viewer.post(`/api/admin/support/tickets/${id}/messages`,{message:'reply',requestKey:'viewer-message-001'})).status,403);
    assert.equal((await viewer.patch(`/api/admin/support/tickets/${id}`,{status:'closed',expectedStatus:'open'})).status,403);
    assert.equal((await editor.post(`/api/admin/support/tickets/${id}/messages`,{message:'reply',requestKey:'editor-message-001'})).status,200);
    assert.equal((await admin.patch(`/api/admin/support/tickets/${id}`,{status:'closed',expectedStatus:'answered'})).status,200);
  }finally{await query('delete from support_tickets where id=$1',[id]);await query("delete from customers where email='private@example.com'");}
});

test('current backups retain personal measurements when restored inside an isolated transaction', async () => {
  const {createBackup,restoreBackup}=await import('../src/backup');const {withTransaction}=await import('../src/db');const fs=await import('node:fs/promises');
  const values={height:173.5,chest:94,waist:null,hip:101,shoulder:null,sleeve:null,inseam:null};
  const original=(await query("select personal_measurements from customers where email='ava@example.com'")).rows[0].personal_measurements;
  let file='';
  try {
    await query("update customers set personal_measurements=$1::jsonb where email='ava@example.com'",[JSON.stringify(values)]);
    const backup=await createBackup('manual');file=backup.file;
    await withTransaction(async tx=>{
      await tx.query("update customers set personal_measurements=null where email='ava@example.com'");
      await restoreBackup(file,{client:tx});
      assert.deepEqual((await tx.query("select personal_measurements from customers where email='ava@example.com'")).rows[0].personal_measurements,values);
      throw new Error('rollback');
    }).catch((error:Error)=>assert.equal(error.message,'rollback'));
  } finally {
    await query("update customers set personal_measurements=$1::jsonb where email='ava@example.com'",[original===null?null:JSON.stringify(original)]);
    if(file)await fs.unlink(file).catch(()=>undefined);
  }
});

test('journal admin pagination retains older drafts across edits with server permissions', async () => {
  const {client:viewer}=await staffWith(['content:view'],'journal-pages','journal-pages-user','journal-pages-pass');
  const {client:outsider}=await staffWith(['catalog:view'],'journal-no-pages','journal-no-pages-user','journal-no-pages-pass');
  const guest=makeClient();
  await query(`insert into journal_articles(id,slug,title,category,created_at,updated_at)
    select 'article-'||gen_random_uuid(), 'page-fixture-'||g, 'مقاله آزمون '||g, 'test', now()+interval '2 days', now() from generate_series(1,205) g`);
  try {
    assert.equal((await guest.get('/api/admin/journal')).status,401);
    assert.equal((await outsider.get('/api/admin/journal')).status,403);
    assert.equal((await viewer.get('/api/admin/journal?before=bad!')).status,422);
    const first=await viewer.get('/api/admin/journal');assert.equal(first.status,200);assert.equal(first.body.items.length,200);assert.ok(first.body.nextCursor);
    const chosen=first.body.items[0].id;
    await query("update journal_articles set updated_at=now()+interval '20 years' where id=$1",[chosen]);
    const second=await viewer.get(`/api/admin/journal?before=${encodeURIComponent(first.body.nextCursor)}`);assert.equal(second.status,200);
    const all=[...first.body.items,...second.body.items].filter((a:any)=>a.slug.startsWith('page-fixture-'));
    assert.equal(all.length,205);assert.equal(new Set(all.map((a:any)=>a.id)).size,205);
    assert.ok(!second.body.items.some((a:any)=>a.id===chosen));
    assert.ok(!(await guest.get('/api/public/journal')).body.items.some((a:any)=>a.slug.startsWith('page-fixture-')),'drafts never become public through pagination');
  } finally {await query("delete from journal_articles where slug like 'page-fixture-%'");}
});

test('public journal pages expose only currently published articles and respect disabled journal', async () => {
  const admin=owner();await admin.login(OWNER_PASSCODE);const guest=makeClient();
  const original=(await query("select value from state_documents where key='ops'")).rows[0].value;
  const state=await admin.get('/api/admin/journal');
  if(!state.body.enabled)assert.equal((await admin.patch('/api/admin/journal-settings',{enabled:true,expectedEnabled:false})).status,200);
  await query(`insert into journal_articles(id,slug,title,category,status,body,published_at,created_at)
    select 'article-'||gen_random_uuid(), 'public-page-'||g, 'مقاله عمومی '||g,'test','published','متن',now()-interval '1 hour',now()-interval '1 day' from generate_series(1,105) g`);
  await query(`insert into journal_articles(id,slug,title,category,status,body,published_at) values
    ('article-'||gen_random_uuid(),'public-page-secret','draft','test','draft','secret',now()-interval '1 day'),
    ('article-'||gen_random_uuid(),'public-page-future','future','test','published','future',now()+interval '1 day')`);
  try {
    assert.equal((await guest.get('/api/public/journal?before=bad!')).status,422);
    const first=await guest.get('/api/public/journal');assert.equal(first.status,200);assert.equal(first.body.items.length,100);assert.ok(first.body.nextCursor);
    const second=await guest.get(`/api/public/journal?before=${first.body.nextCursor}`);assert.equal(second.status,200);
    const fixtures=[...first.body.items,...second.body.items].filter((a:any)=>/^public-page-\d+$/.test(a.slug));
    assert.equal(fixtures.length,105);assert.equal(new Set(fixtures.map((a:any)=>a.id)).size,105);
    assert.ok(![...first.body.items,...second.body.items].some((a:any)=>['public-page-secret','public-page-future'].includes(a.slug)));
    await query("update journal_articles set status='draft' where id=$1",[first.body.nextCursor]);
    const revoked=await guest.get(`/api/public/journal?before=${first.body.nextCursor}`);assert.deepEqual(revoked.body.items,[]);
    assert.equal((await admin.patch('/api/admin/journal-settings',{enabled:false,expectedEnabled:true})).status,200);
    const disabled=await guest.get(`/api/public/journal?before=${first.body.nextCursor}`);assert.equal(disabled.body.enabled,false);assert.deepEqual(disabled.body.items,[]);assert.equal(disabled.body.nextCursor,null);
    assert.equal((await guest.get(`/api/public/journal/${fixtures[0].slug}`)).status,404);
  } finally {await query("delete from journal_articles where slug like 'public-page-%'");await query("update state_documents set value=$1::jsonb where key='ops'",[JSON.stringify(original)]);}
});

test("product details are authorized, conflict-safe and survive projection without stock changes", async () => {
  const {admin,client:viewer}=await staffWith(["catalog:view"],"product-details-viewer","product-details-user","product-details-pass");
  const created=await admin.post('/api/admin/products',{name:'مشخصات آزمون',category:'پالتو و کاپشن',garment:'coat',price:100,colorName:'مشکی',colorHex:'#111111',sizes:['M','L'],imageUrl:'https://example.com/photo.jpg'});
  assert.equal(created.status,201,JSON.stringify(created.body));const id=created.body.id;
  const snapshot=(p:any)=>({name:p.name,category:p.category,description:p.description,price:p.price,compareAt:p.compareAt,material:p.material,care:p.care,fit:p.fit,origin:p.origin,active:p.active});
  try {
    const original=(await admin.get(`/api/products/${id}`)).body;
    const expected=snapshot(original);
    assert.equal(original.origin,null);
    const freshDocs=await query("select key,value from state_documents where key in ('admin','ops')");const fresh=Object.fromEntries(freshDocs.rows.map(row=>[row.key,row.value]));
    await (await import('../src/projection')).syncProjection(fresh.admin,fresh.ops);
    assert.equal((await admin.get(`/api/products/${id}`)).body.origin,null,'new product origin remains empty after projection');
    const vars=await query('select id,sku,on_hand,quarantined,active from product_variants where product_id=$1 order by id',[id]);
    const payload={expected,price:120,compareAt:180,material:'پشم',care:'خشکشویی',fit:'آزاد',origin:'ایران'};
    assert.equal((await viewer.patch(`/api/admin/products/${id}`,payload)).status,403);
    assert.equal((await admin.patch(`/api/admin/products/${id}`,{...payload,compareAt:100})).status,422);
    assert.equal((await admin.patch(`/api/admin/products/${id}`,{...payload,price:120.001})).status,422);
    assert.equal((await admin.patch(`/api/admin/products/${id}`,{...payload,compareAt:180.001})).status,422);
    assert.equal((await admin.patch(`/api/admin/products/${id}`,{...payload,material:'x'.repeat(2001)})).status,422);
    const [one,two]=await Promise.all([admin.patch(`/api/admin/products/${id}`,payload),admin.patch(`/api/admin/products/${id}`,payload)]);
    assert.deepEqual([one.status,two.status].sort(),[200,409]);
    assert.equal((one.status===409?one:two).body.code,'product_stale');
    let saved=(await admin.get(`/api/products/${id}`)).body;
    assert.equal(saved.price,120);assert.equal(saved.compareAt,180);assert.equal(saved.material,'پشم');assert.equal(saved.care,'خشکشویی');assert.equal(saved.fit,'آزاد');assert.equal(saved.origin,'ایران');
    assert.deepEqual((await query('select id,sku,on_hand,quarantined,active from product_variants where product_id=$1 order by id',[id])).rows,vars.rows);
    const {syncProjection}=await import('../src/projection');
    const docs=await query("select key,value from state_documents where key in ('admin','ops')");const map=Object.fromEntries(docs.rows.map(row=>[row.key,row.value]));
    await syncProjection(map.admin,map.ops);
    saved=(await admin.get(`/api/products/${id}`)).body;
    assert.equal(saved.compareAt,180);assert.equal(saved.material,'پشم');assert.equal(saved.care,'خشکشویی');assert.equal(saved.fit,'آزاد');assert.equal(saved.origin,'ایران');
    assert.equal((await admin.patch(`/api/admin/products/${id}`,{expected:snapshot(saved),compareAt:null,material:null,origin:null})).status,200);
    const cleared=(await admin.get(`/api/products/${id}`)).body;assert.equal(cleared.compareAt,null);assert.equal(cleared.material,null);assert.equal(cleared.origin,null);
    const updated=await query("select key,value from state_documents where key in ('admin','ops')");const doc=Object.fromEntries(updated.rows.map(row=>[row.key,row.value]));await syncProjection(doc.admin,doc.ops);
    const rebuilt=(await admin.get(`/api/products/${id}`)).body;assert.equal(rebuilt.compareAt,null);assert.equal(rebuilt.material,null);assert.equal(rebuilt.origin,null);
    assert.equal((await admin.patch(`/api/admin/products/${id}`,{active:true})).status,200);
    const publicProduct=(await makeClient().get(`/api/products/${id}`)).body;assert.equal(publicProduct.care,'خشکشویی');assert.equal(publicProduct.fit,'آزاد');
    assert.ok((await query("select 1 from audit_events where target_id=$1 and action='catalog.product_updated'",[id])).rowCount);
    assert.ok((await query("select 1 from price_history where product_id=$1 and new_price=120",[id])).rowCount);
  } finally {
    const doc=(await query("select value from state_documents where key='admin'")).rows[0].value;doc.customProducts=doc.customProducts.filter((p:any)=>p.id!==id);doc.hidden=(doc.hidden??[]).filter((p:string)=>p!==id);
    const ops=(await query("select value from state_documents where key='ops'")).rows[0].value;delete ops.productImages[id];
    await query("update state_documents set value=$2 where key=$1",['admin',JSON.stringify(doc)]);await query("update state_documents set value=$2 where key=$1",['ops',JSON.stringify(ops)]);await query('delete from products where id=$1',[id]);
  }
});

test('base product details and explicit removals survive catalog projection', async () => {
  const admin=owner();await admin.login(OWNER_PASSCODE);
  const id=(await query('select id from products where is_base=true order by id limit 1')).rows[0].id;
  const initial=(await query("select value from state_documents where key='admin'")).rows[0].value;
  const ops=(await query("select value from state_documents where key='ops'")).rows[0].value;
  const {syncProjection}=await import('../src/projection');
  try {
    const changed=await admin.patch(`/api/admin/products/${id}`,{material:'پارچه آزمون',care:'نگهداری آزمون',fit:'فرم آزمون',origin:'ایران',compareAt:null});assert.equal(changed.status,200,JSON.stringify(changed.body));
    let doc=(await query("select value from state_documents where key='admin'")).rows[0].value;await syncProjection(doc,ops);
    let result=(await admin.get(`/api/products/${id}`)).body;assert.equal(result.material,'پارچه آزمون');assert.equal(result.care,'نگهداری آزمون');assert.equal(result.fit,'فرم آزمون');assert.equal(result.origin,'ایران');assert.equal(result.compareAt,null);
    assert.equal((await admin.patch(`/api/admin/products/${id}`,{material:null,care:null,origin:null})).status,200);
    doc=(await query("select value from state_documents where key='admin'")).rows[0].value;await syncProjection(doc,ops);
    result=(await admin.get(`/api/products/${id}`)).body;assert.equal(result.material,null);assert.equal(result.care,null);assert.equal(result.origin,null);
  } finally {await query("update state_documents set value=$1::jsonb where key='admin'",[JSON.stringify(initial)]);await syncProjection(initial,ops);}
});
