-- Local check of delete_my_account() and hidden_map_subjects (migrations
-- 20261110040100 and 20261110050100). Run against a THROWAWAY database with
-- every migration applied, never against production:
--
--   docker run -d --name ls-test -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.11.0.006
--   (apply supabase/migrations/*.sql in order, then)
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/delete_my_account.sql
--
-- Raises an exception (and stops) on the first broken expectation; prints
-- "delete_my_account: all checks passed" at the end. Everything runs in a
-- transaction that is rolled back. Sets both request.jwt.claims and the
-- older request.jwt.claim.sub, so auth.uid() works on either image.

begin;

-- Two people: A deletes their account, B stays.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test');
update public.profiles set username = 'persona_a', terms_accepted_at = now() where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set username = 'persona_b', terms_accepted_at = now() where id = '00000000-0000-0000-0000-00000000000b';

insert into public.venue_places (id, name, normalized_name, city, status)
values ('10000000-0000-0000-0000-000000000001', 'Sala', 'sala', 'Madrid', 'published');
insert into public.artists (id, name, normalized_name, status)
values ('20000000-0000-0000-0000-000000000001', 'Banda', 'banda', 'published');
insert into public.events (id, venue_place_id, name, normalized_name, starts_at, city, status)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Concierto', 'concierto', now(), 'Madrid', 'published');

-- A's media: an R2 video, its Cloudinary poster, a Cloudinary photo, and a
-- concert poster uploaded as the artist's manager (shared, file must stay).
insert into public.media_assets (id, owner_id, kind, event_id, cloudinary_public_id, resource_type, status, storage_provider, storage_key)
values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'video', '30000000-0000-0000-0000-000000000001',
   '0b6f3c5e-6d1a-4a51-9a0b-2f6f1d0c9e11', 'video', 'published', 'r2', 'v/2026/11/0b6f3c5e-6d1a-4a51-9a0b-2f6f1d0c9e11.mp4'),
  ('40000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'image', null,
   'live-space/pilot/users/a/poster-1', 'image', 'published', 'cloudinary', null),
  ('40000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 'image', '30000000-0000-0000-0000-000000000001',
   'live-space/pilot/users/a/photo-1', 'image', 'published', 'cloudinary', null),
  ('40000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000b', 'image', '30000000-0000-0000-0000-000000000001',
   'live-space/pilot/users/b/photo-1', 'image', 'published', 'cloudinary', null);
insert into public.media_assets (id, owner_id, kind, event_id, subject_id, cloudinary_public_id, resource_type, status)
select '40000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-00000000000a', 'image', null, s.id,
  'live-space/pilot/artists/banda/cartel', 'image', 'published'
from public.subjects s where s.artist_id = '20000000-0000-0000-0000-000000000001';

insert into public.posts (id, author_id, media_asset_id, event_id, status, source)
values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'published', 'upload'),
  ('50000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'published', 'upload'),
  ('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', '40000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000001', 'published', 'upload');

-- Likes both ways, follows both ways, blocks both ways, saves, attendance.
insert into public.post_likes (post_id, profile_id) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b'),
  ('50000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a');
insert into public.follows (follower_subject_id, target_subject_id)
select a.id, b.id from public.subjects a, public.subjects b
where a.profile_id = '00000000-0000-0000-0000-00000000000a' and b.profile_id = '00000000-0000-0000-0000-00000000000b'
union all
select b.id, a.id from public.subjects a, public.subjects b
where a.profile_id = '00000000-0000-0000-0000-00000000000a' and b.profile_id = '00000000-0000-0000-0000-00000000000b';
insert into public.user_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a');
insert into public.event_saves (event_id, profile_id) values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a');
insert into public.event_attendance (event_id, profile_id, status) values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'going')
  on conflict (event_id, profile_id) do nothing; -- posts above may have marked it already (20261112020100)

-- A viewed B's moment; A manages the artist and once decided a claim.
insert into public.post_views (post_id, viewer_key, profile_id)
values ('50000000-0000-0000-0000-000000000003', 'u:00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a');
insert into public.entity_memberships (subject_id, profile_id, role)
select s.id, '00000000-0000-0000-0000-00000000000a', 'owner' from public.subjects s where s.artist_id = '20000000-0000-0000-0000-000000000001';
insert into public.moderation_actions (actor_id, action_type, target_type, target_id, reason)
values ('00000000-0000-0000-0000-00000000000a', 'claim_approved', 'artist', '20000000-0000-0000-0000-000000000001', 'test');
insert into public.moderation_reports (reporter_id, target_type, target_id, reason)
values ('00000000-0000-0000-0000-00000000000a', 'post', '50000000-0000-0000-0000-000000000003', 'offensive');
insert into public.hidden_map_subjects (profile_id, subject_type, venue_place_id)
values ('00000000-0000-0000-0000-00000000000a', 'venue', '10000000-0000-0000-0000-000000000001');

-- Anonymous callers cannot run it.
do $$
begin
  if has_function_privilege('anon', 'public.delete_my_account()', 'execute') then
    raise exception 'anon can execute delete_my_account';
  end if;
  if not has_function_privilege('authenticated', 'public.delete_my_account()', 'execute') then
    raise exception 'authenticated cannot execute delete_my_account';
  end if;
  if has_table_privilege('authenticated', 'public.media_deletion_queue', 'select') then
    raise exception 'authenticated can read media_deletion_queue';
  end if;
end $$;

-- Without a session it refuses.
do $$
begin
  perform public.delete_my_account();
  raise exception 'delete_my_account ran without a session';
exception when insufficient_privilege then null;
end $$;

-- hidden_map_subjects: each person sees only their own rows.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true), set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
do $$
begin
  if exists (select 1 from public.hidden_map_subjects) then raise exception 'B can read A''s hidden map rows'; end if;
  begin
    insert into public.hidden_map_subjects (profile_id, subject_type, venue_place_id)
    values ('00000000-0000-0000-0000-00000000000a', 'venue', '10000000-0000-0000-0000-000000000001');
    raise exception 'B could insert a hidden map row for A';
  exception when insufficient_privilege then null;
  end;
end $$;
insert into public.hidden_map_subjects (subject_type, artist_id) values ('artist', '20000000-0000-0000-0000-000000000001');

-- A deletes the account, as A.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true), set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select public.delete_my_account() as result \gset
\echo :result
reset role;

do $$
declare
  a constant uuid := '00000000-0000-0000-0000-00000000000a';
  b constant uuid := '00000000-0000-0000-0000-00000000000b';
begin
  if exists (select 1 from auth.users where id = a) then raise exception 'auth user still there'; end if;
  if exists (select 1 from public.profiles where id = a) then raise exception 'profile still there'; end if;
  if exists (select 1 from public.subjects where profile_id = a) then raise exception 'subject still there'; end if;
  if exists (select 1 from public.posts where author_id = a) then raise exception 'posts still there'; end if;
  if exists (select 1 from public.media_assets where owner_id = a) then raise exception 'media rows still there'; end if;
  if exists (select 1 from public.post_likes where profile_id = a) then raise exception 'likes by A still there'; end if;
  if exists (select 1 from public.post_likes where post_id = '50000000-0000-0000-0000-000000000001') then raise exception 'likes on A''s post still there'; end if;
  if exists (select 1 from public.follows) then raise exception 'follows still there'; end if;
  if exists (select 1 from public.user_blocks) then raise exception 'blocks still there'; end if;
  if exists (select 1 from public.event_saves where profile_id = a) then raise exception 'saves still there'; end if;
  if exists (select 1 from public.event_attendance where profile_id = a) then raise exception 'attendance still there'; end if;
  if exists (select 1 from public.entity_memberships where profile_id = a) then raise exception 'membership still there'; end if;
  if exists (select 1 from public.moderation_reports where reporter_id = a) then raise exception 'reports by A still there'; end if;
  if exists (select 1 from public.hidden_map_subjects where profile_id = a) then raise exception 'hidden map rows of A still there'; end if;

  -- Shared things stay.
  if not exists (select 1 from public.artists where id = '20000000-0000-0000-0000-000000000001') then raise exception 'artist was deleted'; end if;
  if not exists (select 1 from public.events where id = '30000000-0000-0000-0000-000000000001') then raise exception 'event was deleted'; end if;
  if (select count(*) from public.moderation_actions where actor_id is null and reason = 'test') <> 1 then raise exception 'audit row not kept anonymised'; end if;

  -- The view of B's moment still counts, without A.
  if (select count(*) from public.post_views where post_id = '50000000-0000-0000-0000-000000000003') <> 1 then raise exception 'view count changed'; end if;
  if exists (select 1 from public.post_views where profile_id = a or viewer_key like '%' || a::text || '%') then raise exception 'view still points at A'; end if;

  -- Files queued: the R2 video and the two Cloudinary images; not the
  -- artist's poster, not B's photo.
  if (select count(*) from public.media_deletion_queue) <> 3 then raise exception 'expected 3 queued files, got %', (select count(*) from public.media_deletion_queue); end if;
  if not exists (select 1 from public.media_deletion_queue where provider = 'r2' and object_key = 'v/2026/11/0b6f3c5e-6d1a-4a51-9a0b-2f6f1d0c9e11.mp4') then raise exception 'R2 video not queued'; end if;
  if exists (select 1 from public.media_deletion_queue where object_key like '%artists%' or object_key like '%/b/%') then raise exception 'queued a file that is not A''s personal upload'; end if;

  -- B is untouched.
  if not exists (select 1 from public.profiles where id = b) then raise exception 'B was deleted'; end if;
  if not exists (select 1 from public.posts where author_id = b) then raise exception 'B''s post was deleted'; end if;
  if not exists (select 1 from public.hidden_map_subjects where profile_id = b) then raise exception 'B''s hidden map row was deleted'; end if;
end $$;

-- Calling again with the same (now dangling) session does nothing.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true), set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
begin
  if (public.delete_my_account() ->> 'deleted')::boolean then raise exception 'second call deleted something'; end if;
end $$;
reset role;

\echo 'delete_my_account: all checks passed'
rollback;
