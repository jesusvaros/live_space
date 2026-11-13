-- Local check of the analytics schema (migrations 20261113000100_analytics_core
-- and 20261113000200_analytics_live_space). Run against a THROWAWAY database
-- with every migration applied, never against production:
--
--   docker run -d --name ls-test -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.11.0.006
--   (apply supabase/migrations/*.sql in order, then)
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/analytics.sql
--
-- Raises an exception (and stops) on the first broken expectation; prints
-- "analytics: all checks passed" at the end. Everything runs in a transaction
-- that is rolled back.

begin;

-- People: A (Google, signed up 10 days ago), B (Apple, yesterday), T (team
-- account, excluded everywhere).
insert into auth.users (id, email, created_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@example.test', now() - interval '10 days', '{"provider":"google"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@example.test', now() - interval '1 day', '{"provider":"apple"}'),
  ('00000000-0000-0000-0000-00000000000c', 't@example.test', now() - interval '2 days', '{"provider":"email"}');
update public.profiles set terms_accepted_at = now() where id in (
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c');
insert into analytics.excluded_users (user_id, note) values ('00000000-0000-0000-0000-00000000000c', 'team');

insert into public.venue_places (id, name, normalized_name, city, status)
values ('10000000-0000-0000-0000-000000000001', 'Sala', 'sala', 'Madrid', 'published');
insert into public.artists (id, name, normalized_name, status)
values ('20000000-0000-0000-0000-000000000001', 'Banda', 'banda', 'published');
insert into public.events (id, venue_place_id, name, normalized_name, starts_at, city, status, image_url)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Concierto', 'concierto',
        now() - interval '1 day', 'Madrid', 'published', 'https://example.test/cartel.jpg');

-- Uploads: A's video became a published post (activation 2 h after signing
-- up); B had one rejected and one expired reservation; T's post is excluded.
insert into public.media_upload_reservations
  (id, user_id, kind, event_id, upload_preset, folder, cloudinary_public_id, max_bytes, expires_at, consumed_at, rejected_reason, storage_provider, created_at)
values
  ('60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'video', '30000000-0000-0000-0000-000000000001',
   'p', 'f', 'r1', 1000000, now() - interval '10 days' + interval '70 minutes', now() - interval '10 days' + interval '1 hour', null, 'r2',
   now() - interval '10 days' + interval '1 hour'),
  ('60000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'image', null,
   'p', 'f', 'r2', 1000000, now() - interval '20 hours', now() - interval '21 hours', 'too large', 'cloudinary', now() - interval '21 hours'),
  ('60000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000b', 'image', null,
   'p', 'f', 'r3', 1000000, now() - interval '20 hours', null, null, 'cloudinary', now() - interval '21 hours'),
  ('60000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000c', 'image', '30000000-0000-0000-0000-000000000001',
   'p', 'f', 'r4', 1000000, now(), now() - interval '1 day', null, 'cloudinary', now() - interval '1 day');
insert into public.media_assets
  (id, reservation_id, owner_id, kind, event_id, cloudinary_public_id, resource_type, status, storage_provider, storage_key, bytes, duration_seconds, created_at)
values
  ('40000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'video',
   '30000000-0000-0000-0000-000000000001', '0b6f3c5e-6d1a-4a51-9a0b-2f6f1d0c9e11', 'video', 'published', 'r2',
   'v/2026/11/0b6f3c5e-6d1a-4a51-9a0b-2f6f1d0c9e11.mp4', 5000000, 12.5, now() - interval '10 days' + interval '1 hour'),
  ('40000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000c', 'image',
   '30000000-0000-0000-0000-000000000001', 'live-space/pilot/users/t/photo', 'image', 'published', 'cloudinary', null, 20000, null,
   now() - interval '1 day');
insert into public.posts (id, author_id, media_asset_id, event_id, status, source, created_at) values
  ('50000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', '40000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', 'published', 'upload', now() - interval '10 days' + interval '2 hours'),
  ('50000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000c', '40000000-0000-0000-0000-000000000004',
   '30000000-0000-0000-0000-000000000001', 'published', 'upload', now() - interval '1 day');

-- A comes back the day after signing up (saves a concert): retention d1.
insert into public.event_saves (event_id, profile_id, created_at)
values ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', now() - interval '9 days');
-- (Attendance «Fui» comes from the posts, mark_attendance_on_post.)

-- Push and notifications.
insert into public.push_devices (profile_id, platform, token, created_at, last_seen_at)
values ('00000000-0000-0000-0000-00000000000a', 'ios', 'tok-a', now() - interval '5 days', now() - interval '5 days'),
       ('00000000-0000-0000-0000-00000000000c', 'android', 'tok-t', now() - interval '5 days', now() - interval '5 days');
insert into public.notifications_sent (profile_id, type, dedupe_key, sent_at)
values ('00000000-0000-0000-0000-00000000000a', 'concert_day', 'k1', now() - interval '2 days'),
       ('00000000-0000-0000-0000-00000000000c', 'concert_day', 'k2', now() - interval '2 days');

-- Merch collected at the stand yesterday by B (15 €).
insert into public.merch_orders
  (event_id, seller_subject_id, buyer_id, status, total_cents, fee_cents, pickup_code, pickup_point, payment_method, paid_at, paid_cents, created_at)
select '30000000-0000-0000-0000-000000000001', s.id, '00000000-0000-0000-0000-00000000000b', 'collected', 1500, 0, 'ABCDEF', 'Puesto',
       'at_stand', now() - interval '1 day', 1500, now() - interval '1 day'
from public.subjects s where s.artist_id = '20000000-0000-0000-0000-000000000001';

-- Scraping: one active source that never succeeded (stale), one failed run.
insert into public.scrape_sources (id, source_type, name, base_url, parser_key, is_active, terms_reviewed_at, metadata, created_at)
values ('70000000-0000-0000-0000-000000000001', 'venue', 'Fuente', 'https://example.test', 'p', true, now(), '{"fixtureVerified": true}', now() - interval '5 days');
insert into public.scrape_runs (source_id, status, error_message, created_at)
values ('70000000-0000-0000-0000-000000000001', 'error', 'timeout', now() - interval '1 day');

-- Usage events. Device D1: anonymous first (A had not signed in on it yet),
-- then as A. Device D2: the team account.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
declare n int;
begin
  n := public.track_events('d1000000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('name', 'app_open', 'session', 'e1000000-0000-0000-0000-000000000001', 'at', now() - interval '2 days', 'platform', 'ios', 'v', '1.0.0', 'lang', 'es'),
    jsonb_build_object('name', 'screen', 'session', 'e1000000-0000-0000-0000-000000000001', 'at', now() - interval '2 days' + interval '1 second', 'props', '{"path":"/"}'::jsonb, 'platform', 'ios'),
    jsonb_build_object('name', 'upload_start', 'session', 'e1000000-0000-0000-0000-000000000001', 'at', now() - interval '2 days' + interval '2 seconds', 'props', '{"kind":"video"}'::jsonb, 'platform', 'ios')));
  if n <> 3 then raise exception 'anon track_events stored % rows, expected 3', n; end if;

  begin
    perform count(*) from public.analytics_events;
    raise exception 'anon must not read analytics_events';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
do $$
declare n int;
begin
  n := public.track_events('d1000000-0000-0000-0000-000000000001', jsonb_build_array(
    jsonb_build_object('name', 'sign_in', 'session', 'e1000000-0000-0000-0000-000000000001', 'at', now() - interval '2 days' + interval '3 seconds', 'props', '{"provider":"google"}'::jsonb, 'platform', 'ios'),
    jsonb_build_object('name', 'upload_done', 'session', 'e1000000-0000-0000-0000-000000000001', 'at', now() - interval '2 days' + interval '4 seconds', 'props', '{"kind":"video","ms":1200}'::jsonb, 'platform', 'ios'),
    jsonb_build_object('name', 'error', 'session', 'e1000000-0000-0000-0000-000000000001', 'at', now() - interval '2 days' + interval '5 seconds', 'props', '{"where":"upload","message":"boom"}'::jsonb, 'platform', 'ios'),
    jsonb_build_object('name', 'notification_tapped', 'session', 'e1000000-0000-0000-0000-000000000002', 'at', now() - interval '1 day', 'props', '{"type":"concert_day"}'::jsonb, 'platform', 'ios')));
  if n <> 4 then raise exception 'authenticated track_events stored % rows, expected 4', n; end if;
end;
$$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
select public.track_events('d2000000-0000-0000-0000-000000000002', jsonb_build_array(
  jsonb_build_object('name', 'app_open', 'session', 'e2000000-0000-0000-0000-000000000001', 'at', now() - interval '1 day', 'platform', 'android')));
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

-- track_events validation (as the database owner; auth.uid() is null).
do $$
declare
  n int;
  big jsonb;
  d uuid := 'd3000000-0000-0000-0000-000000000003';
  s text := 'e3000000-0000-0000-0000-000000000003';
begin
  -- Bad names, bad/missing session, no device, not an array: dropped.
  n := public.track_events(d, jsonb_build_array(
    jsonb_build_object('name', 'Bad-Name', 'session', s),
    jsonb_build_object('name', '1abc', 'session', s),
    jsonb_build_object('name', repeat('a', 61), 'session', s),
    jsonb_build_object('name', 'ok_event', 'session', 'not-a-uuid'),
    jsonb_build_object('name', 'ok_event')));
  if n <> 0 then raise exception 'invalid events stored: %', n; end if;
  if public.track_events(null, jsonb_build_array(jsonb_build_object('name', 'ok_event', 'session', s))) <> 0 then
    raise exception 'null device must store nothing';
  end if;
  if public.track_events(d, '{"name":"ok_event"}'::jsonb) <> 0 then raise exception 'non-array must store nothing'; end if;

  -- At most 100 per call.
  select jsonb_agg(jsonb_build_object('name', 'bulk', 'session', s)) into big from generate_series(1, 150);
  n := public.track_events(d, big);
  if n <> 100 then raise exception '150 events stored %, expected 100', n; end if;

  -- Clamping: future → now, a year ago → 30 days ago; props not an object → {}; long fields cut.
  n := public.track_events(d, jsonb_build_array(
    jsonb_build_object('name', 'future', 'session', s, 'at', now() + interval '3 days', 'props', '[1,2]'::jsonb,
                       'v', repeat('v', 60), 'platform', repeat('p', 30), 'lang', repeat('l', 20)),
    jsonb_build_object('name', 'past', 'session', s, 'at', now() - interval '1 year')));
  if n <> 2 then raise exception 'clamp batch stored %', n; end if;
  if (select at from public.analytics_events where name = 'future') <> now() then raise exception 'future not clamped to now'; end if;
  if (select at from public.analytics_events where name = 'past') <> now() - interval '30 days' then raise exception 'past not clamped to 30 days'; end if;
  if (select props from public.analytics_events where name = 'future') <> '{}'::jsonb then raise exception 'non-object props kept'; end if;
  if (select length(app_version) || '/' || length(platform) || '/' || length(language) from public.analytics_events where name = 'future') <> '40/20/10' then
    raise exception 'long fields not cut';
  end if;

  -- Props of 2 KB or more: the batch fails.
  begin
    perform public.track_events(d, jsonb_build_array(jsonb_build_object('name', 'huge', 'session', s, 'props', jsonb_build_object('x', repeat('x', 3000)))));
    raise exception 'oversized props accepted';
  exception when check_violation then null;
  end;

  -- Device d3 belongs to nobody: clean it up so it does not disturb the metrics below.
  delete from public.analytics_events where device_id = d;
end;
$$;

-- Report functions.
do $$
declare
  tz text := analytics.timezone();
  today date := (now() at time zone tz)::date;
  a_day date := ((now() - interval '10 days') at time zone tz)::date;
  b_day date := ((now() - interval '1 day') at time zone tz)::date;
  v numeric;
  r record;
begin
  -- daily_kpis
  select sum(value) into v from analytics.daily_kpis(today - 29, today) where metric = 'signups';
  if v <> 2 then raise exception 'signups = %, expected 2 (team excluded)', v; end if;
  select value into v from analytics.daily_kpis(a_day, a_day) where metric = 'signups_google';
  if v <> 1 then raise exception 'signups_google = %', v; end if;
  select value into v from analytics.daily_kpis(b_day, b_day) where metric = 'signups_apple';
  if v <> 1 then raise exception 'signups_apple = %', v; end if;
  select value into v from analytics.daily_kpis(a_day, a_day) where metric = 'activated';
  if v <> 1 then raise exception 'activated on A''s signup day = %', v; end if;
  select value into v from analytics.daily_kpis(a_day + 1, a_day + 1) where metric = 'dau';
  if v <> 1 then raise exception 'dau the day after A signed up = %', v; end if;
  select value into v from analytics.daily_kpis(today, today) where metric = 'mau';
  if v <> 2 then raise exception 'mau = %, expected 2 (A and B, not T)', v; end if;
  select sum(value) into v from analytics.daily_kpis(today - 29, today) where metric = 'sessions';
  if v <> 2 then raise exception 'sessions = %', v; end if;
  select sum(value) into v from analytics.daily_kpis(today - 29, today) where metric = 'platform_ios';
  if v < 1 then raise exception 'platform_ios = %', v; end if;
  select sum(value) into v from analytics.daily_kpis(today - 29, today) where metric = 'platform_android';
  if v <> 0 then raise exception 'platform_android = % (only the team device used android)', v; end if;
  select sum(value) into v from analytics.daily_kpis(today - 29, today) where metric = 'errors';
  if v <> 1 then raise exception 'errors = %', v; end if;
  select value into v from analytics.daily_kpis(b_day, b_day) where metric = 'revenue_cents';
  if v <> 1500 then raise exception 'revenue_cents = %', v; end if;
  select value into v from analytics.daily_kpis(today, today) where metric = 'push_optin_users';
  if v <> 1 then raise exception 'push_optin_users = %', v; end if;
  select sum(value) into v from analytics.daily_kpis(today - 29, today) where metric = 'posts';
  if v <> 1 then raise exception 'posts = % (team post excluded)', v; end if;
  if (select count(distinct metric) from analytics.daily_kpis(today, today)) <> 21 then
    raise exception 'daily_kpis metrics: %', (select string_agg(distinct metric, ',') from analytics.daily_kpis(today, today));
  end if;
  if (select count(*) from analytics.daily_kpis(today - 2000, today)) <> 401 * 21 then
    raise exception 'daily_kpis must cap the range at 401 days';
  end if;

  -- cohort_retention
  select * into r from analytics.cohort_retention('day', 15) where cohort = a_day;
  if r.users <> 1 or r.d1 <> 1 or r.d7 <> 1 or r.d30 is not null or r.recurrent <> 1 then
    raise exception 'cohort of A: %', r;
  end if;
  if (select count(*) from analytics.cohort_retention('week', 8)) <> 8 then raise exception 'cohort_retention must return 8 weeks'; end if;
  if (select sum(users) from analytics.cohort_retention('month', 3)) <> 2 then raise exception 'cohort users must exclude the team'; end if;

  -- event_summary
  select * into r from analytics.event_summary(today - 29, today, 'name') where bucket = 'app_open';
  if r.events <> 1 or r.devices <> 1 or r.users <> 1 then raise exception 'app_open summary: % (team device excluded, pre-login event joined to A)', r; end if;
  if not exists (select 1 from analytics.event_summary(today - 29, today, 'screen') where bucket = '/' and events = 1) then
    raise exception 'screen breakdown';
  end if;
  if not exists (select 1 from analytics.event_summary(today - 29, today, 'error') where bucket = 'upload: boom') then
    raise exception 'error breakdown';
  end if;
  if not exists (select 1 from analytics.event_summary(today - 29, today, 'platform') where bucket = 'ios' and events = 7) then
    raise exception 'platform breakdown';
  end if;
  begin
    perform analytics.event_summary(today, today, 'nope');
    raise exception 'unknown breakdown accepted';
  exception when invalid_parameter_value then null;
  end;

  -- funnel
  if (select string_agg(step || '=' || devices, ',') from analytics.funnel(today - 29, today))
     <> 'app_open=1,upload_start=1,sign_in=1,upload_done=1' then
    raise exception 'funnel: %', (select string_agg(step || '=' || devices, ',') from analytics.funnel(today - 29, today));
  end if;
  if (select sum(devices) from analytics.funnel(today, today)) <> 0 then raise exception 'funnel range'; end if;

  -- user_journey: A's 7 events, pre-login included, in time order, whitelisted props only.
  if (select count(*) from analytics.user_journey('00000000-0000-0000-0000-00000000000a', null, null)) <> 7 then
    raise exception 'journey of A has % events', (select count(*) from analytics.user_journey('00000000-0000-0000-0000-00000000000a', null, null));
  end if;
  if (select name from analytics.user_journey('00000000-0000-0000-0000-00000000000a', null, null) limit 1) <> 'app_open' then
    raise exception 'journey must start with the pre-login app_open';
  end if;
  if (select props from analytics.user_journey('00000000-0000-0000-0000-00000000000a', null, null) where name = 'error') <> '{"where":"upload"}'::jsonb then
    raise exception 'journey props must drop non-whitelisted keys';
  end if;
  if (select count(*) from analytics.user_journey('00000000-0000-0000-0000-00000000000a', null, null, 2)) <> 2 then raise exception 'journey limit'; end if;
  if (select count(*) from analytics.user_journey('00000000-0000-0000-0000-00000000000c', null, null)) <> 0 then raise exception 'journey of excluded user'; end if;

  -- weekly_report
  select * into r from analytics.weekly_report(today) where metric = 'signups';
  if r.this_week <> 1 or r.last_week <> 1 or r.four_weeks_ago <> 0 then raise exception 'weekly signups: %', r; end if;
  select * into r from analytics.weekly_report(today) where metric = 'mau';
  if r.this_week <> 2 then raise exception 'weekly mau: %', r; end if;

  -- list_metrics: 7 core + 6 Live Space.
  if (select count(*) from analytics.list_metrics()) <> 13 then raise exception 'list_metrics: %', (select count(*) from analytics.list_metrics()); end if;
  if exists (select 1 from analytics.list_metrics() where description = '') then raise exception 'undocumented function'; end if;

  -- upload_health
  if (select value from analytics.upload_health(today - 29, today) where metric = 'rejected' and dimension = 'too large') <> 1 then raise exception 'upload rejected'; end if;
  if (select value from analytics.upload_health(today - 29, today) where metric = 'expired_unconsumed' and dimension = 'image') <> 1 then raise exception 'upload expired'; end if;
  if (select value from analytics.upload_health(today - 29, today) where metric = 'reservation_asset_rate' and dimension = 'video') <> 1 then raise exception 'asset rate'; end if;
  if (select value from analytics.upload_health(today - 29, today) where metric = 'time_to_publish_seconds' and dimension = 'p50') <> 3600 then raise exception 'time to publish'; end if;
  if (select sum(value) from analytics.upload_health(today - 29, today) where metric = 'reservations') <> 3 then raise exception 'reservations must exclude the team'; end if;
  if (select value from analytics.upload_health(today - 29, today) where metric = 'client_events' and dimension = 'upload_done') <> 1 then raise exception 'client upload events'; end if;

  -- scraping_health
  if (select value from analytics.scraping_health(today - 6, today) where metric = 'stale_sources') <> 1 then raise exception 'stale sources'; end if;
  if (select value from analytics.scraping_health(today - 6, today) where metric = 'runs' and dimension = 'error') <> 1 then raise exception 'runs by status'; end if;

  -- content_report
  if (select value from analytics.content_report(today - 29, today) where metric = 'concerts_with_moments') <> 1 then raise exception 'concerts with moments'; end if;
  if (select value from analytics.content_report(today - 29, today) where metric = 'moments' and dimension = 'upload') <> 1 then raise exception 'content moments'; end if;
  if (select value from analytics.content_report(today - 29, today) where metric = 'attendance' and dimension = 'attended') <> 1 then raise exception 'content attendance'; end if;
  if (select value from analytics.content_report(today - 29, today) where metric = 'posters' and dimension = 'with_image') <> 1 then raise exception 'posters'; end if;

  -- notifications_report
  if (select value from analytics.notifications_report(today - 29, today) where metric = 'sent' and dimension = 'concert_day') <> 1 then raise exception 'notifications sent'; end if;
  if (select value from analytics.notifications_report(today - 29, today) where metric = 'tapped' and dimension = 'concert_day') <> 1 then raise exception 'notifications tapped'; end if;
  if (select value from analytics.notifications_report(today - 29, today) where metric = 'push_devices_active' and dimension = 'ios') <> 1 then raise exception 'push devices'; end if;

  -- merch_report
  if (select value from analytics.merch_report(today - 29, today) where metric = 'paid_cents' and dimension = 'at_stand') <> 1500 then raise exception 'merch paid'; end if;
  if (select value from analytics.merch_report(today - 29, today) where metric = 'orders' and dimension = 'collected') <> 1 then raise exception 'merch orders'; end if;

  -- suggestions_report runs (no data seeded).
  perform * from analytics.suggestions_report(null, null);
end;
$$;

-- The reader: report functions yes; tables, views, helpers, public RPCs no.
grant analytics_reader to postgres;
set local role analytics_reader;
do $$
begin
  perform * from analytics.daily_kpis(null, null);
  perform * from analytics.cohort_retention();
  perform * from analytics.event_summary(null, null);
  perform * from analytics.funnel(null, null);
  perform * from analytics.user_journey('00000000-0000-0000-0000-00000000000a', null, null);
  perform * from analytics.weekly_report();
  perform * from analytics.list_metrics();
  perform * from analytics.upload_health(null, null);
  perform * from analytics.scraping_health(null, null);
  perform * from analytics.content_report(null, null);
  perform * from analytics.notifications_report(null, null);
  perform * from analytics.merch_report(null, null);
  perform * from analytics.suggestions_report(null, null);

  begin perform 1 from public.profiles limit 1; raise exception 'reader read public.profiles';
  exception when insufficient_privilege then null; end;
  begin perform 1 from auth.users limit 1; raise exception 'reader read auth.users';
  exception when insufficient_privilege then null; end;
  begin perform 1 from storage.objects limit 1; raise exception 'reader read storage.objects';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.analytics_events limit 1; raise exception 'reader read analytics_events';
  exception when insufficient_privilege then null; end;
  begin perform 1 from analytics.excluded_users limit 1; raise exception 'reader read excluded_users';
  exception when insufficient_privilege then null; end;
  begin perform 1 from analytics.raw_events limit 1; raise exception 'reader read raw_events';
  exception when insufficient_privilege then null; end;
  begin perform 1 from analytics.activity limit 1; raise exception 'reader read activity';
  exception when insufficient_privilege then null; end;
  begin perform * from analytics._events(now() - interval '1 day', now()); raise exception 'reader called _events';
  exception when insufficient_privilege then null; end;
  begin perform * from analytics.app_daily_kpis(null, null); raise exception 'reader called app_daily_kpis';
  exception when insufficient_privilege then null; end;
  begin perform public.track_events('d4000000-0000-0000-0000-000000000004', '[]'); raise exception 'reader called track_events';
  exception when insufficient_privilege then null; end;
  begin perform public.purge_analytics_events(); raise exception 'reader called purge_analytics_events';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

-- anon and authenticated: nothing in schema analytics.
set local role authenticated;
do $$
begin
  begin perform * from analytics.daily_kpis(null, null); raise exception 'authenticated called daily_kpis';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

-- Retention purge: only events older than 13 months go.
insert into public.analytics_events (at, device_id, session_id, name)
values (now() - interval '14 months', 'd5000000-0000-0000-0000-000000000005', 'e5000000-0000-0000-0000-000000000005', 'ancient');
do $$
declare n int;
begin
  n := public.purge_analytics_events();
  if n <> 1 or exists (select 1 from public.analytics_events where name = 'ancient') then raise exception 'purge removed %', n; end if;
  if not exists (select 1 from public.analytics_events where name = 'app_open') then raise exception 'purge removed recent events'; end if;
end;
$$;

-- Deleting A's account keeps the events but drops the account.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select public.delete_my_account() ->> 'deleted' as deleted;
reset role;
do $$
begin
  if exists (select 1 from public.analytics_events where user_id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'events still linked to the deleted account';
  end if;
  if (select count(*) from public.analytics_events where device_id = 'd1000000-0000-0000-0000-000000000001') <> 7 then
    raise exception 'the deleted account''s events must stay, unlinked';
  end if;
  if exists (select 1 from analytics.device_users where user_id = '00000000-0000-0000-0000-00000000000a') then
    raise exception 'device still mapped to the deleted account';
  end if;
end;
$$;

select 'analytics: all checks passed';

rollback;
