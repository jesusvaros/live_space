import { supabase } from '../lib/supabase';

// What the agenda setup (/empezar) ranks: genres and who to follow. Each is a
// small server-side aggregate; until those functions are deployed, a slim
// select of just the columns needed, counted here with the same rules.

// PostgREST caps a response at 1000 rows; longer lists are read in pages.
const MAX_ROWS = 1000;

// RPCs known to be missing, so the fallback does not pay a failed round trip
// every time.
const missingRpcs = new Set<string>();

const callRpc = async (name: string, args: Record<string, unknown>): Promise<any[] | null> => {
  if (missingRpcs.has(name)) return null;
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    missingRpcs.add(name);
    return null;
  }
  return (data || []) as any[];
};

const readAllPages = async (page: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>) => {
  const rows: any[] = [];
  for (let from = 0; ; from += MAX_ROWS) {
    const { data, error } = await page(from, from + MAX_ROWS - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < MAX_ROWS) break;
  }
  return rows;
};

const escapeLike = (value: string) => value.replace(/[\\%_]/g, match => `\\${match}`);

const fold = (value: string) => value.trim().toLocaleLowerCase('es');

const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase('es') + value.slice(1);

const artistsOf = (row: any): any[] =>
  (row?.event_artists || []).map((entry: any) => entry?.artist).filter(Boolean);

export type AgendaGenre = { key: string; label: string; local: number; total: number };

export type AgendaRange = { startIso: string; endIso: string };

const sortGenres = (genres: AgendaGenre[]) =>
  genres.sort(
    (left, right) => right.local - left.local || right.total - left.total || left.label.localeCompare(right.label, 'es'),
  );

/**
 * Genres of the concerts, the given city's first, most common first. A
 * concert counts once per genre; the label is the most common spelling.
 * Rows: { city, event_artists: [{ artist: { genres } }] }.
 */
export const rankGenres = (rows: any[], city?: string | null): AgendaGenre[] => {
  const cityKey = city ? fold(city) : null;
  const counts = new Map<string, { local: number; total: number; spellings: Map<string, number> }>();
  for (const row of rows) {
    const local = Boolean(cityKey) && fold(String(row?.city ?? '')) === cityKey;
    const seen = new Set<string>();
    for (const artist of artistsOf(row)) {
      for (const raw of artist.genres || []) {
        const spelling = String(raw ?? '').trim();
        const key = fold(spelling);
        if (!key) continue;
        const current = counts.get(key) || { local: 0, total: 0, spellings: new Map<string, number>() };
        current.spellings.set(spelling, (current.spellings.get(spelling) || 0) + 1);
        if (!seen.has(key)) {
          seen.add(key);
          current.total += 1;
          if (local) current.local += 1;
        }
        counts.set(key, current);
      }
    }
  }
  return sortGenres(
    [...counts.entries()].map(([key, value]) => {
      const spelling = [...value.spellings.entries()].sort(
        (left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1),
      )[0][0];
      return { key, label: capitalize(spelling), local: value.local, total: value.total };
    }),
  );
};

export const fetchAgendaGenres = async (range: AgendaRange, city: string | null, limit: number): Promise<AgendaGenre[]> => {
  const rows = await callRpc('get_agenda_genres', {
    p_from: range.startIso,
    p_to: range.endIso,
    p_city: city,
    p_limit: limit,
  });
  if (rows) {
    return sortGenres(
      rows
        .map(row => {
          const spelling = String(row.genre ?? '').trim();
          return { key: fold(spelling), label: capitalize(spelling), local: Number(row.local_count ?? 0), total: Number(row.total_count ?? 0) };
        })
        .filter(genre => genre.key),
    ).slice(0, limit);
  }
  const all = await readAllPages((from, to) =>
    supabase
      .from('events')
      .select('city,event_artists(artist:artists!event_artists_artist_id_fkey(genres))')
      .eq('status', 'published')
      .gte('starts_at', range.startIso)
      .lte('starts_at', range.endIso)
      .order('id', { ascending: true })
      .range(from, to),
  );
  return rankGenres(all, city).slice(0, limit);
};

export type AgendaPick = { id: string; concerts: number };
export type AgendaSuggestionIds = { artists: AgendaPick[]; venues: AgendaPick[] };

/**
 * Who plays most in the city's concerts (a concert with any of the tastes
 * weighs six times more) and its busiest venues.
 * Rows: { venue_place_id, event_artists: [{ artist: { id, genres } }] }.
 */
export const rankSuggestions = (
  rows: any[],
  tastes: string[],
  limits: { artists: number; venues: number },
): AgendaSuggestionIds => {
  const tasteKeys = new Set(tastes.map(fold));
  const artists = new Map<string, { concerts: number; score: number }>();
  const venues = new Map<string, number>();
  for (const row of rows) {
    const lineup = artistsOf(row);
    const matches = lineup.some(artist => (artist.genres || []).some((genre: string) => tasteKeys.has(fold(String(genre ?? '')))));
    for (const artist of lineup) {
      if (!artist.id) continue;
      const current = artists.get(String(artist.id)) || { concerts: 0, score: 0 };
      current.concerts += 1;
      current.score += matches ? 6 : 1;
      artists.set(String(artist.id), current);
    }
    if (row?.venue_place_id) venues.set(String(row.venue_place_id), (venues.get(String(row.venue_place_id)) || 0) + 1);
  }
  return {
    artists: [...artists.entries()]
      .sort((left, right) => right[1].score - left[1].score || right[1].concerts - left[1].concerts || (left[0] < right[0] ? -1 : 1))
      .slice(0, limits.artists)
      .map(([id, stats]) => ({ id, concerts: stats.concerts })),
    venues: [...venues.entries()]
      .sort((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1))
      .slice(0, limits.venues)
      .map(([id, concerts]) => ({ id, concerts })),
  };
};

export const fetchAgendaSuggestionIds = async (
  range: AgendaRange,
  city: string,
  tastes: string[],
  limits: { artists: number; venues: number },
): Promise<AgendaSuggestionIds> => {
  const rows = await callRpc('get_agenda_suggestions', {
    p_from: range.startIso,
    p_to: range.endIso,
    p_city: city,
    p_tastes: tastes,
    p_artists: limits.artists,
    p_venues: limits.venues,
  });
  if (rows) {
    const pick = (kind: string) =>
      rows
        .filter(row => row.kind === kind && row.id)
        .sort((left, right) => Number(right.score ?? 0) - Number(left.score ?? 0))
        .map(row => ({ id: String(row.id), concerts: Number(row.concerts ?? 0) }));
    return { artists: pick('artist').slice(0, limits.artists), venues: pick('venue').slice(0, limits.venues) };
  }
  const cityRows = await readAllPages((from, to) =>
    supabase
      .from('events')
      .select('venue_place_id,event_artists(artist:artists!event_artists_artist_id_fkey(id,genres))')
      .eq('status', 'published')
      .gte('starts_at', range.startIso)
      .lte('starts_at', range.endIso)
      .ilike('city', escapeLike(city.trim()))
      .order('id', { ascending: true })
      .range(from, to),
  );
  return rankSuggestions(cityRows, tastes, limits);
};
