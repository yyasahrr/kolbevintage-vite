import type { FastifyRequest } from "fastify";
import type { Session } from "../sessions";
import { readSession } from "../sessions";
import { forbidden, unauthorized } from "./errors";
import { loadCommerceSettings } from "./settings";

/* Commerce endpoints never inherit the demo "auth is optional" behaviour of
   the legacy state routes: money endpoints are always session-protected. */

export const currentSession = (req: FastifyRequest): Promise<Session | null> => readSession(req);

export async function requireAdminSession(req: FastifyRequest): Promise<Session> {
  const session = await readSession(req);
  if (session?.kind !== "admin") {
    throw unauthorized("برای این عملیات باید با رمز مدیریت وارد شوی.");
  }
  return session;
}

/**
 * A refund approver must be a protected superadmin subject. The default
 * admin passcode session is `admin` and is deliberately *not* enough.
 */
export async function requireSuperadmin(req: FastifyRequest): Promise<Session> {
  const session = await requireAdminSession(req);
  const settings = await loadCommerceSettings();
  if (!settings.superadmins.includes(session.subject)) {
    throw forbidden("این عملیات فقط توسط Superadmin محافظت‌شده مجاز است.");
  }
  return session;
}

export async function requireCustomerSession(req: FastifyRequest): Promise<Session> {
  const session = await readSession(req);
  if (session?.kind !== "customer") {
    throw unauthorized("برای این بخش باید وارد حساب کاربری شوی.");
  }
  return session;
}

export function actorOf(session: Session | null): string {
  return session?.subject ?? "guest";
}
