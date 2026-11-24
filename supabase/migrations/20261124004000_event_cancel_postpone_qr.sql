begin;

-- Phase 1, block B: a manager cancels or postpones a concert, and the concert
-- QR becomes a kit (expiring token, rotation, a permanent QR per venue).
--
-- 1. Cancel / postpone
--    - cancel_event(): status 'cancelled' + cancelled_at/cancel_reason. Lists
--      only read published concerts, so it leaves Inicio and the map; the page
--      stays readable (events_read) to show CANCELADO to whoever was going.
--      Merch reservations and unpaid orders are released (stock back); paid
--      orders are counted for the seller to refund in Stripe.
--    - postpone_event(): a new date (postponed_from keeps the first one,
--      reservations follow the new date) or «fecha por confirmar» (date_tbc;
--      reservations are held with no expiry until there is a date).
--    - Both leave a notice (event_notices) for people going or who saved it,
--      read by the app on next open (no server push sender exists yet), and a
--      row in event_change_log.
--    - Workers (scraper, no auth.uid()) can never undo a cancellation.
-- 2. QR
--    - resolve_event_upload_token(): a concert token is valid until 72 h after
--      the concert ends (ends_at, else starts_at + 6 h) and never for a
--      cancelled one. A venue token (venue_upload_tokens) resolves to the
--      venue's concert of tonight (or the one that just ended).
--    - rotate_event_upload_token() / rotate_venue_upload_token(): managers
--      replace the token; printed QRs stop working.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table public.events
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists postponed_from timestamptz,
  add column if not exists date_tbc boolean not null default false;

alter table public.events drop constraint if exists events_cancel_reason_len;
alter table public.events
  add constraint events_cancel_reason_len check (cancel_reason is null or char_length(cancel_reason) <= 200);

-- A cancelled concert stays readable by its id (the lists filter on published).
drop policy if exists events_read on public.events;
create policy events_read on public.events for select
  using (
    status = 'published'
    or (status = 'cancelled' and cancelled_at is not null)
    or created_by = (select auth.uid())
    or public.can_manage_event(id)
    or public.current_user_is_staff()
  );

-- Workers never undo a cancellation or a postponement done by a person.
create or replace function public.protect_event_schedule_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    return new;
  end if;
  if old.cancelled_at is not null then
    new.status := old.status;
    new.cancelled_at := old.cancelled_at;
    new.cancel_reason := old.cancel_reason;
  end if;
  if old.postponed_from is not null or old.date_tbc then
    new.starts_at := old.starts_at;
    new.ends_at := old.ends_at;
    new.postponed_from := old.postponed_from;
    new.date_tbc := old.date_tbc;
  end if;
  return new;
end;
$$;

drop trigger if exists events_protect_schedule_changes on public.events;
create trigger events_protect_schedule_changes
  before update on public.events
  for each row execute function public.protect_event_schedule_changes();

-- ---------------------------------------------------------------------------
-- 2. Notices and change log
-- ---------------------------------------------------------------------------

create table if not exists public.event_notices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  kind text not null check (kind in ('cancelled', 'postponed', 'date_tbc')),
  reason text check (reason is null or char_length(reason) <= 200),
  starts_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists event_notices_event_idx on public.event_notices (event_id, created_at desc);

alter table public.event_notices enable row level security;
drop policy if exists event_notices_read on public.event_notices;
create policy event_notices_read on public.event_notices for select using (true);
revoke all on public.event_notices from anon, authenticated;
grant select on public.event_notices to anon, authenticated;
grant all on public.event_notices to service_role;

create table if not exists public.event_notice_dismissals (
  notice_id uuid not null references public.event_notices(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (notice_id, profile_id)
);

alter table public.event_notice_dismissals enable row level security;
drop policy if exists event_notice_dismissals_own on public.event_notice_dismissals;
create policy event_notice_dismissals_own on public.event_notice_dismissals for all to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
revoke all on public.event_notice_dismissals from anon, authenticated;
grant select, insert, delete on public.event_notice_dismissals to authenticated;
grant all on public.event_notice_dismissals to service_role;

create table if not exists public.event_change_log (
  id bigint generated always as identity primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists event_change_log_event_idx on public.event_change_log (event_id, created_at desc);

alter table public.event_change_log enable row level security;
drop policy if exists event_change_log_manage_read on public.event_change_log;
create policy event_change_log_manage_read on public.event_change_log for select to authenticated
  using (public.can_manage_event(event_id));
revoke all on public.event_change_log from anon, authenticated;
grant select on public.event_change_log to authenticated;
grant all on public.event_change_log to service_role;

-- ---------------------------------------------------------------------------
-- 3. Cancel / postpone
-- ---------------------------------------------------------------------------

create or replace function public.cancel_event(p_event_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_released uuid[];
  v_paid integer;
begin
  if (select auth.uid()) is null or not public.can_manage_event(p_event_id) then
    raise exception using errcode = '42501', message = 'Event management permission required';
  end if;
  if v_reason is not null and char_length(v_reason) > 200 then
    v_reason := left(v_reason, 200);
  end if;

  update public.events
  set status = 'cancelled', cancelled_at = now(), cancel_reason = v_reason
  where id = p_event_id and status = 'published';
  if not found then
    raise exception using errcode = 'P0002', message = 'event:not_published';
  end if;

  -- Reservations and unpaid checkouts are released; their stock goes back.
  with released as (
    update public.merch_orders
    set status = 'cancelled', cancelled_at = now()
    where event_id = p_event_id and status in ('reserved', 'pending')
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_released from released;

  if cardinality(v_released) > 0 then
    update public.merch_variants v
    set stock = v.stock + s.quantity
    from (
      select variant_id, sum(quantity)::integer as quantity
      from public.merch_order_lines
      where order_id = any(v_released) and variant_id is not null
      group by variant_id
    ) s
    where v.id = s.variant_id and v.stock is not null;
  end if;

  select count(*)::integer into v_paid
  from public.merch_orders
  where event_id = p_event_id and status = 'paid';

  insert into public.event_notices (event_id, kind, reason, created_by)
  values (p_event_id, 'cancelled', v_reason, (select auth.uid()));

  insert into public.event_change_log (event_id, actor_id, action, reason, metadata)
  values (p_event_id, (select auth.uid()), 'cancel', v_reason,
          jsonb_build_object('released_orders', cardinality(v_released), 'paid_orders', v_paid));

  return jsonb_build_object('released_orders', cardinality(v_released), 'paid_orders', v_paid);
end;
$$;

-- p_starts_at null = «fecha por confirmar».
create or replace function public.postpone_event(p_event_id uuid, p_starts_at timestamptz default null, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := left(nullif(btrim(coalesce(p_reason, '')), ''), 200);
  v_event public.events%rowtype;
  v_ends timestamptz;
begin
  if (select auth.uid()) is null or not public.can_manage_event(p_event_id) then
    raise exception using errcode = '42501', message = 'Event management permission required';
  end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found or v_event.status <> 'published' then
    raise exception using errcode = 'P0002', message = 'event:not_published';
  end if;
  if p_starts_at is not null and p_starts_at < now() then
    raise exception using errcode = '22023', message = 'event:date_in_past';
  end if;

  if p_starts_at is null then
    update public.events
    set date_tbc = true, postponed_from = coalesce(postponed_from, starts_at)
    where id = p_event_id;
    -- Held until there is a date.
    update public.merch_orders set expires_at = null
    where event_id = p_event_id and status = 'reserved';
  else
    v_ends := case when v_event.ends_at is null then null else p_starts_at + (v_event.ends_at - v_event.starts_at) end;
    update public.events
    set starts_at = p_starts_at,
        ends_at = v_ends,
        date_tbc = false,
        postponed_from = coalesce(postponed_from, v_event.starts_at)
    where id = p_event_id;
    update public.merch_orders
    set expires_at = public.merch_reservation_expires_at(p_starts_at, v_ends)
    where event_id = p_event_id and status = 'reserved';
  end if;

  insert into public.event_notices (event_id, kind, reason, starts_at, created_by)
  values (p_event_id, case when p_starts_at is null then 'date_tbc' else 'postponed' end, v_reason, p_starts_at, (select auth.uid()));

  insert into public.event_change_log (event_id, actor_id, action, reason, metadata)
  values (p_event_id, (select auth.uid()), case when p_starts_at is null then 'postpone_tbc' else 'postpone' end, v_reason,
          jsonb_build_object('from', v_event.starts_at, 'to', p_starts_at));

  return jsonb_build_object('starts_at', p_starts_at);
end;
$$;

-- Notices for the concerts the user is going to, went to or saved, newest
-- first, without the ones they closed. Last 30 days only.
create or replace function public.my_event_notices()
returns table (
  id uuid,
  event_id uuid,
  event_name text,
  kind text,
  reason text,
  starts_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.event_id, e.name, n.kind, n.reason, n.starts_at, n.created_at
  from public.event_notices n
  join public.events e on e.id = n.event_id
  where (select auth.uid()) is not null
    and n.created_at > now() - interval '30 days'
    and (
      exists (select 1 from public.event_attendance a where a.event_id = n.event_id and a.profile_id = (select auth.uid()))
      or exists (select 1 from public.event_saves s where s.event_id = n.event_id and s.profile_id = (select auth.uid()))
    )
    and not exists (
      select 1 from public.event_notice_dismissals d where d.notice_id = n.id and d.profile_id = (select auth.uid())
    )
  order by n.created_at desc
  limit 10;
$$;

revoke all on function public.cancel_event(uuid, text) from public;
revoke all on function public.postpone_event(uuid, timestamptz, text) from public;
revoke all on function public.my_event_notices() from public;
grant execute on function public.cancel_event(uuid, text) to authenticated, service_role;
grant execute on function public.postpone_event(uuid, timestamptz, text) to authenticated, service_role;
grant execute on function public.my_event_notices() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. QR: expiry, rotation, venue QR
-- ---------------------------------------------------------------------------

create table if not exists public.venue_upload_tokens (
  venue_place_id uuid primary key references public.venue_places(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

alter table public.venue_upload_tokens enable row level security;
drop policy if exists venue_upload_tokens_manage_read on public.venue_upload_tokens;
create policy venue_upload_tokens_manage_read on public.venue_upload_tokens for select to authenticated
  using (public.can_manage_venue(venue_place_id));
drop policy if exists venue_upload_tokens_manage_insert on public.venue_upload_tokens;
create policy venue_upload_tokens_manage_insert on public.venue_upload_tokens for insert to authenticated
  with check (public.can_manage_venue(venue_place_id) and created_by = (select auth.uid()));
revoke all on public.venue_upload_tokens from anon, authenticated;
grant select, insert on public.venue_upload_tokens to authenticated;
grant all on public.venue_upload_tokens to service_role;

-- The concert a QR points at, or null (expired, cancelled, nothing tonight).
create or replace function public.resolve_event_upload_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select t.event_id
      from public.event_upload_tokens t
      join public.events e on e.id = t.event_id
      where t.token = p_token
        and e.status = 'published'
        and now() <= coalesce(e.ends_at, e.starts_at + interval '6 hours') + interval '72 hours'
    ),
    (
      select e.id
      from public.venue_upload_tokens v
      join public.events e on e.venue_place_id = v.venue_place_id
      where v.token = p_token
        and e.status = 'published'
        and not e.date_tbc
        and e.starts_at <= now() + interval '6 hours'
        and coalesce(e.ends_at, e.starts_at + interval '6 hours') + interval '12 hours' >= now()
      order by e.starts_at desc
      limit 1
    )
  );
$$;

revoke all on function public.resolve_event_upload_token(text) from public;
grant execute on function public.resolve_event_upload_token(text) to anon, authenticated, service_role;

create or replace function public.rotate_event_upload_token(p_event_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  if (select auth.uid()) is null or not public.can_manage_event(p_event_id) then
    raise exception using errcode = '42501', message = 'Event management permission required';
  end if;
  insert into public.event_upload_tokens (event_id, token, created_by)
  values (p_event_id, v_token, (select auth.uid()))
  on conflict (event_id) do update set token = excluded.token, rotated_at = now();
  insert into public.event_change_log (event_id, actor_id, action)
  values (p_event_id, (select auth.uid()), 'rotate_qr');
  return v_token;
end;
$$;

create or replace function public.rotate_venue_upload_token(p_venue_place_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  if (select auth.uid()) is null or not public.can_manage_venue(p_venue_place_id) then
    raise exception using errcode = '42501', message = 'Venue management permission required';
  end if;
  insert into public.venue_upload_tokens (venue_place_id, token, created_by)
  values (p_venue_place_id, v_token, (select auth.uid()))
  on conflict (venue_place_id) do update set token = excluded.token, rotated_at = now();
  return v_token;
end;
$$;

revoke all on function public.rotate_event_upload_token(uuid) from public;
revoke all on function public.rotate_venue_upload_token(uuid) from public;
grant execute on function public.rotate_event_upload_token(uuid) to authenticated, service_role;
grant execute on function public.rotate_venue_upload_token(uuid) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
