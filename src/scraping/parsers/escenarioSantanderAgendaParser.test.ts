import { describe, expect, it } from 'vitest';

import { readFixture } from '../../test/readFixture';
import { escenarioBill, parseEscenarioSantanderHtml } from './escenarioSantanderAgendaParser';

const source = { name: 'Escenario Santander', city: 'Santander', base_url: 'https://escenariosantander.com/agenda/' };

describe('Escenario Santander agenda', () => {
  const events = parseEscenarioSantanderHtml(readFixture('escenario-santander-agenda.html'), source, new Date('2026-11-09T12:00:00Z'));

  it('reads every card with the year of its month header', () => {
    expect(events).toHaveLength(50);
    expect(events[0]).toMatchObject({
      sourceEventId: 'https://escenariosantander.com/eventos/nina-polaca/',
      title: 'Niña Polaca',
      dateText: '13/11/2026 21:30',
      startsAt: '2026-11-13T21:30:00+01:00',
      city: 'Santander',
      artistNames: ['Niña Polaca'],
    });
    expect(events.find((event) => event.title === 'Del Remember al Perreo')?.startsAt).toBe('2026-11-21T22:00:00+01:00');
    expect(events.find((event) => event.title === 'Angel Stanich Band')?.startsAt).toBe('2027-01-02T21:30:00+01:00');
    expect(events.at(-1)?.startsAt).toBe('2027-11-19T21:30:00+01:00');
  });

  it('keeps promoters, series and show names out of the performers', () => {
    const artistsOf = (title: string) => events.find((event) => event.title === title)?.artistNames;
    expect(artistsOf('Steve Wynn – Artista invitada: Juana Everett')).toEqual(['Steve Wynn', 'Juana Everett']);
    expect(artistsOf('LOS ANTILUNES presentan PLADÜR + DEATHSHOT')).toEqual(['PLADÜR', 'DEATHSHOT']);
    expect(artistsOf('Uncut en Rock Nights')).toEqual(['Uncut']);
    expect(artistsOf('+dMANÁ «Amar es combatir Show – 20 Aniversario»')).toEqual(['+dMANÁ']);
    expect(escenarioBill('Leif De Leeuw Band Live in Rock Nights')).toBe('Leif De Leeuw Band');
    expect(escenarioBill('Los Deltonos CONCIERTO NAVIDAD')).toBe('Los Deltonos');
  });
});
