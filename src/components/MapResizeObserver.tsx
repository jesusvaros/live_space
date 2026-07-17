import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

const MapResizeObserver = () => {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    if (!container) return undefined;
    let rafId = 0;

    const resize = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        map.invalidateSize();
        const maplibreMap = (map as any)._maplibreMap;
        if (maplibreMap?.resize) {
          maplibreMap.resize();
        }
      });
    };

    resize();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => resize());
      observer.observe(container);
    } else {
      globalThis.addEventListener('resize', resize);
    }

    return () => {
      if (observer) {
        observer.disconnect();
      } else {
        globalThis.removeEventListener('resize', resize);
      }
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [map]);

  return null;
};

export default MapResizeObserver;
