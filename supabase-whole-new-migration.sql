-- ============================================================================
-- APPMUSICLIVE: Social + Admin Entities + Reels Timeline + Official Setlist
-- PASS 1 (SAFE / BACKWARD-COMPATIBLE)
-- Target: Supabase Postgres (public schema)
--
-- What this creates:
--  - artists (solo + band)
--  - songs
--  - subjects (followable targets: user | venue | artist)
--  - follows (social graph)
--  - entity_admins (multi-user admin for venue/artist)
--  - profile_privacy (public/private for user; no requests)
--  - event_setlist (official setlist per event, ordered, optionally timed)
--  - posts timeline fields + music metadata + view to resolve setlist per post
--
-- What this migrates/backfills:
--  - Creates subjects for all profiles and venue_places
--  - Adds actor_subject_id to posts/likes/saves/attendance and backfills from user_id
--  - Adds artist_entity_id columns to event_artists/label_artists and backfills from legacy profile IDs
--  - Backfills posts.event_offset_ms from captured_at - events.starts_at where possible
--
-- Notes:
--  - Does NOT drop legacy columns or constraints. You can do that in PASS 2 later.
--  - Uses best-effort mapping from legacy "artist profiles" to new artists entities.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 0) Prereqs
-- --------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- --------------------------------------------------------------------------
-- 1) Artists entity (solo + band)
-- --------------------------------------------------------------------------
create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  artist_type text not null check (artist_type in ('solo','band')),
  city text,
  bio text,
  avatar_url text,
  genres text[] not null default '{}'::text[],
  external_links jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists artists_name_fts_idx
  on public.artists using gin (to_tsvector('simple', name));
create index if not exists artists_city_idx on public.artists (city);

-- --------------------------------------------------------------------------
-- 2) Songs catalog
-- --------------------------------------------------------------------------
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  primary_artist_id uuid references public.artists(id),
  external_ids jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists songs_title_fts_idx
  on public.songs using gin (to_tsvector('simple', title));
create index if not exists songs_primary_artist_idx
  on public.songs(primary_artist_id);

-- --------------------------------------------------------------------------
-- 3) Subjects (followable identity wrapper)
--     user -> profiles
--     venue -> venue_places (your existing venue entity table)
--     artist -> artists
-- --------------------------------------------------------------------------
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('user','venue','artist')),

  profile_id uuid unique,
  venue_place_id uuid unique,
  artist_id uuid unique,

  created_at timestamptz not null default now(),

  constraint subjects_profile_fk foreign key (profile_id) references public.profiles(id) on delete cascade,
  constraint subjects_venue_fk foreign key (venue_place_id) references public.venue_places(id) on delete cascade,
  constraint subjects_artist_fk foreign key (artist_id) references public.artists(id) on delete cascade,

  constraint subjects_exactly_one_ref_chk check (
    (case when profile_id is not null then 1 else 0 end) +
    (case when venue_place_id is not null then 1 else 0 end) +
    (case when artist_id is not null then 1 else 0 end)
    = 1
  ),

  constraint subjects_type_matches_ref_chk check (
    (type = 'user' and profile_id is not null and venue_place_id is null and artist_id is null) or
    (type = 'venue' and venue_place_id is not null and profile_id is null and artist_id is null) or
    (type = 'artist' and artist_id is not null and profile_id is null and venue_place_id is null)
  )
);

create index if not exists subjects_type_idx on public.subjects(type);

-- --------------------------------------------------------------------------
-- 4) Social graph: follows
-- --------------------------------------------------------------------------
create table if not exists public.follows (
  follower_subject_id uuid not null references public.subjects(id) on delete cascade,
  target_subject_id uuid not null references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_subject_id, target_subject_id),
  constraint follows_no_self_chk check (follower_subject_id <> target_subject_id)
);

create index if not exists follows_target_idx on public.follows(target_subject_id);

-- --------------------------------------------------------------------------
-- 5) Admins: users administer venue/artist subjects (many-to-many)
-- --------------------------------------------------------------------------
create table if not exists public.entity_admins (
  subject_id uuid not null references public.subjects(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','admin','editor','moderator')),
  created_at timestamptz not null default now(),
  primary key (subject_id, profile_id)
);

create index if not exists entity_admins_profile_idx on public.entity_admins(profile_id);

-- --------------------------------------------------------------------------
-- 6) Privacy: user can be public/private now (no follow requests)
-- --------------------------------------------------------------------------
create table if not exists public.profile_privacy (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at helper
create or replace function public.trg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profile_privacy_set_updated_at on public.profile_privacy;
create trigger profile_privacy_set_updated_at
before update on public.profile_privacy
for each row execute function public.trg_set_updated_at();

-- --------------------------------------------------------------------------
-- 7) Helper functions: get-or-create subjects
-- --------------------------------------------------------------------------
create or replace function public.get_or_create_user_subject(p_profile_id uuid)
returns uuid
language plpgsql
as $$
declare sid uuid;
begin
  select id into sid from public.subjects where type='user' and profile_id=p_profile_id;
  if sid is null then
    insert into public.subjects(type, profile_id) values ('user', p_profile_id) returning id into sid;
  end if;
  return sid;
end;
$$;

create or replace function public.get_or_create_venue_subject(p_venue_place_id uuid)
returns uuid
language plpgsql
as $$
declare sid uuid;
begin
  select id into sid from public.subjects where type='venue' and venue_place_id=p_venue_place_id;
  if sid is null then
    insert into public.subjects(type, venue_place_id) values ('venue', p_venue_place_id) returning id into sid;
  end if;
  return sid;
end;
$$;

create or replace function public.get_or_create_artist_subject(p_artist_id uuid)
returns uuid
language plpgsql
as $$
declare sid uuid;
begin
  select id into sid from public.subjects where type='artist' and artist_id=p_artist_id;
  if sid is null then
    insert into public.subjects(type, artist_id) values ('artist', p_artist_id) returning id into sid;
  end if;
  return sid;
end;
$$;

-- --------------------------------------------------------------------------
-- 8) Triggers: auto-create user subjects + default privacy on new profiles
-- --------------------------------------------------------------------------
create or replace function public.trg_profiles_after_insert_bootstrap()
returns trigger
language plpgsql
as $$
begin
  perform public.get_or_create_user_subject(new.id);

  insert into public.profile_privacy(profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  return new;
end;
$$;

drop trigger if exists profiles_after_insert_bootstrap on public.profiles;
create trigger profiles_after_insert_bootstrap
after insert on public.profiles
for each row execute function public.trg_profiles_after_insert_bootstrap();

-- auto-create venue subjects on new venue_places
create or replace function public.trg_venue_places_after_insert_create_subject()
returns trigger
language plpgsql
as $$
begin
  perform public.get_or_create_venue_subject(new.id);
  return new;
end;
$$;

drop trigger if exists venue_places_after_insert_create_subject on public.venue_places;
create trigger venue_places_after_insert_create_subject
after insert on public.venue_places
for each row execute function public.trg_venue_places_after_insert_create_subject();

-- --------------------------------------------------------------------------
-- 9) Backfill subjects + privacy
-- --------------------------------------------------------------------------
-- users
insert into public.subjects(type, profile_id)
select 'user', p.id
from public.profiles p
left join public.subjects s on s.type='user' and s.profile_id=p.id
where s.id is null;

insert into public.profile_privacy(profile_id)
select p.id
from public.profiles p
left join public.profile_privacy pp on pp.profile_id=p.id
where pp.profile_id is null;

-- venues
insert into public.subjects(type, venue_place_id)
select 'venue', v.id
from public.venue_places v
left join public.subjects s on s.type='venue' and s.venue_place_id=v.id
where s.id is null;

-- --------------------------------------------------------------------------
-- 10) Legacy->Entity mapping for artists referenced via profiles
--     We create a mapping table so you can correct any mismatches later.
-- --------------------------------------------------------------------------
create table if not exists public.profile_artist_entity_map (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  artist_id uuid not null references public.artists(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Ensure new columns exist for event_artists / label_artists
alter table public.event_artists
  add column if not exists artist_entity_id uuid;

alter table public.label_artists
  add column if not exists artist_entity_id uuid;

-- Create artists for referenced profiles (best-effort)
with referenced_profiles as (
  select artist_id as profile_id from public.event_artists
  union
  select artist_id as profile_id from public.label_artists
  union
  select profile_id from public.profile_artist
),
to_create as (
  select
    p.id as profile_id,
    coalesce(nullif(p.display_name,''), nullif(p.username::text,''), 'Unknown Artist') as name,
    p.primary_city as city,
    p.bio as bio,
    p.avatar_url as avatar_url,
    coalesce(pa.genres, '{}'::text[]) as genres,
    coalesce(p.external_links, '{}'::jsonb) as external_links
  from referenced_profiles rp
  join public.profiles p on p.id = rp.profile_id
  left join public.profile_artist pa on pa.profile_id = p.id
)
-- Only create if this profile isn't mapped yet
insert into public.artists (name, artist_type, city, bio, avatar_url, genres, external_links)
select
  tc.name,
  'solo',
  tc.city,
  tc.bio,
  tc.avatar_url,
  tc.genres,
  tc.external_links
from to_create tc
left join public.profile_artist_entity_map m on m.profile_id = tc.profile_id
where m.profile_id is null
-- No natural unique key; we may create duplicates across profiles with same name. Acceptable.
;

-- Map any still-unmapped profiles by creating one artist each deterministically
with referenced_profiles as (
  select artist_id as profile_id from public.event_artists
  union
  select artist_id as profile_id from public.label_artists
  union
  select profile_id from public.profile_artist
),
unmapped as (
  select
    p.id as profile_id,
    coalesce(nullif(p.display_name,''), nullif(p.username::text,''), 'Unknown Artist') as name,
    p.primary_city as city,
    p.bio as bio,
    p.avatar_url as avatar_url,
    coalesce(pa.genres, '{}'::text[]) as genres,
    coalesce(p.external_links, '{}'::jsonb) as external_links
  from referenced_profiles rp
  join public.profiles p on p.id = rp.profile_id
  left join public.profile_artist_entity_map m on m.profile_id = p.id
  left join public.profile_artist pa on pa.profile_id = p.id
  where m.profile_id is null
),
created as (
  insert into public.artists (name, artist_type, city, bio, avatar_url, genres, external_links)
  select u.name, 'solo', u.city, u.bio, u.avatar_url, u.genres, u.external_links
  from unmapped u
  returning id, name, avatar_url
)
insert into public.profile_artist_entity_map(profile_id, artist_id)
select u.profile_id, c.id
from unmapped u
join created c
  on c.name = u.name and coalesce(c.avatar_url,'') = coalesce(u.avatar_url,'')
on conflict (profile_id) do nothing;

-- Backfill event_artists / label_artists with new entity id
update public.event_artists ea
set artist_entity_id = m.artist_id
from public.profile_artist_entity_map m
where ea.artist_entity_id is null
  and ea.artist_id = m.profile_id;

update public.label_artists la
set artist_entity_id = m.artist_id
from public.profile_artist_entity_map m
where la.artist_entity_id is null
  and la.artist_id = m.profile_id;

-- Add FKs (do NOT set NOT NULL yet; avoid migration failure if you have orphan rows)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'event_artists_artist_entity_fk'
  ) then
    alter table public.event_artists
      add constraint event_artists_artist_entity_fk
      foreign key (artist_entity_id) references public.artists(id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'label_artists_artist_entity_fk'
  ) then
    alter table public.label_artists
      add constraint label_artists_artist_entity_fk
      foreign key (artist_entity_id) references public.artists(id);
  end if;
end $$;

-- Create subjects for artists that exist now
insert into public.subjects(type, artist_id)
select 'artist', a.id
from public.artists a
left join public.subjects s on s.type='artist' and s.artist_id=a.id
where s.id is null;

-- --------------------------------------------------------------------------
-- 11) Social actions: add actor_subject_id to existing tables and backfill
-- --------------------------------------------------------------------------
-- posts: add actor_subject_id (future-proof) + timeline/music fields
alter table public.posts
  add column if not exists actor_subject_id uuid,
  add column if not exists event_offset_ms bigint,
  add column if not exists performance_artist_id uuid,
  add column if not exists song_id uuid,
  add column if not exists song_title text,
  add column if not exists song_confidence real,
  add column if not exists song_source text;

-- Backfill posts.actor_subject_id from legacy posts.user_id
update public.posts p
set actor_subject_id = public.get_or_create_user_subject(p.user_id)
where p.actor_subject_id is null
  and p.user_id is not null;

-- FK
do $$
begin
  if not exists (select 1 from pg_constraint where conname='posts_actor_subject_fk') then
    alter table public.posts
      add constraint posts_actor_subject_fk foreign key (actor_subject_id) references public.subjects(id);
  end if;

  if not exists (select 1 from pg_constraint where conname='posts_performance_artist_fk') then
    alter table public.posts
      add constraint posts_performance_artist_fk foreign key (performance_artist_id) references public.artists(id);
  end if;

  if not exists (select 1 from pg_constraint where conname='posts_song_fk') then
    alter table public.posts
      add constraint posts_song_fk foreign key (song_id) references public.songs(id);
  end if;
end $$;

create index if not exists posts_event_offset_idx
  on public.posts (event_id, event_offset_ms, created_at);

create index if not exists posts_event_song_idx
  on public.posts (event_id, song_id);

create index if not exists posts_event_performance_artist_idx
  on public.posts (event_id, performance_artist_id);

-- Backfill event_offset_ms from captured_at - events.starts_at (ms), clamp at 0
update public.posts p
set event_offset_ms =
  greatest(0, (extract(epoch from (p.captured_at - e.starts_at)) * 1000)::bigint)
from public.events e
where p.event_id = e.id
  and p.event_offset_ms is null
  and p.captured_at is not null
  and e.starts_at is not null;

-- event_attendance
alter table public.event_attendance
  add column if not exists actor_subject_id uuid;

update public.event_attendance ea
set actor_subject_id = public.get_or_create_user_subject(ea.user_id)
where ea.actor_subject_id is null
  and ea.user_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='event_attendance_actor_subject_fk') then
    alter table public.event_attendance
      add constraint event_attendance_actor_subject_fk foreign key (actor_subject_id) references public.subjects(id);
  end if;
end $$;

-- event_saves
alter table public.event_saves
  add column if not exists actor_subject_id uuid;

update public.event_saves es
set actor_subject_id = public.get_or_create_user_subject(es.user_id)
where es.actor_subject_id is null
  and es.user_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='event_saves_actor_subject_fk') then
    alter table public.event_saves
      add constraint event_saves_actor_subject_fk foreign key (actor_subject_id) references public.subjects(id);
  end if;
end $$;

-- post_likes
alter table public.post_likes
  add column if not exists actor_subject_id uuid;

update public.post_likes pl
set actor_subject_id = public.get_or_create_user_subject(pl.user_id)
where pl.actor_subject_id is null
  and pl.user_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='post_likes_actor_subject_fk') then
    alter table public.post_likes
      add constraint post_likes_actor_subject_fk foreign key (actor_subject_id) references public.subjects(id);
  end if;
end $$;

-- Trigger: keep legacy user_id <-> actor_subject_id in sync on insert/update
create or replace function public.trg_set_actor_subject_from_user_id()
returns trigger
language plpgsql
as $$
begin
  if new.actor_subject_id is null and new.user_id is not null then
    new.actor_subject_id := public.get_or_create_user_subject(new.user_id);
  end if;

  if new.user_id is null and new.actor_subject_id is not null then
    select s.profile_id into new.user_id
    from public.subjects s
    where s.id = new.actor_subject_id and s.type = 'user';
  end if;

  return new;
end;
$$;

drop trigger if exists event_attendance_set_actor_subject on public.event_attendance;
create trigger event_attendance_set_actor_subject
before insert or update on public.event_attendance
for each row execute function public.trg_set_actor_subject_from_user_id();

drop trigger if exists event_saves_set_actor_subject on public.event_saves;
create trigger event_saves_set_actor_subject
before insert or update on public.event_saves
for each row execute function public.trg_set_actor_subject_from_user_id();

drop trigger if exists post_likes_set_actor_subject on public.post_likes;
create trigger post_likes_set_actor_subject
before insert or update on public.post_likes
for each row execute function public.trg_set_actor_subject_from_user_id();

drop trigger if exists posts_set_actor_subject on public.posts;
create trigger posts_set_actor_subject
before insert or update on public.posts
for each row execute function public.trg_set_actor_subject_from_user_id();

-- --------------------------------------------------------------------------
-- 12) Official event setlist
-- --------------------------------------------------------------------------
create table if not exists public.event_setlist (
  event_id uuid not null references public.events(id) on delete cascade,
  ordinal integer not null,

  performer_artist_id uuid references public.artists(id),
  song_id uuid references public.songs(id),
  song_title text,          -- fallback if not in catalog
  version_notes text,

  starts_offset_ms bigint,  -- relative to events.starts_at (ms since start)
  ends_offset_ms bigint,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (event_id, ordinal),

  constraint event_setlist_ordinal_positive_chk check (ordinal >= 1),
  constraint event_setlist_offsets_nonneg_chk check (
    (starts_offset_ms is null or starts_offset_ms >= 0) and
    (ends_offset_ms is null or ends_offset_ms >= 0)
  ),
  constraint event_setlist_offsets_order_chk check (
    ends_offset_ms is null
    or starts_offset_ms is null
    or ends_offset_ms >= starts_offset_ms
  ),
  constraint event_setlist_song_present_chk check (
    song_id is not null or (song_title is not null and length(trim(song_title)) > 0)
  )
);

create index if not exists event_setlist_event_time_idx
  on public.event_setlist(event_id, starts_offset_ms);

create index if not exists event_setlist_event_artist_idx
  on public.event_setlist(event_id, performer_artist_id);

create index if not exists event_setlist_event_song_idx
  on public.event_setlist(event_id, song_id);

drop trigger if exists event_setlist_set_updated_at on public.event_setlist;
create trigger event_setlist_set_updated_at
before update on public.event_setlist
for each row execute function public.trg_set_updated_at();

-- Optional strict integrity: ensure performer is in event lineup (event_artists)
create or replace function public.trg_event_setlist_validate_performer_in_lineup()
returns trigger
language plpgsql
as $$
declare ok boolean;
begin
  if new.performer_artist_id is null then
    return new;
  end if;

  select exists (
    select 1
    from public.event_artists ea
    where ea.event_id = new.event_id
      and ea.artist_entity_id = new.performer_artist_id
  ) into ok;

  if not ok then
    raise exception 'performer_artist_id % is not in event lineup for event %',
      new.performer_artist_id, new.event_id;
  end if;

  return new;
end;
$$;

drop trigger if exists event_setlist_validate_performer_in_lineup on public.event_setlist;
create trigger event_setlist_validate_performer_in_lineup
before insert or update of performer_artist_id, event_id
on public.event_setlist
for each row execute function public.trg_event_setlist_validate_performer_in_lineup();

-- --------------------------------------------------------------------------
-- 13) Resolve setlist entry for a given post offset
-- --------------------------------------------------------------------------
create or replace function public.get_setlist_entry_for_offset(
  p_event_id uuid,
  p_offset_ms bigint
)
returns table (
  event_id uuid,
  ordinal integer,
  performer_artist_id uuid,
  song_id uuid,
  song_title text,
  version_notes text,
  starts_offset_ms bigint,
  ends_offset_ms bigint
)
language sql
stable
as $$
  with candidates as (
    select
      es.*,
      case
        when es.starts_offset_ms is not null and es.ends_offset_ms is not null
             and p_offset_ms >= es.starts_offset_ms and p_offset_ms < es.ends_offset_ms
          then 0
        when es.starts_offset_ms is not null and p_offset_ms >= es.starts_offset_ms
          then 1
        else 2
      end as bucket,
      case
        when es.starts_offset_ms is not null
          then (p_offset_ms - es.starts_offset_ms)
        else null
      end as delta_from_start
    from public.event_setlist es
    where es.event_id = p_event_id
  )
  select
    c.event_id,
    c.ordinal,
    c.performer_artist_id,
    c.song_id,
    c.song_title,
    c.version_notes,
    c.starts_offset_ms,
    c.ends_offset_ms
  from candidates c
  order by
    c.bucket asc,
    c.delta_from_start asc nulls last,
    c.ordinal asc
  limit 1;
$$;

create or replace view public.v_event_posts_with_setlist as
select
  p.*,
  r.ordinal as setlist_ordinal,
  r.performer_artist_id as setlist_performer_artist_id,
  r.song_id as setlist_song_id,
  r.song_title as setlist_song_title,
  r.version_notes as setlist_version_notes,
  r.starts_offset_ms as setlist_starts_offset_ms,
  r.ends_offset_ms as setlist_ends_offset_ms
from public.posts p
left join lateral public.get_setlist_entry_for_offset(p.event_id, p.event_offset_ms) r
  on p.event_offset_ms is not null;

-- --------------------------------------------------------------------------
-- 14) Convenience views for the frontend (clear read model)
-- --------------------------------------------------------------------------
create or replace view public.v_subject_users as
select
  s.id as subject_id,
  p.id as profile_id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.bio,
  p.primary_city,
  p.is_verified,
  pp.is_private,
  p.created_at,
  p.updated_at
from public.subjects s
join public.profiles p on p.id = s.profile_id
left join public.profile_privacy pp on pp.profile_id = p.id
where s.type = 'user';

create or replace view public.v_subject_venues as
select
  s.id as subject_id,
  v.id as venue_place_id,
  v.name,
  v.city,
  v.address,
  v.latitude,
  v.longitude,
  v.website_url,
  v.photos,
  v.capacity,
  v.venue_type,
  v.created_at,
  v.updated_at
from public.subjects s
join public.venue_places v on v.id = s.venue_place_id
where s.type = 'venue';

create or replace view public.v_subject_artists as
select
  s.id as subject_id,
  a.id as artist_id,
  a.name,
  a.artist_type,
  a.city,
  a.bio,
  a.avatar_url,
  a.genres,
  a.external_links,
  a.created_at,
  a.updated_at
from public.subjects s
join public.artists a on a.id = s.artist_id
where s.type = 'artist';

commit;
-- Requires pgcrypto for token hashing if you later do invites;
-- for this grant function it is not strictly required, but safe to enable.
create extension if not exists pgcrypto;

-- 1) Subject-to-subject membership: a user-subject manages an entity-subject (artist/venue)
create table if not exists public.entity_members (
  admin_subject_id uuid not null references public.subjects(id) on delete cascade,
  entity_subject_id uuid not null references public.subjects(id) on delete cascade,
  role text not null check (role in ('owner','admin','editor','moderator')),
  created_at timestamptz not null default now(),
  primary key (admin_subject_id, entity_subject_id)
);

create index if not exists entity_members_entity_idx on public.entity_members(entity_subject_id);
create index if not exists entity_members_admin_idx on public.entity_members(admin_subject_id);

-- 2) One admin-only RPC: grant a user (profile) access to an artist or venue
-- Usage:
--   select public.admin_grant_entity_access(
--     p_target_profile_id := '<user_profile_uuid>',
--     p_entity_type := 'artist',
--     p_entity_id := '<artists.id>',
--     p_role := 'admin'
--   );
--
--   select public.admin_grant_entity_access(
--     p_target_profile_id := '<user_profile_uuid>',
--     p_entity_type := 'venue',
--     p_entity_id := '<venue_places.id>',
--     p_role := 'owner'
--   );

create or replace function public.admin_grant_entity_access(
  p_target_profile_id uuid,
  p_entity_type text,          -- 'artist' or 'venue'
  p_entity_id uuid,            -- artists.id or venue_places.id
  p_role text default 'admin'  -- owner|admin|editor|moderator
)
returns void
language plpgsql
security definer
as $$
declare
  v_admin_profile_id uuid := auth.uid();
  v_admin_role public.profile_role;
  v_target_user_subject_id uuid;
  v_entity_subject_id uuid;
begin
  if v_admin_profile_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Only platform admins can grant access
  select role into v_admin_role
  from public.profiles
  where id = v_admin_profile_id;

  if v_admin_role is distinct from 'admin'::public.profile_role then
    raise exception 'Forbidden: admin only';
  end if;

  -- Ensure the target user has a user-subject
  select public.get_or_create_user_subject(p_target_profile_id)
  into v_target_user_subject_id;

  -- Resolve entity subject based on type
  if p_entity_type = 'artist' then
    select public.get_or_create_artist_subject(p_entity_id)
    into v_entity_subject_id;

  elsif p_entity_type = 'venue' then
    select public.get_or_create_venue_subject(p_entity_id)
    into v_entity_subject_id;

  else
    raise exception 'Invalid entity_type. Must be artist or venue.';
  end if;

  -- Create membership (idempotent)
  insert into public.entity_members(admin_subject_id, entity_subject_id, role)
  values (v_target_user_subject_id, v_entity_subject_id, p_role)
  on conflict (admin_subject_id, entity_subject_id)
  do update set role = excluded.role;

end;
$$;

-- Recommended: allow only authenticated users to call it, but it will still enforce admin role
revoke all on function public.admin_grant_entity_access(uuid, text, uuid, text) from public;
grant execute on function public.admin_grant_entity_access(uuid, text, uuid, text) to authenticated;
