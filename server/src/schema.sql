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

-- =====================================================================
-- Commerce core (V3): variants, inventory ledger, reservations, carts,
-- price quotes, checkout sessions, payments, orders snapshot, refunds
-- and a transactional outbox.
-- =====================================================================

create table if not exists commerce_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- every purchasable variant gets a stable id + sku; stock lives here
create table if not exists product_variants (
  id text primary key,
  product_id text not null references products (id) on delete cascade,
  color_id text not null,
  size_id text not null,
  sku text not null unique,
  size_mode text not null default 'standard_sizes',
  on_hand integer not null default 0 check (on_hand >= 0),
  quarantined integer not null default 0 check (quarantined >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, color_id, size_id)
);
create index if not exists product_variants_product_idx on product_variants (product_id);

-- append-only ledger of on_hand changes (audit trail for every stock move)
create table if not exists inventory_movements (
  id bigserial primary key,
  variant_id text not null references product_variants (id) on delete cascade,
  delta integer not null,
  reason text not null,
  ref_type text,
  ref_id text,
  actor text,
  note text,
  dedupe_key text unique,
  created_at timestamptz not null default now()
);
create index if not exists inventory_movements_variant_idx on inventory_movements (variant_id, created_at desc);

-- manual stock corrections need a second, different approver
create table if not exists inventory_adjustments (
  id text primary key,
  variant_id text not null references product_variants (id) on delete cascade,
  delta integer not null,
  reason text not null,
  requested_by text not null,
  status text not null default 'pending',
  approved_by text,
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists inventory_adjustments_status_idx on inventory_adjustments (status, created_at);

-- real hold on stock, created when the customer enters checkout
create table if not exists stock_reservations (
  id text primary key,
  checkout_id text not null,
  variant_id text not null references product_variants (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  status text not null default 'active',
  idempotency_key text unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stock_reservations_checkout_idx on stock_reservations (checkout_id);
create index if not exists stock_reservations_active_idx on stock_reservations (variant_id) where status = 'active';

create table if not exists carts (
  id text primary key,
  token text not null unique,
  customer_email text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists carts_customer_idx on carts (customer_email) where status = 'open';

create table if not exists cart_lines (
  id text primary key,
  cart_id text not null references carts (id) on delete cascade,
  variant_id text not null references product_variants (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  added_price numeric(12, 2) not null default 0,
  warning text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);

-- campaigns (admin.campaigns mirrored here so pricing is server-side)
create table if not exists price_rules (
  id text primary key,
  name text not null,
  kind text not null,
  value numeric(12, 2) not null default 0,
  scope text not null default 'all',
  scope_id text,
  min_subtotal numeric(12, 2) not null default 0,
  priority integer not null default 0,
  stackable boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists coupons (
  code text primary key,
  kind text not null default 'percent',
  value numeric(12, 2) not null default 0,
  min_subtotal numeric(12, 2) not null default 0,
  combinable boolean not null default false,
  usage_limit integer,
  used_count integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists checkout_sessions (
  id text primary key,
  cart_id text,
  customer_email text,
  status text not null default 'open',
  address jsonb,
  shipping_method text not null default 'standard',
  coupon_code text,
  quote jsonb not null,
  quote_version text not null,
  subtotal numeric(12, 2) not null default 0,
  discount_total numeric(12, 2) not null default 0,
  shipping_total numeric(12, 2) not null default 0,
  grand_total numeric(12, 2) not null default 0,
  reservation_expires_at timestamptz,
  quote_expires_at timestamptz,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists checkout_sessions_status_idx on checkout_sessions (status, reservation_expires_at);

create table if not exists payment_attempts (
  id text primary key,
  checkout_id text not null references checkout_sessions (id) on delete cascade,
  order_id text,
  provider text not null,
  method text not null default 'online',
  amount numeric(12, 2) not null,
  status text not null default 'initiated',
  idempotency_key text unique,
  provider_ref text,
  verify_attempts integer not null default 0,
  last_error text,
  raw jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payment_attempts_checkout_idx on payment_attempts (checkout_id);
create index if not exists payment_attempts_status_idx on payment_attempts (status, created_at);

-- order-level financial columns (the `data` jsonb keeps the legacy admin shape)
alter table orders add column if not exists checkout_id text;
alter table orders add column if not exists subtotal numeric(12, 2);
alter table orders add column if not exists discount_total numeric(12, 2) default 0;
alter table orders add column if not exists shipping_total numeric(12, 2) default 0;
alter table orders add column if not exists currency text default 'EUR';
alter table orders add column if not exists payment_status text default 'unpaid';
alter table orders add column if not exists fulfillment_status text default 'unfulfilled';
alter table orders add column if not exists exception_reason text;
alter table orders add column if not exists coupon_code text;
create unique index if not exists orders_checkout_idx on orders (checkout_id) where checkout_id is not null;

create sequence if not exists order_number_seq start 100001;

-- immutable per-line snapshot: later price edits must not rewrite history
create table if not exists order_lines (
  id text primary key,
  order_id text not null references orders (id) on delete cascade,
  variant_id text,
  product_id text,
  sku text,
  name_snapshot text not null,
  color_id text,
  color_name text,
  size_id text,
  size_label text,
  quantity integer not null,
  unit_price numeric(12, 2) not null,
  discount_amount numeric(12, 2) not null default 0,
  line_total numeric(12, 2) not null,
  refunded_quantity integer not null default 0,
  position integer not null default 0
);
create index if not exists order_lines_order_idx on order_lines (order_id, position);

create table if not exists refunds (
  id text primary key,
  order_id text not null references orders (id) on delete cascade,
  order_line_id text not null references order_lines (id) on delete cascade,
  quantity integer not null check (quantity > 0),
  amount numeric(12, 2) not null,
  reason text,
  status text not null default 'requested',
  requested_by text,
  approved_by text,
  note text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists refunds_order_idx on refunds (order_id, created_at desc);

create table if not exists fulfillment_events (
  id bigserial primary key,
  order_id text not null references orders (id) on delete cascade,
  stage text not null,
  sku text,
  accepted boolean not null default true,
  actor text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists fulfillment_events_order_idx on fulfillment_events (order_id, created_at);

-- transactional outbox: side effects never run inside the order transaction
create table if not exists outbox_events (
  id bigserial primary key,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  last_error text,
  result jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists outbox_events_pending_idx on outbox_events (status, available_at);

alter table product_variants add column if not exists last_catalog_qty integer not null default 0;
