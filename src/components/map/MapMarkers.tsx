import React from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { Event, VenuePlace } from '../../lib/types';

type EventWithVenue = Event & {
  venue_place?: VenuePlace | null;
};

type MapMarkersProps = {
  events: EventWithVenue[];
  venues: VenuePlace[];
  showVenues: boolean;
  onSelectEvent: (eventId: string) => void;
  onSelectVenue: (venueId: string) => void;
  activeSelection?: { type: 'event' | 'venue'; id: string } | null;
};

type PinVariant = 'free' | 'paid' | 'venue';

const toNumber = (value: number | string | null) => {
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return value;
};

const buildPinGlyph = (variant: PinVariant) => {
  if (variant === 'venue') {
    return `
      <svg viewBox="0 0 28 28" aria-hidden="true" class="h-full w-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2.8 12L14 4.8 25.2 12" />
        <rect x="4.5" y="12" width="19" height="10" rx="1.5" />
        <path d="M9.5 22v-4.6h9V22" />
        <path d="M10 15.5h2.2M15.8 15.5H18" />
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 28 28" aria-hidden="true" class="h-full w-full" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="14" cy="16.5" r="5.7" />
      <path d="M8.3 16.5h11.4" />
      <path d="M10.5 20.8v2.2M17.5 20.8v2.2" />
      <path d="M6.2 8.3l5.4 3.8M21.8 8.3l-5.4 3.8" />
      <path d="M4.6 12.6h4.6M18.8 12.6h4.6" />
    </svg>
  `;
};

const pinBaseClasses =
  "relative flex h-[46px] w-[46px] pointer-events-auto items-center justify-center rounded-full border-[1.8px] bg-[radial-gradient(circle_at_30%_25%,rgba(35,43,58,0.98)_0%,rgba(11,14,20,0.96)_72%)] transition-all duration-150 after:absolute after:-bottom-[7px] after:left-1/2 after:h-3 after:w-3 after:-translate-x-1/2 after:rotate-[-45deg] after:rounded-[1px] after:border-l-[1.8px] after:border-b-[1.8px] after:bg-[rgba(11,14,20,0.96)] after:content-['']";

const pinVariants: Record<
  PinVariant,
  { pinClasses: string; activeClasses: string; badgeLabel: string | null; badgeClasses: string }
> = {
  free: {
    pinClasses:
      'border-[#9ca9c0] text-[#eef3ff] after:border-[#9ca9c0] shadow-[0_8px_20px_rgba(3,8,16,0.45),0_0_0_3px_rgba(156,169,192,0.22)]',
    activeClasses:
      '-translate-y-[2px] scale-[1.08] shadow-[0_12px_24px_rgba(3,8,16,0.55),0_0_0_4px_rgba(156,169,192,0.22)]',
    badgeLabel: 'FREE',
    badgeClasses:
      'absolute -top-2 -right-2.5 pointer-events-none inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-white/50 bg-[rgba(11,14,20,0.95)] px-[5px] text-[10px] font-extrabold uppercase leading-none tracking-[0.08em] text-white/95',
  },
  paid: {
    pinClasses:
      'border-[#9ca9c0] text-[#eef3ff] after:border-[#9ca9c0] shadow-[0_8px_20px_rgba(3,8,16,0.45),0_0_0_3px_rgba(156,169,192,0.22)]',
    activeClasses:
      '-translate-y-[2px] scale-[1.08] shadow-[0_12px_24px_rgba(3,8,16,0.55),0_0_0_4px_rgba(156,169,192,0.22)]',
    badgeLabel: '€',
    badgeClasses:
      'absolute -top-2 -right-2.5 pointer-events-none inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-white/50 bg-[rgba(11,14,20,0.95)] px-1 text-xs font-extrabold leading-none tracking-[0] text-white/95',
  },
  venue: {
    pinClasses:
      'border-[#7ea8ff] text-[#d2e2ff] after:border-[#7ea8ff] shadow-[0_8px_20px_rgba(3,8,16,0.45),0_0_0_3px_rgba(126,168,255,0.22)]',
    activeClasses:
      '-translate-y-[2px] scale-[1.08] shadow-[0_12px_24px_rgba(3,8,16,0.55),0_0_0_4px_rgba(126,168,255,0.22)]',
    badgeLabel: null,
    badgeClasses: '',
  },
};

const buildPinIcon = (variant: PinVariant, isActive = false) => {
  const pinConfig = pinVariants[variant];
  const glyph = buildPinGlyph(variant);
  const badge = pinConfig.badgeLabel
    ? `<span class="${pinConfig.badgeClasses}">${pinConfig.badgeLabel}</span>`
    : '';
  const html = `
    <div class="${pinBaseClasses} ${pinConfig.pinClasses} ${isActive ? pinConfig.activeClasses : ''}">
      ${badge}
      <span class="inline-flex h-6 w-6 items-center justify-center">${glyph}</span>
    </div>
  `;
  return L.divIcon({
    className: 'leaflet-div-icon leaflet-interactive !border-0 !bg-transparent',
    html,
    iconSize: isActive ? [52, 60] : [48, 56],
    iconAnchor: [24, 56],
    popupAnchor: [0, -50],
  });
};

const MapMarkers: React.FC<MapMarkersProps> = ({
  events,
  venues,
  showVenues,
  onSelectEvent,
  onSelectVenue,
  activeSelection,
}) => {
  return (
    <>
      {events.map(event => {
        const lat = toNumber(event.latitude ?? event.venue_place?.latitude ?? null);
        const lng = toNumber(event.longitude ?? event.venue_place?.longitude ?? null);
        if (lat === null || lng === null) return null;
        const eventIsFree = event.is_free !== false;
        const isActive = activeSelection?.type === 'event' && activeSelection.id === event.id;
        const icon = buildPinIcon(eventIsFree ? 'free' : 'paid', isActive);
        return (
          <Marker
            key={event.id}
            position={[lat, lng]}
            icon={icon}
            pane="markerPane"
            interactive
            bubblingMouseEvents={false}
            zIndexOffset={isActive ? 200 : 0}
            eventHandlers={{
              click: () => onSelectEvent(event.id),
            }}
          />
        );
      })}
      {showVenues &&
        venues.map(venue => {
          const lat = toNumber(venue.latitude ?? null);
          const lng = toNumber(venue.longitude ?? null);
          if (lat === null || lng === null) return null;
          const isActive = activeSelection?.type === 'venue' && activeSelection.id === venue.id;
          const icon = buildPinIcon('venue', isActive);
          return (
            <Marker
              key={venue.id}
              position={[lat, lng]}
              icon={icon}
              pane="markerPane"
              interactive
              bubblingMouseEvents={false}
              zIndexOffset={isActive ? 200 : 0}
              eventHandlers={{
                click: () => onSelectVenue(venue.id),
              }}
            />
          );
        })}
    </>
  );
};

export default MapMarkers;
