import React from 'react';
import { Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Event, Profile, VenuePlace } from '../../lib/types';

type EventWithVenue = Event & {
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Profile | null }[];
};

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

const getGroupImage = (event: EventWithVenue) =>
  event.event_artists?.find(item => item.artist?.avatar_url)?.artist?.avatar_url || null;

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
        const groupImageUrl = getGroupImage(event);
        const eventIsFree = event.is_free !== false;
        const label = eventIsFree ? 'GRATIS' : 'PAGO';
        const icon = buildPinIcon(eventIsFree ? 'free' : 'paid', label, groupImageUrl);
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
              <div className="flex items-center gap-3">
                {groupImageUrl && (
                  <div className="h-12 w-12 overflow-hidden rounded-full bg-slate-200">
                    <img src={groupImageUrl} alt={event.name} className="h-full w-full object-cover" />
                  </div>
                )}
                <div>
                  <strong>{event.name}</strong>
                  <div className="text-xs text-slate-500">{event.venue_place?.city || event.city}</div>
                </div>
              </div>
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
