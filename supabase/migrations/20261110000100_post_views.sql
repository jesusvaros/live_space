begin;

-- Moment views, so the concert player can show the most watched angle when
-- several people recorded the same moment ("most viewed" = views, then likes).
--
-- A view is counted by the app after a clip has really played for 3 s. At
-- most one view per viewer, post and day (UTC): replaying, reloading or
-- calling the function in a loop does not add more. The viewer is the
-- signed-in profile, or a random per-device key for anonymous visitors.
--
-- Nobody reads the table directly: who watched what is never exposed. The
-- only public read is the per-post count of an event's published moments
-- (get_event_post_view_counts). Additive only: a new table and two
-- functions, nothing existing changes.

create table if not exists public.post_views (
  post_id uuid not null references public.posts(id) on delete cascade,
  -- 'u:<profile uuid>' or 'd:<device key>'. Never returned to clients.
  viewer_key text not null check (char_length(viewer_key) between 3 and 80),
  profile_id uuid references public.profiles(id) on delete set null,
  viewed_on date not null default ((now() at time zone 'utc')::date),
  viewed_at timestamptz not null default now(),
  constraint post_views_one_per_viewer_day primary key (post_id, viewer_key, viewed_on)
);

create index if not exists post_views_profile_idx on public.post_views (profile_id) where profile_id is not null;

comment on table public.post_views is
  'One row per viewer, post and UTC day once a moment played 3 s. Written only by record_post_view; read only as counts through get_event_post_view_counts.';

-- RLS on and no policies: anon/authenticated can neither read nor write rows.
alter table public.post_views enable row level security;
revoke all on public.post_views from anon, authenticated;
grant all on public.post_views to service_role;

-- Counts a view of a published moment. Signed in: keyed by the profile.
-- Anonymous: keyed by the device key the app keeps in local storage (a
-- random id, validated so it cannot carry anything else).
create or replace function public.record_post_view(p_post_id uuid, p_device_key text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  viewer text;
begin
  if caller is not null then
    viewer := 'u:' || caller::text;
  elsif p_device_key is not null and p_device_key ~ '^[A-Za-z0-9_-]{16,64}$' then
    viewer := 'd:' || p_device_key;
  else
    return;
  end if;

  -- Only moments the public can see; a view of your own moment does not count.
  if not exists (
    select 1 from public.posts p
    where p.id = p_post_id
      and p.status = 'published'
      and (caller is null or p.author_id <> caller)
  ) then
    return;
  end if;

  insert into public.post_views (post_id, viewer_key, profile_id)
  values (p_post_id, viewer, caller)
  on conflict on constraint post_views_one_per_viewer_day do nothing;
end;
$$;

-- Views per published moment of a concert. Moments without views are left
-- out (the app treats them as 0).
create or replace function public.get_event_post_view_counts(p_event_id uuid)
returns table (post_id uuid, views integer)
language sql
stable
security definer
set search_path = ''
as $$
  select v.post_id, count(*)::integer as views
  from public.post_views v
  join public.posts p on p.id = v.post_id
  where p.event_id = p_event_id
    and p.status = 'published'
  group by v.post_id;
$$;

revoke all on function public.record_post_view(uuid, text) from public;
revoke all on function public.get_event_post_view_counts(uuid) from public;
grant execute on function public.record_post_view(uuid, text) to anon, authenticated, service_role;
grant execute on function public.get_event_post_view_counts(uuid) to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';
