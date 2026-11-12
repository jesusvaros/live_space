// Shared shapes of the push sender (docs/notificaciones.md).

import type { NotificationPrefs } from '../shared/notifications/prefs.js';

export const SENDER_TYPES = ['merch_pickup', 'concert_day', 'upload_reminder', 'suggestion_imported', 'followed_new_concert'] as const;
export type SenderType = (typeof SENDER_TYPES)[number];

export type Channel = 'conciertos' | 'momentos' | 'merch';

export type EventInfo = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string | null;
  /** events.city, else the venue's city. */
  city: string | null;
  venueName: string | null;
  venuePlaceId: string | null;
  festivalId: string | null;
  /** Ordered by billing (headliner first). */
  artistIds: string[];
  headliner: string | null;
  /** coalesce(published_at, created_at): when it became visible. */
  announcedAt: string;
};

export type Device = {
  id: string;
  token: string;
  platform: string;
  timezone: string | null;
  createdAt: string;
  lastSeenAt: string;
};

export type SentRow = {
  type: string;
  dedupeKey: string;
  sentAt: string;
  payload: Record<string, unknown> | null;
};

export type Follow = {
  artistId: string | null;
  venuePlaceId: string | null;
  festivalId: string | null;
  createdAt: string;
};

export type MerchOrder = {
  id: string;
  eventId: string;
  status: string;
  pickupCode: string | null;
  pickupPoint: string | null;
};

export type Attendance = { eventId: string; status: 'going' | 'attended' | 'interested' };

/** Everything the candidate builder knows about one person. */
export type UserData = {
  profileId: string;
  devices: Device[];
  prefs: NotificationPrefs;
  /** Normalized city names that count as «near»; empty = anywhere. */
  homeCities: string[];
  attendance: Attendance[];
  /** Events the person already uploaded something to. */
  uploadedEventIds: Set<string>;
  merchOrders: MerchOrder[];
  follows: Follow[];
  /** Upcoming published concerts imported from links this person sent (event_link_suggestions). */
  suggestedEvents: EventInfo[];
  /** notifications_sent of the last days (dedupe, daily limit, announced concerts). */
  sent: SentRow[];
};

export type Notice = {
  type: SenderType;
  profileId: string;
  dedupeKey: string;
  title: string;
  body: string;
  route: string;
  channel: Channel;
  priority: 'high' | 'normal';
  /** FCM time to live: a stale notice is worse than none. */
  ttlSeconds: number;
  eventIds: string[];
  /** Local send window, minutes since midnight [from, to). */
  window: { from: number; to: number };
  /** Never send after this instant (e.g. the concert already started). */
  expiresAt: string | null;
};
