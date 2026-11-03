import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query } from "../db";
import type { CashbackTier, CommerceSettings } from "./settings";

/* =====================================================================
   Tiered cashback.

   The rate depends on the size of the basket, not on a single global
   percentage: e.g. up to 1,000 → 5%, up to 3,000 → 3%, above → 1%.

   Two modes (owner can switch, default = the requested rule):
   - `tier_rate`: the bracket that contains the basket sets one rate for the
     whole basket ("تا یک میلیون ۵٪، تا سه میلیون ۳٪").
   - `marginal`: each bracket's rate only applies to the slice inside it
     (like income-tax brackets).

   Cashback is earned on the discounted goods value, never on shipping, and
   is written to an append-only ledger in the same transaction as the order
   so it cannot exist without a paid order (or survive its refund).
   ===================================================================== */

export const round2 = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export interface CashbackTierView extends CashbackTier {
  percent: number;
}

export interface CashbackResult {
  enabled: boolean;
  mode: "tier_rate" | "marginal";
  base: number;
  percent: number;
  amount: number;
  tier: { min: number; max: number | null; percent: number } | null;
  note: string;
}

/** sorts, clamps and drops empty brackets */
export function normalizeTiers(tiers: CashbackTier[] | undefined): CashbackTierView[] {
  const cleaned = (tiers ?? [])
    .map((tier) => ({
      min: Math.max(0, Number(tier.min) || 0),
      max: tier.max === null || tier.max === undefined || Number.isNaN(Number(tier.max)) ? null : Number(tier.max),
      percent: Math.min(30, Math.max(0, Number(tier.percent) || 0)),
    }))
    .filter((tier) => tier.percent > 0 && (tier.max === null || tier.max > tier.min))
    .sort((a, b) => a.min - b.min);
  // close gaps so every amount falls in exactly one bracket
  return cleaned.map((tier, index) => ({
    ...tier,
    max: tier.max ?? cleaned[index + 1]?.min ?? null,
  }));
}

export function computeCashback(baseAmount: number, settings: CommerceSettings): CashbackResult {
  const base = Math.max(0, round2(baseAmount));
  const disabled: CashbackResult = {
    enabled: false,
    mode: settings.cashbackMode,
    base,
    percent: 0,
    amount: 0,
    tier: null,
    note: "کش‌بک در حال حاضر فعال نیست.",
  };
  if (!settings.cashbackEnabled || base <= 0) return disabled;

  const tiers = normalizeTiers(settings.cashbackTiers);
  if (!tiers.length) return disabled;

  let amount = 0;
  let percent = 0;
  let tier: CashbackTier | null = null;

  if (settings.cashbackMode === "marginal") {
    for (const bracket of tiers) {
      const top = bracket.max === null ? base : Math.min(base, bracket.max);
      const slice = Math.max(0, top - bracket.min);
      if (slice > 0) {
        amount += (slice * bracket.percent) / 100;
        percent = bracket.percent;
        tier = bracket;
      }
    }
    // report the effective rate for the whole basket
    percent = base > 0 ? round2((amount / base) * 100) : 0;
  } else {
    tier =
      tiers.find((bracket) => base >= bracket.min && (bracket.max === null || base < bracket.max)) ??
      tiers[tiers.length - 1];
    percent = tier.percent;
    amount = (base * percent) / 100;
  }

  amount = round2(Math.min(amount, Number(settings.cashbackMaxAmount) || amount));
  const note = `کش‌بک این خرید ${percent.toLocaleString("fa-IR")}٪ از مبلغ کالاها است.`;
  return { enabled: amount > 0, mode: settings.cashbackMode, base, percent, amount, tier, note };
}

/** writes the earned cashback for a paid order (idempotent per order) */
export async function recordCashback(
  client: PoolClient,
  input: { orderId: string; email: string | null; base: number; settings: CommerceSettings },
): Promise<CashbackResult> {
  const result = computeCashback(input.base, input.settings);
  if (!result.enabled || result.amount <= 0 || !input.email) {
    return { ...result, amount: 0, enabled: false };
  }
  const res = await client.query<{ amount: string; percent: string }>(
    `insert into cashback_ledger (id, customer_email, order_id, kind, base_amount, percent, amount, note)
     values ($1, $2, $3, 'earn', $4, $5, $6, $7)
     on conflict (order_id) where kind = 'earn' do nothing
     returning amount, percent`,
    [
      `cb_${randomUUID()}`,
      input.email,
      input.orderId,
      result.base,
      result.percent,
      result.amount,
      result.note,
    ],
  );
  if (!res.rows[0]) return { ...result, amount: 0, enabled: false };
  return result;
}

/**
 * Partial refunds claw back the cashback proportionally to the returned value.
 * The original earn row stays untouched, a reversal row is appended.
 */
export async function reverseCashbackForRefund(
  client: PoolClient,
  input: { orderId: string; refundId: string; refundAmount: number; goodsTotal: number },
) {
  const earn = await client.query<{ amount: string; base_amount: string; percent: string }>(
    "select amount, base_amount, percent from cashback_ledger where order_id = $1 and kind = 'earn'",
    [input.orderId],
  );
  const earned = Number(earn.rows[0]?.amount ?? 0);
  if (earned <= 0 || input.goodsTotal <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, input.refundAmount / input.goodsTotal));
  const amount = round2(earned * ratio);
  if (amount <= 0) return 0;
  await client.query(
    `insert into cashback_ledger (id, customer_email, order_id, kind, base_amount, percent, amount, ref_id, note)
     select $1, customer_email, order_id, 'reversal', $2, percent, $3, $4, 'بازگشت کش‌بک پس از بازپرداخت'
       from cashback_ledger where order_id = $5 and kind = 'earn'
     on conflict (ref_id) where kind = 'reversal' do nothing`,
    [`cb_${randomUUID()}`, input.refundAmount, -amount, input.refundId, input.orderId],
  );
  return amount;
}

export async function cashbackBalance(email: string) {
  const res = await query<{ balance: string; earned: string; reversed: string }>(
    `select coalesce(sum(amount), 0)::numeric(12,2) as balance,
            coalesce(sum(case when kind = 'earn' then amount else 0 end), 0)::numeric(12,2) as earned,
            coalesce(sum(case when kind = 'reversal' then amount else 0 end), 0)::numeric(12,2) as reversed
       from cashback_ledger where customer_email = $1`,
    [email],
  );
  const row = res.rows[0];
  return {
    balance: Number(row?.balance ?? 0),
    earned: Number(row?.earned ?? 0),
    reversed: Number(row?.reversed ?? 0),
  };
}

export async function cashbackTransactions(email: string, limit = 50) {
  const res = await query(
    `select id, order_id, kind, base_amount, percent, amount, note, created_at
       from cashback_ledger where customer_email = $1 order by created_at desc limit $2`,
    [email, Math.min(200, limit)],
  );
  return res.rows.map((row) => ({
    id: row.id,
    orderId: row.order_id,
    kind: row.kind,
    baseAmount: Number(row.base_amount),
    percent: Number(row.percent),
    amount: Number(row.amount),
    note: row.note,
    at: row.created_at,
  }));
}

export async function cashbackOverview() {
  const totals = await query<{ accounts: number; earned: string; reversed: string; orders: number }>(
    `select count(distinct customer_email)::int as accounts,
            coalesce(sum(case when kind = 'earn' then amount else 0 end), 0)::numeric(12,2) as earned,
            coalesce(sum(case when kind = 'reversal' then amount else 0 end), 0)::numeric(12,2) as reversed,
            count(*) filter (where kind = 'earn')::int as orders
       from cashback_ledger`,
  );
  const recent = await query(
    `select id, customer_email, order_id, kind, base_amount, percent, amount, note, created_at
       from cashback_ledger order by created_at desc limit 100`,
  );
  const row = totals.rows[0];
  return {
    accounts: Number(row?.accounts ?? 0),
    earned: Number(row?.earned ?? 0),
    reversed: Number(row?.reversed ?? 0),
    orders: Number(row?.orders ?? 0),
    balance: round2(Number(row?.earned ?? 0) + Number(row?.reversed ?? 0)),
    entries: recent.rows.map((entry) => ({
      id: entry.id,
      email: entry.customer_email,
      orderId: entry.order_id,
      kind: entry.kind,
      baseAmount: Number(entry.base_amount),
      percent: Number(entry.percent),
      amount: Number(entry.amount),
      note: entry.note,
      at: entry.created_at,
    })),
  };
}
