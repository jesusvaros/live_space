import { describe, expect, it } from 'vitest';
import { MAX_PULL, PULL_THRESHOLD, PullGesture, pullDistance } from './pullGesture';

describe('pullDistance', () => {
  it('is 0 going up and grows with resistance, never past the maximum', () => {
    expect(pullDistance(-20)).toBe(0);
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(50)).toBeLessThan(50);
    expect(pullDistance(100)).toBeGreaterThan(pullDistance(50));
    expect(pullDistance(10_000)).toBeLessThanOrEqual(MAX_PULL);
  });

  it('reaches the threshold with a deliberate pull, not a nudge', () => {
    expect(pullDistance(60)).toBeLessThan(PULL_THRESHOLD);
    expect(pullDistance(200)).toBeGreaterThanOrEqual(PULL_THRESHOLD);
  });
});

describe('PullGesture', () => {
  it('refreshes after a long pull down from the top', () => {
    const gesture = new PullGesture();
    gesture.start(100, 100, true);
    expect(gesture.move(100, 104, true)).toEqual({ distance: 0, preventDefault: false });
    const move = gesture.move(102, 330, true);
    expect(gesture.pulling).toBe(true);
    expect(move.preventDefault).toBe(true);
    expect(move.distance).toBeGreaterThanOrEqual(PULL_THRESHOLD);
    expect(gesture.end()).toBe(true);
  });

  it('does not refresh a short pull', () => {
    const gesture = new PullGesture();
    gesture.start(100, 100, true);
    gesture.move(100, 150, true);
    expect(gesture.end()).toBe(false);
  });

  it('leaves a scrolled list alone', () => {
    const gesture = new PullGesture();
    gesture.start(100, 100, false);
    expect(gesture.move(100, 400, true).preventDefault).toBe(false);
    expect(gesture.end()).toBe(false);
  });

  it('leaves scrolling down (finger up) alone', () => {
    const gesture = new PullGesture();
    gesture.start(100, 400, true);
    expect(gesture.move(100, 300, true).preventDefault).toBe(false);
    expect(gesture.move(100, 600, true).preventDefault).toBe(false);
    expect(gesture.end()).toBe(false);
  });

  it('leaves a horizontal swipe (a carousel) alone', () => {
    const gesture = new PullGesture();
    gesture.start(100, 100, true);
    expect(gesture.move(200, 130, true).preventDefault).toBe(false);
    expect(gesture.move(260, 400, true).preventDefault).toBe(false);
    expect(gesture.end()).toBe(false);
  });

  it('gives the scroll back when the finger returns above where it started', () => {
    const gesture = new PullGesture();
    gesture.start(100, 100, true);
    gesture.move(100, 200, true);
    const back = gesture.move(100, 90, true);
    expect(back).toEqual({ distance: 0, preventDefault: false });
    expect(gesture.end()).toBe(false);
  });
});
