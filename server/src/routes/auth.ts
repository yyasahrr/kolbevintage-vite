import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { query } from "../db";
import { getDocument } from "../seed";
import { hashPassword, newOtp, verifyPassword } from "../security";
import { isCrossSite } from "../http/security";
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

/**
 * The session token is also handed back in the body when the request comes from
 * another origin (the framed preview), because a browser that refuses our
 * cookie would otherwise "log in" and stay a stranger. The client keeps it in
 * memory and sends it as `x-session-token`; the cookie path is unchanged.
 */
function sessionBody(req: FastifyRequest, token: string): { sessionToken?: string } {
  return isCrossSite(req) ? { sessionToken: token } : {};
}

async function startCustomerSession(req: FastifyRequest, reply: FastifyReply, email: string) {
  const session = await createSession("customer", email);
  setSessionCookie(reply, session.token, session.expires);
  return sessionBody(req, session.token);
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
    const extra = await startCustomerSession(req, reply, email);
    return { ok: true, message: "خوش آمدی!", customer: publicCustomer(customer), ...extra };
  });

  app.post<{ Body: { email?: string; password?: string } }>("/api/auth/login", async (req, reply) => {
    const email = (req.body?.email ?? "").trim().toLowerCase();
    const password = req.body?.password ?? "";
    const customer = await findCustomer(email);
    if (!customer || !verifyPassword(password, customer.password_hash)) {
      return reply.code(401).send({ ok: false, message: "حسابی با این ایمیل و رمز پیدا نشد." });
    }
    const extra = await startCustomerSession(req, reply, email);
    return { ok: true, message: "خوش آمدی!", customer: publicCustomer(customer), ...extra };
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
      const extra = await startCustomerSession(req, reply, email);
      return { ok: true, message: "حساب ساخته شد.", customer: publicCustomer(created.rows[0]), ...extra };
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

  /**
   * Two ways in, one endpoint:
   *   · the store passcode — always the owner subject, cannot be locked out
   *   · a staff passcode — signs in as that staff row, so RBAC applies
   * Both create an `admin` session; the role travels with the subject.
   */
  app.post<{ Body: { passcode?: string } }>("/api/admin/login", async (req, reply) => {
    const passcode = (req.body?.passcode ?? "").trim();
    const admin = (await getDocument<Record<string, any>>("admin")) ?? {};
    const ops = (await getDocument<Record<string, any>>("ops")) ?? {};
    const expected = String(admin.settings?.passcode ?? ops.security?.passcode ?? "");

    const ip = req.ip;
    const userAgent = String(req.headers["user-agent"] ?? "").slice(0, 200);
    const recordLogin = (subject: string, ok: boolean, reason: string | null) =>
      query("insert into login_events (subject, ok, reason, ip, user_agent) values ($1,$2,$3,$4,$5)", [
        subject,
        ok,
        reason,
        ip,
        userAgent,
      ]);

    let subject = "admin";
    if (expected && passcode === expected) {
      subject = "admin";
    } else {
      const staff = await query<{ subject: string; passcode_hash: string | null; expired: boolean }>(
        `select subject, passcode_hash, (expires_at is not null and expires_at <= now()) as expired
           from staff where active and passcode_hash is not null`,
      );
      const match = staff.rows.find((row) => verifyPassword(passcode, row.passcode_hash));
      if (!match) {
        await recordLogin("unknown", false, "bad_passcode");
        return reply.code(401).send({ ok: false, message: "رمز مدیریت درست نیست." });
      }
      // decision 89: a temporary grant stops working on its date, not on the next deploy
      if (match.expired) {
        await recordLogin(match.subject, false, "expired");
        return reply.code(401).send({ ok: false, message: "دسترسی این حساب به پایان رسیده است." });
      }
      subject = match.subject;
    }
    await recordLogin(subject, true, null);

    const session = await createSession("admin", subject);
    setSessionCookie(reply, session.token, session.expires);
    const role = await query<{ id: string; name: string }>(
      "select r.id, r.name from staff s join roles r on r.id = s.role_id where s.subject = $1 and s.active",
      [subject],
    );
    return {
      ok: true,
      message: "وارد پنل شدی.",
      subject,
      role: role.rows[0] ? { id: role.rows[0].id, name: role.rows[0].name } : null,
      ...sessionBody(req, session.token),
    };
  });

  app.get("/api/admin/session", async (req) => {
    const session = await readSession(req);
    return { authenticated: session?.kind === "admin", subject: session?.kind === "admin" ? session.subject : null };
  });

  app.post("/api/admin/logout", async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });
}
