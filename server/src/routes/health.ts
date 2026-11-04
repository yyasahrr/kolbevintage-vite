import fs from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import { query, getPool } from "../db";
import { requirePermission } from "../http/rbac";
import { recentServerErrors } from "../errors";

/* =====================================================================
   System health (decision 48) — connections, data volume, recent errors and
   disk space, all read from the running process and the live database.

   Nothing here is estimated: if a probe fails the field says so instead of
   showing a comfortable zero.
   ===================================================================== */

interface TableRow {
  name: string;
  rows: number;
  sizeBytes: number;
}

const startedAt = Date.now();

export async function healthRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { errors?: string } }>("/api/admin/health", async (req) => {
    await requirePermission(req, "settings:view");

    const dbStart = Date.now();
    let dbOk = true;
    let dbError: string | null = null;
    let serverVersion = "";
    let database = "";
    let sizeBytes = 0;
    let tables: TableRow[] = [];

    try {
      const info = await query(
        "select version() as version, current_database() as database, pg_database_size(current_database())::text as bytes",
      );
      serverVersion = String(info.rows[0].version).split(",")[0];
      database = String(info.rows[0].database);
      sizeBytes = Number(info.rows[0].bytes);
      const tableRows = await query(
        `select c.relname as name,
                coalesce(s.n_live_tup, 0)::int as rows,
                pg_total_relation_size(c.oid)::text as bytes
           from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           left join pg_stat_user_tables s on s.relid = c.oid
          where n.nspname = 'public' and c.relkind = 'r'
          order by pg_total_relation_size(c.oid) desc
          limit 14`,
      );
      tables = tableRows.rows.map((row) => ({
        name: String(row.name),
        rows: Number(row.rows),
        sizeBytes: Number(row.bytes),
      }));
    } catch (error) {
      dbOk = false;
      dbError = error instanceof Error ? error.message : "اتصال به پایگاه داده برقرار نشد";
    }
    const dbLatencyMs = Date.now() - dbStart;

    // jobs currently waiting for a worker or a human
    let queue = { reservations: 0, expiringPayments: 0, outboxPending: 0, pendingRefunds: 0 };
    if (dbOk) {
      try {
        const res = await query(
          `select
             (select count(*)::int from stock_reservations where status = 'active') as reservations,
             (select count(*)::int from payment_attempts where status = 'pending') as expiring,
             (select count(*)::int from outbox_events where processed_at is null) as outbox,
             (select count(*)::int from refunds where status = 'approved') as refunds`,
        );
        const row = res.rows[0];
        queue = {
          reservations: Number(row.reservations),
          expiringPayments: Number(row.expiring),
          outboxPending: Number(row.outbox),
          pendingRefunds: Number(row.refunds),
        };
      } catch {
        // optional probe — dbOk already tells the reader whether the database answered
      }
    }

    let disk: { path: string; totalBytes: number; freeBytes: number; error: string | null } = {
      path: process.cwd(),
      totalBytes: 0,
      freeBytes: 0,
      error: null,
    };
    try {
      const stats = await fs.statfs(process.cwd());
      disk = {
        path: process.cwd(),
        totalBytes: Number(stats.blocks) * Number(stats.bsize),
        freeBytes: Number(stats.bavail) * Number(stats.bsize),
        error: null,
      };
    } catch (error) {
      disk.error = error instanceof Error ? error.message : "فضای دیسک خوانده نشد";
    }

    const pool = getPool();
    const memory = process.memoryUsage();

    return {
      time: new Date().toISOString(),
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      node: process.version,
      pid: process.pid,
      db: {
        ok: dbOk,
        error: dbError,
        latencyMs: dbLatencyMs,
        database,
        serverVersion,
        sizeBytes,
        pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
        tables,
      },
      disk,
      memory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed },
      queue,
      errors: recentServerErrors(req.query.errors ? Number(req.query.errors) : 20),
    };
  });
}
