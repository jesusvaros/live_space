// Which notices each person could get right now (pure; docs/notificaciones.md).
// The policy (policy.ts) then decides which one, if any, is actually sent.
//
// All dates are read in the person's timezone (their most recently seen
// device). A concert belongs to the night it starts in, shifted 6 h so a show
// at 00:30 counts as the previous night.

import { addDays, clockLabel, dateLabel, localParts, nightDate } from './time.js';
import type { EventInfo, Notice, SenderType, UserData } from './types.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const at = (hours: number, minutes = 0) => hours * 60 + minutes;

/** Local send windows [from, to), minutes since midnight. */
export const WINDOWS: Record<SenderType, { from: number; to: number }> = {
  merch_pickup: { from: at(12), to: at(22) },
  concert_day: { from: at(12), to: at(18) },
  upload_reminder: { from: at(10), to: at(14) },
  suggestion_imported: { from: at(10), to: at(21) },
  followed_new_concert: { from: at(10), to: at(21) },
};

/** Lower goes first when several are due for the same person in one run. */
export const TYPE_ORDER: Record<SenderType, number> = {
  merch_pickup: 0,
  concert_day: 1,
  upload_reminder: 2,
  suggestion_imported: 3,
  followed_new_concert: 4,
};

/** New concerts of what you follow: only those announced this recently. */
export const FOLLOWED_LOOKBACK_MS = 48 * HOUR_MS;
/** How long an announced concert is remembered (payload.event_ids). */
export const ANNOUNCED_MEMORY_MS = 14 * DAY_MS;
/** More than this many new concerts → one grouped notice. */
export const MAX_SINGLE_FOLLOWED = 1;

export const dedupeKey = (type: SenderType, ...parts: string[]) => [type, ...parts].join(':');

/** Short, stable id of a set of concerts for the grouped notice's dedupe key. */
export const batchId = (eventIds: string[]) => {
  let hash = 0x811c9dc5;
  for (const char of [...eventIds].sort().join(',')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

/** «Madrid», «  madrid », «Málaga» → comparable key. */
export const normalizeCity = (city: string | null | undefined) =>
  (city || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const subjectOf = (event: EventInfo) => event.headliner || event.name;
const placeOf = (event: EventInfo) => event.venueName || event.city;
const eventEnd = (event: EventInfo) =>
  event.endsAt ? new Date(event.endsAt).getTime() : new Date(event.startsAt).getTime() + 4 * HOUR_MS;

export type CandidateInput = {
  user: UserData;
  timezone: string;
  now: Date;
  events: Map<string, EventInfo>;
  /** Published concerts announced in the last FOLLOWED_LOOKBACK_MS, upcoming. */
  newEvents: EventInfo[];
};

export const concertDayNotice = (profileId: string, event: EventInfo, timezone: string): Notice => {
  const place = placeOf(event);
  const time = clockLabel(event.startsAt, timezone);
  return {
    type: 'concert_day',
    profileId,
    dedupeKey: dedupeKey('concert_day', event.id),
    title: place ? `Hoy: ${subjectOf(event)} en ${place} a las ${time}` : `Hoy: ${subjectOf(event)} a las ${time}`,
    body: 'Que lo disfrutes. Si grabas algo, luego lo subes en un momento.',
    route: `/event/${event.id}`,
    channel: 'conciertos',
    priority: 'high',
    ttlSeconds: 6 * 3600,
    eventIds: [event.id],
    window: WINDOWS.concert_day,
    expiresAt: event.startsAt,
  };
};

export const uploadReminderNotice = (profileId: string, event: EventInfo): Notice => ({
  type: 'upload_reminder',
  profileId,
  dedupeKey: dedupeKey('upload_reminder', event.id),
  title: `¿Grabaste algo de ${subjectOf(event)}? Súbelo`,
  body: placeOf(event)
    ? `Tus fotos y vídeos de anoche en ${placeOf(event)}, en un par de toques.`
    : 'Tus fotos y vídeos de anoche, en un par de toques.',
  route: `/tabs/upload?event=${event.id}`,
  channel: 'momentos',
  priority: 'normal',
  ttlSeconds: 8 * 3600,
  eventIds: [event.id],
  window: WINDOWS.upload_reminder,
  expiresAt: null,
});

export const merchPickupNotice = (
  profileId: string,
  order: { id: string; pickupCode: string | null; pickupPoint: string | null },
  event: EventInfo,
): Notice => {
  const where = [subjectOf(event), order.pickupPoint || placeOf(event)].filter(Boolean).join(' · ');
  return {
    type: 'merch_pickup',
    profileId,
    dedupeKey: dedupeKey('merch_pickup', order.id),
    title: order.pickupCode ? `Recoge tu pedido en el puesto: código ${order.pickupCode}` : 'Recoge tu pedido en el puesto',
    body: where ? `Hoy, en ${where}.` : 'Hoy, en el concierto.',
    route: `/pedidos/${order.id}`,
    channel: 'merch',
    priority: 'high',
    ttlSeconds: 8 * 3600,
    eventIds: [event.id],
    window: WINDOWS.merch_pickup,
    expiresAt: new Date(eventEnd(event)).toISOString(),
  };
};

export const followedNotice = (profileId: string, concerts: EventInfo[], timezone: string): Notice => {
  const sorted = [...concerts].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const ids = sorted.map(event => event.id);
  const base = {
    type: 'followed_new_concert' as const,
    profileId,
    channel: 'conciertos' as const,
    priority: 'normal' as const,
    ttlSeconds: 24 * 3600,
    eventIds: ids,
    window: WINDOWS.followed_new_concert,
    expiresAt: null,
  };
  if (sorted.length <= MAX_SINGLE_FOLLOWED) {
    const event = sorted[0];
    const where = event.city ? ` en ${event.city}` : '';
    return {
      ...base,
      dedupeKey: dedupeKey('followed_new_concert', event.id),
      title: `${subjectOf(event)} anuncia concierto${where} el ${dateLabel(event.startsAt, timezone)}`,
      body: event.venueName ? `En ${event.venueName}. Toca para verlo.` : 'Toca para verlo.',
      route: `/event/${event.id}`,
    };
  }
  const names = [...new Set(sorted.map(subjectOf))];
  const shown = names.slice(0, 3).join(', ');
  return {
    ...base,
    dedupeKey: dedupeKey('followed_new_concert', 'batch', batchId(ids)),
    title: `${sorted.length} conciertos nuevos de lo que sigues`,
    body: names.length > 3 ? `${shown} y más.` : `${shown}.`,
    route: '/tabs/events',
  };
};

/**
 * «Ya está»: a concert imported from a ticket link this person sent with
 * «¿No encuentras un concierto?». One notice per concert; the policy sends at
 * most one per run, so several arrive on later runs.
 */
export const suggestionImportedNotice = (profileId: string, event: EventInfo, timezone: string): Notice => {
  const place = placeOf(event);
  return {
    type: 'suggestion_imported',
    profileId,
    dedupeKey: dedupeKey('suggestion_imported', event.id),
    title: `Ya está: ${subjectOf(event)}${place ? ` en ${place}` : ''} el ${dateLabel(event.startsAt, timezone)}`,
    body: 'El concierto que nos pasaste ya está en Live Space. Toca para verlo.',
    route: `/event/${event.id}`,
    channel: 'conciertos',
    priority: 'normal',
    ttlSeconds: 24 * 3600,
    eventIds: [event.id],
    window: WINDOWS.suggestion_imported,
    expiresAt: event.startsAt,
  };
};

/** Concert ids already announced to this person (followed_new_concert and suggestion_imported payloads). */
export const announcedEventIds = (user: UserData, now: Date) => {
  const ids = new Set<string>();
  const since = now.getTime() - ANNOUNCED_MEMORY_MS;
  for (const row of user.sent) {
    if (row.type !== 'followed_new_concert' && row.type !== 'suggestion_imported') continue;
    if (new Date(row.sentAt).getTime() < since) continue;
    const list = row.payload?.event_ids;
    if (Array.isArray(list)) for (const id of list) if (typeof id === 'string') ids.add(id);
  }
  return ids;
};

/**
 * New concerts of what this person follows. A concert counts when it was
 * announced after both the follow and the person's first push device (so
 * following someone, or installing the app, never floods the phone), in the
 * last 48 h, and not already announced. Venues and festivals always count;
 * an artist's concert counts only in one of the person's cities (if known).
 */
export const followedConcerts = (input: CandidateInput) => {
  const { user, now, newEvents } = input;
  if (user.follows.length === 0 || user.devices.length === 0) return [];
  const firstDevice = Math.min(...user.devices.map(device => new Date(device.createdAt).getTime()));
  const floor = Math.max(firstDevice, now.getTime() - FOLLOWED_LOOKBACK_MS);
  const announced = announcedEventIds(user, now);
  const attendingIds = new Set(user.attendance.map(row => row.eventId));
  const cities = new Set(user.homeCities.map(normalizeCity).filter(Boolean));

  const byArtist = new Map<string, number>();
  const byVenue = new Map<string, number>();
  const byFestival = new Map<string, number>();
  const keep = (map: Map<string, number>, id: string | null, since: number) => {
    if (id) map.set(id, Math.min(map.get(id) ?? Infinity, since));
  };
  for (const follow of user.follows) {
    const since = new Date(follow.createdAt).getTime();
    keep(byArtist, follow.artistId, since);
    keep(byVenue, follow.venuePlaceId, since);
    keep(byFestival, follow.festivalId, since);
  }

  return newEvents.filter(event => {
    if (announced.has(event.id) || attendingIds.has(event.id)) return false;
    const announcedAt = new Date(event.announcedAt).getTime();
    if (announcedAt <= floor || new Date(event.startsAt).getTime() <= now.getTime()) return false;
    const after = (since: number | undefined) => since !== undefined && announcedAt > since;
    if (after(event.venuePlaceId ? byVenue.get(event.venuePlaceId) : undefined)) return true;
    if (after(event.festivalId ? byFestival.get(event.festivalId) : undefined)) return true;
    const artistMatch = event.artistIds.some(id => after(byArtist.get(id)));
    if (!artistMatch) return false;
    return cities.size === 0 || cities.has(normalizeCity(event.city));
  });
};

/** Every notice due today for this person, before preferences and limits. */
export const buildCandidates = (input: CandidateInput): Notice[] => {
  const { user, timezone, now, events } = input;
  const today = localParts(now, timezone).date;
  const yesterday = addDays(today, -1);
  const notices: Notice[] = [];

  for (const row of user.attendance) {
    const event = events.get(row.eventId);
    if (!event) continue;
    const night = nightDate(event.startsAt, timezone);
    if (row.status === 'going' && night === today && new Date(event.startsAt) > now) {
      notices.push(concertDayNotice(user.profileId, event, timezone));
    }
    if ((row.status === 'going' || row.status === 'attended') && night === yesterday && !user.uploadedEventIds.has(event.id)) {
      notices.push(uploadReminderNotice(user.profileId, event));
    }
  }

  for (const order of user.merchOrders) {
    if (order.status !== 'reserved' && order.status !== 'paid') continue;
    const event = events.get(order.eventId);
    if (!event || nightDate(event.startsAt, timezone) !== today || eventEnd(event) <= now.getTime()) continue;
    notices.push(merchPickupNotice(user.profileId, order, event));
  }

  // A concert they sent us is announced as theirs, never again as «new
  // concert of what you follow».
  const suggested = new Set<string>();
  for (const event of user.suggestedEvents) {
    suggested.add(event.id);
    if (new Date(event.startsAt).getTime() <= now.getTime()) continue;
    notices.push(suggestionImportedNotice(user.profileId, event, timezone));
  }

  const followed = followedConcerts(input).filter(event => !suggested.has(event.id));
  if (followed.length > 0) notices.push(followedNotice(user.profileId, followed, timezone));

  return notices.sort((left, right) => TYPE_ORDER[left.type] - TYPE_ORDER[right.type]);
};
