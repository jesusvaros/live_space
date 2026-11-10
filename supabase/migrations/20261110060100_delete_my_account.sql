begin;

-- Account deletion from inside the app (App Store 5.1.1(v), Google Play
-- account deletion policy). See docs/seguridad.md, "Borrar la cuenta".
--
-- delete_my_account() runs as the signed-in person and only ever acts on
-- auth.uid(). It deletes the auth user, and the ON DELETE rules of every
-- table that points at profiles do the rest (cascade or set null), after
-- three explicit steps the cascades cannot do:
--
--   1. media_assets.owner_id and posts.media_asset_id are ON DELETE
--      RESTRICT: the person's posts and media rows are deleted first, and the
--      files behind them are queued in media_deletion_queue, because R2 and
--      Cloudinary cannot be reached from Postgres. The daily workflow drains
--      the queue (npm run media:drain-deletions).
--   2. post_views keeps 'u:<profile uuid>' in viewer_key: those rows are
--      anonymised (random key, no profile) so the counts of other people's
--      moments stay right without pointing at the deleted account.
--   3. moderation_actions.actor_id was NOT NULL + RESTRICT, so a venue
--      manager or staff member who ever decided a claim or a concert could
--      not be deleted. It becomes nullable with ON DELETE SET NULL: the audit
--      row stays, without the person.
--
-- Artists, venues and festivals the person manages are shared entities and
-- stay; only the person's membership, claims and proposals' authorship go
-- (entity_memberships/entity_claims cascade, event_proposals.proposed_by and
-- every created_by/reviewed_by set null).
--
-- Additive except for relaxing that one audit constraint. Nothing calls the
-- function until the app does; if this migration is not live yet the app
-- shows the request-by-email fallback.

-- ---------------------------------------------------------------------------
-- 1. Queue of storage objects to delete
-- ---------------------------------------------------------------------------

create table if not exists public.media_deletion_queue (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('r2', 'cloudinary')),
  -- R2: object key (v/<yyyy>/<mm>/<uuid>.mp4). Cloudinary: public_id.
  object_key text not null check (char_length(object_key) between 1 and 512),
  -- Cloudinary needs it to address the asset; informative for R2.
  resource_type text check (resource_type is null or resource_type in ('image', 'video')),
  reason text not null default 'account_deleted' check (reason in ('account_deleted')),
  requested_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  last_attempt_at timestamptz,
  last_error text,
  deleted_at timestamptz,
  constraint media_deletion_queue_object_key unique (provider, object_key)
);

create index if not exists media_deletion_queue_pending_idx
  on public.media_deletion_queue (requested_at)
  where deleted_at is null;

comment on table public.media_deletion_queue is
  'Files to remove from R2/Cloudinary after their rows were deleted (account deletion). Drained by src/scripts/drainMediaDeletions.ts with the service role. No person, no URL: only provider and key.';

-- RLS on and no policies: only service_role (the worker) reads or writes.
alter table public.media_deletion_queue enable row level security;
revoke all on public.media_deletion_queue from public, anon, authenticated;
grant all on public.media_deletion_queue to service_role;

-- ---------------------------------------------------------------------------
-- 2. Audit rows survive their actor
-- ---------------------------------------------------------------------------

alter table public.moderation_actions alter column actor_id drop not null;
alter table public.moderation_actions drop constraint if exists moderation_actions_actor_id_fkey;
alter table public.moderation_actions
  add constraint moderation_actions_actor_id_fkey
  foreign key (actor_id) references public.profiles(id) on delete set null;

comment on column public.moderation_actions.actor_id is
  'Who acted. Null once that account was deleted (delete_my_account); the action itself is kept.';

-- ---------------------------------------------------------------------------
-- 3. delete_my_account()
-- ---------------------------------------------------------------------------

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  queued integer := 0;
  deleted_posts integer := 0;
  deleted_media integer := 0;
  anonymised_views integer := 0;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  -- One deletion at a time per account (a double tap sends two calls).
  perform pg_advisory_xact_lock(hashtextextended(caller::text || ':delete-account', 0));

  if not exists (select 1 from auth.users where id = caller) then
    return jsonb_build_object('deleted', false, 'reason', 'already_deleted');
  end if;

  -- Files first, while the rows that name them still exist. R2 videos are
  -- addressed by storage_key; everything else lives in Cloudinary under its
  -- public_id (video posters and photos included: each is its own row).
  -- Only personal uploads (subject_id null): a poster uploaded as manager of
  -- an artist or venue (purpose 'catalog') belongs to that shared entity and
  -- events.image_url keeps pointing at it, so its file stays; its row goes.
  insert into public.media_deletion_queue (provider, object_key, resource_type, reason)
  select distinct
    case when m.storage_provider = 'r2' then 'r2' else 'cloudinary' end,
    case when m.storage_provider = 'r2' then m.storage_key else m.cloudinary_public_id end,
    m.resource_type,
    'account_deleted'
  from public.media_assets m
  where m.owner_id = caller
    and m.subject_id is null
    and (case when m.storage_provider = 'r2' then m.storage_key else m.cloudinary_public_id end) is not null
  on conflict on constraint media_deletion_queue_object_key do nothing;
  get diagnostics queued = row_count;

  -- Their views of other people's moments: keep the count, drop the link.
  update public.post_views
  set viewer_key = 'x:' || md5(viewer_key || extensions.gen_random_uuid()::text),
      profile_id = null
  where profile_id = caller or viewer_key = 'u:' || caller::text;
  get diagnostics anonymised_views = row_count;

  -- Posts (likes, views and reports' targets go with them by cascade or stay
  -- as dangling ids), then the media rows, which RESTRICT the profile.
  delete from public.posts where author_id = caller;
  get diagnostics deleted_posts = row_count;
  delete from public.media_assets where owner_id = caller;
  get diagnostics deleted_media = row_count;

  -- Shared entities stay; the person's access to them goes. (The cascade
  -- would do it too; explicit so the intent is visible.)
  delete from public.entity_memberships where profile_id = caller;
  delete from public.entity_claims where claimant_id = caller;

  -- The rest cascades from auth.users → profiles → subjects: profile,
  -- follows (both ways), saves, attendance, likes, blocks (both ways),
  -- reports they sent, venue tags, upload reservations, identities and
  -- sessions. created_by/reviewed_by/buyer_id columns become null.
  delete from auth.users where id = caller;

  return jsonb_build_object(
    'deleted', true,
    'posts', deleted_posts,
    'media', deleted_media,
    'files_queued', queued,
    'views_anonymised', anonymised_views
  );
end;
$$;

comment on function public.delete_my_account() is
  'Deletes the caller''s account and everything tied to it; queues their files in media_deletion_queue. Only acts on auth.uid().';

revoke all on function public.delete_my_account() from public;
revoke execute on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;

commit;

notify pgrst, 'reload schema';
