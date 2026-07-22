import { describe, expect, it } from 'vitest';

import { isLinkedEventDetailUrl } from './linkedEventCardsParser';

describe('linked event cards parser', () => {
  it('recognizes event detail paths without matching calendar indexes', () => {
    expect(isLinkedEventDetailUrl('https://sala.example/eventos/artista-2026')).toBe(true);
    expect(isLinkedEventDetailUrl('https://sala.example/calendario')).toBe(false);
    expect(isLinkedEventDetailUrl('https://sala.example/eventos/')).toBe(false);
    expect(isLinkedEventDetailUrl('https://sala.example/eventos/#main')).toBe(false);
  });
});
