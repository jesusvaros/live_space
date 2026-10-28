import { deezerMatchKey } from './deezerArtists.js';
import type { ArtistLinkKey, ArtistLinks } from './musicBrainzLinks.js';

// Artist links that venue agendas already publish next to each concert
// (El Intruso links every band's Instagram; Gruta 77 lists several per
// night). Read from the scraped payloads, nothing is fetched again.

type StagingPayload = { artistNames?: unknown; description?: unknown; payload?: unknown };

const LINK_PATTERNS: Array<[ArtistLinkKey, RegExp]> = [
  ['instagram', /https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9_.]{2,30})(?![A-Za-z0-9_.]*\/(?:p|reel)\/)/g],
  ['spotify', /https?:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?artist\/([A-Za-z0-9]{22})/g],
  ['bandcamp', /https?:\/\/([a-z0-9-]{2,60})\.bandcamp\.com/g],
  ['youtube', /https?:\/\/(?:www\.)?youtube\.com\/((?:@|channel\/|c\/|user\/)[A-Za-z0-9_.-]+)/g],
  ['tiktok', /https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9_.]{2,30})/g],
];

const NOT_PROFILES = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'share', 'daily', 'bandcamp']);

const toUrl = (key: ArtistLinkKey, id: string): string => {
  if (key === 'instagram') return `https://www.instagram.com/${id}/`;
  if (key === 'spotify') return `https://open.spotify.com/artist/${id}`;
  if (key === 'bandcamp') return `https://${id}.bandcamp.com/`;
  if (key === 'youtube') return `https://www.youtube.com/${id}`;
  return `https://www.tiktok.com/@${id}`;
};

// "blueperro" ~ "BLUE PERRO", "jeanphilippeguytrio" ~ "Jean-Philippe Guy".
export const handleMatchesName = (handle: string, name: string): boolean => {
  const h = deezerMatchKey(handle.replace(/^(?:@|channel\/|c\/|user\/)/, '')).replace(/ /g, '');
  const n = deezerMatchKey(name).replace(/ /g, '');
  if (h.length < 4 || n.length < 4) return false;
  return h.includes(n) || (n.includes(h) && h.length >= 6);
};

type Found = { key: ArtistLinkKey; id: string };

const findLinks = (text: string): Found[] => {
  const found = new Map<string, Found>();
  for (const [key, pattern] of LINK_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const id = match[1].replace(/\.$/, '');
      if (NOT_PROFILES.has(id.toLowerCase())) continue;
      found.set(`${key}:${id.toLowerCase()}`, { key, id });
    }
  }
  return [...found.values()];
};

/**
 * Builds artist name key → links from scraped payloads.
 * - A link whose handle resembles one of the night's artists goes to that artist.
 * - On a single-artist night, the only link of its kind goes to that artist,
 *   unless the same handle appears with other artists (the venue's own
 *   account in the page footer).
 */
export const linksFromStaging = (payloads: StagingPayload[]): Map<string, ArtistLinks> => {
  const nights: Array<{ artists: string[]; links: Found[] }> = [];
  const artistsPerHandle = new Map<string, Set<string>>();

  for (const payload of payloads) {
    const artists = Array.isArray(payload.artistNames)
      ? payload.artistNames.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    if (!artists.length) continue;
    const text = JSON.stringify(payload).replace(/\\\//g, '/');
    const links = findLinks(text);
    if (!links.length) continue;
    nights.push({ artists, links });
    for (const link of links) {
      const handle = `${link.key}:${link.id.toLowerCase()}`;
      const seen = artistsPerHandle.get(handle) || new Set<string>();
      for (const artist of artists) seen.add(deezerMatchKey(artist));
      artistsPerHandle.set(handle, seen);
    }
  }

  const result = new Map<string, ArtistLinks>();
  const assign = (artist: string, link: Found) => {
    const key = deezerMatchKey(artist);
    if (!key) return;
    const links = result.get(key) || {};
    if (!links[link.key]) links[link.key] = toUrl(link.key, link.id);
    result.set(key, links);
  };

  for (const night of nights) {
    for (const link of night.links) {
      const byName = night.artists.filter((artist) => handleMatchesName(link.id, artist));
      if (byName.length === 1) {
        assign(byName[0], link);
        continue;
      }
      if (night.artists.length !== 1) continue;
      const sameKind = night.links.filter((other) => other.key === link.key);
      const handle = `${link.key}:${link.id.toLowerCase()}`;
      if (sameKind.length === 1 && (artistsPerHandle.get(handle)?.size || 0) === 1) assign(night.artists[0], link);
    }
  }
  return result;
};
