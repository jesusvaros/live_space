import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { cached } from '../../../lib/requestCache';
import { EventListItem } from '../types';

type SuggestedArtist = { id: string; subject_id: string; name: string; avatar_url: string | null; upcomingCount: number };
type SuggestedVenue = { id: string; subject_id: string; name: string; city: string; upcomingCount: number };

export const useHomeSuggestions = (events: EventListItem[], options: { startOfToday: Date; endOfEventsWindow: Date }) => {
  const [suggestedArtists, setSuggestedArtists] = useState<SuggestedArtist[]>([]);
  const [suggestedVenues, setSuggestedVenues] = useState<SuggestedVenue[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (events.length === 0) {
      setSuggestedArtists([]);
      setSuggestedVenues([]);
      return;
    }
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      try {
        const upcoming = events.filter(event => {
          const startsAt = new Date(event.starts_at);
          return startsAt >= options.startOfToday && startsAt <= options.endOfEventsWindow;
        });

        const artistCounts = new Map<string, { id: string; count: number }>();
        const venueCounts = new Map<string, { id: string; name: string; city: string; count: number }>();

        for (const event of upcoming) {
          for (const entry of event.event_artists || []) {
            if (!entry?.artist?.id) continue;
            const prev = artistCounts.get(entry.artist.id);
            artistCounts.set(entry.artist.id, { id: entry.artist.id, count: (prev?.count || 0) + 1 });
          }
          if (event.venue_place?.id) {
            const prev = venueCounts.get(event.venue_place.id);
            venueCounts.set(event.venue_place.id, {
              id: event.venue_place.id,
              name: event.venue_place.name,
              city: event.venue_place.city,
              count: (prev?.count || 0) + 1,
            });
          }
        }

        const topArtistIds = Array.from(artistCounts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
          .map(item => item.id);

        const artists = await (async () => {
          if (topArtistIds.length === 0) return [] as SuggestedArtist[];
          const uniqueSorted = Array.from(new Set(topArtistIds)).sort();
          const idsKey = uniqueSorted.join(',');
          const data = await cached(
            `artists:by_ids:${idsKey}`,
            async () => {
              const { data, error } = await supabase
                .from('v_subject_artists')
                .select('artist_id,name,avatar_url,subject_id')
                .in('artist_id', uniqueSorted);
              if (error) throw error;
              return data || [];
            },
            { ttlMs: 60_000 }
          );
          const byId = new Map<string, any>();
          for (const row of data as any[]) if ((row as any).artist_id) byId.set((row as any).artist_id, row);
          return topArtistIds
            .map(artistId => {
              const row = byId.get(artistId);
              const meta = artistCounts.get(artistId);
              if (!row?.subject_id || !meta) return null;
              return {
                id: artistId,
                subject_id: row.subject_id as string,
                name: row.name as string,
                avatar_url: (row as any).avatar_url as string | null,
                upcomingCount: meta.count,
              };
            })
            .filter(Boolean) as SuggestedArtist[];
        })();

        const topVenues = Array.from(venueCounts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        const venues = await cached(
          `home:suggested:venues:${topVenues.map(v => v.id).join(',')}`,
          async () => {
            if (topVenues.length === 0) return [] as SuggestedVenue[];

            const venuePlaceIds = topVenues.map(v => v.id);
            const venueSubjectByPlaceId = new Map<string, string>();
            try {
              const { data: subjectRows, error: subjectError } = await supabase
                .from('subjects')
                .select('id,venue_place_id,type')
                .eq('type', 'venue')
                .in('venue_place_id', venuePlaceIds);
              if (subjectError) throw subjectError;
              for (const row of subjectRows || []) {
                const venuePlaceId = (row as any).venue_place_id as string | null;
                const subjectId = (row as any).id as string | null;
                if (venuePlaceId && subjectId) venueSubjectByPlaceId.set(venuePlaceId, subjectId);
              }
            } catch {
              // ignore
            }

            for (const venue of topVenues) {
              if (venueSubjectByPlaceId.has(venue.id)) continue;
              const subjectId = await cached(
                `subject:venue:${venue.id}`,
                async () => {
                  const { data, error } = await supabase
                    .rpc('get_or_create_venue_subject', { p_venue_place_id: venue.id });
                  if (error) throw error;
                  return data as unknown as string;
                },
                { ttlMs: 24 * 60 * 60 * 1000 }
              ).catch(() => null);
              if (typeof subjectId === 'string') venueSubjectByPlaceId.set(venue.id, subjectId);
            }

            return topVenues
              .map(item => {
                const subjectId = venueSubjectByPlaceId.get(item.id);
                if (!subjectId) return null;
                return {
                  id: item.id,
                  subject_id: subjectId,
                  name: item.name,
                  city: item.city,
                  upcomingCount: item.count,
                };
              })
              .filter(Boolean) as SuggestedVenue[];
          },
          { ttlMs: 30_000 }
        );

        if (cancelled) return;
        setSuggestedArtists(artists);
        setSuggestedVenues(venues);
      } catch {
        if (cancelled) return;
        setSuggestedArtists([]);
        setSuggestedVenues([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [events, options.endOfEventsWindow, options.startOfToday]);

  return { suggestedArtists, suggestedVenues, loading };
};
