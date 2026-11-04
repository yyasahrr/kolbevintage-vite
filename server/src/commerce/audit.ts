import type { PoolClient } from "pg";
import { query } from "../db";

/* =====================================================================
   Audit trail — the answer to "who changed the money and why".

   Every privileged action (BNPL toggle, shipping/threshold settings,
   refund decision, stock adjustment, catalogue price change) writes one
   append-only row with actor, before and after values. Rows are written
   inside the same transaction as the change, so a rolled-back change
   never leaves a lying audit entry behind. The table rejects UPDATE and
   DELETE at the database level.
   ===================================================================== */

type Executor = Pick<PoolClient, "query"> | undefined;

export interface AuditInput {
  actor: string;
  /** stable machine name, e.g. `settings.update`, `refund.approve` */
  action: string;
  targetType: string;
  targetId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  requestId?: string | null;
}

function serialize(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ unserializable: String(value) });
  }
}

export async function recordAudit(input: AuditInput, client?: Executor): Promise<void> {
  const params = [
    input.actor || "unknown",
    input.action,
    input.targetType,
    input.targetId ?? null,
    serialize(input.before),
    serialize(input.after),
    input.reason ?? null,
    input.requestId ?? null,
  ];
  const sql = `insert into audit_events (actor, action, target_type, target_id, before, after, reason, request_id)
               values ($1,$2,$3,$4,$5,$6,$7,$8)`;
  if (client) await client.query(sql, params);
  else await query(sql, params);
}

/** only the fields that actually changed, so the trail stays readable */
export function diffSettings<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after)) {
    const from = (before as Record<string, unknown>)[key];
    const to = (after as Record<string, unknown>)[key];
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to };
  }
  return changes;
}

export interface AuditRow {
  id: string;
  at: Date;
  actor: string;
  action: string;
  target_type: string;
  target_id: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  request_id: string | null;
}

export async function listAudit(
  filter: { targetType?: string; targetId?: string; action?: string; actor?: string; limit?: number } = {},
) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filter.action) {
    params.push(filter.action);
    where.push(`action = $${params.length}`);
  }
  if (filter.actor) {
    params.push(filter.actor);
    where.push(`actor = $${params.length}`);
  }
  if (filter.targetType) {
    params.push(filter.targetType);
    where.push(`target_type = $${params.length}`);
  }
  if (filter.targetId) {
    params.push(filter.targetId);
    where.push(`target_id = $${params.length}`);
  }
  params.push(Math.min(500, Math.max(1, Math.trunc(filter.limit ?? 100))));
  const res = await query<AuditRow>(
    `select id::text, at, actor, action, target_type, target_id, before, after, reason, request_id
       from audit_events ${where.length ? `where ${where.join(" and ")}` : ""}
      order by at desc, id desc limit $${params.length}`,
    params,
  );
  return res.rows.map((row) => ({
    id: row.id,
    at: row.at,
    actor: row.actor,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    before: row.before,
    after: row.after,
    reason: row.reason,
    requestId: row.request_id,
  }));
}
