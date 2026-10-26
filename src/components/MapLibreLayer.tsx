import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import * as maplibregl from 'maplibre-gl';
import '@maplibre/maplibre-gl-leaflet';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 loads its worker from a sibling file that the Vite build does
// not copy; bundle it and point MapLibre at it, or the vector map fails with
// "Worker failed to load" (seen in the Android WebView).
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const DEFAULT_STYLE_URL = (import.meta as any).env?.VITE_MAP_STYLE_URL
  || 'https://tiles.openfreemap.org/styles/liberty';

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

    // MapLibre emits 'error' for any failed tile, glyph or sprite. Only give
    // up on the vector style if it never finishes loading.
    let loaded = false;
    let handleLoad: (() => void) | null = null;
    let handleError: ((event?: { sourceId?: string; tile?: unknown }) => void) | null = null;
    let loadTimer: ReturnType<typeof setTimeout> | null = null;
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
      handleLoad = () => {
        loaded = true;
        if (loadTimer) clearTimeout(loadTimer);
        maplibreMap?.resize?.();
      };
      handleError = (event) => {
        // Tile/source errors (sourceId set) are routine; a style error before
        // load means the vector map cannot work.
        if (!loaded && !event?.sourceId && !event?.tile) {
          console.warn('MapLibre style failed, falling back to raster.', (event as any)?.error?.message);
          addRasterFallback();
        }
      };
      if (maplibreMap?.on) {
        maplibreMap.on('error', handleError);
        maplibreMap.on('load', handleLoad);
      }
      loadTimer = setTimeout(() => {
        if (loaded) return;
        console.warn('MapLibre style did not load in time, falling back to raster.');
        addRasterFallback();
      }, 12_000);
    } catch (error) {
      console.warn('MapLibre GL failed, falling back to raster.', error);
      addRasterFallback();
    }

    return () => {
      if (loadTimer) clearTimeout(loadTimer);
      if (maplibreMap?.off) {
        if (handleError) {
          maplibreMap.off('error', handleError);
        }
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
