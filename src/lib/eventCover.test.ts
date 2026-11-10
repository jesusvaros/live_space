import { describe, expect, it } from 'vitest';

import { eventCoverSources, posterChain, posterSourcesFromRow, safeImageUrl, uniqueImageUrls } from './eventCover';
import { mapEventCard, mapMapEvent } from '../data/eventQueries';

const R2 = 'https://media.example.com/posters/v1/abc';
const poster = { thumb: `${R2}/w320.webp`, card: `${R2}/w800.webp`, original: 'https://salagalileo.es/cartel.png' };

describe('safeImageUrl', () => {
  it('never lets the app request http:// (mixed content in the WebView)', () => {
    expect(safeImageUrl('http://independanceclub.com/cartel.jpg')).toBeNull();
    expect(safeImageUrl('//cdn.example.com/a.jpg')).toBeNull();
    expect(safeImageUrl('javascript:alert(1)')).toBeNull();
    expect(safeImageUrl('')).toBeNull();
    expect(safeImageUrl(42)).toBeNull();
  });

  it('keeps https, data/blob images and same-origin paths', () => {
    expect(safeImageUrl(' https://a.com/x.webp ')).toBe('https://a.com/x.webp');
    expect(safeImageUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(safeImageUrl('/fotos/multitud-escenario.jpg')).toBe('/fotos/multitud-escenario.jpg');
  });

  it('dedupes and drops unsafe values in order', () => {
    expect(uniqueImageUrls(['https://a.com/1', null, 'http://b.com/2', 'https://a.com/1', 'https://c.com/3'])).toEqual([
      'https://a.com/1',
      'https://c.com/3',
    ]);
  });
});

describe('poster fallback chain', () => {
  it('lists and the map: thumbnail → card → original', () => {
    expect(posterChain(poster, 'thumb')).toEqual([poster.thumb, poster.card, poster.original]);
  });

  it('detail: card → original → thumbnail', () => {
    expect(posterChain(poster, 'card')).toEqual([poster.card, poster.original, poster.thumb]);
  });

  it('before the mirror runs, only the https original; an http original is skipped', () => {
    expect(posterChain(posterSourcesFromRow({ image_url: 'https://a.com/p.jpg' }), 'thumb')).toEqual(['https://a.com/p.jpg']);
    expect(posterChain(posterSourcesFromRow({ image_url: 'http://www.intrusobar.com/p.jpg' }), 'card')).toEqual([]);
  });

  it('puts a fan photo first and extra candidates (headliner photo) last', () => {
    const fan = 'https://res.cloudinary.com/x/fan.jpg';
    const avatar = 'https://cdn.deezer.com/artist.jpg';
    expect(eventCoverSources({ cover_image_url: fan, poster_sources: poster }, 'thumb', [avatar])).toEqual([
      fan,
      poster.thumb,
      poster.card,
      poster.original,
      avatar,
    ]);
    // cover_image_url already being the poster's card does not jump the thumbnail.
    expect(eventCoverSources({ cover_image_url: poster.card, poster_sources: poster }, 'thumb')).toEqual([
      poster.thumb,
      poster.card,
      poster.original,
    ]);
    // Cached cards from before the mirror only have cover_image_url.
    expect(eventCoverSources({ cover_image_url: 'https://a.com/p.jpg' }, 'card')).toEqual(['https://a.com/p.jpg']);
  });
});

describe('event card mappers', () => {
  const row = {
    id: 'e1',
    name: 'Concierto',
    starts_at: '2026-12-01T20:00:00Z',
    image_url: poster.original,
    poster_thumb_url: poster.thumb,
    poster_url: poster.card,
    media_assets: [],
    event_artists: [],
  };

  it('uses the R2 card size as the cover and keeps every poster URL for the chain', () => {
    const card = mapEventCard(row);
    expect(card.cover_image_url).toBe(poster.card);
    expect(card.poster_sources).toEqual(poster);
  });

  it('falls back to the https original until the poster is mirrored, never to http', () => {
    expect(mapEventCard({ ...row, poster_thumb_url: null, poster_url: null }).cover_image_url).toBe(poster.original);
    expect(
      mapEventCard({ ...row, poster_thumb_url: null, poster_url: null, image_url: 'http://a.com/p.jpg' }).cover_image_url,
    ).toBeNull();
  });

  it('prefers a published fan photo', () => {
    const fan = { kind: 'image', status: 'published', secure_url: 'https://res.cloudinary.com/f.jpg', thumbnail_url: null, created_at: '2026-12-02' };
    expect(mapEventCard({ ...row, media_assets: [fan] }).cover_image_url).toBe(fan.secure_url);
  });

  it('gives the map the thumbnail, then the card size, never the heavy original', () => {
    const mapEvent = mapMapEvent(row, new Map(), new Map());
    expect(mapEvent.cover_sources).toEqual([poster.thumb, poster.card]);
  });
});
