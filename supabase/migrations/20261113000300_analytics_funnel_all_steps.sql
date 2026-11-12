-- analytics.funnel lists every step, with 0 devices until someone reaches it.
-- With an inner join a step with no events had no row in funnel_steps and
-- vanished from the funnel (Lanuki found the same gap). A left join emits one
-- row per step with device_id/reached_at null; funnel() counts distinct
-- non-null devices, so those rows count as 0.
create or replace view analytics.funnel_steps as
  select s.ord, s.step, e.device_id, min(e.at) as reached_at
  from (values (1, 'app_open'), (2, 'upload_start'), (3, 'sign_in'), (4, 'upload_done')) as s(ord, step)
  left join public.analytics_events e on e.name = s.step
  group by s.ord, s.step, e.device_id;

revoke all on analytics.funnel_steps from public, anon, authenticated;
