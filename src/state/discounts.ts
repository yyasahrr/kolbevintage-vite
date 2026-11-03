import { getAdmin, type Campaign, type Scope } from "./admin";
import { liveCatalog } from "@/data/catalog";

/* =====================================================================
   Discount engine — the single place where cart discounts are computed.
   Storefront (cart drawer, checkout, product badges, header banner) and
   the admin preview all read from here, so campaigns and rules always
   agree with what the customer pays.
   ===================================================================== */

export interface CartLineLite {
  productId: string;
  name: string;
  price: number;
  qty: number;
}

export interface AppliedDiscount {
  id: string;
  name: string;
  kind: string;
  amount: number;
  note: string;
  freeship?: boolean;
}

export interface DiscountResult {
  applied: AppliedDiscount[];
  discountTotal: number;
  freeship: boolean;
  freeshipThreshold: number;
  subtotal: number;
  afterDiscount: number;
}

const today = () => new Date().toISOString().slice(0, 10);

export function campaignActive(c: Campaign): boolean {
  if (!c.active) return false;
  const t = today();
  if (c.start && t < c.start) return false;
  if (c.end && t > c.end) return false;
  return true;
}

export function campaignByCode(code: string): Campaign | undefined {
  const c = code.trim().toUpperCase();
  if (!c) return undefined;
  return getAdmin().campaigns.find((x) => x.code?.toUpperCase() === c && campaignActive(x));
}

export function daysLeft(c: Campaign): number {
  if (!c.end) return Infinity;
  const d = Math.ceil((new Date(c.end).getTime() - Date.now()) / 86400000);
  return Math.max(0, d);
}

/** the banner campaign shown on the storefront header, if any */
export function bannerCampaign(): Campaign | undefined {
  return getAdmin().campaigns.find((c) => campaignActive(c) && c.banner?.active);
}

/** any campaign whose scope covers this product (for the product badge) */
export function campaignForProduct(product: { category: string; lookId: string }): Campaign | undefined {
  const c = getAdmin().campaigns.find((x) => {
    if (!campaignActive(x)) return false;
    if (x.scope === "category") return x.scopeId === product.category;
    if (x.scope === "look") return x.scopeId === product.lookId;
    return true;
  });
  return c && c.kind !== "freeship" ? c : undefined;
}

const scopeMatches = (product: { category: string; lookId: string }, scope: Scope, scopeId?: string) => {
  if (scope === "category") return scopeId === product.category;
  if (scope === "look") return scopeId === product.lookId;
  return true;
};

/**
 * Compute every discount that applies to a set of lines.
 * `code` forces a campaign/coupon code; without it the best non-stackable
 * candidate plus all stackable rules are applied.
 */
export function computeDiscounts(lines: CartLineLite[], code?: string): DiscountResult {
  const admin = getAdmin();
  const products = liveCatalog();
  const enriched = lines.map((l) => ({ ...l, product: products.find((p) => p.id === l.productId) }));
  const subtotal = enriched.reduce((n, l) => n + l.price * l.qty, 0);
  const fsThreshold = admin.settings.freeShipping;

  const eligible = (scope: Scope, scopeId?: string) =>
    enriched.filter((l) => (l.product ? scopeMatches(l.product, scope, scopeId) : scope === "all"));
  const eligibleSub = (scope: Scope, scopeId?: string) => eligible(scope, scopeId).reduce((n, l) => n + l.price * l.qty, 0);
  const eligibleCount = (scope: Scope, scopeId?: string) => eligible(scope, scopeId).reduce((n, l) => n + l.qty, 0);

  const candidates: (AppliedDiscount & { stackable: boolean })[] = [];

  /* ---- campaigns (and coded coupons live here) ---- */
  const wantedCode = code?.trim().toUpperCase();
  for (const c of admin.campaigns) {
    if (!campaignActive(c)) continue;
    if (wantedCode && c.code?.toUpperCase() !== wantedCode) continue;
    if (wantedCode && !c.code) continue; // a code was entered: only coded campaigns/coupons
    const sub = eligibleSub(c.scope, c.scopeId);
    if (c.minSpend && sub < c.minSpend) continue;
    if (c.kind === "freeship") {
      candidates.push({
        id: `cmp-${c.id}`,
        name: c.name,
        kind: "freeship",
        amount: 0,
        note: `ارسال رایگان در «${c.name}»`,
        freeship: true,
        stackable: true,
      });
      continue;
    }
    const amount = c.kind === "percent" ? Math.round((sub * c.value) / 100) : c.value;
    if (amount <= 0) continue;
    candidates.push({
      id: `cmp-${c.id}`,
      name: c.name,
      kind: c.kind === "percent" ? "percent" : "fixed",
      amount,
      note:
        c.kind === "percent"
          ? `${c.value.toLocaleString("fa-IR")}٪ تخفیف${c.minSpend ? ` با خرید بالای ${c.minSpend.toLocaleString("fa-IR")} یورو` : ""}`
          : `${c.value.toLocaleString("fa-IR")} یورو تخفیف${c.minSpend ? ` با خرید بالای ${c.minSpend.toLocaleString("fa-IR")} یورو` : ""}`,
      stackable: false,
    });
  }

  /* ---- plain coupon codes (from the codes tab) ---- */
  if (wantedCode) {
    const cp = admin.coupons.find((c) => c.code.toUpperCase() === wantedCode && c.active && (!c.expires || c.expires >= today()));
    if (cp) {
      const sub = subtotal;
      if (cp.minSpend && sub < cp.minSpend) {
        return { applied: [], discountTotal: 0, freeship: false, freeshipThreshold: fsThreshold, subtotal, afterDiscount: subtotal, couponError: `حداقل خرید برای این کد ${cp.minSpend.toLocaleString("fa-IR")} یورو است.` } as DiscountResult & { couponError: string };
      }
      const amount = cp.kind === "percent" ? Math.round((sub * cp.value) / 100) : cp.value;
      candidates.push({
        id: `cp-${cp.id}`,
        name: `کد ${cp.code}`,
        kind: cp.kind,
        amount,
        note: cp.kind === "percent" ? `${cp.value.toLocaleString("fa-IR")}٪ تخفیف کد ${cp.code}` : `${cp.value.toLocaleString("fa-IR")} یورو تخفیف کد ${cp.code}`,
        stackable: false,
      });
    }
  }

  /* ---- rules ---- */
  for (const r of [...admin.rules].sort((a, b) => b.priority - a.priority)) {
    if (!r.active) continue;
    if (r.from && today() < r.from) continue;
    if (r.to && today() > r.to) continue;
    if (wantedCode) continue; // a code was entered: skip automatic rules
    const count = eligibleCount(r.scope, r.scopeId);
    if (count < Math.max(1, r.minItems)) continue;
    const items = eligible(r.scope, r.scopeId).flatMap((l) => Array.from({ length: l.qty }, () => ({ price: l.price })));
    switch (r.type) {
      case "percent": {
        const sub = eligibleSub(r.scope, r.scopeId);
        const amount = Math.round((sub * r.value) / 100);
        if (amount > 0) candidates.push({ id: `r-${r.id}`, name: r.name, kind: "rule", amount, note: `${r.value.toLocaleString("fa-IR")}٪ تخفیف`, stackable: r.stackable });
        break;
      }
      case "fixed": {
        const sub = eligibleSub(r.scope, r.scopeId);
        const amount = Math.min(r.value, sub);
        if (amount > 0) candidates.push({ id: `r-${r.id}`, name: r.name, kind: "rule", amount, note: `${r.value.toLocaleString("fa-IR")} یورو تخفیف`, stackable: r.stackable });
        break;
      }
      case "second": {
        const sorted = [...items].sort((a, b) => a.price - b.price);
        let amount = 0;
        for (let i = 1; i < sorted.length; i += 2) amount += Math.round((sorted[i].price * r.value) / 100);
        if (amount > 0) candidates.push({ id: `r-${r.id}`, name: r.name, kind: "rule", amount, note: `${r.value.toLocaleString("fa-IR")}٪ تخفیف روی هر قطعهٔ دوم`, stackable: r.stackable });
        break;
      }
      case "bundle": {
        const sorted = [...items].sort((a, b) => a.price - b.price);
        if (sorted.length >= r.qty) {
          const sum = sorted.slice(0, r.qty).reduce((n, x) => n + x.price, 0);
          const amount = Math.max(0, sum - r.value);
          if (amount > 0) candidates.push({ id: `r-${r.id}`, name: r.name, kind: "rule", amount, note: `${r.qty.toLocaleString("fa-IR")} قطعه به قیمت ${r.value.toLocaleString("fa-IR")} یورو`, stackable: r.stackable });
        }
        break;
      }
      case "freeship": {
        const sub = eligibleSub(r.scope, r.scopeId);
        if (sub >= r.value) candidates.push({ id: `r-${r.id}`, name: r.name, kind: "freeship", amount: 0, note: `ارسال رایگان با ${r.value.toLocaleString("fa-IR")} یورو خرید`, freeship: true, stackable: r.stackable });
        break;
      }
    }
  }

  /* ---- selection: best single non-stackable + all stackable ---- */
  const nonStack = candidates.filter((c) => !c.stackable);
  const stack = candidates.filter((c) => c.stackable);
  const applied: AppliedDiscount[] = [...stack];
  const best = nonStack.length
    ? nonStack.reduce((a, b) => (b.amount > a.amount ? b : a))
    : stack.find((c) => c.freeship);
  if (best && !applied.includes(best)) applied.push(best);

  const discountTotal = applied.reduce((n, c) => n + c.amount, 0);
  const afterDiscount = Math.max(0, subtotal - discountTotal);
  const freeship = applied.some((c) => c.freeship) || afterDiscount >= fsThreshold;

  return { applied, discountTotal, freeship, freeshipThreshold: fsThreshold, subtotal, afterDiscount };
}

/** resolve a code before the full cart math (used by the checkout UI) */
export function validateCode(code: string, subtotal: number): { ok: boolean; message: string } {
  const c = code.trim().toUpperCase();
  if (!c) return { ok: false, message: "کدی وارد نشده است." };
  const camp = campaignByCode(c);
  if (camp) {
    if (camp.minSpend && subtotal < camp.minSpend)
      return { ok: false, message: `حداقل خرید برای «${camp.name}» ${camp.minSpend.toLocaleString("fa-IR")} یورو است.` };
    return { ok: true, message: `جشنوارهٔ «${camp.name}» اعمال شد.` };
  }
  const cp = getAdmin().coupons.find((x) => x.code.toUpperCase() === c && x.active && (!x.expires || x.expires >= today()));
  if (cp) {
    if (cp.minSpend && subtotal < cp.minSpend) return { ok: false, message: `حداقل خرید برای این کد ${cp.minSpend.toLocaleString("fa-IR")} یورو است.` };
    return { ok: true, message: `کد ${cp.code} اعمال شد.` };
  }
  return { ok: false, message: "کد تخفیف معتبر نیست." };
}
