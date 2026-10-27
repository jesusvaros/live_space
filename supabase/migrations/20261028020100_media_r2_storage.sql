begin;

-- Cloudflare R2 as a second storage for fan videos (see docs/media.md).
-- Additive only: every existing row keeps storage_provider = 'cloudinary' and
-- nothing changes until an admin sets platform_settings.video_provider = 'r2'
-- (or the Edge Functions get VIDEO_PROVIDER=r2) and the R2 secrets exist.
-- RLS is unchanged: the new columns live on tables whose policies already
-- cover them (owners read their own reservations; media follows media_read).

alter table public.platform_settings
  add column if not exists video_provider text not null default 'cloudinary'
    constraint platform_settings_video_provider_check check (video_provider in ('cloudinary', 'r2'));

comment on column public.platform_settings.video_provider is
  'Where new fan videos are stored: cloudinary (default) or r2. Images always use Cloudinary.';

alter table public.media_upload_reservations
  add column if not exists storage_provider text not null default 'cloudinary'
    constraint media_upload_reservations_storage_provider_check check (storage_provider in ('cloudinary', 'r2')),
  add column if not exists storage_key text,
  add column if not exists content_type text,
  add column if not exists expected_bytes bigint
    constraint media_upload_reservations_expected_bytes_check check (expected_bytes is null or expected_bytes > 0),
  add column if not exists r2_upload_id text;

create unique index if not exists media_upload_reservations_storage_key_key
  on public.media_upload_reservations (storage_key)
  where storage_key is not null;

comment on column public.media_upload_reservations.storage_provider is
  'cloudinary: signed upload + webhook. r2: presigned PUT/multipart + media-r2-complete.';
comment on column public.media_upload_reservations.storage_key is
  'R2 object key, v/<yyyy>/<mm>/<uuid>.<ext>. The uuid is cloudinary_public_id.';
comment on column public.media_upload_reservations.expected_bytes is
  'Size the client declared; media-r2-complete requires the stored object to match it.';
comment on column public.media_upload_reservations.r2_upload_id is
  'S3 multipart UploadId for files over 10 MB.';

alter table public.media_assets
  add column if not exists storage_provider text not null default 'cloudinary'
    constraint media_assets_storage_provider_check check (storage_provider in ('cloudinary', 'r2')),
  add column if not exists storage_key text;

create unique index if not exists media_assets_storage_key_key
  on public.media_assets (storage_key)
  where storage_key is not null;

comment on column public.media_assets.storage_provider is
  'cloudinary or r2. For r2, secure_url is R2_PUBLIC_BASE_URL/storage_key and cloudinary_public_id keeps the reservation uuid.';
comment on column public.media_assets.storage_key is 'R2 object key when storage_provider = r2.';

commit;
