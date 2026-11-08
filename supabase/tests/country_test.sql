-- 0010_country.sql: a Rwandan restaurant. Rolls back.
\set ON_ERROR_STOP on
begin;
update public.restaurant_settings set country = 'RW', time_zone = 'Africa/Kigali', currency = 'RWF';
do $$
declare r jsonb; ref text; c jsonb; o public.orders;
begin
  if public.restaurant_tz() <> 'Africa/Kigali' then raise exception 'TEST FAILED: tz'; end if;
  if public.restaurant_today() <> (now() at time zone 'Africa/Kigali')::date then raise exception 'TEST FAILED: today'; end if;
  raise notice 'ok  today is the Kigali calendar day (%)', public.restaurant_today();

  -- Prices in whole francs: a 3,500 RWF meal
  update public.menu_items set base_price = 3500 where name = 'Meat Pie';
  r := public.place_order(jsonb_build_object('idempotencyKey','rw-test-0001','orderType','takeaway','tableNumber',null,
        'customerName','Uwase','customerPhone','0781234567','paymentMethod','mobile_money',
        'lines', jsonb_build_array(jsonb_build_object('menuItemId',(select id from public.menu_items where name='Meat Pie'),'quantity',2,'selections','{}'::jsonb,'instructions',''))));
  select * into o from public.orders where id = (r->>'order_id')::uuid;
  if o.total <> 7000 or o.customer_phone <> '0781234567' or o.order_date <> (now() at time zone 'Africa/Kigali')::date then
    raise exception 'TEST FAILED: rw order %', row_to_json(o); end if;
  raise notice 'ok  Rwandan number 0781234567 accepted; 2 x 3,500 = % RWF; order date in Kigali time', o.total;

  ref := r->>'payment_reference';
  if (select currency from public.payments where reference = ref) <> 'RWF' then raise exception 'TEST FAILED: payment currency'; end if;
  c := public.confirm_payment(ref, 7000, 'GHS', 'x1', 'mobile_money', '{}'::jsonb);
  if c->>'error' <> 'AMOUNT_MISMATCH' then raise exception 'TEST FAILED: cedis accepted for a franc payment'; end if;
  raise notice 'ok  payment recorded in RWF; a cedi confirmation for it is refused';

  c := public.place_order(jsonb_build_object('idempotencyKey','rw-test-0002','orderType','takeaway','tableNumber',null,
        'customerName','Uwase','customerPhone','0781234567','paymentMethod','mobile_money',
        'lines', jsonb_build_array(jsonb_build_object('menuItemId',(select id from public.menu_items where name='Meat Pie'),'quantity',1,'selections','{}'::jsonb,'instructions',''))));
  c := public.confirm_payment(c->>'payment_reference', 3500, 'RWF', 'x2', 'mobile_money', '{}'::jsonb);
  if c ? 'error' then raise exception 'TEST FAILED: rwf confirm %', c; end if;
  raise notice 'ok  a 3,500 RWF payment confirms and the order goes to the kitchen';
end $$;
select string_agg(order_number || ':' || status, ', ') as board from public.order_board();
rollback;
