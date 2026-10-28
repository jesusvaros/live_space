import { cleanupDisplayText, normalizeForMatching } from '../../normalize/normalizeText';

// Turns the OCR text of a Spotify Wrapped card into artist-name candidates.
// Wrapped cards mix the artist list with songs, minutes and genres, so lines
// are classified by the heading above them and the UI text is dropped.

export type WrappedCandidate = {
  name: string;
  key: string;
  rank: number | null;
  // Read under an artists heading, so it is an artist even if we lack it.
  listed: boolean;
};

type Section = 'artists' | 'songs' | 'other';

const MAX_CANDIDATES = 20;

const ARTIST_HEADING = /\b(top artists?|artists?|artistas?|artistes?|artistes preferits)\b/;
const SONG_HEADING = /\b(top songs?|songs?|canciones|cancion|cancons|canco|cancoes|tracks?|temas)\b/;
const OTHER_HEADING =
  /\b(minutes?|minutos?|minuts?|listened|escuchad[oa]s?|genres?|generos?|top genre|podcasts?|albums?|albumes?|audiobooks?|audiolibros?)\b/;
// Lines that are never an artist name (keys are already normalized).
const NOISE = /\b(spotify|wrapped|www|http|https)\b|^(tu|your) (ano|year|top)\b/;
const NOISE_KEYS = new Set([
  'tu', 'tus', 'your', 'my', 'mis', 'top', 'de', 'of', 'com', 'compartir', 'share', 'guardar', 'save',
  'escuchas', 'listening', 'personality', 'personalidad',
]);

const RANK = /^#?\s*(10|[1-9])\s*[.)·:-]?\s+(?=\S)/;
// Two columns read as one line: "1 Bad Bunny 1 Flowers".
const MID_RANK = /\s+#?(?:10|[1-9])[.)]?\s+(?=\p{L})/u;

const headingOf = (normalized: string): Section | 'both' | null => {
  if (normalized.split(' ').length > 5) return null;
  const artist = ARTIST_HEADING.test(normalized);
  const song = SONG_HEADING.test(normalized);
  if (artist && song) return 'both';
  if (artist) return 'artists';
  if (song) return 'songs';
  if (OTHER_HEADING.test(normalized)) return 'other';
  return null;
};

const letterCount = (value: string) => (value.match(/\p{L}/gu) || []).length;

const cleanName = (raw: string): { name: string; rank: number | null } | null => {
  let text = cleanupDisplayText(raw.replace(/[#@]/g, ' ').replace(/[“”"]/g, ''));
  let rank: number | null = null;
  const rankMatch = text.match(RANK);
  if (rankMatch) {
    rank = Number(rankMatch[1]);
    text = text.slice(rankMatch[0].length);
  }
  text = text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}!?$)]+$/gu, '').trim();
  if (letterCount(text) < 2 || text.length > 48 || text.split(' ').length > 6) return null;
  // Counters like "52.341" or "1.234 minutos".
  if (/\d{2,}[.,]\d{3}/.test(text)) return null;
  return { name: text, rank };
};

/**
 * @param blocks OCR blocks, each a list of lines in reading order. A heading
 *   applies to the lines after it in the same block, and to later blocks
 *   until another heading appears.
 */
export const extractWrappedCandidates = (blocks: string[][]): WrappedCandidate[] => {
  const out: WrappedCandidate[] = [];
  const seen = new Set<string>();
  let section: Section | null = null;
  let columns: Section[] | null = null;

  // "#1" on its own line, the name on the next one.
  let pendingRank: number | null = null;

  const push = (raw: string, listed: boolean) => {
    const cleaned = cleanName(raw);
    const lineRank = raw.trim().match(/^#?\s*(10|[1-9])[.)]?$/);
    const previousRank = pendingRank;
    pendingRank = lineRank ? Number(lineRank[1]) : cleaned ? null : pendingRank;
    if (!cleaned) return;
    cleaned.rank ??= previousRank;
    const key = normalizeForMatching(cleaned.name);
    if (!key || key.replace(/ /g, '').length < 2 || seen.has(key)) return;
    if (NOISE.test(key) || NOISE_KEYS.has(key) || headingOf(key)) return;
    seen.add(key);
    out.push({ name: cleaned.name, key, rank: cleaned.rank, listed });
  };

  for (const lines of blocks) {
    for (const line of lines) {
      const normalized = normalizeForMatching(line);
      if (!normalized) continue;
      const heading = headingOf(normalized);
      if (heading === 'both') {
        // "Top Artists   Top Songs": remember which column is which.
        const artistAt = normalized.search(ARTIST_HEADING);
        const songAt = normalized.search(SONG_HEADING);
        columns = artistAt < songAt ? ['artists', 'songs'] : ['songs', 'artists'];
        section = 'artists';
        continue;
      }
      if (heading) {
        section = heading;
        columns = null;
        continue;
      }
      const parts = line.split(MID_RANK);
      if (parts.length > 1 && columns) {
        const index = columns.indexOf('artists');
        if (parts[index]) push(parts[index], true);
        continue;
      }
      if (section === 'songs' || section === 'other') continue;
      push(line, section === 'artists' && !columns);
    }
    if (out.length >= MAX_CANDIDATES) break;
  }

  return out.slice(0, MAX_CANDIDATES);
};
