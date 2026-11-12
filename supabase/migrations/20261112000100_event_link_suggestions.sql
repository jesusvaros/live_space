begin;

-- «¿Falta un concierto?»: a signed-in person pastes the ticket link of a
-- concert we do not have (docs/scraping.md, "Sugerencias de usuarios"). The
-- daily scrape reads the page's schema.org Event (JSON-LD, no AI), stages it
-- like any other source and the normal staging → confidence → publish path
-- decides. The person gets a push when it is published
-- (docs/notificaciones.md, suggestion_imported).
--
-- 1. event_link_suggestions: one row per person and link. The app inserts
--    (url, note); a trigger normalizes the link, forces the processing
--    columns and enforces the rate limit (10 per person per 24 h). Owners
--    read their rows; nobody else does. The worker (service_role) processes.
-- 2. Two inactive scrape_sources that own the staged rows: links on known
--    ticketing/venue sites (structured data trusted, may auto-publish) and
--    any other site (always human review).
-- 3. Push: the new notice type and its switch in Ajustes → Notificaciones.
--
-- Additive only. Account deletion: suggested_by cascades from profiles, and
-- delete_my_account() deletes the rows explicitly (next migration).

-- ---------------------------------------------------------------------------
-- 1. Suggestions
-- ---------------------------------------------------------------------------

-- Same rules as src/shared/suggestions/url.ts: http(s) only, trimmed, no
-- fragment, no tracking parameters (utm_*, fbclid, gclid…), lower-case
-- scheme and host. Returns null for anything that is not an http(s) URL.
create or replace function public.normalize_suggestion_url(p_url text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  raw text := btrim(coalesce(p_url, ''));
  parts text[];
  scheme text;
  host text;
  rest text;
  base text;
  query text;
  kept text[];
  param text;
begin
  if raw = '' or char_length(raw) > 2048 or raw ~ '\s' then
    return null;
  end if;
  parts := regexp_match(raw, '^([A-Za-z][A-Za-z0-9+.-]*)://([^/?#]+)(.*)$');
  if parts is null then
    return null;
  end if;
  scheme := lower(parts[1]);
  host := lower(parts[2]);
  rest := parts[3];
  if scheme not in ('http', 'https') or host !~ '^[a-z0-9.-]+(:[0-9]{1,5})?$' or host !~ '[a-z0-9]' then
    return null;
  end if;

  rest := regexp_replace(rest, '#.*$', '');
  base := split_part(rest, '?', 1);
  query := case when position('?' in rest) > 0 then substr(rest, position('?' in rest) + 1) else '' end;

  kept := array[]::text[];
  if query <> '' then
    foreach param in array string_to_array(query, '&') loop
      if param <> ''
        and param !~* '^(utm_[^=]*|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|_ga|_gl|yclid|ttclid|twclid)(=|$)' then
        kept := kept || param;
      end if;
    end loop;
  end if;

  return scheme || '://' || host || base || case when cardinality(kept) > 0 then '?' || array_to_string(kept, '&') else '' end;
end;
$$;

comment on function public.normalize_suggestion_url(text) is
  'Normalized http(s) link of an event_link_suggestions row (same rules as src/shared/suggestions/url.ts); null if invalid.';

create table if not exists public.event_link_suggestions (
  id uuid primary key default extensions.gen_random_uuid(),
  url text not null check (char_length(url) between 10 and 2048),
  url_host text not null check (char_length(url_host) between 1 and 255),
  note text check (note is null or char_length(note) <= 500),
  suggested_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'imported', 'duplicate', 'review', 'failed')),
  result_event_id uuid references public.events(id) on delete set null,
  staging_event_id uuid references public.staging_events(id) on delete set null,
  error text check (error is null or char_length(error) <= 1000),
  attempts integer not null default 0 check (attempts >= 0),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint event_link_suggestions_once unique (suggested_by, url)
);

create index if not exists event_link_suggestions_queue_idx
  on public.event_link_suggestions (created_at)
  where status in ('pending', 'review');
create index if not exists event_link_suggestions_by_person_idx
  on public.event_link_suggestions (suggested_by, created_at desc);
create index if not exists event_link_suggestions_url_idx
  on public.event_link_suggestions (url);

comment on table public.event_link_suggestions is
  'Ticket links people send from «¿No encuentras un concierto?». Inserted by the owner (trigger normalizes and rate-limits), processed by src/pipeline/importEventSuggestions.ts with the service role.';

-- Before every insert: normalized link and host, processing columns at their
-- start values whatever the client sent, and at most 10 links per person in
-- 24 h. A trigger (not an RPC) so the limit holds for any insert path the
-- table grants; the advisory lock makes two parallel inserts count each
-- other. The worker (service_role, no auth.uid()) is not rate-limited.
create or replace function public.event_link_suggestions_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  recent integer;
begin
  new.url := public.normalize_suggestion_url(new.url);
  if new.url is null then
    raise exception using errcode = '22023', message = 'invalid_url';
  end if;
  -- 'https://www.Sala.es:443/x?y' → 'sala.es'
  new.url_host := split_part(split_part(split_part(new.url, '://', 2), '/', 1), '?', 1);
  new.url_host := regexp_replace(regexp_replace(new.url_host, ':[0-9]+$', ''), '^www\.', '');
  new.note := nullif(left(btrim(coalesce(new.note, '')), 500), '');

  if caller is not null then
    new.suggested_by := caller;
    new.status := 'pending';
    new.result_event_id := null;
    new.staging_event_id := null;
    new.error := null;
    new.attempts := 0;
    new.processed_at := null;
    new.created_at := now();

    perform pg_advisory_xact_lock(hashtextextended(caller::text || ':event-link-suggestions', 0));
    select count(*) into recent
    from public.event_link_suggestions
    where suggested_by = caller
      and created_at > now() - interval '24 hours';
    if recent >= 10 then
      raise exception using errcode = 'P0001', message = 'rate_limited',
        hint = 'At most 10 links per person every 24 hours.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists event_link_suggestions_before_insert on public.event_link_suggestions;
create trigger event_link_suggestions_before_insert
  before insert on public.event_link_suggestions
  for each row execute function public.event_link_suggestions_before_insert();

revoke all on function public.event_link_suggestions_before_insert() from public, anon, authenticated;

alter table public.event_link_suggestions enable row level security;

drop policy if exists event_link_suggestions_read_own on public.event_link_suggestions;
create policy event_link_suggestions_read_own on public.event_link_suggestions for select to authenticated
  using (suggested_by = (select auth.uid()));
drop policy if exists event_link_suggestions_insert_own on public.event_link_suggestions;
create policy event_link_suggestions_insert_own on public.event_link_suggestions for insert to authenticated
  with check (suggested_by = (select auth.uid()));

revoke all on public.event_link_suggestions from public, anon, authenticated;
grant select on public.event_link_suggestions to authenticated;
grant insert (url, note) on public.event_link_suggestions to authenticated;
grant all on public.event_link_suggestions to service_role;

-- ---------------------------------------------------------------------------
-- 2. Sources that own the staged rows
-- ---------------------------------------------------------------------------

-- Inactive on purpose: scrapeSources never fetches them; only the importer
-- writes staging rows for them. Links on known ticketing sites or on the
-- website of a source we already scrape go to the "trusted" one, whose
-- structured data can publish on its own (confidenceDecision's trusted-source
-- rule); everything else goes to the other one and waits for a human.
insert into public.scrape_sources (source_type, name, base_url, city, parser_key, frequency, is_active, metadata)
values
  (
    'directory',
    'Sugerencias de usuarios (taquillas conocidas)',
    'https://livespace.pages.dev/sugerencias/taquillas',
    null,
    'json-ld-agenda',
    'daily',
    false,
    '{"userSuggestions": true, "structuredDataVerified": true, "fixtureVerified": false}'::jsonb
  ),
  (
    'directory',
    'Sugerencias de usuarios (revisión)',
    'https://livespace.pages.dev/sugerencias/revision',
    null,
    'json-ld-agenda',
    'daily',
    false,
    '{"userSuggestions": true, "structuredDataVerified": false, "fixtureVerified": false}'::jsonb
  )
on conflict (base_url) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Push: «Ya está» when a suggested concert is published
-- ---------------------------------------------------------------------------

alter table public.notification_preferences
  add column if not exists suggestion_imported boolean not null default true;

comment on column public.notification_preferences.suggestion_imported is
  'A concert the person sent with «¿No encuentras un concierto?» is now in the app.';

alter table public.notifications_sent drop constraint if exists notifications_sent_type_check;
alter table public.notifications_sent
  add constraint notifications_sent_type_check
  check (type in ('concert_day', 'upload_reminder', 'merch_pickup', 'new_moments', 'followed_new_concert', 'suggestion_imported'));

commit;

notify pgrst, 'reload schema';
