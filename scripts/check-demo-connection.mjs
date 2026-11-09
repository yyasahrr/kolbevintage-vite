#!/usr/bin/env node
// Read-only Supabase connectivity and isolation preflight. Never prints or
// persists credentials. This does not create, modify, or provision anything.
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import pg from 'pg';

const ref = 'fpeixxuiidllpebixeif';
if (!process.stdin.isTTY) {
  console.error('این بررسی باید در یک ترمینال تعاملی اجرا شود.');
  process.exit(1);
}
const silent = new Writable({ write(_chunk, _encoding, cb) { cb(); } });
const rl = createInterface({ input: process.stdin, output: silent, terminal: true });
async function secret(prompt) {
  process.stderr.write(prompt);
  try { return await rl.question(''); } finally { process.stderr.write('\n'); }
}
let client;
try {
  const raw = await secret('آدرس URI پروژه Supabase (نمایش داده نمی‌شود): ');
  const url = new URL(raw.trim());
  const user = decodeURIComponent(url.username);
  const host = url.hostname.toLowerCase();
  const port = Number(url.port || 5432);
  const isDirect = host === `db.${ref}.supabase.co` && user === 'postgres';
  const isPooler = host.endsWith('.pooler.supabase.com') && user === `postgres.${ref}`;
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !(isDirect || isPooler) || port !== 5432 || url.pathname !== '/postgres') {
    throw new Error('connection_format');
  }
  // Do not use URL query parameters: in particular they must not weaken TLS.
  const password = await secret('رمز فعلی پایگاه داده Supabase (نمایش داده نمی‌شود): ');
  if (!password) throw new Error('password');
  client = new pg.Client({ host, port, user, password, database: 'postgres', ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10000 });
  await client.connect();
  await client.query('begin read only');
  const result = await client.query(`select
    current_user as role,
    to_regclass('kolbe_demo.state_documents') is not null as state_table,
    to_regclass('kolbe_demo.security_rate_limits') is not null as rate_table,
    to_regclass('kolbe_demo.roles') is not null as roles_table,
    (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kolbe_demo' and c.relkind in ('r','p')) as tables,
    (select rolcanlogin from pg_roles where rolname='kolbe_demo_app') as app_role_can_login,
    not has_schema_privilege('anon','kolbe_demo','USAGE,CREATE') and not has_schema_privilege('authenticated','kolbe_demo','USAGE,CREATE') as schema_private,
    not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m') and (has_table_privilege('kolbe_demo_app',c.oid,'SELECT') or has_table_privilege('kolbe_demo_app',c.oid,'INSERT') or has_table_privilege('kolbe_demo_app',c.oid,'UPDATE') or has_table_privilege('kolbe_demo_app',c.oid,'DELETE'))) as public_isolated`);
  await client.query('rollback');
  const r = result.rows[0];
  console.log(`اتصال رمزنگاری‌شده برقرار شد. جدول‌های دمو: ${r.tables}؛ جدول‌های اصلی: ${r.state_table && r.rate_table && r.roles_table ? 'موجود' : 'ناقص'}؛ schema خصوصی: ${r.schema_private ? 'بله' : 'خیر'}؛ نقش دمو از public جداست: ${r.public_isolated ? 'بله' : 'خیر'}؛ ورود نقش دمو فعال: ${r.app_role_can_login ? 'بله' : 'خیر'}.`);
  if (r.role !== 'postgres' || r.tables !== 39 || !r.state_table || !r.rate_table || !r.roles_table || !r.schema_private || !r.public_isolated || r.app_role_can_login !== false) {
    console.error('وضعیت با پیش‌نیازهای مورد انتظار یکسان نیست؛ بدون بررسی ادامه ندهید.');
    process.exitCode = 1;
  }
} catch (error) {
  const code = error instanceof Error ? error.message : '';
  if (code === 'connection_format') console.error('آدرس معتبر این پروژه نیست؛ URI مستقیم یا Session pooler پروژه را با پورت ۵۴۳۲ انتخاب کنید.');
  else if (code === 'password') console.error('رمز خالی است.');
  else console.error('بررسی اتصال موفق نبود. آدرس، رمز، دسترسی شبکه و گواهی TLS را بررسی کنید؛ هیچ تغییری در داده‌ها انجام نشده است.');
  process.exitCode = 1;
} finally {
  rl.close();
  await client?.end().catch(() => {});
}
