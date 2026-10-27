begin;

-- 1. Manual edits win over the scraper.
--
-- When a signed-in person (an artist or venue member, or an admin in the app)
-- changes one of the tracked fields of an event, the field name is added to
-- manager_locked_fields. Updates without a user (the scraper and other
-- service-role workers) keep the current value of every locked field. The
-- pipeline also skips those fields itself (src/pipeline/upsertEvents.ts); the
-- trigger is the guarantee for any other job.

alter table public.events
  add column if not exists manager_locked_fields text[] not null default '{}';

comment on column public.events.manager_locked_fields is
  'Fields edited by hand in the management panel; workers never overwrite them.';

create or replace function public.protect_manager_event_edits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  touched text[] := '{}';
begin
  if (select auth.uid()) is not null then
    if new.name is distinct from old.name then touched := array_append(touched, 'name'); end if;
    if new.starts_at is distinct from old.starts_at then touched := array_append(touched, 'starts_at'); end if;
    if new.ends_at is distinct from old.ends_at then touched := array_append(touched, 'ends_at'); end if;
    if new.ticket_url is distinct from old.ticket_url then touched := array_append(touched, 'ticket_url'); end if;
    if new.image_url is distinct from old.image_url then touched := array_append(touched, 'image_url'); end if;
    if new.description is distinct from old.description then touched := array_append(touched, 'description'); end if;
    -- A person can add locks but never drop them from the app.
    new.manager_locked_fields := array(
      select distinct field
      from unnest(old.manager_locked_fields || touched) as field
      order by field
    );
    return new;
  end if;

  if 'name' = any(old.manager_locked_fields) then new.name := old.name; end if;
  if 'starts_at' = any(old.manager_locked_fields) then new.starts_at := old.starts_at; end if;
  if 'ends_at' = any(old.manager_locked_fields) then new.ends_at := old.ends_at; end if;
  if 'ticket_url' = any(old.manager_locked_fields) then new.ticket_url := old.ticket_url; end if;
  if 'image_url' = any(old.manager_locked_fields) then
    new.image_url := old.image_url;
    new.image_source := old.image_source;
  end if;
  if 'description' = any(old.manager_locked_fields) then new.description := old.description; end if;
  return new;
end;
$$;

drop trigger if exists events_protect_manager_edits on public.events;
create trigger events_protect_manager_edits
  before update on public.events
  for each row execute function public.protect_manager_event_edits();

-- 2. Upload token per event, printed in the venue's QR.
--
-- The token lives in its own table, never on events (events is readable by
-- anyone), so it cannot leak through the public event page or share link.
-- Members of the event's artist or venue create, read and rotate it; anyone
-- holding the QR resolves it to the event id with resolve_event_upload_token().

create table if not exists public.event_upload_tokens (
  event_id uuid primary key references public.events(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

alter table public.event_upload_tokens enable row level security;

drop policy if exists event_upload_tokens_manage_read on public.event_upload_tokens;
create policy event_upload_tokens_manage_read on public.event_upload_tokens for select to authenticated
  using (public.can_manage_event(event_id));
drop policy if exists event_upload_tokens_manage_insert on public.event_upload_tokens;
create policy event_upload_tokens_manage_insert on public.event_upload_tokens for insert to authenticated
  with check (public.can_manage_event(event_id) and created_by = (select auth.uid()));
drop policy if exists event_upload_tokens_manage_update on public.event_upload_tokens;
create policy event_upload_tokens_manage_update on public.event_upload_tokens for update to authenticated
  using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));
drop policy if exists event_upload_tokens_manage_delete on public.event_upload_tokens;
create policy event_upload_tokens_manage_delete on public.event_upload_tokens for delete to authenticated
  using (public.can_manage_event(event_id));

revoke all on public.event_upload_tokens from anon, authenticated;
grant select, insert, update, delete on public.event_upload_tokens to authenticated;
grant all on public.event_upload_tokens to service_role;

-- Returns only the event id, and only for a published event.
create or replace function public.resolve_event_upload_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.event_id
  from public.event_upload_tokens t
  join public.events e on e.id = t.event_id
  where t.token = p_token and e.status = 'published';
$$;

revoke all on function public.resolve_event_upload_token(text) from public;
grant execute on function public.resolve_event_upload_token(text) to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';
