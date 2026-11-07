-- Smoke test: exercises order numbering, snapshots, status history, constraints.
\set ON_ERROR_STOP on
begin;

-- Settings and menu seeded?
select count(*) = 9 as nine_categories from public.menu_categories;
select count(*) as menu_items from public.menu_items;
select count(*) as customization_options from public.customization_options;

-- Place two orders: order numbers should be 001 and 002 for today
insert into public.orders (order_type, table_number, subtotal, total, idempotency_key)
values ('dine_in', '4', 7500, 7500, 'k1') returning order_number;
insert into public.orders (order_type, customer_name, customer_phone, subtotal, total, idempotency_key)
values ('takeaway', 'Ama', '0241234567', 9000, 9000, 'k2') returning order_number;

-- Duplicate idempotency key must fail
savepoint dup;
do $$ begin
  insert into public.orders (order_type, table_number, subtotal, total, idempotency_key)
  values ('dine_in', '4', 100, 100, 'k1');
  raise exception 'duplicate idempotency key was accepted';
exception when unique_violation then raise notice 'OK: duplicate idempotency key rejected'; end $$;
rollback to savepoint dup;

-- Dine-in without a table must fail
savepoint ck;
do $$ begin
  insert into public.orders (order_type, subtotal, total, idempotency_key) values ('dine_in', 100, 100, 'k3');
  raise exception 'dine_in without table was accepted';
exception when check_violation then raise notice 'OK: dine_in without table rejected'; end $$;
rollback to savepoint ck;

-- total must equal subtotal + tax + service
savepoint ck2;
do $$ begin
  insert into public.orders (order_type, customer_name, subtotal, tax_amount, total, idempotency_key)
  values ('takeaway', 'Kofi', 100, 10, 100, 'k4');
  raise exception 'bad total was accepted';
exception when check_violation then raise notice 'OK: inconsistent total rejected'; end $$;
rollback to savepoint ck2;

-- Snapshot an item, then change the menu price: order must keep the old price
with o as (select id from public.orders where idempotency_key = 'k1'),
     m as (select id, name, base_price from public.menu_items where name = 'Jollof Rice with Grilled Chicken')
insert into public.order_items (order_id, menu_item_id, item_name, unit_price, quantity, line_total)
select o.id, m.id, m.name, m.base_price, 1, m.base_price from o, m;
update public.menu_items set base_price = 9999 where name = 'Jollof Rice with Grilled Chicken';
select item_name, unit_price as snapshot_price_unchanged from public.order_items;

-- Status walk: history rows and timestamps
update public.orders set status = 'received', payment_status = 'paid', payment_method = 'mobile_money' where idempotency_key = 'k1';
update public.orders set status = 'preparing' where idempotency_key = 'k1';
update public.orders set status = 'ready' where idempotency_key = 'k1';
select from_status, to_status from public.order_status_history
 where order_id = (select id from public.orders where idempotency_key = 'k1') order by changed_at, id;
select preparing_at is not null as has_preparing_at, ready_at is not null as has_ready_at
  from public.orders where idempotency_key = 'k1';

-- Only one paid payment per order
with o as (select id from public.orders where idempotency_key = 'k1')
insert into public.payments (order_id, provider, method, amount, reference, status)
select id, 'paystack', 'mobile_money', 7500, 'ref-1', 'paid' from o;
savepoint pay;
do $$ begin
  insert into public.payments (order_id, provider, method, amount, reference, status)
  select id, 'paystack', 'mobile_money', 7500, 'ref-2', 'paid' from public.orders where idempotency_key = 'k1';
  raise exception 'second paid payment was accepted';
exception when unique_violation then raise notice 'OK: second paid payment rejected'; end $$;
rollback to savepoint pay;

-- Deleting a table must not break the order (table_id set null, number kept)
update public.orders set table_id = (select id from public.restaurant_tables where number = '4') where idempotency_key = 'k1';
delete from public.restaurant_tables where number = '4';
select table_id is null as table_fk_cleared, table_number from public.orders where idempotency_key = 'k1';

-- Counter rolls per day
select public.next_order_number('2026-01-01'::date) as first_of_other_day;

rollback;
