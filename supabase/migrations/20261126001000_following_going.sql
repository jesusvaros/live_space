begin;

-- «Gente que sigues»: following someone is enough to see the upcoming
-- concerts they marked «Voy». Until now friends_going() only returned people
-- who follow you back (mutual follow), so a one-way follow showed nothing and
-- Inicio kept inviting you to «Busca a tus amigos» although you already
-- followed someone who was going to a concert.
--
-- What stays the same:
--   * attendance is still private in RLS (attendance_read unchanged); the only
--     way in is this security definer function;
--   * the person decides: plans_visibility = 'nadie' (Ajustes → Privacidad →
--     «Tus planes») hides their plans from everyone; 'amigos' (the default,
--     name kept for old builds) now means «quien te sigue»;
--   * blocks in either direction hide them;
--   * only upcoming published concerts, nothing else about the person.
--
-- Same signature and columns, so builds already installed pick it up as soon
-- as this migration is applied.

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
    select s.id as subject_id
    from public.subjects s
    where s.type = 'user' and s.profile_id = (select auth.uid())
  ),
  followed as (
    select distinct them.profile_id
    from me
    join public.follows mine on mine.follower_subject_id = me.subject_id
    join public.subjects them on them.id = mine.target_subject_id and them.type = 'user'
    where them.profile_id is not null
      and them.profile_id <> (select auth.uid())
  )
  select e.id, e.starts_at, p.id, p.display_name, p.username::text, p.avatar_url
  from followed f
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
