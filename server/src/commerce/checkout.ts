import { randomUUID } from "node:crypto";
import { query, withTransaction } from "../db";
import { cartLines, cartToQuoteLines, refreshCartWarnings, type CartLineView } from "./cart";
import { CommerceError, notFound } from "./errors";
import { expireReservations, reserveForCheckout } from "./inventory";
import { buildQuote, type Quote, type QuoteInputLine } from "./pricing";
import { loadCommerceSettings } from "./settings";
import { variantIdFor } from "./variants";

/* =====================================================================
   Checkout — where a bag becomes a commercial commitment.

   Entering checkout is the only moment stock is held. The hold is
   all-or-nothing across the whole bag, and the price is frozen as a quote
   with a version hash that must still match when the payment starts.
   ===================================================================== */

export interface CheckoutAddress {
  receiver?: string;
  phone?: string;
  province?: string;
  city?: string;
  street?: string;
  postal?: string;
  note?: string;
}

export interface CheckoutItemInput {
  variantId?: string;
  productId?: string;
  colorId?: string;
  sizeId?: string;
  quantity: number;
}

/** accepts either a variant id or the product/color/size triple */
export function normalizeItems(items: CheckoutItemInput[]): { variantId: string; quantity: number }[] {
  return items.map((item) => {
    const quantity = Math.trunc(Number(item.quantity ?? 0));
    const variantId = item.variantId
      ? item.variantId
      : item.productId
        ? variantIdFor(item.productId, item.colorId ?? "one", item.sizeId ?? "one")
        : "";
    if (!variantId || !Number.isFinite(quantity) || quantity <= 0) {
      throw new CommerceError("یکی از اقلام سبد نامعتبر است.", 400, "invalid_item");
    }
    return { variantId, quantity };
  });
}

export interface CheckoutRow {
  id: string;
  cart_id: string | null;
  customer_email: string | null;
  status: string;
  address: CheckoutAddress | null;
  shipping_method: "standard" | "express";
  coupon_code: string | null;
  quote: Quote;
  quote_version: string;
  subtotal: string | number;
  discount_total: string | number;
  shipping_total: string | number;
  grand_total: string | number;
  reservation_expires_at: Date | null;
  quote_expires_at: Date | null;
  created_at: Date;
}

async function loadLinesFromVariants(items: { variantId: string; quantity: number }[]): Promise<QuoteInputLine[]> {
  const ids = [...new Set(items.map((i) => i.variantId))];
  const res = await query<{
    variant_id: string;
    product_id: string;
    sku: string;
    name: string;
    color_id: string;
    size_id: string;
    look_id: string | null;
    category: string;
    price: string;
    colors: { id: string; name: string }[];
    sizes: { id: string; label: string }[];
    active: boolean;
    product_active: boolean;
  }>(
    `select v.id as variant_id, v.product_id, v.sku, p.name, v.color_id, v.size_id, p.look_id, p.category,
            p.price, p.colors, p.sizes, v.active, p.active as product_active
       from product_variants v join products p on p.id = v.product_id
      where v.id = any($1::text[])`,
    [ids],
  );
  const byId = new Map(res.rows.map((r) => [r.variant_id, r]));
  const lines: QuoteInputLine[] = [];
  for (const item of items) {
    const row = byId.get(item.variantId);
    if (!row) throw new CommerceError("یکی از اقلام سبد دیگر موجود نیست.", 409, "variant_not_found");
    if (!row.active || !row.product_active) {
      throw new CommerceError(`«${row.name}» از فروش خارج شده است.`, 409, "variant_inactive");
    }
    const color = (row.colors ?? []).find((c) => c.id === row.color_id);
    const size = (row.sizes ?? []).find((s) => s.id === row.size_id);
    lines.push({
      variantId: row.variant_id,
      productId: row.product_id,
      sku: row.sku,
      name: row.name,
      colorId: row.color_id,
      colorName: color?.name ?? row.color_id,
      sizeId: row.size_id,
      sizeLabel: size?.label ?? row.size_id,
      lookId: row.look_id,
      category: row.category,
      unitPrice: Number(row.price),
      quantity: Math.trunc(item.quantity),
    });
  }
  return lines;
}

async function resolveCheckoutLines(input: {
  cartId?: string | null;
  items?: { variantId: string; quantity: number }[];
}): Promise<{ lines: QuoteInputLine[]; cartLinesView: CartLineView[] }> {
  if (input.cartId) {
    const cart = await cartLines(input.cartId);
    if (!cart.length) throw new CommerceError("سبد خرید خالی است.", 400, "empty_cart");
    const broken = cart.filter((l) => !l.active);
    if (broken.length) {
      throw new CommerceError(
        `«${broken[0].name}» از فروش خارج شده است؛ آن را از سبد بردار.`,
        409,
        "variant_inactive",
      );
    }
    return { lines: cartToQuoteLines(cart), cartLinesView: cart };
  }
  const items = input.items ?? [];
  if (!items.length) throw new CommerceError("سبد خرید خالی است.", 400, "empty_cart");
  return { lines: await loadLinesFromVariants(items), cartLinesView: [] };
}

export async function startCheckout(input: {
  cartId?: string | null;
  items?: CheckoutItemInput[];
  customerEmail?: string | null;
  address?: CheckoutAddress | null;
  shippingMethod?: "standard" | "express";
  couponCode?: string | null;
  idempotencyKey?: string | null;
}) {
  const settings = await loadCommerceSettings();
  await expireReservations();

  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await query<CheckoutRow>(
      "select * from checkout_sessions where idempotency_key = $1",
      [idempotencyKey],
    );
    if (existing.rows[0]) {
      return { checkout: publicCheckout(existing.rows[0]), reused: true };
    }
  }

  const { lines, cartLinesView } = await resolveCheckoutLines({
    cartId: input.cartId,
    items: input.items ? normalizeItems(input.items) : undefined,
  });
  const shippingMethod = input.shippingMethod === "express" ? "express" : "standard";
  const quote = await buildQuote({
    lines,
    couponCode: input.couponCode ?? null,
    shippingMethod,
    settings,
  });

  const checkoutId = `chk_${randomUUID()}`;
  const reservationExpiresAt = new Date(Date.now() + settings.reservationHoldMinutes * 60_000);

  await withTransaction(async (client) => {
    await client.query(
      `insert into checkout_sessions (id, cart_id, customer_email, status, address, shipping_method, coupon_code,
                                      quote, quote_version, subtotal, discount_total, shipping_total, grand_total,
                                      reservation_expires_at, quote_expires_at, idempotency_key)
       values ($1,$2,$3,'reserved',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        checkoutId,
        input.cartId ?? null,
        input.customerEmail ?? null,
        input.address ? JSON.stringify(input.address) : null,
        shippingMethod,
        quote.couponCode,
        JSON.stringify(quote),
        quote.quoteVersion,
        quote.subtotal,
        quote.discountTotal,
        quote.shippingTotal,
        quote.grandTotal,
        reservationExpiresAt,
        new Date(quote.expiresAt),
        idempotencyKey,
      ],
    );
    await reserveForCheckout(client, {
      checkoutId,
      items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      expiresAt: reservationExpiresAt,
      idempotencyPrefix: `checkout:${checkoutId}`,
    });
  });

  // availability moved, so refresh the "only N left" hints on the cart
  if (input.cartId) await refreshCartWarnings(input.cartId);

  const created = await getCheckout(checkoutId);
  return { checkout: publicCheckout(created), reused: false, cartLines: cartLinesView };
}

export async function getCheckout(id: string): Promise<CheckoutRow> {
  const res = await query<CheckoutRow>("select * from checkout_sessions where id = $1", [id]);
  if (!res.rows[0]) throw notFound("فرآیند تسویه پیدا نشد.");
  return res.rows[0];
}

export function publicCheckout(row: CheckoutRow) {
  const expired =
    row.status === "reserved" && row.reservation_expires_at ? new Date(row.reservation_expires_at) <= new Date() : false;
  return {
    id: row.id,
    status: expired && row.status === "reserved" ? "expired" : row.status,
    address: row.address,
    shippingMethod: row.shipping_method,
    quote: row.quote,
    quoteVersion: row.quote_version,
    subtotal: Number(row.subtotal),
    discountTotal: Number(row.discount_total),
    shippingTotal: Number(row.shipping_total),
    grandTotal: Number(row.grand_total),
    reservationExpiresAt: row.reservation_expires_at,
    quoteExpiresAt: row.quote_expires_at,
    createdAt: row.created_at,
  };
}

async function requireOpenCheckout(id: string): Promise<CheckoutRow> {
  const checkout = await getCheckout(id);
  if (checkout.status === "expired" || checkout.status === "cancelled") {
    throw new CommerceError("مهلت این تسویه تمام شده است؛ از سبد خرید دوباره شروع کن.", 409, "checkout_closed");
  }
  if (checkout.status !== "reserved") {
    throw new CommerceError("این تسویه در وضعیت قابل ویرایش نیست.", 409, "checkout_locked");
  }
  if (checkout.reservation_expires_at && new Date(checkout.reservation_expires_at) <= new Date()) {
    await expireReservations();
    throw new CommerceError("مهلت نگه‌داشتن موجودی تمام شد؛ سبد را دوباره بررسی کن.", 409, "reservation_expired");
  }
  return checkout;
}

/** re-price an open checkout (coupon, shipping method) without touching holds */
export async function requoteCheckout(
  id: string,
  patch: { couponCode?: string | null; shippingMethod?: "standard" | "express" },
) {
  const settings = await loadCommerceSettings();
  const checkout = await requireOpenCheckout(id);
  const previous = checkout.quote;
  const lines: QuoteInputLine[] = previous.lines.map((line) => ({
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

  const shippingMethod = patch.shippingMethod ?? checkout.shipping_method;
  const couponCode = patch.couponCode === undefined ? checkout.coupon_code : patch.couponCode;
  const quote = await buildQuote({ lines, couponCode, shippingMethod, settings });

  // the hold quantity never changes here; only money does
  await query(
    `update checkout_sessions set quote = $2, quote_version = $3, coupon_code = $4, shipping_method = $5,
            subtotal = $6, discount_total = $7, shipping_total = $8, grand_total = $9,
            quote_expires_at = $10, updated_at = now()
      where id = $1`,
    [
      id,
      JSON.stringify(quote),
      quote.quoteVersion,
      quote.couponCode,
      shippingMethod,
      quote.subtotal,
      quote.discountTotal,
      quote.shippingTotal,
      quote.grandTotal,
      new Date(quote.expiresAt),
    ],
  );
  return publicCheckout(await getCheckout(id));
}

export async function cancelCheckout(id: string) {
  const checkout = await getCheckout(id);
  if (checkout.status === "completed") {
    throw new CommerceError("این تسویه به سفارش تبدیل شده و قابل لغو نیست.", 409, "checkout_completed");
  }
  const released = await withTransaction(async (client) => {
    const res = await client.query(
      `update stock_reservations set status = 'released', updated_at = now()
        where checkout_id = $1 and status = 'active'
        returning id`,
      [id],
    );
    await client.query("update checkout_sessions set status = 'cancelled', updated_at = now() where id = $1", [id]);
    return res.rowCount ?? 0;
  });
  return { ok: true, released };
}
