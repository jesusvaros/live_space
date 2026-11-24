begin;

-- Sign-up asks for nothing but the account itself (Google, Apple or email):
-- every new profile gets a free @username on its own, built from the name
-- the provider sends or the part of the email before the @ (lowercase
-- letters, digits and «_»), plus a few digits when it is already taken.
-- People change it later in Ajustes. Also fills the profiles that have none.

create or replace function public.generate_username(p_base text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_candidate text;
  v_try int := 0;
begin
  v_base := lower(coalesce(p_base, ''));
  v_base := translate(v_base, 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc');
  v_base := regexp_replace(v_base, '[^a-z0-9_]+', '', 'g');
  v_base := left(v_base, 20);
  if char_length(v_base) < 3 then
    v_base := 'fan' || v_base;
  end if;

  v_candidate := v_base;
  while exists (select 1 from public.profiles where lower(username::text) = v_candidate) loop
    v_try := v_try + 1;
    v_candidate := v_base || (floor(random() * (case when v_try < 5 then 1000 else 1000000 end))::int)::text;
    if v_try > 20 then
      v_candidate := v_base || replace(left(extensions.gen_random_uuid()::text, 8), '-', '');
      exit;
    end if;
  end loop;
  return v_candidate;
end;
$$;

revoke all on function public.generate_username(text) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := nullif(new.raw_user_meta_data ->> 'username', '');
begin
  if v_username is null or exists (select 1 from public.profiles where lower(username::text) = lower(v_username)) then
    v_username := public.generate_username(coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ));
  end if;

  insert into public.profiles (id, username, display_name, avatar_url, primary_city)
  values (
    new.id,
    v_username,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', '')
    ),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
      nullif(new.raw_user_meta_data ->> 'picture', '')
    ),
    nullif(new.raw_user_meta_data ->> 'primary_city', '')
  );
  return new;
end;
$$;

-- Profiles created before this (Google sign-ins) without a @username.
-- One row at a time, so each new name sees the ones just given.
do $$
declare
  r record;
begin
  for r in
    select p.id, coalesce(nullif(p.display_name, ''), split_part(coalesce(u.email, ''), '@', 1)) as base
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.username is null
  loop
    update public.profiles set username = public.generate_username(r.base) where id = r.id;
  end loop;
end;
$$;

commit;
