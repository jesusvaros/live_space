import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

// Concert posters are mirrored into our R2 bucket as two small WebP files, so
// the app never hotlinks a third-party site (multi-megabyte originals, expired
// signed URLs, http:// blocked as mixed content, hosts that refuse apps).
// This module holds the pure decisions; posterRender.ts downloads and resizes,
// r2Storage.ts uploads, src/scripts/mirrorPosters.ts runs it.
//
// Identity is the source URL: the same URL always maps to the same keys and
// the same poster_mirrors row, so an unchanged URL is never downloaded twice
// and a changed image_url is simply a URL without a row yet.

/** Bump to regenerate every rendition under new keys (old ones stay cached). */
export const POSTER_KEY_VERSION = 'v1';

export type PosterRenditionName = 'thumb' | 'card';

export type PosterRendition = {
  name: PosterRenditionName;
  /** Target width; never enlarged. */
  width: number;
  /** Very tall artwork is bounded by height instead. */
  maxHeight: number;
  /** Aim for at most this many bytes; quality steps down until it fits. */
  budgetBytes: number;
};

// List/map thumbnail and card/detail size.
export const POSTER_RENDITIONS: readonly PosterRendition[] = [
  { name: 'thumb', width: 320, maxHeight: 480, budgetBytes: 25_000 },
  { name: 'card', width: 800, maxHeight: 1200, budgetBytes: 90_000 },
];

/**
 * Encodes to try, in order, until one fits the rendition's budget: lower
 * quality first, then a smaller size (busy, noisy artwork). The smallest
 * result wins if none fits.
 */
export const ENCODE_LADDER: ReadonlyArray<{ scale: number; quality: number }> = [
  { scale: 1, quality: 76 },
  { scale: 1, quality: 66 },
  { scale: 1, quality: 56 },
  { scale: 1, quality: 46 },
  { scale: 0.8, quality: 50 },
  { scale: 0.64, quality: 50 },
];

/** Failures before giving up on a URL; the delay doubles each time. */
export const MAX_POSTER_ATTEMPTS = 5;
const DAY_MS = 86_400_000;

/** sha256 of the URL as UTF-8, hex. Matches public.poster_source_hash() in SQL. */
export const posterSourceHash = (sourceUrl: string): string =>
  createHash('sha256').update(sourceUrl, 'utf8').digest('hex');

/** posters/v1/<first 32 hex of the hash>/w320.webp */
export const posterObjectKey = (sourceUrl: string, rendition: Pick<PosterRendition, 'width'>): string =>
  `posters/${POSTER_KEY_VERSION}/${posterSourceHash(sourceUrl).slice(0, 32)}/w${rendition.width}.webp`;

export const posterPublicUrl = (publicBaseUrl: string, key: string): string =>
  `${publicBaseUrl.replace(/\/+$/, '')}/${key}`;

const isPrivateIpv4 = (host: string) => {
  const parts = host.split('.').map(Number);
  const [a, b] = parts;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
};

/**
 * The URL the worker may download, or null. http:// is fine server side (the
 * app is the one that cannot load it); local and private addresses are not.
 */
export const fetchablePosterUrl = (value: string | null | undefined): URL | null => {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return null;
  }
  const ipVersion = isIP(host);
  if (ipVersion === 4 && isPrivateIpv4(host)) return null;
  if (ipVersion === 6 && (host === '::1' || host === '::' || /^f[cd]/.test(host) || host.startsWith('fe80') || host.startsWith('::ffff:'))) {
    return null;
  }
  return url;
};

export type PosterMirrorRow = {
  source_hash: string;
  status: 'ok' | 'failed';
  attempts: number;
  checked_at: string;
};

export type MirrorDecision = 'mirror' | 'done' | 'backoff' | 'gave_up' | 'unfetchable';

/** Wait after the n-th failure: 1, 2, 4, 8 days. */
export const retryDelayMs = (attempts: number) => Math.min(2 ** Math.max(attempts - 1, 0), 8) * DAY_MS;

export const mirrorDecision = (
  sourceUrl: string,
  row: PosterMirrorRow | null | undefined,
  now: Date,
): MirrorDecision => {
  if (!fetchablePosterUrl(sourceUrl)) return 'unfetchable';
  if (!row) return 'mirror';
  if (row.status === 'ok') return 'done';
  if (row.attempts >= MAX_POSTER_ATTEMPTS) return 'gave_up';
  const checkedAt = Date.parse(row.checked_at);
  if (Number.isFinite(checkedAt) && now.getTime() - checkedAt < retryDelayMs(row.attempts)) return 'backoff';
  return 'mirror';
};

export type PosterEvent = { id: string; image_url: string | null };

export type PosterPlan = {
  /** One entry per distinct URL to download now, with the events showing it. */
  toMirror: Array<{ sourceUrl: string; hash: string; eventIds: string[]; attempts: number }>;
  counts: Record<MirrorDecision, number>;
};

/**
 * What to download this run. Events sharing a URL share one download (the
 * same artwork on several dates); a URL whose row is ok is never fetched
 * again, and a changed image_url has no row yet, so it is fetched.
 */
export const planPosterMirrors = (
  events: PosterEvent[],
  mirrors: Map<string, PosterMirrorRow>,
  now: Date,
): PosterPlan => {
  const counts: Record<MirrorDecision, number> = { mirror: 0, done: 0, backoff: 0, gave_up: 0, unfetchable: 0 };
  const byUrl = new Map<string, PosterPlan['toMirror'][number]>();
  const seen = new Set<string>();
  for (const event of events) {
    // The stored value as is: the database trigger matches it exactly.
    const sourceUrl = event.image_url;
    if (!sourceUrl || !sourceUrl.trim()) continue;
    const pending = byUrl.get(sourceUrl);
    if (pending) {
      pending.eventIds.push(event.id);
      continue;
    }
    if (seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);
    const hash = posterSourceHash(sourceUrl);
    const row = mirrors.get(hash);
    const decision = mirrorDecision(sourceUrl, row, now);
    counts[decision] += 1;
    if (decision === 'mirror') {
      byUrl.set(sourceUrl, { sourceUrl, hash, eventIds: [event.id], attempts: row?.attempts ?? 0 });
    }
  }
  return { toMirror: [...byUrl.values()], counts };
};

/**
 * Index of the next ENCODE_LADDER step after an encode of `bytes`, or null to
 * stop: it fits the budget, or the ladder is exhausted.
 */
export const nextEncodeStep = (step: number, bytes: number, budgetBytes: number): number | null => {
  if (bytes <= budgetBytes) return null;
  return step + 1 < ENCODE_LADDER.length ? step + 1 : null;
};

/** Short, single-line reason stored in poster_mirrors.last_error. */
export const posterErrorMessage = (error: unknown): string => {
  const message = error instanceof Error
    ? [error.message, (error as Error & { cause?: { code?: string } }).cause?.code].filter(Boolean).join(' · ')
    : String(error);
  return message.replace(/\s+/g, ' ').trim().slice(0, 300) || 'unknown error';
};

/** Would `extraBytes` more keep R2 under the cap? */
export const fitsStorageCap = (storedBytes: number, extraBytes: number, maxBytes: number) =>
  storedBytes + extraBytes <= maxBytes;
