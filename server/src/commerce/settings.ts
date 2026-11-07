import { query } from "../db";
import type { PoolClient } from "pg";
import { getDocument } from "../seed";

/* =====================================================================
   Commerce settings — every value the PRD left open is a stored setting
   instead of a hard-coded constant, so the owner can change it without a
   deploy and agents never invent product policy.

   Defaults follow what large storefronts actually do:
   - Stock is reserved when the buyer *enters checkout*, never on add-to-
     cart, and the hold is short (Shopify-style ~10 minutes). A cart can
     therefore contain an item someone else buys first.
   - The free-shipping threshold is evaluated on the subtotal **after**
     discounts and before shipping/tax (Barnes & Noble, eBay and most
     Shopify/WooCommerce stores do the same).
   - Discounts do not stack unless both sides opt in (fail-closed).
   ===================================================================== */

/** one cashback bracket: `min <= amount < max` (max = null means "and above") */
export interface CashbackTier {
  min: number;
  max: number | null;
  percent: number;
}

export interface CommerceSettings {
  /** the 4-installment gateway is a single store-wide switch (OWN-05 revision) */
  bnpl4Enabled: boolean;
  /**
   * Provider readiness is a separate fact from the store switch: a real
   * installment contract (limits, fees, credit check) must be confirmed before
   * the switch may be turned on. Enabling without it is refused.
   */
  bnpl4ProviderReady: boolean;
  bnpl4Provider: string;
  bnpl4Installments: number;
  /** ceiling safety net; the provider still decides per order */
  cartMaxQtyPerLine: number;
  /** how long stock is held once checkout starts */
  reservationHoldMinutes: number;
  /** how long a payment attempt stays valid (independent of the hold) */
  paymentWindowMinutes: number;
  /** how long a price quote is considered fresh */
  quoteTtlMinutes: number;
  shippingFlat: number;
  shippingExpress: number;
  freeShippingThreshold: number;
  shippingThresholdBasis: "after_discount" | "before_discount";
  discountStacking: "none" | "explicit";
  /** live money movement stays blocked until the owner turns it on */
  liveRefundsEnabled: boolean;
  /** session subjects allowed to approve a financial refund */
  superadmins: string[];
  taxRate: number;
  currency: string;
  /**
   * Tiered cashback. `tier_rate` applies the bracket's rate to the whole
   * basket (the rule the owner asked for: up to X → 5%, up to Y → 3%, …);
   * `marginal` applies each rate only to the slice inside its bracket.
   */
  cashbackEnabled: boolean;
  cashbackMode: "tier_rate" | "marginal";
  /** cashback is earned on the discounted goods value, not on shipping */
  cashbackBase: "merchandise" | "grand_total";
  cashbackTiers: CashbackTier[];
  /** safety cap so a misconfigured bracket cannot pay out a fortune */
  cashbackMaxAmount: number;
  /**
   * Cashback financial policy (owner decision 2026-11-04):
   * - earned money is held until the order is delivered (+ a return window),
   *   so "earn → return the goods" can never pay out real cash;
   * - it can only be spent on a LATER order (never on the one that earned it);
   * - it expires, and a single order can only be partly paid with it.
   */
  cashbackCreditTiming: "on_payment" | "on_delivery" | "after_return_window";
  /** days after delivery before the balance becomes spendable */
  cashbackHoldDays: number;
  /** months of validity after the balance becomes spendable (0 = never expires) */
  cashbackExpiryMonths: number;
  cashbackRedeemEnabled: boolean;
  /** at most this share of the goods value can be paid from the wallet */
  cashbackRedeemMaxPercent: number;
  /** wallet + coupon/campaign on the same order is allowed by default */
  cashbackCombineWithDiscounts: boolean;
  /** mock provider controls (simulate success/fail/timeout) — never in production */
  allowMockControls: boolean;
  /** test hook: make the outbox SMS handler fail */
  smsSimulateDown: boolean;
  paymentProvider: string;
  /** HMAC secret for provider callbacks (never rendered to the admin panel) */
  providerWebhookSecret: string;
  /** reject unsigned provider callbacks (default on) */
  requireCallbackSignature: boolean;
}

export const DEFAULT_COMMERCE_SETTINGS: CommerceSettings = {
  bnpl4Enabled: false,
  bnpl4ProviderReady: false,
  bnpl4Provider: "mock-bnpl4",
  bnpl4Installments: 4,
  cartMaxQtyPerLine: 5,
  reservationHoldMinutes: 15,
  paymentWindowMinutes: 15,
  quoteTtlMinutes: 10,
  shippingFlat: 12,
  shippingExpress: 25,
  freeShippingThreshold: 200,
  shippingThresholdBasis: "after_discount",
  discountStacking: "none",
  liveRefundsEnabled: false,
  superadmins: ["superadmin"],
  taxRate: 0,
  currency: "IRT",
  cashbackEnabled: true,
  cashbackMode: "tier_rate",
  cashbackBase: "merchandise",
  /**
   * The owner's ladder (2026-11-05): bigger basket, bigger rate —
   * ۱ میلیون تومان ⇒ ۳٪ and ۲ میلیون تومان ⇒ ۵٪. Prices are stored in units of
   * 1,000 Toman, so 1000 units is the one-million bracket. The last row is open.
   */
  cashbackTiers: [
    { min: 0, max: 1000, percent: 1 },
    { min: 1000, max: 2000, percent: 3 },
    { min: 2000, max: null, percent: 5 },
  ],
  cashbackMaxAmount: 500,
  cashbackCreditTiming: "after_return_window",
  cashbackHoldDays: 7,
  cashbackExpiryMonths: 12,
  cashbackRedeemEnabled: true,
  cashbackRedeemMaxPercent: 50,
  cashbackCombineWithDiscounts: true,
  allowMockControls: true,
  smsSimulateDown: false,
  paymentProvider: "mock",
  providerWebhookSecret: "dev-webhook-secret",
  requireCallbackSignature: true,
};

const SETTINGS_KEY = "commerce";

let cache: { value: CommerceSettings; at: number } | null = null;

export async function loadCommerceSettings(force = false): Promise<CommerceSettings> {
  if (!force && cache && Date.now() - cache.at < 1500) return cache.value;
  const res = await query<{ value: Partial<CommerceSettings> }>(
    "select value from commerce_settings where key = $1",
    [SETTINGS_KEY],
  );
  const value = { ...DEFAULT_COMMERCE_SETTINGS, ...(res.rows[0]?.value ?? {}) };
  cache = { value, at: Date.now() };
  return value;
}

/** For financial commitments, read settings within the same MVCC snapshot as
 * promotions, prices and customer eligibility; bypass the UI cache. */
export async function loadCommerceSettingsSnapshot(client:PoolClient):Promise<CommerceSettings> {
  const res=await client.query<{value:Partial<CommerceSettings>}>("select value from commerce_settings where key=$1",[SETTINGS_KEY]);
  return {...DEFAULT_COMMERCE_SETTINGS,...(res.rows[0]?.value ?? {})};
}

export function invalidateCommerceSettings() {
  cache = null;
}

export async function saveCommerceSettings(patch: Partial<CommerceSettings>): Promise<CommerceSettings> {
  const current = await loadCommerceSettings(true);
  const next: CommerceSettings = { ...current, ...patch };
  // the mock provider is the only one shipped; do not let a settings write
  // disable the safety rails of a real deployment
  await query(
    `insert into commerce_settings (key, value, updated_at) values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [SETTINGS_KEY, JSON.stringify(next)],
  );
  cache = { value: next, at: Date.now() };
  return next;
}

/** first boot: seed the store's shipping numbers from the existing admin document */
export async function ensureCommerceSettings() {
  const existing = await query("select 1 from commerce_settings where key = $1", [SETTINGS_KEY]);
  if (existing.rowCount) {
    await loadCommerceSettings(true);
    return loadCommerceSettings(true);
  }

  const admin = (await getDocument<Record<string, any>>("admin")) ?? {};
  const store = admin.settings ?? {};
  const initial: CommerceSettings = {
    ...DEFAULT_COMMERCE_SETTINGS,
    shippingFlat: Number.isFinite(Number(store.standardCost)) ? Number(store.standardCost) : DEFAULT_COMMERCE_SETTINGS.shippingFlat,
    shippingExpress: Number.isFinite(Number(store.expressCost)) ? Number(store.expressCost) : DEFAULT_COMMERCE_SETTINGS.shippingExpress,
    freeShippingThreshold: Number.isFinite(Number(store.freeShipping))
      ? Number(store.freeShipping)
      : DEFAULT_COMMERCE_SETTINGS.freeShippingThreshold,
  };
  await query(
    "insert into commerce_settings (key, value) values ($1, $2) on conflict (key) do nothing",
    [SETTINGS_KEY, JSON.stringify(initial)],
  );
  return loadCommerceSettings(true);
}
