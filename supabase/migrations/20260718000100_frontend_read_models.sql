begin;

-- Read models keep presentation-only media fields out of the catalog tables.
-- security_invoker makes every underlying RLS policy apply to the caller.
create or replace view public.v_subject_artists
with (security_invoker = true)
as
select
  s.id as subject_id,
  a.id as artist_id,
  a.id,
  a.name,
  a.normalized_name,
  a.artist_type,
  a.city,
  a.country_code,
  a.bio,
  a.genres,
  a.external_ids,
  a.external_links,
  a.status,
  a.created_by,
  a.created_at,
  a.updated_at,
  media.avatar_url
from public.artists a
join public.subjects s on s.artist_id = a.id and s.type = 'artist'
left join lateral (
  select coalesce(ma.thumbnail_url, ma.secure_url) as avatar_url
  from public.media_assets ma
  where ma.subject_id = s.id
    and ma.kind = 'image'
    and ma.status = 'published'
    and ma.deleted_at is null
  order by ma.created_at desc
  limit 1
) media on true;

create or replace view public.v_subject_venues
with (security_invoker = true)
as
select
  s.id as subject_id,
  v.id as venue_place_id,
  v.id,
  v.name,
  v.normalized_name,
  v.city,
  v.country_code,
  v.address,
  v.postal_code,
  v.capacity,
  v.venue_type,
  v.latitude,
  v.longitude,
  v.website_url,
  v.external_ids,
  v.status,
  v.created_by,
  v.created_at,
  v.updated_at,
  coalesce(media.photos, '{}'::text[]) as photos
from public.venue_places v
join public.subjects s on s.venue_place_id = v.id and s.type = 'venue'
left join lateral (
  select array_agg(coalesce(asset.thumbnail_url, asset.secure_url) order by asset.created_at desc)
    filter (where coalesce(asset.thumbnail_url, asset.secure_url) is not null) as photos
  from public.media_assets asset
  where asset.subject_id = s.id
    and asset.kind = 'image'
    and asset.status = 'published'
    and asset.deleted_at is null
) media on true;

create or replace view public.v_event_cards
with (security_invoker = true)
as
select
  e.*,
  cover.cover_image_url
from public.events e
left join lateral (
  select coalesce(ma.thumbnail_url, ma.secure_url) as cover_image_url
  from public.media_assets ma
  where ma.event_id = e.id
    and ma.kind = 'image'
    and ma.status = 'published'
    and ma.deleted_at is null
  order by ma.created_at desc
  limit 1
) cover on true;

-- Compatibility read model for the audiovisual timeline while the UI domain
-- types are migrated away from the inherited post shape.
create or replace view public.v_event_posts_with_setlist
with (security_invoker = true)
as
select
  p.id,
  p.author_id as user_id,
  author_subject.id as actor_subject_id,
  p.event_id,
  round(extract(epoch from (coalesce(p.captured_at, p.created_at) - e.starts_at)) * 1000)::bigint
    as event_offset_ms,
  song.primary_artist_id as performance_artist_id,
  p.song_id,
  song.title as song_title,
  media.secure_url as media_url,
  media.kind::text as media_type,
  media.thumbnail_url,
  p.caption,
  p.captured_at,
  null::text as capture_source,
  p.created_at,
  p.updated_at,
  p.song_id as resolved_song_id,
  song.title as resolved_song_title,
  song.primary_artist_id as resolved_performer_id,
  coalesce(profile.display_name, profile.username) as actor_name,
  profile.avatar_url as actor_image_url,
  'user'::public.subject_type as actor_type,
  jsonb_build_object(
    'id', profile.id,
    'username', profile.username,
    'display_name', profile.display_name,
    'avatar_url', profile.avatar_url
  ) as profiles
from public.posts p
join public.events e on e.id = p.event_id
join public.media_assets media on media.id = p.media_asset_id
join public.profiles profile on profile.id = p.author_id
left join public.subjects author_subject
  on author_subject.type = 'user' and author_subject.profile_id = p.author_id
left join public.songs song on song.id = p.song_id
where p.status = 'published'
  and media.status = 'published'
  and media.deleted_at is null;

create or replace function public.event_moment_buckets(p_event_id uuid)
returns table (bucket_time timestamptz, moment_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select date_trunc('second', coalesce(p.captured_at, p.created_at)) as bucket_time,
    count(*) as moment_count
  from public.posts p
  join public.media_assets media on media.id = p.media_asset_id
  where p.event_id = p_event_id
    and p.status = 'published'
    and media.status = 'published'
    and media.deleted_at is null
  group by 1
  order by 1;
$$;

create or replace function public.event_moment_buckets_filtered(
  p_event_id uuid,
  p_media_type text
)
returns table (bucket_time timestamptz, moment_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select date_trunc('second', coalesce(p.captured_at, p.created_at)) as bucket_time,
    count(*) as moment_count
  from public.posts p
  join public.media_assets media on media.id = p.media_asset_id
  where p.event_id = p_event_id
    and p.status = 'published'
    and media.status = 'published'
    and media.deleted_at is null
    and media.kind::text = p_media_type
  group by 1
  order by 1;
$$;

create or replace function public.get_or_create_user_subject(p_profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  result uuid;
begin
  if p_profile_id <> auth.uid() and not public.current_user_is_staff() then
    raise exception using errcode = '42501', message = 'Not allowed';
  end if;
  select id into result from public.subjects
    where type = 'user' and profile_id = p_profile_id;
  if result is null then
    insert into public.subjects (type, profile_id) values ('user', p_profile_id)
      on conflict (profile_id) do update set profile_id = excluded.profile_id
      returning id into result;
  end if;
  return result;
end;
$$;

create or replace function public.get_or_create_artist_subject(p_artist_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  result uuid;
begin
  select id into result from public.subjects
    where type = 'artist' and artist_id = p_artist_id;
  if result is null then
    if not public.can_manage_artist(p_artist_id) then
      raise exception using errcode = '42501', message = 'Not allowed';
    end if;
    insert into public.subjects (type, artist_id) values ('artist', p_artist_id)
      on conflict (artist_id) do update set artist_id = excluded.artist_id
      returning id into result;
  end if;
  return result;
end;
$$;

create or replace function public.get_or_create_venue_subject(p_venue_place_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  result uuid;
begin
  select id into result from public.subjects
    where type = 'venue' and venue_place_id = p_venue_place_id;
  if result is null then
    if not public.can_manage_venue(p_venue_place_id) then
      raise exception using errcode = '42501', message = 'Not allowed';
    end if;
    insert into public.subjects (type, venue_place_id) values ('venue', p_venue_place_id)
      on conflict (venue_place_id) do update set venue_place_id = excluded.venue_place_id
      returning id into result;
  end if;
  return result;
end;
$$;

revoke all on function public.get_or_create_user_subject(uuid) from public;
revoke all on function public.get_or_create_artist_subject(uuid) from public;
revoke all on function public.get_or_create_venue_subject(uuid) from public;
grant execute on function public.get_or_create_user_subject(uuid) to authenticated, service_role;
grant execute on function public.get_or_create_artist_subject(uuid) to authenticated, service_role;
grant execute on function public.get_or_create_venue_subject(uuid) to authenticated, service_role;
grant execute on function public.event_moment_buckets(uuid) to anon, authenticated, service_role;
grant execute on function public.event_moment_buckets_filtered(uuid, text) to anon, authenticated, service_role;

grant select on public.v_subject_artists to anon, authenticated, service_role;
grant select on public.v_subject_venues to anon, authenticated, service_role;
grant select on public.v_event_cards to anon, authenticated, service_role;
grant select on public.v_event_posts_with_setlist to anon, authenticated, service_role;

commit;
