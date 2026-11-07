import type { PoolClient } from "pg";
import { query, withTransaction } from "../db";

/* =====================================================================
   Product variants — the unit stock, price and orders actually attach to.

   A product ("oversized hoodie") is offered in colors × sizes; every
   combination is a variant with a stable id and SKU. Stock changes are
   written both to `product_variants.on_hand` and to the append-only
   `inventory_movements` ledger so every movement is auditable.
   ===================================================================== */

export interface VariantRow {
  id: string;
  product_id: string;
  color_id: string;
  size_id: string;
  sku: string;
  size_mode: string;
  on_hand: number;
  quarantined: number;
  active: boolean;
  last_catalog_qty: number;
}

export interface VariantView extends VariantRow {
  product_name: string;
  category: string;
  look_id: string | null;
  price: number;
  color_name: string;
  size_label: string;
  reserved: number;
  available: number;
}

export const STANDARD_SIZES = new Set([
  "xxs", "xs", "s", "m", "l", "xl", "xxl", "xxxl", "2xl", "3xl", "4xl",
  ...Array.from({ length: 13 }, (_, i) => String(34 + i)),
]);

const slug = (value: string) => String(value).replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 48) || "x";

export const variantIdFor = (productId: string, colorId: string, sizeId: string) =>
  `pv_${slug(productId)}__${slug(colorId)}__${slug(sizeId)}`;

export const skuFor = (productId: string, colorId: string, sizeId: string) =>
  `${productId}-${colorId}-${sizeId}`.toUpperCase().replace(/[^A-Z0-9-]/g, "-");

interface CatalogProduct {
  id: string;
  colors: { id: string; name: string }[];
  sizes: { id: string; label: string }[];
  stock: Record<string, number>;
  active: boolean;
}

interface DesiredVariant {
  id: string;
  product_id: string;
  color_id: string;
  size_id: string;
  sku: string;
  size_mode: string;
  catalogQty: number;
  active: boolean;
}

export function sizeModeOf(sizes: { id: string }[]): "standard_sizes" | "custom_sizes" | "no_size" {
  if (sizes.length === 0) return "no_size";
  return sizes.every((s) => STANDARD_SIZES.has(String(s.id).toLowerCase())) ? "standard_sizes" : "custom_sizes";
}

function expand(products: CatalogProduct[]): DesiredVariant[] {
  const out: DesiredVariant[] = [];
  for (const p of products) {
    const colors = p.colors?.length ? p.colors : [{ id: "one", name: "تک‌رنگ" }];
    const sizes = p.sizes?.length ? p.sizes : [{ id: "one", label: "تک‌سایز" }];
    const mode = sizeModeOf(p.sizes ?? []);
    for (const color of colors) {
      for (const size of sizes) {
        const qty = Math.max(0, Math.trunc(Number(p.stock?.[`${color.id}:${size.id}`] ?? 0)));
        out.push({
          id: variantIdFor(p.id, color.id, size.id),
          product_id: p.id,
          color_id: color.id,
          size_id: size.id,
          sku: skuFor(p.id, color.id, size.id),
          size_mode: mode,
          catalogQty: qty,
          active: p.active,
        });
      }
    }
  }
  return out;
}

async function recordMovement(
  client: PoolClient,
  variantId: string,
  delta: number,
  reason: string,
  opts: { refType?: string; refId?: string; actor?: string; note?: string; dedupeKey?: string } = {},
) {
  if (delta === 0) return;
  await client.query(
    `insert into inventory_movements (variant_id, delta, reason, ref_type, ref_id, actor, note, dedupe_key)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (dedupe_key) do nothing`,
    [variantId, delta, reason, opts.refType ?? null, opts.refId ?? null, opts.actor ?? null, opts.note ?? null, opts.dedupeKey ?? null],
  );
}

/**
 * Mirrors the catalogue (products + colors + sizes + stock) into variants.
 *
 * `last_catalog_qty` is what makes this safe: the catalogue number is only
 * turned into a stock movement when it actually changed. A sale that has
 * already decremented `on_hand` is never silently undone by a later sync of
 * an unchanged admin document.
 */
export async function syncVariants() {
  await withTransaction(async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext('kv-commerce-catalog-sync'))");
    const products = await client.query<CatalogProduct>("select id, colors, sizes, stock, active from products");
    const desired = expand(products.rows);
    const desiredIds = desired.map((v) => v.id);
    const existing = await client.query<Pick<VariantRow, "id" | "on_hand" | "last_catalog_qty">>(
      "select id, on_hand, last_catalog_qty from product_variants for update",
    );
    const byId = new Map(existing.rows.map((r) => [r.id, r]));

    for (const v of desired) {
      const row = byId.get(v.id);
      if (!row) {
        await client.query(
          `insert into product_variants (id, product_id, color_id, size_id, sku, size_mode, on_hand, last_catalog_qty, active)
           values ($1, $2, $3, $4, $5, $6, $7, $7, $8)
           on conflict (id) do nothing`,
          [v.id, v.product_id, v.color_id, v.size_id, v.sku, v.size_mode, v.catalogQty, v.active],
        );
        await recordMovement(client, v.id, v.catalogQty, "opening_stock", {
          refType: "catalog",
          refId: v.product_id,
          dedupeKey: `opening:${v.id}`,
        });
        continue;
      }

      if (row.last_catalog_qty !== v.catalogQty) {
        const delta = v.catalogQty - row.last_catalog_qty;
        await client.query(
          `update product_variants
             set on_hand = greatest(0, on_hand + $2), last_catalog_qty = $3, sku = $4,
                 size_mode = $5, active = $6, updated_at = now()
           where id = $1`,
          [v.id, delta, v.catalogQty, v.sku, v.size_mode, v.active],
        );
        await recordMovement(client, v.id, delta, "catalog_sync", {
          refType: "catalog",
          refId: v.product_id,
          dedupeKey: `sync:${v.id}:${v.catalogQty}`,
        });
      } else {
        await client.query(
          "update product_variants set sku = $2, size_mode = $3, active = $4, updated_at = now() where id = $1",
          [v.id, v.sku, v.size_mode, v.active],
        );
      }
    }

    await client.query(
      "update product_variants set active = false, updated_at = now() where not (id = any($1::text[])) and active",
      [desiredIds],
    );
  });
}

/** availability = on_hand − quarantined − active reservations */
export const AVAILABILITY_SQL = `
  select v.id, v.product_id, v.color_id, v.size_id, v.sku, v.size_mode,
         v.on_hand, v.quarantined, (v.active and v.sale_enabled) as active, v.sale_enabled,
         coalesce((
           select sum(r.quantity) from stock_reservations r
           where r.variant_id = v.id and r.status = 'active' and r.expires_at > now()
         ), 0)::int as reserved,
         (v.on_hand - v.quarantined - coalesce((
           select sum(r.quantity) from stock_reservations r
           where r.variant_id = v.id and r.status = 'active' and r.expires_at > now()
         ), 0))::int as available
  from product_variants v`;

export async function variantViews(ids: string[]): Promise<VariantView[]> {
  if (!ids.length) return [];
  const res = await query<VariantView & { price: string }>(
    `${AVAILABILITY_SQL}
     join products p on p.id = v.product_id
     where v.id = any($1::text[])`,
    [ids],
  );
  return res.rows.map((row) => ({ ...row, price: Number(row.price) }));
}

/** full variant list for a product (storefront + admin) */
export async function productVariants(productId: string, publicOnly = false) {
  const res = await query(
    `${AVAILABILITY_SQL} ${publicOnly ? "join products p on p.id=v.product_id" : ""} where v.product_id = $1 ${publicOnly ? "and p.active=true" : ""} order by v.color_id, v.size_id`,
    [productId],
  );
  return res.rows;
}

export function publicVariant(row: Record<string, unknown>) {
  return {
    id: row.id,
    productId: row.product_id,
    sku: row.sku,
    colorId: row.color_id,
    sizeId: row.size_id,
    sizeMode: row.size_mode,
    onHand: Number(row.on_hand),
    quarantined: Number(row.quarantined),
    reserved: Number(row.reserved ?? 0),
    available: row.active && row.sale_enabled !== false ? Math.max(0,Number(row.available ?? 0)) : 0,
    active: Boolean(row.active && (row.sale_enabled !== false)),
    saleEnabled: row.sale_enabled !== false,
  };
}
