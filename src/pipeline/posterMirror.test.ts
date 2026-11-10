// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  ENCODE_LADDER,
  fetchablePosterUrl,
  fitsStorageCap,
  MAX_POSTER_ATTEMPTS,
  mirrorDecision,
  nextEncodeStep,
  planPosterMirrors,
  posterErrorMessage,
  posterObjectKey,
  posterPublicUrl,
  posterSourceHash,
  POSTER_RENDITIONS,
  type PosterMirrorRow,
} from './posterMirror.js';

const now = new Date('2026-11-10T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();
const row = (url: string, patch: Partial<PosterMirrorRow>): PosterMirrorRow => ({
  source_hash: posterSourceHash(url),
  status: 'failed',
  attempts: 1,
  checked_at: daysAgo(0),
  ...patch,
});

describe('poster keys', () => {
  it('hashes the URL like public.poster_source_hash() in SQL', () => {
    // Same value the migration returns for this URL (checked against Postgres).
    expect(posterSourceHash('https://x.com/a.jpg')).toBe('2fa2375b5e51baf25b10bd23731de20031daba97b09d0259f9051801ec296561');
  });

  it('derives deterministic, versioned keys per rendition', () => {
    const url = 'https://salagalileo.es/wp-content/uploads/2026/10/cartel.jpg';
    const [thumb, card] = POSTER_RENDITIONS;
    const thumbKey = posterObjectKey(url, thumb);
    expect(thumbKey).toMatch(/^posters\/v1\/[0-9a-f]{32}\/w320\.webp$/);
    expect(posterObjectKey(url, card)).toBe(thumbKey.replace('w320', 'w800'));
    expect(posterObjectKey(url, thumb)).toBe(thumbKey);
    expect(posterObjectKey(`${url}?v=2`, thumb)).not.toBe(thumbKey);
  });

  it('joins the public base URL without double slashes', () => {
    expect(posterPublicUrl('https://media.example.com/', 'posters/v1/abc/w320.webp')).toBe(
      'https://media.example.com/posters/v1/abc/w320.webp',
    );
  });
});

describe('fetchable URLs', () => {
  it('accepts http and https (the server may fetch http)', () => {
    expect(fetchablePosterUrl('http://independanceclub.com/cartel.jpg')?.href).toBe('http://independanceclub.com/cartel.jpg');
    expect(fetchablePosterUrl(' https://a.com/b.webp ')?.hostname).toBe('a.com');
  });

  it('refuses other schemes, credentials and local or private hosts', () => {
    for (const url of [
      null,
      '',
      'not a url',
      'data:image/png;base64,AAAA',
      'ftp://a.com/x.jpg',
      'https://user:pass@a.com/x.jpg',
      'http://localhost/x.jpg',
      'http://127.0.0.1/x.jpg',
      'http://10.1.2.3/x.jpg',
      'http://192.168.1.10/x.jpg',
      'http://172.20.0.1/x.jpg',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/x.jpg',
      'http://printer.local/x.jpg',
    ]) {
      expect(fetchablePosterUrl(url)).toBeNull();
    }
  });
});

describe('mirror decisions', () => {
  const url = 'https://salagalileo.es/cartel.jpg';

  it('mirrors a URL without a row and never re-downloads one that is ok', () => {
    expect(mirrorDecision(url, null, now)).toBe('mirror');
    expect(mirrorDecision(url, row(url, { status: 'ok', attempts: 0 }), now)).toBe('done');
  });

  it('retries failures with a doubling delay and gives up after the last attempt', () => {
    expect(mirrorDecision(url, row(url, { attempts: 1, checked_at: daysAgo(0.5) }), now)).toBe('backoff');
    expect(mirrorDecision(url, row(url, { attempts: 1, checked_at: daysAgo(1) }), now)).toBe('mirror');
    expect(mirrorDecision(url, row(url, { attempts: 3, checked_at: daysAgo(3) }), now)).toBe('backoff');
    expect(mirrorDecision(url, row(url, { attempts: 3, checked_at: daysAgo(4) }), now)).toBe('mirror');
    expect(mirrorDecision(url, row(url, { attempts: MAX_POSTER_ATTEMPTS, checked_at: daysAgo(60) }), now)).toBe('gave_up');
  });

  it('skips URLs the worker must not fetch', () => {
    expect(mirrorDecision('http://localhost/a.jpg', null, now)).toBe('unfetchable');
  });
});

describe('planPosterMirrors', () => {
  it('downloads each URL once for all the events sharing it', () => {
    const plan = planPosterMirrors(
      [
        { id: 'e1', image_url: 'https://a.com/tour.jpg' },
        { id: 'e2', image_url: 'https://a.com/tour.jpg' },
        { id: 'e3', image_url: 'https://b.com/other.jpg' },
        { id: 'e4', image_url: null },
      ],
      new Map(),
      now,
    );
    expect(plan.toMirror.map((item) => [item.sourceUrl, item.eventIds])).toEqual([
      ['https://a.com/tour.jpg', ['e1', 'e2']],
      ['https://b.com/other.jpg', ['e3']],
    ]);
    expect(plan.counts.mirror).toBe(2);
  });

  it('detects a changed image_url: the new URL has no row yet', () => {
    const before = 'https://venue.es/placeholder.jpg';
    const after = 'https://venue.es/real-artwork.jpg';
    const mirrors = new Map([[posterSourceHash(before), row(before, { status: 'ok', attempts: 0 })]]);
    expect(planPosterMirrors([{ id: 'e1', image_url: before }], mirrors, now).toMirror).toEqual([]);
    const changed = planPosterMirrors([{ id: 'e1', image_url: after }], mirrors, now);
    expect(changed.toMirror).toEqual([{ sourceUrl: after, hash: posterSourceHash(after), eventIds: ['e1'], attempts: 0 }]);
  });

  it('carries the attempt count of a failed URL that is due again', () => {
    const url = 'https://gruta77.com/cartel.jpg';
    const mirrors = new Map([[posterSourceHash(url), row(url, { attempts: 2, checked_at: daysAgo(3) })]]);
    expect(planPosterMirrors([{ id: 'e1', image_url: url }], mirrors, now).toMirror[0].attempts).toBe(2);
  });
});

describe('rendition decisions', () => {
  it('keeps the first encode that fits the budget', () => {
    expect(nextEncodeStep(0, 20_000, 25_000)).toBeNull();
  });

  it('steps quality, then size, down while over budget and stops at the end of the ladder', () => {
    expect(ENCODE_LADDER[0]).toEqual({ scale: 1, quality: 76 });
    expect(nextEncodeStep(0, 40_000, 25_000)).toBe(1);
    expect(ENCODE_LADDER[3].scale).toBe(1);
    expect(ENCODE_LADDER[4].scale).toBeLessThan(1);
    expect(nextEncodeStep(ENCODE_LADDER.length - 1, 40_000, 25_000)).toBeNull();
  });

  it('aims at ~320 px and ~800 px within ~25 KB and ~90 KB', () => {
    expect(POSTER_RENDITIONS.map((r) => [r.name, r.width, r.budgetBytes])).toEqual([
      ['thumb', 320, 25_000],
      ['card', 800, 90_000],
    ]);
  });

  it('respects the shared R2 cap', () => {
    expect(fitsStorageCap(8_999_900_000, 100_000, 9_000_000_000)).toBe(true);
    expect(fitsStorageCap(8_999_900_001, 100_000, 9_000_000_000)).toBe(false);
  });

  it('keeps error messages short and on one line', () => {
    const error = Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } });
    expect(posterErrorMessage(error)).toBe('fetch failed · ECONNRESET');
    expect(posterErrorMessage('x'.repeat(500))).toHaveLength(300);
  });
});
