import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { expireReservations } from "../commerce/inventory";
import { expirePaymentAttempts } from "../commerce/payments";
import { releasePendingCashback } from "../commerce/cashback";

// Called by an external scheduler, not by ordinary browsers. A secret is
// mandatory, never returned or logged. No delivery adapter exists yet, so the
// outbox is deliberately excluded rather than marking undelivered work done.
export async function scheduledJobRoutes(app: FastifyInstance) {
  app.get("/api/internal/scheduled-jobs", async (req, reply) => {
    reply.header("cache-control", "no-store");
    const secret = process.env.CRON_SECRET ?? "";
    if (!/^[a-f0-9]{64}$/i.test(secret)) return reply.code(503).send({ code: "scheduler_unconfigured" });
    const authorization = req.headers.authorization ?? "";
    // Hash both sides before comparison so timingSafeEqual never sees a
    // variable-length input. The request still needs the exact bearer format.
    const actual = createHash("sha256").update(authorization).digest();
    const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
    if (!timingSafeEqual(actual, expected)) return reply.code(401).send({ code: "unauthorized" });
    // Each operation is idempotent. A retry after a partial failure is safe;
    // a 5xx must still be monitored and retried by the scheduler.
    const reservations = await expireReservations();
    const paymentAttempts = await expirePaymentAttempts();
    const cashback = await releasePendingCashback();
    return { ok: true, reservations, paymentAttempts, cashback, outbox: "not_configured" };
  });
}
