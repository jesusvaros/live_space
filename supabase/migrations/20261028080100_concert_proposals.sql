begin;

-- Concerts added by the people who make them.
--
-- A venue's managers publish concerts at their venue straight away. An
-- artist's managers propose a concert at a venue: the event is created in
-- 'review' with a row in event_proposals, and the venue's managers accept or
-- reject it. When the venue has nobody managing it, the proposal waits in the
-- moderation queue (admins decide). Both paths go through create_concert();
-- the decision goes through review_concert_proposal().
--
-- The publish decision lives in the database: events_guard_publish stops a
-- signed-in client from inserting or flipping an event to 'published' unless
-- can_publish_at_venue() (admin, or manager of a published venue), and
-- freezes the content and line-up of an accepted proposal for everyone else. Writes made by SECURITY DEFINER functions (this
-- migration's RPCs and any other) and by workers are not affected.
--
-- Additive: no existing function or policy is replaced.

create table if not exists public.event_proposals (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null unique references public.events(id) on delete cascade,
  venue_place_id uuid not null references public.venue_places(id) on delete cascade,
  artist_id uuid references public.artists(id) on delete set null,
  proposed_by uuid references public.profiles(id) on delete set null,
  -- Who decides: the venue's managers, or moderation when the venue is unclaimed.
  reviewer text not null default 'venue' check (reviewer in ('venue', 'moderation')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'withdrawn')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_proposals_review_consistent check (
    (status = 'pending' and reviewed_at is null)
    or (status <> 'pending' and reviewed_at is not null)
  )
);

comment on table public.event_proposals is
  'Concert proposed by an artist at a venue; the venue (or moderation) accepts or rejects it.';

create index if not exists event_proposals_venue_status_idx
  on public.event_proposals (venue_place_id, status, created_at);
create index if not exists event_proposals_artist_idx
  on public.event_proposals (artist_id, created_at desc);
create index if not exists event_proposals_proposed_by_idx
  on public.event_proposals (proposed_by, created_at desc);
create index if not exists event_proposals_pending_reviewer_idx
  on public.event_proposals (reviewer, created_at) where status = 'pending';

drop trigger if exists event_proposals_set_updated_at on public.event_proposals;
create trigger event_proposals_set_updated_at
  before update on public.event_proposals
  for each row execute function public.set_updated_at();

alter table public.event_proposals enable row level security;

-- Read: who proposed it, the proposing artist's managers, the venue's managers
-- (admins included through can_manage_venue) and staff. No write policies:
-- rows are created by create_concert() and decided by review_concert_proposal().
drop policy if exists event_proposals_read on public.event_proposals;
create policy event_proposals_read on public.event_proposals for select to authenticated
  using (
    proposed_by = (select auth.uid())
    or public.can_manage_venue(venue_place_id)
    or (artist_id is not null and public.can_manage_artist(artist_id))
    or public.current_user_is_staff()
  );

revoke all on public.event_proposals from anon, authenticated;
grant select on public.event_proposals to authenticated;
grant all on public.event_proposals to service_role;

-- True when someone (owner, admin or editor) manages the venue. Internal:
-- only the functions below call it.
create or replace function public.venue_has_managers(p_venue_place_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subjects s
    join public.entity_memberships m on m.subject_id = s.id
    where s.type = 'venue'
      and s.venue_place_id = p_venue_place_id
      and m.role in ('owner', 'admin', 'editor')
  );
$$;

revoke all on function public.venue_has_managers(uuid) from public;
revoke execute on function public.venue_has_managers(uuid) from anon, authenticated;
grant execute on function public.venue_has_managers(uuid) to service_role;

-- Publishing at a venue: admins anywhere; a venue's managers only once the
-- venue itself is published (a venue someone just created and manages is not
-- vouched for yet). Called by the guards below as the signed-in user.
create or replace function public.can_publish_at_venue(p_venue_place_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_admin() or (
    public.can_manage_venue(p_venue_place_id)
    and exists (
      select 1 from public.venue_places v
      where v.id = p_venue_place_id and v.status = 'published'
    )
  );
$$;

revoke all on function public.can_publish_at_venue(uuid) from public;
revoke execute on function public.can_publish_at_venue(uuid) from anon;
grant execute on function public.can_publish_at_venue(uuid) to authenticated, service_role;

-- True for a published event that came in as a proposal and that the caller
-- cannot publish: its content is what the venue approved, so it is frozen
-- for everyone but the venue. Events without a proposal (scraped, created by
-- the venue) keep the usual editing rules.
create or replace function public.event_frozen_for_caller(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    join public.event_proposals p on p.event_id = e.id
    where e.id = p_event_id
      and e.status = 'published'
      and not public.can_publish_at_venue(e.venue_place_id)
  );
$$;

revoke all on function public.event_frozen_for_caller(uuid) from public;
revoke execute on function public.event_frozen_for_caller(uuid) from anon;
grant execute on function public.event_frozen_for_caller(uuid) to authenticated, service_role;

-- Guard on direct writes from the app (role authenticated). Not SECURITY
-- DEFINER on purpose: inside a SECURITY DEFINER function current_user is the
-- function owner, so those writes pass through untouched.
create or replace function public.events_guard_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if public.can_publish_at_venue(new.venue_place_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'review') then
      raise exception using errcode = '42501', message = 'Only the venue managers can publish a concert at this venue';
    end if;
    new.published_at := null;
    return new;
  end if;

  if new.venue_place_id is distinct from old.venue_place_id then
    raise exception using errcode = '42501', message = 'Only the venue managers can move a concert to this venue';
  end if;
  if new.status is distinct from old.status and (
    new.status = 'published' or old.status = 'archived'
  ) then
    raise exception using errcode = '42501', message = 'Only the venue managers can publish this concert';
  end if;
  if old.status = 'published' and public.event_frozen_for_caller(old.id) and (
    new.name is distinct from old.name
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at
    or new.ticket_url is distinct from old.ticket_url
    or new.image_url is distinct from old.image_url
    or new.description is distinct from old.description
  ) then
    raise exception using errcode = '42501', message = 'The venue accepted this concert; ask the venue to change it';
  end if;
  new.published_at := old.published_at;
  return new;
end;
$$;

revoke all on function public.events_guard_publish() from public;
revoke execute on function public.events_guard_publish() from anon, authenticated;

drop trigger if exists events_guard_publish on public.events;
create trigger events_guard_publish
  before insert or update of status, venue_place_id, published_at, name, starts_at, ends_at,
    ticket_url, image_url, description on public.events
  for each row execute function public.events_guard_publish();

-- Same rule for the line-up of an accepted proposal.
create or replace function public.event_artists_guard_accepted()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
    (tg_op <> 'INSERT' and public.event_frozen_for_caller(old.event_id))
    or (tg_op <> 'DELETE' and public.event_frozen_for_caller(new.event_id))
  ) then
    raise exception using errcode = '42501', message = 'The venue accepted this concert; ask the venue to change the line-up';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.event_artists_guard_accepted() from public;
revoke execute on function public.event_artists_guard_accepted() from anon, authenticated;

drop trigger if exists event_artists_guard_accepted on public.event_artists;
create trigger event_artists_guard_accepted
  before insert or update or delete on public.event_artists
  for each row execute function public.event_artists_guard_accepted();

-- Ticket links are web links. NOT VALID: checked on every new write, existing
-- rows are left alone (validate once they are cleaned up).
alter table public.events drop constraint if exists events_ticket_url_http;
alter table public.events
  add constraint events_ticket_url_http check (ticket_url is null or ticket_url ~* '^https?://') not valid;

-- Keeps a pending proposal in step when its event changes status outside
-- review_concert_proposal(). Only the venue's managers or staff (or a write
-- without a user, from the dashboard or a worker) accept or reject; anyone
-- else ending the event withdraws the proposal.
create or replace function public.sync_event_proposal_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  decides boolean;
begin
  decides := actor is null or public.current_user_is_staff() or public.can_publish_at_venue(new.venue_place_id);
  if new.status = 'published' and decides then
    update public.event_proposals
    set status = 'accepted', reviewed_by = actor, reviewed_at = now()
    where event_id = new.id and status = 'pending';
  elsif new.status in ('archived', 'cancelled') then
    update public.event_proposals p
    set status = case when decides then 'rejected' else 'withdrawn' end,
        reviewed_by = actor,
        reviewed_at = now()
    where p.event_id = new.id and p.status = 'pending';
  end if;
  return null;
end;
$$;

revoke all on function public.sync_event_proposal_status() from public;
revoke execute on function public.sync_event_proposal_status() from anon, authenticated;

drop trigger if exists events_sync_proposal_status on public.events;
create trigger events_sync_proposal_status
  after update of status on public.events
  for each row
  when (new.status is distinct from old.status)
  execute function public.sync_event_proposal_status();

-- A published venue claimed while proposals wait in moderation takes them over.
create or replace function public.route_proposals_to_new_venue_manager()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role in ('owner', 'admin', 'editor') then
    update public.event_proposals p
    set reviewer = 'venue'
    from public.subjects s
    join public.venue_places v on v.id = s.venue_place_id
    where s.id = new.subject_id
      and s.type = 'venue'
      and v.status = 'published'
      and p.venue_place_id = s.venue_place_id
      and p.status = 'pending'
      and p.reviewer = 'moderation';
  end if;
  return null;
end;
$$;

revoke all on function public.route_proposals_to_new_venue_manager() from public;
revoke execute on function public.route_proposals_to_new_venue_manager() from anon, authenticated;

drop trigger if exists entity_memberships_route_proposals on public.entity_memberships;
create trigger entity_memberships_route_proposals
  after insert or update of role on public.entity_memberships
  for each row execute function public.route_proposals_to_new_venue_manager();

-- Creates a concert in one go: event, line-up and, for an artist, the
-- proposal. p_new_artists is a JSON array of {"name", "normalized_name"} for
-- names that are not in the catalog yet (looked up by normalized name first).
-- p_as_artist_id is the artist the caller acts for when they do not manage
-- the venue; it is always part of the line-up. Published straight away only
-- when the caller can publish at the venue (can_publish_at_venue); otherwise
-- it becomes a proposal, rate-limited per proposer.
create or replace function public.create_concert(
  p_venue_place_id uuid,
  p_starts_at timestamptz,
  p_name text,
  p_normalized_name text,
  p_artist_ids uuid[] default '{}',
  p_new_artists jsonb default '[]'::jsonb,
  p_ends_at timestamptz default null,
  p_ticket_url text default null,
  p_image_url text default null,
  p_as_artist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  editor uuid := auth.uid();
  venue public.venue_places;
  event_name text := trim(coalesce(p_name, ''));
  event_key text := trim(coalesce(p_normalized_name, ''));
  ticket text := nullif(trim(coalesce(p_ticket_url, '')), '');
  poster text := nullif(trim(coalesce(p_image_url, '')), '');
  is_venue_manager boolean;
  can_publish boolean;
  lineup uuid[] := '{}';
  candidate uuid;
  new_artist jsonb;
  artist_name text;
  artist_key text;
  v_event uuid;
  v_proposal uuid;
  v_reviewer text;
  v_status public.publish_status;
  locked text[] := array['name', 'starts_at'];
  idx integer := 0;
begin
  if editor is null then
    raise exception using errcode = '42501', message = 'Sign in to add concerts';
  end if;

  select * into venue from public.venue_places where id = p_venue_place_id;
  if venue.id is null or venue.status = 'archived' then
    raise exception using errcode = 'P0002', message = 'Venue not found';
  end if;

  is_venue_manager := public.can_manage_venue(venue.id);
  can_publish := public.can_publish_at_venue(venue.id);
  if not is_venue_manager and (p_as_artist_id is null or not public.can_manage_artist(p_as_artist_id)) then
    raise exception using errcode = '42501', message = 'Only venue or artist managers can add concerts';
  end if;

  if char_length(event_name) not between 2 and 160 or event_key = '' or char_length(event_key) > 200 then
    raise exception using errcode = '22023', message = 'Concert name required';
  end if;
  if p_starts_at is null then
    raise exception using errcode = '22023', message = 'Start time required';
  end if;
  if p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception using errcode = '22023', message = 'A concert must end after it starts';
  end if;
  if ticket is not null and (ticket !~* '^https?://' or char_length(ticket) > 500) then
    raise exception using errcode = '22023', message = 'Invalid ticket link';
  end if;
  if poster is not null and (poster !~* '^https://' or char_length(poster) > 1000) then
    raise exception using errcode = '22023', message = 'Invalid poster link';
  end if;
  if jsonb_typeof(coalesce(p_new_artists, '[]'::jsonb)) <> 'array'
    or coalesce(cardinality(p_artist_ids), 0) + jsonb_array_length(coalesce(p_new_artists, '[]'::jsonb)) > 20 then
    raise exception using errcode = '22023', message = 'Line-up of up to 20 artists';
  end if;

  -- Line-up in billing order: the acting artist first when they propose.
  if not is_venue_manager then
    lineup := array[p_as_artist_id];
  end if;
  foreach candidate in array coalesce(p_artist_ids, '{}'::uuid[]) loop
    if candidate is not null and not candidate = any(lineup) then
      if not exists (select 1 from public.artists a where a.id = candidate and a.status <> 'archived') then
        raise exception using errcode = 'P0002', message = 'Artist not found';
      end if;
      lineup := array_append(lineup, candidate);
    end if;
  end loop;

  for new_artist in select value from jsonb_array_elements(coalesce(p_new_artists, '[]'::jsonb)) loop
    artist_name := trim(coalesce(new_artist ->> 'name', ''));
    artist_key := trim(coalesce(new_artist ->> 'normalized_name', ''));
    if char_length(artist_name) not between 1 and 120 or artist_key = '' or char_length(artist_key) > 160 then
      raise exception using errcode = '22023', message = 'Artist name required';
    end if;
    candidate := null;
    select a.id into candidate
    from public.artists a
    where a.normalized_name = artist_key and a.status <> 'archived'
    order by (a.status = 'published') desc, a.created_at
    limit 1;
    if candidate is null then
      insert into public.artists (name, normalized_name, status, created_by)
      -- No created_by: typing a name never makes it yours; ownership only
      -- comes through entity_claims.
      values (artist_name, artist_key, 'published', null)
      on conflict (normalized_name, country_code) where status <> 'archived' do nothing
      returning id into candidate;
      if candidate is null then
        select a.id into candidate
        from public.artists a
        where a.normalized_name = artist_key and a.status <> 'archived'
        limit 1;
      end if;
    end if;
    if not candidate = any(lineup) then
      lineup := array_append(lineup, candidate);
    end if;
  end loop;

  if cardinality(lineup) = 0 then
    raise exception using errcode = '22023', message = 'Add at least one artist';
  end if;

  -- A double tap or a second person adding the same night. Only events the
  -- caller could already see count, so this cannot reveal unannounced ones.
  if exists (
    select 1 from public.events e
    where e.venue_place_id = venue.id
      and e.normalized_name = event_key
      and e.starts_at between p_starts_at - interval '3 hours' and p_starts_at + interval '3 hours'
      and e.status in ('draft', 'review', 'published')
      and (e.status = 'published' or public.can_manage_event(e.id))
  ) then
    raise exception using errcode = '23505', message = 'That concert is already in the agenda';
  end if;

  -- Proposal limits, serialised per proposer so parallel calls cannot slip
  -- past the counts.
  if not can_publish then
    perform pg_advisory_xact_lock(hashtextextended('create_concert:' || editor::text, 0));
    if (select count(*) from public.event_proposals p where p.proposed_by = editor and p.status = 'pending') >= 10 then
      raise exception using errcode = '54000', message = 'Too many pending proposals';
    end if;
    if (
      select count(*) from public.event_proposals p
      where p.proposed_by = editor and p.venue_place_id = venue.id and p.status = 'pending'
    ) >= 3 then
      raise exception using errcode = '54000', message = 'Too many pending proposals at this venue';
    end if;
    if (
      select count(*) from public.event_proposals p
      where p.proposed_by = editor and p.created_at > now() - interval '1 day'
    ) >= 20 then
      raise exception using errcode = '54000', message = 'Daily proposal limit reached';
    end if;
  end if;

  v_status := case when can_publish then 'published' else 'review' end;
  if ticket is not null then locked := array_append(locked, 'ticket_url'); end if;
  if poster is not null then locked := array_append(locked, 'image_url'); end if;

  insert into public.events (
    venue_place_id, name, normalized_name, starts_at, ends_at, city, address, latitude, longitude,
    ticket_url, image_url, image_source, status, published_at, created_by, manager_locked_fields
  )
  values (
    venue.id, event_name, event_key, p_starts_at, p_ends_at, venue.city, venue.address, venue.latitude, venue.longitude,
    ticket, poster, case when poster is null then null else 'manual' end, v_status,
    case when can_publish then now() else null end, editor, locked
  )
  returning id into v_event;

  foreach candidate in array lineup loop
    insert into public.event_artists (event_id, artist_id, billing_order, is_headliner)
    values (v_event, candidate, idx, idx = 0);
    idx := idx + 1;
  end loop;

  if not can_publish then
    v_reviewer := case
      when venue.status = 'published' and public.venue_has_managers(venue.id) then 'venue'
      else 'moderation'
    end;
    insert into public.event_proposals (event_id, venue_place_id, artist_id, proposed_by, reviewer)
    values (v_event, venue.id, p_as_artist_id, editor, v_reviewer)
    returning id into v_proposal;
  end if;

  return jsonb_build_object(
    'event_id', v_event,
    'status', v_status,
    'proposal_id', v_proposal,
    'reviewer', v_reviewer
  );
end;
$$;

revoke all on function public.create_concert(uuid, timestamptz, text, text, uuid[], jsonb, timestamptz, text, text, uuid) from public;
revoke execute on function public.create_concert(uuid, timestamptz, text, text, uuid[], jsonb, timestamptz, text, text, uuid) from anon;
grant execute on function public.create_concert(uuid, timestamptz, text, text, uuid[], jsonb, timestamptz, text, text, uuid)
  to authenticated, service_role;

-- Accept publishes the event; reject archives it (kept, not deleted, so the
-- proposer still sees it with the reason). Admins, and the managers of a
-- published venue, decide.
create or replace function public.review_concert_proposal(
  p_proposal_id uuid,
  p_accept boolean,
  p_note text default null
)
returns public.event_proposals
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewer_id uuid := auth.uid();
  proposal public.event_proposals;
  note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if reviewer_id is null then
    raise exception using errcode = '42501', message = 'Sign in to review proposals';
  end if;
  if note is not null and char_length(note) > 280 then
    raise exception using errcode = '22023', message = 'Reason too long';
  end if;

  select * into proposal from public.event_proposals where id = p_proposal_id for update;
  if proposal.id is null then
    raise exception using errcode = 'P0002', message = 'Proposal not found';
  end if;
  if not public.can_publish_at_venue(proposal.venue_place_id) then
    raise exception using errcode = '42501', message = 'Only the venue managers can review this proposal';
  end if;
  if proposal.status <> 'pending' then
    raise exception using errcode = '55000', message = 'Proposal already reviewed';
  end if;

  update public.event_proposals
  set status = case when p_accept then 'accepted' else 'rejected' end,
      reviewed_by = reviewer_id,
      reviewed_at = now(),
      review_note = note
  where id = proposal.id
  returning * into proposal;

  update public.events
  set status = case when p_accept then 'published'::public.publish_status else 'archived'::public.publish_status end,
      published_at = case when p_accept then coalesce(published_at, now()) else published_at end
  where id = proposal.event_id and status in ('draft', 'review');
  if not found then
    raise exception using errcode = '55000', message = 'The concert is no longer waiting for review';
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, reason, metadata)
  values (
    reviewer_id,
    case when p_accept then 'concert_accepted' else 'concert_rejected' end,
    'event',
    proposal.event_id,
    coalesce(note, case when p_accept then 'Concierto aceptado' else 'Concierto rechazado' end),
    jsonb_build_object('proposal_id', proposal.id, 'venue_place_id', proposal.venue_place_id, 'artist_id', proposal.artist_id)
  );

  return proposal;
end;
$$;

revoke all on function public.review_concert_proposal(uuid, boolean, text) from public;
revoke execute on function public.review_concert_proposal(uuid, boolean, text) from anon;
grant execute on function public.review_concert_proposal(uuid, boolean, text) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
