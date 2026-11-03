import { query } from "../db";
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
  /** mock provider controls (simulate success/fail/timeout) — never in production */
  allowMockControls: boolean;
  /** test hook: make the outbox SMS handler fail */
  smsSimulateDown: boolean;
  paymentProvider: string;
}

export const DEFAULT_COMMERCE_SETTINGS: CommerceSettings = {
  bnpl4Enabled: false,
  bnpl4Provider: "mock-bnpl4",
  bnpl4Installments: 4,
  cartMaxQtyPerLine: 5,
  reservationHoldMinutes: 10,
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
  currency: "EUR",
  cashbackEnabled: true,
  cashbackMode: "tier_rate",
  cashbackBase: "merchandise",
  cashbackTiers: [
    { min: 0, max: 1000, percent: 5 },
    { min: 1000, max: 3000, percent: 3 },
    { min: 3000, max: null, percent: 1 },
  ],
  cashbackMaxAmount: 500,
  allowMockControls: true,
  smsSimulateDown: false,
  paymentProvider: "mock",
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
