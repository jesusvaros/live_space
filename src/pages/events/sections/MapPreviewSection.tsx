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
        className="relative w-full overflow-hidden rounded-3xl border border-white/10 bg-[#0f1320] p-4 text-left shadow-[0_20px_44px_rgba(0,0,0,0.45)]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,107,74,0.25),transparent_40%),radial-gradient(circle_at_75%_80%,rgba(122,167,255,0.22),transparent_45%)]" />
        <div className="relative z-10 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">Map preview</p>
            <p className="mt-1 text-sm text-slate-200">
              {pins.length > 0 ? `${pins.length} nearby` : 'Open map to explore'}
            </p>
          </div>
          <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-[#ffd1c4]">
            Open map
          </span>
        </div>

        <div className="relative z-10 mt-4 h-32 w-full overflow-hidden rounded-2xl border border-white/10 bg-black/20">
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
          {pins.length === 0 && (
            <div className="relative z-10 flex h-full items-center justify-center px-4 text-center">
              <p className="text-xs text-slate-200">No nearby pins yet.</p>
            </div>
          )}
        </div>
      </button>
    </section>
  );
};

export default MapPreviewSection;
