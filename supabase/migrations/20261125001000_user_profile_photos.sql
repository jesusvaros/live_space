-- Users can set their own profile photo: the profile-photos bucket also
-- accepts files under a folder named after the user's id (until now only
-- folders of subjects the user manages, i.e. artists and venues).
create or replace function public.profile_photo_path_ok(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_folder text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if coalesce(p_name, '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9_-]{1,64}\.(webp|jpg|jpeg|png)$' then
    return false;
  end if;
  return v_folder::uuid = (select auth.uid()) or public.can_manage_subject(v_folder::uuid);
end;
$$;
