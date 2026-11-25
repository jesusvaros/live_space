-- Photo limits per person: at most 100 photos per concert and 300 per day
-- (videos keep their 10 a month). Counted like the video quota: reservations
-- that were used or are still open, never rejected ones. Professional and
-- catalog uploads (artists, venues) are not limited here.

create index if not exists media_upload_reservations_user_kind_created_idx
  on public.media_upload_reservations (user_id, kind, created_at desc);

CREATE OR REPLACE FUNCTION public.reserve_media_upload(p_kind media_kind, p_event_id uuid DEFAULT NULL::uuid, p_subject_id uuid DEFAULT NULL::uuid, p_purpose text DEFAULT 'user'::text)
 RETURNS TABLE(reservation_id uuid, cloudinary_public_id text, folder text, upload_preset text, max_bytes bigint, max_duration_seconds integer, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  event_photo_count integer;
  daily_photo_count integer;
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
    if p_purpose = 'user' then
      perform pg_advisory_xact_lock(hashtextextended(requester::text || ':photo-quota', 0));
      if p_event_id is not null then
        select count(*) into event_photo_count
        from public.media_upload_reservations reservation
        where user_id = requester
          and kind = 'image'
          and event_id = p_event_id
          and subject_id is null
          and rejected_reason is null
          and (consumed_at is not null or reservation.expires_at > now());
        if event_photo_count >= 100 then
          raise exception using errcode = '54000', message = 'Photo limit per concert reached';
        end if;
      end if;
      select count(*) into daily_photo_count
      from public.media_upload_reservations reservation
      where user_id = requester
        and kind = 'image'
        and subject_id is null
        and created_at >= now() - interval '24 hours'
        and rejected_reason is null
        and (consumed_at is not null or reservation.expires_at > now());
      if daily_photo_count >= 300 then
        raise exception using errcode = '54000', message = 'Daily photo upload quota reached';
      end if;
    end if;
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
$function$;
