import { haversineMeters } from '../features/moments/matchMoments';
import type { LatLng } from './mediaLocation';
import { distanceToConcert } from './songAssignment';

// Which concert a batch of photos and videos comes from, by the time they were
// taken and, when the files carry it, the place. Pure: the upload screen hands
// in the media (time, how the time was read, location) and the candidate
// concerts in the time window, and gets back the concert to suggest.
//
// The locations are only compared here, in memory; nothing about them leaves
// this function (see lib/mediaLocation.ts).

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** GPS indoors drifts: within this of the venue the media was taken there. */
export const STRONG_PLACE_M = 300;
/** Up to here it is probably the venue (bad fix, the queue, the bar next door). */
export const WEAK_PLACE_M = 2_000;
/** Beyond this the media was taken in another city: never auto-picked. */
export const OTHER_CITY_M = 25_000;
/** Detected by time only if captured within this of the concert. */
export const TIME_TOLERANCE_MS = 3 * HOUR_MS;
/** Time unreliable but the place is the venue: concerts this close in time. */
export const PLACE_ONLY_WINDOW_MS = DAY_MS;

// Times read from the media itself; the file date can be a copy or a download.
const RELIABLE_SOURCES = new Set(['exif', 'video.metadata']);

export type DetectionMedia = {
  captureAt: Date | null;
  captureSource: string | null;
  location: LatLng | null;
};

export type DetectionCandidate<T> = {
  event: T;
  startsAt: string;
  endsAt: string | null;
  venue: LatLng | null;
  /** In the user's city: breaks ties when the place says nothing. */
  local: boolean;
};

/** 'time-place': time and place agree; 'time': time only; 'place': place, with an unreliable time. */
export type DetectionReason = 'time' | 'time-place' | 'place';

export type Detection<T> = {
  event: T;
  reason: DetectionReason;
  confidence: 'high' | 'low';
};

type PlaceFit = 'strong' | 'weak' | 'unknown' | 'near' | 'far';

export const hasReliableTime = (media: DetectionMedia[]) =>
  media.some(item => item.captureAt && item.captureSource && RELIABLE_SOURCES.has(item.captureSource));

// Lower median: with mixed locations, what most of the media says (and with
// an even split, the closer half).
const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) / 2)];
};

const placeOf = (located: LatLng[], venue: LatLng | null): { fit: PlaceFit; meters: number } => {
  if (located.length === 0 || !venue) return { fit: 'unknown', meters: Number.POSITIVE_INFINITY };
  const meters = median(located.map(point => haversineMeters(point, venue)));
  if (meters <= STRONG_PLACE_M) return { fit: 'strong', meters };
  if (meters <= WEAK_PLACE_M) return { fit: 'weak', meters };
  if (meters <= OTHER_CITY_M) return { fit: 'near', meters };
  return { fit: 'far', meters };
};

// Strong place first; a weak or unknown place ranks with time; a venue a few
// km away is penalised below both.
const TIER: Record<Exclude<PlaceFit, 'far'>, number> = { strong: 2, weak: 1, unknown: 1, near: 0 };

type Scored<T> = {
  candidate: DetectionCandidate<T>;
  place: Exclude<PlaceFit, 'far'>;
  meters: number;
  hits: number;
  distance: number;
};

// Negative when `left` is the better fit.
const compare = <T,>(left: Scored<T>, right: Scored<T>, count: number) =>
  TIER[right.place] - TIER[left.place]
  || right.hits / count - left.hits / count
  || Number(right.place === 'weak') - Number(left.place === 'weak')
  || (left.hits > 0 ? Number(right.candidate.local) - Number(left.candidate.local) : 0)
  || left.distance - right.distance
  || left.meters - right.meters;

export const detectConcert = <T,>(
  media: DetectionMedia[],
  candidates: DetectionCandidate<T>[],
): Detection<T> | null => {
  const located = media.map(item => item.location).filter((point): point is LatLng => Boolean(point));
  const reliable = hasReliableTime(media);
  const times = media
    .filter(item => item.captureAt && (!reliable || RELIABLE_SOURCES.has(item.captureSource ?? '')))
    .map(item => item.captureAt as Date);

  // The file date may be days off, but the place is the venue and there is a
  // concert there within a day: suggest it, less sure.
  if (!reliable && located.length > 0 && times.length > 0) {
    const reference = new Date(median(times.map(time => time.getTime())));
    let best: { candidate: DetectionCandidate<T>; away: number } | null = null;
    for (const candidate of candidates) {
      if (placeOf(located, candidate.venue).fit !== 'strong') continue;
      const away = distanceToConcert(reference, candidate.startsAt, candidate.endsAt);
      if (away > PLACE_ONLY_WINDOW_MS) continue;
      if (!best || away < best.away) best = { candidate, away };
    }
    if (best) return { event: best.candidate.event, reason: 'place', confidence: 'low' };
  }

  if (times.length === 0) return null;
  let best: Scored<T> | null = null;
  for (const candidate of candidates) {
    const { fit, meters } = placeOf(located, candidate.venue);
    // Taken in another city: time alone must not pick this concert.
    if (fit === 'far') continue;
    let hits = 0;
    let total = 0;
    for (const time of times) {
      const away = distanceToConcert(time, candidate.startsAt, candidate.endsAt);
      if (away === 0) hits += 1;
      total += away;
    }
    const distance = total / times.length;
    if (hits === 0 && distance > TIME_TOLERANCE_MS) continue;
    const scored: Scored<T> = { candidate, place: fit, meters, hits, distance };
    if (!best || compare(scored, best, times.length) < 0) best = scored;
  }
  if (!best) return null;
  const placed = best.place === 'strong' || best.place === 'weak';
  return {
    event: best.candidate.event,
    reason: placed ? 'time-place' : 'time',
    confidence: reliable && (best.hits > 0 || best.place === 'strong') ? 'high' : 'low',
  };
};
