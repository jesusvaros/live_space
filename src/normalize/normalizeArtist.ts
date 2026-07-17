import type { ArtistRole, NormalizedArtist } from '../types/domain.js';
import { cleanupDisplayText, normalizeForMatching } from './normalizeText.js';

export type ArtistNormalizationResult = {
  artists: NormalizedArtist[];
  ambiguous: boolean;
  reasons: string[];
};

type SplitResult = {
  name: string;
  role: ArtistRole;
  confidence: number;
};

const FESTIVAL_SIGNALS = /\bfestival|cartel|lineup|line up|all day|varios artistas|various artists\b/i;
const GUEST_SIGNALS = /\b(invitad[oa]s?|special guests?|guests?)\b/i;

const detectSplitPattern = (value: string): { parts: SplitResult[]; ambiguous: boolean } | null => {
  const featurePattern = /\s+(?:feat\.?|ft\.?|featuring)\s+/i;
  const withPattern = /\s+(?:con|with)\s+/i;

  if (featurePattern.test(value)) {
    const [headliner, ...guests] = value.split(featurePattern).map((part) => cleanupDisplayText(part));
    return {
      parts: [
        { name: headliner, role: 'headliner', confidence: 0.88 },
        ...guests.filter(Boolean).map((guest) => ({ name: guest, role: 'guest' as const, confidence: 0.8 })),
      ],
      ambiguous: false,
    };
  }

  if (withPattern.test(value)) {
    const [headliner, ...guests] = value.split(withPattern).map((part) => cleanupDisplayText(part));
    return {
      parts: [
        { name: headliner, role: 'headliner', confidence: 0.8 },
        ...guests.filter(Boolean).map((guest) => ({ name: guest, role: 'guest' as const, confidence: 0.74 })),
      ],
      ambiguous: true,
    };
  }

  const genericSeparators = [' + ', ' / ', ' & ', ',', ' x ', ' vs ', ' b2b '];
  for (const separator of genericSeparators) {
    if (!value.toLowerCase().includes(separator.trim())) {
      continue;
    }

    const parts = value
      .split(new RegExp(separator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
      .map((part) => cleanupDisplayText(part))
      .filter(Boolean)
      .map((name, index) => ({
        name,
        role: index === 0 ? ('headliner' as const) : ('support' as const),
        confidence: separator.includes('+') || separator.includes('/') ? 0.72 : 0.68,
      }));

    return {
      parts,
      ambiguous: true,
    };
  }

  return null;
};

const normalizeArtistEntry = (
  rawName: string,
  role: ArtistRole = 'unknown',
  confidence = 0.7
): NormalizedArtist | null => {
  const displayName = cleanupDisplayText(rawName);
  const normalizedName = normalizeForMatching(displayName, ['dj set', 'live set', 'live']);

  if (!displayName || !normalizedName || GUEST_SIGNALS.test(displayName)) {
    return null;
  }

  return {
    rawName,
    displayName,
    normalizedName,
    role,
    confidence,
  };
};

export const normalizeArtistNames = (
  rawNames: string[] | undefined,
  fallbackTitle?: string
): ArtistNormalizationResult => {
  const reasons: string[] = [];
  const candidates = (rawNames || []).map((value) => cleanupDisplayText(value)).filter(Boolean);
  if (candidates.length === 0 && fallbackTitle) {
    candidates.push(cleanupDisplayText(fallbackTitle));
  }

  const artistMap = new Map<string, NormalizedArtist>();
  let ambiguous = false;

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    if (FESTIVAL_SIGNALS.test(candidate)) {
      ambiguous = true;
      reasons.push('festival-like-title');
      continue;
    }

    if (GUEST_SIGNALS.test(candidate)) {
      ambiguous = true;
      reasons.push('guest-indicators');
    }

    const split = detectSplitPattern(candidate);
    if (split) {
      ambiguous = ambiguous || split.ambiguous;
      for (const part of split.parts) {
        const artist = normalizeArtistEntry(part.name, part.role, part.confidence);
        if (artist && !artistMap.has(artist.normalizedName)) {
          artistMap.set(artist.normalizedName, artist);
        }
      }
      continue;
    }

    const artist = normalizeArtistEntry(candidate, 'headliner', candidates.length > 1 ? 0.86 : 0.78);
    if (artist && !artistMap.has(artist.normalizedName)) {
      artistMap.set(artist.normalizedName, artist);
    }
  }

  const artists = Array.from(artistMap.values());
  if (artists.length === 0) {
    reasons.push('no-artists-detected');
  }

  if ((rawNames || []).length === 0 && artists.length > 1) {
    ambiguous = true;
    reasons.push('title-split-ambiguous');
  }

  return {
    artists,
    ambiguous,
    reasons: Array.from(new Set(reasons)),
  };
};
