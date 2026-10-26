import { describe, expect, it } from 'vitest';

import {
  parseMovistarArenaCards,
  parseMovistarArenaDocuments,
} from './movistarArenaAgendaParser.js';

const source = {
  base_url: 'https://www.movistararena.es/programacion/?cat%5B%5D=1',
  name: 'Movistar Arena',
  city: 'Madrid',
};

describe('parseMovistarArenaDocuments', () => {
  it('reads concert list items and derives the Madrid date from their canonical URL', () => {
    const document = JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [{
        '@type': 'ItemList',
        itemListElement: [{
          '@type': 'ListItem',
          position: 1,
          url: 'https://www.movistararena.es/programacion/evento/morrissey-live-in-concert/29-7-2026/21%3A00',
          name: 'Morrissey - Live In Concert',
          item: {
            '@type': 'Event',
            '@id': 'movistar:morrissey:2026-07-29',
            name: 'Morrissey - Live In Concert',
            url: 'https://www.movistararena.es/programacion/evento/morrissey-live-in-concert/29-7-2026/21%3A00',
          },
        }],
      }],
    });

    expect(parseMovistarArenaDocuments([document], source)).toEqual([
      expect.objectContaining({
        title: 'Morrissey - Live In Concert',
        dateText: '29/7/2026 21:00',
        sourceEventId: 'movistar:morrissey:2026-07-29',
        venueName: 'Movistar Arena',
        city: 'Madrid',
      }),
    ]);
  });

  it('ignores invalid JSON and list items without an event date', () => {
    const document = JSON.stringify({
      '@type': 'ItemList',
      itemListElement: [{ '@type': 'ListItem', item: { '@type': 'Event', name: 'Sin fecha' } }],
    });

    expect(parseMovistarArenaDocuments(['not json', document], source)).toEqual([]);
  });

  it('supports the current string-based JSON-LD items', () => {
    const document = JSON.stringify({
      '@type': 'ItemList',
      itemListElement: [{
        '@type': 'ListItem',
        name: 'Pitbull - I\'M BACK',
        url: 'https://www.movistararena.es/programacion/evento/pitbull/5-11-2026/20:30',
        item: 'https://www.movistararena.es/programacion/evento/pitbull/5-11-2026/20:30',
      }],
    });

    expect(parseMovistarArenaDocuments([document], source)).toEqual([
      expect.objectContaining({ title: "Pitbull - I'M BACK", dateText: '5/11/2026 20:30' }),
    ]);
  });

  it('deduplicates cards and excludes basketball leaked by the venue filter', () => {
    const cards = [
      {
        title: 'Jungle',
        href: '/programacion/evento/jungle/26-10-2026/21:00',
        eventId: '2922',
        startsAt: '2026-10-26T21:00:00+01:00',
      },
      {
        title: 'Jungle',
        href: '/programacion/evento/jungle/26-10-2026/21:00',
        eventId: '2922',
        startsAt: '2026-10-26T21:00:00+01:00',
      },
      {
        title: 'Real Madrid vs Recoletas Salud SPB - Jornada 6 Liga Endesa 26/27',
        href: '/programacion/evento/real-madrid-vs-spb/1-11-2026/12:30',
        startsAt: '2026-11-01T12:30:00+01:00',
      },
    ];

    expect(parseMovistarArenaCards(cards, source)).toEqual([
      expect.objectContaining({ title: 'Jungle', startsAt: '2026-10-26T21:00:00+01:00' }),
    ]);
  });
});
