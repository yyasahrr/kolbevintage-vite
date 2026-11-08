import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { config } from "../config";
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

  // Use the immutable line snapshot; the amount is allocated under the line
  // lock below so multiple partial requests cannot exceed the amount paid.
  const kind = input.kind ?? "refund";
  // The former exchange path marked mock differences and refunds as paid
  // without allocating or dispatching replacement goods. Do not create new
  // exchange requests until the complete workflow and provider are verified.
  if (kind === "exchange") throw new CommerceError("تعویض کالا تا تکمیل کنترل موجودی، ارسال و پرداخت اختلاف در دسترس نیست؛ برای مرجوعی یا راهنمایی با فروشگاه تماس بگیرید.",503,"exchange_unavailable");
  if (input.targetVariantId) throw new CommerceError("کالای مقصد فقط برای درخواست تعویض است.",422,"invalid_return_request");
  const id = `rfd_${randomUUID()}`;
  // Serialize requests for the same order line. Every open request reserves
  // quantity until rejected or settled; settled units are already reflected in
  // refunded_quantity and must not be counted twice.
  return withTransaction(async (client) => {
    const locked = await client.query<{ quantity: number; refunded_quantity: number; line_total: string }>(
      "select quantity, refunded_quantity, line_total from order_lines where id = $1 for update", [line.id],
    );
    const current = locked.rows[0];
    if (!current) throw notFound("ردیف سفارش پیدا نشد.");
    const pending = await client.query<{ n: number; amount: string }>(
      `select coalesce(sum(quantity) filter (where status <> 'settled'),0)::int as n,
              coalesce(sum(amount),0)::text as amount from refunds
        where order_line_id = $1 and status <> 'rejected'`, [line.id],
    );
    const remaining = current.quantity - current.refunded_quantity - Number(pending.rows[0]?.n ?? 0);
    if (quantity > remaining) {
      throw new CommerceError(`فقط ${Math.max(0, remaining)} عدد از این ردیف قابل مرجوع است.`, 409, "refund_quantity_exceeded");
    }
    const lineCents=Math.round(Number(current.line_total)*100);
    const availableCents=Math.max(0,lineCents-Math.round(Number(pending.rows[0].amount)*100));
    const amountCents=quantity===remaining ? availableCents : Math.min(availableCents,Math.round(lineCents*quantity/current.quantity));
    const amount=amountCents/100;
    const differenceAmount=0;
    await client.query(
      `insert into refunds (id, order_id, order_line_id, quantity, amount, reason, status, requested_by, note,
                            kind, target_variant_id, difference_amount)
       values ($1,$2,$3,$4,$5,$6,'requested',$7,$8,$9,$10,$11)`,
      [id, input.orderId, line.id, quantity, amount, input.reason ?? null, input.actor,
        input.reason ?? null, kind, input.targetVariantId ?? null, differenceAmount],
    );
    const result = await client.query<RefundRow>("select * from refunds where id = $1", [id]);
    await recordAudit({ actor: input.actor, action: "refund.requested", targetType: "refund", targetId: id,
      after: { orderId: input.orderId, orderLineId: line.id, quantity, kind, amount }, reason: input.reason }, client);
    return { ...publicRefund(result.rows[0]), exchangeToken:null };
  });
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

/** Keyset pagination keeps database precision in the cursor anchor. */
export async function listRefundPage(filter: { before?: string; search: string; status: string; limit: number }) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filter.before) {
    const anchor = await query("select id from refunds where id=$1", [filter.before]);
    if (!anchor.rows.length) throw new CommerceError("نشانگر صفحه دیگر موجود نیست؛ فهرست را تازه کنید.", 422, "invalid_cursor");
    params.push(filter.before);
    where.push(`(created_at,id) < (select created_at,id from refunds where id=$${params.length})`);
  }
  if (filter.status !== "all") { params.push(filter.status); where.push(`status=$${params.length}`); }
  if (filter.search) { params.push(filter.search); const p=`$${params.length}`; where.push(`(strpos(lower(id),lower(${p}))>0 or strpos(lower(order_id),lower(${p}))>0)`); }
  params.push(filter.limit + 1);
  const result = await query<RefundRow>(`select * from refunds ${where.length ? `where ${where.join(" and ")}` : ""} order by created_at desc,id desc limit $${params.length}`, params);
  const items = result.rows.slice(0,filter.limit);
  return { items: items.map(publicRefund), nextCursor: result.rows.length > filter.limit ? items[items.length-1].id : null };
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
  if (!settings.superadmins.includes(input.actor) && !config.panelOpenAccess) {
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
        await client.query("update product_variants set on_hand = on_hand + $2, quarantined = quarantined + $2, updated_at = now() where id = $1", [
          variantId,
          refund.quantity,
        ]);
        await client.query(
          `insert into inventory_movements (variant_id, delta, reason, ref_type, ref_id, actor, note, dedupe_key)
           values ($1, $6, 'qc_rejected', 'refund', $2, $3, $4, $5)
           on conflict (dedupe_key) do nothing`,
          [variantId, refund.id, input.actor, input.note ?? null, `qc-defective:${refund.id}`, refund.quantity],
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
export async function payExchangeDifference(_input: { token: string; actor: string }) {
  // Covers old links, including ones already marked paid by the old mock.
  throw new CommerceError("پرداخت اختلاف تعویض تا اتصال فرآیند معتبر غیرفعال است.",503,"exchange_unavailable");
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
  if (!settings.superadmins.includes(input.actor) && !config.panelOpenAccess) {
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
    if (refund.kind === "exchange") throw new CommerceError("تسویهٔ تعویض تا تکمیل فرآیند موجودی و ارسال غیرفعال است؛ درخواست قدیمی نیازمند بررسی دستی است.",503,"exchange_unavailable");
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
    const providerId = attempt.rows[0]?.provider ?? "external";
    // Only the simulated provider implements a reversal here, and only outside
    // production. Real gateways and manually attested payments go to human
    // review; never manufacture a successful provider refund reference.
    const capabilities = providerId === "external" ? null : providerCapabilities(providerId);
    const canReverse = providerId === "mock" && !config.isProd && !!capabilities?.refund && (refund.quantity === line.quantity || capabilities.partialRefund);

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
  baseline_on_hand: number | null;
  counted_on_hand: number | null;
  baseline_stock_version: string | null;
  decision_note: string | null;
  operation_key: string | null;
  operation_fingerprint: string | null;
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
    baselineOnHand: row.baseline_on_hand,
    countedOnHand: row.counted_on_hand,
    decisionNote: row.decision_note,
  };
}


type OperationIdentity = {operationKey?:string;fingerprint?:string;requestId?:string};
async function existingOperation(client:PoolClient, input:OperationIdentity & {actor:string}) {
  if (!input.operationKey) return null;
  await client.query("select pg_advisory_xact_lock(hashtext($1))",[input.operationKey]);
  const found=await client.query<AdjustmentRow>("select * from inventory_adjustments where operation_key=$1",[input.operationKey]);
  const row=found.rows[0];
  if (row && (row.requested_by !== input.actor || row.operation_fingerprint !== input.fingerprint)) throw new CommerceError("شناسه درخواست قبلاً برای عملیات دیگری استفاده شده است.",409,"operation_key_conflict");
  return row ?? null;
}
export async function requestAdjustment(input: OperationIdentity & {variantId:string;delta:number;reason:string;actor:string;note?:string;expectedVersion?:string}) {
  if (!Number.isSafeInteger(input.delta) || Math.abs(input.delta) > 1000000 || (!input.delta && input.reason !== "receiving")) throw new CommerceError("مقدار اصلاح معتبر نیست.",400,"invalid_delta");
  return withTransaction(async client => {
    const existing=await existingOperation(client,input);
    if(existing) return publicAdjustment(existing);
    const variant=await client.query<{id:string;version:string}>("select id,updated_at::text as version from product_variants where id=$1 for update",[input.variantId]);
    if(!variant.rows[0]) throw notFound("واریانت پیدا نشد.");
    if(input.expectedVersion !== undefined && (typeof input.expectedVersion !== "string" || !input.expectedVersion || input.expectedVersion !== variant.rows[0].version)) throw new CommerceError("اطلاعات تنوع یا موجودی تغییر کرده است؛ ابتدا فهرست را تازه کنید.",409,"stale_inventory");
    const id=`adj_${randomUUID()}`;
    const result=await client.query<AdjustmentRow>(`insert into inventory_adjustments (id,variant_id,delta,reason,requested_by,note,operation_key,operation_fingerprint)
      values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,[id,input.variantId,input.delta,input.reason,input.actor,input.note ?? null,input.operationKey ?? null,input.fingerprint ?? null]);
    await recordAudit({actor:input.actor,action:"inventory.requested",targetType:"inventory_adjustment",targetId:id,after:{variantId:input.variantId,delta:input.delta,reason:input.reason,note:input.note},requestId:input.requestId},client);
    return publicAdjustment(result.rows[0]);
  });
}
/** A count is recorded against a locked physical baseline. */
export async function requestStocktake(input: OperationIdentity & {variantId:string;counted:number;expectedOnHand:number;expectedVersion:string;actor:string;note:string}) {
  if (!Number.isSafeInteger(input.counted) || input.counted < 0 || input.counted > 1000000 || !Number.isSafeInteger(input.expectedOnHand) || input.expectedOnHand < 0 || typeof input.expectedVersion !== "string" || !input.expectedVersion) throw new CommerceError("تعداد شمارش معتبر نیست.",400,"invalid_count");
  return withTransaction(async client => {
    const existing=await existingOperation(client,input);
    if(existing) return publicAdjustment(existing);
    const variant = await client.query<{on_hand:number; version:string}>("select on_hand, updated_at::text as version from product_variants where id=$1 for update",[input.variantId]);
    if (!variant.rows[0]) throw notFound("واریانت پیدا نشد.");
    const baseline = Number(variant.rows[0].on_hand);
    if (baseline !== input.expectedOnHand || variant.rows[0].version !== input.expectedVersion) throw new CommerceError("موجودی از زمان نمایش تغییر کرده است؛ ابتدا اطلاعات را تازه کنید.",409,"stale_stocktake");
    const id=`adj_${randomUUID()}`;
    const result = await client.query<AdjustmentRow>(`insert into inventory_adjustments (id,variant_id,delta,reason,requested_by,note,baseline_on_hand,counted_on_hand,baseline_stock_version,operation_key,operation_fingerprint)
      values($1,$2,$3,'stocktake',$4,$5,$6,$7,$8,$9,$10) returning *`,[id,input.variantId,input.counted-baseline,input.actor,input.note,baseline,input.counted,variant.rows[0].version,input.operationKey ?? null,input.fingerprint ?? null]);
    await recordAudit({actor:input.actor,action:"inventory.stocktake_requested",targetType:"inventory_adjustment",targetId:id,after:{variantId:input.variantId,baseline,counted:input.counted,note:input.note},requestId:input.requestId},client);
    return publicAdjustment(result.rows[0]);
  });
}

export async function decideAdjustment(input: {
  id: string;
  decision: "approve" | "reject";
  actor: string;
  canSelfApprove?: boolean;
  note?: string;
  requestId?: string;
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
    if (adjustment.requested_by === input.actor && !input.canSelfApprove) {
      throw new CommerceError(
        "اصلاح دستی موجودی باید توسط شخص دیگری تأیید شود.",
        403,
        "two_person_rule",
      );
    }

    if (input.decision === "reject") {
      const rejected = await client.query<AdjustmentRow>(
        `update inventory_adjustments set status = 'rejected', approved_by = $2, decision_note = $3, decided_at = now()
          where id = $1 returning *`,
        [adjustment.id, input.actor, input.note ?? null],
      );
      await recordAudit({actor:input.actor,action:"stock_adjustment.reject",targetType:"inventory_adjustment",targetId:adjustment.id,before:{status:adjustment.status,delta:adjustment.delta},after:{status:"rejected"},reason:input.note,requestId:input.requestId},client);
      return { ok: true, adjustment: publicAdjustment(rejected.rows[0]), unchanged: false };
    }

    const variant = await client.query<{ on_hand: number; quarantined: number; version:string }>(
      "select on_hand, quarantined, updated_at::text as version from product_variants where id = $1 for update",
      [adjustment.variant_id],
    );
    if (!variant.rows[0]) throw notFound("واریانت پیدا نشد.");
    const onHand = Number(variant.rows[0].on_hand);
    if (adjustment.baseline_on_hand !== null && (onHand !== Number(adjustment.baseline_on_hand) || adjustment.baseline_stock_version !== variant.rows[0].version)) {
      throw new CommerceError("موجودی پس از شمارش تغییر کرده است؛ شمارش تازه لازم است.",409,"stale_stocktake");
    }
    const reserved = await client.query<{n:number}>("select coalesce(sum(quantity),0)::int as n from stock_reservations where variant_id=$1 and status='active' and expires_at>now()",[adjustment.variant_id]);
    if (onHand + adjustment.delta < Number(variant.rows[0].quarantined) + Number(reserved.rows[0].n)) {
      throw new CommerceError("اصلاح موجودی از مقدار رزروشده و قرنطینه کمتر می‌شود.",409,"stock_committed");
    }
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
      `update inventory_adjustments set status = 'approved', approved_by = $2, decision_note = $3, decided_at = now()
        where id = $1 returning *`,
      [adjustment.id, input.actor, input.note ?? null],
    );
    await recordAudit({actor:input.actor,action:"stock_adjustment.approve",targetType:"inventory_adjustment",targetId:adjustment.id,before:{status:adjustment.status,delta:adjustment.delta},after:{status:"approved"},reason:input.note,requestId:input.requestId},client);
    return { ok: true, adjustment: publicAdjustment(approved.rows[0]), unchanged: false };
  });
}
