// Reads what the push sender needs from Supabase with the service role
// (docs/notificaciones.md). Only SELECTs: every write lives in the script.

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolvePrefs } from './policy.js';
import { FOLLOWED_LOOKBACK_MS } from './candidates.js';
import type { Attendance, Device, EventInfo, Follow, MerchOrder, SentRow, UserData } from './types.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** notifications_sent read back: covers daily_limit and announced concerts. */
const SENT_MEMORY_MS = 14 * DAY_MS;
/** Suggestions imported this recently still announce their concert. */
export const SUGGESTION_MEMORY_MS = 7 * DAY_MS;
const CHUNK = 100;
const PAGE = 1000;

const EVENT_SELECT = `
  id,name,starts_at,ends_at,city,venue_place_id,festival_id,created_at,published_at,
  venue_place:venue_places!events_venue_place_id_fkey (name,city),
  event_artists (billing_order,artist_id,artist:artists!event_artists_artist_id_fkey (name))
`;

const chunks = <T>(items: T[], size = CHUNK) => {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
};

type Row = Record<string, any>;

/** Runs a query builder page by page (PostgREST caps responses at 1000 rows). */
const allPages = async (build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>, max = 20_000) => {
  const rows: Row[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as Row[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
};

const inChunks = async (ids: string[], query: (chunk: string[]) => PromiseLike<{ data: unknown; error: unknown }>) => {
  const rows: Row[] = [];
  for (const chunk of chunks([...new Set(ids)])) {
    if (chunk.length === 0) continue;
    const { data, error } = await query(chunk);
    if (error) throw error;
    rows.push(...((data ?? []) as Row[]));
  }
  return rows;
};

export const toEventInfo = (row: Row): EventInfo => {
  const artists = [...(row.event_artists || [])].sort(
    (left: Row, right: Row) => (left.billing_order ?? 99) - (right.billing_order ?? 99),
  );
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    startsAt: row.starts_at,
    endsAt: row.ends_at ?? null,
    city: row.city || row.venue_place?.city || null,
    venueName: row.venue_place?.name ?? null,
    venuePlaceId: row.venue_place_id ?? null,
    festivalId: row.festival_id ?? null,
    artistIds: artists.map((artist: Row) => String(artist.artist_id)).filter(Boolean),
    headliner: artists.find((artist: Row) => artist.artist?.name)?.artist?.name ?? null,
    announcedAt: row.published_at ?? row.created_at,
  };
};

export type LoadOptions = { now: Date; profileId?: string | null };

export type Loaded = {
  users: UserData[];
  events: Map<string, EventInfo>;
  newEvents: EventInfo[];
  stats: { devices: number; usersWithDevices: number; eventsInWindow: number; newEvents: number };
};

export const loadSenderData = async (supabase: SupabaseClient, { now, profileId }: LoadOptions): Promise<Loaded> => {
  // `any`: the PostgREST builder types are too deep to thread through here.
  const only = (query: any, column: string) => (profileId ? query.eq(column, profileId) : query);

  // 1. Active devices.
  const deviceRows = await allPages((from, to) =>
    only(
      supabase
        .from('push_devices')
        .select('id,profile_id,token,platform,timezone,created_at,last_seen_at')
        .is('disabled_at', null),
      'profile_id',
    )
      .order('id')
      .range(from, to),
  );
  const devicesByUser = new Map<string, Device[]>();
  for (const row of deviceRows) {
    const list = devicesByUser.get(row.profile_id) ?? [];
    list.push({
      id: row.id,
      token: row.token,
      platform: row.platform,
      timezone: row.timezone ?? null,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
    });
    devicesByUser.set(row.profile_id, list);
  }

  // 2. Concerts from yesterday to tomorrow (concert_day, upload_reminder, merch_pickup).
  const eventRows = await allPages((from, to) =>
    supabase
      .from('events')
      .select(EVENT_SELECT)
      .eq('status', 'published')
      .gte('starts_at', new Date(now.getTime() - 54 * HOUR_MS).toISOString())
      .lte('starts_at', new Date(now.getTime() + 36 * HOUR_MS).toISOString())
      .order('id')
      .range(from, to),
  );
  const events = new Map(eventRows.map(row => [String(row.id), toEventInfo(row)]));
  const eventIds = [...events.keys()];

  const attendanceRows = await inChunks(eventIds, chunk =>
    only(
      supabase.from('event_attendance').select('profile_id,event_id,status').in('status', ['going', 'attended']).in('event_id', chunk),
      'profile_id',
    ),
  );
  const merchRows = await inChunks(eventIds, chunk =>
    only(
      supabase
        .from('merch_orders')
        .select('id,event_id,buyer_id,status,pickup_code,pickup_point')
        .in('status', ['reserved', 'paid'])
        .is('collected_at', null)
        .is('cancelled_at', null)
        .in('event_id', chunk),
      'buyer_id',
    ),
  );

  const userIds = new Set<string>([
    ...devicesByUser.keys(),
    ...attendanceRows.map(row => String(row.profile_id)),
    ...merchRows.map(row => String(row.buyer_id)),
  ]);
  const allUsers = [...userIds];
  const deviceUsers = [...devicesByUser.keys()];

  // 3. Already uploaded to those concerts (posts or media of their own).
  const attendingUsers = [...new Set(attendanceRows.map(row => String(row.profile_id)))];
  const uploaded = new Set<string>();
  for (const chunk of chunks(attendingUsers)) {
    const postRows = await inChunks(eventIds, events =>
      supabase.from('posts').select('author_id,event_id').in('author_id', chunk).in('event_id', events).neq('status', 'archived'),
    );
    for (const row of postRows) uploaded.add(`${row.author_id}:${row.event_id}`);
    const mediaRows = await inChunks(eventIds, events =>
      supabase
        .from('media_assets')
        .select('owner_id,event_id')
        .in('owner_id', chunk)
        .in('event_id', events)
        .not('status', 'in', '(deleted,rejected)'),
    );
    for (const row of mediaRows) uploaded.add(`${row.owner_id}:${row.event_id}`);
  }

  // 4. Follows of people with devices (no device → no followed notice).
  const userSubjects = await inChunks(deviceUsers, chunk =>
    supabase.from('subjects').select('id,profile_id').eq('type', 'user').in('profile_id', chunk),
  );
  const userBySubject = new Map(userSubjects.map(row => [String(row.id), String(row.profile_id)]));
  const followRows = await inChunks([...userBySubject.keys()], chunk =>
    supabase.from('follows').select('follower_subject_id,target_subject_id,created_at').in('follower_subject_id', chunk),
  );
  const targetRows = await inChunks(
    followRows.map(row => String(row.target_subject_id)),
    chunk => supabase.from('subjects').select('*').in('id', chunk),
  );
  const targets = new Map(targetRows.map(row => [String(row.id), row]));
  const followsByUser = new Map<string, Follow[]>();
  for (const row of followRows) {
    const user = userBySubject.get(String(row.follower_subject_id));
    const target = targets.get(String(row.target_subject_id));
    if (!user || !target) continue;
    const follow: Follow = {
      artistId: target.artist_id ?? null,
      venuePlaceId: target.venue_place_id ?? null,
      festivalId: target.festival_id ?? null,
      createdAt: row.created_at,
    };
    if (!follow.artistId && !follow.venuePlaceId && !follow.festivalId) continue;
    followsByUser.set(user, [...(followsByUser.get(user) ?? []), follow]);
  }

  // 5. Concerts announced in the last 48 h (only needed if someone follows).
  let newEvents: EventInfo[] = [];
  if (followsByUser.size > 0) {
    const since = new Date(now.getTime() - FOLLOWED_LOOKBACK_MS).toISOString();
    const rows = await allPages((from, to) =>
      supabase
        .from('events')
        .select(EVENT_SELECT)
        .eq('status', 'published')
        .gte('starts_at', now.toISOString())
        .or(`published_at.gte.${since},created_at.gte.${since}`)
        .order('id')
        .range(from, to),
    );
    newEvents = rows.map(toEventInfo);
  }

  // 6. Cities: primary_city, else where they usually go.
  const profileRows = await inChunks(deviceUsers, chunk => supabase.from('profiles').select('id,primary_city').in('id', chunk));
  const cityRows = await inChunks(deviceUsers, chunk =>
    supabase
      .from('event_attendance')
      .select('profile_id,event:events!inner (city,venue_place:venue_places!events_venue_place_id_fkey (city))')
      .in('profile_id', chunk)
      .limit(2000),
  );
  const homeCities = new Map<string, string[]>();
  for (const row of profileRows) if (row.primary_city) homeCities.set(String(row.id), [row.primary_city]);
  const cityCounts = new Map<string, Map<string, number>>();
  for (const row of cityRows) {
    const user = String(row.profile_id);
    if (homeCities.has(user)) continue;
    const city = row.event?.city || row.event?.venue_place?.city;
    if (!city) continue;
    const counts = cityCounts.get(user) ?? new Map<string, number>();
    counts.set(city, (counts.get(city) ?? 0) + 1);
    cityCounts.set(user, counts);
  }
  for (const [user, counts] of cityCounts) {
    homeCities.set(user, [...counts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 3).map(([city]) => city));
  }

  // 7. Concerts imported from links they sent (event_link_suggestions).
  // Optional: before migration 20261112000100 the table does not exist and
  // nobody has suggestions; any other error still fails the run.
  const suggestedByUser = new Map<string, EventInfo[]>();
  let suggestionRows: Row[] = [];
  try {
    suggestionRows = await inChunks(deviceUsers, chunk =>
      supabase
        .from('event_link_suggestions')
        .select('suggested_by,result_event_id')
        .eq('status', 'imported')
        .not('result_event_id', 'is', null)
        .gte('processed_at', new Date(now.getTime() - SUGGESTION_MEMORY_MS).toISOString())
        .in('suggested_by', chunk),
    );
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== '42P01' && code !== 'PGRST205') throw error;
  }
  if (suggestionRows.length > 0) {
    const suggestedRows = await inChunks(
      suggestionRows.map(row => String(row.result_event_id)),
      chunk => supabase.from('events').select(EVENT_SELECT).eq('status', 'published').gte('starts_at', now.toISOString()).in('id', chunk),
    );
    const suggestedEvents = new Map(suggestedRows.map(row => [String(row.id), toEventInfo(row)]));
    for (const row of suggestionRows) {
      const event = suggestedEvents.get(String(row.result_event_id));
      if (!event) continue;
      const user = String(row.suggested_by);
      const list = suggestedByUser.get(user) ?? [];
      if (!list.some(item => item.id === event.id)) list.push(event);
      suggestedByUser.set(user, list);
    }
    for (const list of suggestedByUser.values()) list.sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  }

  // 8. Preferences and what was already sent.
  const prefRows = await inChunks(allUsers, chunk => supabase.from('notification_preferences').select('*').in('profile_id', chunk));
  const prefsByUser = new Map(prefRows.map(row => [String(row.profile_id), row]));
  const sentRows = await inChunks(allUsers, chunk =>
    supabase
      .from('notifications_sent')
      .select('profile_id,type,dedupe_key,sent_at,payload')
      .in('profile_id', chunk)
      .gte('sent_at', new Date(now.getTime() - SENT_MEMORY_MS).toISOString())
      .limit(10_000),
  );
  const sentByUser = new Map<string, SentRow[]>();
  for (const row of sentRows) {
    const list = sentByUser.get(String(row.profile_id)) ?? [];
    list.push({ type: row.type, dedupeKey: row.dedupe_key, sentAt: row.sent_at, payload: row.payload ?? null });
    sentByUser.set(String(row.profile_id), list);
  }

  const attendanceByUser = new Map<string, Attendance[]>();
  for (const row of attendanceRows) {
    const list = attendanceByUser.get(String(row.profile_id)) ?? [];
    list.push({ eventId: String(row.event_id), status: row.status });
    attendanceByUser.set(String(row.profile_id), list);
  }
  const merchByUser = new Map<string, MerchOrder[]>();
  for (const row of merchRows) {
    const list = merchByUser.get(String(row.buyer_id)) ?? [];
    list.push({
      id: String(row.id),
      eventId: String(row.event_id),
      status: row.status,
      pickupCode: row.pickup_code ?? null,
      pickupPoint: row.pickup_point ?? null,
    });
    merchByUser.set(String(row.buyer_id), list);
  }

  const users: UserData[] = allUsers.map(id => ({
    profileId: id,
    devices: devicesByUser.get(id) ?? [],
    prefs: resolvePrefs(prefsByUser.get(id)),
    homeCities: homeCities.get(id) ?? [],
    attendance: attendanceByUser.get(id) ?? [],
    uploadedEventIds: new Set(
      (attendanceByUser.get(id) ?? []).map(row => row.eventId).filter(eventId => uploaded.has(`${id}:${eventId}`)),
    ),
    merchOrders: merchByUser.get(id) ?? [],
    follows: followsByUser.get(id) ?? [],
    suggestedEvents: suggestedByUser.get(id) ?? [],
    sent: sentByUser.get(id) ?? [],
  }));

  return {
    users,
    events,
    newEvents,
    stats: { devices: deviceRows.length, usersWithDevices: deviceUsers.length, eventsInWindow: events.size, newEvents: newEvents.length },
  };
};
