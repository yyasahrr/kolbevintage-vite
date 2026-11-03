-- KolbeVintage backend schema (PostgreSQL)
--
-- The admin/ops panels keep their full document shape in `state_documents`
-- (so the prototype UI keeps working unchanged), while the entities the rest
-- of the world cares about are projected into real relational tables:
-- products, product_images, product_complements, orders, customers, sessions.

create table if not exists state_documents (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id text primary key,
  name text not null,
  category text not null,
  garment text not null,
  price numeric(10, 2) not null default 0,
  compare_at numeric(10, 2),
  description text,
  material text,
  care text,
  fit text,
  origin text,
  badge text,
  look_id text,
  look_name text,
  look_slug text,
  look_order integer not null default 0,
  crop jsonb,
  colors jsonb not null default '[]'::jsonb,
  sizes jsonb not null default '[]'::jsonb,
  stock jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  featured boolean not null default false,
  is_base boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists product_images (
  id text primary key,
  product_id text not null references products (id) on delete cascade,
  url text not null,
  color_id text not null default '*',
  role text not null default 'gallery',
  position integer not null default 0
);
create index if not exists product_images_product_idx on product_images (product_id, position);

create table if not exists product_complements (
  product_id text not null references products (id) on delete cascade,
  complement_id text not null,
  position integer not null default 0,
  primary key (product_id, complement_id)
);
create index if not exists product_complements_product_idx on product_complements (product_id, position);

create table if not exists orders (
  id text primary key,
  created_at timestamptz not null,
  customer text,
  email text,
  status text,
  total numeric(10, 2),
  data jsonb not null
);
create index if not exists orders_created_idx on orders (created_at desc);

create table if not exists customers (
  email text primary key,
  name text,
  phone text,
  password_hash text,
  size jsonb,
  addresses jsonb not null default '[]'::jsonb,
  two_factor boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token text primary key,
  kind text not null,
  subject text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_expiry_idx on sessions (expires_at);

create table if not exists otp_codes (
  email text primary key,
  code text not null,
  channel text not null,
  expires_at timestamptz not null
);
