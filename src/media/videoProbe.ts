/**
 * Browser-side video helpers for the web fallback (no transcoding there): read
 * duration/size and grab a poster frame with <video> + <canvas>. Every helper
 * resolves to null instead of throwing when the browser cannot decode the file.
 */

export type VideoProbe = { durationSeconds: number; width: number; height: number };

const TIMEOUT_MS = 15_000;

const withVideo = <T>(source: Blob, run: (video: HTMLVideoElement, done: (value: T | null) => void) => void) =>
  new Promise<T | null>((resolve) => {
    if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(source);
    const video = document.createElement('video');
    let settled = false;
    const done = (value: T | null) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    const timer = globalThis.setTimeout(() => done(null), TIMEOUT_MS);
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onerror = () => done(null);
    run(video, done);
    video.src = url;
  });

export const probeVideo = (source: Blob) =>
  withVideo<VideoProbe>(source, (video, done) => {
    video.onloadedmetadata = () => {
      const durationSeconds = Number.isFinite(video.duration) ? video.duration : 0;
      done(durationSeconds > 0
        ? { durationSeconds, width: video.videoWidth, height: video.videoHeight }
        : null);
    };
  });

/** JPEG poster (max 720 px on the long side) from around the first second. */
export const extractVideoThumbnail = (source: Blob, maxSide = 720) =>
  withVideo<Blob>(source, (video, done) => {
    video.preload = 'auto';
    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      video.currentTime = Math.min(1, duration / 2);
    };
    video.onseeked = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) {
        done(null);
        return;
      }
      const scale = Math.min(1, maxSide / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(2, Math.round(width * scale));
      canvas.height = Math.max(2, Math.round(height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        done(null);
        return;
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => done(blob), 'image/jpeg', 0.8);
    };
  });
