-- =============================================================================
-- 0010_country.sql  (safe to run more than once)
-- One installation per restaurant, in one country. The country (chosen at
-- setup) decides the time zone for "today" and the hourly report, the
-- currency recorded on payments, and the phone format. Previously Ghana was
-- built in. The functions below are the earlier ones with only those parts
-- changed.
-- =============================================================================
alter table public.restaurant_settings add column if not exists country text not null default 'GH';
alter table public.restaurant_settings add column if not exists time_zone text not null default 'Africa/Accra';
do $$ begin
  alter table public.restaurant_settings add constraint country_known check (country in ('GH', 'RW', 'KE'));
exception when duplicate_object then null; end $$;

-- The restaurant's own time zone and calendar day.
create or replace function public.restaurant_tz()
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select time_zone from public.restaurant_settings where id = 1), 'Africa/Accra');
$$;
create or replace function public.restaurant_today()
returns date language sql stable security definer set search_path = public as $$
  select (now() at time zone public.restaurant_tz())::date;
$$;
create or replace function public.restaurant_currency()
returns char(3) language sql stable security definer set search_path = public as $$
  select coalesce((select currency from public.restaurant_settings where id = 1), 'GHS');
$$;

alter table public.orders alter column order_date set default public.restaurant_today();
alter table public.payments alter column currency set default public.restaurant_currency();

-- Order placement: any local mobile number format (each country's exact rule
-- is checked by the app before it gets here).
create or replace function public.place_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

  v_key        text := p->>'idempotencyKey';
  v_type_text  text := p->>'orderType';
  v_method_txt text := p->>'paymentMethod';
  v_lines      jsonb := coalesce(p->'lines', '[]'::jsonb);

  v_type     public.order_type;
  v_method   public.payment_method;
  v_settings public.restaurant_settings;
  v_existing public.orders;

  v_table_id     uuid;
  v_table_number text;
  v_name         text;
  v_phone        text;

  v_line       jsonb;
  v_item       public.menu_items;
  v_group      public.customization_groups;
  v_opt        public.customization_options;
  v_selections jsonb;
  v_sel        jsonb;
  v_sel_key    text;
  v_opt_id     text;
  v_count      int;
  v_min        int;
  v_qty        int;
  v_unit       int;
  v_instr      text;
  v_opts       jsonb;
  v_priced     jsonb := '[]'::jsonb;

  v_subtotal int := 0;
  v_tax      int;
  v_service  int;
  v_prep     int := 0;

  v_status   public.order_status;
  v_order    public.orders;
  v_item_id  uuid;
  v_p        jsonb;
  v_o        jsonb;
  v_ref      text;
begin
  -- ---------------------------------------------------------------- basics
  if v_key is null or length(v_key) < 8 or length(v_key) > 64 then
    raise exception 'INVALID:idempotencyKey';
  end if;

  -- Idempotency: a retry of an order we already have returns that order.
  select * into v_existing from public.orders where idempotency_key = v_key;
  if found then
    return jsonb_build_object(
      'order_id', v_existing.id, 'order_number', v_existing.order_number,
      'total', v_existing.total, 'status', v_existing.status,
      'payment_status', v_existing.payment_status, 'duplicate', true);
  end if;

  if v_type_text not in ('dine_in', 'takeaway') then raise exception 'INVALID:orderType'; end if;
  if v_method_txt not in ('mobile_money', 'card', 'cash') then raise exception 'INVALID:paymentMethod'; end if;
  v_type := v_type_text::public.order_type;
  v_method := v_method_txt::public.payment_method;

  select * into v_settings from public.restaurant_settings where id = 1;
  if not found then raise exception 'SETTINGS_MISSING'; end if;

  if (v_method = 'cash' and not v_settings.accept_cash)
     or (v_method = 'mobile_money' and not v_settings.accept_mobile_money)
     or (v_method = 'card' and not v_settings.accept_card) then
    raise exception 'METHOD_DISABLED';
  end if;

  -- ---------------------------------------------------------- who / where
  if v_type = 'dine_in' then
    select id, number into v_table_id, v_table_number
      from public.restaurant_tables
     where number = p->>'tableNumber' and is_active;
    if not found then raise exception 'TABLE_INVALID'; end if;
  else
    v_name := btrim(coalesce(p->>'customerName', ''));
    if length(v_name) < 2 or length(v_name) > 30 then raise exception 'NAME_REQUIRED'; end if;
  end if;

  v_phone := nullif(btrim(coalesce(p->>'customerPhone', '')), '');
  if v_phone is not null and v_phone !~ '^0[0-9]{8,10}$' then raise exception 'INVALID:customerPhone'; end if;

  if jsonb_typeof(v_lines) <> 'array' or jsonb_array_length(v_lines) = 0 then raise exception 'EMPTY_ORDER'; end if;
  if jsonb_array_length(v_lines) > 50 then raise exception 'INVALID:lines'; end if;

  -- ------------------------------------------------- price every line
  for v_line in select value from jsonb_array_elements(v_lines) loop
    if coalesce(v_line->>'menuItemId', '') !~ uuid_re then raise exception 'ITEM_INVALID'; end if;

    select * into v_item from public.menu_items where id = (v_line->>'menuItemId')::uuid;
    if not found then raise exception 'ITEM_INVALID'; end if;
    if not v_item.is_available then raise exception 'ITEM_UNAVAILABLE:%', v_item.name; end if;

    if jsonb_typeof(v_line->'quantity') <> 'number' then raise exception 'INVALID:quantity'; end if;
    v_qty := (v_line->>'quantity')::numeric::int;
    if v_qty < 1 or v_qty > 20 or (v_line->>'quantity')::numeric <> v_qty then raise exception 'INVALID:quantity'; end if;

    v_instr := nullif(btrim(coalesce(v_line->>'instructions', '')), '');
    if v_instr is not null and length(v_instr) > 140 then raise exception 'INVALID:instructions'; end if;

    v_selections := coalesce(v_line->'selections', '{}'::jsonb);
    if jsonb_typeof(v_selections) <> 'object' then raise exception 'INVALID:selections'; end if;

    -- Every non-empty selection key must be a group of THIS item.
    for v_sel_key in select key from jsonb_each(v_selections) loop
      if jsonb_typeof(v_selections->v_sel_key) <> 'array' then raise exception 'INVALID:selections'; end if;
      if jsonb_array_length(v_selections->v_sel_key) > 0 and (
           v_sel_key !~ uuid_re
           or not exists (select 1 from public.customization_groups g
                           where g.id = v_sel_key::uuid and g.menu_item_id = v_item.id)) then
        raise exception 'OPTION_INVALID:%', v_item.name;
      end if;
    end loop;

    v_unit := v_item.base_price;
    v_opts := '[]'::jsonb;

    for v_group in
      select * from public.customization_groups where menu_item_id = v_item.id order by sort_order
    loop
      v_sel := coalesce(v_selections->(v_group.id::text), '[]'::jsonb);
      select count(distinct value) into v_count from jsonb_array_elements_text(v_sel);
      if v_count <> jsonb_array_length(v_sel) then raise exception 'OPTION_INVALID:%', v_item.name; end if;

      v_min := greatest(v_group.min_select, case when v_group.is_required then 1 else 0 end);
      if v_count < v_min then raise exception 'OPTION_REQUIRED:%', v_item.name || ' - ' || v_group.name; end if;
      if v_group.selection_type = 'single' and v_count > 1 then raise exception 'OPTION_INVALID:%', v_item.name; end if;
      if v_group.max_select is not null and v_count > v_group.max_select then
        raise exception 'OPTION_INVALID:%', v_item.name;
      end if;

      for v_opt_id in select value from jsonb_array_elements_text(v_sel) loop
        if v_opt_id !~ uuid_re then raise exception 'OPTION_INVALID:%', v_item.name; end if;
        select * into v_opt from public.customization_options
         where id = v_opt_id::uuid and group_id = v_group.id;
        if not found then raise exception 'OPTION_INVALID:%', v_item.name; end if;
        if not v_opt.is_available then raise exception 'OPTION_UNAVAILABLE:%', v_opt.name; end if;
        v_unit := v_unit + v_opt.price_delta;
        v_opts := v_opts || jsonb_build_object(
          'option_id', v_opt.id, 'group_name', v_group.name,
          'option_name', v_opt.name, 'price_delta', v_opt.price_delta);
      end loop;
    end loop;

    if v_unit < 0 then raise exception 'PRICE_INVALID:%', v_item.name; end if;

    v_subtotal := v_subtotal + v_unit * v_qty;
    v_prep := greatest(v_prep, coalesce(v_item.prep_minutes, v_settings.default_prep_minutes));
    v_priced := v_priced || jsonb_build_object(
      'menu_item_id', v_item.id, 'item_name', v_item.name, 'unit_price', v_unit,
      'quantity', v_qty, 'instructions', v_instr, 'options', v_opts);
  end loop;

  v_tax     := round(v_subtotal * v_settings.tax_rate_bp / 10000.0);
  v_service := round(v_subtotal * v_settings.service_charge_bp / 10000.0);

  -- Cash goes straight to the kitchen (unpaid until the counter takes it).
  -- Paystack orders wait for a verified payment.
  v_status := case when v_method = 'cash' then 'received' else 'pending_payment' end;

  -- --------------------------------------------------------------- write
  begin
    insert into public.orders (
      order_type, status, table_id, table_number, customer_name, customer_phone,
      subtotal, tax_amount, service_charge, total,
      payment_status, payment_method, idempotency_key, estimated_ready_at)
    values (
      v_type, v_status, v_table_id, v_table_number, v_name, v_phone,
      v_subtotal, v_tax, v_service, v_subtotal + v_tax + v_service,
      'pending', v_method, v_key,
      case when v_status = 'received' then now() + make_interval(mins => v_prep) end)
    returning * into v_order;
  exception when unique_violation then
    -- Two simultaneous submits with the same key: the other one won.
    select * into v_existing from public.orders where idempotency_key = v_key;
    return jsonb_build_object(
      'order_id', v_existing.id, 'order_number', v_existing.order_number,
      'total', v_existing.total, 'status', v_existing.status,
      'payment_status', v_existing.payment_status, 'duplicate', true);
  end;

  for v_p in select value from jsonb_array_elements(v_priced) loop
    insert into public.order_items (
      order_id, menu_item_id, item_name, unit_price, quantity, line_total, special_instructions)
    values (
      v_order.id, (v_p->>'menu_item_id')::uuid, v_p->>'item_name', (v_p->>'unit_price')::int,
      (v_p->>'quantity')::int, (v_p->>'unit_price')::int * (v_p->>'quantity')::int, v_p->>'instructions')
    returning id into v_item_id;

    for v_o in select value from jsonb_array_elements(v_p->'options') loop
      insert into public.order_item_customizations (order_item_id, option_id, group_name, option_name, price_delta)
      values (v_item_id, (v_o->>'option_id')::uuid, v_o->>'group_name', v_o->>'option_name', (v_o->>'price_delta')::int);
    end loop;
  end loop;

  if v_method <> 'cash' then
    v_ref := 'ORD-' || to_char(v_order.order_date, 'YYMMDD') || '-' || v_order.order_number
             || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
    insert into public.payments (order_id, provider, method, amount, reference)
    values (v_order.id, 'paystack', v_method, v_order.total, v_ref);
  end if;

  return jsonb_build_object(
    'order_id', v_order.id, 'order_number', v_order.order_number,
    'total', v_order.total, 'status', v_order.status,
    'payment_status', v_order.payment_status, 'payment_reference', v_ref,
    'duplicate', false);
end $$;

-- Status board: "today" in the restaurant's time zone.
create or replace function public.order_board()
returns table (order_number text, status public.order_status, order_type public.order_type, updated_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select o.order_number, o.status, o.order_type, o.updated_at
    from public.orders o
   where o.order_date = public.restaurant_today()
     and (o.status in ('received', 'preparing')
          or (o.status = 'ready' and o.ready_at > now() - interval '45 minutes'))
   order by o.placed_at;
$$;
revoke all on function public.order_board() from public;
grant execute on function public.order_board() to anon, authenticated;

-- Reports: busiest hours in the restaurant's time zone.
create or replace function public.sales_report(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if coalesce(public.current_role()::text, '') not in ('admin', 'manager') then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_to < p_from or p_to - p_from > 400 then raise exception 'INVALID:range'; end if;

  with o as (
    select * from public.orders
     where order_date between p_from and p_to
       and status not in ('cancelled', 'pending_payment')
  )
  select jsonb_build_object(
    'summary', (select jsonb_build_object(
        'orders', count(*),
        'revenue', coalesce(sum(total), 0),
        'paid', coalesce(sum(total) filter (where payment_status = 'paid'), 0),
        'unpaid', coalesce(sum(total) filter (where payment_status <> 'paid'), 0),
        'average', coalesce(round(avg(total)), 0),
        'cancelled', (select count(*) from public.orders
                       where order_date between p_from and p_to and status = 'cancelled'))
      from o),
    'by_day', (select coalesce(jsonb_agg(jsonb_build_object('date', d::date, 'orders', coalesce(x.n, 0), 'revenue', coalesce(x.r, 0)) order by d), '[]'::jsonb)
                 from generate_series(p_from, p_to, interval '1 day') d
                 left join (select order_date, count(*) n, sum(total) r from o group by order_date) x on x.order_date = d::date),
    'by_type', (select coalesce(jsonb_agg(jsonb_build_object('type', order_type, 'orders', n, 'revenue', r)), '[]'::jsonb)
                  from (select order_type, count(*) n, sum(total) r from o group by order_type) t),
    'by_payment', (select coalesce(jsonb_agg(jsonb_build_object('method', coalesce(payment_method::text, 'unknown'), 'orders', n, 'revenue', r, 'paid', pd)), '[]'::jsonb)
                     from (select payment_method, count(*) n, sum(total) r,
                                  sum(total) filter (where payment_status = 'paid') pd
                             from o group by payment_method) t),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'orders', n) order by h), '[]'::jsonb)
                  from (select extract(hour from placed_at at time zone public.restaurant_tz())::int h, count(*) n from o group by 1) t),
    'top_items', (select coalesce(jsonb_agg(jsonb_build_object('name', item_name, 'quantity', q, 'revenue', r) order by q desc, r desc), '[]'::jsonb)
                    from (select oi.item_name, sum(oi.quantity) q, sum(oi.line_total) r
                            from public.order_items oi join o on o.id = oi.order_id
                           group by oi.item_name order by q desc, r desc limit 10) t)
  ) into v_result;

  return v_result;
end $$;

-- Payments: the currency must match the payment's own currency.
create or replace function public.confirm_payment(
  p_reference text, p_amount int, p_currency text, p_provider_reference text, p_channel text, p_raw jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay   public.payments;
  v_order public.orders;
  v_prep  int;
begin
  select * into v_pay from public.payments where reference = p_reference for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  select * into v_order from public.orders where id = v_pay.order_id for update;

  if v_pay.status = 'paid' then
    return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'already', true);
  end if;

  -- Never trust that the right amount was paid: check it against our own records.
  -- Refusals are RECORDED and returned (not raised, which would undo the record),
  -- so staff can see them on the order and refund money that was actually taken.
  if upper(p_currency) <> upper(v_pay.currency) or p_amount <> v_pay.amount or p_amount <> v_order.total then
    update public.payments set status = 'failed', updated_at = now(),
      raw_response = coalesce(p_raw, '{}'::jsonb) || jsonb_build_object('refused', 'AMOUNT_MISMATCH', 'needs_review', true)
    where id = v_pay.id;
    return jsonb_build_object('order_id', v_order.id, 'error', 'AMOUNT_MISMATCH');
  end if;

  -- An order can only be paid once (also enforced by a unique index). A second
  -- successful charge is real money: flag it for a refund.
  if v_order.payment_status = 'paid' then
    update public.payments set status = 'failed', updated_at = now(),
      raw_response = coalesce(p_raw, '{}'::jsonb) || jsonb_build_object('refused', 'ALREADY_PAID_BY_OTHER_ATTEMPT', 'needs_review', true, 'refund_needed', true)
    where id = v_pay.id;
    return jsonb_build_object('order_id', v_order.id, 'error', 'ALREADY_PAID_BY_OTHER_ATTEMPT');
  end if;

  update public.payments set
    status = 'paid', paid_at = now(), provider_reference = p_provider_reference,
    channel = p_channel, raw_response = p_raw, updated_at = now()
  where id = v_pay.id;

  select coalesce(max(coalesce(mi.prep_minutes, s.default_prep_minutes)), s.default_prep_minutes) into v_prep
    from public.restaurant_settings s
    left join public.order_items oi on oi.order_id = v_order.id
    left join public.menu_items mi on mi.id = oi.menu_item_id
   where s.id = 1
   group by s.default_prep_minutes;

  update public.orders set
    payment_status = 'paid',
    payment_method = v_pay.method,
    -- A late payment for an order that already expired still goes to the kitchen:
    -- the customer has paid, so they must be served (staff see it as new).
    status = case when status in ('pending_payment', 'cancelled') then 'received' else status end,
    estimated_ready_at = coalesce(estimated_ready_at, now() + make_interval(mins => v_prep))
  where id = v_order.id
  returning * into v_order;

  return jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'already', false);
end $$;

revoke all on function public.place_order(jsonb) from public, anon, authenticated;
grant execute on function public.place_order(jsonb) to service_role;
revoke all on function public.sales_report(date, date) from public, anon;
grant execute on function public.sales_report(date, date) to authenticated;
revoke all on function public.confirm_payment(text, int, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.confirm_payment(text, int, text, text, text, jsonb) to service_role;
