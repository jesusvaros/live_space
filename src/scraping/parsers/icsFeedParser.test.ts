import { describe, expect, it } from 'vitest';

import { readFixture } from '../../test/readFixture';
import { icsBillTitle, icsFeedUrl, icsStartToIso, mapIcsEvents, parseIcsEvents } from './icsFeedParser';

const now = new Date('2026-11-09T12:00:00Z');
const kafe = {
  name: 'Kafe Antzokia',
  city: 'Bilbao',
  base_url: 'https://www.kafeantzokia.eus/agenda/',
  metadata: { categoryAllowlist: ['Kontzertuak'] },
};

describe('iCalendar feed parser', () => {
  it('reads the Kafe Antzokia Events Manager feed and keeps only concerts', () => {
    const raw = parseIcsEvents(readFixture('kafe-antzokia-events.ics'));
    const events = mapIcsEvents(raw, kafe, now);

    expect(raw.length).toBeGreaterThan(events.length);
    expect(events).toHaveLength(80);
    expect(events[0]).toMatchObject({
      sourceEventId: '8966@kafeantzokia.eus',
      sourceEventUrl: 'https://www.kafeantzokia.eus/agenda/the-del-fuegos-kafeantzokia-azaroa2026-bilbo/',
      title: 'The Del Fuegos (Kutxa Beltza aretoan)',
      startsAt: '2026-11-10T20:30:00+01:00',
      venueName: 'Kafe Antzokia',
      city: 'Bilbao',
      artistNames: ['The Del Fuegos'],
      imageUrl: 'https://www.kafeantzokia.eus/k1/wp-content/uploads/2026/07/webka20.jpg',
    });
    // Club nights, theatre and the language school's parties are other categories.
    expect(events.some((event) => /Stereorocks|Antzerkia|Olentzero/.test(event.title ?? ''))).toBe(false);
    // Summer time is applied from the feed's TZID.
    expect(events.find((event) => event.title === 'Macaco')?.startsAt).toBe('2027-04-04T19:00:00+02:00');
  });

  it('drops postponed nights and keeps the bill without room, ticket or tour notes', () => {
    const events = mapIcsEvents(parseIcsEvents(readFixture('kafe-antzokia-events.ics')), kafe, now);
    const byTitle = (prefix: string) => events.filter((event) => event.title?.startsWith(prefix));

    expect(byTitle('Anari (atzeratua')).toHaveLength(0);
    expect(byTitle('Kaparrak')[0]?.artistNames).toEqual(['Kaparrak']);
    expect(byTitle('L.A. GUNS')[0]?.artistNames).toEqual(['L.A. GUNS', 'STICKS N STONES']);
    expect(byTitle('+dMANÁ')[0]?.artistNames).toEqual(['+dMANÁ']);
    expect(byTitle('ELLIOTT MURPHY')[0]?.artistNames).toEqual(['ELLIOTT MURPHY & BAND']);
    expect(byTitle('"Hay Poco')[0]?.artistNames).toEqual([]);
  });

  it('unfolds lines, unescapes text and honours STATUS:CANCELLED', () => {
    const feed = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:1@sala',
      'DTSTART;TZID=Europe/Madrid:20261205T213000',
      'SUMMARY:Banda Uno\\, la gira + Banda',
      '  Dos',
      'CATEGORIES:Conciertos,Música',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:2@sala',
      'DTSTART:20261206T200000Z',
      'SUMMARY:Suspendido por lluvia',
      'STATUS:CANCELLED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const events = mapIcsEvents(parseIcsEvents(feed), { name: 'Sala', city: 'Bilbao', base_url: 'https://sala.example/', metadata: {} }, now);

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ title: 'Banda Uno, la gira + Banda Dos', startsAt: '2026-12-05T21:30:00+01:00' });
  });

  it('converts each DTSTART form and resolves the feed URL', () => {
    expect(icsStartToIso('20260710T220000', ';TZID=Europe/Madrid')).toBe('2026-07-10T22:00:00+02:00');
    expect(icsStartToIso('20261206T200000Z')).toBe('2026-12-06T20:00:00Z');
    expect(icsStartToIso('20261206', ';VALUE=DATE')).toBe('2026-12-06T20:00:00+01:00');
    expect(icsStartToIso('20261206T200000', ';TZID=America/New_York')).toBeNull();
    expect(icsBillTitle('Gailu- (Kutxa Beltza aretoan)')).toBe('Gailu');
    expect(icsFeedUrl({ base_url: 'https://www.kafeantzokia.eus/agenda/', metadata: {} })).toBe('https://www.kafeantzokia.eus/events.ics');
    expect(icsFeedUrl({ base_url: 'https://sala.example/agenda/', metadata: { icsUrl: '/agenda/?ical=1' } })).toBe('https://sala.example/agenda/?ical=1');
  });
});
