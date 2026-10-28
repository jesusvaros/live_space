-- Merch to collect at the concert.
--
-- A band or a venue lists its merch, switches it on for a concert and names
-- the pickup point. The audience pays in the app (Stripe Checkout, Connect
-- destination charge: the seller gets the money, Live Space keeps a fee) and
-- collects at the stand with a six-character code.
--
-- Clients read and manage the catalogue under RLS. Orders are only written by
-- the merch-* edge functions (service role) and by merch_collect.

create type public.merch_order_status as enum ('pending', 'paid', 'collected', 'cancelled', 'refunded');

-- The seller's Stripe account. Clients see only whether it can take payments.
create table public.merch_sellers (
  subject_id uuid primary key references public.subjects(id) on delete cascade,
  stripe_account_id text unique,
  charges_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.merch_items (
  id uuid primary key default extensions.gen_random_uuid(),
  seller_subject_id uuid not null references public.subjects(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 500),
  image_url text check (image_url is null or image_url ~* '^https://'),
  price_cents integer not null check (price_cents between 100 and 50000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index merch_items_seller_idx on public.merch_items (seller_subject_id);

-- Sizes or models. A null stock means "no limit".
create table public.merch_variants (
  id uuid primary key default extensions.gen_random_uuid(),
  item_id uuid not null references public.merch_items(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 20),
  stock integer check (stock is null or stock >= 0),
  position smallint not null default 0,
  unique (item_id, label)
);

-- Merch switched on for a concert, with its pickup point.
create table public.event_merch (
  event_id uuid not null references public.events(id) on delete cascade,
  seller_subject_id uuid not null references public.subjects(id) on delete cascade,
  pickup_point text not null default 'Puesto de merch'
    check (char_length(btrim(pickup_point)) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (event_id, seller_subject_id)
);
create index event_merch_seller_idx on public.event_merch (seller_subject_id);

create table public.merch_orders (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  seller_subject_id uuid not null references public.subjects(id) on delete restrict,
  buyer_id uuid references public.profiles(id) on delete set null,
  status public.merch_order_status not null default 'pending',
  total_cents integer not null check (total_cents > 0),
  fee_cents integer not null check (fee_cents >= 0 and fee_cents < total_cents),
  pickup_code text not null unique check (pickup_code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  pickup_point text not null,
  stripe_session_id text unique,
  stripe_payment_intent_id text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  collected_at timestamptz,
  collected_by uuid references public.profiles(id) on delete set null,
  cancelled_at timestamptz
);
create index merch_orders_buyer_idx on public.merch_orders (buyer_id, created_at desc);
create index merch_orders_event_seller_idx on public.merch_orders (event_id, seller_subject_id, status);

-- Name, size and price are copied: the receipt does not change with the catalogue.
create table public.merch_order_lines (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.merch_orders(id) on delete cascade,
  variant_id uuid references public.merch_variants(id) on delete set null,
  item_name text not null,
  variant_label text not null,
  quantity smallint not null check (quantity between 1 and 10),
  unit_price_cents integer not null check (unit_price_cents > 0)
);
create index merch_order_lines_order_idx on public.merch_order_lines (order_id);

create trigger merch_sellers_set_updated_at before update on public.merch_sellers
  for each row execute function public.set_updated_at();
create trigger merch_items_set_updated_at before update on public.merch_items
  for each row execute function public.set_updated_at();

-- A published artist on the bill or the published venue of the concert.
create or replace function public.merch_seller_at_event(p_subject_id uuid, p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subjects s
    join public.events e on e.id = p_event_id
    where s.id = p_subject_id
      and (
        (s.type = 'venue' and s.venue_place_id = e.venue_place_id and exists (
          select 1 from public.venue_places vp where vp.id = s.venue_place_id and vp.status = 'published'
        ))
        or (s.type = 'artist' and exists (
          select 1
          from public.event_artists ea
          join public.artists a on a.id = ea.artist_id
          where ea.event_id = e.id and ea.artist_id = s.artist_id and a.status = 'published'
        ))
      )
  );
$$;

create or replace function public.merch_can_sell(p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_manage_subject(p_subject_id)
    and exists (select 1 from public.subjects s where s.id = p_subject_id and s.type in ('artist', 'venue'));
$$;

alter table public.merch_sellers enable row level security;
alter table public.merch_items enable row level security;
alter table public.merch_variants enable row level security;
alter table public.event_merch enable row level security;
alter table public.merch_orders enable row level security;
alter table public.merch_order_lines enable row level security;

create policy merch_sellers_read on public.merch_sellers for select using (true);

create policy merch_items_read on public.merch_items for select
  using (active or public.merch_can_sell(seller_subject_id));
create policy merch_items_insert on public.merch_items for insert to authenticated
  with check (public.merch_can_sell(seller_subject_id));
create policy merch_items_update on public.merch_items for update to authenticated
  using (public.merch_can_sell(seller_subject_id))
  with check (public.merch_can_sell(seller_subject_id));
create policy merch_items_delete on public.merch_items for delete to authenticated
  using (public.merch_can_sell(seller_subject_id));

create policy merch_variants_read on public.merch_variants for select
  using (exists (
    select 1 from public.merch_items i
    where i.id = item_id and (i.active or public.merch_can_sell(i.seller_subject_id))
  ));
create policy merch_variants_write on public.merch_variants for all to authenticated
  using (exists (select 1 from public.merch_items i where i.id = item_id and public.merch_can_sell(i.seller_subject_id)))
  with check (exists (select 1 from public.merch_items i where i.id = item_id and public.merch_can_sell(i.seller_subject_id)));

create policy event_merch_read on public.event_merch for select using (true);
create policy event_merch_write on public.event_merch for all to authenticated
  using (public.merch_can_sell(seller_subject_id))
  with check (
    public.merch_can_sell(seller_subject_id)
    and public.merch_seller_at_event(seller_subject_id, event_id)
  );

create policy merch_orders_read on public.merch_orders for select to authenticated
  using (buyer_id = (select auth.uid()) or public.can_manage_subject(seller_subject_id));

create policy merch_order_lines_read on public.merch_order_lines for select to authenticated
  using (exists (
    select 1 from public.merch_orders o
    where o.id = order_id
      and (o.buyer_id = (select auth.uid()) or public.can_manage_subject(o.seller_subject_id))
  ));

-- Column grants: the Stripe account id never leaves the server.
revoke all on public.merch_sellers, public.merch_orders, public.merch_order_lines from anon, authenticated;
grant select (subject_id, charges_enabled) on public.merch_sellers to anon, authenticated;
grant select on public.merch_orders, public.merch_order_lines to authenticated;
revoke all on public.merch_items, public.merch_variants, public.event_merch from anon, authenticated;
grant select on public.merch_items, public.merch_variants, public.event_merch to anon, authenticated;
grant insert, update, delete on public.merch_items, public.merch_variants, public.event_merch to authenticated;
grant all on public.merch_sellers, public.merch_items, public.merch_variants, public.event_merch,
  public.merch_orders, public.merch_order_lines to service_role;

-- Reserves stock and creates a pending order. Service role only (merch-checkout).
-- p_lines: [{"variant_id": uuid, "quantity": int}, ...]
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
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 10
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
  where event_id = p_event_id and seller_subject_id = p_seller_subject_id;
  if not found or not public.merch_seller_at_event(p_seller_subject_id, p_event_id) then
    raise exception 'merch:not_selling';
  end if;
  if not exists (
    select 1 from public.merch_sellers
    where subject_id = p_seller_subject_id and charges_enabled and stripe_account_id is not null
  ) then
    raise exception 'merch:seller';
  end if;

  -- Limits per buyer, serialized so parallel requests cannot all pass the
  -- counts: 3 unpaid orders, 10 units an order, 10 units of a variant.
  perform pg_advisory_xact_lock(hashtext('merch-buyer:' || p_buyer_id::text));
  if (select count(*) from public.merch_orders where buyer_id = p_buyer_id and status = 'pending') >= 3 then
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
    where o.buyer_id = p_buyer_id and o.status in ('pending', 'paid')
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

create or replace function public.merch_attach_session(p_order_id uuid, p_session_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.merch_orders
  set stripe_session_id = p_session_id
  where id = p_order_id and status = 'pending' and stripe_session_id is null;
  return found;
end;
$$;

create or replace function public.merch_mark_paid(p_order_id uuid, p_session_id text, p_payment_intent_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.merch_orders
  set status = 'paid', paid_at = now(), stripe_payment_intent_id = p_payment_intent_id
  where id = p_order_id and stripe_session_id = p_session_id and status = 'pending';
  return found;
end;
$$;

-- An unpaid order gives its stock back. From the webhook the session must be
-- the order's own; without a session (checkout never started) it must have none.
create or replace function public.merch_release_order(p_order_id uuid, p_session_id text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.merch_orders
  set status = 'cancelled', cancelled_at = now()
  where id = p_order_id and status = 'pending'
    and stripe_session_id is not distinct from p_session_id;
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

create or replace function public.merch_mark_refunded(p_payment_intent_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.merch_orders
  set status = 'refunded'
  where stripe_payment_intent_id = p_payment_intent_id and status in ('paid', 'collected');
  return found;
end;
$$;

-- At the stand: an owner, admin or editor of the seller hands over a paid order by its code.
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
  if v_order.status <> 'paid' then
    raise exception 'merch:not_paid';
  end if;
  update public.merch_orders
  set status = 'collected', collected_at = now(), collected_by = (select auth.uid())
  where id = v_order.id;
  return v_order.id;
end;
$$;

revoke all on function public.merch_seller_at_event(uuid, uuid) from public;
revoke all on function public.merch_can_sell(uuid) from public;
revoke all on function public.merch_create_order(uuid, uuid, uuid, jsonb, integer) from public, anon, authenticated;
revoke all on function public.merch_attach_session(uuid, text) from public, anon, authenticated;
revoke all on function public.merch_mark_paid(uuid, text, text) from public, anon, authenticated;
revoke all on function public.merch_release_order(uuid, text) from public, anon, authenticated;
revoke all on function public.merch_mark_refunded(text) from public, anon, authenticated;
revoke all on function public.merch_collect(uuid, text) from public, anon;

grant execute on function public.merch_seller_at_event(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.merch_can_sell(uuid) to anon, authenticated, service_role;
grant execute on function public.merch_create_order(uuid, uuid, uuid, jsonb, integer) to service_role;
grant execute on function public.merch_attach_session(uuid, text) to service_role;
grant execute on function public.merch_mark_paid(uuid, text, text) to service_role;
grant execute on function public.merch_release_order(uuid, text) to service_role;
grant execute on function public.merch_mark_refunded(text) to service_role;
grant execute on function public.merch_collect(uuid, text) to authenticated;
