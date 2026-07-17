import { describe, expect, it } from 'vitest';
import { cleanupDisplayText, hasExcessiveNoise, normalizeForMatching } from './normalizeText';

describe('concert text normalization', () => {
  it('removes accents, promotional stop words and repeated whitespace', () => {
    expect(normalizeForMatching('  Concierto: León Benavente — EN DIRECTO  ')).toBe(
      'leon benavente',
    );
  });

  it('keeps a readable display value while removing emoji noise', () => {
    expect(cleanupDisplayText('🎸  Zahara   •   Madrid')).toBe('Zahara Madrid');
  });

  it('flags promotional copy for manual review', () => {
    expect(hasExcessiveNoise('Comprar entradas anticipada en taquilla')).toBe(true);
  });
});
