import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../config";
import { query } from "../db";
import { createSession, setSessionCookie } from "../sessions";
import { actorOf, currentSession, requireAdminSession, requireSuperadmin } from "./auth";
import {
  cashbackWallet,
  cashbackOverview,
  cashbackTransactions,
  normalizeTiers,
} from "./cashback";
import {
  addCartLine,
  cartLines,
  mergeGuestCartForCustomer,
  publicCart,
  removeCartLine,
  resolveCart,
  updateCartLine,
} from "./cart";
import {
  cancelCheckout,
  getCheckout,
  normalizeItems,
  publicCheckout,
  requoteCheckout,
  startCheckout,
  type CheckoutItemInput,
} from "./checkout";
import { CommerceError, forbidden, notFound, unauthorized } from "./errors";
import { expireReservations } from "./inventory";
import { advanceOrder, cancelOrder, getOrder, listOrders, publicOrder } from "./orders";
import { outboxStats, processOutbox } from "./outbox";
import {
  expirePaymentAttempts,
  handleCallback,
  publicAttempt,
  reconcileAttempt,
  simulatePayment,
  startPayment,
  type PaymentAttemptRow,
} from "./payments";
import { buildQuote } from "./pricing";
import {
  decideAdjustment,
  decideRefund,
  payExchangeDifference,
  qcReturn,
  receiveReturn,
  settleRefund,
  listRefunds,
  publicAdjustment,
  requestAdjustment,
  requestRefund,
  type AdjustmentRow,
} from "./refunds";
import { loadCommerceSettings, saveCommerceSettings, type CommerceSettings } from "./settings";
import { providerCapabilities, verifyCallbackSignature } from "./payments";
import { diffSettings, listAudit, recordAudit } from "./audit";
import { productVariants, publicVariant } from "./variants";

/* eslint-disable @typescript-eslint/no-explicit-any */

async function loadCartPayload(cart: { id: string; token: string; customer_email: string | null; status: string }) {
  const lines = await cartLines(cart.id);
  return publicCart(cart, lines);
}

export async function commerceRoutes(app: FastifyInstance) {
  /* ---------------------------------------------------------------
     Storefront: configuration, variants, cart
     --------------------------------------------------------------- */

  app.get("/api/commerce/config", async () => {
    const settings = await loadCommerceSettings();
    return {
      currency: settings.currency,
      bnpl4: {
        // three distinct facts: the owner switch, the provider contract, and
        // what the checkout may actually offer right now
        enabled: settings.bnpl4Enabled,
        providerReady: settings.bnpl4ProviderReady,
        availableForCheckout:
          settings.bnpl4Enabled &&
          settings.bnpl4ProviderReady &&
          providerCapabilities(settings.bnpl4Provider).bnpl4,
        installments: settings.bnpl4Installments,
        provider: settings.bnpl4Provider,
        // OWN-05 revision: store-wide switch, no per-product eligibility
        scope: "store",
      },
      cartMaxQtyPerLine: settings.cartMaxQtyPerLine,
      reservationHoldMinutes: settings.reservationHoldMinutes,
      paymentWindowMinutes: settings.paymentWindowMinutes,
      shipping: {
        flat: settings.shippingFlat,
        express: settings.shippingExpress,
        freeThreshold: settings.freeShippingThreshold,
        thresholdBasis: settings.shippingThresholdBasis,
      },
      paymentProvider: settings.paymentProvider,
      mockControls: settings.allowMockControls && !config.isProd,
      cashback: {
        enabled: settings.cashbackEnabled,
        mode: settings.cashbackMode,
        base: settings.cashbackBase,
        tiers: normalizeTiers(settings.cashbackTiers),
        maxAmount: settings.cashbackMaxAmount,
        // financial policy visible to the storefront: nothing can be spent
        // before it is released, and a single order can only be partly paid
        creditTiming: settings.cashbackCreditTiming,
        holdDays: settings.cashbackHoldDays,
        expiryMonths: settings.cashbackExpiryMonths,
        redeem: {
          enabled: settings.cashbackRedeemEnabled,
          maxPercent: settings.cashbackRedeemMaxPercent,
          combineWithDiscounts: settings.cashbackCombineWithDiscounts,
        },
      },
    };
  });

  app.get<{ Params: { id: string } }>("/api/products/:id/variants", async (req) => {
    const rows = await productVariants(req.params.id);
    return rows.map((row) => publicVariant(row as Record<string, unknown>));
  });

  app.get("/api/commerce/cart", async (req, reply) => {
    const cart = await resolveCart(req, reply);
    return loadCartPayload(cart);
  });

  app.post<{ Body: { variantId?: string; quantity?: number } }>("/api/commerce/cart/lines", async (req, reply) => {
    const cart = await resolveCart(req, reply);
    const variantId = String(req.body?.variantId ?? "");
    if (!variantId) throw new CommerceError("واریانت لازم است.", 400, "variant_required");
    await addCartLine(cart.id, variantId, Number(req.body?.quantity ?? 1));
    return loadCartPayload(cart);
  });

  app.patch<{ Params: { variantId: string }; Body: { quantity?: number } }>(
    "/api/commerce/cart/lines/:variantId",
    async (req, reply) => {
      const cart = await resolveCart(req, reply);
      await updateCartLine(cart.id, req.params.variantId, Number(req.body?.quantity ?? 0));
      return loadCartPayload(cart);
    },
  );

  app.delete<{ Params: { variantId: string } }>("/api/commerce/cart/lines/:variantId", async (req, reply) => {
    const cart = await resolveCart(req, reply);
    await removeCartLine(cart.id, req.params.variantId);
    return loadCartPayload(cart);
  });

  app.post("/api/commerce/cart/merge", async (req, reply) => {
    const session = await requireCustomerSessionOrNull(req);
    if (!session) return reply.code(401).send({ error: "اول وارد شو." });
    const result = await mergeGuestCartForCustomer(req, reply, session.subject);
    return { ok: true, ...result };
  });

  /* ---------------------------------------------------------------
     Checkout, quote, payment
     --------------------------------------------------------------- */

  app.post<{
    Body: {
      cartId?: string;
      items?: CheckoutItemInput[];
      address?: Record<string, unknown>;
      shippingMethod?: "standard" | "express";
      couponCode?: string;
      idempotencyKey?: string;
    };
  }>("/api/commerce/checkout", async (req, reply) => {
    const session = await currentSession(req);
    let cartId = req.body?.cartId ?? null;
    if (!cartId && !req.body?.items?.length) {
      const cart = await resolveCart(req, reply);
      cartId = cart.id;
    }
    const result = await startCheckout({
      cartId,
      items: req.body?.items,
      customerEmail: session?.kind === "customer" ? session.subject : null,
      address: req.body?.address ?? null,
      shippingMethod: req.body?.shippingMethod,
      couponCode: req.body?.couponCode ?? null,
      idempotencyKey: req.body?.idempotencyKey ?? null,
    });
    // ties the sandbox /simulate control to the browser that opened the checkout
    reply.setCookie("kv_checkout", result.checkout.id, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
    });
    return reply.code(201).send(result);
  });

  app.get<{ Params: { id: string } }>("/api/commerce/checkout/:id", async (req) =>
    publicCheckout(await getCheckout(req.params.id)),
  );

  app.post<{ Params: { id: string }; Body: { couponCode?: string | null; shippingMethod?: "standard" | "express" } }>(
    "/api/commerce/checkout/:id/quote",
    async (req) =>
      requoteCheckout(req.params.id, {
        couponCode: req.body?.couponCode === undefined ? undefined : req.body.couponCode,
        shippingMethod: req.body?.shippingMethod,
      }),
  );

  app.post<{ Params: { id: string } }>("/api/commerce/checkout/:id/cancel", async (req) =>
    cancelCheckout(req.params.id),
  );

  app.post<{ Params: { id: string }; Body: { method?: "online" | "bnpl4"; idempotencyKey?: string } }>(
    "/api/commerce/checkout/:id/pay",
    async (req) => {
      const session = await currentSession(req);
      return startPayment({
        checkoutId: req.params.id,
        method: req.body?.method,
        idempotencyKey: req.body?.idempotencyKey ?? null,
        // the wallet belongs to the signed-in customer, never to a body field
        walletEmail: session?.kind === "customer" ? session.subject : null,
        useCashback: Boolean((req.body as { useCashback?: boolean } | undefined)?.useCashback),
      });
    },
  );

  /** the customer pays the price difference of a dearer exchange */
  app.post<{ Params: { token: string } }>("/api/commerce/exchange/:token/pay", async (req) => {
    const session = await currentSession(req);
    return payExchangeDifference({ token: req.params.token, actor: actorOf(session) });
  });

  app.post<{ Params: { id: string }; Body: { result?: string } }>("/api/commerce/payments/:id/simulate", async (req) => {
    const session = await currentSession(req);
    const cookie = req.cookies?.kv_checkout ?? null;
    return simulatePayment(req.params.id, String(req.body?.result ?? "success"), session, cookie);
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/api/commerce/payments/:id/callback",
    async (req, reply) => {
      const settings = await loadCommerceSettings();
      const body = req.body ?? {};
      if (settings.requireCallbackSignature) {
        const signature = req.headers["x-provider-signature"];
        const ok = verifyCallbackSignature(
          settings.providerWebhookSecret,
          req.params.id,
          body,
          typeof signature === "string" ? signature : undefined,
        );
        if (!ok) {
          // an unsigned callback is an untrusted claim, not a payment
          return reply.code(401).send({
            ok: false,
            code: "invalid_callback_signature",
            message: "امضای Callback معتبر نیست؛ پرداخت تأیید نشد.",
          });
        }
      }
      return handleCallback(req.params.id, body);
    },
  );

  app.post<{ Params: { id: string }; Body: { result?: "success" | "fail" | "timeout" } }>(
    "/api/commerce/payments/:id/reconcile",
    async (req) => {
      await requireAdminSession(req);
      return reconcileAttempt(req.params.id, req.body?.result ?? "success");
    },
  );

  /* ---------------------------------------------------------------
     Orders (customer + admin)
     --------------------------------------------------------------- */

  app.get<{ Querystring: { status?: string; limit?: string; all?: string } }>("/api/commerce/orders", async (req) => {
    const session = await currentSession(req);
    const isAdmin = session?.kind === "admin";
    const isCustomer = session?.kind === "customer";
    if (!isAdmin && !isCustomer) throw unauthorized("برای دیدن سفارش‌ها وارد شو.");
    if (req.query.all === "1" && !isAdmin) throw forbidden();
    return listOrders({
      email: isAdmin ? null : session?.subject ?? null,
      status: req.query.status ?? null,
      limit: Number(req.query.limit ?? 100),
    });
  });

  app.get<{ Params: { id: string } }>("/api/commerce/orders/:id", async (req) => {
    const session = await currentSession(req);
    const { order, lines } = await getOrder(req.params.id);
    if (session?.kind !== "admin") {
      if (session?.kind !== "customer" || order.email !== session.subject) {
        throw notFound("سفارش پیدا نشد.");
      }
    }
    return publicOrder(order, lines);
  });

  app.get<{ Params: { id: string } }>("/api/commerce/orders/:id/invoice", async (req) => {
    const session = await currentSession(req);
    const { order, lines } = await getOrder(req.params.id);
    if (session?.kind !== "admin" && order.email !== session?.subject) throw notFound("سفارش پیدا نشد.");
    const refunds = await query("select * from refunds where order_id = $1 order by created_at", [order.id]);
    return {
      order: publicOrder(order, lines),
      // the original document is never rewritten; refunds are separate rows
      adjustments: refunds.rows.map((r: any) => ({
        id: r.id,
        amount: Number(r.amount),
        quantity: r.quantity,
        status: r.status,
        at: r.created_at,
      })),
      issuedAt: order.created_at,
    };
  });

  app.post<{ Params: { id: string }; Body: { sku?: string } }>("/api/commerce/orders/:id/picking", async (req) => {
    const session = await requireAdminSession(req);
    return advanceOrder(req.params.id, "picking", { sku: req.body?.sku, actor: actorOf(session) });
  });

  app.post<{ Params: { id: string }; Body: { confirm?: boolean } }>("/api/commerce/orders/:id/packing", async (req) => {
    const session = await requireAdminSession(req);
    return advanceOrder(req.params.id, "packing", {
      actor: actorOf(session),
      note: req.body?.confirm === false ? "unconfirmed" : undefined,
    });
  });

  app.post<{ Params: { id: string } }>("/api/commerce/orders/:id/ship", async (req) => {
    const session = await requireAdminSession(req);
    return advanceOrder(req.params.id, "ship", { actor: actorOf(session) });
  });

  app.post<{ Params: { id: string } }>("/api/commerce/orders/:id/deliver", async (req) => {
    const session = await requireAdminSession(req);
    return advanceOrder(req.params.id, "deliver", { actor: actorOf(session) });
  });

  app.post<{ Params: { id: string }; Body: { reason?: string } }>("/api/commerce/orders/:id/cancel", async (req) => {
    const session = await requireAdminSession(req);
    return cancelOrder(req.params.id, req.body?.reason ?? "cancelled by admin", actorOf(session));
  });

  app.post<{
    Params: { id: string };
    Body: { lineId?: string; quantity?: number; reason?: string; kind?: "return" | "exchange" | "refund" };
  }>("/api/commerce/orders/:id/returns", async (req, reply) => {
    const session = await currentSession(req);
    const { order } = await getOrder(req.params.id);
    const isAdmin = session?.kind === "admin";
    if (!isAdmin && (session?.kind !== "customer" || order.email !== session.subject)) {
      throw notFound("سفارش پیدا نشد.");
    }
    const refund = await requestRefund({
      orderId: req.params.id,
      orderLineId: String(req.body?.lineId ?? ""),
      quantity: Number(req.body?.quantity ?? 0),
      reason: req.body?.reason,
      kind: req.body?.kind,
      targetVariantId: typeof (req.body as { targetVariantId?: unknown })?.targetVariantId === "string"
        ? (req.body as { targetVariantId: string }).targetVariantId
        : undefined,
      actor: actorOf(session),
    });
    return reply.code(201).send({ ok: true, refund });
  });

  /* ---------------------------------------------------------------
     Admin: settings, variants, inventory, payments, outbox, refunds
     --------------------------------------------------------------- */

  /** the signed-in customer's wallet (tiered cashback balance + history) */
  app.get("/api/commerce/cashback", async (req) => {
    const session = await currentSession(req);
    if (session?.kind === "admin") {
      const overview = await cashbackOverview();
      return {
        email: null,
        balance: overview.balance,
        earned: overview.earned,
        reversed: overview.reversed,
        transactions: overview.entries,
        admin: true,
      };
    }
    if (session?.kind !== "customer") {
      return { email: null, balance: 0, earned: 0, reversed: 0, transactions: [] };
    }
    const [wallet, transactions] = await Promise.all([
      cashbackWallet(session.subject),
      cashbackTransactions(session.subject),
    ]);
    return { email: session.subject, ...wallet, transactions };
  });

  app.get<{ Querystring: { targetType?: string; targetId?: string; limit?: string } }>(
    "/api/commerce/admin/audit",
    async (req) => {
      await requireAdminSession(req);
      return listAudit({
        targetType: req.query.targetType,
        targetId: req.query.targetId,
        limit: req.query.limit ? Number(req.query.limit) : 100,
      });
    },
  );

  app.get("/api/commerce/admin/cashback", async (req) => {
    await requireAdminSession(req);
    return cashbackOverview();
  });

  app.get("/api/commerce/admin/settings", async (req) => {
    await requireAdminSession(req);
    const settings = await loadCommerceSettings(true);
    return { ...settings, providerWebhookSecret: settings.providerWebhookSecret ? "***" : "" };
  });

  app.put<{ Body: Partial<CommerceSettings> }>("/api/commerce/admin/settings", async (req) => {
    const session = await requireAdminSession(req);
    const current = await loadCommerceSettings(true);
    // turning live money movement on is reserved for the superadmin subject
    if (req.body && "liveRefundsEnabled" in req.body) {
      if (Boolean(req.body.liveRefundsEnabled) !== current.liveRefundsEnabled) {
        await requireSuperadmin(req);
      }
    }
    const allowed: (keyof CommerceSettings)[] = [
      "bnpl4Enabled", "bnpl4ProviderReady", "bnpl4Installments", "cartMaxQtyPerLine", "reservationHoldMinutes",
      "paymentWindowMinutes", "quoteTtlMinutes", "shippingFlat", "shippingExpress",
      "freeShippingThreshold", "shippingThresholdBasis", "discountStacking", "liveRefundsEnabled",
      "taxRate", "currency", "paymentProvider", "requireCallbackSignature",
      "cashbackEnabled", "cashbackMode", "cashbackBase", "cashbackTiers", "cashbackMaxAmount",
      "cashbackCreditTiming", "cashbackHoldDays", "cashbackExpiryMonths",
      "cashbackRedeemEnabled", "cashbackRedeemMaxPercent", "cashbackCombineWithDiscounts",
    ];
    const patch: Partial<CommerceSettings> = {};
    for (const key of allowed) {
      if (req.body && key in req.body) (patch as Record<string, unknown>)[key] = req.body[key];
    }
    if (patch.cashbackTiers) patch.cashbackTiers = normalizeTiers(patch.cashbackTiers);

    /* the master switch cannot be turned on without a confirmed provider */
    let nextEnabled = patch.bnpl4Enabled ?? current.bnpl4Enabled;
    const nextReady = patch.bnpl4ProviderReady ?? current.bnpl4ProviderReady;
    if (!nextReady && current.bnpl4Enabled) {
      // losing provider readiness is an emergency stop: the master switch goes
      // off in the same write instead of leaving a switch nobody can honour
      patch.bnpl4Enabled = false;
      nextEnabled = false;
    }
    if (nextEnabled && !nextReady) {
      throw new CommerceError(
        "بدون تأیید ارائه‌دهنده (قرارداد/سقف/اعتبارسنجی) نمی‌توان کلید پرداخت اقساطی را روشن کرد.",
        409,
        "bnpl_provider_not_ready",
      );
    }
    if (patch.providerWebhookSecret) {
      // secrets are written, never read back
      await requireSuperadmin(req);
    }
    const saved = await saveCommerceSettings(patch);
    const changes = diffSettings(current as unknown as Record<string, unknown>, patch as Record<string, unknown>);
    if (Object.keys(changes).length > 0) {
      // the BNPL master switch is a financial control: it gets its own action name
      await recordAudit({
        actor: actorOf(session),
        action: "bnpl4Enabled" in changes ? "settings.bnpl_toggle" : "settings.update",
        targetType: "commerce_settings",
        targetId: "store",
        before: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.from])),
        after: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to])),
        reason: typeof (req.body as { reason?: string } | undefined)?.reason === "string"
          ? (req.body as { reason?: string }).reason
          : null,
      });
    }
    return saved;
  });

  /** elevation to the protected superadmin subject (separate passcode) */
  app.post<{ Body: { passcode?: string } }>("/api/commerce/admin/elevate", async (req, reply) => {
    if (!config.superadminPasscode) {
      throw forbidden("دسترسی Superadmin در این نصب تنظیم نشده است.");
    }
    if ((req.body?.passcode ?? "") !== config.superadminPasscode) {
      throw unauthorized("رمز Superadmin درست نیست.");
    }
    const session = await createSession("admin", "superadmin");
    setSessionCookie(reply, session.token, session.expires);
    return { ok: true, subject: "superadmin" };
  });

  app.post("/api/commerce/admin/sync", async (req) => {
    await requireAdminSession(req);
    const { syncVariants } = await import("./variants");
    const { syncPromotions } = await import("./promotions");
    const { getDocument } = await import("../seed");
    const admin = (await getDocument<Record<string, any>>("admin")) ?? {};
    await syncPromotions(admin);
    await syncVariants();
    return { ok: true };
  });

  app.get<{ Querystring: { productId?: string } }>("/api/commerce/admin/variants", async (req) => {
    await requireAdminSession(req);
    if (req.query.productId) {
      const rows = await productVariants(req.query.productId);
      return rows.map((row) => publicVariant(row as Record<string, unknown>));
    }
    const rows = await query(
      `select v.*, p.name, p.category, p.price,
              (select coalesce(sum(r.quantity),0)::int from stock_reservations r
                where r.variant_id = v.id and r.status = 'active' and r.expires_at > now()) as reserved
         from product_variants v join products p on p.id = v.product_id
        order by p.name, v.color_id, v.size_id limit 500`,
    );
    return rows.rows.map((row: any) => ({
      ...publicVariant(row),
      name: row.name,
      category: row.category,
      price: Number(row.price),
    }));
  });

  app.get<{ Querystring: { variantId?: string; limit?: string } }>("/api/commerce/admin/inventory/movements", async (req) => {
    await requireAdminSession(req);
    const params: unknown[] = [];
    let where = "";
    if (req.query.variantId) {
      params.push(req.query.variantId);
      where = "where variant_id = $1";
    }
    params.push(Math.min(500, Number(req.query.limit ?? 200)));
    const rows = await query(
      `select id, variant_id, delta, reason, ref_type, ref_id, actor, note, created_at
         from inventory_movements ${where} order by id desc limit $${params.length}`,
      params,
    );
    return rows.rows;
  });

  app.post<{ Body: { variantId?: string; delta?: number; reason?: string; note?: string } }>(
    "/api/commerce/admin/inventory/adjustments",
    async (req, reply) => {
      const session = await requireAdminSession(req);
      const adjustment = await requestAdjustment({
        variantId: String(req.body?.variantId ?? ""),
        delta: Number(req.body?.delta ?? 0),
        reason: String(req.body?.reason ?? "manual"),
        actor: actorOf(session),
        note: req.body?.note,
      });
      return reply.code(201).send({ ok: true, adjustment });
    },
  );

  app.post<{ Params: { id: string }; Body: { decision?: "approve" | "reject"; note?: string } }>(
    "/api/commerce/admin/inventory/adjustments/:id",
    async (req) => {
      const session = await requireAdminSession(req);
      const before = await query<{ status: string; delta: number; variant_id: string }>(
        "select status, delta, variant_id from inventory_adjustments where id = $1",
        [req.params.id],
      );
      const result = await decideAdjustment({
        id: req.params.id,
        decision: req.body?.decision === "reject" ? "reject" : "approve",
        actor: actorOf(session),
        note: req.body?.note,
      });
      await recordAudit({
        actor: actorOf(session),
        action: `stock_adjustment.${req.body?.decision === "reject" ? "reject" : "approve"}`,
        targetType: "inventory_adjustment",
        targetId: req.params.id,
        before: before.rows[0] ? { status: before.rows[0].status, delta: before.rows[0].delta } : null,
        after: { status: result.adjustment.status, approvedBy: result.adjustment.approvedBy },
        reason: typeof req.body?.note === "string" ? req.body.note : null,
      });
      return result;
    },
  );

  app.get("/api/commerce/admin/inventory/adjustments", async (req) => {
    await requireAdminSession(req);
    const rows = await query<AdjustmentRow>(
      "select * from inventory_adjustments order by created_at desc limit 200",
    );
    return rows.rows.map(publicAdjustment);
  });

  app.get<{ Querystring: { status?: string } }>("/api/commerce/admin/reservations", async (req) => {
    await requireAdminSession(req);
    const status = req.query.status ?? "active";
    const rows = await query(
      `select r.*, v.product_id, v.color_id, v.size_id, v.sku, p.name
         from stock_reservations r
         join product_variants v on v.id = r.variant_id
         join products p on p.id = v.product_id
        where ($1 = 'all' or r.status = $1)
        order by r.created_at desc limit 200`,
      [status],
    );
    return rows.rows;
  });

  app.get<{ Querystring: { status?: string } }>("/api/commerce/admin/payments", async (req) => {
    await requireAdminSession(req);
    const rows = await query<PaymentAttemptRow>(
      `select * from payment_attempts where ($1 = 'all' or status = $1) order by created_at desc limit 200`,
      [req.query.status ?? "all"],
    );
    return rows.rows.map(publicAttempt);
  });

  app.get("/api/commerce/admin/outbox", async (req) => {
    await requireAdminSession(req);
    const rows = await query(
      "select id, type, payload, dedupe_key, status, attempts, last_error, created_at, processed_at from outbox_events order by id desc limit 200",
    );
    return { stats: await outboxStats(), events: rows.rows };
  });

  app.post<{ Body: { limit?: number } }>("/api/commerce/admin/outbox/process", async (req) => {
    await requireAdminSession(req);
    return processOutbox(Math.min(100, Number(req.body?.limit ?? 20)));
  });

  /** the worker ticks from a request too, so a serverless deploy still drains */
  app.post("/api/commerce/admin/tick", async (req) => {
    await requireAdminSession(req);
    const expired = await expireReservations();
    const attempts = await expirePaymentAttempts();
    const outbox = await processOutbox();
    return { ok: true, expired, attempts, outbox };
  });

  app.post<{ Params: { id: string }; Body: { note?: string } }>(
    "/api/commerce/admin/refunds/:id/receive",
    async (req) => {
      const session = await requireAdminSession(req);
      const result = await receiveReturn({ refundId: req.params.id, actor: actorOf(session), note: req.body?.note });
      await recordAudit({
        actor: actorOf(session),
        action: "refund.receive",
        targetType: "refund",
        targetId: req.params.id,
        after: { status: result.refund.status },
      });
      return result;
    },
  );

  app.post<{ Params: { id: string }; Body: { result?: "saleable" | "defective"; note?: string } }>(
    "/api/commerce/admin/refunds/:id/qc",
    async (req) => {
      const session = await requireAdminSession(req);
      const result = await qcReturn({
        refundId: req.params.id,
        result: req.body?.result === "defective" ? "defective" : "saleable",
        actor: actorOf(session),
        note: req.body?.note,
      });
      return result;
    },
  );

  app.post<{ Params: { id: string }; Body: { note?: string } }>(
    "/api/commerce/admin/refunds/:id/settle",
    async (req) => {
      const session = await requireSuperadmin(req);
      return settleRefund({ refundId: req.params.id, actor: actorOf(session), note: req.body?.note });
    },
  );

  app.get<{ Querystring: { status?: string; orderId?: string } }>("/api/commerce/admin/refunds", async (req) => {
    await requireAdminSession(req);
    return listRefunds({ status: req.query.status, orderId: req.query.orderId });
  });

  app.post<{ Params: { id: string }; Body: { decision?: "approve" | "reject"; note?: string } }>(
    "/api/commerce/admin/refunds/:id",
    async (req) => {
      const session = await requireSuperadmin(req);
      const before = await query<{ status: string; amount: string; order_id: string }>(
        "select status, amount, order_id from refunds where id = $1",
        [req.params.id],
      );
      const result = await decideRefund({
        refundId: req.params.id,
        decision: req.body?.decision === "reject" ? "reject" : "approve",
        actor: actorOf(session),
        note: req.body?.note,
      });
      await recordAudit({
        actor: actorOf(session),
        action: `refund.${req.body?.decision === "reject" ? "reject" : "approve"}`,
        targetType: "refund",
        targetId: req.params.id,
        before: before.rows[0] ? { status: before.rows[0].status, amount: Number(before.rows[0].amount) } : null,
        after: { status: result.refund?.status ?? null, orderId: before.rows[0]?.order_id ?? null },
        reason: typeof req.body?.note === "string" ? req.body.note : null,
      });
      return result;
    },
  );

  /** a browser-side quote preview; the authoritative quote is stored server-side */
  app.post<{
    Body: { items?: CheckoutItemInput[]; couponCode?: string; shippingMethod?: "standard" | "express" };
  }>("/api/commerce/quote", async (req) => {
    const input = req.body?.items ?? [];
    if (!input.length) throw new CommerceError("سبد خرید خالی است.", 400, "empty_cart");
    const settings = await loadCommerceSettings();
    const items = normalizeItems(input);
    const ids = items.map((i) => i.variantId);
    const rows = await query<any>(
      `select v.id, v.product_id, v.sku, v.color_id, v.size_id, p.name, p.look_id, p.category, p.price, p.colors, p.sizes
         from product_variants v join products p on p.id = v.product_id
        where v.id = any($1::text[])`,
      [ids],
    );
    const byId = new Map(rows.rows.map((r) => [r.id as string, r]));
    const lines = items.map((item) => {
      const row = byId.get(item.variantId);
      if (!row) throw new CommerceError("واریانت پیدا نشد.", 404, "variant_not_found");
      const color = (row.colors ?? []).find((c: any) => c.id === row.color_id);
      const size = (row.sizes ?? []).find((s: any) => s.id === row.size_id);
      return {
        variantId: row.id as string,
        productId: row.product_id as string,
        sku: row.sku as string,
        name: row.name as string,
        colorId: row.color_id as string,
        colorName: color?.name ?? row.color_id,
        sizeId: row.size_id as string,
        sizeLabel: size?.label ?? row.size_id,
        lookId: (row.look_id as string | null) ?? null,
        category: row.category as string,
        unitPrice: Number(row.price),
        quantity: Math.trunc(item.quantity),
      };
    });
    return buildQuote({
      lines,
      couponCode: req.body?.couponCode ?? null,
      shippingMethod: req.body?.shippingMethod === "express" ? "express" : "standard",
      settings,
    });
  });
}

async function requireCustomerSessionOrNull(req: FastifyRequest) {
  const session = await currentSession(req);
  return session?.kind === "customer" ? session : null;
}
