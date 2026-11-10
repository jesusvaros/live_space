begin;

-- Moments per concert for a page of concerts (artist and venue "Conciertos
-- pasados"): how many published moments each has and the newest one's
-- thumbnail. The app used to have no way to tell which past concerts have
-- moments short of downloading every post card.
--
-- It counts what the concert's timeline plays (v_event_posts_with_setlist:
-- published posts whose upload is published, or imported links), so the
-- number matches what opening the concert shows. Concerts without moments are
-- not returned. At most 100 ids are read per call (a page is 12).
--
-- security invoker: it reads through the caller's RLS, like the view itself.
-- Additive only: one new function.

create or replace function public.get_event_moment_stats(p_event_ids uuid[])
returns table (event_id uuid, moment_count integer, latest_thumbnail_url text)
language sql
stable
security invoker
set search_path = ''
as $$
  with ids as (
    select distinct id from unnest(p_event_ids[1:100]) as id
  ),
  moments as (
    select
      t.event_id,
      t.created_at,
      coalesce(t.thumbnail_url, case when t.media_type = 'image' then t.media_url end) as thumb
    from public.v_event_posts_with_setlist t
    join ids on ids.id = t.event_id
  )
  select
    m.event_id,
    count(*)::integer as moment_count,
    (array_agg(m.thumb order by m.created_at desc) filter (where m.thumb like 'https://%'))[1]
      as latest_thumbnail_url
  from moments m
  group by m.event_id;
$$;

revoke all on function public.get_event_moment_stats(uuid[]) from public;
grant execute on function public.get_event_moment_stats(uuid[]) to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';
