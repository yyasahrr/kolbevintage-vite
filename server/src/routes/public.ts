import type { FastifyInstance } from "fastify";
import { query } from "../db";
import { requirePermission } from "../http/rbac";

/* =====================================================================
   Small public reads the storefront widgets need (decision 75, batch 2).

   Why these exist at all: a shopper's browser never receives orders, so a
   "best sellers" widget computed on the client would only ever work for a
   logged-in admin — it would look installed and stay empty for real
   customers. These endpoints hand back aggregates (product id + count),
   never a customer, an email or an order.
   ===================================================================== */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function publicRoutes(app: FastifyInstance) {
  /** how many units of each product were actually sold, cancelled orders excluded */
  app.get<{ Querystring: { limit?: string } }>("/api/public/best-sellers", async (req) => {
    const limit = Math.min(24, Math.max(1, Number(req.query.limit ?? 8) || 8));
    const res = await query<{ product_id: string; sold: number }>(
      `select ol.product_id, sum(ol.quantity)::int as sold
         from order_lines ol
         join orders o on o.id = ol.order_id
        where ol.product_id is not null
          and coalesce(o.status, '') <> 'cancelled'
        group by ol.product_id
        order by sold desc, ol.product_id
        limit $1`,
      [limit],
    );
    return { items: res.rows.map((row) => ({ productId: row.product_id, sold: Number(row.sold) })) };
  });

  /** how many times this product page was opened (first-party counting only) */
  app.get<{ Params: { id: string } }>("/api/public/product-views/:id", async (req) => {
    const id = String(req.params.id).slice(0, 80);
    const res = await query<{ views: number }>(
      `select count(*)::int as views from page_views where path like $1`,
      [`/product/${id}%`],
    );
    return { views: Number(res.rows[0]?.views ?? 0) };
  });

  /** the same counter for a journal article (path is validated, never raw SQL input) */
  app.get<{ Querystring: { path?: string } }>("/api/public/page-views", async (req) => {
    const path = String(req.query.path ?? "").slice(0, 120);
    if (!/^\/(product|journal)\/[A-Za-z0-9._-]+$/.test(path)) {
      return { views: 0 };
    }
    const res = await query<{ views: number }>(
      `select count(*)::int as views from page_views where path = $1 or path like $2`,
      [path, `${path}?%`],
    );
    return { views: Number(res.rows[0]?.views ?? 0) };
  });

  /** newsletter sign-up from the storefront widget */
  app.post<{ Body: { email?: string; source?: string } | undefined }>("/api/newsletter", async (req, reply) => {
    const email = (req.body?.email ?? "").trim().toLowerCase().slice(0, 160);
    if (!EMAIL.test(email)) {
      return reply.code(400).send({ ok: false, code: "invalid_email", error: "نشانی ایمیل درست نیست." });
    }
    const source = (req.body?.source ?? "storefront").slice(0, 40);
    const res = await query<{ inserted: boolean }>(
      `insert into newsletter_subscribers (email, source) values ($1, $2)
       on conflict (email) do nothing
       returning true as inserted`,
      [email, source],
    );
    // a repeat sign-up is a normal event, not an error the shopper should see
    return { ok: true, already: res.rows.length === 0 };
  });

  /** the panel's view of the list */
  app.get("/api/admin/newsletter", async (req) => {
    await requirePermission(req, "customers:view");
    const [count, recent] = await Promise.all([
      query<{ n: number }>("select count(*)::int as n from newsletter_subscribers"),
      query<{ email: string; source: string | null; created_at: string }>(
        "select email, source, created_at::text from newsletter_subscribers order by created_at desc limit 50",
      ),
    ]);
    return { total: Number(count.rows[0]?.n ?? 0), recent: recent.rows };
  });
}
