begin;

-- delete_my_account() also removes the person's concert link suggestions
-- (20261112000100_event_link_suggestions.sql). Same function as
-- 20261110080200_delete_my_account_push.sql plus one delete; the profile
-- cascade would remove the rows anyway, this keeps the list in one place
-- (docs/seguridad.md, "Borrar la cuenta"). Concerts imported from those
-- links are catalogue and stay.

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

  -- Push: the device tokens first, so nothing more is sent to this person
  -- even if something below fails; then their switches and the sent log.
  -- (All three cascade from profiles too; explicit so the intent is visible.)
  delete from public.push_devices where profile_id = caller;
  delete from public.notification_preferences where profile_id = caller;
  delete from public.notifications_sent where profile_id = caller;

  -- Ticket links they sent from «¿No encuentras un concierto?» (cascades
  -- from profiles too). The concerts imported from them stay.
  delete from public.event_link_suggestions where suggested_by = caller;

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
