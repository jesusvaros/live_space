import React, { useEffect, useMemo, useState } from 'react';
import AppShell from '../components/AppShell';
import { NAV_CLEARANCE } from '../components/BottomNav';
import { useLastKnownLocation } from '../shared/hooks/useLastKnownLocation';
import { useFollowedSubjects } from '../hooks/useFollowedSubjects';
import { useFollowedEntities } from '../hooks/useFollowedEntities';
import { calculateDistanceKm, getEventCoverImage, toNumber } from '../features/events/utils';
import { NearbyEventListItem } from '../features/events/types';
import CityListingSection, { deriveCities } from '../features/events/sections/CityListingSection';
import FollowingSection from '../features/events/sections/FollowingSection';
import { useAuth } from '../contexts/AuthContext';
import { useEventsList } from '../features/events/hooks/useEventsList';
import { useUserConcertHero } from '../features/events/hooks/useUserConcertHero';
import TimelineHeroSection from '../features/events/sections/TimelineHeroSection';

const NEARBY_RADIUS_KM = 50;
const EVENTS_LOOKBACK_DAYS = 4;
const DEFAULT_CITY = 'Madrid';

const Events: React.FC = () => {
  const { user, profile } = useAuth();
  const [pickedCity, setPickedCity] = useState<string | null>(null);

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
  const { hero, dismissPendingMoments } = useUserConcertHero({ events });

  // The profile's city when the data has it, else the busiest one.
  const cities = useMemo(() => deriveCities(events), [events]);
  const city = useMemo(() => {
    if (pickedCity) return pickedCity;
    const preferred = profile?.primary_city?.toLowerCase();
    return (
      cities.find(option => option.name.toLowerCase() === preferred)?.name ||
      cities.find(option => option.name.toLowerCase() === DEFAULT_CITY.toLowerCase())?.name ||
      cities[0]?.name ||
      DEFAULT_CITY
    );
  }, [cities, pickedCity, profile?.primary_city]);

  useEffect(() => {
    setPickedCity(null);
  }, [profile?.primary_city]);

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

  const { followedSubjectIds } = useFollowedSubjects();
  const { entities: followedEntities } = useFollowedEntities(followedSubjectIds);

  return (
    <AppShell contentWrapperClassName={false}>
      <TimelineHeroSection
        state={hero}
        featured={featured}
        onDismissPendingMoments={hero.kind === 'just_attended' ? dismissPendingMoments : undefined}
      />

      <FollowingSection events={events} entities={followedEntities} signedIn={Boolean(user)} />

      <div className={`px-4 pt-[22px] ${NAV_CLEARANCE}`}>
        <CityListingSection
          events={events}
          city={city}
          onCityChange={setPickedCity}
          loading={loading}
          error={loadError}
        />
      </div>
    </AppShell>
  );
};

export default Events;
