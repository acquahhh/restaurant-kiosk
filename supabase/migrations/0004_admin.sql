-- =============================================================================
-- 0004_admin.sql
-- Admin dashboard support. Safe to run more than once.
--
-- * save_menu_item(p jsonb): creates or updates a meal together with its
--   customization groups and options in one transaction. Existing ids are kept
--   (so carts in progress on the kiosk stay valid); removed ones are deleted.
-- * sales_report(from, to): every figure the reports page shows.
-- =============================================================================

create or replace function public.save_menu_item(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_item_id  uuid;
  v_name     text := btrim(coalesce(p->>'name', ''));
  v_price    int;
  v_cat      uuid;
  v_g        jsonb;
  v_o        jsonb;
  v_gi       int := 0;
  v_oi       int;
  v_group_id uuid;
  v_opt_id   uuid;
  v_keep_groups  uuid[] := '{}';
  v_keep_options uuid[];
  v_type     public.selection_type;
  v_required boolean;
  v_min      int;
  v_max      int;
begin
  if coalesce(public.current_role()::text, '') not in ('admin', 'manager') then
    raise exception 'NOT_ALLOWED';
  end if;

  if length(v_name) = 0 or length(v_name) > 80 then raise exception 'INVALID:name'; end if;
  if jsonb_typeof(p->'base_price') <> 'number' then raise exception 'INVALID:price'; end if;
  v_price := (p->>'base_price')::numeric::int;
  if v_price < 0 or v_price > 10000000 then raise exception 'INVALID:price'; end if;
  if coalesce(p->>'category_id', '') !~ uuid_re then raise exception 'INVALID:category'; end if;
  v_cat := (p->>'category_id')::uuid;
  if not exists (select 1 from public.menu_categories where id = v_cat) then raise exception 'INVALID:category'; end if;

  if coalesce(p->>'id', '') ~ uuid_re then
    v_item_id := (p->>'id')::uuid;
    update public.menu_items set
      category_id  = v_cat,
      name         = v_name,
      description  = left(btrim(coalesce(p->>'description', '')), 300),
      image_url    = nullif(p->>'image_url', ''),
      base_price   = v_price,
      is_available = coalesce((p->>'is_available')::boolean, true),
      is_featured  = coalesce((p->>'is_featured')::boolean, false),
      is_popular   = coalesce((p->>'is_popular')::boolean, false),
      prep_minutes = nullif(p->>'prep_minutes', '')::int
    where id = v_item_id;
    if not found then raise exception 'ITEM_NOT_FOUND'; end if;
  else
    insert into public.menu_items (category_id, name, description, image_url, base_price,
                                   is_available, is_featured, is_popular, prep_minutes, sort_order)
    values (v_cat, v_name, left(btrim(coalesce(p->>'description', '')), 300), nullif(p->>'image_url', ''), v_price,
            coalesce((p->>'is_available')::boolean, true), coalesce((p->>'is_featured')::boolean, false),
            coalesce((p->>'is_popular')::boolean, false), nullif(p->>'prep_minutes', '')::int,
            coalesce((select max(sort_order) + 1 from public.menu_items where category_id = v_cat), 0))
    returning id into v_item_id;
  end if;

  for v_g in select value from jsonb_array_elements(coalesce(p->'groups', '[]'::jsonb)) loop
    if length(btrim(coalesce(v_g->>'name', ''))) = 0 then raise exception 'INVALID:group_name'; end if;
    v_type     := coalesce(v_g->>'selection_type', 'single')::public.selection_type;
    v_required := coalesce((v_g->>'is_required')::boolean, false);
    v_min      := case when v_required then greatest(1, coalesce((v_g->>'min_select')::int, 1)) else 0 end;
    v_max      := case when v_type = 'single' then 1 else nullif(v_g->>'max_select', '')::int end;
    if v_max is not null and v_max < v_min then raise exception 'INVALID:group_limits:%', v_g->>'name'; end if;
    if jsonb_array_length(coalesce(v_g->'options', '[]'::jsonb)) = 0 then
      raise exception 'INVALID:group_empty:%', v_g->>'name';
    end if;

    if coalesce(v_g->>'id', '') ~ uuid_re
       and exists (select 1 from public.customization_groups where id = (v_g->>'id')::uuid and menu_item_id = v_item_id) then
      v_group_id := (v_g->>'id')::uuid;
      update public.customization_groups set
        name = btrim(v_g->>'name'), selection_type = v_type, is_required = v_required,
        min_select = v_min, max_select = v_max, sort_order = v_gi
      where id = v_group_id;
    else
      insert into public.customization_groups (menu_item_id, name, selection_type, is_required, min_select, max_select, sort_order)
      values (v_item_id, btrim(v_g->>'name'), v_type, v_required, v_min, v_max, v_gi)
      returning id into v_group_id;
    end if;
    v_keep_groups := v_keep_groups || v_group_id;
    v_gi := v_gi + 1;

    v_keep_options := '{}';
    v_oi := 0;
    for v_o in select value from jsonb_array_elements(v_g->'options') loop
      if length(btrim(coalesce(v_o->>'name', ''))) = 0 then raise exception 'INVALID:option_name'; end if;
      if coalesce(v_o->>'id', '') ~ uuid_re
         and exists (select 1 from public.customization_options where id = (v_o->>'id')::uuid and group_id = v_group_id) then
        update public.customization_options set
          name = btrim(v_o->>'name'), price_delta = coalesce((v_o->>'price_delta')::numeric::int, 0),
          is_default = coalesce((v_o->>'is_default')::boolean, false),
          is_available = coalesce((v_o->>'is_available')::boolean, true), sort_order = v_oi
        where id = (v_o->>'id')::uuid;
        v_keep_options := v_keep_options || (v_o->>'id')::uuid;
      else
        insert into public.customization_options (group_id, name, price_delta, is_default, is_available, sort_order)
        values (v_group_id, btrim(v_o->>'name'), coalesce((v_o->>'price_delta')::numeric::int, 0),
                coalesce((v_o->>'is_default')::boolean, false), coalesce((v_o->>'is_available')::boolean, true), v_oi)
        returning id into v_opt_id;
        v_keep_options := v_keep_options || v_opt_id;
      end if;
      v_oi := v_oi + 1;
    end loop;
    delete from public.customization_options where group_id = v_group_id and id <> all (v_keep_options);
  end loop;

  delete from public.customization_groups where menu_item_id = v_item_id and id <> all (v_keep_groups);
  return v_item_id;
end $$;

-- -----------------------------------------------------------------------------
-- sales_report: figures for [p_from, p_to] (restaurant dates, inclusive).
-- Counts orders that reached the kitchen; excludes cancelled and unpaid
-- Mobile Money/card attempts (pending_payment).
-- -----------------------------------------------------------------------------
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
                  from (select extract(hour from placed_at at time zone 'Africa/Accra')::int h, count(*) n from o group by 1) t),
    'top_items', (select coalesce(jsonb_agg(jsonb_build_object('name', item_name, 'quantity', q, 'revenue', r) order by q desc, r desc), '[]'::jsonb)
                    from (select oi.item_name, sum(oi.quantity) q, sum(oi.line_total) r
                            from public.order_items oi join o on o.id = oi.order_id
                           group by oi.item_name order by q desc, r desc limit 10) t)
  ) into v_result;

  return v_result;
end $$;

revoke all on function public.save_menu_item(jsonb) from public, anon;
revoke all on function public.sales_report(date, date) from public, anon;
grant execute on function public.save_menu_item(jsonb) to authenticated;
grant execute on function public.sales_report(date, date) to authenticated;

-- Opening hours are now enforced by the kiosk. Earlier seeds stored sample
-- hours that were never meant as real ones: clear them only if untouched, so
-- the kiosk does not start closing unexpectedly. Admins set real hours in Settings.
update public.restaurant_settings
   set opening_hours = '{}'::jsonb
 where opening_hours = '{"mon":{"open":"08:00","close":"22:00"},"tue":{"open":"08:00","close":"22:00"},
                         "wed":{"open":"08:00","close":"22:00"},"thu":{"open":"08:00","close":"22:00"},
                         "fri":{"open":"08:00","close":"23:00"},"sat":{"open":"09:00","close":"23:00"},
                         "sun":{"open":"11:00","close":"21:00"}}'::jsonb;
