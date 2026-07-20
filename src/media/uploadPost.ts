import { supabase } from '../lib/supabase';
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
}) => {
  const upload = await options.provider.upload({
    file: options.file,
    kind: options.kind,
    eventId: options.eventId,
    purpose: 'user',
  });
  const mediaAssetId = await waitForMediaAssetId(upload.reservationId);
  const { data, error } = await supabase
    .from('posts')
    .insert({
      author_id: options.authorId,
      media_asset_id: mediaAssetId,
      event_id: options.eventId,
      captured_at: options.capturedAt ?? null,
      caption: options.caption ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
};
