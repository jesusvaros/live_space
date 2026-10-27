// Deterministic look for things that have no image yet: the same name always
// gets the same colours, so a poster or avatar is recognisable across screens.

export const hashString = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export type PosterPalette = { ground: string; ink: string; accent: string; grain: string };

// Gig-poster duotones on the brand ground; the accent is always readable on it.
export const POSTER_PALETTES: PosterPalette[] = [
  { ground: '#ff5b2e', ink: '#14151a', accent: '#f3efe7', grain: 'rgba(20,21,26,0.18)' },
  { ground: '#14151a', ink: '#f3efe7', accent: '#ff5b2e', grain: 'rgba(255,91,46,0.22)' },
  { ground: '#f3efe7', ink: '#14151a', accent: '#ff5b2e', grain: 'rgba(20,21,26,0.12)' },
  { ground: '#1d2a6b', ink: '#f3efe7', accent: '#ffb02e', grain: 'rgba(255,176,46,0.2)' },
  { ground: '#0f3d34', ink: '#e8f5c8', accent: '#ff5b2e', grain: 'rgba(232,245,200,0.14)' },
  { ground: '#5a1630', ink: '#ffd9cc', accent: '#ff8a5c', grain: 'rgba(255,217,204,0.16)' },
  { ground: '#d9ff3f', ink: '#14151a', accent: '#5a1630', grain: 'rgba(20,21,26,0.14)' },
];

export const pickPalette = (seed: string) => POSTER_PALETTES[hashString(seed) % POSTER_PALETTES.length];

export const initials = (name: string) => {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '·';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
};
