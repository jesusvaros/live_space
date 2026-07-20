import { describe, expect, it } from 'vitest';
import { normalizeArtistNames } from './normalizeArtist';

describe('artist separator detection', () => {
  it('does not confuse the letter x inside a name with a lineup separator', () => {
    const result = normalizeArtistNames(['Alex Ubago']);
    expect(result.ambiguous).toBe(false);
    expect(result.artists.map((artist) => artist.displayName)).toEqual(['Alex Ubago']);
  });

  it('still separates an explicit versus lineup', () => {
    const result = normalizeArtistNames(['Artist A vs Artist B']);
    expect(result.ambiguous).toBe(true);
    expect(result.artists.map((artist) => artist.displayName)).toEqual(['Artist A', 'Artist B']);
  });
});
