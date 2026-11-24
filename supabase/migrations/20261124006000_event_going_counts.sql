begin;

-- «12 personas van»: how many people marked «Voy» on each concert, as a
-- number only. event_attendance stays private in RLS (nobody can list who
-- goes); this function returns aggregate counts for published concerts and
-- leaves out counts below 2, so a single person's plan is never revealed.

create or replace function public.event_going_counts(p_event_ids uuid[])
returns table (event_id uuid, going integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.event_id, count(*)::integer as going
  from public.event_attendance a
  join public.events e on e.id = a.event_id and e.status = 'published'
  where a.event_id = any (p_event_ids[1:200])
    and a.status = 'going'
  group by a.event_id
  having count(*) >= 2;
$$;

revoke all on function public.event_going_counts(uuid[]) from public;
grant execute on function public.event_going_counts(uuid[]) to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';
