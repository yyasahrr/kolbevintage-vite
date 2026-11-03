import type { FastifyInstance } from "fastify";
import { query } from "../db";
import { requireAdmin } from "../sessions";
import { recordAudit } from "../commerce/audit";
import { actorOf, requireAdminSession } from "../commerce/auth";

interface ProductRow {
  id: string;
  name: string;
  category: string;
  garment: string;
  price: string;
  compare_at: string | null;
  description: string | null;
  material: string | null;
  care: string | null;
  fit: string | null;
  origin: string | null;
  badge: string | null;
  look_id: string | null;
  look_name: string | null;
  look_slug: string | null;
  look_order: number;
  crop: unknown;
  colors: unknown[];
  sizes: unknown[];
  stock: Record<string, number>;
  active: boolean;
  featured: boolean;
  is_base: boolean;
}

const toProduct = (row: ProductRow, images: unknown[], complements: string[]) => ({
  id: row.id,
  name: row.name,
  category: row.category,
  garment: row.garment,
  price: Number(row.price),
  compareAt: row.compare_at === null ? null : Number(row.compare_at),
  description: row.description,
  material: row.material,
  care: row.care,
  fit: row.fit,
  origin: row.origin,
  badge: row.badge,
  lookId: row.look_id,
  lookName: row.look_name,
  lookSlug: row.look_slug,
  lookOrder: row.look_order,
  crop: row.crop,
  colors: row.colors,
  sizes: row.sizes,
  stock: row.stock,
  active: row.active,
  featured: row.featured,
  isBase: row.is_base,
  images,
  complements,
});

export async function catalogRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { all?: string; q?: string; category?: string } }>("/api/products", async (req) => {
    const all = req.query.all === "1";
    const params: unknown[] = [];
    const where: string[] = [];
    if (!all) where.push("active = true");
    if (req.query.category) {
      params.push(req.query.category);
      where.push(`category = $${params.length}`);
    }
    if (req.query.q) {
      params.push(`%${req.query.q}%`);
      where.push(`name ilike $${params.length}`);
    }
    const sql = `select * from products ${where.length ? `where ${where.join(" and ")}` : ""} order by look_order desc, created_at desc`;

    const rows = await query<ProductRow>(sql, params);
    const images = await query<{ product_id: string; id: string; url: string; color_id: string; role: string; position: number }>(
      "select product_id, id, url, color_id, role, position from product_images order by position",
    );
    const complements = await query<{ product_id: string; complement_id: string }>(
      "select product_id, complement_id from product_complements order by position",
    );

    const imagesBy = new Map<string, unknown[]>();
    for (const img of images.rows) {
      const list = imagesBy.get(img.product_id) ?? [];
      list.push({ id: img.id, url: img.url, colorId: img.color_id, role: img.role });
      imagesBy.set(img.product_id, list);
    }
    const compBy = new Map<string, string[]>();
    for (const c of complements.rows) {
      compBy.set(c.product_id, [...(compBy.get(c.product_id) ?? []), c.complement_id]);
    }

    return rows.rows.map((row) => toProduct(row, imagesBy.get(row.id) ?? [], compBy.get(row.id) ?? []));
  });

  app.get<{ Params: { id: string } }>("/api/products/:id", async (req, reply) => {
    const row = await query<ProductRow>("select * from products where id = $1", [req.params.id]);
    if (!row.rows[0]) return reply.code(404).send({ error: "محصول پیدا نشد." });
    const images = await query("select id, url, color_id, role, position from product_images where product_id = $1 order by position", [
      req.params.id,
    ]);
    const complements = await query("select complement_id from product_complements where product_id = $1 order by position", [
      req.params.id,
    ]);
    return toProduct(
      row.rows[0],
      images.rows.map((i: any) => ({ id: i.id, url: i.url, colorId: i.color_id, role: i.role })),
      complements.rows.map((c: any) => c.complement_id),
    );
  });

  app.get("/api/orders", async (req) => {
    await requireAdmin(req);
    const rows = await query<{ data: unknown }>("select data from orders order by created_at desc limit 200");
    return rows.rows.map((r) => r.data);
  });

  /**
   * Legacy manual order entry. The storefront must never call this: an order
   * that did not come from the commerce checkout has no payment attempt, no
   * reservation and no lines, so it can never be paid or fulfilled correctly.
   * It stays available to an authenticated admin (phone orders) and every row
   * it creates is written to the audit trail.
   */
  app.post<{
    Body: {
      id?: string;
      at?: number;
      customer?: string;
      email?: string;
      status?: string;
      total?: number;
      lines?: unknown[];
    };
  }>("/api/orders", async (req, reply) => {
    // a real admin session, not the optional dev guard: this endpoint must never
    // be reachable by the storefront
    const session = await requireAdminSession(req);
    const body = req.body ?? {};
    const lines = Array.isArray(body.lines) ? body.lines : [];
    if (lines.length === 0) return reply.code(400).send({ error: "سبد خرید خالی است." });
    const id = String(body.id ?? `VL-${Date.now()}`);
    const at = Number(body.at) || Date.now();
    const record = { ...body, id, at, lines };
    await query(
      `insert into orders (id, created_at, customer, email, status, total, data)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do update set
         customer = excluded.customer, email = excluded.email, status = excluded.status,
         total = excluded.total, data = excluded.data`,
      [id, new Date(at), body.customer ?? null, body.email ?? null, body.status ?? "pending", Number(body.total) || 0, JSON.stringify(record)],
    );
    await recordAudit({
      actor: actorOf(session),
      action: "order.legacy_create",
      targetType: "order",
      targetId: id,
      after: { status: body.status ?? "pending", total: Number(body.total) || 0, lines: lines.length },
      reason: "manual order entry outside the checkout flow",
    });
    return { ok: true, id };
  });

  app.patch<{ Params: { id: string }; Body: { status?: string } }>("/api/orders/:id", async (req, reply) => {
    const session = await requireAdminSession(req);
    const status = String(req.body?.status ?? "").trim();
    if (!status) return reply.code(400).send({ error: "وضعیت لازم است." });

    // commerce orders move through the payment/fulfilment state machine only;
    // a free-text status write here would bypass stock, audit and shipping rules
    const commerce = await query<{ id: string }>(
      "select order_id as id from order_lines where order_id = $1 limit 1",
      [req.params.id],
    );
    if (commerce.rowCount) {
      return reply.code(409).send({
        error: "این سفارش از مسیر تجارت ثبت شده؛ وضعیتش را فقط از مسیر پرداخت/انبار تغییر بده.",
        code: "commerce_order_status_locked",
      });
    }
    const res = await query<{ data: unknown }>(
      "update orders set status = $1, data = jsonb_set(data, '{status}', to_jsonb($1::text)) where id = $2 returning data",
      [status, req.params.id],
    );
    if (!res.rows[0]) return reply.code(404).send({ error: "سفارش پیدا نشد." });
    await recordAudit({
      actor: actorOf(session),
      action: "order.legacy_status_change",
      targetType: "order",
      targetId: req.params.id,
      after: { status },
    });
    return { ok: true, order: res.rows[0].data };
  });

  app.get("/api/customers", async (req) => {
    await requireAdmin(req);
    const rows = await query(
      "select email, name, phone, size, addresses, two_factor, created_at from customers order by created_at desc",
    );
    return rows.rows;
  });

  app.get("/api/health", async () => {
    const counts = await query<{ products: number; orders: number; customers: number }>(
      `select
         (select count(*)::int from products) as products,
         (select count(*)::int from orders) as orders,
         (select count(*)::int from customers) as customers`,
    );
    return { ok: true, db: "postgres", ...counts.rows[0], time: new Date().toISOString() };
  });
}
