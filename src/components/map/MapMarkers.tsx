import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Event, VenuePlace } from '../../lib/types';

type EventWithVenue = Event & { venue_place?: VenuePlace | null };

type MapMarkersProps = {
  events: EventWithVenue[];
  venues: VenuePlace[];
  showVenues: boolean;
  onSelectEvent: (eventId: string) => void;
  onSelectVenue: (venueId: string) => void;
};

const toNumber = (value: number | string | null) => {
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return value;
};

const buildPinIcon = (variant: 'free' | 'paid' | 'venue', label: string, imageUrl?: string | null) => {
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

const MapMarkers: React.FC<MapMarkersProps> = ({
  events,
  venues,
  showVenues,
  onSelectEvent,
  onSelectVenue,
}) => {
  return (
    <>
      {events.map(event => {
        const lat = toNumber(event.latitude ?? event.venue_place?.latitude ?? null);
        const lng = toNumber(event.longitude ?? event.venue_place?.longitude ?? null);
        if (lat === null || lng === null) return null;
        const posterUrl = event.cover_image_url || null;
        const eventIsFree = event.is_free !== false;
        const label = eventIsFree ? 'GRATIS' : 'PAGO';
        const icon = buildPinIcon(eventIsFree ? 'free' : 'paid', label, posterUrl);
        return (
          <Marker
            key={event.id}
            position={[lat, lng]}
            icon={icon}
            eventHandlers={{
              click: () => onSelectEvent(event.id),
            }}
          >
            <Popup>
              <strong>{event.name}</strong>
              <br />
              {event.venue_place?.city || event.city}
              <div className="mt-2">
                <button
                  type="button"
                  className="app-button app-button--ghost app-button--small"
                  onClick={() => onSelectEvent(event.id)}
                >
                  Open event
                </button>
              </div>
            </Popup>
          </Marker>
        );
      })}
      {showVenues &&
        venues.map(venue => {
          const lat = toNumber(venue.latitude ?? null);
          const lng = toNumber(venue.longitude ?? null);
          if (lat === null || lng === null) return null;
          const imageUrl = venue.photos?.[0] || null;
          const icon = buildPinIcon('venue', 'SALA', imageUrl);
          return (
            <Marker
              key={venue.id}
              position={[lat, lng]}
              icon={icon}
              eventHandlers={{
                click: () => onSelectVenue(venue.id),
              }}
            >
              <Popup>
                <strong>{venue.name}</strong>
                <br />
                {venue.city}
                <div className="mt-2">
                  <button
                    type="button"
                    className="app-button app-button--ghost app-button--small"
                    onClick={() => onSelectVenue(venue.id)}
                  >
                    Open venue
                  </button>
                </div>
              </Popup>
            </Marker>
          );
        })}
    </>
  );
};

export default MapMarkers;
