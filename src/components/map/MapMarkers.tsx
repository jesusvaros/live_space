import React, { memo, useMemo } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import type { MapVenueGroup } from '../../hooks/useMapFilters';

type MapMarkersProps = {
  groups: MapVenueGroup[];
  activeVenueId: string | null;
  onSelectVenue: (venueId: string) => void;
};

// One DivIcon per (kind, count, active): Leaflet only swaps a marker's DOM when
// its icon object changes, so re-renders no longer rebuild every pin.
const iconCache = new Map<string, L.DivIcon>();

const getVenueIcon = (count: number, active: boolean) => {
  const label = count > 99 ? '99+' : String(count);
  const key = `venue|${label}|${active ? 1 : 0}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  // The hit area stays at least 44px; the visible dot is smaller when idle.
  const box = active ? 60 : 44;
  const dot = active
    ? 'h-12 min-w-12 text-[17px] ring-4 ring-app-accent/35 shadow-[0_10px_26px_rgba(0,0,0,0.6)]'
    : 'h-8 min-w-8 text-[13px] shadow-[0_6px_16px_rgba(0,0,0,0.55)]';
  const icon = L.divIcon({
    className: '!border-0 !bg-transparent',
    html: `<div class="flex h-full w-full items-center justify-center"><span class="inline-flex ${dot} items-center justify-center rounded-full border-2 border-app-bg bg-app-accent px-1.5 font-mono font-bold leading-none text-white transition-transform">${label}</span></div>`,
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
  });
  iconCache.set(key, icon);
  return icon;
};

type VenueMarkerProps = {
  group: MapVenueGroup;
  active: boolean;
  onSelectVenue: (venueId: string) => void;
};

const VenueMarker = memo(function VenueMarker({ group, active, onSelectVenue }: VenueMarkerProps) {
  const { id, latitude, longitude, events, name } = group;
  const eventHandlers = useMemo(() => ({ click: () => onSelectVenue(id) }), [id, onSelectVenue]);
  return (
    <Marker
      position={[latitude, longitude]}
      icon={getVenueIcon(events.length, active)}
      keyboard={false}
      bubblingMouseEvents={false}
      zIndexOffset={active ? 1000 : events.length}
      title={name}
      alt={name}
      eventHandlers={eventHandlers}
    />
  );
});

const MapMarkers: React.FC<MapMarkersProps> = ({ groups, activeVenueId, onSelectVenue }) => (
  <>
    {groups.map(group => (
      <VenueMarker
        key={group.id}
        group={group}
        active={group.id === activeVenueId}
        onSelectVenue={onSelectVenue}
      />
    ))}
  </>
);

export default MapMarkers;
