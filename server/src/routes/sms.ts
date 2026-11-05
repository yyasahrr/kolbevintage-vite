import type { FastifyInstance } from "fastify";
import { requirePermission } from "../http/rbac";
import { recordAudit } from "../commerce/audit";
import { sendSms, smsConfigured, smsSender } from "../sms";

/* =====================================================================
   SMS endpoint (decisions 46 + 72).

   One message per call. The panel loops for a bulk send and only counts the
   answers that really came back ok — a missing provider is reported, never
   simulated. Every attempt is written to the audit trail.
   ===================================================================== */

export async function smsRoutes(app: FastifyInstance) {
  app.get("/api/admin/sms/status", async (req) => {
    await requirePermission(req, "customers:view");
    return { configured: smsConfigured(), sender: smsSender() };
  });

  app.post<{ Body: { to?: string; body?: string } }>("/api/admin/sms", async (req, reply) => {
    const session = await requirePermission(req, "customers:edit");
    const to = (req.body?.to ?? "").trim();
    const body = (req.body?.body ?? "").trim();

    if (!to || !body) return reply.code(400).send({ error: "شماره و متن پیام لازم است.", code: "missing_fields" });
    if (body.length > 480) return reply.code(400).send({ error: "متن پیام بیش از ۴۸۰ نویسه است.", code: "body_too_long" });
    if (!smsConfigured()) {
      // fail-closed and explicit: nothing was sent, and the panel must say so
      await recordAudit({
        actor: session.subject,
        action: "sms.send",
        targetType: "sms",
        targetId: to.slice(-4),
        after: { ok: false, code: "provider_not_configured" },
        requestId: req.id,
      });
      return reply.code(503).send({ ok: false, code: "provider_not_configured", error: "درگاه پیامک تنظیم نشده است؛ پیام ارسال نشد." });
    }

    const result = await sendSms(to, body);
    await recordAudit({
      actor: session.subject,
      action: "sms.send",
      targetType: "sms",
      // the full number never lands in the audit trail
      targetId: to.slice(-4),
      after: { ok: result.ok, code: result.code ?? null, chars: body.length },
      requestId: req.id,
    });
    if (!result.ok) return reply.code(result.code === "invalid_number" ? 400 : 502).send(result);
    return { ok: true, messageId: result.messageId ?? null };
  });
}
