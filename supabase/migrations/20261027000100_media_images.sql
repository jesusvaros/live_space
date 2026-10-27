begin;

-- Editorial images (scraped posters, artist photos from a catalogue, curated
-- venue photos). They live on the catalog rows, apart from media_assets,
-- which holds what fans upload: media_assets requires an owner profile and the
-- product shows fan photos first. These columns only fill the empty state.
--
-- image_source values: 'source' (the venue/ticketing page or API),
-- 'deezer', 'wikidata', 'manual'. A 'manual' image is never overwritten by the
-- pipeline.

alter table public.events
  add column if not exists image_url text,
  add column if not exists image_source text,
  add column if not exists tour_name text,
  add column if not exists room text;

alter table public.artists
  add column if not exists image_url text,
  add column if not exists image_source text,
  add column if not exists image_checked_at timestamptz;

alter table public.venue_places
  add column if not exists image_url text,
  add column if not exists image_source text;

comment on column public.events.image_url is 'Event poster from the source; fan photos take precedence in v_event_cards.';
comment on column public.events.image_source is 'source | manual';
comment on column public.events.tour_name is 'Tour or show name split from the source title ("Morat - YEM World Tour").';
comment on column public.events.room is 'Room inside the venue when it has several (Jamboree / The Jazz Room).';
comment on column public.artists.image_url is 'Artist photo from a catalogue (Deezer, Wikidata) or set by hand.';
comment on column public.artists.image_source is 'deezer | wikidata | manual';
comment on column public.artists.image_checked_at is 'Last catalogue lookup, so artists without a match are not searched every day.';
comment on column public.venue_places.image_url is 'Curated venue photo; fan photos take precedence.';
comment on column public.venue_places.image_source is 'manual | wikidata | source';

create index if not exists artists_image_pending_idx
  on public.artists (image_checked_at nulls first)
  where image_url is null;

-- Read models: every existing column keeps its name, order and meaning except
-- that the cover/avatar now falls back to the editorial image. New columns go
-- last, as CREATE OR REPLACE VIEW requires. v_event_cards lists the events
-- columns explicitly because `e.*` would now expand to the new columns
-- before cover_image_url.

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
  coalesce(media.avatar_url, a.image_url) as avatar_url,
  a.image_url,
  a.image_source,
  media.avatar_url as fan_avatar_url
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
  coalesce(media.photos, '{}'::text[]) as photos,
  coalesce(media.photos[1], v.image_url) as cover_image_url,
  v.image_url,
  v.image_source
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
  e.id,
  e.venue_place_id,
  e.name,
  e.normalized_name,
  e.description,
  e.starts_at,
  e.ends_at,
  e.timezone,
  e.city,
  e.address,
  e.latitude,
  e.longitude,
  e.genres,
  e.is_free,
  e.price_tiers,
  e.ticket_url,
  e.source_url,
  e.source_id,
  e.source_external_id,
  e.status,
  e.created_by,
  e.published_at,
  e.created_at,
  e.updated_at,
  coalesce(cover.cover_image_url, e.image_url) as cover_image_url,
  e.image_url,
  e.image_source,
  e.tour_name,
  e.room,
  cover.cover_image_url as fan_cover_image_url
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

commit;

notify pgrst, 'reload schema';
