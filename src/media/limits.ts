/**
 * Upload limits shared by the web fallback, the native compressor and the
 * queue. The server enforces the same numbers (reserve_media_upload,
 * media-r2-complete); these only fail fast on the device.
 */
export const IMAGE_MAX_BYTES = 10_000_000;
export const VIDEO_MAX_BYTES = 75_000_000;
export const VIDEO_MAX_DURATION_SECONDS = 45;

/**
 * On-device compression target: H.264/AAC MP4 inside a 1280×720 box (720p,
 * either orientation), ~2.5 Mbps video and 128 kbps audio. A 45 s clip comes
 * out around 15 MB.
 */
export const VIDEO_COMPRESSION = {
  maxDurationSeconds: VIDEO_MAX_DURATION_SECONDS,
  maxLongSide: 1280,
  maxShortSide: 720,
  videoBitrate: 2_500_000,
  audioBitrate: 128_000,
} as const;
