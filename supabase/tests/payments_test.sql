-- Tests for 0006_payments.sql. Run after all migrations + seed. Rolls back.
\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.momo_order(key text) returns jsonb language sql as $$
  select public.place_order(jsonb_build_object('idempotencyKey', key, 'orderType','dine_in','tableNumber','2',
    'customerName','','customerPhone','','paymentMethod','mobile_money',
    'lines', jsonb_build_array(jsonb_build_object('menuItemId',(select id from public.menu_items where name='Meat Pie'),'quantity',2,'selections','{}'::jsonb,'instructions',''))))
$$;

do $$
declare o jsonb; a jsonb; b jsonb; c jsonb; oid uuid; ord public.orders;
begin
  o := pg_temp.momo_order('pay-test-0002'); oid := (o->>'order_id')::uuid;

  -- Unpaid orders stay out of the kitchen
  if exists (select 1 from public.orders where id = oid and status in ('received','preparing','ready')) then raise exception 'TEST FAILED: kitchen'; end if;

  -- A retry gets a fresh reference and closes the earlier attempt
  a := public.start_payment_attempt(oid, 'mobile_money');
  b := public.start_payment_attempt(oid, 'card');
  if a->>'reference' = b->>'reference' then raise exception 'TEST FAILED: reused reference'; end if;
  if (select count(*) from public.payments where order_id = oid and status = 'pending') <> 1 then raise exception 'TEST FAILED: one live attempt'; end if;
  if (select payment_method from public.orders where id = oid) <> 'card' then raise exception 'TEST FAILED: method switch'; end if;
  raise notice 'ok  retry: new reference %, earlier attempts closed, method now card', b->>'reference';

  -- Wrong amount is refused and the order stays unpaid
  a := public.confirm_payment(b->>'reference', 100, 'GHS', 'ps_1', 'card', '{}'::jsonb);
  if a->>'error' <> 'AMOUNT_MISMATCH' then raise exception 'TEST FAILED: short payment accepted'; end if;
  if (select status::text || '/' || (raw_response->>'needs_review') from public.payments where reference = b->>'reference') <> 'failed/true' then
    raise exception 'TEST FAILED: refusal not recorded'; end if;
  raise notice 'ok  underpayment (GH₵ 1.00 for GH₵ 24.00) refused and recorded for review';
  if (select payment_status from public.orders where id = oid) <> 'pending' then raise exception 'TEST FAILED: marked paid'; end if;

  -- Wrong currency is refused
  c := public.start_payment_attempt(oid, 'mobile_money');
  a := public.confirm_payment(c->>'reference', 2400, 'NGN', 'ps_2', 'mobile_money', '{}'::jsonb);
  if a->>'error' <> 'AMOUNT_MISMATCH' then raise exception 'TEST FAILED: wrong currency accepted'; end if;
  raise notice 'ok  2400 in naira instead of cedis refused';

  -- Correct payment sends the order to the kitchen
  c := public.start_payment_attempt(oid, 'mobile_money');
  a := public.confirm_payment(c->>'reference', 2400, 'GHS', 'ps_3', 'mobile_money', '{"status":"success"}'::jsonb);
  select * into ord from public.orders where id = oid;
  if ord.status <> 'received' or ord.payment_status <> 'paid' or ord.estimated_ready_at is null then raise exception 'TEST FAILED: confirm %', row_to_json(ord); end if;
  raise notice 'ok  verified GH₵ 24.00 payment: order % now received and paid', ord.order_number;

  -- Kiosk poll and webhook both confirming: second call is a no-op
  b := public.confirm_payment(c->>'reference', 2400, 'GHS', 'ps_3', 'mobile_money', '{}'::jsonb);
  if (b->>'already')::boolean is not true then raise exception 'TEST FAILED: double confirm'; end if;
  if (select count(*) from public.payments where order_id = oid and status = 'paid') <> 1 then raise exception 'TEST FAILED: two paid'; end if;
  raise notice 'ok  second confirmation (webhook + kiosk) changed nothing';

  -- Two attempts both charged (customer paid twice): second is flagged for refund
  update public.payments set status = 'pending' where reference = (select reference from public.payments where order_id = oid and status = 'failed' order by created_at desc limit 1);
  a := public.confirm_payment((select reference from public.payments where order_id = oid and status = 'pending' limit 1), 2400, 'GHS', 'ps_9', 'mobile_money', '{}'::jsonb);
  if a->>'error' <> 'ALREADY_PAID_BY_OTHER_ATTEMPT' then raise exception 'TEST FAILED: double payment %', a; end if;
  if not exists (select 1 from public.payments where order_id = oid and raw_response->>'refund_needed' = 'true') then raise exception 'TEST FAILED: refund flag'; end if;
  raise notice 'ok  a second real charge on a paid order is flagged: refund needed';

  -- Paid order cannot start a new attempt
  a := public.start_payment_attempt(oid, 'card');
  if (a->>'already_paid')::boolean is not true then raise exception 'TEST FAILED: paid order new attempt'; end if;
  raise notice 'ok  paid order refuses a new payment attempt';

  -- Expiry: an abandoned order is cancelled; a late payment still reaches the kitchen
  o := pg_temp.momo_order('pay-test-0003'); oid := (o->>'order_id')::uuid;
  a := public.start_payment_attempt(oid, 'mobile_money');
  update public.orders set placed_at = now() - interval '30 minutes' where id = oid;
  if public.expire_unpaid_orders(20) <> 1 then raise exception 'TEST FAILED: expire count'; end if;
  if (select status from public.orders where id = oid) <> 'cancelled' then raise exception 'TEST FAILED: not cancelled'; end if;
  raise notice 'ok  abandoned order cancelled after 20 minutes';

  -- Reopen the attempt as if Paystack later reports success for it
  update public.payments set status = 'pending' where reference = a->>'reference';
  perform public.confirm_payment(a->>'reference', 2400, 'GHS', 'ps_4', 'mobile_money', '{}'::jsonb);
  if (select status from public.orders where id = oid) <> 'received' then raise exception 'TEST FAILED: late payment'; end if;
  raise notice 'ok  a payment arriving after expiry still sends the order to the kitchen';
end $$;

select has_function_privilege('anon','public.confirm_payment(text,int,text,text,text,jsonb)','execute') as anon_can_confirm,
       has_function_privilege('authenticated','public.confirm_payment(text,int,text,text,text,jsonb)','execute') as staff_can_confirm,
       has_function_privilege('service_role','public.confirm_payment(text,int,text,text,text,jsonb)','execute') as server_can_confirm;
rollback;
