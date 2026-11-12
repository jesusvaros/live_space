import { distanceToConcert } from '../../lib/songAssignment';

// The in-app gallery of the uploader: which days of the camera roll to show
// for a concert (the day before to the day after, in the venue's timezone),
// how to group them by day and which items come preselected.

export const DEFAULT_TIME_ZONE = 'Europe/Madrid';

export type ConcertDates = {
  startsAt: string;
  endsAt: string | null;
  timeZone?: string | null;
};

type DayParts = { year: number; month: number; day: number };

// The zone if the runtime knows it, else the default.
export const validZone = (timeZone: string | null | undefined) => {
  if (!timeZone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
};

const wallClock = (instant: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
};

// Offset of the zone from UTC at that instant, in ms (Madrid in summer: +2 h).
const zoneOffset = (instant: number, timeZone: string) => {
  const wall = wallClock(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
};

// The instant a wall-clock time happens in the zone. Checked twice so a DST
// change between the guess and the answer does not shift it by an hour.
const zonedInstant = (day: DayParts, ms: number, timeZone: string) => {
  const guess = Date.UTC(day.year, day.month - 1, day.day) + ms;
  let instant = guess - zoneOffset(guess, timeZone);
  instant = guess - zoneOffset(instant, timeZone);
  return instant;
};

const localDay = (instant: number, timeZone: string): DayParts => {
  const { year, month, day } = wallClock(instant, timeZone);
  return { year, month, day };
};

const shiftDay = (day: DayParts, days: number): DayParts => {
  const date = new Date(Date.UTC(day.year, day.month - 1, day.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
};

const keyOf = (day: DayParts) =>
  `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * From 00:00 of the day before the concert to 23:59:59.999 of the day after
 * it ends (or starts, without an end), in the concert's timezone.
 */
export const concertGalleryRange = ({ startsAt, endsAt, timeZone }: ConcertDates) => {
  const zone = validZone(timeZone);
  const start = Date.parse(startsAt);
  const end = endsAt ? Date.parse(endsAt) : start;
  const first = shiftDay(localDay(start, zone), -1);
  const last = shiftDay(localDay(Math.max(start, Number.isFinite(end) ? end : start), zone), 1);
  return {
    from: new Date(zonedInstant(first, 0, zone)),
    to: new Date(zonedInstant(last, DAY_MS - 1, zone)),
  };
};

/** "2026-10-03": the day of an instant in the zone. */
export const dayKey = (iso: string, timeZone?: string | null) => keyOf(localDay(Date.parse(iso), validZone(timeZone)));

const capitalize = (value: string) => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

/** «Viernes 2 oct». */
export const dayLabel = (iso: string, timeZone?: string | null) => {
  const parts = new Intl.DateTimeFormat('es-ES', {
    timeZone: validZone(timeZone),
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return capitalize(`${get('weekday')} ${get('day')} ${get('month').replace(/\./g, '')}`.trim());
};

export type DatedAsset = { id: string; createdAt: string };

export type GalleryDay<T extends DatedAsset> = {
  key: string;
  label: string;
  concertDay: boolean;
  assets: T[];
};

/**
 * Assets grouped by local day, oldest first (as the camera roll scan and
 * /subir/sugerido list them). The concert's day says so in its header.
 */
export const groupByDay = <T extends DatedAsset>(assets: T[], concert: ConcertDates): GalleryDay<T>[] => {
  const zone = validZone(concert.timeZone);
  const concertKey = dayKey(concert.startsAt, zone);
  const sorted = [...assets].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  const days: GalleryDay<T>[] = [];
  for (const asset of sorted) {
    const key = dayKey(asset.createdAt, zone);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      const concertDay = key === concertKey;
      const label = dayLabel(asset.createdAt, zone);
      day = { key, label: concertDay ? `${label} · día del concierto` : label, concertDay, assets: [] };
      days.push(day);
    }
    day.assets.push(asset);
  }
  return days;
};

/** Ids of the assets taken during the concert itself (doors to the end). */
export const preselectedIds = (assets: DatedAsset[], concert: Pick<ConcertDates, 'startsAt' | 'endsAt'>) =>
  new Set(
    assets
      .filter(asset => distanceToConcert(new Date(asset.createdAt), concert.startsAt, concert.endsAt) === 0)
      .map(asset => asset.id),
  );
