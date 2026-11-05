import type { FastifyInstance } from "fastify";
import { query } from "../db";
import { requirePermission } from "../http/rbac";

/* =====================================================================
   First-party analytics (decision 80).

   A visit is one page view with a random session id the browser keeps for the
   day. Nothing identifies a person: no cookie beyond the session id, no IP,
   no third-party script. The panel gets counts, top pages and a conversion
   rate computed from real orders, and says so when the sample is thin.
   ===================================================================== */

interface DailyRow {
  day: string;
  views: number;
  visits: number;
}

export async function analyticsRoutes(app: FastifyInstance) {
  /** Read-only order overview. No financial total is inferred from order status. */
  app.get<{ Querystring: { days?: string } }>("/api/admin/dashboard", async (req, reply) => {
    await requirePermission(req, "dashboard:view");
    await requirePermission(req, "orders:view");
    const days = Number(req.query.days ?? 30);
    if (![7, 30, 90].includes(days)) return reply.code(400).send({ error: "invalid_range" });
    // One boundary for every widget: rolling 24-hour periods, not browser-local calendar days.
    const end = new Date();
    const start = new Date(end.getTime() - days * 86400000);
    const args = [start.toISOString(), end.toISOString()];
    const where = "created_at >= $1::timestamptz and created_at < $2::timestamptz";
    const [counts, statuses, recent, products] = await Promise.all([
      query<{ total: number; settled: number; attention: number }>(
        `select count(*)::int as total, count(*) filter (where payment_status = 'settled')::int as settled,
         count(*) filter (where status in ('pending_payment','paid','preparing','exception','pending','processing'))::int as attention
         from orders where ${where}`, args),
      query<{ status: string | null; count: number }>(`select status, count(*)::int as count from orders where ${where} group by status order by count desc, status`, args),
      query<{ id: string; created_at: Date; status: string | null; payment_status: string | null }>(
        `select id, created_at, status, payment_status from orders where ${where} order by created_at desc, id desc limit 10`, args),
      query<{ product_id: string; name: string; quantity: number }>(
        `select l.product_id, min(l.name_snapshot) as name, sum(l.quantity)::int as quantity
         from order_lines l join orders o on o.id = l.order_id
         where o.created_at >= $1::timestamptz and o.created_at < $2::timestamptz
           and o.payment_status = 'settled' and l.product_id is not null
         group by l.product_id order by quantity desc, l.product_id limit 5`, args),
    ]);
    reply.header("Cache-Control", "no-store");
    return { days, start: args[0], end: args[1], counts: counts.rows[0], statuses: statuses.rows, recent: recent.rows, products: products.rows };
  });

  /** public, fire-and-forget beacon from the storefront */
  app.post<{ Body: { path?: string; session?: string; referrer?: string; device?: string } }>("/api/track", async (req, reply) => {
    const path = (req.body?.path ?? "").slice(0, 300);
    const session = (req.body?.session ?? "").slice(0, 64);
    if (!path || !session || !path.startsWith("/")) return reply.code(204).send();
    // the panel and API calls are not storefront visits
    if (path.startsWith("/admin") || path.startsWith("/api")) return reply.code(204).send();
    await query("insert into page_views (path, session, referrer, device) values ($1, $2, $3, $4)", [
      path,
      session,
      (req.body?.referrer ?? "").slice(0, 300) || null,
      (req.body?.device ?? "").slice(0, 20) || null,
    ]);
    return reply.code(204).send();
  });

  app.get<{ Querystring: { days?: string } }>("/api/admin/analytics", async (req) => {
    await requirePermission(req, "dashboard:view");
    const days = Math.min(90, Math.max(1, Number(req.query.days ?? 14) || 14));

    const daily = (
      await query<DailyRow>(
        `select to_char(date_trunc('day', at), 'YYYY-MM-DD') as day,
                count(*)::int as views,
                count(distinct session)::int as visits
           from page_views
          where at >= now() - ($1 || ' days')::interval
          group by 1
          order by 1`,
        [String(days)],
      )
    ).rows;

    const top = (
      await query<{ path: string; views: number }>(
        `select path, count(*)::int as views
           from page_views
          where at >= now() - ($1 || ' days')::interval
          group by 1
          order by views desc
          limit 10`,
        [String(days)],
      )
    ).rows;

    const totals = (
      await query<{ views: number; visits: number; sources: number }>(
        `select count(*)::int as views,
                count(distinct session)::int as visits,
                count(distinct coalesce(nullif(referrer, ''), 'direct'))::int as sources
           from page_views
          where at >= now() - ($1 || ' days')::interval`,
        [String(days)],
      )
    ).rows[0];

    const orders = (
      await query<{ n: number }>(
        `select count(*)::int as n from orders where created_at >= now() - ($1 || ' days')::interval`,
        [String(days)],
      )
    ).rows[0].n;

    const referrers = (
      await query<{ source: string; visits: number }>(
        `select coalesce(nullif(referrer, ''), 'مستقیم') as source, count(distinct session)::int as visits
           from page_views
          where at >= now() - ($1 || ' days')::interval
          group by 1
          order by visits desc
          limit 8`,
        [String(days)],
      )
    ).rows;

    const devices = (
      await query<{ device: string; views: number }>(
        `select coalesce(device, 'نامشخص') as device, count(*)::int as views
           from page_views
          where at >= now() - ($1 || ' days')::interval
          group by 1
          order by views desc`,
        [String(days)],
      )
    ).rows;

    return {
      days,
      totals: { ...totals, orders, conversion: totals.visits ? orders / totals.visits : 0 },
      daily,
      top,
      referrers,
      devices,
      /** the panel must not draw conclusions from a handful of visits */
      sampleTooSmall: totals.visits < 30,
    };
  });
  /**
   * Abandoned carts (decision 65).
   *
   * A cart counts as abandoned when it is still open, has at least one line and
   * nobody touched it for the hours passed in `idle` (default 6). The value is
   * the price that was recorded on the line when the shopper added it — the
   * panel says so instead of pretending it is a live quote.
   */
  app.get<{ Querystring: { idle?: string } }>("/api/admin/abandoned-carts", async (req) => {
    await requirePermission(req, "orders:view");
    const idle = Math.min(720, Math.max(1, Number(req.query.idle ?? 6) || 6));
    const rows = (
      await query<{
        id: string;
        email: string | null;
        updated_at: string;
        lines: number;
        qty: number;
        value: number;
        items: string[];
      }>(
        `select c.id,
                c.customer_email as email,
                c.updated_at::text as updated_at,
                count(cl.id)::int as lines,
                coalesce(sum(cl.quantity), 0)::int as qty,
                coalesce(sum(cl.quantity * cl.added_price), 0)::float8 as value,
                coalesce(array_agg(coalesce(p.name, pv.sku) order by cl.created_at), '{}') as items
           from carts c
           join cart_lines cl on cl.cart_id = c.id
           left join product_variants pv on pv.id = cl.variant_id
           left join products p on p.id = pv.product_id
          where c.status = 'open'
            and c.updated_at <= now() - ($1 || ' hours')::interval
          group by c.id, c.customer_email, c.updated_at
          order by value desc
          limit 50`,
        [String(idle)],
      )
    ).rows;

    return {
      idleHours: idle,
      carts: rows,
      totals: {
        carts: rows.length,
        value: rows.reduce((n, r) => n + Number(r.value), 0),
        withEmail: rows.filter((r) => r.email).length,
      },
    };
  });
}
