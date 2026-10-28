import { supabase } from '../../lib/supabase';
import { normalizeForMatching } from '../../normalize/normalizeText';
import type { WrappedCandidate } from './parseWrapped';

// Matches Wrapped names against the artists catalogue. Exact on the
// normalized name first; then a tolerant pass for OCR slips ("Rosalia" vs
// "Rosalía" is already exact) that only accepts one clear winner.

export type CatalogArtist = {
  id: string;
  subject_id: string;
  name: string;
  avatar_url: string | null;
};

export type WrappedMatch = {
  candidate: WrappedCandidate;
  artist: CatalogArtist | null;
};

type ArtistRow = CatalogArtist & { normalized_name: string | null; status: string | null };

const SELECT = 'id,subject_id,name,avatar_url,normalized_name,status';

const compact = (key: string) => key.replace(/ /g, '');

export const editDistance = (a: string, b: string, max: number): number => {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > max) return max + 1;
    previous = current;
  }
  return previous[b.length];
};

// Short names only match exactly: "Mora" must not become "Moa".
const allowedDistance = (length: number) => (length >= 10 ? 2 : length >= 6 ? 1 : 0);

const rowKey = (row: ArtistRow) => row.normalized_name || normalizeForMatching(row.name);

// Several rows can share a name; prefer the published one with a picture.
const better = (a: ArtistRow, b: ArtistRow) => {
  const score = (row: ArtistRow) => (row.status === 'published' ? 2 : 0) + (row.avatar_url ? 1 : 0);
  return score(b) > score(a) ? b : a;
};

const toArtist = ({ id, subject_id, name, avatar_url }: ArtistRow): CatalogArtist => ({ id, subject_id, name, avatar_url });

const fuzzyPick = (key: string, rows: ArtistRow[]): ArtistRow | null => {
  const target = compact(key);
  const max = allowedDistance(target.length);
  let best: ArtistRow | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let tie = false;
  for (const row of rows) {
    const candidate = compact(rowKey(row));
    if (!candidate) continue;
    const distance = candidate === target ? 0 : editDistance(target, candidate, max);
    if (distance > max) continue;
    if (distance < bestDistance) {
      best = row;
      bestDistance = distance;
      tie = false;
    } else if (distance === bestDistance && best && rowKey(best) !== rowKey(row)) {
      tie = true;
    } else if (distance === bestDistance && best) {
      best = better(best, row);
    }
  }
  return tie ? null : best;
};

export const matchWrappedArtists = async (candidates: WrappedCandidate[]): Promise<WrappedMatch[]> => {
  if (candidates.length === 0) return [];
  const keys = candidates.map(candidate => candidate.key);

  const { data: exactRows, error } = await supabase
    .from('v_subject_artists')
    .select(SELECT)
    .in('normalized_name', keys)
    .neq('status', 'archived')
    .limit(200);
  if (error) throw error;

  const byKey = new Map<string, ArtistRow>();
  for (const row of (exactRows || []) as ArtistRow[]) {
    const key = rowKey(row);
    const current = byKey.get(key);
    byKey.set(key, current ? better(current, row) : row);
  }

  // Tolerant pass: fetch artists sharing the first letters, compare locally.
  const missing = candidates.filter(candidate => !byKey.has(candidate.key) && compact(candidate.key).length >= 6);
  const prefixes = Array.from(
    new Set(missing.map(candidate => candidate.key.slice(0, 3)).filter(prefix => /^[a-z0-9]{3}$/.test(prefix))),
  );
  let looseRows: ArtistRow[] = [];
  if (prefixes.length > 0) {
    // Prefixes are [a-z0-9] only (normalizeForMatching), safe in the filter.
    const filter = prefixes.map(prefix => `normalized_name.ilike.${prefix}*`).join(',');
    const { data, error: looseError } = await supabase
      .from('v_subject_artists')
      .select(SELECT)
      .or(filter)
      .neq('status', 'archived')
      .limit(500);
    if (!looseError) looseRows = (data || []) as ArtistRow[];
  }

  const usedSubjects = new Set<string>();
  const matches: WrappedMatch[] = [];
  for (const candidate of candidates) {
    const row = byKey.get(candidate.key) ?? (compact(candidate.key).length >= 6 ? fuzzyPick(candidate.key, looseRows) : null);
    if (!row) {
      matches.push({ candidate, artist: null });
      continue;
    }
    // Two OCR lines for the same artist: keep the first.
    if (usedSubjects.has(row.subject_id)) continue;
    usedSubjects.add(row.subject_id);
    matches.push({ candidate, artist: toArtist(row) });
  }
  return matches;
};
