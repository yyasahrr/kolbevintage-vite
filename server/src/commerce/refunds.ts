import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, withTransaction } from "../db";
import { creditWalletForRefund, reverseCashbackForRefund, round2 } from "./cashback";
import { providerCapabilities } from "./payments";
import { recordAudit } from "./audit";
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
  kind: string;
  target_variant_id: string | null;
  received_at: Date | null;
  qc_result: string | null;
  qc_note: string | null;
  difference_amount: string | number;
  provider_ref: string | null;
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
    kind: row.kind,
    targetVariantId: row.target_variant_id,
    receivedAt: row.received_at,
    qcResult: row.qc_result,
    qcNote: row.qc_note,
    differenceAmount: Number(row.difference_amount ?? 0),
    providerRef: row.provider_ref,
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
  targetVariantId?: string;
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
  const kind = input.kind ?? "refund";
  let differenceAmount = 0;
  if (kind === "exchange") {
    if (!input.targetVariantId) {
      throw new CommerceError("برای تعویض، واریانت مقصد لازم است.", 400, "exchange_target_required");
    }
    const target = await query<{ id: string; price: string | null }>(
      "select v.id, p.price from product_variants v join products p on p.id = v.product_id where v.id = $1",
      [input.targetVariantId],
    );
    if (!target.rows[0]) throw notFound("واریانت مقصد پیدا نشد.");
    differenceAmount = Math.round((Number(target.rows[0].price ?? 0) * quantity - amount) * 100) / 100;
  }
  const id = `rfd_${randomUUID()}`;
  await query(
    `insert into refunds (id, order_id, order_line_id, quantity, amount, reason, status, requested_by, note,
                          kind, target_variant_id, difference_amount)
     values ($1,$2,$3,$4,$5,$6,'requested',$7,$8,$9,$10,$11)`,
    [
      id,
      input.orderId,
      line.id,
      quantity,
      amount,
      input.reason ?? null,
      input.actor,
      input.reason ?? null,
      kind,
      input.targetVariantId ?? null,
      differenceAmount,
    ],
  );
  /* a dearer exchange needs the difference before anything is settled: a single
     expiring link, so the customer is never charged twice by a refresh */
  let exchangeToken: string | null = null;
  if (kind === "exchange" && differenceAmount > 0) {
    const token = `exc_${randomUUID()}`;
    await query(
      `insert into exchange_payments (id, refund_id, amount, token, status, expires_at)
       values ($1, $2, $3, $4, 'unpaid', now() + interval '48 hours')`,
      [`exp_${randomUUID()}`, id, differenceAmount, token],
    );
    exchangeToken = token;
  }

  const res = await query<RefundRow>("select * from refunds where id = $1", [id]);
  return { ...publicRefund(res.rows[0]), exchangeToken };
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
/* ---------------------------------------------------------------------
   Staged RMA. Money and stock move only after the goods are back and seen:

     requested → approved (superadmin) → received → qc_passed | qc_failed
              → settled | manual_review

   A plain money-only refund (kind = "refund") may skip the warehouse steps.
   Nothing is restocked when a request is approved: a defective return used to
   become sellable stock the moment staff clicked "approve".
   --------------------------------------------------------------------- */

async function loadRefund(client: PoolClient, id: string) {
  const res = await client.query<RefundRow>("select * from refunds where id = $1 for update", [id]);
  const refund = res.rows[0];
  if (!refund) throw notFound("درخواست بازپرداخت پیدا نشد.");
  return refund;
}

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

  return withTransaction(async (client) => {
    const refund = await loadRefund(client, input.refundId);
    if (refund.status !== "requested") {
      return { ok: true, refund: publicRefund(refund), unchanged: true };
    }
    const nextStatus = input.decision === "reject" ? "rejected" : "approved";
    const updated = await client.query<RefundRow>(
      `update refunds set status = $2, approved_by = $3, note = coalesce($4, note), decided_at = now()
        where id = $1 returning *`,
      [refund.id, nextStatus, input.actor, input.note ?? null],
    );
    return { ok: true, refund: publicRefund(updated.rows[0]), unchanged: false };
  });
}

/** goods physically arrived; still nothing sellable, still no money */
export async function receiveReturn(input: { refundId: string; actor: string; note?: string }) {
  return withTransaction(async (client) => {
    const refund = await loadRefund(client, input.refundId);
    if (refund.status === "received" || refund.status === "qc_passed" || refund.status === "qc_failed") {
      return { ok: true, refund: publicRefund(refund), unchanged: true };
    }
    if (refund.status !== "approved") {
      throw new CommerceError("ابتدا باید درخواست مرجوعی تأیید شود.", 409, "refund_not_approved");
    }
    if (refund.kind === "refund") {
      throw new CommerceError("این درخواست بازگشت کالا ندارد؛ مستقیم تسویه کن.", 409, "no_goods_expected");
    }
    const updated = await client.query<RefundRow>(
      `update refunds set status = 'received', received_at = now(), note = coalesce($2, note)
        where id = $1 returning *`,
      [refund.id, input.note ?? null],
    );
    await recordAudit(
      {
        actor: input.actor,
        action: "return.received",
        targetType: "refund",
        targetId: refund.id,
        before: { status: refund.status },
        after: { status: "received" },
      },
      client,
    );
    return { ok: true, refund: publicRefund(updated.rows[0]), unchanged: false };
  });
}

/**
 * Quality control decides where the unit goes: saleable stock or quarantine.
 * This is the only place a returned unit can re-enter inventory.
 */
export async function qcReturn(input: {
  refundId: string;
  result: "saleable" | "defective";
  actor: string;
  note?: string;
}) {
  return withTransaction(async (client) => {
    const refund = await loadRefund(client, input.refundId);
    if (refund.qc_result) {
      return { ok: true, refund: publicRefund(refund), unchanged: true };
    }
    if (refund.status !== "received") {
      throw new CommerceError("برای QC باید ابتدا کالا دریافت شده باشد.", 409, "goods_not_received");
    }
    const line = await client.query<{ variant_id: string | null }>(
      "select variant_id from order_lines where id = $1",
      [refund.order_line_id],
    );
    const variantId = line.rows[0]?.variant_id ?? null;

    if (variantId) {
      if (input.result === "saleable") {
        await client.query("update product_variants set on_hand = on_hand + $2, updated_at = now() where id = $1", [
          variantId,
          refund.quantity,
        ]);
        await client.query(
          `insert into inventory_movements (variant_id, delta, reason, ref_type, ref_id, actor, note, dedupe_key)
           values ($1, $2, 'refund_return', 'refund', $3, $4, $5, $6)
           on conflict (dedupe_key) do nothing`,
          [variantId, refund.quantity, refund.id, input.actor, input.note ?? null, `qc:${refund.id}`],
        );
      } else {
        // a defective unit must never be sellable: it goes to quarantine instead
        await client.query("update product_variants set quarantined = quarantined + $2, updated_at = now() where id = $1", [
          variantId,
          refund.quantity,
        ]);
        await client.query(
          `insert into inventory_movements (variant_id, delta, reason, ref_type, ref_id, actor, note, dedupe_key)
           values ($1, 0, 'qc_rejected', 'refund', $2, $3, $4, $5)
           on conflict (dedupe_key) do nothing`,
          [variantId, refund.id, input.actor, input.note ?? null, `qc-defective:${refund.id}`],
        );
      }
    }

    const status = input.result === "saleable" ? "qc_passed" : "qc_failed";
    const updated = await client.query<RefundRow>(
      `update refunds set status = $2, qc_result = $3, qc_note = $4 where id = $1 returning *`,
      [refund.id, status, input.result, input.note ?? null],
    );
    await recordAudit(
      {
        actor: input.actor,
        action: `return.qc_${input.result}`,
        targetType: "refund",
        targetId: refund.id,
        before: { status: refund.status },
        after: { status, variantId, quantity: refund.quantity },
        reason: input.note ?? null,
      },
      client,
    );
    return { ok: true, refund: publicRefund(updated.rows[0]), unchanged: false };
  });
}

/** the customer pays the difference of a dearer exchange */
export async function payExchangeDifference(input: { token: string; actor: string }) {
  return withTransaction(async (client) => {
    const res = await client.query<{ id: string; refund_id: string; amount: string; status: string; expires_at: Date | null }>(
      "select * from exchange_payments where token = $1 for update",
      [input.token],
    );
    const payment = res.rows[0];
    if (!payment) throw notFound("لینک پرداخت اختلاف پیدا نشد.");
    if (payment.status === "paid") return { ok: true, status: "paid", amount: Number(payment.amount) };
    if (payment.expires_at && new Date(payment.expires_at) <= new Date()) {
      throw new CommerceError("مهلت پرداخت اختلاف تمام شده است.", 409, "exchange_link_expired");
    }
    await client.query(
      "update exchange_payments set status = 'paid', paid_at = now(), provider_ref = $2 where id = $1",
      [payment.id, `mockdiff_${payment.id}`],
    );
    await recordAudit(
      {
        actor: input.actor,
        action: "exchange.difference_paid",
        targetType: "exchange_payment",
        targetId: payment.id,
        before: { status: payment.status },
        after: { status: "paid", amount: Number(payment.amount) },
      },
      client,
    );
    return { ok: true, status: "paid", amount: Number(payment.amount) };
  });
}

/**
 * Money movement — the only step that touches refunds, stock counters and the
 * wallet. Refused unless a protected superadmin runs it and the store has live
 * refunds switched on. When the provider cannot reverse money (e.g. the
 * installment provider), the request is parked as `manual_review` instead of
 * pretending it was paid back.
 */
export async function settleRefund(input: { refundId: string; actor: string; note?: string }) {
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
    const refund = await loadRefund(client, input.refundId);
    if (refund.status === "settled" || refund.status === "manual_review") {
      return { ok: true, refund: publicRefund(refund), unchanged: true };
    }
    if (refund.status === "rejected" || refund.status === "requested") {
      throw new CommerceError("این درخواست برای تسویه آماده نیست.", 409, "refund_not_ready");
    }
    const needsGoods = refund.kind !== "refund";
    if (needsGoods && !refund.qc_result) {
      throw new CommerceError(
        "تا وقتی کالا دریافت و QC نشده، پول یا موجودی جابه‌جا نمی‌شود.",
        409,
        "qc_required",
      );
    }
    if (needsGoods && refund.kind === "exchange" && Number(refund.difference_amount) > 0) {
      const paid = await client.query("select 1 from exchange_payments where refund_id = $1 and status = 'paid'", [
        refund.id,
      ]);
      if (!paid.rowCount) {
        throw new CommerceError("اختلاف قیمت تعویض پرداخت نشده است.", 409, "exchange_difference_unpaid");
      }
    }

    const lineRes = await client.query<{
      id: string;
      order_id: string;
      quantity: number;
      refunded_quantity: number;
      line_total: string;
    }>("select id, order_id, quantity, refunded_quantity, line_total from order_lines where id = $1 for update", [
      refund.order_line_id,
    ]);
    const line = lineRes.rows[0];
    if (!line) throw notFound("ردیف سفارش پیدا نشد.");
    if (refund.quantity > line.quantity - line.refunded_quantity) {
      throw new CommerceError("تعداد مرجوعی از باقی‌ماندهٔ ردیف بیشتر است.", 409, "refund_quantity_exceeded");
    }

    /* --- provider capability decides: real reversal or a human's queue --- */
    const attempt = await client.query<{ provider: string }>(
      "select provider from payment_attempts where order_id = $1 and status = 'settled' order by created_at desc limit 1",
      [refund.order_id],
    );
    const providerId = attempt.rows[0]?.provider ?? settings.paymentProvider;
    const capabilities = providerCapabilities(providerId);
    const canReverse = capabilities.refund && (refund.quantity === line.quantity || capabilities.partialRefund);

    const orderRes = await client.query<{ subtotal: string | null; discount_total: string | null; email: string | null }>(
      "select subtotal, discount_total, email from orders where id = $1",
      [refund.order_id],
    );
    const goodsTotal = Number(orderRes.rows[0]?.subtotal ?? 0) - Number(orderRes.rows[0]?.discount_total ?? 0);

    if (!canReverse) {
      const parked = await client.query<RefundRow>(
        `update refunds set status = 'manual_review', approved_by = $2, decided_at = now(),
                note = coalesce($3, note), provider_ref = null
          where id = $1 returning *`,
        [
          refund.id,
          input.actor,
          input.note ??
            `ارائه‌دهنده (${providerId}) قابلیت بازگشت این مبلغ را اعلام نکرده؛ بازپرداخت دستی لازم است.`,
        ],
      );
      return { ok: true, refund: publicRefund(parked.rows[0]), unchanged: false, manualReview: true };
    }

    const providerRef = `mockrefund_${refund.id}`;
    await client.query("update order_lines set refunded_quantity = refunded_quantity + $2 where id = $1", [
      line.id,
      refund.quantity,
    ]);

    const clawedBack = await reverseCashbackForRefund(client, {
      orderId: refund.order_id,
      refundId: refund.id,
      refundAmount: Number(refund.amount),
      goodsTotal,
    });

    /* money that came from the wallet returns to the wallet */
    let walletRefunded = 0;
    const walletRow = await client.query<{ wallet_applied: string; wallet_email: string | null }>(
      `select coalesce(sum(wallet_applied), 0)::numeric(12,2) as wallet_applied, max(wallet_email) as wallet_email
         from payment_attempts where order_id = $1 and wallet_applied > 0`,
      [refund.order_id],
    );
    const walletApplied = Number(walletRow.rows[0]?.wallet_applied ?? 0);
    const walletEmail = walletRow.rows[0]?.wallet_email ?? orderRes.rows[0]?.email ?? null;
    if (walletApplied > 0 && walletEmail) {
      const grandRes = await client.query<{ total: string | null }>("select total from orders where id = $1", [
        refund.order_id,
      ]);
      const grand = Number(grandRes.rows[0]?.total ?? 0);
      const share = grand > 0 ? round2((walletApplied * Number(refund.amount)) / grand) : 0;
      walletRefunded = await creditWalletForRefund(client, {
        email: walletEmail,
        orderId: refund.order_id,
        refundId: refund.id,
        amount: share,
      });
    }

    /* a cheaper exchange leaves a credit in the wallet */
    let exchangeCredit = 0;
    if (refund.kind === "exchange" && Number(refund.difference_amount) < 0 && walletEmail) {
      exchangeCredit = await creditWalletForRefund(client, {
        email: walletEmail,
        orderId: refund.order_id,
        refundId: `${refund.id}:diff`,
        amount: Math.abs(Number(refund.difference_amount)),
      });
    }

    const settled = await client.query<RefundRow>(
      `update refunds set status = 'settled', approved_by = $2, decided_at = now(), provider_ref = $3,
              note = coalesce($4, note)
        where id = $1 returning *`,
      [refund.id, input.actor, providerRef, input.note ?? null],
    );

    await recordAudit(
      {
        actor: input.actor,
        action: "refund.settled",
        targetType: "refund",
        targetId: refund.id,
        before: { status: refund.status, amount: Number(refund.amount) },
        after: {
          status: "settled",
          provider: providerId,
          providerRef,
          walletRefunded,
          exchangeCredit,
          cashbackReversed: clawedBack,
        },
      },
      client,
    );

    await enqueue(
      client,
      "refund.settled",
      {
        refundId: refund.id,
        orderId: refund.order_id,
        amount: Number(refund.amount),
        cashbackReversed: clawedBack,
        walletRefunded,
      },
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
