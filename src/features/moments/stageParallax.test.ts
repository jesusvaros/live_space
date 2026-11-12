import { describe, expect, it } from 'vitest';
import { heroParallaxOffset, stageIsMostlyVisible } from './stageParallax';

describe('heroParallaxOffset', () => {
  it('moves the hero at half the scroll speed', () => {
    expect(heroParallaxOffset(0, 500)).toBe(0);
    expect(heroParallaxOffset(200, 500)).toBe(100);
  });

  it('ignores overscroll above the top', () => {
    expect(heroParallaxOffset(-80, 500)).toBe(0);
  });

  it('stops once the hero is long gone', () => {
    expect(heroParallaxOffset(1000, 500)).toBe(500);
    expect(heroParallaxOffset(5000, 500)).toBe(500);
  });

  it('stays still with reduced motion or without a hero', () => {
    expect(heroParallaxOffset(300, 500, { reducedMotion: true })).toBe(0);
    expect(heroParallaxOffset(300, 0)).toBe(0);
  });
});

describe('stageIsMostlyVisible', () => {
  it('needs most of the stage on screen', () => {
    expect(stageIsMostlyVisible(0.3)).toBe(false);
    expect(stageIsMostlyVisible(0.6)).toBe(true);
    expect(stageIsMostlyVisible(1)).toBe(true);
  });
});
