import { createHash } from "node:crypto";
import { query } from "../db";
import { computeCashback, type CashbackResult } from "./cashback";
import { CommerceError } from "./errors";
import type { CommerceSettings } from "./settings";

/* =====================================================================
   Pricing engine — the browser never decides a price.

   The quote is computed here from the catalogue, the active campaigns,
   the coupon and the store settings, then stored with a version hash.
   When the customer pays, the version is recomputed: if anything changed
   the payment is refused and the cart has to be re-quoted.
   ===================================================================== */

export interface QuoteInputLine {
  variantId: string;
  productId: string;
  sku: string;
  name: string;
  colorId: string;
  colorName: string;
  sizeId: string;
  sizeLabel: string;
  lookId: string | null;
  category: string;
  unitPrice: number;
  quantity: number;
}

export interface QuoteLine extends QuoteInputLine {
  discountAmount: number;
  campaignId: string | null;
  campaignName: string | null;
  lineTotal: number;
}

export interface QuoteDiscount {
  id: string;
  name: string;
  kind: string;
  amount: number;
  source: "campaign" | "coupon";
}

export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  discounts: QuoteDiscount[];
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
  /** tiered cashback this basket would earn when paid */
  cashback: CashbackResult;
  quoteVersion: string;
  expiresAt: string;
}

interface RuleRow {
  id: string;
  name: string;
  kind: string;
  value: string | number;
  scope: string;
  scope_id: string | null;
  min_subtotal: string | number;
  max_discount: string | null;
  priority: number;
  stackable: boolean;
  active: boolean;
  updated_at: Date;
}

export const round2 = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function quoteVersionFor(input: {
  lines: { variantId: string; unitPrice: number; quantity: number }[];
  rules: { id: string; updated_at: Date | string; value: string | number; priority: number }[];
  coupon: { code: string; value: string | number; kind: string } | null;
  shippingMethod: string;
  settings: CommerceSettings;
}) {
  const payload = {
    lines: input.lines.map((l) => [l.variantId, round2(l.unitPrice), l.quantity]),
    rules: input.rules.map((r) => [r.id, String(r.updated_at), Number(r.value), r.priority]),
    coupon: input.coupon ? [input.coupon.code, Number(input.coupon.value), input.coupon.kind] : null,
    shipping: [
      input.shippingMethod,
      input.settings.shippingFlat,
      input.settings.shippingExpress,
      input.settings.freeShippingThreshold,
      input.settings.shippingThresholdBasis,
      input.settings.taxRate,
      input.settings.discountStacking,
    ],
  };
  return createHash("sha1").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

const scopeMatches = (rule: RuleRow, line: QuoteInputLine) => {
  if (rule.scope === "category") return rule.scope_id === line.category;
  if (rule.scope === "product") return rule.scope_id === line.productId;
  if (rule.scope === "look") return !!line.lookId && rule.scope_id === line.lookId;
  return true;
};

export async function buildQuote(params: {
  lines: QuoteInputLine[];
  couponCode?: string | null;
  shippingMethod: "standard" | "express";
  settings: CommerceSettings;
  now?: Date;
}): Promise<Quote> {
  const { lines, shippingMethod, settings } = params;
  if (!lines.length) throw new CommerceError("سبد خرید خالی است.", 400, "empty_cart");
  const now = params.now ?? new Date();

  const rulesRes = await query<RuleRow>(
    `select id, name, kind, value, scope, scope_id, min_subtotal, max_discount, priority, stackable, active, updated_at
       from price_rules
      where active
        and (starts_at is null or starts_at <= now())
        and (ends_at is null or ends_at >= now())
      order by priority desc, created_at asc, id asc`,
  );
  const rules = rulesRes.rows;

  const subtotal = round2(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
  const eligible = rules.filter((rule) => Number(rule.min_subtotal) <= subtotal);

  // one campaign per line, chosen by priority → age → id (never by size of discount)
  const discounts: QuoteDiscount[] = [];
  const quoteLines: QuoteLine[] = lines.map((line) => {
    const rule = eligible.find((candidate) => candidate.kind !== "freeship" && scopeMatches(candidate, line));
    let amount = 0;
    if (rule) {
      const value = Number(rule.value);
      if (rule.kind === "percent") amount = round2((line.unitPrice * line.quantity * value) / 100);
      else if (rule.kind === "amount") amount = round2(Math.min(line.unitPrice * line.quantity, value));
      // the campaign ceiling is a hard cap the panel sets (decision 33)
      const cap = rule.max_discount === null ? null : Number(rule.max_discount);
      if (cap !== null && cap > 0) amount = round2(Math.min(amount, cap));
      amount = round2(Math.min(amount, line.unitPrice * line.quantity));
    }
    if (rule && amount > 0) {
      discounts.push({
        id: rule.id,
        name: rule.name,
        kind: rule.kind,
        amount,
        source: "campaign",
      });
    }
    return {
      ...line,
      discountAmount: amount,
      campaignId: rule && amount > 0 ? rule.id : null,
      campaignName: rule && amount > 0 ? rule.name : null,
      lineTotal: round2(line.unitPrice * line.quantity - amount),
    };
  });

  const campaignDiscount = round2(discounts.reduce((sum, d) => sum + d.amount, 0));

  /* ---------- coupon: checkout only, never stacked implicitly ---------- */
  const code = (params.couponCode ?? "").trim().toUpperCase();
  let couponDiscount = 0;
  let couponRow: { code: string; kind: string; value: string | number; combinable: boolean } | null = null;
  if (code) {
    const res = await query<{
      code: string;
      kind: string;
      value: string;
      min_subtotal: string;
      combinable: boolean;
      usage_limit: number | null;
      used_count: number;
      max_discount: string | null;
      expired: boolean;
      started: boolean;
    }>(
      `select code, kind, value, min_subtotal, combinable, usage_limit, used_count, max_discount,
              (ends_at is not null and ends_at < now()) as expired,
              (starts_at is not null and starts_at > now()) as started
         from coupons where code = $1 and active`,
      [code],
    );
    const coupon = res.rows[0];
    if (!coupon) throw new CommerceError("کد تخفیف معتبر نیست.", 400, "coupon_invalid");
    if (coupon.expired) throw new CommerceError("این کد تخفیف منقضی شده است.", 400, "coupon_expired");
    if (coupon.started) throw new CommerceError("این کد تخفیف هنوز فعال نشده است.", 400, "coupon_not_started");
    if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) {
      throw new CommerceError("ظرفیت استفاده از این کد تخفیف تمام شده است.", 400, "coupon_exhausted");
    }
    // the minimum is compared against the same base the discount is applied to,
    // otherwise a running campaign and the coupon disagree about the basket value
    const couponBase = round2(Math.max(0, subtotal - campaignDiscount));
    if (couponBase < Number(coupon.min_subtotal)) {
      throw new CommerceError(
        `این کد برای خرید بالای ${Number(coupon.min_subtotal).toLocaleString("fa-IR")} فعال است.`,
        400,
        "coupon_min_subtotal",
      );
    }

    const stackableCampaign = eligible.some((rule) => rule.kind !== "freeship" && rule.stackable);
    const canStack =
      settings.discountStacking === "explicit" && coupon.combinable && stackableCampaign && campaignDiscount > 0;
    if (campaignDiscount > 0 && settings.discountStacking === "none") {
      throw new CommerceError(
        "این کد تخفیف با کمپین فعال فروشگاه قابل ترکیب نیست؛ یا کد را بردار یا بعد از پایان کمپین امتحان کن.",
        409,
        "coupon_not_combinable",
      );
    }
    if (campaignDiscount > 0 && !canStack) {
      throw new CommerceError(
        "کد تخفیف و کمپین هم‌زمان قابل اعمال نیستند (قانون عدم ترکیب تخفیف‌ها).",
        409,
        "coupon_not_combinable",
      );
    }

    const value = Number(coupon.value);
    const maxDiscount = coupon.max_discount === null ? null : Number(coupon.max_discount);
    couponDiscount =
      coupon.kind === "percent"
        ? round2((couponBase * Math.min(100, Math.max(0, value))) / 100)
        : round2(Math.min(value, couponBase));
    if (maxDiscount !== null && couponDiscount > maxDiscount) couponDiscount = round2(maxDiscount);
    couponDiscount = round2(Math.min(couponBase, Math.max(0, couponDiscount)));
    if (couponDiscount > 0) {
      discounts.push({ id: code, name: `کد تخفیف ${code}`, kind: coupon.kind, amount: couponDiscount, source: "coupon" });
    }
    couponRow = { code, kind: coupon.kind, value: coupon.value, combinable: coupon.combinable };
  }

  const discountTotal = round2(campaignDiscount + couponDiscount);
  const afterDiscount = round2(Math.max(0, subtotal - discountTotal));

  /* ---------- shipping: one shipment, one fee; threshold after discounts ---------- */
  const shippingBase = round2(shippingMethod === "express" ? settings.shippingExpress : settings.shippingFlat);
  const freeshipCampaign = eligible.some(
    (rule) => rule.kind === "freeship" && lines.some((line) => scopeMatches(rule, line)),
  );
  const threshold = Number(settings.freeShippingThreshold) || 0;
  const thresholdBasis = settings.shippingThresholdBasis === "before_discount" ? subtotal : afterDiscount;
  const thresholdMet = threshold > 0 && thresholdBasis >= threshold;
  const freeShipping = freeshipCampaign || thresholdMet;
  const shippingTotal = freeShipping ? 0 : shippingBase;

  const taxTotal = round2(afterDiscount * (Number(settings.taxRate) || 0));
  const grandTotal = round2(afterDiscount + shippingTotal + taxTotal);

  const installments: Quote["installments"] = [{ method: "online", label: "پرداخت آنلاین", perInstallment: grandTotal }];
  if (settings.bnpl4Enabled) {
    installments.push({
      method: "bnpl4",
      label: `پرداخت ${settings.bnpl4Installments} قسطی`,
      perInstallment: round2(grandTotal / Math.max(1, settings.bnpl4Installments)),
    });
  }

  // cashback is a function of the basket value; the rate comes from the tier
  // that contains that value (see commerce/cashback.ts)
  const cashbackBase = settings.cashbackBase === "grand_total" ? grandTotal : afterDiscount;
  const cashback = computeCashback(cashbackBase, settings);

  const quoteVersion = quoteVersionFor({
    lines: quoteLines.map((l) => ({ variantId: l.variantId, unitPrice: l.unitPrice, quantity: l.quantity })),
    rules: eligible,
    coupon: couponRow,
    shippingMethod,
    settings,
  });

  return {
    lines: quoteLines,
    subtotal,
    discounts,
    campaignDiscount,
    couponCode: couponRow?.code ?? null,
    couponDiscount,
    discountTotal,
    shippingMethod,
    shippingBase,
    shippingTotal,
    freeShipping,
    freeShippingBy: freeshipCampaign ? "campaign" : thresholdMet ? "threshold" : null,
    taxTotal,
    grandTotal,
    currency: settings.currency,
    installments,
    cashback,
    quoteVersion,
    expiresAt: new Date(now.getTime() + settings.quoteTtlMinutes * 60_000).toISOString(),
  };
}
