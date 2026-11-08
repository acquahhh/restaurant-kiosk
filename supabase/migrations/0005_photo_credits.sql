-- =============================================================================
-- 0005_photo_credits.sql  (safe to run more than once)
-- Records where a meal photo came from (e.g. "Jane Doe on Pexels") so the
-- restaurant can show its sources if ever asked. A photo uploaded or replaced
-- any other way clears the credit automatically.
-- =============================================================================
alter table public.menu_items add column if not exists image_credit text;

create or replace function public.clear_stale_image_credit()
returns trigger language plpgsql as $$
begin
  if new.image_url is distinct from old.image_url
     and new.image_credit is not distinct from old.image_credit then
    new.image_credit := null;
  end if;
  return new;
end $$;

drop trigger if exists menu_items_clear_stale_credit on public.menu_items;
create trigger menu_items_clear_stale_credit before update on public.menu_items
  for each row execute function public.clear_stale_image_credit();
