-- Local check of event_link_suggestions (migrations 20261112000100,
-- 20261112000200 and 20261125003000). Run against a THROWAWAY database with every migration
-- applied, never against production (same setup as delete_my_account.sql):
--
--   docker run -d --name ls-test -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.11.0.006
--   (apply supabase/migrations/*.sql in order, then)
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/event_link_suggestions.sql
--
-- Raises an exception (and stops) on the first broken expectation; prints
-- "event_link_suggestions: all checks passed" at the end. Everything runs in
-- a transaction that is rolled back.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@example.test');

-- Normalization (same rules as src/shared/suggestions/url.ts).
do $$
begin
  if public.normalize_suggestion_url('  HTTPS://Entradium.com/es/events/x?utm_source=ig&id=3&fbclid=z#buy ')
     is distinct from 'https://entradium.com/es/events/x?id=3' then
    raise exception 'normalize: %', public.normalize_suggestion_url('  HTTPS://Entradium.com/es/events/x?utm_source=ig&id=3&fbclid=z#buy ');
  end if;
  if public.normalize_suggestion_url('javascript:alert(1)') is not null
     or public.normalize_suggestion_url('entradium.com/x') is not null
     or public.normalize_suggestion_url('https://a b.example/') is not null
     or public.normalize_suggestion_url('https://user@x.example/') is not null then
    raise exception 'normalize accepted a non-http(s) link';
  end if;
  if not exists (select 1 from public.scrape_sources where metadata @> '{"userSuggestions": true, "structuredDataVerified": true}' and not is_active)
     or not exists (select 1 from public.scrape_sources where metadata @> '{"userSuggestions": true, "structuredDataVerified": false}' and not is_active) then
    raise exception 'user-suggestion sources missing or active';
  end if;
  if has_table_privilege('anon', 'public.event_link_suggestions', 'select')
     or has_table_privilege('anon', 'public.event_link_suggestions', 'insert') then
    raise exception 'anon can use event_link_suggestions';
  end if;
  if has_column_privilege('authenticated', 'public.event_link_suggestions', 'status', 'insert')
     or has_table_privilege('authenticated', 'public.event_link_suggestions', 'update')
     or has_table_privilege('authenticated', 'public.event_link_suggestions', 'delete') then
    raise exception 'authenticated can write processing columns, update or delete';
  end if;
end;
$$;

-- A inserts: the trigger owns every column but url and note.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

insert into public.event_link_suggestions (url, note)
values ('https://www.Dice.fm/event/abc?utm_campaign=x', '  el pase de las 23h  ');

do $$
declare
  row record;
begin
  select * into row from public.event_link_suggestions;
  if row.url <> 'https://www.dice.fm/event/abc' or row.url_host <> 'dice.fm' or row.note <> 'el pase de las 23h'
     or row.status <> 'pending' or row.attempts <> 0
     or row.suggested_by <> '00000000-0000-0000-0000-0000000000a1' then
    raise exception 'unexpected row: %', row_to_json(row);
  end if;
end;
$$;

-- The same link twice (even with other tracking) is one row.
do $$
begin
  begin
    insert into public.event_link_suggestions (url) values ('https://www.dice.fm/event/abc?fbclid=1');
    raise exception 'duplicate link was accepted';
  exception when unique_violation then null;
  end;
  begin
    insert into public.event_link_suggestions (url) values ('ftp://example.test/x');
    raise exception 'invalid link was accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- 10 a day: nine more pass, the eleventh fails.
do $$
begin
  for i in 1..9 loop
    insert into public.event_link_suggestions (url) values ('https://tickets.example/e/' || i);
  end loop;
  begin
    insert into public.event_link_suggestions (url) values ('https://tickets.example/e/11');
    raise exception 'rate limit not enforced';
  exception when raise_exception then
    if sqlerrm <> 'rate_limited' then raise; end if;
  end;
end;
$$;

-- B sees nothing of A and cannot insert as A.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$
begin
  if exists (select 1 from public.event_link_suggestions) then raise exception 'B can read A''s suggestions'; end if;
  -- suggested_by is not insertable; the trigger forces the caller anyway.
  insert into public.event_link_suggestions (url) values ('https://tickets.example/e/b');
  if (select count(*) from public.event_link_suggestions) <> 1 then raise exception 'B does not see own row'; end if;
end;
$$;

-- A deletes the account: the suggestions go, B's stay.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.delete_my_account();
reset role;

do $$
begin
  if exists (select 1 from public.event_link_suggestions where suggested_by = '00000000-0000-0000-0000-0000000000a1') then
    raise exception 'A''s suggestions survived delete_my_account';
  end if;
  if (select count(*) from public.event_link_suggestions) <> 1 then raise exception 'B''s suggestion was removed'; end if;
  -- The push switch and the new notice type exist.
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'notification_preferences' and column_name = 'suggestion_imported') then
    raise exception 'notification_preferences.suggestion_imported missing';
  end if;
  insert into public.notifications_sent (profile_id, type, dedupe_key)
  values ('00000000-0000-0000-0000-0000000000b1', 'suggestion_imported', 'suggestion_imported:test');
end;
$$;

-- Venue/artist candidates (20261125003000): only the worker sets kind and
-- candidate; only admins list and resolve them.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'c@example.test');
update public.profiles set app_role = 'admin' where id = '00000000-0000-0000-0000-0000000000c1';
update public.event_link_suggestions
  set status = 'review', kind = 'venue', candidate = '{"name": "Bar Ejemplo", "city": "Sevilla"}'
  where suggested_by = '00000000-0000-0000-0000-0000000000b1';
insert into public.venue_places (id, name, normalized_name, city)
values ('00000000-0000-0000-0000-0000000000f1', 'Bar Ejemplo', 'bar ejemplo', 'Sevilla');

do $$
begin
  if has_column_privilege('authenticated', 'public.event_link_suggestions', 'kind', 'insert')
     or has_column_privilege('authenticated', 'public.event_link_suggestions', 'candidate', 'insert') then
    raise exception 'authenticated can set kind or candidate';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
do $$
begin
  begin
    perform * from public.admin_link_candidates();
    raise exception 'a non-admin listed the candidates';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.admin_resolve_link_candidate('https://tickets.example/e/b', 'dismissed');
    raise exception 'a non-admin resolved a candidate';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
do $$
declare
  listed record;
begin
  select * into listed from public.admin_link_candidates();
  if listed.url is distinct from 'https://tickets.example/e/b' or listed.kind <> 'venue' or listed.people <> 1
     or listed.candidate->>'name' <> 'Bar Ejemplo' then
    raise exception 'admin_link_candidates: %', row_to_json(listed);
  end if;
  begin
    perform public.admin_resolve_link_candidate('https://tickets.example/e/b', 'created');
    raise exception 'created without a venue or artist';
  exception when invalid_parameter_value then null;
  end;
  if public.admin_resolve_link_candidate('https://tickets.example/e/b', 'created', '00000000-0000-0000-0000-0000000000f1') <> 1 then
    raise exception 'admin_resolve_link_candidate did not resolve the row';
  end if;
  if public.admin_resolve_link_candidate('https://tickets.example/e/b', 'dismissed') <> 0 then
    raise exception 'a resolved candidate was resolved again';
  end if;
  if exists (select 1 from public.admin_link_candidates()) then
    raise exception 'resolved candidate still listed';
  end if;
end;
$$;
reset role;

do $$
begin
  if not exists (select 1 from public.event_link_suggestions
                 where suggested_by = '00000000-0000-0000-0000-0000000000b1' and status = 'imported'
                   and result_venue_place_id = '00000000-0000-0000-0000-0000000000f1') then
    raise exception 'created candidate not imported with its venue';
  end if;
end;
$$;

select 'event_link_suggestions: all checks passed';

rollback;
