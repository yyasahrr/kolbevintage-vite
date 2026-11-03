import { randomUUID } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config";
import { query, withTransaction } from "../db";
import { readSession } from "../sessions";
import { CommerceError } from "./errors";
import type { QuoteInputLine } from "./pricing";
import { loadCommerceSettings } from "./settings";

/* =====================================================================
   Cart — a guest can fill a bag without an account; the bag is a server
   row keyed by an httpOnly cookie, not a browser-only array.

   Adding to the cart never reserves stock. When a guest signs in, their
   bag is merged into the account bag; merged lines are re-validated and
   anything that went out of stock stays visible with a warning instead of
   disappearing silently.
   ===================================================================== */

export const CART_COOKIE = "kv_cart";

export interface CartRow {
  id: string;
  token: string;
  customer_email: string | null;
  status: string;
}

export interface CartLineView {
  id: string;
  variantId: string;
  productId: string;
  name: string;
  sku: string;
  colorId: string;
  colorName: string;
  sizeId: string;
  sizeLabel: string;
  lookId: string | null;
  category: string;
  unitPrice: number;
  addedPrice: number;
  quantity: number;
  available: number;
  active: boolean;
  priceChanged: boolean;
  warning: string | null;
  image: string | null;
}

const imageUrl = (url: string) => (url.startsWith("/uploads/") ? url : url);

export function publicCart(cart: CartRow, lines: CartLineView[]) {
  const subtotal = Math.round(lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0) * 100) / 100;
  return {
    id: cart.id,
    customerEmail: cart.customer_email,
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    subtotal,
    issues: lines.filter((l) => l.warning || !l.active || l.available < l.quantity).map((l) => ({
      variantId: l.variantId,
      name: l.name,
      message: l.warning ?? (l.available <= 0 ? "این واریانت ناموجود شد." : `فقط ${l.available} عدد موجود است.`),
    })),
  };
}

export async function cartLines(cartId: string): Promise<CartLineView[]> {
  const res = await query<{
    id: string;
    variant_id: string;
    product_id: string;
    quantity: number;
    added_price: string;
    warning: string | null;
    name: string;
    sku: string;
    color_id: string;
    size_id: string;
    look_id: string | null;
    category: string;
    price: string;
    colors: { id: string; name: string }[];
    sizes: { id: string; label: string }[];
    active: boolean;
    available: number;
    image_url: string | null;
  }>(
    `select cl.id, cl.variant_id, v.product_id, cl.quantity, cl.added_price, cl.warning,
            p.name, v.sku, v.color_id, v.size_id, p.look_id, p.category, p.price,
            p.colors, p.sizes, (v.active and p.active) as active,
            (v.on_hand - v.quarantined - coalesce((
               select sum(r.quantity) from stock_reservations r
               where r.variant_id = v.id and r.status = 'active' and r.expires_at > now()
             ), 0))::int as available,
            (select url from product_images i where i.product_id = p.id order by position limit 1) as image_url
       from cart_lines cl
       join product_variants v on v.id = cl.variant_id
       join products p on p.id = v.product_id
      where cl.cart_id = $1
      order by cl.created_at`,
    [cartId],
  );

  return res.rows.map((row) => {
    const color = (row.colors ?? []).find((c) => c.id === row.color_id);
    const size = (row.sizes ?? []).find((s) => s.id === row.size_id);
    const unitPrice = Number(row.price);
    const addedPrice = Number(row.added_price);
    return {
      id: row.id,
      variantId: row.variant_id,
      productId: row.product_id,
      name: row.name,
      sku: row.sku,
      colorId: row.color_id,
      colorName: color?.name ?? row.color_id,
      sizeId: row.size_id,
      sizeLabel: size?.label ?? row.size_id,
      lookId: row.look_id,
      category: row.category,
      unitPrice,
      addedPrice,
      quantity: row.quantity,
      available: Number(row.available),
      active: row.active,
      priceChanged: Math.abs(unitPrice - addedPrice) >= 0.01,
      warning: row.warning,
      image: row.image_url ? imageUrl(row.image_url) : null,
    };
  });
}

export function cartToQuoteLines(lines: CartLineView[]): QuoteInputLine[] {
  return lines.map((line) => ({
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

export async function findCartByToken(token: string | undefined): Promise<CartRow | null> {
  if (!token) return null;
  const res = await query<CartRow>(
    "select id, token, customer_email, status from carts where token = $1 and status = 'open'",
    [token],
  );
  return res.rows[0] ?? null;
}

async function createCart(customerEmail: string | null): Promise<CartRow> {
  const res = await query<CartRow>(
    `insert into carts (id, token, customer_email) values ($1, $2, $3)
     returning id, token, customer_email, status`,
    [`cart_${randomUUID()}`, randomUUID().replace(/-/g, ""), customerEmail],
  );
  return res.rows[0];
}

export function setCartCookie(reply: FastifyReply, token: string) {
  reply.setCookie(CART_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    maxAge: 30 * 24 * 60 * 60,
  });
}

export async function resolveCart(req: FastifyRequest, reply: FastifyReply): Promise<CartRow> {
  const session = await readSession(req);
  const email = session?.kind === "customer" ? session.subject : null;
  let cart = await findCartByToken(req.cookies?.[CART_COOKIE]);

  if (email) {
    const existing = await query<CartRow>(
      "select id, token, customer_email, status from carts where customer_email = $1 and status = 'open' order by created_at limit 1",
      [email],
    );
    const accountCart = existing.rows[0];
    if (accountCart) {
      if (cart && cart.id !== accountCart.id) await mergeCart(cart.id, accountCart.id);
      setCartCookie(reply, accountCart.token);
      return accountCart;
    }
    if (cart) {
      await query("update carts set customer_email = $2, updated_at = now() where id = $1", [cart.id, email]);
      cart.customer_email = email;
      setCartCookie(reply, cart.token);
      return cart;
    }
    cart = await createCart(email);
    setCartCookie(reply, cart.token);
    return cart;
  }

  if (cart) {
    setCartCookie(reply, cart.token);
    return cart;
  }
  cart = await createCart(null);
  setCartCookie(reply, cart.token);
  return cart;
}

/** called after a guest signs in, so the guest bag is not lost */
export async function mergeGuestCartForCustomer(req: FastifyRequest, reply: FastifyReply, email: string) {
  const guest = await findCartByToken(req.cookies?.[CART_COOKIE]);
  const existing = await query<CartRow>(
    "select id, token, customer_email, status from carts where customer_email = $1 and status = 'open' order by created_at limit 1",
    [email],
  );
  const accountCart = existing.rows[0];

  if (accountCart) {
    if (guest && guest.id !== accountCart.id) await mergeCart(guest.id, accountCart.id);
    setCartCookie(reply, accountCart.token);
    return { cartId: accountCart.id, merged: !!guest && guest.id !== accountCart.id };
  }

  if (guest) {
    await query("update carts set customer_email = $2, updated_at = now() where id = $1", [guest.id, email]);
    setCartCookie(reply, guest.token);
    return { cartId: guest.id, merged: false };
  }
  const created = await createCart(email);
  setCartCookie(reply, created.token);
  return { cartId: created.id, merged: false };
}

/**
 * Merges a guest cart into the account cart.
 * Quantities are summed and capped; lines that no longer have enough stock
 * are kept with a warning so the shopper can fix them in checkout.
 */
export async function mergeCart(sourceId: string, targetId: string) {
  if (sourceId === targetId) return;
  const settings = await loadCommerceSettings();
  await withTransaction(async (client) => {
    const source = await client.query<{ variant_id: string; quantity: number; added_price: string }>(
      "select variant_id, quantity, added_price from cart_lines where cart_id = $1",
      [sourceId],
    );
    for (const line of source.rows) {
      const existing = await client.query<{ id: string; quantity: number }>(
        "select id, quantity from cart_lines where cart_id = $1 and variant_id = $2",
        [targetId, line.variant_id],
      );
      const current = existing.rows[0];
      if (current) {
        const qty = Math.min(settings.cartMaxQtyPerLine, current.quantity + line.quantity);
        await client.query("update cart_lines set quantity = $2, updated_at = now() where id = $1", [current.id, qty]);
      } else {
        await client.query(
          `insert into cart_lines (id, cart_id, variant_id, quantity, added_price)
           values ($1, $2, $3, $4, $5)`,
          [`cl_${randomUUID()}`, targetId, line.variant_id, Math.min(settings.cartMaxQtyPerLine, line.quantity), line.added_price],
        );
      }
    }
    await client.query("delete from cart_lines where cart_id = $1", [sourceId]);
    await client.query("update carts set status = 'merged', updated_at = now() where id = $1", [sourceId]);
  });
  await refreshCartWarnings(targetId);
}

/** recompute the "only N left" warnings after a merge or a stock change */
export async function refreshCartWarnings(cartId: string) {
  const lines = await cartLines(cartId);
  for (const line of lines) {
    let warning: string | null = null;
    if (!line.active) warning = "این محصول از فروش خارج شده است.";
    else if (line.available <= 0) warning = "این واریانت در حال حاضر ناموجود است.";
    else if (line.available < line.quantity) warning = `فقط ${line.available} عدد از این واریانت موجود است.`;
    else if (line.priceChanged) warning = "قیمت این محصول از زمان افزودن به سبد تغییر کرده است.";
    if (warning !== line.warning) {
      await query("update cart_lines set warning = $2, updated_at = now() where id = $1", [line.id, warning]);
    }
  }
}

export async function addCartLine(cartId: string, variantId: string, quantity: number) {
  const settings = await loadCommerceSettings();
  const qty = Math.max(1, Math.trunc(quantity));
  const variant = await query<{ id: string; price: string; active: boolean; product_active: boolean; available: number }>(
    `select v.id, p.price, v.active, p.active as product_active,
            (v.on_hand - v.quarantined - coalesce((
              select sum(r.quantity) from stock_reservations r
              where r.variant_id = v.id and r.status = 'active' and r.expires_at > now()
            ), 0))::int as available
       from product_variants v join products p on p.id = v.product_id
      where v.id = $1`,
    [variantId],
  );
  const row = variant.rows[0];
  if (!row) throw new CommerceError("این واریانت پیدا نشد.", 404, "variant_not_found");
  if (!row.active || !row.product_active) throw new CommerceError("این محصول فعلاً موجود نیست.", 409, "variant_inactive");
  if (row.available <= 0) throw new CommerceError("این واریانت در حال حاضر ناموجود است.", 409, "out_of_stock");

  const existing = await query<{ id: string; quantity: number }>(
    "select id, quantity from cart_lines where cart_id = $1 and variant_id = $2",
    [cartId, variantId],
  );
  const current = existing.rows[0];
  const wanted = Math.min(settings.cartMaxQtyPerLine, (current?.quantity ?? 0) + qty);

  if (current) {
    await query("update cart_lines set quantity = $2, updated_at = now() where id = $1", [current.id, wanted]);
  } else {
    await query(
      `insert into cart_lines (id, cart_id, variant_id, quantity, added_price) values ($1, $2, $3, $4, $5)`,
      [`cl_${randomUUID()}`, cartId, variantId, wanted, Number(row.price)],
    );
  }
  await query("update carts set updated_at = now() where id = $1", [cartId]);
  await refreshCartWarnings(cartId);
}

export async function updateCartLine(cartId: string, variantId: string, quantity: number) {
  const settings = await loadCommerceSettings();
  if (quantity <= 0) {
    await query("delete from cart_lines where cart_id = $1 and variant_id = $2", [cartId, variantId]);
  } else {
    await query(
      "update cart_lines set quantity = $3, updated_at = now() where cart_id = $1 and variant_id = $2",
      [cartId, variantId, Math.min(settings.cartMaxQtyPerLine, Math.trunc(quantity))],
    );
  }
  await query("update carts set updated_at = now() where id = $1", [cartId]);
  await refreshCartWarnings(cartId);
}

export async function removeCartLine(cartId: string, variantId: string) {
  await query("delete from cart_lines where cart_id = $1 and variant_id = $2", [cartId, variantId]);
  await query("update carts set updated_at = now() where id = $1", [cartId]);
}
