import { describe, expect, it } from 'vitest';
import { parseDateTextToIso } from './normalizeEvent';

describe('Madrid event dates', () => {
  it('uses the Europe/Madrid summer offset', () => {
    expect(parseDateTextToIso('17 julio 2026 20:30')).toBe('2026-07-17T18:30:00.000Z');
  });

  it('uses the Europe/Madrid winter offset', () => {
    expect(parseDateTextToIso('10 diciembre 2026 20:30')).toBe('2026-12-10T19:30:00.000Z');
  });

  it('rolls an undated past month into the next year', () => {
    expect(parseDateTextToIso('10 enero 20:00', new Date('2026-07-17T12:00:00Z'))).toBe(
      '2027-01-10T19:00:00.000Z',
    );
  });
});
