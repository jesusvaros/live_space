import { supabase } from '../../lib/supabase';
import { fetchEventCards } from '../../data/eventQueries';
import { useQuery } from '../../shared/hooks/useQuery';

export type HistoryEntry = {
  kind: 'artist' | 'venue';
  id: string;
  name: string;
  imageUrl: string | null;
  count: number;
};

export type ConcertHistory = {
  concerts: number;
  venues: HistoryEntry[];
  artists: HistoryEntry[];
};

const EMPTY: ConcertHistory = { concerts: 0, venues: [], artists: [] };
// Enough for years of concerts without an unbounded `in` list.
const MAX_EVENTS = 300;

const byCount = (left: HistoryEntry, right: HistoryEntry) =>
  right.count - left.count || left.name.localeCompare(right.name, 'es');

// The user's own concerts — going, attended, saved or with a moment they
// uploaded — counted per venue, and per artist for those already played.
export const useConcertHistory = (userId: string | null) => {
  const { data, loading } = useQuery<ConcertHistory>(
    ['agenda:history', userId ?? ''],
    async () => {
      if (!userId) return EMPTY;
      const [attendance, saves, posts] = await Promise.all([
        supabase.from('event_attendance').select('event_id').eq('profile_id', userId).in('status', ['going', 'attended']),
        supabase.from('event_saves').select('event_id').eq('profile_id', userId),
        supabase.from('posts').select('event_id').eq('author_id', userId).limit(1000),
      ]);
      if (attendance.error) throw attendance.error;
      if (saves.error) throw saves.error;
      if (posts.error) throw posts.error;
      const ids = [
        ...new Set(
          [...(attendance.data || []), ...(saves.data || []), ...(posts.data || [])]
            .map((row: any) => (row.event_id ? String(row.event_id) : ''))
            .filter(Boolean),
        ),
      ].slice(0, MAX_EVENTS);
      const events = await fetchEventCards({ eventIds: ids });

      const now = Date.now();
      const venues = new Map<string, HistoryEntry>();
      const artists = new Map<string, HistoryEntry>();
      for (const event of events) {
        const venue = event.venue_place;
        if (venue?.id) {
          const current = venues.get(venue.id) || { kind: 'venue' as const, id: venue.id, name: venue.name, imageUrl: null, count: 0 };
          current.count += 1;
          venues.set(venue.id, current);
        }
        if (new Date(event.starts_at).getTime() > now) continue;
        const seen = new Set<string>();
        for (const entry of event.event_artists || []) {
          const artist = entry.artist;
          if (!artist?.id || seen.has(artist.id)) continue;
          seen.add(artist.id);
          const current = artists.get(artist.id) || {
            kind: 'artist' as const,
            id: artist.id,
            name: artist.name,
            imageUrl: artist.avatar_url ?? null,
            count: 0,
          };
          current.count += 1;
          artists.set(artist.id, current);
        }
      }
      return {
        concerts: events.length,
        venues: Array.from(venues.values()).sort(byCount),
        artists: Array.from(artists.values()).sort(byCount),
      };
    },
    { enabled: Boolean(userId), ttlMs: 60_000, initialData: EMPTY },
  );

  return { history: data || EMPTY, loading };
};
