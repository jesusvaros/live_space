begin;

-- Product photos for merch, in a public Supabase Storage bucket.
--
-- The app compresses the photo (~1200 px WebP or JPEG) and uploads it straight
-- to merch-photos/<seller subject id>/<uuid>.<ext>; merch_items.image_url keeps
-- the public URL. Only people who can sell for that artist or venue
-- (merch_can_sell) may write under its folder. No edge function involved.
--
-- Defensive: if the storage schema is missing or this role may not add
-- policies on storage.objects, the migration only warns (see docs/merch.md
-- for the manual step) instead of blocking the other migrations.

create or replace function public.merch_photo_path_ok(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_folder text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if v_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  if coalesce(p_name, '') !~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(webp|jpg|jpeg|png)$' then
    return false;
  end if;
  return public.merch_can_sell(v_folder::uuid);
end;
$$;

revoke all on function public.merch_photo_path_ok(text) from public;
grant execute on function public.merch_photo_path_ok(text) to authenticated, service_role;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise warning 'merch-photos: storage schema not found, bucket not created';
    return;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types'
  ) then
    execute $sql$
      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('merch-photos', 'merch-photos', true, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
      on conflict (id) do nothing
    $sql$;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'storage' and table_name = 'buckets' and column_name = 'public'
  ) then
    execute $sql$
      insert into storage.buckets (id, name, public) values ('merch-photos', 'merch-photos', true)
      on conflict (id) do nothing
    $sql$;
  else
    execute $sql$
      insert into storage.buckets (id, name) values ('merch-photos', 'merch-photos')
      on conflict (id) do nothing
    $sql$;
  end if;

  begin
    execute 'drop policy if exists merch_photos_insert on storage.objects';
    execute 'drop policy if exists merch_photos_update on storage.objects';
    execute 'drop policy if exists merch_photos_delete on storage.objects';
    execute $sql$
      create policy merch_photos_insert on storage.objects for insert to authenticated
        with check (bucket_id = 'merch-photos' and public.merch_photo_path_ok(name))
    $sql$;
    execute $sql$
      create policy merch_photos_update on storage.objects for update to authenticated
        using (bucket_id = 'merch-photos' and public.merch_photo_path_ok(name))
        with check (bucket_id = 'merch-photos' and public.merch_photo_path_ok(name))
    $sql$;
    execute $sql$
      create policy merch_photos_delete on storage.objects for delete to authenticated
        using (bucket_id = 'merch-photos' and public.merch_photo_path_ok(name))
    $sql$;
  exception when insufficient_privilege then
    raise warning 'merch-photos: could not create storage policies (%), add them by hand', sqlerrm;
  end;
end;
$$;

commit;

notify pgrst, 'reload schema';
