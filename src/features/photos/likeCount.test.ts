import { describe, expect, it } from 'vitest';
import { likesShown } from './likeCount';

describe('likesShown', () => {
  it('adds the like given since the count was loaded', () => {
    expect(likesShown(4, false, true)).toBe(5);
  });

  it('does not count twice a like the loaded count already had', () => {
    expect(likesShown(4, true, true)).toBe(4);
  });

  it('removes a like taken back, never below zero', () => {
    expect(likesShown(4, true, false)).toBe(3);
    expect(likesShown(0, true, false)).toBe(0);
    expect(likesShown(0, false, false)).toBe(0);
  });
});
