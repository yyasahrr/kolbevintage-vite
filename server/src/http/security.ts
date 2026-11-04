import { randomBytes } from "node:crypto";
import { config } from "../config";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/* =====================================================================
   Transport-level guards for the commerce core.

   1. Security headers on every API response (the SPA itself is served by
      Vite/Fastify separately, so framing rules here only affect JSON).
   2. Double-submit CSRF: a readable cookie plus a matching header on every
      state-changing request. Provider callbacks are exempt because they are
      authenticated by an HMAC signature instead (see payments.ts).
   3. Fixed-window rate limits per client + route class, so a password/OTP
      brute force or a checkout flood cannot be run at full speed.
   ===================================================================== */

const CSRF_COOKIE = "kv_csrf";
const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface LimitRule {
  max: number;
  windowMs: number;
}

/** deliberately generous defaults: normal shoppers never hit these */
export const rateLimits: Record<string, LimitRule> = {
  auth: { max: 40, windowMs: 60_000 },
  admin_login: { max: 20, windowMs: 60_000 },
  checkout: { max: 60, windowMs: 60_000 },
  payment: { max: 60, windowMs: 60_000 },
  returns: { max: 30, windowMs: 60_000 },
  upload: { max: 20, windowMs: 60_000 },
  write: { max: 120, windowMs: 60_000 },
};

const buckets = new Map<string, { count: number; reset: number }>();

export function setRateLimit(name: string, rule: LimitRule) {
  rateLimits[name] = rule;
}

export function resetRateLimits() {
  buckets.clear();
}

function classFor(path: string, method: string): string | null {
  if (SAFE_METHODS.has(method)) return null;
  if (path.startsWith("/api/admin/login")) return "admin_login";
  if (path.startsWith("/api/auth/")) return "auth";
  if (path.startsWith("/api/commerce/checkout")) return "checkout";
  if (path.startsWith("/api/commerce/payments")) return "payment";
  if (path.endsWith("/returns") || path.includes("/refunds")) return "returns";
  if (path.startsWith("/api/uploads")) return "upload";
  return "write";
}

function isCallback(path: string): boolean {
  return /^\/api\/commerce\/payments\/[^/]+\/callback$/.test(path);
}

function clientKey(req: FastifyRequest): string {
  const forwarded = req.headers["x-forwarded-for"];
  const ip = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.ip;
  return ip || "unknown";
}

function readCookie(req: FastifyRequest, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return null;
}

export function csrfToken(req: FastifyRequest): string | null {
  return readCookie(req, CSRF_COOKIE);
}

export function registerSecurity(app: FastifyInstance) {
  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const path = req.url.split("?")[0];

    /* ---------- rate limit ---------- */
    const bucketName = classFor(path, req.method);
    if (bucketName) {
      const rule = rateLimits[bucketName] ?? rateLimits.write;
      const key = `${bucketName}:${clientKey(req)}`;
      const now = Date.now();
      const bucket = buckets.get(key);
      if (!bucket || bucket.reset <= now) {
        buckets.set(key, { count: 1, reset: now + rule.windowMs });
      } else {
        bucket.count += 1;
        if (bucket.count > rule.max) {
          const retryAfter = Math.max(1, Math.ceil((bucket.reset - now) / 1000));
          reply.header("retry-after", String(retryAfter));
          return reply.code(429).send({
            ok: false,
            code: "rate_limited",
            message: "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کن.",
          });
        }
      }
    }

    /* ---------- CSRF (double submit) ---------- */
    if (!SAFE_METHODS.has(req.method) && !isCallback(path)) {
      const cookieToken = readCookie(req, CSRF_COOKIE);
      const headerToken = req.headers[CSRF_HEADER];
      const provided = typeof headerToken === "string" ? headerToken : "";
      if (!cookieToken || !provided || provided !== cookieToken) {
        return reply.code(403).send({
          ok: false,
          code: "csrf_token_invalid",
          message: "توکن امنیتی درخواست معتبر نیست؛ صفحه را دوباره بارگذاری کن.",
        });
      }
    }
    return undefined;
  });

  app.addHook("onSend", async (req: FastifyRequest, reply: FastifyReply, payload) => {
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    // Clickjacking protection stays on for real deployments. The development and
    // preview environment renders the storefront inside a frame on another origin,
    // so a hard DENY there would break the preview instead of protecting it.
    if (config.isProd) reply.header("x-frame-options", "DENY");
    reply.header("cross-origin-resource-policy", "same-site");
    const path = req.url.split("?")[0];
    if (path.startsWith("/api/auth") || path.startsWith("/api/admin") || path.startsWith("/api/commerce/cashback")) {
      reply.header("cache-control", "no-store");
    }

    // hand the browser a CSRF token to echo back in a header
    const existing = readCookie(req, CSRF_COOKIE);
    if (!existing) {
      const token = randomBytes(16).toString("hex");
      const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
      reply.header(
        "set-cookie",
        `${CSRF_COOKIE}=${token}; Path=/; SameSite=Lax; Max-Age=86400${secure}`,
      );
    }
    return payload;
  });
}
