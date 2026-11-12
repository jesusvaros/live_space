import { describe, expect, it } from 'vitest';
import { mapEventCard } from './eventQueries';
import { getPrimaryArtistName } from '../features/events/utils';

describe('mapEventCard lineup order', () => {
  it('puts the headliner first whatever order PostgREST returns', () => {
    const card = mapEventCard({
      id: 'e1',
      name: 'FRISBI + AGUA DE MADRID',
      starts_at: '2026-10-03T19:00:00Z',
      event_artists: [
        { billing_order: 2, is_headliner: false, artist: { id: 'a2', name: 'Agua de Madrid', image_url: null } },
        { billing_order: 1, is_headliner: true, artist: { id: 'a1', name: 'Frisbi', image_url: null } },
      ],
      media_assets: [],
    });
    expect(card.event_artists?.map(entry => entry.artist?.name)).toEqual(['Frisbi', 'Agua de Madrid']);
    expect(getPrimaryArtistName(card)).toBe('Frisbi');
  });

  it('falls back to billing order when nobody is marked headliner', () => {
    const card = mapEventCard({
      id: 'e2',
      name: 'X',
      starts_at: '2026-10-03T19:00:00Z',
      event_artists: [
        { billing_order: 1, is_headliner: false, artist: { id: 'b', name: 'B' } },
        { billing_order: 0, is_headliner: false, artist: { id: 'a', name: 'A' } },
      ],
    });
    expect(card.event_artists?.map(entry => entry.artist?.name)).toEqual(['A', 'B']);
  });
});
