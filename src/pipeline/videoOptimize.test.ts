import { describe, expect, it } from 'vitest';
import { coverKeyFor, encodeArgs, isFastStart, megabitsPerSecond, optimizedKeyFor, planVideo } from './videoOptimize';

const box = (type: string, size: number) => {
  const b = new Uint8Array(size);
  new DataView(b.buffer).setUint32(0, size);
  b.set([...type].map((c) => c.charCodeAt(0)), 4);
  return b;
};
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

describe('videoOptimize', () => {
  it('tells faststart files from ones with the index at the end', () => {
    expect(isFastStart(concat(box('ftyp', 32), box('moov', 64), box('mdat', 16)))).toBe(true);
    expect(isFastStart(concat(box('ftyp', 32), box('mdat', 16), box('moov', 64)))).toBe(false);
    expect(isFastStart(box('ftyp', 32))).toBeNull();
  });

  it('plans a heavy, end-indexed video without cover for both jobs', () => {
    // The Frisbi videos: 40 MB in 15 s.
    const plan = planVideo({ id: 'a', storage_key: 'v/2026/11/x.mp4', bytes: 40_138_845, duration_seconds: 15.172, thumbnail_url: null }, false);
    expect(plan.encode).toBe(true);
    expect(plan.cover).toBe(true);
    expect(megabitsPerSecond(40_138_845, 15.172)).toBeGreaterThan(20);
  });

  it('leaves alone what the phone already compressed', () => {
    const plan = planVideo({ id: 'b', storage_key: 'v/2026/11/y.mp4', bytes: 5_000_000, duration_seconds: 15, thumbnail_url: 'https://x/t.jpg' }, true);
    expect(plan).toEqual({ encode: false, cover: false, reasons: [] });
  });

  it('keeps the original and puts the light copy next to it; never twice', () => {
    expect(optimizedKeyFor('v/2026/11/7d606fdd.mp4')).toBe('v/2026/11/7d606fdd.720p.mp4');
    expect(optimizedKeyFor('v/2026/11/7d606fdd.mov')).toBe('v/2026/11/7d606fdd.720p.mp4');
    expect(optimizedKeyFor('v/2026/11/7d606fdd.720p.mp4')).toBeNull();
    const done = planVideo(
      { id: 'c', storage_key: 'v/2026/11/z.mp4', secure_url: 'https://cdn/v/2026/11/z.720p.mp4', bytes: 40_000_000, duration_seconds: 15, thumbnail_url: 'https://cdn/t/z.jpg' },
      false,
    );
    expect(done.encode).toBe(false);
    expect(done.cover).toBe(false);
  });

  it('puts the cover next to the video', () => {
    expect(coverKeyFor('v/2026/11/7d606fdd.mp4')).toBe('t/2026/11/7d606fdd.jpg');
    expect(coverKeyFor('posters/x.webp')).toBeNull();
  });

  it('encodes to 720p with the index first', () => {
    const args = encodeArgs('in.mp4', 'out.mp4');
    expect(args).toContain('+faststart');
    expect(args.join(' ')).toContain('min(1280');
    expect(args.at(-1)).toBe('out.mp4');
  });
});
