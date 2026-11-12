import { describe, expect, it } from 'vitest';
import { frameReadyAt, handoffSource, videoSlots } from './videoHandoff';

describe('frameReadyAt', () => {
  const ready = { readyState: 4, seeking: false, currentTime: 12.1, presented: true };

  it('is ready once a frame near the target is on the video', () => {
    expect(frameReadyAt(ready, 12)).toBe(true);
  });

  it('waits while seeking, without a decoded frame or before a frame was presented', () => {
    expect(frameReadyAt({ ...ready, seeking: true }, 12)).toBe(false);
    expect(frameReadyAt({ ...ready, readyState: 1 }, 12)).toBe(false);
    expect(frameReadyAt({ ...ready, presented: false }, 12)).toBe(false);
  });

  it('waits while the frame is from somewhere else in the clip (the first frame, before the seek)', () => {
    expect(frameReadyAt({ ...ready, currentTime: 0 }, 12)).toBe(false);
    expect(frameReadyAt({ ...ready, currentTime: 0 }, 0.2)).toBe(true);
  });
});

describe('handoffSource', () => {
  const base = { previousId: 'a', previousIsVideo: true, revealedId: 'a', handoffId: null, nextId: 'b', nextIsVideo: true };

  it('keeps the clip on screen until the next one has a frame', () => {
    expect(handoffSource(base)).toBe('a');
  });

  it('keeps what is really on screen when cuts come faster than frames', () => {
    // "b" never showed: "a" is still the one on screen when cutting to "c".
    expect(handoffSource({ ...base, previousId: 'b', revealedId: null, handoffId: 'a', nextId: 'c' })).toBe('a');
  });

  it('needs no handoff back to the clip on screen, from a photo, or to a photo', () => {
    expect(handoffSource({ ...base, previousId: 'b', revealedId: null, handoffId: 'a', nextId: 'a' })).toBeNull();
    expect(handoffSource({ ...base, previousIsVideo: false, revealedId: null })).toBeNull();
    expect(handoffSource({ ...base, nextIsVideo: false })).toBeNull();
    expect(handoffSource({ ...base, nextId: null })).toBeNull();
  });
});

describe('videoSlots', () => {
  const video = (id: string) => ({ id, kind: 'video' });
  const photo = (id: string) => ({ id, kind: 'photo' });

  it('mounts the clip on screen and the next one', () => {
    expect(videoSlots(video('a'), video('b'), null).map(clip => clip.id)).toEqual(['a', 'b']);
  });

  it('never mounts more than two: during a handoff the next one waits', () => {
    expect(videoSlots(video('b'), video('c'), video('a')).map(clip => clip.id)).toEqual(['a', 'b']);
  });

  it('only mounts videos', () => {
    expect(videoSlots(photo('p'), video('b'), null).map(clip => clip.id)).toEqual(['b']);
    expect(videoSlots(video('a'), photo('p'), null).map(clip => clip.id)).toEqual(['a']);
    expect(videoSlots(null, null, null)).toEqual([]);
  });

  it('keeps mounted elements in place (moving a <video> pauses it)', () => {
    expect(videoSlots(video('b'), video('c'), null, ['a', 'b']).map(clip => clip.id)).toEqual(['b', 'c']);
    expect(videoSlots(video('a'), video('b'), null, ['b', 'a']).map(clip => clip.id)).toEqual(['b', 'a']);
  });
});
