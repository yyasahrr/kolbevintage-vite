import type { FastifyInstance } from "fastify";
import { query } from "../db";
import { syncProjection } from "../projection";
import { getDocument, putDocument } from "../seed";
import { readSession } from "../sessions";
import { requirePermission, type Permission } from "../http/rbac";
import { recordAudit } from "../commerce/audit";
import { publicCustomer } from "./auth";

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
    delete settings.passcode;
    clone.settings = settings;
  }
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
    return {
      admin: isAdmin
        ? redact(map.admin ?? null)
        : publicAdminDoc((map.admin as Record<string, unknown> | null) ?? null),
      // the ops document can carry the same staff passcode under security
      ops: isAdmin
        ? redact(map.ops ?? null)
        : (() => {
            const doc = { ...((map.ops as Record<string, unknown> | null) ?? {}) };
            if (doc.security && typeof doc.security === "object") {
              const security = { ...(doc.security as Record<string, unknown>) };
              delete security.passcode;
              doc.security = security;
            }
            return doc;
          })(),
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
    const body = req.body;
    if (!body || typeof body !== "object") return reply.code(400).send({ error: "بدنهٔ نامعتبر." });

    // every panel save leaves a trail: which top-level keys changed (decision 36)
    const before = (await getDocument<Record<string, unknown>>(key)) ?? {};
    const after = body as Record<string, unknown>;
    const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((field) => {
      // credentials are never copied into the audit log
      if (SECRET_KEY.test(field)) return false;
      return JSON.stringify(before[field]) !== JSON.stringify(after[field]);
    });

    // a save must never wipe the store passcode by omission — that would lock the
    // owner out of their own panel (decision 30: owner recovery)
    const stored = (await getDocument<Record<string, any>>(key)) ?? {};
    if (key === "ops" && stored.security?.passcode && !(body as any).security?.passcode) {
      (body as any).security = { ...(body as any).security, passcode: stored.security.passcode };
    }
    if (key === "admin" && stored.settings?.passcode && !(body as any).settings?.passcode) {
      (body as any).settings = { ...(body as any).settings, passcode: stored.settings.passcode };
    }

    await putDocument(key, body);

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
