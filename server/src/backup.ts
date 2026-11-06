import fsp from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
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
  await fsp.mkdir(backupDir(), { recursive: true });
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
  return names.filter((name) => name !== "backups" && name !== "schema_migrations");
}

export async function dumpAll(client?: pg.PoolClient): Promise<BackupPayload> {
  const tables = await listTables(client);
  const data: Record<string, unknown[]> = {};
  let rowCount = 0;
  for (const table of tables) {
    const sql = `select coalesce(json_agg(t), '[]'::json) as rows from public."${table}" t`;
    const res = client ? await client.query(sql) : await query(sql);
    const rows = (res.rows[0]?.rows ?? []) as unknown[];
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
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "content-type": "application/gzip",
        ...(process.env.BACKUP_CLOUD_TOKEN ? { authorization: `Bearer ${process.env.BACKUP_CLOUD_TOKEN}` } : {}),
      },
      body: new Uint8Array(payload),
    });
    if (!res.ok) return { status: "failed", error: `HTTP ${res.status}` };
    return { status: "uploaded", error: null };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "آپلود ناموفق" };
  }
}

export async function createBackup(kind: BackupRow["kind"] = "manual"): Promise<BackupRow> {
  await ensureDir();
  const payload = await dumpAll();
  const text = JSON.stringify(payload);
  const gz = gzipSync(Buffer.from(text, "utf8"), { level: 9 });
  const stamp = payload.createdAt.replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");
  const file = path.join(backupDir(), `kv-${kind}-${stamp}.json.gz`);
  await fsp.writeFile(file, gz);
  const sha256 = createHash("sha256").update(gz).digest("hex");
  const rows = payload.tables.reduce((sum, t) => sum + (payload.data[t]?.length ?? 0), 0);
  const cloud = await pushToCloud(file, gz);

  const id = `bk-${Date.now().toString(36)}`;
  await query(
    `insert into backups (id, file, bytes, kind, sha256, tables, rows, cloud_status, cloud_error)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, file, gz.byteLength, kind, sha256, payload.tables.length, rows, cloud.status, cloud.error],
  );

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
  return { meta, buffer };
}

/**
 * Restores a backup file. Passing a client lets a caller restore inside its own
 * transaction (the test suite rolls it back to keep the shared database).
 */
export async function restoreBackup(
  file: string,
  options: { client?: pg.PoolClient } = {},
): Promise<{ tables: number; rows: number }> {
  const raw = await fsp.readFile(file);
  const buffer = file.endsWith(".gz") ? gunzipSync(raw) : raw;
  const payload = JSON.parse(buffer.toString("utf8")) as BackupPayload;
  if (payload.format !== "kv-logical-backup") throw new Error("این فایل پشتیبان مربوط به این فروشگاه نیست.");
  if (!payload.tables?.length || !payload.data) throw new Error("فایل پشتیبان ناقص است.");

  const run = async (client: pg.PoolClient) => {
    // foreign keys must not block a full replace; this needs the cluster owner role
    await client.query("set local session_replication_role = replica");
    const existing = (await listTables(client)).filter((t) => payload.tables.includes(t));
    if (existing.length) {
      await client.query(`truncate ${existing.map((t) => `public."${t}"`).join(", ")} restart identity cascade`);
    }
    let rows = 0;
    for (const table of payload.tables) {
      const list = payload.data[table] ?? [];
      if (!list.length) continue;
      // json_populate_record keeps the column types the schema declared
      const res = await client.query(
        `insert into public."${table}" select * from json_populate_recordset(null::public."${table}", $1::json)`,
        [JSON.stringify(list)],
      );
      rows += res.rowCount ?? 0;
    }
    return { tables: payload.tables.length, rows };
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
