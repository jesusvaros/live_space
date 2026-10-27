// Artist photos from the public Deezer search API (no key, ~50 requests per
// 5 s per IP). Deezer's terms ask for attribution and a link; the app
// hotlinks `picture_xl` and keeps the Deezer id in artists.external_ids.

export type DeezerArtist = {
  id: number;
  name: string;
  nb_fan: number;
  picture_xl?: string | null;
  picture_big?: string | null;
};

const DEEZER_SEARCH_URL = 'https://api.deezer.com/search/artist';
const ENSEMBLE_SUFFIX_RE =
  /\s+(?:trio|duo|quartet|quintet|sextet|septet|octet|4tet|5tet|band|project|organ trio|big band|ensemble|group)$/i;

export const deezerMatchKey = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Deezer serves a grey silhouette at ".../images/artist//..." when it has no
// picture.
const hasRealPicture = (artist: DeezerArtist): boolean =>
  Boolean(artist.picture_xl) && !/\/images\/artist\/\//.test(artist.picture_xl || '');

/**
 * Safe matching rule (measured on 447 cleaned names: 350 exact matches,
 * 271 accepted):
 * - only exact normalized name matches count;
 * - a single exact match needs ≥ 50 fans (≥ 1,000 for one-word names such as
 *   "Burning", "Jet" or "Morgan", which collide with unrelated acts);
 * - several exact matches need the top one to have ≥ 1,000 fans and 20× the
 *   runner-up, otherwise it is left for a human.
 */
export const pickDeezerArtist = (name: string, results: DeezerArtist[]): DeezerArtist | null => {
  const key = deezerMatchKey(name);
  if (!key) return null;
  const exact = results
    .filter((artist) => deezerMatchKey(artist.name) === key)
    .sort((left, right) => (right.nb_fan || 0) - (left.nb_fan || 0));
  const [best, runnerUp] = exact;
  if (!best || !hasRealPicture(best)) return null;

  const oneWord = !key.includes(' ');
  if (best.nb_fan < (oneWord ? 1_000 : 50)) return null;
  if (runnerUp && !(best.nb_fan >= 1_000 && best.nb_fan >= 20 * Math.max(runnerUp.nb_fan || 0, 1))) {
    return null;
  }
  return best;
};

// "Albert Vila Quartet" is rarely on Deezer under the ensemble name; the
// leader often is. The leader must be a full name and clearly known.
export const leaderName = (name: string): string | null => {
  const leader = name.replace(ENSEMBLE_SUFFIX_RE, '').trim();
  return leader !== name.trim() && leader.includes(' ') ? leader : null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class DeezerClient {
  private lastRequestAt = 0;

  constructor(
    private readonly minIntervalMs = 250,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async searchArtists(query: string): Promise<DeezerArtist[]> {
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();

    const url = `${DEEZER_SEARCH_URL}?limit=10&q=${encodeURIComponent(query)}`;
    const response = await this.fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Deezer search returned HTTP ${response.status}`);
    const payload = (await response.json()) as { data?: DeezerArtist[]; error?: { message?: string } };
    if (payload.error) throw new Error(`Deezer search error: ${payload.error.message || 'unknown'}`);
    return Array.isArray(payload.data) ? payload.data : [];
  }

  async findArtist(name: string): Promise<{ artist: DeezerArtist; matchedName: string } | null> {
    const direct = pickDeezerArtist(name, await this.searchArtists(name));
    if (direct) return { artist: direct, matchedName: name };

    const leader = leaderName(name);
    if (!leader) return null;
    const results = await this.searchArtists(leader);
    const candidate = pickDeezerArtist(leader, results);
    // Stricter for the fallback: a unique, reasonably known leader.
    const exactCount = results.filter((artist) => deezerMatchKey(artist.name) === deezerMatchKey(leader)).length;
    if (candidate && exactCount === 1 && candidate.nb_fan >= 200) return { artist: candidate, matchedName: leader };
    return null;
  }
}
