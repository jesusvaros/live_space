create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.artists
  add column if not exists normalized_name text,
  add column if not exists aliases text[] not null default '{}'::text[];

create index if not exists artists_normalized_name_idx
  on public.artists (normalized_name);

alter table public.events
  add column if not exists external_source text,
  add column if not exists external_source_id text,
  add column if not exists source_url text,
  add column if not exists normalized_name text,
  add column if not exists event_type text;

create index if not exists events_source_url_idx
  on public.events (source_url);

create index if not exists events_normalized_name_idx
  on public.events (normalized_name);

alter table public.venue_places
  add column if not exists normalized_name text,
  add column if not exists external_source text,
  add column if not exists external_source_id text,
  add column if not exists source_url text;

create index if not exists venue_places_normalized_name_idx
  on public.venue_places (normalized_name);

create index if not exists venue_places_source_url_idx
  on public.venue_places (source_url);

alter table public.event_artists
  add column if not exists artist_entity_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'event_artists_artist_entity_fk'
  ) then
    alter table public.event_artists
      add constraint event_artists_artist_entity_fk
      foreign key (artist_entity_id) references public.artists(id) on delete cascade;
  end if;
end $$;

drop index if exists public.uniq_event_artists_event;

create unique index if not exists event_artists_event_artist_entity_key
  on public.event_artists (event_id, artist_entity_id)
  where artist_entity_id is not null;

create table if not exists public.ai_extraction_cache (
  input_hash text primary key,
  model text not null,
  request_payload jsonb not null,
  response_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ai_extraction_cache_set_updated_at on public.ai_extraction_cache;
create trigger ai_extraction_cache_set_updated_at
before update on public.ai_extraction_cache
for each row execute function public.set_updated_at();
