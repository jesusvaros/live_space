begin;

-- Concert photos (EventDetail → «Fotos»): hide a moment for yourself, and
-- delete your own moment with its files.
--
-- 1. hidden_posts: moments a person hid from their own view («Ocultar» in the
--    photo viewer). Private: only the owner reads or changes their rows. The
--    concert page leaves those posts out of the player and the albums for
--    that person only; everyone else still sees them. Undone from the same
--    screen («Deshacer»). Both foreign keys cascade, so deleting the account
--    (delete_my_account → auth.users → profiles) or the post removes the rows:
--    delete_my_account needs no change.
--
-- 2. delete_my_post(p_post_id): the author deletes one of their moments.
--    posts_delete_own already lets an author delete the post row, but the
--    media_assets row (ON DELETE RESTRICT from posts) and the files in R2 /
--    Cloudinary would stay. The function queues the files in
--    media_deletion_queue (drained by npm run media:drain-deletions, see
--    20261110060100_delete_my_account.sql), deletes the post (likes, views and
--    hidden rows cascade) and then its media rows, the video poster included.
--    It only ever acts on a post whose author is auth.uid().
--
-- Additive: a new table, a new function, and one more allowed value in
-- media_deletion_queue.reason. The app hides locally and shows an error on
-- delete while this migration is not live.

-- ---------------------------------------------------------------------------
-- 1. hidden_posts
-- ---------------------------------------------------------------------------

create table if not exists public.hidden_posts (
  profile_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, post_id)
);

create index if not exists hidden_posts_post_idx on public.hidden_posts (post_id);

comment on table public.hidden_posts is
  'Moments each person hid from their own view of a concert. Private: only the owner reads or changes their rows.';

alter table public.hidden_posts enable row level security;

drop policy if exists hidden_posts_read_own on public.hidden_posts;
create policy hidden_posts_read_own on public.hidden_posts for select to authenticated
  using (profile_id = (select auth.uid()));
drop policy if exists hidden_posts_insert_own on public.hidden_posts;
create policy hidden_posts_insert_own on public.hidden_posts for insert to authenticated
  with check (profile_id = (select auth.uid()));
drop policy if exists hidden_posts_delete_own on public.hidden_posts;
create policy hidden_posts_delete_own on public.hidden_posts for delete to authenticated
  using (profile_id = (select auth.uid()));

revoke all on public.hidden_posts from public, anon, authenticated;
grant select, insert, delete on public.hidden_posts to authenticated;
grant all on public.hidden_posts to service_role;

-- ---------------------------------------------------------------------------
-- 2. delete_my_post
-- ---------------------------------------------------------------------------

alter table public.media_deletion_queue drop constraint if exists media_deletion_queue_reason_check;
alter table public.media_deletion_queue
  add constraint media_deletion_queue_reason_check check (reason in ('account_deleted', 'post_deleted'));

create or replace function public.delete_my_post(p_post_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  target_media uuid;
  target_reservation uuid;
  queued integer := 0;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select p.media_asset_id into target_media
  from public.posts p
  where p.id = p_post_id and p.author_id = caller
  for update;

  if not found then
    return jsonb_build_object('deleted', false, 'reason', 'not_found');
  end if;

  if target_media is not null then
    select m.reservation_id into target_reservation from public.media_assets m where m.id = target_media;

    -- The file, and the poster uploaded with a video (its own row, marked by
    -- media-r2-complete with the video's reservation id). Personal uploads
    -- of the caller only.
    insert into public.media_deletion_queue (provider, object_key, resource_type, reason)
    select distinct
      case when m.storage_provider = 'r2' then 'r2' else 'cloudinary' end,
      case when m.storage_provider = 'r2' then m.storage_key else m.cloudinary_public_id end,
      m.resource_type,
      'post_deleted'
    from public.media_assets m
    where m.owner_id = caller
      and m.subject_id is null
      and (
        m.id = target_media
        or (target_reservation is not null and m.attribution ->> 'video_reservation_id' = target_reservation::text)
      )
      and (case when m.storage_provider = 'r2' then m.storage_key else m.cloudinary_public_id end) is not null
    on conflict on constraint media_deletion_queue_object_key do nothing;
    get diagnostics queued = row_count;
  end if;

  delete from public.posts where id = p_post_id and author_id = caller;

  if target_media is not null then
    delete from public.media_assets m
    where m.owner_id = caller
      and m.subject_id is null
      and (
        m.id = target_media
        or (target_reservation is not null and m.attribution ->> 'video_reservation_id' = target_reservation::text)
      )
      and not exists (select 1 from public.posts p where p.media_asset_id = m.id);
  end if;

  return jsonb_build_object('deleted', true, 'queued_files', queued);
end;
$$;

comment on function public.delete_my_post(uuid) is
  'The author deletes one of their moments: queues its files (and a video poster) in media_deletion_queue, deletes the post, then its media rows.';

revoke all on function public.delete_my_post(uuid) from public, anon;
grant execute on function public.delete_my_post(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
