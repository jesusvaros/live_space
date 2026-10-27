begin;

-- Aggregated attendee intent for the people who manage an artist or a venue.
--
-- Privacy contract (docs/seguridad.md):
--   * no function here returns a profile, a username or a row per person;
--   * every count below 10 comes back as NULL (k-anonymity, k = 10) and the
--     client shows "<10";
--   * the caller must be a member (any role) of the artist or venue, checked
--     with auth.uid() inside each function, or a platform admin.
-- event_saves, event_attendance and follows keep their own-row RLS; these
-- SECURITY DEFINER functions are the only door to the aggregates.

create or replace function public.k_anonymous_count(p_count bigint)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_count is null or p_count < 10 then null else p_count::integer end;
$$;

comment on function public.k_anonymous_count(bigint) is
  'Suppresses any aggregate bucket under 10 people (returns NULL).';

-- True when the caller belongs to the venue of the event or to one of its
-- artists. Unlike can_manage_event it does not trust events.created_by:
-- stats belong to the entity, not to whoever typed the event in.
create or replace function public.is_event_entity_member(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    public.current_user_is_admin()
    or exists (
      select 1
      from public.events e
      join public.subjects s on s.type = 'venue' and s.venue_place_id = e.venue_place_id
      where e.id = p_event_id and public.can_manage_subject(s.id, true)
    )
    or exists (
      select 1
      from public.event_artists ea
      join public.subjects s on s.type = 'artist' and s.artist_id = ea.artist_id
      where ea.event_id = p_event_id and public.can_manage_subject(s.id, true)
    )
  );
$$;

-- Stats for one artist or venue (its subject id):
--   followers      total followers (k-anonymised)
--   events         per event: saves, going, attended (each k-anonymised);
--                  events from 60 days ago onwards, at most 40
--   trend          last 30 days (Europe/Madrid), new saves and new "going"
--                  per day across the entity's events (each k-anonymised)
--   cities         top 5 primary_city among follower profiles, only
--                  cities with at least 10 followers
create or replace function public.get_entity_audience_stats(p_subject_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type public.subject_type;
  v_artist_id uuid;
  v_venue_id uuid;
  v_today date := (now() at time zone 'Europe/Madrid')::date;
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select type, artist_id, venue_place_id into v_type, v_artist_id, v_venue_id
  from public.subjects where id = p_subject_id and type in ('artist', 'venue');
  if v_type is null then
    raise exception using errcode = '22023', message = 'Stats exist only for artists and venues';
  end if;

  if not public.can_manage_subject(p_subject_id, true) then
    raise exception using errcode = '42501', message = 'Only members of this artist or venue can see its stats';
  end if;

  with entity_events as (
    select e.id, e.name, e.starts_at
    from public.events e
    where (v_type = 'venue' and e.venue_place_id = v_venue_id)
       or (v_type = 'artist' and exists (
         select 1 from public.event_artists ea where ea.event_id = e.id and ea.artist_id = v_artist_id
       ))
  ),
  listed_events as (
    select * from entity_events
    where starts_at >= now() - interval '60 days'
    order by starts_at
    limit 40
  ),
  per_event as (
    select
      le.id, le.name, le.starts_at,
      (select count(*) from public.event_saves s where s.event_id = le.id) as saves,
      (select count(*) from public.event_attendance a where a.event_id = le.id and a.status = 'going') as going,
      (select count(*) from public.event_attendance a where a.event_id = le.id and a.status = 'attended') as attended
    from listed_events le
  ),
  days as (
    select generate_series(v_today - 29, v_today, interval '1 day')::date as day
  ),
  trend as (
    select
      d.day,
      (select count(*) from public.event_saves s
        where s.event_id in (select id from entity_events)
          and (s.created_at at time zone 'Europe/Madrid')::date = d.day) as saves,
      (select count(*) from public.event_attendance a
        where a.event_id in (select id from entity_events)
          and a.status in ('going', 'attended')
          and (a.created_at at time zone 'Europe/Madrid')::date = d.day) as going
    from days d
  ),
  follower_profiles as (
    select p.primary_city
    from public.follows f
    join public.subjects fs on fs.id = f.follower_subject_id and fs.type = 'user'
    join public.profiles p on p.id = fs.profile_id
    where f.target_subject_id = p_subject_id
  ),
  cities as (
    select initcap(trim(primary_city)) as city, count(*) as followers
    from follower_profiles
    where nullif(trim(primary_city), '') is not null
    group by 1
    having count(*) >= 10
    order by 2 desc, 1
    limit 5
  )
  select jsonb_build_object(
    'subject_id', p_subject_id,
    'type', v_type,
    'k', 10,
    'followers', (select public.k_anonymous_count(count(*)) from follower_profiles),
    'totals', (
      select jsonb_build_object(
        'saves', public.k_anonymous_count(sum(saves)::bigint),
        'going', public.k_anonymous_count(sum(going)::bigint),
        'attended', public.k_anonymous_count(sum(attended)::bigint)
      ) from per_event
    ),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', id,
        'name', name,
        'starts_at', starts_at,
        'saves', public.k_anonymous_count(saves),
        'going', public.k_anonymous_count(going),
        'attended', public.k_anonymous_count(attended)
      ) order by starts_at)
      from per_event
    ), '[]'::jsonb),
    'trend', (
      select jsonb_agg(jsonb_build_object(
        'day', day,
        'saves', public.k_anonymous_count(saves),
        'going', public.k_anonymous_count(going)
      ) order by day)
      from trend
    ),
    'cities', coalesce((
      select jsonb_agg(jsonb_build_object('city', city, 'followers', followers::integer) order by followers desc, city)
      from cities
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Stats for a single event, for <EventStatsCard>: totals plus a 30-day
-- trend ending today or on the event day, whichever comes first.
create or replace function public.get_event_intent_stats(p_event_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_starts_at timestamptz;
  v_end date;
  v_result jsonb;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select starts_at into v_starts_at from public.events where id = p_event_id;
  if v_starts_at is null then
    raise exception using errcode = 'P0002', message = 'Event not found';
  end if;

  if not public.is_event_entity_member(p_event_id) then
    raise exception using errcode = '42501', message = 'Only members of the artist or venue can see these stats';
  end if;

  v_end := least((now() at time zone 'Europe/Madrid')::date, (v_starts_at at time zone 'Europe/Madrid')::date);

  with days as (
    select generate_series(v_end - 29, v_end, interval '1 day')::date as day
  ),
  trend as (
    select
      d.day,
      (select count(*) from public.event_saves s
        where s.event_id = p_event_id and (s.created_at at time zone 'Europe/Madrid')::date = d.day) as saves,
      (select count(*) from public.event_attendance a
        where a.event_id = p_event_id and a.status in ('going', 'attended')
          and (a.created_at at time zone 'Europe/Madrid')::date = d.day) as going
    from days d
  )
  select jsonb_build_object(
    'event_id', p_event_id,
    'k', 10,
    'saves', (select public.k_anonymous_count(count(*)) from public.event_saves where event_id = p_event_id),
    'going', (select public.k_anonymous_count(count(*)) from public.event_attendance where event_id = p_event_id and status = 'going'),
    'attended', (select public.k_anonymous_count(count(*)) from public.event_attendance where event_id = p_event_id and status = 'attended'),
    'trend', (
      select jsonb_agg(jsonb_build_object(
        'day', day,
        'saves', public.k_anonymous_count(saves),
        'going', public.k_anonymous_count(going)
      ) order by day)
      from trend
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.k_anonymous_count(bigint) from public;
revoke all on function public.is_event_entity_member(uuid) from public;
revoke all on function public.get_entity_audience_stats(uuid) from public;
revoke all on function public.get_event_intent_stats(uuid) from public;
grant execute on function public.k_anonymous_count(bigint) to authenticated, service_role;
grant execute on function public.is_event_entity_member(uuid) to authenticated, service_role;
grant execute on function public.get_entity_audience_stats(uuid) to authenticated, service_role;
grant execute on function public.get_event_intent_stats(uuid) to authenticated, service_role;

create index if not exists event_saves_created_idx on public.event_saves (event_id, created_at);
create index if not exists event_attendance_status_idx on public.event_attendance (event_id, status, created_at);

commit;

notify pgrst, 'reload schema';
