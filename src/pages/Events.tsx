import React, { useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import { useNavigate } from 'react-router-dom';
import { useLastKnownLocation } from '../shared/hooks/useLastKnownLocation';
import { useFollowedSubjects } from '../hooks/useFollowedSubjects';
import { calculateDistanceKm, getEventCoverImage, formatDate, getPrimaryArtistName, toNumber } from '../features/events/utils';
import { NearbyEventListItem } from '../features/events/types';
import CityListingSection, { LISTING_CITIES } from '../features/events/sections/CityListingSection';
import { useAuth } from '../contexts/AuthContext';
import TrendingSection from '../features/events/sections/TrendingSection';
import DiscoverSection from '../features/events/sections/DiscoverSection';
import FollowedFromArtistsSection from '../features/events/sections/FollowedFromArtistsSection';
import { useEventsList } from '../features/events/hooks/useEventsList';
import { useTrendingEvents } from '../features/events/hooks/useTrendingEvents';
import { useHomeSuggestions } from '../features/events/hooks/useHomeSuggestions';
import { useFollowedArtistIds } from '../features/events/hooks/useFollowedArtistIds';
import { useUserConcertHero } from '../features/events/hooks/useUserConcertHero';
import TimelineHeroSection from '../features/events/sections/TimelineHeroSection';
import EventPosterTile from '../features/events/components/EventPosterTile';

// Leaflet only loads once Inicio is on screen, not before the first paint.
const MapPreviewSection = React.lazy(() => import('../features/events/sections/MapPreviewSection'));

const NEARBY_RADIUS_KM = 50;
const EVENTS_LOOKBACK_DAYS = 4;

const Events: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [city, setCity] = useState<string>(() => {
    const preferred = profile?.primary_city;
    return LISTING_CITIES.find(option => option.toLowerCase() === preferred?.toLowerCase()) || 'Madrid';
  });

  const startOfToday = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const endOfNearbyWindow = useMemo(() => {
    const date = new Date(startOfToday);
    date.setDate(date.getDate() + 14);
    date.setHours(23, 59, 59, 999);
    return date;
  }, [startOfToday]);

  const endOfEventsWindow = useMemo(() => {
    const date = new Date(startOfToday);
    date.setDate(date.getDate() + 30);
    date.setHours(23, 59, 59, 999);
    return date;
  }, [startOfToday]);

  const startIso = useMemo(
    () => new Date(startOfToday.getTime() - 1000 * 60 * 60 * 24 * EVENTS_LOOKBACK_DAYS).toISOString(),
    [startOfToday]
  );
  const endIso = useMemo(() => endOfEventsWindow.toISOString(), [endOfEventsWindow]);

  const { location } = useLastKnownLocation();

  const { events, loading, error: loadError } = useEventsList({ startIso, endIso });
  const { hero, nextUpcoming, dismissPendingMoments } = useUserConcertHero({ events });

  const nearbyUpcoming = useMemo(() => {
    if (!location) return [] as NearbyEventListItem[];
    const items: NearbyEventListItem[] = [];
    for (const event of events) {
      const startsAt = new Date(event.starts_at);
      if (startsAt < startOfToday || startsAt > endOfNearbyWindow) continue;

      const eventLat = toNumber(event.latitude ?? event.venue_place?.latitude ?? null);
      const eventLng = toNumber(event.longitude ?? event.venue_place?.longitude ?? null);
      if (eventLat === null || eventLng === null) continue;

      const distanceKm = calculateDistanceKm(location.lat, location.lng, eventLat, eventLng);
      if (distanceKm > NEARBY_RADIUS_KM) continue;
      items.push({ ...event, distanceKm });
    }
    items.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime() || a.distanceKm - b.distanceKm);
    return items;
  }, [endOfNearbyWindow, events, location, startOfToday]);

  // Without location, the preview shows the listing city's next two weeks.
  const mapPins = useMemo(() => {
    const source = nearbyUpcoming.length
      ? nearbyUpcoming
      : events.filter(event => {
          const startsAt = new Date(event.starts_at);
          return (
            (event.city || '').toLowerCase() === city.toLowerCase() &&
            startsAt >= startOfToday &&
            startsAt <= endOfNearbyWindow
          );
        });
    return source
      .map(event => {
        const lat = toNumber(event.latitude ?? event.venue_place?.latitude ?? null);
        const lng = toNumber(event.longitude ?? event.venue_place?.longitude ?? null);
        if (lat === null || lng === null) return null;
        return { id: event.id, lat, lng };
      })
      .filter(Boolean)
      .slice(0, 24) as { id: string; lat: number; lng: number }[];
  }, [city, endOfNearbyWindow, events, nearbyUpcoming, startOfToday]);

  // Hero photos: nearby first, then anything upcoming that has a cover.
  const featured = useMemo(() => {
    const upcoming = events.filter(event => {
      const startsAt = new Date(event.starts_at);
      return startsAt >= startOfToday && startsAt <= endOfNearbyWindow && getEventCoverImage(event);
    });
    const nearbyIds = new Set(nearbyUpcoming.map(event => event.id));
    const ordered = [
      ...nearbyUpcoming.filter(event => getEventCoverImage(event)),
      ...upcoming.filter(event => !nearbyIds.has(event.id)),
    ];
    return ordered.slice(0, 6);
  }, [endOfNearbyWindow, events, nearbyUpcoming, startOfToday]);

  const { trending, meta: trendingMeta, loading: trendingLoading } = useTrendingEvents(events, startOfToday);

  const { suggestedArtists, suggestedVenues, loading: suggestionsLoading } = useHomeSuggestions(events, {
    startOfToday,
    endOfEventsWindow,
  });

  const { canFollow, followedSubjectIds, toggleFollowSubject } = useFollowedSubjects();
  const followedArtistIds = useFollowedArtistIds(followedSubjectIds);

  const followedUpcoming = useMemo(() => {
    if (followedArtistIds.size === 0) return [];
    const items = events.filter(event => {
      const startsAt = new Date(event.starts_at);
      if (startsAt < startOfToday || startsAt > endOfEventsWindow) return false;
      return (event.event_artists || []).some(entry => entry.artist?.id && followedArtistIds.has(entry.artist.id));
    });
    items.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    return items.slice(0, 6);
  }, [endOfEventsWindow, events, followedArtistIds, startOfToday]);

  return (
    <AppShell contentWrapperClassName={false}>
      <TimelineHeroSection
        state={hero}
        featured={featured}
        onDismissPendingMoments={hero.kind === 'just_attended' ? dismissPendingMoments : undefined}
      />

      {hero.kind !== 'just_attended' && (
        <div className="relative z-10">
          <div className="relative flex flex-col gap-8 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
            {hero.kind !== 'cold_start' && nextUpcoming && (
              <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60">Lo próximo</p>
                  <h3 className="mt-2 font-display text-xl font-bold text-white">Tus planes</h3>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-1">
                  <div className="w-[220px] shrink-0 overflow-hidden rounded-2xl border border-white/10">
                    <EventPosterTile
                      event={{ ...nextUpcoming, cover_image_url: getEventCoverImage(nextUpcoming) }}
                      className="w-full"
                      kicker={formatDate(nextUpcoming.starts_at)}
                      title={getPrimaryArtistName(nextUpcoming)}
                      subtitle={nextUpcoming.venue_place?.name || nextUpcoming.city}
                      onSelect={selected => navigate(`/event/${selected.id}`)}
                    />
                  </div>
                </div>
              </section>
            )}

            <CityListingSection
              events={events}
              city={city}
              onCityChange={setCity}
              loading={loading}
              error={loadError}
            />

            <React.Suspense fallback={<div className="h-56 rounded-2xl bg-white/[0.03]" />}>
              <MapPreviewSection
                center={location}
                pins={mapPins}
                onOpenMap={() => navigate('/tabs/map')}
              />
            </React.Suspense>

            {trending.length > 0 && (
              <TrendingSection loading={trendingLoading} trending={trending} meta={trendingMeta} />
            )}

            <DiscoverSection
              loading={suggestionsLoading}
              canFollow={canFollow}
              city={city}
              followedSubjectIds={followedSubjectIds}
              suggestedArtists={suggestedArtists}
              suggestedVenues={suggestedVenues}
              onToggleFollowSubject={(subjectId) => {
                void toggleFollowSubject(subjectId);
              }}
            />

            <FollowedFromArtistsSection visible={followedArtistIds.size > 0} events={followedUpcoming} />
          </div>
        </div>
      )}
    </AppShell>
  );
};

export default Events;
