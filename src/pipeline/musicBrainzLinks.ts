// Artist links (Spotify, Instagram, YouTube, web…) from MusicBrainz, whose
// data is CC0. Its API asks for an identifiable User-Agent and at most one
// request per second; it answers 503 when we go faster.

import { deezerMatchKey } from './deezerArtists.js';

export type ArtistLinkKey = 'spotify' | 'apple_music' | 'instagram' | 'youtube' | 'tiktok' | 'bandcamp' | 'website';
export type ArtistLinks = Partial<Record<ArtistLinkKey, string>>;

type MbRelation = { type: string; url?: { resource: string } };
type MbArtist = { id: string; name: string; score?: number; disambiguation?: string; relations?: MbRelation[] };

const API = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'LiveSpaceBot/1.0 (+https://github.com/jesusvaros/live_space)';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// First matching URL per key; MusicBrainz lists several YouTube channels
// (topic, VEVO…) and the first is usually the official one.
export const linksFromRelations = (relations: MbRelation[]): { links: ArtistLinks; deezerIds: string[] } => {
  const links: ArtistLinks = {};
  const deezerIds: string[] = [];
  const set = (key: ArtistLinkKey, url: string) => {
    if (!links[key]) links[key] = url;
  };
  for (const relation of relations) {
    const url = relation.url?.resource;
    if (!url || !/^https?:\/\//.test(url)) continue;
    let host: string;
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      continue;
    }
    const deezer = url.match(/deezer\.com\/(?:[a-z]{2}\/)?artist\/(\d+)/);
    if (deezer) deezerIds.push(deezer[1]);
    if (host === 'open.spotify.com' && url.includes('/artist/')) set('spotify', url);
    else if (host === 'music.apple.com') set('apple_music', url);
    else if (host === 'instagram.com') set('instagram', url);
    else if (host === 'youtube.com' && relation.type === 'youtube') set('youtube', url);
    else if (host === 'tiktok.com') set('tiktok', url);
    else if (host.endsWith('bandcamp.com')) set('bandcamp', url);
    else if (relation.type === 'official homepage') set('website', url);
  }
  return { links, deezerIds };
};

export type LinkMatch = { mbid: string; links: ArtistLinks; evidence: 'deezer' | 'name' };

/**
 * Matching rule, conservative because a wrong Instagram is worse than none:
 * - candidates are MusicBrainz artists whose normalized name equals ours;
 * - a candidate linking the same Deezer artist we already matched wins;
 * - otherwise only a single exact candidate with a multi-word name and no
 *   disambiguation note is accepted ("Stormy" or "Jet" need the Deezer proof).
 */
export class MusicBrainzClient {
  private lastRequestAt = 0;

  constructor(
    private readonly minIntervalMs = 1_500,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async get<T>(path: string): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();
      const response = await this.fetchImpl(`${API}${path}`, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      });
      if (response.status === 503) {
        await sleep(3_000 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`MusicBrainz ${response.status}`);
      return (await response.json()) as T;
    }
    throw new Error('MusicBrainz rate limited');
  }

  async findLinks(name: string, deezerId?: string | number | null): Promise<LinkMatch | null> {
    const key = deezerMatchKey(name);
    if (!key) return null;
    const query = encodeURIComponent(`artist:"${name.replace(/"/g, '')}"`);
    const search = await this.get<{ artists?: MbArtist[] }>(`/artist?fmt=json&limit=5&query=${query}`);
    const exact = (search.artists || []).filter((artist) => deezerMatchKey(artist.name) === key).slice(0, 3);
    if (!exact.length) return null;

    const nameOnly = exact.length === 1 && key.includes(' ') && !exact[0].disambiguation;
    for (const candidate of exact) {
      const { links, deezerIds } = await this.relationsOf(candidate.id);
      if (deezerId && deezerIds.includes(String(deezerId))) return { mbid: candidate.id, links, evidence: 'deezer' };
      if (nameOnly && !(deezerId && deezerIds.length)) return { mbid: candidate.id, links, evidence: 'name' };
    }
    return null;
  }

  // One request: the links of an artist we already identified, no search.
  async linksForMbid(mbid: string): Promise<ArtistLinks> {
    return (await this.relationsOf(mbid)).links;
  }

  private async relationsOf(mbid: string) {
    const full = await this.get<MbArtist>(`/artist/${mbid}?fmt=json&inc=url-rels`);
    return linksFromRelations(full.relations || []);
  }
}
