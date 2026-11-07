import type { PoolClient } from "pg";
import { labelContextFromSnapshot } from "../routes/customer-labels";
import { labelAudience, matchesLabelAudience } from "./audiences";
import { CommerceError } from "./errors";

/** Deliberately supports purchase-only access. Visibility restrictions must
 * remain blocked until every public response and media source is protected. */
export function purchaseEarlyAccess(value:unknown, publicStart:Date | string | null): {mode:"purchase";startsAt:string} | null {
  if (!value || typeof value!=="object" || Array.isArray(value)) return null;
  const x=value as Record<string,unknown>;
  if (Object.keys(x).some(key=>key!=="mode" && key!=="startsAt") || x.mode!=="purchase" || typeof x.startsAt!=="string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(x.startsAt) || !publicStart) return null;
  const time=new Date(x.startsAt),end=new Date(publicStart);
  const canonical=x.startsAt.includes(".") ? x.startsAt : x.startsAt.replace(/Z$/, ".000Z");
  if (!Number.isFinite(time.getTime()) || !Number.isFinite(end.getTime()) || time.toISOString()!==canonical || time>=end) return null;
  return {mode:"purchase",startsAt:time.toISOString()};
}

type RestrictedRule={scope:string;scope_id:string|null;starts_at:Date|null;early_access:unknown;audience:unknown};
/** Enforce every overlapping restriction against the same transaction snapshot
 * as the reservation / payment / manual order. Existing initiated payments
 * retain their immutable snapshot; this checks only new commitments. */
export async function requirePurchaseAccess(client:PoolClient, variantIds:readonly string[], email:string|null|undefined) {
  if (!variantIds.length) return;
  // One statement is one MVCC snapshot even at READ COMMITTED. Reservation
  // must use READ COMMITTED: after waiting for a stock row lock it must see
  // reservations committed by the previous holder, or it can oversell.
  const result=await client.query<{rules:RestrictedRule[];products:{id:string;product_id:string;category:string;look_id:string|null}[];definitions:unknown;customer:any;now:Date}>(`
    with rules as materialized (
      select scope,scope_id,starts_at,early_access,audience from price_rules
       where active and early_access is not null and (starts_at is null or starts_at > now())
    )
    select coalesce((select jsonb_agg(r) from rules r),'[]'::jsonb) as rules,
      coalesce((select jsonb_agg(p) from (select v.id,v.product_id,p.category,p.look_id
        from product_variants v join products p on p.id=v.product_id where v.id=any($1::text[])) p),'[]'::jsonb) as products,
      (select value from commerce_settings where key='customer_labels_v1') as definitions,
      (select jsonb_build_object('email',c.email,'name',c.name,'phone',c.phone,'created_at',c.created_at,'manual_labels',c.manual_labels,
        'delivered_count',(select count(o.id)::int from orders o
          where o.email=c.email and o.status='delivered' and o.payment_status='settled'
          and (o.data->>'manual'='true' or exists (select 1 from payment_attempts a where a.id=o.data->'commerce'->>'paymentAttemptId' and a.order_id=o.id and a.status='settled' and a.provider not like 'mock%'))
          and exists (select 1 from order_lines l where l.order_id=o.id and l.refunded_quantity<l.quantity)))
        from customers c where c.email=$2 and exists(select 1 from rules)) as customer,
      now() as now`,[variantIds,email?.trim().toLowerCase() ?? null]);
  const {rules,products,definitions,customer,now}=result.rows[0];
  if (!rules.length) return;
  if (new Set(products.map(p=>p.id)).size!==new Set(variantIds).size) throw new CommerceError("یکی از کالاهای سفارش دیگر در دسترس نیست.",409,"variant_not_found");
  const time=now.getTime();
  const context=labelContextFromSnapshot(definitions,customer);
  for (const rule of rules) {
    const scopeKnown=["all","category","product","look"].includes(rule.scope);
    const applies=!scopeKnown || products.some(p=>rule.scope==="all" || rule.scope==="category" && p.category===rule.scope_id || rule.scope==="product" && p.product_id===rule.scope_id || rule.scope==="look" && p.look_id!==null && p.look_id===rule.scope_id);
    if (!applies) continue;
    const access=purchaseEarlyAccess(rule.early_access,rule.starts_at);
    let allowed=false;
    if (access && time>=new Date(access.startsAt).getTime()) {
      try { allowed=matchesLabelAudience(labelAudience(rule.audience),context.actual,context.defined); } catch { /* malformed audiences deny */ }
    }
    if (!allowed) throw new CommerceError("خرید یک یا چند قلم سبد هنوز برای این حساب فعال نشده است.",409,"early_purchase_restricted");
  }
}
