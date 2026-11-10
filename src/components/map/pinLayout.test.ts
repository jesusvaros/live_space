import { describe, expect, it } from 'vitest';
import { pickPosterVenues } from './pinLayout';

const center = { x: 200, y: 400 };

describe('pickPosterVenues', () => {
  it('gives a poster to every venue that does not overlap', () => {
    const picked = pickPosterVenues(
      [
        { id: 'a', x: 100, y: 100 },
        { id: 'b', x: 300, y: 300 },
      ],
      center,
      null,
    );
    expect([...picked].sort()).toEqual(['a', 'b']);
  });

  it('keeps the venue closest to the centre when two would overlap', () => {
    const picked = pickPosterVenues(
      [
        { id: 'far', x: 220, y: 420 },
        { id: 'near', x: 200, y: 400 },
      ],
      center,
      null,
    );
    expect([...picked]).toEqual(['near']);
  });

  it('always gives the selected venue its poster', () => {
    const picked = pickPosterVenues(
      [
        { id: 'near', x: 200, y: 400 },
        { id: 'active', x: 210, y: 410 },
      ],
      center,
      'active',
    );
    expect([...picked]).toEqual(['active']);
  });

  it('caps the number of posters', () => {
    const many = Array.from({ length: 10 }, (_, index) => ({ id: `v${index}`, x: index * 100, y: 0 }));
    expect(pickPosterVenues(many, center, null, 3).size).toBe(3);
  });
});
