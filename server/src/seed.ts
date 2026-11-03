import { query } from "./db";
import { seed, syncProjection } from "./projection";
import { hashPassword } from "./security";

export type Doc = Record<string, unknown>;

export async function getDocument<T = Doc>(key: string): Promise<T | null> {
  const res = await query<{ value: T }>("select value from state_documents where key = $1", [key]);
  return res.rows[0]?.value ?? null;
}

export async function putDocument(key: string, value: unknown) {
  await query(
    `insert into state_documents (key, value, updated_at) values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

const DEMO_ADDRESSES = [
  {
    id: "a1",
    label: "خانه",
    receiver: "آوا رادمهر",
    phone: "09120000000",
    province: "تهران",
    city: "تهران",
    street: "خیابان ولیعصر، پلاک ۱۲، واحد ۳",
    postal: "1234567890",
    default: true,
  },
  {
    id: "a2",
    label: "محل کار",
    receiver: "آوا رادمهر",
    phone: "09120000000",
    province: "تهران",
    city: "تهران",
    street: "خیابان جردن، برج آوا، طبقه ۷",
    postal: "1234567891",
    default: false,
  },
];

const DEMO_SIZE = { height: 172, weight: 68, age: 30, chest: 92, waist: 74, hip: 98, shoulder: 42, fit: "regular", shoe: 39 };

/** Idempotent bootstrap: documents, product projection and the demo customer. */
export async function seedDatabase() {
  const existing = await query<{ key: string }>("select key from state_documents");
  const keys = new Set(existing.rows.map((r) => r.key));

  if (!keys.has("admin")) await putDocument("admin", seed.admin);
  if (!keys.has("ops")) await putDocument("ops", seed.ops);

  const admin = ((await getDocument("admin")) ?? seed.admin) as Record<string, never>;
  const ops = ((await getDocument("ops")) ?? seed.ops) as Record<string, never>;

  const count = await query<{ n: number }>("select count(*)::int as n from products");
  if (count.rows[0].n === 0) await syncProjection(admin, ops);

  await query(
    `insert into customers (email, name, phone, password_hash, size, addresses, created_at)
     values ($1, $2, $3, $4, $5, $6, now() - interval '60 days')
     on conflict (email) do nothing`,
    [
      "ava@example.com",
      "آوا رادمهر",
      "09120000000",
      hashPassword("demo1234"),
      JSON.stringify(DEMO_SIZE),
      JSON.stringify(DEMO_ADDRESSES),
    ],
  );
}
