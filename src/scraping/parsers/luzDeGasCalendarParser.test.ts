import { describe, expect, it } from 'vitest';

import { mapLuzDeGasCard } from './luzDeGasCalendarParser.js';

const source = {
  base_url: 'https://luzdegas.com/',
  name: 'Luz de Gas',
  city: 'Barcelona',
};

describe('mapLuzDeGasCard', () => {
  it('maps an official concert card using its WordPress identity', () => {
    const url = 'https://luzdegas.com/es/evento/ramoncin/';
    expect(mapLuzDeGasCard({
      venue: 'Luz de Gas',
      title: 'RAMONCÍN',
      date: 'Vie 27 de noviembre',
      time: '20:00h - 22:00h',
      sourceEventUrl: url,
    }, new Map([[url, '4012']]), source)).toMatchObject({
      sourceEventId: '4012',
      title: 'RAMONCÍN',
      dateText: 'Vie 27 de noviembre 20:00',
      venueName: 'Luz de Gas',
      city: 'Barcelona',
      artistNames: ['RAMONCÍN'],
    });
  });

  it('rejects parties, Sala B cards and posts outside the concert taxonomy', () => {
    const partyUrl = 'https://luzdegas.com/es/evento/nacar/';
    expect(mapLuzDeGasCard({
      venue: 'Luz de Gas',
      title: 'NACAR',
      date: 'Sáb 25 de julio',
      time: '23:59h - 06:00h',
      sourceEventUrl: partyUrl,
    }, new Map(), source)).toBeNull();

    const salaBUrl = 'https://luzdegas.com/es/evento/sala-b/';
    expect(mapLuzDeGasCard({
      venue: 'Sala B',
      title: 'Sala B',
      date: 'Vie 24 de julio',
      time: '23:59h - 06:00h',
      sourceEventUrl: salaBUrl,
    }, new Map([[salaBUrl, '1']]), source)).toBeNull();
  });
});
