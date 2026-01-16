import React, { useEffect, useState } from 'react';
import { IonPage, IonContent, useIonViewDidEnter } from '@ionic/react';
import { MapContainer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';
import { Event, VenuePlace } from '../lib/types';
import { useHistory } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';
import MapLibreLayer from '../components/MapLibreLayer';
import MapResizeObserver from '../components/MapResizeObserver';
import MapFilterBar from '../components/map/MapFilterBar';
import MapFilterModal from '../components/map/MapFilterModal';
import MapMarkers from '../components/map/MapMarkers';
import { useMapFilters } from '../hooks/useMapFilters';

const defaultCenter: [number, number] = [37.3891, -5.9845];
const defaultZoom = 12;
const mapViewKey = 'live_space.map.view';

const readStoredView = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(mapViewKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { center?: [number, number]; zoom?: number };
    if (!parsed?.center || typeof parsed.zoom !== 'number') return null;
    const [lat, lng] = parsed.center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { center: parsed.center, zoom: parsed.zoom };
  } catch {
    return null;
  }
};

const persistView = (center: [number, number], zoom: number) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(mapViewKey, JSON.stringify({ center, zoom }));
  } catch {
    // ignore storage failures
  }
};

type EventWithVenue = Event & { venue_place?: VenuePlace | null };

const Map: React.FC = () => {
  const history = useHistory();
  const { user } = useAuth();
  const [events, setEvents] = useState<EventWithVenue[]>([]);
  const [venues, setVenues] = useState<VenuePlace[]>([]);
  const [center, setCenter] = useState<[number, number]>(defaultCenter);
  const [zoom, setZoom] = useState(defaultZoom);
  const [initialViewApplied, setInitialViewApplied] = useState(false);
  const [locationRequested, setLocationRequested] = useState(false);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const {
    search,
    setSearch,
    showVenues,
    setShowVenues,
    filterToday,
    filterTomorrow,
    filterDate,
    filterNow,
    filterFree,
    filterGenres,
    priceMin,
    priceMax,
    filterGoing,
    filterAttended,
    toggleToday,
    toggleTomorrow,
    setFilterDate,
    setFilterNow,
    setFilterFree,
    setFilterGenres,
    setPriceMin,
    setPriceMax,
    setFilterGoing,
    setFilterAttended,
    clearExtraFilters,
    filteredEvents,
    filteredVenues,
  } = useMapFilters({
    events,
    venues,
    userId: user?.id,
  });

  useEffect(() => {
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).toString(),
      iconUrl: new URL('leaflet/dist/images/marker-icon.png', import.meta.url).toString(),
      shadowUrl: new URL('leaflet/dist/images/marker-shadow.png', import.meta.url).toString(),
    });
  }, []);

  useEffect(() => {
    const stored = readStoredView();
    if (stored) {
      setCenter(stored.center);
      setZoom(stored.zoom);
      setInitialViewApplied(true);
      return;
    }
    setCenter(defaultCenter);
    setZoom(defaultZoom);
    setInitialViewApplied(true);
  }, []);

  useEffect(() => {
    const loadEvents = async () => {
      const { data } = await supabase
        .from('events')
        .select(
          `
          *,
          venue_place:venue_places!events_venue_place_id_fkey (
            id,
            name,
            city,
            address,
            latitude,
            longitude,
            photos
          )
          `
        );
      setEvents((data || []) as EventWithVenue[]);
    };
    loadEvents();
  }, []);

  useEffect(() => {
    const loadVenues = async () => {
      const { data } = await supabase
        .from('venue_places')
        .select('id, name, city, address, latitude, longitude, photos, venue_type, capacity');
      setVenues((data || []) as VenuePlace[]);
    };
    loadVenues();
  }, []);

  useEffect(() => {
    if (!navigator.geolocation || locationRequested || !initialViewApplied) return;
    setLocationRequested(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        setCenter([position.coords.latitude, position.coords.longitude]);
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, [initialViewApplied, locationRequested]);

  useEffect(() => {
    if (!mapInstance) return;
    mapInstance.invalidateSize();
    const handleMove = () => {
      const mapCenter = mapInstance.getCenter();
      const mapZoom = mapInstance.getZoom();
      const nextCenter: [number, number] = [mapCenter.lat, mapCenter.lng];
      setCenter(nextCenter);
      setZoom(mapZoom);
      persistView(nextCenter, mapZoom);
    };
    mapInstance.on('moveend', handleMove);
    mapInstance.on('zoomend', handleMove);
    return () => {
      mapInstance.off('moveend', handleMove);
      mapInstance.off('zoomend', handleMove);
    };
  }, [mapInstance]);

  useEffect(() => {
    if (!mapInstance) return;
    const current = mapInstance.getCenter();
    const currentZoom = mapInstance.getZoom();
    const [lat, lng] = center;
    const latDiff = Math.abs(current.lat - lat);
    const lngDiff = Math.abs(current.lng - lng);
    if (currentZoom === zoom && latDiff < 1e-7 && lngDiff < 1e-7) return;
    mapInstance.setView(center, zoom, { animate: true });
  }, [center, zoom, mapInstance]);

  useIonViewDidEnter(() => {
    if (!mapInstance) return;
    window.setTimeout(() => {
      mapInstance.invalidateSize();
    }, 150);
  });

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="app-layout">
          <AppHeader />
          <div className="app-screen p-0 relative">
            <div className="absolute left-4 right-4 top-4 z-[100] map-search-overlay">
              <input
                type="search"
                placeholder="Search events"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="app-search"
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.95)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.2)'
                }}
              />
              <MapFilterBar
                filterToday={filterToday}
                filterTomorrow={filterTomorrow}
                filterDate={filterDate}
                filterNow={filterNow}
                filterFree={filterFree}
                onToggleToday={toggleToday}
                onToggleTomorrow={toggleTomorrow}
                onDateChange={value => {
                  setFilterDate(value);
                  if (value) {
                    setFilterNow(false);
                  }
                }}
                onToggleNow={() => setFilterNow(prev => !prev)}
                onToggleFree={() => setFilterFree(prev => !prev)}
                onOpenFilters={() => setShowFilters(true)}
              />
            </div>
            <MapContainer
              center={center}
              zoom={zoom}
              style={{ height: 'calc(100vh - 60px)', width: '100%' }}
              className="map-fullscreen"
              zoomControl={false}
              whenCreated={setMapInstance}
            >
              <MapLibreLayer />
              <MapResizeObserver />
              <MapMarkers
                events={filteredEvents}
                venues={filteredVenues}
                showVenues={showVenues}
                onSelectEvent={eventId => history.push(`/event/${eventId}`)}
                onSelectVenue={venueId => history.push(`/venue/${venueId}`)}
              />
            </MapContainer>
          </div>
        </div>

        <MapFilterModal
          isOpen={showFilters}
          onDismiss={() => setShowFilters(false)}
          showVenues={showVenues}
          onToggleVenues={setShowVenues}
          filterGenres={filterGenres}
          onGenresChange={setFilterGenres}
          priceMin={priceMin}
          priceMax={priceMax}
          onPriceMinChange={setPriceMin}
          onPriceMaxChange={setPriceMax}
          filterGoing={filterGoing}
          filterAttended={filterAttended}
          onToggleGoing={setFilterGoing}
          onToggleAttended={setFilterAttended}
          onClear={clearExtraFilters}
          disableAttendance={!user}
        />
      </IonContent>
    </IonPage>
  );
};

export default Map;
