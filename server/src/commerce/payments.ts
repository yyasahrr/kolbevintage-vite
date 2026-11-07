import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { config } from "../config";
import type { PoolClient } from "pg";
import { query, withTransaction } from "../db";
import type { CheckoutRow } from "./checkout";
import { getCheckout } from "./checkout";
import { recordCashback } from "./cashback";
import { CommerceError, notFound } from "./errors";
import { consumeReservations, expireReservations } from "./inventory";
import { insertOrder, type OrderStatus } from "./orders";
import { cashbackWallet, redeemCashback, round2 } from "./cashback";
import { enqueue } from "./outbox";
import { buildQuote, type Quote } from "./pricing";
import { loadCommerceSettings, loadCommerceSettingsSnapshot, type CommerceSettings } from "./settings";
import { gatewayConfigured, gatewayProvider } from "./gateway";
import { requirePurchaseAccess } from "./early-access";

/* =====================================================================
   Payments — a callback is never proof of payment.

   The mock provider stands in for a real gateway, but the contract is the
   real one: the backend asks the provider to verify the transaction, keeps
   `pending_verification` when the answer times out, and settles exactly
   once thanks to row locks + unique keys. A payment that lands after the
   stock hold expired becomes an EXCEPTION order: money is recorded, stock
   is *not* re-reserved and nothing is shipped automatically.
   ===================================================================== */

export type PaymentStatus = "initiated" | "pending_verification" | "settled" | "failed" | "exception" | "expired";

export interface PaymentAttemptRow {
  id: string;
  checkout_id: string;
  order_id: string | null;
  provider: string;
  method: "online" | "bnpl4";
  amount: string | number;
  wallet_applied: string | number;
  wallet_email: string | null;
  quote_snapshot: Quote | null;
  status: PaymentStatus;
  idempotency_key: string | null;
  provider_ref: string | null;
  verify_attempts: number;
  last_error: string | null;
  raw: Record<string, unknown> | null;
  expires_at: Date | null;
  created_at: Date;
}

export interface VerifyOutcome {
  outcome: "settled" | "failed" | "pending" | "exception";
  providerRef: string;
  amount?: number;
  reason?: string;
  raw: Record<string, unknown>;
}

/**
 * What a provider can actually do. The store never assumes a capability: a
 * store-wide BNPL switch is worthless if the provider is not contracted for it,
 * and a refund must not be silently "settled" when the provider cannot reverse
 * the money. Missing capability ⇒ the operation is refused or parked for a
 * human, never faked.
 */
export interface ProviderCapabilities {
  bnpl4: boolean;
  refund: boolean;
  partialRefund: boolean;
  signedCallbacks: boolean;
}

export interface PaymentProvider {
  id: string;
  method: "online" | "bnpl4";
  capabilities: ProviderCapabilities;
  initiate(attempt: PaymentAttemptRow): Promise<{ providerRef: string; redirectUrl: string | null; instructions: string }>;
  verify(attempt: PaymentAttemptRow, params: Record<string, unknown>): Promise<VerifyOutcome>;
}

/**
 * Mock provider used by the demo build and the integration tests.
 * `result` drives the outcome: success | fail | timeout | reject.
 */
export const mockProvider: PaymentProvider = {
  id: "mock",
  method: "online",
  capabilities: { bnpl4: false, refund: true, partialRefund: true, signedCallbacks: true },
  async initiate(attempt) {
    return {
      providerRef: `mock_${attempt.id}`,
      redirectUrl: null,
      instructions: `درگاه شبیه‌سازی‌شده. برای تأیید، POST /api/commerce/payments/${attempt.id}/simulate با {"result":"success"} بفرست.`,
    };
  },
  async verify(attempt, params) {
    const result = String(params.result ?? "success");
    const raw = { result, at: new Date().toISOString(), provider: "mock" };
    if (result === "success") {
      return { outcome: "settled", providerRef: attempt.provider_ref ?? `mock_${attempt.id}`, amount: Number(attempt.amount), raw };
    }
    if (result === "timeout") {
      return { outcome: "pending", providerRef: attempt.provider_ref ?? "", reason: "provider_timeout", raw };
    }
    if (result === "exception") {
      return { outcome: "exception", providerRef: attempt.provider_ref ?? "", reason: "provider_error", raw };
    }
    return { outcome: "failed", providerRef: attempt.provider_ref ?? "", reason: "declined", raw };
  },
};

export const mockBnplProvider: PaymentProvider = {
  ...mockProvider,
  id: "mock-bnpl4",
  method: "bnpl4",
  // the installment provider is contracted for BNPL but not for partial money
  // reversals: those must go to a human (see commerce/refunds.ts)
  capabilities: { bnpl4: true, refund: false, partialRefund: false, signedCallbacks: true },
  async initiate(attempt) {
    return {
      providerRef: `mockbnpl_${attempt.id}`,
      redirectUrl: null,
      instructions: `درگاه چهارقسطی شبیه‌سازی‌شده. تأیید ارائه‌دهنده الزامی است؛ برای رد شدن {"result":"reject"} بفرست.`,
    };
  },
  async verify(attempt, params) {
    const result = String(params.result ?? "success");
    const raw = { result, at: new Date().toISOString(), provider: "mock-bnpl4" };
    if (result === "success") {
      return { outcome: "settled", providerRef: attempt.provider_ref ?? `mockbnpl_${attempt.id}`, amount: Number(attempt.amount), raw };
    }
    if (result === "timeout") return { outcome: "pending", providerRef: attempt.provider_ref ?? "", reason: "provider_timeout", raw };
    if (result === "reject") {
      return { outcome: "failed", providerRef: attempt.provider_ref ?? "", reason: "bnpl_rejected", raw };
    }
    return { outcome: "failed", providerRef: attempt.provider_ref ?? "", reason: "declined", raw };
  },
};

const PROVIDERS: Record<string, PaymentProvider> = {
  mock: mockProvider,
  "mock-bnpl4": mockBnplProvider,
  // the real gateway; refused unless PAYMENT_GATEWAY_URL is set (fail closed)
  gateway: gatewayProvider,
};

/** capabilities never gate on configuration: a store must be able to read what
    a provider can and cannot do without enabling it first */
export function providerCapabilities(id: string): ProviderCapabilities {
  const provider = PROVIDERS[id];
  if (!provider) throw new CommerceError(`درگاه «${id}» پشتیبانی نمی‌شود.`, 400, "provider_unknown");
  return provider.capabilities;
}

export function providerFor(id: string): PaymentProvider {
  const provider = PROVIDERS[id];
  if (!provider) throw new CommerceError(`درگاه «${id}» پشتیبانی نمی‌شود.`, 400, "provider_unknown");
  // No provider in this build has passed provider-specific production
  // integration, settlement and currency-unit verification. Never allow a
  // mock or generic adapter to take money merely by changing a setting.
  if (config.isProd) throw new CommerceError("پرداخت عملیاتی تا اتصال و تأیید درگاه واقعی در دسترس نیست.", 503, "production_provider_not_ready");
  if (id === "gateway" && !gatewayConfigured()) {
    // selecting a gateway without configuring it must fail loudly, not silently
    // fall back to the mock provider and take the order
    throw new CommerceError(
      "درگاه پرداخت واقعی پیکربندی نشده است؛ PAYMENT_GATEWAY_URL را تنظیم کن یا به درگاه آزمایشی برگرد.",
      503,
      "provider_not_configured",
    );
  }
  return provider;
}

/** which providers this build can actually offer right now */
export const availableProviders = () => ({
  mock: !config.isProd,
  gateway: !config.isProd && gatewayConfigured(),
});

export function publicAttempt(row: PaymentAttemptRow) {
  return {
    id: row.id,
    checkoutId: row.checkout_id,
    orderId: row.order_id,
    provider: row.provider,
    method: row.method,
    amount: Number(row.amount),
    walletApplied: Number(row.wallet_applied ?? 0),
    status: row.status,
    providerRef: row.provider_ref,
    verifyAttempts: row.verify_attempts,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

async function loadAttempt(id: string): Promise<PaymentAttemptRow> {
  const res = await query<PaymentAttemptRow>("select * from payment_attempts where id = $1", [id]);
  if (!res.rows[0]) throw notFound("تراکنش پیدا نشد.");
  return res.rows[0];
}

function quoteInputFrom(checkout: CheckoutRow) {
  return checkout.quote.lines.map((line) => ({
    variantId: line.variantId,
    productId: line.productId,
    sku: line.sku,
    name: line.name,
    colorId: line.colorId,
    colorName: line.colorName,
    sizeId: line.sizeId,
    sizeLabel: line.sizeLabel,
    lookId: line.lookId,
    category: line.category,
    unitPrice: line.unitPrice,
    quantity: line.quantity,
  }));
}

async function currentUnitPrices(variantIds: string[]) {
  if (!variantIds.length) return new Map<string, number>();
  const res = await query<{ id: string; price: string }>(
    `select v.id, p.price from product_variants v join products p on p.id = v.product_id
      where v.id = any($1::text[])`,
    [variantIds],
  );
  return new Map(res.rows.map((row) => [row.id, Number(row.price)]));
}

export async function assertQuoteFresh(checkout: CheckoutRow, settings: CommerceSettings, manualConfirmation = false) {
  // the catalogue price may have moved since the quote was frozen: re-read it
  // instead of trusting the line prices stored in the quote
  const prices = await currentUnitPrices(checkout.quote.lines.map((line) => line.variantId));
  const pricedLines = quoteInputFrom(checkout).map((line) => ({
    ...line,
    unitPrice: prices.get(line.variantId) ?? line.unitPrice,
  }));
  const priceDrifted = pricedLines.some((line, index) => line.unitPrice !== checkout.quote.lines[index].unitPrice);
  const fresh = await buildQuote({
    lines: pricedLines,
    couponCode: checkout.coupon_code,
    customerEmail:checkout.customer_email,
    shippingMethod: checkout.shipping_method,
    settings,
  });
  if (priceDrifted || fresh.quoteVersion !== checkout.quote_version) {
    // keep the stored quote in sync so the shopper sees the new numbers
    const updated = await query(
      `update checkout_sessions set quote = $2, quote_version = $3, subtotal = $4, discount_total = $5,
              shipping_total = $6, grand_total = $7, quote_expires_at = $8, updated_at = now(),
              manual_quote_confirm_required = case when $13 then true else manual_quote_confirm_required end
        where id = $1 and quote_version=$9 and status='reserved'
          and shipping_method=$10 and coupon_code is not distinct from $11 and quote=$12::jsonb returning id`,
      [
        checkout.id,
        JSON.stringify(fresh),
        fresh.quoteVersion,
        fresh.subtotal,
        fresh.discountTotal,
        fresh.shippingTotal,
        fresh.grandTotal,
        new Date(fresh.expiresAt), checkout.quote_version, checkout.shipping_method, checkout.coupon_code, JSON.stringify(checkout.quote), manualConfirmation,
      ],
    );
    if (!updated.rowCount) throw new CommerceError("تسویه هم‌زمان تغییر کرد؛ دوباره بررسی کنید.",409,"checkout_changed");
    throw new CommerceError(
      "قیمت یا شرایط سبد تغییر کرده است. مبلغ به‌روز شد؛ یک بار دیگر تأیید کن.",
      409,
      "quote_stale",
      { quote: fresh },
    );
  }
  return fresh;
}

/** Re-evaluate under the same repeatable-read snapshot as the financial
 * commitment. The caller holds the checkout row lock; changes are returned so
 * the transaction can commit the new quote before a 409 is reported. */
export async function refreshQuoteUnderLock(client:PoolClient, checkout:CheckoutRow, manualConfirmation=false):Promise<Quote | null> {
  await requirePurchaseAccess(client,checkout.quote.lines.map(line=>line.variantId),checkout.customer_email);
  const settings=await loadCommerceSettingsSnapshot(client);
  const prices=await client.query<{id:string;price:string;category:string;look_id:string|null}>(`select v.id,p.price,p.category,p.look_id from product_variants v
    join products p on p.id=v.product_id where v.id=any($1::text[])`,[checkout.quote.lines.map(line=>line.variantId)]);
  const byId=new Map(prices.rows.map(row=>[row.id,row]));
  if(checkout.quote.lines.some(line=>!byId.has(line.variantId))) throw new CommerceError("یکی از کالاهای سفارش دیگر در دسترس نیست.",409,"variant_not_found");
  const lines=quoteInputFrom(checkout).map(line=>{const product=byId.get(line.variantId)!;return {...line,unitPrice:Number(product.price),category:product.category,lookId:product.look_id};});
  const fresh=await buildQuote({lines,couponCode:checkout.coupon_code,customerEmail:checkout.customer_email,
    shippingMethod:checkout.shipping_method,settings},client);
  if(fresh.quoteVersion===checkout.quote_version && !lines.some((line,index)=>line.unitPrice!==checkout.quote.lines[index].unitPrice || line.category!==checkout.quote.lines[index].category || line.lookId!==checkout.quote.lines[index].lookId))return null;
  await client.query(`update checkout_sessions set quote=$2::jsonb,quote_version=$3,subtotal=$4,discount_total=$5,
    shipping_total=$6,grand_total=$7,quote_expires_at=$8,updated_at=now(),
    manual_quote_confirm_required=case when $9 then true else manual_quote_confirm_required end where id=$1`,
    [checkout.id,JSON.stringify(fresh),fresh.quoteVersion,fresh.subtotal,fresh.discountTotal,fresh.shippingTotal,fresh.grandTotal,new Date(fresh.expiresAt),manualConfirmation]);
  return fresh;
}

export function staleQuoteError(quote:Quote) {
  return new CommerceError("قیمت یا شرایط سبد تغییر کرده است. مبلغ به‌روز شد؛ یک بار دیگر تأیید کن.",409,"quote_stale",{quote});
}

export async function startPayment(input: {
  checkoutId: string;
  method?: "online" | "bnpl4";
  idempotencyKey?: string | null;
  /** the signed-in customer who wants to pay part of the order from the wallet */
  walletEmail?: string | null;
  useCashback?: boolean;
}) {
  const settings = await loadCommerceSettings();
  await expireReservations();
  const checkout = await getCheckout(input.checkoutId);

  if (checkout.status === "completed") {
    const existing = await query<PaymentAttemptRow>(
      "select * from payment_attempts where checkout_id = $1 and status = 'settled' order by created_at limit 1",
      [checkout.id],
    );
    if (existing.rows[0]) {
      return { attempt: publicAttempt(existing.rows[0]), payment: null, alreadySettled: true };
    }
    throw new CommerceError("این تسویه قبلاً نهایی شده است.", 409, "checkout_completed");
  }
  if (checkout.status !== "reserved") {
    throw new CommerceError(
      checkout.status === "expired" ? "مهلت نگه‌داشتن موجودی تمام شد؛ سبد را دوباره تسویه کن." : "این تسویه قابل پرداخت نیست.",
      409,
      checkout.status === "expired" ? "reservation_expired" : "checkout_closed",
    );
  }
  if (checkout.reservation_expires_at && new Date(checkout.reservation_expires_at) <= new Date()) {
    await expireReservations();
    throw new CommerceError("مهلت نگه‌داشتن موجودی تمام شد؛ سبد را دوباره تسویه کن.", 409, "reservation_expired");
  }

  const method: "online" | "bnpl4" = input.method === "bnpl4" ? "bnpl4" : "online";
  // OWN-05 revision: the installment gateway is store-wide. Product-level
  // "installment eligible" labels no longer hide or block it.
  if (method === "bnpl4") {
    if (!settings.bnpl4Enabled) {
      throw new CommerceError("پرداخت اقساطی در این فروشگاه فعال نیست.", 403, "bnpl_disabled");
    }
    // three states, not one boolean: enabled ≠ provider-ready ≠ available
    if (!settings.bnpl4ProviderReady) {
      throw new CommerceError(
        "ارائه‌دهندهٔ اقساط هنوز تأیید نشده؛ پرداخت چهارقسطی قابل شروع نیست (فعال‌بودن کلید کافی نیست).",
        409,
        "bnpl_provider_not_ready",
      );
    }
    if (!providerCapabilities(settings.bnpl4Provider).bnpl4) {
      throw new CommerceError("این ارائه‌دهنده قابلیت پرداخت چهارقسطی ندارد.", 409, "bnpl_provider_unsupported");
    }
  }

  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await query<PaymentAttemptRow>(
      "select * from payment_attempts where idempotency_key = $1",
      [idempotencyKey],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].checkout_id !== checkout.id) throw new CommerceError("کلید پرداخت متعلق به تسویه دیگری است.",409,"idempotency_conflict");
      const prior=existing.rows[0];
      if (!prior.provider_ref || prior.last_error === "payment_initiation_unconfirmed") {
        // A timeout after a provider call can mean it was captured remotely.
        // Never issue another external initiate merely because the response was lost.
        throw new CommerceError("نتیجه شروع پرداخت نامشخص است؛ تراکنش به بررسی نیاز دارد.",409,"payment_initiation_unconfirmed");
      }
      if (prior.status !== "initiated" && prior.status !== "pending_verification") {
        throw new CommerceError("این درخواست پرداخت دیگر قابل شروع نیست؛ وضعیت تراکنش را بررسی کنید.",409,"payment_attempt_closed");
      }
      const stored=prior.raw ?? {};
      return {
        attempt: publicAttempt(prior),
        payment: { redirectUrl: typeof stored.redirectUrl === "string" ? stored.redirectUrl : null,
          instructions: typeof stored.instructions === "string" ? stored.instructions : "وضعیت تراکنش قبلی را بررسی کنید.",
          mock: prior.provider.startsWith("mock") && settings.allowMockControls && !config.isProd },
        reused: true,
      };
    }
  }

  await assertQuoteFresh(checkout, settings);

  const provider = providerFor(method === "bnpl4" ? settings.bnpl4Provider : settings.paymentProvider);
  if (provider.method !== method) {
    throw new CommerceError("درگاه انتخاب‌شده با روش پرداخت نمی‌خواند.", 400, "provider_method_mismatch");
  }

  /* ---------- optional wallet payment ----------
     The invoice total never changes: the wallet only reduces the amount the
     gateway has to collect. Redemption itself is written (and re-checked) in
     the settlement transaction, so an abandoned payment never eats the balance. */
  let walletApplied = 0;
  const walletEmail = input.useCashback ? input.walletEmail ?? null : null;
  if (input.useCashback && !walletEmail) {
    throw new CommerceError("برای استفاده از کش‌بک باید وارد حساب شوی.", 401, "cashback_login_required");
  }
  if (walletEmail) {
    if (!settings.cashbackRedeemEnabled) {
      throw new CommerceError("استفاده از کش‌بک در پرداخت فعلاً غیرفعال است.", 403, "cashback_redeem_disabled");
    }
    const quote = checkout.quote;
    const hasDiscounts = Number(quote.discountTotal ?? 0) > 0;
    if (hasDiscounts && !settings.cashbackCombineWithDiscounts) {
      throw new CommerceError(
        "این سفارش تخفیف دارد و استفادهٔ هم‌زمان کش‌بک مجاز نیست.",
        409,
        "cashback_not_combinable",
      );
    }
    const goods = Math.max(0, Number(quote.subtotal ?? 0) - Number(quote.discountTotal ?? 0));
    const wallet = await cashbackWallet(walletEmail);
    const cap = Math.max(0, (goods * Math.max(0, Number(settings.cashbackRedeemMaxPercent) || 0)) / 100);
    walletApplied = round2(Math.min(wallet.available, cap, Number(quote.grandTotal ?? 0)));
    if (walletApplied <= 0) {
      throw new CommerceError(
        "موجودی قابل استفادهٔ کیف پول برای این سفارش کافی نیست (کش‌بک پس از تحویل و پایان مهلت مرجوعی آزاد می‌شود).",
        409,
        "cashback_unavailable",
      );
    }
  }

  const attemptId = `pay_${randomUUID()}`;
  const expiresAt = new Date(Date.now() + settings.paymentWindowMinutes * 60_000);
  const chargeable = round2(Math.max(0, Number(checkout.quote.grandTotal) - walletApplied));
  const result = await withTransaction(async client => {
    await client.query("set transaction isolation level repeatable read");
    const locked=(await client.query<CheckoutRow>("select * from checkout_sessions where id=$1 for update",[checkout.id])).rows[0];
    if (!locked || locked.status!=="reserved" || (locked.reservation_expires_at && new Date(locked.reservation_expires_at)<=new Date()) ||
        locked.quote_version!==checkout.quote_version || JSON.stringify(locked.quote)!==JSON.stringify(checkout.quote) ||
        locked.shipping_method!==checkout.shipping_method || locked.coupon_code!==checkout.coupon_code) {
      throw new CommerceError("تسویه هم‌زمان تغییر کرد؛ دوباره بررسی کنید.",409,"checkout_changed");
    }
    const fresh=await refreshQuoteUnderLock(client,locked);
    if(fresh) return {stale:fresh,attempt:null};
    const uncertain=await client.query("select id from payment_attempts where checkout_id=$1 and status='exception' and last_error='payment_initiation_unconfirmed'",[locked.id]);
    if (uncertain.rowCount) throw new CommerceError("نتیجه پرداخت قبلی نامشخص است؛ ابتدا بررسی مالی لازم است.",409,"payment_initiation_unconfirmed");
    if (idempotencyKey) {
      const existing=await client.query("select id from payment_attempts where idempotency_key=$1",[idempotencyKey]);
      if (existing.rowCount) throw new CommerceError("درخواست پرداخت در حال پردازش است؛ دوباره امتحان کنید.",409,"idempotency_in_progress");
    }
    const inserted=await client.query<PaymentAttemptRow>(
      `insert into payment_attempts (id, checkout_id, provider, method, amount, wallet_applied, wallet_email,
                                     status, idempotency_key, expires_at, quote_snapshot)
       values ($1, $2, $3, $4, $5, $6, $7, 'initiated', $8, $9, $10::jsonb) returning *`,
      [attemptId, locked.id, provider.id, method, chargeable, walletApplied, walletApplied > 0 ? walletEmail : null, idempotencyKey, expiresAt, JSON.stringify(locked.quote)],
    );
    return {stale:null,attempt:inserted.rows[0]};
  }).catch(error=>{
    if ((error as {code?:string})?.code === "40001") throw new CommerceError("تسویه هم‌زمان تغییر کرد؛ دوباره بررسی کنید.",409,"checkout_changed");
    throw error;
  });
  if(result.stale) throw staleQuoteError(result.stale);
  const attempt=result.attempt!;

  let initiated: Awaited<ReturnType<PaymentProvider["initiate"]>>;
  try {
    initiated = await provider.initiate(attempt);
  } catch {
    // Even a timeout may have created a remote payment. Preserve the attempt
    // and queue a financial review rather than automatically calling again.
    await withTransaction(async client=>{
      const changed=await client.query(`update payment_attempts set status='exception',last_error='payment_initiation_unconfirmed',updated_at=now()
        where id=$1 and status='initiated' and provider_ref is null returning id`,[attemptId]);
      if (changed.rowCount) await enqueue(client,"payment.exception",{attemptId,checkoutId:checkout.id,amount:chargeable,reason:"payment_initiation_unconfirmed"},`payment.exception:${attemptId}`);
    });
    throw new CommerceError("نتیجه شروع پرداخت نامشخص است؛ تراکنش به بررسی مالی نیاز دارد.",409,"payment_initiation_unconfirmed");
  }
  await query(
    `update payment_attempts set provider_ref = $2, raw = $3, updated_at = now() where id = $1 and status='initiated'`,
    [attemptId, initiated.providerRef, JSON.stringify({ provider: provider.id, instructions: initiated.instructions, redirectUrl:initiated.redirectUrl })],
  );
  const latest=await loadAttempt(attemptId);

  return {
    attempt: publicAttempt(latest),
    payment: {
      redirectUrl: initiated.redirectUrl,
      instructions: initiated.instructions,
      // a real gateway is never "mock", even where the mock controls are on
      mock: provider.id.startsWith("mock") && settings.allowMockControls && !config.isProd,
    },
    reused: false,
  };
}


/* ---------------------------------------------------------------------
   Provider callbacks are never trusted by themselves: the payload must be
   signed with the shared secret, and a matching signature still only proves
   "this came from the provider" — the amount and status are re-read through
   the provider's verify call before any order is created.
   --------------------------------------------------------------------- */

export function signCallbackPayload(secret: string, attemptId: string, body: unknown): string {
  return createHmac("sha256", secret).update(`${attemptId}:${JSON.stringify(body ?? {})}`).digest("hex");
}

export function verifyCallbackSignature(
  secret: string,
  attemptId: string,
  body: unknown,
  signature: string | undefined,
): boolean {
  if (!secret) return false;
  const expected = signCallbackPayload(secret, attemptId, body);
  const provided = (signature ?? "").trim().toLowerCase();
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

/** settles the attempt exactly once and turns the checkout into an order */
async function settleAttempt(attempt: PaymentAttemptRow, outcome: VerifyOutcome) {
  return withTransaction(async (client) => {
    const locked = await client.query<PaymentAttemptRow>(
      "select * from payment_attempts where id = $1 for update",
      [attempt.id],
    );
    const current = locked.rows[0];
    if (!current) throw notFound("تراکنش پیدا نشد.");

    if (current.status === "exception" && current.last_error === "duplicate_checkout_capture") {
      return {ok:false,status:"exception",attemptId:current.id,orderId:current.order_id,reason:current.last_error,duplicate:true};
    }

    // duplicate callback / retry: return the very same order, do not settle twice
    if (current.status === "settled" && current.order_id) {
      const existing = await client.query<{ id: string; status: string; total: string }>(
        "select id, status, total from orders where id = $1",
        [current.order_id],
      );
      return {
        ok: true,
        status: "settled",
        orderId: current.order_id,
        orderStatus: existing.rows[0]?.status ?? "paid",
        total: Number(existing.rows[0]?.total ?? current.amount),
        duplicate: true,
      };
    }

    const checkoutRes = await client.query<CheckoutRow>(
      "select * from checkout_sessions where id = $1 for update",
      [current.checkout_id],
    );
    const checkout = checkoutRes.rows[0];
    if (!checkout) throw notFound("فرآیند تسویه پیدا نشد.");

    // Two distinct attempts can both be captured by a provider. The checkout
    // lock serializes them; the second capture must remain visible for manual
    // financial reconciliation, not disappear behind a 409 or become a second
    // order. This also covers a first payment that produced an exception order.
    const existingOrder = await client.query<{id:string}>("select id from orders where checkout_id=$1", [checkout.id]);
    if (existingOrder.rows[0]) {
      const reason = "duplicate_checkout_capture";
      await client.query(`update payment_attempts set status='exception',order_id=$2,provider_ref=$3,
          verify_attempts=verify_attempts+1,last_error=$4,raw=$5,updated_at=now() where id=$1`,
        [current.id,existingOrder.rows[0].id,outcome.providerRef,reason,JSON.stringify(outcome.raw)]);
      await enqueue(client,"payment.exception",{attemptId:current.id,checkoutId:checkout.id,orderId:existingOrder.rows[0].id,amount:Number(current.amount),reason},`payment.exception:${current.id}`);
      return {ok:false,status:"exception",attemptId:current.id,orderId:existingOrder.rows[0].id,reason,
        message:"پرداخت دیگری برای این سفارش تأیید شده است؛ مبلغ اضافی نیازمند بررسی مالی است."};
    }

    const consumed = await consumeReservations(client, checkout.id);
    const late = !consumed.ok;

    // An initiated attempt must settle the precise invoice the provider was
    // asked to collect, not a checkout that may have since been re-quoted.
    // Pre-migration attempts lack a trustworthy snapshot and require review.
    const quote = current.quote_snapshot ?? checkout.quote as Quote;
    const missingSnapshot = !current.quote_snapshot;
    const amountMismatch = round2(Number(current.amount) + Number(current.wallet_applied ?? 0)) !== round2(Number(quote.grandTotal));
    const snapshotProblem = missingSnapshot || amountMismatch;

    /* ---------- coupon capacity is consumed exactly once, under a lock ----
       Capacity used to be checked at quote time and never counted, so a
       single-use code stayed reusable forever. The increment happens here,
       in the same transaction as the order, and only for a successful sale.
       If the capacity disappeared between quote and payment the money is
       already captured, so the order is created as an exception for a human
       instead of silently granting an unbudgeted discount. */
    let couponProblem: string | null = null;
    const couponCode = String(quote.couponCode ?? "").trim().toUpperCase();
    if (couponCode && Number(quote.couponDiscount) > 0 && !late && !snapshotProblem) {
      const coupon = await client.query<{ used_count: number; usage_limit: number | null }>(
        `update coupons set used_count = used_count + 1, updated_at = now()
          where code = $1 and active and (usage_limit is null or used_count < usage_limit)
          returning used_count, usage_limit`,
        [couponCode],
      );
      if ((coupon.rowCount ?? 0) === 0) {
        couponProblem = `کد تخفیف ${couponCode} بین ثبت سفارش و پرداخت از ظرفیت خارج شد؛ پرداخت ثبت شد و سفارش نیازمند بررسی مالی است.`;
      }
    }

    let needsReview = late || snapshotProblem || Boolean(couponProblem);
    let exceptionReason = late
      ? "پرداخت پس از آزادسازی رزرو موجودی تأیید شد؛ نیازمند بررسی اپراتور مالی (بدون ارسال خودکار)."
      : snapshotProblem ? "صورتحساب منجمد پرداخت وجود ندارد یا با مبلغ پرداخت هم‌خوان نیست؛ نیازمند بررسی مالی."
      : couponProblem;
    const status: OrderStatus = needsReview ? "exception" : "paid";
    const order = await insertOrder(client, {
      checkout: { ...checkout, shipping_method: quote.shippingMethod, coupon_code: quote.couponCode },
      quote,
      status,
      paymentStatus: "settled",
      attemptId: current.id,
      method: current.method,
      exceptionReason,
    });

    await client.query(
      `update payment_attempts set status = 'settled', order_id = $2, provider_ref = $3,
              verify_attempts = verify_attempts + 1, raw = $4, updated_at = now()
        where id = $1`,
      [current.id, order.id, outcome.providerRef, JSON.stringify(outcome.raw)],
    );
    /* ---------- wallet deduction happens now, with the order ----------
       The balance was checked when the attempt started; here it is re-checked
       under a lock. If the money moved in the meantime the payment is already
       captured, so the order becomes an exception instead of silently
       discounting a basket nobody paid for. */
    const walletApplied = Number(current.wallet_applied ?? 0);
    if (walletApplied > 0 && current.wallet_email && !snapshotProblem) {
      try {
        const spent = await redeemCashback(client, {
          email: current.wallet_email,
          orderId: order.id,
          amount: walletApplied,
        });
        if (spent <= 0) throw new Error("کیف پول قبلاً برای این سفارش کسر شده است.");
        await client.query(
          `update orders set data = jsonb_set(data, '{walletApplied}', to_jsonb($2::numeric)) where id = $1`,
          [order.id, walletApplied],
        );
      } catch (error) {
        needsReview = true;
        exceptionReason = `کسر کیف پول انجام نشد (${(error as Error).message})؛ پرداخت ثبت شد و سفارش نیازمند بررسی مالی است.`;
        await client.query(
          `update orders set status = 'exception', exception_reason = $2,
                  data = jsonb_set(data, '{status}', to_jsonb('exception'::text)) where id = $1`,
          [order.id, exceptionReason],
        );
      }
    }

    // cashback only exists for real paid orders, never for exceptions
    const earned = needsReview
      ? null
      : await recordCashback(client, {
          orderId: order.id,
          email: checkout.customer_email,
          base: quote.cashback.base,
          settings: await loadCommerceSettings(),
        });

    await client.query(
      "update checkout_sessions set status = $2, updated_at = now() where id = $1",
      [checkout.id, needsReview ? "exception" : "completed"],
    );
    if (checkout.cart_id) {
      await client.query("update carts set status = 'converted', updated_at = now() where id = $1", [checkout.cart_id]);
    }

    if (needsReview) {
      await enqueue(
        client,
        "order.exception",
        { orderId: order.id, attemptId: current.id, amount: Number(current.amount), reason: exceptionReason },
        `order.exception:${order.id}`,
      );
    } else {
      await enqueue(
        client,
        "order.paid",
        { orderId: order.id, attemptId: current.id, amount: Number(current.amount), method: current.method },
        `order.paid:${order.id}`,
      );
      if (earned && earned.amount > 0) {
        await enqueue(
          client,
          "cashback.earned",
          {
            orderId: order.id,
            email: checkout.customer_email,
            amount: earned.amount,
            percent: earned.percent,
            base: earned.base,
          },
          `cashback.earned:${order.id}`,
        );
      }
    }

    return {
      ok: true,
      status: "settled",
      orderId: order.id,
      orderStatus: status,
      total: Number(current.amount),
      late,
      duplicate: false,
      cashback: earned
        ? { amount: earned.amount, percent: earned.percent, base: earned.base, note: earned.note }
        : null,
    };
  });
}

/** the shopper's browser asks what happened after coming back from the gateway */
export async function paymentStatus(
  attemptId: string,
  viewer?: { kind: "admin" | "customer"; subject: string } | null,
  checkoutCookie?: string | null,
) {
  const attempt = await loadAttempt(attemptId);
  const owner = await query<{ email: string | null; checkout_id: string }>(
    `select c.customer_email as email, a.checkout_id from payment_attempts a
       join checkout_sessions c on c.id = a.checkout_id
      where a.id = $1`,
    [attemptId],
  );
  const ownerEmail = owner.rows[0]?.email ?? null;
  const checkoutId = owner.rows[0]?.checkout_id ?? null;
  const isAdmin = viewer?.kind === "admin";
  const ownsOrder = viewer?.kind === "customer" && ownerEmail !== null && viewer.subject === ownerEmail;
  // The checkout cookie contains only an ID, not a signed proof of ownership.
  // It is not sufficient for an account-linked payment.
  const ownsBrowser = Boolean(!ownerEmail && checkoutId && checkoutCookie && checkoutCookie === checkoutId);
  if (!isAdmin && !ownsOrder && !ownsBrowser) {
    throw new CommerceError("این تراکنش برای تو نیست.", 403, "payment_forbidden");
  }

  let order: { id: string; status: string; total: number } | null = null;
  if (attempt.order_id) {
    const res = await query<{ id: string; status: string; total: string | number }>(
      "select id, status, total from orders where id = $1",
      [attempt.order_id],
    );
    const row = res.rows[0];
    if (row) order = { id: row.id, status: String(row.status), total: Number(row.total) };
  }
  return { ...publicAttempt(attempt), order, mock: attempt.provider.startsWith("mock") };
}

/** which provider owns an attempt (the callback route signs differently per provider) */
export async function attemptProviderId(attemptId: string): Promise<string> {
  return (await loadAttempt(attemptId)).provider;
}

function terminalCallbackResult(attempt: PaymentAttemptRow) {
  return { ok: attempt.status === "settled", status: attempt.status, attemptId: attempt.id,
    orderId: attempt.order_id, reason: attempt.last_error, duplicate: true };
}

/** provider callback (in a real gateway this payload is signed) */
export async function handleCallback(attemptId: string, params: Record<string, unknown>) {
  const attempt = await loadAttempt(attemptId);
  if (attempt.status === "settled") {
    const res = await settleAttempt(attempt, {
      outcome: "settled",
      providerRef: attempt.provider_ref ?? "",
      raw: { replayed: true },
    });
    return { ...res, replayed: true };
  }
  const provider = providerFor(attempt.provider);
  const outcome = await provider.verify(attempt, params);

  if (outcome.outcome === "settled") {
    return settleAttempt(attempt, outcome);
  }

  if (outcome.outcome === "pending") {
    const changed = await query(
      `update payment_attempts set status = 'pending_verification', verify_attempts = verify_attempts + 1,
              last_error = $2, raw = $3, updated_at = now() where id = $1 and status not in ('settled','exception') returning id`,
      [attempt.id, outcome.reason ?? "pending", JSON.stringify(outcome.raw)],
    );
    if (!changed.rowCount) return terminalCallbackResult(await loadAttempt(attempt.id));
    return {
      ok: true,
      status: "pending_verification",
      attemptId: attempt.id,
      message: "پاسخ درگاه مشخص نیست؛ سفارش پرداخت‌شده ثبت نمی‌شود تا استعلام بعدی.",
    };
  }

  if (outcome.outcome === "exception") {
    const changed = await query(
      `update payment_attempts set status = 'exception', verify_attempts = verify_attempts + 1,
              last_error = $2, raw = $3, updated_at = now() where id = $1 and status not in ('settled','exception') returning id`,
      [attempt.id, outcome.reason ?? "exception", JSON.stringify(outcome.raw)],
    );
    if (!changed.rowCount) return terminalCallbackResult(await loadAttempt(attempt.id));
    return { ok: false, status: "exception", attemptId: attempt.id, message: "تراکنش نیازمند رسیدگی است." };
  }

  const changed = await query(
    `update payment_attempts set status = 'failed', verify_attempts = verify_attempts + 1,
            last_error = $2, raw = $3, updated_at = now() where id = $1 and status not in ('settled','exception') returning id`,
    [attempt.id, outcome.reason ?? "failed", JSON.stringify(outcome.raw)],
  );
  if (!changed.rowCount) return terminalCallbackResult(await loadAttempt(attempt.id));
  return {
    ok: false,
    status: "failed",
    attemptId: attempt.id,
    reason: outcome.reason,
    message:
      outcome.reason === "bnpl_rejected"
        ? "ارائه‌دهندهٔ اقساط این سفارش را نپذیرفت؛ می‌توانی پرداخت آنلاین را انتخاب کنی."
        : "پرداخت موفق نشد.",
  };
}

/** admin/manual reconciliation for attempts whose verify never answered */
export async function reconcileAttempt(attemptId: string, result: "success" | "fail" | "timeout" = "success") {
  const attempt = await loadAttempt(attemptId);
  if (attempt.status === "settled" || attempt.status === "failed") {
    return { ok: true, status: attempt.status, unchanged: true, attemptId };
  }
  const outcome = await handleCallback(attemptId, { result, reconciled: true });
  return { ...outcome, reconciled: true };
}

/** attempts that were never completed expire; the hold expires separately */
export async function expirePaymentAttempts() {
  const res = await query(
    `update payment_attempts set status = 'expired', updated_at = now()
      where status in ('initiated', 'pending_verification') and expires_at is not null and expires_at <= now()`,
  );
  return res.rowCount ?? 0;
}

/**
 * Developer-only shortcut for the sandbox gateway. It is *not* a payment
 * channel: it demands the same ownership proof as a real settlement — the
 * attempt must belong to the caller's order — and stays off in production.
 */
export async function simulatePayment(
  attemptId: string,
  result: string,
  viewer?: { kind: "admin" | "customer"; subject: string } | null,
  checkoutCookie?: string | null,
) {
  const settings = await loadCommerceSettings();
  if (!settings.allowMockControls || config.isProd) {
    throw new CommerceError("کنترل شبیه‌سازی درگاه در این محیط فعال نیست.", 403, "mock_controls_disabled");
  }
  const owner = await query<{ email: string | null; checkout_id: string | null }>(
    `select c.customer_email as email, a.checkout_id from payment_attempts a
       join checkout_sessions c on c.id = a.checkout_id
      where a.id = $1`,
    [attemptId],
  );
  const ownerEmail = owner.rows[0]?.email ?? null;
  const checkoutId = owner.rows[0]?.checkout_id ?? null;
  const isAdmin = viewer?.kind === "admin";
  const ownsOrder = viewer?.kind === "customer" && ownerEmail !== null && viewer.subject === ownerEmail;
  // The checkout cookie contains only an ID, not a signed proof of ownership.
  // It is not sufficient for an account-linked payment.
  const ownsBrowser = Boolean(!ownerEmail && checkoutId && checkoutCookie && checkoutCookie === checkoutId);
  if (!isAdmin && !ownsOrder && !ownsBrowser) {
    throw new CommerceError("شبیه‌سازی پرداخت فقط برای صاحب همین سفارش یا ادمین مجاز است.", 403, "simulate_forbidden");
  }
  return handleCallback(attemptId, { result });
}
