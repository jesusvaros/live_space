import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { supabase } from '../../lib/supabase';

// "Nuevo concierto de X": when a followed artist, venue or festival gets a
// concert announced (scraped or added by hand), the follower hears about it.
//
// There is no push server yet, so the check runs on the device on every app
// open and resume: concerts created since the last check are announced with
// a local notification. The first check only records the starting point, so
// following someone never floods the phone with their existing listings.

const ALERT_KIND = 'concert-alert';
const STATE_KEY = 'livespace.concertAlerts.v1';
// Device and server clocks drift; re-read a margin and dedupe by id.
const OVERLAP_MS = 10 * 60 * 1000;
const MAX_SINGLE = 3;

type AlertState = { since?: string; notified?: string[] };

export type NewConcert = {
  id: string;
  title: string;
  venueName: string | null;
  startsAt: string;
};

const readState = (): AlertState => {
  try {
    return JSON.parse(window.localStorage.getItem(STATE_KEY) || '{}') as AlertState;
  } catch {
    return {};
  }
};

const writeState = (state: AlertState) => {
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Full storage: at worst a concert is announced twice.
  }
};

const isNativeNotifications = () =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LocalNotifications');

const alertId = (eventId: string) => {
  let hash = 7;
  const key = `alert:${eventId}`;
  for (let index = 0; index < key.length; index += 1) {
    hash = (Math.imul(hash, 31) + key.charCodeAt(index)) | 0;
  }
  return (hash & 0x7fffffff) || 1;
};

const CONCERT_SELECT = `
  id,name,starts_at,
  venue_place:venue_places!events_venue_place_id_fkey (name),
  event_artists (billing_order, artist:artists!event_artists_artist_id_fkey (name))
`;

// Headliner first (billing order 0).
const toConcert = (row: any): NewConcert => ({
  id: String(row.id),
  title:
    [...(row.event_artists || [])].sort((left: any, right: any) => (left.billing_order ?? 99) - (right.billing_order ?? 99))[0]
      ?.artist?.name || row.name,
  venueName: row.venue_place?.name ?? null,
  startsAt: row.starts_at,
});

// Upcoming concerts of what the subject follows, created after `since`.
export const fetchNewFollowedConcerts = async (followerSubjectId: string, since: string): Promise<NewConcert[]> => {
  const { data: follows, error: followsError } = await supabase
    .from('follows')
    .select('target_subject_id')
    .eq('follower_subject_id', followerSubjectId);
  if (followsError) throw followsError;
  const targetIds = (follows || []).map((row: any) => row.target_subject_id).filter(Boolean);
  if (targetIds.length === 0) return [];

  // `*`: festival_id only exists once the festivals migration has run.
  const { data: subjects, error: subjectsError } = await supabase.from('subjects').select('*').in('id', targetIds);
  if (subjectsError) throw subjectsError;
  const pick = (column: string) => (subjects || []).map((row: any) => row[column]).filter(Boolean) as string[];
  const artistIds = pick('artist_id');
  const venueIds = pick('venue_place_id');
  const festivalIds = pick('festival_id');

  const nowIso = new Date().toISOString();
  const base = (select: string) =>
    supabase.from('events').select(select).eq('status', 'published').gt('created_at', since).gte('starts_at', nowIso);
  const queries = [];
  if (artistIds.length) {
    queries.push(base(`${CONCERT_SELECT}, followed:event_artists!inner (artist_id)`).in('followed.artist_id', artistIds));
  }
  if (venueIds.length) queries.push(base(CONCERT_SELECT).in('venue_place_id', venueIds));
  if (festivalIds.length) queries.push(base(CONCERT_SELECT).in('festival_id', festivalIds));

  const results = await Promise.all(queries);
  const byId = new Map<string, NewConcert>();
  for (const { data, error } of results) {
    if (error) throw error;
    for (const row of data || []) byId.set(String((row as any).id), toConcert(row));
  }
  return [...byId.values()].sort((left, right) => left.startsAt.localeCompare(right.startsAt));
};

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');

// Asks for notification permission when the user follows something, never
// on app open, and records the starting point of the checks.
export const enableConcertAlerts = async () => {
  if (!isNativeNotifications()) return;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale') {
      await LocalNotifications.requestPermissions();
    }
  } catch {
    // The phone keeps the decision; the in-app list still works.
  }
  const state = readState();
  if (!state.since) writeState({ since: new Date().toISOString(), notified: [] });
};

let syncing: Promise<void> | null = null;

// Idempotent; safe to call on every app open and resume.
export const syncConcertAlerts = (followerSubjectId: string) => {
  if (!isNativeNotifications()) return Promise.resolve();
  if (!syncing) {
    syncing = runSync(followerSubjectId)
      .catch(error => console.warn('[alerts] concert alert sync failed', error))
      .finally(() => {
        syncing = null;
      });
  }
  return syncing;
};

const runSync = async (followerSubjectId: string) => {
  const { display } = await LocalNotifications.checkPermissions();
  if (display !== 'granted') return;

  const startedAt = new Date();
  const state = readState();
  if (!state.since) {
    writeState({ since: startedAt.toISOString(), notified: [] });
    return;
  }

  const since = new Date(Date.parse(state.since) - OVERLAP_MS).toISOString();
  const notified = new Set(state.notified || []);
  const fresh = (await fetchNewFollowedConcerts(followerSubjectId, since)).filter(concert => !notified.has(concert.id));

  if (fresh.length > 0) {
    const at = new Date(Date.now() + 1000);
    const notifications =
      fresh.length <= MAX_SINGLE
        ? fresh.map(concert => ({
            id: alertId(concert.id),
            title: `Nuevo concierto: ${concert.title}`,
            body: [dateLabel(concert.startsAt), concert.venueName].filter(Boolean).join(' · '),
            schedule: { at },
            extra: { kind: ALERT_KIND, path: `/event/${concert.id}` },
          }))
        : [
            {
              id: alertId(`summary:${startedAt.toISOString()}`),
              title: `${fresh.length} conciertos nuevos de lo que sigues`,
              body: fresh
                .slice(0, 4)
                .map(concert => concert.title)
                .join(', '),
              schedule: { at },
              extra: { kind: ALERT_KIND, path: '/tabs/events' },
            },
          ];
    await LocalNotifications.schedule({ notifications });
  }

  writeState({
    since: startedAt.toISOString(),
    notified: [...fresh.map(concert => concert.id), ...notified].slice(0, 300),
  });
};

export const listenForAlertTaps = (open: (path: string) => void) => {
  if (!isNativeNotifications()) return () => undefined;
  const handle = LocalNotifications.addListener('localNotificationActionPerformed', action => {
    const extra = action.notification.extra;
    if (extra?.kind !== ALERT_KIND || typeof extra.path !== 'string') return;
    open(extra.path);
  });
  return () => {
    void handle.then(listener => listener.remove());
  };
};
