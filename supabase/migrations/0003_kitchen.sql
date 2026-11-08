-- =============================================================================
-- 0003_kitchen.sql
-- Kitchen display support.
--
-- * Staff no longer UPDATE orders directly. Kitchen staff change status only
--   through set_order_status(), which enforces the allowed steps. Managers and
--   admins keep direct update rights for the admin dashboard.
-- * mark_cash_paid(): records a cash payment taken at the counter.
-- * kitchen_orders(): one call returns every open order with its items.
-- * order_board(): public, numbers-only list for the customer status screen.
-- =============================================================================

drop policy if exists "staff update orders" on public.orders;
create policy "managers update orders" on public.orders for update
  using (public.current_role() in ('admin', 'manager'));

-- -----------------------------------------------------------------------------
-- set_order_status
-- Forward:  received → preparing → ready → completed
-- Undo:     one step back (a mis-tap during a rush)
-- Cancel:   managers and admins only, from any open status
-- -----------------------------------------------------------------------------
create or replace function public.set_order_status(p_order_id uuid, p_status public.order_status)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role  public.user_role := public.current_role();
  v_order public.orders;
  v_from  public.order_status;
begin
  if v_role is null then raise exception 'NOT_ALLOWED'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  v_from := v_order.status;

  if v_from = p_status then return v_order; end if;   -- double tap: no-op

  if p_status = 'cancelled' then
    if v_role not in ('admin', 'manager') then raise exception 'NOT_ALLOWED'; end if;
    if v_from in ('completed', 'cancelled') then raise exception 'BAD_TRANSITION:%', v_from || '->' || p_status; end if;
  elsif not (
       (v_from = 'received'  and p_status = 'preparing')
    or (v_from = 'preparing' and p_status = 'ready')
    or (v_from = 'ready'     and p_status = 'completed')
    or (v_from = 'preparing' and p_status = 'received')
    or (v_from = 'ready'     and p_status = 'preparing')
    or (v_from = 'completed' and p_status = 'ready')
  ) then
    raise exception 'BAD_TRANSITION:%', v_from || '->' || p_status;
  end if;

  update public.orders set status = p_status where id = p_order_id returning * into v_order;
  return v_order;
end $$;

-- -----------------------------------------------------------------------------
-- mark_cash_paid: the counter has taken the cash for this order.
-- -----------------------------------------------------------------------------
create or replace function public.mark_cash_paid(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
begin
  if public.current_role() is null then raise exception 'NOT_ALLOWED'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_status = 'paid' then return v_order; end if;            -- idempotent
  if v_order.payment_method <> 'cash' then raise exception 'NOT_CASH'; end if;
  if v_order.status = 'cancelled' then raise exception 'ORDER_CANCELLED'; end if;

  insert into public.payments (order_id, provider, method, amount, reference, status, paid_at)
  values (v_order.id, 'cash', 'cash', v_order.total,
          'CASH-' || to_char(v_order.order_date, 'YYMMDD') || '-' || v_order.order_number
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6),
          'paid', now());

  update public.orders set payment_status = 'paid' where id = p_order_id returning * into v_order;
  return v_order;
end $$;

-- -----------------------------------------------------------------------------
-- kitchen_orders: open orders plus the last two hours of completed ones.
-- -----------------------------------------------------------------------------
create or replace function public.kitchen_orders()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.current_role() is null then raise exception 'NOT_ALLOWED'; end if;

  return coalesce((
    select jsonb_agg(row_to_json(o)::jsonb order by o.placed_at)
    from (
      select
        ord.id, ord.order_number, ord.order_type, ord.status, ord.table_number, ord.customer_name,
        ord.payment_status, ord.payment_method, ord.total,
        ord.placed_at, ord.preparing_at, ord.ready_at, ord.completed_at,
        coalesce((
          select jsonb_agg(jsonb_build_object(
                   'id', oi.id, 'name', oi.item_name, 'quantity', oi.quantity,
                   'instructions', oi.special_instructions,
                   'options', coalesce((select jsonb_agg(c.option_name order by c.id)
                                          from public.order_item_customizations c
                                         where c.order_item_id = oi.id), '[]'::jsonb))
                 order by oi.id)
            from public.order_items oi where oi.order_id = ord.id), '[]'::jsonb) as items
      from public.orders ord
      where ord.status in ('received', 'preparing', 'ready')
         or (ord.status = 'completed' and ord.completed_at > now() - interval '2 hours')
    ) o
  ), '[]'::jsonb);
end $$;

-- -----------------------------------------------------------------------------
-- order_board: what a public status screen may show. Numbers and stage only:
-- no names, tables, items or amounts.
-- -----------------------------------------------------------------------------
create or replace function public.order_board()
returns table (order_number text, status public.order_status, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select o.order_number, o.status, o.updated_at
    from public.orders o
   where o.order_date = (now() at time zone 'Africa/Accra')::date
     and (o.status in ('received', 'preparing')
          or (o.status = 'ready' and o.ready_at > now() - interval '45 minutes'))
   order by o.placed_at;
$$;

revoke all on function public.set_order_status(uuid, public.order_status) from public, anon;
revoke all on function public.mark_cash_paid(uuid) from public, anon;
revoke all on function public.kitchen_orders() from public, anon;
grant execute on function public.set_order_status(uuid, public.order_status) to authenticated;
grant execute on function public.mark_cash_paid(uuid) to authenticated;
grant execute on function public.kitchen_orders() to authenticated;

revoke all on function public.order_board() from public;
grant execute on function public.order_board() to anon, authenticated;

-- Realtime clients need the full row on updates to see status changes.
alter table public.orders replica identity full;
