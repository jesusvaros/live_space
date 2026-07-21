import { describe, expect, it } from 'vitest';

import { buildOverpassQuery, isDiscoveryBatchFailure, parseOsmCandidates } from './discovery';

describe('venue discovery', () => {
  it('keeps strong and weak live-music evidence separate', () => {
    const candidates = parseOsmCandidates('Madrid', [
      { type: 'node', id: 1, lat: 40.4, lon: -3.7, tags: { name: 'Sala Uno', amenity: 'music_venue', website: 'salauno.es' } },
      { type: 'way', id: 2, center: { lat: 40.5, lon: -3.6 }, tags: { name: 'Bar Dos', amenity: 'bar', live_music: 'yes' } },
      { type: 'node', id: 3, tags: { amenity: 'nightclub' } },
    ]);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ name: 'Bar Dos', confidence: 0.82, lifecycle_status: 'discovered' });
    expect(candidates[1]).toMatchObject({ name: 'Sala Uno', confidence: 0.97, lifecycle_status: 'ready_for_probe', website_url: 'https://salauno.es' });
  });

  it('builds a scoped administrative-area query', () => {
    expect(buildOverpassQuery('Barcelona')).toContain('["name"="Barcelona"]');
    expect(buildOverpassQuery('Barcelona')).toContain('["amenity"="music_venue"]');
  });

  it('can use a lightweight geographic box', () => {
    const query = buildOverpassQuery('Madrid', [40.31, -3.89, 40.64, -3.51]);
    expect(query).toContain('(40.31,-3.89,40.64,-3.51)');
    expect(query).not.toContain('area.searchArea');
  });

  it('accepts an empty provider snapshot as a valid candidate list', () => {
    expect(parseOsmCandidates('Sevilla', [])).toEqual([]);
  });

  it('fails a batch only when provider errors exceed the allowed rate', () => {
    expect(isDiscoveryBatchFailure(1, 54)).toBe(false);
    expect(isDiscoveryBatchFailure(13, 54)).toBe(false);
    expect(isDiscoveryBatchFailure(14, 54)).toBe(true);
  });
});
