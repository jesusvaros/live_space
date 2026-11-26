-- New moments reach open screens without reloading (src/features/moments/livePosts.ts).
--
-- The app listens to INSERTs on public.posts through Supabase Realtime. Realtime
-- checks the table's RLS for every listener (posts_read: published posts, minus
-- people who block each other; your own; staff), so nobody receives a row they
-- could not read anyway. Uploads are published by the BEFORE INSERT trigger
-- posts_publish_uploads, so the inserted row already says 'published'.

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'posts'
  ) then
    alter publication supabase_realtime add table public.posts;
  end if;
end
$$;
