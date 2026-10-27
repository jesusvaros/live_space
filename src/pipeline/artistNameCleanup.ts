import { cleanArtistName, hasAmbiguousSpacedDash, smartTitleCase } from '../normalize/cleanArtistName.js';
import { cleanupDisplayText, normalizeForMatching } from '../normalize/normalizeText.js';

// Plans the one-off fix of artist names that are event titles. Pure: the
// script loads rows, this decides, the script applies. Rows are never merged
// or deleted; a cleaned name that already belongs to another artist is only
// reported.

export type ArtistNameRow = { id: string; name: string; normalized_name: string | null };

export type PlannedName = { name: string; normalizedName: string };

export type ArtistCleanupAction =
  | { kind: 'rename'; artistId: string; from: string; to: PlannedName; extra: PlannedName[]; tourName: string | null; caseOnly: boolean }
  | { kind: 'not-artist'; artistId: string; name: string }
  | { kind: 'collision'; artistId: string; from: string; to: string; conflictWith: string }
  | { kind: 'ambiguous'; artistId: string; name: string };

const ARTIST_STOP_WORDS = ['dj set', 'live set', 'live'];

export const toPlannedName = (raw: string): PlannedName => {
  const name = smartTitleCase(cleanupDisplayText(raw));
  return { name, normalizedName: normalizeForMatching(name, ARTIST_STOP_WORDS) };
};

/**
 * @param rawNames artist id → the name as the source wrote it (from staging).
 *   Names stored before the hyphen fix ("Sho - Hai") can only be repaired
 *   from it; without it such names are reported as ambiguous.
 */
export const planArtistCleanup = (
  artists: ArtistNameRow[],
  rawNames: Map<string, string> = new Map(),
): ArtistCleanupAction[] => {
  const owners = new Map<string, string>();
  for (const artist of artists) {
    if (artist.normalized_name) owners.set(artist.normalized_name, artist.name);
  }

  const actions: ArtistCleanupAction[] = [];
  for (const artist of artists) {
    const raw = rawNames.get(artist.id);
    const cleanup = cleanArtistName(raw || artist.name);
    if (cleanup.reason === 'not-artist' || cleanup.names.length === 0) {
      actions.push({ kind: 'not-artist', artistId: artist.id, name: artist.name });
      continue;
    }
    if (!raw && hasAmbiguousSpacedDash(artist.name)) {
      actions.push({ kind: 'ambiguous', artistId: artist.id, name: artist.name });
      continue;
    }

    const [primary, ...extra] = cleanup.names.map(toPlannedName);
    if (extra.length === 0 && primary.name === artist.name) continue;

    const owner = owners.get(primary.normalizedName);
    if (primary.normalizedName !== artist.normalized_name && owner !== undefined) {
      actions.push({ kind: 'collision', artistId: artist.id, from: artist.name, to: primary.name, conflictWith: owner });
      continue;
    }

    owners.set(primary.normalizedName, primary.name);
    actions.push({
      kind: 'rename',
      artistId: artist.id,
      from: artist.name,
      to: primary,
      extra,
      tourName: cleanup.tourName,
      caseOnly: extra.length === 0 && primary.normalizedName === artist.normalized_name,
    });
  }
  return actions;
};

// Finds, among the raw strings captured for an artist's events, the one this
// artist row was derived from.
export const pickRawName = (artist: ArtistNameRow, candidates: string[]): string | null => {
  for (const candidate of candidates) {
    const normalized = normalizeForMatching(cleanupDisplayText(candidate), ARTIST_STOP_WORDS);
    if (normalized && normalized === artist.normalized_name) return candidate;
  }
  return null;
};
