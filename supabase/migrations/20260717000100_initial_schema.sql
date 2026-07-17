begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create type public.app_role as enum ('user', 'moderator', 'admin');
create type public.subject_type as enum ('user', 'artist', 'venue');
create type public.entity_member_role as enum ('owner', 'admin', 'editor', 'moderator');
create type public.publish_status as enum ('draft', 'review', 'published', 'archived', 'cancelled');
create type public.media_kind as enum ('image', 'video');
create type public.media_status as enum ('reserved', 'processing', 'pending_review', 'published', 'rejected', 'deleted');
create type public.attendance_status as enum ('interested', 'going', 'attended');
create type public.scrape_source_type as enum ('venue', 'festival', 'promoter', 'directory');
create type public.scrape_run_status as enum ('pending', 'running', 'success', 'partial', 'error');
create type public.review_status as enum ('pending', 'approved', 'rejected', 'merged');
create type public.report_target_type as enum ('post', 'profile', 'artist', 'venue', 'event');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username extensions.citext unique,
  display_name text,
  avatar_url text,
  bio text,
  primary_city text,
  external_links jsonb not null default '{}'::jsonb check (jsonb_typeof(external_links) = 'object'),
  app_role public.app_role not null default 'user',
  is_private boolean not null default false,
  terms_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_length check (username is null or char_length(username::text) between 3 and 32)
);

create table public.artists (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  artist_type text not null default 'band' check (artist_type in ('solo', 'band', 'collective', 'dj', 'other')),
  city text,
  country_code text not null default 'ES' check (char_length(country_code) = 2),
  bio text,
  genres text[] not null default '{}',
  external_ids jsonb not null default '{}'::jsonb check (jsonb_typeof(external_ids) = 'object'),
  external_links jsonb not null default '{}'::jsonb check (jsonb_typeof(external_links) = 'object'),
  status public.publish_status not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index artists_normalized_country_unique
  on public.artists (normalized_name, country_code)
  where status <> 'archived';
create index artists_name_search_idx on public.artists using gin (to_tsvector('simple', name));

create table public.venue_places (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  normalized_name text not null,
  city text not null,
  country_code text not null default 'ES' check (char_length(country_code) = 2),
  address text,
  postal_code text,
  capacity integer check (capacity is null or capacity > 0),
  venue_type text,
  latitude numeric(10, 8) check (latitude is null or latitude between -90 and 90),
  longitude numeric(11, 8) check (longitude is null or longitude between -180 and 180),
  website_url text,
  external_ids jsonb not null default '{}'::jsonb check (jsonb_typeof(external_ids) = 'object'),
  status public.publish_status not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index venues_normalized_city_country_unique
  on public.venue_places (normalized_name, city, country_code)
  where status <> 'archived';
create index venues_name_search_idx on public.venue_places using gin (to_tsvector('simple', name));
create index venues_city_idx on public.venue_places (city);

create table public.subjects (
  id uuid primary key default extensions.gen_random_uuid(),
  type public.subject_type not null,
  profile_id uuid unique references public.profiles(id) on delete cascade,
  artist_id uuid unique references public.artists(id) on delete cascade,
  venue_place_id uuid unique references public.venue_places(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint subjects_exactly_one_reference check (
    num_nonnulls(profile_id, artist_id, venue_place_id) = 1
  ),
  constraint subjects_type_matches_reference check (
    (type = 'user' and profile_id is not null) or
    (type = 'artist' and artist_id is not null) or
    (type = 'venue' and venue_place_id is not null)
  )
);

create table public.entity_memberships (
  subject_id uuid not null references public.subjects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.entity_member_role not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (subject_id, profile_id)
);
create index entity_memberships_profile_idx on public.entity_memberships (profile_id);

create table public.events (
  id uuid primary key default extensions.gen_random_uuid(),
  venue_place_id uuid not null references public.venue_places(id) on delete restrict,
  name text not null,
  normalized_name text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'Europe/Madrid',
  city text not null,
  address text,
  latitude numeric(10, 8) check (latitude is null or latitude between -90 and 90),
  longitude numeric(11, 8) check (longitude is null or longitude between -180 and 180),
  genres text[] not null default '{}',
  is_free boolean not null default false,
  price_tiers jsonb not null default '[]'::jsonb check (jsonb_typeof(price_tiers) = 'array'),
  ticket_url text,
  source_url text,
  source_id uuid,
  source_external_id text,
  status public.publish_status not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_valid_time_range check (ends_at is null or ends_at > starts_at)
);
create index events_starts_at_idx on public.events (starts_at);
create index events_city_starts_at_idx on public.events (city, starts_at);
create index events_venue_starts_at_idx on public.events (venue_place_id, starts_at);

create table public.event_artists (
  event_id uuid not null references public.events(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  billing_order smallint not null default 0 check (billing_order >= 0),
  is_headliner boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (event_id, artist_id)
);

create table public.songs (
  id uuid primary key default extensions.gen_random_uuid(),
  title text not null,
  normalized_title text not null,
  primary_artist_id uuid references public.artists(id) on delete set null,
  external_ids jsonb not null default '{}'::jsonb check (jsonb_typeof(external_ids) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index songs_title_search_idx on public.songs using gin (to_tsvector('simple', title));

create table public.event_setlist_items (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  song_id uuid references public.songs(id) on delete set null,
  title_override text,
  artist_id uuid references public.artists(id) on delete set null,
  position integer not null check (position > 0),
  performed_at_offset_seconds integer check (performed_at_offset_seconds is null or performed_at_offset_seconds >= 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, position),
  constraint setlist_has_title check (song_id is not null or nullif(trim(title_override), '') is not null)
);

create table public.media_upload_reservations (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind public.media_kind not null,
  event_id uuid references public.events(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  upload_preset text not null,
  folder text not null,
  cloudinary_public_id text not null unique,
  max_bytes bigint not null check (max_bytes > 0),
  max_duration_seconds integer check (max_duration_seconds is null or max_duration_seconds > 0),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  rejected_reason text,
  created_at timestamptz not null default now()
);
create index media_reservations_user_created_idx on public.media_upload_reservations (user_id, created_at desc);

create table public.media_assets (
  id uuid primary key default extensions.gen_random_uuid(),
  reservation_id uuid unique references public.media_upload_reservations(id) on delete set null,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  kind public.media_kind not null,
  event_id uuid references public.events(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  cloudinary_public_id text not null unique,
  cloudinary_version bigint,
  resource_type text not null check (resource_type in ('image', 'video')),
  format text,
  bytes bigint check (bytes is null or bytes >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_seconds numeric(10, 3) check (duration_seconds is null or duration_seconds >= 0),
  secure_url text,
  thumbnail_url text,
  checksum text,
  attribution jsonb not null default '{}'::jsonb check (jsonb_typeof(attribution) = 'object'),
  status public.media_status not null default 'processing',
  moderation_notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index media_assets_event_status_idx on public.media_assets (event_id, status, created_at desc);
create index media_assets_owner_idx on public.media_assets (owner_id, created_at desc);

create table public.posts (
  id uuid primary key default extensions.gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  media_asset_id uuid not null unique references public.media_assets(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete cascade,
  song_id uuid references public.songs(id) on delete set null,
  caption text,
  captured_at timestamptz,
  status public.publish_status not null default 'review',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index posts_event_status_created_idx on public.posts (event_id, status, created_at desc);
create index posts_author_created_idx on public.posts (author_id, created_at desc);

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, profile_id)
);

create table public.follows (
  follower_subject_id uuid not null references public.subjects(id) on delete cascade,
  target_subject_id uuid not null references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_subject_id, target_subject_id),
  constraint follows_no_self check (follower_subject_id <> target_subject_id)
);
create index follows_target_idx on public.follows (target_subject_id);

create table public.event_saves (
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

create table public.event_attendance (
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status public.attendance_status not null default 'interested',
  checked_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);

create table public.scrape_sources (
  id uuid primary key default extensions.gen_random_uuid(),
  source_type public.scrape_source_type not null,
  name text not null,
  base_url text not null unique,
  city text,
  country_code text not null default 'ES' check (char_length(country_code) = 2),
  parser_key text not null,
  frequency text not null default 'daily',
  terms_reviewed_at timestamptz,
  is_active boolean not null default false,
  last_success_at timestamptz,
  health_score numeric(5, 4) check (health_score is null or health_score between 0 and 1),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.scrape_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  source_id uuid not null references public.scrape_sources(id) on delete cascade,
  status public.scrape_run_status not null default 'pending',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  raw_count integer not null default 0 check (raw_count >= 0),
  normalized_count integer not null default 0 check (normalized_count >= 0),
  published_count integer not null default 0 check (published_count >= 0),
  error_message text,
  metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(metrics) = 'object'),
  created_at timestamptz not null default now()
);
create index scrape_runs_source_started_idx on public.scrape_runs (source_id, started_at desc);

create table public.staging_events (
  id uuid primary key default extensions.gen_random_uuid(),
  scrape_run_id uuid not null references public.scrape_runs(id) on delete cascade,
  source_id uuid not null references public.scrape_sources(id) on delete cascade,
  source_event_id text,
  source_url text not null,
  raw_payload jsonb not null,
  raw_hash text not null,
  extracted_title text,
  extracted_date_text text,
  extracted_starts_at timestamptz,
  extracted_venue_name text,
  extracted_city text,
  extracted_artist_names text[] not null default '{}',
  normalized_payload jsonb,
  confidence numeric(5, 4) check (confidence is null or confidence between 0 and 1),
  review_status public.review_status not null default 'pending',
  published_event_id uuid references public.events(id) on delete set null,
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, raw_hash)
);
create index staging_events_review_idx on public.staging_events (review_status, confidence);

alter table public.events
  add constraint events_source_fk foreign key (source_id) references public.scrape_sources(id) on delete set null;
create unique index events_source_identity_unique
  on public.events (source_id, source_external_id)
  where source_id is not null and source_external_id is not null;

create table public.entity_merge_history (
  id uuid primary key default extensions.gen_random_uuid(),
  entity_type public.subject_type not null check (entity_type in ('artist', 'venue')),
  source_entity_id uuid not null,
  target_entity_id uuid not null,
  confidence numeric(5, 4) not null check (confidence between 0 and 1),
  reason text not null,
  performed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint merge_distinct_entities check (source_entity_id <> target_entity_id)
);

create table public.moderation_reports (
  id uuid primary key default extensions.gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type public.report_target_type not null,
  target_id uuid not null,
  reason text not null,
  details text,
  status public.report_status not null default 'open',
  assigned_to uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index moderation_reports_queue_idx on public.moderation_reports (status, created_at);

create table public.moderation_actions (
  id uuid primary key default extensions.gen_random_uuid(),
  report_id uuid references public.moderation_reports(id) on delete set null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action_type text not null,
  target_type public.report_target_type not null,
  target_id uuid not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create table public.platform_settings (
  singleton boolean primary key default true check (singleton),
  media_uploads_paused boolean not null default false,
  cloudinary_usage_percent numeric(5, 2) not null default 0 check (cloudinary_usage_percent between 0 and 100),
  warning_sent_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (singleton) values (true);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'artists', 'venue_places', 'entity_memberships', 'events', 'songs',
    'event_setlist_items', 'media_assets', 'posts', 'event_attendance', 'scrape_sources',
    'staging_events', 'moderation_reports', 'platform_settings'
  ] loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url, primary_city)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'username', ''),
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(new.raw_user_meta_data ->> 'primary_city', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.create_subject_for_entity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'profiles' then
    insert into public.subjects (type, profile_id) values ('user', new.id);
  elsif tg_table_name = 'artists' then
    insert into public.subjects (type, artist_id) values ('artist', new.id);
  elsif tg_table_name = 'venue_places' then
    insert into public.subjects (type, venue_place_id) values ('venue', new.id);
  end if;
  return new;
end;
$$;

create trigger profiles_create_subject after insert on public.profiles for each row execute function public.create_subject_for_entity();
create trigger artists_create_subject after insert on public.artists for each row execute function public.create_subject_for_entity();
create trigger venues_create_subject after insert on public.venue_places for each row execute function public.create_subject_for_entity();

create or replace function public.prevent_profile_privilege_escalation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.app_role <> old.app_role
    and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'app_role cannot be changed through the profile update endpoint';
  end if;
  return new;
end;
$$;
create trigger profiles_prevent_privilege_escalation
before update of app_role on public.profiles
for each row execute function public.prevent_profile_privilege_escalation();

commit;
