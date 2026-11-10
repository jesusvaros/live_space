import type { EventSetlistEntry, PostWithSetlist } from '../../lib/types';
import { distanceToConcert } from '../../lib/songAssignment';

// The concert as one long multi-track video: one track per person, each of
// their moments a clip placed at its capture time. Pure (no React, no
// Supabase) so the player and the tests share exactly the same rules.
//
// Times are epoch milliseconds ("concert time").

export type TimelineMoment = {
  id: string;
  userId: string;
  // "lucia" (username) or a display name; shown as "@lucia".
  userName: string | null;
  avatarUrl?: string | null;
  mediaType: 'video' | 'image';
  mediaUrl: string;
  thumbnailUrl: string | null;
  // Imported Instagram/TikTok/YouTube clip: plays in the platform, not in <video>.
  external?: boolean;
  capturedAt: string | null;
  createdAt: string;
  songId: string | null;
  // From media_assets.duration_seconds, or measured by the player.
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  // Popularity for overlaps: views (post_views, counted after 3 s of play)
  // first, then likes (post_likes). null/undefined when unknown.
  views?: number | null;
  likes?: number;
  // The row it came from, for the player (imported clip card, reporting).
  post?: PostWithSetlist;
};

export type ClipKind = 'video' | 'photo' | 'external';

// How the clip got its start: its own capture time, or its song (estimated).
export type Placement = 'captured' | 'song';

export type Clip = {
  id: string;
  trackId: string;
  start: number;
  end: number;
  kind: ClipKind;
  placement: Placement;
  // Row inside its track when the same person has overlapping clips.
  lane: number;
  moment: TimelineMoment;
};

export type Track = {
  id: string;
  label: string;
  avatarUrl: string | null;
  isMe: boolean;
  lanes: number;
  clips: Clip[];
};

export type SongSegment = {
  ordinal: number;
  songId: string | null;
  title: string;
  start: number;
  end: number;
  // true: boundaries inferred (from moments or spread over the show), not
  // times stored with the setlist.
  estimated: boolean;
};

export type ConcertTimeline = {
  start: number;
  end: number;
  tracks: Track[];
  // Every clip, by start then id.
  clips: Clip[];
  segments: SongSegment[];
  // No usable capture time and no song to place them by: listed after the timeline.
  unplaced: TimelineMoment[];
};

export type ManualChoice = { clipId: string } | null;

/** Default length of a video whose duration we do not know yet. */
export const DEFAULT_VIDEO_SEC = 15;
/** A photo is on screen for this long at its capture time. */
export const PHOTO_SEC = 3;
/** An imported clip shows its card this long (it plays in its own app on tap). */
export const EXTERNAL_SEC = 8;
/**
 * The default rule never cuts away from the clip on screen before it has
 * played this long (unless it ends first): no flicker between angles.
 */
export const MIN_HOLD_MS = 8000;
/** A clip counts as viewed after this much real playback. */
export const VIEW_AFTER_MS = 3000;
/** Typical song length, for estimated song boundaries. */
export const ESTIMATED_SONG_MS = 4 * 60 * 1000;
const DEFAULT_SHOW_MS = 2 * 60 * 60 * 1000;

export const clipKindOf = (moment: TimelineMoment): ClipKind =>
  moment.external ? 'external' : moment.mediaType === 'image' ? 'photo' : 'video';

export const clipDurationMs = (moment: TimelineMoment) => {
  const kind = clipKindOf(moment);
  if (kind === 'photo') return PHOTO_SEC * 1000;
  if (kind === 'external') return EXTERNAL_SEC * 1000;
  const seconds = moment.durationSec && moment.durationSec > 0 ? moment.durationSec : DEFAULT_VIDEO_SEC;
  return Math.round(seconds * 1000);
};

/** A capture time we trust: parseable and within the night of the concert. */
const usableCaptureTime = (moment: TimelineMoment, startsAt: string, endsAt: string | null) => {
  if (!moment.capturedAt) return null;
  const date = new Date(moment.capturedAt);
  if (Number.isNaN(date.getTime())) return null;
  // A phone with the wrong clock (or a re-saved file) dates the clip days off:
  // treat that like no capture time rather than stretching the timeline.
  if (distanceToConcert(date, startsAt, endsAt) > 0) return null;
  return date.getTime();
};

const orderedSetlist = (setlist: EventSetlistEntry[]) =>
  [...setlist].sort((left, right) => left.ordinal - right.ordinal);

const songTitle = (entry: EventSetlistEntry) => entry.song_title || 'Canción sin título';

/**
 * Song segments for the ruler.
 *
 * 1. REAL: the setlist stores per-song offsets (`starts_offset_ms`, set by
 *    managers). A song ends where its `ends_offset_ms` says, else where the
 *    next one starts, else ESTIMATED_SONG_MS later.
 * 2. ESTIMATED from moments: no offsets, but moments with a trusted capture
 *    time are tagged with their song. Each tagged song spans its moments;
 *    the boundary between two consecutive observed songs is the midpoint of
 *    the gap between them, the untagged songs in between share that gap
 *    evenly, and songs before the first / after the last observed one get
 *    ESTIMATED_SONG_MS each.
 * 3. ESTIMATED by spreading: nothing tagged — the songs share the show evenly
 *    between `startsAt` and `endsAt` (or two hours), the same rule
 *    songAtTime() uses to assign a song to a capture time.
 */
export const buildSongSegments = (
  setlist: EventSetlistEntry[],
  timed: { at: number; end: number; songId: string | null }[],
  startsAt: string,
  endsAt: string | null,
): SongSegment[] => {
  const ordered = orderedSetlist(setlist);
  if (ordered.length === 0) return [];
  const showStart = new Date(startsAt).getTime();

  // 1. Real offsets.
  if (ordered.some(entry => entry.starts_offset_ms !== null)) {
    const withStart = ordered.filter(entry => entry.starts_offset_ms !== null);
    return withStart.map((entry, index) => {
      const start = showStart + (entry.starts_offset_ms ?? 0);
      const next = withStart[index + 1];
      const end = entry.ends_offset_ms !== null
        ? showStart + entry.ends_offset_ms
        : next
          ? showStart + (next.starts_offset_ms ?? 0)
          : start + ESTIMATED_SONG_MS;
      return {
        ordinal: entry.ordinal,
        songId: entry.song_id,
        title: songTitle(entry),
        start,
        end: Math.max(end, start + 1000),
        // Only the end is a guess when nothing tells where the last song stops.
        estimated: entry.ends_offset_ms === null && !next,
      };
    });
  }

  // 2. Estimated from tagged moments.
  const spans = new Map<string, { from: number; to: number }>();
  for (const moment of timed) {
    if (!moment.songId) continue;
    const span = spans.get(moment.songId);
    if (!span) spans.set(moment.songId, { from: moment.at, to: moment.end });
    else spans.set(moment.songId, { from: Math.min(span.from, moment.at), to: Math.max(span.to, moment.end) });
  }
  // Observed songs, in setlist order, keeping only those consistent with it
  // (a mis-tagged moment can put song 9 before song 3: ignore the outlier).
  const anchors: { index: number; from: number; to: number }[] = [];
  ordered.forEach((entry, index) => {
    const span = entry.song_id ? spans.get(entry.song_id) : undefined;
    if (!span) return;
    const previous = anchors[anchors.length - 1];
    if (previous && span.from < previous.from) return;
    anchors.push({ index, from: span.from, to: Math.max(span.to, span.from + 1000) });
  });

  if (anchors.length > 0) {
    const starts: number[] = new Array(ordered.length);
    const ends: number[] = new Array(ordered.length);
    anchors.forEach((anchor, position) => {
      // The previous anchor may already have moved this start to a midpoint.
      if (starts[anchor.index] === undefined) starts[anchor.index] = anchor.from;
      ends[anchor.index] = anchor.to;
      const next = anchors[position + 1];
      if (!next) return;
      const between = next.index - anchor.index - 1;
      const gapStart = Math.min(anchor.to, next.from);
      const gapEnd = next.from;
      if (between === 0) {
        // Meet in the middle of the silence between the two songs.
        const middle = gapStart + (gapEnd - gapStart) / 2;
        ends[anchor.index] = middle;
        starts[next.index] = middle;
      } else {
        ends[anchor.index] = gapStart;
        const slot = (gapEnd - gapStart) / between;
        for (let step = 1; step <= between; step += 1) {
          starts[anchor.index + step] = gapStart + slot * (step - 1);
          ends[anchor.index + step] = gapStart + slot * step;
        }
      }
    });
    const first = anchors[0];
    for (let index = first.index - 1; index >= 0; index -= 1) {
      ends[index] = starts[index + 1];
      starts[index] = ends[index] - ESTIMATED_SONG_MS;
    }
    const last = anchors[anchors.length - 1];
    for (let index = last.index + 1; index < ordered.length; index += 1) {
      starts[index] = ends[index - 1];
      ends[index] = starts[index] + ESTIMATED_SONG_MS;
    }
    return ordered.map((entry, index) => ({
      ordinal: entry.ordinal,
      songId: entry.song_id,
      title: songTitle(entry),
      start: Math.round(starts[index]),
      end: Math.round(Math.max(ends[index], starts[index] + 1000)),
      estimated: true,
    }));
  }

  // 3. Spread evenly over the show, consistent with songAtTime().
  const showEnd = endsAt ? new Date(endsAt).getTime() : showStart + DEFAULT_SHOW_MS;
  const duration = Math.max(showEnd - showStart, 60 * 1000);
  const slot = duration / ordered.length;
  return ordered.map((entry, index) => ({
    ordinal: entry.ordinal,
    songId: entry.song_id,
    title: songTitle(entry),
    start: Math.round(showStart + slot * index),
    end: Math.round(showStart + slot * (index + 1)),
    estimated: true,
  }));
};

export const songSegmentAt = (segments: SongSegment[], t: number) =>
  segments.find(segment => segment.start <= t && t < segment.end) ?? null;

const handleOf = (moment: TimelineMoment) => {
  const name = (moment.userName || '').trim();
  return name ? (name.startsWith('@') ? name : `@${name}`) : '@anónimo';
};

/** Assigns lanes so a person's overlapping clips never draw on top of each other. */
const assignLanes = (clips: Clip[]) => {
  const laneEnds: number[] = [];
  for (const clip of clips) {
    let lane = laneEnds.findIndex(end => end <= clip.start);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(clip.end);
    } else {
      laneEnds[lane] = clip.end;
    }
    clip.lane = lane;
  }
  return Math.max(1, laneEnds.length);
};

const byStart = (left: Clip, right: Clip) => left.start - right.start || left.id.localeCompare(right.id);

export const buildConcertTimeline = (options: {
  moments: TimelineMoment[];
  setlist?: EventSetlistEntry[];
  startsAt: string;
  endsAt?: string | null;
  currentUserId?: string | null;
}): ConcertTimeline => {
  const { moments, setlist = [], startsAt, endsAt = null, currentUserId = null } = options;

  const timed: { moment: TimelineMoment; at: number }[] = [];
  const untimed: TimelineMoment[] = [];
  for (const moment of moments) {
    const at = usableCaptureTime(moment, startsAt, endsAt);
    if (at === null) untimed.push(moment);
    else timed.push({ moment, at });
  }
  // Nothing falls on the night of the concert, yet the moments have capture
  // times: the catalogue date is the likelier mistake (scraped listings get
  // moved), so trust the phones and lay the moments out by their own clocks.
  if (timed.length === 0) {
    for (const moment of [...untimed]) {
      const at = moment.capturedAt ? new Date(moment.capturedAt).getTime() : NaN;
      if (Number.isNaN(at)) continue;
      timed.push({ moment, at });
      untimed.splice(untimed.indexOf(moment), 1);
    }
  }

  const segments = buildSongSegments(
    setlist,
    timed.map(({ moment, at }) => ({ at, end: at + clipDurationMs(moment), songId: moment.songId })),
    startsAt,
    endsAt,
  );

  const clips: Clip[] = timed.map(({ moment, at }) => ({
    id: moment.id,
    trackId: moment.userId,
    start: at,
    end: at + clipDurationMs(moment),
    kind: clipKindOf(moment),
    placement: 'captured',
    lane: 0,
    moment,
  }));

  // No capture time but a song: place it at its song (an estimate), staggered
  // so several of them in one song do not all start on the same frame.
  const unplaced: TimelineMoment[] = [];
  const perSong = new Map<string, number>();
  for (const moment of [...untimed].sort((left, right) => left.createdAt.localeCompare(right.createdAt))) {
    const segment = moment.songId ? segments.find(item => item.songId === moment.songId) : undefined;
    if (!segment) {
      unplaced.push(moment);
      continue;
    }
    const index = perSong.get(segment.songId as string) ?? 0;
    perSong.set(segment.songId as string, index + 1);
    const length = segment.end - segment.start;
    const start = segment.start + Math.min(index * 5000, Math.max(0, length - 1000));
    clips.push({
      id: moment.id,
      trackId: moment.userId,
      start,
      end: start + clipDurationMs(moment),
      kind: clipKindOf(moment),
      placement: 'song',
      lane: 0,
      moment,
    });
  }

  clips.sort(byStart);

  const trackMap = new Map<string, Track>();
  for (const clip of clips) {
    let track = trackMap.get(clip.trackId);
    if (!track) {
      const isMe = Boolean(currentUserId && clip.trackId === currentUserId);
      track = {
        id: clip.trackId,
        label: isMe ? '@tú' : handleOf(clip.moment),
        avatarUrl: clip.moment.avatarUrl ?? null,
        isMe,
        lanes: 1,
        clips: [],
      };
      trackMap.set(clip.trackId, track);
    }
    track.clips.push(clip);
  }
  // First to record goes on top; your own track always last, like the design.
  const tracks = [...trackMap.values()].sort(
    (left, right) => Number(left.isMe) - Number(right.isMe) || left.clips[0].start - right.clips[0].start,
  );
  for (const track of tracks) track.lanes = assignLanes(track.clips);

  const start = clips.length ? clips[0].start : new Date(startsAt).getTime();
  const end = clips.length ? Math.max(...clips.map(clip => clip.end)) : start;

  return { start, end, tracks, clips, segments, unplaced };
};

/** Clips covering concert time `t` (start inclusive, end exclusive). */
export const clipsAt = (timeline: Pick<ConcertTimeline, 'clips'>, t: number) =>
  timeline.clips.filter(clip => clip.start <= t && t < clip.end);

/**
 * Default angle among overlapping clips: most viewed, then most liked, then
 * the one with more left to play (fewer cuts), then the earliest upload, then
 * id (stable). Without view counts (older backend) views are all 0 and likes
 * decide.
 */
export const rankClips = (clips: Clip[], t: number) =>
  [...clips].sort(
    (left, right) =>
      (right.moment.views ?? 0) - (left.moment.views ?? 0)
      || (right.moment.likes ?? 0) - (left.moment.likes ?? 0)
      || (right.end - t) - (left.end - t)
      || left.moment.createdAt.localeCompare(right.moment.createdAt)
      || left.id.localeCompare(right.id),
  );

/**
 * The clip on screen and since when (concert time). While it has played less
 * than MIN_HOLD_MS, the default rule does not cut away from it to a more
 * popular angle; it only leaves when it ends.
 */
export type Hold = { clipId: string; since: number } | null;

export const holdApplies = (hold: Hold, clip: Clip | undefined, t: number) =>
  Boolean(hold && clip && t - hold.since < MIN_HOLD_MS);

/**
 * The clip on screen at `t`. A manual choice (the viewer tapped another
 * angle) wins while that clip still covers `t`; after that the default rule
 * resumes. The default rule never cuts away from the current clip (`hold`)
 * before it has played MIN_HOLD_MS, unless it ends first.
 */
export const pickClip = (
  timeline: Pick<ConcertTimeline, 'clips'>,
  t: number,
  manual: ManualChoice = null,
  hold: Hold = null,
): Clip | null => {
  const candidates = clipsAt(timeline, t);
  if (candidates.length === 0) return null;
  if (manual) {
    const chosen = candidates.find(clip => clip.id === manual.clipId);
    if (chosen) return chosen;
  }
  if (hold) {
    const current = candidates.find(clip => clip.id === hold.clipId);
    if (holdApplies(hold, current, t)) return current as Clip;
  }
  return rankClips(candidates, t)[0];
};

/** Whether a manual choice still applies at `t` (else it should be dropped). */
export const manualStillApplies = (timeline: Pick<ConcertTimeline, 'clips'>, t: number, manual: ManualChoice) =>
  Boolean(manual && clipsAt(timeline, t).some(clip => clip.id === manual.clipId));

/** Start of the first clip strictly after `t`, for jumping over silent gaps. */
export const nextClipStart = (timeline: Pick<ConcertTimeline, 'clips'>, t: number): number | null => {
  let best: number | null = null;
  for (const clip of timeline.clips) {
    if (clip.start > t && (best === null || clip.start < best)) best = clip.start;
  }
  return best;
};

/**
 * Where playback really is for a requested time: inside a clip it stays put;
 * in a gap it jumps to the next clip; past the last clip it is the end.
 */
export const resolvePlayhead = (
  timeline: Pick<ConcertTimeline, 'clips'>,
  t: number,
  manual: ManualChoice = null,
  hold: Hold = null,
): { t: number; clip: Clip | null; ended: boolean } => {
  const clip = pickClip(timeline, t, manual, hold);
  if (clip) return { t, clip, ended: false };
  const next = nextClipStart(timeline, t);
  if (next === null) return { t, clip: null, ended: true };
  return { t: next, clip: pickClip(timeline, next, null), ended: false };
};

/**
 * The next clip that will take the screen after `t` (to preload it): walks
 * the following decision points (clip boundaries and the end of the minimum
 * hold) until the pick changes — a cut to a more popular angle, the end of
 * the current clip, or the start after a gap.
 */
export const upcomingClip = (
  timeline: Pick<ConcertTimeline, 'clips'>,
  t: number,
  manual: ManualChoice = null,
  hold: Hold = null,
): Clip | null => {
  const current = pickClip(timeline, t, manual, hold);
  const boundaries = new Set<number>();
  for (const clip of timeline.clips) {
    if (clip.start > t) boundaries.add(clip.start);
    if (clip.end > t) boundaries.add(clip.end);
  }
  if (hold && hold.since + MIN_HOLD_MS > t) boundaries.add(hold.since + MIN_HOLD_MS);
  for (const at of [...boundaries].sort((left, right) => left - right)) {
    const keep = manual && manualStillApplies(timeline, at, manual) ? manual : null;
    const { clip } = resolvePlayhead(timeline, at, keep, hold);
    if (!clip) return null;
    if (clip.id !== current?.id) return clip;
  }
  return null;
};
