-- Live Space's per-person metrics for analytics.user_breakdown (core part 2,
-- 20261113000400_analytics_people.sql). Same metric names as daily_kpis where
-- they exist. Days in analytics.timezone(); team accounts are left out by the
-- core (through analytics.excluded_users).
--   posts           moments published in the range (still existing)
--   uploads         upload reservations (files) started in the range
--   attended        concerts in the range they marked «Fui»
--   revenue_cents   merch paid in the range (as buyer)
--   likes_received  likes on their moments published in the range

begin;

create or replace function analytics.app_user_breakdown(p_from date, p_to date, p_metric text)
returns table (user_id uuid, value numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  tz text := analytics.timezone();
  t0 timestamptz := p_from::timestamp at time zone tz;
  t1 timestamptz := (p_to + 1)::timestamp at time zone tz;
begin
  if p_metric = 'posts' then
    return query select p.author_id, count(*)::numeric from public.posts p
      where p.created_at >= t0 and p.created_at < t1 group by p.author_id;
  elsif p_metric = 'uploads' then
    return query select u.user_id, count(*)::numeric from public.media_upload_reservations u
      where u.created_at >= t0 and u.created_at < t1 group by u.user_id;
  elsif p_metric = 'attended' then
    return query select a.profile_id, count(*)::numeric from public.event_attendance a
      join public.events e on e.id = a.event_id
      where a.status = 'attended' and e.starts_at >= t0 and e.starts_at < t1 group by a.profile_id;
  elsif p_metric = 'revenue_cents' then
    return query select o.buyer_id, sum(coalesce(o.paid_cents, o.total_cents))::numeric from public.merch_orders o
      where o.status in ('paid', 'collected') and o.paid_at >= t0 and o.paid_at < t1 group by o.buyer_id;
  elsif p_metric = 'likes_received' then
    return query select p.author_id, count(*)::numeric from public.post_likes l
      join public.posts p on p.id = l.post_id
      where p.created_at >= t0 and p.created_at < t1 group by p.author_id;
  else
    raise exception 'unknown metric %', p_metric using errcode = '22023';
  end if;
end;
$$;

revoke all on function analytics.app_user_breakdown(date, date, text) from public;

comment on function analytics.app_user_breakdown(date, date, text) is
  'Live Space metrics for analytics.user_breakdown: posts, uploads, attended, revenue_cents, likes_received.';

commit;
