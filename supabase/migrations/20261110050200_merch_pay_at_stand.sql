begin;

-- Merch paid at the stand, for the concert's attendees.
--
-- The seller chooses per concert how its audience pays:
--   * in_app   — the existing Stripe Checkout flow (merch-checkout), only when
--                the seller's Stripe account has charges_enabled;
--   * at_stand — reserve in the app without paying, pay cash or card at the
--                merch stand on pickup. Needs no edge function: merch_reserve
--                is called by the client.
--
-- Either way only people marked as going to the concert (event_attendance
-- 'going' or 'attended') can reserve, and pickup is always at the stand.
--
-- A reservation (status 'reserved') holds its stock until the concert closes
-- (merch_reservation_expires_at: 6 h after the start, or one hour after the
-- end when that is later, never more than 24 h after the start). There is no
-- cron: merch_release_expired gives the stock back lazily (new orders and
-- reservations, the concert page and the buyer's orders call it) and once a
-- day from the scrape workflow with the service role.
--
-- At the stand, merch_collect hands a reservation over and records it as paid
-- (paid_cents = total). The buyer can cancel a reservation before pickup.

alter table public.event_merch
  add column if not exists payment_method text not null default 'in_app'
    constraint event_merch_payment_method_check check (payment_method in ('in_app', 'at_stand'));

alter table public.merch_orders
  add column if not exists payment_method text not null default 'in_app'
    constraint merch_orders_payment_method_check check (payment_method in ('in_app', 'at_stand')),
  add column if not exists expires_at timestamptz,
  add column if not exists paid_cents integer
    constraint merch_orders_paid_cents_check check (paid_cents is null or paid_cents >= 0);

comment on column public.event_merch.payment_method is
  'in_app: Stripe Checkout (seller needs charges_enabled). at_stand: reserve in the app, pay at the stand.';
comment on column public.merch_orders.expires_at is
  'at_stand reservations: stock goes back if not collected by then (merch_release_expired).';
comment on column public.merch_orders.paid_cents is
  'Amount taken at the stand when an at_stand reservation is collected.';

create index if not exists merch_orders_expires_idx
  on public.merch_orders (expires_at) where expires_at is not null;

-- When the stand closes for a concert.
create or replace function public.merch_reservation_expires_at(p_starts_at timestamptz, p_ends_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select least(
    greatest(p_starts_at + interval '6 hours', p_ends_at + interval '1 hour'),
    p_starts_at + interval '24 hours'
  );
$$;

-- Gives back the stock of reservations nobody collected in time. Idempotent
-- and only touches reservations already past expires_at, so anyone may call
-- it (the concert page does, before reading stock).
create or replace function public.merch_release_expired(p_event_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  with expired as (
    update public.merch_orders
    set status = 'cancelled', cancelled_at = now()
    where status = 'reserved'
      and expires_at is not null
      and expires_at <= now()
      and (p_event_id is null or event_id = p_event_id)
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_ids from expired;

  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  update public.merch_variants v
  set stock = v.stock + s.quantity
  from (
    select variant_id, sum(quantity)::integer as quantity
    from public.merch_order_lines
    where order_id = any(v_ids) and variant_id is not null
    group by variant_id
  ) s
  where v.id = s.variant_id and v.stock is not null;

  return cardinality(v_ids);
end;
$$;

-- Reserve to pay at the stand. Called by the signed-in buyer.
-- p_lines: [{"variant_id": uuid, "quantity": int}, ...]
-- Same locks and limits as merch_create_order: 3 unpaid orders, 10 units an
-- order, 10 units of a variant between unpaid, reserved and paid orders.
create or replace function public.merch_reserve(
  p_event_id uuid,
  p_seller_subject_id uuid,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_buyer uuid := auth.uid();
  v_event public.events%rowtype;
  v_pickup text;
  v_line jsonb;
  v_variant record;
  v_quantity integer;
  v_total integer := 0;
  v_order_id uuid := extensions.gen_random_uuid();
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_lines jsonb := '[]'::jsonb;
  v_units integer := 0;
  v_held integer;
  v_expires timestamptz;
begin
  if v_buyer is null then
    raise exception 'merch:auth';
  end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 10
    or (select count(distinct l ->> 'variant_id') from jsonb_array_elements(p_lines) l) <> jsonb_array_length(p_lines) then
    raise exception 'merch:lines';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.status <> 'published' then
    raise exception 'merch:event';
  end if;
  -- Reservations close three hours after doors (same rule as in-app payment).
  if now() > v_event.starts_at + interval '3 hours' then
    raise exception 'merch:closed';
  end if;

  select pickup_point into v_pickup
  from public.event_merch
  where event_id = p_event_id and seller_subject_id = p_seller_subject_id and payment_method = 'at_stand';
  if not found or not public.merch_seller_at_event(p_seller_subject_id, p_event_id) then
    raise exception 'merch:not_selling';
  end if;

  if not exists (
    select 1 from public.event_attendance
    where event_id = p_event_id and profile_id = v_buyer and status in ('going', 'attended')
  ) then
    raise exception 'merch:not_attending';
  end if;

  perform public.merch_release_expired(null);

  perform pg_advisory_xact_lock(hashtext('merch-buyer:' || v_buyer::text));
  if (select count(*) from public.merch_orders where buyer_id = v_buyer and status in ('pending', 'reserved')) >= 3 then
    raise exception 'merch:too_many_pending';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_quantity := (v_line ->> 'quantity')::integer;
    if v_quantity is null or v_quantity not between 1 and 10 then
      raise exception 'merch:quantity';
    end if;
    v_units := v_units + v_quantity;
    if v_units > 10 then
      raise exception 'merch:quantity';
    end if;
    select coalesce(sum(l.quantity), 0) into v_held
    from public.merch_order_lines l
    join public.merch_orders o on o.id = l.order_id
    where o.buyer_id = v_buyer and o.status in ('pending', 'reserved', 'paid')
      and l.variant_id = (v_line ->> 'variant_id')::uuid;
    if v_held + v_quantity > 10 then
      raise exception 'merch:quantity';
    end if;

    select v.id, v.label, v.stock, i.name, i.price_cents
      into v_variant
    from public.merch_variants v
    join public.merch_items i on i.id = v.item_id
    where v.id = (v_line ->> 'variant_id')::uuid
      and i.seller_subject_id = p_seller_subject_id
      and i.active
    for update of v;
    if not found then
      raise exception 'merch:variant';
    end if;
    if v_variant.stock is not null then
      if v_variant.stock < v_quantity then
        raise exception 'merch:stock';
      end if;
      update public.merch_variants set stock = stock - v_quantity where id = v_variant.id;
    end if;

    v_total := v_total + v_variant.price_cents * v_quantity;
    v_lines := v_lines || jsonb_build_object(
      'variant_id', v_variant.id,
      'item_name', v_variant.name,
      'variant_label', v_variant.label,
      'quantity', v_quantity,
      'unit_price_cents', v_variant.price_cents
    );
  end loop;

  loop
    select string_agg(substr(v_alphabet, 1 + get_byte(b.bytes, i) % 32, 1), '')
      into v_code
    from (select extensions.gen_random_bytes(6) as bytes) b, generate_series(0, 5) i;
    exit when not exists (select 1 from public.merch_orders where pickup_code = v_code);
  end loop;

  v_expires := public.merch_reservation_expires_at(v_event.starts_at, v_event.ends_at);

  -- No fee: the money never goes through Live Space.
  insert into public.merch_orders (
    id, event_id, seller_subject_id, buyer_id, status, payment_method, total_cents, fee_cents,
    pickup_code, pickup_point, expires_at
  ) values (
    v_order_id, p_event_id, p_seller_subject_id, v_buyer, 'reserved', 'at_stand', v_total, 0,
    v_code, v_pickup, v_expires
  );

  insert into public.merch_order_lines (order_id, variant_id, item_name, variant_label, quantity, unit_price_cents)
  select v_order_id, (l ->> 'variant_id')::uuid, l ->> 'item_name', l ->> 'variant_label',
    (l ->> 'quantity')::smallint, (l ->> 'unit_price_cents')::integer
  from jsonb_array_elements(v_lines) l;

  return jsonb_build_object(
    'order_id', v_order_id,
    'total_cents', v_total,
    'pickup_code', v_code,
    'expires_at', v_expires
  );
end;
$$;

-- The buyer drops a reservation before pickup; its stock goes back.
create or replace function public.merch_cancel_reservation(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.merch_orders
  set status = 'cancelled', cancelled_at = now()
  where id = p_order_id and buyer_id = (select auth.uid()) and status = 'reserved';
  if not found then
    return false;
  end if;
  update public.merch_variants v
  set stock = v.stock + l.quantity
  from public.merch_order_lines l
  where l.order_id = p_order_id and l.variant_id = v.id and v.stock is not null;
  return true;
end;
$$;

-- At the stand: an owner, admin or editor of the seller hands over an order by
-- its code. A paid order is just collected; a reservation is collected and
-- recorded as paid at the stand for its total.
create or replace function public.merch_collect(p_event_id uuid, p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.merch_orders%rowtype;
begin
  select * into v_order
  from public.merch_orders
  where event_id = p_event_id and pickup_code = upper(btrim(p_code))
  for update;
  if not found or not public.can_manage_subject(v_order.seller_subject_id) then
    raise exception 'merch:code';
  end if;
  if v_order.status = 'collected' then
    raise exception 'merch:already_collected';
  end if;
  if v_order.status = 'reserved' then
    update public.merch_orders
    set status = 'collected', collected_at = now(), collected_by = (select auth.uid()),
      paid_at = now(), paid_cents = v_order.total_cents
    where id = v_order.id;
    return v_order.id;
  end if;
  if v_order.status = 'cancelled' then
    raise exception 'merch:cancelled';
  end if;
  if v_order.status <> 'paid' then
    raise exception 'merch:not_paid';
  end if;
  update public.merch_orders
  set status = 'collected', collected_at = now(), collected_by = (select auth.uid())
  where id = v_order.id;
  return v_order.id;
end;
$$;

-- In-app payment (merch-checkout, service role). Unchanged except: the stand
-- must take in-app payments, the buyer must be going to the concert,
-- reservations count towards the buyer's limits, and expired reservations are
-- released first.
create or replace function public.merch_create_order(
  p_buyer_id uuid,
  p_event_id uuid,
  p_seller_subject_id uuid,
  p_lines jsonb,
  p_fee_bps integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_pickup text;
  v_line jsonb;
  v_variant record;
  v_quantity integer;
  v_total integer := 0;
  v_order_id uuid := extensions.gen_random_uuid();
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_lines jsonb := '[]'::jsonb;
  v_units integer := 0;
  v_held integer;
begin
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 10
    or (select count(distinct l ->> 'variant_id') from jsonb_array_elements(p_lines) l) <> jsonb_array_length(p_lines) then
    raise exception 'merch:lines';
  end if;
  if p_fee_bps not between 0 and 3000 then
    raise exception 'merch:fee';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found or v_event.status <> 'published' then
    raise exception 'merch:event';
  end if;
  -- Reservations close three hours after doors.
  if now() > v_event.starts_at + interval '3 hours' then
    raise exception 'merch:closed';
  end if;

  select pickup_point into v_pickup
  from public.event_merch
  where event_id = p_event_id and seller_subject_id = p_seller_subject_id and payment_method = 'in_app';
  if not found or not public.merch_seller_at_event(p_seller_subject_id, p_event_id) then
    raise exception 'merch:not_selling';
  end if;
  if not exists (
    select 1 from public.merch_sellers
    where subject_id = p_seller_subject_id and charges_enabled and stripe_account_id is not null
  ) then
    raise exception 'merch:seller';
  end if;
  if not exists (
    select 1 from public.event_attendance
    where event_id = p_event_id and profile_id = p_buyer_id and status in ('going', 'attended')
  ) then
    raise exception 'merch:not_attending';
  end if;

  perform public.merch_release_expired(null);

  -- Limits per buyer, serialized so parallel requests cannot all pass the
  -- counts: 3 unpaid orders, 10 units an order, 10 units of a variant.
  perform pg_advisory_xact_lock(hashtext('merch-buyer:' || p_buyer_id::text));
  if (select count(*) from public.merch_orders where buyer_id = p_buyer_id and status in ('pending', 'reserved')) >= 3 then
    raise exception 'merch:too_many_pending';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_quantity := (v_line ->> 'quantity')::integer;
    if v_quantity is null or v_quantity not between 1 and 10 then
      raise exception 'merch:quantity';
    end if;
    v_units := v_units + v_quantity;
    if v_units > 10 then
      raise exception 'merch:quantity';
    end if;
    select coalesce(sum(l.quantity), 0) into v_held
    from public.merch_order_lines l
    join public.merch_orders o on o.id = l.order_id
    where o.buyer_id = p_buyer_id and o.status in ('pending', 'reserved', 'paid')
      and l.variant_id = (v_line ->> 'variant_id')::uuid;
    if v_held + v_quantity > 10 then
      raise exception 'merch:quantity';
    end if;

    select v.id, v.label, v.stock, i.name, i.price_cents
      into v_variant
    from public.merch_variants v
    join public.merch_items i on i.id = v.item_id
    where v.id = (v_line ->> 'variant_id')::uuid
      and i.seller_subject_id = p_seller_subject_id
      and i.active
    for update of v;
    if not found then
      raise exception 'merch:variant';
    end if;
    if v_variant.stock is not null then
      if v_variant.stock < v_quantity then
        raise exception 'merch:stock';
      end if;
      update public.merch_variants set stock = stock - v_quantity where id = v_variant.id;
    end if;

    v_total := v_total + v_variant.price_cents * v_quantity;
    v_lines := v_lines || jsonb_build_object(
      'variant_id', v_variant.id,
      'item_name', v_variant.name,
      'variant_label', v_variant.label,
      'quantity', v_quantity,
      'unit_price_cents', v_variant.price_cents
    );
  end loop;

  loop
    -- 256 is a multiple of the 32-letter alphabet: no bias.
    select string_agg(substr(v_alphabet, 1 + get_byte(b.bytes, i) % 32, 1), '')
      into v_code
    from (select extensions.gen_random_bytes(6) as bytes) b, generate_series(0, 5) i;
    exit when not exists (select 1 from public.merch_orders where pickup_code = v_code);
  end loop;

  insert into public.merch_orders (
    id, event_id, seller_subject_id, buyer_id, total_cents, fee_cents, pickup_code, pickup_point
  ) values (
    v_order_id, p_event_id, p_seller_subject_id, p_buyer_id, v_total,
    (v_total * p_fee_bps) / 10000, v_code, v_pickup
  );

  insert into public.merch_order_lines (order_id, variant_id, item_name, variant_label, quantity, unit_price_cents)
  select v_order_id, (l ->> 'variant_id')::uuid, l ->> 'item_name', l ->> 'variant_label',
    (l ->> 'quantity')::smallint, (l ->> 'unit_price_cents')::integer
  from jsonb_array_elements(v_lines) l;

  return jsonb_build_object(
    'order_id', v_order_id,
    'total_cents', v_total,
    'fee_cents', (v_total * p_fee_bps) / 10000,
    'lines', v_lines
  );
end;
$$;

revoke all on function public.merch_reservation_expires_at(timestamptz, timestamptz) from public;
revoke all on function public.merch_release_expired(uuid) from public;
revoke all on function public.merch_reserve(uuid, uuid, jsonb) from public, anon;
revoke all on function public.merch_cancel_reservation(uuid) from public, anon;
revoke all on function public.merch_collect(uuid, text) from public, anon;
revoke all on function public.merch_create_order(uuid, uuid, uuid, jsonb, integer) from public, anon, authenticated;

grant execute on function public.merch_reservation_expires_at(timestamptz, timestamptz) to anon, authenticated, service_role;
grant execute on function public.merch_release_expired(uuid) to anon, authenticated, service_role;
grant execute on function public.merch_reserve(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function public.merch_cancel_reservation(uuid) to authenticated, service_role;
grant execute on function public.merch_collect(uuid, text) to authenticated;
grant execute on function public.merch_create_order(uuid, uuid, uuid, jsonb, integer) to service_role;

commit;

notify pgrst, 'reload schema';
