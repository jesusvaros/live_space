// @vitest-environment node
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { renderPoster } from './posterRender.js';

// A noisy 1600x2000 JPEG: hard to compress, like a busy gig poster.
const noisyPoster = async (width = 1600, height = 2000) => {
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 7;
  for (let index = 0; index < pixels.length; index += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    pixels[index] = (seed >> 16) & 0xff;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 90 }).toBuffer();
};

describe('renderPoster', () => {
  it('produces a ~320 px and a ~800 px WebP and never enlarges', async () => {
    const result = await renderPoster(await noisyPoster());
    expect(result.format).toBe('jpeg');
    const [thumb, card] = result.renditions;
    expect(thumb.name).toBe('thumb');
    expect(card.name).toBe('card');
    // Pure noise is the worst case: the ladder ends at a smaller size.
    expect(thumb.width).toBeLessThanOrEqual(320);
    expect(card.width).toBeLessThanOrEqual(800);
    expect(card.width).toBeGreaterThan(thumb.width);
    expect(card.height / card.width).toBeCloseTo(1.25, 1);
    for (const rendition of result.renditions) {
      expect((await sharp(rendition.bytes).metadata()).format).toBe('webp');
    }

    // A clean poster fits at full size and the first quality.
    const flat = await sharp({ create: { width: 1600, height: 2000, channels: 3, background: '#c33' } }).jpeg().toBuffer();
    const clean = await renderPoster(flat);
    expect(clean.renditions.map((r) => [r.name, r.width, r.height, r.quality])).toEqual([
      ['thumb', 320, 400, 76],
      ['card', 800, 1000, 76],
    ]);

    const small = await renderPoster(await sharp({ create: { width: 300, height: 200, channels: 3, background: '#123' } }).png().toBuffer());
    expect(small.renditions.map((r) => [r.width, r.height])).toEqual([
      [300, 200],
      [300, 200],
    ]);
  }, 30_000);

  it('rejects bytes that are not an image, and tiny trackers', async () => {
    await expect(renderPoster(Buffer.from('<html>Forbidden</html>'))).rejects.toThrow('not a decodable image');
    const pixel = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#000' } }).png().toBuffer();
    await expect(renderPoster(pixel)).rejects.toThrow('image too small');
  });
});
