// Metadata for a clip shared from Instagram, TikTok or YouTube, through the
// platforms' official oEmbed endpoints only. Nothing is downloaded or
// re-hosted: the app stores the link plus this metadata and plays the original.
//
// - YouTube and TikTok oEmbed are public.
// - Instagram oEmbed needs a Meta app token (META_OEMBED_TOKEN, "APP_ID|CLIENT_TOKEN"
//   with the oEmbed Read feature). Without it the answer degrades to a
//   link-only card ({ degraded: true }) instead of failing.
//
// Only signed-in users may call it (verify_jwt in config.toml), only the three
// platforms' hosts are fetched, and TikTok short links are resolved by
// following at most three redirects that must stay on tiktok.com.
// Canonical URL shapes match src/features/socialImport/socialUrl.ts and the
// posts_external_url_canonical constraint.

import { corsHeaders, jsonResponse, requireJsonPost } from "../_shared/http.ts";

type Source = "instagram" | "tiktok" | "youtube";

type Metadata = {
  source: Source;
  url: string;
  externalId: string;
  title: string | null;
  authorName: string | null;
  authorHandle: string | null;
  authorUrl: string | null;
  thumbnailUrl: string | null;
  embedHtml: string | null;
  publishedAt: string | null;
  degraded: boolean;
};

const FETCH_TIMEOUT_MS = 6000;
const GRAPH_VERSION = "v21.0";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const TIKTOK_HANDLE = /^[A-Za-z0-9._-]{1,64}$/;
const TIKTOK_ID = /^[0-9]{6,25}$/;
const INSTAGRAM_CODE = /^[A-Za-z0-9_-]{5,64}$/;

const host = (url: URL) => url.hostname.toLowerCase().replace(/^(www\.|m\.|mobile\.)/, "");

const timedFetch = (url: string, init: RequestInit = {}) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

const plausibleDate = (ms: number): string | null => {
  if (!Number.isFinite(ms) || ms < Date.UTC(2010, 0, 1) || ms > Date.now() + 86_400_000) return null;
  return new Date(ms).toISOString();
};

const tiktokPublishedAt = (id: string) => {
  try {
    return plausibleDate(Number(BigInt(id) >> 32n) * 1000);
  } catch {
    return null;
  }
};

const IG_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const instagramPublishedAt = (code: string) => {
  let id = 0n;
  for (const char of code.slice(0, 11)) {
    const value = IG_ALPHABET.indexOf(char);
    if (value < 0) return null;
    id = id * 64n + BigInt(value);
  }
  return plausibleDate(Number((id >> 23n) + 1314220021721n));
};

type Parsed = { source: Source; url: string; externalId: string | null };

const parse = (raw: string): Parsed | null => {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const h = host(url);
  const segments = url.pathname.split("/").filter(Boolean);

  if (h === "youtube.com" || h === "music.youtube.com" || h === "youtu.be" || h === "youtube-nocookie.com") {
    let id: string | null = null;
    if (h === "youtu.be") id = segments[0] ?? null;
    else if (segments[0] === "watch") id = url.searchParams.get("v");
    else if (["shorts", "live", "embed", "v"].includes(segments[0] ?? "")) id = segments[1] ?? null;
    if (!id || !YOUTUBE_ID.test(id)) return null;
    return { source: "youtube", url: `https://www.youtube.com/watch?v=${id}`, externalId: id };
  }

  if (h === "tiktok.com") {
    const [handleSegment, kind, id] = segments;
    if (segments[0] === "t") return { source: "tiktok", url: `https://www.tiktok.com${url.pathname}`, externalId: null };
    if (!handleSegment?.startsWith("@") || (kind !== "video" && kind !== "photo") || !id) return null;
    const handle = handleSegment.slice(1);
    if (!TIKTOK_HANDLE.test(handle) || !TIKTOK_ID.test(id)) return null;
    return { source: "tiktok", url: `https://www.tiktok.com/@${handle}/${kind}/${id}`, externalId: id };
  }
  if (h === "vm.tiktok.com" || h === "vt.tiktok.com") {
    return { source: "tiktok", url: `https://${h}${url.pathname}`, externalId: null };
  }

  if (h === "instagram.com" || h === "instagr.am") {
    const index = segments.findIndex((segment) => ["p", "reel", "reels", "tv"].includes(segment));
    if (index < 0 || index > 1) return null;
    const code = segments[index + 1];
    if (!code || !INSTAGRAM_CODE.test(code)) return null;
    const path = segments[index] === "reel" || segments[index] === "reels" ? "reel" : "p";
    return { source: "instagram", url: `https://www.instagram.com/${path}/${code}/`, externalId: code };
  }
  return null;
};

// vm.tiktok.com/XXXX -> https://www.tiktok.com/@user/video/123, never leaving tiktok.com.
const resolveTikTokShortLink = async (shortUrl: string): Promise<Parsed | null> => {
  let current = shortUrl;
  for (let hop = 0; hop < 3; hop += 1) {
    const response = await timedFetch(current, { method: "GET", redirect: "manual" });
    await response.body?.cancel();
    const location = response.headers.get("location");
    if (!location) return null;
    const next = new URL(location, current);
    if (!host(next).endsWith("tiktok.com")) return null;
    const parsed = parse(next.toString());
    if (parsed?.externalId) return parsed;
    current = next.toString();
  }
  return null;
};

const stringOrNull = (value: unknown, max = 4000) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

const httpsOrNull = (value: unknown) => {
  const text = stringOrNull(value, 2000);
  return text && text.startsWith("https://") ? text : null;
};

const handleFromAuthorUrl = (authorUrl: string | null) => {
  if (!authorUrl) return null;
  const match = authorUrl.match(/\/@([A-Za-z0-9._-]+)/) ?? authorUrl.match(/instagram\.com\/([A-Za-z0-9._]+)/);
  return match?.[1] ?? null;
};

const fetchJson = async (url: string) => {
  const response = await timedFetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    await response.body?.cancel();
    return null;
  }
  return (await response.json()) as Record<string, unknown>;
};

const linkOnly = (parsed: Parsed & { externalId: string }): Metadata => ({
  source: parsed.source,
  url: parsed.url,
  externalId: parsed.externalId,
  title: null,
  authorName: null,
  authorHandle: parsed.source === "tiktok" ? handleFromAuthorUrl(parsed.url) : null,
  authorUrl: null,
  thumbnailUrl: parsed.source === "youtube" ? `https://i.ytimg.com/vi/${parsed.externalId}/hqdefault.jpg` : null,
  embedHtml: null,
  publishedAt: parsed.source === "tiktok"
    ? tiktokPublishedAt(parsed.externalId)
    : parsed.source === "instagram"
      ? instagramPublishedAt(parsed.externalId)
      : null,
  degraded: true,
});

const fromOEmbed = (base: Metadata, data: Record<string, unknown>): Metadata => {
  const authorUrl = httpsOrNull(data.author_url);
  return {
    ...base,
    title: stringOrNull(data.title),
    authorName: stringOrNull(data.author_name, 200),
    authorHandle: stringOrNull(data.author_unique_id, 120) ?? handleFromAuthorUrl(authorUrl) ?? base.authorHandle,
    authorUrl,
    thumbnailUrl: httpsOrNull(data.thumbnail_url) ?? base.thumbnailUrl,
    embedHtml: stringOrNull(data.html, 20000),
    degraded: false,
  };
};

const lookup = async (raw: string): Promise<Metadata | { error: string; status: number }> => {
  let parsed = parse(raw);
  if (!parsed) return { error: "unsupported_url", status: 422 };

  if (parsed.source === "tiktok" && !parsed.externalId) {
    parsed = await resolveTikTokShortLink(parsed.url);
    if (!parsed?.externalId) return { error: "unresolved_short_link", status: 422 };
  }
  const resolved = parsed as Parsed & { externalId: string };
  const base = linkOnly(resolved);

  if (resolved.source === "youtube") {
    const data = await fetchJson(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(resolved.url)}`,
    );
    return data ? fromOEmbed(base, data) : base;
  }

  if (resolved.source === "tiktok") {
    const data = await fetchJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(resolved.url)}`);
    if (!data) return base;
    const metadata = fromOEmbed(base, data);
    // Prefer the author's real handle in the canonical link when oEmbed knows it.
    const handle = metadata.authorHandle;
    if (handle && TIKTOK_HANDLE.test(handle) && resolved.url.includes("/video/")) {
      metadata.url = `https://www.tiktok.com/@${handle}/video/${resolved.externalId}`;
    }
    return metadata;
  }

  const token = Deno.env.get("META_OEMBED_TOKEN");
  if (!token) return base;
  const data = await fetchJson(
    `https://graph.facebook.com/${GRAPH_VERSION}/instagram_oembed?omitscript=true&url=${
      encodeURIComponent(resolved.url)
    }&access_token=${encodeURIComponent(token)}`,
  );
  return data ? fromOEmbed(base, data) : base;
};

Deno.serve(async (request) => {
  const cors = corsHeaders(request);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const methodError = requireJsonPost(request);
  if (methodError) {
    return new Response(methodError.body, {
      status: methodError.status,
      headers: { ...cors, allow: "POST, OPTIONS", "content-type": "application/json; charset=utf-8" },
    });
  }

  try {
    const body = (await request.json()) as { url?: unknown };
    if (typeof body.url !== "string" || body.url.length > 2048) {
      return jsonResponse({ error: "url is required" }, 400, cors);
    }
    const result = await lookup(body.url);
    if ("error" in result) return jsonResponse({ error: result.error }, result.status, cors);
    return jsonResponse(result, 200, cors);
  } catch (error) {
    // Never echo upstream bodies or the token; just the kind of failure.
    console.error("social-oembed failed", error instanceof Error ? error.name : "unknown");
    return jsonResponse({ error: "lookup_failed" }, 502, cors);
  }
});
