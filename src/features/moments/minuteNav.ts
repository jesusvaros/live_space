import type { Clip } from './concertTimeline';

// Navigation of the concert player by the minute of the concert in which each
// clip was recorded (not by person): the minute strip, the «Por minuto» list
// and the previous / next buttons and swipes. Pure, shared with the tests.

export const MINUTE_MS = 60_000;

export type MinuteGroup = {
  // Concert time (epoch ms) of the minute, floored: 21:34:00.000.
  minute: number;
  // Its clips, in concert order (start, then id).
  clips: Clip[];
};

export const minuteOf = (t: number) => Math.floor(t / MINUTE_MS) * MINUTE_MS;

const byStart = (left: Clip, right: Clip) => left.start - right.start || left.id.localeCompare(right.id);

/** Clips grouped by the minute they start in, minutes and clips in concert order. */
export const groupByMinute = (clips: Clip[]): MinuteGroup[] => {
  const groups = new Map<number, Clip[]>();
  for (const clip of [...clips].sort(byStart)) {
    const minute = minuteOf(clip.start);
    const group = groups.get(minute);
    if (group) group.push(clip);
    else groups.set(minute, [clip]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([minute, items]) => ({ minute, clips: items }));
};

/**
 * The minute to highlight: the one the clip on screen started in, else (a gap,
 * the end) the last minute that started at or before `t`, else the first.
 */
export const activeMinuteIndex = (groups: MinuteGroup[], activeClipId: string | null, t: number) => {
  if (groups.length === 0) return -1;
  if (activeClipId) {
    const index = groups.findIndex(group => group.clips.some(clip => clip.id === activeClipId));
    if (index >= 0) return index;
  }
  let found = 0;
  groups.forEach((group, index) => {
    if (group.minute <= t) found = index;
  });
  return found;
};

/**
 * The clip before or after the one on screen, in concert order (every clip,
 * every angle, one after another). With nothing on screen (a gap), the next
 * is the first clip starting after `t` and the previous the last one that
 * started at or before it. null at either end.
 */
export const adjacentClip = (clips: Clip[], activeClipId: string | null, t: number, direction: 1 | -1): Clip | null => {
  const ordered = [...clips].sort(byStart);
  const index = activeClipId ? ordered.findIndex(clip => clip.id === activeClipId) : -1;
  if (index >= 0) return ordered[index + direction] ?? null;
  if (direction === 1) return ordered.find(clip => clip.start > t) ?? null;
  for (let position = ordered.length - 1; position >= 0; position -= 1) {
    if (ordered[position].start <= t) return ordered[position];
  }
  return null;
};

/** Minimum horizontal travel (px) for a swipe on the picture to change clip. */
export const SWIPE_MIN_PX = 56;

/**
 * A finished drag on the picture: -1 / 1 (previous / next clip, like flipping
 * pages: dragging left brings the next one) or 0 when it was not a clear
 * horizontal swipe (a tap, or a vertical scroll of the page).
 */
export const swipeDirection = (dx: number, dy: number): -1 | 0 | 1 => {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
};
