import { Capacitor } from '@capacitor/core';
import { VIDEO_COMPRESSION } from '../limits';
import {
  isNativeMediaAvailable,
  LiveSpaceMedia,
  type CompressedVideo,
  type NativeVideoInfo,
} from './liveSpaceMedia';

export { isNativeMediaAvailable, LiveSpaceMedia } from './liveSpaceMedia';
export type {
  CaptureLocation,
  CompressedVideo,
  CompressVideoOptions,
  LiveSpaceMediaPlugin,
  NativeVideoInfo,
  UploadFileRangeOptions,
  UploadFileRangeResult,
} from './liveSpaceMedia';

/**
 * Opens the system video picker. Returns native paths (with duration, size and
 * capture date/GPS when the file has them) to pass to enqueueMomentUploads as
 * `nativePath`. Empty on web: use an <input type="file"> there.
 */
export const pickMomentVideos = async (limit = 10): Promise<NativeVideoInfo[]> => {
  if (!isNativeMediaAvailable()) return [];
  const { videos } = await LiveSpaceMedia.pickVideos({ limit });
  return videos;
};

/** Transcodes to the upload format (720p H.264/AAC faststart MP4, ≤ 45 s, no GPS). */
export const compressMomentVideo = async (
  path: string,
  options: { taskId?: string; onProgress?: (fraction: number) => void } = {},
): Promise<CompressedVideo> => {
  const taskId = options.taskId ?? `compress-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const handle = options.onProgress
    ? await LiveSpaceMedia.addListener('compressProgress', (event) => {
      if (event.taskId === taskId) options.onProgress?.(event.progress);
    })
    : null;
  try {
    return await LiveSpaceMedia.compressVideo({ path, taskId, ...VIDEO_COMPRESSION });
  } finally {
    await handle?.remove();
  }
};

/** Reads a small native file (a poster JPEG) into a Blob through the WebView. */
export const readNativeFile = async (path: string, type: string): Promise<Blob> => {
  const response = await fetch(Capacitor.convertFileSrc(path));
  if (!response.ok) throw new Error(`Unable to read ${path}`);
  const blob = await response.blob();
  return blob.type === type ? blob : new Blob([blob], { type });
};

/** Best-effort removal of a temporary file written by the plugin. */
export const deleteNativeFile = async (path: string | null | undefined) => {
  if (!path || !isNativeMediaAvailable()) return;
  try {
    await LiveSpaceMedia.deleteFile({ path });
  } catch {
    // Temporary files are cleaned up on the next run anyway.
  }
};
