begin;

-- ===========================================================================
-- ANALYTICS CORE — generic, identical in every app (copy this file verbatim)
-- ===========================================================================
--
-- Template: docs/analytics-core.sql is the same file; keep both identical.
-- Shared by Live Space, Lanuki and any future Supabase app. Docs (Spanish):
-- docs/analiticas.md in the Live Space repository.
--
-- The core owns: schema analytics, role analytics_reader (created only if
-- missing), table analytics.excluded_users (created only if missing),
-- analytics.timezone(), internal helpers analytics._today/_signups/_events/_activity
-- and the shared report functions daily_kpis, cohort_retention,
-- event_summary, funnel, user_journey, weekly_report and list_metrics.
--
-- The APP PART (each app's own migration) must define these views in schema
-- analytics; the core reads them only at call time, so either part can be
-- created first:
--   raw_events(at, received_at, device_id, user_id, session_id, name, props,
--              app_version, platform, language)   the usage-events table
--   device_users(device_id, user_id, first_seen)  first account per device
--   activity(user_id uuid, at timestamptz, source text)
--                                                 «active» for dau/wau/mau
--                                                 and retention
--   activation(user_id uuid, activated_at timestamptz)   the «aha» moment
--   funnel_steps(ord int, step text, device_id uuid, reached_at timestamptz)
--                                                 one row per device and
--                                                 reached step
--   app_metrics(fn text, description text)        the app's own report
--                                                 functions, for list_metrics
-- Optional: function analytics.app_daily_kpis(p_from date, p_to date)
--   returns table(day date, metric text, value numeric) — app metrics
--   appended to daily_kpis when it exists.
-- App report functions use (p_from date, p_to date)
--   returns table(metric text, dimension text, value numeric).
--
-- Access: analytics_reader (NOLOGIN until the owner sets a password by hand)
-- gets USAGE on schema analytics and EXECUTE on report functions only:
-- nothing in public, auth or storage, no table or view (not even in
-- analytics). Report functions are SECURITY DEFINER (owner postgres),
-- search_path '', and return aggregates or pseudonymous rows. Accounts in
-- analytics.excluded_users (team, tests) are left out everywhere, together
-- with their devices' pre-login events. anon/authenticated get nothing here.

-- Function bodies reference app views that may not exist yet.
set local check_function_bodies = off;

create schema if not exists analytics;
revoke all on schema analytics from public;
revoke all on schema analytics from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'analytics_reader') then
    create role analytics_reader nologin;
  end if;
end
$$;

-- Long reports must not hold a pooler connection forever.
alter role analytics_reader set statement_timeout = '30s';

grant usage on schema analytics to analytics_reader;

create table if not exists analytics.excluded_users (
  user_id uuid primary key,
  note text
);
revoke all on analytics.excluded_users from public;
revoke all on analytics.excluded_users from anon, authenticated;

-- Day boundaries of every daily metric.
create or replace function analytics.timezone()
returns text
language sql
immutable
set search_path = ''
as $$ select 'Europe/Madrid'::text $$;

-- Today in that timezone (current_date would follow the session's timezone,
-- UTC through the pooler). Null dates in every report default from here.
create or replace function analytics._today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone analytics.timezone())::date $$;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by the reader)
-- ---------------------------------------------------------------------------

-- Real accounts (not anonymous, not excluded); provider = first sign-in method.
create or replace function analytics._signups()
returns table (user_id uuid, signed_up_at timestamptz, provider text)
language sql
stable
set search_path = ''
as $$
  select u.id, u.created_at, coalesce(u.raw_app_meta_data ->> 'provider', 'email')
  from auth.users u
  where coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, false) = false
    and not exists (select 1 from analytics.excluded_users x where x.user_id = u.id)
$$;

-- Usage events in [p_t0, p_t1) with the person resolved (the account, or the
-- device's first account for pre-login events); excluded people removed.
create or replace function analytics._events(p_t0 timestamptz, p_t1 timestamptz)
returns table (at timestamptz, device_id uuid, user_id uuid, person uuid, session_id uuid,
               name text, props jsonb, app_version text, platform text)
language sql
stable
set search_path = ''
as $$
  select e.at, e.device_id, e.user_id, coalesce(e.user_id, d.user_id), e.session_id,
         e.name, e.props, e.app_version, e.platform
  from analytics.raw_events e
  left join analytics.device_users d on d.device_id = e.device_id
  where e.at >= p_t0 and e.at < p_t1
    and not exists (select 1 from analytics.excluded_users x
                    where x.user_id = coalesce(e.user_id, d.user_id))
$$;

-- Activity in [p_t0, p_t1), excluded people removed.
create or replace function analytics._activity(p_t0 timestamptz, p_t1 timestamptz)
returns table (user_id uuid, at timestamptz)
language sql
stable
set search_path = ''
as $$
  select a.user_id, a.at
  from analytics.activity a
  where a.at >= p_t0 and a.at < p_t1 and a.user_id is not null
    and not exists (select 1 from analytics.excluded_users x where x.user_id = a.user_id)
$$;

-- ---------------------------------------------------------------------------
-- Shared report functions
-- ---------------------------------------------------------------------------

create or replace function analytics.daily_kpis(p_from date, p_to date)
returns table (day date, metric text, value numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  tz text := analytics.timezone();
  d0 date := coalesce(p_from, analytics._today() - 29);
  d1 date := least(coalesce(p_to, analytics._today()), coalesce(p_from, analytics._today() - 29) + 400);
  t0 timestamptz := d0::timestamp at time zone tz;
  t1 timestamptz := (d1 + 1)::timestamp at time zone tz;
begin
  return query
  with days as (
    select g::date as day from generate_series(d0, d1, interval '1 day') g
  ), s as (
    select (s.signed_up_at at time zone tz)::date as day, s.user_id, s.provider, s.signed_up_at
    from analytics._signups() s
    where s.signed_up_at >= t0 and s.signed_up_at < t1
  ), act as (
    select distinct a.user_id, (a.at at time zone tz)::date as day
    from analytics._activity(t0 - interval '30 days', t1) a
  ), ev as (
    select (e.at at time zone tz)::date as day, e.session_id, e.device_id, e.platform, e.name
    from analytics._events(t0, t1) e
  )
  select d.day, v.metric, v.value::numeric
  from days d
  cross join lateral (values
    ('signups', (select count(*) from s where s.day = d.day)),
    ('signups_email', (select count(*) from s where s.day = d.day and s.provider = 'email')),
    ('signups_google', (select count(*) from s where s.day = d.day and s.provider = 'google')),
    ('signups_apple', (select count(*) from s where s.day = d.day and s.provider = 'apple')),
    ('dau', (select count(distinct a.user_id) from act a where a.day = d.day)),
    ('wau', (select count(distinct a.user_id) from act a where a.day between d.day - 6 and d.day)),
    ('mau', (select count(distinct a.user_id) from act a where a.day between d.day - 29 and d.day)),
    ('sessions', (select count(distinct e.session_id) from ev e where e.day = d.day)),
    ('activated', (select count(*) from s join analytics.activation x on x.user_id = s.user_id
                   where s.day = d.day and x.activated_at < s.signed_up_at + interval '7 days')),
    ('platform_ios', (select count(distinct e.device_id) from ev e where e.day = d.day and e.platform = 'ios')),
    ('platform_android', (select count(distinct e.device_id) from ev e where e.day = d.day and e.platform = 'android')),
    ('platform_web', (select count(distinct e.device_id) from ev e where e.day = d.day and e.platform = 'web')),
    ('errors', (select count(*) from ev e where e.day = d.day and e.name = 'error')),
    ('sessions_with_error', (select count(distinct e.session_id) from ev e where e.day = d.day and e.name = 'error'))
  ) as v(metric, value);

  if to_regprocedure('analytics.app_daily_kpis(date, date)') is not null then
    return query execute
      'select k.day, k.metric, k.value::numeric from analytics.app_daily_kpis($1, $2) k where k.day between $1 and $2'
      using d0, d1;
  end if;
end;
$$;

comment on function analytics.daily_kpis(date, date) is
  'Daily KPIs, long format (day, metric, value); days in analytics.timezone(), max 401, null dates = last 30 days. signups, signups_email/_google/_apple: accounts created that day by first provider. dau/wau/mau: distinct users in analytics.activity that day / in the 7 / 30 days ending that day. sessions: distinct session ids in usage events. activated: of that day''s signups, those reaching analytics.activation within 7 days (the last 7 days are still open). platform_ios/_android/_web: distinct devices with events. errors / sessions_with_error: error events. Plus the app metrics of analytics.app_daily_kpis when the app defines it.';

create or replace function analytics.cohort_retention(p_period text default 'week', p_last int default 8)
returns table (cohort date, users int, d1 numeric, d7 numeric, d30 numeric, recurrent int)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  tz text := analytics.timezone();
  per text := case when p_period in ('day', 'week', 'month') then p_period else 'week' end;
  n int := greatest(1, least(coalesce(p_last, 8), 104));
  step interval := ('1 ' || per)::interval;
  today date := (now() at time zone tz)::date;
  last_cohort date := date_trunc(per, now() at time zone tz)::date;
  first_cohort date := (last_cohort - (n - 1) * step)::date;
  t0 timestamptz := first_cohort::timestamp at time zone tz;
begin
  return query
  with cohorts as (
    select g::date as cohort from generate_series(first_cohort, last_cohort, step) g
  ), s as (
    select s.user_id, (s.signed_up_at at time zone tz)::date as sday,
           date_trunc(per, s.signed_up_at at time zone tz)::date as cohort
    from analytics._signups() s
    where s.signed_up_at >= t0
  ), act as (
    select distinct a.user_id, (a.at at time zone tz)::date as day
    from analytics._activity(t0, now() + interval '1 day') a
    where a.user_id in (select s.user_id from s)
  ), per_user as (
    select s.user_id, s.cohort, s.sday,
           coalesce(bool_or(a.day = s.sday + 1), false) as r1,
           coalesce(bool_or(a.day between s.sday + 7 and s.sday + 13), false) as r7,
           coalesce(bool_or(a.day between s.sday + 30 and s.sday + 59), false) as r30,
           count(distinct a.day) filter (where a.day > s.sday) as active_days
    from s left join act a on a.user_id = s.user_id
    group by s.user_id, s.cohort, s.sday
  )
  select c.cohort,
         count(u.user_id)::int,
         round(avg(case when u.r1 then 1 else 0 end) filter (where u.sday + 1 <= today), 3),
         round(avg(case when u.r7 then 1 else 0 end) filter (where u.sday + 7 <= today), 3),
         round(avg(case when u.r30 then 1 else 0 end) filter (where u.sday + 30 <= today), 3),
         (count(*) filter (where u.active_days >= 2))::int
  from cohorts c
  left join per_user u on u.cohort = c.cohort
  group by c.cohort
  order by c.cohort;
end;
$$;

comment on function analytics.cohort_retention(text, int) is
  'Signup cohorts (p_period day|week|month, the last p_last ≤ 104 including the current one). users: signups. d1: share active the day after signing up; d7: active on any of days 7–13; d30: active on any of days 30–59 (fractions 0–1 over the users whose window has started; null when none has). recurrent: users active on 2+ distinct days after their signup day. Activity = analytics.activity.';

create or replace function analytics.event_summary(p_from date, p_to date, p_breakdown text default 'name')
returns table (bucket text, events int, devices int, users int)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  tz text := analytics.timezone();
  t0 timestamptz := coalesce(p_from, analytics._today() - 29)::timestamp at time zone tz;
  t1 timestamptz := (coalesce(p_to, analytics._today()) + 1)::timestamp at time zone tz;
  br text := coalesce(p_breakdown, 'name');
begin
  if br not in ('name', 'platform', 'app_version', 'screen', 'error') then
    raise exception using errcode = '22023',
      message = 'p_breakdown must be name, platform, app_version, screen or error';
  end if;
  return query
    select coalesce(case br
             when 'name' then e.name
             when 'platform' then e.platform
             when 'app_version' then e.app_version
             when 'screen' then e.props ->> 'path'
             else left(coalesce(e.props ->> 'where', '?') || ': ' || coalesce(e.props ->> 'message', ''), 240)
           end, '(none)'),
           count(*)::int, count(distinct e.device_id)::int, count(distinct e.person)::int
    from analytics._events(t0, t1) e
    where (br <> 'screen' or e.name = 'screen')
      and (br <> 'error' or e.name = 'error')
    group by 1
    order by 2 desc, 1
    limit 500;
end;
$$;

comment on function analytics.event_summary(date, date, text) is
  'Usage events between two days grouped by p_breakdown: name | platform | app_version | screen (props.path of screen events) | error («props.where: props.message» of error events). events, distinct devices, distinct users. Top 500.';

create or replace function analytics.funnel(p_from date, p_to date)
returns table (step text, devices int)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  tz text := analytics.timezone();
  t0 timestamptz := coalesce(p_from, analytics._today() - 29)::timestamp at time zone tz;
  t1 timestamptz := (coalesce(p_to, analytics._today()) + 1)::timestamp at time zone tz;
begin
  return query
    select f.step, count(distinct f.device_id) filter (where f.reached_at >= t0 and f.reached_at < t1
             and not exists (select 1 from analytics.device_users d
                             join analytics.excluded_users x on x.user_id = d.user_id
                             where d.device_id = f.device_id))::int
    from analytics.funnel_steps f
    group by f.ord, f.step
    order by f.ord;
end;
$$;

comment on function analytics.funnel(date, date) is
  'Distinct devices per step of analytics.funnel_steps whose reached_at falls between the two days, in step order (each step counted on its own; excluded users'' devices left out).';

create or replace function analytics.user_journey(p_user uuid, p_from timestamptz, p_to timestamptz, p_limit int default 200)
returns table (at timestamptz, name text, props jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select j.at, j.name, j.props
  from (
    select e.at, e.name,
           coalesce((select jsonb_object_agg(k.key, k.value)
                     from jsonb_each(e.props) k
                     where k.key in ('path', 'provider', 'type', 'kind', 'reason', 'attempts', 'permanent',
                                     'bytes', 'ms', 'status', 'where', 'step', 'source', 'screen')), '{}') as props
    from analytics._events(coalesce(p_from, now() - interval '30 days'), coalesce(p_to, now() + interval '1 minute')) e
    where e.person = p_user
    order by e.at desc
    limit greatest(1, least(coalesce(p_limit, 200), 500))
  ) j
  order by j.at
$$;

comment on function analytics.user_journey(uuid, timestamptz, timestamptz, int) is
  'One person''s events (including their device''s pre-login events) in time order: the latest p_limit (max 500) in the range (null = last 30 days), only whitelisted prop keys (path, provider, type, kind, reason, attempts, permanent, bytes, ms, status, where, step, source, screen). Pseudonymous: no email or name.';

create or replace function analytics.weekly_report(p_week date default null)
returns table (metric text, this_week numeric, last_week numeric, four_weeks_ago numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with w (label, d0, d1) as (
    values ('this', coalesce(p_week, analytics._today()) - 6, coalesce(p_week, analytics._today())),
           ('last', coalesce(p_week, analytics._today()) - 13, coalesce(p_week, analytics._today()) - 7),
           ('four', coalesce(p_week, analytics._today()) - 34, coalesce(p_week, analytics._today()) - 28)
  ), k as (
    select * from analytics.daily_kpis(coalesce(p_week, analytics._today()) - 34, coalesce(p_week, analytics._today()))
  ), agg as (
    select w.label, k.metric,
           case
             when k.metric = 'dau' then round(avg(k.value), 1)
             when k.metric in ('wau', 'mau', 'push_optin_users', 'premium_active')
               then max(k.value) filter (where k.day = w.d1)
             else sum(k.value)
           end as v
    from w join k on k.day between w.d0 and w.d1
    group by w.label, k.metric
  )
  select a.metric,
         max(a.v) filter (where a.label = 'this'),
         max(a.v) filter (where a.label = 'last'),
         max(a.v) filter (where a.label = 'four')
  from agg a
  group by a.metric
  order by a.metric
$$;

comment on function analytics.weekly_report(date) is
  'Every daily_kpis metric over the 7 days ending p_week (null = today in analytics.timezone()), the 7 days before those, and the 7 days ending 28 days before p_week. dau: daily average; wau, mau, push_optin_users, premium_active: value on the last day; every other metric: sum.';

create or replace function analytics.list_metrics()
returns table (fn text, description text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
    select 'analytics.' || p.proname || '(' || pg_catalog.pg_get_function_arguments(p.oid) || ')',
           coalesce(pg_catalog.obj_description(p.oid, 'pg_proc'), '')
    from pg_catalog.pg_proc p
    where p.pronamespace = 'analytics'::regnamespace
      and p.proname in ('daily_kpis', 'cohort_retention', 'event_summary', 'funnel',
                        'user_journey', 'weekly_report', 'list_metrics');
  if to_regclass('analytics.app_metrics') is not null then
    return query execute 'select m.fn::text, m.description::text from analytics.app_metrics m';
  end if;
end;
$$;

comment on function analytics.list_metrics() is
  'Every analytics function the reader can call: the shared core ones and the app''s own (analytics.app_metrics), with arguments and what each returns.';

-- ---------------------------------------------------------------------------
-- Grants: the report functions to the reader; helpers stay internal
-- ---------------------------------------------------------------------------

revoke all on function analytics.timezone() from public;
revoke all on function analytics._today() from public;
revoke all on function analytics._signups() from public;
revoke all on function analytics._events(timestamptz, timestamptz) from public;
revoke all on function analytics._activity(timestamptz, timestamptz) from public;
revoke all on function analytics.daily_kpis(date, date) from public;
revoke all on function analytics.cohort_retention(text, int) from public;
revoke all on function analytics.event_summary(date, date, text) from public;
revoke all on function analytics.funnel(date, date) from public;
revoke all on function analytics.user_journey(uuid, timestamptz, timestamptz, int) from public;
revoke all on function analytics.weekly_report(date) from public;
revoke all on function analytics.list_metrics() from public;

grant execute on function analytics.daily_kpis(date, date) to analytics_reader;
grant execute on function analytics.cohort_retention(text, int) to analytics_reader;
grant execute on function analytics.event_summary(date, date, text) to analytics_reader;
grant execute on function analytics.funnel(date, date) to analytics_reader;
grant execute on function analytics.user_journey(uuid, timestamptz, timestamptz, int) to analytics_reader;
grant execute on function analytics.weekly_report(date) to analytics_reader;
grant execute on function analytics.list_metrics() to analytics_reader;

commit;
