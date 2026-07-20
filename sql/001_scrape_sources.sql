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

create table if not exists public.scrape_sources (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('venue', 'festival', 'promoter', 'directory')),
  source_name text not null,
  source_url text not null,
  city text,
  country text not null default 'ES',
  parser_key text not null,
  scrape_frequency text not null default 'weekly',
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists scrape_sources_source_url_key
  on public.scrape_sources (source_url);

create index if not exists scrape_sources_active_frequency_idx
  on public.scrape_sources (is_active, scrape_frequency);

drop trigger if exists scrape_sources_set_updated_at on public.scrape_sources;
create trigger scrape_sources_set_updated_at
before update on public.scrape_sources
for each row execute function public.set_updated_at();
