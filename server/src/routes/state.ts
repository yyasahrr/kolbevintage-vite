import type { FastifyInstance } from "fastify";
import { query } from "../db";
import { syncProjection } from "../projection";
import { getDocument, putDocument } from "../seed";
import { readSession } from "../sessions";
import { requireAdminSession } from "../commerce/auth";
import { publicCustomer } from "./auth";

const ADMIN_KEYS = new Set(["admin", "ops"]);

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
    // a real admin session: the optional dev guard is not enough for writes
    await requireAdminSession(req);
    const body = req.body;
    if (!body || typeof body !== "object") return reply.code(400).send({ error: "بدنهٔ نامعتبر." });

    await putDocument(key, body);

    const admin = key === "admin" ? (body as Record<string, never>) : ((await getDocument("admin")) as Record<string, never>);
    const ops = key === "ops" ? (body as Record<string, never>) : ((await getDocument("ops")) as Record<string, never>);
    if (admin && ops) await syncProjection(admin, ops);

    return { ok: true, savedAt: new Date().toISOString() };
  });
}
