begin;

create or replace view public.v_post_cards
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

grant select on public.v_post_cards to anon, authenticated, service_role;

commit;
