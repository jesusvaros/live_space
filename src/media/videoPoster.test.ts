import { describe, expect, it } from 'vitest';
import { BLANK_POSTER, videoPoster } from './videoPoster';

describe('videoPoster', () => {
  it('uses the first image it is given', () => {
    expect(videoPoster(null, 'https://cdn/thumb.jpg', 'https://cdn/cover.jpg')).toBe('https://cdn/thumb.jpg');
  });

  it('falls back to a transparent image, never to no poster', () => {
    expect(videoPoster()).toBe(BLANK_POSTER);
    expect(videoPoster(null, undefined, '', '  ')).toBe(BLANK_POSTER);
    expect(BLANK_POSTER.startsWith('data:image/gif;base64,')).toBe(true);
  });
});
