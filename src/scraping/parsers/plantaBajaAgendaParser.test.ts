import { describe, expect, it } from 'vitest';

import { readFixture } from '../../test/readFixture';
import { parsePlantaBajaList, plantaBajaBill, plantaBajaDetailTime, plantaBajaEvents } from './plantaBajaAgendaParser';

const source = { name: 'Sala Planta Baja', city: 'Granada', base_url: 'https://plantabaja.club/conciertos/' };
const now = new Date('2026-11-09T12:00:00Z');

describe('Sala Planta Baja agenda', () => {
  it('reads the concert products with the date of their title', () => {
    const cards = parsePlantaBajaList(readFixture('planta-baja-conciertos.html'));

    expect(cards).toHaveLength(37);
    expect(cards[0]).toMatchObject({
      url: 'https://plantabaja.club/mala-gestion-12-11-26/',
      bill: 'MALA GESTIÓN',
      day: 12,
      month: 11,
      year: 2026,
    });
    expect(cards.at(-1)).toMatchObject({ bill: 'PURO INDIE', day: 22, month: 10, year: 2027 });
  });

  it('takes the start time from the product page and splits the bill', () => {
    const cards = parsePlantaBajaList(readFixture('planta-baja-conciertos.html'));
    const detail = readFixture('planta-baja-mujeres.html');
    expect(plantaBajaDetailTime(detail)).toEqual({ hour: 21, minute: 0 });

    const events = plantaBajaEvents(cards, new Map([['https://plantabaja.club/mujeres-14-11-26/', detail]]), source, now);
    expect(events).toHaveLength(37);
    expect(events.find((event) => event.title === 'MUJERES + YO SOMOS')).toMatchObject({
      sourceEventId: 'https://plantabaja.club/mujeres-14-11-26/',
      dateText: '14/11/2026 21:00',
      startsAt: '2026-11-14T21:00:00+01:00',
      city: 'Granada',
      artistNames: ['MUJERES', 'YO SOMOS'],
    });
    // Without the product page only the day is known.
    expect(events[0]).toMatchObject({ title: 'MALA GESTIÓN', dateText: '12/11/2026', startsAt: undefined });
    expect(events.find((event) => event.title?.startsWith('SERPIENTE NEGRA'))?.artistNames).toEqual(['HENRI HERBERT & THE FURY']);
  });

  it('keeps the format of the night out of the performer', () => {
    expect(plantaBajaBill('JOSÉ IGNACIO LAPIDO en acústico + Javi Tejero')).toBe('JOSÉ IGNACIO LAPIDO + Javi Tejero');
    expect(plantaBajaBill('BLUES BAND DE GRANADA especial concierto de NAVIDAD')).toBe('BLUES BAND DE GRANADA');
  });
});
