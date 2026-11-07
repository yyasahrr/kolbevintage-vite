import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { withTransaction } from "../db";
import { customerLabelContext } from "../routes/customer-labels";
import { labelAudience, matchesLabelAudience } from "./audiences";
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
  free_shipping: boolean;
  audience: unknown;
  updated_at: Date;
}

export const round2 = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function quoteVersionFor(input: {
  lines: { variantId: string; unitPrice: number; quantity: number }[];
  rules: { id: string; updated_at: Date | string; value: string | number; priority: number; free_shipping?: boolean }[];
  coupon: { code: string; value: string | number; kind: string } | null;
  shippingMethod: string;
  settings: CommerceSettings;
  outcome?: unknown;
}) {
  const payload = {
    lines: input.lines.map((l) => [l.variantId, round2(l.unitPrice), l.quantity]),
    rules: input.rules.map((r) => [r.id, r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at), Number(r.value), r.priority, r.free_shipping ?? false]),
    coupon: input.coupon ? [input.coupon.code, Number(input.coupon.value), input.coupon.kind] : null,
    outcome: input.outcome ?? null,
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
  return rule.scope === "all";
};

export async function buildQuote(params: {
  lines: QuoteInputLine[];
  couponCode?: string | null;
  shippingMethod: "standard" | "express";
  settings: CommerceSettings;
  now?: Date;
  customerEmail?: string | null;
}, client?:PoolClient): Promise<Quote> {
  if (!client) return withTransaction(async tx=>{
    await tx.query("set transaction isolation level repeatable read read only");
    return buildQuote(params,tx);
  });
  const run=client.query.bind(client);
  const { lines, shippingMethod, settings } = params;
  if (!lines.length) throw new CommerceError("سبد خرید خالی است.", 400, "empty_cart");
  const now = params.now ?? new Date();

  const rulesRes = await run<RuleRow>(
    `select id, name, kind, value, scope, scope_id, min_subtotal, max_discount, priority, stackable, active, free_shipping, audience, updated_at
       from price_rules
      where active
        and (starts_at is null or starts_at <= now())
        and (ends_at is null or ends_at >= now())
      order by priority desc, created_at asc, id asc`,
  );
  const targeted=rulesRes.rows.some(rule=>rule.audience !== null);
  const context=targeted ? await customerLabelContext(client,params.customerEmail) : {defined:[],actual:[]};
  const rules=rulesRes.rows.filter(rule=>{
    if(rule.audience === null) return true;
    try { return matchesLabelAudience(labelAudience(rule.audience),context.actual,context.defined); }
    catch { return false; }
  });

  const subtotal = round2(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
  const eligible = rules.filter((rule) => Number(rule.min_subtotal) <= subtotal);

  // One monetary promotion per order: compare each whole-basket campaign
  // against the coupon. Campaign caps apply once, not once per line.
  // Ties keep the earlier campaign in SQL's stable priority/age/id order;
  // an equal coupon does not consume capacity unnecessarily.
  const monetary = eligible.filter(rule => ["percent","amount"].includes(rule.kind));
  let best: {rule:RuleRow;amount:number;indices:number[]} | null = null;
  for (const rule of monetary) {
    const indices=lines.map((line,index)=>scopeMatches(rule,line)?index:-1).filter(index=>index>=0);
    const base=round2(indices.reduce((sum,index)=>sum+lines[index].unitPrice*lines[index].quantity,0));
    let amount=rule.kind === "percent" ? round2(base*Math.min(100,Math.max(0,Number(rule.value)))/100) : round2(Math.min(base,Math.max(0,Number(rule.value))));
    if (rule.max_discount !== null && Number(rule.max_discount)>0) amount=Math.min(amount,Number(rule.max_discount));
    amount=round2(Math.min(base,Math.max(0,amount)));
    if (amount>0 && (!best || amount>best.amount)) best={rule,amount,indices};
  }
  const code = (params.couponCode ?? "").trim().toUpperCase();
  let couponCandidate = 0;
  let couponRow: { code: string; kind: string; value: string | number; combinable: boolean } | null = null;
  if (code) {
    const res = await run<{
      code:string;kind:string;value:string;min_subtotal:string;combinable:boolean;usage_limit:number|null;used_count:number;max_discount:string|null;expired:boolean;started:boolean;
    }>(`select code,kind,value,min_subtotal,combinable,usage_limit,used_count,max_discount,
              (ends_at is not null and ends_at < now()) as expired,
              (starts_at is not null and starts_at > now()) as started
         from coupons where code=$1 and active`,[code]);
    const coupon=res.rows[0];
    if (!coupon) throw new CommerceError("کد تخفیف معتبر نیست.",400,"coupon_invalid");
    if (coupon.expired) throw new CommerceError("این کد تخفیف منقضی شده است.",400,"coupon_expired");
    if (coupon.started) throw new CommerceError("این کد تخفیف هنوز فعال نشده است.",400,"coupon_not_started");
    if (coupon.usage_limit !== null && coupon.used_count >= coupon.usage_limit) throw new CommerceError("ظرفیت استفاده از این کد تخفیف تمام شده است.",400,"coupon_exhausted");
    if (subtotal < Number(coupon.min_subtotal)) throw new CommerceError(`این کد برای خرید بالای ${Number(coupon.min_subtotal).toLocaleString("fa-IR")} فعال است.`,400,"coupon_min_subtotal");
    const value=Number(coupon.value);
    couponCandidate=coupon.kind === "percent" ? round2(subtotal*Math.min(100,Math.max(0,value))/100) : round2(Math.min(Math.max(0,value),subtotal));
    if(coupon.max_discount!==null)couponCandidate=Math.min(couponCandidate,Number(coupon.max_discount));
    couponCandidate=round2(Math.max(0,Math.min(subtotal,couponCandidate)));
    couponRow={code,kind:coupon.kind,value:coupon.value,combinable:coupon.combinable};
  }
  const couponWins=couponCandidate>0 && couponCandidate>(best?.amount ?? 0);
  const campaignDiscount=couponWins ? 0 : best?.amount ?? 0;
  const couponDiscount=couponWins ? couponCandidate : 0;
  const winnerAmount=couponWins ? couponDiscount : campaignDiscount;
  const winnerIndices=couponWins ? lines.map((_,index)=>index) : best?.indices ?? [];
  // Distribute the chosen order-wide reduction over eligible line snapshots in
  // integer cents, preserving exact totals for later per-line refunds.
  const cents=BigInt(Math.round(winnerAmount*100));
  const weights=winnerIndices.map(index=>BigInt(Math.round(lines[index].unitPrice*lines[index].quantity*100)));
  const totalWeight=weights.reduce((a,b)=>a+b,0n);
  const shares=weights.map(weight=>totalWeight>0n ? cents*weight/totalWeight : 0n);
  let leftover=cents-shares.reduce((a,b)=>a+b,0n);
  const ranked=weights.map((weight,index)=>({index,remainder:totalWeight>0n ? (cents*weight)%totalWeight : 0n})).sort((a,b)=>a.remainder===b.remainder ? a.index-b.index : a.remainder>b.remainder ? -1 : 1);
  for(const entry of ranked) {if(leftover<=0n)break;shares[entry.index]++;leftover--;}
  const allocated=new Map(winnerIndices.map((index,i)=>[index,Number(shares[i])/100]));
  const quoteLines:QuoteLine[]=lines.map((line,index)=>{
    const amount=allocated.get(index) ?? 0;
    return {...line,discountAmount:amount,campaignId:!couponWins && amount>0 ? best?.rule.id ?? null : null,campaignName:!couponWins && amount>0 ? best?.rule.name ?? null : null,lineTotal:round2(line.unitPrice*line.quantity-amount)};
  });
  const discounts:QuoteDiscount[]=couponWins && couponRow ? [{id:couponRow.code,name:`کد تخفیف ${couponRow.code}`,kind:couponRow.kind,amount:couponDiscount,source:"coupon"}] : best && campaignDiscount>0 ? [{id:best.rule.id,name:best.rule.name,kind:best.rule.kind,amount:campaignDiscount,source:"campaign"}] : [];

  const discountTotal = round2(campaignDiscount + couponDiscount);
  const afterDiscount = round2(Math.max(0, subtotal - discountTotal));

  /* ---------- shipping: one shipment, one fee; threshold after discounts ---------- */
  const shippingBase = round2(shippingMethod === "express" ? settings.shippingExpress : settings.shippingFlat);
  const freeshipCampaign = eligible.some(
    (rule) => (rule.kind === "freeship" || rule.free_shipping) && lines.some((line) => scopeMatches(rule, line)),
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
    outcome: {discounts, shippingTotal, grandTotal, freeShippingBy:freeshipCampaign ? "campaign" : thresholdMet ? "threshold" : null,
      cashback, installments, lineDiscounts:quoteLines.map(l=>l.discountAmount)},
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
