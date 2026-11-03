import type { PoolClient } from "pg";
import { query, withTransaction } from "../db";
import { loadCommerceSettings } from "./settings";

/* =====================================================================
   Transactional outbox — side effects (SMS, accounting, webhooks) are
   written in the same transaction as the order state change, then a
   worker delivers them at-least-once with retries and backoff.

   A dead SMS provider therefore never rolls back a paid order: the order
   commits, the event stays queued and is retried. Consumers must dedupe
   on `dedupe_key` because delivery is at-least-once, not exactly-once.
   ===================================================================== */

export type OutboxType = "order.paid" | "order.exception" | "refund.settled" | "order.cancelled";

export interface OutboxRow {
  id: string;
  type: OutboxType;
  payload: Record<string, unknown>;
  dedupe_key: string | null;
  status: string;
  attempts: number;
  available_at: Date;
  last_error: string | null;
  result: Record<string, unknown> | null;
}

export async function enqueue(
  client: PoolClient,
  type: OutboxType,
  payload: Record<string, unknown>,
  dedupeKey?: string,
) {
  const res = await client.query<{ id: string }>(
    `insert into outbox_events (type, payload, dedupe_key) values ($1, $2, $3)
     on conflict (dedupe_key) do nothing
     returning id`,
    [type, JSON.stringify(payload), dedupeKey ?? null],
  );
  return res.rows[0]?.id ?? null;
}

interface HandlerResult {
  delivered: string[];
  skipped?: string[];
}

async function handle(type: OutboxType, payload: Record<string, unknown>): Promise<HandlerResult> {
  const settings = await loadCommerceSettings();
  const delivered: string[] = [];
  const skipped: string[] = [];

  if (type === "order.paid" || type === "order.exception" || type === "order.cancelled" || type === "refund.settled") {
    if (settings.smsSimulateDown) {
      throw new Error("SMS provider unreachable (simulated)");
    }
    delivered.push(`sms:${payload.orderId ?? payload.refundId ?? "event"}`);
    delivered.push(`accounting:${payload.orderId ?? payload.refundId ?? "event"}`);
    delivered.push(`webhook:${type}`);
  } else {
    skipped.push(`no handler for ${type}`);
  }
  return { delivered, skipped };
}

/** one worker tick; safe to run from several processes thanks to SKIP LOCKED */
export async function processOutbox(limit = 20) {
  return withTransaction(async (client) => {
    const res = await client.query<OutboxRow>(
      `select id, type, payload, dedupe_key, status, attempts, available_at, last_error, result
         from outbox_events
        where status = 'pending' and available_at <= now()
        order by id
        limit $1
        for update skip locked`,
      [limit],
    );

    let done = 0;
    let failed = 0;
    for (const event of res.rows) {
      try {
        const result = await handle(event.type, event.payload);
        await client.query(
          `update outbox_events set status = 'done', attempts = attempts + 1, result = $2,
                  processed_at = now(), last_error = null where id = $1`,
          [event.id, JSON.stringify(result)],
        );
        done += 1;
      } catch (error) {
        const attempts = event.attempts + 1;
        const giveUp = attempts >= 5;
        const backoffSeconds = Math.min(60, attempts * attempts * 2);
        await client.query(
          `update outbox_events
              set status = $2, attempts = $3, last_error = $4,
                  available_at = now() + ($5 || ' seconds')::interval
            where id = $1`,
          [event.id, giveUp ? "failed" : "pending", attempts, (error as Error).message, String(backoffSeconds)],
        );
        failed += 1;
      }
    }
    return { picked: res.rowCount ?? 0, done, failed };
  });
}

export async function outboxStats() {
  const res = await query<{ status: string; n: number }>(
    "select status, count(*)::int as n from outbox_events group by status",
  );
  return Object.fromEntries(res.rows.map((r) => [r.status, r.n]));
}

let worker: NodeJS.Timeout | null = null;

export function startOutboxWorker(intervalMs = 2000) {
  if (worker) return;
  worker = setInterval(() => {
    processOutbox().catch(() => undefined);
  }, intervalMs);
  worker.unref?.();
}

export function stopOutboxWorker() {
  if (worker) clearInterval(worker);
  worker = null;
}
