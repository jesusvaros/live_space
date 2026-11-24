begin;

-- Moments of a concert, managed by its artists, venue or festival, plus the
-- in-app reports queue for admins (docs/moderacion.md).
--
-- 1. A manager of the concert can HIDE a fan's moment from everyone else and
--    show it again. Hiding never deletes or changes the fan's file: the fan
--    still sees it (own posts), and so do the concert's managers (to undo)
--    and staff. Every hide/unhide is written to moderation_actions.
-- 2. event_moments_for_manager(): every moment of a concert for its managers,
--    with hidden state, open reports and — only where the fan's licence
--    allows reuse — the media URL and the credit to download it with.
-- 3. Admin queue: reported moments grouped by post; keep (publish again and
--    dismiss reports), hide (archive) or delete (file queued for removal).
--    Delete is the only path that removes another person's original.

-- ---------------------------------------------------------------------------
-- 1. Hidden by the concert's managers
-- ---------------------------------------------------------------------------

create table if not exists public.event_hidden_posts (
  post_id uuid primary key references public.posts(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  hidden_by uuid references public.profiles(id) on delete set null,
  reason text check (reason is null or char_length(reason) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists event_hidden_posts_event_idx on public.event_hidden_posts (event_id);

alter table public.event_hidden_posts enable row level security;

drop policy if exists event_hidden_posts_read on public.event_hidden_posts;
create policy event_hidden_posts_read on public.event_hidden_posts
  for select to authenticated
  using (
    public.current_user_is_staff()
    or public.is_event_entity_member(event_id)
    or exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
  );
-- Writes only through set_event_post_hidden().
revoke insert, update, delete on public.event_hidden_posts from anon, authenticated;

-- Row check for posts_read: bypasses event_hidden_posts RLS on purpose (an
-- anonymous reader cannot see that table, yet must not see hidden posts).
create or replace function public.post_is_hidden_from_event(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.event_hidden_posts h where h.post_id = p_post_id);
$$;

revoke all on function public.post_is_hidden_from_event(uuid) from public;
grant execute on function public.post_is_hidden_from_event(uuid) to anon, authenticated, service_role;

drop policy if exists posts_read on public.posts;
create policy posts_read on public.posts
  for select
  using (
    (
      status = 'published'::public.publish_status
      and not public.users_block_each_other(author_id, (select auth.uid()))
      and not public.post_is_hidden_from_event(id)
    )
    or author_id = (select auth.uid())
    or public.current_user_is_staff()
    or (
      status = 'published'::public.publish_status
      and public.post_is_hidden_from_event(id)
      and public.is_event_entity_member(event_id)
    )
  );

create or replace function public.set_event_post_hidden(p_post_id uuid, p_hidden boolean, p_reason text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_event uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  select p.event_id into v_event from public.posts p where p.id = p_post_id;
  if v_event is null then
    raise exception using errcode = 'P0002', message = 'Moment not found';
  end if;
  if not public.is_event_entity_member(v_event) then
    raise exception using errcode = '42501', message = 'Only the managers of this concert can hide its moments';
  end if;

  if coalesce(p_hidden, false) then
    insert into public.event_hidden_posts (post_id, event_id, hidden_by, reason)
    values (p_post_id, v_event, v_uid, nullif(left(trim(coalesce(p_reason, '')), 300), ''))
    on conflict (post_id) do nothing;
  else
    delete from public.event_hidden_posts where post_id = p_post_id;
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, reason, metadata)
  values (
    v_uid,
    case when coalesce(p_hidden, false) then 'event_hide' else 'event_unhide' end,
    'post',
    p_post_id,
    nullif(left(trim(coalesce(p_reason, '')), 300), ''),
    jsonb_build_object('event_id', v_event)
  );
  return coalesce(p_hidden, false);
end;
$$;

revoke all on function public.set_event_post_hidden(uuid, boolean, text) from public;
grant execute on function public.set_event_post_hidden(uuid, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The concert's moments, for its managers
-- ---------------------------------------------------------------------------

create or replace function public.event_moments_for_manager(p_event_id uuid)
returns table (
  post_id uuid,
  author_id uuid,
  credit text,
  created_at timestamptz,
  resource_type text,
  format text,
  thumbnail_url text,
  media_url text,
  allow_reuse boolean,
  hidden boolean,
  open_reports bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.is_event_entity_member(p_event_id) then
    raise exception using errcode = '42501', message = 'Only the managers of this concert can see this';
  end if;
  return query
    select p.id,
           p.author_id,
           public.reuse_credit(p.author_id),
           p.created_at,
           m.resource_type,
           m.format,
           coalesce(m.thumbnail_url, case when m.resource_type = 'image' then m.secure_url end),
           -- The file itself only where the fan lets the concert reuse it.
           case when p.allow_reuse then m.secure_url end,
           p.allow_reuse,
           exists (select 1 from public.event_hidden_posts h where h.post_id = p.id),
           (select count(*) from public.moderation_reports r
             where r.target_type = 'post' and r.target_id = p.id and r.status in ('open', 'reviewing'))
    from public.posts p
    join public.media_assets m on m.id = p.media_asset_id
    where p.event_id = p_event_id
      and p.status = 'published'
      and m.deleted_at is null
      and not public.users_block_each_other(p.author_id, auth.uid())
    order by p.created_at desc
    limit 500;
end;
$$;

revoke all on function public.event_moments_for_manager(uuid) from public;
grant execute on function public.event_moments_for_manager(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Admin reports queue (in the app's Admin panel)
-- ---------------------------------------------------------------------------

create or replace function public.moderation_queue()
returns table (
  post_id uuid,
  post_status text,
  author_id uuid,
  author_name text,
  event_id uuid,
  event_name text,
  resource_type text,
  thumbnail_url text,
  media_url text,
  reports bigint,
  reasons text[],
  details text[],
  last_report_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'admin_only';
  end if;
  return query
    select p.id,
           p.status::text,
           p.author_id,
           coalesce(nullif(ap.display_name, ''), '@' || ap.username::text, 'Fan'),
           p.event_id,
           e.name,
           m.resource_type,
           coalesce(m.thumbnail_url, case when m.resource_type = 'image' then m.secure_url end),
           m.secure_url,
           count(distinct r.reporter_id),
           array_agg(distinct r.reason) filter (where r.reason is not null),
           array_remove(array_agg(distinct nullif(trim(r.details), '')), null),
           max(r.created_at)
    from public.moderation_reports r
    join public.posts p on p.id = r.target_id
    left join public.media_assets m on m.id = p.media_asset_id
    left join public.profiles ap on ap.id = p.author_id
    left join public.events e on e.id = p.event_id
    where r.target_type = 'post' and r.status in ('open', 'reviewing')
    group by p.id, p.status, p.author_id, ap.display_name, ap.username, p.event_id, e.name,
             m.resource_type, m.thumbnail_url, m.secure_url
    order by count(distinct r.reporter_id) desc, max(r.created_at) desc
    limit 200;
end;
$$;

-- keep   → published again, reports dismissed
-- hide   → archived (reversible from here or the admin dashboard), reports resolved
-- delete → post removed, its files queued for deletion, reports resolved
create or replace function public.moderation_decide(p_post_id uuid, p_action text, p_note text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_post record;
  v_queued integer := 0;
  v_note text := nullif(left(trim(coalesce(p_note, '')), 500), '');
begin
  if v_uid is null or not public.current_user_is_admin() then
    raise exception using errcode = '42501', message = 'admin_only';
  end if;
  if p_action not in ('keep', 'hide', 'delete') then
    raise exception using errcode = '22023', message = 'invalid_action';
  end if;

  select p.id, p.author_id, p.event_id, p.status, p.media_asset_id, m.reservation_id
  into v_post
  from public.posts p
  left join public.media_assets m on m.id = p.media_asset_id
  where p.id = p_post_id
  for update of p;
  if not found then
    raise exception using errcode = 'P0002', message = 'not_found';
  end if;

  insert into public.moderation_actions (actor_id, action_type, target_type, target_id, reason, metadata)
  values (v_uid, 'queue_' || p_action, 'post', p_post_id, v_note,
          jsonb_build_object('event_id', v_post.event_id, 'from_status', v_post.status::text, 'author_id', v_post.author_id));

  update public.moderation_reports
  set status = case when p_action = 'keep' then 'dismissed' else 'resolved' end::public.report_status,
      assigned_to = v_uid,
      resolved_at = now(),
      resolution_note = coalesce(v_note, p_action),
      updated_at = now()
  where target_type = 'post' and target_id = p_post_id and status in ('open', 'reviewing');

  if p_action = 'keep' then
    update public.posts set status = 'published', updated_at = now() where id = p_post_id;
  elsif p_action = 'hide' then
    update public.posts set status = 'archived', updated_at = now() where id = p_post_id;
  else
    if v_post.media_asset_id is not null then
      insert into public.media_deletion_queue (provider, object_key, resource_type, reason)
      select distinct
        case when m.storage_provider = 'r2' then 'r2' else 'cloudinary' end,
        case when m.storage_provider = 'r2' then m.storage_key else m.cloudinary_public_id end,
        m.resource_type,
        'post_deleted'
      from public.media_assets m
      where m.owner_id = v_post.author_id
        and m.subject_id is null
        and (
          m.id = v_post.media_asset_id
          or (v_post.reservation_id is not null and m.attribution ->> 'video_reservation_id' = v_post.reservation_id::text)
        )
        and (case when m.storage_provider = 'r2' then m.storage_key else m.cloudinary_public_id end) is not null
      on conflict on constraint media_deletion_queue_object_key do nothing;
      get diagnostics v_queued = row_count;
    end if;

    delete from public.posts where id = p_post_id;

    if v_post.media_asset_id is not null then
      delete from public.media_assets m
      where m.owner_id = v_post.author_id
        and m.subject_id is null
        and (
          m.id = v_post.media_asset_id
          or (v_post.reservation_id is not null and m.attribution ->> 'video_reservation_id' = v_post.reservation_id::text)
        )
        and not exists (select 1 from public.posts p where p.media_asset_id = m.id);
    end if;
  end if;

  return jsonb_build_object('action', p_action, 'queued_files', v_queued);
end;
$$;

revoke all on function public.moderation_queue() from public, anon;
revoke all on function public.moderation_decide(uuid, text, text) from public, anon;
grant execute on function public.moderation_queue() to authenticated, service_role;
grant execute on function public.moderation_decide(uuid, text, text) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
