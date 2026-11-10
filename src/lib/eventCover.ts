// Which image URLs a concert cover tries, in order.
//
// Posters are mirrored to our R2 bucket by the scraper (docs/media.md, "Portadas
// de concierto en R2"):
// poster_thumb_url (~320 px WebP) for lists and the map, poster_url (~800 px)
// for cards and the concert page. Until a poster is mirrored, or if its file
// fails, the original image_url is tried, and the generated poster is the
// last resort (rendered by <CoverImage>'s fallback).

export type CoverSize = 'thumb' | 'card';

export type PosterSources = {
  thumb: string | null;
  card: string | null;
  original: string | null;
};

/**
 * A URL the app may request, or null. Never http:// (mixed content in the
 * app's https WebView); data:, blob: and same-origin paths are fine.
 */
export const safeImageUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const url = value.trim();
  if (!url) return null;
  if (/^https:\/\//i.test(url)) return url;
  if (/^(data:image\/|blob:)/i.test(url)) return url;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return null;
};

/** Safe URLs only, first occurrence wins. */
export const uniqueImageUrls = (urls: ReadonlyArray<unknown>): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of urls) {
    const url = safeImageUrl(value);
    if (url && !seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }
  return result;
};

export const posterSourcesFromRow = (row: {
  poster_thumb_url?: unknown;
  poster_url?: unknown;
  image_url?: unknown;
}): PosterSources => ({
  thumb: safeImageUrl(row.poster_thumb_url),
  card: safeImageUrl(row.poster_url),
  original: safeImageUrl(row.image_url),
});

/** Poster URLs for a size: thumb → card → original, or card → original → thumb. */
export const posterChain = (poster: PosterSources | null | undefined, size: CoverSize): string[] => {
  if (!poster) return [];
  return uniqueImageUrls(size === 'thumb' ? [poster.thumb, poster.card, poster.original] : [poster.card, poster.original, poster.thumb]);
};

/**
 * The full chain for an event card: its cover (a fan photo comes first when
 * there is one), then the poster renditions, then any extra candidates such
 * as the headliner's photo. The caller renders the generated poster when
 * every URL fails.
 */
export const eventCoverSources = (
  event: { cover_image_url?: string | null; poster_sources?: PosterSources | null },
  size: CoverSize,
  extra: ReadonlyArray<unknown> = [],
): string[] => {
  const poster = event.poster_sources ?? null;
  const posterUrls = posterChain(poster, size);
  const cover = safeImageUrl(event.cover_image_url);
  // cover_image_url is either a fan photo or one of the poster URLs.
  const fanCover = cover && !posterUrls.includes(cover) ? cover : null;
  return uniqueImageUrls([fanCover, ...posterUrls, cover, ...extra]);
};
