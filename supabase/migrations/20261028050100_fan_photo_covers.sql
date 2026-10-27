begin;

-- Fan photos as the face of artists and venues, credited to their author.
--
-- In the local scene the catalogues (Deezer, posters) rarely have a good
-- picture, while the audience photographs every concert. A published photo
-- moment whose author keeps allow_reuse on (licencia-momentos.md) becomes
-- the cover of the venue where it was taken and of the artist who played,
-- with "@username" as credit.
--
-- Priority, per entity:
--   1. photo uploaded to the profile itself (subject media, unchanged)
--   2. image set by hand (image_source = 'manual')
--   3. latest fan moment with reuse allowed
--   4. catalogue or source image (Deezer, poster, venue website)
--
-- Only moments whose author profile is public are used: the credit must be
-- printable, and a private profile never surfaces outside its own posts.
-- An artist takes photos only from bills it headlines or plays alone, so a
-- support act never wears the headliner's photo.
--
-- Existing columns keep name, order and meaning; new columns go last, as
-- CREATE OR REPLACE VIEW requires. Both views stay security_invoker, so the
-- posts and profiles read policies still apply to every caller.

create index if not exists posts_reusable_media_idx
  on public.posts (event_id, created_at desc)
  where status = 'published' and allow_reuse;

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
    moment.image_url,
    a.image_url
  ) as avatar_url,
  a.image_url,
  a.image_source,
  media.avatar_url as fan_avatar_url,
  case
    when media.avatar_url is null
      and (a.image_source is distinct from 'manual' or a.image_url is null)
      then moment.credit
  end as avatar_credit
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
) media on true
left join lateral (
  select
    coalesce(ma.thumbnail_url, ma.secure_url) as image_url,
    coalesce('@' || nullif(pr.username::text, ''), nullif(pr.display_name, '')) as credit
  from public.event_artists ea
  join public.posts p on p.event_id = ea.event_id
  join public.media_assets ma on ma.id = p.media_asset_id
  join public.profiles pr on pr.id = p.author_id
  where ea.artist_id = a.id
    and (
      ea.is_headliner
      or not exists (
        select 1 from public.event_artists other
        where other.event_id = ea.event_id and other.artist_id <> ea.artist_id
      )
    )
    and p.status = 'published'
    and p.allow_reuse
    and ma.kind = 'image'
    and ma.status = 'published'
    and ma.deleted_at is null
    and not pr.is_private
    and coalesce(ma.thumbnail_url, ma.secure_url) is not null
  order by p.created_at desc
  limit 1
) moment on true;

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
    moment.image_url,
    v.image_url
  ) as cover_image_url,
  v.image_url,
  v.image_source,
  case
    when media.photos[1] is null
      and (v.image_source is distinct from 'manual' or v.image_url is null)
      then moment.credit
  end as cover_credit
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
) media on true
left join lateral (
  select
    coalesce(ma.thumbnail_url, ma.secure_url) as image_url,
    coalesce('@' || nullif(pr.username::text, ''), nullif(pr.display_name, '')) as credit
  from public.events e
  join public.posts p on p.event_id = e.id
  join public.media_assets ma on ma.id = p.media_asset_id
  join public.profiles pr on pr.id = p.author_id
  where e.venue_place_id = v.id
    and p.status = 'published'
    and p.allow_reuse
    and ma.kind = 'image'
    and ma.status = 'published'
    and ma.deleted_at is null
    and not pr.is_private
    and coalesce(ma.thumbnail_url, ma.secure_url) is not null
  order by p.created_at desc
  limit 1
) moment on true;

commit;

notify pgrst, 'reload schema';
