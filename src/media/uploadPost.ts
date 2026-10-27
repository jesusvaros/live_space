import { supabase } from '../lib/supabase';
import { getReuseConsent } from '../features/community/licence';
import type { MediaKind, MediaProvider } from './types';

const delay = (milliseconds: number) =>
  new Promise<void>(resolve => globalThis.setTimeout(resolve, milliseconds));

export const waitForMediaAssetId = async (
  reservationId: string,
  options: { attempts?: number; intervalMs?: number } = {},
) => {
  const attempts = options.attempts ?? 20;
  const intervalMs = options.intervalMs ?? 500;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const { data, error } = await supabase
      .from('media_assets')
      .select('id')
      .eq('reservation_id', reservationId)
      .maybeSingle();
    if (error) throw error;
    if (data?.id) return data.id as string;
    await delay(intervalMs);
  }

  throw new Error('The upload completed, but media processing is still pending.');
};

export const uploadEventPost = async (options: {
  provider: MediaProvider;
  file: File;
  kind: MediaKind;
  eventId: string;
  authorId: string;
  capturedAt?: string | null;
  caption?: string | null;
  songId?: string | null;
  /** Licence for the artist and venue; defaults to the remembered upload choice. */
  allowReuse?: boolean;
}) => {
  const allowReuse = options.allowReuse ?? getReuseConsent();
  const upload = await options.provider.upload({
    file: options.file,
    kind: options.kind,
    eventId: options.eventId,
    purpose: 'user',
  });
  // R2 creates the asset synchronously; Cloudinary through its webhook.
  const mediaAssetId = upload.mediaAssetId ?? await waitForMediaAssetId(upload.reservationId);
  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: options.authorId,
      media_asset_id: mediaAssetId,
      event_id: options.eventId,
      captured_at: options.capturedAt ?? null,
      caption: options.caption ?? null,
      song_id: options.songId ?? null,
      // Only sent when off: the column defaults to true, so uploads keep
      // working on a database without the licence migration.
      ...(allowReuse ? {} : { allow_reuse: false }),
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
};
