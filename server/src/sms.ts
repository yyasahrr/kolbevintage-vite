import { createHmac } from "node:crypto";

/* =====================================================================
   SMS sending (decisions 46 + 72).

   Fail-closed, like every other outside world in this project: with no
   provider configured this refuses to pretend. When SMS_PROVIDER_URL is set
   the message is POSTed as JSON with a bearer token (or an HMAC signature if
   only a secret is given) and the panel believes nothing except the provider's
   own 2xx answer.
   ===================================================================== */

export interface SmsResult {
  ok: boolean;
  /** the provider's own id, when it returned one */
  messageId?: string;
  /** machine-readable reason the panel can print verbatim */
  code?: "provider_not_configured" | "invalid_number" | "provider_error" | "timeout";
  error?: string;
}

export const smsConfigured = () => Boolean(process.env.SMS_PROVIDER_URL);

export const smsSender = () => process.env.SMS_SENDER ?? "";

/** Iranian mobile numbers, tolerating spaces, dashes, +98 and 0098 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "").replace(/^\+/, "").replace(/^0098/, "").replace(/^98/, "").replace(/^0/, "");
  if (!/^9\d{9}$/.test(digits)) return null;
  return `0${digits}`;
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const endpoint = process.env.SMS_PROVIDER_URL;
  if (!endpoint) return { ok: false, code: "provider_not_configured", error: "درگاه پیامک تنظیم نشده است." };

  const phone = normalizePhone(to);
  if (!phone) return { ok: false, code: "invalid_number", error: "شمارهٔ موبایل معتبر نیست." };

  const payload = JSON.stringify({ to: phone, body, sender: smsSender() });
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = process.env.SMS_PROVIDER_TOKEN;
  const secret = process.env.SMS_PROVIDER_SECRET;
  if (token) headers.authorization = `Bearer ${token}`;
  // some providers sign the body instead of issuing a token
  if (!token && secret) headers["x-signature"] = createHmac("sha256", secret).update(payload).digest("hex");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(endpoint, { method: "POST", headers, body: payload, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, code: "provider_error", error: `درگاه ${res.status} داد: ${text.slice(0, 160)}` };
    }
    let messageId: string | undefined;
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const id = parsed.messageId ?? parsed.id ?? parsed.message_id;
      if (typeof id === "string" || typeof id === "number") messageId = String(id);
    } catch {
      // a plain-text 2xx is still a success; nothing to parse
    }
    return { ok: true, messageId };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, code: aborted ? "timeout" : "provider_error", error: aborted ? "درگاه در ۸ ثانیه پاسخ نداد." : "ارسال به درگاه ممکن نشد." };
  } finally {
    clearTimeout(timer);
  }
}
