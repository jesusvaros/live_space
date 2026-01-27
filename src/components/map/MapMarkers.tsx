import React from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { Event, Artist, VenuePlace } from '../../lib/types';

type EventWithVenue = Event & {
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Artist | null }[];
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

const buildPinIcon = (variant: 'free' | 'paid' | 'venue', label: string, imageUrl?: string | null, isActive = false) => {
  const safeUrl = imageUrl ? encodeURI(imageUrl).replace(/'/g, '%27') : '';
  const avatar = imageUrl
    ? `<div class="map-pin-avatar" style="background-image:url('${safeUrl}')"></div>`
    : '<div class="map-pin-avatar map-pin-avatar--empty"></div>';
  const html = `
    <div class="map-pin map-pin--${variant} ${isActive ? 'map-pin--active' : ''}" style="pointer-events:auto;">
      ${avatar}
      <span class="map-pin-label">${label}</span>
    </div>
  `;
  return L.divIcon({
    className: `leaflet-div-icon leaflet-interactive map-pin-wrapper`,
    html,
    iconSize: isActive ? [56, 64] : [52, 60],
    iconAnchor: [26, 60],
    popupAnchor: [0, -54],
  });
};

const getGroupImage = (event: EventWithVenue) =>
  event.event_artists?.find(item => item.artist?.avatar_url)?.artist?.avatar_url || null;

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
        const groupImageUrl = getGroupImage(event);
        const eventIsFree = event.is_free !== false;
        const label = eventIsFree ? 'GRATIS' : 'PAGO';
        const isActive = activeSelection?.type === 'event' && activeSelection.id === event.id;
        const icon = buildPinIcon(eventIsFree ? 'free' : 'paid', label, groupImageUrl, isActive);
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
          const imageUrl = venue.photos?.[0] || null;
          const isActive = activeSelection?.type === 'venue' && activeSelection.id === venue.id;
          const icon = buildPinIcon('venue', 'SALA', imageUrl, isActive);
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
