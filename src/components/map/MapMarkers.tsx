import { useEffect, useRef } from 'react';
import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import type { MapVenueGroup } from '../../hooks/useMapFilters';

type MapMarkersProps = {
  map: MapLibreMap | null;
  groups: MapVenueGroup[];
  activeVenueId: string | null;
  onSelectVenue: (venueId: string) => void;
};

// Map.tsx ignores bare-map clicks that land inside one of these.
const VENUE_PIN_CLASS = 'venue-pin';

const IDLE_DOT = 'h-8 min-w-8 text-[13px] shadow-[0_6px_16px_rgba(0,0,0,0.55)]';
const ACTIVE_DOT = 'h-12 min-w-12 text-[17px] ring-4 ring-app-accent/35 shadow-[0_10px_26px_rgba(0,0,0,0.6)]';
const DOT_BASE =
  'inline-flex items-center justify-center rounded-full border-2 border-app-bg bg-app-accent px-1.5 font-mono font-bold leading-none text-white transition-transform';

type PinEntry = {
  marker: Marker;
  root: HTMLDivElement;
  dot: HTMLSpanElement;
  lat: number;
  lng: number;
  count: number;
  active: boolean;
};

const countLabel = (count: number) => (count > 99 ? '99+' : String(count));

// The hit area stays at least 44px; the visible dot is smaller when idle.
const paintPin = (entry: PinEntry, count: number, active: boolean, name: string) => {
  const box = active ? 60 : 44;
  entry.root.style.width = `${box}px`;
  entry.root.style.height = `${box}px`;
  entry.root.style.zIndex = String(active ? 1000 : Math.min(count, 999));
  entry.root.title = name;
  entry.root.setAttribute('aria-label', name);
  entry.dot.className = `${DOT_BASE} ${active ? ACTIVE_DOT : IDLE_DOT}`;
  entry.dot.textContent = countLabel(count);
  entry.count = count;
  entry.active = active;
};

/**
 * Venue pins as MapLibre HTML markers. Pins live outside React's tree and are
 * diffed by venue id: re-renders only touch the pins whose position, count or
 * active state changed.
 */
const MapMarkers = ({ map, groups, activeVenueId, onSelectVenue }: MapMarkersProps) => {
  const pins = useRef(new Map<string, PinEntry>());
  const onSelect = useRef(onSelectVenue);
  useEffect(() => {
    onSelect.current = onSelectVenue;
  }, [onSelectVenue]);

  useEffect(() => {
    if (!map) return;
    const current = pins.current;
    const seen = new Set<string>();

    groups.forEach(group => {
      const { id, latitude, longitude, events, name } = group;
      seen.add(id);
      const active = id === activeVenueId;
      let entry = current.get(id);
      if (!entry) {
        const root = document.createElement('div');
        root.className = `${VENUE_PIN_CLASS} flex cursor-pointer items-center justify-center`;
        root.setAttribute('role', 'button');
        const dot = document.createElement('span');
        root.appendChild(dot);
        root.addEventListener('click', event => {
          event.stopPropagation();
          onSelect.current(id);
        });
        const marker = new Marker({ element: root, anchor: 'center' }).setLngLat([longitude, latitude]).addTo(map);
        entry = { marker, root, dot, lat: latitude, lng: longitude, count: -1, active: false };
        current.set(id, entry);
        paintPin(entry, events.length, active, name);
        return;
      }
      if (entry.lat !== latitude || entry.lng !== longitude) {
        entry.marker.setLngLat([longitude, latitude]);
        entry.lat = latitude;
        entry.lng = longitude;
      }
      if (entry.count !== events.length || entry.active !== active) {
        paintPin(entry, events.length, active, name);
      }
    });

    current.forEach((entry, id) => {
      if (seen.has(id)) return;
      entry.marker.remove();
      current.delete(id);
    });
  }, [map, groups, activeVenueId]);

  // A new map instance (or unmount) drops every pin.
  useEffect(() => {
    const current = pins.current;
    return () => {
      current.forEach(entry => entry.marker.remove());
      current.clear();
    };
  }, [map]);

  return null;
};

export default MapMarkers;
