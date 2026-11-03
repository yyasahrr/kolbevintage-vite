import fs from "node:fs";
import { config } from "./config";
import { withTransaction } from "./db";
import { syncPromotions } from "./commerce/promotions";
import { syncVariants } from "./commerce/variants";
import { recordAudit } from "./commerce/audit";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = Record<string, any>;

interface SeedFile {
  baseProducts: Doc[];
  admin: Doc;
  ops: Doc;
}

export const seed: SeedFile = JSON.parse(fs.readFileSync(config.seedFile, "utf8"));

const baseById = new Map(seed.baseProducts.map((p) => [p.id as string, p]));

const num = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function mergeStock(base: Doc, edit: Doc | undefined, overrides: Doc[]): Record<string, number> {
  const stock: Record<string, number> = { ...(base.stock ?? {}) };
  if (edit?.stock) Object.assign(stock, edit.stock);
  for (const row of overrides) {
    if (row?.colorId && row?.sizeId) stock[`${row.colorId}:${row.sizeId}`] = num(row.qty);
  }
  // only keep variants that still exist
  const colors: string[] = (edit?.colors ?? base.colors ?? []).map((c: Doc) => c.id);
  const sizes: string[] = (edit?.sizes ?? base.sizes ?? []).map((s: Doc) => s.id);
  const out: Record<string, number> = {};
  for (const c of colors) for (const s of sizes) out[`${c}:${s}`] = num(stock[`${c}:${s}`]);
  return out;
}

/**
 * Rebuilds the relational projection (products, images, complements, orders)
 * from the admin + ops documents. The documents stay the source of truth for
 * the current admin UI; the tables are what the public API serves.
 */
export async function syncProjection(admin: Doc, ops: Doc) {
  const stockRows: Doc[] = Array.isArray(admin.stock) ? admin.stock : [];
  const rows: Doc[] = [];

  for (const base of seed.baseProducts) {
    const edit: Doc = admin.productEdits?.[base.id] ?? {};
    rows.push({
      id: base.id,
      name: edit.name ?? base.name,
      category: edit.category ?? base.category,
      garment: edit.garment ?? base.garment,
      price: num(edit.price ?? base.price),
      compare_at: edit.compareAt === undefined ? base.compareAt : edit.compareAt,
      description: edit.description ?? base.description ?? null,
      material: base.material ?? null,
      care: base.care ?? null,
      fit: base.fit ?? null,
      origin: base.origin ?? null,
      badge: base.badge ?? null,
      look_id: edit.lookId ?? base.lookId ?? null,
      look_name: base.lookName ?? null,
      look_slug: base.lookSlug ?? null,
      look_order: num(base.lookOrder),
      crop: edit.crop ?? base.crop ?? null,
      colors: edit.colors ?? base.colors ?? [],
      sizes: edit.sizes ?? base.sizes ?? [],
      stock: mergeStock(base, edit, stockRows.filter((r) => r.productId === base.id)),
      active: !(admin.hidden ?? []).includes(base.id),
      featured:
        (admin.featured ?? []).includes(base.id) ||
        !!admin.customProducts?.find((c: Doc) => c.id === base.id)?.featured,
      is_base: true,
      created_at: null,
    });
  }

  for (const custom of admin.customProducts ?? []) {
    rows.push({
      id: custom.id,
      name: custom.name,
      category: custom.category,
      garment: custom.garment,
      price: num(custom.price),
      compare_at: custom.compareAt ?? null,
      description: custom.description ?? null,
      material: null,
      care: null,
      fit: null,
      origin: "آتلیهٔ ولور",
      badge: custom.featured ? "پرفروش" : "جدید",
      look_id: custom.lookId ?? null,
      look_name: "محصول آتلیه",
      look_slug: custom.lookId ?? null,
      look_order: 0,
      crop: custom.crop ?? null,
      colors: custom.colors ?? [],
      sizes: custom.sizes ?? [],
      stock: custom.stock ?? {},
      active: !!custom.active && !(admin.hidden ?? []).includes(custom.id),
      featured: !!custom.featured,
      is_base: false,
      created_at: custom.createdAt ? new Date(custom.createdAt) : null,
    });
  }

  const ids = rows.map((r) => r.id as string);
  const images: Doc[] = [];
  for (const [productId, list] of Object.entries<Doc[]>(ops.productImages ?? {})) {
    if (!ids.includes(productId) || !Array.isArray(list)) continue;
    list.forEach((img, index) => {
      if (!img?.url) return;
      images.push({
        id: img.id ?? `${productId}-${index}`,
        product_id: productId,
        url: img.url,
        color_id: img.colorId ?? "*",
        role: img.role ?? "gallery",
        position: index,
      });
    });
  }

  const complements: Doc[] = [];
  for (const [productId, list] of Object.entries<string[]>(admin.complements ?? {})) {
    if (!ids.includes(productId) || !Array.isArray(list)) continue;
    list.forEach((complementId, index) => {
      if (ids.includes(complementId) && complementId !== productId) {
        complements.push({ product_id: productId, complement_id: complementId, position: index });
      }
    });
  }

  await withTransaction(async (client) => {
    const previous = await client.query<{ id: string; price: string }>(
      "select id, price from products where id = any($1::text[])",
      [rows.map((r) => r.id)],
    );
    const previousPrice = new Map(previous.rows.map((row) => [row.id, Number(row.price)]));

    for (const r of rows) {
      await client.query(
        `insert into products (
          id, name, category, garment, price, compare_at, description, material, care, fit, origin,
          badge, look_id, look_name, look_slug, look_order, crop, colors, sizes, stock, active,
          featured, is_base, created_at
        ) values (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,coalesce($24, now())
        )
        on conflict (id) do update set
          name = excluded.name, category = excluded.category, garment = excluded.garment,
          price = excluded.price, compare_at = excluded.compare_at, description = excluded.description,
          material = excluded.material, care = excluded.care, fit = excluded.fit, origin = excluded.origin,
          badge = excluded.badge, look_id = excluded.look_id, look_name = excluded.look_name,
          look_slug = excluded.look_slug, look_order = excluded.look_order, crop = excluded.crop,
          colors = excluded.colors, sizes = excluded.sizes, stock = excluded.stock,
          active = excluded.active, featured = excluded.featured, is_base = excluded.is_base,
          updated_at = now()`,
        [
          r.id, r.name, r.category, r.garment, r.price, r.compare_at, r.description, r.material,
          r.care, r.fit, r.origin, r.badge, r.look_id, r.look_name, r.look_slug, r.look_order,
          JSON.stringify(r.crop), JSON.stringify(r.colors), JSON.stringify(r.sizes),
          JSON.stringify(r.stock), r.active, r.featured, r.is_base, r.created_at,
        ],
      );
    }
    // every catalogue price change keeps its own history: the order snapshot is
    // immutable, but we still need to prove what the shelf price was and when it moved
    for (const r of rows) {
      const before = previousPrice.get(r.id);
      const after = Number(r.price);
      if (before === undefined || before === after) continue;
      await client.query(
        "insert into price_history (product_id, old_price, new_price, actor, source) values ($1,$2,$3,$4,'admin_state_doc')",
        [r.id, before, after, "admin"],
      );
      await recordAudit(
        {
          actor: "admin",
          action: "catalog.price_changed",
          targetType: "product",
          targetId: r.id,
          before: { price: before },
          after: { price: after },
        },
        client,
      );
    }

    await client.query("delete from products where not (id = any($1::text[]))", [ids]);

    await client.query("delete from product_images");
    for (const img of images) {
      await client.query(
        "insert into product_images (id, product_id, url, color_id, role, position) values ($1,$2,$3,$4,$5,$6)",
        [img.id, img.product_id, img.url, img.color_id, img.role, img.position],
      );
    }

    await client.query("delete from product_complements");
    for (const c of complements) {
      await client.query(
        "insert into product_complements (product_id, complement_id, position) values ($1,$2,$3)",
        [c.product_id, c.complement_id, c.position],
      );
    }

    const orders: Doc[] = Array.isArray(admin.orders) ? admin.orders : [];
    for (const o of orders) {
      await client.query(
        `insert into orders (id, created_at, customer, email, status, total, data)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (id) do nothing`,
        [o.id, new Date(o.at ?? Date.now()), o.customer ?? null, o.email ?? null, o.status ?? null, num(o.total), JSON.stringify(o)],
      );
    }
    // order history is append-only: orders posted through /api/orders must not
    // be deleted by a later admin document sync.

    for (const [key, value] of [
      ["categories", ops.categories ?? []],
      ["sizeSets", ops.sizeSets ?? []],
      ["brand", ops.brand ?? {}],
      ["security", ops.security ?? {}],
    ] as const) {
      await client.query(
        `insert into settings (key, value, updated_at) values ($1, $2, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [key, JSON.stringify(value)],
      );
    }
  });

  // campaigns/coupons + the variant catalogue are derived from the same
  // documents, so pricing and stock never drift from what the admin panel shows
  await syncPromotions(admin);
  await syncVariants();
}

export function baseProductById(id: string) {
  return baseById.get(id);
}
