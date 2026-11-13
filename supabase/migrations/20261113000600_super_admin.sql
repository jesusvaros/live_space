-- Super admin (the private analytics dashboard, signed in with a Live Space
-- admin account). Everything goes through these SECURITY DEFINER functions:
-- no service key leaves the server, and the database checks every call.
--
--   reads   public.current_user_is_admin()
--   writes  admin + the session verified with a second factor (aal2, the
--           authenticator app), and a written reason; each one is recorded
--           in public.admin_audit_log.
--
-- Also: staging_events.decision_reasons, so the dashboard can say why a
-- scraped concert is pending or was rejected (the pipeline fills it).

begin;

-- ---------------------------------------------------------------------------
-- 1. Why a scraped concert is where it is
-- ---------------------------------------------------------------------------

alter table public.staging_events
  add column if not exists decision_reasons text[] not null default '{}';

comment on column public.staging_events.decision_reasons is
  'Why the pipeline left this row pending or rejected it (decideByConfidence reasons, triage-R1…R6, manual-*).';

-- One key per row: the stored reason, else what the row itself says.
create or replace function public._staging_reason(
  p_status public.review_status, p_reasons text[], p_error text, p_normalized jsonb, p_starts_at timestamptz)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_error is not null then 'processing-error'
    when p_status = 'pending' and p_normalized is null then 'unprocessed'
    when cardinality(p_reasons) > 0 then p_reasons[1]
    when p_status = 'pending' then 'human-review-required'
    when p_status = 'merged' then 'duplicate'
    when p_status = 'rejected' and p_starts_at is not null and p_starts_at < now() then 'past-event'
    when p_status = 'rejected' then 'rejected'
    else 'published'
  end
$$;

-- ---------------------------------------------------------------------------
-- 2. Audit log
-- ---------------------------------------------------------------------------

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  target_type text not null,
  target_id text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_target_idx on public.admin_audit_log (target_type, target_id, created_at desc);

alter table public.admin_audit_log enable row level security;
drop policy if exists admin_audit_log_admin_read on public.admin_audit_log;
create policy admin_audit_log_admin_read on public.admin_audit_log
  for select to authenticated using (public.current_user_is_admin());
revoke all on public.admin_audit_log from anon;
revoke insert, update, delete, truncate on public.admin_audit_log from authenticated;
grant select on public.admin_audit_log to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Guards
-- ---------------------------------------------------------------------------

-- The session's JWT claims (what auth.jwt() returns).
create or replace function public._admin_claims()
returns jsonb
language sql
stable
set search_path = ''
as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

-- Admin for reads; for writes also the second factor and a reason.
create or replace function public._admin_guard(p_write boolean, p_reason text default null)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception 'admin_only' using errcode = '42501';
  end if;
  if p_write then
    if coalesce(public._admin_claims() ->> 'aal', 'aal1') <> 'aal2' then
      raise exception 'mfa_required' using errcode = '42501';
    end if;
    if p_reason is null or char_length(trim(p_reason)) < 3 then
      raise exception 'reason_required' using errcode = '22023';
    end if;
  end if;
  return auth.uid();
end;
$$;

create or replace function public._admin_log(p_action text, p_target_type text, p_target_id text, p_reason text, p_metadata jsonb default '{}'::jsonb)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.admin_audit_log (actor_id, actor_email, action, target_type, target_id, reason, metadata)
  values (auth.uid(), public._admin_claims() ->> 'email', p_action, p_target_type, p_target_id, left(trim(p_reason), 500), coalesce(p_metadata, '{}'::jsonb))
$$;

-- ---------------------------------------------------------------------------
-- 4. Reads
-- ---------------------------------------------------------------------------

-- Scraping at a glance: rows by status; pending (upcoming) by reason and source.
create or replace function public.admin_staging_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public._admin_guard(false);
  with s as (
    select se.review_status, se.source_id,
           public._staging_reason(se.review_status, se.decision_reasons, se.processing_error, se.normalized_payload, se.extracted_starts_at) as reason
    from public.staging_events se
    where se.extracted_starts_at is null or se.extracted_starts_at >= now() - interval '1 day'
  )
  select jsonb_build_object(
    'by_status', coalesce((select jsonb_object_agg(review_status, n) from (select review_status, count(*) n from s group by 1) x), '{}'),
    'pending_by_reason', coalesce((select jsonb_object_agg(reason, n) from (select reason, count(*) n from s where review_status = 'pending' group by 1) x), '{}'),
    'pending_by_source', coalesce((
      select jsonb_agg(jsonb_build_object('source_id', x.source_id, 'name', src.name, 'pending', x.n) order by x.n desc)
      from (select source_id, count(*) n from s where review_status = 'pending' group by 1) x
      join public.scrape_sources src on src.id = x.source_id), '[]')
  ) into result;
  return result;
end;
$$;

comment on function public.admin_staging_summary() is
  'Admin: upcoming staging rows by review_status, pending ones by reason and by source.';

create or replace function public.admin_staging_list(
  p_status text default 'pending', p_reason text default null, p_source uuid default null,
  p_search text default null, p_upcoming boolean default true, p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, source_id uuid, source_name text, source_url text, title text, date_text text, starts_at timestamptz,
  venue text, city text, artists text[], confidence numeric, review_status text, reason text, reasons text[],
  processing_error text, published_event_id uuid, created_at timestamptz, updated_at timestamptz, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  q text := nullif(trim(p_search), '');
begin
  perform public._admin_guard(false);
  return query
    with s as (
      select se.*, src.name as src_name,
             public._staging_reason(se.review_status, se.decision_reasons, se.processing_error, se.normalized_payload, se.extracted_starts_at) as why
      from public.staging_events se
      join public.scrape_sources src on src.id = se.source_id
      where (p_status is null or p_status = 'all' or se.review_status::text = p_status)
        and (p_source is null or se.source_id = p_source)
        and (not coalesce(p_upcoming, true) or se.extracted_starts_at is null or se.extracted_starts_at >= now() - interval '1 day')
        and (q is null or se.extracted_title ilike '%' || q || '%' or se.extracted_venue_name ilike '%' || q || '%'
             or array_to_string(se.extracted_artist_names, ' ') ilike '%' || q || '%' or se.source_url ilike '%' || q || '%')
    )
    select s.id, s.source_id, s.src_name, s.source_url, s.extracted_title, s.extracted_date_text,
           coalesce((s.normalized_payload ->> 'startsAt')::timestamptz, s.extracted_starts_at),
           s.extracted_venue_name, s.extracted_city, s.extracted_artist_names, s.confidence::numeric,
           s.review_status::text, s.why, s.decision_reasons, s.processing_error, s.published_event_id,
           s.created_at, s.updated_at, count(*) over ()
    from s
    where p_reason is null or s.why = p_reason
    order by coalesce(s.extracted_starts_at, s.created_at) asc, s.id
    limit greatest(1, least(coalesce(p_limit, 50), 200)) offset greatest(0, coalesce(p_offset, 0));
end;
$$;

comment on function public.admin_staging_list(text, text, uuid, text, boolean, int, int) is
  'Admin: scraped rows by status (pending|approved|rejected|merged|all), reason, source and text; upcoming only by default; soonest first; total = rows matching.';

create or replace function public.admin_sources()
returns table (
  id uuid, name text, city text, parser_key text, base_url text, is_active boolean, last_success_at timestamptz,
  health_score numeric, pending bigint, last_run_status text, last_run_at timestamptz, last_run_error text,
  last_run_raw int, last_run_published int)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public._admin_guard(false);
  return query
    select src.id, src.name, src.city, src.parser_key, src.base_url, src.is_active, src.last_success_at,
           src.health_score::numeric,
           (select count(*) from public.staging_events se where se.source_id = src.id and se.review_status = 'pending'
              and (se.extracted_starts_at is null or se.extracted_starts_at >= now() - interval '1 day')),
           r.status::text, r.started_at, r.error_message, r.raw_count, r.published_count
    from public.scrape_sources src
    left join lateral (
      select sr.status, sr.started_at, sr.error_message, sr.raw_count, sr.published_count
      from public.scrape_runs sr where sr.source_id = src.id order by sr.started_at desc limit 1
    ) r on true
    order by src.is_active desc, src.name;
end;
$$;

comment on function public.admin_sources() is
  'Admin: every scrape source with its health, upcoming pending rows and last run.';

create or replace function public.admin_users_search(p_query text default null, p_limit int default 50)
returns table (
  id uuid, email text, display_name text, username text, avatar_url text, app_role text, provider text,
  created_at timestamptz, last_sign_in_at timestamptz, banned_until timestamptz, posts bigint, reports_against bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  q text := nullif(trim(p_query), '');
begin
  perform public._admin_guard(false);
  return query
    select u.id, u.email::text, p.display_name, p.username::text, p.avatar_url, p.app_role::text,
           coalesce(u.raw_app_meta_data ->> 'provider', 'email'), u.created_at, u.last_sign_in_at, u.banned_until,
           (select count(*) from public.posts po where po.author_id = u.id),
           (select count(*) from public.moderation_reports mr
              where (mr.target_type = 'profile' and mr.target_id = u.id)
                 or (mr.target_type = 'post' and mr.target_id in (select po.id from public.posts po where po.author_id = u.id)))
    from auth.users u
    left join public.profiles p on p.id = u.id
    where coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, false) = false
      and (q is null or u.email ilike '%' || q || '%' or p.display_name ilike '%' || q || '%'
           or p.username::text ilike '%' || q || '%' or u.id::text = q)
    order by u.created_at desc
    limit greatest(1, least(coalesce(p_limit, 50), 200));
end;
$$;

comment on function public.admin_users_search(text, int) is
  'Admin: accounts matching e-mail, name, username or id (newest first, max 200), with role, ban, posts and reports against them.';

create or replace function public.admin_user_detail(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public._admin_guard(false);
  select jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'provider', coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'banned_until', u.banned_until,
    'display_name', p.display_name,
    'username', p.username,
    'avatar_url', p.avatar_url,
    'bio', p.bio,
    'primary_city', p.primary_city,
    'app_role', p.app_role,
    'is_private', p.is_private,
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', po.id, 'status', po.status, 'created_at', po.created_at, 'caption', po.caption,
        'event_id', po.event_id, 'event_name', e.name, 'event_starts_at', e.starts_at,
        'media_type', m.resource_type, 'media_url', coalesce(m.secure_url, po.external_url),
        'thumbnail_url', coalesce(m.thumbnail_url, case when m.resource_type = 'image' then m.secure_url end),
        'likes', (select count(*) from public.post_likes l where l.post_id = po.id),
        'reports', (select count(*) from public.moderation_reports mr where mr.target_type = 'post' and mr.target_id = po.id))
        order by po.created_at desc)
      from public.posts po
      left join public.events e on e.id = po.event_id
      left join public.media_assets m on m.id = po.media_asset_id
      where po.author_id = u.id), '[]'),
    'reports_against', coalesce((
      select jsonb_agg(jsonb_build_object('id', mr.id, 'target_type', mr.target_type, 'target_id', mr.target_id,
        'reason', mr.reason, 'details', mr.details, 'status', mr.status, 'created_at', mr.created_at) order by mr.created_at desc)
      from public.moderation_reports mr
      where (mr.target_type = 'profile' and mr.target_id = u.id)
         or (mr.target_type = 'post' and mr.target_id in (select po.id from public.posts po where po.author_id = u.id))), '[]'),
    'reports_made', (select count(*) from public.moderation_reports mr where mr.reporter_id = u.id),
    'attended', (select count(*) from public.event_attendance a where a.profile_id = u.id and a.status = 'attended'),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('at', l.created_at, 'action', l.action, 'by', l.actor_email, 'reason', l.reason, 'metadata', l.metadata)
        order by l.created_at desc)
      from public.admin_audit_log l
      where (l.target_type = 'user' and l.target_id = u.id::text)
         or (l.target_type = 'post' and l.target_id in (select po.id::text from public.posts po where po.author_id = u.id))), '[]')
  ) into result
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user;
  return result;
end;
$$;

comment on function public.admin_user_detail(uuid) is
  'Admin: one account with profile, auth data, every post (any status, with media), reports against them and admin history.';

create or replace function public.admin_reports(p_status text default 'open')
returns table (
  id uuid, target_type text, target_id uuid, reason text, details text, status text, created_at timestamptz,
  reporter_id uuid, reporter_name text, target_label text, target_owner uuid, target_thumbnail text, open_for_target bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform public._admin_guard(false);
  return query
    select mr.id, mr.target_type::text, mr.target_id, mr.reason, mr.details, mr.status::text, mr.created_at,
           mr.reporter_id, coalesce(rp.display_name, rp.username::text),
           case mr.target_type
             when 'post' then (select coalesce(ap.display_name, ap.username::text, 'Momento') || ' · ' || coalesce(e.name, '')
                               from public.posts po left join public.profiles ap on ap.id = po.author_id
                               left join public.events e on e.id = po.event_id where po.id = mr.target_id)
             when 'profile' then (select coalesce(tp.display_name, tp.username::text) from public.profiles tp where tp.id = mr.target_id)
             when 'event' then (select e.name from public.events e where e.id = mr.target_id)
             when 'artist' then (select a.name from public.artists a where a.id = mr.target_id)
             when 'venue' then (select v.name from public.venue_places v where v.id = mr.target_id)
           end,
           case mr.target_type
             when 'post' then (select po.author_id from public.posts po where po.id = mr.target_id)
             when 'profile' then mr.target_id
           end,
           case when mr.target_type = 'post' then (
             select coalesce(m.thumbnail_url, case when m.resource_type = 'image' then m.secure_url end)
             from public.posts po left join public.media_assets m on m.id = po.media_asset_id where po.id = mr.target_id)
           end,
           count(*) filter (where mr.status in ('open', 'reviewing')) over (partition by mr.target_type, mr.target_id)
    from public.moderation_reports mr
    left join public.profiles rp on rp.id = mr.reporter_id
    where p_status is null or p_status = 'all' or mr.status::text = p_status
    order by mr.created_at desc
    limit 300;
end;
$$;

comment on function public.admin_reports(text) is
  'Admin: moderation reports (open|reviewing|resolved|dismissed|all), newest first, with what was reported and who owns it.';

create or replace function public.admin_audit(p_limit int default 100)
returns setof public.admin_audit_log
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public._admin_guard(false);
  return query select * from public.admin_audit_log order by created_at desc limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Writes (second factor + reason; every one logged)
-- ---------------------------------------------------------------------------

-- Publish, hide (archived) or send a moment back to review.
create or replace function public.admin_set_post_status(p_post uuid, p_status text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  old_status text;
begin
  perform public._admin_guard(true, p_reason);
  if p_status not in ('published', 'archived', 'review') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  select status::text into old_status from public.posts where id = p_post for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.posts set status = p_status::public.publish_status, updated_at = now() where id = p_post;
  perform public._admin_log('post_status', 'post', p_post::text, p_reason, jsonb_build_object('from', old_status, 'to', p_status));
end;
$$;

-- Blocks signing in (auth.users.banned_until) and ends their sessions; the
-- current access token still works until it expires (at most an hour).
create or replace function public.admin_ban_user(p_user uuid, p_days int, p_hide_posts boolean, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  hidden int := 0;
  until timestamptz := case when p_days is null then 'infinity'::timestamptz else now() + make_interval(days => p_days) end;
begin
  perform public._admin_guard(true, p_reason);
  if p_user = auth.uid() then raise exception 'not_yourself' using errcode = '22023'; end if;
  if exists (select 1 from public.profiles where id = p_user and app_role = 'admin') then
    raise exception 'admin_target' using errcode = '22023';
  end if;
  if p_days is not null and p_days < 1 then raise exception 'invalid_days' using errcode = '22023'; end if;
  update auth.users set banned_until = until where id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  delete from auth.sessions where user_id = p_user;
  if coalesce(p_hide_posts, false) then
    update public.posts set status = 'archived', updated_at = now() where author_id = p_user and status = 'published';
    get diagnostics hidden = row_count;
  end if;
  perform public._admin_log('ban', 'user', p_user::text, p_reason,
    jsonb_build_object('until', until, 'days', p_days, 'hidden_posts', hidden));
end;
$$;

create or replace function public.admin_unban_user(p_user uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public._admin_guard(true, p_reason);
  update auth.users set banned_until = null where id = p_user;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public._admin_log('unban', 'user', p_user::text, p_reason, '{}'::jsonb);
end;
$$;

create or replace function public.admin_set_role(p_user uuid, p_role text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  old_role text;
begin
  perform public._admin_guard(true, p_reason);
  if p_user = auth.uid() then raise exception 'not_yourself' using errcode = '22023'; end if;
  if p_role not in ('user', 'moderator', 'admin') then raise exception 'invalid_role' using errcode = '22023'; end if;
  select app_role::text into old_role from public.profiles where id = p_user for update;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update public.profiles set app_role = p_role::public.app_role, updated_at = now() where id = p_user;
  perform public._admin_log('role', 'user', p_user::text, p_reason, jsonb_build_object('from', old_role, 'to', p_role));
end;
$$;

-- Approve (the next pipeline run publishes it), reject, or send back to pending.
create or replace function public.admin_review_staging(p_ids uuid[], p_status text, p_reason text)
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  changed int;
begin
  perform public._admin_guard(true, p_reason);
  if p_status not in ('approved', 'rejected', 'pending') then raise exception 'invalid_status' using errcode = '22023'; end if;
  if cardinality(p_ids) = 0 or cardinality(p_ids) > 200 then raise exception 'invalid_ids' using errcode = '22023'; end if;
  update public.staging_events se
  set review_status = p_status::public.review_status,
      processing_error = null,
      decision_reasons = array['manual-' || p_status],
      updated_at = now()
  where se.id = any (p_ids)
    and se.published_event_id is null
    -- Approving needs the normalized event the publisher works from.
    and (p_status <> 'approved' or se.normalized_payload is not null);
  get diagnostics changed = row_count;
  perform public._admin_log('staging_' || p_status, 'staging', array_to_string(p_ids[1:5], ','), p_reason,
    jsonb_build_object('ids', to_jsonb(p_ids), 'changed', changed));
  return changed;
end;
$$;

create or replace function public.admin_resolve_report(p_report uuid, p_status text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public._admin_guard(true, p_reason);
  if p_status not in ('reviewing', 'resolved', 'dismissed', 'open') then raise exception 'invalid_status' using errcode = '22023'; end if;
  update public.moderation_reports
  set status = p_status::public.report_status,
      assigned_to = auth.uid(),
      resolved_at = case when p_status in ('resolved', 'dismissed') then now() end,
      resolution_note = left(trim(p_reason), 500),
      updated_at = now()
  where id = p_report;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform public._admin_log('report_' || p_status, 'report', p_report::text, p_reason, '{}'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Grants: callable by signed-in users (each function checks admin itself)
-- ---------------------------------------------------------------------------

revoke all on function public._admin_claims() from public;
revoke all on function public._staging_reason(public.review_status, text[], text, jsonb, timestamptz) from public;
revoke all on function public._admin_guard(boolean, text) from public;
revoke all on function public._admin_log(text, text, text, text, jsonb) from public;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_staging_summary()',
    'public.admin_staging_list(text, text, uuid, text, boolean, int, int)',
    'public.admin_sources()',
    'public.admin_users_search(text, int)',
    'public.admin_user_detail(uuid)',
    'public.admin_reports(text)',
    'public.admin_audit(int)',
    'public.admin_set_post_status(uuid, text, text)',
    'public.admin_ban_user(uuid, int, boolean, text)',
    'public.admin_unban_user(uuid, text)',
    'public.admin_set_role(uuid, text, text)',
    'public.admin_review_staging(uuid[], text, text)',
    'public.admin_resolve_report(uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

commit;
