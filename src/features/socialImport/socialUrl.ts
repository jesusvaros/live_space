// Recognises Instagram, TikTok and YouTube links and reduces them to one
// canonical URL per clip, so the same clip always dedupes to the same post.
// The canonical shapes are enforced again by the database
// (posts_external_url_canonical in 20261028040100_social_import.sql) and by the
// social-oembed Edge Function.

export type SocialSource = 'instagram' | 'tiktok' | 'youtube';

export type ParsedSocialUrl = {
  source: SocialSource;
  // Canonical link, or the short link when it still needs resolving (TikTok vm.).
  url: string;
  // Video ID (YouTube), numeric video ID (TikTok) or shortcode (Instagram);
  // null while a TikTok short link is unresolved.
  externalId: string | null;
  needsResolve: boolean;
  // When the platform encodes it in the ID (TikTok, Instagram); YouTube does not.
  publishedAt: string | null;
};

export const SOURCE_LABEL: Record<SocialSource, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

const URL_PATTERN = /https?:\/\/[^\s<>"'()]+/i;

export const extractFirstUrl = (text: string): string | null => {
  const match = text.match(URL_PATTERN);
  if (!match) return null;
  return match[0].replace(/[.,;:!?)\]]+$/, '');
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const TIKTOK_HANDLE = /^[A-Za-z0-9._-]{1,64}$/;
const TIKTOK_ID = /^[0-9]{6,25}$/;
const INSTAGRAM_CODE = /^[A-Za-z0-9_-]{5,64}$/;

const normalizeHost = (host: string) => host.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, '');

// TikTok IDs are snowflakes: the top 32 bits are the Unix time in seconds.
export const tiktokPublishedAt = (id: string): string | null => {
  try {
    const seconds = Number(BigInt(id) >> 32n);
    return plausibleDate(seconds * 1000);
  } catch {
    return null;
  }
};

const INSTAGRAM_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const INSTAGRAM_EPOCH_MS = 1314220021721n;

// Instagram media IDs carry milliseconds since Instagram's own epoch in their
// top 41 bits; the shortcode is that ID in URL-safe base64. Private-post
// shortcodes append extra characters, so only the first 11 count.
export const instagramPublishedAt = (shortcode: string): string | null => {
  const code = shortcode.slice(0, 11);
  let id = 0n;
  for (const char of code) {
    const value = INSTAGRAM_ALPHABET.indexOf(char);
    if (value < 0) return null;
    id = id * 64n + BigInt(value);
  }
  return plausibleDate(Number((id >> 23n) + INSTAGRAM_EPOCH_MS));
};

const plausibleDate = (ms: number): string | null => {
  if (!Number.isFinite(ms)) return null;
  const earliest = Date.UTC(2010, 0, 1);
  const latest = Date.now() + 24 * 3600 * 1000;
  if (ms < earliest || ms > latest) return null;
  return new Date(ms).toISOString();
};

const parseYouTube = (url: URL, host: string): ParsedSocialUrl | null => {
  let id: string | null = null;
  const segments = url.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be') id = segments[0] ?? null;
  else if (segments[0] === 'watch') id = url.searchParams.get('v');
  else if (['shorts', 'live', 'embed', 'v'].includes(segments[0] ?? '')) id = segments[1] ?? null;
  if (!id || !YOUTUBE_ID.test(id)) return null;
  return {
    source: 'youtube',
    url: `https://www.youtube.com/watch?v=${id}`,
    externalId: id,
    needsResolve: false,
    publishedAt: null,
  };
};

const parseTikTok = (url: URL, host: string): ParsedSocialUrl | null => {
  const segments = url.pathname.split('/').filter(Boolean);
  if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com' || (host === 'tiktok.com' && segments[0] === 't')) {
    return {
      source: 'tiktok',
      url: `https://${host === 'tiktok.com' ? 'www.tiktok.com' : host}${url.pathname}`,
      externalId: null,
      needsResolve: true,
      publishedAt: null,
    };
  }
  if (host !== 'tiktok.com') return null;
  const [handleSegment, kind, id] = segments;
  if (!handleSegment?.startsWith('@') || (kind !== 'video' && kind !== 'photo') || !id) return null;
  const handle = handleSegment.slice(1);
  if (!TIKTOK_HANDLE.test(handle) || !TIKTOK_ID.test(id)) return null;
  return {
    source: 'tiktok',
    url: `https://www.tiktok.com/@${handle}/${kind}/${id}`,
    externalId: id,
    needsResolve: false,
    publishedAt: tiktokPublishedAt(id),
  };
};

export const canonicalTikTokUrl = (handle: string, id: string): string | null => {
  if (!TIKTOK_HANDLE.test(handle) || !TIKTOK_ID.test(id)) return null;
  return `https://www.tiktok.com/@${handle}/video/${id}`;
};

const parseInstagram = (url: URL): ParsedSocialUrl | null => {
  const segments = url.pathname.split('/').filter(Boolean);
  // /p/CODE, /reel/CODE, /reels/CODE, /tv/CODE and /{user}/p/CODE or /{user}/reel/CODE.
  const index = segments.findIndex(segment => ['p', 'reel', 'reels', 'tv'].includes(segment));
  if (index < 0 || index > 1) return null;
  const kind = segments[index];
  const code = segments[index + 1];
  if (!code || !INSTAGRAM_CODE.test(code)) return null;
  const path = kind === 'reel' || kind === 'reels' ? 'reel' : 'p';
  return {
    source: 'instagram',
    url: `https://www.instagram.com/${path}/${code}/`,
    externalId: code,
    needsResolve: false,
    publishedAt: instagramPublishedAt(code),
  };
};

export const parseSocialUrl = (input: string): ParsedSocialUrl | null => {
  const raw = extractFirstUrl(input.trim()) ?? input.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = normalizeHost(url.hostname);
  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtu.be' || host === 'youtube-nocookie.com') {
    return parseYouTube(url, host);
  }
  if (host.endsWith('tiktok.com')) return parseTikTok(url, host);
  if (host === 'instagram.com' || host === 'instagr.am') return parseInstagram(url);
  return null;
};

// The official players. Rendered as a plain iframe by ID: the oEmbed HTML is
// stored for reference but never injected into the page.
export const embedUrlFor = (source: SocialSource, externalId: string): string => {
  if (source === 'youtube') {
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(externalId)}?autoplay=1&playsinline=1&rel=0`;
  }
  if (source === 'tiktok') {
    return `https://www.tiktok.com/player/v1/${encodeURIComponent(externalId)}?autoplay=1&rel=0&description=1`;
  }
  return `https://www.instagram.com/p/${encodeURIComponent(externalId)}/embed/`;
};

// YouTube publishes stable thumbnails per video ID; used when oEmbed is out of reach.
export const fallbackThumbnailFor = (source: SocialSource, externalId: string | null): string | null =>
  source === 'youtube' && externalId ? `https://i.ytimg.com/vi/${externalId}/hqdefault.jpg` : null;
