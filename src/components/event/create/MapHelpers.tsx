import { useEffect } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

export const buildPinIcon = (variant: 'venue') => {
  const html = `
    <div class="map-pin map-pin--${variant}">
      <span class="map-pin-icon">
        <svg viewBox="0 0 28 28" aria-hidden="true">
          <path d="M2.8 12L14 4.8 25.2 12" />
          <rect x="4.5" y="12" width="19" height="10" rx="1.5" />
          <path d="M9.5 22v-4.6h9V22" />
          <path d="M10 15.5h2.2M15.8 15.5H18" />
        </svg>
      </span>
    </div>
  `;
  return L.divIcon({
    className: 'map-pin-wrapper',
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
