import { describe, expect, it } from 'vitest';
import { hidesBottomNav } from './BottomNav';

describe('hidesBottomNav', () => {
  it('keeps the bar on detail pages so you never get lost', () => {
    for (const path of [
      '/tabs/artist/a1',
      '/artista/rosalia',
      '/tabs/venue/v1',
      '/sala/la-riviera',
      '/event/e1',
      '/concierto/morat-madrid',
      '/post/p1',
      '/tabs/festival/f1',
      '/tabs/events',
    ]) {
      expect(hidesBottomNav(path), path).toBe(false);
    }
  });

  it('hides it in full-screen flows', () => {
    for (const path of [
      '/tabs/upload',
      '/subir/sugerido',
      '/tabs/create-event',
      '/create-event',
      '/gestion',
      '/gestion/evento/e1/qr',
      '/reclamar/artist/a1',
      '/bienvenida',
      '/empezar',
      '/welcome',
    ]) {
      expect(hidesBottomNav(path), path).toBe(true);
    }
  });
});
