begin;

-- «Tu entrada»: each fan can keep the ticket for a concert they are going to
-- (screenshot, photo or PDF) in a PRIVATE bucket, so it is at hand at the
-- door. Path: tickets/<user id>/<event id>/<random>.<ext>. Only the owner
-- reads, writes or deletes it; new uploads only for concerts that have not
-- happened yet (up to 6 h after doors). Nobody else, not even other fans or
-- the venue, can list or open it.

create or replace function public.ticket_path_ok(p_name text, p_for_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user text := split_part(coalesce(p_name, ''), '/', 1);
  v_event text := split_part(coalesce(p_name, ''), '/', 2);
begin
  if auth.uid() is null or v_user <> auth.uid()::text then
    return false;
  end if;
  if not p_for_write then
    return true;
  end if;
  if coalesce(p_name, '') !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp|heic|pdf)$' then
    return false;
  end if;
  return exists (
    select 1 from public.events e
    where e.id = v_event::uuid and e.starts_at > now() - interval '6 hours'
  );
end;
$$;

revoke all on function public.ticket_path_ok(text, boolean) from public;
grant execute on function public.ticket_path_ok(text, boolean) to authenticated, service_role;

do $$
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise warning 'tickets: storage schema not found, bucket not created';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('tickets', 'tickets', false, 10485760,
          array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
  on conflict (id) do update set public = false;

  begin
    execute 'drop policy if exists tickets_select on storage.objects';
    execute 'drop policy if exists tickets_insert on storage.objects';
    execute 'drop policy if exists tickets_delete on storage.objects';
    execute $sql$
      create policy tickets_select on storage.objects for select to authenticated
        using (bucket_id = 'tickets' and public.ticket_path_ok(name, false))
    $sql$;
    execute $sql$
      create policy tickets_insert on storage.objects for insert to authenticated
        with check (bucket_id = 'tickets' and public.ticket_path_ok(name, true))
    $sql$;
    execute $sql$
      create policy tickets_delete on storage.objects for delete to authenticated
        using (bucket_id = 'tickets' and public.ticket_path_ok(name, false))
    $sql$;
  exception when insufficient_privilege then
    raise warning 'tickets: could not create storage policies (%), add them by hand', sqlerrm;
  end;
end;
$$;

commit;
