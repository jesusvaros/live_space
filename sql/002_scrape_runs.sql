create extension if not exists pgcrypto;

create table if not exists public.scrape_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.scrape_sources(id) on delete cascade,
  status text not null check (status in ('pending', 'running', 'success', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  raw_count integer not null default 0,
  normalized_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists scrape_runs_source_id_idx
  on public.scrape_runs (source_id);

create index if not exists scrape_runs_source_started_at_idx
  on public.scrape_runs (source_id, started_at desc);
