import { isDeepStrictEqual } from "node:util";
import { config } from "../config";
import type { FastifyInstance } from "fastify";
import { query, withTransaction } from "../db";
import { recordAudit } from "../commerce/audit";
import { getDocument } from "../seed";
import { hashPassword, verifyPassword } from "../security";
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
function sessionBody(token: string): { sessionToken?: string } {
  // The fallback token is for non-production framed previews only. In
  // production the session remains exclusively in the HttpOnly cookie.
  return config.isProd ? {} : { sessionToken: token };
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

  // The former prototype returned the OTP to the requester, allowing login to
  // any account. Keep both routes fail-closed until a verified provider and a
  // phone/email identity binding are implemented; never accept old demo codes.
  app.post("/api/auth/otp/request", async (_req, reply) => reply.code(503).send({ ok:false, code:"otp_unavailable", message:"ورود با کد یک‌بارمصرف هنوز به سرویس امن متصل نشده است؛ از رمز عبور استفاده کنید." }));
  app.post("/api/auth/otp/verify", async (_req, reply) => reply.code(503).send({ ok:false, code:"otp_unavailable", message:"ورود با کد یک‌بارمصرف هنوز به سرویس امن متصل نشده است." }));

  app.post<{ Body: { email?: string; password?: string } }>("/api/auth/login", async (req, reply) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (email.length > 254 || password.length > 256) return reply.code(401).send({ok:false,message:"حسابی با این ایمیل و رمز پیدا نشد."});
    // Serialize login with password changes so a login verified against an old
    // hash cannot create another session after the old sessions are revoked.
    const result = await withTransaction(async client => {
      const row = (await client.query<CustomerRow>("select * from customers where email=$1 for update",[email])).rows[0];
      if (!row || !verifyPassword(password,row.password_hash)) return null;
      const session = await createSession("customer", email, undefined, client);
      return {row,session};
    });
    if (!result) return reply.code(401).send({ ok: false, message: "حسابی با این ایمیل و رمز پیدا نشد." });
    setSessionCookie(reply,result.session.token,result.session.expires);
    return { ok: true, message: "خوش آمدی!", customer: publicCustomer(result.row), ...sessionBody(result.session.token) };
  });

  // Never let a visitor claim an unverified email/phone. A real verification
  // provider and identity binding are prerequisites for registration.
  app.post("/api/auth/register", async (_req, reply) => reply.code(503).send({ok:false, code:"registration_unavailable", message:"ثبت‌نام تا اتصال سرویس احراز هویت در دسترس نیست."}));

  app.post("/api/auth/logout", async (req, reply) => {
    await destroySession(req, reply);
    clearSessionCookie(reply);
    return { ok: true };
  });

  // Legacy bulk writes bypassed confirmation and could set a password or a
  // pretend second factor. Only bounded, explicitly confirmed profile fields
  // remain here; addresses and credentials have their own guarded routes.
  app.patch<{ Body: Record<string, unknown> }>("/api/auth/profile", async (req, reply) => {
    const session = await readSession(req);
    if (session?.kind !== "customer") return reply.code(401).send({ok:false,message:"اول وارد شو."});
    const b = req.body;
    if (!b || typeof b !== "object" || Array.isArray(b) || Object.keys(b).some(k => !["phone", "expectedPhone"].includes(k)) || typeof b.phone !== "string" || b.phone.length > 30 || typeof b.expectedPhone !== "string" || b.expectedPhone.length > 30) return reply.code(400).send({ok:false,message:"اطلاعات حساب معتبر نیست."});
    const result = await withTransaction(async client => {
      const row=(await client.query<CustomerRow>("select * from customers where email=$1 for update",[session.subject])).rows[0];
      if (!row || !(await client.query("select 1 from sessions where token=$1 and kind='customer' and subject=$2 and expires_at > now()",[session.token,session.subject])).rowCount) return null;
      if ((row.phone ?? "") !== b.expectedPhone) return "conflict" as const;
      const updated=(await client.query<CustomerRow>("update customers set phone=$2 where email=$1 returning *",[session.subject,(b.phone as string).trim()])).rows[0];
      return publicCustomer(updated);
    });
    if (!result) return reply.code(401).send({ok:false,message:"حساب پیدا نشد."});
    if (result === "conflict") return reply.code(409).send({ok:false,code:"profile_conflict",message:"اطلاعات حساب تغییر کرده است؛ دوباره دریافت و بررسی کنید."});
    return {ok:true,customer:result};
  });

  app.put<{Body:{expected?:unknown;addresses?:unknown}}>("/api/auth/addresses", async (req,reply) => {
    const session = await readSession(req);
    if (session?.kind !== "customer") return reply.code(401).send({ok:false,message:"اول وارد شو."});
    const {expected,addresses}=req.body ?? {};
    if (!Array.isArray(expected) || !Array.isArray(addresses) || addresses.length > 50 || JSON.stringify(addresses).length > 32_000 || JSON.stringify(expected).length > 64_000) return reply.code(400).send({ok:false,message:"فهرست آدرس‌ها معتبر نیست."});
    const ids = new Set<string>();
    for (const item of addresses) {
      if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.id !== "string" || !item.id || item.id.length > 100 || ids.has(item.id) || typeof item.default !== "boolean") return reply.code(400).send({ok:false,message:"شناسه یا وضعیت آدرس معتبر نیست."});
      ids.add(item.id);
      for (const [key,max] of Object.entries({label:80,receiver:120,phone:30,province:100,city:100,street:500,postal:30})) {
        if (typeof item[key] !== "string" || item[key].length > max) return reply.code(400).send({ok:false,message:"اطلاعات آدرس معتبر نیست."});
      }
      if (!item.street.trim()) return reply.code(400).send({ok:false,message:"نشانی نمی‌تواند خالی باشد."});
    }
    if (addresses.length && addresses.filter(item=>item.default).length !== 1) return reply.code(400).send({ok:false,message:"یک آدرس پیش‌فرض انتخاب کنید."});
    const result = await withTransaction(async client => {
      const row=(await client.query<CustomerRow>("select * from customers where email=$1 for update",[session.subject])).rows[0];
      if (!row || !(await client.query("select 1 from sessions where token=$1 and kind='customer' and subject=$2 and expires_at > now()",[session.token,session.subject])).rowCount) return null;
      if (!isDeepStrictEqual(row.addresses,expected)) return "conflict" as const;
      const updated=(await client.query<CustomerRow>("update customers set addresses=$2::jsonb where email=$1 returning *",[session.subject,JSON.stringify(addresses)])).rows[0];
      return publicCustomer(updated);
    });
    if (!result) return reply.code(401).send({ok:false,message:"حساب پیدا نشد."});
    if (result === "conflict") return reply.code(409).send({ok:false,code:"address_conflict",message:"آدرس‌ها در جای دیگری تغییر کرده‌اند؛ اطلاعات تازه را بررسی کنید."});
    return {ok:true,customer:result};
  });

  app.post<{Body:{currentPassword?:unknown;newPassword?:unknown}}>("/api/auth/password", async (req,reply) => {
    const session = await readSession(req);
    if (session?.kind !== "customer") return reply.code(401).send({ok:false,message:"اول وارد شو."});
    const {currentPassword,newPassword}=req.body ?? {};
    if (typeof currentPassword !== "string" || !currentPassword || currentPassword.length > 256 || typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 256) return reply.code(400).send({ok:false,message:"رمز جدید باید بین ۸ تا ۲۵۶ نویسه باشد."});
    const outcome=await withTransaction(async client=>{
      const row=(await client.query<CustomerRow>("select * from customers where email=$1 for update",[session.subject])).rows[0];
      const active=await client.query("select 1 from sessions where token=$1 and kind='customer' and subject=$2 and expires_at > now()",[session.token,session.subject]);
      if (!row || !active.rowCount) return "session" as const;
      if (!verifyPassword(currentPassword,row.password_hash)) return "incorrect" as const;
      await client.query("update customers set password_hash=$2 where email=$1",[session.subject,hashPassword(newPassword)]);
      await client.query("delete from sessions where kind='customer' and subject=$1 and token<>$2",[session.subject,session.token]);
      await recordAudit({actor:session.subject,action:"customer.password_changed",targetType:"customer",targetId:session.subject,requestId:req.id},client);
      return "ok" as const;
    });
    if(outcome === "session") return reply.code(401).send({ok:false,message:"نشست معتبر نیست؛ دوباره وارد شوید."});
    if(outcome === "incorrect") return reply.code(403).send({ok:false,code:"password_incorrect",message:"رمز فعلی درست نیست."});
    return {ok:true};
  });

  /**
   * Two ways in, one endpoint:
   *   · the store passcode — always the owner subject, cannot be locked out
   *   · a staff passcode — signs in as that staff row, so RBAC applies
   * Both create an `admin` session; the role travels with the subject.
   */
  app.post<{ Body: { passcode?: string } }>("/api/admin/login", async (req, reply) => {
    const passcode = typeof req.body?.passcode === "string" ? req.body.passcode.trim() : "";
    if (!passcode || passcode.length > 256) return reply.code(401).send({ok:false,message:"رمز مدیریت درست نیست."});
    const admin = (await getDocument<Record<string, any>>("admin")) ?? {};
    const ops = (await getDocument<Record<string, any>>("ops")) ?? {};
    const expected = String(admin.settings?.passcode ?? ops.security?.passcode ?? "");
    const ownerHash = typeof admin.settings?.passcodeHash === "string" ? admin.settings.passcodeHash : "";

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
    const matchesOwner = (!config.isProd || passcode.length >= 12) && (ownerHash
      ? verifyPassword(passcode, ownerHash)
      : !!expected && (!config.isProd || expected.length >= 12) && passcode === expected);
    if (matchesOwner) {
      subject = "admin";
      if (config.isProd && !ownerHash) {
        // Upgrade an existing strong legacy owner credential on first login.
        // Lock both documents, revoke older owner sessions, and never audit the secret.
        await withTransaction(async client => {
          const docs=await client.query<{key:string;value:Record<string,any>}>("select key,value from state_documents where key in ('admin','ops') order by key for update");
          const currentAdmin=docs.rows.find(row=>row.key==="admin")?.value;
          const currentOps=docs.rows.find(row=>row.key==="ops")?.value;
          const currentSecret=String(currentAdmin?.settings?.passcode ?? currentOps?.security?.passcode ?? "");
          if (!currentAdmin || !currentOps) throw new Error("Owner credential unavailable.");
          if (currentAdmin.settings?.passcodeHash) {
            if (verifyPassword(passcode,currentAdmin.settings.passcodeHash)) return;
            throw new Error("Owner credential changed concurrently; retry login.");
          }
          if (currentSecret !== passcode) throw new Error("Owner credential changed concurrently; retry login.");
          currentAdmin.settings={...(currentAdmin.settings ?? {}),passcodeHash:hashPassword(passcode)};
          delete currentAdmin.settings.passcode;
          if(currentOps.security) delete currentOps.security.passcode;
          await client.query("update state_documents set value=$2::jsonb,updated_at=now() where key=$1",["admin",JSON.stringify(currentAdmin)]);
          await client.query("update state_documents set value=$2::jsonb,updated_at=now() where key=$1",["ops",JSON.stringify(currentOps)]);
          await client.query("delete from sessions where kind='admin' and subject='admin'");
          await recordAudit({actor:"admin",action:"security.owner_credential_migrated",targetType:"staff",targetId:"admin",requestId:req.id},client);
        });
      }
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
      ...sessionBody(session.token),
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
