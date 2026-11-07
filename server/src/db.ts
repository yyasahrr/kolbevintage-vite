import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import { config } from "./config";

let pool: pg.Pool | null = null;
let embedded: EmbeddedPostgres | null = null;
let pgPort = config.pgPort;

function isFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

async function waitForPostgres(client: pg.Client, attempts = 40) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await client.query("select 1");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error("PostgreSQL did not become ready in time");
}

/**
 * Starts a real PostgreSQL cluster from the `embedded-postgres` binaries when
 * no DATABASE_URL is provided. The data directory persists between runs.
 */
/** the port of a cluster from this data directory that is still running, if any */
function runningClusterPort(): number | null {
  const pidFile = path.join(config.dataDir, "postmaster.pid");
  if (!fs.existsSync(pidFile)) return null;
  try {
    const lines = fs.readFileSync(pidFile, "utf8").split("\n");
    const pid = Number(lines[0]);
    const port = Number(lines[3]);
    if (Number.isFinite(pid) && pid > 0) {
      process.kill(pid, 0);
      return Number.isFinite(port) && port > 0 ? port : config.pgPort;
    }
  } catch {
    fs.rmSync(pidFile, { force: true });
  }
  return null;
}

/** creates the application database when the cluster predates it (tests, new installs) */
async function ensureDatabase(port: number) {
  const admin = new pg.Client({
    host: "127.0.0.1",
    port,
    user: config.pgUser,
    password: config.pgPassword,
    database: "postgres",
  });
  await admin.connect();
  try {
    const exists = await admin.query("select 1 from pg_database where datname = $1", [config.databaseName]);
    if (exists.rowCount === 0) {
      await admin.query(`create database "${config.databaseName.replace(/"/g, '""')}"`);
    }
  } finally {
    await admin.end();
  }
}

async function startEmbedded() {
  fs.mkdirSync(config.dataDir, { recursive: true });

  const running = runningClusterPort();
  if (running) {
    // reuse the cluster left running by a previous process instead of failing
    pgPort = running;
    await ensureDatabase(pgPort);
    return;
  }

  let port = config.pgPort;
  while (!(await isFree(port))) port += 1;
  pgPort = port;

  embedded = new EmbeddedPostgres({
    databaseDir: config.dataDir,
    user: config.pgUser,
    password: config.pgPassword,
    port,
    persistent: true,
    // Recent npm releases can block the platform package's postinstall; the
    // library verifies and restores its packaged symlinks when needed.
    autoRehydrateSymlinks: true,
  });

  if (!fs.existsSync(path.join(config.dataDir, "PG_VERSION"))) {
    await embedded.initialise();
  }
  await embedded.start();

  const admin = embedded.getPgClient("postgres", "127.0.0.1");
  await admin.connect();
  await waitForPostgres(admin);
  const exists = await admin.query("select 1 from pg_database where datname = $1", [config.databaseName]);
  if (exists.rowCount === 0) await embedded.createDatabase(config.databaseName);
  await admin.end();
}

export async function initDb() {
  if (config.databaseUrl) {
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
  } else {
    await startEmbedded();
    pool = new pg.Pool({
      host: "127.0.0.1",
      port: pgPort,
      user: config.pgUser,
      password: config.pgPassword,
      database: config.databaseName,
      max: 10,
    });
  }

  await migrate();
  return pool;
}

async function migrate() {
  const sql = fs.readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  await getPool().query(sql);
}

export function getPool(): pg.Pool {
  if (!pool) throw new Error("Database is not initialised");
  return pool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) {
  return getPool().query<T>(text, params);
}

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDb() {
  await pool?.end().catch(() => undefined);
  pool = null;
  try {
    await embedded?.stop();
  } catch {
    /* already stopped */
  }
  embedded = null;
}
