begin;

-- Phase 1 of management: a team for each artist or venue, and personal links
-- to claim a profile.
--
-- 1. entity_invites: an owner/admin of a profile creates a one-time link
--    (no email provider yet: they share it by WhatsApp or mail themselves).
--    Whoever opens it signed in joins the team with the role chosen.
-- 2. entity_claim_links: a Live Space admin creates a one-time link for a
--    specific artist or venue (for one-to-one outreach). Opening it signed in
--    gives that person the profile without the manual review.
--
-- Only a SHA-256 hash of each token is stored; the raw token is returned
-- once to whoever creates it. Everything goes through security-definer
-- functions; the tables themselves are readable only by who may manage them.

create table if not exists public.entity_invites (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  token_hash text not null unique,
  role public.entity_member_role not null check (role in ('admin', 'editor', 'moderator')),
  email text check (email is null or (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254)),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz
);

create index if not exists entity_invites_subject on public.entity_invites (subject_id, created_at desc);

alter table public.entity_invites enable row level security;
revoke all on public.entity_invites from anon;
revoke insert, update, delete on public.entity_invites from authenticated;
grant select on public.entity_invites to authenticated;

drop policy if exists entity_invites_read on public.entity_invites;
create policy entity_invites_read on public.entity_invites for select to authenticated
  using (public.can_admin_subject(subject_id));

create table if not exists public.entity_claim_links (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  token_hash text not null unique,
  note text check (note is null or char_length(note) <= 200),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz,
  used_role text check (used_role is null or char_length(used_role) between 2 and 80),
  revoked_at timestamptz
);

create index if not exists entity_claim_links_subject on public.entity_claim_links (subject_id, created_at desc);

alter table public.entity_claim_links enable row level security;
revoke all on public.entity_claim_links from anon;
revoke insert, update, delete on public.entity_claim_links from authenticated;
grant select on public.entity_claim_links to authenticated;

drop policy if exists entity_claim_links_admin_read on public.entity_claim_links;
create policy entity_claim_links_admin_read on public.entity_claim_links for select to authenticated
  using (public.current_user_is_admin());

-- Shared helpers ------------------------------------------------------------

create or replace function public.entity_token_hash(p_token text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.new_entity_token()
returns text
language sql
volatile
set search_path = ''
as $$
  -- 24 random bytes, URL-safe base64 without padding (32 chars).
  select translate(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+/', '-_');
$$;

revoke all on function public.entity_token_hash(text) from public;
revoke all on function public.new_entity_token() from public;

-- Subject card shown on the accept / claim screens.
create or replace function public.entity_subject_card(p_subject_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'subject_id', s.id,
    'type', s.type,
    'entity_id', coalesce(s.artist_id, s.venue_place_id),
    'name', coalesce(a.name, v.name),
    'city', coalesce(a.city, v.city),
    'image_url', coalesce(a.image_url, v.image_url)
  )
  from public.subjects s
  left join public.artists a on a.id = s.artist_id
  left join public.venue_places v on v.id = s.venue_place_id
  where s.id = p_subject_id and s.type in ('artist', 'venue');
$$;

revoke all on function public.entity_subject_card(uuid) from public;

-- Team invites ---------------------------------------------------------------

create or replace function public.create_entity_invite(
  p_subject_id uuid,
  p_role public.entity_member_role,
  p_email text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text := public.new_entity_token();
begin
  if auth.uid() is null or not public.can_admin_subject(p_subject_id) then
    raise exception using errcode = '42501', message = 'Only owners and admins can invite';
  end if;
  if p_role not in ('admin', 'editor', 'moderator') then
    raise exception using errcode = '22023', message = 'Invalid role';
  end if;
  if (select count(*) from public.entity_invites
      where subject_id = p_subject_id and created_at > now() - interval '1 day') >= 20 then
    raise exception using errcode = '54000', message = 'Too many invites today';
  end if;

  insert into public.entity_invites (subject_id, token_hash, role, email, created_by)
  values (p_subject_id, public.entity_token_hash(v_token), p_role, nullif(lower(trim(coalesce(p_email, ''))), ''), auth.uid());

  return v_token;
end;
$$;

create or replace function public.preview_entity_invite(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invite public.entity_invites;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sign in first';
  end if;
  select * into v_invite from public.entity_invites where token_hash = public.entity_token_hash(p_token);
  if v_invite.id is null then
    return jsonb_build_object('state', 'invalid');
  end if;
  return public.entity_subject_card(v_invite.subject_id) || jsonb_build_object(
    'role', v_invite.role,
    'state', case
      when v_invite.revoked_at is not null then 'revoked'
      when v_invite.accepted_at is not null then 'used'
      when v_invite.expires_at < now() then 'expired'
      when exists (select 1 from public.entity_memberships m
                   where m.subject_id = v_invite.subject_id and m.profile_id = auth.uid()) then 'member'
      else 'ok'
    end
  );
end;
$$;

create or replace function public.accept_entity_invite(p_token text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.entity_invites;
  v_card jsonb;
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Sign in first';
  end if;
  select * into v_invite from public.entity_invites
  where token_hash = public.entity_token_hash(p_token)
  for update;
  if v_invite.id is null or v_invite.revoked_at is not null or v_invite.accepted_at is not null
     or v_invite.expires_at < now() then
    raise exception using errcode = '22023', message = 'Invite not valid';
  end if;

  -- Already in the team: keep their current role, but the link is spent.
  insert into public.entity_memberships (subject_id, profile_id, role, created_by)
  values (v_invite.subject_id, v_user, v_invite.role, v_invite.created_by)
  on conflict (subject_id, profile_id) do nothing;

  update public.entity_invites set accepted_by = v_user, accepted_at = now() where id = v_invite.id;

  v_card := public.entity_subject_card(v_invite.subject_id);
  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, reason, metadata)
  values (
    v_user, 'team_invite_accepted', (v_card->>'type')::public.report_target_type, (v_card->>'entity_id')::uuid,
    'Invitación al equipo aceptada',
    jsonb_build_object('invite_id', v_invite.id, 'subject_id', v_invite.subject_id, 'role', v_invite.role, 'invited_by', v_invite.created_by)
  );

  return v_invite.subject_id;
end;
$$;

create or replace function public.revoke_entity_invite(p_invite_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_subject uuid;
begin
  select subject_id into v_subject from public.entity_invites where id = p_invite_id;
  if v_subject is null or not public.can_admin_subject(v_subject) then
    raise exception using errcode = '42501', message = 'Not allowed';
  end if;
  update public.entity_invites set revoked_at = now() where id = p_invite_id and accepted_at is null and revoked_at is null;
end;
$$;

-- Members with their public names, for everyone in the team.
create or replace function public.list_entity_members(p_subject_id uuid)
returns table (
  profile_id uuid,
  role public.entity_member_role,
  username text,
  display_name text,
  avatar_url text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_manage_subject(p_subject_id, true) then
    raise exception using errcode = '42501', message = 'Not allowed';
  end if;
  return query
    select m.profile_id, m.role, p.username::text, p.display_name, p.avatar_url, m.created_at
    from public.entity_memberships m
    join public.profiles p on p.id = m.profile_id
    where m.subject_id = p_subject_id
    order by array_position(array['owner', 'admin', 'editor', 'moderator']::public.entity_member_role[], m.role), m.created_at;
end;
$$;

-- Claim links ----------------------------------------------------------------

create or replace function public.admin_create_claim_link(p_subject_id uuid, p_note text default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text := public.new_entity_token();
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'Only admins can create claim links';
  end if;
  if public.entity_subject_card(p_subject_id) is null then
    raise exception using errcode = 'P0002', message = 'Profile not found';
  end if;
  insert into public.entity_claim_links (subject_id, token_hash, note, created_by)
  values (p_subject_id, public.entity_token_hash(v_token), nullif(trim(coalesce(p_note, '')), ''), auth.uid());
  return v_token;
end;
$$;

create or replace function public.preview_claim_link(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_link public.entity_claim_links;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Sign in first';
  end if;
  select * into v_link from public.entity_claim_links where token_hash = public.entity_token_hash(p_token);
  if v_link.id is null then
    return jsonb_build_object('state', 'invalid');
  end if;
  return public.entity_subject_card(v_link.subject_id) || jsonb_build_object(
    'state', case
      when v_link.revoked_at is not null then 'revoked'
      when v_link.used_at is not null then 'used'
      when v_link.expires_at < now() then 'expired'
      when exists (select 1 from public.entity_memberships m
                   where m.subject_id = v_link.subject_id and m.profile_id = auth.uid()) then 'member'
      else 'ok'
    end
  );
end;
$$;

create or replace function public.redeem_claim_link(p_token text, p_role text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_link public.entity_claim_links;
  v_card jsonb;
  v_role text := trim(coalesce(p_role, ''));
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'Sign in first';
  end if;
  if char_length(v_role) < 2 or char_length(v_role) > 80 then
    raise exception using errcode = '22023', message = 'Role required';
  end if;
  select * into v_link from public.entity_claim_links
  where token_hash = public.entity_token_hash(p_token)
  for update;
  if v_link.id is null or v_link.revoked_at is not null or v_link.used_at is not null
     or v_link.expires_at < now() then
    raise exception using errcode = '22023', message = 'Link not valid';
  end if;

  -- Same role an approved claim gives.
  insert into public.entity_memberships (subject_id, profile_id, role, created_by)
  values (v_link.subject_id, v_user, 'admin', v_link.created_by)
  on conflict (subject_id, profile_id) do nothing;

  update public.entity_claim_links
  set used_by = v_user, used_at = now(), used_role = v_role
  where id = v_link.id;

  v_card := public.entity_subject_card(v_link.subject_id);
  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, reason, metadata)
  values (
    v_user, 'claim_link_redeemed', (v_card->>'type')::public.report_target_type, (v_card->>'entity_id')::uuid,
    'Perfil reclamado con enlace personal',
    jsonb_build_object('link_id', v_link.id, 'subject_id', v_link.subject_id, 'claimant_role', v_role, 'link_created_by', v_link.created_by)
  );

  return v_link.subject_id;
end;
$$;

create or replace function public.admin_revoke_claim_link(p_link_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'Not allowed';
  end if;
  update public.entity_claim_links set revoked_at = now() where id = p_link_id and used_at is null and revoked_at is null;
end;
$$;

revoke all on function public.create_entity_invite(uuid, public.entity_member_role, text) from public;
revoke all on function public.preview_entity_invite(text) from public;
revoke all on function public.accept_entity_invite(text) from public;
revoke all on function public.revoke_entity_invite(uuid) from public;
revoke all on function public.list_entity_members(uuid) from public;
revoke all on function public.admin_create_claim_link(uuid, text) from public;
revoke all on function public.preview_claim_link(text) from public;
revoke all on function public.redeem_claim_link(text, text) from public;
revoke all on function public.admin_revoke_claim_link(uuid) from public;

grant execute on function public.create_entity_invite(uuid, public.entity_member_role, text) to authenticated;
grant execute on function public.preview_entity_invite(text) to authenticated;
grant execute on function public.accept_entity_invite(text) to authenticated;
grant execute on function public.revoke_entity_invite(uuid) to authenticated;
grant execute on function public.list_entity_members(uuid) to authenticated;
grant execute on function public.admin_create_claim_link(uuid, text) to authenticated;
grant execute on function public.preview_claim_link(text) to authenticated;
grant execute on function public.redeem_claim_link(text, text) to authenticated;
grant execute on function public.admin_revoke_claim_link(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
