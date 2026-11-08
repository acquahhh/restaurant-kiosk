\set ON_ERROR_STOP on
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000d1','k@h'), ('00000000-0000-0000-0000-0000000000d2','m@h');
insert into public.profiles (id, full_name, role) values ('00000000-0000-0000-0000-0000000000d1','K','kitchen'), ('00000000-0000-0000-0000-0000000000d2','M','manager');
create temp table o as select (public.place_order(jsonb_build_object('idempotencyKey','harden-1','orderType','dine_in','tableNumber','2',
  'customerName','','customerPhone','','paymentMethod','mobile_money','lines',jsonb_build_array(jsonb_build_object(
  'menuItemId',(select id from public.menu_items where name='Meat Pie'),'quantity',1,'selections','{}'::jsonb,'instructions','')))) ->> 'order_id')::uuid as id;
grant select on o to anon, authenticated;

-- 1. Public key cannot touch the order counter
set local role anon;
do $$ begin
  perform public.next_order_number(current_date);
  raise exception 'TEST FAILED: anon called next_order_number';
exception when insufficient_privilege then raise notice 'ok  public key cannot call next_order_number';
end $$;
-- ...but still reads the menu and the board (policies still evaluate for anon)
do $$ begin
  if (select count(*) from public.menu_items) = 0 then raise exception 'TEST FAILED: anon menu'; end if;
  perform * from public.order_board();
  raise notice 'ok  public key still reads the menu and the status board';
end $$;
reset role;

-- 2. A manager cannot change an order's total or payment status directly
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
set local role authenticated;
update public.orders set total = 1, subtotal = 1, payment_status = 'paid' where id = (select id from o);
reset role;
select case when payment_status = 'pending' and total <> 1 then 'ok  manager direct edit of total/payment had no effect'
            else 'TEST FAILED: manager edited order' end as result from public.orders where id = (select id from o);

-- 3. Kitchen cannot read payment records; manager can
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
select case when count(*) = 0 then 'ok  kitchen sees no payment records' else 'TEST FAILED: kitchen reads payments' end as result
  from public.payments where order_id = (select id from o);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
select case when count(*) = 1 then 'ok  manager still sees payment records' else 'TEST FAILED: manager cannot read payments' end as result
  from public.payments where order_id = (select id from o);
-- Kitchen still gets paid/unpaid where it needs it
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
reset role;
rollback;

-- 4. A stranger who signs up with the public key (no staff profile) gets nothing
begin;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e9', 'stranger@example.com');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e9', true);
set local role authenticated;
select case when (select count(*) from public.orders) = 0 and (select count(*) from public.payments) = 0
             and (select count(*) from public.profiles) = 0 and (select count(*) from public.order_items) = 0
            then 'ok  signed-up stranger sees no orders, payments, staff or items' else 'TEST FAILED: stranger reads data' end as result;
do $$ begin
  begin perform public.kitchen_orders(); raise exception 'TEST FAILED: stranger kitchen feed';
  exception when others then if sqlerrm <> 'NOT_ALLOWED' then raise; end if; end;
  begin perform public.sales_report(current_date, current_date); raise exception 'TEST FAILED: stranger reports';
  exception when others then if sqlerrm <> 'NOT_ALLOWED' then raise; end if; end;
  begin perform public.save_menu_item('{"name":"x","base_price":1,"category_id":"00000000-0000-0000-0000-000000000000"}'::jsonb); raise exception 'TEST FAILED: stranger menu';
  exception when others then if sqlerrm <> 'NOT_ALLOWED' then raise; end if; end;
  begin perform public.mark_cash_paid(gen_random_uuid()); raise exception 'TEST FAILED: stranger mark paid';
  exception when others then if sqlerrm <> 'NOT_ALLOWED' then raise; end if; end;
  raise notice 'ok  stranger refused: kitchen feed, reports, menu edits, marking paid';
end $$;
update public.menu_items set base_price = 1;
select case when (select min(base_price) from public.menu_items) > 1 then 'ok  stranger cannot change prices' else 'TEST FAILED: stranger changed prices' end as result;
insert into public.profiles (id, full_name, role) values ('00000000-0000-0000-0000-0000000000e9', 'Me', 'admin');
rollback;
