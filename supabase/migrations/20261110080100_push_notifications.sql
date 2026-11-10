begin;

-- Push notifications, receiving side (docs/notificaciones.md).
--
-- 1. push_devices: one row per device token (FCM on Android; APNs later).
--    The app writes it through register_push_device()/unregister_push_device()
--    so a token that moves to another account (a shared phone, sign out and
--    in as someone else) is reassigned in one step. Owners can read and
--    delete their own rows; nobody else reads them.
-- 2. notification_preferences: the switches in Ajustes → Notificaciones. No
--    row = the defaults (everything on, quiet hours 23:00–09:00, 3 a day):
--    the sender must coalesce with the column defaults.
-- 3. notifications_sent: what the (future) sender already sent, so a
--    scheduled job that runs twice never notifies twice (dedupe_key unique per
--    person) and can respect daily_limit. service_role only.
--
-- Everything cascades from profiles, so deleting the account removes it
-- (delete_my_account also deletes it explicitly, next migration).
--
-- Additive only. The app treats a missing table/function as "not live yet":
-- the token is not saved and Ajustes keeps the switches on the device.

-- ---------------------------------------------------------------------------
-- 1. Devices
-- ---------------------------------------------------------------------------

create table if not exists public.push_devices (
  id uuid primary key default extensions.gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios', 'web')),
  token text not null unique check (char_length(token) between 1 and 4096),
  app_version text check (app_version is null or char_length(app_version) <= 64),
  locale text check (locale is null or char_length(locale) <= 35),
  timezone text check (timezone is null or char_length(timezone) <= 64),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- Set by the sender when FCM answers UNREGISTERED/INVALID_ARGUMENT; the
  -- next registration of the same token clears it.
  disabled_at timestamptz
);

create index if not exists push_devices_profile_idx on public.push_devices (profile_id) where disabled_at is null;

comment on table public.push_devices is
  'Push tokens of each person''s devices. Written by register_push_device(); read by the sender with the service role. Owners see only their rows.';

alter table public.push_devices enable row level security;

drop policy if exists push_devices_read_own on public.push_devices;
create policy push_devices_read_own on public.push_devices for select to authenticated
  using (profile_id = (select auth.uid()));
drop policy if exists push_devices_delete_own on public.push_devices;
create policy push_devices_delete_own on public.push_devices for delete to authenticated
  using (profile_id = (select auth.uid()));

revoke all on public.push_devices from public, anon, authenticated;
grant select, delete on public.push_devices to authenticated;
grant all on public.push_devices to service_role;

-- Saves (or moves to the caller) this device's token and refreshes its data.
-- Keeps at most 10 devices per person (the oldest seen go).
create or replace function public.register_push_device(
  p_token text,
  p_platform text,
  p_app_version text default null,
  p_locale text default null,
  p_timezone text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_token is null or char_length(p_token) not between 1 and 4096 then
    raise exception using errcode = '22023', message = 'Invalid token';
  end if;
  if p_platform is null or p_platform not in ('android', 'ios', 'web') then
    raise exception using errcode = '22023', message = 'Invalid platform';
  end if;

  insert into public.push_devices (profile_id, platform, token, app_version, locale, timezone, last_seen_at, disabled_at)
  values (
    caller,
    p_platform,
    p_token,
    left(nullif(trim(p_app_version), ''), 64),
    left(nullif(trim(p_locale), ''), 35),
    left(nullif(trim(p_timezone), ''), 64),
    now(),
    null
  )
  on conflict (token) do update
    set profile_id = excluded.profile_id,
        platform = excluded.platform,
        app_version = excluded.app_version,
        locale = excluded.locale,
        timezone = excluded.timezone,
        last_seen_at = now(),
        disabled_at = null;

  delete from public.push_devices
  where profile_id = caller
    and id in (
      select id from public.push_devices
      where profile_id = caller
      order by last_seen_at desc
      offset 10
    );
end;
$$;

comment on function public.register_push_device(text, text, text, text, text) is
  'Saves this device''s push token for the caller (moving it from another account if needed). Only acts on auth.uid().';

-- Sign out on this device: its token stops getting the caller's notices.
create or replace function public.unregister_push_device(p_token text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.push_devices
  where token = p_token
    and profile_id = (select auth.uid());
$$;

comment on function public.unregister_push_device(text) is
  'Deletes the caller''s row for this push token (sign out). Only acts on auth.uid().';

revoke all on function public.register_push_device(text, text, text, text, text) from public;
revoke execute on function public.register_push_device(text, text, text, text, text) from anon;
grant execute on function public.register_push_device(text, text, text, text, text) to authenticated;
revoke all on function public.unregister_push_device(text) from public;
revoke execute on function public.unregister_push_device(text) from anon;
grant execute on function public.unregister_push_device(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Preferences
-- ---------------------------------------------------------------------------

create table if not exists public.notification_preferences (
  profile_id uuid primary key default auth.uid() references public.profiles(id) on delete cascade,
  enabled boolean not null default true,
  -- «Hoy tocan»: the day of a concert the person said «Voy» to.
  concert_day boolean not null default true,
  -- «¿Subes lo de anoche?»: the morning after.
  upload_reminder boolean not null default true,
  -- Reserved merch: pick-up reminders and order changes.
  merch_pickup boolean not null default true,
  -- New moments in a concert they went to.
  new_moments boolean not null default true,
  -- A followed artist, venue or festival announces a concert.
  followed_new_concert boolean not null default true,
  -- Local time of the person's device (push_devices.timezone). Overnight
  -- ranges (start > end) wrap around midnight. start = end: no quiet hours.
  quiet_start time not null default '23:00',
  quiet_end time not null default '09:00',
  daily_limit smallint not null default 3 check (daily_limit between 0 and 20),
  updated_at timestamptz not null default now()
);

comment on table public.notification_preferences is
  'Ajustes → Notificaciones. No row = the column defaults. Owners read and write their row; the sender reads it with the service role.';

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;
create trigger notification_preferences_set_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_read_own on public.notification_preferences;
create policy notification_preferences_read_own on public.notification_preferences for select to authenticated
  using (profile_id = (select auth.uid()));
drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own on public.notification_preferences for insert to authenticated
  with check (profile_id = (select auth.uid()));
drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own on public.notification_preferences for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

revoke all on public.notification_preferences from public, anon, authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;

-- ---------------------------------------------------------------------------
-- 3. What was sent (for the sender)
-- ---------------------------------------------------------------------------

create table if not exists public.notifications_sent (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('concert_day', 'upload_reminder', 'merch_pickup', 'new_moments', 'followed_new_concert')),
  -- e.g. 'concert_day:<event id>', 'merch_pickup:<order id>:24h'.
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 200),
  sent_at timestamptz not null default now(),
  -- Title, body and data as sent (no token).
  payload jsonb not null default '{}'::jsonb,
  constraint notifications_sent_dedupe unique (profile_id, dedupe_key)
);

create index if not exists notifications_sent_profile_sent_idx on public.notifications_sent (profile_id, sent_at desc);

comment on table public.notifications_sent is
  'Log of push notices the sender delivered: insert with ON CONFLICT (profile_id, dedupe_key) DO NOTHING before sending. service_role only.';

alter table public.notifications_sent enable row level security;
revoke all on public.notifications_sent from public, anon, authenticated;
grant all on public.notifications_sent to service_role;

commit;

notify pgrst, 'reload schema';
