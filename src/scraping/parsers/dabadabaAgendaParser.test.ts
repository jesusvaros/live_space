import { describe, expect, it } from 'vitest';

import { readFixture } from '../../test/readFixture';
import { dabadabaNextPages, parseDabadabaHtml } from './dabadabaAgendaParser';

const source = { name: 'Dabadaba', city: 'San Sebastián', base_url: 'https://dabadabass.com/es/event?type=6' };

describe('Dabadaba agenda', () => {
  it('reads the concert cards with their UTC start and Odoo id', () => {
    const events = parseDabadabaHtml(readFixture('dabadaba-conciertos.html'), source, new Date('2026-11-09T12:00:00Z'));

    expect(events).toHaveLength(12);
    expect(events[0]).toMatchObject({
      sourceEventUrl: 'https://dabadabass.com/event/cosmopaark-4107',
      sourceEventId: 'dabadaba:4107',
      title: 'Cosmopaark',
      // Odoo stores UTC: 19:00Z is 20:00 in Donostia, the door time on the card.
      startsAt: '2026-11-11T19:00:00Z',
      city: 'San Sebastián',
      artistNames: ['Cosmopaark'],
      imageUrl: 'https://dabadabass.com/web/image/event.event/4107/rrss_web_image',
    });
    expect(events.find((event) => event.sourceEventId === 'dabadaba:3900')?.artistNames).toEqual([
      'Cloud Nothings',
      'Los Sanchos',
      'Giante',
    ]);
  });

  it('skips cards that are not concerts and nights already past', () => {
    const html = readFixture('dabadaba-conciertos.html').replace('<span>Concierto</span>\n                                </div>', '<span>Club</span>\n                                </div>');
    expect(parseDabadabaHtml(html, source, new Date('2026-11-09T12:00:00Z'))).toHaveLength(11);
    expect(parseDabadabaHtml(readFixture('dabadaba-conciertos.html'), source, new Date('2026-11-20T12:00:00Z')).length).toBeLessThan(12);
  });

  it('follows the pager of the filtered list', () => {
    expect(dabadabaNextPages(readFixture('dabadaba-conciertos.html'), source.base_url)).toEqual([
      'https://dabadabass.com/en/event/page/2?type=6&search=&date=upcoming&tags=&country=all',
      'https://dabadabass.com/en/event/page/3?type=6&search=&date=upcoming&tags=&country=all',
      'https://dabadabass.com/en/event/page/4?type=6&search=&date=upcoming&tags=&country=all',
      'https://dabadabass.com/en/event/page/5?type=6&search=&date=upcoming&tags=&country=all',
    ]);
  });
});
