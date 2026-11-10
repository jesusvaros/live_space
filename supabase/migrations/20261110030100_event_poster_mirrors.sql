begin;

-- Concert posters served from our own R2 bucket.
--
-- events.image_url points at ~60 third-party sites: multi-megabyte originals,
-- signed URLs that expire, http:// that the app blocks as mixed content, hosts
-- that drop non-browser clients. The scraper (npm run posters:mirror, daily
-- step of scrape-weekly.yml) downloads each poster once and stores two WebP
-- renditions in R2: ~320 px for lists and the map, ~800 px for cards and the
-- concert page. The app falls back to the original https URL and then to the
-- generated poster.
--
-- poster_mirrors: one row per source URL (keyed by sha256 of the URL), ok or
-- failed with an attempt counter, so an unchanged URL is never downloaded
-- again and a broken one is retried a few times and then left alone. Only the
-- service role reads or writes it.
--
-- events.poster_thumb_url / events.poster_url are derived, never written by
-- hand: a trigger fills them from poster_mirrors for the event's current
-- image_url (so a changed image_url immediately drops a stale poster, and an
-- URL already mirrored for another date is reused at once), and a trigger on
-- poster_mirrors fills every event showing a newly mirrored URL.
--
-- Additive only: one new table, two nullable columns, three functions, two
-- triggers, one index.

create table if not exists public.poster_mirrors (
  source_hash text primary key
    constraint poster_mirrors_source_hash_check check (source_hash ~ '^[0-9a-f]{64}$'),
  source_url text not null,
  status text not null
    constraint poster_mirrors_status_check check (status in ('ok', 'failed')),
  thumb_url text,
  card_url text,
  -- Bytes stored in R2 for this URL (both renditions); counts toward the cap.
  bytes integer not null default 0 constraint poster_mirrors_bytes_check check (bytes >= 0),
  original_bytes integer,
  original_type text,
  width integer,
  height integer,
  attempts smallint not null default 0,
  last_error text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint poster_mirrors_ok_urls_check check (
    status <> 'ok' or (thumb_url like 'https://%' and card_url like 'https://%')
  )
);

comment on table public.poster_mirrors is
  'Event posters mirrored to R2 (posters/v1/<hash>/w320.webp and w800.webp), one row per source URL. Service role only.';

alter table public.poster_mirrors enable row level security;
revoke all on public.poster_mirrors from anon, authenticated;
grant select, insert, update, delete on public.poster_mirrors to service_role;

alter table public.events
  add column if not exists poster_thumb_url text,
  add column if not exists poster_url text;

comment on column public.events.poster_thumb_url is
  'R2 WebP of image_url, ~320 px wide (lists, map). Derived from poster_mirrors by trigger; null until mirrored.';
comment on column public.events.poster_url is
  'R2 WebP of image_url, ~800 px wide (cards, concert page). Derived from poster_mirrors by trigger; null until mirrored.';

-- Same as posterSourceHash() in src/pipeline/posterMirror.ts.
create or replace function public.poster_source_hash(p_url text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select encode(pg_catalog.sha256(pg_catalog.convert_to(p_url, 'UTF8')), 'hex');
$$;

-- Runs after events_protect_manager_edits (triggers fire by name), so a locked
-- image_url the worker could not change keeps its own poster. security
-- definer: managers update events but cannot read poster_mirrors.
create or replace function public.sync_event_poster()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mirror record;
begin
  new.poster_thumb_url := null;
  new.poster_url := null;
  if new.image_url is not null then
    select m.thumb_url, m.card_url into mirror
    from public.poster_mirrors m
    where m.source_hash = public.poster_source_hash(new.image_url)
      and m.status = 'ok';
    if found then
      new.poster_thumb_url := mirror.thumb_url;
      new.poster_url := mirror.card_url;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_event_poster() from public;

drop trigger if exists events_sync_poster on public.events;
create trigger events_sync_poster
  before insert or update of image_url, poster_thumb_url, poster_url on public.events
  for each row execute function public.sync_event_poster();

-- Equality lookups by image_url (URLs can be longer than a btree entry allows).
create index if not exists events_image_url_hash_idx on public.events using hash (image_url);

create or replace function public.propagate_poster_mirror()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The events trigger derives the values; this only makes it run.
  update public.events e
  set poster_url = case when new.status = 'ok' then new.card_url end,
      poster_thumb_url = case when new.status = 'ok' then new.thumb_url end
  where e.image_url = new.source_url
    and (
      e.poster_url is distinct from (case when new.status = 'ok' then new.card_url end)
      or e.poster_thumb_url is distinct from (case when new.status = 'ok' then new.thumb_url end)
    );
  return null;
end;
$$;

revoke all on function public.propagate_poster_mirror() from public;

drop trigger if exists poster_mirrors_propagate on public.poster_mirrors;
create trigger poster_mirrors_propagate
  after insert or update on public.poster_mirrors
  for each row execute function public.propagate_poster_mirror();

-- Bytes the mirrored posters take in R2, for the storage cap shared with fan
-- videos (media-r2-sign and the mirror worker both add it).
create or replace function public.r2_poster_stored_bytes()
returns bigint
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(bytes), 0)::bigint from public.poster_mirrors;
$$;

revoke all on function public.r2_poster_stored_bytes() from public, anon, authenticated;
grant execute on function public.r2_poster_stored_bytes() to service_role;
revoke all on function public.poster_source_hash(text) from public, anon, authenticated;
grant execute on function public.poster_source_hash(text) to service_role;

commit;

notify pgrst, 'reload schema';
