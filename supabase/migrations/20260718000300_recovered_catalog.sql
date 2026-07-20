begin;

-- The legacy catalog is public, non-auth data. UUIDs are preserved solely as
-- provenance; profiles, sessions, credentials and legacy Storage rows are not
-- imported. Every candidate remains in review until current identity is checked.
insert into public.artists (
  id, name, normalized_name, artist_type, country_code, external_ids, status, created_at, updated_at
)
values
  ('94d942d0-59fb-4920-9c6d-379927ba9ae3', 'Taylor Swift', 'taylor swift', 'solo', 'ZZ', '{"legacy_live_space_id":"94d942d0-59fb-4920-9c6d-379927ba9ae3","legacy_slug":"taylor-swift"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00'),
  ('80f8213f-e0ef-4265-bcd3-3bc2d9a8d2b8', 'Bad Bunny', 'bad bunny', 'solo', 'ZZ', '{"legacy_live_space_id":"80f8213f-e0ef-4265-bcd3-3bc2d9a8d2b8","legacy_slug":"bad-bunny"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00'),
  ('a310aa65-b6d7-4f5d-869e-aeecfd49a481', 'Coldplay', 'coldplay', 'band', 'ZZ', '{"legacy_live_space_id":"a310aa65-b6d7-4f5d-869e-aeecfd49a481","legacy_slug":"coldplay"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00'),
  ('822f6e8e-4991-4674-b095-6d1d451f3e1a', 'Rosalía', 'rosalia', 'solo', 'ZZ', '{"legacy_live_space_id":"822f6e8e-4991-4674-b095-6d1d451f3e1a","legacy_slug":"rosalia"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00'),
  ('5b04254c-79e3-4372-8496-729ca14ef699', 'The Weeknd', 'the weeknd', 'solo', 'ZZ', '{"legacy_live_space_id":"5b04254c-79e3-4372-8496-729ca14ef699","legacy_slug":"the-weeknd"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00'),
  ('5a0c3071-8a1f-4f89-9118-e997b5c1c4a1', 'Dua Lipa', 'dua lipa', 'solo', 'ZZ', '{"legacy_live_space_id":"5a0c3071-8a1f-4f89-9118-e997b5c1c4a1","legacy_slug":"dua-lipa"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00'),
  ('4928054f-eefa-42e0-8965-57997833d7c7', 'Ed Sheeran', 'ed sheeran', 'solo', 'ZZ', '{"legacy_live_space_id":"4928054f-eefa-42e0-8965-57997833d7c7","legacy_slug":"ed-sheeran"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00'),
  ('2bc01871-9bd6-4a38-831f-f6fc74a62254', 'Beyoncé', 'beyonce', 'solo', 'ZZ', '{"legacy_live_space_id":"2bc01871-9bd6-4a38-831f-f6fc74a62254","legacy_slug":"beyonce"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00'),
  ('889ec863-b792-4fd7-8180-387d41a43f70', 'Drake', 'drake', 'solo', 'ZZ', '{"legacy_live_space_id":"889ec863-b792-4fd7-8180-387d41a43f70","legacy_slug":"drake"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00'),
  ('eab715cf-45aa-4b09-9ee9-05cda09e0623', 'Billie Eilish', 'billie eilish', 'solo', 'ZZ', '{"legacy_live_space_id":"eab715cf-45aa-4b09-9ee9-05cda09e0623","legacy_slug":"billie-eilish"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00')
on conflict (normalized_name, country_code) where status <> 'archived'
do update set external_ids = public.artists.external_ids || excluded.external_ids;

insert into public.venue_places (
  id, name, normalized_name, city, country_code, latitude, longitude,
  external_ids, status, created_at, updated_at
)
values
  ('da2559fe-edc5-4a62-abb5-2494ca5bad75', 'Estadio Santiago Bernabéu', 'estadio santiago bernabeu', 'Madrid', 'ES', 40.45305400, -3.68834400, '{"legacy_live_space_id":"da2559fe-edc5-4a62-abb5-2494ca5bad75","legacy_slug":"estadio-santiago-bernabeu"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00'),
  ('5f19f417-4f4e-4ec4-b10b-2be6c321d88f', 'Camp Nou', 'camp nou', 'Barcelona', 'ES', 41.38089600, 2.12282000, '{"legacy_live_space_id":"5f19f417-4f4e-4ec4-b10b-2be6c321d88f","legacy_slug":"camp-nou"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00'),
  ('93b8ee12-2959-48a4-bbfb-b7102a0dd34d', 'WiZink Center', 'wizink center', 'Madrid', 'ES', 40.42237100, -3.66705000, '{"legacy_live_space_id":"93b8ee12-2959-48a4-bbfb-b7102a0dd34d","legacy_slug":"wizink-center"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00'),
  ('01877e6a-2d91-498e-b35a-32dcb5cfcff7', 'Palau Sant Jordi', 'palau sant jordi', 'Barcelona', 'ES', 41.36455600, 2.15361100, '{"legacy_live_space_id":"01877e6a-2d91-498e-b35a-32dcb5cfcff7","legacy_slug":"palau-sant-jordi"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00'),
  ('88974d95-5d05-4d59-bc6c-aa3679198739', 'Estadio Wanda Metropolitano', 'estadio wanda metropolitano', 'Madrid', 'ES', 40.43611100, -3.59944400, '{"legacy_live_space_id":"88974d95-5d05-4d59-bc6c-aa3679198739","legacy_slug":"estadio-wanda-metropolitano"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00'),
  ('abcfba2d-f676-4313-8b58-7af1d9596003', 'Palacio de los Deportes', 'palacio de los deportes', 'Madrid', 'ES', 40.39777800, -3.66888900, '{"legacy_live_space_id":"abcfba2d-f676-4313-8b58-7af1d9596003","legacy_slug":"palacio-de-los-deportes"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00'),
  ('126e54fd-195b-46e7-bb6e-65be16d74569', 'RCDE Stadium', 'rcde stadium', 'Barcelona', 'ES', 41.34777800, 2.07555600, '{"legacy_live_space_id":"126e54fd-195b-46e7-bb6e-65be16d74569","legacy_slug":"rcde-stadium"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00'),
  ('3e0f2ca7-43e7-4e8c-8953-595ec6b499a6', 'Estadio de La Cartuja', 'estadio de la cartuja', 'Sevilla', 'ES', 37.40555600, -5.97833300, '{"legacy_live_space_id":"3e0f2ca7-43e7-4e8c-8953-595ec6b499a6","legacy_slug":"estadio-de-la-cartuja"}', 'review', '2025-12-02 17:16:15.360471+00', '2025-12-02 17:16:15.360471+00')
on conflict (normalized_name, city, country_code) where status <> 'archived'
do update set external_ids = public.venue_places.external_ids || excluded.external_ids;

create table if not exists public.recovered_media_quarantine (
  id uuid primary key default extensions.gen_random_uuid(),
  source_archive_sha256 text not null,
  checksum text not null unique check (checksum ~ '^[a-f0-9]{64}$'),
  bytes bigint not null check (bytes > 0),
  kind public.media_kind not null,
  extension text not null,
  source_categories text[] not null default '{}',
  occurrence_count integer not null check (occurrence_count > 0),
  review_status public.review_status not null default 'pending',
  quarantine_reason text not null,
  cloudinary_public_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists recovered_media_quarantine_set_updated_at
  on public.recovered_media_quarantine;
create trigger recovered_media_quarantine_set_updated_at
before update on public.recovered_media_quarantine
for each row execute function public.set_updated_at();

alter table public.recovered_media_quarantine enable row level security;
drop policy if exists recovered_media_staff_read on public.recovered_media_quarantine;
create policy recovered_media_staff_read on public.recovered_media_quarantine
  for select to authenticated using (public.current_user_is_staff());
drop policy if exists recovered_media_staff_update on public.recovered_media_quarantine;
create policy recovered_media_staff_update on public.recovered_media_quarantine
  for update to authenticated using (public.current_user_is_staff())
  with check (public.current_user_is_staff());

grant select, update on public.recovered_media_quarantine to authenticated;
grant all on public.recovered_media_quarantine to service_role;

insert into public.recovered_media_quarantine (
  source_archive_sha256, checksum, bytes, kind, extension, source_categories,
  occurrence_count, quarantine_reason
)
values
  ('320aef4f8224307350e802855ab589e659cbd80cd8cd0b64667d3caeff685593', '0db9a069f43cf92e950b8aa895802bdb7459d40144ae3420f2185a00cdb4c59b', 16689, 'image', '.jpg', array['thumbnail'], 2, 'ownership_event_and_license_unverified'),
  ('320aef4f8224307350e802855ab589e659cbd80cd8cd0b64667d3caeff685593', '15fd48457d8d24c216d32dde81ae8e5ee300f765869f40aa174428205fd39193', 2894516, 'video', '.mp4', array['video'], 2, 'ownership_event_and_license_unverified'),
  ('320aef4f8224307350e802855ab589e659cbd80cd8cd0b64667d3caeff685593', '2ddf893b2c532d88bad163664ddda82ad9348f1a4469ac628b2f7bbbcabfc348', 1315144, 'image', '.png', array['image'], 1, 'ownership_event_and_license_unverified'),
  ('320aef4f8224307350e802855ab589e659cbd80cd8cd0b64667d3caeff685593', '5f77f001de3661a4d2abf97f273de3334ed4d08af36b665df084b640d99ff3f3', 1984741, 'video', '.mp4', array['video'], 2, 'ownership_event_and_license_unverified'),
  ('320aef4f8224307350e802855ab589e659cbd80cd8cd0b64667d3caeff685593', '66876cfb278a7c61bbd5f9c4ab80d9bc381fe661c0efe1977ac4461f3c30c512', 160653, 'image', '.jpg', array['thumbnail'], 2, 'ownership_event_and_license_unverified'),
  ('320aef4f8224307350e802855ab589e659cbd80cd8cd0b64667d3caeff685593', '86f2d0eaf1765aedf650a33bcd77b5d8edfa9efb11c29082051564407a0afcc5', 29493, 'image', '.jpg', array['image'], 1, 'ownership_event_and_license_unverified'),
  ('320aef4f8224307350e802855ab589e659cbd80cd8cd0b64667d3caeff685593', 'b9adf1921577de8647cbeaf638d0d92a5665610ba697c8fbaf203bb920f5ac24', 50783376, 'video', '.mp4', array['video'], 2, 'ownership_event_and_license_unverified'),
  ('320aef4f8224307350e802855ab589e659cbd80cd8cd0b64667d3caeff685593', 'd7abda928fe9f35eca3771930c2e16560e96310c6e0341ceb981928319b390aa', 47734, 'image', '.jpg', array['event-poster'], 1, 'ownership_event_and_license_unverified')
on conflict (checksum) do update set
  bytes = excluded.bytes,
  kind = excluded.kind,
  extension = excluded.extension,
  source_categories = excluded.source_categories,
  occurrence_count = excluded.occurrence_count,
  quarantine_reason = excluded.quarantine_reason;

do $$
declare
  recovered_artist_count integer;
  recovered_venue_count integer;
  recovered_media_count integer;
begin
  select count(*) into recovered_artist_count
  from public.artists where external_ids ? 'legacy_live_space_id';
  select count(*) into recovered_venue_count
  from public.venue_places where external_ids ? 'legacy_live_space_id';
  select count(*) into recovered_media_count
  from public.recovered_media_quarantine
  where source_archive_sha256 = '320aef4f8224307350e802855ab589e659cbd80cd8cd0b64667d3caeff685593';

  if recovered_artist_count <> 10 or recovered_venue_count <> 8 or recovered_media_count <> 8 then
    raise exception 'Recovered counts mismatch (artists %, venues %, media %)',
      recovered_artist_count, recovered_venue_count, recovered_media_count;
  end if;
end $$;

commit;
