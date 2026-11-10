import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AttributionControl, LngLatBounds, Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useLocation } from 'react-router-dom';
import { Page } from '../components/ui/AppPrimitives';
import MapMarkers from '../components/map/MapMarkers';
import MapFilterBar from '../components/map/MapFilterBar';
import MapFilterModal from '../components/map/MapFilterModal';
import MapSelectionSheet from '../components/map/MapSelectionSheet';
import { getWhenRange, useMapFilters, type MapArtistFilter } from '../hooks/useMapFilters';
import { withoutHiddenOnMap } from '../features/hiddenMap/hiddenMap';
import { useHiddenOnMap } from '../features/hiddenMap/useHiddenOnMap';
import { useQuery } from '../shared/hooks/useQuery';
import { persistStoredLocation, type StoredLocation } from '../shared/hooks/useStoredLocation';
import { IconLocate } from '../components/icons';
import { fetchMapEvents, type MapEvent } from '../data/eventQueries';

type MapScope = 'next30' | 'upcoming' | 'all';

// The bundled worker is emitted as its own asset: MapLibre's default lookup is
// relative to its own module URL, which neither Vite chunks nor capacitor:// keep.
setWorkerUrl(maplibreWorkerUrl);

// OpenFreeMap: free vector tiles, no API key. "dark" is near-black with muted
// labels, so the orange pins carry the colour.
const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

// Puerta del Sol: the pilot's agenda is Madrid and Barcelona.
// MapLibre zooms are one level below Leaflet's for the same scale (512px tiles).
const defaultCenter: [number, number] = [40.4168, -3.7038];
const defaultZoom = 12;
const nearbyZoom = 13;
const fitMaxZoom = 14;
// v3: MapLibre zoom levels. v2 (Leaflet) views are migrated one level down;
// v1 builds saved a Seville default view that hid the pilot's concerts.
const mapViewKey = 'live_space.map.view.v3';
const leafletMapViewKey = 'live_space.map.view.v2';
const EMPTY_EVENTS: MapEvent[] = [];

// Credits sit bottom-left above the floating tab bar (the locate button is on the right).
const darkAttribution =
  '[&_.maplibregl-ctrl-bottom-left]:!bottom-[calc(88px+env(safe-area-inset-bottom,0px))] [&_.maplibregl-ctrl-attrib]:!bg-black/50 [&_.maplibregl-ctrl-attrib]:!text-[10px] [&_.maplibregl-ctrl-attrib]:!text-white/55 [&_.maplibregl-ctrl-attrib_a]:!text-white/70';

const parseView = (raw: string | null, zoomOffset: number) => {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as { center?: [number, number]; zoom?: number };
  if (!parsed?.center || typeof parsed.zoom !== 'number') return null;
  const [lat, lng] = parsed.center;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { center: parsed.center, zoom: Math.max(0, parsed.zoom + zoomOffset) };
};

const readStoredView = () => {
  if (typeof window === 'undefined') return null;
  try {
    return (
      parseView(window.localStorage.getItem(mapViewKey), 0) ??
      parseView(window.localStorage.getItem(leafletMapViewKey), -1)
    );
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

const createMeElement = () => {
  const dot = document.createElement('div');
  dot.style.cssText =
    'width:16px;height:16px;border-radius:9999px;background:#3b82f6;border:3px solid #fff;box-sizing:border-box;pointer-events:none;';
  return dot;
};

type MapLocationState = { artistFilter?: MapArtistFilter };

const Map: React.FC = () => {
  const location = useLocation();
  // MapLibre owns the view after mount; React only seeds it once.
  const [initialView] = useState(() => readStoredView());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [activeVenueId, setActiveVenueId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const appliedArtistFilter = useRef<string | null>(null);
  const [me, setMe] = useState<StoredLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');

  // What to download: the date chips other than "Cualquier fecha" all fall
  // inside the next 30 days, so only that window is fetched by default; the
  // whole agenda (and the past, if asked) only when the visitor picks it.
  const [scope, setScope] = useState<MapScope>('next30');
  const eventsQuery = useQuery<MapEvent[]>(
    ['map:events', scope],
    () =>
      fetchMapEvents({
        includePast: scope === 'all',
        endIso: scope === 'next30' ? getWhenRange('next30')?.[1].toISOString() : undefined,
      }),
    { ttlMs: 60_000, initialData: EMPTY_EVENTS }
  );
  // Artists and venues hidden from the map (their page → «Más opciones»).
  const { sets: hiddenOnMap } = useHiddenOnMap();
  const allEvents = eventsQuery.data ?? EMPTY_EVENTS;
  const events = useMemo(() => withoutHiddenOnMap(allEvents, hiddenOnMap), [allEvents, hiddenOnMap]);

  const filters = useMapFilters(events);
  const { venueGroups, filteredEvents, artists, city, addArtist, includePast, when, whenRange } = filters;

  // Only the next 30 days are downloaded unless the chosen dates go further
  // (a day picked in the calendar) or the visitor asks for any date.
  useEffect(() => {
    const next30End = getWhenRange('next30')?.[1];
    if (when === 'all') setScope(includePast ? 'all' : 'upcoming');
    else if (whenRange && next30End && whenRange[1] > next30End) setScope('upcoming');
    else setScope('next30');
  }, [includePast, when, whenRange]);

  // Arriving from an artist page: filter the map to that artist.
  useEffect(() => {
    const artistFilter = (location.state as MapLocationState | null)?.artistFilter;
    if (!artistFilter || appliedArtistFilter.current === artistFilter.id) return;
    appliedArtistFilter.current = artistFilter.id;
    addArtist(artistFilter);
  }, [location.state, addArtist]);

  const closeSheet = useCallback(() => setActiveVenueId(null), []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const [lat, lng] = initialView?.center ?? defaultCenter;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        style: MAP_STYLE_URL,
        center: [lng, lat],
        zoom: initialView?.zoom ?? defaultZoom,
        attributionControl: false,
        // A flat street map: no rotation or tilt gestures.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
    } catch {
      // No WebGL (old WebView, disabled GPU): keep the page usable without the map.
      setMapFailed(true);
      return undefined;
    }
    map.addControl(new AttributionControl({ compact: false }), 'bottom-left');
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    // Tile or glyph hiccups are retried by MapLibre; keep them out of the console.
    map.on('error', () => undefined);
    map.on('moveend', () => {
      const center = map.getCenter();
      persistView([center.lat, center.lng], map.getZoom());
    });
    // Tapping the bare map closes the sheet; taps on pins select instead.
    map.on('click', event => {
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest('.venue-pin')) return;
      closeSheet();
    });
    setMapInstance(map);
    return () => {
      setMapInstance(null);
      map.remove();
    };
  }, [initialView, closeSheet]);

  // The visitor's position as a blue dot.
  useEffect(() => {
    if (!mapInstance || !me) return undefined;
    const marker = new Marker({ element: createMeElement(), anchor: 'center' })
      .setLngLat([me.lng, me.lat])
      .addTo(mapInstance);
    return () => {
      marker.remove();
    };
  }, [mapInstance, me]);

  const centreOnMe = useCallback(
    (quiet: boolean) => {
      if (!mapInstance || !navigator.geolocation) {
        if (!quiet) setLocateError('Este dispositivo no permite la ubicación.');
        return;
      }
      setLocating(true);
      setLocateError('');
      navigator.geolocation.getCurrentPosition(
        position => {
          const next = { lat: position.coords.latitude, lng: position.coords.longitude };
          setMe(next);
          persistStoredLocation(next);
          mapInstance.easeTo({ center: [next.lng, next.lat], zoom: Math.max(mapInstance.getZoom(), nearbyZoom) });
          setLocating(false);
        },
        () => {
          setLocating(false);
          if (!quiet) setLocateError('Activa la ubicación para centrar el mapa en ti.');
        },
        { enableHighAccuracy: !quiet, timeout: 8000, maximumAge: quiet ? 10 * 60 * 1000 : 30 * 1000 }
      );
    },
    [mapInstance]
  );

  // First visit (no saved view): centre on the visitor if they allow it.
  useEffect(() => {
    if (!mapInstance || initialView) return;
    centreOnMe(true);
  }, [mapInstance, initialView, centreOnMe]);

  // A new artist or city filter frames its venues.
  const fitKey = `${artists.map(artist => artist.id).join(',')}|${city ?? ''}`;
  const lastFitKey = useRef('|');
  useEffect(() => {
    if (!mapInstance || fitKey === lastFitKey.current || venueGroups.length === 0) return;
    lastFitKey.current = fitKey;
    const bounds = new LngLatBounds();
    venueGroups.forEach(group => bounds.extend([group.longitude, group.latitude]));
    mapInstance.fitBounds(bounds, { padding: 56, maxZoom: fitMaxZoom });
  }, [mapInstance, fitKey, venueGroups]);

  const activeGroup = useMemo(
    () => venueGroups.find(group => group.id === activeVenueId) ?? null,
    [venueGroups, activeVenueId]
  );

  // Keep the selected pin visible above the sheet.
  useEffect(() => {
    if (!mapInstance || !activeGroup) return;
    const container = mapInstance.getContainer();
    const point = mapInstance.project([activeGroup.longitude, activeGroup.latitude]);
    mapInstance.panBy([point.x - container.clientWidth / 2, point.y - container.clientHeight * 0.24]);
  }, [mapInstance, activeGroup?.id]);

  const handleSelectVenue = useCallback((venueId: string) => setActiveVenueId(venueId), []);

  return (
    <Page className="bg-app-bg">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={containerRef}
          data-testid="venue-map"
          className={`h-full w-full bg-[#0c0c0c] ${darkAttribution}`}
        />
        <MapMarkers
          map={mapInstance}
          groups={venueGroups}
          activeVenueId={activeVenueId}
          onSelectVenue={handleSelectVenue}
        />
        {mapFailed ? (
          <p className="absolute inset-x-6 top-1/2 z-[1] -translate-y-1/2 text-center text-sm text-app-ink/70">
            No se ha podido cargar el mapa en este dispositivo.
          </p>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] pt-[calc(12px+env(safe-area-inset-top,0px))] [&>*]:pointer-events-auto">
          <MapFilterBar
            when={filters.when}
            onWhenChange={filters.setWhen}
            day={filters.day}
            onDayChange={filters.setDay}
            search={filters.search}
            onSearchChange={filters.setSearch}
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

        {activeGroup ? null : (
          <div className="absolute bottom-[calc(108px+env(safe-area-inset-bottom,0px))] right-4 z-[1000] flex flex-col items-end gap-2">
            {locateError ? (
              <p className="max-w-[240px] rounded-2xl border border-app-line bg-app-surface/95 px-3 py-2 text-xs text-app-ink/80 backdrop-blur-md">
                {locateError}
              </p>
            ) : null}
            <button
              type="button"
              aria-label="Centrar el mapa en mí"
              disabled={locating}
              onClick={() => centreOnMe(false)}
              className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-app-line bg-app-surface/90 text-app-ink shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-md disabled:opacity-60"
            >
              <IconLocate size={20} className={locating ? 'animate-pulse' : undefined} />
            </button>
          </div>
        )}

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
