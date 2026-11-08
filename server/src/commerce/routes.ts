import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../config";
import { query, withTransaction } from "../db";
import { createSession, setSessionCookie } from "../sessions";
import { actorOf, currentSession, requireCustomerSession, requireSuperadmin } from "./auth";
import { requirePermission, roleForSubject } from "../http/rbac";
import { cookieSecurity } from "../http/security";
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
import { advanceOrder, cancelOrder, getOrder, listAdminOrderPage, listOrders, publicOrder } from "./orders";
import { outboxStats, processOutbox } from "./outbox";
import {
  expirePaymentAttempts,
  handleCallback,
  publicAttempt,
  reconcileAttempt,
  simulatePayment,
  paymentStatus,
  attemptProviderId,
  availableProviders,
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
  listRefundPage,
  publicAdjustment,
  requestAdjustment,
  requestStocktake,
  requestRefund,
  type AdjustmentRow,
} from "./refunds";
import { loadCommerceSettings, saveCommerceSettings, type CommerceSettings } from "./settings";
import { providerCapabilities, verifyCallbackSignature } from "./payments";
import { diffSettings, listAudit, recordAudit } from "./audit";
import { productVariants, publicVariant } from "./variants";
import { createManualOrder, type ManualOrderInput } from "./manual";

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
          !config.isProd &&
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
      checkoutAvailable: !config.isProd && (settings.paymentProvider === "mock" ? settings.allowMockControls : settings.paymentProvider === "gateway" && availableProviders().gateway),
      // what this build can actually offer; the gateway stays false until its
      // URL is configured, so the storefront never promises it early
      providers: availableProviders(),
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

  app.get<{ Params: { id: string } }>("/api/products/:id/variants", async (req,reply) => {
    reply.header("cache-control","no-store");
    // Draft products must not expose SKUs or physical warehouse quantities.
    // Check publication in the same statement that returns the variant rows.
    const rows = await productVariants(req.params.id,true);
    return rows.map((row) => {
      const v=publicVariant(row as Record<string, unknown>);
      return {id:v.id,productId:v.productId,sku:v.sku,colorId:v.colorId,sizeId:v.sizeId,sizeMode:v.sizeMode,available:v.available,active:v.active};
    });
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
    const session = await requireCustomerSession(req);
    // Never reserve stock for an order that cannot be paid in this build.
    if (config.isProd) throw new CommerceError("ثبت سفارش تا اتصال درگاه واقعی در دسترس نیست.",503,"production_provider_not_ready");
    let cartId: string | null = null;
    if (!req.body?.items?.length) {
      const cart = await resolveCart(req, reply);
      cartId = cart.id;
    }
    const result = await startCheckout({
      cartId,
      items: req.body?.items,
      customerEmail: session.subject,
      address: req.body?.address ?? null,
      shippingMethod: req.body?.shippingMethod,
      couponCode: req.body?.couponCode ?? null,
      idempotencyKey: req.body?.idempotencyKey ?? null,
    });
    // ties the sandbox /simulate control to the browser that opened the checkout
    {
      const { secure, sameSite } = cookieSecurity(req);
      reply.setCookie("kv_checkout", result.checkout.id, {
        path: "/",
        httpOnly: true,
        sameSite,
        secure,
        maxAge: 60 * 60 * 24,
      });
    }
    return reply.code(201).send(result);
  });

  async function ownCheckout(req: FastifyRequest, id: string) {
    const session = await requireCustomerSession(req);
    const row = await getCheckout(id);
    if (row.customer_email !== session.subject) throw notFound("تسویه‌حساب پیدا نشد.");
    return { session, row };
  }
  app.get<{ Params: { id: string } }>("/api/commerce/checkout/:id", async (req) =>
    publicCheckout((await ownCheckout(req, req.params.id)).row),
  );
  app.post<{ Params: { id: string }; Body: { couponCode?: string | null; shippingMethod?: "standard" | "express" } }>(
    "/api/commerce/checkout/:id/quote", async (req) => {
      await ownCheckout(req, req.params.id);
      return requoteCheckout(req.params.id, { couponCode: req.body?.couponCode, shippingMethod: req.body?.shippingMethod });
    },
  );

  app.post<{ Params: { id: string } }>("/api/commerce/checkout/:id/cancel", async (req) => {
    await ownCheckout(req, req.params.id);
    return cancelCheckout(req.params.id);
  });

  app.post<{ Params: { id: string }; Body: { method?: "online" | "bnpl4"; idempotencyKey?: string } }>(
    "/api/commerce/checkout/:id/pay",
    async (req) => {
      const { session } = await ownCheckout(req, req.params.id);
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
    if (session?.kind === "admin") await requirePermission(req, "finance:approve");
    const cookie = req.cookies?.kv_checkout ?? null;
    return simulatePayment(req.params.id, String(req.body?.result ?? "success"), session, cookie);
  });

  app.get<{ Params: { id: string } }>("/api/commerce/payments/:id", async (req) => {
    const session = await currentSession(req);
    if (session?.kind === "admin") await requirePermission(req, "finance:view");
    const cookie = req.cookies?.kv_checkout ?? null;
    return paymentStatus(req.params.id, session, cookie);
  });

  app.post<{ Params: { id: string }; Body: Record<string, unknown> }>(
    "/api/commerce/payments/:id/callback",
    async (req, reply) => {
      const settings = await loadCommerceSettings();
      const body = req.body ?? {};
      /* The generic HMAC below is the shared secret of the *simulated* flow, whose
         payload shape we define. A real gateway signs with its own key over its own
         fields; that signature is checked inside the provider's verify(), which then
         asks the gateway itself. So the generic check is skipped for `gateway` — and
         an unsigned claim there still cannot settle anything (it parks the attempt). */
      const providerId = await attemptProviderId(req.params.id);
      if (settings.requireCallbackSignature && providerId !== "gateway") {
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
      await requirePermission(req,"finance:approve");
      return reconcileAttempt(req.params.id, req.body?.result ?? "success");
    },
  );

  /* ---------------------------------------------------------------
     Orders (customer + admin)
     --------------------------------------------------------------- */

  // A single statement gives all counts from one PostgreSQL snapshot. Queue
  // counts exclude cancelled/exception/pending-payment orders; they are stage
  // indicators, not proof of bank payment or of a successful warehouse scan.
  app.get("/api/commerce/admin/order-summary", async (req, reply) => {
    reply.header("cache-control", "private, no-store");
    await requirePermission(req, "orders:view");
    const result = await query<{ total: string; awaiting: string; picking: string; packed: string; exception: string }>(`
      select count(*) as total,
        count(*) filter (where status in ('paid','preparing') and fulfillment_status in ('unfulfilled','preparing')) as awaiting,
        count(*) filter (where status in ('paid','preparing') and fulfillment_status='picking') as picking,
        count(*) filter (where status in ('paid','preparing') and fulfillment_status='packed') as packed,
        count(*) filter (where status='exception') as exception
      from orders`);
    const row = result.rows[0];
    return { total: Number(row.total), awaiting: Number(row.awaiting), picking: Number(row.picking), packed: Number(row.packed), exception: Number(row.exception) };
  });

  app.get<{ Querystring: { before?: string; search?: string; stage?: string; limit?: string } }>("/api/commerce/admin/order-page", async (req, reply) => {
    reply.header("cache-control", "private, no-store");
    await requirePermission(req, "orders:view");
    const { before, search = "", stage = "all", limit: rawLimit = "40" } = req.query;
    if ((before !== undefined && (typeof before !== "string" || !before || before.length > 200)) || typeof search !== "string" || search.length > 120 || typeof stage !== "string" || !["all","awaiting","picking","packed","shipped","exception"].includes(stage) || typeof rawLimit !== "string" || !/^(?:[1-9]|[1-9][0-9]|100)$/.test(rawLimit)) throw new CommerceError("فیلتر یا نشانگر صفحه معتبر نیست.", 422, "validation_error");
    return listAdminOrderPage({ before, search: search.trim(), stage, limit: Number(rawLimit) });
  });

  app.get<{ Querystring: { status?: string; limit?: string; all?: string } }>("/api/commerce/orders", async (req, reply) => {
    reply.header("cache-control", "private, no-store");
    const session = await currentSession(req);
    const isAdmin = session?.kind === "admin";
    const isCustomer = session?.kind === "customer";
    if (!isAdmin && !isCustomer) throw unauthorized("برای دیدن سفارش‌ها وارد شو.");
    if (req.query.all === "1" && !isAdmin) throw forbidden();
    if (isAdmin) await requirePermission(req, "orders:view");
    return listOrders({
      email: isAdmin ? null : session?.subject ?? null,
      status: req.query.status ?? null,
      limit: Number(req.query.limit ?? 100),
    });
  });

  app.get<{ Params: { id: string } }>("/api/commerce/orders/:id", async (req, reply) => {
    reply.header("cache-control", "private, no-store");
    const session = await currentSession(req);
    const { order, lines } = await getOrder(req.params.id);
    if (session?.kind === "admin") await requirePermission(req, "orders:view");
    else {
      if (session?.kind !== "customer" || order.email !== session.subject) {
        throw notFound("سفارش پیدا نشد.");
      }
    }
    return publicOrder(order, lines);
  });

  app.get<{ Params: { id: string } }>("/api/commerce/orders/:id/invoice", async (req, reply) => {
    reply.header("cache-control", "private, no-store");
    const session = await currentSession(req);
    const { order, lines } = await getOrder(req.params.id);
    if (session?.kind === "admin") await requirePermission(req, "orders:view");
    else if (session?.kind !== "customer" || order.email !== session.subject) throw notFound("سفارش پیدا نشد.");
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

  app.post<{ Params: { id: string }; Body: { sku?: string; scanKey?: string; undo?: boolean } }>("/api/commerce/orders/:id/picking", async (req) => {
    const session = await requirePermission(req, "orders:edit");
    if (req.body?.undo !== undefined && typeof req.body.undo !== "boolean") throw new CommerceError("درخواست اسکن معتبر نیست.",400,"invalid_scan");
    return advanceOrder(req.params.id, "picking", { sku: req.body?.sku, scanKey: req.body?.scanKey, undo: req.body?.undo, actor: actorOf(session) });
  });

  app.post<{ Params: { id: string }; Body: { confirm?: boolean } }>("/api/commerce/orders/:id/packing", async (req) => {
    const session = await requirePermission(req, "orders:edit");
    return advanceOrder(req.params.id, "packing", {
      actor: actorOf(session),
      note: req.body?.confirm === true ? undefined : "unconfirmed",
    });
  });

  app.post<{ Params: { id: string } }>("/api/commerce/orders/:id/ship", async (req) => {
    const session = await requirePermission(req, "orders:edit");
    return advanceOrder(req.params.id, "ship", { actor: actorOf(session) });
  });

  app.post<{ Params: { id: string } }>("/api/commerce/orders/:id/deliver", async (req) => {
    const session = await requirePermission(req, "orders:edit");
    return advanceOrder(req.params.id, "deliver", { actor: actorOf(session) });
  });

  app.post<{ Params: { id: string }; Body: { reason?: string } }>("/api/commerce/orders/:id/cancel", async (req) => {
    const session = await requirePermission(req, "orders:edit");
    return cancelOrder(req.params.id, req.body?.reason ?? "cancelled by admin", actorOf(session));
  });

  // Customer-only, scoped in SQL to the authenticated owner. Do not expose
  // staff notes, internal QC notes or provider references to the customer.
  app.get("/api/commerce/returns", async (req, reply) => {
    const session = await requireCustomerSession(req);
    reply.header("cache-control", "private, no-store");
    const result = await query<{id:string;order_id:string;order_line_id:string;quantity:number;status:string;kind:string;created_at:Date;name_snapshot:string;color_name:string|null;size_label:string|null}>(
      `select r.id,r.order_id,r.order_line_id,r.quantity,r.status,r.kind,r.created_at,
              l.name_snapshot,l.color_name,l.size_label
         from refunds r join orders o on o.id=r.order_id
         join order_lines l on l.id=r.order_line_id and l.order_id=o.id
        where o.email=$1 order by r.created_at desc, r.id desc limit 200`, [session.subject]);
    return result.rows.map(r=>({id:r.id,orderId:r.order_id,lineId:r.order_line_id,quantity:r.quantity,status:r.status,kind:r.kind,createdAt:r.created_at,name:r.name_snapshot,color:r.color_name,size:r.size_label}));
  });

  app.post<{
    Params: { id: string };
    Body: { lineId?: string; quantity?: number; reason?: string; kind?: "return" | "exchange" | "refund" };
  }>("/api/commerce/orders/:id/returns", async (req, reply) => {
    const session = await currentSession(req);
    const { order } = await getOrder(req.params.id);
    const isAdmin = session?.kind === "admin";
    if (isAdmin) await requirePermission(req, "orders:edit");
    if (!isAdmin && (session?.kind !== "customer" || order.email !== session.subject)) {
      throw notFound("سفارش پیدا نشد.");
    }
    if (typeof req.body?.lineId !== "string" || !req.body.lineId || typeof req.body?.quantity !== "number" || !Number.isSafeInteger(req.body.quantity) || req.body.quantity <= 0 || (req.body.reason !== undefined && (typeof req.body.reason !== "string" || req.body.reason.length > 500)) || (req.body.kind !== undefined && !["return","exchange","refund"].includes(req.body.kind))) {
      throw new CommerceError("اطلاعات درخواست مرجوعی معتبر نیست.", 400, "invalid_return_request");
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

  /** Back-office order entry: real server quote + reservation + paid snapshot. */
  app.post<{ Body: ManualOrderInput }>("/api/commerce/admin/orders/manual", async (req, reply) => {
    const session = await requirePermission(req, "orders:edit");
    const result = await createManualOrder(req.body, actorOf(session));
    await recordAudit({
      actor: actorOf(session),
      action: "order.manual_create",
      targetType: "order",
      targetId: result.order.id,
      after: { total: result.order.total, paymentReference: req.body.paymentReference, reused: result.reused },
      requestId: req.id,
    });
    return reply.code(result.reused ? 200 : 201).send(result);
  });

  /** Carrier values are shared by the warehouse, print centre and account. */
  app.patch<{
    Params: { id: string };
    Body: { tracking?: string; carrier?: string };
  }>("/api/commerce/admin/orders/:id/shipment", async (req) => {
    const session = await requirePermission(req, "orders:edit");
    const body=req.body ?? {};
    if ((body.tracking !== undefined && typeof body.tracking !== "string") || (body.carrier !== undefined && typeof body.carrier !== "string") || (body.tracking?.length ?? 0) > 120 || (body.carrier?.length ?? 0) > 120) throw new CommerceError("اطلاعات ارسال معتبر نیست.",400,"invalid_shipment");
    return withTransaction(async client => {
      const previous=await client.query<{tracking_code:string|null;carrier_name:string|null}>("select tracking_code,carrier_name from orders where id=$1 for update",[req.params.id]);
      if (!previous.rows[0]) throw notFound("سفارش پیدا نشد.");
      const tracking=body.tracking === undefined ? (previous.rows[0].tracking_code ?? "") : body.tracking.trim();
      const carrier=body.carrier === undefined ? (previous.rows[0].carrier_name ?? "") : body.carrier.trim();
      await client.query(`update orders set tracking_code=$2,carrier_name=$3,data=jsonb_set(jsonb_set(data,'{tracking}',to_jsonb($2::text),true),'{carrier}',to_jsonb($3::text),true) where id=$1`,[req.params.id,tracking,carrier]);
      await client.query(`insert into fulfillment_events (order_id,stage,accepted,actor,note) values ($1,'shipment_details',true,$2,$3)`,[req.params.id,actorOf(session),tracking ? `tracking:${tracking}` : "tracking cleared"]);
      await recordAudit({actor:actorOf(session),action:"order.shipment_update",targetType:"order",targetId:req.params.id,before:{tracking:previous.rows[0].tracking_code,carrier:previous.rows[0].carrier_name},after:{tracking,carrier},requestId:req.id},client);
      return {ok:true,id:req.params.id,tracking,carrier};
    });
  });

  app.get<{ Params: { id: string } }>("/api/commerce/admin/orders/:id/events", async (req) => {
    await requirePermission(req, "orders:view");
    const rows = await query(
      `select id, stage, sku, accepted, actor, note, created_at
         from fulfillment_events where order_id = $1 order by id desc limit 200`,
      [req.params.id],
    );
    return rows.rows;
  });

  /** Physical, quarantined, reserved and sellable stock in one SKU-centred view. */
  app.get("/api/commerce/admin/inventory", async (req) => {
    await requirePermission(req, "inventory:view");
    const rows = await query<any>(
      `select v.id, v.product_id, v.color_id, v.size_id, v.sku, v.on_hand, v.quarantined, v.active, v.sale_enabled, v.updated_at::text as stock_version,
              p.name, p.category, p.price, p.colors, p.sizes,
              coalesce((select sum(r.quantity) from stock_reservations r
                where r.variant_id = v.id and r.status = 'active' and r.expires_at > now()), 0)::int as reserved
         from product_variants v join products p on p.id = v.product_id
        order by p.name, v.sku`,
    );
    const { getDocument } = await import("../seed");
    const admin = await getDocument<any>("admin");
    const threshold = Number(admin?.settings?.lowStockThreshold) > 0 ? Number(admin.settings.lowStockThreshold) : 12;
    return rows.rows.map((row) => {
      const onHand = Number(row.on_hand);
      const quarantined = Number(row.quarantined);
      const reserved = Number(row.reserved);
      const sellable = row.active && row.sale_enabled ? Math.max(0, onHand - quarantined - reserved) : 0;
      const color = (row.colors ?? []).find((item: any) => item.id === row.color_id);
      const size = (row.sizes ?? []).find((item: any) => item.id === row.size_id);
      return {
        id: row.id,
        productId: row.product_id,
        name: row.name,
        category: row.category,
        price: Number(row.price),
        sku: row.sku,
        colorId: row.color_id,
        colorName: color?.name ?? row.color_id,
        colorHex: color?.hex ?? "#888888",
        sizeId: row.size_id,
        sizeLabel: size?.label ?? row.size_id,
        onHand,
        stockVersion: row.stock_version,
        quarantined,
        reserved,
        sellable,
        threshold,
        active: row.active && row.sale_enabled,
        saleEnabled: row.sale_enabled,
        lowStock: sellable > 0 && sellable <= threshold,
        outOfStock: sellable === 0,
      };
    });
  });

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

  app.get<{
    Querystring: { targetType?: string; targetId?: string; action?: string; actor?: string; limit?: string };
  }>("/api/commerce/admin/audit", async (req) => {
    await requirePermission(req, "security:view");
    return listAudit({
      targetType: req.query.targetType,
      targetId: req.query.targetId,
      action: req.query.action,
      actor: req.query.actor,
      limit: req.query.limit ? Number(req.query.limit) : 100,
    });
  });

  app.get("/api/commerce/admin/cashback", async (req) => {
    await requirePermission(req,"finance:view");
    return cashbackOverview();
  });

  app.get("/api/commerce/admin/settings", async (req) => {
    await requirePermission(req, "settings:view");
    const settings = await loadCommerceSettings(true);
    return { ...settings, providerWebhookSecret: settings.providerWebhookSecret ? "***" : "" };
  });

  app.put<{ Body: Partial<CommerceSettings> }>("/api/commerce/admin/settings", async (req) => {
    const session = await requirePermission(req, "settings:edit");
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
    const numericLimits: Partial<Record<keyof CommerceSettings, [number, number, boolean]>> = {
      shippingFlat: [0, 99999999, false], shippingExpress: [0, 99999999, false], freeShippingThreshold: [0, 99999999, false],
      taxRate: [0, 100, false], cartMaxQtyPerLine: [1, 10000, true], reservationHoldMinutes: [1, 1440, true],
      paymentWindowMinutes: [1, 1440, true], quoteTtlMinutes: [1, 1440, true], bnpl4Installments: [1, 48, true],
      cashbackMaxAmount: [0, 99999999, false], cashbackHoldDays: [0, 3650, true], cashbackExpiryMonths: [0, 1200, true], cashbackRedeemMaxPercent: [0, 100, false],
    };
    for (const [key, [min, max, integer]] of Object.entries(numericLimits)) {
      const value = (patch as Record<string, unknown>)[key];
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value)))) throw new CommerceError("مقدار تنظیمات معتبر نیست.", 400, "invalid_settings");
    }
    for (const key of ["bnpl4Enabled", "bnpl4ProviderReady", "liveRefundsEnabled", "requireCallbackSignature", "cashbackEnabled", "cashbackRedeemEnabled", "cashbackCombineWithDiscounts"] as const) {
      if (patch[key] !== undefined && typeof patch[key] !== "boolean") throw new CommerceError("وضعیت تنظیمات معتبر نیست.", 400, "invalid_settings");
    }
    if (patch.shippingThresholdBasis !== undefined && !["before_discount", "after_discount"].includes(patch.shippingThresholdBasis)) throw new CommerceError("مبنای ارسال معتبر نیست.", 400, "invalid_settings");
    if (patch.discountStacking !== undefined && !["none", "explicit"].includes(patch.discountStacking)) throw new CommerceError("قانون تخفیف معتبر نیست.", 400, "invalid_settings");
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
    return { ...saved, providerWebhookSecret: saved.providerWebhookSecret ? "***" : "" };
  });

  /** elevation to the protected superadmin subject (separate passcode) */
  app.post<{ Body: { passcode?: string } }>("/api/commerce/admin/elevate", async (req, reply) => {
    const actor = await requirePermission(req, "finance:approve");
    if (!config.superadminPasscode || (config.isProd && config.superadminPasscode.length < 12)) {
      throw forbidden("دسترسی Superadmin در این نصب به‌صورت امن تنظیم نشده است.");
    }
    if ((req.body?.passcode ?? "") !== config.superadminPasscode) {
      throw unauthorized("رمز Superadmin درست نیست.");
    }
    const session = await createSession("admin", "superadmin", 15 * 60_000);
    await recordAudit({actor:actor.subject,action:"admin.elevated",targetType:"staff",targetId:"superadmin",requestId:req.id});
    setSessionCookie(reply, session.token, session.expires);
    return { ok: true, subject: "superadmin", ...(!config.isProd ? {sessionToken:session.token} : {}) };
  });

  app.post("/api/commerce/admin/sync", async (req) => {
    await requirePermission(req,"catalog:edit");
    const { syncVariants } = await import("./variants");
    const { syncPromotions } = await import("./promotions");
    const { getDocument } = await import("../seed");
    const admin = (await getDocument<Record<string, any>>("admin")) ?? {};
    await syncPromotions(admin);
    await syncVariants();
    return { ok: true };
  });

  app.get<{ Querystring: { productId?: string } }>("/api/commerce/admin/variants", async (req) => {
    await requirePermission(req,"inventory:view");
    if (req.query.productId) {
      const rows = await productVariants(req.query.productId);
      return rows.map((row) => publicVariant(row as Record<string, unknown>));
    }
    const rows = await query(
      `select v.*, v.updated_at::text as stock_version, p.name, p.category, p.price,
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
      stockVersion: row.stock_version,
    }));
  });

  app.get<{ Querystring: { variantId?: string; limit?: string } }>("/api/commerce/admin/inventory/movements", async (req) => {
    await requirePermission(req, "inventory:view");
    const params: unknown[] = [];
    let where = "";
    if (req.query.variantId) {
      params.push(req.query.variantId);
      where = "where variant_id = $1";
    }
    params.push(Math.min(500, Number(req.query.limit ?? 200)));
    const movementWhere = where ? `where m.variant_id = $1` : "";
    const rows = await query(
      `select m.id, m.variant_id, m.delta, m.reason, m.ref_type, m.ref_id, m.actor, m.note, m.created_at,
              v.sku, p.name as product_name, v.color_id, v.size_id
         from inventory_movements m
         join product_variants v on v.id = m.variant_id
         join products p on p.id = v.product_id
         ${movementWhere} order by m.id desc limit $${params.length}`,
      params,
    );
    return rows.rows;
  });

  app.post<{ Body: { variantId?: string; delta?: number; reason?: string; note?: string; expectedVersion?: string } }>(
    "/api/commerce/admin/inventory/adjustments",
    async (req, reply) => {
      const session = await requirePermission(req, "inventory:adjust");
      const adjustment = await requestAdjustment({
        variantId: String(req.body?.variantId ?? ""),
        delta: Number(req.body?.delta ?? 0),
        reason: String(req.body?.reason ?? "manual"),
        actor: actorOf(session),
        note: req.body?.note,
        expectedVersion: req.body?.expectedVersion,
      });
      return reply.code(201).send({ ok: true, adjustment });
    },
  );

  app.post<{Body:{operation?:string;variantId?:string;acceptedQty?:number;rejectedQty?:number;countedQty?:number;expectedOnHand?:number;expectedVersion?:string;delta?:number;reference?:string;note?:string;idempotencyKey?:string}}>("/api/commerce/admin/inventory/operations", async (req,reply) => {
    const session = await requirePermission(req,"inventory:adjust"); const b = req.body ?? {};
    const variantId = typeof b.variantId === "string" ? b.variantId : "";
    const reference = typeof b.reference === "string" ? b.reference.trim() : "";
    const note = typeof b.note === "string" ? b.note.trim() : "";
    if (!variantId || !reference || reference.length > 150 || note.length > 1000) throw new CommerceError("شناسه کالا و مرجع عملیات معتبر لازم است.",400,"invalid_inventory_operation");
    if (typeof b.idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(b.idempotencyKey)) throw new CommerceError("شناسه درخواست معتبر لازم است.",400,"invalid_operation_key");
    const identity={operationKey:b.idempotencyKey,fingerprint:createHash("sha256").update(JSON.stringify(b)).digest("hex"),requestId:req.id};
    let adjustment;
    if (b.operation === "receive") {
      if (!Number.isSafeInteger(b.acceptedQty) || b.acceptedQty! < 0 || b.acceptedQty! > 1000000 || !Number.isSafeInteger(b.rejectedQty) || b.rejectedQty! < 0 || b.rejectedQty! > 1000000 || (b.acceptedQty === 0 && b.rejectedQty === 0)) throw new CommerceError("تعداد دریافت معتبر نیست.",400,"invalid_receipt");
      adjustment = await requestAdjustment({...identity,variantId,delta:b.acceptedQty!,reason:"receiving",actor:actorOf(session),expectedVersion:b.expectedVersion,note:`مرجع: ${reference}؛ ردشده: ${b.rejectedQty}؛ ${note}`});
    } else if (b.operation === "stocktake") {
      adjustment = await requestStocktake({...identity,variantId,counted:b.countedQty as number,expectedOnHand:b.expectedOnHand as number,expectedVersion:b.expectedVersion as string,actor:actorOf(session),note:`مرجع: ${reference}؛ ${note}`});
    } else if (b.operation === "adjust") {
      if (!note) throw new CommerceError("علت اصلاح لازم است.",400,"invalid_adjustment");
      adjustment = await requestAdjustment({...identity,variantId,delta:b.delta as number,reason:"manual",actor:actorOf(session),expectedVersion:b.expectedVersion,note:`مرجع: ${reference}؛ ${note}`});
    } else throw new CommerceError("نوع عملیات معتبر نیست.",400,"invalid_inventory_operation");
    return reply.code(201).send({ok:true,adjustment});
  });

  app.post<{ Params: { id: string }; Body: { decision?: "approve" | "reject"; note?: string } }>(
    "/api/commerce/admin/inventory/adjustments/:id",
    async (req) => {
      const session = await requirePermission(req, "inventory:approve");
      if (req.body?.decision !== "approve" && req.body?.decision !== "reject") throw new CommerceError("تصمیم معتبر نیست.",400,"invalid_decision");
      const role = await roleForSubject(session.subject);
      const canSelfApprove = (config.panelOpenAccess && session.subject === "review-owner") || role?.roleId === "owner" || role?.roleId === "superadmin";
      const result = await decideAdjustment({id:req.params.id,decision:req.body.decision,actor:actorOf(session),canSelfApprove,note:req.body?.note,requestId:req.id});
      return result;
    },
  );

  app.get("/api/commerce/admin/inventory/adjustments", async (req) => {
    await requirePermission(req, "inventory:view");
    const rows = await query<AdjustmentRow>(
      "select * from inventory_adjustments order by created_at desc limit 200",
    );
    return rows.rows.map(publicAdjustment);
  });

  app.get<{ Querystring: { status?: string } }>("/api/commerce/admin/reservations", async (req) => {
    await requirePermission(req,"inventory:view");
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
    await requirePermission(req,"finance:view");
    const rows = await query<PaymentAttemptRow>(
      `select * from payment_attempts where ($1 = 'all' or status = $1) order by created_at desc limit 200`,
      [req.query.status ?? "all"],
    );
    return rows.rows.map(row=>({...publicAttempt(row),lastError:row.last_error}));
  });

  app.get("/api/commerce/admin/outbox", async (req) => {
    await requirePermission(req,"security:view");
    const rows = await query(
      "select id, type, payload, dedupe_key, status, attempts, last_error, created_at, processed_at from outbox_events order by id desc limit 200",
    );
    return { stats: await outboxStats(), events: rows.rows };
  });

  app.post<{ Body: { limit?: number } }>("/api/commerce/admin/outbox/process", async (req) => {
    await requirePermission(req,"settings:edit");
    return processOutbox(Math.min(100, Number(req.body?.limit ?? 20)));
  });

  /** the worker ticks from a request too, so a serverless deploy still drains */
  app.post("/api/commerce/admin/tick", async (req) => {
    await requirePermission(req,"settings:edit");
    const expired = await expireReservations();
    const attempts = await expirePaymentAttempts();
    const outbox = await processOutbox();
    return { ok: true, expired, attempts, outbox };
  });

  app.post<{ Params: { id: string }; Body: { note?: string } }>(
    "/api/commerce/admin/refunds/:id/receive",
    async (req) => {
      const session = await requirePermission(req, "orders:edit");
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
      const session = await requirePermission(req, "orders:edit");
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

  app.get<{ Querystring: { before?: string; search?: string; status?: string; limit?: string } }>("/api/commerce/admin/refund-page", async (req, reply) => {
    reply.header("cache-control", "private, no-store");
    await requirePermission(req, "orders:view");
    const { before, search = "", status = "all", limit = "40" } = req.query;
    if ((before !== undefined && (typeof before !== "string" || !before || before.length > 200)) || typeof search !== "string" || search.length > 120 || typeof status !== "string" || !["all","requested","approved","rejected","received","qc_passed","qc_failed","settled","manual_review"].includes(status) || typeof limit !== "string" || !/^(?:[1-9]|[1-9][0-9]|100)$/.test(limit)) throw new CommerceError("فیلتر یا نشانگر صفحه معتبر نیست.", 422, "validation_error");
    return listRefundPage({before, search: search.trim(), status, limit: Number(limit)});
  });

  app.get<{ Querystring: { status?: string; orderId?: string } }>("/api/commerce/admin/refunds", async (req) => {
    await requirePermission(req, "orders:view");
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
  }>("/api/commerce/quote", async (req,reply) => {
    reply.header("cache-control","no-store");
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
    const session=await requireCustomerSessionOrNull(req);
    return buildQuote({
      lines,
      customerEmail:session?.subject ?? null,
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
