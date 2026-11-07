import { query, withTransaction } from "../db";
import { startCheckout, type CheckoutAddress, type CheckoutItemInput, type CheckoutRow } from "./checkout";
import { CommerceError } from "./errors";
import { consumeReservations } from "./inventory";
import { enqueue } from "./outbox";
import { getOrder, insertOrder, publicOrder } from "./orders";

/* =====================================================================
   Manual orders

   A telephone/back-office order uses the exact same quote, stock hold,
   immutable line snapshots and fulfilment lifecycle as a storefront order.
   The only difference is that the administrator attests to an external
   payment reference. We never invent a gateway callback or a paid attempt.
   ===================================================================== */

export interface ManualOrderInput {
  items: CheckoutItemInput[];
  address: CheckoutAddress;
  customerEmail?: string | null;
  shippingMethod?: "standard" | "express";
  couponCode?: string | null;
  paymentReference: string;
  idempotencyKey: string;
}

export async function createManualOrder(input: ManualOrderInput, actor: string) {
  const paymentReference = input.paymentReference.trim();
  if (!paymentReference) {
    throw new CommerceError("شماره مرجع پرداخت خارجی لازم است.", 400, "manual_payment_reference_required");
  }
  if (!input.address.receiver?.trim() || !input.address.phone?.trim() || !input.address.street?.trim()) {
    throw new CommerceError("نام گیرنده، موبایل و نشانی کامل لازم است.", 400, "manual_address_incomplete");
  }
  if (!input.items.length) throw new CommerceError("حداقل یک قلم کالا انتخاب کن.", 400, "empty_cart");

  const started = await startCheckout({
    items: input.items,
    customerEmail: input.customerEmail?.trim() || null,
    address: input.address,
    shippingMethod: input.shippingMethod,
    couponCode: input.couponCode,
    idempotencyKey: `manual:${input.idempotencyKey}`,
  });
  const checkoutId = started.checkout.id;

  // A repeated click/request returns the original order instead of consuming
  // the same units twice or issuing a second invoice.
  const existing = await query<{ id: string }>("select id from orders where checkout_id = $1", [checkoutId]);
  if (existing.rows[0]) {
    const found = await getOrder(existing.rows[0].id);
    return { order: publicOrder(found.order, found.lines), legacy: found.order.data, reused: true };
  }

  const created = await withTransaction(async (client) => {
    const locked = await client.query<CheckoutRow>("select * from checkout_sessions where id = $1 for update", [checkoutId]);
    const checkout = locked.rows[0];
    if (!checkout || checkout.status !== "reserved") {
      throw new CommerceError("مهلت رزرو این سفارش تمام شده؛ فرم را دوباره ثبت کن.", 409, "checkout_closed");
    }
    if (checkout.coupon_code && Number(checkout.quote.couponDiscount)>0) {
      const claimed=await client.query(`update coupons set used_count=used_count+1,updated_at=now()
        where code=$1 and active and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>=now())
          and (usage_limit is null or used_count<usage_limit) returning code`,[checkout.coupon_code]);
      if (!claimed.rowCount) throw new CommerceError("ظرفیت یا اعتبار کد تغییر کرده است؛ سفارش ثبت نشد.",409,"coupon_exhausted");
    }
    const consumed = await consumeReservations(client, checkoutId);
    if (!consumed.ok) {
      throw new CommerceError("موجودی رزروشده دیگر معتبر نیست؛ سفارش ثبت نشد.", 409, "reservation_expired");
    }
    const inserted = await insertOrder(client, {
      checkout,
      quote: checkout.quote,
      status: "paid",
      paymentStatus: "settled",
      method: "online",
    });
    await client.query("update checkout_sessions set status = 'completed', updated_at = now() where id = $1", [checkoutId]);
    await client.query(
      `update orders
          set data = data || $2::jsonb
        where id = $1`,
      [
        inserted.id,
        JSON.stringify({
          manual: true,
          externalPaymentRef: paymentReference,
          gateway: "پرداخت خارجی — ثبت مدیر",
          commerce: { checkoutId, paymentAttemptId: null, method: "external" },
        }),
      ],
    );
    await enqueue(client, "order.paid", { orderId: inserted.id, actor, manual: true }, `order.paid:${inserted.id}`);
    return inserted;
  });

  const found = await getOrder(created.id);
  return { order: publicOrder(found.order, found.lines), legacy: found.order.data, reused: false };
}
