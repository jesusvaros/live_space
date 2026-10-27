-- Clips imported from Instagram, TikTok and YouTube, plus the per-event share
-- tag (#LSRIV29) that files them into their concert.
--
-- Live Space never downloads or re-hosts these videos: a post keeps the link,
-- the oEmbed metadata and plays the original through the platform's embed.
-- Additive: uploads keep working unchanged; imported posts land in `review`
-- like any upload and go through the same moderation/report flow.

begin;

-- ---------------------------------------------------------------------------
-- 1. Event share tag
-- ---------------------------------------------------------------------------

alter table public.events add column if not exists share_tag text;

-- Venue code: the first three letters of the venue name once accents, symbols
-- and filler words ("Sala", "La", "The"...) are gone. "La Riviera" -> RIV,
-- "Sala El Sol" -> SOL, "WiZink Center" -> WIZ. Kept in sync with
-- src/features/socialImport/eventTag.ts (venueCode).
create or replace function public.event_share_tag_venue_code(p_venue_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text;
  word text;
  letters text := '';
begin
  cleaned := translate(
    upper(coalesce(p_venue_name, '')),
    'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
    'AAAAAEEEEIIIIOOOOOUUUUNC'
  );
  cleaned := regexp_replace(cleaned, '[^A-Z ]+', ' ', 'g');
  foreach word in array regexp_split_to_array(trim(cleaned), '\s+') loop
    if word = '' or word = any (array[
      'LA', 'EL', 'LOS', 'LAS', 'L', 'SALA', 'THE', 'DE', 'DEL', 'Y', 'AND', 'CLUB'
    ]) then
      continue;
    end if;
    letters := letters || word;
    exit when length(letters) >= 3;
  end loop;
  return rpad(left(letters, 3), 3, 'X');
end;
$$;

-- Disambiguator: '' for the first event, then B, C, D... (no I, O or S, so a
-- tag never reads like a digit or like the song suffix "s07"), then BB, BC...
create or replace function public.event_share_tag_suffix(p_index integer)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  alphabet constant text := 'BCDEFGHJKLMNPQRTUVWXYZ';
  size constant integer := length(alphabet);
  n integer := p_index;
begin
  if n <= 0 then
    return '';
  end if;
  if n <= size then
    return substr(alphabet, n, 1);
  end if;
  n := n - size - 1;
  return substr(alphabet, (n / size) % size + 1, 1) || substr(alphabet, n % size + 1, 1);
end;
$$;

-- First free tag for an event: LS + venue code + day of month in the event's
-- timezone + disambiguator. Deterministic for a given database state; the
-- backfill below walks events by (starts_at, id) so reruns give the same tags.
create or replace function public.next_event_share_tag(
  p_venue_place_id uuid,
  p_starts_at timestamptz,
  p_timezone text,
  p_event_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  venue_name text;
  base text;
  candidate text;
  attempt integer := 0;
begin
  select v.name into venue_name from public.venue_places v where v.id = p_venue_place_id;
  base := 'LS'
    || public.event_share_tag_venue_code(venue_name)
    || to_char(p_starts_at at time zone coalesce(nullif(p_timezone, ''), 'Europe/Madrid'), 'DD');
  loop
    candidate := base || public.event_share_tag_suffix(attempt);
    exit when not exists (
      select 1 from public.events e
      where e.share_tag = candidate
        and (p_event_id is null or e.id <> p_event_id)
    );
    attempt := attempt + 1;
    if attempt > 400 then
      raise exception 'No free share tag for %', base;
    end if;
  end loop;
  return candidate;
end;
$$;

revoke all on function public.next_event_share_tag(uuid, timestamptz, text, uuid) from public, anon, authenticated;

create or replace function public.assign_event_share_tag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.share_tag is null then
    new.share_tag := public.next_event_share_tag(new.venue_place_id, new.starts_at, new.timezone, new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.assign_event_share_tag() from public, anon, authenticated;

-- Backfill without touching updated_at (the scrapers read it).
alter table public.events disable trigger events_set_updated_at;
do $$
declare
  event_row record;
begin
  for event_row in
    select e.id, e.venue_place_id, e.starts_at, e.timezone
    from public.events e
    where e.share_tag is null
    order by e.starts_at, e.id
  loop
    update public.events
    set share_tag = public.next_event_share_tag(
      event_row.venue_place_id, event_row.starts_at, event_row.timezone, event_row.id
    )
    where id = event_row.id;
  end loop;
end;
$$;
alter table public.events enable trigger events_set_updated_at;

alter table public.events
  add constraint events_share_tag_format check (share_tag is null or share_tag ~ '^LS[A-Z]{3}[0-9]{2}[A-Z]{0,2}$');
create unique index if not exists events_share_tag_key on public.events (share_tag);

-- Once printed on a poster the tag must not move, so it is only assigned when
-- missing (new events, or an editor clearing it on purpose).
drop trigger if exists events_assign_share_tag on public.events;
create trigger events_assign_share_tag
before insert or update of share_tag on public.events
for each row execute function public.assign_event_share_tag();

-- ---------------------------------------------------------------------------
-- 2. External posts
-- ---------------------------------------------------------------------------

alter table public.posts
  add column if not exists source text not null default 'upload',
  add column if not exists external_url text,
  add column if not exists external_id text,
  add column if not exists external_embed_html text,
  add column if not exists external_author_handle text,
  add column if not exists external_author_name text,
  add column if not exists external_author_url text,
  add column if not exists external_thumbnail_url text,
  add column if not exists external_published_at timestamptz,
  add column if not exists match_method text;

alter table public.posts alter column media_asset_id drop not null;

alter table public.posts
  add constraint posts_source_check check (source in ('upload', 'instagram', 'tiktok', 'youtube')),
  add constraint posts_match_method_check check (match_method is null or match_method in ('tag', 'time_text', 'manual')),
  -- An upload owns a Cloudinary asset; an import owns only a link.
  add constraint posts_source_shape check (
    (source = 'upload' and media_asset_id is not null and external_url is null)
    or (source <> 'upload' and media_asset_id is null and external_url is not null and external_id is not null)
  ),
  -- Only canonical links of the three platforms (see src/features/socialImport/socialUrl.ts):
  -- no tracking parameters, so the same clip always dedupes to the same row.
  add constraint posts_external_url_canonical check (
    external_url is null
    or (source = 'youtube' and external_url ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$')
    or (source = 'tiktok' and external_url ~ '^https://www\.tiktok\.com/@[A-Za-z0-9._-]{1,64}/(video|photo)/[0-9]{6,25}$')
    or (source = 'instagram' and external_url ~ '^https://www\.instagram\.com/(p|reel)/[A-Za-z0-9_-]{5,64}/$')
  ),
  add constraint posts_external_thumbnail_https check (
    external_thumbnail_url is null or external_thumbnail_url ~ '^https://'
  ),
  add constraint posts_external_author_url_https check (
    external_author_url is null or external_author_url ~ '^https://'
  ),
  -- The importer does not own a third party's video, so it can never be
  -- licensed for reuse (20261028010200_moment_reuse_licence.sql).
  add constraint posts_external_no_reuse check (source = 'upload' or allow_reuse = false),
  add constraint posts_external_sizes check (
    coalesce(length(external_embed_html), 0) <= 20000
    and coalesce(length(external_author_handle), 0) <= 120
    and coalesce(length(external_author_name), 0) <= 200
    and coalesce(length(caption), 0) <= 4000
  );

-- Dedupe: one row per clip, whoever imports it first.
create unique index if not exists posts_external_url_key on public.posts (external_url) where external_url is not null;
create index if not exists posts_source_event_idx on public.posts (event_id, source) where source <> 'upload';

-- Inserts: the upload branch is the previous policy unchanged. An import has
-- no asset to prove ownership of, so it must enter as `review` and wait for
-- moderation (posts_update_own already keeps authors from publishing).
drop policy if exists posts_create on public.posts;
create policy posts_create on public.posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      (
        source = 'upload'
        and exists (select 1 from public.media_assets m where m.id = media_asset_id and m.owner_id = (select auth.uid()) and m.event_id = event_id)
      )
      or (
        source <> 'upload'
        and media_asset_id is null
        and status = 'review'
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Read models: imported posts join the timeline, Momentos and buckets
-- ---------------------------------------------------------------------------

drop view if exists public.v_post_cards;

-- Same columns as before (an import fills media_url with its link and plays as
-- a video), plus the external fields appended at the end.
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
  coalesce(media.secure_url, p.external_url) as media_url,
  coalesce(media.kind::text, 'video') as media_type,
  coalesce(media.thumbnail_url, p.external_thumbnail_url) as thumbnail_url,
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
  ) as profiles,
  p.source,
  p.external_url,
  p.external_id,
  p.external_author_handle,
  p.external_author_name,
  p.external_author_url,
  p.external_published_at
from public.posts p
join public.events e on e.id = p.event_id
left join public.media_assets media on media.id = p.media_asset_id
join public.profiles profile on profile.id = p.author_id
left join public.subjects author_subject
  on author_subject.type = 'user' and author_subject.profile_id = p.author_id
left join public.songs song on song.id = p.song_id
where p.status = 'published'
  and (
    (p.source = 'upload' and media.status = 'published' and media.deleted_at is null)
    or (p.source <> 'upload' and p.media_asset_id is null)
  );

create view public.v_post_cards
with (security_invoker = true)
as
select
  timeline.*,
  jsonb_strip_nulls(jsonb_build_object(
    'id', event.id,
    'name', event.name,
    'city', event.city,
    'address', event.address,
    'starts_at', event.starts_at,
    'ends_at', event.ends_at,
    'share_tag', event.share_tag,
    'cover_image_url', cover.cover_image_url,
    'venue_place', case when venue.id is null then null else jsonb_build_object(
      'id', venue.id,
      'name', venue.name,
      'city', venue.city,
      'address', venue.address,
      'latitude', venue.latitude,
      'longitude', venue.longitude
    ) end
  )) as events
from public.v_event_posts_with_setlist timeline
join public.events event on event.id = timeline.event_id
left join public.venue_places venue on venue.id = event.venue_place_id
left join lateral (
  select coalesce(asset.thumbnail_url, asset.secure_url) as cover_image_url
  from public.media_assets asset
  where asset.event_id = event.id
    and asset.kind = 'image'
    and asset.status = 'published'
    and asset.deleted_at is null
  order by asset.created_at desc
  limit 1
) cover on true;

grant select on public.v_event_posts_with_setlist to anon, authenticated, service_role;
grant select on public.v_post_cards to anon, authenticated, service_role;

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
  left join public.media_assets media on media.id = p.media_asset_id
  where p.event_id = p_event_id
    and p.status = 'published'
    and (
      (p.source = 'upload' and media.status = 'published' and media.deleted_at is null)
      or (p.source <> 'upload' and p.media_asset_id is null)
    )
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
  left join public.media_assets media on media.id = p.media_asset_id
  where p.event_id = p_event_id
    and p.status = 'published'
    and (
      (p.source = 'upload' and media.status = 'published' and media.deleted_at is null)
      or (p.source <> 'upload' and p.media_asset_id is null)
    )
    and coalesce(media.kind::text, 'video') = p_media_type
  group by 1
  order by 1;
$$;

commit;

notify pgrst, 'reload schema';
