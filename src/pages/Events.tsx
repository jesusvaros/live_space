import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { NAV_CLEARANCE } from '../components/BottomNav';
import { useLastKnownLocation } from '../shared/hooks/useLastKnownLocation';
import { readStoredLocation } from '../shared/hooks/useStoredLocation';
import { useFollowedSubjects } from '../hooks/useFollowedSubjects';
import { useFollowedEntities } from '../hooks/useFollowedEntities';
import { calculateDistanceKm, getEventCoverImage, toNumber } from '../features/events/utils';
import { NearbyEventListItem } from '../features/events/types';
import CityListingSection from '../features/events/sections/CityListingSection';
import FollowingSection from '../features/events/sections/FollowingSection';
import FestivalsSection from '../features/events/sections/FestivalsSection';
import { useAuth } from '../contexts/AuthContext';
import { useEventsList, useUpcomingCities } from '../features/events/hooks/useEventsList';
import { useFollowedEvents } from '../features/events/hooks/useFollowedEvents';
import { useNearbyEvents } from '../features/events/hooks/useNearbyEvents';
import { useUserConcertHero } from '../features/events/hooks/useUserConcertHero';
import TimelineHeroSection from '../features/events/sections/TimelineHeroSection';
import GoingSection from '../features/events/sections/GoingSection';
import ScanConcertFab from '../features/events/ScanConcertFab';
import WrappedCard from '../features/wrapped/WrappedCard';
import { HomeCustomizer, HomeSectionKey, useHomeLayout } from '../features/events/homeLayout';
import ForYouSection from '../features/events/sections/ForYouSection';
import { clearCity, isSetupDone, nearestCity as nearestOf, persistCity, readStoredCity, readTastes, sameCity } from '../features/agenda/agendaPrefs';
import { useConcertHistory } from '../features/agenda/useConcertHistory';
import { inicioWindow } from '../features/events/inicioWindow';
import { useFirstContent } from '../lib/perfTiming';

const NEARBY_RADIUS_KM = 50;
// How far a city's venues can sit from its representative point.
const CITY_SPREAD_KM = 30;
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

  const [{ startOfToday, endOfNearbyWindow, startIso, endIso }] = useState(() => inicioWindow());

  const { location, requestLocation } = useLastKnownLocation();

  // The only place Inicio asks for the position: the visitor chose it.
  const followMyLocation = () => {
    setPickedCity(null);
    clearCity();
    requestLocation();
  };

  // Nothing picked and no saved position: refresh it only when the visitor
  // already allowed it. Opening the app never pops the permission dialog; the
  // city picker and "Personalizar inicio" ask when the visitor wants it.
  useEffect(() => {
    if (pickedCity || readStoredLocation()) return;
    let cancelled = false;
    navigator.permissions
      ?.query({ name: 'geolocation' })
      .then(status => {
        if (!cancelled && status.state === 'granted') requestLocation();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pickedCity, requestLocation]);

  // The city picker and "where am I" only need the list of cities; the
  // listings below are downloaded for the chosen city alone.
  const { cities, ready: citiesReady } = useUpcomingCities({ startIso, endIso });
  const { hero, dismissPendingMoments } = useUserConcertHero();

  // The city of the closest concerts, when it is within reach.
  const nearestCity = useMemo(() => {
    const best = location ? nearestOf(cities, location) : null;
    return best && best.distanceKm <= NEARBY_RADIUS_KM + CITY_SPREAD_KM ? best.city : null;
  }, [cities, location]);

  // Picked city, else where the visitor is, else the profile's city, else Madrid.
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
      profile?.primary_city ||
      DEFAULT_CITY
    );
  }, [cities, nearestCity, pickedCity, profile?.primary_city]);

  // A picked city is known before the cities arrive; a position needs them
  // to tell which city it is in, so wait rather than load the wrong one.
  const listEnabled = citiesReady || Boolean(pickedCity) || !location;
  const { events, loading: listLoading, error: loadError } = useEventsList({ startIso, endIso, city, enabled: listEnabled });
  const loading = listLoading || !listEnabled;
  useFirstContent('inicio', events.length > 0);

  // "Cerca de ti" reaches 50 km: the city's listings cover it unless another
  // city with concerts is that close.
  const nearbyNeedsOtherCities = useMemo(() => {
    if (!location) return false;
    return cities.some(
      option =>
        !sameCity(option.name, city) &&
        option.latitude !== null &&
        option.longitude !== null &&
        calculateDistanceKm(location.lat, location.lng, option.latitude, option.longitude) <= NEARBY_RADIUS_KM + CITY_SPREAD_KM,
    );
  }, [cities, city, location]);
  const nearbyEvents = useNearbyEvents({
    location: nearbyNeedsOtherCities ? location : null,
    radiusKm: NEARBY_RADIUS_KM,
    startIso: startOfToday.toISOString(),
    endIso: endOfNearbyWindow.toISOString(),
  });

  const nearbyUpcoming = useMemo(() => {
    if (!location) return [] as NearbyEventListItem[];
    const items: NearbyEventListItem[] = [];
    for (const event of nearbyNeedsOtherCities ? nearbyEvents : events) {
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
  }, [endOfNearbyWindow, events, location, nearbyEvents, nearbyNeedsOtherCities, startOfToday]);

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
  // Followed artists and venues play in any city, not just the listings'.
  const followedEvents = useFollowedEvents(followedEntities, { startIso, endIso });
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
    following: <FollowingSection events={followedEvents} entities={followedEntities} signedIn={Boolean(user)} />,
    festivals: <FestivalsSection />,
    listings: (
      <div className="px-4 pt-[22px]">
        <CityListingSection
          events={events}
          cities={cities}
          city={city}
          onCityChange={pickCity}
          onUseLocation={followMyLocation}
          loading={loading}
          error={loadError}
        />
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

      <WrappedCard className="mx-4 mt-[22px]" />

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

      <ScanConcertFab />

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
