import type { FastifyInstance } from "fastify";
import { config } from "../config";
import { query, withTransaction } from "../db";
import { syncProjection } from "../projection";
import { getDocument } from "../seed";
import { readSession } from "../sessions";
import { requirePermission, requireOwnerRole, permissionsFor, roleForSubject, type Permission } from "../http/rbac";
import { recordAudit } from "../commerce/audit";
import { publicCustomer } from "./auth";
import { conflict } from "../commerce/errors";
import { hasUnsupportedCampaignRestrictions } from "../commerce/promotions";

const ADMIN_KEYS = new Set(["admin", "ops"]);

/**
 * Which permission a document write needs. The admin document carries the
 * catalogue, orders and customer records, the ops document carries content and
 * design; until each module gets its own endpoint this is the honest mapping.
 */
const KEY_PERMISSION: Record<string, Permission> = {
  admin: "catalog:edit",
  ops: "design:edit",
};

const SECRET_KEY = /(secret|private|api[_-]?key|token|password|passcode|^key$|^apiKey$)/i;

/** deep copy with credential-looking fields replaced by a placeholder */
function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY.test(key) && inner !== null && inner !== "" ? "***" : redact(inner);
  }
  return out;
}

/**
 * The storefront boots from these documents, so an unauthenticated visitor must
 * never receive the admin panel's private half: staff passcode, order list,
 * customer records and provider credentials. Public fields (shipping numbers,
 * campaign labels) stay so the shop keeps working before login.
 */
function publicAdminDoc(doc: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!doc) return null;
  const clone: Record<string, unknown> = { ...doc };
  for (const key of ["passcode", "orders", "customers", "security"]) delete clone[key];
  if (clone.settings && typeof clone.settings === "object") {
    // the staff passcode lives under settings.passcode in the legacy document
    const settings = { ...(clone.settings as Record<string, unknown>) };
    for (const field of Object.keys(settings)) if (SECRET_KEY.test(field)) delete settings[field];
    clone.settings = settings;
  }
  // Drafts, stock movements and coupon codes are not public storefront data.
  clone.movements = [];
  clone.coupons = [];
  // Targeted and unsupported campaigns are private to the admin document;
  // personalized eligibility is returned only by the server quote endpoints.
  for (const key of ["campaigns", "discountRules"]) {
    if (Array.isArray(clone[key])) clone[key] = (clone[key] as any[]).filter(item => !item || typeof item !== "object" || item.audience == null && !hasUnsupportedCampaignRestrictions(item));
  }
  if (Array.isArray(clone.customProducts)) clone.customProducts = clone.customProducts.filter((product: any) => product?.active === true);
  if (Array.isArray(clone.customLooks)) clone.customLooks = clone.customLooks.filter((look: any) => look?.published === true);
  if (Array.isArray(clone.reviews)) clone.reviews = clone.reviews.filter((review: any) => review?.approved === true);
  if (clone.integrations && typeof clone.integrations === "object") {
    const integrations = clone.integrations as Record<string, unknown>;
    clone.integrations = Object.fromEntries(
      Object.entries(integrations).map(([name, config]) => {
        if (!config || typeof config !== "object") return [name, config];
        const entry = config as Record<string, unknown>;
        return [
          name,
          {
            // only the capability flags are needed to render the shop
            enabled: entry.enabled,
            mode: entry.mode,
            provider: entry.provider,
          },
        ];
      }),
    );
  }
  return clone;
}


export async function stateRoutes(app: FastifyInstance) {
  /** everything the SPA needs on boot */
  app.get("/api/bootstrap", async (req) => {
    const docs = await query<{ key: string; value: unknown; updated_at: string }>(
      "select key, value, updated_at from state_documents",
    );
    const map = Object.fromEntries(docs.rows.map((r) => [r.key, r.value]));
    const updatedAt = Object.fromEntries(docs.rows.map((r) => [r.key, r.updated_at]));

    const session = await readSession(req);
    let customer = null;
    if (session?.kind === "customer") {
      const res = await query<Parameters<typeof publicCustomer>[0]>("select * from customers where email = $1", [session.subject]);
      const row = res.rows[0];
      customer = row ? publicCustomer(row) : null;
    }

    const isAdmin = session?.kind === "admin";
    const permissions = isAdmin ? await permissionsFor(session.subject) : [];
    const role = isAdmin ? await roleForSubject(session.subject) : null;
    const isOwner = isAdmin && ((config.panelOpenAccess && session.subject === "review-owner") || role?.roleId === "owner" || role?.roleId === "superadmin");
    const responseAdmin = isOwner
      ? (redact(map.admin ?? null) as Record<string, unknown> | null)
      : publicAdminDoc((map.admin as Record<string, unknown> | null) ?? null);
    if (responseAdmin && isAdmin && permissions.includes("customers:view") && !isOwner) {
      responseAdmin.customers = (map.admin as Record<string,unknown> | undefined)?.customers ?? {};
    }
    if (responseAdmin && isAdmin && permissions.includes("orders:view")) {
      const orderRows = await query<{data:unknown}>("select data from orders order by created_at desc limit 400");
      responseAdmin.orders = orderRows.rows.map(row=>row.data);
    } else if (responseAdmin && session?.kind === "customer") {
      // Do not disclose historical guest orders merely because an unverified
      // registration claims the same email; require the checkout's account link.
      const orderRows = await query<{data:unknown}>(`select o.data from orders o join checkout_sessions c on c.id=o.checkout_id where c.customer_email=$1 order by o.created_at desc limit 100`,[session.subject]);
      responseAdmin.orders = orderRows.rows.map(row=>row.data);
    } else if (responseAdmin) delete responseAdmin.orders;

    const sourceOps = (map.ops as Record<string,unknown> | null) ?? {};
    const publicKeys = ["brand","siteTheme","siteUnderSetup","categories","homeCategoryIds","colorLibrary","sizeSets","homeSections","productImages","productVideos","colorMedia","hoverMedia","sizeGuides","features","categorySort","seo","cashbackRate","tryonPackages","formFields","megaMenus","widgets","faqs","lookProducts","lookImages"];
    const safeOps:Record<string,unknown> = Object.fromEntries(publicKeys.filter(key=>key in sourceOps).map(key=>[key,sourceOps[key]]));
    const security = (sourceOps.security && typeof sourceOps.security === "object" ? sourceOps.security : {}) as Record<string,unknown>;
    safeOps.security = {allowCustomerSignup:security.allowCustomerSignup, otpChannels:security.otpChannels};
    // Explicit empty values prevent the legacy client from restoring demo data.
    Object.assign(safeOps,{cashbackTxns:[],tryonRequests:[],tryonCredits:{},tickets:[],returns:[],logs:[],issues:[],smsCampaigns:[],smsTemplates:[],labels:[],replyTemplates:[]});
    const responseOps = isOwner ? redact(map.ops ?? null) : safeOps;

    return {
      admin: responseAdmin,
      ops: responseOps,
      auth: { admin: session?.kind === "admin", customer },
      updatedAt,
      server: { version: 1, time: new Date().toISOString() },
    };
  });

  app.put<{ Params: { key: string }; Body: unknown }>("/api/state/:key", async (req, reply) => {
    const { key } = req.params;
    if (!ADMIN_KEYS.has(key)) return reply.code(404).send({ error: "سند ناشناخته است." });
    // a real admin session *with* the permission for this document
    const session = await requirePermission(req, KEY_PERMISSION[key]);
    // A legacy whole-document write can change financial, customer and security
    // data irrespective of the nominal permission. Restrict it to the owner;
    // staff must use narrowly-scoped APIs.
    await requireOwnerRole(session);
    // Full-document projection is a legacy compatibility path and can bypass
    // transactional stock/finance services. It must never run in production.
    if (config.isProd) return reply.code(403).send({error:"ذخیره سند کامل در محیط عملیاتی غیرفعال است.",code:"legacy_write_disabled"});
    const body = req.body;
    if (!body || typeof body !== "object") return reply.code(400).send({ error: "بدنهٔ نامعتبر." });

    // every panel save leaves a trail: which top-level keys changed (decision 36)
    const before = (await getDocument<Record<string, unknown>>(key)) ?? {};
    const after = body as Record<string, unknown>;

    // a save must never wipe the store passcode by omission — that would lock the
    // owner out of their own panel (decision 30: owner recovery)
    const stored = (await getDocument<Record<string, any>>(key)) ?? {};
    if (key === "ops" && stored.security?.passcode && !(body as any).security?.passcode) {
      (body as any).security = { ...(body as any).security, passcode: stored.security.passcode };
    }
    if (key === "admin" && stored.settings?.passcode && !(body as any).settings?.passcode) {
      (body as any).settings = { ...(body as any).settings, passcode: stored.settings.passcode };
    }

    if (key === "ops") {
      // Full legacy writes must not undo a targeted theme publication. Lock
      // the same document row and preserve targeted theme, categories, size templates and color library inside the lock.
      await withTransaction(async client => {
        const row=await client.query<{value:Record<string,any>}>("select value from state_documents where key='ops' for update");
        const current=row.rows[0]?.value ?? {};
        const next=body as Record<string,any>;
        for (const field of ["siteTheme","previousSiteTheme","sizeSets","categories","colorLibrary","homeCategoryIds","productVideos"]) {
          if (Object.prototype.hasOwnProperty.call(current,field)) next[field]=current[field];
          else delete next[field];
        }
        if(current.security?.passcode && !next.security?.passcode) next.security={...(next.security ?? {}),passcode:current.security.passcode};
        await client.query("insert into state_documents(key,value,updated_at) values('ops',$1::jsonb,now()) on conflict(key) do update set value=excluded.value,updated_at=now()",[JSON.stringify(next)]);
      });
    } else {
      // Legacy whole-document writes can omit fields they do not understand.
      // Never let one erase the restrictions of a saved draft and turn it into
      // an unrestricted campaign. Targeted APIs manage these drafts instead.
      await withTransaction(async client => {
        const current=(await client.query<{value:Record<string,any>}>("select value from state_documents where key='admin' for update")).rows[0]?.value ?? {};
        const next=body as Record<string,any>;
        // Custom looks are managed by their permission-checked, versioned API.
        if (Object.prototype.hasOwnProperty.call(current,"customLooks")) next.customLooks=current.customLooks;
        else delete next.customLooks;
        const customIds=new Set(Array.isArray(current.customLooks)?current.customLooks.map((look:any)=>look?.id):[]);
        const hiddenBase=Array.isArray(next.hiddenLooks)?next.hiddenLooks.filter((id:unknown)=>!customIds.has(id)):[];
        next.hiddenLooks=[...hiddenBase,...(Array.isArray(current.hiddenLooks)?current.hiddenLooks.filter((id:unknown)=>customIds.has(id)):[])];
        const restricted=(doc:Record<string,any>) => ["campaigns","discountRules"].some(field => Array.isArray(doc[field]) && doc[field].some((item:any)=>item && typeof item === "object" && (item.audience != null || hasUnsupportedCampaignRestrictions(item))));
        if (restricted(current) || restricted(next)) throw conflict("سند قدیمی با پیش‌نویس محدود سازگار نیست؛ از پنل کمپین‌ها استفاده کنید.","campaign_draft_legacy_conflict");
        await client.query("insert into state_documents(key,value,updated_at) values('admin',$1::jsonb,now()) on conflict(key) do update set value=excluded.value,updated_at=now()",[JSON.stringify(next)]);
      });
    }
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((field) => {
      // credentials are never copied into the audit log
      if (SECRET_KEY.test(field)) return false;
      return JSON.stringify(before[field]) !== JSON.stringify(after[field]);
    });

    const admin = key === "admin" ? (body as Record<string, never>) : ((await getDocument("admin")) as Record<string, never>);
    const ops = key === "ops" ? (body as Record<string, never>) : ((await getDocument("ops")) as Record<string, never>);
    if (admin && ops) await syncProjection(admin, ops);

    if (changed.length > 0) {
      await recordAudit({
        actor: session.subject,
        action: "state.update",
        targetType: `state_${key}`,
        targetId: key,
        after: { changed },
        requestId: req.id,
      });
    }

    return { ok: true, savedAt: new Date().toISOString(), changed };
  });
}
