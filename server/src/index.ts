import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { config } from "./config";
import { closeDb, initDb, query } from "./db";
import { seedDatabase } from "./seed";
import { authRoutes } from "./routes/auth";
import { catalogRoutes } from "./routes/catalog";
import { stateRoutes } from "./routes/state";
import { uploadRoutes } from "./routes/uploads";
import { commerceRoutes } from "./commerce/routes";
import { ensureCommerceSettings } from "./commerce/settings";
import { syncPromotions } from "./commerce/promotions";
import { syncVariants } from "./commerce/variants";
import { expireReservations } from "./commerce/inventory";
import { expirePaymentAttempts } from "./commerce/payments";
import { startOutboxWorker, stopOutboxWorker } from "./commerce/outbox";
import { getDocument } from "./seed";

export async function buildServer() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: 30 * 1024 * 1024,
    trustProxy: true,
  });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

  // same-origin in dev (Vite proxy); permissive for direct API calls in the prototype
  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (origin) {
      reply.header("Access-Control-Allow-Origin", origin);
      reply.header("Access-Control-Allow-Credentials", "true");
      reply.header("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      reply.header("Access-Control-Allow-Headers", "content-type");
      return reply.code(204).send();
    }
  });

  // must be registered before the route plugins, otherwise their encapsulated
  // contexts keep Fastify's default error shape
  app.setErrorHandler((error, req, reply) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error(error);
    const code = (error as { code?: string }).code;
    const details = (error as { details?: unknown }).details;
    reply.code(status).send({
      error: error instanceof Error ? error.message : "خطای سرور",
      ...(code ? { code } : {}),
      ...(details === undefined ? {} : { details }),
    });
  });

  fs.mkdirSync(config.uploadsDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: config.uploadsDir,
    prefix: "/uploads/",
    decorateReply: false,
    cacheControl: true,
    maxAge: "7d",
  });

  await app.register(stateRoutes);
  await app.register(authRoutes);
  await app.register(catalogRoutes);
  await app.register(uploadRoutes);
  await app.register(commerceRoutes);

  if (config.serveStatic && fs.existsSync(path.join(config.distDir, "index.html"))) {
    await app.register(fastifyStatic, {
      root: config.distDir,
      prefix: "/",
      decorateReply: false,
      wildcard: false,
    });
    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith("/api/") || req.url.startsWith("/uploads/")) {
        return reply.code(404).send({ error: "not found" });
      }
      reply.type("text/html");
      return fs.createReadStream(path.join(config.distDir, "index.html"));
    });
  }

  return app;
}

async function main() {
  await initDb();
  await seedDatabase();
  await ensureCommerceSettings();

  // the catalogue is the source of variants; campaigns are the source of prices
  const adminDoc = (await getDocument<Record<string, unknown>>("admin")) ?? {};
  await syncPromotions(adminDoc);
  await syncVariants();

  const counts = await query<{ products: number }>("select count(*)::int as products from products");
  const app = await buildServer();
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`API ready — ${counts.rows[0].products} products in PostgreSQL`);

  // reservation expiry + outbox delivery keep running in the background
  startOutboxWorker();
  const sweeper = setInterval(() => {
    expireReservations().catch(() => undefined);
    expirePaymentAttempts().catch(() => undefined);
  }, 15_000);
  sweeper.unref?.();

  const shutdown = async () => {
    clearInterval(sweeper);
    stopOutboxWorker();
    await app.close().catch(() => undefined);
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const isEntry = process.argv[1] && import.meta.url === `file://${path.resolve(process.argv[1])}`;
if (isEntry) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
