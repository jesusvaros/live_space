begin;

-- Artists and venues a person hid from their map («Ocultar del mapa» on the
-- artist or venue page; undone in Ajustes → Privacidad → Ocultos del mapa).
-- Only the map reads it: a hidden venue loses its pin and a concert headlined
-- by a hidden artist leaves the map. Agenda, search and pages are unchanged.
--
-- One row per person and artist or venue, pointing at the catalogue row
-- itself (artist_id / venue_place_id) rather than at subjects: the map works
-- with those ids, and the foreign keys clean up after an entity is deleted.
-- Signed-out visitors keep the same list in localStorage
-- (live_space.hidden_map.v1); it is copied here when they sign in.
--
-- Additive only: a new table with RLS on and own-rows policies. The app
-- falls back to the local list while this migration is not live.

create table if not exists public.hidden_map_subjects (
  id uuid primary key default extensions.gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  subject_type text not null check (subject_type in ('artist', 'venue')),
  artist_id uuid references public.artists(id) on delete cascade,
  venue_place_id uuid references public.venue_places(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint hidden_map_subjects_one_target check (
    (subject_type = 'artist' and artist_id is not null and venue_place_id is null)
    or (subject_type = 'venue' and venue_place_id is not null and artist_id is null)
  )
);

create unique index if not exists hidden_map_subjects_artist_key
  on public.hidden_map_subjects (profile_id, artist_id) where artist_id is not null;
create unique index if not exists hidden_map_subjects_venue_key
  on public.hidden_map_subjects (profile_id, venue_place_id) where venue_place_id is not null;

comment on table public.hidden_map_subjects is
  'Artists and venues each person hid from their own map. Private: only the owner reads or changes their rows.';

alter table public.hidden_map_subjects enable row level security;

drop policy if exists hidden_map_subjects_read_own on public.hidden_map_subjects;
create policy hidden_map_subjects_read_own on public.hidden_map_subjects for select to authenticated
  using (profile_id = (select auth.uid()));
drop policy if exists hidden_map_subjects_insert_own on public.hidden_map_subjects;
create policy hidden_map_subjects_insert_own on public.hidden_map_subjects for insert to authenticated
  with check (profile_id = (select auth.uid()));
drop policy if exists hidden_map_subjects_delete_own on public.hidden_map_subjects;
create policy hidden_map_subjects_delete_own on public.hidden_map_subjects for delete to authenticated
  using (profile_id = (select auth.uid()));

revoke all on public.hidden_map_subjects from public, anon, authenticated;
grant select, insert, delete on public.hidden_map_subjects to authenticated;
grant all on public.hidden_map_subjects to service_role;

commit;

notify pgrst, 'reload schema';
