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

-- Nullable for compatibility with logical backups made before CRM labels existed.
-- NULL means no manually assigned labels; automatic labels are computed live.
alter table customers add column if not exists manual_labels jsonb;

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
alter table inventory_adjustments add column if not exists baseline_on_hand integer;
alter table inventory_adjustments add column if not exists counted_on_hand integer;
alter table inventory_adjustments add column if not exists baseline_stock_version text;
alter table inventory_adjustments add column if not exists decision_note text;
alter table inventory_adjustments add column if not exists operation_key text;
alter table inventory_adjustments add column if not exists operation_fingerprint text;
create unique index if not exists inventory_adjustments_operation_key_idx on inventory_adjustments(operation_key) where operation_key is not null;

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

-- additive: percent coupons need a hard ceiling (no 100% giveaway)
alter table coupons add column if not exists max_discount numeric(12, 2);

-- additive: a percent campaign can carry its own ceiling too (decision 33)
alter table price_rules add column if not exists max_discount numeric(12, 2);
-- Optional independent delivery benefit on a monetary campaign.
alter table price_rules add column if not exists free_shipping boolean not null default false;

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
-- NULL in pre-migration backups means no manual quote confirmation is pending.
alter table checkout_sessions add column if not exists manual_quote_confirm_required boolean default false;

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

-- wallet deduction captured with the payment attempt (order total never changes)
alter table payment_attempts add column if not exists wallet_applied numeric(12, 2) not null default 0;
alter table payment_attempts add column if not exists wallet_email text;
-- Frozen invoice for this attempt, independent of later checkout edits.
alter table payment_attempts add column if not exists quote_snapshot jsonb;

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
-- carrier data is relational as well as mirrored in the legacy document, so
-- the warehouse, print centre and customer account all read the same values
alter table orders add column if not exists tracking_code text;
alter table orders add column if not exists carrier_name text;
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
-- staged RMA (2026-11-04): goods must be received and inspected before money or
-- stock moves; an exchange carries its own price difference
alter table refunds add column if not exists kind text not null default 'refund';
alter table refunds add column if not exists target_variant_id text;
alter table refunds add column if not exists received_at timestamptz;
alter table refunds add column if not exists qc_result text;
alter table refunds add column if not exists qc_note text;
alter table refunds add column if not exists difference_amount numeric(12, 2) not null default 0;
alter table refunds add column if not exists provider_ref text;

create table if not exists exchange_payments (
  id text primary key,
  refund_id text not null references refunds (id) on delete cascade,
  amount numeric(12, 2) not null,
  token text not null unique,
  status text not null default 'unpaid',
  provider_ref text,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists exchange_payments_refund_idx on exchange_payments (refund_id);

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

-- tiered cashback: the rate depends on how much the basket is worth
create table if not exists cashback_ledger (
  id text primary key,
  customer_email text,
  order_id text references orders (id) on delete cascade,
  kind text not null default 'earn',
  base_amount numeric(12, 2) not null default 0,
  percent numeric(6, 2) not null default 0,
  amount numeric(12, 2) not null,
  ref_id text,
  note text,
  created_at timestamptz not null default now()
);
alter table cashback_ledger add column if not exists ref_id text;
-- policy 2026-11-04: earned cashback is held until delivery (+ return window),
-- can only be spent on a LATER order, and expires (default 12 months)
alter table cashback_ledger add column if not exists available_at timestamptz;
alter table cashback_ledger add column if not exists expires_at timestamptz;
create unique index if not exists cashback_earn_uniq on cashback_ledger (order_id) where kind = 'earn';
create unique index if not exists cashback_reversal_uniq on cashback_ledger (ref_id) where kind = 'reversal';
create unique index if not exists cashback_redeem_uniq on cashback_ledger (ref_id) where kind = 'redeem';
create unique index if not exists cashback_refund_credit_uniq on cashback_ledger (ref_id) where kind = 'refund_credit';
create index if not exists cashback_ledger_email_idx on cashback_ledger (customer_email, created_at desc);
create index if not exists cashback_ledger_order_idx on cashback_ledger (order_id);

/* =====================================================================
   Audit trail — append-only. Every privileged money/stock/catalog action
   writes actor + before + after in the same transaction as the change.
   UPDATE/DELETE are rejected by a trigger so history cannot be rewritten.
   ===================================================================== */
create table if not exists audit_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  target_type text not null,
  target_id text,
  before jsonb,
  after jsonb,
  reason text,
  request_id text
);
create index if not exists audit_events_at_idx on audit_events (at desc);
create index if not exists audit_events_target_idx on audit_events (target_type, target_id);

create or replace function kv_audit_append_only() returns trigger as $$
begin
  raise exception 'audit_events is append-only';
end;
$$ language plpgsql;

drop trigger if exists audit_events_append_only on audit_events;
create trigger audit_events_append_only
  before update or delete on audit_events
  for each row execute function kv_audit_append_only();

-- every catalogue price change keeps its history; invoices keep their own snapshot
create table if not exists price_history (
  id bigserial primary key,
  at timestamptz not null default now(),
  product_id text not null,
  old_price numeric(10, 2),
  new_price numeric(10, 2) not null,
  actor text,
  source text not null default 'admin'
);
create index if not exists price_history_product_idx on price_history (product_id, at desc);

-- ---------------------------------------------------------------------------
-- RBAC: roles and staff. Every admin write asks this table first (http/rbac.ts)
-- ---------------------------------------------------------------------------
create table if not exists roles (
  id text primary key,
  name text not null,
  description text not null default '',
  permissions jsonb not null default '[]'::jsonb,
  protected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists staff (
  id text primary key,
  name text not null,
  -- the session subject this person signs in as
  subject text not null unique,
  role_id text not null references roles (id),
  -- null for the owner row, who signs in with the store passcode
  passcode_hash text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists staff_role_idx on staff (role_id);

-- logical backups (decisions 11 + 85): the file lives on disk, this row is the index
create table if not exists backups (
  id text primary key,
  file text not null,
  bytes bigint not null,
  kind text not null default 'manual',
  sha256 text not null,
  tables integer not null default 0,
  rows integer not null default 0,
  created_at timestamptz not null default now(),
  cloud_status text not null default 'not_configured',
  cloud_error text
);
create index if not exists backups_created_idx on backups (created_at desc);

-- temporary staff access (decision 89): a grant that ends on a date
alter table staff add column if not exists expires_at timestamptz;

-- login history (decision 88): every admin sign-in attempt, refused ones too
create table if not exists login_events (
  id bigserial primary key,
  at timestamptz not null default now(),
  subject text not null,
  ok boolean not null,
  reason text,
  ip text,
  user_agent text
);
create index if not exists login_events_at_idx on login_events (at desc);

-- First-party visit counting (decision 80). No third-party script: the shop
-- posts a path with a random session id, and the panel aggregates the rows.
create table if not exists page_views (
  id bigserial primary key,
  at timestamptz not null default now(),
  path text not null,
  session text not null,
  referrer text,
  device text
);
create index if not exists page_views_at_idx on page_views (at desc);
create index if not exists page_views_session_idx on page_views (session);

-- Newsletter sign-ups from the storefront widget (decision 75, batch 2).
-- One row per address; nothing else is stored, and the panel can read and
-- export them. A duplicate sign-up is not an error for the shopper.
create table if not exists newsletter_subscribers (
  email text primary key,
  source text,
  created_at timestamptz not null default now()
);
create index if not exists newsletter_created_idx on newsletter_subscribers (created_at desc);

-- Customer style gallery. Public submissions stay pending until a content
-- editor approves both the image and the recorded publication consent.
create table if not exists gallery_items (
  id text primary key,
  customer_handle text not null,
  email text,
  image_url text not null,
  caption text not null default '',
  moderation_status text not null default 'pending',
  consent_verified boolean not null default false,
  submitted_at timestamptz not null default now(),
  moderated_at timestamptz,
  moderated_by text
);
create index if not exists gallery_items_status_idx on gallery_items (moderation_status, submitted_at desc);

-- Editorial content lives in the store database, never the prototype panel DB.
create table if not exists journal_articles (
  id text primary key,
  slug text not null unique,
  title text not null,
  excerpt text not null default '',
  category text not null default '',
  body text not null default '',
  cover_url text not null default '',
  seo_title text not null default '',
  seo_description text not null default '',
  status text not null default 'draft' check (status in ('draft','published')),
  published_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists journal_articles_public_idx on journal_articles(status,published_at desc);
