import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useLocation } from 'react-router-dom';
import { Page } from '../components/ui/AppPrimitives';
import MapLibreLayer from '../components/MapLibreLayer';
import MapResizeObserver from '../components/MapResizeObserver';
import MapMarkers from '../components/map/MapMarkers';
import MapFilterBar from '../components/map/MapFilterBar';
import MapFilterModal from '../components/map/MapFilterModal';
import MapSelectionSheet from '../components/map/MapSelectionSheet';
import { useMapFilters, type MapArtistFilter } from '../hooks/useMapFilters';
import { useQuery } from '../shared/hooks/useQuery';
import { fetchMapEvents, type MapEvent } from '../data/eventQueries';

// Puerta del Sol: the pilot's agenda is Madrid and Barcelona.
const defaultCenter: [number, number] = [40.4168, -3.7038];
const defaultZoom = 13;
const nearbyZoom = 14;
// v2: earlier builds saved a Seville default view that hid the pilot's concerts.
const mapViewKey = 'live_space.map.view.v2';
const EMPTY_EVENTS: MapEvent[] = [];

// `.map-dark` (index.css) darkens the OSM tiles only, so pins keep the accent colour.
const darkAttribution =
  '[&_.leaflet-control-attribution]:!bg-black/50 [&_.leaflet-control-attribution]:!text-[10px] [&_.leaflet-control-attribution]:!text-white/55 [&_.leaflet-control-attribution_a]:!text-white/70';

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
  try {
    window.localStorage.setItem(mapViewKey, JSON.stringify({ center, zoom }));
  } catch {
    // ignore storage failures
  }
};

type MapLocationState = { artistFilter?: MapArtistFilter };

/** Persists the view and closes the sheet when the bare map is tapped. */
const MapEventsBridge: React.FC<{ onMapClick: () => void }> = ({ onMapClick }) => {
  const map = useMapEvents({
    click: onMapClick,
    moveend: () => {
      const center = map.getCenter();
      persistView([center.lat, center.lng], map.getZoom());
    },
  });
  return null;
};

const Map: React.FC = () => {
  const location = useLocation();
  // Leaflet owns the view after mount; React only seeds it once.
  const [initialView] = useState(() => readStoredView());
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [activeVenueId, setActiveVenueId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const appliedArtistFilter = useRef<string | null>(null);

  const [includePastQuery, setIncludePastQuery] = useState(false);
  const eventsQuery = useQuery<MapEvent[]>(
    ['map:events', includePastQuery ? 'all' : 'upcoming'],
    () => fetchMapEvents({ includePast: includePastQuery }),
    { ttlMs: 60_000, initialData: EMPTY_EVENTS }
  );
  const events = eventsQuery.data ?? EMPTY_EVENTS;

  const filters = useMapFilters(events);
  const { venueGroups, filteredEvents, artists, city, addArtist, includePast } = filters;

  useEffect(() => {
    setIncludePastQuery(includePast);
  }, [includePast]);

  // Arriving from an artist page: filter the map to that artist.
  useEffect(() => {
    const artistFilter = (location.state as MapLocationState | null)?.artistFilter;
    if (!artistFilter || appliedArtistFilter.current === artistFilter.id) return;
    appliedArtistFilter.current = artistFilter.id;
    addArtist(artistFilter);
  }, [location.state, addArtist]);

  useEffect(() => {
    mapInstance?.attributionControl?.setPrefix(false);
  }, [mapInstance]);

  // First visit (no saved view): centre on the visitor if they allow it.
  useEffect(() => {
    if (!mapInstance || initialView || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      position => mapInstance.setView([position.coords.latitude, position.coords.longitude], nearbyZoom),
      () => undefined,
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 10 * 60 * 1000 }
    );
  }, [mapInstance, initialView]);

  // A new artist or city filter frames its venues.
  const fitKey = `${artists.map(artist => artist.id).join(',')}|${city ?? ''}`;
  const lastFitKey = useRef('|');
  useEffect(() => {
    if (!mapInstance || fitKey === lastFitKey.current || venueGroups.length === 0) return;
    lastFitKey.current = fitKey;
    const bounds = L.latLngBounds(venueGroups.map(group => [group.latitude, group.longitude] as [number, number]));
    mapInstance.fitBounds(bounds, { padding: [56, 56], maxZoom: 15 });
  }, [mapInstance, fitKey, venueGroups]);

  const activeGroup = useMemo(
    () => venueGroups.find(group => group.id === activeVenueId) ?? null,
    [venueGroups, activeVenueId]
  );

  // Keep the selected pin visible above the sheet.
  useEffect(() => {
    if (!mapInstance || !activeGroup) return;
    const size = mapInstance.getSize();
    const point = mapInstance.latLngToContainerPoint([activeGroup.latitude, activeGroup.longitude]);
    mapInstance.panBy([point.x - size.x / 2, point.y - size.y * 0.24], { animate: true });
  }, [mapInstance, activeGroup?.id]);

  const handleSelectVenue = useCallback((venueId: string) => setActiveVenueId(venueId), []);
  const closeSheet = useCallback(() => setActiveVenueId(null), []);

  return (
    <Page className="bg-app-bg">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <MapContainer
          center={initialView?.center ?? defaultCenter}
          zoom={initialView?.zoom ?? defaultZoom}
          className={`map-dark h-full w-full ${darkAttribution}`}
          zoomControl={false}
          ref={setMapInstance}
        >
          <MapLibreLayer />
          <MapResizeObserver />
          <MapEventsBridge onMapClick={closeSheet} />
          <MapMarkers groups={venueGroups} activeVenueId={activeVenueId} onSelectVenue={handleSelectVenue} />
        </MapContainer>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] pt-[calc(12px+env(safe-area-inset-top,0px))] [&>*]:pointer-events-auto">
          <MapFilterBar
            search={filters.search}
            onSearchChange={filters.setSearch}
            when={filters.when}
            onWhenChange={filters.setWhen}
            city={city}
            cities={filters.cities}
            onCityChange={filters.setCity}
            artists={artists}
            onRemoveArtist={filters.removeArtist}
            onClearArtists={filters.clearArtists}
            activeFilterCount={filters.activeFilterCount}
            onOpenFilters={() => setShowFilters(true)}
          />
          {!eventsQuery.loading && venueGroups.length === 0 && events.length > 0 ? (
            <p className="mx-auto mt-3 w-fit rounded-full border border-app-line bg-app-surface/90 px-4 py-2 text-sm text-app-ink/70 backdrop-blur-md">
              Ningún concierto con estos filtros
            </p>
          ) : null}
        </div>

        <MapSelectionSheet group={activeGroup} onClose={closeSheet} />
      </div>

      <MapFilterModal
        isOpen={showFilters}
        onDismiss={() => setShowFilters(false)}
        when={filters.when}
        onWhenChange={filters.setWhen}
        city={city}
        cities={filters.cities}
        onCityChange={filters.setCity}
        artists={artists}
        onAddArtist={addArtist}
        onRemoveArtist={filters.removeArtist}
        includePast={includePast}
        onIncludePastChange={filters.setIncludePast}
        resultCount={filteredEvents.length}
        onClear={filters.clearFilters}
      />
    </Page>
  );
};

export default Map;
