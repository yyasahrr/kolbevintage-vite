import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
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
/* A signed, cookie-less CSRF token. The storefront preview runs inside a frame
   on another origin, where browsers drop "same-site" cookies entirely — the
   double-submit pair then never exists and every write (login, sign-up, the
   visit beacon) is refused with "invalid security token". The signed token is
   still unreadable cross-origin (CORS keeps the response closed), so it keeps
   the protection while needing no cookie at all. */
const CSRF_SECRET = randomBytes(32).toString("hex");
const CSRF_TTL_MS = 86_400_000;
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

/** the visit beacon carries no authority: it cannot read or change anything */
function isBeacon(path: string): boolean {
  return path === "/api/track";
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

const signCsrf = (raw: string) => createHmac("sha256", CSRF_SECRET).update(raw).digest("base64url");

export function issueCsrfToken(): string {
  const raw = `${Date.now().toString(36)}.${randomBytes(12).toString("hex")}`;
  return `${raw}.${signCsrf(raw)}`;
}

function signedCsrfValid(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [stamp, nonce, signature] = parts;
  const age = Date.now() - Number.parseInt(stamp, 36);
  if (!Number.isFinite(age) || age < 0 || age > CSRF_TTL_MS) return false;
  const expected = signCsrf(`${stamp}.${nonce}`);
  if (expected.length !== signature.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

/**
 * Is this request part of a cross-site embedding (the framed preview) or plain
 * HTTPS? Browsers themselves say so: `Sec-Fetch-Site: cross-site` arrives on
 * every request made from an iframe hosted on another origin, and the proxy
 * adds `X-Forwarded-Proto: https`. Either one means a `SameSite=Lax` cookie
 * will be dropped, so the cookies below switch to `SameSite=None; Secure`.
 */
function crossSite(req: FastifyRequest): boolean {
  const forwarded = req.headers["x-forwarded-proto"];
  const proto = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.protocol;
  if (proto === "https") return true;
  const fetchSite = req.headers["sec-fetch-site"];
  return typeof fetchSite === "string" && fetchSite.toLowerCase() === "cross-site";
}

export function cookieSecurity(req: FastifyRequest): { secure: boolean; sameSite: "none" | "lax" } {
  const https = crossSite(req);
  return https ? { secure: true, sameSite: "none" } : { secure: false, sameSite: "lax" };
}

export function registerSecurity(app: FastifyInstance) {
  /** hands out a token that works with or without cookies */
  app.get("/api/csrf", async (req, reply) => {
    const token = issueCsrfToken();
    const { secure, sameSite } = cookieSecurity(req);
    reply.header("cache-control", "no-store");
    reply.header(
      "set-cookie",
      `${CSRF_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=${sameSite === "none" ? "None" : "Lax"}; Max-Age=86400${secure ? "; Secure" : ""}`,
    );
    return { token };
  });

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
    if (!SAFE_METHODS.has(req.method) && !isCallback(path) && !isBeacon(path)) {
      const cookieToken = readCookie(req, CSRF_COOKIE);
      const headerToken = req.headers[CSRF_HEADER];
      const provided = typeof headerToken === "string" ? headerToken : "";
      const doubleSubmit = Boolean(cookieToken) && provided === cookieToken;
      // a signed token works without any cookie (preview inside a frame)
      const stateless = signedCsrfValid(provided);
      if (!doubleSubmit && !stateless) {
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
    if (!existing && !reply.getHeader("set-cookie")) {
      const token = issueCsrfToken();
      const { secure, sameSite } = cookieSecurity(req);
      reply.header(
        "set-cookie",
        `${CSRF_COOKIE}=${encodeURIComponent(token)}; Path=/; SameSite=${sameSite === "none" ? "None" : "Lax"}; Max-Age=86400${secure ? "; Secure" : ""}`,
      );
    }
    return payload;
  });
}
