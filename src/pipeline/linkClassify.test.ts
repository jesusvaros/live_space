import { describe, expect, it } from 'vitest';

import { readFixture } from '../test/readFixture';
import { extractAgendaFromHtml, extractEventFromHtml } from './eventLinkExtract';
import { agendaToStage, candidateNote, mayBeVenueOrArtist } from './importEventSuggestions';
import { candidateFromUrl, classifyPage, classifyUrl, cleanName, isTicketPlatform } from './linkClassify';

const fixture = (name: string) => readFixture(`suggestions/${name}`);
const jsonLd = (value: unknown, head = '') =>
  `<html><head>${head}</head><body><script type="application/ld+json">${JSON.stringify(value)}</script></body></html>`;

describe('classifyUrl', () => {
  it('artist platforms are artists', () => {
    expect(classifyUrl('https://open.spotify.com/artist/0abcdEFGhijkLMNopqRSTu')).toEqual({ kind: 'artist', platform: 'spotify', handle: null });
    expect(classifyUrl('https://open.spotify.com/intl-es/artist/0abcd')).toMatchObject({ kind: 'artist', platform: 'spotify' });
    expect(classifyUrl('https://music.apple.com/es/artist/los-ejemplos/123')).toMatchObject({ kind: 'artist', platform: 'apple_music' });
    expect(classifyUrl('https://losejemplos.bandcamp.com/album/prueba')).toEqual({ kind: 'artist', platform: 'bandcamp', handle: 'losejemplos' });
    expect(classifyUrl('https://soundcloud.com/losejemplos')).toMatchObject({ kind: 'artist', handle: 'losejemplos' });
  });

  it('social profiles could be a venue or an artist', () => {
    expect(classifyUrl('https://www.instagram.com/mutante_sevilla/')).toEqual({ kind: 'profile', platform: 'instagram', handle: 'mutante_sevilla' });
    expect(classifyUrl('https://www.tiktok.com/@losejemplos')).toMatchObject({ kind: 'profile', handle: 'losejemplos' });
    expect(classifyUrl('https://www.facebook.com/barmutante/')).toMatchObject({ kind: 'profile', platform: 'facebook' });
    expect(classifyUrl('https://www.youtube.com/@barmutante9332')).toMatchObject({ kind: 'profile', platform: 'youtube' });
  });

  it('a Google Maps place is a venue named in the address', () => {
    const place = classifyUrl('https://www.google.com/maps/place/El+Bar+Mutante/@37.39,-5.99,17z/data=!3m1');
    expect(place).toEqual({ kind: 'venue', platform: null, handle: 'El Bar Mutante' });
    expect(candidateFromUrl(place!, 'https://www.google.com/maps/place/El+Bar+Mutante/', '<title>Google Maps</title>')).toMatchObject({
      kind: 'venue',
      name: 'El Bar Mutante',
      links: {},
      evidence: ['url:map'],
    });
    expect(classifyUrl('https://www.google.com/maps/dir//el+mutante/')).toBeNull();
  });

  it('posts, tracks, playlists and everything else are not profiles', () => {
    for (const url of [
      'https://www.instagram.com/p/C0abc/',
      'https://www.instagram.com/reel/C0abc/',
      'https://open.spotify.com/track/123',
      'https://open.spotify.com/playlist/123',
      'https://www.facebook.com/events/123',
      'https://www.youtube.com/watch?v=abc',
      'https://dice.fm/event/abc',
      'https://elbarmutante.com/',
    ]) {
      expect(classifyUrl(url), url).toBeNull();
    }
  });
});

describe('cleanName', () => {
  it('keeps the name out of page titles', () => {
    expect(cleanName('El Bar Mutante &#8211; Bar y espacio de eventos en Sevilla.')).toBe('El Bar Mutante');
    expect(cleanName('Bar Mutante (@mutante_sevilla) • Instagram photos and videos')).toBe('Bar Mutante');
    expect(cleanName('Los Ejemplos en Apple Music')).toBe('Los Ejemplos');
    expect(cleanName('Los Ejemplos | Spotify')).toBe('Los Ejemplos');
    expect(cleanName('Instagram')).toBeNull();
    expect(cleanName('')).toBeNull();
  });
});

describe('classifyPage', () => {
  it('a venue home page without JSON-LD (El Bar Mutante, Sevilla) is a venue with city, address and socials', () => {
    const result = classifyPage(fixture('venue-home-no-json-ld.html'), 'https://elbarmutante.com/#proximoseventos');
    expect(result).toMatchObject({
      kind: 'venue',
      candidate: {
        kind: 'venue',
        name: 'El Bar Mutante',
        city: 'Sevilla',
        website: 'https://elbarmutante.com/',
        links: { instagram: 'https://www.instagram.com/mutante_sevilla/' },
      },
    });
    expect(result?.candidate.address).toMatch(/^Calle Fresa 15/);
    expect(result?.candidate.evidence).toEqual(expect.arrayContaining(['name', 'agenda', 'address', 'map', 'phone']));
  });

  it('the importer sends that page to the classifier (no structured data)', () => {
    const extraction = extractEventFromHtml(fixture('venue-home-no-json-ld.html'), 'https://elbarmutante.com/');
    expect(extraction).toMatchObject({ kind: 'review', reason: 'no-structured-data' });
    expect(mayBeVenueOrArtist(extraction)).toBe(true);
  });

  it('an artist website linking to their Spotify, Bandcamp and Apple Music is an artist', () => {
    const result = classifyPage(fixture('artist-site-no-json-ld.html'), 'https://losejemplos.example/');
    expect(result).toMatchObject({
      kind: 'artist',
      candidate: {
        kind: 'artist',
        name: 'Los Ejemplos',
        city: null,
        website: 'https://losejemplos.example/',
        links: {
          spotify: 'https://open.spotify.com/artist/0abcdEFGhijkLMNopqRSTu',
          bandcamp: 'https://losejemplos.bandcamp.com/',
          apple_music: 'https://music.apple.com/es/artist/los-ejemplos/123456789',
          instagram: 'https://www.instagram.com/losejemplos/',
        },
      },
    });
  });

  it('schema.org says it: BarOrPub → venue, MusicGroup → artist', () => {
    const venue = classifyPage(
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'BarOrPub',
        name: 'Sala Ejemplo',
        url: 'https://salaejemplo.es/',
        address: { '@type': 'PostalAddress', streetAddress: 'Calle Mayor 1', addressLocality: 'Granada', postalCode: '18001' },
        sameAs: ['https://www.instagram.com/salaejemplo/'],
      }),
      'https://salaejemplo.es/contacto/',
    );
    expect(venue).toMatchObject({
      kind: 'venue',
      candidate: {
        name: 'Sala Ejemplo',
        city: 'Granada',
        address: 'Calle Mayor 1',
        website: 'https://salaejemplo.es/',
        links: { instagram: 'https://www.instagram.com/salaejemplo/' },
        evidence: ['json-ld:BarOrPub'],
      },
    });

    const artist = classifyPage(
      jsonLd({ '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite', name: 'x' }, { '@type': 'MusicGroup', name: 'Los Ejemplos', sameAs: 'https://open.spotify.com/artist/abc' }] }),
      'https://losejemplos.example/bio/',
    );
    expect(artist).toMatchObject({ kind: 'artist', candidate: { name: 'Los Ejemplos', links: { spotify: 'https://open.spotify.com/artist/abc' } } });
  });

  it('ticket platforms and ordinary pages are neither', () => {
    // Entradium page without JSON-LD: an event we could not read, not a venue.
    expect(classifyPage(fixture('no-json-ld.html'), 'https://entradium.com/es/events/frisbi-agua-de-madrid')).toBeNull();
    expect(classifyPage(fixture('non-event.html'), 'https://dice.fm/browse/madrid')).toBeNull();
    expect(isTicketPlatform('https://tickets.dice.fm/x')).toBe(true);
    expect(classifyPage('<html><head><title>Receta de croquetas</title></head><body><p>Mezcla la harina.</p></body></html>', 'https://blog.example/croquetas')).toBeNull();
  });
});

describe('candidateFromUrl', () => {
  it('takes the name from the page, else the handle', () => {
    const spotify = classifyUrl('https://open.spotify.com/artist/abc')!;
    expect(
      candidateFromUrl(spotify, 'https://open.spotify.com/artist/abc?si=1', '<meta property="og:title" content="Los Ejemplos"><meta property="og:image" content="https://i.scdn.co/image/x">'),
    ).toMatchObject({ kind: 'artist', name: 'Los Ejemplos', imageUrl: 'https://i.scdn.co/image/x', links: { spotify: 'https://open.spotify.com/artist/abc' } });

    const instagram = classifyUrl('https://www.instagram.com/mutante_sevilla/')!;
    const fromLoginWall = candidateFromUrl(instagram, 'https://www.instagram.com/mutante_sevilla/', '<title>Instagram</title>');
    expect(fromLoginWall).toMatchObject({ kind: 'profile', name: 'mutante_sevilla', links: { instagram: 'https://www.instagram.com/mutante_sevilla/' } });
    expect(candidateNote(fromLoginWall)).toBe('profile-candidate · mutante_sevilla');
    expect(candidateFromUrl(instagram, 'https://www.instagram.com/mutante_sevilla/', null).name).toBe('mutante_sevilla');
  });
});

describe('agenda pages', () => {
  it('stages each upcoming concert, nearest first, capped', () => {
    const html = fixture('agenda-several-events.html');
    const events = extractAgendaFromHtml(html, 'https://salaejemplo.es/agenda/');
    expect(events.length).toBe(2);
    expect(events.map(event => event.startsAt)).toEqual([...events.map(event => event.startsAt)].sort());
    expect(new Set(events.map(event => event.url)).size).toBe(2);
    expect(agendaToStage(events, new Date('2000-01-01T00:00:00Z'), 1)).toHaveLength(1);
    expect(agendaToStage(events, new Date('2100-01-01T00:00:00Z'))).toEqual([]);
  });

  it('events without a page of their own get a distinct url on the agenda', () => {
    const event = (name: string, startDate: string) => ({
      '@type': 'MusicEvent',
      name,
      startDate,
      location: { '@type': 'Place', name: 'Sala Ejemplo', address: { addressLocality: 'Granada' } },
    });
    const html = jsonLd([event('Banda Uno', '2026-12-10T21:00'), event('Banda Dos', '2026-12-03T21:00'), event('Banda Dos', '2026-12-03T21:00')]);
    const events = extractAgendaFromHtml(html, 'https://salaejemplo.es/agenda/');
    expect(events.map(item => item.title)).toEqual(['Banda Dos', 'Banda Uno']);
    expect(events[0].url).toMatch(/^https:\/\/salaejemplo\.es\/agenda\/#Banda%20Dos/);
    expect(events[0].url).not.toBe(events[1].url);
  });
});
