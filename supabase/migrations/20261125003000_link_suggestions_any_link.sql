begin;

-- «¿Falta un concierto?» takes any link (docs/scraping.md, "Sugerencias de
-- usuarios"). The form does not change; the daily importer now also reads:
--
--   agenda  → a page with several concerts: each upcoming one is staged;
--   venue   → a venue's own site (schema.org LocalBusiness/BarOrPub/…, or an
--             address + agenda on its home page);
--   artist  → an artist's site or platform page (Spotify, Bandcamp, Apple
--             Music, SoundCloud, schema.org MusicGroup);
--   profile → a social profile (Instagram, TikTok, Facebook, YouTube): a
--             venue or an artist, the admin decides.
--
-- Venue, artist and profile links wait in Admin → «Salas y artistas
-- sugeridos» (status 'review'). «Crear sala» / «Crear artista» creates it with
-- the normal services and marks every suggestion of that link 'imported' with
-- result_venue_place_id / result_artist_id (the person gets «Ya está», same
-- switch suggestion_imported); «Descartar» marks them 'failed'.
--
-- Additive only. Clients still insert only (url, note) (column grants of
-- 20261112000100), so kind and candidate are only ever set by the worker.

alter table public.event_link_suggestions
  add column if not exists kind text not null default 'event',
  add column if not exists candidate jsonb,
  add column if not exists result_venue_place_id uuid references public.venue_places(id) on delete set null,
  add column if not exists result_artist_id uuid references public.artists(id) on delete set null;

alter table public.event_link_suggestions drop constraint if exists event_link_suggestions_kind_check;
alter table public.event_link_suggestions
  add constraint event_link_suggestions_kind_check
  check (kind in ('event', 'agenda', 'venue', 'artist', 'profile'));

alter table public.event_link_suggestions drop constraint if exists event_link_suggestions_candidate_check;
alter table public.event_link_suggestions
  add constraint event_link_suggestions_candidate_check
  check (candidate is null or (jsonb_typeof(candidate) = 'object' and pg_column_size(candidate) <= 8192));

comment on column public.event_link_suggestions.kind is
  'What the link turned out to be: event (one concert), agenda (several, each staged), venue, artist or profile (social, venue or artist).';
comment on column public.event_link_suggestions.candidate is
  'Venue/artist data read from the page (name, city, address, website, links, imageUrl, description, evidence) for the admin.';

create index if not exists event_link_suggestions_candidates_idx
  on public.event_link_suggestions (created_at)
  where status = 'review' and kind in ('venue', 'artist', 'profile');

-- ---------------------------------------------------------------------------
-- Admin: list and resolve venue/artist candidates
-- ---------------------------------------------------------------------------

-- One row per link (several people may send the same one). Who sent it is not
-- returned: the admin only needs how many.
create or replace function public.admin_link_candidates()
returns table (
  url text,
  url_host text,
  kind text,
  candidate jsonb,
  people integer,
  notes text[],
  first_sent_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'admin_only';
  end if;
  return query
    select
      s.url,
      min(s.url_host),
      min(s.kind),
      (array_agg(s.candidate order by s.processed_at desc nulls last))[1],
      count(*)::integer,
      coalesce(array_agg(s.note order by s.created_at) filter (where s.note is not null), array[]::text[]),
      min(s.created_at)
    from public.event_link_suggestions s
    where s.status = 'review'
      and s.kind in ('venue', 'artist', 'profile')
    group by s.url
    order by min(s.created_at)
    limit 200;
end;
$$;

-- p_action 'created' (with the venue or artist the admin just created) or
-- 'dismissed'. Applies to every pending candidate row of that link.
create or replace function public.admin_resolve_link_candidate(
  p_url text,
  p_action text,
  p_venue_place_id uuid default null,
  p_artist_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'admin_only';
  end if;
  if p_action = 'created' then
    if (p_venue_place_id is null) = (p_artist_id is null) then
      raise exception using errcode = '22023', message = 'one_result_required';
    end if;
    update public.event_link_suggestions
      set status = 'imported',
          result_venue_place_id = p_venue_place_id,
          result_artist_id = p_artist_id,
          error = null,
          processed_at = now()
      where url = p_url and status = 'review' and kind in ('venue', 'artist', 'profile');
  elsif p_action = 'dismissed' then
    update public.event_link_suggestions
      set status = 'failed',
          error = 'dismissed-by-admin',
          processed_at = now()
      where url = p_url and status = 'review' and kind in ('venue', 'artist', 'profile');
  else
    raise exception using errcode = '22023', message = 'invalid_action';
  end if;
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.admin_link_candidates() from public, anon;
revoke all on function public.admin_resolve_link_candidate(text, text, uuid, uuid) from public, anon;
grant execute on function public.admin_link_candidates() to authenticated;
grant execute on function public.admin_resolve_link_candidate(text, text, uuid, uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
