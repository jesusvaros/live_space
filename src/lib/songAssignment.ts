import type { EventSetlistEntry } from './types';

const DEFAULT_SHOW_MS = 2 * 60 * 60 * 1000;

/**
 * The setlist entry playing at `capturedAt`. With per-song start offsets it
 * picks the last song that had started; without them it spreads the songs
 * evenly between the doors (`startsAt`) and the end (or two hours later).
 */
export const songAtTime = (
  setlist: EventSetlistEntry[],
  capturedAt: Date | null,
  startsAt: string,
  endsAt: string | null,
): EventSetlistEntry | null => {
  if (!capturedAt || setlist.length === 0) return null;
  const ordered = [...setlist].sort((left, right) => left.ordinal - right.ordinal);
  const start = new Date(startsAt).getTime();
  const offset = capturedAt.getTime() - start;

  const timed = ordered.filter(entry => entry.starts_offset_ms !== null);
  if (timed.length > 0) {
    const started = timed.filter(entry => (entry.starts_offset_ms ?? 0) <= offset);
    return started.length ? started[started.length - 1] : timed[0];
  }

  const end = endsAt ? new Date(endsAt).getTime() : start + DEFAULT_SHOW_MS;
  const duration = Math.max(end - start, 60 * 1000);
  const slot = Math.floor((offset / duration) * ordered.length);
  return ordered[Math.min(ordered.length - 1, Math.max(0, slot))];
};

/** How well a capture time fits a concert: 0 inside it, else ms away. */
export const distanceToConcert = (capturedAt: Date, startsAt: string, endsAt: string | null) => {
  // Doors open before the headliner and the night runs on.
  const from = new Date(startsAt).getTime() - 2 * 60 * 60 * 1000;
  const to = endsAt ? new Date(endsAt).getTime() + 60 * 60 * 1000 : new Date(startsAt).getTime() + 5 * 60 * 60 * 1000;
  const at = capturedAt.getTime();
  if (at >= from && at <= to) return 0;
  return at < from ? from - at : at - to;
};
