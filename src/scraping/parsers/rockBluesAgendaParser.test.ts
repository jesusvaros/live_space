import { describe, expect, it } from 'vitest';

import { readFixture } from '../../test/readFixture';
import { jsonArrayAfter, parseRockBluesHtml } from './rockBluesAgendaParser';

const source = { name: 'Rock & Blues Café', city: 'Zaragoza', base_url: 'https://www.rockandbluescafe.com/conciertos/' };

describe('Rock & Blues Café agenda', () => {
  it('reads every upcoming night from the embedded agenda data', () => {
    const events = parseRockBluesHtml(readFixture('rock-blues-conciertos.html'), source, new Date('2026-11-09T12:00:00Z'));

    expect(events).toHaveLength(71);
    expect(events[0]).toMatchObject({
      sourceEventId: 'https://www.rockandbluescafe.com/conciertos/cretino-the-cretiners-zaragoza-11-11-2026/',
      title: 'CRETINO & THE CRETINERS',
      dateText: '11/11/2026 21:00',
      startsAt: '2026-11-11T21:00:00+01:00',
      venueName: 'Rock & Blues Café',
      city: 'Zaragoza',
      artistNames: ['CRETINO & THE CRETINERS'],
    });
    expect(events.find((event) => event.title?.startsWith('FRANKIE AND THE WITCH'))?.artistNames).toEqual([
      'FRANKIE AND THE WITCH FINGERS',
      'DEATH CULT',
    ]);
    // The year comes from the canonical URL, also across New Year and DST.
    expect(events.at(-1)).toMatchObject({ title: 'THE MUGGS', startsAt: '2027-05-27T21:00:00+02:00' });
  });

  it('drops nights already past', () => {
    expect(parseRockBluesHtml(readFixture('rock-blues-conciertos.html'), source, new Date('2026-12-01T12:00:00Z')).length).toBeLessThan(71);
  });

  it('reads a JSON array whose strings contain brackets', () => {
    expect(jsonArrayAfter('const rbEventsData = [{"titulo":"A [live]"}];', 'rbEventsData')).toEqual([{ titulo: 'A [live]' }]);
    expect(jsonArrayAfter('<p>sin agenda</p>', 'rbEventsData')).toEqual([]);
  });
});
