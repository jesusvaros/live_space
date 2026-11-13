// Pure decisions for optimizing fan videos already stored in R2 (see
// scripts/optimizeVideos.ts): which ones need it, the ffmpeg arguments and
// where the cover goes. Same target as the app's on-device compressor
// (android VideoCompressor / ios VideoCompressor.swift): 720p, ~2.5 Mbps
// H.264, 128 kbps AAC, index ("moov") at the start, JPEG cover ≤ 720 px.

export type StoredVideo = {
  id: string;
  storage_key: string | null;
  /** What the app plays: the original, or the light copy once optimized. */
  secure_url?: string | null;
  bytes: number | null;
  duration_seconds: number | null;
  thumbnail_url: string | null;
};

export type VideoPlan = {
  /** Re-encode: too heavy for phones (or not playable before fully downloaded). */
  encode: boolean;
  /** Generate and attach a cover (no thumbnail yet). */
  cover: boolean;
  reasons: string[];
};

/** Above this the file is re-encoded (the on-device target is ~2.6 Mbps in total). */
export const MAX_MBPS = 4;

export const megabitsPerSecond = (bytes: number | null, seconds: number | null) =>
  bytes && seconds && seconds > 0 ? (bytes * 8) / seconds / 1_000_000 : null;

/** What to do with one video; `fastStart` is null when it could not be checked. */
export const planVideo = (video: StoredVideo, fastStart: boolean | null, maxMbps = MAX_MBPS): VideoPlan => {
  const reasons: string[] = [];
  // Already serving the light copy: only a missing cover can be left.
  if (video.secure_url && isOptimizedUrl(video.secure_url)) {
    return video.thumbnail_url ? { encode: false, cover: false, reasons } : { encode: false, cover: true, reasons: ['no cover'] };
  }
  const mbps = megabitsPerSecond(video.bytes, video.duration_seconds);
  if (mbps !== null && mbps > maxMbps) reasons.push(`${mbps.toFixed(1)} Mbps`);
  if (fastStart === false) reasons.push('moov at the end');
  const encode = reasons.length > 0;
  const cover = !video.thumbnail_url;
  if (cover) reasons.push('no cover');
  return { encode, cover, reasons };
};

/**
 * Whether an MP4's index comes before its media data, from the file's first
 * bytes: top-level boxes are walked until moov (true) or mdat (false).
 * null when neither shows up in the bytes we have.
 */
export const isFastStart = (head: Uint8Array): boolean | null => {
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
  let offset = 0;
  while (offset + 8 <= head.byteLength) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(head[offset + 4], head[offset + 5], head[offset + 6], head[offset + 7]);
    if (type === 'moov') return true;
    if (type === 'mdat') return false;
    if (size === 1) {
      if (offset + 16 > head.byteLength) return null;
      size = Number(view.getBigUint64(offset + 8));
    } else if (size === 0) {
      return null; // box runs to the end of the file
    }
    if (size < 8) return null;
    offset += size;
  }
  return null;
};

/**
 * The light copy sits next to the original, which is kept:
 * v/2026/11/<id>.mov → v/2026/11/<id>.720p.mp4.
 */
export const optimizedKeyFor = (storageKey: string): string | null => {
  const match = /^(v\/.+)\.[a-z0-9]+$/i.exec(storageKey);
  return match && !storageKey.endsWith('.720p.mp4') ? `${match[1]}.720p.mp4` : null;
};

export const isOptimizedUrl = (url: string) => /\.720p\.mp4(\?|$)/.test(url);

/** The cover sits next to the video: v/2026/11/<id>.mp4 → t/2026/11/<id>.jpg. */
export const coverKeyFor = (storageKey: string): string | null => {
  const match = /^v\/(.+)\.[a-z0-9]+$/i.exec(storageKey);
  return match ? `t/${match[1]}.jpg` : null;
};

/** ffmpeg arguments for the 720p, ~2.5 Mbps, faststart re-encode (rotation baked in). */
export const encodeArgs = (input: string, output: string) => [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-i', input,
  '-map', '0:v:0', '-map', '0:a:0?',
  // Fit inside 1280×720 keeping the shape (portrait 720×1280), even sizes.
  '-vf', "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))',scale='trunc(iw/2)*2':'trunc(ih/2)*2'",
  '-c:v', 'libx264', '-preset', 'medium', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-b:v', '2500k', '-maxrate', '3000k', '-bufsize', '5000k',
  '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
  '-movflags', '+faststart',
  output,
];

/** ffmpeg arguments for the cover: a frame at 0.5 s (or the first), ≤ 720 px wide. */
export const coverArgs = (input: string, output: string, durationSeconds: number | null) => [
  '-hide_banner', '-loglevel', 'error', '-y',
  '-ss', String(durationSeconds && durationSeconds > 1 ? 0.5 : 0),
  '-i', input,
  '-frames:v', '1',
  '-vf', "scale='min(720,iw)':-2",
  '-q:v', '4',
  output,
];
