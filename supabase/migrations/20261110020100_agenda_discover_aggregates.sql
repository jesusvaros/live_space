begin;

-- Small aggregates for the screens that downloaded every concert just to
-- count things in the browser:
--   * get_agenda_genres / get_agenda_suggestions: the agenda setup (/empezar)
--     read ~1.1 MB of concert cards of every city to rank genres and pick
--     artists and venues to follow.
--   * get_discover_artist_stats: Explorar's artists tab read ~224 KB of
--     concerts to count who plays, when, near whom and in which styles.
-- Each returns the counts the screen ranks, a few KB at most.
--
-- The rules match the app's: a concert's city is its own, falling back to its
-- venue's, trimmed and compared without case; genres are an artist's own.
--
-- security invoker: they read through the caller's RLS, which already lets
-- anyone read published events, venues, artists and lineups. Additive only:
-- three new functions, nothing existing changes.

-- Genres of the concerts in the window, most common first: in p_city first
-- (local_count) when given, then everywhere (total_count). A concert counts
-- once per genre whatever the number of its artists who play it; the label is
-- the genre's most common spelling.
create or replace function public.get_agenda_genres(
  p_from timestamptz,
  p_to timestamptz,
  p_city text default null,
  p_limit integer default 24
)
returns table (genre text, local_count integer, total_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with concerts as (
    select
      e.id,
      lower(coalesce(nullif(btrim(e.city), ''), nullif(btrim(v.city), ''))) as city
    from public.events e
    left join public.venue_places v on v.id = e.venue_place_id
    where e.status = 'published'
      and e.starts_at >= p_from
      and e.starts_at <= p_to
  ),
  tagged as (
    select c.id, c.city, btrim(g.genre) as spelling, lower(btrim(g.genre)) as key
    from concerts c
    join public.event_artists ea on ea.event_id = c.id
    join public.artists a on a.id = ea.artist_id
    cross join lateral unnest(a.genres) as g(genre)
    where btrim(coalesce(g.genre, '')) <> ''
  ),
  per_concert as (
    select distinct id, city, key from tagged
  ),
  spelling as (
    select distinct on (key) key, spelling
    from (select key, spelling, count(*) as n from tagged group by key, spelling) s
    order by key, n desc, spelling
  )
  select
    sp.spelling as genre,
    (count(*) filter (where pc.city = lower(btrim(p_city))))::integer as local_count,
    count(*)::integer as total_count
  from per_concert pc
  join spelling sp on sp.key = pc.key
  group by sp.key, sp.spelling
  order by 2 desc, 3 desc, sp.spelling
  limit least(greatest(coalesce(p_limit, 24), 0), 200);
$$;

-- Who to follow in p_city: the artists who play most in the window (a concert
-- with any of the visitor's genres, p_tastes, weighs six times more) and the
-- venues with most concerts. kind is 'artist' or 'venue'; score is what the
-- list is ordered by (for venues, the number of concerts).
create or replace function public.get_agenda_suggestions(
  p_from timestamptz,
  p_to timestamptz,
  p_city text,
  p_tastes text[] default '{}',
  p_artists integer default 10,
  p_venues integer default 6
)
returns table (kind text, id uuid, concerts integer, score integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with tastes as (
    select distinct lower(btrim(t)) as key
    from unnest(coalesce(p_tastes, '{}')) as t
    where btrim(coalesce(t, '')) <> ''
  ),
  concerts as (
    select e.id, e.venue_place_id
    from public.events e
    left join public.venue_places v on v.id = e.venue_place_id
    where e.status = 'published'
      and e.starts_at >= p_from
      and e.starts_at <= p_to
      and lower(coalesce(nullif(btrim(e.city), ''), nullif(btrim(v.city), ''))) = lower(btrim(p_city))
  ),
  liked as (
    select
      c.id,
      exists (
        select 1
        from public.event_artists ea
        join public.artists a on a.id = ea.artist_id
        cross join lateral unnest(a.genres) as g(genre)
        where ea.event_id = c.id
          and lower(btrim(g.genre)) in (select key from tastes)
      ) as matches
    from concerts c
  ),
  top_artists as (
    select ea.artist_id as id, count(*)::integer as concerts, sum(case when l.matches then 6 else 1 end)::integer as score
    from liked l
    join public.event_artists ea on ea.event_id = l.id
    group by ea.artist_id
    order by score desc, concerts desc, ea.artist_id
    limit least(greatest(coalesce(p_artists, 10), 0), 50)
  ),
  top_venues as (
    select c.venue_place_id as id, count(*)::integer as concerts
    from concerts c
    where c.venue_place_id is not null
    group by c.venue_place_id
    order by concerts desc, c.venue_place_id
    limit least(greatest(coalesce(p_venues, 6), 0), 50)
  )
  select * from (
    select 'artist'::text as kind, ta.id, ta.concerts, ta.score from top_artists ta
    union all
    select 'venue'::text, tv.id, tv.concerts, tv.concerts from top_venues tv
  ) s
  order by s.kind, s.score desc, s.concerts desc, s.id;
$$;

-- Everyone who plays in the window, with what Explorar ranks them by: total
-- concerts, those up to p_week_end, those within p_radius_km of the visitor
-- (when p_lat/p_lng are given) and their styles (the artist's own genres, or
-- the concert's when the artist has none). photo: the artist has an image.
create or replace function public.get_discover_artist_stats(
  p_from timestamptz,
  p_to timestamptz,
  p_week_end timestamptz,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_km double precision default 50
)
returns table (id uuid, name text, photo boolean, total integer, week integer, near integer, styles text[])
language sql
stable
security invoker
set search_path = ''
as $$
  with plays as (
    select
      a.id,
      a.name,
      coalesce(a.image_url, '') <> '' as photo,
      e.starts_at <= p_week_end as this_week,
      case
        when p_lat is null or p_lng is null then false
        when coalesce(e.latitude, v.latitude) is null or coalesce(e.longitude, v.longitude) is null then false
        else 2 * 6371 * asin(least(1, sqrt(
          power(sin(radians(coalesce(e.latitude, v.latitude)::double precision - p_lat) / 2), 2)
          + cos(radians(p_lat)) * cos(radians(coalesce(e.latitude, v.latitude)::double precision))
            * power(sin(radians(coalesce(e.longitude, v.longitude)::double precision - p_lng) / 2), 2)
        ))) <= coalesce(p_radius_km, 50)
      end as nearby,
      case when cardinality(a.genres) > 0 then a.genres else e.genres end as styles
    from public.events e
    left join public.venue_places v on v.id = e.venue_place_id
    join public.event_artists ea on ea.event_id = e.id
    join public.artists a on a.id = ea.artist_id
    where e.status = 'published'
      and e.starts_at >= p_from
      and e.starts_at <= p_to
  ),
  counts as (
    select
      p.id,
      min(p.name) as name,
      bool_or(p.photo) as photo,
      count(*)::integer as total,
      (count(*) filter (where p.this_week))::integer as week,
      (count(*) filter (where p.nearby))::integer as near
    from plays p
    group by p.id
  ),
  artist_styles as (
    select distinct p.id, s.style
    from plays p
    cross join lateral unnest(p.styles) as s(style)
    where coalesce(s.style, '') <> ''
  ),
  -- Explorar only makes a row of a style with at least three artists.
  shelf_styles as (
    select style from artist_styles group by style having count(*) >= 3
  ),
  styles as (
    select ast.id, array_agg(ast.style order by ast.style) as styles
    from artist_styles ast
    group by ast.id
  )
  select c.id, c.name, c.photo, c.total, c.week, c.near, coalesce(st.styles, '{}') as styles
  from counts c
  left join styles st on st.id = c.id
  -- Leave out who could not appear anywhere: nothing this week, nothing
  -- nearby and no style with a row of its own.
  where c.week > 0
     or c.near > 0
     or exists (
       select 1 from artist_styles ast join shelf_styles ss on ss.style = ast.style where ast.id = c.id
     )
  order by c.total desc, c.id;
$$;

revoke all on function public.get_agenda_genres(timestamptz, timestamptz, text, integer) from public;
revoke all on function public.get_agenda_suggestions(timestamptz, timestamptz, text, text[], integer, integer) from public;
revoke all on function public.get_discover_artist_stats(timestamptz, timestamptz, timestamptz, double precision, double precision, double precision) from public;
grant execute on function public.get_agenda_genres(timestamptz, timestamptz, text, integer) to anon, authenticated, service_role;
grant execute on function public.get_agenda_suggestions(timestamptz, timestamptz, text, text[], integer, integer) to anon, authenticated, service_role;
grant execute on function public.get_discover_artist_stats(timestamptz, timestamptz, timestamptz, double precision, double precision, double precision) to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';
