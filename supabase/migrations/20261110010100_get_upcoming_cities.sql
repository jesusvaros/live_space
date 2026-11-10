begin;

-- Cities with published concerts in a window, for the home's city picker and
-- "nearest city" logic. Until now the app downloaded every concert of every
-- city (~2 MB) just to derive this list; this returns a dozen rows.
--
-- The city is the event's own city, falling back to its venue's (the same
-- rule the app uses), trimmed; names that only differ in case are merged
-- under the most common spelling. latitude/longitude are the average of the
-- venues' coordinates: a representative point of where the concerts are.
--
-- security invoker: it reads through the caller's RLS, which already lets
-- anyone read published events and venues. Additive only: one new function.

create or replace function public.get_upcoming_cities(p_from timestamptz, p_to timestamptz)
returns table (city text, event_count integer, latitude double precision, longitude double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  with rows as (
    select
      coalesce(nullif(btrim(e.city), ''), nullif(btrim(v.city), '')) as name,
      v.latitude::double precision as lat,
      v.longitude::double precision as lng
    from public.events e
    left join public.venue_places v on v.id = e.venue_place_id
    where e.status = 'published'
      and e.starts_at >= p_from
      and e.starts_at <= p_to
  ),
  named as (
    select lower(name) as key, name, lat, lng from rows where name is not null
  ),
  spelling as (
    select distinct on (key) key, name
    from (select key, name, count(*) as n from named group by key, name) s
    order by key, n desc, name
  )
  select sp.name as city, count(*)::integer as event_count, avg(n.lat) as latitude, avg(n.lng) as longitude
  from named n
  join spelling sp on sp.key = n.key
  group by sp.name
  order by count(*) desc, sp.name;
$$;

revoke all on function public.get_upcoming_cities(timestamptz, timestamptz) from public;
grant execute on function public.get_upcoming_cities(timestamptz, timestamptz) to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';
