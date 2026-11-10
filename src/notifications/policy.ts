// Whether a person gets a notice in this run (pure; docs/notificaciones.md).
//
// In order: devices → master switch → the type's switch → already sent
// (dedupe key) → the type's local window → quiet hours → the concert already
// started → daily limit → one notice per person per run (the cron runs every
// hour, so the next one goes out an hour later at the earliest).

import { prefsFromRow, type NotificationPrefs, type NotificationPrefsRow } from '../shared/notifications/prefs.js';
import { isInQuietHours, localParts, safeTimezone } from './time.js';
import type { Device, Notice, SentRow } from './types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export type SkipReason =
  | 'no_device'
  | 'disabled'
  | 'type_off'
  | 'already_sent'
  | 'outside_window'
  | 'quiet_hours'
  | 'expired'
  | 'daily_limit'
  | 'one_per_run';

export type Decision = { notice: Notice; send: true } | { notice: Notice; send: false; reason: SkipReason };

/** No row (or a partial one) = the column defaults. */
export const resolvePrefs = (row: Partial<NotificationPrefsRow> | null | undefined): NotificationPrefs => prefsFromRow(row);

/** The timezone of the person's most recently seen device. */
export const userTimezone = (devices: Device[]) => {
  const latest = [...devices].sort((left, right) => right.lastSeenAt.localeCompare(left.lastSeenAt))[0];
  return safeTimezone(latest?.timezone);
};

/** A send whose every device failed for good is logged with status 'failed'. */
export const isDelivered = (row: SentRow) => row.payload?.status !== 'failed';

/** Notices delivered in the last 24 h (what daily_limit counts). */
export const sentInLastDay = (sent: SentRow[], now: Date) => {
  const since = now.getTime() - DAY_MS;
  return sent.filter(row => isDelivered(row) && new Date(row.sentAt).getTime() > since).length;
};

export type PolicyInput = {
  notices: Notice[];
  devices: Device[];
  prefs: NotificationPrefs;
  sent: SentRow[];
  timezone: string;
  now: Date;
};

const inWindow = (minutes: number, window: { from: number; to: number }) =>
  window.from <= window.to ? minutes >= window.from && minutes < window.to : minutes >= window.from || minutes < window.to;

/** `notices` must already be in priority order (buildCandidates sorts them). */
export const decide = ({ notices, devices, prefs, sent, timezone, now }: PolicyInput): Decision[] => {
  const local = localParts(now, timezone);
  const sentKeys = new Set(sent.map(row => row.dedupeKey));
  let budget = prefs.dailyLimit - sentInLastDay(sent, now);
  let sentThisRun = false;

  return notices.map((notice): Decision => {
    const skip = (reason: SkipReason): Decision => ({ notice, send: false, reason });
    if (devices.length === 0) return skip('no_device');
    if (!prefs.enabled) return skip('disabled');
    if (!prefs.types[notice.type]) return skip('type_off');
    if (sentKeys.has(notice.dedupeKey)) return skip('already_sent');
    if (!inWindow(local.minutes, notice.window)) return skip('outside_window');
    if (isInQuietHours(local.minutes, prefs.quietStart, prefs.quietEnd)) return skip('quiet_hours');
    if (notice.expiresAt && new Date(notice.expiresAt).getTime() <= now.getTime()) return skip('expired');
    if (budget <= 0) return skip('daily_limit');
    if (sentThisRun) return skip('one_per_run');
    budget -= 1;
    sentThisRun = true;
    return { notice, send: true };
  });
};
