begin;

-- Moments go live as soon as they are uploaded; the community reports what
-- should not be there. Nobody approves uploads one by one: as a host we act
-- on notice (remove what is reported) instead of reviewing everything first.
--
-- 1. A post created from an upload enters as 'published', and so does its
--    media asset (the read models need both).
-- 2. Three different people reporting the same post move it back to
--    'review', which hides it until staff look at the reports.

create or replace function public.publish_uploaded_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source = 'upload' and new.media_asset_id is not null then
    new.status := 'published';
    update public.media_assets
    set status = 'published', updated_at = now()
    where id = new.media_asset_id
      and status = 'pending_review';
  end if;
  return new;
end;
$$;

revoke all on function public.publish_uploaded_post() from public;

drop trigger if exists posts_publish_uploads on public.posts;
create trigger posts_publish_uploads
before insert on public.posts
for each row execute function public.publish_uploaded_post();

create or replace function public.hide_reported_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporters integer;
begin
  if new.target_type <> 'post' then
    return new;
  end if;
  select count(distinct reporter_id) into reporters
  from public.moderation_reports
  where target_type = 'post'
    and target_id = new.target_id
    and status in ('open', 'reviewing');
  if reporters >= 3 then
    update public.posts
    set status = 'review', updated_at = now()
    where id = new.target_id
      and status = 'published';
  end if;
  return new;
end;
$$;

revoke all on function public.hide_reported_post() from public;

drop trigger if exists moderation_reports_hide_post on public.moderation_reports;
create trigger moderation_reports_hide_post
after insert on public.moderation_reports
for each row execute function public.hide_reported_post();

-- One open report per person and post: reporting twice must not count twice
-- (the count above is distinct anyway) nor flood the queue.
create unique index if not exists moderation_reports_one_open_per_reporter
  on public.moderation_reports (reporter_id, target_type, target_id)
  where status in ('open', 'reviewing');

-- Uploads waiting from before this change.
update public.media_assets m
set status = 'published', updated_at = now()
from public.posts p
where p.media_asset_id = m.id
  and p.source = 'upload'
  and p.status = 'review'
  and m.status = 'pending_review';

update public.posts
set status = 'published', updated_at = now()
where source = 'upload'
  and status = 'review'
  and media_asset_id is not null;

commit;
