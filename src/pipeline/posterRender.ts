import sharp, { type Metadata } from 'sharp';

import {
  ENCODE_LADDER,
  fetchablePosterUrl,
  nextEncodeStep,
  POSTER_RENDITIONS,
  type PosterRendition,
  type PosterRenditionName,
} from './posterMirror.js';

// Downloads a poster like a browser would and turns it into the WebP
// renditions of POSTER_RENDITIONS. Throws with a short reason on anything that
// is not a usable image; the caller records it and retries on a later run.

// Some venue sites (WordPress behind bot filters) only answer browsers.
const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  'accept-language': 'es-ES,es;q=0.9,en;q=0.8',
};

export const MAX_POSTER_DOWNLOAD_BYTES = 25 * 1024 * 1024;
const MIN_POSTER_SIDE = 64;
const MAX_INPUT_PIXELS = 120_000_000;
const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif', 'tiff', 'svg']);

export type DownloadedPoster = {
  bytes: Buffer;
  contentType: string;
  finalUrl: string;
};

export const downloadPoster = async (sourceUrl: string, timeoutMs = 20_000): Promise<DownloadedPoster> => {
  const url = fetchablePosterUrl(sourceUrl);
  if (!url) throw new Error('unsupported URL');
  const response = await fetch(url.href, {
    headers: { ...BROWSER_HEADERS, referer: `${url.origin}/` },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`HTTP ${response.status}`);
  }
  // A redirect must not lead somewhere the worker would not fetch directly.
  if (!fetchablePosterUrl(response.url || url.href)) {
    await response.body?.cancel();
    throw new Error('redirected to an unsupported URL');
  }
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_POSTER_DOWNLOAD_BYTES) {
    await response.body?.cancel();
    throw new Error(`too large (${declared} bytes)`);
  }
  const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  // HTML instead of an image: an error page or a login wall.
  if (contentType.startsWith('text/html')) {
    await response.body?.cancel();
    throw new Error('not an image (text/html)');
  }

  const chunks: Buffer[] = [];
  let total = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_POSTER_DOWNLOAD_BYTES) {
        await reader.cancel();
        throw new Error(`too large (>${MAX_POSTER_DOWNLOAD_BYTES} bytes)`);
      }
      chunks.push(Buffer.from(value));
    }
  }
  if (total === 0) throw new Error('empty body');
  return { bytes: Buffer.concat(chunks), contentType, finalUrl: response.url || url.href };
};

export type RenderedRendition = {
  name: PosterRenditionName;
  width: number;
  height: number;
  quality: number;
  bytes: Buffer;
};

export type RenderedPoster = {
  format: string;
  width: number;
  height: number;
  renditions: RenderedRendition[];
};

const encode = (input: Buffer, rendition: PosterRendition, step: (typeof ENCODE_LADDER)[number]) =>
  sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
    .rotate()
    .resize({
      width: Math.round(rendition.width * step.scale),
      height: Math.round(rendition.maxHeight * step.scale),
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: step.quality, effort: 5, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });

/**
 * Validates the bytes by decoding them (the Content-Type is not trusted: some
 * CDNs send application/octet-stream) and encodes each rendition, stepping
 * quality (then size) down until it fits its byte budget.
 */
export const renderPoster = async (input: Buffer): Promise<RenderedPoster> => {
  let metadata: Metadata;
  try {
    metadata = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new Error('not a decodable image');
  }
  if (!metadata.format || !ACCEPTED_FORMATS.has(metadata.format)) {
    throw new Error(`unsupported image format (${metadata.format ?? 'unknown'})`);
  }
  const width = metadata.autoOrient?.width ?? metadata.width ?? 0;
  const height = metadata.autoOrient?.height ?? metadata.height ?? 0;
  if (width < MIN_POSTER_SIDE || height < MIN_POSTER_SIDE) {
    throw new Error(`image too small (${width}x${height})`);
  }

  const renditions: RenderedRendition[] = [];
  for (const rendition of POSTER_RENDITIONS) {
    let step = 0;
    let best: RenderedRendition | null = null;
    for (;;) {
      const { data, info } = await encode(input, rendition, ENCODE_LADDER[step]);
      if (!best || data.length < best.bytes.length) {
        best = { name: rendition.name, width: info.width, height: info.height, quality: ENCODE_LADDER[step].quality, bytes: data };
      }
      const next = nextEncodeStep(step, data.length, rendition.budgetBytes);
      if (next === null) break;
      step = next;
    }
    renditions.push(best);
  }
  return { format: metadata.format, width, height, renditions };
};
