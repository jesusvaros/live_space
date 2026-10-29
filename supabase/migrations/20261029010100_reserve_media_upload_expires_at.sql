begin;

-- reserve_media_upload returns a column named expires_at, so the unqualified
-- expires_at in the monthly video quota query was ambiguous and every video
-- reservation failed. Same function, with the table column qualified.

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
    from public.media_upload_reservations reservation
    where user_id = requester
      and kind = 'video'
      and created_at >= date_trunc('month', now())
      and rejected_reason is null
      and (consumed_at is not null or reservation.expires_at > now());
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

commit;
