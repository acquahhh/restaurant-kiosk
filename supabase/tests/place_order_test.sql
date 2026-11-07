-- Tests for public.place_order. Run after migrations + seed. Rolls back.
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.item(n text) returns uuid language sql as $$ select id from public.menu_items where name = n $$;
create or replace function pg_temp.grp(item text, g text) returns uuid language sql as $$
  select cg.id from public.customization_groups cg join public.menu_items m on m.id = cg.menu_item_id where m.name = item and cg.name = g $$;
create or replace function pg_temp.opt(item text, g text, o text) returns uuid language sql as $$
  select co.id from public.customization_options co where co.group_id = pg_temp.grp(item, g) and co.name = o $$;

-- Expect a call to fail with an error starting with `code`.
create or replace function pg_temp.expect_error(payload jsonb, code text) returns void language plpgsql as $$
begin
  perform public.place_order(payload);
  raise exception 'TEST FAILED: expected % but order was accepted', code;
exception when others then
  if sqlerrm like 'TEST FAILED%' then raise; end if;
  if sqlerrm not like code || '%' then raise exception 'TEST FAILED: expected %, got %', code, sqlerrm; end if;
  raise notice 'ok  rejected with %', sqlerrm;
end $$;

create or replace function pg_temp.base(key text) returns jsonb language sql as $$
  select jsonb_build_object('idempotencyKey', key, 'orderType', 'dine_in', 'tableNumber', '4',
    'customerName', '', 'customerPhone', '', 'paymentMethod', 'cash', 'lines', '[]'::jsonb) $$;

do $$
declare r jsonb; r2 jsonb; jollof jsonb; o public.orders;
begin
  -- 1. Happy path: Jollof Large + Extra chicken + Sobolo x2, plus a water
  jollof := jsonb_build_object(
    'menuItemId', pg_temp.item('Jollof Rice with Grilled Chicken'), 'quantity', 2, 'instructions', 'No pepper',
    'selections', jsonb_build_object(
      pg_temp.grp('Jollof Rice with Grilled Chicken','Portion')::text,     jsonb_build_array(pg_temp.opt('Jollof Rice with Grilled Chicken','Portion','Large')),
      pg_temp.grp('Jollof Rice with Grilled Chicken','Extras')::text,      jsonb_build_array(pg_temp.opt('Jollof Rice with Grilled Chicken','Extras','Extra chicken')),
      pg_temp.grp('Jollof Rice with Grilled Chicken','Add a drink')::text, jsonb_build_array(pg_temp.opt('Jollof Rice with Grilled Chicken','Add a drink','Sobolo'))));
  r := public.place_order(pg_temp.base('key-happy-0001') || jsonb_build_object('lines', jsonb_build_array(
         jollof,
         jsonb_build_object('menuItemId', pg_temp.item('Bottled Water'), 'quantity', 1, 'selections', '{}'::jsonb, 'instructions', ''))));
  if (r->>'total')::int <> 26800 then raise exception 'TEST FAILED: total %', r->>'total'; end if;
  if r->>'status' <> 'received' then raise exception 'TEST FAILED: cash status %', r->>'status'; end if;
  raise notice 'ok  happy path: order % total % status %', r->>'order_number', r->>'total', r->>'status';

  select * into o from public.orders where id = (r->>'order_id')::uuid;
  if o.table_number <> '4' or o.table_id is null or o.payment_status <> 'pending' or o.estimated_ready_at is null then
    raise exception 'TEST FAILED: order row %', row_to_json(o);
  end if;
  if (select count(*) from public.order_items where order_id = o.id) <> 2 then raise exception 'TEST FAILED: items'; end if;
  if (select count(*) from public.order_item_customizations c join public.order_items i on i.id = c.order_item_id where i.order_id = o.id) <> 3 then
    raise exception 'TEST FAILED: customizations'; end if;
  if (select special_instructions from public.order_items where order_id = o.id and item_name like 'Jollof%') <> 'No pepper' then
    raise exception 'TEST FAILED: instructions'; end if;
  raise notice 'ok  rows: 2 items, 3 customizations, note kept, table linked';

  -- 2. Same key again returns the same order, creates nothing new
  r2 := public.place_order(pg_temp.base('key-happy-0001') || jsonb_build_object('lines', jsonb_build_array(jollof)));
  if r2->>'order_id' <> r->>'order_id' or (r2->>'duplicate')::boolean is not true then raise exception 'TEST FAILED: idempotency'; end if;
  if (select count(*) from public.orders where idempotency_key = 'key-happy-0001') <> 1 then raise exception 'TEST FAILED: dup row'; end if;
  raise notice 'ok  retry with same key returned order % (no duplicate)', r2->>'order_number';

  -- 3. Mobile Money: waits for payment and gets a pending payment row
  r := public.place_order(pg_temp.base('key-momo-0001') || jsonb_build_object('paymentMethod', 'mobile_money',
         'lines', jsonb_build_array(jsonb_build_object('menuItemId', pg_temp.item('Kelewele Cup'), 'quantity', 3, 'selections', '{}'::jsonb, 'instructions', ''))));
  if r->>'status' <> 'pending_payment' or r->>'payment_reference' is null then raise exception 'TEST FAILED: momo %', r; end if;
  if (select amount from public.payments where reference = r->>'payment_reference') <> 6000 then raise exception 'TEST FAILED: payment amount'; end if;
  raise notice 'ok  mobile money: status pending_payment, payment row % for 6000', r->>'payment_reference';

  -- 4. Takeaway with name and phone
  r := public.place_order(pg_temp.base('key-take-0001') || jsonb_build_object('orderType', 'takeaway', 'tableNumber', null,
         'customerName', 'Ama Owusu', 'customerPhone', '0241234567',
         'lines', jsonb_build_array(jsonb_build_object('menuItemId', pg_temp.item('Meat Pie'), 'quantity', 2, 'selections', '{}'::jsonb, 'instructions', ''))));
  if (select customer_name from public.orders where id = (r->>'order_id')::uuid) <> 'Ama Owusu' then raise exception 'TEST FAILED: takeaway'; end if;
  raise notice 'ok  takeaway for Ama Owusu, order %', r->>'order_number';
end $$;

-- 5. Rejections
select pg_temp.expect_error(pg_temp.base('key-e1-00001') || jsonb_build_object('tableNumber', '99',
  'lines', jsonb_build_array(jsonb_build_object('menuItemId', pg_temp.item('Meat Pie'), 'quantity', 1, 'selections', '{}'::jsonb, 'instructions', ''))), 'TABLE_INVALID');
select pg_temp.expect_error(pg_temp.base('key-e2-00001'), 'EMPTY_ORDER');
select pg_temp.expect_error(pg_temp.base('key-e3-00001') || jsonb_build_object('lines', jsonb_build_array(
  jsonb_build_object('menuItemId', gen_random_uuid(), 'quantity', 1, 'selections', '{}'::jsonb, 'instructions', ''))), 'ITEM_INVALID');
select pg_temp.expect_error(pg_temp.base('key-e4-00001') || jsonb_build_object('lines', jsonb_build_array(
  jsonb_build_object('menuItemId', pg_temp.item('Meat Pie'), 'quantity', 0, 'selections', '{}'::jsonb, 'instructions', ''))), 'INVALID:quantity');
select pg_temp.expect_error(pg_temp.base('key-e5-00001') || jsonb_build_object('lines', jsonb_build_array(
  jsonb_build_object('menuItemId', pg_temp.item('Meat Pie'), 'quantity', 1.5, 'selections', '{}'::jsonb, 'instructions', ''))), 'INVALID:quantity');
-- Waakye without its required protein
select pg_temp.expect_error(pg_temp.base('key-e6-00001') || jsonb_build_object('lines', jsonb_build_array(
  jsonb_build_object('menuItemId', pg_temp.item('Waakye Special'), 'quantity', 1, 'selections', '{}'::jsonb, 'instructions', ''))), 'OPTION_REQUIRED');
-- Tampering: Jollof's "Large" option attached to a burger
select pg_temp.expect_error(pg_temp.base('key-e7-00001') || jsonb_build_object('lines', jsonb_build_array(
  jsonb_build_object('menuItemId', pg_temp.item('Classic Beef Burger'), 'quantity', 1, 'instructions', '',
    'selections', jsonb_build_object(pg_temp.grp('Classic Beef Burger','Make it a meal')::text,
                                     jsonb_build_array(pg_temp.opt('Jollof Rice with Grilled Chicken','Portion','Large')))))), 'OPTION_INVALID');
-- Tampering: another item's group as a key
select pg_temp.expect_error(pg_temp.base('key-e8-00001') || jsonb_build_object('lines', jsonb_build_array(
  jsonb_build_object('menuItemId', pg_temp.item('Meat Pie'), 'quantity', 1, 'instructions', '',
    'selections', jsonb_build_object(pg_temp.grp('Jollof Rice with Grilled Chicken','Extras')::text,
                                     jsonb_build_array(pg_temp.opt('Jollof Rice with Grilled Chicken','Extras','Extra chicken')))))), 'OPTION_INVALID');
-- Two options in a single-choice group
select pg_temp.expect_error(pg_temp.base('key-e9-00001') || jsonb_build_object('lines', jsonb_build_array(
  jsonb_build_object('menuItemId', pg_temp.item('Waakye Special'), 'quantity', 1, 'instructions', '',
    'selections', jsonb_build_object(pg_temp.grp('Waakye Special','Protein')::text,
      jsonb_build_array(pg_temp.opt('Waakye Special','Protein','Beef'), pg_temp.opt('Waakye Special','Protein','Fried fish')))))), 'OPTION_INVALID');
-- Same option twice (price padding attempt)
select pg_temp.expect_error(pg_temp.base('key-e10-0001') || jsonb_build_object('lines', jsonb_build_array(
  jsonb_build_object('menuItemId', pg_temp.item('Jollof Rice with Grilled Chicken'), 'quantity', 1, 'instructions', '',
    'selections', jsonb_build_object(
      pg_temp.grp('Jollof Rice with Grilled Chicken','Portion')::text, jsonb_build_array(pg_temp.opt('Jollof Rice with Grilled Chicken','Portion','Regular')),
      pg_temp.grp('Jollof Rice with Grilled Chicken','Extras')::text,
        jsonb_build_array(pg_temp.opt('Jollof Rice with Grilled Chicken','Extras','Boiled egg'), pg_temp.opt('Jollof Rice with Grilled Chicken','Extras','Boiled egg')))))), 'OPTION_INVALID');
-- Takeaway without a name
select pg_temp.expect_error(pg_temp.base('key-e11-0001') || jsonb_build_object('orderType', 'takeaway', 'tableNumber', null,
  'lines', jsonb_build_array(jsonb_build_object('menuItemId', pg_temp.item('Meat Pie'), 'quantity', 1, 'selections', '{}'::jsonb, 'instructions', ''))), 'NAME_REQUIRED');

-- Sold out item
update public.menu_items set is_available = false where name = 'Meat Pie';
select pg_temp.expect_error(pg_temp.base('key-e12-0001') || jsonb_build_object('lines', jsonb_build_array(
  jsonb_build_object('menuItemId', pg_temp.item('Meat Pie'), 'quantity', 1, 'selections', '{}'::jsonb, 'instructions', ''))), 'ITEM_UNAVAILABLE');
-- Cash switched off by management
update public.restaurant_settings set accept_cash = false;
select pg_temp.expect_error(pg_temp.base('key-e13-0001') || jsonb_build_object('lines', jsonb_build_array(
  jsonb_build_object('menuItemId', pg_temp.item('Kelewele Cup'), 'quantity', 1, 'selections', '{}'::jsonb, 'instructions', ''))), 'METHOD_DISABLED');

-- A failed order leaves nothing behind
select count(*) = 3 as only_three_successful_orders_exist from public.orders;

-- Permissions: the browser roles cannot call it
select has_function_privilege('anon', 'public.place_order(jsonb)', 'execute') as anon_can_execute,
       has_function_privilege('service_role', 'public.place_order(jsonb)', 'execute') as service_can_execute;

rollback;
