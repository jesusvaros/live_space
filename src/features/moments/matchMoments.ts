// Pure matching of camera-roll assets to concerts and songs.
//
// Input: what the gallery scan returned (capture time, duration, optional GPS)
// and the concerts the user could have been at. Output: for every asset that
// fits a concert, the concert, the most likely song of its setlist and how sure
// we are of each. No I/O, no clock: everything comes in as arguments, so the
// same inputs always give the same suggestions.

export type MatchableAsset = {
  id: string;
  kind: 'photo' | 'video';
  createdAt: string; // ISO; for a video, when the recording started
  durationSec: number | null;
  location: { lat: number; lng: number } | null;
};

export type MatchableSetlistItem = {
  id: string;
  position: number;
  title: string;
  // Seconds from events.starts_at, when someone timed the setlist
  // (event_setlist_items.performed_at_offset_seconds).
  offsetSec: number | null;
};

export type UserEventRelation = 'attended' | 'going' | 'saved' | null;

export type MatchableEvent = {
  id: string;
  startsAt: string;
  endsAt: string | null;
  venue: { lat: number; lng: number } | null;
  // How the user marked this concert; null for concerts found only by GPS.
  relation: UserEventRelation;
  setlist: MatchableSetlistItem[];
};

export type MomentMatch = {
  assetId: string;
  eventId: string;
  // Instant used for the song: the middle of a video, the shot of a photo.
  momentAt: string;
  // 0–1: how sure we are the asset was taken at this concert.
  eventConfidence: number;
  // Why: 'gps' when the asset's location is at the venue, 'time' otherwise.
  eventEvidence: 'gps' | 'time';
  setlistItemId: string | null;
  // 0–1: how sure we are of the song; 0 when there is no song.
  songConfidence: number;
  songEvidence: 'timed-setlist' | 'even-split' | 'none';
};

// ---- tunables ---------------------------------------------------------------

// GPS of a phone indoors drifts; 300 m covers the venue and its doors.
export const VENUE_RADIUS_M = 300;
// Window of a concert: one hour before doors (queue, support act)…
export const PRE_SHOW_MS = 60 * 60 * 1000;
// …until ends_at, or starts_at + 4 h when the source gave no end time.
export const DEFAULT_SHOW_MS = 4 * 60 * 60 * 1000;
// Even split without ends_at: assume the headliner plays two hours.
export const DEFAULT_PLAYING_MS = 2 * 60 * 60 * 1000;
// A song in a timed setlist rarely lasts more than this; beyond it, after the
// last timed song, we stop guessing.
export const MAX_SONG_MS = 8 * 60 * 1000;

// Base confidence of a concert match by evidence. GPS at the venue inside the
// window is near-certain; time alone depends on what the user told us.
const EVENT_CONFIDENCE = {
  gps: 0.95,
  attended: 0.8,
  going: 0.75,
  saved: 0.6,
} as const;

// ---- helpers ----------------------------------------------------------------

const EARTH_RADIUS_M = 6_371_000;

export const haversineMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

// [starts_at − 1 h, ends_at] or [starts_at − 1 h, starts_at + 4 h].
export const eventWindow = (event: Pick<MatchableEvent, 'startsAt' | 'endsAt'>) => {
  const start = Date.parse(event.startsAt);
  const end = event.endsAt ? Date.parse(event.endsAt) : start + DEFAULT_SHOW_MS;
  return { from: start - PRE_SHOW_MS, to: Math.max(end, start) };
};

// The instant that best represents the asset: a 40 s video started at 21:42:00
// is mostly 21:42:20.
export const momentTime = (asset: Pick<MatchableAsset, 'createdAt' | 'durationSec'>) => {
  const start = Date.parse(asset.createdAt);
  return start + (asset.durationSec && asset.durationSec > 0 ? (asset.durationSec * 1000) / 2 : 0);
};

// ---- concert ----------------------------------------------------------------

type EventCandidate = { event: MatchableEvent; confidence: number; evidence: 'gps' | 'time' };

// Concerts this asset could belong to, best first.
//
// - With GPS and a venue with coordinates: the venue must be within 300 m.
//   A far-away GPS fix rules the concert out even if the user saved it.
// - Without GPS (or a venue without coordinates): only concerts the user
//   saved, said "Voy" to or attended, since time alone would match every
//   concert in the city.
// In both cases the capture time must fall inside the concert window.
export const candidateEvents = (asset: MatchableAsset, events: MatchableEvent[]): EventCandidate[] => {
  const shotAt = Date.parse(asset.createdAt);
  const candidates: EventCandidate[] = [];

  for (const event of events) {
    const window = eventWindow(event);
    if (shotAt < window.from || shotAt > window.to) continue;

    if (asset.location && event.venue) {
      if (haversineMeters(asset.location, event.venue) > VENUE_RADIUS_M) continue;
      candidates.push({ event, confidence: EVENT_CONFIDENCE.gps, evidence: 'gps' });
      continue;
    }
    if (!event.relation) continue;
    candidates.push({ event, confidence: EVENT_CONFIDENCE[event.relation], evidence: 'time' });
  }

  // Two concerts fit (same night, two saved gigs): prefer the stronger
  // evidence, then the one whose start is closest to the shot.
  candidates.sort((left, right) =>
    right.confidence - left.confidence
    || Math.abs(Date.parse(left.event.startsAt) - shotAt) - Math.abs(Date.parse(right.event.startsAt) - shotAt));

  // Ambiguity lowers confidence: with a rival of equal evidence we are, at
  // best, picking one of two.
  if (candidates.length > 1 && candidates[1].confidence === candidates[0].confidence) {
    candidates[0] = { ...candidates[0], confidence: candidates[0].confidence * 0.6 };
  }
  return candidates;
};

// ---- song -------------------------------------------------------------------

type SongGuess = { setlistItemId: string | null; confidence: number; evidence: MomentMatch['songEvidence'] };

const NO_SONG: SongGuess = { setlistItemId: null, confidence: 0, evidence: 'none' };

// Timed setlist: the last song that had started at `at`. Confident inside a
// song, unsure in the first seconds (the previous one may still be ending).
const songFromTimedSetlist = (at: number, startsAt: number, items: MatchableSetlistItem[]): SongGuess => {
  const timed = items
    .filter((item): item is MatchableSetlistItem & { offsetSec: number } => item.offsetSec != null)
    .sort((left, right) => left.offsetSec - right.offsetSec);
  const offsetMs = at - startsAt;
  if (timed.length === 0 || offsetMs < timed[0].offsetSec * 1000) return NO_SONG;

  let index = 0;
  while (index + 1 < timed.length && timed[index + 1].offsetSec * 1000 <= offsetMs) index += 1;
  const current = timed[index];
  const startedMs = current.offsetSec * 1000;
  const nextMs = timed[index + 1] ? timed[index + 1].offsetSec * 1000 : startedMs + MAX_SONG_MS;
  if (offsetMs > nextMs) return NO_SONG; // after the last song: encore break or the walk home

  const intoSongMs = offsetMs - startedMs;
  const confidence = intoSongMs < 20_000 ? 0.6 : 0.9;
  return { setlistItemId: current.id, confidence, evidence: 'timed-setlist' };
};

// No timings: split the playing time [starts_at, ends_at or +2 h] into equal
// slots in setlist order. Songs differ in length and shows start late, so
// this is a hint: best in the middle of a slot, weakest at its edges.
const songFromEvenSplit = (at: number, event: MatchableEvent, items: MatchableSetlistItem[]): SongGuess => {
  const ordered = [...items].sort((left, right) => left.position - right.position);
  const start = Date.parse(event.startsAt);
  const end = event.endsAt ? Date.parse(event.endsAt) : start + DEFAULT_PLAYING_MS;
  if (ordered.length === 0 || end <= start || at < start || at > end) return NO_SONG;

  const slotMs = (end - start) / ordered.length;
  const index = Math.min(ordered.length - 1, Math.floor((at - start) / slotMs));
  const slotCenter = start + slotMs * (index + 0.5);
  const fromCenter = Math.abs(at - slotCenter) / (slotMs / 2); // 0 centre … 1 edge
  const confidence = 0.2 + 0.25 * (1 - clamp01(fromCenter));
  return { setlistItemId: ordered[index].id, confidence, evidence: 'even-split' };
};

export const guessSong = (at: number, event: MatchableEvent): SongGuess => {
  if (event.setlist.length === 0) return NO_SONG;
  if (event.setlist.some(item => item.offsetSec != null)) {
    return songFromTimedSetlist(at, Date.parse(event.startsAt), event.setlist);
  }
  return songFromEvenSplit(at, event, event.setlist);
};

// ---- entry point ------------------------------------------------------------

// Assigns each asset to at most one concert and one song. Assets that fit no
// concert are left out. Sorted by moment time.
export const matchMoments = (assets: MatchableAsset[], events: MatchableEvent[]): MomentMatch[] => {
  const matches: MomentMatch[] = [];
  for (const asset of assets) {
    const [best] = candidateEvents(asset, events);
    if (!best) continue;
    const at = momentTime(asset);
    const song = guessSong(at, best.event);
    matches.push({
      assetId: asset.id,
      eventId: best.event.id,
      momentAt: new Date(at).toISOString(),
      eventConfidence: round2(best.confidence),
      eventEvidence: best.evidence,
      setlistItemId: song.setlistItemId,
      songConfidence: round2(song.confidence),
      songEvidence: song.evidence,
    });
  }
  return matches.sort((left, right) => left.momentAt.localeCompare(right.momentAt));
};

// Matches of one concert, for the suggestion screen and the nudge count.
export const matchesForEvent = (matches: MomentMatch[], eventId: string) =>
  matches.filter(match => match.eventId === eventId);

// Smallest window that covers every concert, to scan the gallery once.
export const scanRange = (events: Pick<MatchableEvent, 'startsAt' | 'endsAt'>[]) => {
  if (events.length === 0) return null;
  const windows = events.map(eventWindow);
  return {
    from: new Date(Math.min(...windows.map(window => window.from))),
    to: new Date(Math.max(...windows.map(window => window.to))),
  };
};
