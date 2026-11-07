import fsp from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { parse as parseLossless, stringify as stringifyLossless } from "lossless-json";
import { gzipSync, gunzipSync } from "node:zlib";
import type pg from "pg";
import { query, withTransaction } from "./db";
import { config } from "./config";

/* =====================================================================
   Backups (decisions 11 + 85).

   There is no `pg_dump` binary in this deployment (the embedded PostgreSQL
   ships initdb/pg_ctl/postgres only), so a backup is a *logical* one:
   every public table exported as JSON plus the exact schema file the server
   boots from. `restoreBackup()` reads that file straight back, which is what
   makes it a backup and not decoration.

   Cloud copy is a plain authenticated HTTP PUT to BACKUP_CLOUD_ENDPOINT.
   Without that variable the panel says "not configured" — it never pretends a
   copy exists.
   ===================================================================== */

export interface BackupRow {
  id: string;
  file: string;
  bytes: number;
  kind: "manual" | "nightly";
  sha256: string;
  tables: number;
  rows: number;
  created_at: string;
  cloud_status: "not_configured" | "uploaded" | "failed";
  cloud_error: string | null;
}

export interface BackupPayload {
  format: "kv-logical-backup";
  version: 1;
  createdAt: string;
  schema: string;
  tables: string[];
  data: Record<string, unknown[]>;
}

const BACKUP_DIR = process.env.BACKUP_DIR ?? path.join(config.uploadsDir, "..", ".backups");
const NIGHTLY_HOUR = Number(process.env.BACKUP_HOUR ?? 3);
const KEEP = Number(process.env.BACKUP_KEEP ?? 14);

const backupDir = () => path.resolve(BACKUP_DIR);

/** bigint columns arrive as strings from pg; the panel needs real numbers */
const BACKUP_COLUMNS = `select id, file, bytes::int as bytes, kind, sha256, tables, rows,
                               created_at, cloud_status, cloud_error from backups`;

async function ensureDir() {
  await fsp.mkdir(backupDir(), { recursive: true, mode: 0o700 });
}

/** table names in the order the schema creates them (children after parents) */
async function listTables(client?: pg.PoolClient): Promise<string[]> {
  const sql = `select c.relname as name
                 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relkind = 'r'
                order by c.relname`;
  const res = client ? await client.query(sql) : await query(sql);
  const names = res.rows.map((row) => String(row.name));
  // the backup table itself is bookkeeping, not shop data
  return names.filter((name) => name !== "backups" && name !== "schema_migrations" && name !== "sessions");
}

export async function dumpAll(client?: pg.PoolClient): Promise<BackupPayload> {
  const tables = await listTables(client);
  const data: Record<string, unknown[]> = {};
  let rowCount = 0;
  for (const table of tables) {
    const quoted = `"${table.replace(/"/g, '""')}"`;
    // Parse database JSON losslessly: bigint and numeric values must not be
    // rounded to JavaScript Number while making a financial backup.
    const sql = `select coalesce(json_agg(t), '[]'::json)::text as rows from public.${quoted} t`;
    const res = client ? await client.query(sql) : await query(sql);
    const rows = parseLossless(res.rows[0]?.rows ?? "[]") as unknown[];
    data[table] = rows;
    rowCount += rows.length;
  }
  const schemaPath = path.join(process.cwd(), "server", "src", "schema.sql");
  const schema = await fsp.readFile(schemaPath, "utf8").catch(() => "-- schema.sql not found next to the server");
  return {
    format: "kv-logical-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    schema,
    tables,
    data,
  };
}

async function pushToCloud(file: string, payload: Buffer): Promise<{ status: BackupRow["cloud_status"]; error: string | null }> {
  const endpoint = process.env.BACKUP_CLOUD_ENDPOINT;
  if (!endpoint) return { status: "not_configured", error: null };
  const url = `${endpoint.replace(/\/$/, "")}/${path.basename(file)}`;
  try {
    if (config.isProd && (new URL(url).protocol !== "https:" || !process.env.BACKUP_CLOUD_TOKEN)) return {status:"failed",error:"production cloud backups require HTTPS and an authentication token"};
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "content-type": "application/gzip",
        ...(process.env.BACKUP_CLOUD_TOKEN ? { authorization: `Bearer ${process.env.BACKUP_CLOUD_TOKEN}` } : {}),
      },
      body: new Uint8Array(payload),
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { status: "failed", error: `HTTP ${res.status}` };
    return { status: "uploaded", error: null };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "آپلود ناموفق" };
  }
}

export async function createBackup(kind: BackupRow["kind"] = "manual"): Promise<BackupRow> {
  await ensureDir();
  // All tables must describe one consistent point in time, not separate
  // read-committed snapshots from before/after an order or stock update.
  const payload = await withTransaction(async client => {
    await client.query("set transaction isolation level repeatable read read only");
    return dumpAll(client);
  });
  const text = stringifyLossless(payload);
  if (!text) throw new Error("ساخت پشتیبان ناموفق بود.");
  const gz = gzipSync(Buffer.from(text, "utf8"), { level: 9 });
  const stamp = payload.createdAt.replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
  const file = path.join(backupDir(), `kv-${kind}-${stamp}-${randomUUID()}.json.gz`);
  await fsp.writeFile(file, gz, { mode: 0o600, flag: "wx" });
  const sha256 = createHash("sha256").update(gz).digest("hex");
  const rows = payload.tables.reduce((sum, t) => sum + (payload.data[t]?.length ?? 0), 0);
  const cloud = await pushToCloud(file, gz);

  const id = `bk-${randomUUID()}`;
  try {
    await query(
      `insert into backups (id, file, bytes, kind, sha256, tables, rows, cloud_status, cloud_error)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, file, gz.byteLength, kind, sha256, payload.tables.length, rows, cloud.status, cloud.error],
    );
  } catch (error) {
    await fsp.rm(file, { force: true }).catch(() => undefined);
    throw error;
  }

  // keep the newest KEEP files on disk and in the list
  const old = await query<{ id: string; file: string }>(
    `select id, file from backups order by created_at desc offset $1`,
    [KEEP],
  );
  for (const row of old.rows) {
    await fsp.rm(row.file, { force: true }).catch(() => undefined);
    await query("delete from backups where id = $1", [row.id]);
  }

  const saved = await query<BackupRow>(`${BACKUP_COLUMNS} where id = $1`, [id]);
  return saved.rows[0];
}

export async function listBackups(): Promise<BackupRow[]> {
  const res = await query<BackupRow>(`${BACKUP_COLUMNS} order by created_at desc limit 50`);
  return res.rows;
}

export async function readBackup(id: string): Promise<{ meta: BackupRow; buffer: Buffer } | null> {
  const res = await query<BackupRow>(`${BACKUP_COLUMNS} where id = $1`, [id]);
  const meta = res.rows[0];
  if (!meta) return null;
  const buffer = await fsp.readFile(meta.file).catch(() => null);
  if (!buffer) return null;
  if (createHash("sha256").update(buffer).digest("hex") !== meta.sha256) throw new Error("فایل پشتیبان با اثرانگشت ثبت‌شده مطابقت ندارد.");
  return { meta, buffer };
}

/**
 * Restores a backup file. Passing a client lets a caller restore inside its own
 * transaction (the test suite rolls it back to keep the shared database).
 */
export async function restoreBackup(
  file: string,
  options: { client?: pg.PoolClient; allowEmptyJournalFromOlderBackup?: boolean; allowEmptySupportFromOlderBackup?: boolean } = {},
): Promise<{ tables: number; rows: number }> {
  const raw = await fsp.readFile(file);
  const buffer = file.endsWith(".gz") ? gunzipSync(raw) : raw;
  const payload = parseLossless(buffer.toString("utf8")) as BackupPayload;
  if (payload.format !== "kv-logical-backup") throw new Error("این فایل پشتیبان مربوط به این فروشگاه نیست.");
  if (String(payload.version) !== "1" || !Array.isArray(payload.tables) || !payload.tables.length || !payload.data || typeof payload.data !== "object") throw new Error("فایل پشتیبان ناقص یا نسخهٔ آن پشتیبانی نمی‌شود.");

  const run = async (client: pg.PoolClient) => {
    // Validate names against the current schema before using any identifier or
    // truncating anything. Older backups may contain sessions, which are always
    // invalidated on restore rather than reviving bearer tokens.
    const existing = await listTables(client);
    const backupTables = payload.tables.filter(t => t !== "sessions");
    const expected = new Set(existing), supplied = new Set(backupTables);
    const missing = existing.filter(t => !supplied.has(t));
    // Missing tables require their own explicit opt-in; full restore still
    // truncates those tables. Unknown schema mismatches never pass silently.
    const explicitlyAllowed = new Set<string>();
    if(options.allowEmptyJournalFromOlderBackup) explicitlyAllowed.add("journal_articles");
    if(options.allowEmptySupportFromOlderBackup) explicitlyAllowed.add("support_tickets");
    const allowedMissing = missing.every(name=>explicitlyAllowed.has(name) && !Object.prototype.hasOwnProperty.call(payload.data,name));
    if (supplied.size !== backupTables.length || backupTables.some(t => typeof t !== "string" || !expected.has(t)) ||
        (missing.length !== 0 && !allowedMissing) || payload.tables.some(t => !Array.isArray(payload.data[t]))) {
      throw new Error("جدول‌های پشتیبان با نسخهٔ پایگاه داده مطابقت ندارند.");
    }
    const ident = (name:string) => `"${name.replace(/"/g, '""')}"`;
    // Foreign keys and append-only triggers must not block a full replace;
    // this requires an appropriately privileged database maintenance role.
    await client.query("set local session_replication_role = replica");
    await client.query(`truncate ${[...existing,"sessions"].map(t => `public.${ident(t)}`).join(", ")} restart identity cascade`);
    let rows = 0;
    for (const table of backupTables) {
      const list = payload.data[table];
      if (!list.length) continue;
      // Backups from before the independent shipping benefit lack this
      // NOT NULL column. json_populate_recordset supplies NULL, not defaults.
      // Only an absent field is upgraded; an explicitly corrupt NULL still fails.
      const restored = table === "price_rules" ? list.map(row => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return row;
        return Object.prototype.hasOwnProperty.call(row, "free_shipping") ? row : { ...row, free_shipping: false };
      }) : list;
      const json = stringifyLossless(restored);
      const safeTable = ident(table);
      const res = await client.query(
        `insert into public.${safeTable} select * from json_populate_recordset(null::public.${safeTable}, $1::json)`,
        [json],
      );
      rows += res.rowCount ?? 0;
    }
    // Explicit IDs do not advance PostgreSQL sequences. ALTER SEQUENCE RESTART
    // is transactional (unlike setval), and prevents post-restore collisions.
    const sequences = await client.query<{table_name:string;column_name:string;sequence_name:string;start_value:string;increment_by:string}>(`
      select t.relname as table_name, a.attname as column_name,
             format('%I.%I', ns.nspname, seq.relname) as sequence_name,
             ps.start_value::text, ps.increment_by::text
        from pg_class seq
        join pg_namespace ns on ns.oid=seq.relnamespace
        join pg_depend dep on dep.objid=seq.oid and dep.deptype in ('a','i')
        join pg_class t on t.oid=dep.refobjid
        join pg_namespace tn on tn.oid=t.relnamespace
        join pg_attribute a on a.attrelid=t.oid and a.attnum=dep.refobjsubid
        join pg_sequences ps on ps.schemaname=ns.nspname and ps.sequencename=seq.relname
       where seq.relkind='S' and tn.nspname='public' and t.relname = any($1::text[])`, [backupTables]);
    for (const seq of sequences.rows) {
      const increment=BigInt(seq.increment_by);
      if (increment <= 0n) throw new Error("بازیابی دنبالهٔ کاهشی پشتیبانی نمی‌شود.");
      const maximum = await client.query<{max:string|null}>(`select max(${ident(seq.column_name)})::text as max from public.${ident(seq.table_name)}`);
      const next = maximum.rows[0].max === null ? BigInt(seq.start_value) : BigInt(maximum.rows[0].max) + increment;
      await client.query(`alter sequence ${seq.sequence_name} restart with ${next}`);
    }
    return { tables: backupTables.length, rows };
  };

  if (options.client) return run(options.client);
  return withTransaction(run);
}

/** true when a nightly backup already exists for the current local date */
export async function hasNightlyFor(date: string): Promise<boolean> {
  const res = await query(
    "select 1 from backups where kind = 'nightly' and created_at::date = $1::date limit 1",
    [date],
  );
  return res.rows.length > 0;
}

export function backupSchedule(): { hour: number; keep: number; cloudConfigured: boolean; dir: string } {
  return {
    hour: NIGHTLY_HOUR,
    keep: KEEP,
    cloudConfigured: Boolean(process.env.BACKUP_CLOUD_ENDPOINT),
    dir: backupDir(),
  };
}

/** runs every 15 minutes and takes at most one nightly backup per day */
export function startBackupScheduler() {
  const tick = async () => {
    const now = new Date();
    if (now.getHours() < NIGHTLY_HOUR) return;
    const today = now.toISOString().slice(0, 10);
    if (await hasNightlyFor(today)) return;
    await createBackup("nightly");
  };
  const timer = setInterval(() => {
    tick().catch(() => undefined);
  }, 15 * 60 * 1000);
  timer.unref?.();
  // one attempt shortly after boot, so a server restarted daily still backs up
  setTimeout(() => {
    tick().catch(() => undefined);
  }, 20_000).unref?.();
  return () => clearInterval(timer);
}
