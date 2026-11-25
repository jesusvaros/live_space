begin;

-- A concert's cover is always its original poster, never a fan's photo (fan
-- photos live in its «Fotos» and in Momentos). Same for a festival's cover.
-- Same columns, names and order (CREATE OR REPLACE VIEW): fan_cover_image_url
-- and the festival's cover_credit stay, always null now.

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
  e.image_url as cover_image_url,
  e.image_url,
  e.image_source,
  e.tour_name,
  e.room,
  null::text as fan_cover_image_url
from public.events e;

create or replace view public.v_post_cards
with (security_invoker = true)
as
select
  timeline.id,
  timeline.user_id,
  timeline.actor_subject_id,
  timeline.event_id,
  timeline.event_offset_ms,
  timeline.performance_artist_id,
  timeline.song_id,
  timeline.song_title,
  timeline.media_url,
  timeline.media_type,
  timeline.thumbnail_url,
  timeline.caption,
  timeline.captured_at,
  timeline.capture_source,
  timeline.created_at,
  timeline.updated_at,
  timeline.resolved_song_id,
  timeline.resolved_song_title,
  timeline.resolved_performer_id,
  timeline.actor_name,
  timeline.actor_image_url,
  timeline.actor_type,
  timeline.profiles,
  timeline.source,
  timeline.external_url,
  timeline.external_id,
  timeline.external_author_handle,
  timeline.external_author_name,
  timeline.external_author_url,
  timeline.external_published_at,
  jsonb_strip_nulls(jsonb_build_object(
    'id', event.id,
    'name', event.name,
    'city', event.city,
    'address', event.address,
    'starts_at', event.starts_at,
    'ends_at', event.ends_at,
    'share_tag', event.share_tag,
    'cover_image_url', event.image_url,
    'venue_place', case
      when venue.id is null then null::jsonb
      else jsonb_build_object(
        'id', venue.id,
        'name', venue.name,
        'city', venue.city,
        'address', venue.address,
        'latitude', venue.latitude,
        'longitude', venue.longitude
      )
    end
  )) as events
from public.v_event_posts_with_setlist timeline
join public.events event on event.id = timeline.event_id
left join public.venue_places venue on venue.id = event.venue_place_id;

create or replace view public.v_subject_festivals
with (security_invoker = true)
as
select
  s.id as subject_id,
  f.id as festival_id,
  f.id,
  f.name,
  f.edition_year,
  f.starts_on,
  f.ends_on,
  f.city,
  f.venue_place_id,
  f.description,
  f.website_url,
  f.instagram_url,
  f.status,
  f.image_url as cover_image_url,
  f.image_url,
  null::text as cover_credit,
  coalesce(sets.total, 0) as set_count
from public.festivals f
join public.subjects s on s.festival_id = f.id and s.type = 'festival'
left join lateral (
  select count(*)::integer as total
  from public.events e
  where e.festival_id = f.id and e.status = 'published'
) sets on true;

commit;
