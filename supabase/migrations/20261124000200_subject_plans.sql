begin;

-- Pro plan for artists and venues.
--
-- One row per artist/venue subject that is or was Pro; no row = free.
-- Pro is sold only as an in-app purchase (Google Play / App Store through
-- RevenueCat, entitlement «pro»); the purchase webhook writes here with the
-- service role (source 'store'). Founders (the first 50 profiles before
-- 1 Apr 2027) get Pro free until 30 Jun 2027 (source 'founder', granted by an
-- admin with grant_founder_plan). Admins can also grant Pro by hand
-- ('manual').
--
-- Managers of the subject read their row; only admins and the service role
-- write. subject_is_pro() is what the app and the database check.
--
-- Pro perks enforced here: merch paid inside the app (event_merch and
-- merch_orders with payment_method 'in_app' need a Pro seller). Fans never
-- hit a paywall.

create table if not exists public.subject_plans (
  subject_id uuid primary key references public.subjects(id) on delete cascade,
  plan text not null default 'free' constraint subject_plans_plan_check check (plan in ('free', 'pro')),
  status text not null default 'active'
    constraint subject_plans_status_check check (status in ('active', 'trialing', 'past_due', 'cancelled', 'expired')),
  source text not null default 'manual' constraint subject_plans_source_check check (source in ('store', 'founder', 'manual')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  founder boolean not null default false,
  store_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.subject_plans is
  'Pro plan of an artist or venue. No row = free. Written by admins and the store webhook (service role).';

drop trigger if exists subject_plans_set_updated_at on public.subject_plans;
create trigger subject_plans_set_updated_at before update on public.subject_plans
  for each row execute function public.set_updated_at();

alter table public.subject_plans enable row level security;

drop policy if exists subject_plans_read on public.subject_plans;
create policy subject_plans_read on public.subject_plans for select to authenticated
  using (public.can_manage_subject(subject_id, true));

drop policy if exists subject_plans_admin_write on public.subject_plans;
create policy subject_plans_admin_write on public.subject_plans for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

revoke all on public.subject_plans from anon;
grant select on public.subject_plans to authenticated;
grant insert, update, delete on public.subject_plans to authenticated;

-- Pro right now: plan pro, active or trialing, and the paid period (or the
-- founder period) not over.
create or replace function public.subject_is_pro(p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.subject_plans p
    where p.subject_id = p_subject_id
      and p.plan = 'pro'
      and p.status in ('active', 'trialing')
      and coalesce(p.current_period_end, 'infinity'::timestamptz) > now()
  );
$$;

revoke all on function public.subject_is_pro(uuid) from public;
grant execute on function public.subject_is_pro(uuid) to authenticated, service_role;

-- Founders: the first 50 artist/venue profiles before 1 Apr 2027, Pro free
-- until 30 Jun 2027. Admin only; refuses once the 50 are taken or the date
-- has passed.
create or replace function public.grant_founder_plan(p_subject_id uuid)
returns public.subject_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.subject_plans;
begin
  if not public.current_user_is_admin() then
    raise exception 'Solo un admin puede dar el plan fundador' using errcode = '42501';
  end if;
  if now() >= '2027-04-01T00:00:00+02'::timestamptz then
    raise exception 'La oferta de fundadores ya ha terminado';
  end if;
  if not exists (select 1 from public.subjects s where s.id = p_subject_id and s.type in ('artist', 'venue')) then
    raise exception 'Solo artistas y salas';
  end if;
  if (select count(*) from public.subject_plans where founder and subject_id <> p_subject_id) >= 50 then
    raise exception 'Ya hay 50 fundadores';
  end if;
  insert into public.subject_plans (subject_id, plan, status, source, founder, trial_ends_at, current_period_end)
  values (p_subject_id, 'pro', 'trialing', 'founder', true, '2027-06-30T23:59:59+02', '2027-06-30T23:59:59+02')
  on conflict (subject_id) do update
    set plan = 'pro', status = 'trialing', source = 'founder', founder = true,
        trial_ends_at = excluded.trial_ends_at, current_period_end = excluded.current_period_end
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.grant_founder_plan(uuid) from public;
grant execute on function public.grant_founder_plan(uuid) to authenticated;

-- Merch paid inside the app is a Pro perk: the stand setting and every new
-- in-app order need a Pro seller. Paying at the stand stays free.
create or replace function public.merch_in_app_requires_pro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.payment_method = 'in_app' and not public.subject_is_pro(new.seller_subject_id) then
    raise exception 'El pago en la app es del plan Pro' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- New stands default to paying at the stand (the free option).
alter table public.event_merch alter column payment_method set default 'at_stand';

drop trigger if exists event_merch_in_app_requires_pro on public.event_merch;
create trigger event_merch_in_app_requires_pro
  before insert or update of payment_method on public.event_merch
  for each row execute function public.merch_in_app_requires_pro();

drop trigger if exists merch_orders_in_app_requires_pro on public.merch_orders;
create trigger merch_orders_in_app_requires_pro
  before insert on public.merch_orders
  for each row execute function public.merch_in_app_requires_pro();

commit;

notify pgrst, 'reload schema';
