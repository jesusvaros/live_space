import { describe, expect, it } from 'vitest';
import type { Clip, TimelineMoment } from './concertTimeline';
import { activeMinuteIndex, adjacentClip, groupByMinute, minuteOf, swipeDirection } from './minuteNav';

const T0 = new Date('2026-10-10T20:00:00.000Z').getTime();
const ms = (minutes: number, seconds = 0) => T0 + minutes * 60_000 + seconds * 1000;

const clip = (id: string, user: string, start: number, length = 15_000): Clip => ({
  id,
  trackId: user,
  start,
  end: start + length,
  kind: 'video',
  placement: 'captured',
  lane: 0,
  moment: { id, userId: user, userName: user } as TimelineMoment,
});

// Unordered on purpose: the helpers sort by concert time themselves.
const clips = [
  clip('c', 'pablo', ms(9, 20)),
  clip('a', 'lucia', ms(4, 0)),
  clip('d', 'alex', ms(21, 30)),
  clip('b', 'marta', ms(9, 5)),
  clip('b2', 'lucia', ms(9, 5)),
];

describe('groupByMinute', () => {
  it('groups by the minute each clip starts in, not by person, in concert order', () => {
    const groups = groupByMinute(clips);
    expect(groups.map(group => group.minute)).toEqual([ms(4), ms(9), ms(21)]);
    expect(groups[1].clips.map(item => item.id)).toEqual(['b', 'b2', 'c']);
  });

  it('is empty without clips', () => {
    expect(groupByMinute([])).toEqual([]);
  });

  it('floors to the minute', () => {
    expect(minuteOf(ms(9, 59) + 999)).toBe(ms(9));
  });
});

describe('activeMinuteIndex', () => {
  const groups = groupByMinute(clips);

  it('is the minute of the clip on screen', () => {
    expect(activeMinuteIndex(groups, 'c', ms(30))).toBe(1);
  });

  it('falls back to the last minute already reached, or the first', () => {
    expect(activeMinuteIndex(groups, null, ms(15))).toBe(1);
    expect(activeMinuteIndex(groups, null, ms(1))).toBe(0);
    expect(activeMinuteIndex([], null, ms(1))).toBe(-1);
  });
});

describe('adjacentClip', () => {
  it('walks every clip in concert order', () => {
    expect(adjacentClip(clips, 'a', ms(4), 1)?.id).toBe('b');
    expect(adjacentClip(clips, 'b', ms(9, 5), 1)?.id).toBe('b2');
    expect(adjacentClip(clips, 'c', ms(9, 20), 1)?.id).toBe('d');
    expect(adjacentClip(clips, 'b', ms(9, 5), -1)?.id).toBe('a');
  });

  it('stops at both ends', () => {
    expect(adjacentClip(clips, 'a', ms(4), -1)).toBeNull();
    expect(adjacentClip(clips, 'd', ms(21, 30), 1)).toBeNull();
  });

  it('in a gap, goes to the clips around the time', () => {
    expect(adjacentClip(clips, null, ms(15), 1)?.id).toBe('d');
    expect(adjacentClip(clips, null, ms(15), -1)?.id).toBe('c');
    expect(adjacentClip(clips, null, ms(1), -1)).toBeNull();
  });
});

describe('swipeDirection', () => {
  it('dragging left is the next clip, right the previous one', () => {
    expect(swipeDirection(-90, 10)).toBe(1);
    expect(swipeDirection(90, -10)).toBe(-1);
  });

  it('ignores taps and vertical scrolls', () => {
    expect(swipeDirection(20, 0)).toBe(0);
    expect(swipeDirection(-80, 120)).toBe(0);
  });
});
