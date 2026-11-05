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
}
