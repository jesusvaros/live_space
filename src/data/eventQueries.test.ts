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

  it('carries the venue image (https only) as its cover', () => {
    const card = mapEventCard({
      id: 'e3',
      name: 'X',
      starts_at: '2026-10-03T19:00:00Z',
      venue_place: { id: 'v', name: 'Fun Club', city: 'Sevilla', image_url: 'https://funclubsevilla.com/logo.jpg' },
    });
    expect(card.venue_place?.cover_image_url).toBe('https://funclubsevilla.com/logo.jpg');
    const insecure = mapEventCard({
      id: 'e4',
      name: 'Y',
      starts_at: '2026-10-03T19:00:00Z',
      venue_place: { id: 'v', name: 'Intruso', city: 'Madrid', image_url: 'http://example.com/a.jpg' },
    });
    expect(insecure.venue_place?.cover_image_url ?? null).toBeNull();
  });
});
