import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, withTransaction } from "../db";
import { CommerceError } from "./errors";

/* =====================================================================
   Inventory — the only place allowed to move stock.

   available = on_hand − quarantined − Σ(active reservations, not expired)

   Adding to the cart never reserves. Entering checkout reserves every line
   in one transaction, so two shoppers cannot hold the same last unit; the
   loser gets a 409 with the affected lines.

   Releasing/expiring is idempotent by design: it only touches rows whose
   status is still `active`, so running a worker twice cannot return the
   same unit to stock twice.
   ===================================================================== */

export interface ReserveItem {
  variantId: string;
  quantity: number;
}

export interface ReservationRow {
  id: string;
  checkout_id: string;
  variant_id: string;
  quantity: number;
  status: string;
  expires_at: Date;
}

const reservedSql = `
  coalesce((
    select sum(r.quantity) from stock_reservations r
    where r.variant_id = v.id and r.status = 'active' and r.expires_at > now()
  ), 0)::int`;

async function lockVariant(client: PoolClient, variantId: string) {
  const res = await client.query<{
    id: string;
    on_hand: number;
    quarantined: number;
    active: boolean;
    product_id: string;
    color_id: string;
    size_id: string;
  }>(
    "select id, on_hand, quarantined, active, product_id, color_id, size_id from product_variants where id = $1 for update",
    [variantId],
  );
  return res.rows[0] ?? null;
}

export async function availableFor(client: PoolClient, variantId: string): Promise<number> {
  const res = await client.query<{ available: number; reserved: number; on_hand: number; quarantined: number }>(
    `select v.id, v.on_hand, v.quarantined, ${reservedSql} as reserved,
            (v.on_hand - v.quarantined - ${reservedSql})::int as available
       from product_variants v where v.id = $1`,
    [variantId],
  );
  const row = res.rows[0];
  return row ? Number(row.available) : 0;
}

/** atomic multi-line reservation; either every line is held or nothing is */
export async function reserveForCheckout(
  client: PoolClient,
  params: { checkoutId: string; items: ReserveItem[]; expiresAt: Date; idempotencyPrefix?: string },
): Promise<ReservationRow[]> {
  const merged = new Map<string, number>();
  for (const item of params.items) {
    if (!item.variantId || !Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new CommerceError("تعداد یا واریانت نامعتبر است.", 400, "invalid_item");
    }
    merged.set(item.variantId, (merged.get(item.variantId) ?? 0) + item.quantity);
  }

  const ids = [...merged.keys()].sort();
  const shortages: { variantId: string; requested: number; available: number }[] = [];

  for (const id of ids) {
    const variant = await lockVariant(client, id);
    if (!variant || !variant.active) {
      shortages.push({ variantId: id, requested: merged.get(id) ?? 0, available: 0 });
      continue;
    }
    const available = await availableFor(client, id);
    const wanted = merged.get(id) ?? 0;
    if (available < wanted) shortages.push({ variantId: id, requested: wanted, available });
  }

  if (shortages.length) {
    throw new CommerceError(
      "یکی از اقلام سبد در این لحظه موجود نیست. تعداد را اصلاح کن یا محصول را بردار.",
      409,
      "insufficient_stock",
      { shortages },
    );
  }

  const reservations: ReservationRow[] = [];
  for (const id of ids) {
    const res = await client.query<ReservationRow>(
      `insert into stock_reservations (id, checkout_id, variant_id, quantity, status, idempotency_key, expires_at)
       values ($1, $2, $3, $4, 'active', $5, $6)
       returning id, checkout_id, variant_id, quantity, status, expires_at`,
      [
        `rsv_${randomUUID()}`,
        params.checkoutId,
        id,
        merged.get(id) ?? 0,
        params.idempotencyPrefix ? `${params.idempotencyPrefix}:${id}` : null,
        params.expiresAt,
      ],
    );
    reservations.push(res.rows[0]);
  }
  return reservations;
}

export interface ReleasedLine {
  id: string;
  checkout_id: string;
  variant_id: string;
  quantity: number;
  status: string;
}

/** release every active hold of a checkout; safe to call any number of times */
export async function releaseCheckout(
  checkoutId: string,
  status: "released" | "expired" = "released",
): Promise<ReleasedLine[]> {
  const res = await query<ReleasedLine>(
    `update stock_reservations set status = $2, updated_at = now()
      where checkout_id = $1 and status = 'active'
      returning id, checkout_id, variant_id, quantity, status`,
    [checkoutId, status],
  );
  return res.rows;
}

/**
 * Claims the held units: decrements on_hand for each active reservation.
 * Returns `short` when a hold was lost to an expired reservation or a manual
 * correction — the caller must then route the order to EXCEPTION instead of
 * silently going negative.
 */
export async function consumeReservations(client: PoolClient, checkoutId: string) {
  const res = await client.query<ReservationRow>(
    `select id, checkout_id, variant_id, quantity, status, expires_at
       from stock_reservations
      where checkout_id = $1 and status = 'active'
      order by variant_id
      for update`,
    [checkoutId],
  );

  const { rows: short } = await client.query<{ variant_id: string; quantity: number }>(
    `select variant_id, quantity from stock_reservations
      where checkout_id = $1 and status in ('released', 'expired')`,
    [checkoutId],
  );

  if (!res.rows.length) return { ok: false, consumed: [] as ReservationRow[], released: short };

  const consumed: ReservationRow[] = [];
  for (const reservation of res.rows) {
    const variant = await lockVariant(client, reservation.variant_id);
    if (!variant || variant.on_hand < reservation.quantity || reservation.expires_at <= new Date()) {
      return { ok: false, consumed, released: short };
    }
  }

  for (const reservation of res.rows) {
    await client.query(
      "update product_variants set on_hand = on_hand - $2, updated_at = now() where id = $1",
      [reservation.variant_id, reservation.quantity],
    );
    await client.query(
      `insert into inventory_movements (variant_id, delta, reason, ref_type, ref_id, dedupe_key)
       values ($1, $2, 'sale', 'checkout', $3, $4)
       on conflict (dedupe_key) do nothing`,
      [reservation.variant_id, -reservation.quantity, checkoutId, `sale:${reservation.id}`],
    );
    await client.query(
      "update stock_reservations set status = 'consumed', updated_at = now() where id = $1",
      [reservation.id],
    );
    consumed.push({ ...reservation, status: "consumed" });
  }
  return { ok: true, consumed, released: [] as typeof short };
}

/** worker tick: expire stale holds and mark their checkouts */
export async function expireReservations(): Promise<{ expired: number; checkouts: number }> {
  return withTransaction(async (client) => {
    const expired = await client.query(
      `update stock_reservations set status = 'expired', updated_at = now()
        where status = 'active' and expires_at <= now()`,
    );
    const checkouts = await client.query(
      `update checkout_sessions set status = 'expired', updated_at = now()
        where status = 'reserved' and reservation_expires_at is not null and reservation_expires_at <= now()`,
    );
    return { expired: expired.rowCount ?? 0, checkouts: checkouts.rowCount ?? 0 };
  });
}

/** deliberate stock movements (return to saleable stock, cancellation) */
export async function restock(
  variantId: string,
  quantity: number,
  reason: "cancellation" | "refund_return" | "adjustment",
  opts: { refType?: string; refId?: string; actor?: string; note?: string; dedupeKey?: string } = {},
) {
  if (quantity <= 0) return;
  await withTransaction(async (client) => {
    await lockVariant(client, variantId);
    await client.query("update product_variants set on_hand = on_hand + $2, updated_at = now() where id = $1", [
      variantId,
      quantity,
    ]);
    await client.query(
      `insert into inventory_movements (variant_id, delta, reason, ref_type, ref_id, actor, note, dedupe_key)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (dedupe_key) do nothing`,
      [variantId, quantity, reason, opts.refType ?? null, opts.refId ?? null, opts.actor ?? null, opts.note ?? null, opts.dedupeKey ?? null],
    );
  });
}

export async function applyStockAdjustment(
  client: PoolClient,
  variantId: string,
  delta: number,
  opts: { actor: string; note?: string; adjustmentId: string },
) {
  const variant = await lockVariant(client, variantId);
  if (!variant) throw new CommerceError("واریانت پیدا نشد.", 404, "variant_not_found");
  if (variant.on_hand + delta < 0) {
    throw new CommerceError("این اصلاح موجودی منفی می‌شود.", 409, "negative_stock");
  }
  await client.query("update product_variants set on_hand = on_hand + $2, updated_at = now() where id = $1", [
    variantId,
    delta,
  ]);
  await client.query(
    `insert into inventory_movements (variant_id, delta, reason, ref_type, ref_id, actor, note, dedupe_key)
     values ($1, $2, 'adjustment', 'adjustment', $3, $4, $5, $6)
     on conflict (dedupe_key) do nothing`,
    [variantId, delta, opts.adjustmentId, opts.actor, opts.note ?? null, `adjustment:${opts.adjustmentId}`],
  );
}
