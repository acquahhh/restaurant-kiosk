-- =============================================================================
-- 0001_initial_schema.sql
-- Self-service restaurant ordering & kitchen management system
--
-- Money: every amount is stored as an INTEGER in pesewas (GH₵ 1.00 = 100).
--        This matches Paystack's minor-unit API and avoids float rounding.
-- Snapshots: order_items and order_item_customizations copy the name and price
--        at purchase time so menu edits never rewrite history.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'manager', 'kitchen');
create type public.order_type as enum ('dine_in', 'takeaway');
create type public.order_status as enum (
  'pending_payment',   -- created, awaiting payment confirmation (MoMo/card)
  'received',          -- paid (or cash accepted) and visible to the kitchen
  'preparing',
  'ready',
  'completed',
  'cancelled'
);
create type public.payment_status as enum ('pending', 'paid', 'failed', 'refunded');
create type public.payment_method as enum ('mobile_money', 'card', 'cash');
create type public.payment_provider as enum ('paystack', 'cash');
create type public.selection_type as enum ('single', 'multiple');

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Staff profiles (one row per auth user; role drives authorization)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  role        public.user_role not null default 'kitchen',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- Helper used by RLS policies
create or replace function public.current_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

-- -----------------------------------------------------------------------------
-- Restaurant settings (single row, id is always 1)
-- -----------------------------------------------------------------------------
create table public.restaurant_settings (
  id                      smallint primary key default 1 check (id = 1),
  name                    text not null,
  tagline                 text,
  logo_url                text,
  currency                char(3) not null default 'GHS',
  tax_rate_bp             integer not null default 0 check (tax_rate_bp between 0 and 10000),           -- basis points: 1250 = 12.5%
  service_charge_bp       integer not null default 0 check (service_charge_bp between 0 and 10000),
  opening_hours           jsonb not null default '{}'::jsonb,   -- {"mon":{"open":"09:00","close":"22:00"}, ...}
  kiosk_timeout_seconds   integer not null default 90 check (kiosk_timeout_seconds between 15 and 600),
  accept_cash             boolean not null default false,
  accept_mobile_money     boolean not null default true,
  accept_card             boolean not null default false,
  default_prep_minutes    integer not null default 15 check (default_prep_minutes > 0),
  kitchen_sound_enabled   boolean not null default true,
  updated_at              timestamptz not null default now()
);
create trigger restaurant_settings_updated_at before update on public.restaurant_settings
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Menu
-- -----------------------------------------------------------------------------
create table public.menu_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  image_url   text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger menu_categories_updated_at before update on public.menu_categories
  for each row execute function public.set_updated_at();

create table public.menu_items (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references public.menu_categories (id) on delete restrict,
  name          text not null,
  description   text not null default '',
  image_url     text,
  base_price    integer not null check (base_price >= 0),      -- pesewas
  is_available  boolean not null default true,
  is_featured   boolean not null default false,
  is_popular    boolean not null default false,
  prep_minutes  integer check (prep_minutes is null or prep_minutes > 0),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index menu_items_category_idx on public.menu_items (category_id, sort_order);
create index menu_items_featured_idx on public.menu_items (is_featured) where is_featured;
create index menu_items_popular_idx  on public.menu_items (is_popular)  where is_popular;
create trigger menu_items_updated_at before update on public.menu_items
  for each row execute function public.set_updated_at();

-- A group of choices on one meal, e.g. "Size", "Sauces", "Add a drink"
create table public.customization_groups (
  id              uuid primary key default gen_random_uuid(),
  menu_item_id    uuid not null references public.menu_items (id) on delete cascade,
  name            text not null,
  selection_type  public.selection_type not null default 'single',
  is_required     boolean not null default false,
  min_select      integer not null default 0 check (min_select >= 0),
  max_select      integer check (max_select is null or max_select >= 1),
  sort_order      integer not null default 0,
  check (max_select is null or max_select >= min_select)
);
create index customization_groups_item_idx on public.customization_groups (menu_item_id, sort_order);

create table public.customization_options (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.customization_groups (id) on delete cascade,
  name          text not null,
  price_delta   integer not null default 0,                   -- pesewas, may be negative
  is_default    boolean not null default false,
  is_available  boolean not null default true,
  sort_order    integer not null default 0
);
create index customization_options_group_idx on public.customization_options (group_id, sort_order);

-- -----------------------------------------------------------------------------
-- Dining tables
-- -----------------------------------------------------------------------------
create table public.restaurant_tables (
  id         uuid primary key default gen_random_uuid(),
  number     text not null unique,        -- "1", "2", "A3" — shown to customers
  seats      integer check (seats is null or seats > 0),
  is_active  boolean not null default true
);

-- -----------------------------------------------------------------------------
-- Orders
-- -----------------------------------------------------------------------------
-- Daily counter so customers get short numbers like 041 instead of UUIDs.
create table public.order_counters (
  order_date   date primary key,
  last_number  integer not null default 0
);

create or replace function public.next_order_number(p_date date)
returns text language plpgsql as $$
declare v_next integer;
begin
  insert into public.order_counters (order_date, last_number)
  values (p_date, 1)
  on conflict (order_date) do update
    set last_number = public.order_counters.last_number + 1
  returning last_number into v_next;
  return lpad(v_next::text, 3, '0');
end $$;

create table public.orders (
  id                 uuid primary key default gen_random_uuid(),
  order_date         date not null default (now() at time zone 'Africa/Accra')::date,
  order_number       text not null,
  order_type         public.order_type not null,
  status             public.order_status not null default 'pending_payment',

  -- Who / where (snapshotted, so deleting a table never breaks history)
  table_id           uuid references public.restaurant_tables (id) on delete set null,
  table_number       text,
  customer_name      text,
  customer_phone     text,

  -- Money (pesewas)
  subtotal           integer not null check (subtotal >= 0),
  tax_amount         integer not null default 0 check (tax_amount >= 0),
  service_charge     integer not null default 0 check (service_charge >= 0),
  total              integer not null check (total >= 0),

  payment_status     public.payment_status not null default 'pending',
  payment_method     public.payment_method,

  -- Guards against double submission from a kiosk retry
  idempotency_key    text not null unique,

  estimated_ready_at timestamptz,
  placed_at          timestamptz not null default now(),
  preparing_at       timestamptz,
  ready_at           timestamptz,
  completed_at       timestamptz,
  cancelled_at       timestamptz,
  updated_at         timestamptz not null default now(),

  unique (order_date, order_number),
  check (order_type <> 'dine_in'  or table_number is not null),
  check (order_type <> 'takeaway' or customer_name is not null),
  check (total = subtotal + tax_amount + service_charge)
);
create index orders_status_idx       on public.orders (status, placed_at);
create index orders_placed_at_idx    on public.orders (placed_at desc);
create index orders_payment_idx      on public.orders (payment_status);
create index orders_kitchen_idx      on public.orders (placed_at) where status in ('received', 'preparing', 'ready');
create trigger orders_updated_at before update on public.orders
  for each row execute function public.set_updated_at();

create or replace function public.assign_order_number()
returns trigger language plpgsql as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := public.next_order_number(new.order_date);
  end if;
  return new;
end $$;
create trigger orders_assign_number before insert on public.orders
  for each row execute function public.assign_order_number();

create table public.order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references public.orders (id) on delete cascade,
  menu_item_id          uuid references public.menu_items (id) on delete set null,
  item_name             text not null,                              -- snapshot
  unit_price            integer not null check (unit_price >= 0),   -- snapshot, includes customizations
  quantity              integer not null check (quantity > 0),
  line_total            integer not null check (line_total >= 0),
  special_instructions  text,
  check (line_total = unit_price * quantity)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_menu_item_idx on public.order_items (menu_item_id);

create table public.order_item_customizations (
  id             uuid primary key default gen_random_uuid(),
  order_item_id  uuid not null references public.order_items (id) on delete cascade,
  option_id      uuid references public.customization_options (id) on delete set null,
  group_name     text not null,     -- snapshot
  option_name    text not null,     -- snapshot
  price_delta    integer not null default 0
);
create index order_item_customizations_item_idx on public.order_item_customizations (order_item_id);

-- -----------------------------------------------------------------------------
-- Payments (one order may have several attempts; only one may be 'paid')
-- -----------------------------------------------------------------------------
create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id) on delete restrict,
  provider            public.payment_provider not null,
  method              public.payment_method not null,
  amount              integer not null check (amount > 0),
  currency            char(3) not null default 'GHS',
  reference           text not null unique,          -- our reference sent to Paystack
  provider_reference  text,                          -- Paystack transaction id
  channel             text,                          -- e.g. "mobile_money", "card", "mtn", "vod"
  status              public.payment_status not null default 'pending',
  paid_at             timestamptz,
  raw_response        jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id);
create unique index payments_one_paid_per_order on public.payments (order_id) where status = 'paid';
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Order status history (written automatically)
-- -----------------------------------------------------------------------------
create table public.order_status_history (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders (id) on delete cascade,
  from_status  public.order_status,
  to_status    public.order_status not null,
  changed_by   uuid references public.profiles (id) on delete set null,
  changed_at   timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, changed_at);

create or replace function public.log_order_status()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.order_status_history (order_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
    -- stamp the matching timestamp column
    case new.status
      when 'preparing' then new.preparing_at := now();
      when 'ready'     then new.ready_at     := now();
      when 'completed' then new.completed_at := now();
      when 'cancelled' then new.cancelled_at := now();
      else null;
    end case;
  end if;
  return new;
end $$;
create trigger orders_log_status_insert after insert on public.orders
  for each row execute function public.log_order_status();
create trigger orders_log_status_update before update on public.orders
  for each row execute function public.log_order_status();

-- -----------------------------------------------------------------------------
-- Row Level Security
--   Kiosk (anon key): read menu + public settings only. Order creation and
--   payment updates go through server actions using the service role.
--   Staff (authenticated): read orders; kitchen can update status; admin and
--   manager manage the menu and settings.
-- -----------------------------------------------------------------------------
alter table public.profiles                  enable row level security;
alter table public.restaurant_settings       enable row level security;
alter table public.menu_categories           enable row level security;
alter table public.menu_items                enable row level security;
alter table public.customization_groups      enable row level security;
alter table public.customization_options     enable row level security;
alter table public.restaurant_tables         enable row level security;
alter table public.orders                    enable row level security;
alter table public.order_items               enable row level security;
alter table public.order_item_customizations enable row level security;
alter table public.payments                  enable row level security;
alter table public.order_status_history      enable row level security;
alter table public.order_counters            enable row level security;

-- Public menu reads
create policy "menu categories are public"   on public.menu_categories   for select using (is_active);
create policy "menu items are public"        on public.menu_items        for select using (true);
create policy "customization groups public"  on public.customization_groups  for select using (true);
create policy "customization options public" on public.customization_options for select using (true);
create policy "tables are public"            on public.restaurant_tables for select using (is_active);
create policy "settings are public"          on public.restaurant_settings for select using (true);

-- Staff self-profile
create policy "staff read own profile"  on public.profiles for select using (id = auth.uid());
create policy "admin manages profiles"  on public.profiles for all using (public.current_role() = 'admin');

-- Menu & settings management
create policy "managers edit categories" on public.menu_categories for all
  using (public.current_role() in ('admin', 'manager'));
create policy "managers edit items" on public.menu_items for all
  using (public.current_role() in ('admin', 'manager'));
create policy "managers edit groups" on public.customization_groups for all
  using (public.current_role() in ('admin', 'manager'));
create policy "managers edit options" on public.customization_options for all
  using (public.current_role() in ('admin', 'manager'));
create policy "managers edit tables" on public.restaurant_tables for all
  using (public.current_role() in ('admin', 'manager'));
create policy "admin edits settings" on public.restaurant_settings for update
  using (public.current_role() = 'admin');

-- Orders: all staff read; kitchen updates status; managers update anything
create policy "staff read orders"   on public.orders for select using (public.current_role() is not null);
create policy "staff update orders" on public.orders for update using (public.current_role() is not null);
create policy "staff read order items" on public.order_items for select using (public.current_role() is not null);
create policy "staff read customizations" on public.order_item_customizations for select using (public.current_role() is not null);
create policy "staff read payments" on public.payments for select using (public.current_role() is not null);
create policy "staff read history" on public.order_status_history for select using (public.current_role() is not null);

-- Realtime: kitchen and tracking screens subscribe to these
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;

-- -----------------------------------------------------------------------------
-- Storage bucket for food photos and the logo (public read, staff write)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;

create policy "menu images are public" on storage.objects for select
  using (bucket_id = 'menu-images');
create policy "managers upload menu images" on storage.objects for insert
  with check (bucket_id = 'menu-images' and public.current_role() in ('admin', 'manager'));
create policy "managers replace menu images" on storage.objects for update
  using (bucket_id = 'menu-images' and public.current_role() in ('admin', 'manager'));
create policy "managers delete menu images" on storage.objects for delete
  using (bucket_id = 'menu-images' and public.current_role() in ('admin', 'manager'));
