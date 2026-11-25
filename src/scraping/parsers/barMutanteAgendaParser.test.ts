import { describe, expect, it } from 'vitest';

import { readFixture } from '../../test/readFixture';
import { barMutanteBill, barMutanteNextMonthUrl, isBarMutanteConcert, parseBarMutanteHtml } from './barMutanteAgendaParser';

const source = { name: 'El Bar Mutante', city: 'Sevilla', base_url: 'https://elbarmutante.com/eventos/' };
const now = new Date('2026-11-25T09:00:00Z');

describe('El Bar Mutante agenda', () => {
  it('reads the upcoming concerts of the month calendar with time and poster', () => {
    const events = parseBarMutanteHtml(readFixture('bar-mutante-eventos.html'), source, now);

    expect(events.map((event) => event.title)).toEqual([
      'MAWI MATEO EN SEVILLA',
      'The Criollos en Concierto',
      'LA REPÚBLICA DEL TONO · MASTERCLASS + CONCIERTO',
      'DINGO + RED SOUL COMMUNITY',
      'EL ÚLTIMO GRITO + LA LENGUA DEL LENGUAO',
    ]);
    expect(events[0]).toMatchObject({
      sourceEventId: 'https://elbarmutante.com/evento/flamenco-en-sevilla-mawi-mateo/',
      dateText: '26/11/2026 20:30',
      startsAt: '2026-11-26T20:30:00+01:00',
      city: 'Sevilla',
      venueName: 'El Bar Mutante',
      artistNames: ['MAWI MATEO'],
      imageUrl: 'https://elbarmutante.com/wp-content/uploads/2026/10/06.jpg',
    });
    expect(events[3]).toMatchObject({ startsAt: '2026-11-28T21:00:00+01:00', artistNames: ['DINGO', 'RED SOUL COMMUNITY'] });
  });

  it('follows the calendar to the next month', () => {
    const november = readFixture('bar-mutante-eventos.html');
    expect(barMutanteNextMonthUrl(november, source.base_url)).toBe('https://elbarmutante.com/eventos/?mo=12&yr=2026');

    const december = parseBarMutanteHtml(readFixture('bar-mutante-eventos-diciembre.html'), source, now);
    expect(december).toHaveLength(6);
    expect(december.find((event) => event.title === "BLACKMORE'S RISING")?.startsAt).toBe('2026-12-11T21:00:00+01:00');
    expect(december.find((event) => event.title?.startsWith('ANDREAS LUTZ'))?.artistNames).toEqual(['ANDREAS LUTZ', 'RUBÉN SIERRA']);
  });

  it('leaves out the bar series, DJ sessions and the weekend placeholder', () => {
    const titles = parseBarMutanteHtml(readFixture('bar-mutante-eventos.html'), source, new Date('2026-10-20T09:00:00Z')).map(
      (event) => event.title,
    );
    expect(titles).toContain('Tostao en concierto');
    expect(titles).not.toContain('OPEN MIC MUTANTE');
    expect(titles).not.toContain('JUEVES DE REINAS');
    expect(titles).not.toContain('La Jam Mutante');
    expect(titles).not.toContain('POETRY SLAM SEVILLA');
    expect(titles).not.toContain('HACKING SEVILLA');
    expect(titles).not.toContain('Conciertos en el Mutante');
    expect(titles).not.toContain('FAK SCRATCH VS DR. FAKSTEIN');
    expect(titles).not.toContain('NOCHE DE MUSICALES EN BAR MUTANTE');

    expect(isBarMutanteConcert('OZETAK', 'https://elbarmutante.com/evento/ozetak-dj-sesion-en-sevilla-scratch-drumbass/', 23)).toBe(false);
    expect(isBarMutanteConcert('45 Fever IV Aniversario', 'https://elbarmutante.com/evento/discos-45-pulgadas-fiesta-sevilla/', 19)).toBe(false);
    expect(isBarMutanteConcert('DECODE + HELL OF A MIND', 'https://elbarmutante.com/evento/decode/', 20)).toBe(true);
  });

  it('keeps the city, the bar and the subtitle out of the performer', () => {
    expect(barMutanteBill('The Criollos en Concierto')).toBe('The Criollos');
    expect(barMutanteBill('LA RECALCADA · HOMENAJE AL ROCK ARGENTINO')).toBe('LA RECALCADA');
    expect(barMutanteBill('ANDREAS LUTZ & RUBÉN SIERRA EN BAR MUTANTE')).toBe('ANDREAS LUTZ & RUBÉN SIERRA');
  });
});
