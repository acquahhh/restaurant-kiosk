-- =============================================================================
-- 0002_place_order.sql
-- place_order(p jsonb): the only way a kiosk order enters the database.
--
-- * Reprices every line from the menu tables. Client prices are never trusted.
-- * Validates items, availability, option membership and min/max rules.
-- * Writes the order, items, customizations and (for Paystack) a pending
--   payment row in ONE transaction.
-- * Idempotent: the same idempotencyKey always returns the same order.
--
-- Errors are raised as 'CODE' or 'CODE:detail' (SQLSTATE P0001) so the server
-- action can show a customer-friendly message.
--
-- Input shape (from lib/kiosk/order-input.ts):
-- {
--   "idempotencyKey": "...", "orderType": "dine_in"|"takeaway",
--   "tableNumber": "4"|null, "customerName": "", "customerPhone": "",
--   "paymentMethod": "mobile_money"|"card"|"cash",
--   "lines": [{ "menuItemId": uuid, "quantity": 1,
--               "selections": { groupId: [optionId, ...] }, "instructions": "" }]
-- }
-- =============================================================================

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
  if v_phone is not null and v_phone !~ '^0[235][0-9]{8}$' then raise exception 'INVALID:customerPhone'; end if;

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

-- Only the server (service role) may place orders. Never the browser.
revoke all on function public.place_order(jsonb) from public;
revoke all on function public.place_order(jsonb) from anon, authenticated;
grant execute on function public.place_order(jsonb) to service_role;
