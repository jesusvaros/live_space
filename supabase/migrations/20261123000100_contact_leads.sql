-- Contact e-mails of venues and artists, for the team to reach out by hand.
-- Kept apart from the public venue/artist rows: only admins can read or
-- change them (never shown in the app). Found on the venue's own website by
-- scripts/contacts/findVenueEmails.mjs and reviewed before anyone writes.
-- Spain's LSSI forbids unsolicited commercial e-mail: these are for one-to-one
-- contact, never bulk sends; 'do_not_contact' is honoured forever.

create table if not exists public.contact_leads (
  id uuid primary key default gen_random_uuid(),
  venue_place_id uuid references public.venue_places(id) on delete cascade,
  artist_id uuid references public.artists(id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  source_url text,
  status text not null default 'found' check (status in ('found', 'verified', 'contacted', 'do_not_contact')),
  notes text,
  found_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(venue_place_id, artist_id) = 1)
);

create unique index if not exists contact_leads_venue_email on public.contact_leads (venue_place_id, lower(email)) where venue_place_id is not null;
create unique index if not exists contact_leads_artist_email on public.contact_leads (artist_id, lower(email)) where artist_id is not null;

alter table public.contact_leads enable row level security;

drop policy if exists contact_leads_admin_all on public.contact_leads;
create policy contact_leads_admin_all on public.contact_leads
  for all to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

revoke all on public.contact_leads from anon;
grant select, insert, update, delete on public.contact_leads to authenticated;
