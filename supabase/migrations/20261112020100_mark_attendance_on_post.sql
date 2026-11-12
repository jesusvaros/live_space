begin;

-- Publishing a moment from a concert means you were there: mark attendance
-- automatically. «Fui» (attended) once the concert has started, «Voy» (going)
-- if it is still ahead (rare: a moment uploaded before doors). An existing
-- «Voy» / «Me interesa» is upgraded to «Fui» once the concert has started; an
-- existing «Fui» is never touched. Covers every way a post is created
-- (uploader, gallery, Instagram/TikTok import).

create or replace function public.mark_attendance_from_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  started boolean;
begin
  if new.event_id is null or new.author_id is null then
    return new;
  end if;

  select e.starts_at <= now() into started from public.events e where e.id = new.event_id;
  if started is null then
    return new;
  end if;

  insert into public.event_attendance (event_id, profile_id, status)
  values (new.event_id, new.author_id, case when started then 'attended' else 'going' end::public.attendance_status)
  on conflict (event_id, profile_id) do update
    set status = excluded.status, updated_at = now()
    where public.event_attendance.status <> 'attended'
      and (excluded.status = 'attended' or public.event_attendance.status = 'interested');

  return new;
end;
$$;

revoke all on function public.mark_attendance_from_post() from public, anon, authenticated;

drop trigger if exists posts_mark_attendance on public.posts;
create trigger posts_mark_attendance
  after insert on public.posts
  for each row execute function public.mark_attendance_from_post();

-- Moments already published: same rule, once.
insert into public.event_attendance (event_id, profile_id, status)
select distinct p.event_id, p.author_id, 'attended'::public.attendance_status
from public.posts p
join public.events e on e.id = p.event_id
where p.event_id is not null
  and p.author_id is not null
  and e.starts_at <= now()
on conflict (event_id, profile_id) do update
  set status = 'attended', updated_at = now()
  where public.event_attendance.status <> 'attended';

commit;
