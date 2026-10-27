begin;

-- Licence of a fan moment (docs/legal/licencia-momentos.md, pending legal
-- review). The post owns the licence because the post is what the fan
-- publishes; one media asset belongs to one post.
--
-- allow_reuse = true lets the artists and the venue of the event reuse the
-- moment crediting the author. The credit is derived from the username at
-- read time (reuse_credit), so a renamed account is credited by its
-- current name.

alter table public.posts
  add column if not exists allow_reuse boolean not null default true;

comment on column public.posts.allow_reuse is
  'Author lets the event artists and venue reuse this moment with credit (licencia-momentos.md).';

-- "@username", or the display name when the profile has no username yet.
create or replace function public.reuse_credit(p_profile_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce('@' || nullif(p.username::text, ''), nullif(p.display_name, ''), 'Live Space')
  from public.profiles p where p.id = p_profile_id;
$$;

-- What the post detail needs to render the licence controls. Never exposes
-- more than the public post already shows (author credit, media URL).
--   allow_reuse   current licence
--   is_owner      caller is the author (may toggle)
--   can_download  caller manages the event artist or venue AND reuse is on
--   credit, artist_name, event_date, media_url, resource_type, format:
--                 only when can_download, to name the downloaded file
create or replace function public.get_moment_licence(p_post_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_post record;
  v_is_owner boolean;
  v_can_download boolean;
  v_artist text;
begin
  select p.id, p.author_id, p.event_id, p.status, p.allow_reuse,
    m.secure_url, m.resource_type, m.format, m.status as media_status, m.deleted_at,
    e.starts_at, e.name as event_name
  into v_post
  from public.posts p
  join public.media_assets m on m.id = p.media_asset_id
  join public.events e on e.id = p.event_id
  where p.id = p_post_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Moment not found';
  end if;

  v_is_owner := v_uid is not null and v_post.author_id = v_uid;

  -- Same visibility as posts_read: published and not blocked, or own.
  if not v_is_owner and not (
    v_post.status = 'published'
    and not public.users_block_each_other(v_post.author_id, v_uid)
  ) and not public.current_user_is_staff() then
    raise exception using errcode = 'P0002', message = 'Moment not found';
  end if;

  v_can_download := v_uid is not null
    and v_post.allow_reuse
    and v_post.status = 'published'
    and v_post.media_status = 'published'
    and v_post.deleted_at is null
    and public.is_event_entity_member(v_post.event_id);

  if not v_can_download then
    return jsonb_build_object(
      'post_id', v_post.id,
      'allow_reuse', v_post.allow_reuse,
      'is_owner', v_is_owner,
      'can_download', false
    );
  end if;

  select a.name into v_artist
  from public.event_artists ea
  join public.artists a on a.id = ea.artist_id
  where ea.event_id = v_post.event_id
  order by ea.is_headliner desc, ea.billing_order, a.name
  limit 1;

  return jsonb_build_object(
    'post_id', v_post.id,
    'allow_reuse', v_post.allow_reuse,
    'is_owner', v_is_owner,
    'can_download', true,
    'credit', public.reuse_credit(v_post.author_id),
    'artist_name', coalesce(v_artist, v_post.event_name),
    'event_date', (v_post.starts_at at time zone 'Europe/Madrid')::date,
    'media_url', v_post.secure_url,
    'resource_type', v_post.resource_type,
    'format', v_post.format
  );
end;
$$;

-- The author toggles the licence of one moment. posts_update_own only lets
-- an author edit non-published posts, so this narrow function changes this
-- single column on a published one too.
create or replace function public.set_moment_allow_reuse(p_post_id uuid, p_allow_reuse boolean)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_result boolean;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_allow_reuse is null then
    raise exception using errcode = '22004', message = 'allow_reuse cannot be null';
  end if;

  update public.posts
  set allow_reuse = p_allow_reuse
  where id = p_post_id and author_id = auth.uid()
  returning allow_reuse into v_result;

  if v_result is null then
    raise exception using errcode = '42501', message = 'Only the author can change the licence of a moment';
  end if;
  return v_result;
end;
$$;

revoke all on function public.reuse_credit(uuid) from public;
revoke all on function public.get_moment_licence(uuid) from public;
revoke all on function public.set_moment_allow_reuse(uuid, boolean) from public;
-- Internal helper: callable by the definer functions above, not by clients
-- (it would reveal the username of private profiles).
grant execute on function public.reuse_credit(uuid) to service_role;
grant execute on function public.get_moment_licence(uuid) to anon, authenticated, service_role;
grant execute on function public.set_moment_allow_reuse(uuid, boolean) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
