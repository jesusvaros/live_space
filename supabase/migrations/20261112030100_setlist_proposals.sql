begin;

-- Setlists proposed by the audience.
--
-- Someone who was at a concert (attendance «Fui», or «Voy» once it has
-- started) can propose its setlist, typed or read from a photo on the phone.
-- A proposal never goes live by itself: the concert's managers
-- (can_manage_event: venue, artist, festival, admins) or staff moderation
-- approve or reject it in review_setlist_proposal(). Approving writes the
-- setlist with source = 'audience' and created_by = the proposer (credit
-- «Setlist aportado por @usuario»).
--
-- Rules
-- * submit_audience_setlist(): signed in; concert started; attended (or
--   going); the current setlist is empty or entirely 'audience' (a manager's
--   or setlist.fm's setlist is never touched from here); titles validated
--   (clean_setlist_titles, same rules as src/shared/setlist/titles.ts);
--   at most 10 proposals per person in 24 h. One pending proposal per person
--   and concert: sending again withdraws the previous one.
--   A manager of the concert sending one is just an edit: it is approved at
--   once (their own setlist editor is the usual path).
-- * review_setlist_proposal(): managers of the concert or staff. Approving
--   replaces an 'audience' setlist; a manager's / setlist.fm setlist is only
--   replaced when the reviewer manages the concert AND passes
--   p_replace_existing (an explicit choice in the app). Staff who do not
--   manage the concert cannot replace it. Other pending proposals of the
--   concert become 'superseded' (they proposed the same thing; anyone can
--   propose a correction afterwards).
-- * Nobody writes setlist_proposals directly; the audience still cannot write
--   event_setlist_items (setlist_manage_all is untouched).
-- * Moments already posted keep their song_id (null ones are placed by time
--   on the timeline); there is no server-side reassignment.
--
-- Additive: the only change to existing objects is allowing 'audience' in
-- event_setlist_items.source.

alter table public.event_setlist_items drop constraint if exists event_setlist_items_source_check;
alter table public.event_setlist_items
  add constraint event_setlist_items_source_check
  check (source in ('manual', 'setlistfm', 'audience'));

comment on column public.event_setlist_items.source is
  'manual (manager), setlistfm (pipeline fallback; show attribution) or audience (approved setlist_proposals; created_by = proposer)';

-- ---------------------------------------------------------------------------
-- Title rules (mirror of src/shared/setlist/titles.ts)
-- ---------------------------------------------------------------------------

-- Cleans the proposed titles: trims and collapses whitespace (tabs and
-- line breaks included), drops empty lines,
-- lines that are only numbers / punctuation («12», «--») and section markers
-- («Setlist», «Encore», «Bis», with or without a trailing colon). Raises
-- invalid_titles for a control character, a title over 120 characters, more
-- than 200 raw lines, or a result outside 1–60 titles.
create or replace function public.clean_setlist_titles(p_titles text[])
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  raw text;
  title text;
  result text[] := array[]::text[];
begin
  if p_titles is null or cardinality(p_titles) = 0 or cardinality(p_titles) > 200 then
    raise exception using errcode = '22023', message = 'invalid_titles', hint = 'Between 1 and 60 titles.';
  end if;
  foreach raw in array p_titles loop
    title := btrim(regexp_replace(coalesce(raw, ''), '[[:space:]' || chr(160) || ']+', ' ', 'g'));
    if title ~ '[[:cntrl:]]' then
      raise exception using errcode = '22023', message = 'invalid_titles', hint = 'Control characters are not allowed.';
    end if;
    continue when title = '';
    continue when title ~ '^[0-9[:space:][:punct:]]+$';
    continue when lower(regexp_replace(title, '[[:space:]]*:$', '')) in ('setlist', 'set list', 'set-list', 'encore', 'encores', 'bis', 'bises');
    if char_length(title) > 120 then
      raise exception using errcode = '22023', message = 'invalid_titles', hint = 'Titles have at most 120 characters.';
    end if;
    result := result || title;
  end loop;
  if cardinality(result) < 1 or cardinality(result) > 60 then
    raise exception using errcode = '22023', message = 'invalid_titles', hint = 'Between 1 and 60 titles.';
  end if;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Proposals
-- ---------------------------------------------------------------------------

create table if not exists public.setlist_proposals (
  id uuid primary key default extensions.gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  proposed_by uuid not null references public.profiles(id) on delete cascade,
  -- Performer the songs belong to (null: the concert's headliner).
  artist_id uuid references public.artists(id) on delete set null,
  titles text[] not null check (cardinality(titles) between 1 and 60),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'withdrawn', 'superseded')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint setlist_proposals_review_consistent check (
    (status = 'pending' and reviewed_at is null)
    or (status <> 'pending' and reviewed_at is not null)
  )
);

comment on table public.setlist_proposals is
  'Setlists proposed by people who attended; managers of the concert or staff approve them (review_setlist_proposal).';

create unique index if not exists setlist_proposals_one_pending_idx
  on public.setlist_proposals (event_id, proposed_by) where status = 'pending';
create index if not exists setlist_proposals_pending_idx
  on public.setlist_proposals (created_at) where status = 'pending';
create index if not exists setlist_proposals_event_idx
  on public.setlist_proposals (event_id, created_at desc);
create index if not exists setlist_proposals_proposed_by_idx
  on public.setlist_proposals (proposed_by, created_at desc);

drop trigger if exists setlist_proposals_set_updated_at on public.setlist_proposals;
create trigger setlist_proposals_set_updated_at
  before update on public.setlist_proposals
  for each row execute function public.set_updated_at();

alter table public.setlist_proposals enable row level security;

-- Read: the proposer, the concert's managers and staff. No write policies.
drop policy if exists setlist_proposals_read on public.setlist_proposals;
create policy setlist_proposals_read on public.setlist_proposals for select to authenticated
  using (
    proposed_by = (select auth.uid())
    or public.can_manage_event(event_id)
    or public.current_user_is_staff()
  );

revoke all on public.setlist_proposals from public, anon, authenticated;
grant select on public.setlist_proposals to authenticated;
grant all on public.setlist_proposals to service_role;

-- ---------------------------------------------------------------------------
-- Writing the approved setlist (internal)
-- ---------------------------------------------------------------------------

-- Replaces the concert's setlist with the titles, as the manager editor does
-- (eventManagement.service saveSetlist): each title is a song of the
-- performer, reusing one with the same normalized title; without a performer
-- the title is kept as title_override.
create or replace function public.write_audience_setlist(
  p_event_id uuid,
  p_titles text[],
  p_artist_id uuid,
  p_proposed_by uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  performer uuid := p_artist_id;
  title text;
  normalized text;
  song uuid;
  pos integer := 0;
begin
  if performer is null then
    select ea.artist_id into performer
    from public.event_artists ea
    where ea.event_id = p_event_id
    order by ea.is_headliner desc, ea.billing_order asc, ea.created_at asc
    limit 1;
  end if;

  delete from public.event_setlist_items where event_id = p_event_id;

  foreach title in array p_titles loop
    pos := pos + 1;
    song := null;
    if performer is not null then
      normalized := lower(regexp_replace(btrim(title), '\s+', ' ', 'g'));
      select s.id into song
      from public.songs s
      where s.primary_artist_id = performer and s.normalized_title = normalized
      order by s.created_at
      limit 1;
      if song is null then
        insert into public.songs (title, normalized_title, primary_artist_id, external_ids)
        values (title, normalized, performer, jsonb_build_object('source', 'audience'))
        returning id into song;
      end if;
    end if;
    insert into public.event_setlist_items (event_id, song_id, title_override, artist_id, position, created_by, source)
    values (p_event_id, song, case when song is null then title end, performer, pos, p_proposed_by, 'audience');
  end loop;

  return pos;
end;
$$;

revoke all on function public.write_audience_setlist(uuid, text[], uuid, uuid) from public, anon, authenticated;
grant execute on function public.write_audience_setlist(uuid, text[], uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Propose
-- ---------------------------------------------------------------------------

create or replace function public.submit_audience_setlist(
  p_event_id uuid,
  p_titles text[],
  p_artist_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  started boolean;
  manager boolean;
  attendance public.attendance_status;
  titles text[];
  recent integer;
  proposal uuid;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'not_signed_in';
  end if;

  select e.starts_at <= now() into started from public.events e where e.id = p_event_id;
  if started is null then
    raise exception using errcode = 'P0002', message = 'event_not_found';
  end if;
  if not started then
    raise exception using errcode = 'P0001', message = 'not_started';
  end if;

  manager := public.can_manage_event(p_event_id);
  if not manager then
    select a.status into attendance
    from public.event_attendance a
    where a.event_id = p_event_id and a.profile_id = caller;
    if attendance is null or attendance not in ('attended', 'going') then
      raise exception using errcode = '42501', message = 'not_attended';
    end if;
    if exists (
      select 1 from public.event_setlist_items i
      where i.event_id = p_event_id and i.source <> 'audience'
    ) then
      raise exception using errcode = 'P0001', message = 'setlist_locked';
    end if;
  end if;

  if p_artist_id is not null and not exists (
    select 1 from public.event_artists ea where ea.event_id = p_event_id and ea.artist_id = p_artist_id
  ) then
    raise exception using errcode = '22023', message = 'invalid_artist';
  end if;

  titles := public.clean_setlist_titles(p_titles);

  -- 10 per person every 24 h; the lock makes parallel calls count each other.
  perform pg_advisory_xact_lock(hashtextextended(caller::text || ':setlist-proposals', 0));
  select count(*) into recent
  from public.setlist_proposals
  where proposed_by = caller and created_at > now() - interval '24 hours';
  if recent >= 10 then
    raise exception using errcode = 'P0001', message = 'rate_limited', hint = 'At most 10 setlists per person every 24 hours.';
  end if;

  update public.setlist_proposals
    set status = 'withdrawn', reviewed_at = now()
    where event_id = p_event_id and proposed_by = caller and status = 'pending';

  insert into public.setlist_proposals (event_id, proposed_by, artist_id, titles)
  values (p_event_id, caller, p_artist_id, titles)
  returning id into proposal;

  if manager then
    perform public.write_audience_setlist(p_event_id, titles, p_artist_id, caller);
    update public.setlist_proposals
      set status = 'approved', reviewed_by = caller, reviewed_at = now()
      where id = proposal;
    update public.setlist_proposals
      set status = 'superseded', reviewed_by = caller, reviewed_at = now()
      where event_id = p_event_id and status = 'pending';
    return jsonb_build_object('id', proposal, 'status', 'approved', 'titles', to_jsonb(titles));
  end if;

  return jsonb_build_object('id', proposal, 'status', 'pending', 'titles', to_jsonb(titles));
end;
$$;

revoke all on function public.submit_audience_setlist(uuid, text[], uuid) from public, anon;
grant execute on function public.submit_audience_setlist(uuid, text[], uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Review
-- ---------------------------------------------------------------------------

create or replace function public.review_setlist_proposal(
  p_proposal_id uuid,
  p_approve boolean,
  p_note text default null,
  p_replace_existing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  proposal public.setlist_proposals%rowtype;
  manager boolean;
  note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'not_signed_in';
  end if;

  select * into proposal from public.setlist_proposals where id = p_proposal_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'proposal_not_found';
  end if;

  manager := public.can_manage_event(proposal.event_id);
  if not manager and not public.current_user_is_staff() then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if proposal.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'not_pending';
  end if;
  if note is not null and char_length(note) > 280 then
    raise exception using errcode = '22023', message = 'note_too_long';
  end if;

  if not coalesce(p_approve, false) then
    update public.setlist_proposals
      set status = 'rejected', reviewed_by = caller, reviewed_at = now(), review_note = note
      where id = proposal.id;
    return jsonb_build_object('id', proposal.id, 'status', 'rejected');
  end if;

  if exists (
    select 1 from public.event_setlist_items i
    where i.event_id = proposal.event_id and i.source <> 'audience'
  ) and not (manager and coalesce(p_replace_existing, false)) then
    raise exception using errcode = 'P0001', message = 'setlist_exists';
  end if;

  -- The performer may have left the line-up since: fall back to the headliner.
  if proposal.artist_id is not null and not exists (
    select 1 from public.event_artists ea where ea.event_id = proposal.event_id and ea.artist_id = proposal.artist_id
  ) then
    proposal.artist_id := null;
  end if;

  perform public.write_audience_setlist(proposal.event_id, proposal.titles, proposal.artist_id, proposal.proposed_by);

  update public.setlist_proposals
    set status = 'approved', reviewed_by = caller, reviewed_at = now(), review_note = note
    where id = proposal.id;
  update public.setlist_proposals
    set status = 'superseded', reviewed_by = caller, reviewed_at = now()
    where event_id = proposal.event_id and status = 'pending';

  return jsonb_build_object('id', proposal.id, 'status', 'approved');
end;
$$;

revoke all on function public.review_setlist_proposal(uuid, boolean, text, boolean) from public, anon;
grant execute on function public.review_setlist_proposal(uuid, boolean, text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Review queue
-- ---------------------------------------------------------------------------

-- Pending proposals the caller can review, newest first, with what the
-- review card needs. p_venue_id / p_artist_id narrow it to one managed
-- profile's concerts (Gestión); both null is the moderation queue. Runs as
-- the caller: RLS on setlist_proposals decides what is visible.
create or replace function public.list_setlist_proposals(
  p_venue_id uuid default null,
  p_artist_id uuid default null
)
returns table (
  id uuid,
  event_id uuid,
  event_name text,
  starts_at timestamptz,
  venue_name text,
  titles text[],
  proposer_id uuid,
  proposer_username text,
  created_at timestamptz,
  has_other_setlist boolean,
  can_manage boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    p.id,
    p.event_id,
    e.name,
    e.starts_at,
    v.name,
    p.titles,
    p.proposed_by,
    pr.username::text,
    p.created_at,
    exists (
      select 1 from public.event_setlist_items i
      where i.event_id = p.event_id and i.source <> 'audience'
    ),
    public.can_manage_event(p.event_id)
  from public.setlist_proposals p
  join public.events e on e.id = p.event_id
  left join public.venue_places v on v.id = e.venue_place_id
  left join public.profiles pr on pr.id = p.proposed_by
  where p.status = 'pending'
    and (p_venue_id is null or e.venue_place_id = p_venue_id)
    and (p_artist_id is null or exists (
      select 1 from public.event_artists ea where ea.event_id = e.id and ea.artist_id = p_artist_id
    ))
  order by p.created_at desc
  limit 100;
$$;

revoke all on function public.list_setlist_proposals(uuid, uuid) from public, anon;
grant execute on function public.list_setlist_proposals(uuid, uuid) to authenticated, service_role;

commit;
