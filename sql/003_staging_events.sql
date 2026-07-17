create extension if not exists pgcrypto;

create table if not exists public.staging_events (
  id uuid primary key default gen_random_uuid(),
  scrape_run_id uuid not null references public.scrape_runs(id) on delete cascade,
  source_id uuid not null references public.scrape_sources(id) on delete cascade,
  raw_payload jsonb not null,
  source_event_url text,
  source_event_id text,
  extracted_title text,
  extracted_description text,
  extracted_date_text text,
  extracted_starts_at timestamptz,
  extracted_venue_name text,
  extracted_city text,
  extracted_artist_names text[] not null default '{}'::text[],
  ai_normalized jsonb,
  normalization_status text not null default 'pending' check (normalization_status in ('pending', 'processed', 'error')),
  processing_error text,
  processed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists staging_events_source_id_idx
  on public.staging_events (source_id);

create index if not exists staging_events_processed_idx
  on public.staging_events (processed);

create index if not exists staging_events_source_event_url_idx
  on public.staging_events (source_event_url);

create index if not exists staging_events_scrape_run_id_idx
  on public.staging_events (scrape_run_id);

drop trigger if exists staging_events_set_updated_at on public.staging_events;
create trigger staging_events_set_updated_at
before update on public.staging_events
for each row execute function public.set_updated_at();
