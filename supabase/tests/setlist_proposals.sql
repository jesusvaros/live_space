-- Local check of 20261112030100_setlist_proposals. Run against a THROWAWAY
-- database with every migration applied, never production (same setup as
-- delete_my_account.sql):
--
--   docker run -d --name ls-test -e POSTGRES_PASSWORD=postgres public.ecr.aws/supabase/postgres:17.11.0.006
--   (apply supabase/migrations/*.sql in order, then)
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/setlist_proposals.sql
--
-- Raises an exception (and stops) on the first broken expectation; prints
-- "setlist_proposals: all checks passed" at the end. Rolled back.

begin;

-- People: A, B, D attended; C only «Me interesa»; M manages concert 3 (created
-- it); S is a moderator; X has nothing to do with anything.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'c@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', 'd@example.test'),
  ('00000000-0000-0000-0000-0000000000e1', 'm@example.test'),
  ('00000000-0000-0000-0000-0000000000f1', 's@example.test'),
  ('00000000-0000-0000-0000-0000000000f2', 'x@example.test');
insert into public.profiles (id) select id from auth.users where email like '%@example.test' on conflict do nothing;
update public.profiles set username = 'persona_a' where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set app_role = 'moderator' where id = '00000000-0000-0000-0000-0000000000f1';

insert into public.venue_places (id, name, normalized_name, city) values
  ('00000000-0000-0000-0000-00000000aaa1', 'Sala', 'sala', 'Sevilla');
insert into public.artists (id, name, normalized_name, status) values
  ('00000000-0000-0000-0000-00000000bbb1', 'Cabeza', 'cabeza', 'published'),
  ('00000000-0000-0000-0000-00000000bbb2', 'Telonera', 'telonera', 'published');
insert into public.events (id, venue_place_id, name, normalized_name, starts_at, city, status, created_by) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000aaa1', 'Pasado', 'pasado', now() - interval '2 days', 'Sevilla', 'published', null),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000aaa1', 'Oficial', 'oficial', now() - interval '2 days', 'Sevilla', 'published', null),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000aaa1', 'Gestionado', 'gestionado', now() - interval '1 day', 'Sevilla', 'published', '00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-00000000e004', '00000000-0000-0000-0000-00000000aaa1', 'Futuro', 'futuro', now() + interval '2 days', 'Sevilla', 'published', null);
insert into public.event_artists (event_id, artist_id, billing_order, is_headliner) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000bbb2', 1, false),
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000bbb1', 0, true),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000bbb1', 0, true);
insert into public.event_attendance (event_id, profile_id, status) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000a1', 'attended'),
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000b1', 'going'),
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000c1', 'interested'),
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000d1', 'attended'),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-0000000000a1', 'attended'),
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-0000000000a1', 'attended'),
  ('00000000-0000-0000-0000-00000000e004', '00000000-0000-0000-0000-0000000000a1', 'going');
-- Concert 2 already has the venue's setlist; the headliner already has «Hola».
insert into public.event_setlist_items (event_id, title_override, position, source) values
  ('00000000-0000-0000-0000-00000000e002', 'Oficial uno', 1, 'manual');
insert into public.songs (id, title, normalized_title, primary_artist_id) values
  ('00000000-0000-0000-0000-0000000005a1', 'Hola', 'hola', '00000000-0000-0000-0000-00000000bbb1');

-- Title rules.
do $$
declare
  t text[];
begin
  t := public.clean_setlist_titles(array['  Setlist: ', '1', '  Hola   amigo ', '', '--', 'ENCORE', 'Bis:', 'Adiós', '22 de abril']);
  if t is distinct from array['Hola amigo', 'Adiós', '22 de abril'] then
    raise exception 'clean_setlist_titles: %', t;
  end if;
  begin
    perform public.clean_setlist_titles(array['Hola' || chr(1)]);
    raise exception 'control character accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.clean_setlist_titles(array[repeat('a', 121)]);
    raise exception '121 characters accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.clean_setlist_titles(array(select 'Canción ' || n from generate_series(1, 61) n));
    raise exception '61 titles accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.clean_setlist_titles(array['Setlist', '12', ' ']);
    raise exception 'only junk accepted';
  exception when sqlstate '22023' then null;
  end;
  if has_function_privilege('anon', 'public.submit_audience_setlist(uuid, text[], uuid)', 'execute')
     or has_function_privilege('anon', 'public.review_setlist_proposal(uuid, boolean, text, boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.write_audience_setlist(uuid, text[], uuid, uuid)', 'execute') then
    raise exception 'function privileges too wide';
  end if;
  if has_table_privilege('authenticated', 'public.setlist_proposals', 'insert')
     or has_table_privilege('authenticated', 'public.setlist_proposals', 'update')
     or has_table_privilege('anon', 'public.setlist_proposals', 'select') then
    raise exception 'setlist_proposals writable or readable by anon';
  end if;
end;
$$;

-- Helper: run as a signed-in person.
create function pg_temp.act_as(p uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true),
         set_config('request.jwt.claim.sub', p::text, true);
$$;
-- Helper: the error message of a statement (null when it succeeds).
create function pg_temp.error_of(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end;
$$;

set local role authenticated;
\o /dev/null

-- A proposes for concert 1: pending, nothing goes live.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.submit_audience_setlist('00000000-0000-0000-0000-00000000e001', array['Primera', 'Segunda']);
select public.submit_audience_setlist('00000000-0000-0000-0000-00000000e001', array['1. no se limpia aquí', 'Hola', 'Encore', 'Tercera']);
do $$
declare
  n integer;
  e text;
begin
  if (select count(*) from public.event_setlist_items where event_id = '00000000-0000-0000-0000-00000000e001') <> 0 then
    raise exception 'a proposal went live';
  end if;
  select count(*) into n from public.setlist_proposals where proposed_by = '00000000-0000-0000-0000-0000000000a1' and status = 'pending';
  if n <> 1 then raise exception 'expected one pending proposal for A, got %', n; end if;
  if (select count(*) from public.setlist_proposals where proposed_by = '00000000-0000-0000-0000-0000000000a1' and status = 'withdrawn') <> 1 then
    raise exception 'the first proposal was not withdrawn';
  end if;
  if (select titles from public.setlist_proposals where proposed_by = '00000000-0000-0000-0000-0000000000a1' and status = 'pending')
     is distinct from array['1. no se limpia aquí', 'Hola', 'Tercera'] then
    raise exception 'stored titles: %', (select titles from public.setlist_proposals where status = 'pending');
  end if;

  e := pg_temp.error_of($q$select public.submit_audience_setlist('00000000-0000-0000-0000-00000000e004', array['Pronto'])$q$);
  if e is distinct from 'not_started' then raise exception 'future concert: %', e; end if;
  e := pg_temp.error_of($q$select public.submit_audience_setlist('00000000-0000-0000-0000-00000000e002', array['Mía'])$q$);
  if e is distinct from 'setlist_locked' then raise exception 'manager setlist: %', e; end if;
  e := pg_temp.error_of($q$select public.submit_audience_setlist('00000000-0000-0000-0000-00000000e001', array['X'], '00000000-0000-0000-0000-00000000f00d')$q$);
  if e is distinct from 'invalid_artist' then raise exception 'foreign artist: %', e; end if;
  e := pg_temp.error_of($q$insert into public.setlist_proposals (event_id, proposed_by, titles) values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-0000000000a1', array['x'])$q$);
  if e is null then raise exception 'direct insert into setlist_proposals worked'; end if;
  e := pg_temp.error_of($q$insert into public.event_setlist_items (event_id, title_override, position, source) values ('00000000-0000-0000-0000-00000000e001', 'x', 1, 'audience')$q$);
  if e is null then raise exception 'direct insert into event_setlist_items worked'; end if;
  e := pg_temp.error_of($q$select public.review_setlist_proposal((select id from public.setlist_proposals where status = 'pending' limit 1), true)$q$);
  if e is distinct from 'forbidden' then raise exception 'proposer reviewing: %', e; end if;
end;
$$;

-- C («Me interesa») and X (nothing) cannot propose; B («Voy», started) can.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000c1');
do $$
begin
  if pg_temp.error_of($q$select public.submit_audience_setlist('00000000-0000-0000-0000-00000000e001', array['Y'])$q$) is distinct from 'not_attended' then
    raise exception 'interested could propose';
  end if;
end;
$$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f2');
do $$
begin
  if pg_temp.error_of($q$select public.submit_audience_setlist('00000000-0000-0000-0000-00000000e001', array['Y'])$q$) is distinct from 'not_attended' then
    raise exception 'stranger could propose';
  end if;
  if (select count(*) from public.setlist_proposals) <> 0 then
    raise exception 'stranger reads proposals';
  end if;
  if pg_temp.error_of($q$select public.review_setlist_proposal((select id from public.setlist_proposals limit 1), true)$q$) is null then
    raise exception 'stranger reviewed';
  end if;
end;
$$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select public.submit_audience_setlist('00000000-0000-0000-0000-00000000e001', array['Otra cosa']);

-- Rate limit: D sends 10, the 11th is refused.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000d1');
do $$
declare
  e text;
begin
  for i in 1..10 loop
    perform public.submit_audience_setlist('00000000-0000-0000-0000-00000000e001', array['Intento ' || i]);
  end loop;
  e := pg_temp.error_of($q$select public.submit_audience_setlist('00000000-0000-0000-0000-00000000e001', array['Once'])$q$);
  if e is distinct from 'rate_limited' then raise exception 'rate limit: %', e; end if;
end;
$$;

-- The moderator approves A's: the setlist goes live as 'audience', songs of
-- the headliner (Cabeza; «Hola» reused), the other pending ones superseded.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
do $$
declare
  proposal uuid;
  n integer;
begin
  select count(*) into n from public.list_setlist_proposals();
  if n <> 3 then raise exception 'moderation queue: expected 3, got %', n; end if;
  select id into proposal from public.setlist_proposals where proposed_by = '00000000-0000-0000-0000-0000000000a1' and status = 'pending';
  perform public.review_setlist_proposal(proposal, true);
  if (select array_agg(coalesce(s.title, i.title_override) order by i.position)
      from public.event_setlist_items i left join public.songs s on s.id = i.song_id
      where i.event_id = '00000000-0000-0000-0000-00000000e001')
     is distinct from array['1. no se limpia aquí', 'Hola', 'Tercera'] then
    raise exception 'approved setlist wrong';
  end if;
  if exists (
    select 1 from public.event_setlist_items
    where event_id = '00000000-0000-0000-0000-00000000e001'
      and (source <> 'audience' or created_by <> '00000000-0000-0000-0000-0000000000a1'
        or artist_id <> '00000000-0000-0000-0000-00000000bbb1' or song_id is null)
  ) then
    raise exception 'approved items: wrong source / created_by / artist / song';
  end if;
  if (select song_id from public.event_setlist_items where event_id = '00000000-0000-0000-0000-00000000e001' and position = 2)
     <> '00000000-0000-0000-0000-0000000005a1' then
    raise exception 'existing song not reused';
  end if;
  if (select status from public.setlist_proposals where id = proposal) <> 'approved'
     or exists (select 1 from public.setlist_proposals where event_id = '00000000-0000-0000-0000-00000000e001' and status = 'pending') then
    raise exception 'other proposals not superseded';
  end if;
  if pg_temp.error_of(format('select public.review_setlist_proposal(%L, true)', proposal)) is distinct from 'not_pending' then
    raise exception 'approved twice';
  end if;
end;
$$;

-- An audience setlist can be corrected: B proposes again, approved, replaces it.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000b1');
select public.submit_audience_setlist('00000000-0000-0000-0000-00000000e001', array['Corregida'], '00000000-0000-0000-0000-00000000bbb2');
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
select public.review_setlist_proposal((select id from public.setlist_proposals where status = 'pending'), true);
do $$
begin
  if (select count(*) from public.event_setlist_items where event_id = '00000000-0000-0000-0000-00000000e001') <> 1
     or not exists (select 1 from public.event_setlist_items where event_id = '00000000-0000-0000-0000-00000000e001'
       and artist_id = '00000000-0000-0000-0000-00000000bbb2' and created_by = '00000000-0000-0000-0000-0000000000b1') then
    raise exception 'correction not applied for the chosen performer';
  end if;
end;
$$;

-- Concert 3 (managed by M): A proposes, then the manager's own setlist
-- appears. Staff cannot replace it; M only with the explicit choice.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.submit_audience_setlist('00000000-0000-0000-0000-00000000e003', array['Del público']);
reset role;
insert into public.event_setlist_items (event_id, title_override, position, source) values
  ('00000000-0000-0000-0000-00000000e003', 'Del mánager', 1, 'manual');
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000f1');
do $$
begin
  if pg_temp.error_of($q$select public.review_setlist_proposal((select id from public.setlist_proposals where event_id = '00000000-0000-0000-0000-00000000e003' and status = 'pending'), true, null, true)$q$)
     is distinct from 'setlist_exists' then
    raise exception 'staff replaced a manager setlist';
  end if;
end;
$$;
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
do $$
declare
  n integer;
  result jsonb;
begin
  select count(*) into n from public.list_setlist_proposals(null, '00000000-0000-0000-0000-00000000bbb1');
  if n <> 1 then raise exception 'manager queue: expected 1, got %', n; end if;
  if not (select has_other_setlist and can_manage from public.list_setlist_proposals()) then
    raise exception 'manager queue flags wrong';
  end if;
  if pg_temp.error_of($q$select public.review_setlist_proposal((select id from public.setlist_proposals where event_id = '00000000-0000-0000-0000-00000000e003' and status = 'pending'), true)$q$)
     is distinct from 'setlist_exists' then
    raise exception 'manager replaced without choosing to';
  end if;
  perform public.review_setlist_proposal((select id from public.setlist_proposals where event_id = '00000000-0000-0000-0000-00000000e003' and status = 'pending'), true, null, true);
  if (select array_agg(source || ':' || coalesce(title_override, '') order by position) from public.event_setlist_items where event_id = '00000000-0000-0000-0000-00000000e003')
     is distinct from array['audience:'] then
    raise exception 'manager replace: %', (select array_agg(source) from public.event_setlist_items where event_id = '00000000-0000-0000-0000-00000000e003');
  end if;
  -- A manager proposing is just an edit: approved at once.
  result := public.submit_audience_setlist('00000000-0000-0000-0000-00000000e003', array['Uno', 'Dos']);
  if result ->> 'status' <> 'approved'
     or (select count(*) from public.event_setlist_items where event_id = '00000000-0000-0000-0000-00000000e003') <> 2 then
    raise exception 'manager submit not applied';
  end if;
end;
$$;

-- Rejecting keeps the note and writes nothing.
select pg_temp.act_as('00000000-0000-0000-0000-0000000000a1');
select public.submit_audience_setlist('00000000-0000-0000-0000-00000000e003', array['Otra']);
select pg_temp.act_as('00000000-0000-0000-0000-0000000000e1');
select public.review_setlist_proposal((select id from public.setlist_proposals where event_id = '00000000-0000-0000-0000-00000000e003' and status = 'pending'), false, '  Faltan canciones ');
do $$
begin
  if not exists (select 1 from public.setlist_proposals where status = 'rejected' and review_note = 'Faltan canciones'
                   and reviewed_by = '00000000-0000-0000-0000-0000000000e1')
     or (select count(*) from public.event_setlist_items where event_id = '00000000-0000-0000-0000-00000000e003') <> 2 then
    raise exception 'reject';
  end if;
  raise notice 'setlist_proposals: all checks passed';
end;
$$;

rollback;
