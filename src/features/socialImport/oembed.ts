import { supabase } from '../../lib/supabase';
import {
  canonicalTikTokUrl,
  fallbackThumbnailFor,
  type ParsedSocialUrl,
  type SocialSource,
} from './socialUrl';

export type SocialMetadata = {
  source: SocialSource;
  url: string;
  externalId: string;
  title: string | null;
  authorName: string | null;
  authorHandle: string | null;
  authorUrl: string | null;
  thumbnailUrl: string | null;
  embedHtml: string | null;
  publishedAt: string | null;
  // Link-only card: oEmbed was out of reach (no Meta token for Instagram, offline...).
  degraded: boolean;
};

export class SocialLookupError extends Error {
  constructor(public readonly code: 'unsupported_url' | 'unresolved_short_link' | 'lookup_failed') {
    super(code);
  }
}

const httpsOrNull = (value: unknown) =>
  typeof value === 'string' && value.startsWith('https://') ? value : null;

const textOrNull = (value: unknown, max = 4000) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

const linkOnly = (parsed: ParsedSocialUrl & { externalId: string }): SocialMetadata => ({
  source: parsed.source,
  url: parsed.url,
  externalId: parsed.externalId,
  title: null,
  authorName: null,
  authorHandle: parsed.source === 'tiktok' ? parsed.url.match(/\/@([A-Za-z0-9._-]+)/)?.[1] ?? null : null,
  authorUrl: null,
  thumbnailUrl: fallbackThumbnailFor(parsed.source, parsed.externalId),
  embedHtml: null,
  publishedAt: parsed.publishedAt,
  degraded: true,
});

const isMetadata = (value: unknown): value is SocialMetadata =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as SocialMetadata).url === 'string' &&
  typeof (value as SocialMetadata).externalId === 'string' &&
  ['instagram', 'tiktok', 'youtube'].includes((value as SocialMetadata).source);

// The public oEmbed endpoints, straight from the device. Native builds go
// through CapacitorHttp (no CORS); on the web only TikTok allows it.
const publicOEmbed = async (parsed: ParsedSocialUrl): Promise<SocialMetadata | null> => {
  if (parsed.source === 'instagram') return null;
  const endpoint = parsed.source === 'youtube'
    ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(parsed.url)}`
    : `https://www.tiktok.com/oembed?url=${encodeURIComponent(parsed.url)}`;
  const response = await fetch(endpoint, { headers: { accept: 'application/json' } });
  if (!response.ok) return null;
  const data = (await response.json()) as Record<string, unknown>;

  let externalId = parsed.externalId;
  let url = parsed.url;
  const handle = textOrNull(data.author_unique_id, 120);
  if (parsed.source === 'tiktok') {
    // A short link only becomes canonical once oEmbed names the video and author.
    const productId = textOrNull(data.embed_product_id, 40);
    externalId = externalId ?? productId;
    if (externalId && handle && (parsed.needsResolve || url.includes('/video/'))) {
      url = canonicalTikTokUrl(handle, externalId) ?? url;
    }
  }
  if (!externalId || (parsed.source === 'tiktok' && url.includes('vm.tiktok.com'))) return null;

  const authorUrl = httpsOrNull(data.author_url);
  return {
    ...linkOnly({ ...parsed, url, externalId }),
    title: textOrNull(data.title),
    authorName: textOrNull(data.author_name, 200),
    authorHandle: handle ?? authorUrl?.match(/\/@([A-Za-z0-9._-]+)/)?.[1] ?? null,
    authorUrl,
    thumbnailUrl: httpsOrNull(data.thumbnail_url) ?? fallbackThumbnailFor(parsed.source, externalId),
    embedHtml: textOrNull(data.html, 20000),
    degraded: false,
  };
};

// Edge Function first (it holds the Meta token and resolves TikTok short
// links); the public endpoints as a fallback; a link-only card as the floor.
export const lookupSocialMetadata = async (parsed: ParsedSocialUrl): Promise<SocialMetadata> => {
  try {
    const { data, error } = await supabase.functions.invoke('social-oembed', { body: { url: parsed.url } });
    if (!error && isMetadata(data)) return data;
    // A 4xx from the function carries its reason in the response body.
    const context = (error as { context?: unknown } | null)?.context;
    const body = context instanceof Response
      ? ((await context.json().catch(() => null)) as { error?: string } | null)
      : null;
    const code = body?.error;
    if (code === 'unsupported_url' || code === 'unresolved_short_link') throw new SocialLookupError(code);
  } catch (error) {
    if (error instanceof SocialLookupError) throw error;
  }

  try {
    const metadata = await publicOEmbed(parsed);
    if (metadata) return metadata;
  } catch {
    // Offline or blocked by CORS: fall through to the link-only card.
  }

  if (!parsed.externalId) throw new SocialLookupError('unresolved_short_link');
  return linkOnly({ ...parsed, externalId: parsed.externalId });
};
