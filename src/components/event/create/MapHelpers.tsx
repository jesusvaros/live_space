import { useEffect } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

export const buildPinIcon = (variant: 'venue') => {
  const pinClasses =
    "relative flex h-[46px] w-[46px] pointer-events-auto items-center justify-center rounded-full border-[1.8px] border-[#7ea8ff] bg-[radial-gradient(circle_at_30%_25%,rgba(35,43,58,0.98)_0%,rgba(11,14,20,0.96)_72%)] text-[#d2e2ff] shadow-[0_8px_20px_rgba(3,8,16,0.45),0_0_0_3px_rgba(126,168,255,0.22)] transition-all duration-150 after:absolute after:-bottom-[7px] after:left-1/2 after:h-3 after:w-3 after:-translate-x-1/2 after:rotate-[-45deg] after:rounded-[1px] after:border-l-[1.8px] after:border-b-[1.8px] after:border-[#7ea8ff] after:bg-[rgba(11,14,20,0.96)] after:content-['']";
  const html = `
    <div class="${pinClasses}" data-variant="${variant}">
      <span class="inline-flex h-6 w-6 items-center justify-center">
        <svg viewBox="0 0 28 28" aria-hidden="true" class="h-full w-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2.8 12L14 4.8 25.2 12" />
          <rect x="4.5" y="12" width="19" height="10" rx="1.5" />
          <path d="M9.5 22v-4.6h9V22" />
          <path d="M10 15.5h2.2M15.8 15.5H18" />
        </svg>
      </span>
    </div>
  `;
  return L.divIcon({
    className: 'leaflet-div-icon leaflet-interactive !border-0 !bg-transparent',
    html,
    iconSize: [48, 56],
    iconAnchor: [24, 56],
    popupAnchor: [0, -50],
  });
};

export const MapFocus: React.FC<{ center: [number, number] | null }> = ({ center }) => {
  const map = useMap();

  useEffect(() => {
    if (!center) return;
    map.setView(center);
  }, [center, map]);

  return null;
};

export const MapBoundsWatcher: React.FC<{ onChange: (bounds: L.LatLngBounds) => void }> = ({
  onChange,
}) => {
  const map = useMap();

  useEffect(() => {
    onChange(map.getBounds());
  }, [map, onChange]);

  useMapEvents({
    moveend: () => onChange(map.getBounds()),
    zoomend: () => onChange(map.getBounds()),
  });

  return null;
};

export const VenueMapClick: React.FC<{ enabled: boolean; onSelect: (lat: number, lng: number) => void }> = ({
  enabled,
  onSelect,
}) => {
  useMapEvents({
    click: event => {
      if (!enabled) return;
      onSelect(event.latlng.lat, event.latlng.lng);
    },
  });

  return null;
};
