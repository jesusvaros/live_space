import { describe, expect, it } from 'vitest';

import { sourcePageFailureReason } from './fetchSource';

describe('source page validation', () => {
  it('rejects HTTP errors and anti-bot challenge pages', () => {
    expect(sourcePageFailureReason(403, '<html></html>')).toBe('Source returned HTTP 403');
    expect(sourcePageFailureReason(200, '<title>Just a moment...</title><div class="cf-chl-test">')).toContain(
      'anti-bot challenge',
    );
  });

  it('accepts an ordinary agenda response', () => {
    expect(sourcePageFailureReason(200, '<h1>Agenda de conciertos</h1>')).toBeNull();
  });
});
