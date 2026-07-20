import { describe, expect, it } from 'vitest';

import { parseMovistarArenaDocuments } from './movistarArenaAgendaParser.js';

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
});
