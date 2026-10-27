-- Where a setlist item came from. Additive only.
--
-- 'manual'    written by a manager in the app (default, and what every
--             existing row is).
-- 'setlistfm' inserted by the pipeline fallback (src/pipeline/setlistFmFallback.ts)
--             into an empty setlist. setlist.fm's terms require a link back,
--             kept per item in source_url.
--
-- The fallback never updates or deletes rows, so a manual setlist is never
-- overwritten; when a manager saves a setlist the app replaces the rows and
-- they become 'manual'.

alter table public.event_setlist_items
  add column if not exists source text not null default 'manual',
  add column if not exists source_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_setlist_items_source_check'
      and conrelid = 'public.event_setlist_items'::regclass
  ) then
    alter table public.event_setlist_items
      add constraint event_setlist_items_source_check
      check (source in ('manual', 'setlistfm'));
  end if;
end $$;

comment on column public.event_setlist_items.source is
  'manual (manager) or setlistfm (pipeline fallback; show attribution)';
comment on column public.event_setlist_items.source_url is
  'Page of the setlist on its source, for attribution';
