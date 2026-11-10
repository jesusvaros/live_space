// Wall-clock helpers for the push sender (docs/notificaciones.md). Every
// window and quiet hour is read in the person's device timezone
// (push_devices.timezone), never in the server's.

export const DEFAULT_TIMEZONE = 'Europe/Madrid';

const HOUR_MS = 60 * 60 * 1000;
// A show that starts at 00:30 still belongs to the previous night (same rule
// as the local «¿Subes lo de anoche?» nudge).
export const NIGHT_SHIFT_MS = 6 * HOUR_MS;

export const isValidTimezone = (timezone: string | null | undefined): timezone is string => {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
};

export const safeTimezone = (timezone: string | null | undefined) =>
  isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;

export type LocalParts = {
  /** 'YYYY-MM-DD' */
  date: string;
  hour: number;
  minute: number;
  /** Minutes since local midnight. */
  minutes: number;
};

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

export const localParts = (at: Date, timezone: string): LocalParts => {
  const tz = safeTimezone(timezone);
  let formatter = partsFormatters.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    partsFormatters.set(tz, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(at).map(part => [part.type, part.value]));
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour, minute, minutes: hour * 60 + minute };
};

/** Local date of the night a concert belongs to ('YYYY-MM-DD'). */
export const nightDate = (startsAt: string | Date, timezone: string) =>
  localParts(new Date(new Date(startsAt).getTime() - NIGHT_SHIFT_MS), timezone).date;

/** 'YYYY-MM-DD' + days. */
export const addDays = (date: string, days: number) => {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
};

/** '21:30' in the given timezone. */
export const clockLabel = (at: string | Date, timezone: string) => {
  const { hour, minute } = localParts(new Date(at), timezone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

/** 'sábado 14 de noviembre' in the given timezone. */
export const dateLabel = (at: string | Date, timezone: string) =>
  new Date(at)
    .toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: safeTimezone(timezone) })
    .replace(',', '');

/** 'HH:MM' → minutes since midnight; null if malformed. */
export const clockToMinutes = (value: string) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

/**
 * Inside the quiet range [start, end)? Overnight ranges (start > end) wrap
 * around midnight; start = end means no quiet hours.
 */
export const isInQuietHours = (localMinutes: number, quietStart: string, quietEnd: string) => {
  const start = clockToMinutes(quietStart);
  const end = clockToMinutes(quietEnd);
  if (start === null || end === null || start === end) return false;
  if (start < end) return localMinutes >= start && localMinutes < end;
  return localMinutes >= start || localMinutes < end;
};
