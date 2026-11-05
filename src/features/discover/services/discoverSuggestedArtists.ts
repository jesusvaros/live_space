import { supabase } from '../../../lib/supabase';
import { cached } from '../../../lib/requestCache';
import { calculateDistanceKm, toNumber } from '../../events/utils';
import { genreKey, readTastes } from '../../agenda/agendaPrefs';
import { DiscoverArtist, StyleShelf, SuggestedArtists, SuggestedSection } from '../types';
import { looksLikeEventName } from '../artistNames';

const SECTION_LIMIT = 9;
const STYLE_LIMIT = 30;
const NEARBY_RADIUS_KM = 50;

const dateWindow = () => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfWindow = new Date(startOfToday);
  endOfWindow.setDate(endOfWindow.getDate() + 21);
  endOfWindow.setHours(23, 59, 59, 999);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  endOfWeek.setHours(23, 59, 59, 999);
  return { startOfToday, endOfWindow, endOfWeek };
};

const mapArtist = (row: any): DiscoverArtist => ({
  id: row.artist_id,
  subject_id: row.subject_id,
  name: row.name,
  avatar_url: row.avatar_url,
  city: row.city,
  genres: row.genres || [],
});

const fetchArtistsByIds = async (artistIds: string[]) => {
  if (artistIds.length === 0) return new Map<string, DiscoverArtist>();
  const uniqueSorted = Array.from(new Set(artistIds)).sort();
  const data = await cached(
    `artists:by_ids:${uniqueSorted.join(',')}`,
    async () => {
      const { data, error } = await supabase
        .from('v_subject_artists')
        .select('artist_id,subject_id,name,avatar_url,city,genres')
        .in('artist_id', uniqueSorted);
      if (error) throw error;
      return data || [];
    },
    { ttlMs: 60_000 }
  );
  return new Map((data as any[]).map(row => [row.artist_id as string, mapArtist(row)]));
};

// Just what the shelves need: where and when, and who plays. The full card
// select (posters, venue details, media) is several times heavier.
const AGENDA_SELECT = `
  starts_at,latitude,longitude,genres,
  venue_place:venue_places!events_venue_place_id_fkey (latitude,longitude),
  event_artists ( artist:artists!event_artists_artist_id_fkey (id,name,image_url,genres) )
`;

type AgendaRow = {
  starts_at: string;
  latitude: number | string | null;
  longitude: number | string | null;
  genres: string[] | null;
  venue_place: { latitude: number | string | null; longitude: number | string | null } | null;
  event_artists: Array<{
    artist: { id: string; name: string; image_url: string | null; genres: string[] | null } | null;
  }> | null;
};

const fetchAgenda = (startIso: string, endIso: string) =>
  cached(
    `discover:agenda:${startIso}:${endIso}`,
    async () => {
      const { data, error } = await supabase
        .from('events')
        .select(AGENDA_SELECT)
        .eq('status', 'published')
        .gte('starts_at', startIso)
        .lte('starts_at', endIso);
      if (error) throw error;
      return (data || []) as unknown as AgendaRow[];
    },
    { ttlMs: 60_000 }
  );

type ArtistStats = {
  id: string;
  concerts: number;
  weekConcerts: number;
  nearConcerts: number;
  hasPhoto: boolean;
  styles: Set<string>;
};

// Who plays in the next three weeks, and how: every shelf of Explorar is
// cut from this one pass over the agenda.
const collectArtists = (
  events: AgendaRow[],
  endOfWeek: Date,
  location: { lat: number; lng: number } | null | undefined
) => {
  const stats = new Map<string, ArtistStats>();
  for (const event of events) {
    const lat = toNumber(event.latitude ?? event.venue_place?.latitude ?? null);
    const lng = toNumber(event.longitude ?? event.venue_place?.longitude ?? null);
    const near =
      Boolean(location) && lat !== null && lng !== null
        && calculateDistanceKm(location!.lat, location!.lng, lat, lng) <= NEARBY_RADIUS_KM;
    const thisWeek = new Date(event.starts_at) <= endOfWeek;
    for (const entry of event.event_artists || []) {
      const artist = entry.artist;
      if (!artist?.id || looksLikeEventName(artist.name)) continue;
      const current = stats.get(artist.id) || {
        id: artist.id,
        concerts: 0,
        weekConcerts: 0,
        nearConcerts: 0,
        hasPhoto: Boolean(artist.image_url),
        styles: new Set<string>(),
      };
      current.concerts += 1;
      if (thisWeek) current.weekConcerts += 1;
      if (near) current.nearConcerts += 1;
      // The artist's own styles; a local act Deezer does not know borrows
      // the night's.
      for (const style of artist.genres?.length ? artist.genres : event.genres || []) current.styles.add(style);
      stats.set(artist.id, current);
    }
  }
  return [...stats.values()];
};

// A face sells a grid of portraits: artists with a photo go first.
const rank = (list: ArtistStats[], weight: (stats: ArtistStats) => number) =>
  list
    .filter(stats => weight(stats) > 0)
    .sort((left, right) => Number(right.hasPhoto) - Number(left.hasPhoto) || weight(right) - weight(left));

export const getSuggestedArtists = async (options?: {
  location?: { lat: number; lng: number } | null;
}): Promise<SuggestedArtists> => {
  const { startOfToday, endOfWindow, endOfWeek } = dateWindow();
  const events = await fetchAgenda(startOfToday.toISOString(), endOfWindow.toISOString());
  const artists = collectArtists(events, endOfWeek, options?.location);

  const near = options?.location ? rank(artists, stats => stats.nearConcerts).slice(0, SECTION_LIMIT) : [];
  const nearIds = new Set(near.map(stats => stats.id));
  const week = rank(artists, stats => (nearIds.has(stats.id) ? 0 : stats.weekConcerts)).slice(0, SECTION_LIMIT);

  // Styles with enough artists to fill a row, the user's tastes first.
  const tastes = readTastes();
  const byStyle = new Map<string, ArtistStats[]>();
  for (const stats of artists) {
    for (const style of stats.styles) byStyle.set(style, [...(byStyle.get(style) || []), stats]);
  }
  const styleOrder = [...byStyle.entries()]
    .filter(([, list]) => list.length >= 3)
    .sort(
      ([leftStyle, left], [rightStyle, right]) =>
        Number(tastes.includes(genreKey(rightStyle))) - Number(tastes.includes(genreKey(leftStyle)))
        || right.length - left.length
    );
  const shelves = styleOrder.map(([style, list]) => ({
    style,
    stats: rank(list, stats => (options?.location ? stats.nearConcerts * 10 : 0) + stats.concerts).slice(0, STYLE_LIMIT),
  }));

  const ids = [...near, ...week, ...shelves.flatMap(shelf => shelf.stats)].map(stats => stats.id);
  const byId = await fetchArtistsByIds(ids);
  const resolve = (list: ArtistStats[]) =>
    list.map(stats => byId.get(stats.id)).filter((artist): artist is DiscoverArtist => Boolean(artist?.subject_id));

  const sections: SuggestedSection<DiscoverArtist>[] = [];
  const nearItems = resolve(near);
  const weekItems = resolve(week);
  if (nearItems.length > 0) sections.push({ key: 'near_you', title: 'Tocan cerca de ti', items: nearItems });
  if (weekItems.length > 0) sections.push({ key: 'this_week', title: 'Tocan esta semana', items: weekItems });

  const styles: StyleShelf[] = shelves
    .map(shelf => ({ style: shelf.style, items: resolve(shelf.stats) }))
    .filter(shelf => shelf.items.length > 0);

  return { sections, styles };
};
