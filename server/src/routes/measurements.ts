import { isDeepStrictEqual } from "node:util";
import type { FastifyInstance } from "fastify";
import { readSession } from "../sessions";
import { query, withTransaction } from "../db";
import { recordAudit } from "../commerce/audit";
import { conflict, unauthorized, validation } from "../commerce/errors";

const fields = ["height", "chest", "waist", "hip", "shoulder", "sleeve", "inseam"] as const;
type Measurements = Record<(typeof fields)[number], number | null>;

/** Accept only the current, explicit schema. Do not interpret legacy `size`. */
function valid(value: unknown): value is Measurements | null {
  if (value === null) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  if (Object.keys(object).length !== fields.length || fields.some(field => !Object.prototype.hasOwnProperty.call(object, field))) return false;
  return fields.every(field => {
    const n = object[field];
    return n === null || (typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 300 && Math.abs(n * 10 - Math.round(n * 10)) < 1e-8);
  }) && fields.some(field => object[field] !== null);
}

export async function measurementRoutes(app: FastifyInstance) {
  app.get("/api/auth/measurements", async (req, reply) => {
    reply.header("cache-control", "private, no-store");
    const session = await readSession(req);
    if (session?.kind !== "customer") throw unauthorized("برای مشاهده اندازه‌ها وارد حساب شوید.");
    const result = await query<{ personal_measurements: unknown }>("select personal_measurements from customers where email=$1", [session.subject]);
    if (!result.rows[0]) throw unauthorized("حساب مشتری در دسترس نیست.");
    if (!valid(result.rows[0].personal_measurements)) throw conflict("ساختار اندازه‌های ذخیره‌شده قابل شناسایی نیست؛ برای بررسی با پشتیبانی تماس بگیرید.", "measurements_unrecognized");
    return { measurements: result.rows[0].personal_measurements };
  });

  app.put<{ Body: unknown }>("/api/auth/measurements", async (req, reply) => {
    reply.header("cache-control", "private, no-store");
    const session = await readSession(req);
    if (session?.kind !== "customer") throw unauthorized("برای ثبت اندازه‌ها وارد حساب شوید.");
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 2 || !Object.prototype.hasOwnProperty.call(body,"expected") || !Object.prototype.hasOwnProperty.call(body,"measurements")) throw validation("اطلاعات اندازه معتبر نیست.");
    const { expected, measurements } = body as { expected: unknown; measurements: unknown };
    if (!valid(expected) || !valid(measurements)) throw validation("اندازه‌ها باید خالی یا بین ۱ تا ۳۰۰ سانتی‌متر با حداکثر یک رقم اعشار باشند.");
    return withTransaction(async client => {
      const row = (await client.query<{ personal_measurements: unknown }>("select personal_measurements from customers where email=$1 for update", [session.subject])).rows[0];
      const active = await client.query("select 1 from sessions where token=$1 and kind='customer' and subject=$2 and expires_at > now()", [session.token,session.subject]);
      if (!row || !active.rowCount) throw unauthorized("حساب یا نشست در دسترس نیست.");
      if (!valid(row.personal_measurements)) throw conflict("ساختار اندازه‌های ذخیره‌شده قابل شناسایی نیست؛ برای بررسی با پشتیبانی تماس بگیرید.", "measurements_unrecognized");
      // Retrying a write whose response was lost must not be reported as a conflict.
      if (isDeepStrictEqual(row.personal_measurements,measurements)) return {measurements,unchanged:true};
      if (!isDeepStrictEqual(row.personal_measurements,expected)) throw conflict("اندازه‌ها در جای دیگری تغییر کرده‌اند؛ اطلاعات تازه را دریافت و بررسی کنید.", "measurements_conflict");
      await client.query("update customers set personal_measurements=$2::jsonb where email=$1", [session.subject, measurements === null ? null : JSON.stringify(measurements)]);
      // Deliberately omit measurement values from the append-only audit trail.
      await recordAudit({actor:session.subject,action:measurements === null ? "customer.measurements_cleared" : "customer.measurements_saved",targetType:"customer",targetId:session.subject,requestId:req.id},client);
      return {measurements,unchanged:false};
    });
  });
}
