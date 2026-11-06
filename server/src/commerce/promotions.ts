import { withTransaction } from "../db";

/* =====================================================================
   Promotions — the admin panel edits campaigns and discount rules in the
   state document; this mirrors them into `price_rules` + `coupons` so the
   server can price a cart without trusting the browser.

   Selection rules (owner-approved):
   1. highest numeric priority wins,
   2. equal priority → the older rule wins,
   3. still equal → the stable id decides.
   It is deliberately *not* "the biggest discount wins".
   ===================================================================== */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = Record<string, any>;

const num = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const dayStart = (value: string | undefined) => (value ? new Date(`${value}T00:00:00.000Z`) : null);
const dayEnd = (value: string | undefined) => (value ? new Date(`${value}T23:59:59.999Z`) : null);

const RULE_KIND: Record<string, string> = {
  percent: "percent",
  fixed: "amount",
  amount: "amount",
  freeship: "freeship",
};

interface RuleRow {
  id: string;
  name: string;
  kind: string;
  value: number;
  scope: string;
  scopeId: string | null;
  minSubtotal: number;
  maxDiscount: number | null;
  priority: number;
  stackable: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  active: boolean;
  createdAt: Date;
}

export async function syncPromotions(admin: Doc) {
  const rules = new Map<string, RuleRow>();

  for (const campaign of (admin.campaigns ?? []) as Doc[]) {
    const kind = RULE_KIND[String(campaign.kind)];
    if (!kind || !campaign.id) continue;
    rules.set(String(campaign.id), {
      id: String(campaign.id),
      name: String(campaign.name ?? campaign.id),
      kind,
      value: num(campaign.value),
      scope: String(campaign.scope ?? "all"),
      scopeId: campaign.scopeId ? String(campaign.scopeId) : null,
      minSubtotal: num(campaign.minSpend),
      maxDiscount: campaign.maxDiscount == null || num(campaign.maxDiscount) <= 0 ? null : num(campaign.maxDiscount),
      priority: num(campaign.priority),
      stackable: !!campaign.stackable,
      startsAt: dayStart(campaign.start),
      endsAt: dayEnd(campaign.end),
      active: campaign.active !== false,
      createdAt: campaign.createdAt ? new Date(campaign.createdAt) : new Date(0),
    });
  }

  for (const rule of (admin.discountRules ?? []) as Doc[]) {
    const kind = RULE_KIND[String(rule.type)];
    // `second`/`bundle` need their own pricing contract; they are not silently
    // approximated here (see docs/commerce-core.md).
    if (!kind || !rule.id) continue;
    rules.set(String(rule.id), {
      id: String(rule.id),
      name: String(rule.name ?? rule.id),
      kind,
      value: num(rule.value),
      scope: String(rule.scope ?? "all"),
      scopeId: rule.scopeId ? String(rule.scopeId) : null,
      minSubtotal: 0,
      maxDiscount: null,
      priority: num(rule.priority),
      stackable: !!rule.stackable,
      startsAt: dayStart(rule.from),
      endsAt: dayEnd(rule.to),
      active: rule.active !== false,
      createdAt: rule.createdAt ? new Date(rule.createdAt) : new Date(0),
    });
  }

  const coupons = new Map<string, Doc>();
  for (const coupon of (admin.coupons ?? []) as Doc[]) {
    const code = String(coupon.code ?? "").trim().toUpperCase();
    if (!code) continue;
    coupons.set(code, coupon);
  }

  await withTransaction(async (client) => {
    const ids = [...rules.keys()];
    for (const rule of rules.values()) {
      await client.query(
        `insert into price_rules (id, name, kind, value, scope, scope_id, min_subtotal, max_discount, priority, stackable,
                                  starts_at, ends_at, active, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,coalesce($14, now()), now())
         on conflict (id) do update set
           name = excluded.name, kind = excluded.kind, value = excluded.value, scope = excluded.scope,
           scope_id = excluded.scope_id, min_subtotal = excluded.min_subtotal,
           max_discount = excluded.max_discount, priority = excluded.priority,
           stackable = excluded.stackable, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
           active = excluded.active, updated_at = now()`,
        [
          rule.id, rule.name, rule.kind, rule.value, rule.scope, rule.scopeId, rule.minSubtotal,
          rule.maxDiscount, rule.priority, rule.stackable, rule.startsAt, rule.endsAt, rule.active, rule.createdAt,
        ],
      );
    }
    await client.query("delete from price_rules where not (id = any($1::text[]))", [ids]);

    for (const [code, coupon] of coupons) {
      await client.query(
        `insert into coupons (code, kind, value, min_subtotal, max_discount, combinable, usage_limit, used_count,
                              starts_at, ends_at, active, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
         on conflict (code) do update set
           kind = excluded.kind, value = excluded.value, min_subtotal = excluded.min_subtotal,
           max_discount = excluded.max_discount,
           combinable = excluded.combinable, usage_limit = excluded.usage_limit,
           used_count = excluded.used_count, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
           active = excluded.active, updated_at = now()`,
        [
          code,
          coupon.kind === "fixed" ? "amount" : "percent",
          num(coupon.value),
          num(coupon.minSpend),
          coupon.maxDiscount == null || num(coupon.maxDiscount) <= 0 ? null : num(coupon.maxDiscount),
          !!coupon.combinable,
          coupon.usageLimit == null ? null : num(coupon.usageLimit),
          num(coupon.uses),
          coupon.startsAt ? new Date(coupon.startsAt) : null,
          coupon.expires ? new Date(`${coupon.expires}T23:59:59.999Z`) : null,
          coupon.active !== false,
        ],
      );
    }
    const codes = [...coupons.keys()];
    if (codes.length) {
      await client.query("delete from coupons where not (code = any($1::text[]))", [codes]);
    } else {
      await client.query("delete from coupons");
    }
  });
}
