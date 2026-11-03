import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { query } from "../db";
import type { CashbackTier, CommerceSettings } from "./settings";
import { loadCommerceSettings } from "./settings";
import { CommerceError } from "./errors";

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
  /* availability follows the owner's policy: nothing is spendable before the
     goods are out of the return risk window (see settings.cashbackCreditTiming) */
  const timing = input.settings.cashbackCreditTiming;
  const expiresMonths = Math.max(0, Number(input.settings.cashbackExpiryMonths) || 0);
  const availableNow = timing === "on_payment";
  const res = await client.query<{ amount: string; percent: string }>(
    `insert into cashback_ledger (id, customer_email, order_id, kind, base_amount, percent, amount, note,
                                  available_at, expires_at)
     values ($1, $2, $3, 'earn', $4, $5, $6, $7,
             case when $8::boolean then now() else null end,
             case when $8::boolean and $9::int > 0 then now() + ($9::int || ' months')::interval else null end)
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
      availableNow,
      expiresMonths,
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

/**
 * The wallet has two numbers, and mixing them up is how a store pays out money
 * it does not owe yet:
 *   - pending: earned, waiting for delivery (+ return window)
 *   - available: spendable right now (not expired, not already spent)
 */
export async function cashbackWallet(email: string) {
  const res = await query<{
    order_id: string | null;
    kind: string;
    amount: string;
    available_at: Date | null;
    expires_at: Date | null;
  }>(
    `select order_id, kind, amount, available_at, expires_at from cashback_ledger where customer_email = $1`,
    [email],
  );

  const now = Date.now();
  interface Bucket {
    amount: number;
    ready: boolean;
    expired: boolean;
    expires: Date | null;
    reversal: number;
  }
  const perOrder = new Map<string, Bucket>();
  let credit = 0;
  let spent = 0;
  let earned = 0;
  let reversed = 0;
  let expiredTotal = 0;

  // first pass: the earning rows define the buckets
  for (const row of res.rows) {
    const amount = Number(row.amount);
    if (row.kind !== "earn") continue;
    earned += amount;
    const readyAt = row.available_at ? new Date(row.available_at).getTime() : null;
    const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
    const expired = expiresAt !== null && expiresAt <= now;
    const ready = !expired && readyAt !== null && readyAt <= now;
    if (expired) expiredTotal += amount;
    perOrder.set(row.order_id ?? "", {
      amount,
      ready,
      expired,
      expires: row.expires_at ? new Date(row.expires_at) : null,
      reversal: 0,
    });
  }

  // second pass: reversals must land in the bucket of their own order, so the
  // order of rows in the ledger never changes the answer
  for (const row of res.rows) {
    const amount = Number(row.amount);
    if (row.kind === "reversal") {
      reversed += amount;
      const bucket = perOrder.get(row.order_id ?? "");
      if (bucket) bucket.reversal += amount; // negative
    } else if (row.kind === "redeem") {
      spent += -amount;
    } else if (row.kind === "refund_credit") {
      credit += amount;
    }
  }

  let availableEarn = 0;
  let pending = 0;
  let nextExpiry: Date | null = null;
  for (const bucket of perOrder.values()) {
    const remaining = bucket.amount + bucket.reversal; // reversal is negative
    if (bucket.ready) {
      availableEarn += Math.max(0, remaining);
      if (bucket.expires && (nextExpiry === null || bucket.expires < nextExpiry)) nextExpiry = bucket.expires;
    } else if (!bucket.expired) {
      pending += Math.max(0, remaining);
    }
  }

  const available = round2(Math.max(0, availableEarn + credit - spent));
  return {
    available,
    pending: round2(Math.max(0, pending)),
    earned: round2(earned),
    reversed: round2(reversed),
    spent: round2(spent),
    expired: round2(expiredTotal),
    nextExpiry,
    balance: available,
  };
}

/** keeps the old shape for callers that only need the totals */
export async function cashbackBalance(email: string) {
  const wallet = await cashbackWallet(email);
  return { balance: wallet.available, earned: wallet.earned, reversed: wallet.reversed };
}

/**
 * Release earned cashback once the order is out of the return-risk window.
 * Runs in the background sweep and after a delivery, and is idempotent: rows
 * that already have an availability date are never touched twice.
 */
export async function releasePendingCashback() {
  const settings = await loadCommerceSettings();
  if (settings.cashbackCreditTiming === "on_payment") return 0;
  const holdDays = settings.cashbackCreditTiming === "on_delivery"
    ? 0
    : Math.max(0, Number(settings.cashbackHoldDays) || 0);
  const months = Math.max(0, Number(settings.cashbackExpiryMonths) || 0);

  const res = await query(
    `with delivered as (
       select o.id,
              coalesce((select max(created_at) from fulfillment_events f where f.order_id = o.id and f.stage = 'deliver'),
                       o.created_at) as delivered_at
         from orders o
        where o.status in ('delivered')
     )
     update cashback_ledger c
        set available_at = d.delivered_at + ($1::int || ' days')::interval,
            expires_at = case when $2::int > 0
                              then d.delivered_at + ($1::int || ' days')::interval + ($2::int || ' months')::interval
                              else null end
       from delivered d
      where c.order_id = d.id
        and c.kind = 'earn'
        and c.available_at is null
        and d.delivered_at + ($1::int || ' days')::interval <= now()`,
    [holdDays, months],
  );
  return res.rowCount ?? 0;
}

/**
 * Spend the wallet on a checkout. The customer can never pay with cashback
 * earned by the very order being paid, and the balance is re-checked under a
 * lock so two concurrent checkouts cannot spend the same money.
 */
export async function redeemCashback(
  client: PoolClient,
  input: { email: string; orderId: string; amount: number },
) {
  const amount = round2(Math.max(0, input.amount));
  if (amount <= 0) return 0;
  await client.query("select pg_advisory_xact_lock(hashtext($1))", [`cashback:${input.email}`]);
  const wallet = await cashbackWallet(input.email);
  if (wallet.available < amount) {
    throw new CommerceError(
      `موجودی قابل استفادهٔ کیف پول ${wallet.available.toLocaleString("fa-IR")} است؛ مبلغ بیشتری قابل کسر نیست.`,
      409,
      "cashback_insufficient",
    );
  }
  const res = await client.query(
    `insert into cashback_ledger (id, customer_email, order_id, kind, amount, ref_id, note, available_at)
     values ($1, $2, $3, 'redeem', $4, $3, 'استفاده از کش‌بک برای پرداخت این سفارش', now())
     on conflict (ref_id) where kind = 'redeem' do nothing`,
    [`cb_${randomUUID()}`, input.email, input.orderId, -amount],
  );
  return (res.rowCount ?? 0) > 0 ? amount : 0;
}

/** a refund paid back into the wallet (the store keeps the cash) */
export async function creditWalletForRefund(
  client: PoolClient,
  input: { email: string; orderId: string; refundId: string; amount: number },
) {
  const amount = round2(Math.max(0, input.amount));
  if (amount <= 0) return 0;
  const res = await client.query(
    `insert into cashback_ledger (id, customer_email, order_id, kind, amount, ref_id, note, available_at)
     values ($1, $2, $3, 'refund_credit', $4, $5, 'بازگشت مبلغ کسرشده از کیف پول پس از بازپرداخت', now())
     on conflict (ref_id) where kind = 'refund_credit' do nothing`,
    [`cb_${randomUUID()}`, input.email, input.orderId, amount, input.refundId],
  );
  return (res.rowCount ?? 0) > 0 ? amount : 0;
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
