import { describe, expect, it } from 'vitest';

import { parseJsonLdDocuments } from './jsonLdAgendaParser.js';

const source = {
  base_url: 'https://venue.example/agenda',
  name: 'Sala Example',
  city: 'Madrid',
};

describe('JSON-LD agenda parser', () => {
  it('extracts schema.org events from graphs and resolves relative URLs', () => {
    const events = parseJsonLdDocuments(
      [
        JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'MusicEvent',
              '@id': '/events/show-1',
              name: 'Artista Uno + Artista Dos',
              startDate: '2026-09-12T20:30:00+02:00',
              performer: [{ '@type': 'MusicGroup', name: 'Artista Uno' }, { name: 'Artista Dos' }],
              location: {
                '@type': 'Place',
                name: 'Sala Example',
                address: { addressLocality: 'Madrid' },
              },
            },
          ],
        }),
      ],
      source
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sourceEventUrl: 'https://venue.example/events/show-1',
      title: 'Artista Uno + Artista Dos',
      startsAt: '2026-09-12T20:30:00+02:00',
      venueName: 'Sala Example',
      city: 'Madrid',
      artistNames: ['Artista Uno', 'Artista Dos'],
    });
  });

  it('ignores invalid documents and events without title or date', () => {
    const events = parseJsonLdDocuments(
      ['not json', JSON.stringify([{ '@type': 'Event', name: 'No date' }, { '@type': 'Organization' }])],
      source
    );

    expect(events).toEqual([]);
  });

  it('deduplicates repeated events by canonical URL', () => {
    const event = { '@type': 'Event', name: 'Same show', startDate: '2026-10-01', url: '/same' };
    expect(parseJsonLdDocuments([JSON.stringify([event, event])], source)).toHaveLength(1);
  });
});
