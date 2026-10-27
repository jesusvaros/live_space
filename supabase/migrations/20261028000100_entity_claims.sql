begin;

-- Claims: an artist or a venue that the scraper created is claimed by the
-- real person behind it. A claim is only a request; a human admin approves it
-- and only then is an entity_memberships row created. Additive migration.

create table if not exists public.entity_claims (
  id uuid primary key default extensions.gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  claimant_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  claimant_role text not null check (char_length(trim(claimant_role)) between 2 and 80),
  verification_method text not null check (verification_method in ('email_domain', 'instagram_code')),
  contact_email text not null check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(contact_email) <= 254),
  instagram_handle text check (instagram_handle is null or char_length(instagram_handle) <= 64),
  -- Code the claimant posts on the official Instagram account (or quotes when
  -- answering the verification email). Generated here, never by the client.
  verification_code text not null default upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8)),
  message text check (message is null or char_length(message) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint entity_claims_instagram_needs_handle check (
    verification_method <> 'instagram_code' or nullif(trim(instagram_handle), '') is not null
  ),
  constraint entity_claims_review_consistent check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_at is not null)
  )
);

-- One open request per person and profile.
create unique index if not exists entity_claims_one_pending_idx
  on public.entity_claims (subject_id, claimant_id)
  where status = 'pending';
create index if not exists entity_claims_status_created_idx
  on public.entity_claims (status, created_at);
create index if not exists entity_claims_claimant_idx
  on public.entity_claims (claimant_id);

drop trigger if exists entity_claims_set_updated_at on public.entity_claims;
create trigger entity_claims_set_updated_at
  before update on public.entity_claims
  for each row execute function public.set_updated_at();

alter table public.entity_claims enable row level security;

-- Insert: only for yourself, only as a fresh pending request, only for an
-- artist or venue (never a user subject).
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
      where s.id = subject_id and s.type in ('artist', 'venue')
    )
  );

-- Select: the claimant sees their own requests; admins see the queue.
drop policy if exists entity_claims_read_own_or_admin on public.entity_claims;
create policy entity_claims_read_own_or_admin on public.entity_claims for select to authenticated
  using (claimant_id = (select auth.uid()) or public.current_user_is_admin());

-- No update or delete policy: reviews go through review_entity_claim().

revoke all on public.entity_claims from anon, authenticated;
grant select, insert on public.entity_claims to authenticated;
grant all on public.entity_claims to service_role;

-- Review: admin only. Approving creates the membership with role 'admin'
-- (not 'owner', so the grant stays revocable through the usual policies) and
-- leaves an audit row in moderation_actions.
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

  select type, coalesce(artist_id, venue_place_id) into subject_kind, subject_entity
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

revoke all on function public.review_entity_claim(uuid, boolean, text) from public;
grant execute on function public.review_entity_claim(uuid, boolean, text) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
