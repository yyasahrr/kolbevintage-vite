import { query, withTransaction } from "../db";
import { assertQuoteFresh, refreshQuoteUnderLock, staleQuoteError } from "./payments";
import { loadCommerceSettings } from "./settings";
import { normalizeItems, startCheckout, type CheckoutAddress, type CheckoutItemInput, type CheckoutRow } from "./checkout";
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
  /** Explicit acknowledgement of a changed server quote on retry. */
  confirmedQuoteVersion?: string;
}

export async function createManualOrder(input: ManualOrderInput, actor: string) {
  if (!input || typeof input.paymentReference!=="string" || typeof input.idempotencyKey!=="string" ||
      !input.idempotencyKey.trim() || input.idempotencyKey.length>120 || !input.address || !Array.isArray(input.items) ||
      input.items.some(item=>!item || typeof item!=="object" || Array.isArray(item)) ||
      (input.customerEmail != null && typeof input.customerEmail!=="string") ||
      (input.couponCode != null && typeof input.couponCode!=="string") ||
      (input.shippingMethod != null && input.shippingMethod!=="standard" && input.shippingMethod!=="express") ||
      (input.confirmedQuoteVersion != null && typeof input.confirmedQuoteVersion!=="string")) {
    throw new CommerceError("اطلاعات سفارش یا کلید تکرار معتبر نیست.",400,"manual_order_invalid");
  }
  const paymentReference = input.paymentReference.trim();
  if (!paymentReference) {
    throw new CommerceError("شماره مرجع پرداخت خارجی لازم است.", 400, "manual_payment_reference_required");
  }
  if (typeof input.address.receiver!=="string" || !input.address.receiver.trim() ||
      typeof input.address.phone!=="string" || !input.address.phone.trim() ||
      typeof input.address.street!=="string" || !input.address.street.trim()) {
    throw new CommerceError("نام گیرنده، موبایل و نشانی کامل لازم است.", 400, "manual_address_incomplete");
  }
  if (!input.items.length) throw new CommerceError("حداقل یک قلم کالا انتخاب کن.", 400, "empty_cart");

  const started = await startCheckout({
    items: input.items,
    customerEmail: input.customerEmail?.trim().toLowerCase() || null,
    address: input.address,
    shippingMethod: input.shippingMethod,
    couponCode: input.couponCode,
    idempotencyKey: `manual:${input.idempotencyKey}`,
    allowAnonymousReuse: true,
  });
  const checkoutId = started.checkout.id;
  if (started.reused) {
    const saved=(await query<CheckoutRow>("select * from checkout_sessions where id=$1",[checkoutId])).rows[0];
    const itemKey=(items:{variantId:string;quantity:number}[])=>JSON.stringify(items.map(i=>[i.variantId,i.quantity]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
    const canonical=(value:unknown):unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value==='object' ? Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])) : value;
    const requested=normalizeItems(input.items);
    if (!saved || itemKey(requested)!==itemKey(saved.quote.lines) ||
        JSON.stringify(canonical(input.address))!==JSON.stringify(canonical(saved.address)) ||
        (input.shippingMethod==='express'?'express':'standard')!==saved.shipping_method ||
        (input.couponCode?.trim().toUpperCase() || null)!==saved.coupon_code) {
      throw new CommerceError("این کلید قبلاً برای سفارش متفاوتی استفاده شده است.",409,"idempotency_conflict");
    }
  }

  // A repeated click/request returns the original order instead of consuming
  // the same units twice or issuing a second invoice.
  const existing = await query<{ id: string }>("select id from orders where checkout_id = $1", [checkoutId]);
  if (existing.rows[0]) {
    const found = await getOrder(existing.rows[0].id);
    if (found.order.data?.externalPaymentRef !== paymentReference) throw new CommerceError("این کلید قبلاً با مرجع پرداخت دیگری استفاده شده است.",409,"idempotency_conflict");
    return { order: publicOrder(found.order, found.lines), legacy: found.order.data, reused: true };
  }

  const checked=(await query<CheckoutRow>("select * from checkout_sessions where id=$1",[checkoutId])).rows[0];
  if (!checked) throw new CommerceError("فرآیند تسویه پیدا نشد.",404,"checkout_not_found");
  await assertQuoteFresh(checked,await loadCommerceSettings(),true);
  const created = await withTransaction(async (client) => {
    await client.query("set transaction isolation level repeatable read");
    const locked = await client.query<CheckoutRow>("select * from checkout_sessions where id = $1 for update", [checkoutId]);
    const checkout = locked.rows[0];
    if (checkout && checkout.status !== "reserved") {
      const prior=(await client.query<{id:string}>("select id from orders where checkout_id=$1",[checkoutId])).rows[0];
      if (prior) {
        const existingData=(await client.query<{data:Record<string,unknown>}>("select data from orders where id=$1",[prior.id])).rows[0];
        if (existingData?.data?.externalPaymentRef !== paymentReference) throw new CommerceError("این کلید قبلاً با مرجع پرداخت دیگری استفاده شده است.",409,"idempotency_conflict");
        return {id:prior.id,reused:true};
      }
    }
    if (!checkout || checkout.status !== "reserved" || (checkout.reservation_expires_at && new Date(checkout.reservation_expires_at)<=new Date())) {
      throw new CommerceError("مهلت رزرو این سفارش تمام شده؛ فرم را دوباره ثبت کن.", 409, "checkout_closed");
    }
    if (checkout.quote_version!==checked.quote_version || JSON.stringify(checkout.quote)!==JSON.stringify(checked.quote) ||
        checkout.shipping_method!==checked.shipping_method || checkout.coupon_code!==checked.coupon_code) {
      throw new CommerceError("تسویه هم‌زمان تغییر کرد؛ دوباره بررسی کنید.",409,"checkout_changed");
    }
    const fresh=await refreshQuoteUnderLock(client,checkout,true);
    if(fresh) return {stale:fresh,id:null,reused:false};
    if (checkout.manual_quote_confirm_required && input.confirmedQuoteVersion!==checkout.quote_version) {
      throw new CommerceError("مبلغ جدید را با پرداخت خارجی تطبیق و تأیید کنید.",409,"manual_quote_confirmation_required",{quote:checkout.quote});
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
    return {id:inserted.id,reused:false,stale:null};
  }).catch(error=>{
    if ((error as {code?:string})?.code === "40001") throw new CommerceError("تسویه هم‌زمان تغییر کرد؛ دوباره بررسی کنید.",409,"checkout_changed");
    throw error;
  });
  if ('stale' in created && created.stale) throw staleQuoteError(created.stale);
  const found = await getOrder(created.id!);
  return { order: publicOrder(found.order, found.lines), legacy: found.order.data, reused: created.reused };
}
