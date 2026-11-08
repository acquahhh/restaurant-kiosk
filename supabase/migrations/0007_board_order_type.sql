-- =============================================================================
-- 0007_board_order_type.sql  (safe to run more than once)
-- The status board announces takeaway orders aloud when they are ready, so it
-- needs each order's type. Still no names, tables, items or amounts.
-- (A function's result columns can only change by dropping and recreating it.)
-- =============================================================================
drop function if exists public.order_board();

create function public.order_board()
returns table (order_number text, status public.order_status, order_type public.order_type, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select o.order_number, o.status, o.order_type, o.updated_at
    from public.orders o
   where o.order_date = (now() at time zone 'Africa/Accra')::date
     and (o.status in ('received', 'preparing')
          or (o.status = 'ready' and o.ready_at > now() - interval '45 minutes'))
   order by o.placed_at;
$$;

revoke all on function public.order_board() from public;
grant execute on function public.order_board() to anon, authenticated;

-- Payments the server re-checks with Paystack in the background (no webhook
-- when the app is not on the internet).
create or replace function public.payments_to_reconcile(p_minutes int default 30)
returns table (reference text)
language sql
stable
security definer
set search_path = public
as $$
  select p.reference from public.payments p
   where p.provider = 'paystack' and p.status = 'pending'
     and p.created_at > now() - make_interval(mins => p_minutes)
   order by p.created_at;
$$;
revoke all on function public.payments_to_reconcile(int) from public, anon, authenticated;
grant execute on function public.payments_to_reconcile(int) to service_role;
