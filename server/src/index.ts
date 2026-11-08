import { panelPathRoutes } from "./routes/panel-path";
import { panelPath } from "./panel-path";
import fastifyReplyFrom from "@fastify/reply-from";
import { adminMfaRoutes } from "./routes/admin-mfa";
import { studioDraftRoutes, studioPageRoutes, studioLifecycleRoutes } from "./routes/studio-drafts";
import { customLookRoutes } from "./routes/custom-looks";
import { homeCategoryRoutes } from "./routes/home-categories";
import { colorLibraryRoutes } from "./routes/color-library";
import { measurementRoutes } from "./routes/measurements";
import { supportRoutes } from "./routes/support";
import { customerLabelRoutes } from "./routes/customer-labels";
import { journalRoutes } from "./routes/journal";
import { stylePackRoutes } from "./routes/style-packs";
import { sizeSetRoutes } from "./routes/size-sets";
import { categoryRoutes } from "./routes/categories";
import fs from "node:fs";
import path from "node:path";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import fastifyProxy from "@fastify/http-proxy";
import { config } from "./config";
import { CommerceError } from "./commerce/errors";
import { closeDb, initDb, query } from "./db";
import { seedDatabase } from "./seed";
import { authRoutes } from "./routes/auth";
import { catalogRoutes } from "./routes/catalog";
import { stateRoutes } from "./routes/state";
import { uploadRoutes } from "./routes/uploads";
import { commerceRoutes } from "./commerce/routes";
import { rbacRoutes } from "./routes/rbac";
import { healthRoutes } from "./routes/health";
import { backupRoutes } from "./routes/backup";
import { analyticsRoutes } from "./routes/analytics";
import { smsRoutes } from "./routes/sms";
import { maintenanceRoutes } from "./routes/maintenance";
import { publicRoutes } from "./routes/public";
import { galleryRoutes } from "./routes/gallery";
import { adminLiveRoutes } from "./routes/admin-live";
import { startBackupScheduler } from "./backup";
import { recordServerError } from "./errors";
import { seedRbac } from "./http/rbac";
import { ensureCommerceSettings } from "./commerce/settings";
import { syncPromotions } from "./commerce/promotions";
import { syncVariants } from "./commerce/variants";
import { expireReservations } from "./commerce/inventory";
import { expirePaymentAttempts } from "./commerce/payments";
import { releasePendingCashback } from "./commerce/cashback";
import { startOutboxWorker, stopOutboxWorker } from "./commerce/outbox";
import { getDocument } from "./seed";
import { registerSecurity } from "./http/security";

export async function buildServer() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    bodyLimit: 30 * 1024 * 1024,
    // Only explicitly trusted reverse proxies may supply client IP/protocol.
    // Never accept an unrestricted boolean trust setting from the network.
    trustProxy: (process.env.TRUST_PROXY ?? "").split(",").map(v => v.trim()).filter(Boolean),
  });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

  // The SPA talks to the API same-origin (Vite proxy in dev, Fastify in prod).
  // Credentialed CORS is therefore limited to the request's own host plus an
  // explicit allow-list — reflecting every Origin would let any site drive the
  // admin session with the user's cookies.
  const extraOrigins = new Set(
    (process.env.CORS_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (origin) {
      const sameHost = origin === `${req.protocol}://${req.headers.host}`;
      if (sameHost || extraOrigins.has(origin)) {
        reply.header("Access-Control-Allow-Origin", origin);
        reply.header("Access-Control-Allow-Credentials", "true");
        reply.header("Vary", "Origin");
      }
    }
    if (req.method === "OPTIONS") {
      reply.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      reply.header("Access-Control-Allow-Headers", "content-type,x-csrf-token,x-provider-signature");
      return reply.code(204).send();
    }
  });

  // headers, CSRF and rate limits must run before any route handler
  registerSecurity(app);

  // must be registered before the route plugins, otherwise their encapsulated
  // contexts keep Fastify's default error shape
  app.setErrorHandler((error, req, reply) => {
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) req.log.error(error);
    if (status >= 500) {
      recordServerError({
        method: req.method,
        url: req.url,
        status,
        message: error instanceof Error ? error.message : "خطای سرور",
        code: (error as { code?: string }).code ?? null,
      });
    }
    const code = (error as { code?: string }).code;
    const details = (error as { details?: unknown }).details;
    reply.code(status).send({
      error: status >= 500 && config.isProd && !(error instanceof CommerceError) ? "خطای داخلی سرور." : error instanceof Error ? error.message : "خطای سرور",
      ...(code && !(status >= 500 && config.isProd && !(error instanceof CommerceError)) ? { code } : {}),
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
    setHeaders(res) {
      res.header("X-Content-Type-Options", "nosniff");
      // Existing uploaded SVG/HTML must not execute on the storefront origin.
      res.header("Content-Security-Policy", "default-src 'none'; sandbox");
    },
  });

  await seedRbac();
  await app.register(stateRoutes);
  await app.register(authRoutes);
  await app.register(adminMfaRoutes);
  await app.register(panelPathRoutes);
  await app.register(measurementRoutes);
  await app.register(catalogRoutes);
  await app.register(categoryRoutes);
  await app.register(homeCategoryRoutes);
  await app.register(customLookRoutes);
  await app.register(sizeSetRoutes);
  await app.register(colorLibraryRoutes);
  await app.register(uploadRoutes);
  await app.register(commerceRoutes);
  await app.register(rbacRoutes);
  await app.register(healthRoutes);
  await app.register(backupRoutes);
  await app.register(analyticsRoutes);
  await app.register(smsRoutes);
  await app.register(maintenanceRoutes);
  await app.register(publicRoutes);
  await app.register(galleryRoutes);
  await app.register(adminLiveRoutes);
  await app.register(customerLabelRoutes);
  await app.register(supportRoutes);
  await app.register(stylePackRoutes);
  await app.register(studioDraftRoutes);
  await app.register(studioLifecycleRoutes);
  await app.register(studioPageRoutes);
  await app.register(journalRoutes);

  // The old Next basePath remains necessary for immutable public static assets,
  // but documents and RSC under /panel stop being entry points when changed.
  app.addHook("onRequest",async(req,reply)=>{
    let pathname:string;try{pathname=decodeURIComponent(req.url.split("?")[0]).replace(/\\/g,'/');}catch{return reply.code(400).send({error:'invalid path'});}
    const raw=req.url.split('?')[0];
    const staticAsset=/^\/panel\/_next\/static\/[A-Za-z0-9_./-]+$/.test(raw) && !raw.split('/').some(part=>part==='.'||part==='..');
    if(/^\/panel(?:\/|$)/.test(pathname) && !staticAsset) {
      if(await panelPath()!=="/panel")return reply.code(404).send({error:'not found'});
    }
  });
  await app.register(fastifyReplyFrom,{base:process.env.ADMIN_PANEL_UPSTREAM ?? "http://127.0.0.1:3000"});
  app.get<{Params:{slug:string}}>("/manage/:slug",async(req,reply)=>{
    const requested=`/manage/${req.params.slug}`;
    if(requested!==await panelPath())return reply.code(404).send({error:'not found'});
    reply.header('cache-control','no-store');
    return reply.from('/panel',{rewriteHeaders:(headers)=>({...headers,'cache-control':'no-store'})});
  });

  // Same-origin entry keeps the storefront session and CSRF protection intact.
  await app.register(fastifyProxy, { upstream: process.env.ADMIN_PANEL_UPSTREAM ?? "http://127.0.0.1:3000", prefix: "/panel", rewritePrefix: "/panel" });

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

  // reservation expiry, payment windows and cashback release keep running in the background
  startOutboxWorker();
  startBackupScheduler();
  const sweeper = setInterval(() => {
    expireReservations().catch(() => undefined);
    expirePaymentAttempts().catch(() => undefined);
    // cashback becomes spendable only after delivery (+ the return window)
    releasePendingCashback().catch(() => undefined);
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
