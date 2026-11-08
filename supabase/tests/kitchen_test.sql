-- Tests for 0003_kitchen.sql. Run after migrations + seed. Rolls back.
\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'kitchen@test'),
  ('00000000-0000-0000-0000-00000000000b', 'manager@test');
insert into public.profiles (id, full_name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'Kitchen Tester', 'kitchen'),
  ('00000000-0000-0000-0000-00000000000b', 'Manager Tester', 'manager');

create or replace function pg_temp.as_user(id text) returns void language sql as $$ select set_config('request.jwt.claim.sub', id, true) $$;
create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'TEST FAILED: expected %', code;
exception when others then
  if sqlerrm like 'TEST FAILED%' then raise; end if;
  if sqlerrm not like code || '%' then raise exception 'TEST FAILED: expected %, got %', code, sqlerrm; end if;
  raise notice 'ok  rejected with %', sqlerrm;
end $$;

-- An order to work with
create temp table t as
select (public.place_order(jsonb_build_object('idempotencyKey','kitchen-test-1','orderType','dine_in','tableNumber','2',
  'paymentMethod','cash','customerName','','customerPhone','',
  'lines', jsonb_build_array(jsonb_build_object('menuItemId',(select id from public.menu_items where name='Waakye Special'),
    'quantity',1,'instructions','Extra shito',
    'selections', jsonb_build_object(
      (select g.id::text from public.customization_groups g join public.menu_items m on m.id=g.menu_item_id where m.name='Waakye Special'),
      jsonb_build_array((select o.id from public.customization_options o join public.customization_groups g on g.id=o.group_id join public.menu_items m on m.id=g.menu_item_id where m.name='Waakye Special' and o.name='Beef'))))))
)->>'order_id')::uuid as id;

grant select on t to authenticated;

-- Anonymous (no signed-in staff)
select pg_temp.as_user('');
select pg_temp.expect_error(format('select public.set_order_status(%L, %L)', (select id from t), 'preparing'), 'NOT_ALLOWED');
select pg_temp.expect_error('select public.kitchen_orders()', 'NOT_ALLOWED');

-- Kitchen staff
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$
declare k jsonb; o public.orders; oid uuid := (select id from t);
begin
  k := public.kitchen_orders();
  if jsonb_array_length(k) <> 1 then raise exception 'TEST FAILED: kitchen feed %', k; end if;
  if k->0->'items'->0->>'name' <> 'Waakye Special' or k->0->'items'->0->'options'->>0 <> 'Beef'
     or k->0->'items'->0->>'instructions' <> 'Extra shito' then raise exception 'TEST FAILED: feed items %', k; end if;
  raise notice 'ok  kitchen feed: order % with Waakye (Beef), note "Extra shito"', k->0->>'order_number';

  o := public.set_order_status(oid, 'preparing');
  o := public.set_order_status(oid, 'preparing');  -- double tap
  o := public.set_order_status(oid, 'ready');
  o := public.set_order_status(oid, 'preparing');  -- undo
  o := public.set_order_status(oid, 'ready');
  o := public.set_order_status(oid, 'completed');
  if o.status <> 'completed' or o.preparing_at is null or o.ready_at is null or o.completed_at is null then
    raise exception 'TEST FAILED: walk %', row_to_json(o); end if;
  raise notice 'ok  kitchen walk received > preparing > ready > (undo) > ready > completed, timestamps set';

  if (select count(*) from public.order_status_history where order_id = oid and changed_by = '00000000-0000-0000-0000-00000000000a') <> 5 then
    raise exception 'TEST FAILED: history %', (select count(*) from public.order_status_history where order_id = oid); end if;
  raise notice 'ok  5 status changes recorded against the kitchen user (double tap ignored)';

  o := public.mark_cash_paid(oid);
  o := public.mark_cash_paid(oid);  -- idempotent
  if o.payment_status <> 'paid' or (select count(*) from public.payments where order_id = oid) <> 1 then
    raise exception 'TEST FAILED: cash'; end if;
  raise notice 'ok  cash marked paid once (second tap ignored)';
end $$;

select pg_temp.expect_error(format('select public.set_order_status(%L, %L)', (select id from t), 'received'), 'BAD_TRANSITION');
select pg_temp.expect_error(format('select public.set_order_status(%L, %L)', (select id from t), 'cancelled'), 'NOT_ALLOWED');

-- Kitchen can no longer edit order columns directly (RLS as the authenticated role)
set local role authenticated;
update public.orders set total = 1, subtotal = 1 where id = (select id from t);
reset role;
select total <> 1 as kitchen_cannot_edit_total from public.orders where id = (select id from t);

-- Manager can cancel a fresh order
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
do $$
declare r jsonb; o public.orders;
begin
  r := public.place_order(jsonb_build_object('idempotencyKey','kitchen-test-2','orderType','takeaway','tableNumber',null,
        'customerName','Esi','customerPhone','','paymentMethod','cash',
        'lines', jsonb_build_array(jsonb_build_object('menuItemId',(select id from public.menu_items where name='Meat Pie'),'quantity',1,'selections','{}'::jsonb,'instructions',''))));
  o := public.set_order_status((r->>'order_id')::uuid, 'cancelled');
  if o.status <> 'cancelled' or o.cancelled_at is null then raise exception 'TEST FAILED: cancel'; end if;
  raise notice 'ok  manager cancelled order %', o.order_number;
end $$;

-- Public board: numbers and stage only; completed/cancelled orders hidden
select pg_temp.as_user('');
do $$
declare r jsonb;
begin
  r := public.place_order(jsonb_build_object('idempotencyKey','kitchen-test-3','orderType','dine_in','tableNumber','5',
        'customerName','','customerPhone','','paymentMethod','cash',
        'lines', jsonb_build_array(jsonb_build_object('menuItemId',(select id from public.menu_items where name='Meat Pie'),'quantity',1,'selections','{}'::jsonb,'instructions',''))));
end $$;
select string_agg(order_number || '=' || status, ', ') as board from public.order_board();
select pg_get_function_result('public.order_board()'::regprocedure) as board_columns;
select has_function_privilege('anon','public.order_board()','execute') as anon_board,
       has_function_privilege('anon','public.kitchen_orders()','execute') as anon_kitchen,
       has_function_privilege('anon','public.set_order_status(uuid,public.order_status)','execute') as anon_status;
rollback;
