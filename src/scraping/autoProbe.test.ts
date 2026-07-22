import { describe, expect, it } from 'vitest';

import type { RawScrapedEvent } from '../types/scrape';
import { assessProbeEvents, isScrapableWebsite } from './autoProbe';

describe('automatic venue source probing', () => {
  it('rejects social profiles and accepts official websites', () => {
    expect(isScrapableWebsite('https://www.instagram.com/sala/')).toBe(false);
    expect(isScrapableWebsite('https://agenda.sala.example/conciertos')).toBe(true);
  });

  it('accepts stable future events from a specific engine', () => {
    const events: RawScrapedEvent[] = [
      {
        sourceUrl: 'https://sala.example/agenda',
        sourceEventUrl: 'https://sala.example/evento/uno',
        sourceEventId: 'uno',
        title: 'Artista Uno',
        startsAt: '2026-10-10T20:00:00+02:00',
        dateText: '10 octubre 2026 20:00',
        rawPayload: {},
      },
    ];
    const first = assessProbeEvents(events, 'json-ld-agenda', new Date('2026-07-22T00:00:00Z'));
    const second = assessProbeEvents([{ ...events[0], rawPayload: { changed: true } }], 'json-ld-agenda', new Date('2026-07-22T00:00:00Z'));

    expect(first.isViable).toBe(true);
    expect(first.confidence).toBe(0.9);
    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it('rejects past events and generic single-card false positives', () => {
    const past: RawScrapedEvent = {
      sourceUrl: 'https://sala.example/',
      sourceEventUrl: 'https://sala.example/noticia',
      title: 'Noticia antigua',
      startsAt: '2025-01-01T20:00:00+01:00',
      rawPayload: {},
    };
    expect(assessProbeEvents([past], 'generic-agenda', new Date('2026-07-22T00:00:00Z')).isViable).toBe(false);
  });

  it('rejects media links and generic single-post results', () => {
    const post: RawScrapedEvent = {
      sourceUrl: 'https://sala.example/',
      sourceEventUrl: 'https://sala.example/programacion-julio.png',
      title: 'Programación artistas Julio 2026',
      startsAt: '2026-07-26T20:00:00+02:00',
      rawPayload: {},
    };
    expect(assessProbeEvents([post], 'wordpress-generic', new Date('2026-07-22T00:00:00Z')).isViable).toBe(false);
  });

  it('rejects a whole archive page mistaken for an event card', () => {
    const archive: RawScrapedEvent = {
      sourceUrl: 'https://sala.example/eventos',
      sourceEventUrl: 'https://sala.example/eventos/#main',
      title: 'Una noticia del archivo',
      startsAt: '2026-12-01T20:00:00+01:00',
      dateText: 'Contenido de archivo '.repeat(150),
      rawPayload: {},
    };
    expect(assessProbeEvents([archive], 'linked-event-cards', new Date('2026-07-22T00:00:00Z')).isViable).toBe(false);
  });
});
