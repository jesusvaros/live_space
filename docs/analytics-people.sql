-- Shared analytics core, part 2: people (identical in every app's database;
-- copy verbatim, like 20261113000100_analytics_core.sql).
--
-- 1. Team switch. analytics.excluded_users becomes a view over the new table
--    analytics.team_users that is empty when the session sets
--    analytics.include_team = 'on'. Every existing function keeps filtering
--    through excluded_users unchanged, so the dashboard can show the numbers
--    with or without the team (set_config(..., true) inside its transaction).
-- 2. analytics.people(p_from, p_to): every real account with name, e-mail,
--    sign-in method, sign-up date, last activity and activity in the range.
-- 3. analytics.user_breakdown(p_from, p_to, p_metric): who is behind a
--    metric, per person. Core metrics: active_days, events, sessions; any
--    other metric comes from the app's optional hook
--    analytics.app_user_breakdown(p_from date, p_to date, p_metric text)
--    returning (user_id uuid, value numeric).
-- 4. analytics.set_team(p_user, p_team, p_note): marks or unmarks a team
--    account (the only write the reader can do, and only to team_users).
--
-- Names and e-mails come from auth.users; they are shown only on the private
-- dashboard to the people listed in its ADMIN_EMAILS.

begin;

do $$
begin
  if to_regclass('analytics.team_users') is null then
    alter table analytics.excluded_users rename to team_users;
  end if;
end;
$$;

revoke all on analytics.team_users from public;
revoke all on analytics.team_users from anon, authenticated;

create or replace view analytics.excluded_users as
  select t.user_id, t.note
  from analytics.team_users t
  where coalesce(current_setting('analytics.include_team', true), '') <> 'on';

revoke all on analytics.excluded_users from public;
revoke all on analytics.excluded_users from anon, authenticated;

comment on view analytics.excluded_users is
  'Team/test accounts left out of every metric: analytics.team_users, or nobody when the session sets analytics.include_team = ''on''.';

-- Display name for a person: profile-like metadata, else the e-mail's local part.
create or replace function analytics._person_name(p_meta jsonb, p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(trim(p_meta ->> 'full_name'), ''), nullif(trim(p_meta ->> 'name'), ''),
                  nullif(trim(p_meta ->> 'display_name'), ''), split_part(coalesce(p_email, ''), '@', 1), '')
$$;

create or replace function analytics.people(p_from date, p_to date)
returns table (user_id uuid, name text, email text, provider text, signed_up_at timestamptz,
               last_active_at timestamptz, active_days int, events int, sessions int, team boolean)
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
    with act as (
      select a.user_id, count(distinct (a.at at time zone tz)::date)::int as days
      from analytics._activity(t0, t1) a
      group by a.user_id
    ), ev as (
      select e.person, count(*)::int as n, count(distinct e.session_id)::int as s
      from analytics._events(t0, t1) e
      where e.person is not null
      group by e.person
    ), last_seen as (
      select a.user_id, max(a.at) as at
      from analytics.activity a
      where a.user_id is not null
      group by a.user_id
    )
    select u.id, analytics._person_name(u.raw_user_meta_data, u.email), u.email::text,
           coalesce(u.raw_app_meta_data ->> 'provider', 'email'), u.created_at,
           l.at, coalesce(act.days, 0), coalesce(ev.n, 0), coalesce(ev.s, 0),
           exists (select 1 from analytics.team_users t where t.user_id = u.id)
    from auth.users u
    left join act on act.user_id = u.id
    left join ev on ev.person = u.id
    left join last_seen l on l.user_id = u.id
    where coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, false) = false
      and not exists (select 1 from analytics.excluded_users x where x.user_id = u.id)
    order by coalesce(act.days, 0) desc, l.at desc nulls last, u.created_at desc
    limit 2000;
end;
$$;

comment on function analytics.people(date, date) is
  'Every real account (max 2000): user_id, name, email, provider (first sign-in method), signed_up_at, last_active_at (ever), and in the range (null = last 30 days): active_days, events, sessions; team = marked as team. Team accounts only when analytics.include_team = ''on''. Most active first.';

create or replace function analytics.user_breakdown(p_from date, p_to date, p_metric text default 'active_days')
returns table (user_id uuid, name text, email text, value numeric, team boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  tz text := analytics.timezone();
  d0 date := coalesce(p_from, analytics._today() - 29);
  d1 date := coalesce(p_to, analytics._today());
  t0 timestamptz := d0::timestamp at time zone tz;
  t1 timestamptz := (d1 + 1)::timestamp at time zone tz;
  metric text := coalesce(nullif(trim(p_metric), ''), 'active_days');
  src text;
begin
  -- Per-person values ($1 d0, $2 d1, $3 metric, $4 tz, $5 t0, $6 t1).
  if metric = 'active_days' then
    src := 'select a.user_id, count(distinct (a.at at time zone $4)::date)::numeric as value
            from analytics._activity($5, $6) a group by a.user_id';
  elsif metric = 'events' then
    src := 'select e.person as user_id, count(*)::numeric as value
            from analytics._events($5, $6) e where e.person is not null group by e.person';
  elsif metric = 'sessions' then
    src := 'select e.person as user_id, count(distinct e.session_id)::numeric as value
            from analytics._events($5, $6) e where e.person is not null group by e.person';
  elsif to_regprocedure('analytics.app_user_breakdown(date,date,text)') is not null then
    src := 'select b.user_id, b.value::numeric as value from analytics.app_user_breakdown($1, $2, $3) b';
  else
    raise exception 'unknown metric %', metric using errcode = '22023';
  end if;

  return query execute format($q$
    with b as (%s)
    select b.user_id, analytics._person_name(u.raw_user_meta_data, u.email), u.email::text, b.value,
           exists (select 1 from analytics.team_users t where t.user_id = b.user_id)
    from b
    join auth.users u on u.id = b.user_id
    where b.value is not null and b.value <> 0
      and not exists (select 1 from analytics.excluded_users x where x.user_id = b.user_id)
    order by b.value desc, 2
    limit 200$q$, src)
    using d0, d1, metric, tz, t0, t1;
end;
$$;

comment on function analytics.user_breakdown(date, date, text) is
  'Who is behind a metric in the range (null = last 30 days): user_id, name, email, value, team; biggest first, max 200, zeros left out. Core metrics: active_days, events, sessions; others from analytics.app_user_breakdown (see analytics.app_metrics / list_metrics).';

create or replace function analytics.set_team(p_user uuid, p_team boolean, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'unknown user' using errcode = '22023';
  end if;
  if p_team then
    insert into analytics.team_users (user_id, note) values (p_user, left(p_note, 200))
    on conflict (user_id) do update set note = coalesce(excluded.note, analytics.team_users.note);
  else
    delete from analytics.team_users t where t.user_id = p_user;
  end if;
end;
$$;

comment on function analytics.set_team(uuid, boolean, text) is
  'Marks (p_team = true, optional note) or unmarks a team/test account; team accounts are left out of every metric unless analytics.include_team = ''on''.';

-- list_metrics: the core list now includes the people functions.
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
                        'user_journey', 'weekly_report', 'list_metrics',
                        'people', 'user_breakdown', 'set_team');
  if to_regclass('analytics.app_metrics') is not null then
    return query execute 'select m.fn::text, m.description::text from analytics.app_metrics m';
  end if;
end;
$$;

revoke all on function analytics._person_name(jsonb, text) from public;
revoke all on function analytics.people(date, date) from public;
revoke all on function analytics.user_breakdown(date, date, text) from public;
revoke all on function analytics.set_team(uuid, boolean, text) from public;
revoke all on function analytics.list_metrics() from public;

grant execute on function analytics.people(date, date) to analytics_reader;
grant execute on function analytics.user_breakdown(date, date, text) to analytics_reader;
grant execute on function analytics.set_team(uuid, boolean, text) to analytics_reader;
grant execute on function analytics.list_metrics() to analytics_reader;

commit;
