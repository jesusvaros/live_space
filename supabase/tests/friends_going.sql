-- Local check of friends_going() (migrations 20261124000300 and
-- 20261126001000: following someone is enough, no follow back needed). Run
-- against a THROWAWAY database with every migration applied (docker setup in
-- delete_my_account.sql), never production. Everything is rolled back.
--
-- A and B follow each other; A follows F, who does not follow A back; C
-- follows A but A does not follow C; D is followed by A but hides their
-- plans; E is followed by A but blocked A.

begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', 'b@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', 'c@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', 'd@example.test'),
  ('00000000-0000-0000-0000-0000000000e1', 'e@example.test'),
  ('00000000-0000-0000-0000-0000000000f1', 'f@example.test');
insert into public.profiles (id) select id from auth.users where email like '%@example.test' on conflict do nothing;
insert into public.subjects (type, profile_id)
select 'user', id from auth.users where email like '%@example.test'
on conflict do nothing;
update public.profiles set plans_visibility = 'nadie' where id = '00000000-0000-0000-0000-0000000000d1';

insert into public.venue_places (id, name, normalized_name, city, status)
values ('10000000-0000-0000-0000-0000000000f1', 'Sala', 'sala', 'Madrid', 'published');
insert into public.events (id, venue_place_id, name, normalized_name, starts_at, city, status) values
  ('20000000-0000-0000-0000-0000000000e1', '10000000-0000-0000-0000-0000000000f1', 'Futuro', 'futuro', now() + interval '3 days', 'Madrid', 'published'),
  ('20000000-0000-0000-0000-0000000000e2', '10000000-0000-0000-0000-0000000000f1', 'Pasado', 'pasado', now() - interval '3 days', 'Madrid', 'published'),
  ('20000000-0000-0000-0000-0000000000e3', '10000000-0000-0000-0000-0000000000f1', 'Borrador', 'borrador', now() + interval '3 days', 'Madrid', 'draft');

-- Everyone but A is going to every concert.
insert into public.event_attendance (event_id, profile_id, status)
select e.id, u.id, 'going'
from public.events e, auth.users u
where e.id::text like '20000000-%' and u.email like '%@example.test' and u.id <> '00000000-0000-0000-0000-0000000000a1';

-- Follows: A<->B, A->F, C->A, A<->D, A<->E.
insert into public.follows (follower_subject_id, target_subject_id)
select f.id, t.id from public.subjects f, public.subjects t
where (f.profile_id, t.profile_id) in (
  ('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1')
);
insert into public.user_blocks (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a1');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

do $$
declare n int; who text;
begin
  select count(*), string_agg(distinct friend_id::text, ',') into n, who from public.friends_going();
  if n <> 2 or who <> '00000000-0000-0000-0000-0000000000b1,00000000-0000-0000-0000-0000000000f1' then
    raise exception 'expected B and F at the upcoming published concert, got % rows (%)', n, who;
  end if;
  select count(*) into n from public.friends_going(p_friend => '00000000-0000-0000-0000-0000000000f1');
  if n <> 1 then raise exception 'someone A follows (not back) must show, got %', n; end if;
  select count(*) into n from public.friends_going(p_event => '20000000-0000-0000-0000-0000000000e2');
  if n <> 0 then raise exception 'past concert must not show, got %', n; end if;
  select count(*) into n from public.friends_going(p_friend => '00000000-0000-0000-0000-0000000000c1');
  if n <> 0 then raise exception 'one-way follower C must not show, got %', n; end if;
  -- Attendance itself stays private: A cannot read B's rows directly.
  select count(*) into n from public.event_attendance where profile_id = '00000000-0000-0000-0000-0000000000b1';
  if n <> 0 then raise exception 'attendance leaked through RLS: % rows', n; end if;
  raise notice 'friends_going: all checks passed';
end $$;

reset role;
rollback;
