import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query, withTransaction } from "../db";
import { CommerceError, notFound } from "./errors";
import { enqueue } from "./outbox";
import type { Quote } from "./pricing";
import type { CheckoutAddress, CheckoutRow } from "./checkout";

/* =====================================================================
   Orders — an immutable financial snapshot plus a delivery lifecycle.

   Prices, discounts and shipping are copied into `order_lines` at payment
   time. Changing a product price a month later never rewrites an invoice;
   refunds are separate adjustment documents.
   ===================================================================== */

export type OrderStatus = "paid" | "preparing" | "shipped" | "delivered" | "exception" | "cancelled";

/** the admin panel still speaks its own vocabulary (pending/processing/...). */
const ADMIN_STATUS: Record<OrderStatus | "pending_payment", string> = {
  pending_payment: "pending",
  paid: "processing",
  preparing: "processing",
  shipped: "shipped",
  delivered: "done",
  // exceptions are a real queue: showing them as "pending" hid payment
  // problems inside the normal warehouse backlog
  exception: "exception",
  cancelled: "cancelled",
};

export interface OrderRow {
  id: string;
  created_at: Date;
  customer: string | null;
  email: string | null;
  status: string;
  total: string | number | null;
  data: Record<string, unknown>;
  subtotal: string | number | null;
  discount_total: string | number | null;
  shipping_total: string | number | null;
  currency: string | null;
  payment_status: string | null;
  fulfillment_status: string | null;
  exception_reason: string | null;
  coupon_code: string | null;
  checkout_id: string | null;
}

export interface OrderLineRow {
  id: string;
  order_id: string;
  variant_id: string | null;
  product_id: string | null;
  sku: string | null;
  name_snapshot: string;
  color_id: string | null;
  color_name: string | null;
  size_id: string | null;
  size_label: string | null;
  quantity: number;
  unit_price: string | number;
  discount_amount: string | number;
  line_total: string | number;
  refunded_quantity: number;
  position: number;
}

export async function nextOrderId(client: PoolClient): Promise<string> {
  const res = await client.query<{ id: string }>("select 'VL-' || nextval('order_number_seq')::text as id");
  return res.rows[0].id;
}

export function publicOrder(order: OrderRow, lines: OrderLineRow[]) {
  return {
    id: order.id,
    createdAt: order.created_at,
    status: order.status,
    paymentStatus: order.payment_status,
    fulfillmentStatus: order.fulfillment_status,
    exceptionReason: order.exception_reason,
    customer: order.customer,
    email: order.email,
    currency: order.currency ?? "EUR",
    subtotal: Number(order.subtotal ?? 0),
    discountTotal: Number(order.discount_total ?? 0),
    shippingTotal: Number(order.shipping_total ?? 0),
    total: Number(order.total ?? 0),
    coupon: order.coupon_code,
    checkoutId: order.checkout_id,
    lines: lines.map((line) => ({
      id: line.id,
      variantId: line.variant_id,
      productId: line.product_id,
      sku: line.sku,
      name: line.name_snapshot,
      colorId: line.color_id,
      colorName: line.color_name,
      sizeId: line.size_id,
      sizeLabel: line.size_label,
      quantity: line.quantity,
      unitPrice: Number(line.unit_price),
      discountAmount: Number(line.discount_amount),
      lineTotal: Number(line.line_total),
      refundedQuantity: line.refunded_quantity,
    })),
  };
}

/**
 * Writes the order + its immutable lines inside the caller's transaction.
 * The caller decides whether the payment settled (`paid`) or arrived after
 * the stock hold was gone (`exception`).
 */
export async function insertOrder(
  client: PoolClient,
  params: {
    checkout: CheckoutRow;
    quote: Quote;
    status: OrderStatus;
    paymentStatus: "settled" | "unpaid";
    attemptId?: string | null;
    method?: "online" | "bnpl4";
    exceptionReason?: string | null;
  },
) {
  const { checkout, quote } = params;
  const id = await nextOrderId(client);
  const address: CheckoutAddress = checkout.address ?? {};
  const customer = address.receiver?.trim() || checkout.customer_email || "مشتری مهمان";
  const now = new Date();

  const data = {
    id,
    at: now.getTime(),
    customer,
    email: checkout.customer_email ?? "",
    phone: address.phone ?? "",
    city: address.city ?? "",
    address: [address.province, address.city, address.street].filter(Boolean).join("، "),
    shipping: checkout.shipping_method,
    lines: quote.lines.map((line) => ({
      name: line.name,
      productId: line.productId,
      color: line.colorName,
      colorId: line.colorId,
      size: line.sizeLabel,
      sizeId: line.sizeId,
      qty: line.quantity,
      price: line.unitPrice,
    })),
    subtotal: quote.subtotal,
    discounts: quote.discounts.map((d) => ({ name: d.name, amount: d.amount })),
    discountTotal: quote.discountTotal,
    shippingCost: quote.shippingTotal,
    total: quote.grandTotal,
    status: ADMIN_STATUS[params.status],
    coupon: quote.couponCode ?? undefined,
    campaign: quote.discounts.find((d) => d.source === "campaign")?.name,
    gateway: params.method === "bnpl4" ? "پرداخت چهارقسطی" : "پرداخت آنلاین",
    paymentStatus: params.paymentStatus,
    fulfillmentStatus: "unfulfilled",
    exceptionReason: params.exceptionReason ?? undefined,
    commerce: { checkoutId: checkout.id, paymentAttemptId: params.attemptId ?? null, method: params.method ?? "online" },
  };

  await client.query(
    `insert into orders (id, created_at, customer, email, status, total, data,
                         subtotal, discount_total, shipping_total, currency, payment_status, fulfillment_status,
                         exception_reason, coupon_code, checkout_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [
      id,
      now,
      customer,
      checkout.customer_email,
      params.status,
      quote.grandTotal,
      JSON.stringify(data),
      quote.subtotal,
      quote.discountTotal,
      quote.shippingTotal,
      quote.currency,
      params.paymentStatus,
      "unfulfilled",
      params.exceptionReason ?? null,
      quote.couponCode,
      checkout.id,
    ],
  );

  let position = 0;
  for (const line of quote.lines) {
    await client.query(
      `insert into order_lines (id, order_id, variant_id, product_id, sku, name_snapshot, color_id, color_name,
                                size_id, size_label, quantity, unit_price, discount_amount, line_total, position)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        `ol_${randomUUID()}`,
        id,
        line.variantId,
        line.productId,
        line.sku,
        line.name,
        line.colorId,
        line.colorName,
        line.sizeId,
        line.sizeLabel,
        line.quantity,
        line.unitPrice,
        line.discountAmount,
        line.lineTotal,
        position,
      ],
    );
    position += 1;
  }
  return { id, data };
}

export async function getOrder(id: string): Promise<{ order: OrderRow; lines: OrderLineRow[] }> {
  const res = await query<OrderRow>("select * from orders where id = $1", [id]);
  const order = res.rows[0];
  if (!order) throw notFound("سفارش پیدا نشد.");
  const lines = await query<OrderLineRow>("select * from order_lines where order_id = $1 order by position", [id]);
  return { order, lines: lines.rows };
}

export async function listOrders(filter: { email?: string | null; status?: string | null; limit?: number }) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filter.email) {
    params.push(filter.email);
    where.push(`email = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    where.push(`status = $${params.length}`);
  }
  params.push(Math.min(200, filter.limit ?? 100));
  const res = await query<OrderRow>(
    `select * from orders ${where.length ? `where ${where.join(" and ")}` : ""}
      order by created_at desc limit $${params.length}`,
    params,
  );
  const ids = res.rows.map((r) => r.id);
  const lines = ids.length
    ? await query<OrderLineRow>("select * from order_lines where order_id = any($1::text[]) order by position", [ids])
    : { rows: [] as OrderLineRow[] };
  const byOrder = new Map<string, OrderLineRow[]>();
  for (const line of lines.rows) byOrder.set(line.order_id, [...(byOrder.get(line.order_id) ?? []), line]);
  return res.rows.map((order) => publicOrder(order, byOrder.get(order.id) ?? []));
}

const LIFECYCLE: Record<string, { from: string[]; to: OrderStatus; fulfillment: string }> = {
  picking: { from: ["paid", "preparing"], to: "preparing", fulfillment: "picking" },
  packing: { from: ["paid", "preparing"], to: "preparing", fulfillment: "packed" },
  ship: { from: ["paid", "preparing"], to: "shipped", fulfillment: "shipped" },
  deliver: { from: ["shipped"], to: "delivered", fulfillment: "delivered" },
};

/**
 * Warehouse steps. Picking requires scanning the SKU of a line on this
 * order; a wrong scan blocks the flow. Packing is a manual confirmation.
 */
export async function advanceOrder(
  orderId: string,
  action: "picking" | "packing" | "ship" | "deliver",
  opts: { sku?: string; actor?: string; note?: string } = {},
) {
  const { order, lines } = await getOrder(orderId);
  const step = LIFECYCLE[action];

  if (action !== "picking" && order.status === step.to) {
    return { ok: true, order: publicOrder(order, lines), unchanged: true };
  }
  if (order.status === "exception" || order.status === "cancelled") {
    throw new CommerceError("این سفارش در وضعیت استثنا یا لغوشده قابل پردازش انبار نیست.", 409, "order_blocked");
  }
  if (!step.from.includes(order.status)) {
    throw new CommerceError(`این عملیات از وضعیت «${order.status}» ممکن نیست.`, 409, "invalid_transition");
  }

  if (action === "picking") {
    const sku = (opts.sku ?? "").trim().toUpperCase();
    if (!sku) throw new CommerceError("برای برداشت، اسکن SKU لازم است.", 400, "sku_required");
    const match = lines.find((line) => (line.sku ?? "").toUpperCase() === sku);
    if (!match) {
      await query(
        `insert into fulfillment_events (order_id, stage, sku, accepted, actor, note)
         values ($1, 'picking', $2, false, $3, 'wrong sku')`,
        [orderId, sku, opts.actor ?? null],
      );
      throw new CommerceError("این SKU به این سفارش تعلق ندارد؛ برداشت متوقف شد.", 409, "sku_mismatch");
    }
  }
  if (action === "packing" && opts.note === "unconfirmed") {
    throw new CommerceError("بسته‌بندی نیاز به تأیید دستی دارد.", 400, "packing_confirmation_required");
  }

  await withTransaction(async (client) => {
    await client.query(
      `insert into fulfillment_events (order_id, stage, sku, accepted, actor, note)
       values ($1, $2, $3, true, $4, $5)`,
      [orderId, action, opts.sku ?? null, opts.actor ?? null, opts.note ?? null],
    );
    await client.query(
      "update orders set status = $2, fulfillment_status = $3 where id = $1",
      [orderId, step.to, step.fulfillment],
    );
    await client.query(
      `update orders set data = jsonb_set(jsonb_set(data, '{status}', to_jsonb($2::text)), '{fulfillmentStatus}', to_jsonb($3::text))
        where id = $1`,
      [orderId, ADMIN_STATUS[step.to], step.fulfillment],
    );
  });

  const updated = await getOrder(orderId);
  return { ok: true, order: publicOrder(updated.order, updated.lines), unchanged: false };
}

/** cancellation releases nothing (the units were already claimed) but returns them to stock */
export async function cancelOrder(orderId: string, reason: string, actor: string) {
  return withTransaction(async (client) => {
    const res = await client.query<OrderRow>("select * from orders where id = $1 for update", [orderId]);
    const order = res.rows[0];
    if (!order) throw notFound("سفارش پیدا نشد.");
    if (order.status === "cancelled") return { ok: true, orderId, restocked: 0 };
    if (order.status === "shipped" || order.status === "delivered") {
      throw new CommerceError("سفارش ارسال‌شده را باید از مسیر مرجوعی رسیدگی کرد.", 409, "order_shipped");
    }
    const lines = await client.query<OrderLineRow>("select * from order_lines where order_id = $1", [orderId]);
    for (const line of lines.rows) {
      if (!line.variant_id) continue;
      await client.query("update product_variants set on_hand = on_hand + $2, updated_at = now() where id = $1", [
        line.variant_id,
        line.quantity,
      ]);
      await client.query(
        `insert into inventory_movements (variant_id, delta, reason, ref_type, ref_id, actor, note, dedupe_key)
         values ($1, $2, 'cancellation', 'order', $3, $4, $5, $6)
         on conflict (dedupe_key) do nothing`,
        [line.variant_id, line.quantity, orderId, actor, reason, `cancel:${orderId}:${line.id}`],
      );
    }
    await client.query("update orders set status = 'cancelled', exception_reason = $2 where id = $1", [
      orderId,
      reason,
    ]);
    await client.query(
      `update orders set data = jsonb_set(data, '{status}', to_jsonb('cancelled'::text)) where id = $1`,
      [orderId],
    );
    await enqueue(client, "order.cancelled", { orderId, reason, actor }, `order.cancelled:${orderId}`);
    return { ok: true, orderId, restocked: lines.rowCount ?? 0 };
  });
}
