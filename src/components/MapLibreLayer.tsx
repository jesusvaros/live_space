import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import maplibregl from 'maplibre-gl';
import '@maplibre/maplibre-gl-leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';

const DEFAULT_STYLE_URL = (import.meta as any).env?.VITE_MAP_STYLE_URL
  || 'https://tiles.openfreemap.org/styles/liberty/style.json';

const DEFAULT_ATTRIBUTION =
  'Leaflet | OpenFreeMap © OpenMapTiles Data from OpenStreetMap';
const DEFAULT_RASTER_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_RASTER_ATTRIBUTION = '&copy; OpenStreetMap contributors';

type MapLibreLayerProps = {
  styleUrl?: string;
  attribution?: string;
};

const MapLibreLayer = ({ styleUrl, attribution }: MapLibreLayerProps) => {
  const map = useMap();

  useEffect(() => {
    const factory = (L as any).maplibreGL;
    (window as any).maplibregl = maplibregl;
    let rasterLayer: L.TileLayer | null = null;
    let vectorLayer: any = null;
    let maplibreMap: any = null;

    const addRasterFallback = () => {
      if (vectorLayer) {
        map.removeLayer(vectorLayer);
        vectorLayer = null;
      }
      if (rasterLayer) return;
      rasterLayer = L.tileLayer(DEFAULT_RASTER_URL, {
        attribution: DEFAULT_RASTER_ATTRIBUTION,
      });
      rasterLayer.addTo(map);
    };

    if (!factory) {
      console.warn('MapLibre GL Leaflet plugin is not available.');
      addRasterFallback();
      return undefined;
    }

    let handleLoad: (() => void) | null = null;
    try {
      vectorLayer = factory({
        style: styleUrl || DEFAULT_STYLE_URL,
        attribution: attribution || DEFAULT_ATTRIBUTION,
        maplibreGL: maplibregl,
      });
      vectorLayer.addTo(map);
      maplibreMap = vectorLayer.getMapboxMap?.() || vectorLayer.getMaplibreMap?.();
      if (maplibreMap) {
        (map as any)._maplibreMap = maplibreMap;
      }
      handleLoad = () => maplibreMap?.resize?.();
      if (maplibreMap?.on) {
        maplibreMap.on('error', addRasterFallback);
        maplibreMap.on('load', handleLoad);
      }
    } catch (error) {
      console.warn('MapLibre GL failed, falling back to raster.', error);
      addRasterFallback();
    }

    return () => {
      if (maplibreMap?.off) {
        maplibreMap.off('error', addRasterFallback);
        if (handleLoad) {
          maplibreMap.off('load', handleLoad);
        }
      }
      if (vectorLayer) {
        map.removeLayer(vectorLayer);
      }
      if (rasterLayer) {
        map.removeLayer(rasterLayer);
      }
    };
  }, [map, styleUrl, attribution]);

  return null;
};

export default MapLibreLayer;
