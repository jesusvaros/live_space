import { describe, expect, it } from 'vitest';
import { createDeterministicHash } from './hash';
import { stringSimilarity } from './stringSimilarity';

describe('data quality primitives', () => {
  it('hashes objects independently of key insertion order', () => {
    expect(createDeterministicHash({ artist: 'Zahara', city: 'Madrid' })).toBe(
      createDeterministicHash({ city: 'Madrid', artist: 'Zahara' }),
    );
  });

  it('recognizes close names without treating unrelated names as equal', () => {
    expect(stringSimilarity('sala apolo', 'sala apolo barcelona')).toBeGreaterThan(0.6);
    expect(stringSimilarity('sala apolo', 'razzmatazz')).toBeLessThan(0.3);
  });
});
