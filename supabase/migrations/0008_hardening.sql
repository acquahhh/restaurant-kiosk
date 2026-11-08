-- =============================================================================
-- 0008_hardening.sql  (safe to run more than once)
-- Findings from the security review.
-- =============================================================================

-- 1. The order-number counter is only for place_order() (which runs as the
--    owner). Nobody else may call it, or they could make order numbers jump.
revoke all on function public.next_order_number(date) from public, anon, authenticated;

-- 2. No direct edits to orders by anyone. Cancelling and marking paid go
--    through set_order_status() and mark_cash_paid(), which check the rules and
--    record who did it. A direct UPDATE could change a total or payment status.
drop policy if exists "managers update orders" on public.orders;

-- 3. Payment records (including Paystack's raw responses) are for managers and
--    admins. The kitchen gets paid/unpaid from kitchen_orders().
drop policy if exists "staff read payments" on public.payments;
drop policy if exists "managers read payments" on public.payments;
create policy "managers read payments" on public.payments for select
  using (public.current_role() in ('admin', 'manager'));

-- 4. Photo uploads: images only, at most 5 MB (where the Storage schema has these columns).
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets
       set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
           file_size_limit = 5 * 1024 * 1024
     where id = 'menu-images';
  end if;
end $$;
