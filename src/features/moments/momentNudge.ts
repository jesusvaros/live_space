import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { canReadGallery, checkGalleryPermission, findMedia } from '../../media/native/gallery';
import { eventWindow, matchMoments } from './matchMoments';
import { fetchUserMomentEvents, type MomentEvent } from './momentsData';

// "¿Subes lo de anoche?" — the morning-after nudge.
//
// For every concert the user saved or said "Voy" to, a local notification is
// scheduled for 11:00 (device time) the day after. It should only fire when
// the gallery really has clips from the show, but a scheduled notification
// cannot scan the gallery, so there are two layers:
//
// 1. Silent check (every app open/resume): once the concert is over and the
//    user has granted gallery access, scan the concert window. Clips found →
//    the notification is replaced by one with the count ("Hemos encontrado
//    14 vídeos de Morat en tu galería"). Nothing found → it is cancelled.
// 2. Fallback: if the app is not opened between the end of the concert and
//    11:00, or gallery access was never granted, the generic notification
//    scheduled in advance fires.
//
// Tapping either opens /subir/sugerido?event=<id>. Nothing is uploaded here.

export const NUDGE_HOUR = 11;
export const SUGGESTED_UPLOAD_PATH = '/subir/sugerido';
const NUDGE_KIND = 'moments-nudge';
// Concerts that ended more than this long ago are no longer nudged.
const LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;
const LOOKAHEAD_MS = 90 * 24 * 60 * 60 * 1000;
// A show that starts at 00:30 still belongs to the previous night.
const NIGHT_SHIFT_MS = 6 * 60 * 60 * 1000;
const STATE_KEY = 'livespace.momentNudges.v1';

type NudgeState = Record<string, {
  // A notification was scheduled for this concert (it may have fired).
  scheduled?: boolean;
  // Last count the silent check announced; avoids rescheduling the same text.
  announced?: number;
  // The user opened the suggestions or dismissed them: never nudge again.
  done?: boolean;
}>;

const readState = (): NudgeState => {
  try {
    return JSON.parse(window.localStorage.getItem(STATE_KEY) || '{}') as NudgeState;
  } catch {
    return {};
  }
};

const writeState = (state: NudgeState) => {
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Private mode or full storage: at worst a nudge is rescheduled.
  }
};

// Called from /subir/sugerido: the user already saw the suggestions.
export const markNudgeDone = (eventId: string) => {
  const state = readState();
  state[eventId] = { ...state[eventId], done: true };
  writeState(state);
  if (isNativeNotifications()) {
    void LocalNotifications.cancel({ notifications: [{ id: nudgeId(eventId) }] }).catch(() => undefined);
  }
};

const isNativeNotifications = () =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LocalNotifications');

// Stable positive 31-bit id per event (Android notification ids are ints).
export const nudgeId = (eventId: string) => {
  let hash = 0;
  for (let index = 0; index < eventId.length; index += 1) {
    hash = (Math.imul(hash, 31) + eventId.charCodeAt(index)) | 0;
  }
  return (hash & 0x7fffffff) || 1;
};

// 11:00 local on the morning after the concert night.
export const nudgeTime = (event: Pick<MomentEvent, 'startsAt'>) => {
  const night = new Date(Date.parse(event.startsAt) - NIGHT_SHIFT_MS);
  return new Date(night.getFullYear(), night.getMonth(), night.getDate() + 1, NUDGE_HOUR, 0, 0, 0);
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// "14 vídeos", "1 foto", "3 vídeos y 2 fotos"
export const describeClips = (videos: number, photos: number) => {
  const parts = [];
  if (videos > 0) parts.push(plural(videos, 'vídeo', 'vídeos'));
  if (photos > 0) parts.push(plural(photos, 'foto', 'fotos'));
  return parts.join(' y ');
};

const subjectOf = (event: MomentEvent) => event.artistName || event.name;

const genericNotification = (event: MomentEvent, at: Date) => ({
  id: nudgeId(event.id),
  title: '¿Subes lo de anoche?',
  body: `Toca para ver tus fotos y vídeos de ${subjectOf(event)} y subirlos en un momento.`,
  schedule: { at, allowWhileIdle: false },
  // Inexact on purpose: a few minutes late is fine and needs no extra permission.
  isExactNotification: false,
  extra: { kind: NUDGE_KIND, eventId: event.id },
});

const countNotification = (event: MomentEvent, at: Date, videos: number, photos: number) => ({
  ...genericNotification(event, at),
  body: `Hemos encontrado ${describeClips(videos, photos)} de ${subjectOf(event)} en tu galería.`,
});

// Requests notification permission once the user has shown interest in a
// concert ("Voy" or Guardar). Never prompts on app open.
export const enableMomentNudges = async (userId: string) => {
  if (!isNativeNotifications()) return;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display === 'prompt' || display === 'prompt-with-rationale') {
      await LocalNotifications.requestPermissions();
    }
  } catch {
    return;
  }
  await syncMomentNudges(userId);
};

let syncing: Promise<void> | null = null;

// Idempotent; safe to call on every app open and resume.
export const syncMomentNudges = (userId: string, now = new Date()) => {
  if (!isNativeNotifications()) return Promise.resolve();
  if (!syncing) {
    syncing = runSync(userId, now)
      .catch(error => console.warn('[moments] nudge sync failed', error))
      .finally(() => {
        syncing = null;
      });
  }
  return syncing;
};

const runSync = async (userId: string, now: Date) => {
  const { display } = await LocalNotifications.checkPermissions();
  if (display !== 'granted') return;

  const nowMs = now.getTime();
  const events = await fetchUserMomentEvents(userId, {
    from: new Date(nowMs - LOOKBACK_MS),
    to: new Date(nowMs + LOOKAHEAD_MS),
  });
  const state = readState();
  const pending = (await LocalNotifications.getPending()).notifications
    .filter(notification => notification.extra?.kind === NUDGE_KIND);
  const pendingIds = new Set(pending.map(notification => notification.id));
  const wanted = new Set<number>();

  const galleryReadable = canReadGallery(await checkGalleryPermission().catch(() => 'denied' as const));
  const toSchedule: ReturnType<typeof genericNotification>[] = [];
  const toCancel: number[] = [];

  for (const event of events) {
    const id = nudgeId(event.id);
    const at = nudgeTime(event);
    const ended = nowMs > eventWindow(event).to;
    const stale = nowMs > at.getTime() + 24 * 60 * 60 * 1000;
    if (state[event.id]?.done || stale) continue;

    if (!ended) {
      // Upcoming: make sure the fallback is there.
      wanted.add(id);
      if (!pendingIds.has(id)) {
        toSchedule.push(genericNotification(event, at));
        state[event.id] = { ...state[event.id], scheduled: true };
      }
      continue;
    }

    if (!galleryReadable) {
      // Cannot check; the fallback (if still pending) stays.
      if (pendingIds.has(id)) wanted.add(id);
      continue;
    }

    // Silent check: count the clips, without thumbnails.
    const range = eventWindow(event);
    const assets = await findMedia({ from: new Date(range.from), to: new Date(range.to), thumbnails: false });
    const matches = matchMoments(assets, [event]);
    if (matches.length === 0) {
      state[event.id] = { ...state[event.id], announced: 0 };
      continue; // not in `wanted`: any pending fallback is cancelled below
    }

    const kinds = new Map(assets.map(asset => [asset.id, asset.kind]));
    const videos = matches.filter(match => kinds.get(match.assetId) === 'video').length;
    const photos = matches.length - videos;
    wanted.add(id);
    const beforeNudge = at.getTime() > nowMs;
    if (beforeNudge) {
      // Swap the generic text for the count, unless it already says so.
      if (state[event.id]?.announced === matches.length && pendingIds.has(id)) continue;
      if (pendingIds.has(id)) toCancel.push(id);
      toSchedule.push(countNotification(event, at, videos, photos));
    } else {
      // Past 11:00. If a nudge was scheduled it has fired: do not repeat it.
      // Otherwise (permission granted late) announce now.
      if (state[event.id]?.scheduled) continue;
      toSchedule.push(countNotification(event, new Date(nowMs + 5_000), videos, photos));
    }
    state[event.id] = { ...state[event.id], announced: matches.length, scheduled: true };
  }

  for (const notification of pending) {
    if (!wanted.has(notification.id)) toCancel.push(notification.id);
  }
  if (toCancel.length > 0) {
    await LocalNotifications.cancel({ notifications: [...new Set(toCancel)].map(id => ({ id })) });
  }
  if (toSchedule.length > 0) {
    await LocalNotifications.schedule({ notifications: toSchedule });
  }
  writeState(state);
};

// Tap on a nudge → suggestions screen. Returns the unsubscribe function.
export const listenForNudgeTaps = (open: (path: string) => void) => {
  if (!isNativeNotifications()) return () => undefined;
  const handle = LocalNotifications.addListener('localNotificationActionPerformed', action => {
    const extra = action.notification.extra;
    if (extra?.kind !== NUDGE_KIND || typeof extra.eventId !== 'string') return;
    open(`${SUGGESTED_UPLOAD_PATH}?event=${encodeURIComponent(extra.eventId)}`);
  });
  return () => {
    void handle.then(listener => listener.remove());
  };
};
