begin;

create table public.venue_discovery_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  provider text not null,
  scope text not null,
  status text not null default 'running' check (status in ('running', 'success', 'error')),
  candidate_count integer not null default 0 check (candidate_count >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error_message text,
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object')
);
create index venue_discovery_runs_scope_started_idx
  on public.venue_discovery_runs (provider, scope, started_at desc);

create table public.venue_discovery_candidates (
  id uuid primary key default extensions.gen_random_uuid(),
  provider text not null,
  provider_id text not null,
  scope text not null,
  name text not null,
  normalized_name text not null,
  city text,
  country_code text not null default 'ES' check (char_length(country_code) = 2),
  address text,
  website_url text,
  latitude numeric(10, 8),
  longitude numeric(11, 8),
  source_url text not null,
  evidence_type text not null,
  confidence numeric(5, 4) not null check (confidence between 0 and 1),
  lifecycle_status text not null default 'discovered'
    check (lifecycle_status in ('discovered', 'ready_for_probe', 'active', 'inactive_review', 'ignored')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  consecutive_misses integer not null default 0 check (consecutive_misses >= 0),
  promoted_venue_place_id uuid references public.venue_places(id) on delete set null,
  tags jsonb not null default '{}'::jsonb check (jsonb_typeof(tags) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_id)
);
create index venue_discovery_candidates_queue_idx
  on public.venue_discovery_candidates (lifecycle_status, confidence desc, last_seen_at desc);
create index venue_discovery_candidates_scope_idx
  on public.venue_discovery_candidates (provider, scope, consecutive_misses);

create table public.scrape_source_watch_state (
  source_id uuid primary key references public.scrape_sources(id) on delete cascade,
  last_raw_count integer not null default 0 check (last_raw_count >= 0),
  healthy_run_count integer not null default 0 check (healthy_run_count >= 0),
  consecutive_empty_runs integer not null default 0 check (consecutive_empty_runs >= 0),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  status text not null default 'unknown' check (status in ('unknown', 'healthy', 'degraded', 'broken')),
  last_error text,
  last_checked_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.source_event_observations (
  source_id uuid not null references public.scrape_sources(id) on delete cascade,
  event_key text not null,
  source_event_id text,
  source_url text not null,
  starts_at timestamptz,
  last_raw_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  consecutive_misses integer not null default 0 check (consecutive_misses >= 0),
  status text not null default 'present' check (status in ('present', 'missing_once', 'review', 'ended')),
  primary key (source_id, event_key)
);
create index source_event_observations_missing_idx
  on public.source_event_observations (source_id, status, consecutive_misses);

create table public.scrape_watch_alerts (
  id uuid primary key default extensions.gen_random_uuid(),
  source_id uuid references public.scrape_sources(id) on delete cascade,
  candidate_id uuid references public.venue_discovery_candidates(id) on delete cascade,
  event_key text,
  alert_type text not null check (alert_type in ('source_empty', 'source_failed', 'event_missing', 'venue_missing')),
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  message text not null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index scrape_watch_alerts_open_unique
  on public.scrape_watch_alerts (
    coalesce(source_id::text, ''),
    coalesce(candidate_id::text, ''),
    coalesce(event_key, ''),
    alert_type
  ) where status = 'open';

alter table public.venue_discovery_runs enable row level security;
alter table public.venue_discovery_candidates enable row level security;
alter table public.scrape_source_watch_state enable row level security;
alter table public.source_event_observations enable row level security;
alter table public.scrape_watch_alerts enable row level security;

create policy venue_candidates_staff_read on public.venue_discovery_candidates for select to authenticated
  using (public.current_user_is_staff());
create policy venue_discovery_runs_staff_read on public.venue_discovery_runs for select to authenticated
  using (public.current_user_is_staff());
create policy source_watch_state_staff_read on public.scrape_source_watch_state for select to authenticated
  using (public.current_user_is_staff());
create policy source_observations_staff_read on public.source_event_observations for select to authenticated
  using (public.current_user_is_staff());
create policy scrape_watch_alerts_staff_read on public.scrape_watch_alerts for select to authenticated
  using (public.current_user_is_staff());

grant select on public.venue_discovery_runs, public.venue_discovery_candidates,
  public.scrape_source_watch_state, public.source_event_observations,
  public.scrape_watch_alerts to authenticated;
grant all on public.venue_discovery_runs, public.venue_discovery_candidates,
  public.scrape_source_watch_state, public.source_event_observations,
  public.scrape_watch_alerts to service_role;

commit;
