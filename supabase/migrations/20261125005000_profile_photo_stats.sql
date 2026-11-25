begin;

-- Anyone at a concert can share its photos; their profile shows what they
-- have to be proud of.
--   * get_profile_photo_stats: a profile's followers, published photos, ♥
--     received on them (their own ♥ do not count) and concerts photographed.
-- security definer for the counts only; additive, nothing existing changes.

create or replace function public.get_profile_photo_stats(p_profile_id uuid)
returns table (followers integer, photos integer, likes integer, concerts integer)
language sql
stable
security definer
set search_path = ''
as $$
  with photos as (
    select p.id, p.event_id
    from public.posts p
    join public.media_assets m on m.id = p.media_asset_id
    where p.author_id = p_profile_id
      and p.status = 'published'
      and m.kind = 'image'
      and m.status = 'published'
      and m.deleted_at is null
  )
  select
    (select count(*)
       from public.follows f
       join public.subjects s on s.id = f.target_subject_id
      where s.type = 'user' and s.profile_id = p_profile_id)::integer,
    (select count(*) from photos)::integer,
    (select count(*)
       from public.post_likes l
      where l.post_id in (select id from photos)
        and l.profile_id <> p_profile_id)::integer,
    (select count(distinct event_id) from photos)::integer;
$$;

revoke all on function public.get_profile_photo_stats(uuid) from public;
grant execute on function public.get_profile_photo_stats(uuid) to anon, authenticated, service_role;

commit;
