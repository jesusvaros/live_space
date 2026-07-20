import { describe, expect, it } from 'vitest';
import { parseElementorAgendaDate } from './elementorAgendaParser';

describe('Elementor Spanish agenda dates', () => {
  it('parses abbreviated and full month names', () => {
    expect(parseElementorAgendaDate('28 JULIO 2026')).toBe('28/07/2026 20:00');
    expect(parseElementorAgendaDate('9 ABR 2027')).toBe('09/04/2027 20:00');
  });

  it('rejects non-date headings', () => {
    expect(parseElementorAgendaDate('COMPRAR ENTRADAS')).toBeNull();
  });
});
