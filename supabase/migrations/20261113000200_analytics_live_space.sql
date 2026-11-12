begin;

-- Analytics — Live Space app part. The generic core is
-- 20261113000100_analytics_core.sql (schema analytics, analytics_reader,
-- excluded_users and the shared report functions); this file provides what
-- the core reads and the Live Space reports. Docs: docs/analiticas.md.
--
-- 1. public.analytics_events + public.track_events(): first-party usage
--    events, same columns, constraints, limits and grants as Lanuki's
--    public.events (ADR-157). public.events here is the concerts table.
-- 2. Retention: public.purge_analytics_events() (13 months), run weekly by
--    .github/workflows/backup-weekly.yml.
-- 3. delete_my_account(): their events lose the account (user_id → null).
-- 4. The views the core expects: raw_events, device_users, activity
--    (events ∪ write activity), activation (first published post),
--    funnel_steps, app_metrics; plus app_daily_kpis.
-- 5. Live Space reports: upload_health, scraping_health, content_report,
--    notifications_report, merch_report, suggestions_report, all
--    (p_from date, p_to date) → (metric, dimension, value).

-- ---------------------------------------------------------------------------
-- 1. Usage events
-- ---------------------------------------------------------------------------

-- One row per thing that happened in the app. Events start before there is
-- an account (the QR welcome, onboarding), so each device has a random id and
-- the account is joined when it exists. Nobody reads this table from the
-- app: only the analytics.* functions.
create table public.analytics_events (
  id bigint generated always as identity primary key,
  at timestamptz not null,
  received_at timestamptz not null default now(),
  device_id uuid not null,
  user_id uuid references auth.users (id) on delete set null,
  session_id uuid not null,
  name text not null check (name ~ '^[a-z][a-z0-9_]{0,59}$'),
  props jsonb not null default '{}' check (pg_column_size(props) < 2048),
  app_version text check (length(app_version) <= 40),
  platform text check (length(platform) <= 20),
  language text check (length(language) <= 10)
);
create index analytics_events_at on public.analytics_events (at desc);
create index analytics_events_user on public.analytics_events (user_id, at) where user_id is not null;
create index analytics_events_device on public.analytics_events (device_id, at);
create index analytics_events_name on public.analytics_events (name, at);
alter table public.analytics_events enable row level security;
-- No policies: the app writes only through track_events below. The table
-- grants Supabase adds by default go too (RLS already blocks them).
revoke all on public.analytics_events from anon, authenticated;

comment on table public.analytics_events is
  'First-party usage events (random device id; account when signed in). Written only by track_events(), read only by analytics.*; purged after 13 months.';

-- A batch of events from one device. Callable before signing in (anon), so
-- the welcome is measured too; the account, when there is one, comes from the
-- token, never from the device. At most 100 per call (the rest is ignored);
-- rows with an invalid name or session are dropped; times from the device are
-- kept but clamped to the last 30 days and never in the future; props must be
-- a JSON object under 2 KB (an oversized one fails the whole batch). Returns
-- how many rows were stored.
create function public.track_events(p_device uuid, p_events jsonb)
returns int
language sql
volatile
security definer
set search_path = ''
as $$
  with batch as (
    select e from jsonb_array_elements(case when jsonb_typeof(p_events) = 'array' then p_events else '[]' end) with ordinality as x(e, n)
    where n <= 100
  ), rows as (
    insert into public.analytics_events (at, device_id, user_id, session_id, name, props, app_version, platform, language)
    select
      least(greatest(coalesce((e ->> 'at')::timestamptz, now()), now() - interval '30 days'), now()),
      p_device, auth.uid(), (e ->> 'session')::uuid, e ->> 'name',
      case when jsonb_typeof(e -> 'props') = 'object' then e -> 'props' else '{}' end,
      left(e ->> 'v', 40), left(e ->> 'platform', 20), left(e ->> 'lang', 10)
    from batch
    where p_device is not null and (e ->> 'name') ~ '^[a-z][a-z0-9_]{0,59}$' and (e ->> 'session') ~ '^[0-9a-f-]{36}$'
    returning 1
  )
  select count(*)::int from rows
$$;
revoke all on function public.track_events(uuid, jsonb) from public;
grant execute on function public.track_events(uuid, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Retention
-- ---------------------------------------------------------------------------

-- Events older than p_keep (13 months by default, never less than 30 days)
-- go. Not callable from the app; run weekly by the purge-analytics job of
-- .github/workflows/backup-weekly.yml, or by hand in the SQL editor.
create function public.purge_analytics_events(p_keep interval default interval '13 months')
returns int
language sql
volatile
set search_path = ''
as $$
  with gone as (
    delete from public.analytics_events
    where at < now() - greatest(coalesce(p_keep, interval '13 months'), interval '30 days')
    returning 1
  )
  select count(*)::int from gone
$$;
revoke all on function public.purge_analytics_events(interval) from public, anon, authenticated;
grant execute on function public.purge_analytics_events(interval) to service_role;

-- ---------------------------------------------------------------------------
-- 3. delete_my_account(): same function as
--    20261112000200_delete_my_account_suggestions.sql plus one update — the
--    person's usage events stay (counts) but lose the account. The FK does
--    it too (on delete set null); explicit so the intent is visible. The
--    device id is random and, without the account, links to nobody.
-- ---------------------------------------------------------------------------

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  queued integer := 0;
  deleted_posts integer := 0;
  deleted_media integer := 0;
  anonymised_views integer := 0;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  -- One deletion at a time per account (a double tap sends two calls).
  perform pg_advisory_xact_lock(hashtextextended(caller::text || ':delete-account', 0));

  if not exists (select 1 from auth.users where id = caller) then
    return jsonb_build_object('deleted', false, 'reason', 'already_deleted');
  end if;

  -- Files first, while the rows that name them still exist. R2 videos are
  -- addressed by storage_key; everything else lives in Cloudinary under its
  -- public_id (video posters and photos included: each is its own row).
  -- Only personal uploads (subject_id null): a poster uploaded as manager of
  -- an artist or venue (purpose 'catalog') belongs to that shared entity and
  -- events.image_url keeps pointing at it, so its file stays; its row goes.
  insert into public.media_deletion_queue (provider, object_key, resource_type, reason)
  select distinct
    case when m.storage_provider = 'r2' then 'r2' else 'cloudinary' end,
    case when m.storage_provider = 'r2' then m.storage_key else m.cloudinary_public_id end,
    m.resource_type,
    'account_deleted'
  from public.media_assets m
  where m.owner_id = caller
    and m.subject_id is null
    and (case when m.storage_provider = 'r2' then m.storage_key else m.cloudinary_public_id end) is not null
  on conflict on constraint media_deletion_queue_object_key do nothing;
  get diagnostics queued = row_count;

  -- Their views of other people's moments: keep the count, drop the link.
  update public.post_views
  set viewer_key = 'x:' || md5(viewer_key || extensions.gen_random_uuid()::text),
      profile_id = null
  where profile_id = caller or viewer_key = 'u:' || caller::text;
  get diagnostics anonymised_views = row_count;

  -- Their usage events: keep the counts, drop the account.
  update public.analytics_events set user_id = null where user_id = caller;

  -- Posts (likes, views and reports' targets go with them by cascade or stay
  -- as dangling ids), then the media rows, which RESTRICT the profile.
  delete from public.posts where author_id = caller;
  get diagnostics deleted_posts = row_count;
  delete from public.media_assets where owner_id = caller;
  get diagnostics deleted_media = row_count;

  -- Shared entities stay; the person's access to them goes. (The cascade
  -- would do it too; explicit so the intent is visible.)
  delete from public.entity_memberships where profile_id = caller;
  delete from public.entity_claims where claimant_id = caller;

  -- Push: the device tokens first, so nothing more is sent to this person
  -- even if something below fails; then their switches and the sent log.
  -- (All three cascade from profiles too; explicit so the intent is visible.)
  delete from public.push_devices where profile_id = caller;
  delete from public.notification_preferences where profile_id = caller;
  delete from public.notifications_sent where profile_id = caller;

  -- Ticket links they sent from «¿No encuentras un concierto?» (cascades
  -- from profiles too). The concerts imported from them stay.
  delete from public.event_link_suggestions where suggested_by = caller;

  -- The rest cascades from auth.users → profiles → subjects: profile,
  -- follows (both ways), saves, attendance, likes, blocks (both ways),
  -- reports they sent, venue tags, upload reservations, identities and
  -- sessions. created_by/reviewed_by/buyer_id columns become null.
  delete from auth.users where id = caller;

  return jsonb_build_object(
    'deleted', true,
    'posts', deleted_posts,
    'media', deleted_media,
    'files_queued', queued,
    'views_anonymised', anonymised_views
  );
end;
$$;

comment on function public.delete_my_account() is
  'Deletes the caller''s account and everything tied to it; queues their files in media_deletion_queue; their usage events lose the account. Only acts on auth.uid().';

revoke all on function public.delete_my_account() from public;
revoke execute on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. What the core reads
-- ---------------------------------------------------------------------------

create or replace view analytics.raw_events as
  select at, received_at, device_id, user_id, session_id, name, props,
         app_version, platform, language
  from public.analytics_events;

-- A device's events before signing in belong to whoever signed in on it first.
create or replace view analytics.device_users as
  select device_id, (array_agg(user_id order by at))[1] as user_id, min(at) as first_seen
  from public.analytics_events where user_id is not null group by device_id;

-- «Active» = a usage event with an account, OR any write the person makes in
-- the app (so the metrics work before and alongside the events): a moment
-- (post), an upload reservation, «Voy/Fui/Me interesa» (attendance, last
-- change), a follow, a saved concert, a like, a moment seen while signed in,
-- the push device registered/refreshed at app start, a merch order, a link
-- or setlist suggestion, venue feedback. Rows deleted later (deleted posts,
-- unfollows, removed devices) stop counting.
create or replace view analytics.activity as
  select e.user_id, e.at, 'event'::text as source
    from public.analytics_events e where e.user_id is not null
  union all select p.author_id, p.created_at, 'post' from public.posts p
  union all select r.user_id, r.created_at, 'upload' from public.media_upload_reservations r
  union all select a.profile_id, a.updated_at, 'attendance' from public.event_attendance a
  union all select s.profile_id, f.created_at, 'follow'
    from public.follows f join public.subjects s on s.id = f.follower_subject_id
    where s.profile_id is not null
  union all select v.profile_id, v.created_at, 'save' from public.event_saves v
  union all select l.profile_id, l.created_at, 'like' from public.post_likes l
  union all select w.profile_id, w.viewed_at, 'view' from public.post_views w where w.profile_id is not null
  union all select d.profile_id, d.last_seen_at, 'push' from public.push_devices d
  union all select o.buyer_id, o.created_at, 'merch' from public.merch_orders o where o.buyer_id is not null
  union all select g.suggested_by, g.created_at, 'suggestion' from public.event_link_suggestions g
  union all select q.proposed_by, q.created_at, 'setlist' from public.setlist_proposals q
  union all select b.profile_id, b.created_at, 'feedback' from public.venue_feedback b;

-- The «aha»: the first published moment.
create or replace view analytics.activation as
  select p.author_id as user_id, min(p.created_at) as activated_at
  from public.posts p
  where p.status = 'published'
  group by p.author_id;

-- Funnel: open the app → start an upload → sign in (deferred to publishing)
-- → upload done. First time each device reached each step.
create or replace view analytics.funnel_steps as
  select s.ord, s.step, e.device_id, min(e.at) as reached_at
  from (values (1, 'app_open'), (2, 'upload_start'), (3, 'sign_in'), (4, 'upload_done')) as s(ord, step)
  join public.analytics_events e on e.name = s.step
  group by s.ord, s.step, e.device_id;

revoke all on analytics.raw_events, analytics.device_users, analytics.activity,
  analytics.activation, analytics.funnel_steps from public;
revoke all on analytics.raw_events, analytics.device_users, analytics.activity,
  analytics.activation, analytics.funnel_steps from anon, authenticated;

-- Internal: is this account a team/test one?
create or replace function analytics._is_excluded(p_user uuid)
returns boolean
language sql
stable
set search_path = ''
as $$ select exists (select 1 from analytics.excluded_users x where x.user_id = p_user) $$;
revoke all on function analytics._is_excluded(uuid) from public;

-- Live Space metrics appended to analytics.daily_kpis.
--   push_optin_users  people with an active push device at the end of the day
--                     (devices removed since are not counted)
--   revenue_cents     merch collected that day: paid_cents (at the stand) or
--                     total_cents (in the app) of orders paid that day that
--                     are paid or collected
--   posts             moments created that day (still existing)
--   uploads           upload reservations created that day
--   premium_active, trials_started, trials_converted: 0 (no premium yet)
create or replace function analytics.app_daily_kpis(p_from date, p_to date)
returns table (day date, metric text, value numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with r as (
    select analytics.timezone() as tz, coalesce(p_from, analytics._today() - 29) as d0, coalesce(p_to, analytics._today()) as d1
  ), days as (
    select g::date as day, ((g::date + 1)::timestamp at time zone r.tz) as day_end, r.tz
    from r, generate_series(r.d0, r.d1, interval '1 day') g
  )
  select d.day, v.metric, v.value::numeric
  from days d
  cross join lateral (values
    ('push_optin_users', (select count(distinct pd.profile_id) from public.push_devices pd
                          where pd.created_at < d.day_end
                            and (pd.disabled_at is null or pd.disabled_at >= d.day_end)
                            and not analytics._is_excluded(pd.profile_id))),
    ('revenue_cents', (select coalesce(sum(coalesce(o.paid_cents, o.total_cents)), 0) from public.merch_orders o
                       where o.status in ('paid', 'collected') and o.paid_at is not null
                         and (o.paid_at at time zone d.tz)::date = d.day
                         and not analytics._is_excluded(o.buyer_id))),
    ('posts', (select count(*) from public.posts p
               where (p.created_at at time zone d.tz)::date = d.day and not analytics._is_excluded(p.author_id))),
    ('uploads', (select count(*) from public.media_upload_reservations u
                 where (u.created_at at time zone d.tz)::date = d.day and not analytics._is_excluded(u.user_id))),
    ('premium_active', 0::bigint),
    ('trials_started', 0::bigint),
    ('trials_converted', 0::bigint)
  ) as v(metric, value)
$$;
revoke all on function analytics.app_daily_kpis(date, date) from public;

-- ---------------------------------------------------------------------------
-- 5. Live Space reports — (p_from date, p_to date) → (metric, dimension,
--    value); days in analytics.timezone(); null dates = last 30 days;
--    excluded users left out.
-- ---------------------------------------------------------------------------

create or replace function analytics.upload_health(p_from date, p_to date)
returns table (metric text, dimension text, value numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select coalesce(p_from, analytics._today() - 29)::timestamp at time zone analytics.timezone() as t0,
           (coalesce(p_to, analytics._today()) + 1)::timestamp at time zone analytics.timezone() as t1,
           analytics.timezone() as tz
  ), res as (
    select r.* from public.media_upload_reservations r, t
    where r.created_at >= t.t0 and r.created_at < t.t1 and not analytics._is_excluded(r.user_id)
  ), assets as (
    select m.* from public.media_assets m, t
    where m.created_at >= t.t0 and m.created_at < t.t1 and not analytics._is_excluded(m.owner_id)
  ), posts as (
    select p.* from public.posts p, t
    where p.created_at >= t.t0 and p.created_at < t.t1 and not analytics._is_excluded(p.author_id)
  ), ev as (
    select e.* from t, analytics._events(t.t0, t.t1) e where e.name like 'upload\_%'
  ), publish as (
    select extract(epoch from p.created_at - r.created_at)::numeric as secs
    from posts p
    join public.media_assets m on m.id = p.media_asset_id
    join public.media_upload_reservations r on r.id = m.reservation_id
  )
  select 'reservations', res.kind::text, count(*)::numeric from res group by 2
  union all select 'reservations_by_provider', res.storage_provider, count(*) from res group by 2
  union all select 'reservations_consumed', res.kind::text, count(*) from res
    where res.consumed_at is not null and res.rejected_reason is null group by 2
  union all select 'reservation_asset_rate', res.kind::text,
    round(avg(case when exists (select 1 from public.media_assets m where m.reservation_id = res.id) then 1 else 0 end), 3)
    from res group by 2
  union all select 'rejected', left(res.rejected_reason, 120), count(*) from res
    where res.rejected_reason is not null group by 2
  union all select 'expired_unconsumed', res.kind::text, count(*) from res
    where res.consumed_at is null and res.rejected_reason is null and res.expires_at < now() group by 2
  union all select 'assets', assets.kind::text || ':' || assets.status::text, count(*) from assets group by 2
  union all select 'assets_by_provider', assets.storage_provider, count(*) from assets group by 2
  union all select 'bytes_total', assets.kind::text, coalesce(sum(assets.bytes), 0) from assets group by 2
  union all select 'bytes_p50', assets.kind::text,
    round((percentile_cont(0.5) within group (order by assets.bytes))::numeric) from assets
    where assets.bytes is not null group by 2
  union all select 'video_duration_seconds', 'p50',
    round((percentile_cont(0.5) within group (order by assets.duration_seconds))::numeric, 1) from assets
    where assets.kind = 'video' and assets.duration_seconds is not null having count(*) > 0
  union all select 'video_duration_seconds', 'p90',
    round((percentile_cont(0.9) within group (order by assets.duration_seconds))::numeric, 1) from assets
    where assets.kind = 'video' and assets.duration_seconds is not null having count(*) > 0
  union all select 'posts', posts.source, count(*) from posts group by 2
  union all select 'posts_per_day', ((posts.created_at at time zone t.tz)::date)::text, count(*) from posts, t group by 2
  union all select 'time_to_publish_seconds', 'p50',
    round((percentile_cont(0.5) within group (order by publish.secs))::numeric) from publish having count(*) > 0
  union all select 'time_to_publish_seconds', 'p90',
    round((percentile_cont(0.9) within group (order by publish.secs))::numeric) from publish having count(*) > 0
  union all select 'client_events', ev.name, count(*) from ev group by 2
  union all select 'client_upload_failed', coalesce(ev.props ->> 'reason', '(none)'), count(*) from ev
    where ev.name = 'upload_failed' group by 2
$$;

comment on function analytics.upload_health(date, date) is
  'Uploads between two days, (metric, dimension, value): reservations / reservations_consumed / expired_unconsumed by kind; reservations_by_provider; reservation_asset_rate by kind (share of reservations that produced a media asset, 0–1); rejected by reason; assets by kind:status; assets_by_provider; bytes_total and bytes_p50 by kind; video_duration_seconds p50/p90; posts by source; posts_per_day by day; time_to_publish_seconds p50/p90 (reservation → post); client_events (upload_* usage events) by name; client_upload_failed by reason.';

create or replace function analytics.scraping_health(p_from date, p_to date)
returns table (metric text, dimension text, value numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select coalesce(p_from, analytics._today() - 6)::timestamp at time zone analytics.timezone() as t0,
           (coalesce(p_to, analytics._today()) + 1)::timestamp at time zone analytics.timezone() as t1
  ), runs as (
    select r.* from public.scrape_runs r, t where r.created_at >= t.t0 and r.created_at < t.t1
  ), src as (
    select s.* from public.scrape_sources s where s.is_active
  ), stale as (
    select s.name, round(extract(epoch from now() - coalesce(s.last_success_at, s.created_at)) / 3600) as hours
    from src s where s.last_success_at is null or s.last_success_at < now() - interval '48 hours'
  ), staging as (
    select g.* from public.staging_events g, t where g.created_at >= t.t0 and g.created_at < t.t1
  )
  select 'runs', runs.status::text, count(*)::numeric from runs group by 2
  union all select 'runs_with_published_events', '', count(*) from runs where runs.published_count > 0
  union all select * from (
    select 'run_errors'::text, left(runs.error_message, 120), count(*)::numeric from runs
    where runs.error_message is not null group by 2 order by 3 desc limit 10) e
  union all select 'sources_active', '', count(*) from src
  union all select 'stale_sources', '', count(*) from stale
  union all select 'stale_source_hours', stale.name, stale.hours from stale
  union all select 'health_score_avg', '', round(avg(src.health_score), 3) from src having count(src.health_score) > 0
  union all select 'health_score_min', '', min(src.health_score) from src having count(src.health_score) > 0
  union all select 'staging', staging.review_status::text, count(*) from staging group by 2
  union all select * from (
    select 'staging_errors'::text, left(staging.processing_error, 120), count(*)::numeric from staging
    where staging.processing_error is not null group by 2 order by 3 desc limit 10) g
  union all select 'open_alerts', a.alert_type || ':' || a.severity, count(*)
    from public.scrape_watch_alerts a where a.status = 'open' group by 2
  union all select 'watch_state', w.status, count(*) from public.scrape_source_watch_state w group by 2
  union all select 'discovery_runs', d.status, count(*)
    from public.venue_discovery_runs d, t where d.started_at >= t.t0 and d.started_at < t.t1 group by 2
$$;

comment on function analytics.scraping_health(date, date) is
  'Concert scraping, (metric, dimension, value). In the range (null = last 7 days): runs by status, runs_with_published_events, run_errors (top 10 messages), staging by review_status, staging_errors (top 10), discovery_runs by status. Now: sources_active, stale_sources (active, no success for 48 h), stale_source_hours by source name, health_score_avg/min of active sources, open_alerts by alert_type:severity, watch_state by status.';

create or replace function analytics.content_report(p_from date, p_to date)
returns table (metric text, dimension text, value numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select coalesce(p_from, analytics._today() - 29) as d0, coalesce(p_to, analytics._today()) as d1,
           coalesce(p_from, analytics._today() - 29)::timestamp at time zone analytics.timezone() as t0,
           (coalesce(p_to, analytics._today()) + 1)::timestamp at time zone analytics.timezone() as t1
  ), concerts as (
    select e.* from public.events e, t
    where e.status = 'published' and e.starts_at >= t.t0 and e.starts_at < t.t1
  ), moments as (
    select c.id, count(p.id) as n
    from concerts c
    join public.posts p on p.event_id = c.id and p.status = 'published' and not analytics._is_excluded(p.author_id)
    group by c.id
  )
  select 'concerts', '', count(*)::numeric from concerts
  union all select 'concerts_with_moments', '', count(*) from moments
  union all select 'moments_per_concert', 'p50', (percentile_cont(0.5) within group (order by moments.n))::numeric
    from moments having count(*) > 0
  union all select 'moments_per_concert', 'p90', (percentile_cont(0.9) within group (order by moments.n))::numeric
    from moments having count(*) > 0
  union all select 'moments_per_concert', 'max', max(moments.n) from moments having count(*) > 0
  union all select 'moments', p.source, count(*)
    from concerts c join public.posts p on p.event_id = c.id
    where p.status = 'published' and not analytics._is_excluded(p.author_id) group by 2
  union all select 'attendance', a.status::text, count(*)
    from concerts c join public.event_attendance a on a.event_id = c.id
    where not analytics._is_excluded(a.profile_id) group by 2
  union all select 'concerts_with_setlist', '', count(*) from concerts c
    where exists (select 1 from public.event_setlist_items i where i.event_id = c.id)
  union all select 'posters', 'with_image', count(*) from concerts c where c.image_url is not null
  union all select 'posters', 'mirrored', count(*) from concerts c where c.poster_thumb_url is not null
  union all select 'posters', 'mirror_coverage',
    round(count(*) filter (where c.poster_thumb_url is not null)::numeric / nullif(count(*) filter (where c.image_url is not null), 0), 3)
    from concerts c
  union all select 'poster_mirrors', m.status, count(*) from public.poster_mirrors m group by 2
  union all select 'post_views', '', count(*) from public.post_views v, t where v.viewed_on between t.d0 and t.d1
  union all select 'likes', '', count(*) from public.post_likes l, t
    where l.created_at >= t.t0 and l.created_at < t.t1 and not analytics._is_excluded(l.profile_id)
$$;

comment on function analytics.content_report(date, date) is
  'Content of the published concerts starting between two days, (metric, dimension, value): concerts, concerts_with_moments, moments_per_concert p50/p90/max (concerts with moments), moments by source, attendance by status, concerts_with_setlist, posters with_image / mirrored / mirror_coverage (0–1). Also poster_mirrors by status (all time), post_views (moment views in the range) and likes given in the range.';

create or replace function analytics.notifications_report(p_from date, p_to date)
returns table (metric text, dimension text, value numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select coalesce(p_from, analytics._today() - 29)::timestamp at time zone analytics.timezone() as t0,
           (coalesce(p_to, analytics._today()) + 1)::timestamp at time zone analytics.timezone() as t1
  ), sent as (
    select n.* from public.notifications_sent n, t
    where n.sent_at >= t.t0 and n.sent_at < t.t1 and not analytics._is_excluded(n.profile_id)
  ), ev as (
    select e.* from t, analytics._events(t.t0, t.t1) e
    where e.name in ('notification_tapped', 'push_prompt', 'push_granted', 'push_denied')
  ), prefs as (
    select p.* from public.notification_preferences p where not analytics._is_excluded(p.profile_id)
  )
  select 'sent', sent.type, count(*)::numeric from sent group by 2
  union all select 'recipients', '', count(distinct sent.profile_id) from sent
  union all select 'tapped', coalesce(ev.props ->> 'type', '(none)'), count(*) from ev where ev.name = 'notification_tapped' group by 2
  union all select 'push_permission', ev.name, count(*) from ev where ev.name <> 'notification_tapped' group by 2
  union all select 'push_devices_active', d.platform, count(*) from public.push_devices d
    where d.disabled_at is null and not analytics._is_excluded(d.profile_id) group by 2
  union all select 'push_devices_disabled', '', count(*) from public.push_devices d
    where d.disabled_at is not null and not analytics._is_excluded(d.profile_id)
  union all select 'preference_off', 'all', count(*) from prefs where not prefs.enabled
  union all select 'preference_off', 'concert_day', count(*) from prefs where not prefs.concert_day
  union all select 'preference_off', 'upload_reminder', count(*) from prefs where not prefs.upload_reminder
  union all select 'preference_off', 'merch_pickup', count(*) from prefs where not prefs.merch_pickup
  union all select 'preference_off', 'new_moments', count(*) from prefs where not prefs.new_moments
  union all select 'preference_off', 'followed_new_concert', count(*) from prefs where not prefs.followed_new_concert
  union all select 'preference_off', 'suggestion_imported', count(*) from prefs where not prefs.suggestion_imported
$$;

comment on function analytics.notifications_report(date, date) is
  'Push notices, (metric, dimension, value). In the range: sent by type, recipients, tapped by type (notification_tapped events), push_permission by event (push_prompt / push_granted / push_denied). Now: push_devices_active by platform, push_devices_disabled, preference_off by switch (all = master switch).';

create or replace function analytics.merch_report(p_from date, p_to date)
returns table (metric text, dimension text, value numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select coalesce(p_from, analytics._today() - 29)::timestamp at time zone analytics.timezone() as t0,
           (coalesce(p_to, analytics._today()) + 1)::timestamp at time zone analytics.timezone() as t1
  ), orders as (
    select o.* from public.merch_orders o, t
    where o.created_at >= t.t0 and o.created_at < t.t1 and not analytics._is_excluded(o.buyer_id)
  ), paid as (
    select o.* from public.merch_orders o, t
    where o.status in ('paid', 'collected') and o.paid_at >= t.t0 and o.paid_at < t.t1
      and not analytics._is_excluded(o.buyer_id)
  ), lines as (
    select l.* from public.merch_order_lines l join paid on paid.id = l.order_id
  )
  select 'orders', orders.status::text, count(*)::numeric from orders group by 2
  union all select 'orders_by_method', orders.payment_method, count(*) from orders group by 2
  union all select 'buyers', '', count(distinct orders.buyer_id) from orders
  union all select 'sellers', '', count(distinct orders.seller_subject_id) from orders
  union all select 'concerts', '', count(distinct orders.event_id) from orders
  union all select 'paid_cents', paid.payment_method, coalesce(sum(coalesce(paid.paid_cents, paid.total_cents)), 0) from paid group by 2
  union all select 'fee_cents', '', coalesce(sum(paid.fee_cents), 0) from paid
  union all select 'units', '', coalesce(sum(lines.quantity), 0) from lines
  union all select * from (
    select 'top_items'::text, lines.item_name, sum(lines.quantity)::numeric from lines
    group by 2 order by 3 desc limit 10) i
  union all select 'client_events', e.name, count(*) from t, analytics._events(t.t0, t.t1) e
    where e.name = 'merch_order_start' group by 2
$$;

comment on function analytics.merch_report(date, date) is
  'Merch, (metric, dimension, value): orders created in the range by status and by payment_method, buyers, sellers, concerts; of orders paid in the range (paid or collected): paid_cents by payment_method (paid_cents at the stand, else total_cents), fee_cents, units, top_items (top 10 by units); client_events merch_order_start.';

create or replace function analytics.suggestions_report(p_from date, p_to date)
returns table (metric text, dimension text, value numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select coalesce(p_from, analytics._today() - 29)::timestamp at time zone analytics.timezone() as t0,
           (coalesce(p_to, analytics._today()) + 1)::timestamp at time zone analytics.timezone() as t1
  ), links as (
    select s.* from public.event_link_suggestions s, t
    where s.created_at >= t.t0 and s.created_at < t.t1 and not analytics._is_excluded(s.suggested_by)
  ), setlists as (
    select s.* from public.setlist_proposals s, t
    where s.created_at >= t.t0 and s.created_at < t.t1 and not analytics._is_excluded(s.proposed_by)
  )
  select 'link_suggestions', links.status, count(*)::numeric from links group by 2
  union all select * from (
    select 'link_hosts'::text, links.url_host, count(*)::numeric from links group by 2 order by 3 desc limit 10) h
  union all select 'setlist_proposals', setlists.status, count(*) from setlists group by 2
  union all select 'setlist_review_hours', 'p50',
    round((percentile_cont(0.5) within group (order by extract(epoch from setlists.reviewed_at - setlists.created_at) / 3600))::numeric, 1)
    from setlists where setlists.reviewed_at is not null having count(*) > 0
  union all select 'concert_proposals', p.reviewer || ':' || p.status, count(*)
    from public.event_proposals p, t
    where p.created_at >= t.t0 and p.created_at < t.t1 and not analytics._is_excluded(p.proposed_by) group by 2
  union all select 'entity_claims', c.status, count(*)
    from public.entity_claims c, t
    where c.created_at >= t.t0 and c.created_at < t.t1 and not analytics._is_excluded(c.claimant_id) group by 2
  union all select 'venue_feedback', '', count(*)
    from public.venue_feedback f, t
    where f.created_at >= t.t0 and f.created_at < t.t1 and not analytics._is_excluded(f.profile_id)
  union all select 'client_events', e.name, count(*) from t, analytics._events(t.t0, t.t1) e
    where e.name in ('suggestion_sent', 'setlist_proposed') group by 2
$$;

comment on function analytics.suggestions_report(date, date) is
  'What the audience proposes, created in the range, (metric, dimension, value): link_suggestions by status, link_hosts (top 10), setlist_proposals by status, setlist_review_hours p50, concert_proposals by reviewer:status, entity_claims by status, venue_feedback, client_events (suggestion_sent, setlist_proposed).';

-- The app's report functions, for analytics.list_metrics().
create or replace view analytics.app_metrics as
  select 'analytics.' || p.proname || '(' || pg_catalog.pg_get_function_arguments(p.oid) || ')' as fn,
         coalesce(pg_catalog.obj_description(p.oid, 'pg_proc'), '') as description
  from pg_catalog.pg_proc p
  where p.pronamespace = 'analytics'::regnamespace
    and p.proname in ('upload_health', 'scraping_health', 'content_report',
                      'notifications_report', 'merch_report', 'suggestions_report');
revoke all on analytics.app_metrics from public;
revoke all on analytics.app_metrics from anon, authenticated;

revoke all on function analytics.upload_health(date, date) from public;
revoke all on function analytics.scraping_health(date, date) from public;
revoke all on function analytics.content_report(date, date) from public;
revoke all on function analytics.notifications_report(date, date) from public;
revoke all on function analytics.merch_report(date, date) from public;
revoke all on function analytics.suggestions_report(date, date) from public;

grant execute on function analytics.upload_health(date, date) to analytics_reader;
grant execute on function analytics.scraping_health(date, date) to analytics_reader;
grant execute on function analytics.content_report(date, date) to analytics_reader;
grant execute on function analytics.notifications_report(date, date) to analytics_reader;
grant execute on function analytics.merch_report(date, date) to analytics_reader;
grant execute on function analytics.suggestions_report(date, date) to analytics_reader;

commit;

notify pgrst, 'reload schema';
