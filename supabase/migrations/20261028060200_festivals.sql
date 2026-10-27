begin;

-- Festivals: a container of ordinary concerts.
--
-- A festival edition ("Ufovision 2026") has dates, a place and a poster, and
-- is a subject like an artist or a venue: people follow it, organisers claim
-- it (entity_claims) and manage it (entity_memberships). Each set of the line-up
-- is a normal event with festival_id, its artist, start time and stage
-- (events.room), so moments by song, setlists, gallery matching and the QR
-- keep working unchanged.
--
-- The grounds are a venue_place (events.venue_place_id is required), created
-- with the festival when it has no fixed venue. Organisers write the timetable
-- through festival_save_performance(); small festivals rarely publish one in a
-- machine-readable form.
--
-- Requires 20261028060100_festival_subject_type.sql to have run first.

create table if not exists public.festivals (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  normalized_name text not null,
  edition_year smallint check (edition_year between 1950 and 2100),
  starts_on date not null,
  ends_on date not null,
  city text not null,
  venue_place_id uuid references public.venue_places(id) on delete restrict,
  description text check (description is null or char_length(description) <= 2000),
  website_url text check (website_url is null or website_url ~* '^https?://'),
  instagram_url text check (instagram_url is null or instagram_url ~* '^https?://'),
  image_url text check (image_url is null or image_url ~* '^https?://'),
  status public.publish_status not null default 'published',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint festivals_valid_dates check (ends_on >= starts_on)
);

comment on table public.festivals is 'Festival edition; its sets are events with festival_id.';
comment on column public.festivals.venue_place_id is 'Festival grounds; every set is an event at this venue.';

create unique index if not exists festivals_name_year_unique
  on public.festivals (normalized_name, coalesce(edition_year, 0))
  where status <> 'archived';
create index if not exists festivals_dates_idx on public.festivals (starts_on, ends_on);

drop trigger if exists festivals_set_updated_at on public.festivals;
create trigger festivals_set_updated_at
  before update on public.festivals
  for each row execute function public.set_updated_at();

-- Subjects: a festival is the fourth kind of reference.
alter table public.subjects
  add column if not exists festival_id uuid unique references public.festivals(id) on delete cascade;

alter table public.subjects drop constraint if exists subjects_exactly_one_reference;
alter table public.subjects add constraint subjects_exactly_one_reference
  check (num_nonnulls(profile_id, artist_id, venue_place_id, festival_id) = 1);
alter table public.subjects drop constraint if exists subjects_type_matches_reference;
alter table public.subjects add constraint subjects_type_matches_reference check (
  (type = 'user' and profile_id is not null) or
  (type = 'artist' and artist_id is not null) or
  (type = 'venue' and venue_place_id is not null) or
  (type = 'festival' and festival_id is not null)
);

create or replace function public.create_festival_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.subjects (type, festival_id) values ('festival', new.id);
  return new;
end;
$$;

drop trigger if exists festivals_create_subject on public.festivals;
create trigger festivals_create_subject
  after insert on public.festivals
  for each row execute function public.create_festival_subject();

-- Sets of a festival.
alter table public.events
  add column if not exists festival_id uuid references public.festivals(id) on delete set null;
create index if not exists events_festival_starts_idx
  on public.events (festival_id, starts_at) where festival_id is not null;
comment on column public.events.festival_id is 'Festival this set belongs to; events.room is its stage.';

-- Permissions.
create or replace function public.can_manage_festival(p_festival_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_admin() or exists (
    select 1 from public.subjects
    where festival_id = p_festival_id and public.can_manage_subject(id)
  );
$$;

-- Festival managers manage the sets of their festival like a venue manages
-- its concerts (setlist, edits, QR).
create or replace function public.can_manage_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_admin() or exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and (
        e.created_by = (select auth.uid())
        or public.can_manage_venue(e.venue_place_id)
        or (e.festival_id is not null and public.can_manage_festival(e.festival_id))
        or exists (
          select 1 from public.event_artists ea
          where ea.event_id = e.id and public.can_manage_artist(ea.artist_id)
        )
      )
  );
$$;

-- Downloads and stats of moments: festival managers count as the event's
-- entity too.
create or replace function public.is_event_entity_member(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    public.current_user_is_admin()
    or exists (
      select 1
      from public.events e
      join public.subjects s on s.type = 'venue' and s.venue_place_id = e.venue_place_id
      where e.id = p_event_id and public.can_manage_subject(s.id, true)
    )
    or exists (
      select 1
      from public.event_artists ea
      join public.subjects s on s.type = 'artist' and s.artist_id = ea.artist_id
      where ea.event_id = p_event_id and public.can_manage_subject(s.id, true)
    )
    or exists (
      select 1
      from public.events e
      join public.subjects s on s.type = 'festival' and s.festival_id = e.festival_id
      where e.id = p_event_id and public.can_manage_subject(s.id, true)
    )
  );
$$;

alter table public.festivals enable row level security;

drop policy if exists festivals_read on public.festivals;
create policy festivals_read on public.festivals for select
  using (status = 'published' or public.can_manage_festival(id) or public.current_user_is_staff());
-- Festivals are created by staff (or by approving a request); organisers then
-- claim and edit them.
drop policy if exists festivals_create on public.festivals;
create policy festivals_create on public.festivals for insert to authenticated
  with check (public.current_user_is_admin());
drop policy if exists festivals_manage on public.festivals;
create policy festivals_manage on public.festivals for update to authenticated
  using (public.can_manage_festival(id)) with check (public.can_manage_festival(id));

drop policy if exists subjects_read on public.subjects;
create policy subjects_read on public.subjects for select
  using (
    profile_id = (select auth.uid())
    or public.can_manage_subject(id, true)
    or (type = 'user' and exists (select 1 from public.profiles p where p.id = profile_id and not p.is_private))
    or (type = 'artist' and exists (select 1 from public.artists a where a.id = artist_id and a.status = 'published'))
    or (type = 'venue' and exists (select 1 from public.venue_places v where v.id = venue_place_id and v.status = 'published'))
    or (type = 'festival' and exists (select 1 from public.festivals f where f.id = festival_id and f.status = 'published'))
  );

drop policy if exists entity_claims_insert_own on public.entity_claims;
create policy entity_claims_insert_own on public.entity_claims for insert to authenticated
  with check (
    claimant_id = (select auth.uid())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and review_note is null
    and exists (
      select 1 from public.subjects s
      where s.id = subject_id and s.type in ('artist', 'venue', 'festival')
    )
  );

-- Claims: the moderation log names the festival like an artist or venue.
create or replace function public.review_entity_claim(
  p_claim_id uuid,
  p_approve boolean,
  p_note text default null
)
returns public.entity_claims
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewer uuid := auth.uid();
  claim public.entity_claims;
  subject_kind public.subject_type;
  subject_entity uuid;
begin
  if reviewer is null or not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'Only admins can review claims';
  end if;

  select * into claim from public.entity_claims where id = p_claim_id for update;
  if claim.id is null then
    raise exception using errcode = 'P0002', message = 'Claim not found';
  end if;
  if claim.status <> 'pending' then
    raise exception using errcode = '55000', message = 'Claim already reviewed';
  end if;

  select type, coalesce(artist_id, venue_place_id, festival_id) into subject_kind, subject_entity
  from public.subjects where id = claim.subject_id;

  update public.entity_claims
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_by = reviewer,
      reviewed_at = now(),
      review_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_claim_id
  returning * into claim;

  if p_approve then
    insert into public.entity_memberships (subject_id, profile_id, role, created_by)
    values (claim.subject_id, claim.claimant_id, 'admin', reviewer)
    on conflict (subject_id, profile_id) do nothing;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, reason, metadata)
  values (
    reviewer,
    case when p_approve then 'claim_approved' else 'claim_rejected' end,
    subject_kind::text::public.report_target_type,
    subject_entity,
    coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Revisión de solicitud de gestión'),
    jsonb_build_object('claim_id', claim.id, 'claimant_id', claim.claimant_id, 'subject_id', claim.subject_id)
  );

  return claim;
end;
$$;

-- Timetable editing. One call adds or moves a set: the artist is matched by
-- normalised name (the client sends normalizeForMatching, as the scraper
-- does) or created, the event is the festival's own and is published at once.
--   p_event_id null  → new set
--   p_stage          → events.room ("Escenario Luna"), optional
create or replace function public.festival_save_performance(
  p_festival_id uuid,
  p_event_id uuid,
  p_artist_name text,
  p_artist_normalized text,
  p_starts_at timestamptz,
  p_stage text default null,
  p_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  editor uuid := auth.uid();
  festival public.festivals;
  artist_name text := trim(coalesce(p_artist_name, ''));
  artist_key text := trim(coalesce(p_artist_normalized, ''));
  stage text := nullif(trim(coalesce(p_stage, '')), '');
  v_artist uuid;
  v_event uuid := p_event_id;
begin
  if editor is null or not public.can_manage_festival(p_festival_id) then
    raise exception using errcode = '42501', message = 'Festival management permission required';
  end if;
  select * into festival from public.festivals where id = p_festival_id;
  if festival.id is null then
    raise exception using errcode = 'P0002', message = 'Festival not found';
  end if;
  if festival.venue_place_id is null then
    raise exception using errcode = '22023', message = 'The festival has no grounds yet';
  end if;
  if char_length(artist_name) not between 1 and 120 or artist_key = '' then
    raise exception using errcode = '22023', message = 'Artist name required';
  end if;
  if stage is not null and char_length(stage) > 60 then
    raise exception using errcode = '22023', message = 'Stage name too long';
  end if;
  -- A set may start in the small hours after the last day.
  if p_starts_at is null
    or (p_starts_at at time zone 'Europe/Madrid')::date not between festival.starts_on and festival.ends_on + 1 then
    raise exception using errcode = '22023', message = 'The set must be within the festival dates';
  end if;
  if p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception using errcode = '22023', message = 'A set must end after it starts';
  end if;

  select a.id into v_artist
  from public.artists a
  where a.normalized_name = artist_key and a.status <> 'archived'
  order by (a.status = 'published') desc, a.created_at
  limit 1;
  if v_artist is null then
    insert into public.artists (name, normalized_name, status, created_by)
    values (artist_name, artist_key, 'published', null)
    returning id into v_artist;
  end if;

  if v_event is null then
    insert into public.events (
      venue_place_id, festival_id, name, normalized_name, starts_at, ends_at, city, room,
      status, published_at, created_by
    )
    values (
      festival.venue_place_id, festival.id, artist_name, artist_key, p_starts_at, p_ends_at,
      festival.city, stage, 'published', now(), editor
    )
    returning id into v_event;
  else
    update public.events
    set name = artist_name,
        normalized_name = artist_key,
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        room = stage,
        status = 'published'
    where id = v_event and festival_id = festival.id;
    if not found then
      raise exception using errcode = 'P0002', message = 'Set not found in this festival';
    end if;
    delete from public.event_artists ea where ea.event_id = v_event;
  end if;

  insert into public.event_artists (event_id, artist_id, billing_order, is_headliner)
  values (v_event, v_artist, 0, true);

  return v_event;
end;
$$;

-- Cancelled, not deleted: moments already uploaded to the set stay reachable.
create or replace function public.festival_cancel_performance(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  festival uuid;
begin
  select e.festival_id into festival from public.events e where e.id = p_event_id;
  if festival is null or auth.uid() is null or not public.can_manage_festival(festival) then
    raise exception using errcode = '42501', message = 'Festival management permission required';
  end if;
  update public.events set status = 'cancelled' where id = p_event_id;
end;
$$;

-- Read model for lists and follows: the festival with its subject, poster
-- (own image, else the latest fan photo from any of its sets) and set count.
create or replace view public.v_subject_festivals
with (security_invoker = true)
as
select
  s.id as subject_id,
  f.id as festival_id,
  f.id,
  f.name,
  f.edition_year,
  f.starts_on,
  f.ends_on,
  f.city,
  f.venue_place_id,
  f.description,
  f.website_url,
  f.instagram_url,
  f.status,
  coalesce(f.image_url, moment.image_url) as cover_image_url,
  f.image_url,
  case when f.image_url is null then moment.credit end as cover_credit,
  coalesce(sets.total, 0) as set_count
from public.festivals f
join public.subjects s on s.festival_id = f.id and s.type = 'festival'
left join lateral (
  select count(*)::int as total
  from public.events e
  where e.festival_id = f.id and e.status = 'published'
) sets on true
left join lateral (
  select
    coalesce(ma.thumbnail_url, ma.secure_url) as image_url,
    coalesce('@' || nullif(pr.username::text, ''), nullif(pr.display_name, '')) as credit
  from public.events e
  join public.posts p on p.event_id = e.id
  join public.media_assets ma on ma.id = p.media_asset_id
  join public.profiles pr on pr.id = p.author_id
  where e.festival_id = f.id
    and p.status = 'published'
    and p.allow_reuse
    and ma.kind = 'image'
    and ma.status = 'published'
    and ma.deleted_at is null
    and not pr.is_private
  order by p.created_at desc
  limit 1
) moment on true;

revoke all on function public.create_festival_subject() from public;
revoke all on function public.can_manage_festival(uuid) from public;
revoke all on function public.festival_save_performance(uuid, uuid, text, text, timestamptz, text, timestamptz) from public;
revoke all on function public.festival_cancel_performance(uuid) from public;
grant execute on function public.can_manage_festival(uuid) to anon, authenticated, service_role;
grant execute on function public.festival_save_performance(uuid, uuid, text, text, timestamptz, text, timestamptz) to authenticated, service_role;
grant execute on function public.festival_cancel_performance(uuid) to authenticated, service_role;
grant select on public.festivals to anon, authenticated;
grant insert, update on public.festivals to authenticated;
grant select on public.v_subject_festivals to anon, authenticated;

commit;

notify pgrst, 'reload schema';
