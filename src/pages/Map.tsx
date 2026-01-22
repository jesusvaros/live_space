import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IonPage, IonContent, useIonViewDidEnter } from '@ionic/react';
import { MapContainer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';
import { Event, VenuePlace } from '../lib/types';
import { useHistory, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';
import MapLibreLayer from '../components/MapLibreLayer';
import MapResizeObserver from '../components/MapResizeObserver';
import MapFilterBar from '../components/map/MapFilterBar';
import MapFilterModal from '../components/map/MapFilterModal';
import MapMarkers from '../components/map/MapMarkers';
import MapSelectionSheet from '../components/map/MapSelectionSheet';
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

type EventWithVenue = Event & {
  venue_place?: VenuePlace | null;
  event_artists?: { artist?: { id: string; name: string; avatar_url: string | null; artist_type?: string | null } | null }[];
};

const Map: React.FC = () => {
  const history = useHistory();
  const location = useLocation<{ artistFilter?: { id: string; name: string; avatar_url: string | null } }>();
  const { user } = useAuth();
  const [events, setEvents] = useState<EventWithVenue[]>([]);
  const [venues, setVenues] = useState<VenuePlace[]>([]);
  const [selectedArtists, setSelectedArtists] = useState<{ id: string; name: string; avatar_url: string | null }[]>([]);
  const [focusArtistSearch, setFocusArtistSearch] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [visibleItems, setVisibleItems] = useState<{ type: 'event' | 'venue'; id: string }[]>([]);
  const activeSelection = activeIndex !== null ? visibleItems[activeIndex] : null;
  const [center, setCenter] = useState<[number, number]>(defaultCenter);
  const [zoom, setZoom] = useState(defaultZoom);
  const [initialViewApplied, setInitialViewApplied] = useState(false);
  const [locationRequested, setLocationRequested] = useState(false);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [initialArtistFilterApplied, setInitialArtistFilterApplied] = useState<string | null>(null);

  const {
    search,
    setSearch,
    showEvents,
    setShowEvents,
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
    filterDayPart,
    setFilterDayPart,
    filterBandOnly,
    setFilterBandOnly,
    selectedArtistIds,
    setSelectedArtistIds,
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

  const loadEvents = useCallback(async () => {
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
        ),
        event_artists (
          artist:artists!event_artists_artist_entity_fk (
            id,
            name,
            avatar_url,
            artist_type
          )
        )
        `
      );
    setEvents((data || []) as EventWithVenue[]);
  }, []);

  const loadVenues = useCallback(async () => {
    const { data } = await supabase
      .from('venue_places')
      .select('id, name, city, address, latitude, longitude, photos, venue_type, capacity');
    setVenues((data || []) as VenuePlace[]);
  }, []);

  useEffect(() => {
    loadEvents();
    loadVenues();
  }, [loadEvents, loadVenues]);

  useEffect(() => {
    if (events.length === 0) {
      loadEvents();
    }
  }, [events.length, loadEvents]);

  useEffect(() => {
    if (venues.length === 0) {
      loadVenues();
    }
  }, [venues.length, loadVenues]);

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
    const artistFilter = location.state?.artistFilter;
    if (artistFilter?.id && initialArtistFilterApplied !== artistFilter.id) {
      setSelectedArtists([artistFilter]);
      setSelectedArtistIds([artistFilter.id]);
      setShowEvents(true);
      setShowVenues(false);
      setInitialArtistFilterApplied(artistFilter.id);
    }
  }, [location.state, initialArtistFilterApplied, setSelectedArtistIds, setShowEvents, setShowVenues]);

  const getItemLatLng = (item: { type: 'event' | 'venue'; id: string }) => {
    if (item.type === 'event') {
      const ev = filteredEvents.find(e => e.id === item.id);
      if (!ev) return null;
      const lat = Number(ev.latitude ?? ev.venue_place?.latitude ?? null);
      const lng = Number(ev.longitude ?? ev.venue_place?.longitude ?? null);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return [lat, lng] as [number, number];
    }
    const venue = filteredVenues.find(v => v.id === item.id);
    if (!venue) return null;
    const lat = Number(venue.latitude ?? null);
    const lng = Number(venue.longitude ?? null);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lat, lng] as [number, number];
  };

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

  const centerOnItem = (item: { type: 'event' | 'venue'; id: string }) => {
    if (!mapInstance) return;
    const coords = getItemLatLng(item);
    if (!coords) return;
    mapInstance.setView(coords, mapInstance.getZoom(), { animate: true });
  };

  const handleSelect = (item: { type: 'event' | 'venue'; id: string }) => {
    if (!mapInstance) return;
    const coords = getItemLatLng(item);
    if (!coords) return;
    const bounds = mapInstance.getBounds();
    if (!bounds.contains(coords)) return;

    const visibleList: { type: 'event' | 'venue'; id: string }[] = [];
    if (showEvents) {
      filteredEvents.forEach(ev => {
        const ll = getItemLatLng({ type: 'event', id: ev.id });
        if (ll && bounds.contains(ll)) visibleList.push({ type: 'event', id: ev.id });
      });
    }
    if (showVenues) {
      filteredVenues.forEach(v => {
        const ll = getItemLatLng({ type: 'venue', id: v.id });
        if (ll && bounds.contains(ll)) visibleList.push({ type: 'venue', id: v.id });
      });
    }

    // Ensure clicked item is present if visible
    const existingIdx = visibleList.findIndex(i => i.type === item.type && i.id === item.id);
    const nextList =
      existingIdx === -1 ? [...visibleList, item] : visibleList;
    const nextIndex =
      existingIdx === -1 ? nextList.length - 1 : existingIdx;

    setVisibleItems(nextList);
    setActiveIndex(nextIndex);
    centerOnItem(item);
  };

  const goNext = (direction: 1 | -1) => {
    if (activeIndex === null || visibleItems.length === 0) return;
    let next = activeIndex + direction;
    if (next < 0) next = visibleItems.length - 1;
    if (next >= visibleItems.length) next = 0;
    setActiveIndex(next);
    centerOnItem(visibleItems[next]);
  };

  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => setTouchStartX(e.touches[0].clientX);
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) {
      goNext(dx < 0 ? 1 : -1);
    }
    setTouchStartX(null);
  };

  const clearArtistFilters = () => {
    setSelectedArtists([]);
    setSelectedArtistIds([]);
    setShowVenues(true);
  };

  const removeArtist = (id: string) => {
    setSelectedArtists(prev => prev.filter(artist => artist.id !== id));
    setSelectedArtistIds(prev => {
      const next = prev.filter(item => item !== id);
      if (next.length === 0) {
        setShowVenues(true);
      }
      return next;
    });
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="min-h-full">
          <AppHeader />
          <div className="relative flex min-h-full flex-col p-0">
            <div className="pointer-events-auto absolute left-4 right-4 top-4 z-[1000] flex flex-col gap-2">
              <input
                type="search"
                placeholder="Search events"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full rounded-2xl border border-white/20 bg-slate-900/95 px-4 py-3 text-sm text-slate-100 shadow-[0_16px_32px_rgba(0,0,0,0.4)] backdrop-blur placeholder:text-slate-500"
              />
              <MapFilterBar
                filterToday={filterToday}
                filterTomorrow={filterTomorrow}
                filterDate={filterDate}
                filterNow={filterNow}
                filterFree={filterFree}
                showEvents={showEvents}
                showVenues={showVenues}
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
                onToggleEvents={() => setShowEvents(prev => !prev)}
                onToggleVenues={() => setShowVenues(prev => !prev)}
                onOpenArtistSearch={() => {
                  setFocusArtistSearch(true);
                  setShowFilters(true);
                }}
                onOpenFilters={() => setShowFilters(true)}
              />
              {selectedArtists.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/15 bg-black/70 px-3 py-2 text-xs text-white shadow-lg">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-300">Artist filter</span>
                  {selectedArtists.map(artist => (
                    <button
                      key={artist.id}
                      type="button"
                      onClick={() => removeArtist(artist.id)}
                      className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/20"
                    >
                      <span className="h-6 w-6 overflow-hidden rounded-full bg-white/10">
                        {artist.avatar_url ? (
                          <img src={artist.avatar_url} alt={artist.name} className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[10px] text-slate-200">
                            {artist.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </span>
                      {artist.name}
                      <span className="text-slate-300">×</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={clearArtistFilters}
                    className="ml-auto rounded-full border border-white/20 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-100 hover:border-white/40"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          <div className="relative">
            {selectedArtistIds.length > 0 && filteredEvents.length === 0 && (
              <div className="pointer-events-auto absolute left-4 right-4 top-24 z-[1100] rounded-2xl border border-white/20 bg-black/80 px-4 py-3 text-center text-white">
                <p className="text-sm font-semibold">No shows to display for this artist</p>
                <p className="text-xs text-slate-300">Remove the artist filter to see all events on the map.</p>
                <div className="mt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={clearArtistFilters}
                    className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-white hover:bg-white/20"
                  >
                    Clear artist filter
                  </button>
                </div>
              </div>
            )}
            <MapContainer
              center={center}
              zoom={zoom}
              style={{ height: 'calc(100vh - 60px)', width: '100%' }}
              className="rounded-none [&_.leaflet-container]:rounded-none [&_.leaflet-pane]:z-0 [&_.leaflet-marker-pane]:z-[500] [&_.leaflet-overlay-pane]:z-[400] [&_.leaflet-popup-pane]:z-[600]"
              zoomControl={false}
              ref={mapRef}
              whenReady={e => setMapInstance(e.target)}
              preferCanvas={false}
            >
              <MapLibreLayer />
              <MapResizeObserver />
              <MapMarkers
                events={showEvents ? filteredEvents : []}
                venues={filteredVenues}
                showVenues={showVenues}
                onSelectEvent={eventId => handleSelect({ type: 'event', id: eventId })}
                onSelectVenue={venueId => handleSelect({ type: 'venue', id: venueId })}
                activeSelection={activeIndex !== null ? visibleItems[activeIndex] : null}
              />
            </MapContainer>
          </div>
          </div>
        </div>

        <MapSelectionSheet
          activeItem={activeSelection}
          events={filteredEvents}
          venues={filteredVenues}
          onClose={() => setActiveIndex(null)}
          onPrev={() => goNext(-1)}
          onNext={() => goNext(1)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        />

        <MapFilterModal
          isOpen={showFilters}
          onDismiss={() => {
            setShowFilters(false);
            setFocusArtistSearch(false);
          }}
          filterGenres={filterGenres}
          onGenresChange={setFilterGenres}
          priceMin={priceMin}
          priceMax={priceMax}
          onPriceMinChange={setPriceMin}
          onPriceMaxChange={setPriceMax}
          filterDayPart={filterDayPart}
          onDayPartChange={setFilterDayPart}
          filterBandOnly={filterBandOnly}
          onToggleBand={setFilterBandOnly}
          selectedArtists={selectedArtists}
          onAddArtist={artist => {
            if (selectedArtistIds.includes(artist.id)) return;
            setSelectedArtists(prev => [...prev, artist]);
            setSelectedArtistIds(prev => [...prev, artist.id]);
            setFilterBandOnly(false);
          }}
          onRemoveArtist={id => {
            setSelectedArtists(prev => prev.filter(item => item.id !== id));
            setSelectedArtistIds(prev => prev.filter(item => item !== id));
          }}
          autoFocusArtist={focusArtistSearch}
          filterGoing={filterGoing}
          filterAttended={filterAttended}
          onToggleGoing={setFilterGoing}
          onToggleAttended={setFilterAttended}
          onClear={() => {
            clearExtraFilters();
            setSelectedArtists([]);
            setSelectedArtistIds([]);
            setShowVenues(true);
          }}
          disableAttendance={!user}
        />
      </IonContent>
    </IonPage>
  );
};

export default Map;
