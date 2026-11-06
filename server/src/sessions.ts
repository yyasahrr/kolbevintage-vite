import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "./config";
import { query } from "./db";
import { newToken } from "./security";
import { cookieSecurity } from "./http/security";

export const COOKIE = "kv_session";

export type SessionKind = "admin" | "customer";

export interface Session {
  kind: SessionKind;
  subject: string;
  token: string;
}

export async function createSession(kind: SessionKind, subject: string): Promise<{ token: string; expires: Date }> {
  const token = newToken();
  const expires = new Date(Date.now() + config.sessionDays * 86400000);
  await query("insert into sessions (token, kind, subject, expires_at) values ($1, $2, $3, $4)", [
    token,
    kind,
    subject,
    expires,
  ]);
  return { token, expires };
}

export function setSessionCookie(reply: FastifyReply, token: string, expires: Date) {
  // in the framed preview the panel is a third-party context: a "lax" cookie is
  // dropped there, so the login would silently not stick
  const { secure, sameSite } = cookieSecurity(reply.request);
  reply.setCookie(COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite,
    secure: secure || config.isProd,
    expires,
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(COOKIE, { path: "/" });
}

/** the token from the cookie, or from a header when the browser keeps no cookies */
export function sessionToken(req: FastifyRequest): string | null {
  const fromCookie = req.cookies?.[COOKIE];
  if (fromCookie) return fromCookie;
  const header = req.headers["x-session-token"];
  if (typeof header === "string" && header.trim()) return header.trim();
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

/** the owner the review mode acts as (no passcode, no session row) */
export const REVIEW_SESSION: Session = { kind: "admin", subject: "review-owner", token: "review-mode" };

export async function readSession(req: FastifyRequest): Promise<Session | null> {
  const token = sessionToken(req);
  if (!token && config.panelOpenAccess) return REVIEW_SESSION;
  if (!token) return null;
  const res = await query<{ kind: SessionKind; subject: string }>(
    "select kind, subject from sessions where token = $1 and expires_at > now()",
    [token],
  );
  const row = res.rows[0];
  return row ? { token, kind: row.kind, subject: row.subject } : null;
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply) {
  const token = sessionToken(req);
  if (token) await query("delete from sessions where token = $1", [token]);
  clearSessionCookie(reply);
}

/** returns the admin session or null (writes may be open in demo mode) */
export async function requireAdmin(req: FastifyRequest) {
  if (!config.requireAdminAuth) return null;
  const session = await readSession(req);
  if (session?.kind !== "admin") {
    const error = new Error("برای این عملیات باید با رمز مدیریت وارد شوی.");
    (error as Error & { statusCode?: number }).statusCode = 401;
    throw error;
  }
  return session;
}
