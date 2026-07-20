begin;

create or replace function public.current_user_is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and app_role in ('moderator', 'admin')
  );
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and app_role = 'admin'
  );
$$;

create or replace function public.current_user_subject_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.subjects
  where type = 'user' and profile_id = (select auth.uid());
$$;

create or replace function public.can_manage_subject(p_subject_id uuid, p_include_moderator boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_admin() or exists (
    select 1
    from public.entity_memberships
    where subject_id = p_subject_id
      and profile_id = (select auth.uid())
      and (
        role in ('owner', 'admin', 'editor')
        or (p_include_moderator and role = 'moderator')
      )
  );
$$;

create or replace function public.can_admin_subject(p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_admin() or exists (
    select 1
    from public.entity_memberships
    where subject_id = p_subject_id
      and profile_id = (select auth.uid())
      and role in ('owner', 'admin')
  );
$$;

create or replace function public.can_manage_artist(p_artist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_admin() or exists (
    select 1 from public.subjects
    where artist_id = p_artist_id and public.can_manage_subject(id)
  );
$$;

create or replace function public.can_manage_venue(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_admin() or exists (
    select 1 from public.subjects
    where venue_place_id = p_venue_id and public.can_manage_subject(id)
  );
$$;

create or replace function public.can_manage_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_is_admin() or exists (
    select 1
    from public.events e
    where e.id = p_event_id
      and (
        e.created_by = (select auth.uid())
        or public.can_manage_venue(e.venue_place_id)
        or exists (
          select 1 from public.event_artists ea
          where ea.event_id = e.id and public.can_manage_artist(ea.artist_id)
        )
      )
  );
$$;

create or replace function public.users_block_each_other(p_left uuid, p_right uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = p_left and blocked_id = p_right)
       or (blocker_id = p_right and blocked_id = p_left)
  );
$$;

revoke all on function public.current_user_is_staff() from public;
revoke all on function public.current_user_is_admin() from public;
revoke all on function public.current_user_subject_id() from public;
revoke all on function public.can_manage_subject(uuid, boolean) from public;
revoke all on function public.can_admin_subject(uuid) from public;
revoke all on function public.can_manage_artist(uuid) from public;
revoke all on function public.can_manage_venue(uuid) from public;
revoke all on function public.can_manage_event(uuid) from public;
revoke all on function public.users_block_each_other(uuid, uuid) from public;
grant execute on function public.current_user_is_staff() to anon, authenticated, service_role;
grant execute on function public.current_user_is_admin() to anon, authenticated, service_role;
grant execute on function public.current_user_subject_id() to authenticated, service_role;
grant execute on function public.can_manage_subject(uuid, boolean) to anon, authenticated, service_role;
grant execute on function public.can_admin_subject(uuid) to authenticated, service_role;
grant execute on function public.can_manage_artist(uuid) to anon, authenticated, service_role;
grant execute on function public.can_manage_venue(uuid) to anon, authenticated, service_role;
grant execute on function public.can_manage_event(uuid) to anon, authenticated, service_role;
grant execute on function public.users_block_each_other(uuid, uuid) to anon, authenticated, service_role;

create or replace function public.create_subject_for_entity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_subject_id uuid;
begin
  if tg_table_name = 'profiles' then
    insert into public.subjects (type, profile_id)
    values ('user', new.id)
    returning id into new_subject_id;
  elsif tg_table_name = 'artists' then
    insert into public.subjects (type, artist_id)
    values ('artist', new.id)
    returning id into new_subject_id;
    if new.created_by is not null then
      insert into public.entity_memberships (subject_id, profile_id, role, created_by)
      values (new_subject_id, new.created_by, 'owner', new.created_by);
    end if;
  elsif tg_table_name = 'venue_places' then
    insert into public.subjects (type, venue_place_id)
    values ('venue', new.id)
    returning id into new_subject_id;
    if new.created_by is not null then
      insert into public.entity_memberships (subject_id, profile_id, role, created_by)
      values (new_subject_id, new.created_by, 'owner', new.created_by);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.reserve_media_upload(
  p_kind public.media_kind,
  p_event_id uuid default null,
  p_subject_id uuid default null,
  p_purpose text default 'user'
)
returns table (
  reservation_id uuid,
  cloudinary_public_id text,
  folder text,
  upload_preset text,
  max_bytes bigint,
  max_duration_seconds integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester uuid := auth.uid();
  requester_terms timestamptz;
  usage_percent numeric(5, 2);
  uploads_paused boolean;
  target_type public.subject_type;
  target_entity_id uuid;
  selected_folder text;
  selected_preset text;
  selected_max_bytes bigint;
  selected_max_duration integer;
  new_id uuid := extensions.gen_random_uuid();
  new_public_id text := extensions.gen_random_uuid()::text;
  new_expires_at timestamptz := now() + interval '10 minutes';
  monthly_video_count integer;
begin
  if requester is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select terms_accepted_at into requester_terms
  from public.profiles where id = requester;
  if requester_terms is null then
    raise exception using errcode = '42501', message = 'Terms must be accepted before uploading media';
  end if;

  select media_uploads_paused, cloudinary_usage_percent
  into uploads_paused, usage_percent
  from public.platform_settings where singleton = true
  for update;
  if uploads_paused or usage_percent >= 80 then
    raise exception using errcode = '55000', message = 'Media uploads are temporarily paused';
  end if;

  if p_event_id is not null and not exists (
    select 1 from public.events where id = p_event_id and status = 'published'
  ) and not public.can_manage_event(p_event_id) then
    raise exception using errcode = '42501', message = 'Event is unavailable';
  end if;

  if p_purpose not in ('user', 'professional', 'catalog') then
    raise exception using errcode = '22023', message = 'Invalid upload purpose';
  end if;

  if p_purpose in ('professional', 'catalog') then
    if p_subject_id is null or not public.can_manage_subject(p_subject_id) then
      raise exception using errcode = '42501', message = 'Entity management permission required';
    end if;
    select type, coalesce(artist_id, venue_place_id)
    into target_type, target_entity_id
    from public.subjects where id = p_subject_id and type in ('artist', 'venue');
    if target_type is null then
      raise exception using errcode = '22023', message = 'Professional uploads require an artist or venue';
    end if;
    selected_preset := case when p_purpose = 'catalog'
      then 'live_space_catalog_media' else 'live_space_professional_media' end;
    selected_folder := 'live-space/pilot/' ||
      case when target_type = 'artist' then 'artists/' else 'venues/' end || target_entity_id::text;
  else
    if p_subject_id is not null then
      raise exception using errcode = '22023', message = 'User uploads cannot target an entity folder';
    end if;
    selected_preset := 'live_space_user_media';
    selected_folder := 'live-space/pilot/users/' || requester::text ||
      case when p_event_id is null then '' else '/events/' || p_event_id::text end;
  end if;

  if p_kind = 'video' then
    perform pg_advisory_xact_lock(hashtextextended(requester::text || ':video-quota', 0));
    select count(*) into monthly_video_count
    from public.media_upload_reservations
    where user_id = requester
      and kind = 'video'
      and created_at >= date_trunc('month', now())
      and rejected_reason is null
      and (consumed_at is not null or expires_at > now());
    if monthly_video_count >= 10 then
      raise exception using errcode = '54000', message = 'Monthly video upload quota reached';
    end if;
    selected_max_bytes := 75000000;
    selected_max_duration := 45;
  else
    selected_max_bytes := 10000000;
    selected_max_duration := null;
  end if;

  insert into public.media_upload_reservations (
    id, user_id, kind, event_id, subject_id, upload_preset, folder,
    cloudinary_public_id, max_bytes, max_duration_seconds, expires_at
  ) values (
    new_id, requester, p_kind, p_event_id, p_subject_id, selected_preset, selected_folder,
    new_public_id, selected_max_bytes, selected_max_duration, new_expires_at
  );

  return query select new_id, new_public_id, selected_folder, selected_preset,
    selected_max_bytes, selected_max_duration, new_expires_at;
end;
$$;

revoke all on function public.reserve_media_upload(public.media_kind, uuid, uuid, text) from public;
grant execute on function public.reserve_media_upload(public.media_kind, uuid, uuid, text) to authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles', 'artists', 'venue_places', 'subjects', 'entity_memberships', 'events',
    'event_artists', 'songs', 'event_setlist_items', 'media_upload_reservations', 'media_assets',
    'posts', 'post_likes', 'follows', 'event_saves', 'event_attendance', 'user_blocks',
    'scrape_sources', 'scrape_runs', 'staging_events', 'entity_merge_history',
    'moderation_reports', 'moderation_actions', 'platform_settings'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

create policy profiles_read on public.profiles for select
  using (id = (select auth.uid()) or not is_private or public.current_user_is_staff());
create policy profiles_update_self on public.profiles for update
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy artists_read_published on public.artists for select
  using (status = 'published' or created_by = (select auth.uid()) or public.can_manage_artist(id) or public.current_user_is_staff());
create policy artists_create on public.artists for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy artists_manage on public.artists for update to authenticated
  using (public.can_manage_artist(id)) with check (public.can_manage_artist(id));

create policy venues_read_published on public.venue_places for select
  using (status = 'published' or created_by = (select auth.uid()) or public.can_manage_venue(id) or public.current_user_is_staff());
create policy venues_create on public.venue_places for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy venues_manage on public.venue_places for update to authenticated
  using (public.can_manage_venue(id)) with check (public.can_manage_venue(id));

create policy subjects_read on public.subjects for select
  using (
    profile_id = (select auth.uid())
    or public.can_manage_subject(id, true)
    or (type = 'user' and exists (select 1 from public.profiles p where p.id = profile_id and not p.is_private))
    or (type = 'artist' and exists (select 1 from public.artists a where a.id = artist_id and a.status = 'published'))
    or (type = 'venue' and exists (select 1 from public.venue_places v where v.id = venue_place_id and v.status = 'published'))
  );

create policy memberships_read on public.entity_memberships for select to authenticated
  using (profile_id = (select auth.uid()) or public.can_manage_subject(subject_id, true));
create policy memberships_create on public.entity_memberships for insert to authenticated
  with check (public.can_admin_subject(subject_id) and role <> 'owner');
create policy memberships_update on public.entity_memberships for update to authenticated
  using (public.can_admin_subject(subject_id) and role <> 'owner')
  with check (public.can_admin_subject(subject_id) and role <> 'owner');
create policy memberships_delete on public.entity_memberships for delete to authenticated
  using (public.can_admin_subject(subject_id) and role <> 'owner');

create policy events_read on public.events for select
  using (status = 'published' or created_by = (select auth.uid()) or public.can_manage_event(id) or public.current_user_is_staff());
create policy events_create on public.events for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (
      public.can_manage_venue(venue_place_id)
      or exists (
        select 1 from public.entity_memberships m
        where m.profile_id = (select auth.uid()) and m.role in ('owner', 'admin', 'editor')
      )
    )
  );
create policy events_manage on public.events for update to authenticated
  using (public.can_manage_event(id)) with check (public.can_manage_event(id));

create policy event_artists_read on public.event_artists for select
  using (exists (select 1 from public.events e where e.id = event_id));
create policy event_artists_manage_all on public.event_artists for all to authenticated
  using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));

create policy songs_read on public.songs for select using (true);
create policy songs_create on public.songs for insert to authenticated with check (true);
create policy songs_manage on public.songs for update to authenticated
  using (primary_artist_id is null or public.can_manage_artist(primary_artist_id) or public.current_user_is_staff())
  with check (primary_artist_id is null or public.can_manage_artist(primary_artist_id) or public.current_user_is_staff());

create policy setlist_read on public.event_setlist_items for select
  using (exists (select 1 from public.events e where e.id = event_id));
create policy setlist_manage_all on public.event_setlist_items for all to authenticated
  using (public.can_manage_event(event_id)) with check (public.can_manage_event(event_id));

create policy upload_reservations_read_own on public.media_upload_reservations for select to authenticated
  using (user_id = (select auth.uid()) or public.current_user_is_staff());

create policy media_read on public.media_assets for select
  using (status = 'published' or owner_id = (select auth.uid()) or public.current_user_is_staff());
create policy media_owner_soft_delete on public.media_assets for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()) and status = 'deleted' and deleted_at is not null);

create policy posts_read on public.posts for select
  using (
    (status = 'published' and not public.users_block_each_other(author_id, (select auth.uid())))
    or author_id = (select auth.uid()) or public.current_user_is_staff()
  );
create policy posts_create on public.posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.media_assets m where m.id = media_asset_id and m.owner_id = (select auth.uid()) and m.event_id = event_id)
  );
create policy posts_update_own on public.posts for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()) and status in ('draft', 'review', 'archived'));
create policy posts_delete_own on public.posts for delete to authenticated using (author_id = (select auth.uid()));

create policy likes_read on public.post_likes for select
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy likes_insert_own on public.post_likes for insert to authenticated
  with check (profile_id = (select auth.uid()));
create policy likes_delete_own on public.post_likes for delete to authenticated
  using (profile_id = (select auth.uid()));

create policy follows_read on public.follows for select
  using (follower_subject_id = public.current_user_subject_id() or target_subject_id = public.current_user_subject_id());
create policy follows_insert_own on public.follows for insert to authenticated
  with check (follower_subject_id = public.current_user_subject_id());
create policy follows_delete_own on public.follows for delete to authenticated
  using (follower_subject_id = public.current_user_subject_id());

create policy saves_own_all on public.event_saves for all to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy attendance_read on public.event_attendance for select
  using (profile_id = (select auth.uid()) or public.can_manage_event(event_id) or public.current_user_is_staff());
create policy attendance_own_write on public.event_attendance for all to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy blocks_own_all on public.user_blocks for all to authenticated
  using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));

create policy reports_create on public.moderation_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy reports_read on public.moderation_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or public.current_user_is_staff());
create policy reports_staff_update on public.moderation_reports for update to authenticated
  using (public.current_user_is_staff()) with check (public.current_user_is_staff());
create policy moderation_actions_staff_read on public.moderation_actions for select to authenticated
  using (public.current_user_is_staff());
create policy moderation_actions_staff_insert on public.moderation_actions for insert to authenticated
  with check (public.current_user_is_staff() and actor_id = (select auth.uid()));

create policy sources_staff on public.scrape_sources for all to authenticated
  using (public.current_user_is_staff()) with check (public.current_user_is_staff());
create policy runs_staff on public.scrape_runs for all to authenticated
  using (public.current_user_is_staff()) with check (public.current_user_is_staff());
create policy staging_staff on public.staging_events for all to authenticated
  using (public.current_user_is_staff()) with check (public.current_user_is_staff());
create policy merge_history_staff on public.entity_merge_history for all to authenticated
  using (public.current_user_is_staff()) with check (public.current_user_is_staff());
create policy platform_settings_staff_read on public.platform_settings for select to authenticated
  using (public.current_user_is_staff());
create policy platform_settings_admin_update on public.platform_settings for update to authenticated
  using (public.current_user_is_admin()) with check (public.current_user_is_admin());

grant usage on schema public to anon, authenticated, service_role;
grant select on public.profiles, public.subjects, public.artists, public.venue_places, public.events,
  public.event_artists, public.songs, public.event_setlist_items, public.media_assets, public.posts, public.post_likes
  to anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.artists, public.venue_places, public.events, public.songs, public.posts to authenticated;
grant select, insert, update, delete on public.entity_memberships, public.event_artists,
  public.event_setlist_items, public.post_likes, public.follows, public.event_saves,
  public.event_attendance, public.user_blocks to authenticated;
grant select on public.subjects, public.media_upload_reservations to authenticated;
grant update on public.media_assets to authenticated;
grant select, insert, update on public.moderation_reports to authenticated;
grant select, insert on public.moderation_actions to authenticated;
grant select, insert, update, delete on public.scrape_sources,
  public.scrape_runs, public.staging_events, public.entity_merge_history, public.platform_settings to authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

revoke all on function public.set_updated_at() from public;
revoke all on function public.handle_new_user() from public;
revoke all on function public.create_subject_for_entity() from public;
revoke all on function public.prevent_profile_privilege_escalation() from public;

commit;
