-- Local check of the super admin functions (20261113000600_super_admin).
-- THROWAWAY database with every migration applied, never production; run as
-- supabase_admin on the plain image (it adds two Auth columns for the test).
-- Prints "super admin: all checks passed"; everything is rolled back.

begin;

-- The plain postgres image lacks what Supabase Auth adds (production has
-- both): run this file as supabase_admin there (psql -U supabase_admin).
alter table auth.users add column if not exists banned_until timestamptz;
create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid);
grant all on auth.sessions to postgres;

-- Admin (A), a user (U) with two posts, a reporter (R).
insert into auth.users (id, email, created_at, raw_app_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'admin@example.test', now() - interval '30 days', '{"provider":"google"}'),
  ('00000000-0000-0000-0000-0000000000d2', 'user@example.test', now() - interval '5 days', '{"provider":"email"}'),
  ('00000000-0000-0000-0000-0000000000d3', 'reporter@example.test', now() - interval '5 days', '{"provider":"email"}');
update public.profiles set terms_accepted_at = now(), display_name = 'Usuaria' where id = '00000000-0000-0000-0000-0000000000d2';
update public.profiles set terms_accepted_at = now() where id in ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d3');
update public.profiles set app_role = 'admin' where id = '00000000-0000-0000-0000-0000000000d1';

insert into public.venue_places (id, name, normalized_name, city, status)
values ('10000000-0000-0000-0000-0000000000d1', 'Sala D', 'sala d', 'Sevilla', 'published');
insert into public.events (id, venue_place_id, name, normalized_name, starts_at, city, status)
values ('30000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-0000000000d1', 'Concierto D', 'concierto d',
        now() - interval '2 days', 'Sevilla', 'published');
insert into public.media_upload_reservations
  (id, user_id, kind, event_id, upload_preset, folder, cloudinary_public_id, max_bytes, expires_at, consumed_at, storage_provider, created_at)
values
  ('60000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', 'image', '30000000-0000-0000-0000-0000000000d1',
   'p', 'f', 'd1', 1000, now() + interval '1 hour', now() - interval '2 days', 'cloudinary', now() - interval '2 days'),
  ('60000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d2', 'image', '30000000-0000-0000-0000-0000000000d1',
   'p', 'f', 'd2', 1000, now() + interval '1 hour', now() - interval '2 days', 'cloudinary', now() - interval '2 days');
insert into public.media_assets
  (id, reservation_id, owner_id, kind, event_id, cloudinary_public_id, resource_type, status, storage_provider, bytes, secure_url, created_at)
values
  ('40000000-0000-0000-0000-0000000000d1', '60000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', 'image',
   '30000000-0000-0000-0000-0000000000d1', 'live-space/pilot/users/d/1', 'image', 'published', 'cloudinary', 1000, 'https://example.test/1.jpg', now() - interval '2 days'),
  ('40000000-0000-0000-0000-0000000000d2', '60000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d2', 'image',
   '30000000-0000-0000-0000-0000000000d1', 'live-space/pilot/users/d/2', 'image', 'published', 'cloudinary', 1000, 'https://example.test/2.jpg', now() - interval '2 days');
insert into public.posts (id, author_id, media_asset_id, event_id, status, source, created_at) values
  ('50000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000d2', '40000000-0000-0000-0000-0000000000d1',
   '30000000-0000-0000-0000-0000000000d1', 'published', 'upload', now() - interval '2 days'),
  ('50000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d2', '40000000-0000-0000-0000-0000000000d2',
   '30000000-0000-0000-0000-0000000000d1', 'published', 'upload', now() - interval '2 days');
insert into public.moderation_reports (reporter_id, target_type, target_id, reason)
values ('00000000-0000-0000-0000-0000000000d3', 'post', '50000000-0000-0000-0000-0000000000d1', 'spam');

-- Scraping: a source with one pending row (human review) and one never processed.
insert into public.scrape_sources (id, source_type, name, base_url, parser_key, is_active, terms_reviewed_at, metadata)
values ('70000000-0000-0000-0000-0000000000d1', 'venue', 'Web de Sala D', 'https://sala-d.example.test', 'generic', true, now(), '{"fixtureVerified": true}');
insert into public.scrape_runs (id, source_id, status) values ('71000000-0000-0000-0000-0000000000d1', '70000000-0000-0000-0000-0000000000d1', 'success');
insert into public.staging_events (id, scrape_run_id, source_id, source_url, raw_payload, raw_hash, extracted_title,
                                   extracted_starts_at, normalized_payload, confidence, review_status, decision_reasons)
values
  ('72000000-0000-0000-0000-0000000000d1', '71000000-0000-0000-0000-0000000000d1', '70000000-0000-0000-0000-0000000000d1',
   'https://sala-d.example.test/a', '{}', 'h1', 'Grupo A en Sala D', now() + interval '10 days', '{"startsAt":null}', 0.8,
   'pending', array['human-review-required']),
  ('72000000-0000-0000-0000-0000000000d2', '71000000-0000-0000-0000-0000000000d1', '70000000-0000-0000-0000-0000000000d1',
   'https://sala-d.example.test/b', '{}', 'h2', 'Grupo B', now() + interval '12 days', null, null, 'pending', '{}');

-- As a plain user: every admin function refuses.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated","aal":"aal2"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d2', true);
do $$
begin
  begin
    perform public.admin_users_search(null, 10);
    raise exception 'non-admin must not search users';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_staging_summary();
    raise exception 'non-admin must not read staging';
  exception when insufficient_privilege then null;
  end;
  -- The log is not readable either.
  if exists (select 1 from public.admin_audit_log) then raise exception 'audit log visible to a user'; end if;
end;
$$;
reset role;

-- As the admin with only a password (aal1): reads yes, writes no.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","aal":"aal1","email":"admin@example.test"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
do $$
declare
  n int;
  j jsonb;
  r text;
begin
  select count(*) into n from public.admin_users_search('usuaria', 10);
  if n <> 1 then raise exception 'search by name: %', n; end if;
  select count(*) into n from public.admin_users_search('user@example', 10);
  if n <> 1 then raise exception 'search by e-mail: %', n; end if;

  j := public.admin_user_detail('00000000-0000-0000-0000-0000000000d2');
  if jsonb_array_length(j -> 'posts') <> 2 then raise exception 'detail posts: %', j -> 'posts'; end if;
  if jsonb_array_length(j -> 'reports_against') <> 1 then raise exception 'detail reports'; end if;

  j := public.admin_staging_summary();
  if (j -> 'pending_by_reason' ->> 'human-review-required')::int <> 1 or (j -> 'pending_by_reason' ->> 'unprocessed')::int <> 1 then
    raise exception 'summary reasons: %', j;
  end if;
  select reason into r from public.admin_staging_list('pending', null, null, 'Grupo A', true, 50, 0);
  if r <> 'human-review-required' then raise exception 'list reason: %', r; end if;
  select count(*) into n from public.admin_sources() where pending = 2;
  if n <> 1 then raise exception 'sources pending'; end if;
  select count(*) into n from public.admin_reports('open') where target_label like 'Usuaria%' and open_for_target = 1;
  if n <> 1 then raise exception 'reports'; end if;

  begin
    perform public.admin_set_post_status('50000000-0000-0000-0000-0000000000d1', 'archived', 'contenido no permitido');
    raise exception 'write without second factor must fail';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- As the admin with the second factor (aal2): writes, each one logged.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated","aal":"aal2","email":"admin@example.test"}', true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
do $$
declare
  n int;
  s text;
begin
  -- A reason is mandatory.
  begin
    perform public.admin_set_post_status('50000000-0000-0000-0000-0000000000d1', 'archived', '');
    raise exception 'write without reason must fail';
  exception when invalid_parameter_value then null;
  end;

  perform public.admin_set_post_status('50000000-0000-0000-0000-0000000000d1', 'archived', 'contenido no permitido');
  perform public.admin_resolve_report((select id from public.moderation_reports where target_id = '50000000-0000-0000-0000-0000000000d1'), 'resolved', 'oculto');
  perform public.admin_set_role('00000000-0000-0000-0000-0000000000d3', 'moderator', 'ayuda con la moderación');
  perform public.admin_ban_user('00000000-0000-0000-0000-0000000000d2', 7, true, 'spam repetido');

  n := public.admin_review_staging(array['72000000-0000-0000-0000-0000000000d1', '72000000-0000-0000-0000-0000000000d2']::uuid[], 'approved', 'revisado a mano');
  -- Only the processed row can be approved.
  if n <> 1 then raise exception 'approve changed %', n; end if;

  -- Never yourself, never another admin.
  begin
    perform public.admin_set_role('00000000-0000-0000-0000-0000000000d1', 'user', 'probar');
    raise exception 'changing own role must fail';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.admin_ban_user('00000000-0000-0000-0000-0000000000d1', null, false, 'probar');
    raise exception 'banning yourself must fail';
  exception when invalid_parameter_value then null;
  end;

  select count(*) into n from public.admin_audit(100);
  if n <> 5 then raise exception 'audit rows: %', n; end if;
  select actor_email into s from public.admin_audit(1);
  if s <> 'admin@example.test' then raise exception 'actor e-mail: %', s; end if;
end;
$$;
reset role;

do $$
begin
  if (select status::text from public.posts where id = '50000000-0000-0000-0000-0000000000d1') <> 'archived' then raise exception 'post not hidden'; end if;
  if (select count(*) from public.posts where author_id = '00000000-0000-0000-0000-0000000000d2' and status = 'published') <> 0 then
    raise exception 'ban should hide the remaining posts';
  end if;
  if (select banned_until from auth.users where id = '00000000-0000-0000-0000-0000000000d2') < now() + interval '6 days' then
    raise exception 'ban length';
  end if;
  if (select app_role::text from public.profiles where id = '00000000-0000-0000-0000-0000000000d3') <> 'moderator' then raise exception 'role'; end if;
  if (select review_status::text from public.staging_events where id = '72000000-0000-0000-0000-0000000000d1') <> 'approved' then raise exception 'staging approve'; end if;
  if (select review_status::text from public.staging_events where id = '72000000-0000-0000-0000-0000000000d2') <> 'pending' then raise exception 'unprocessed row must stay'; end if;
  if (select status::text from public.moderation_reports where target_id = '50000000-0000-0000-0000-0000000000d1') <> 'resolved' then raise exception 'report'; end if;
  raise notice 'super admin: all checks passed';
end;
$$;

rollback;
