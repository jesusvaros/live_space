-- Local check of analytics people (migrations 20261113000400_analytics_people
-- and 20261113000500_analytics_people_live_space). THROWAWAY database with
-- every migration applied, never production (see analytics.sql for how).
-- Prints "analytics people: all checks passed"; everything is rolled back.

begin;

insert into auth.users (id, email, created_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'ana@example.test', now() - interval '10 days', '{"provider":"google"}', '{"full_name":"Ana Ruiz"}'),
  ('00000000-0000-0000-0000-0000000000b1', 'beto@example.test', now() - interval '3 days', '{"provider":"email"}', '{}'),
  ('00000000-0000-0000-0000-0000000000c1', 'yo@example.test', now() - interval '20 days', '{"provider":"email"}', '{"name":"Yo"}');
update public.profiles set terms_accepted_at = now() where id in (
  '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1');

insert into public.venue_places (id, name, normalized_name, city, status)
values ('10000000-0000-0000-0000-0000000000f1', 'Sala P', 'sala p', 'Madrid', 'published');
insert into public.events (id, venue_place_id, name, normalized_name, starts_at, city, status)
values ('30000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-0000000000f1', 'Concierto P', 'concierto p',
        now() - interval '2 days', 'Madrid', 'published');

-- Two uploads by Ana, one by Yo (the team account).
insert into public.media_upload_reservations
  (id, user_id, kind, event_id, upload_preset, folder, cloudinary_public_id, max_bytes, expires_at, storage_provider, created_at)
values
  ('60000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', 'image', '30000000-0000-0000-0000-0000000000f1',
   'p', 'f', 'pf1', 1000, now() + interval '1 hour', 'cloudinary', now() - interval '2 days'),
  ('60000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a1', 'image', '30000000-0000-0000-0000-0000000000f1',
   'p', 'f', 'pf2', 1000, now() + interval '1 hour', 'cloudinary', now() - interval '2 days'),
  ('60000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000c1', 'image', '30000000-0000-0000-0000-0000000000f1',
   'p', 'f', 'pf3', 1000, now() + interval '1 hour', 'cloudinary', now() - interval '2 days');

-- Yo is team: marked through set_team (the reader's only write).
select analytics.set_team('00000000-0000-0000-0000-0000000000c1', true, 'yo');

do $$
declare
  n int;
  v numeric;
  nm text;
begin
  -- The old name still works (a view) and hides the team by default.
  select count(*) into n from analytics.excluded_users where user_id = '00000000-0000-0000-0000-0000000000c1';
  if n <> 1 then raise exception 'excluded_users view should list the team account, got %', n; end if;

  -- people: real accounts without the team; names from metadata or e-mail.
  select count(*) into n from analytics.people(null, null) where email like '%@example.test' and email in ('ana@example.test', 'beto@example.test', 'yo@example.test');
  if n <> 2 then raise exception 'people without team should be 2, got %', n; end if;
  select name into nm from analytics.people(null, null) where email = 'ana@example.test';
  if nm <> 'Ana Ruiz' then raise exception 'name from full_name expected, got %', nm; end if;
  select name into nm from analytics.people(null, null) where email = 'beto@example.test';
  if nm <> 'beto' then raise exception 'name from e-mail expected, got %', nm; end if;

  -- user_breakdown: uploads per person, team left out.
  select value into v from analytics.user_breakdown(null, null, 'uploads') where email = 'ana@example.test';
  if v <> 2 then raise exception 'ana uploads should be 2, got %', v; end if;
  select count(*) into n from analytics.user_breakdown(null, null, 'uploads') where email = 'yo@example.test';
  if n <> 0 then raise exception 'team should be hidden from breakdown'; end if;

  -- With the team switched on (what the dashboard does per transaction).
  perform set_config('analytics.include_team', 'on', true);
  select count(*) into n from analytics.excluded_users;
  if n <> 0 then raise exception 'excluded_users should be empty with include_team on'; end if;
  select value into v from analytics.user_breakdown(null, null, 'uploads') where email = 'yo@example.test' and team;
  if v is distinct from 1::numeric then raise exception 'team uploads with include_team on should be 1 and flagged, got %', v; end if;
  select count(*) into n from analytics.people(null, null) where email = 'yo@example.test' and team;
  if n <> 1 then raise exception 'people should show the flagged team account with include_team on'; end if;
  perform set_config('analytics.include_team', '', true);

  -- Unknown metric is an error, not an empty list.
  begin
    perform analytics.user_breakdown(null, null, 'nope');
    raise exception 'unknown metric should fail';
  exception when invalid_parameter_value then null;
  end;

  -- Unmarking.
  perform analytics.set_team('00000000-0000-0000-0000-0000000000c1', false);
  select count(*) into n from analytics.team_users where user_id = '00000000-0000-0000-0000-0000000000c1';
  if n <> 0 then raise exception 'set_team false should remove the account'; end if;

  -- The reader can call the new functions but still not read the tables.
  if not has_function_privilege('analytics_reader', 'analytics.user_breakdown(date, date, text)', 'execute') then
    raise exception 'reader must execute user_breakdown';
  end if;
  if has_table_privilege('analytics_reader', 'analytics.team_users', 'select') then
    raise exception 'reader must not read team_users directly';
  end if;
  if has_function_privilege('analytics_reader', 'analytics.app_user_breakdown(date, date, text)', 'execute') then
    raise exception 'the app hook stays internal';
  end if;

  raise notice 'analytics people: all checks passed';
end;
$$;

rollback;
