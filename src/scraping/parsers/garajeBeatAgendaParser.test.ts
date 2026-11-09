import { describe, expect, it } from 'vitest';

import { readFixture } from '../../test/readFixture';
import { garajeBill, parseGarajeBeatHtml } from './garajeBeatAgendaParser';

const source = { name: 'Garaje Beat Club', city: 'Murcia', base_url: 'https://www.garajebeatclub.es/conciertos-live' };

describe('Garaje Beat Club agenda', () => {
  const events = parseGarajeBeatHtml(readFixture('garaje-beat-conciertos-live.html'), source, new Date('2026-11-09T12:00:00Z'));

  it('reads each night with its start time and ticket link', () => {
    expect(events).toHaveLength(43);
    expect(events.find((event) => event.title === 'TOUNDRA + RAINFOREST B')).toMatchObject({
      sourceEventUrl: 'https://garajebeatclub.compralaentrada.com/eventos/20783/22263/toundra-murcia-2026',
      sourceEventId: 'https://garajebeatclub.compralaentrada.com/eventos/20783/22263/toundra-murcia-2026',
      dateText: '12/12/2026 21:30',
      startsAt: '2026-12-12T21:30:00+01:00',
      city: 'Murcia',
      artistNames: ['TOUNDRA', 'RAINFOREST B'],
      imageUrl: 'https://www.garajebeatclub.es/images/toundra_cartel2026.jpg',
    });
    expect(events.at(-1)).toMatchObject({ title: 'ESCAPE WITH ROMEO', startsAt: '2027-10-10T20:30:00+02:00' });
  });

  it('leaves out the 01:00 club sessions after the concerts', () => {
    expect(events.some((event) => /B2B|DJ BALAS|TANUKICHI/.test(event.title ?? ''))).toBe(false);
    expect(events.every((event) => Number(event.startsAt?.slice(11, 13)) >= 7)).toBe(true);
  });

  it('splits lines of the bill and drops the band a tribute covers', () => {
    expect(garajeBill('THE BUZZ LOVERS [NIRVANA]<br />GREEN LAND [GREEN DAY]')).toBe('THE BUZZ LOVERS + GREEN LAND');
    expect(events.find((event) => event.title?.startsWith('THE BUZZ LOVERS'))?.artistNames).toEqual(['THE BUZZ LOVERS', 'GREEN LAND']);
  });
});
