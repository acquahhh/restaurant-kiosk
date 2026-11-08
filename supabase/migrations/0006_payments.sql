-- =============================================================================
-- 0006_payments.sql  (safe to run more than once)
-- Paystack payments. Only the server (service role) can call these.
--
-- * start_payment_attempt(): a fresh Paystack reference for an unpaid order.
--   Every press of Pay gets a new reference (Paystack rejects reused ones).
-- * confirm_payment(): called ONLY after the server has verified the
--   transaction with Paystack. Re-checks amount and currency against the order,
--   then marks it paid and sends it to the kitchen. Idempotent: the polling
--   kiosk and the webhook may both call it.
-- * fail_payment(): records a failed or abandoned attempt.
-- * expire_unpaid_orders(): cancels orders nobody paid for, so the kitchen and
--   reports never see them.
-- =============================================================================

create or replace function public.start_payment_attempt(p_order_id uuid, p_method public.payment_method)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders;
  v_ref   text;
begin
  if p_method = 'cash' then raise exception 'INVALID:method'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if v_order.payment_status = 'paid' then
    return jsonb_build_object('already_paid', true, 'order_number', v_order.order_number);
  end if;
  if v_order.status <> 'pending_payment' then raise exception 'ORDER_NOT_AWAITING_PAYMENT'; end if;

  -- Close any earlier attempt that is still open; only one live attempt per order.
  update public.payments set status = 'failed', updated_at = now()
   where order_id = p_order_id and status = 'pending';

  v_ref := 'ORD-' || to_char(v_order.order_date, 'YYMMDD') || '-' || v_order.order_number
           || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  insert into public.payments (order_id, provider, method, amount, reference)
  values (p_order_id, 'paystack', p_method, v_order.total, v_ref);
  update public.orders set payment_method = p_method where id = p_order_id;

  return jsonb_build_object('already_paid', false, 'reference', v_ref, 'amount', v_order.total,
                            'order_number', v_order.order_number);
end $$;

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
  if upper(p_currency) <> 'GHS' or p_amount <> v_pay.amount or p_amount <> v_order.total then
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

create or replace function public.fail_payment(p_reference text, p_raw jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  update public.payments set status = 'failed', raw_response = p_raw, updated_at = now()
   where reference = p_reference and status = 'pending';
$$;

create or replace function public.expire_unpaid_orders(p_minutes int default 20)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v_count int;
begin
  with stale as (
    update public.orders set status = 'cancelled'
     where status = 'pending_payment' and placed_at < now() - make_interval(mins => p_minutes)
    returning id
  )
  select count(*) into v_count from stale;
  update public.payments set status = 'failed', updated_at = now()
   where status = 'pending' and order_id in (select id from public.orders where status = 'cancelled');
  return v_count;
end $$;

revoke all on function public.start_payment_attempt(uuid, public.payment_method) from public, anon, authenticated;
revoke all on function public.confirm_payment(text, int, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.fail_payment(text, jsonb) from public, anon, authenticated;
revoke all on function public.expire_unpaid_orders(int) from public, anon, authenticated;
grant execute on function public.start_payment_attempt(uuid, public.payment_method) to service_role;
grant execute on function public.confirm_payment(text, int, text, text, text, jsonb) to service_role;
grant execute on function public.fail_payment(text, jsonb) to service_role;
grant execute on function public.expire_unpaid_orders(int) to service_role;

create index if not exists payments_pending_idx on public.payments (order_id) where status = 'pending';
