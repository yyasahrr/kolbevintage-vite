import { randomUUID } from "node:crypto";
import { query, withTransaction } from "../db";
import { reverseCashbackForRefund } from "./cashback";
import { CommerceError, forbidden, notFound } from "./errors";
import { getOrder } from "./orders";
import { enqueue } from "./outbox";
import { loadCommerceSettings } from "./settings";

/* =====================================================================
   Refunds / returns — three different things that must not be confused:
   Return (RMA) = send goods back, Exchange = swap for another variant,
   Refund = move money. This module records requests, checks permissions
   and writes adjustment documents; it never rewrites the original invoice.

   Live money movement is fail-closed: it stays blocked until
   `liveRefundsEnabled` is true AND the approver is a protected
   superadmin. An ordinary admin role can request, never approve.
   ===================================================================== */

export interface RefundRow {
  id: string;
  order_id: string;
  order_line_id: string;
  quantity: number;
  amount: string | number;
  reason: string | null;
  status: string;
  requested_by: string | null;
  approved_by: string | null;
  note: string | null;
  created_at: Date;
  decided_at: Date | null;
}

export function publicRefund(row: RefundRow) {
  return {
    id: row.id,
    orderId: row.order_id,
    orderLineId: row.order_line_id,
    quantity: row.quantity,
    amount: Number(row.amount),
    reason: row.reason,
    status: row.status,
    requestedBy: row.requested_by,
    approvedBy: row.approved_by,
    note: row.note,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

export async function requestRefund(input: {
  orderId: string;
  orderLineId: string;
  quantity: number;
  reason?: string;
  actor: string;
  kind?: "return" | "exchange" | "refund";
}) {
  const quantity = Math.trunc(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new CommerceError("تعداد مرجوعی باید مثبت باشد.", 400, "invalid_quantity");
  }
  const { order, lines } = await getOrder(input.orderId);
  if (!["paid", "preparing", "shipped", "delivered"].includes(order.status)) {
    throw new CommerceError("برای این سفارش امکان ثبت مرجوعی نیست.", 409, "order_not_returnable");
  }
  const line = lines.find((l) => l.id === input.orderLineId);
  if (!line) throw notFound("ردیف سفارش پیدا نشد.");

  // pending requests reserve quantity too, otherwise the same unit could be
  // requested twice before an approval happens
  const pending = await query<{ n: number }>(
    `select coalesce(sum(quantity),0)::int as n from refunds
      where order_line_id = $1 and status in ('requested', 'settled')`,
    [line.id],
  );
  const remaining = line.quantity - line.refunded_quantity - Number(pending.rows[0]?.n ?? 0);
  if (quantity > remaining) {
    throw new CommerceError(
      `فقط ${remaining} عدد از این ردیف قابل مرجوع است.`,
      409,
      "refund_quantity_exceeded",
    );
  }

  // the refund amount is derived from the frozen line snapshot, never from
  // today's price
  const unit = Number(line.line_total) / line.quantity;
  const amount = Math.round(unit * quantity * 100) / 100;
  const id = `rfd_${randomUUID()}`;
  await query(
    `insert into refunds (id, order_id, order_line_id, quantity, amount, reason, status, requested_by, note)
     values ($1,$2,$3,$4,$5,$6,'requested',$7,$8)`,
    [id, input.orderId, line.id, quantity, amount, input.reason ?? null, input.actor, input.kind ?? "refund"],
  );
  const res = await query<RefundRow>("select * from refunds where id = $1", [id]);
  return publicRefund(res.rows[0]);
}

export async function listRefunds(filter: { orderId?: string; status?: string } = {}) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filter.orderId) {
    params.push(filter.orderId);
    where.push(`order_id = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }
  const res = await query<RefundRow>(
    `select * from refunds ${where.length ? `where ${where.join(" and ")}` : ""} order by created_at desc limit 200`,
    params,
  );
  return res.rows.map(publicRefund);
}

/**
 * Approve or reject a refund request.
 * Two independent gates, both fail-closed:
 *   1. the store must have live refunds switched on,
 *   2. the approver must be a superadmin session subject.
 */
export async function decideRefund(input: {
  refundId: string;
  decision: "approve" | "reject";
  actor: string;
  note?: string;
}) {
  const settings = await loadCommerceSettings();
  if (!settings.superadmins.includes(input.actor)) {
    throw forbidden("تأیید بازپرداخت فقط توسط Superadmin محافظت‌شده ممکن است.");
  }
  if (!settings.liveRefundsEnabled) {
    throw new CommerceError(
      "اجرای بازپرداخت زنده تا فعال‌شدن کنترل‌های مالی مسدود است (Fail-closed). درخواست ثبت شد و در صف بررسی می‌ماند.",
      403,
      "live_refunds_blocked",
    );
  }

  return withTransaction(async (client) => {
    const res = await client.query<RefundRow>("select * from refunds where id = $1 for update", [
      input.refundId,
    ]);
    const refund = res.rows[0];
    if (!refund) throw notFound("درخواست بازپرداخت پیدا نشد.");
    if (refund.status !== "requested") {
      return { ok: true, refund: publicRefund(refund), unchanged: true };
    }

    if (input.decision === "reject") {
      const rejected = await client.query<RefundRow>(
        `update refunds set status = 'rejected', approved_by = $2, note = $3, decided_at = now()
          where id = $1 returning *`,
        [refund.id, input.actor, input.note ?? null],
      );
      return { ok: true, refund: publicRefund(rejected.rows[0]), unchanged: false };
    }

    const lineRes = await client.query<{
      id: string;
      order_id: string;
      variant_id: string | null;
      quantity: number;
      refunded_quantity: number;
      line_total: string;
      name_snapshot: string;
    }>("select * from order_lines where id = $1 for update", [refund.order_line_id]);
    const line = lineRes.rows[0];
    if (!line) throw notFound("ردیف سفارش پیدا نشد.");
    if (refund.quantity > line.quantity - line.refunded_quantity) {
      throw new CommerceError("تعداد مرجوعی از باقی‌ماندهٔ ردیف بیشتر است.", 409, "refund_quantity_exceeded");
    }

    await client.query(
      "update order_lines set refunded_quantity = refunded_quantity + $2 where id = $1",
      [line.id, refund.quantity],
    );
    if (line.variant_id) {
      await client.query("update product_variants set on_hand = on_hand + $2, updated_at = now() where id = $1", [
        line.variant_id,
        refund.quantity,
      ]);
      await client.query(
        `insert into inventory_movements (variant_id, delta, reason, ref_type, ref_id, actor, dedupe_key)
         values ($1, $2, 'refund_return', 'refund', $3, $4, $5)
         on conflict (dedupe_key) do nothing`,
        [line.variant_id, refund.quantity, refund.id, input.actor, `refund:${refund.id}`],
      );
    }

    const settled = await client.query<RefundRow>(
      `update refunds set status = 'settled', approved_by = $2, note = $3, decided_at = now()
        where id = $1 returning *`,
      [refund.id, input.actor, input.note ?? null],
    );
    const orderRes = await client.query<{ subtotal: string | null; discount_total: string | null; email: string | null }>(
      "select subtotal, discount_total, email from orders where id = $1",
      [refund.order_id],
    );
    const goodsTotal = Number(orderRes.rows[0]?.subtotal ?? 0) - Number(orderRes.rows[0]?.discount_total ?? 0);
    const clawedBack = await reverseCashbackForRefund(client, {
      orderId: refund.order_id,
      refundId: refund.id,
      refundAmount: Number(refund.amount),
      goodsTotal,
    });

    await enqueue(
      client,
      "refund.settled",
      { refundId: refund.id, orderId: refund.order_id, amount: Number(refund.amount), cashbackReversed: clawedBack },
      `refund.settled:${refund.id}`,
    );

    return { ok: true, refund: publicRefund(settled.rows[0]), unchanged: false };
  });
}

/* ---------------------------------------------------------------------
   Manual stock corrections — two different people must agree.
   --------------------------------------------------------------------- */

export interface AdjustmentRow {
  id: string;
  variant_id: string;
  delta: number;
  reason: string;
  requested_by: string;
  status: string;
  approved_by: string | null;
  note: string | null;
  created_at: Date;
  decided_at: Date | null;
}

export function publicAdjustment(row: AdjustmentRow) {
  return {
    id: row.id,
    variantId: row.variant_id,
    delta: row.delta,
    reason: row.reason,
    requestedBy: row.requested_by,
    status: row.status,
    approvedBy: row.approved_by,
    note: row.note,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

export async function requestAdjustment(input: {
  variantId: string;
  delta: number;
  reason: string;
  actor: string;
  note?: string;
}) {
  const delta = Math.trunc(input.delta);
  if (!delta) throw new CommerceError("مقدار اصلاح نمی‌تواند صفر باشد.", 400, "invalid_delta");
  const variant = await query("select id from product_variants where id = $1", [input.variantId]);
  if (!variant.rows[0]) throw notFound("واریانت پیدا نشد.");
  const id = `adj_${randomUUID()}`;
  await query(
    `insert into inventory_adjustments (id, variant_id, delta, reason, requested_by, note)
     values ($1,$2,$3,$4,$5,$6)`,
    [id, input.variantId, delta, input.reason, input.actor, input.note ?? null],
  );
  const res = await query<AdjustmentRow>("select * from inventory_adjustments where id = $1", [id]);
  return publicAdjustment(res.rows[0]);
}

export async function decideAdjustment(input: {
  id: string;
  decision: "approve" | "reject";
  actor: string;
  note?: string;
}) {
  return withTransaction(async (client) => {
    const res = await client.query<AdjustmentRow>("select * from inventory_adjustments where id = $1 for update", [
      input.id,
    ]);
    const adjustment = res.rows[0];
    if (!adjustment) throw notFound("درخواست اصلاح موجودی پیدا نشد.");
    if (adjustment.status !== "pending") {
      return { ok: true, adjustment: publicAdjustment(adjustment), unchanged: true };
    }
    if (adjustment.requested_by === input.actor) {
      throw new CommerceError(
        "اصلاح دستی موجودی باید توسط شخص دیگری تأیید شود.",
        403,
        "two_person_rule",
      );
    }

    if (input.decision === "reject") {
      const rejected = await client.query<AdjustmentRow>(
        `update inventory_adjustments set status = 'rejected', approved_by = $2, note = $3, decided_at = now()
          where id = $1 returning *`,
        [adjustment.id, input.actor, input.note ?? null],
      );
      return { ok: true, adjustment: publicAdjustment(rejected.rows[0]), unchanged: false };
    }

    const variant = await client.query<{ on_hand: number }>(
      "select on_hand from product_variants where id = $1 for update",
      [adjustment.variant_id],
    );
    const onHand = Number(variant.rows[0]?.on_hand ?? 0);
    if (onHand + adjustment.delta < 0) {
      throw new CommerceError("این اصلاح موجودی را منفی می‌کند.", 409, "negative_stock");
    }
    await client.query("update product_variants set on_hand = on_hand + $2, updated_at = now() where id = $1", [
      adjustment.variant_id,
      adjustment.delta,
    ]);
    await client.query(
      `insert into inventory_movements (variant_id, delta, reason, ref_type, ref_id, actor, note, dedupe_key)
       values ($1, $2, 'adjustment', 'adjustment', $3, $4, $5, $6)
       on conflict (dedupe_key) do nothing`,
      [adjustment.variant_id, adjustment.delta, adjustment.id, input.actor, adjustment.note, `adjustment:${adjustment.id}`],
    );
    const approved = await client.query<AdjustmentRow>(
      `update inventory_adjustments set status = 'approved', approved_by = $2, decided_at = now()
        where id = $1 returning *`,
      [adjustment.id, input.actor],
    );
    return { ok: true, adjustment: publicAdjustment(approved.rows[0]), unchanged: false };
  });
}
