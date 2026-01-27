import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IonPage, IonContent, useIonViewDidEnter } from '@ionic/react';
import { MapContainer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';
import { Artist, Event, VenuePlace } from '../lib/types';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';
import MapLibreLayer from '../components/MapLibreLayer';
import MapResizeObserver from '../components/MapResizeObserver';
import MapMarkers from '../components/map/MapMarkers';
import MapFilterBar from '../components/map/MapFilterBar';
import MapFilterModal from '../components/map/MapFilterModal';
import MapSelectionSheet from '../components/map/MapSelectionSheet';
import { useMapFilters } from '../hooks/useMapFilters';

const defaultCenter: [number, number] = [37.3891, -5.9845];
const defaultZoom = 15;
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
    window.localStorage.setItem(mapViewKey, JSON.stringify({ center: `${center[0]},${center[1]}`, zoom }));
  } catch (e) {
    // ignore storage failures
  }
};

type EventWithVenue = Event & {
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Artist | null }[];
};

const Map: React.FC = () => {
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
  
  // Monitor ref changes - this is the fix!
  useEffect(() => {
    const checkRef = () => {
      if (mapRef.current && !mapInstance) {
        console.log('[Map] mapRef.current is now available, setting mapInstance');
        setMapInstance(mapRef.current);
      }
    };

    // Check immediately
    checkRef();
    
    // Check periodically
    const interval = setInterval(checkRef, 100);
    
    // Stop checking after 5 seconds
    setTimeout(() => clearInterval(interval), 5000);

    return () => clearInterval(interval);
  }, [mapInstance]);

  const [showFilters, setShowFilters] = useState(false);
  const [initialArtistFilterApplied, setInitialArtistFilterApplied] = useState<string | null>(null);

  const {
    search,
    setSearch,
    showEvents,
    setShowEvents,
    showVenues,
    setShowVenues,
    showUpcoming,
    setShowUpcoming,
    showPast,
    setShowPast,
    filterToday,
    filterTomorrow,
    filterDate,
    setFilterDate,
    filterNow,
    setFilterNow,
    filterFree,
    setFilterFree,
    filterGenres,
    setFilterGenres,
    priceMin,
    setPriceMin,
    priceMax,
    setPriceMax,
    filterDayPart,
    setFilterDayPart,
    filterBandOnly,
    setFilterBandOnly,
    filterGoing,
    setFilterGoing,
    filterAttended,
    setFilterAttended,
    clearExtraFilters,
    selectedArtistIds,
    setSelectedArtistIds,
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

  const loadEvents = useCallback(async () => {
    const { data } = await supabase
      .from('events')
      .select(`
        *,
        venue_place:venue_places(*),
        event_artists(artist:artists(*))
      `);
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
  }, []);

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
    const stored = readStoredView();
    if (stored && !initialViewApplied) {
      setCenter(stored.center);
      setZoom(stored.zoom);
      setInitialViewApplied(true);
    }
  }, [initialViewApplied]);

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

  // Center map when activeSelection changes
  useEffect(() => {
    if (activeSelection && mapInstance) {
      const coords = getItemLatLng(activeSelection);
      if (coords) {
        // Calculate offset to place marker above modal
        const mapHeight = mapInstance.getSize().y;
        const offsetPercentage = -0.15; // Move marker 25% up from center
        const offsetY = mapHeight * offsetPercentage;
        
        // Get the current zoom and calculate the pixel offset
        const zoom = mapInstance.getZoom();
        const point = mapInstance.latLngToContainerPoint(coords);
        const offsetPoint = L.point(point.x, point.y - offsetY);
        const centerCoords = mapInstance.containerPointToLatLng(offsetPoint);
        
        mapInstance.setView(centerCoords, zoom, { animate: true });
      }
    }
  }, [activeSelection, mapInstance]);

  const getItemLatLng = (item: { type: 'event' | 'venue'; id: string }): [number, number] | null => {
    if (item.type === 'event') {
      const ev = filteredEvents.find(e => e.id === item.id);
      if (!ev) return null;
      const lat = Number(ev.latitude ?? ev.venue_place?.latitude ?? null);
      const lng = Number(ev.longitude ?? ev.venue_place?.longitude ?? null);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
      return [lat, lng];
    } else {
      const venue = filteredVenues.find(v => v.id === item.id);
      if (!venue) return null;
      const lat = Number(venue.latitude ?? null);
      const lng = Number(venue.longitude ?? null);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
      return [lat, lng];
    }
  };

  const handleSelect = (item: { type: 'event' | 'venue'; id: string }) => {
    const coords = getItemLatLng(item);
    if (!coords) return;

    const visibleList: { type: 'event' | 'venue'; id: string }[] = [];
    if (showEvents) {
      filteredEvents.forEach(ev => {
        const ll = getItemLatLng({ type: 'event', id: ev.id });
        if (ll) visibleList.push({ type: 'event', id: ev.id });
      });
    }
    if (showVenues) {
      filteredVenues.forEach(v => {
        const ll = getItemLatLng({ type: 'venue', id: v.id });
        if (ll) visibleList.push({ type: 'venue', id: v.id });
      });
    }

    // Ensure clicked item is present
    const existingIdx = visibleList.findIndex(i => i.type === item.type && i.id === item.id);
    const nextList =
      existingIdx === -1 ? [...visibleList, item] : visibleList;
    const nextIndex =
      existingIdx === -1 ? nextList.length - 1 : existingIdx;

    setVisibleItems(nextList);
    setActiveIndex(nextIndex);
  };

  const goNext = (direction: 1 | -1) => {
    if (activeIndex === null || visibleItems.length === 0) return;
    let next = activeIndex + direction;
    if (next < 0) next = visibleItems.length - 1;
    if (next >= visibleItems.length) next = 0;
    setActiveIndex(next);
  };

  const clearArtistFilters = () => {
    setSelectedArtists([]);
    setSelectedArtistIds([]);
    setShowVenues(true);
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="min-h-full">
          <AppHeader />
          <div className="relative flex min-h-full flex-col p-0">
            <div className="pointer-events-auto absolute left-4 right-4 top-4 z-[1000]">
              <div className="flex flex-col gap-2 rounded-2xl bg-black/85 p-3">
                <input
                  type="search"
                  placeholder="Search shows"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-xl bg-white/15 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                />
                <MapFilterBar
                  showUpcoming={showUpcoming}
                  showPast={showPast}
                  filterToday={filterToday}
                  filterTomorrow={filterTomorrow}
                  filterDate={filterDate}
                  filterNow={filterNow}
                  filterFree={filterFree}
                  showEvents={showEvents}
                  showVenues={showVenues}
                  onToggleUpcoming={() => setShowUpcoming((prev: boolean) => !prev)}
                  onTogglePast={() => setShowPast((prev: boolean) => !prev)}
                  onToggleToday={() => {}}
                  onToggleTomorrow={() => {}}
                  onDateChange={value => {
                    setFilterDate(value);
                    if (value) {
                      setFilterNow(false);
                    }
                  }}
                  onToggleNow={() => setFilterNow((prev: boolean) => !prev)}
                  onToggleFree={() => setFilterFree((prev: boolean) => !prev)}
                  onToggleEvents={() => setShowEvents((prev: boolean) => !prev)}
                  onToggleVenues={() => setShowVenues((prev: boolean) => !prev)}
                  onOpenArtistSearch={() => {
                    setFocusArtistSearch(true);
                    setShowFilters(true);
                  }}
                  onOpenFilters={() => setShowFilters(true)}
                />
                {selectedArtists.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs text-white">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/60">Artist</span>
                    {selectedArtists.map(artist => (
                      <div
                        key={artist.id}
                        className="flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-xs font-medium text-white"
                      >
                        {artist.avatar_url && (
                          <img
                            src={artist.avatar_url}
                            alt={artist.name}
                            className="h-4 w-4 rounded-full object-cover"
                          />
                        )}
                        <span>{artist.name}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedArtists(prev => prev.filter(a => a.id !== artist.id));
                            setSelectedArtistIds(prev => {
                              const next = prev.filter(item => item !== artist.id);
                              if (next.length === 0) {
                                setShowVenues(true);
                              }
                              return next;
                            });
                          }}
                          className="ml-auto text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70 transition hover:text-white"
                        >
                          Clear
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={clearArtistFilters}
                      className="bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white"
                    >
                      Clear artist filter
                    </button>
                  </div>
                )}
            </div>
          </div>
          <div className="relative">
            <MapContainer
              center={center}
              zoom={zoom}
              style={{ height: 'calc(100vh - 60px)', width: '100%' }}
              className="rounded-none [&_.leaflet-container]:rounded-none [&_.leaflet-pane]:z-0 [&_.leaflet-marker-pane]:z-[500] [&_.leaflet-overlay-pane]:z-[400] [&_.leaflet-popup-pane]:z-[600]"
              zoomControl={false}
              ref={mapRef}
              whenReady={() => {
                console.log('[Map] MapContainer whenReady triggered');
              }}
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
          onTouchStart={() => {}}
          onTouchEnd={() => {}}
        />

        <MapFilterModal
          isOpen={showFilters}
          onDismiss={() => {
            setShowFilters(false);
            setFocusArtistSearch(false);
          }}
          filterGenres={filterGenres}
          onGenresChange={setFilterGenres}
          priceMin={priceMin.toString()}
          onPriceMinChange={(value) => setPriceMin(Number(value) || 0)}
          priceMax={priceMax.toString()}
          onPriceMaxChange={(value) => setPriceMax(Number(value) || 100)}
          filterDayPart={filterDayPart || ''}
          onDayPartChange={setFilterDayPart}
          filterBandOnly={filterBandOnly}
          onToggleBand={setFilterBandOnly}
          filterGoing={filterGoing}
          onToggleGoing={setFilterGoing}
          filterAttended={filterAttended}
          onToggleAttended={setFilterAttended}
          disableAttendance={false}
          selectedArtists={selectedArtists}
          onAddArtist={artist => {
            setSelectedArtists(prev => [...prev, artist]);
            setSelectedArtistIds(prev => [...prev, artist.id]);
            setShowVenues(false);
          }}
          onRemoveArtist={id => {
            setSelectedArtists(prev => prev.filter(a => a.id !== id));
            setSelectedArtistIds(prev => {
              const next = prev.filter(item => item !== id);
              if (next.length === 0) {
                setShowVenues(true);
              }
              return next;
            });
          }}
          filterDate={filterDate}
          onDateChange={setFilterDate}
          showVenues={showVenues}
          onToggleVenues={setShowVenues}
          onClear={() => {
            clearExtraFilters();
            setFilterDate('');
            setFilterNow(false);
            setFilterFree(false);
            setFilterGenres('');
            setPriceMin(0);
            setPriceMax(100);
            setFilterDayPart('');
            setFilterBandOnly(false);
            setFilterGoing(false);
            setFilterAttended(false);
          }}
        />
      </IonContent>
    </IonPage>
  );
};

export default Map;
