-- Local check of 20261112020100_mark_attendance_on_post. Run against a
-- THROWAWAY database with every migration applied (see
-- delete_my_account.sql for the docker setup), never production. Rolled back.

begin;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'c@example.test');
insert into public.profiles (id) values ('00000000-0000-0000-0000-0000000000c1') on conflict do nothing;
insert into public.venue_places (id, name, normalized_name, city) values
  ('00000000-0000-0000-0000-00000000aaa1', 'Sala', 'sala', 'Sevilla');
insert into public.events (id, venue_place_id, name, normalized_name, starts_at, city, status) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000aaa1', 'Pasado', 'pasado', now() - interval '3 days', 'Sevilla', 'published'),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000aaa1', 'Futuro', 'futuro', now() + interval '3 days', 'Sevilla', 'published'),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000aaa1', 'Interesado', 'interesado', now() - interval '1 day', 'Sevilla', 'published');
insert into public.event_attendance (event_id, profile_id, status) values
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-0000000000c1', 'interested');

insert into public.media_assets (id, owner_id, kind, event_id, cloudinary_public_id, resource_type, status, storage_provider)
select ('00000000-0000-0000-0000-0000000f000' || n)::uuid, '00000000-0000-0000-0000-0000000000c1', 'image',
  ('00000000-0000-0000-0000-00000000e00' || n)::uuid, 'live-space/test/c/photo-' || n, 'image', 'published', 'cloudinary'
from generate_series(1, 3) n;
insert into public.posts (author_id, media_asset_id, event_id, status, source)
select '00000000-0000-0000-0000-0000000000c1', ('00000000-0000-0000-0000-0000000f000' || n)::uuid,
  ('00000000-0000-0000-0000-00000000e00' || n)::uuid, 'published', 'upload'
from generate_series(1, 3) n;

do $$
declare s text;
begin
  select status::text into s from public.event_attendance where event_id = '00000000-0000-0000-0000-00000000e001' and profile_id = '00000000-0000-0000-0000-0000000000c1';
  if s is distinct from 'attended' then raise exception 'past concert: expected attended, got %', s; end if;
  select status::text into s from public.event_attendance where event_id = '00000000-0000-0000-0000-00000000e002' and profile_id = '00000000-0000-0000-0000-0000000000c1';
  if s is distinct from 'going' then raise exception 'future concert: expected going, got %', s; end if;
  select status::text into s from public.event_attendance where event_id = '00000000-0000-0000-0000-00000000e003' and profile_id = '00000000-0000-0000-0000-0000000000c1';
  if s is distinct from 'attended' then raise exception 'interested → expected attended, got %', s; end if;
  raise notice 'mark_attendance_on_post: all checks passed';
end $$;

rollback;
