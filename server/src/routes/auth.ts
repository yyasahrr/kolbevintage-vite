import type { FastifyInstance, FastifyReply } from "fastify";
import { query } from "../db";
import { getDocument } from "../seed";
import { hashPassword, newOtp, verifyPassword } from "../security";
import {
  createSession,
  destroySession,
  readSession,
  setSessionCookie,
  clearSessionCookie,
} from "../sessions";

interface CustomerRow {
  email: string;
  name: string | null;
  phone: string | null;
  password_hash: string | null;
  size: Record<string, unknown> | null;
  addresses: unknown[];
  two_factor: boolean;
  created_at: string;
}

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const DEMO_SIZE = { height: 172, weight: 68, age: 30, chest: 92, waist: 74, hip: 98, shoulder: 42, fit: "regular", shoe: 39 };

export function publicCustomer(row: CustomerRow) {
  return {
    email: row.email,
    name: row.name ?? row.email.split("@")[0],
    phone: row.phone ?? "",
    password: "",
    addresses: row.addresses ?? [],
    size: row.size ?? DEMO_SIZE,
    createdAt: new Date(row.created_at).getTime(),
    loginMethod: "password" as const,
    twoFactor: row.two_factor,
  };
}

async function findCustomer(email: string) {
  const res = await query<CustomerRow>("select * from customers where email = $1", [email]);
  return res.rows[0] ?? null;
}

async function startCustomerSession(reply: FastifyReply, email: string) {
  const session = await createSession("customer", email);
  setSessionCookie(reply, session.token, session.expires);
}

export async function authRoutes(app: FastifyInstance) {
  /** current sessions (admin + customer) */
  app.get("/api/auth/me", async (req) => {
    const session = await readSession(req);
    if (!session) return { customer: null, admin: false };
    if (session.kind === "admin") return { customer: null, admin: true };
    const row = await findCustomer(session.subject);
    return { customer: row ? publicCustomer(row) : null, admin: false };
  });

  /** demo one-time code: the code is returned so the prototype can show it */
  app.post<{ Body: { email?: string; phone?: string; channel?: "sms" | "email" } }>(
    "/api/auth/otp/request",
    async (req, reply) => {
      const email = (req.body?.email ?? "").trim().toLowerCase();
      const phone = (req.body?.phone ?? "").trim();
      const channel = req.body?.channel === "email" ? "email" : "sms";
      if (!EMAIL_RE.test(email)) return reply.code(400).send({ ok: false, message: "ایمیل معتبر نیست." });

      const ops = (await getDocument<Record<string, any>>("ops")) ?? {};
      const channels = ops.security?.otpChannels ?? { sms: true, email: true };
      if (!channels[channel]) {
        return reply.code(400).send({ ok: false, message: `ورود ${channel === "sms" ? "پیامکی" : "ایمیلی"} توسط مدیر بسته شده است.` });
      }
      if (channel === "sms" && !/^0?9\d{9}$/.test(phone)) {
        return reply.code(400).send({ ok: false, message: "شمارهٔ موبایل معتبر نیست." });
      }

      const code = newOtp();
      await query(
        `insert into otp_codes (email, code, channel, expires_at) values ($1, $2, $3, now() + interval '2 minutes')
         on conflict (email) do update set code = excluded.code, channel = excluded.channel, expires_at = excluded.expires_at`,
        [email, code, channel],
      );
      return {
        ok: true,
        code,
        message: `کد ${channel === "sms" ? "پیامکی" : "ایمیلی"} به ${channel === "sms" ? phone : email} ارسال شد (نمایشی).`,
      };
    },
  );

  app.post<{ Body: { email?: string; code?: string } }>("/api/auth/otp/verify", async (req, reply) => {
    const email = (req.body?.email ?? "").trim().toLowerCase();
    const code = (req.body?.code ?? "").trim();
    if (!email || !code) return reply.code(400).send({ ok: false, message: "ایمیل و کد لازم است." });

    const res = await query<{ code: string; expired: boolean }>(
      "select code, expires_at < now() as expired from otp_codes where email = $1",
      [email],
    );
    const row = res.rows[0];
    if (!row) return reply.code(400).send({ ok: false, message: "اول درخواست کد بده." });
    if (row.expired) return reply.code(400).send({ ok: false, message: "کد منقضی شده؛ کد تازه بگیر." });
    if (row.code !== code) return reply.code(400).send({ ok: false, message: "کد درست نیست." });

    await query("delete from otp_codes where email = $1", [email]);

    let customer = await findCustomer(email);
    if (!customer) {
      const created = await query<CustomerRow>(
        `insert into customers (email, name, size, addresses) values ($1, $2, $3, '[]'::jsonb) returning *`,
        [email, email.split("@")[0], JSON.stringify(DEMO_SIZE)],
      );
      customer = created.rows[0];
    }
    await startCustomerSession(reply, email);
    return { ok: true, message: "خوش آمدی!", customer: publicCustomer(customer) };
  });

  app.post<{ Body: { email?: string; password?: string } }>("/api/auth/login", async (req, reply) => {
    const email = (req.body?.email ?? "").trim().toLowerCase();
    const password = req.body?.password ?? "";
    const customer = await findCustomer(email);
    if (!customer || !verifyPassword(password, customer.password_hash)) {
      return reply.code(401).send({ ok: false, message: "حسابی با این ایمیل و رمز پیدا نشد." });
    }
    await startCustomerSession(reply, email);
    return { ok: true, message: "خوش آمدی!", customer: publicCustomer(customer) };
  });

  app.post<{ Body: { name?: string; email?: string; phone?: string; password?: string } }>(
    "/api/auth/register",
    async (req, reply) => {
      const email = (req.body?.email ?? "").trim().toLowerCase();
      const password = req.body?.password ?? "";
      const name = (req.body?.name ?? "").trim() || email.split("@")[0];
      const phone = (req.body?.phone ?? "").trim();
      if (!EMAIL_RE.test(email)) return reply.code(400).send({ ok: false, message: "ایمیل معتبر نیست." });
      if (password.length < 8) return reply.code(400).send({ ok: false, message: "رمز باید حداقل ۸ کاراکتر باشد." });

      const ops = (await getDocument<Record<string, any>>("ops")) ?? {};
      if (ops.security && ops.security.allowCustomerSignup === false) {
        return reply.code(403).send({ ok: false, message: "ثبت‌نام در حال حاضر بسته است." });
      }
      if (await findCustomer(email)) {
        return reply.code(409).send({ ok: false, message: "این ایمیل قبلاً ثبت شده؛ وارد شو." });
      }

      const created = await query<CustomerRow>(
        `insert into customers (email, name, phone, password_hash, size, addresses)
         values ($1, $2, $3, $4, $5, '[]'::jsonb) returning *`,
        [email, name, phone, hashPassword(password), JSON.stringify(DEMO_SIZE)],
      );
      await startCustomerSession(reply, email);
      return { ok: true, message: "حساب ساخته شد.", customer: publicCustomer(created.rows[0]) };
    },
  );

  app.post("/api/auth/logout", async (req, reply) => {
    await destroySession(req, reply);
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.patch<{
    Body: {
      name?: string;
      phone?: string;
      size?: Record<string, unknown>;
      addresses?: unknown[];
      twoFactor?: boolean;
      password?: string;
    };
  }>("/api/auth/profile", async (req, reply) => {
    const session = await readSession(req);
    if (session?.kind !== "customer") return reply.code(401).send({ ok: false, message: "اول وارد شو." });

    const b = req.body ?? {};
    const fields: string[] = [];
    const values: unknown[] = [];
    const push = (sql: string, value: unknown) => {
      values.push(value);
      fields.push(`${sql} = $${values.length}`);
    };
    if (typeof b.name === "string") push("name", b.name);
    if (typeof b.phone === "string") push("phone", b.phone);
    if (b.size && typeof b.size === "object") push("size", JSON.stringify(b.size));
    if (Array.isArray(b.addresses)) push("addresses", JSON.stringify(b.addresses));
    if (typeof b.twoFactor === "boolean") push("two_factor", b.twoFactor);
    if (typeof b.password === "string" && b.password.length >= 8) push("password_hash", hashPassword(b.password));
    if (!fields.length) return { ok: true };

    values.push(session.subject);
    const res = await query<CustomerRow>(
      `update customers set ${fields.join(", ")} where email = $${values.length} returning *`,
      values,
    );
    return { ok: true, customer: res.rows[0] ? publicCustomer(res.rows[0]) : null };
  });

  app.post<{ Body: { passcode?: string } }>("/api/admin/login", async (req, reply) => {
    const passcode = (req.body?.passcode ?? "").trim();
    const admin = (await getDocument<Record<string, any>>("admin")) ?? {};
    const ops = (await getDocument<Record<string, any>>("ops")) ?? {};
    const expected = String(admin.settings?.passcode ?? ops.security?.passcode ?? "");
    if (!expected || passcode !== expected) {
      return reply.code(401).send({ ok: false, message: "رمز مدیریت درست نیست." });
    }
    const session = await createSession("admin", "admin");
    setSessionCookie(reply, session.token, session.expires);
    return { ok: true, message: "وارد پنل شدی." };
  });

  app.get("/api/admin/session", async (req) => {
    const session = await readSession(req);
    return { authenticated: session?.kind === "admin" };
  });

  app.post("/api/admin/logout", async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });
}
