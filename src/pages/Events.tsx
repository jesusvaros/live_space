import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { NAV_CLEARANCE } from '../components/BottomNav';
import { useLastKnownLocation } from '../shared/hooks/useLastKnownLocation';
import { readStoredLocation } from '../shared/hooks/useStoredLocation';
import { useFollowedSubjects } from '../hooks/useFollowedSubjects';
import { useFollowedEntities } from '../hooks/useFollowedEntities';
import { calculateDistanceKm, getEventCoverImage, toNumber } from '../features/events/utils';
import { NearbyEventListItem } from '../features/events/types';
import CityListingSection, { deriveCities } from '../features/events/sections/CityListingSection';
import FollowingSection from '../features/events/sections/FollowingSection';
import FestivalsSection from '../features/events/sections/FestivalsSection';
import { useAuth } from '../contexts/AuthContext';
import { useEventsList } from '../features/events/hooks/useEventsList';
import { useUserConcertHero } from '../features/events/hooks/useUserConcertHero';
import TimelineHeroSection from '../features/events/sections/TimelineHeroSection';
import GoingSection from '../features/events/sections/GoingSection';
import { HomeCustomizer, HomeSectionKey, useHomeLayout } from '../features/events/homeLayout';
import ForYouSection from '../features/events/sections/ForYouSection';
import { isSetupDone, nearestEventCity, persistCity, readStoredCity, readTastes } from '../features/agenda/agendaPrefs';
import { useConcertHistory } from '../features/agenda/useConcertHistory';

const NEARBY_RADIUS_KM = 50;
const EVENTS_LOOKBACK_DAYS = 4;
const DEFAULT_CITY = 'Madrid';
// Accounts this young get the agenda setup once, wherever they signed up.
const NEW_ACCOUNT_MS = 3 * 24 * 60 * 60 * 1000;

const Events: React.FC = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user || !profile || isSetupDone(user.id)) return;
    const createdAt = Date.parse(profile.created_at);
    if (Number.isFinite(createdAt) && Date.now() - createdAt < NEW_ACCOUNT_MS) {
      navigate('/empezar', { replace: true, state: { returnTo: '/tabs/events' } });
    }
  }, [navigate, profile, user]);
  // A city the visitor picked sticks across visits and back navigation.
  const [pickedCity, setPickedCity] = useState<string | null>(() => readStoredCity());
  const pickCity = (next: string) => {
    setPickedCity(next);
    persistCity(next);
  };

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

  const { location, requestLocation } = useLastKnownLocation();

  // Nothing picked and no saved position: ask once, so the listings open on their city.
  const askedLocation = useRef(false);
  useEffect(() => {
    if (askedLocation.current || pickedCity || readStoredLocation()) return;
    askedLocation.current = true;
    requestLocation();
  }, [pickedCity, requestLocation]);

  const { events, loading, error: loadError } = useEventsList({ startIso, endIso });
  const { hero, dismissPendingMoments } = useUserConcertHero({ events });

  // The city of the closest concert, when it is within reach.
  const nearestCity = useMemo(() => {
    const best = location ? nearestEventCity(events, location) : null;
    return best && best.distanceKm <= NEARBY_RADIUS_KM ? best.city : null;
  }, [events, location]);

  // Picked city, else where the visitor is, else the profile's city, else Madrid.
  const cities = useMemo(() => deriveCities(events), [events]);
  const city = useMemo(() => {
    const find = (name?: string | null) =>
      name ? cities.find(option => option.name.toLowerCase() === name.toLowerCase())?.name : undefined;
    return (
      find(pickedCity) ||
      find(nearestCity) ||
      find(profile?.primary_city) ||
      find(DEFAULT_CITY) ||
      cities[0]?.name ||
      pickedCity ||
      DEFAULT_CITY
    );
  }, [cities, nearestCity, pickedCity, profile?.primary_city]);

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

  const { layout, setLayout, reset: resetLayout } = useHomeLayout();
  const [customizing, setCustomizing] = useState(false);

  const { followedSubjectIds } = useFollowedSubjects();
  const { entities: followedEntities } = useFollowedEntities(followedSubjectIds);
  const { history } = useConcertHistory(user?.id ?? null);
  const tastes = useMemo(() => readTastes(), []);

  const sections: Record<HomeSectionKey, React.ReactNode> = {
    going: <GoingSection userId={user?.id ?? null} />,
    forYou: (
      <ForYouSection
        events={events}
        city={city}
        entities={followedEntities}
        tastes={tastes}
        frequentVenues={history.venues}
        signedIn={Boolean(user)}
      />
    ),
    following: <FollowingSection events={events} entities={followedEntities} signedIn={Boolean(user)} />,
    festivals: <FestivalsSection />,
    listings: (
      <div className="px-4 pt-[22px]">
        <CityListingSection events={events} city={city} onCityChange={pickCity} loading={loading} error={loadError} />
      </div>
    ),
  };

  return (
    <AppShell contentWrapperClassName={false}>
      <TimelineHeroSection
        state={hero}
        featured={featured}
        onDismissPendingMoments={hero.kind === 'just_attended' ? dismissPendingMoments : undefined}
      />

      {layout.order
        .filter(key => !layout.hidden.includes(key))
        .map(key => (
          <React.Fragment key={key}>{sections[key]}</React.Fragment>
        ))}

      <div className={`flex justify-center px-4 pt-8 ${NAV_CLEARANCE}`}>
        <button
          type="button"
          onClick={() => setCustomizing(true)}
          className="inline-flex min-h-11 items-center rounded-full border border-app-line px-4 text-sm font-semibold text-white/70"
        >
          Personalizar inicio
        </button>
      </div>

      <HomeCustomizer
        isOpen={customizing}
        onDismiss={() => setCustomizing(false)}
        layout={layout}
        onChange={setLayout}
        onReset={resetLayout}
      />
    </AppShell>
  );
};

export default Events;
