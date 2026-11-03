import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "../..");

export const config = {
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 4000),
  /** when set, the server connects to an external PostgreSQL instead of the embedded one */
  databaseUrl: process.env.DATABASE_URL,
  databaseName: process.env.PGDATABASE ?? "kolbevintage",
  pgUser: process.env.PGUSER ?? "kolbe",
  pgPassword: process.env.PGPASSWORD ?? "kolbe",
  pgPort: Number(process.env.PGPORT ?? 55432),
  dataDir: process.env.PGDATA_DIR ?? path.join(ROOT, "server/.pgdata"),
  uploadsDir: process.env.UPLOADS_DIR ?? path.join(ROOT, "server/uploads"),
  seedFile: path.join(ROOT, "server/seed/state.json"),
  /** serve the built single-page app from dist/ when present (production mode) */
  serveStatic: process.env.SERVE_STATIC === "1",
  distDir: path.join(ROOT, "dist"),
  isProd: process.env.NODE_ENV === "production",
  /** protect admin mutations with the session cookie (set to "1" in production) */
  requireAdminAuth: process.env.REQUIRE_ADMIN_AUTH === "1",
  /**
   * Separate passcode for the protected superadmin subject. Refund approval
   * is fail-closed: with no passcode configured nobody can elevate, so live
   * money movement stays blocked.
   */
  superadminPasscode: process.env.SUPERADMIN_PASSCODE ?? "",
  sessionDays: 30,
};
