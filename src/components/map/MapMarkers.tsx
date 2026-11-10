import { useEffect, useRef } from 'react';
import { Marker, type Map as MapLibreMap } from 'maplibre-gl';
import type { MapVenueGroup } from '../../hooks/useMapFilters';
import type { MapEvent } from '../../data/eventQueries';
import { uniqueImageUrls } from '../../lib/eventCover';
import { initials, pickPalette } from '../ui/generated';
import { ACTIVE_POSTER_BOX, POSTER_BOX, POSTER_MIN_ZOOM, pickPosterVenues } from './pinLayout';

type MapMarkersProps = {
  map: MapLibreMap | null;
  groups: MapVenueGroup[];
  activeVenueId: string | null;
  onSelectVenue: (venueId: string) => void;
};

// Map.tsx ignores bare-map clicks that land inside one of these.
const VENUE_PIN_CLASS = 'venue-pin';

const IDLE_DOT = 'h-8 min-w-8 text-[13px] shadow-[0_6px_16px_rgba(0,0,0,0.55)]';
// Zoomed in, a venue whose poster would overlap another's: a smaller dot that
// peeks out from behind the posters without covering them.
const SMALL_DOT = 'h-6 min-w-6 text-[11px] shadow-[0_4px_10px_rgba(0,0,0,0.55)]';
const ACTIVE_DOT = 'h-12 min-w-12 text-[17px] ring-4 ring-app-accent/35 shadow-[0_10px_26px_rgba(0,0,0,0.6)]';
const DOT_BASE =
  'inline-flex items-center justify-center rounded-full border-2 border-app-bg bg-app-accent px-1.5 font-mono font-bold leading-none text-white transition-transform';

const POSTER_BASE =
  'relative box-border block overflow-visible rounded-[8px] border-2 bg-app-bg shadow-[0_6px_16px_rgba(0,0,0,0.6)]';
const IDLE_POSTER = 'h-[56px] w-[44px] border-app-bg';
const ACTIVE_POSTER =
  'h-[76px] w-[60px] border-app-accent ring-4 ring-app-accent/30 shadow-[0_10px_26px_rgba(0,0,0,0.65)]';
const BADGE =
  'absolute -right-2 -top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-app-bg bg-app-accent px-1 font-mono text-[11px] font-bold leading-none text-white';

type PinMode = 'dot' | 'small-dot' | 'poster';

type PinEntry = {
  marker: Marker;
  root: HTMLDivElement;
  dot: HTMLSpanElement;
  poster: HTMLSpanElement | null;
  lat: number;
  lng: number;
  /** What is painted now; '' forces the first paint. */
  paintKey: string;
  imageKey: string;
};

const countLabel = (count: number) => (count > 99 ? '99+' : String(count));

/** Image URLs a poster pin tries: cover chain (R2 thumb first), then the headliner's photo. */
const pinSources = (event: MapEvent | undefined) =>
  event ? uniqueImageUrls([...event.cover_sources, event.artist?.avatar_url]) : [];

const pinTitle = (event: MapEvent | undefined, fallback: string) => event?.artist?.name || event?.name || fallback;

// A two-letter tile in the generated-poster colours: what a pin shows when the
// concert has no image or every URL failed. Much lighter than <GeneratedPoster>.
const makeTile = (name: string) => {
  const palette = pickPalette(name);
  const tile = document.createElement('span');
  tile.className =
    'flex h-full w-full items-center justify-center rounded-[6px] font-display text-[15px] font-black leading-none tracking-tight';
  tile.style.background = palette.ground;
  tile.style.color = palette.ink;
  tile.textContent = initials(name);
  return tile;
};

// The image walks its chain on load errors and ends on the tile.
// data-own-fallback keeps lib/imageFallback.ts from swapping in its placeholder.
const fillPoster = (frame: HTMLSpanElement, urls: string[], name: string) => {
  frame.replaceChildren();
  if (urls.length === 0) {
    frame.appendChild(makeTile(name));
    return;
  }
  const img = document.createElement('img');
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.draggable = false;
  img.setAttribute('data-own-fallback', '');
  img.className = 'block h-full w-full rounded-[6px] object-cover';
  let index = 0;
  img.addEventListener('error', () => {
    index += 1;
    if (index < urls.length) {
      img.src = urls[index];
    } else {
      frame.replaceChildren(makeTile(name));
    }
  });
  img.src = urls[0];
  frame.appendChild(img);
};

const ensurePoster = (entry: PinEntry) => {
  if (entry.poster) return entry.poster;
  const poster = document.createElement('span');
  const frame = document.createElement('span');
  frame.className = 'block h-full w-full overflow-hidden rounded-[6px]';
  const badge = document.createElement('span');
  badge.className = BADGE;
  poster.append(frame, badge);
  entry.root.appendChild(poster);
  entry.poster = poster;
  return poster;
};

const paintPin = (entry: PinEntry, group: MapVenueGroup, mode: PinMode, active: boolean) => {
  const count = group.events.length;
  const next = group.events[0];
  const urls = mode === 'poster' ? pinSources(next) : [];
  const imageKey = urls.join('\n');
  const paintKey = `${mode}|${count}|${active ? 1 : 0}|${imageKey}|${group.name}`;
  if (entry.paintKey === paintKey) return;
  entry.paintKey = paintKey;

  const { root } = entry;
  root.title = group.name;
  root.setAttribute('aria-label', count > 1 ? `${group.name}, ${count} conciertos` : group.name);

  if (mode !== 'poster') {
    // The hit area stays at least 44px; the visible dot is smaller when idle.
    const box = active ? 60 : 44;
    root.style.width = `${box}px`;
    root.style.height = `${box}px`;
    root.style.zIndex = String(active ? 1000 : Math.min(count, 99));
    entry.dot.className = `${DOT_BASE} ${active ? ACTIVE_DOT : mode === 'small-dot' ? SMALL_DOT : IDLE_DOT}`;
    entry.dot.textContent = countLabel(count);
    entry.dot.style.display = '';
    if (entry.poster) entry.poster.style.display = 'none';
    return;
  }

  const size = active ? ACTIVE_POSTER_BOX : POSTER_BOX;
  root.style.width = `${Math.max(size.width, 44)}px`;
  root.style.height = `${Math.max(size.height, 44)}px`;
  // Posters above every dot; the selected one above everything.
  root.style.zIndex = String(active ? 1000 : 200 + Math.min(count, 99));
  entry.dot.style.display = 'none';
  const poster = ensurePoster(entry);
  poster.style.display = '';
  poster.className = `${POSTER_BASE} ${active ? ACTIVE_POSTER : IDLE_POSTER}`;
  const [frame, badge] = poster.children as unknown as [HTMLSpanElement, HTMLSpanElement];
  badge.textContent = countLabel(count);
  badge.style.display = count > 1 ? '' : 'none';
  if (entry.imageKey !== imageKey || frame.childElementCount === 0) {
    entry.imageKey = imageKey;
    fillPoster(frame, urls, pinTitle(next, group.name));
  }
};

/**
 * Venue pins as MapLibre HTML markers. Pins live outside React's tree and are
 * diffed by venue id: re-renders only touch the pins whose position, count,
 * active state, image or mode changed.
 *
 * From POSTER_MIN_ZOOM up, venues on screen show a mini poster of their next
 * concert (pinLayout decides which, so they do not pile up); the rest, and
 * every venue below that zoom, show the compact orange count dot. The layout
 * is recomputed when the map stops moving, not on every frame.
 */
const MapMarkers = ({ map, groups, activeVenueId, onSelectVenue }: MapMarkersProps) => {
  const pins = useRef(new Map<string, PinEntry>());
  const onSelect = useRef(onSelectVenue);
  const latest = useRef({ groups, activeVenueId });
  const syncRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    onSelect.current = onSelectVenue;
  }, [onSelectVenue]);

  useEffect(() => {
    if (!map) return undefined;
    const current = pins.current;

    const sync = () => {
      const { groups: list, activeVenueId: activeId } = latest.current;
      const seen = new Set<string>();

      list.forEach(group => {
        const { id, latitude, longitude } = group;
        seen.add(id);
        let entry = current.get(id);
        if (!entry) {
          const root = document.createElement('div');
          root.className = `${VENUE_PIN_CLASS} flex cursor-pointer items-center justify-center`;
          root.setAttribute('role', 'button');
          root.dataset.venueId = id;
          const dot = document.createElement('span');
          root.appendChild(dot);
          root.addEventListener('click', event => {
            event.stopPropagation();
            onSelect.current(id);
          });
          const marker = new Marker({ element: root, anchor: 'center' }).setLngLat([longitude, latitude]).addTo(map);
          entry = { marker, root, dot, poster: null, lat: latitude, lng: longitude, paintKey: '', imageKey: '' };
          current.set(id, entry);
        } else if (entry.lat !== latitude || entry.lng !== longitude) {
          entry.marker.setLngLat([longitude, latitude]);
          entry.lat = latitude;
          entry.lng = longitude;
        }
      });

      current.forEach((entry, id) => {
        if (seen.has(id)) return;
        entry.marker.remove();
        current.delete(id);
      });

      let posters = new Set<string>();
      const zoomedIn = map.getZoom() >= POSTER_MIN_ZOOM;
      if (zoomedIn) {
        const canvas = map.getCanvas();
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const margin = 40;
        const candidates = list
          .map(group => {
            const point = map.project([group.longitude, group.latitude]);
            return { id: group.id, x: point.x, y: point.y };
          })
          .filter(pin => pin.x > -margin && pin.y > -margin && pin.x < width + margin && pin.y < height + margin);
        posters = pickPosterVenues(candidates, { x: width / 2, y: height / 2 }, activeId);
      }

      list.forEach(group => {
        const entry = current.get(group.id);
        if (!entry) return;
        paintPin(entry, group, posters.has(group.id) ? 'poster' : zoomedIn ? 'small-dot' : 'dot', group.id === activeId);
      });
    };

    syncRef.current = sync;
    sync();
    map.on('moveend', sync);
    return () => {
      map.off('moveend', sync);
      syncRef.current = () => undefined;
    };
  }, [map]);

  useEffect(() => {
    latest.current = { groups, activeVenueId };
    syncRef.current();
  }, [groups, activeVenueId]);

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
