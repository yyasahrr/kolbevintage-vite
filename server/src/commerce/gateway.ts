import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentAttemptRow, PaymentProvider, VerifyOutcome } from "./payments";
import { CommerceError } from "./errors";

/* =====================================================================
   A real payment gateway, configured entirely by environment variables
   (decision: the only serious gap left before the shop can take money).

   The contract is deliberately thin, so any provider can be wrapped behind a
   small adapter:

     POST {PAYMENT_GATEWAY_URL}/initiate   { reference, amount, currency,
                                             description, callbackUrl, returnUrl }
       → { providerRef, redirectUrl?, instructions? }

     POST {PAYMENT_GATEWAY_URL}/verify     { reference, providerRef }
       → { status: "settled" | "pending" | "failed" | "cancelled",
           amount, providerRef }

   Rules this file enforces, because they are the difference between taking
   money and pretending to:

     1. A callback is a claim, not a payment. Even a correctly signed callback
        only triggers a server-to-server `verify`; only that answer settles.
     2. With a secret configured, an unsigned or wrongly signed callback is
        parked as `pending` — never settled, never failed either.
     3. The amount the provider reports must equal the amount we asked for,
        to the rial. Otherwise the attempt becomes `exception` for a human.
     4. A timeout or network error parks the attempt; it never invents an
        outcome in either direction.
     5. Without PAYMENT_GATEWAY_URL the provider refuses to be selected at
        all (`provider_not_configured`), so a store cannot half-enable it.
   ===================================================================== */

const TIMEOUT_MS = 8000;

const env = (key: string) => (process.env[key] ?? "").trim();

export const gatewayConfigured = () => Boolean(env("PAYMENT_GATEWAY_URL"));


/** token or HMAC secret; at least one is needed to talk to a real provider */
const authHeaders = (body: string): Record<string, string> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = env("PAYMENT_GATEWAY_TOKEN");
  const secret = env("PAYMENT_GATEWAY_SECRET");
  if (token) headers.authorization = `Bearer ${token}`;
  if (secret) headers["x-signature"] = createHmac("sha256", secret).update(body).digest("hex");
  return headers;
};

type Json = Record<string, unknown>;

async function post(path: string, payload: Json): Promise<Json> {
  const base = env("PAYMENT_GATEWAY_URL").replace(/\/$/, "");
  if (!base) throw new CommerceError("درگاه پرداخت پیکربندی نشده است.", 503, "provider_not_configured");
  const body = JSON.stringify(payload);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: authHeaders(body),
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // network failure / timeout: the caller decides whether that parks the money
    const reason = error instanceof Error ? error.message : "gateway_unreachable";
    throw new CommerceError(`درگاه پاسخ نداد: ${reason}`, 504, "gateway_unreachable");
  }
  const text = await response.text();
  let parsed: Json = {};
  try {
    parsed = text ? (JSON.parse(text) as Json) : {};
  } catch {
    parsed = { raw: text.slice(0, 300) };
  }
  if (!response.ok) {
    const detail = typeof parsed.message === "string" ? parsed.message : `HTTP ${response.status}`;
    throw new CommerceError(`درگاه خطا داد: ${detail}`, 502, "gateway_error");
  }
  return parsed;
}

const signatureOf = (reference: string, status: string) => {
  const secret = env("PAYMENT_GATEWAY_SECRET");
  if (!secret) return "";
  return createHmac("sha256", secret).update(`${reference}:${status}`).digest("hex");
};

function signatureValid(expected: string, provided: string): boolean {
  if (!expected || !provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const gatewayProvider: PaymentProvider = {
  id: "gateway",
  method: "online",
  // No refund adapter is implemented yet. An environment flag cannot make
  // a reversal real; keep it disabled until a verified provider call exists.
  capabilities: { bnpl4: false, refund: false, partialRefund: false, signedCallbacks: true },

  async initiate(attempt: PaymentAttemptRow) {
    const publicBase = env("PUBLIC_BASE_URL").replace(/\/$/, "");
    const res = await post("/initiate", {
      reference: attempt.id,
      amount: Number(attempt.amount),
      currency: "IRT",
      description: `پرداخت سفارش ${attempt.checkout_id}`,
      // the provider posts here server-to-server, and sends the shopper back here
      ...(publicBase
        ? {
            callbackUrl: `${publicBase}/api/commerce/payments/${attempt.id}/callback`,
            returnUrl: `${publicBase}/#/payment/${attempt.id}`,
          }
        : {}),
    });

    const providerRef = typeof res.providerRef === "string" ? res.providerRef : "";
    if (!providerRef) {
      throw new CommerceError("درگاه شناسهٔ تراکنش برنگرداند؛ پرداخت آغاز نشد.", 502, "gateway_bad_response");
    }
    return {
      providerRef,
      redirectUrl: typeof res.redirectUrl === "string" && res.redirectUrl ? res.redirectUrl : null,
      instructions:
        typeof res.instructions === "string" && res.instructions
          ? res.instructions
          : "برای تکمیل پرداخت به درگاه منتقل می‌شوی؛ تا تأیید سرور، سفارش پرداخت‌شده ثبت نمی‌شود.",
    };
  },

  async verify(attempt: PaymentAttemptRow, params): Promise<VerifyOutcome> {
    const claim = String(params.status ?? params.result ?? "");

    // 1. when a secret exists, an unsigned callback is not evidence of anything
    if (env("PAYMENT_GATEWAY_SECRET")) {
      const provided = String(params.signature ?? "");
      if (!signatureValid(signatureOf(attempt.id, claim), provided)) {
        return {
          outcome: "pending",
          providerRef: attempt.provider_ref ?? "",
          reason: "unsigned_callback",
          raw: { received: Object.keys(params), status: claim },
        };
      }
    }

    // 2. ask the provider itself; only its answer can settle money
    let res: Json;
    try {
      res = await post("/verify", { reference: attempt.id, providerRef: attempt.provider_ref });
    } catch (error) {
      const reason = error instanceof CommerceError ? String(error.code ?? "gateway_error") : "gateway_unreachable";
      return {
        outcome: "pending",
        providerRef: attempt.provider_ref ?? "",
        reason,
        raw: { error: reason, callbackStatus: claim },
      };
    }

    const status = String(res.status ?? "");
    const providerRef = typeof res.providerRef === "string" ? res.providerRef : attempt.provider_ref ?? "";

    if (status === "settled") {
      const amount = Number(res.amount);
      if (!Number.isFinite(amount) || Math.abs(amount - Number(attempt.amount)) > 0.009) {
        // the provider says it settled a different amount: a human must look
        return { outcome: "exception", providerRef, reason: "amount_mismatch", raw: res };
      }
      return { outcome: "settled", providerRef, amount, raw: res };
    }
    if (status === "pending") {
      return { outcome: "pending", providerRef, reason: "gateway_pending", raw: res };
    }
    if (status === "failed" || status === "cancelled") {
      return { outcome: "failed", providerRef, reason: status === "cancelled" ? "cancelled_by_shopper" : "declined", raw: res };
    }
    return { outcome: "exception", providerRef, reason: "gateway_unknown_status", raw: res };
  },
};
