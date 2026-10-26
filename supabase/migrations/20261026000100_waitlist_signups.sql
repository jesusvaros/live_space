begin;

-- Emails left on the public site to be told when the app reaches the stores.
-- Anonymous visitors may only insert; nobody but service_role can read them.
create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null unique,
  source text not null default 'landing',
  created_at timestamptz not null default now(),
  constraint waitlist_signups_email_format check (
    char_length(email) <= 254 and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  constraint waitlist_signups_source_length check (char_length(source) between 1 and 64)
);

alter table public.waitlist_signups enable row level security;

drop policy if exists waitlist_signups_insert on public.waitlist_signups;
create policy waitlist_signups_insert on public.waitlist_signups for insert
  to anon, authenticated
  with check (true);

revoke all on public.waitlist_signups from anon, authenticated;
grant insert (email, source) on public.waitlist_signups to anon, authenticated;
grant all on public.waitlist_signups to service_role;

commit;
