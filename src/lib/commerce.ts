import { api } from "./api";

/* =====================================================================
   Storefront client for the commerce core (server-priced checkout).
   The price shown at the end always comes from the server quote; the
   browser only mirrors it.
   ===================================================================== */

export interface CashbackTier {
  min: number;
  max: number | null;
  percent: number;
}

export interface CashbackQuote {
  enabled: boolean;
  mode: "tier_rate" | "marginal";
  base: number;
  percent: number;
  amount: number;
  tier: CashbackTier | null;
  note: string;
}

export interface CashbackWallet {
  email: string | null;
  balance: number;
  earned: number;
  reversed: number;
  transactions: {
    id: string;
    orderId: string | null;
    kind: "earn" | "reversal";
    baseAmount: number;
    percent: number;
    amount: number;
    note: string | null;
    at: string;
  }[];
  admin?: boolean;
}

export interface CommerceConfig {
  currency: string;
  bnpl4: { enabled: boolean; installments: number; provider: string; scope: "store" };
  cartMaxQtyPerLine: number;
  reservationHoldMinutes: number;
  paymentWindowMinutes: number;
  shipping: { flat: number; express: number; freeThreshold: number; thresholdBasis: "after_discount" | "before_discount" };
  paymentProvider: string;
  mockControls: boolean;
  cashback: {
    enabled: boolean;
    mode: "tier_rate" | "marginal";
    base: "merchandise" | "grand_total";
    tiers: CashbackTier[];
    maxAmount: number;
  };
}

export interface CommerceItem {
  productId: string;
  colorId: string;
  sizeId: string;
  quantity: number;
}

export interface ServerQuoteLine {
  variantId: string;
  productId: string;
  sku: string;
  name: string;
  colorId: string;
  colorName: string;
  sizeId: string;
  sizeLabel: string;
  unitPrice: number;
  quantity: number;
  discountAmount: number;
  lineTotal: number;
  campaignId: string | null;
  campaignName: string | null;
}

export interface ServerQuote {
  lines: ServerQuoteLine[];
  subtotal: number;
  discounts: { id: string; name: string; kind: string; amount: number; source: "campaign" | "coupon" }[];
  campaignDiscount: number;
  couponCode: string | null;
  couponDiscount: number;
  discountTotal: number;
  shippingMethod: "standard" | "express";
  shippingBase: number;
  shippingTotal: number;
  freeShipping: boolean;
  freeShippingBy: "threshold" | "campaign" | null;
  taxTotal: number;
  grandTotal: number;
  currency: string;
  installments: { method: "online" | "bnpl4"; label: string; perInstallment: number }[];
  cashback: CashbackQuote;
  quoteVersion: string;
  expiresAt: string;
}

export interface CheckoutPayload {
  items: CommerceItem[];
  address: {
    receiver?: string;
    phone?: string;
    province?: string;
    city?: string;
    street?: string;
    postal?: string;
    note?: string;
  };
  shippingMethod: "standard" | "express";
  couponCode?: string;
  idempotencyKey?: string;
}

export interface StartPaymentResult {
  attempt: { id: string; amount: number; method: "online" | "bnpl4"; status: string };
  payment: { redirectUrl: string | null; instructions?: string; mock?: boolean } | null;
  alreadySettled?: boolean;
  reused?: boolean;
}

export interface SettleResult {
  ok?: boolean;
  status: "settled" | "pending_verification" | "failed" | "exception";
  orderId?: string;
  orderStatus?: string;
  total?: number;
  message?: string;
  late?: boolean;
  duplicate?: boolean;
  cashback?: { amount: number; percent: number; base: number; note: string } | null;
}

export const commerce = {
  config: () => api.get<CommerceConfig>("/api/commerce/config"),
  quote: (items: CommerceItem[], opts: { couponCode?: string; shippingMethod?: "standard" | "express" } = {}) =>
    api.post<ServerQuote>("/api/commerce/quote", { items, ...opts }),
  checkout: (payload: CheckoutPayload) =>
    api.post<{ checkout: { id: string; quote: ServerQuote; reservationExpiresAt: string; status: string } }>(
      "/api/commerce/checkout",
      payload,
    ),
  pay: (checkoutId: string, method: "online" | "bnpl4", idempotencyKey: string) =>
    api.post<StartPaymentResult>(`/api/commerce/checkout/${checkoutId}/pay`, { method, idempotencyKey }),
  simulate: (attemptId: string, result: "success" | "fail" | "timeout" | "reject") =>
    api.post<SettleResult>(`/api/commerce/payments/${attemptId}/simulate`, { result }),
  cashback: () => api.get<CashbackWallet>("/api/commerce/cashback"),
};

export interface Shortage {
  variantId: string;
  requested: number;
  available: number;
}
