import { useEffect } from 'react';
import { useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

export const buildPinIcon = (variant: 'venue', label: string, imageUrl?: string | null) => {
  const safeUrl = imageUrl ? encodeURI(imageUrl).replace(/'/g, '%27') : '';
  const avatar = imageUrl
    ? `<div class="map-pin-avatar" style="background-image:url('${safeUrl}')"></div>`
    : '<div class="map-pin-avatar map-pin-avatar--empty"></div>';
  const html = `
    <div class="map-pin map-pin--${variant}">
      ${avatar}
      <span class="map-pin-label">${label}</span>
    </div>
  `;
  return L.divIcon({
    className: 'map-pin-wrapper',
    html,
    iconSize: [52, 60],
    iconAnchor: [26, 60],
    popupAnchor: [0, -54],
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
