import { describe, expect, it } from 'vitest';

import { normalizeSuggestionUrl, suggestionUrlHost } from './url';

describe('normalizeSuggestionUrl', () => {
  it('trims, drops the fragment and tracking parameters, keeps the rest as sent', () => {
    expect(normalizeSuggestionUrl('  https://Entradium.com/es/events/frisbi?utm_source=ig&utm_medium=x&fbclid=abc#comprar ')).toBe(
      'https://entradium.com/es/events/frisbi',
    );
    expect(normalizeSuggestionUrl('https://tickets.example/e?id=12&gclid=z&lang=es')).toBe('https://tickets.example/e?id=12&lang=es');
    expect(normalizeSuggestionUrl('http://sala.example')).toBe('http://sala.example/');
  });

  it('only http(s) links with a host', () => {
    for (const value of ['', 'dice.fm/event/1', 'ftp://x.example/a', 'javascript:alert(1)', 'https://', 'https://a b.example/', 'https://user:pw@x.example/']) {
      expect(normalizeSuggestionUrl(value), value).toBeNull();
    }
    expect(normalizeSuggestionUrl(`https://x.example/${'a'.repeat(2100)}`)).toBeNull();
  });

  it('host as stored in url_host', () => {
    expect(suggestionUrlHost('https://www.Sala.es:8443/x')).toBe('sala.es');
  });
});
