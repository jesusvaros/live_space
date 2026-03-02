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

const toNumber = (value: number | string | null) => {
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return value;
};

const buildPinGlyph = (variant: 'free' | 'paid' | 'venue') => {
  if (variant === 'venue') {
    return `
      <svg viewBox="0 0 28 28" aria-hidden="true">
        <path d="M2.8 12L14 4.8 25.2 12" />
        <rect x="4.5" y="12" width="19" height="10" rx="1.5" />
        <path d="M9.5 22v-4.6h9V22" />
        <path d="M10 15.5h2.2M15.8 15.5H18" />
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="16.5" r="5.7" />
      <path d="M8.3 16.5h11.4" />
      <path d="M10.5 20.8v2.2M17.5 20.8v2.2" />
      <path d="M6.2 8.3l5.4 3.8M21.8 8.3l-5.4 3.8" />
      <path d="M4.6 12.6h4.6M18.8 12.6h4.6" />
    </svg>
  `;
};

const buildPinIcon = (variant: 'free' | 'paid' | 'venue', isActive = false) => {
  const glyph = buildPinGlyph(variant);
  const badge = variant === 'venue'
    ? ''
    : `<span class="map-pin-badge map-pin-badge--${variant}">${variant === 'free' ? 'FREE' : '€'}</span>`;
  const html = `
    <div class="map-pin map-pin--${variant} ${isActive ? 'map-pin--active' : ''}" style="pointer-events:auto;">
      ${badge}
      <span class="map-pin-icon">${glyph}</span>
    </div>
  `;
  return L.divIcon({
    className: `leaflet-div-icon leaflet-interactive map-pin-wrapper`,
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
