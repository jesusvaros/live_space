import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import { pushRoute } from './pushClient';

describe('pushRoute (where a tapped notification may go)', () => {
  it('opens the internal pages a notice points at', () => {
    for (const route of [
      '/event/6f1c2b9e-1111-4000-8000-000000000001',
      '/concierto/morat-wizink-2026-11-20',
      '/tabs/events',
      '/pedidos/abc',
      '/sala/sala-el-sol',
      '/artista/morat',
      '/event/1?from=push',
    ]) {
      expect(pushRoute({ route })).toBe(route);
    }
  });

  it('ignores anything outside the whitelist', () => {
    for (const route of [
      'https://example.com/event/1',
      '//example.com/event/1',
      'javascript:alert(1)',
      '/ajustes/cuenta',
      '/admin',
      '/event/../admin',
      '/eventos/1',
      '',
      42,
    ]) {
      expect(pushRoute({ route })).toBeNull();
    }
    expect(pushRoute({})).toBeNull();
    expect(pushRoute(null)).toBeNull();
  });
});
