-- Tests for 0004_admin.sql. Run after all migrations + seed. Rolls back.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','k@t'), ('00000000-0000-0000-0000-0000000000b1','m@t');
insert into public.profiles (id, full_name, role) values
  ('00000000-0000-0000-0000-0000000000a1','Kitchen','kitchen'), ('00000000-0000-0000-0000-0000000000b1','Manager','manager');
create or replace function pg_temp.as_user(id text) returns void language sql as $$ select set_config('request.jwt.claim.sub', id, true) $$;

do $$
declare
  cat uuid := (select id from public.menu_categories where slug = 'rice-meals');
  item uuid; g uuid; keep_opt uuid; r jsonb; o jsonb;
begin
  -- Kitchen staff may not edit the menu
  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  begin
    perform public.save_menu_item(jsonb_build_object('name','X','base_price',100,'category_id',cat));
    raise exception 'TEST FAILED: kitchen saved a menu item';
  exception when others then
    if sqlerrm <> 'NOT_ALLOWED' then raise; end if;
    raise notice 'ok  kitchen cannot edit the menu';
  end;

  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');

  -- Create a new meal with two groups
  item := public.save_menu_item(jsonb_build_object(
    'name','Yam Chips with Chicken','description','Crispy yam chips, grilled chicken, pepper sauce.','base_price',6800,
    'category_id',cat,'is_available',true,'prep_minutes',14,
    'groups', jsonb_build_array(
      jsonb_build_object('name','Pepper','selection_type','single','is_required',true,'options', jsonb_build_array(
        jsonb_build_object('name','Mild','price_delta',0,'is_default',true), jsonb_build_object('name','Hot','price_delta',0))),
      jsonb_build_object('name','Extras','selection_type','multiple','is_required',false,'max_select',2,'options', jsonb_build_array(
        jsonb_build_object('name','Extra chicken','price_delta',2500), jsonb_build_object('name','Egg','price_delta',500))))));
  if (select count(*) from public.customization_options o join public.customization_groups g on g.id = o.group_id where g.menu_item_id = item) <> 4 then
    raise exception 'TEST FAILED: created options'; end if;
  raise notice 'ok  created meal with 2 groups, 4 options';

  -- Edit: rename an option (keep its id), drop "Egg", add "Plantain", remove the Pepper group
  g := (select id from public.customization_groups where menu_item_id = item and name = 'Extras');
  keep_opt := (select id from public.customization_options where group_id = g and name = 'Extra chicken');
  perform public.save_menu_item(jsonb_build_object(
    'id', item, 'name','Yam Chips with Chicken','base_price',7000,'category_id',cat,
    'groups', jsonb_build_array(jsonb_build_object('id', g, 'name','Extras','selection_type','multiple','max_select',2,'options', jsonb_build_array(
      jsonb_build_object('id', keep_opt, 'name','Extra grilled chicken','price_delta',2800),
      jsonb_build_object('name','Plantain','price_delta',1000))))));
  if (select name || ':' || price_delta from public.customization_options where id = keep_opt) <> 'Extra grilled chicken:2800' then
    raise exception 'TEST FAILED: option kept id'; end if;
  if exists (select 1 from public.customization_options where group_id = g and name = 'Egg') then raise exception 'TEST FAILED: Egg not removed'; end if;
  if (select count(*) from public.customization_groups where menu_item_id = item) <> 1 then raise exception 'TEST FAILED: Pepper group not removed'; end if;
  if (select base_price from public.menu_items where id = item) <> 7000 then raise exception 'TEST FAILED: price'; end if;
  raise notice 'ok  edit kept the option id, renamed it, removed Egg and the Pepper group, price 70.00';

  -- A kiosk order placed with the kept option still prices correctly
  r := public.place_order(jsonb_build_object('idempotencyKey','admin-test-1','orderType','dine_in','tableNumber','3',
         'customerName','','customerPhone','','paymentMethod','cash',
         'lines', jsonb_build_array(jsonb_build_object('menuItemId', item, 'quantity', 2, 'instructions','',
           'selections', jsonb_build_object(g::text, jsonb_build_array(keep_opt))))));
  if (r->>'total')::int <> 2 * (7000 + 2800) then raise exception 'TEST FAILED: order total %', r->>'total'; end if;
  raise notice 'ok  kiosk order with the edited meal priced at %', r->>'total';

  -- Cannot hijack another meal's group by sending its id
  perform public.save_menu_item(jsonb_build_object('id', item, 'name','Yam Chips with Chicken','base_price',7000,'category_id',cat,
    'groups', jsonb_build_array(jsonb_build_object(
      'id', (select cg.id from public.customization_groups cg join public.menu_items m on m.id = cg.menu_item_id where m.name = 'Waakye Special'),
      'name','Stolen','selection_type','single','is_required',true,'options', jsonb_build_array(jsonb_build_object('name','A','price_delta',0))))));
  if (select count(*) from public.customization_groups cg join public.menu_items m on m.id = cg.menu_item_id where m.name = 'Waakye Special' and cg.name = 'Protein') <> 1 then
    raise exception 'TEST FAILED: other meal group touched'; end if;
  raise notice 'ok  another meal''s group id was ignored (Waakye untouched)';

  -- Validation
  begin
    perform public.save_menu_item(jsonb_build_object('name','','base_price',100,'category_id',cat));
    raise exception 'TEST FAILED: empty name';
  exception when others then if sqlerrm not like 'INVALID:name%' then raise; end if; raise notice 'ok  empty name rejected'; end;
  begin
    perform public.save_menu_item(jsonb_build_object('name','Z','base_price',-5,'category_id',cat));
    raise exception 'TEST FAILED: negative price';
  exception when others then if sqlerrm not like 'INVALID:price%' then raise; end if; raise notice 'ok  negative price rejected'; end;

  -- Reports
  perform public.set_order_status((r->>'order_id')::uuid, 'preparing');
  perform public.mark_cash_paid((r->>'order_id')::uuid);
  o := public.sales_report(current_date - 6, current_date);
  if (o->'summary'->>'orders')::int <> 1 or (o->'summary'->>'revenue')::int <> 19600 or (o->'summary'->>'paid')::int <> 19600 then
    raise exception 'TEST FAILED: summary %', o->'summary'; end if;
  if jsonb_array_length(o->'by_day') <> 7 then raise exception 'TEST FAILED: by_day length'; end if;
  if o->'top_items'->0->>'name' <> 'Yam Chips with Chicken' or (o->'top_items'->0->>'quantity')::int <> 2 then
    raise exception 'TEST FAILED: top items %', o->'top_items'; end if;
  raise notice 'ok  report: 1 order, GH₵ 196.00 paid, 7 days filled, top item Yam Chips x2';

  perform pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
  begin
    perform public.sales_report(current_date, current_date);
    raise exception 'TEST FAILED: kitchen saw report';
  exception when others then if sqlerrm <> 'NOT_ALLOWED' then raise; end if; raise notice 'ok  kitchen cannot see sales reports'; end;
end $$;
rollback;
