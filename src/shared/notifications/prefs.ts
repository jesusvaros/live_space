// Ajustes → Notificaciones: what the person wants to hear about. Stored in
// public.notification_preferences (one row per person, no row = defaults) and
// copied on the device so the local notifications (new concerts of what they
// follow, «¿Subes lo de anoche?») can respect it without a request.

export const NOTIFICATION_TYPES = [
  'concert_day',
  'upload_reminder',
  'merch_pickup',
  'new_moments',
  'followed_new_concert',
  'suggestion_imported',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type NotificationPrefs = {
  enabled: boolean;
  types: Record<NotificationType, boolean>;
  /** 'HH:MM', device local time. */
  quietStart: string;
  quietEnd: string;
  dailyLimit: number;
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, { title: string; help: string }> = {
  concert_day: { title: 'El día del concierto', help: 'De los conciertos a los que vas.' },
  upload_reminder: { title: '¿Subes lo de anoche?', help: 'La mañana siguiente, para subir tus fotos y vídeos.' },
  merch_pickup: { title: 'Recoger tu merch', help: 'Cuándo y dónde recoger lo que reservas.' },
  new_moments: { title: 'Momentos nuevos', help: 'Cuando el público sube momentos de un concierto al que fuiste.' },
  followed_new_concert: { title: 'Conciertos nuevos', help: 'Cuando un artista, sala o festival que sigues anuncia uno.' },
  suggestion_imported: { title: 'Conciertos que nos pasas', help: 'Cuando añadimos un concierto del que nos enviaste el link.' },
};

export const DEFAULT_PREFS: NotificationPrefs = {
  enabled: true,
  types: {
    concert_day: true,
    upload_reminder: true,
    merch_pickup: true,
    new_moments: true,
    followed_new_concert: true,
    suggestion_imported: true,
  },
  quietStart: '23:00',
  quietEnd: '09:00',
  dailyLimit: 3,
};

export type NotificationPrefsRow = {
  profile_id: string;
  enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  daily_limit: number;
} & Record<NotificationType, boolean>;

/** '23:00:00' / '23:00' → '23:00'; anything else → the fallback. */
export const toClock = (value: unknown, fallback: string) => {
  const match = typeof value === 'string' ? /^(\d{1,2}):(\d{2})/.exec(value) : null;
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return fallback;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

export const prefsFromRow = (row: Partial<NotificationPrefsRow> | null | undefined): NotificationPrefs => {
  if (!row) return { ...DEFAULT_PREFS, types: { ...DEFAULT_PREFS.types } };
  const types = Object.fromEntries(
    NOTIFICATION_TYPES.map(type => [type, bool(row[type], DEFAULT_PREFS.types[type])]),
  ) as Record<NotificationType, boolean>;
  const limit = Number(row.daily_limit);
  return {
    enabled: bool(row.enabled, DEFAULT_PREFS.enabled),
    types,
    quietStart: toClock(row.quiet_start, DEFAULT_PREFS.quietStart),
    quietEnd: toClock(row.quiet_end, DEFAULT_PREFS.quietEnd),
    dailyLimit: Number.isInteger(limit) && limit >= 0 && limit <= 20 ? limit : DEFAULT_PREFS.dailyLimit,
  };
};

export const rowFromPrefs = (prefs: NotificationPrefs, profileId: string): NotificationPrefsRow => ({
  profile_id: profileId,
  enabled: prefs.enabled,
  ...prefs.types,
  quiet_start: toClock(prefs.quietStart, DEFAULT_PREFS.quietStart),
  quiet_end: toClock(prefs.quietEnd, DEFAULT_PREFS.quietEnd),
  daily_limit: Math.min(20, Math.max(0, Math.round(prefs.dailyLimit))),
});

// --- Copy on the device ----------------------------------------------------

const LOCAL_KEY = 'live_space.notification_prefs.v1';

export const readLocalPrefs = (): NotificationPrefs => {
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    return raw ? prefsFromRow(JSON.parse(raw) as Partial<NotificationPrefsRow>) : prefsFromRow(null);
  } catch {
    return prefsFromRow(null);
  }
};

export const writeLocalPrefs = (prefs: NotificationPrefs) => {
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(rowFromPrefs(prefs, '')));
  } catch {
    // No storage: the server copy still applies to push.
  }
};

export const clearLocalPrefs = () => {
  try {
    window.localStorage.removeItem(LOCAL_KEY);
  } catch {
    // Nothing to clear.
  }
};

/** Local notifications ask this before scheduling anything. */
export const isNotificationTypeOn = (type: NotificationType, prefs: NotificationPrefs = readLocalPrefs()) =>
  prefs.enabled && prefs.types[type];

// --- Row value in Ajustes ---------------------------------------------------

export type SystemPermission = 'granted' | 'denied' | 'prompt' | 'unavailable';

/**
 * «Activadas» / «Desactivadas» / «Sin permiso». On the web (no system
 * permission to speak of) only the switch counts.
 */
export const notificationsSummary = (prefs: NotificationPrefs, permission: SystemPermission) => {
  if (!prefs.enabled) return 'Desactivadas';
  if (permission === 'unavailable' || permission === 'granted') return 'Activadas';
  return 'Sin permiso';
};
