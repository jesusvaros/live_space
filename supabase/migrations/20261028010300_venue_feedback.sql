begin;

-- Venue tags instead of reviews: after a concert, people who were there tick
-- a few fixed tags about the venue. No free text, no stars, nothing to
-- moderate beyond the aggregate. One row per person per event.

create table public.venue_feedback (
  id uuid primary key default extensions.gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  venue_place_id uuid not null references public.venue_places(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  tags text[] not null,
  created_at timestamptz not null default now(),
  constraint venue_feedback_one_per_event unique (profile_id, event_id),
  constraint venue_feedback_tags_known check (
    cardinality(tags) between 1 and 8
    and tags <@ array[
      'sonido_bueno', 'sonido_malo', 'buena_visibilidad', 'poca_visibilidad',
      'accesible', 'colas_largas', 'barra_rapida', 'guardarropa'
    ]::text[]
  ),
  constraint venue_feedback_no_contradiction check (
    not (tags @> array['sonido_bueno', 'sonido_malo']::text[])
    and not (tags @> array['buena_visibilidad', 'poca_visibilidad']::text[])
  )
);

create index venue_feedback_venue_idx on public.venue_feedback (venue_place_id);

comment on table public.venue_feedback is
  'Fixed venue tags from people who attended an event. Public only as per-tag counts >= 5 through get_venue_feedback_summary.';

-- Insert/update gate: the row is the caller's, the venue is the event's
-- venue, the event has started and the caller marked it as attended.
create or replace function public.can_leave_venue_feedback(p_event_id uuid, p_venue_place_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.events e
    join public.event_attendance a
      on a.event_id = e.id
     and a.profile_id = (select auth.uid())
     and a.status = 'attended'
    where e.id = p_event_id
      and e.venue_place_id = p_venue_place_id
      and e.starts_at <= now()
  );
$$;

alter table public.venue_feedback enable row level security;

create policy venue_feedback_read_own on public.venue_feedback for select to authenticated
  using (profile_id = (select auth.uid()) or public.current_user_is_staff());
create policy venue_feedback_insert_attended on public.venue_feedback for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and public.can_leave_venue_feedback(event_id, venue_place_id)
  );
create policy venue_feedback_update_own on public.venue_feedback for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (
    profile_id = (select auth.uid())
    and public.can_leave_venue_feedback(event_id, venue_place_id)
  );
create policy venue_feedback_delete_own on public.venue_feedback for delete to authenticated
  using (profile_id = (select auth.uid()));

grant select, insert, update, delete on public.venue_feedback to authenticated;
grant all on public.venue_feedback to service_role;

-- Public aggregate: per tag, its votes and the number of people who left
-- tags for the venue (to say "la mayoría" / "muchos" / "algunos"). Only
-- tags with at least 5 votes, only for a visible venue. Never says who.
create or replace function public.get_venue_feedback_summary(p_venue_place_id uuid)
returns table (tag text, votes integer, total integer)
language sql
stable
security definer
set search_path = ''
as $$
  with visible as (
    select 1 from public.venue_places v
    where v.id = p_venue_place_id
      and (v.status = 'published' or public.can_manage_venue(v.id) or public.current_user_is_staff())
  ),
  rows_for_venue as (
    select f.tags from public.venue_feedback f
    where f.venue_place_id = p_venue_place_id and exists (select 1 from visible)
  )
  select t.tag, count(*)::integer as votes, (select count(*) from rows_for_venue)::integer as total
  from rows_for_venue r
  cross join lateral unnest(r.tags) as t(tag)
  group by t.tag
  having count(*) >= 5
  order by votes desc, t.tag;
$$;

revoke all on function public.can_leave_venue_feedback(uuid, uuid) from public;
revoke all on function public.get_venue_feedback_summary(uuid) from public;
grant execute on function public.can_leave_venue_feedback(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_venue_feedback_summary(uuid) to anon, authenticated, service_role;

-- Reports about the aggregate go through moderation_reports with
-- target_type 'venue' and reason 'venue_feedback'; no new report type.

commit;

notify pgrst, 'reload schema';
