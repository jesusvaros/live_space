import type { SupabaseClient } from '@supabase/supabase-js';

import { normalizeForMatching } from '../normalize/normalizeText.js';
import { Logger } from '../utils/logger.js';

// Fallback setlists from setlist.fm, run after the daily scrape.
//
// For every published concert that ended in the last three days, has a
// primary artist and still has no setlist items, ask setlist.fm for that
// artist's setlist on that date in that city and insert it as songs +
// event_setlist_items with source = 'setlistfm'.
//
// It only ever inserts into an empty setlist: it never updates or deletes, so
// a setlist a manager wrote (source = 'manual') is never touched. If a manager
// saves one while this runs, the unique (event_id, position) constraint makes
// our insert fail instead of mixing both.
//
// setlist.fm terms: max 2 requests/second, and a visible link back wherever
// the data is shown (src/components/event/SetlistAttribution.tsx).

export const SETLISTFM_API = 'https://api.setlist.fm/rest/1.0';
const USER_AGENT = 'LiveSpaceBot/1.0 (+https://github.com/jesusvaros/live_space)';
// 2 req/s allowed; leave headroom.
const MIN_REQUEST_GAP_MS = 600;
const LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_SHOW_MS = 4 * 60 * 60 * 1000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type SetlistFmOptions = {
  apiKey?: string;
  dryRun?: boolean;
  now?: Date;
  fetchImpl?: typeof fetch;
};

export type SetlistFmSummary = {
  skipped: boolean;
  eventsChecked: number;
  eventsWithoutSetlist: number;
  requests: number;
  setlistsFound: number;
  itemsInserted: number;
  songsCreated: number;
  errors: number;
};

// ---- setlist.fm response (only the fields we use) ---------------------------

type SetlistFmSong = { name?: string; tape?: boolean; cover?: { name?: string }; info?: string };
type SetlistFmSet = { name?: string; encore?: number; song?: SetlistFmSong[] };
export type SetlistFmSetlist = {
  id: string;
  eventDate: string; // dd-MM-yyyy
  url?: string;
  artist?: { name?: string; mbid?: string };
  venue?: { name?: string; city?: { name?: string } };
  sets?: { set?: SetlistFmSet[] };
};

export type SetlistSong = { title: string; notes: string | null };

// "2026-10-26T19:00:00Z" → "26-10-2026" in the event's timezone, the format
// setlist.fm's search expects.
export const setlistFmDate = (startsAtIso: string, timeZone = 'Europe/Madrid') => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' })
    .formatToParts(new Date(startsAtIso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('day')}-${get('month')}-${get('year')}`;
};

// Songs in play order. Tapes (intro music) are not songs the artist played.
export const setlistSongs = (setlist: SetlistFmSetlist): SetlistSong[] => {
  const songs: SetlistSong[] = [];
  for (const set of setlist.sets?.set ?? []) {
    for (const song of set.song ?? []) {
      const title = song.name?.trim();
      if (!title || song.tape) continue;
      const notes = [
        set.encore ? 'Bis' : null,
        song.cover?.name ? `Versión de ${song.cover.name}` : null,
        song.info?.trim() || null,
      ].filter(Boolean).join(' · ');
      songs.push({ title, notes: notes || null });
    }
  }
  return songs;
};

// setlist.fm's artistName search is fuzzy ("Morat" also returns tribute
// bands): keep the exact artist with a non-empty setlist on the right date.
export const pickSetlist = (candidates: SetlistFmSetlist[], artistName: string, date: string) => {
  const wanted = normalizeForMatching(artistName);
  return candidates.find((candidate) =>
    candidate.eventDate === date
    && normalizeForMatching(candidate.artist?.name) === wanted
    && setlistSongs(candidate).length > 0) ?? null;
};

// Same normalisation the app uses when a manager creates a song.
const normalizedTitle = (title: string) => title.trim().toLocaleLowerCase('es');

// ---- client -------------------------------------------------------------------

class SetlistFmClient {
  private lastRequestAt = 0;
  requests = 0;

  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch) {}

  async search(params: { artistName: string; date: string; cityName?: string | null }): Promise<SetlistFmSetlist[]> {
    const query = new URLSearchParams({ artistName: params.artistName, date: params.date, p: '1' });
    if (params.cityName) query.set('cityName', params.cityName);
    const url = `${SETLISTFM_API}/search/setlists?${query.toString()}`;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const wait = this.lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
      if (wait > 0) await sleep(wait);
      this.lastRequestAt = Date.now();
      this.requests += 1;
      const response = await this.fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'es',
          'x-api-key': this.apiKey,
          'User-Agent': USER_AGENT,
        },
      });
      if (response.status === 404) return []; // their "no results"
      if (response.status === 429 && attempt === 0) {
        await sleep(2_000);
        continue;
      }
      if (!response.ok) throw new Error(`setlist.fm responded ${response.status}`);
      const body = (await response.json()) as { setlist?: SetlistFmSetlist[] };
      return body.setlist ?? [];
    }
    throw new Error('setlist.fm rate limit');
  }
}

// ---- pipeline step ------------------------------------------------------------

type EventRow = {
  id: string;
  starts_at: string;
  ends_at: string | null;
  city: string | null;
  timezone: string | null;
  venue_place: { city: string | null } | null;
  event_artists: Array<{ billing_order: number | null; is_headliner: boolean | null; artist: { id: string; name: string } | null }>;
};

const primaryArtist = (row: EventRow) =>
  [...(row.event_artists || [])]
    .filter((entry) => entry.artist?.name)
    .sort((left, right) =>
      Number(Boolean(right.is_headliner)) - Number(Boolean(left.is_headliner))
      || (left.billing_order ?? 0) - (right.billing_order ?? 0))[0]?.artist ?? null;

// Published concerts whose end (ends_at, or starts_at + 4 h) is in the last 3 days.
const fetchRecentlyEndedEvents = async (supabase: SupabaseClient, now: Date): Promise<EventRow[]> => {
  const nowMs = now.getTime();
  const { data, error } = await supabase
    .from('events')
    .select(`
      id,starts_at,ends_at,city,timezone,
      venue_place:venue_places!events_venue_place_id_fkey (city),
      event_artists (billing_order,is_headliner, artist:artists!event_artists_artist_id_fkey (id,name))
    `)
    .eq('status', 'published')
    .gte('starts_at', new Date(nowMs - LOOKBACK_MS - DEFAULT_SHOW_MS * 3).toISOString())
    .lte('starts_at', now.toISOString())
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return ((data || []) as unknown as EventRow[]).filter((row) => {
    const end = row.ends_at ? Date.parse(row.ends_at) : Date.parse(row.starts_at) + DEFAULT_SHOW_MS;
    return end <= nowMs && end >= nowMs - LOOKBACK_MS;
  });
};

const eventsWithSetlist = async (supabase: SupabaseClient, eventIds: string[]) => {
  if (eventIds.length === 0) return new Set<string>();
  const { data, error } = await supabase.from('event_setlist_items').select('event_id').in('event_id', eventIds);
  if (error) throw error;
  return new Set((data || []).map((row: { event_id: string }) => row.event_id));
};

// Existing song of this artist with the same title, or a new one.
const resolveSongIds = async (
  supabase: SupabaseClient,
  artistId: string,
  titles: string[],
  summary: SetlistFmSummary,
): Promise<string[]> => {
  const { data, error } = await supabase
    .from('songs')
    .select('id,normalized_title')
    .eq('primary_artist_id', artistId);
  if (error) throw error;
  const byTitle = new Map((data || []).map((row: { id: string; normalized_title: string }) => [row.normalized_title, row.id]));

  const missing = [...new Set(titles.map(normalizedTitle))].filter((title) => !byTitle.has(title));
  if (missing.length > 0) {
    const rows = missing.map((normalized) => ({
      title: titles.find((title) => normalizedTitle(title) === normalized) ?? normalized,
      normalized_title: normalized,
      primary_artist_id: artistId,
      external_ids: { source: 'setlistfm' },
    }));
    const { data: inserted, error: insertError } = await supabase.from('songs').insert(rows).select('id,normalized_title');
    if (insertError) throw insertError;
    for (const row of (inserted || []) as Array<{ id: string; normalized_title: string }>) byTitle.set(row.normalized_title, row.id);
    summary.songsCreated += inserted?.length ?? 0;
  }
  return titles.map((title) => byTitle.get(normalizedTitle(title)) as string);
};

export const fillSetlistsFromSetlistFm = async (
  supabase: SupabaseClient,
  options: SetlistFmOptions,
  logger: Logger,
): Promise<SetlistFmSummary> => {
  const summary: SetlistFmSummary = {
    skipped: false,
    eventsChecked: 0,
    eventsWithoutSetlist: 0,
    requests: 0,
    setlistsFound: 0,
    itemsInserted: 0,
    songsCreated: 0,
    errors: 0,
  };
  if (!options.apiKey) {
    logger.info('SETLISTFM_API_KEY not set; skipping the setlist.fm fallback');
    return { ...summary, skipped: true };
  }

  const now = options.now ?? new Date();
  const client = new SetlistFmClient(options.apiKey, options.fetchImpl ?? fetch);
  const events = await fetchRecentlyEndedEvents(supabase, now);
  summary.eventsChecked = events.length;
  const withSetlist = await eventsWithSetlist(supabase, events.map((event) => event.id));

  for (const event of events) {
    if (withSetlist.has(event.id)) continue; // a manager's (or an earlier run's) setlist wins
    const artist = primaryArtist(event);
    if (!artist) continue;
    summary.eventsWithoutSetlist += 1;

    const date = setlistFmDate(event.starts_at, event.timezone || 'Europe/Madrid');
    const city = event.venue_place?.city || event.city;
    const log = logger.child({ eventId: event.id, artist: artist.name, date, city });
    try {
      const candidates = await client.search({ artistName: artist.name, date, cityName: city });
      const setlist = pickSetlist(candidates, artist.name, date);
      if (!setlist) {
        log.debug('No setlist on setlist.fm');
        continue;
      }
      summary.setlistsFound += 1;
      const songs = setlistSongs(setlist);
      if (options.dryRun) {
        log.info('Would insert setlist.fm setlist', { songs: songs.length, url: setlist.url });
        continue;
      }

      const songIds = await resolveSongIds(supabase, artist.id, songs.map((song) => song.title), summary);
      const items = songs.map((song, index) => ({
        event_id: event.id,
        position: index + 1,
        song_id: songIds[index],
        artist_id: artist.id,
        notes: song.notes,
        source: 'setlistfm',
        source_url: setlist.url ?? null,
      }));
      const { error } = await supabase.from('event_setlist_items').insert(items);
      if (error) throw error;
      summary.itemsInserted += items.length;
      log.info('Inserted setlist.fm setlist', { songs: items.length });
    } catch (error) {
      summary.errors += 1;
      log.error('setlist.fm fallback failed for event', error);
    }
  }

  summary.requests = client.requests;
  logger.info('setlist.fm fallback finished', summary);
  return summary;
};
