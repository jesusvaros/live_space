// ============================================================================
// TEMPORARY SHIM — replace with the real queue from feat/media-pipeline-v2.
//
// The persistent, resumable upload queue is being built on that branch with
// this exact signature. This stand-in exists only so feat/auto-moments
// compiles and works end to end: it uploads one item after another in the
// foreground with the existing uploadEventPost, with no persistence, retry or
// background work. On merge, keep the other branch's file and delete this one.
// ============================================================================

import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { createConfiguredCloudinaryMediaProvider } from './configured';
import { uploadEventPost } from './uploadPost';

export type MomentUploadItem = {
  file?: File;
  nativePath?: string;
  eventId: string;
  setlistItemId?: string;
  capturedAt?: string;
};

const VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|3gp|webm)$/i;

// content:// (Android) or file:// (iOS export) → File the provider can upload.
const fileFromNativePath = async (nativePath: string, index: number): Promise<File> => {
  const response = await fetch(Capacitor.convertFileSrc(nativePath));
  if (!response.ok) throw new Error('No se pudo leer el archivo de la galería.');
  const blob = await response.blob();
  const isVideo = blob.type.startsWith('video/') || VIDEO_EXTENSIONS.test(nativePath);
  const type = blob.type || (isVideo ? 'video/mp4' : 'image/jpeg');
  const name = nativePath.split('/').pop() || `momento-${index}.${isVideo ? 'mp4' : 'jpg'}`;
  return new File([blob], name, { type });
};

export const enqueueMomentUploads = async (items: MomentUploadItem[]): Promise<void> => {
  if (items.length === 0) return;
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error('Inicia sesión para subir momentos.');

  const provider = createConfiguredCloudinaryMediaProvider();
  for (const [index, item] of items.entries()) {
    const file = item.file ?? (item.nativePath ? await fileFromNativePath(item.nativePath, index) : null);
    if (!file) continue;
    const postId = await uploadEventPost({
      provider,
      file,
      kind: file.type.startsWith('video/') ? 'video' : 'image',
      eventId: item.eventId,
      authorId: auth.user.id,
      capturedAt: item.capturedAt ?? null,
    });
    if (!item.setlistItemId) continue;
    // posts.song_id comes from the setlist item; best effort.
    const { data: setlistItem } = await supabase
      .from('event_setlist_items')
      .select('song_id')
      .eq('id', item.setlistItemId)
      .maybeSingle();
    if (setlistItem?.song_id) {
      await supabase.from('posts').update({ song_id: setlistItem.song_id }).eq('id', postId);
    }
  }
};
