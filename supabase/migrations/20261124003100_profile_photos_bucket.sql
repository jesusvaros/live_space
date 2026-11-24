begin;

-- Photos that artists and venues upload from «Mi perfil», in a public bucket.
-- Path: profile-photos/<subject id>/<uuid>.<ext>. Only people who manage that
-- artist or venue (owner/admin/editor) may write under its folder. The app
-- stores the public URL in artists.image_url / venue_places.image_url with
-- image_source = 'manual', which the read models put first and the image
-- enrichment never overwrites.

create or replace function public.profile_photo_path_ok(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_folder text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if coalesce(p_name, '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{1,64}\.(webp|jpg|jpeg|png)$' then
    return false;
  end if;
  return public.can_manage_subject(v_folder::uuid);
end;
$$;

revoke all on function public.profile_photo_path_ok(text) from public;
grant execute on function public.profile_photo_path_ok(text) to authenticated, service_role;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise warning 'profile-photos: storage schema not found, bucket not created';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('profile-photos', 'profile-photos', true, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
  on conflict (id) do nothing;

  begin
    execute 'drop policy if exists profile_photos_insert on storage.objects';
    execute 'drop policy if exists profile_photos_update on storage.objects';
    execute 'drop policy if exists profile_photos_delete on storage.objects';
    execute $sql$
      create policy profile_photos_insert on storage.objects for insert to authenticated
        with check (bucket_id = 'profile-photos' and public.profile_photo_path_ok(name))
    $sql$;
    execute $sql$
      create policy profile_photos_update on storage.objects for update to authenticated
        using (bucket_id = 'profile-photos' and public.profile_photo_path_ok(name))
        with check (bucket_id = 'profile-photos' and public.profile_photo_path_ok(name))
    $sql$;
    execute $sql$
      create policy profile_photos_delete on storage.objects for delete to authenticated
        using (bucket_id = 'profile-photos' and public.profile_photo_path_ok(name))
    $sql$;
  exception when insufficient_privilege then
    raise warning 'profile-photos: could not create storage policies (%), add them by hand', sqlerrm;
  end;
end;
$$;

commit;

notify pgrst, 'reload schema';
