import { describe, expect, it } from 'vitest';
import type { EventSetlistEntry } from '../../lib/types';
import { songAtTime } from '../../lib/songAssignment';
import {
  buildConcertTimeline,
  buildSongSegments,
  clipsAt,
  DEFAULT_VIDEO_SEC,
  ESTIMATED_SONG_MS,
  manualStillApplies,
  MIN_HOLD_MS,
  nextClipStart,
  pickClip,
  PHOTO_SEC,
  resolvePlayhead,
  songSegmentAt,
  upcomingClip,
  type TimelineMoment,
} from './concertTimeline';

const STARTS = '2026-10-10T20:00:00.000Z';
const ENDS = '2026-10-10T22:00:00.000Z';
const T0 = new Date(STARTS).getTime();
const at = (minutes: number, seconds = 0) => new Date(T0 + minutes * 60_000 + seconds * 1000).toISOString();
const ms = (minutes: number, seconds = 0) => T0 + minutes * 60_000 + seconds * 1000;

let seq = 0;
const moment = (overrides: Partial<TimelineMoment>): TimelineMoment => {
  seq += 1;
  return {
    id: `m${seq}`,
    userId: 'u-lucia',
    userName: 'lucia',
    mediaType: 'video',
    mediaUrl: `https://cdn.test/${seq}.mp4`,
    thumbnailUrl: null,
    capturedAt: at(10),
    createdAt: `2026-10-11T10:00:${String(seq % 60).padStart(2, '0')}.000Z`,
    songId: null,
    durationSec: 20,
    likes: 0,
    ...overrides,
  };
};

const setlistEntry = (ordinal: number, overrides: Partial<EventSetlistEntry> = {}): EventSetlistEntry => ({
  event_id: 'e1',
  ordinal,
  performer_artist_id: null,
  song_id: `s${ordinal}`,
  song_title: `Canción ${ordinal}`,
  starts_offset_ms: null,
  ends_offset_ms: null,
  created_at: STARTS,
  ...overrides,
});

describe('buildConcertTimeline', () => {
  it('builds one track per person with clips at their capture time', () => {
    const timeline = buildConcertTimeline({
      startsAt: STARTS,
      endsAt: ENDS,
      currentUserId: 'u-me',
      moments: [
        moment({ id: 'a', userId: 'u-lucia', userName: 'lucia', capturedAt: at(10) }),
        moment({ id: 'b', userId: 'u-me', userName: 'yo', capturedAt: at(5) }),
        moment({ id: 'c', userId: 'u-pablo', userName: 'pablo', capturedAt: at(12), durationSec: null }),
        moment({ id: 'd', userId: 'u-lucia', userName: 'lucia', capturedAt: at(30) }),
      ],
    });
    expect(timeline.tracks.map(track => track.label)).toEqual(['@lucia', '@pablo', '@tú']);
    expect(timeline.tracks[0].clips.map(clip => clip.id)).toEqual(['a', 'd']);
    const pablo = timeline.clips.find(clip => clip.id === 'c')!;
    expect(pablo.end - pablo.start).toBe(DEFAULT_VIDEO_SEC * 1000);
    expect(timeline.start).toBe(ms(5));
    expect(timeline.end).toBe(ms(30, 20));
  });

  it('shows photos as ~3 s stills at their capture time', () => {
    const timeline = buildConcertTimeline({
      startsAt: STARTS,
      moments: [moment({ id: 'p', mediaType: 'image', capturedAt: at(20), durationSec: null })],
    });
    const [photo] = timeline.clips;
    expect(photo.kind).toBe('photo');
    expect(photo.start).toBe(ms(20));
    expect(photo.end - photo.start).toBe(PHOTO_SEC * 1000);
    expect(pickClip(timeline, ms(20, 2))?.id).toBe('p');
    expect(pickClip(timeline, ms(20, 3))).toBeNull();
  });

  it('places a moment without capture time by its song, and lists the rest after the timeline', () => {
    const setlist = [setlistEntry(1, { starts_offset_ms: 0 }), setlistEntry(2, { starts_offset_ms: 5 * 60_000 })];
    const timeline = buildConcertTimeline({
      startsAt: STARTS,
      setlist,
      moments: [
        moment({ id: 'timed', capturedAt: at(1) }),
        moment({ id: 'by-song', capturedAt: null, songId: 's2' }),
        moment({ id: 'lost', capturedAt: null, songId: null }),
      ],
    });
    const bySong = timeline.clips.find(clip => clip.id === 'by-song')!;
    expect(bySong.placement).toBe('song');
    expect(bySong.start).toBe(ms(5));
    expect(timeline.unplaced.map(item => item.id)).toEqual(['lost']);
  });

  it('treats a capture time far from the concert as missing when others agree with the date', () => {
    const timeline = buildConcertTimeline({
      startsAt: STARTS,
      endsAt: ENDS,
      moments: [
        moment({ id: 'ok', capturedAt: at(10) }),
        moment({ id: 'wrong-clock', capturedAt: '2026-10-01T12:00:00.000Z' }),
      ],
    });
    expect(timeline.clips.map(clip => clip.id)).toEqual(['ok']);
    expect(timeline.unplaced.map(item => item.id)).toEqual(['wrong-clock']);
  });

  it('trusts the phones when no moment falls on the concert date', () => {
    const timeline = buildConcertTimeline({
      startsAt: STARTS,
      endsAt: ENDS,
      moments: [
        moment({ id: 'a', capturedAt: '2026-10-29T15:03:11.000Z' }),
        moment({ id: 'b', capturedAt: null }),
      ],
    });
    expect(timeline.clips.map(clip => clip.id)).toEqual(['a']);
    expect(timeline.unplaced.map(item => item.id)).toEqual(['b']);
  });

  it('puts one person’s overlapping clips on separate lanes', () => {
    const timeline = buildConcertTimeline({
      startsAt: STARTS,
      moments: [
        moment({ id: 'x', capturedAt: at(10) }),
        moment({ id: 'y', capturedAt: at(10, 5) }),
        moment({ id: 'z', capturedAt: at(11) }),
      ],
    });
    expect(timeline.tracks[0].lanes).toBe(2);
    expect(timeline.clips.map(clip => clip.lane)).toEqual([0, 1, 0]);
  });
});

describe('overlaps', () => {
  const overlap = () =>
    buildConcertTimeline({
      startsAt: STARTS,
      moments: [
        moment({ id: 'few-likes', userId: 'u1', capturedAt: at(10), durationSec: 60, likes: 1 }),
        moment({ id: 'popular', userId: 'u2', capturedAt: at(10, 10), durationSec: 20, likes: 9 }),
        moment({ id: 'other', userId: 'u3', capturedAt: at(10, 15), durationSec: 30, likes: 9 }),
      ],
    });

  it('lists every clip covering a time', () => {
    expect(clipsAt(overlap(), ms(10, 16)).map(clip => clip.id).sort()).toEqual(['few-likes', 'other', 'popular']);
  });

  it('shows the most liked clip, tie-broken by more time left', () => {
    const timeline = overlap();
    expect(pickClip(timeline, ms(10, 5))?.id).toBe('few-likes');
    expect(pickClip(timeline, ms(10, 12))?.id).toBe('popular');
    // popular ends at 10:30, other at 10:45: same likes, other has more left.
    expect(pickClip(timeline, ms(10, 16))?.id).toBe('other');
    // Once the popular ones end, the remaining clip plays.
    expect(pickClip(timeline, ms(10, 50))?.id).toBe('few-likes');
  });

  it('breaks full ties by the earliest upload', () => {
    const timeline = buildConcertTimeline({
      startsAt: STARTS,
      moments: [
        moment({ id: 'late', userId: 'u1', capturedAt: at(10), createdAt: '2026-10-11T12:00:00Z' }),
        moment({ id: 'early', userId: 'u2', capturedAt: at(10), createdAt: '2026-10-11T09:00:00Z' }),
      ],
    });
    expect(pickClip(timeline, ms(10, 1))?.id).toBe('early');
  });

  it('keeps a manual angle while it covers the playhead, then resumes the default', () => {
    const timeline = overlap();
    const manual = { clipId: 'few-likes' };
    expect(pickClip(timeline, ms(10, 16), manual)?.id).toBe('few-likes');
    expect(manualStillApplies(timeline, ms(10, 59), manual)).toBe(true);
    expect(manualStillApplies(timeline, ms(11, 0), manual)).toBe(false);
    // A choice that no longer covers the playhead is ignored.
    expect(pickClip(timeline, ms(10, 16), { clipId: 'gone' })?.id).toBe('other');
  });
});

describe('popularity by views', () => {
  it('ranks by views, then likes', () => {
    const timeline = buildConcertTimeline({
      startsAt: STARTS,
      moments: [
        moment({ id: 'liked', userId: 'u1', capturedAt: at(10), likes: 20, views: 3 }),
        moment({ id: 'viewed', userId: 'u2', capturedAt: at(10), likes: 1, views: 40 }),
        moment({ id: 'liked-no-views', userId: 'u3', capturedAt: at(10), likes: 30, views: null }),
      ],
    });
    expect(pickClip(timeline, ms(10, 1))?.id).toBe('viewed');
  });

  it('falls back to likes when no view counts are known', () => {
    const timeline = buildConcertTimeline({
      startsAt: STARTS,
      moments: [
        moment({ id: 'a', userId: 'u1', capturedAt: at(10), likes: 2, views: undefined }),
        moment({ id: 'b', userId: 'u2', capturedAt: at(10), likes: 5, views: undefined }),
      ],
    });
    expect(pickClip(timeline, ms(10, 1))?.id).toBe('b');
  });
});

describe('no mid-clip cuts', () => {
  const cutting = () =>
    buildConcertTimeline({
      startsAt: STARTS,
      moments: [
        moment({ id: 'current', userId: 'u1', capturedAt: at(10), durationSec: 30, views: 0 }),
        moment({ id: 'popular', userId: 'u2', capturedAt: at(10, 3), durationSec: 30, views: 50 }),
        moment({ id: 'short', userId: 'u3', capturedAt: at(20), durationSec: 4, views: 0 }),
        moment({ id: 'popular-late', userId: 'u4', capturedAt: at(20, 1), durationSec: 30, views: 99 }),
      ],
    });

  it('keeps the current clip until it has played the minimum time', () => {
    const timeline = cutting();
    const hold = { clipId: 'current', since: ms(10) };
    expect(MIN_HOLD_MS).toBe(8000);
    // Without a hold the popular clip would take over at 10:03.
    expect(pickClip(timeline, ms(10, 4))?.id).toBe('popular');
    expect(pickClip(timeline, ms(10, 4), null, hold)?.id).toBe('current');
    expect(pickClip(timeline, ms(10, 7.9), null, hold)?.id).toBe('current');
    expect(pickClip(timeline, ms(10, 8), null, hold)?.id).toBe('popular');
  });

  it('measures the hold from when the clip became current', () => {
    const timeline = cutting();
    // Came on screen at 10:05 (e.g. after a seek): held until 10:13.
    const hold = { clipId: 'current', since: ms(10, 5) };
    expect(pickClip(timeline, ms(10, 12), null, hold)?.id).toBe('current');
    expect(pickClip(timeline, ms(10, 13), null, hold)?.id).toBe('popular');
  });

  it('leaves early when the current clip ends first', () => {
    const timeline = cutting();
    const hold = { clipId: 'short', since: ms(20) };
    expect(pickClip(timeline, ms(20, 3), null, hold)?.id).toBe('short');
    expect(pickClip(timeline, ms(20, 4), null, hold)?.id).toBe('popular-late');
  });

  it('lets a manual choice override the hold immediately', () => {
    const timeline = cutting();
    const hold = { clipId: 'current', since: ms(10) };
    expect(pickClip(timeline, ms(10, 4), { clipId: 'popular' }, hold)?.id).toBe('popular');
  });

  it('preloads the clip that comes on when the hold ends', () => {
    const timeline = cutting();
    const hold = { clipId: 'current', since: ms(10) };
    expect(upcomingClip(timeline, ms(10, 1), null, hold)?.id).toBe('popular');
    expect(resolvePlayhead(timeline, ms(10, 5), null, hold).clip?.id).toBe('current');
  });
});

describe('gaps', () => {
  const gappy = () =>
    buildConcertTimeline({
      startsAt: STARTS,
      moments: [
        moment({ id: 'first', capturedAt: at(10), durationSec: 10 }),
        moment({ id: 'second', userId: 'u2', capturedAt: at(40), durationSec: 10 }),
      ],
    });

  it('finds the next clip start after a time', () => {
    expect(nextClipStart(gappy(), ms(10, 5))).toBe(ms(40));
    expect(nextClipStart(gappy(), ms(40))).toBeNull();
  });

  it('jumps straight over silence to the next clip', () => {
    const timeline = gappy();
    expect(resolvePlayhead(timeline, ms(10, 10))).toMatchObject({ t: ms(40), ended: false });
    expect(resolvePlayhead(timeline, ms(10, 10)).clip?.id).toBe('second');
    expect(resolvePlayhead(timeline, ms(50))).toMatchObject({ clip: null, ended: true });
    expect(resolvePlayhead(timeline, ms(10, 3)).clip?.id).toBe('first');
  });

  it('predicts the next clip to preload, across gaps and cuts', () => {
    const timeline = gappy();
    expect(upcomingClip(timeline, ms(10, 2))?.id).toBe('second');
    expect(upcomingClip(timeline, ms(40, 2))).toBeNull();

    const cut = buildConcertTimeline({
      startsAt: STARTS,
      moments: [
        moment({ id: 'long', userId: 'u1', capturedAt: at(10), durationSec: 60, likes: 0 }),
        moment({ id: 'liked', userId: 'u2', capturedAt: at(10, 20), durationSec: 10, likes: 5 }),
      ],
    });
    expect(upcomingClip(cut, ms(10, 1))?.id).toBe('liked');
    // With "long" chosen by hand, the next change is only after it ends.
    expect(upcomingClip(cut, ms(10, 1), { clipId: 'long' })).toBeNull();
  });
});

describe('song segments', () => {
  it('uses the setlist offsets when they exist', () => {
    const segments = buildSongSegments(
      [
        setlistEntry(1, { starts_offset_ms: 0 }),
        setlistEntry(2, { starts_offset_ms: 4 * 60_000, ends_offset_ms: 7 * 60_000 }),
        setlistEntry(3, { starts_offset_ms: 8 * 60_000 }),
      ],
      [],
      STARTS,
      ENDS,
    );
    expect(segments.map(segment => [segment.start - T0, segment.end - T0, segment.estimated])).toEqual([
      [0, 4 * 60_000, false],
      [4 * 60_000, 7 * 60_000, false],
      [8 * 60_000, 8 * 60_000 + ESTIMATED_SONG_MS, true],
    ]);
  });

  it('estimates boundaries from tagged moments', () => {
    const segments = buildSongSegments(
      [setlistEntry(1), setlistEntry(2), setlistEntry(3), setlistEntry(4), setlistEntry(5)],
      [
        { at: ms(10), end: ms(11), songId: 's2' },
        { at: ms(13), end: ms(14), songId: 's2' },
        { at: ms(20), end: ms(21), songId: 's3' },
        { at: ms(30), end: ms(31), songId: 's5' },
      ],
      STARTS,
      ENDS,
    );
    expect(segments.every(segment => segment.estimated)).toBe(true);
    const [one, two, three, four, five] = segments;
    expect(two.start).toBe(ms(10));
    // Midpoint of the silence between song 2 (ends 14:00) and song 3 (20:00).
    expect(two.end).toBe(ms(17));
    expect(three.start).toBe(ms(17));
    // Song 4 has no moments: it fills the gap between song 3 and song 5.
    expect(three.end).toBe(ms(21));
    expect(four).toMatchObject({ start: ms(21), end: ms(30) });
    expect(five.start).toBe(ms(30));
    expect(one).toMatchObject({ start: ms(10) - ESTIMATED_SONG_MS, end: ms(10) });
    expect(songSegmentAt(segments, ms(25))?.ordinal).toBe(4);
  });

  it('spreads songs over the show like songAtTime when nothing is tagged', () => {
    const setlist = [setlistEntry(1), setlistEntry(2), setlistEntry(3), setlistEntry(4)];
    const segments = buildSongSegments(setlist, [], STARTS, ENDS);
    for (const minute of [1, 29, 31, 70, 119]) {
      const expected = songAtTime(setlist, new Date(ms(minute)), STARTS, ENDS);
      expect(songSegmentAt(segments, ms(minute))?.ordinal).toBe(expected?.ordinal);
    }
  });

  it('has no segments without a setlist', () => {
    expect(buildSongSegments([], [], STARTS, ENDS)).toEqual([]);
  });
});
