import React, { useMemo } from 'react';
import AppShell from '../components/AppShell';
import { useHistory } from 'react-router-dom';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useLastKnownLocation } from '../shared/hooks/useLastKnownLocation';
import { useFollowedSubjects } from '../hooks/useFollowedSubjects';
import { calculateDistanceKm, getEventCoverImage, formatDate, getPrimaryArtistName, toNumber } from '../features/events/utils';
import { NearbyEventListItem } from '../features/events/types';
import NearbyHeroSection from '../features/events/sections/NearbyHeroSection';
import MapPreviewSection from '../features/events/sections/MapPreviewSection';
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

const NEARBY_RADIUS_KM = 50;
const EVENTS_LOOKBACK_DAYS = 4;

const Events: React.FC = () => {
  const history = useHistory();
  const { canCreateEvent } = useWorkspace();

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

  const {
    location,
    loading: locationLoading,
    error: locationError,
    requestLocation,
  } = useLastKnownLocation();

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

  const mapPins = useMemo(() => {
    return nearbyUpcoming
      .map(event => {
        const lat = toNumber(event.latitude ?? event.venue_place?.latitude ?? null);
        const lng = toNumber(event.longitude ?? event.venue_place?.longitude ?? null);
        if (lat === null || lng === null) return null;
        return { id: event.id, lat, lng };
      })
      .filter(Boolean)
      .slice(0, 12) as { id: string; lat: number; lng: number }[];
  }, [nearbyUpcoming]);

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
    <AppShell>
      <TimelineHeroSection
        state={hero}
        onDismissPendingMoments={hero.kind === 'just_attended' ? dismissPendingMoments : undefined}
      />

      {hero.kind !== 'just_attended' && (
        <div className="flex flex-col gap-8 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
          {hero.kind !== 'cold_start' && nextUpcoming && (
            <section className="space-y-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Next</p>
                <h3 className="mt-2 font-display text-xl font-bold text-white">Coming up</h3>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                <EventPosterTile
                  event={{ ...nextUpcoming, cover_image_url: getEventCoverImage(nextUpcoming) }}
                  className="w-[220px] shrink-0"
                  kicker={formatDate(nextUpcoming.starts_at)}
                  title={getPrimaryArtistName(nextUpcoming)}
                  subtitle={nextUpcoming.venue_place?.name || nextUpcoming.city}
                  onSelect={selected => history.push(`/event/${selected.id}`)}
                />
              </div>
            </section>
          )}

          {hero.kind === 'cold_start' && (
            <NearbyHeroSection
              canCreateEvent={canCreateEvent}
              loading={loading}
              loadError={loadError}
              location={location}
              locationLoading={locationLoading}
              locationError={locationError}
              onRequestLocation={requestLocation}
              nearbyUpcoming={nearbyUpcoming}
            />
          )}

          <MapPreviewSection
            center={location}
            pins={mapPins}
            onOpenMap={() => history.push('/tabs/map')}
          />

          <TrendingSection loading={trendingLoading} trending={trending} meta={trendingMeta} />

          <DiscoverSection
            loading={suggestionsLoading}
            canFollow={canFollow}
            followedSubjectIds={followedSubjectIds}
            suggestedArtists={suggestedArtists}
            suggestedVenues={suggestedVenues}
            onToggleFollowSubject={(subjectId) => {
              void toggleFollowSubject(subjectId);
            }}
          />

          <FollowedFromArtistsSection visible={followedArtistIds.size > 0} events={followedUpcoming} />
        </div>
      )}
    </AppShell>
  );
};

export default Events;
