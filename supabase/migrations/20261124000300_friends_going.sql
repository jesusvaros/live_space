begin;

-- Friends: two people who follow each other (the existing public.follows
-- between user subjects). A friend sees which upcoming concerts you marked
-- «Voy», unless you set plans_visibility = 'nadie' in Ajustes.
--
-- Attendance stays private in RLS (attendance_read is unchanged: only the
-- person, the concert's managers and staff). Friends only get it through
-- friends_going(), a security definer function that checks the mutual follow,
-- the visibility setting and blocks in both directions, and returns
-- upcoming published concerts only.

alter table public.profiles
  add column if not exists plans_visibility text not null default 'amigos';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_plans_visibility_check'
  ) then
    alter table public.profiles
      add constraint profiles_plans_visibility_check check (plans_visibility in ('amigos', 'nadie'));
  end if;
end;
$$;

create or replace function public.friends_going(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_friend uuid default null,
  p_event uuid default null
)
returns table (
  event_id uuid,
  starts_at timestamptz,
  friend_id uuid,
  display_name text,
  username text,
  avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select s.id as subject_id, s.profile_id
    from public.subjects s
    where s.type = 'user' and s.profile_id = (select auth.uid())
  ),
  friends as (
    select them.profile_id
    from me
    join public.follows mine on mine.follower_subject_id = me.subject_id
    join public.follows theirs
      on theirs.follower_subject_id = mine.target_subject_id
     and theirs.target_subject_id = me.subject_id
    join public.subjects them on them.id = mine.target_subject_id and them.type = 'user'
  )
  select e.id, e.starts_at, p.id, p.display_name, p.username::text, p.avatar_url
  from friends f
  join public.profiles p on p.id = f.profile_id and p.plans_visibility = 'amigos'
  join public.event_attendance ea on ea.profile_id = p.id and ea.status = 'going'
  join public.events e on e.id = ea.event_id and e.status = 'published'
  where e.starts_at >= coalesce(p_from, now() - interval '6 hours')
    and e.starts_at <= coalesce(p_to, now() + interval '120 days')
    and (p_friend is null or p.id = p_friend)
    and (p_event is null or e.id = p_event)
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = (select auth.uid()))
    )
  order by e.starts_at, p.display_name
  limit 500;
$$;

revoke all on function public.friends_going(timestamptz, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.friends_going(timestamptz, timestamptz, uuid, uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
