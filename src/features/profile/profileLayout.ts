import type { EventListItem } from '../events/types';

// Pure helpers behind the profile screen: grouping the user's moments by
// concert and splitting their concerts into coming up and already lived.

/** The fields of a moment the profile needs (a v_post_cards row). */
export type ProfileMoment = {
  id: string;
  event_id: string;
  media_type: 'image' | 'video' | string;
  media_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  event_offset_ms: number | null;
  captured_at: string | null;
  created_at: string;
  // The concert as v_post_cards embeds it (no lineup).
  events?: {
    id?: string;
    name?: string | null;
    city?: string | null;
    starts_at?: string | null;
    venue_place?: { name?: string | null } | null;
  } | null;
};

/** The concert a group of moments belongs to, as its header shows it. */
export type MomentConcert = {
  id: string;
  name: string;
  startsAt: string | null;
  venueName: string | null;
  city: string | null;
  artists: string[];
  /** The full card when we have it: poster, lineup photos. */
  card: EventListItem | null;
};

export type MomentGroup<M extends ProfileMoment = ProfileMoment> = {
  concert: MomentConcert;
  moments: M[];
};

const time = (iso: string | null | undefined) => {
  const parsed = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** Headliner first (cards come sorted by billing), no repeats, no blanks. */
export const lineupNames = (card: EventListItem | null | undefined) => {
  const names: string[] = [];
  for (const entry of card?.event_artists || []) {
    const name = entry.artist?.name?.trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
};

/** «Headliner», «A y B» or «A, B +2». */
export const lineupLabel = (artists: string[], fallback: string) => {
  if (artists.length === 0) return fallback;
  if (artists.length === 1) return artists[0];
  if (artists.length === 2) return `${artists[0]} y ${artists[1]}`;
  return `${artists[0]}, ${artists[1]} +${artists.length - 2}`;
};

const concertOf = (moment: ProfileMoment, card: EventListItem | null): MomentConcert => ({
  id: moment.event_id,
  name: card?.name || moment.events?.name || 'Concierto',
  startsAt: card?.starts_at || moment.events?.starts_at || null,
  venueName: card?.venue_place?.name || moment.events?.venue_place?.name || null,
  city: card?.city || moment.events?.city || null,
  artists: lineupNames(card),
  card,
});

// Within a concert, the moments play in the order they happened: by their
// offset into the show, else when they were captured or uploaded.
const momentTime = (moment: ProfileMoment) =>
  moment.event_offset_ms ?? time(moment.captured_at) ?? time(moment.created_at) ?? 0;

/**
 * The user's moments, one group per concert, the most recent concert first.
 * A concert without a known date goes last. `cards` (by event id) fills in the
 * lineup and the poster; without it the group still shows from the moment's
 * own embedded concert.
 */
export const groupMomentsByConcert = <M extends ProfileMoment>(
  moments: M[],
  cards: ReadonlyMap<string, EventListItem> = new Map(),
): MomentGroup<M>[] => {
  const groups = new Map<string, MomentGroup<M>>();
  for (const moment of moments) {
    if (!moment.event_id) continue;
    let group = groups.get(moment.event_id);
    if (!group) {
      group = { concert: concertOf(moment, cards.get(moment.event_id) ?? null), moments: [] };
      groups.set(moment.event_id, group);
    }
    if (!group.moments.some(existing => existing.id === moment.id)) group.moments.push(moment);
  }
  const list = Array.from(groups.values());
  for (const group of list) {
    group.moments.sort((left, right) => momentTime(left) - momentTime(right) || left.id.localeCompare(right.id));
  }
  return list.sort((left, right) => {
    const leftTime = time(left.concert.startsAt);
    const rightTime = time(right.concert.startsAt);
    if (leftTime === null && rightTime === null) return left.concert.id.localeCompare(right.concert.id);
    if (leftTime === null) return 1;
    if (rightTime === null) return -1;
    return rightTime - leftTime || left.concert.id.localeCompare(right.concert.id);
  });
};

/** A concert still counts as coming up for a few hours after doors. */
export const UPCOMING_GRACE_MS = 4 * 60 * 60 * 1000;

/**
 * Coming up (soonest first) and already lived (most recent first), without
 * repeats. Anything in `going` is flagged so the poster can say «Voy».
 */
export const splitConcerts = <E extends { id: string; starts_at: string }>(events: E[], now = Date.now()) => {
  const seen = new Set<string>();
  const unique = events.filter(event => (seen.has(event.id) ? false : (seen.add(event.id), true)));
  const from = now - UPCOMING_GRACE_MS;
  const upcoming = unique
    .filter(event => Date.parse(event.starts_at) >= from)
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at));
  const past = unique
    .filter(event => !(Date.parse(event.starts_at) >= from))
    .sort((left, right) => right.starts_at.localeCompare(left.starts_at));
  return { upcoming, past };
};

/** «14 mar 2025», or without the year when it is this year's. */
export const concertDateLabel = (iso: string | null, now = new Date()) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const options: Intl.DateTimeFormatOptions =
    date.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' };
  return date.toLocaleDateString('es-ES', options).replace(/\./g, '');
};
