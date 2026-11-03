import type { FastifyInstance } from "fastify";
import { query } from "../db";
import { syncProjection } from "../projection";
import { getDocument, putDocument } from "../seed";
import { readSession, requireAdmin } from "../sessions";
import { publicCustomer } from "./auth";

const ADMIN_KEYS = new Set(["admin", "ops"]);

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

    return {
      admin: map.admin ?? null,
      ops: map.ops ?? null,
      auth: { admin: session?.kind === "admin", customer },
      updatedAt,
      server: { version: 1, time: new Date().toISOString() },
    };
  });

  app.put<{ Params: { key: string }; Body: unknown }>("/api/state/:key", async (req, reply) => {
    const { key } = req.params;
    if (!ADMIN_KEYS.has(key)) return reply.code(404).send({ error: "سند ناشناخته است." });
    await requireAdmin(req);
    const body = req.body;
    if (!body || typeof body !== "object") return reply.code(400).send({ error: "بدنهٔ نامعتبر." });

    await putDocument(key, body);

    const admin = key === "admin" ? (body as Record<string, never>) : ((await getDocument("admin")) as Record<string, never>);
    const ops = key === "ops" ? (body as Record<string, never>) : ((await getDocument("ops")) as Record<string, never>);
    if (admin && ops) await syncProjection(admin, ops);

    return { ok: true, savedAt: new Date().toISOString() };
  });
}
