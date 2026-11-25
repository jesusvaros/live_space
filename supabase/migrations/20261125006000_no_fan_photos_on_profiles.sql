begin;

-- Artists and venues keep their own face: a fan's moment never becomes their
-- avatar or cover (it did since 20261028050100_fan_photo_covers.sql).
-- Priority now, per entity:
--   1. photo uploaded to the profile itself (subject media)
--   2. image set by hand (image_source = 'manual')
--   3. catalogue or source image (Deezer, poster, venue website)
-- Fan photos stay in the concert's «Fotos» and in Momentos.
--
-- Same columns, names and order as before (CREATE OR REPLACE VIEW);
-- avatar_credit / cover_credit stay, always null now. Both views remain
-- security_invoker.

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
  coalesce(
    media.avatar_url,
    case when a.image_source = 'manual' then a.image_url end,
    a.image_url
  ) as avatar_url,
  a.image_url,
  a.image_source,
  media.avatar_url as fan_avatar_url,
  null::text as avatar_credit
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
  coalesce(
    media.photos[1],
    case when v.image_source = 'manual' then v.image_url end,
    v.image_url
  ) as cover_image_url,
  v.image_url,
  v.image_source,
  null::text as cover_credit
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

commit;
