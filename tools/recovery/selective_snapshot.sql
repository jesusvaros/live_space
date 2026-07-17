-- Live Space legacy selective recovery snapshot.
--
-- Run ONLY inside an isolated PostgreSQL instance after restoring the legacy
-- cluster dump. This script never connects to the new Supabase project and does
-- not import auth.users, identities, sessions, refresh tokens, or credentials.
-- It replaces only the local `recovery_export` schema.

\set ON_ERROR_STOP on

begin;

drop schema if exists recovery_export cascade;
create schema recovery_export;

-- Catalog candidates are the only legacy rows intended for later promotion.
create table recovery_export.artist_candidates as
select id as legacy_id, name, slug, image_url, created_at, updated_at
from public.artists;

create table recovery_export.venue_candidates as
select id as legacy_id, name, slug, city, country, latitude, longitude,
       image_url, created_at, updated_at
from public.venues;

-- Profiles stay local and quarantined. They are evidence for reconciliation,
-- not accounts to migrate. No auth credentials or tokens are selected.
create table recovery_export.profile_quarantine as
select id as legacy_id, username, avatar_url, created_at,
       'manual_identity_review_required'::text as quarantine_reason
from public.profiles;

-- The old videos table is expected to be empty. Preserve any unexpected rows in
-- quarantine instead of silently promoting them.
create table recovery_export.video_quarantine as
select *, 'legacy_media_review_required'::text as quarantine_reason
from public.videos;

-- Object paths and owners may contain identifiers. Keep this table exclusively
-- in the isolated recovery database and use it only to reconcile ZIP contents.
create table recovery_export.storage_object_quarantine as
select id as legacy_object_id, bucket_id, name as legacy_object_name, owner,
       created_at, updated_at, metadata,
       'ownership_and_content_hash_review_required'::text as quarantine_reason
from storage.objects;

do $$
declare
  artist_count integer;
  venue_count integer;
  profile_count integer;
  video_count integer;
  object_count integer;
begin
  select count(*) into artist_count from recovery_export.artist_candidates;
  select count(*) into venue_count from recovery_export.venue_candidates;
  select count(*) into profile_count from recovery_export.profile_quarantine;
  select count(*) into video_count from recovery_export.video_quarantine;
  select count(*) into object_count from recovery_export.storage_object_quarantine;

  if artist_count <> 10 or venue_count <> 8 or profile_count <> 2
     or video_count <> 0 or object_count <> 8 then
    raise exception
      'Legacy counts changed (artists %, venues %, profiles %, videos %, objects %). Stop for manual review.',
      artist_count, venue_count, profile_count, video_count, object_count;
  end if;
end $$;

comment on schema recovery_export is
  'Temporary, isolated recovery snapshot. Never expose through an API.';

commit;
