-- =============================================================================
-- 0009_branding.sql  (safe to run more than once)
-- The restaurant's colours, chosen in Admin > Settings and applied to every
-- screen. Readability (contrast) is checked by the app before saving.
-- =============================================================================
alter table public.restaurant_settings add column if not exists brand_primary text not null default '#16603a';
alter table public.restaurant_settings add column if not exists brand_accent  text not null default '#f2b134';

do $$ begin
  alter table public.restaurant_settings add constraint brand_primary_hex check (brand_primary ~ '^#[0-9a-fA-F]{6}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.restaurant_settings add constraint brand_accent_hex check (brand_accent ~ '^#[0-9a-fA-F]{6}$');
exception when duplicate_object then null; end $$;
