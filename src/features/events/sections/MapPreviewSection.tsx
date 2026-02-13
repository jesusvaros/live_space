import React, { useEffect, useMemo } from 'react';
import { MapContainer, CircleMarker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MapResizeObserver from '../../../components/MapResizeObserver';

type MapPreviewSectionProps = {
  center: { lat: number; lng: number } | null;
  pins: { id: string; lat: number; lng: number }[];
  onOpenMap: () => void;
};

const FitBounds: React.FC<{
  center: { lat: number; lng: number } | null;
  pins: { id: string; lat: number; lng: number }[];
}> = ({ center, pins }) => {
  const map = useMap();

  useEffect(() => {
    const points: L.LatLngExpression[] = [];
    if (center) points.push([center.lat, center.lng]);
    for (const pin of pins) points.push([pin.lat, pin.lng]);
    if (points.length === 0) return;

    const bounds = L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [18, 18], maxZoom: 13, animate: false });
  }, [center, map, pins]);

  return null;
};

const MapPreviewSection: React.FC<MapPreviewSectionProps> = ({ center, pins, onOpenMap }) => {
  const mapCenter: [number, number] = useMemo(() => {
    if (center) return [center.lat, center.lng];
    if (pins.length > 0) return [pins[0].lat, pins[0].lng];
    return [37.3891, -5.9845];
  }, [center, pins]);

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={onOpenMap}
        className="relative w-full overflow-hidden text-left"
      >
        <div className="relative h-44 w-full overflow-hidden bg-black">
          <div className="pointer-events-none absolute inset-0">
            <MapContainer
              center={mapCenter}
              zoom={12}
              className="h-full w-full"
              zoomControl={false}
              dragging={false}
              scrollWheelZoom={false}
              doubleClickZoom={false}
              boxZoom={false}
              keyboard={false}
              attributionControl={false}
            >
              <MapResizeObserver />
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FitBounds center={center} pins={pins} />
              {center && (
                <CircleMarker
                  center={[center.lat, center.lng]}
                  radius={6}
                  pathOptions={{ color: '#ffffff', fillColor: '#ffffff', fillOpacity: 1, weight: 2 }}
                />
              )}
              {pins.map(pin => (
                <CircleMarker
                  key={pin.id}
                  center={[pin.lat, pin.lng]}
                  radius={7}
                  pathOptions={{ color: '#ff6b4a', fillColor: '#ff6b4a', fillOpacity: 0.95, weight: 2 }}
                />
              ))}
            </MapContainer>
          </div>
          <div className="absolute inset-x-0 bottom-0 bg-black/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Map</p>
            <p className="mt-1 text-sm font-semibold text-white/90">
              {pins.length > 0 ? `${pins.length} nearby` : 'Open the map to explore'}
            </p>
          </div>
        </div>
      </button>
    </section>
  );
};

export default MapPreviewSection;
