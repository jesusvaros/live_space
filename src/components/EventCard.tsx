import React from 'react';
import { Event, Profile, VenuePlace } from '../lib/types';

type EventCardEvent = Event & {
  organizer?: Profile | null;
  venue?: Profile | null;
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Profile | null }[];
};

type EventCardProps = {
  event: EventCardEvent;
  onSelect: (event: EventCardEvent) => void;
};

const formatEventDate = (event: Event) =>
  new Date(event.starts_at).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const getProfileName = (profile?: Profile | null) =>
  profile?.display_name || profile?.username || null;

const getPrimaryArtist = (event: EventCardEvent) => {
  const artist = event.event_artists?.find(item => item.artist)?.artist;
  if (artist) return getProfileName(artist);
  if (event.organizer && event.organizer.role !== 'venue') {
    return getProfileName(event.organizer);
  }
  return null;
};

const getVenueLabel = (event: EventCardEvent) => {
  const venueName =
    event.venue_place?.name || getProfileName(event.venue) || event.address || 'Venue TBD';
  const cityLabel = event.venue_place?.city || event.city;
  return cityLabel ? `${venueName} · ${cityLabel}` : venueName;
};

const EventCard: React.FC<EventCardProps> = ({ event, onSelect }) => {
  const artistLabel = getPrimaryArtist(event) || 'Lineup TBA';
  const venueLabel = getVenueLabel(event);
  return (
    <button type="button" className="event-card fade-up" onClick={() => onSelect(event)}>
      <div className="event-card-media">
        {event.cover_image_url ? (
          <img src={event.cover_image_url} alt={event.name} />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#1b2232] via-[#141824] to-[#0b0e14]" />
        )}
      </div>
      <div className="event-card-content">
        <p className="text-xs text-slate-400">{artistLabel}</p>
        <h3 className="font-display text-lg text-slate-50">{event.name}</h3>
        <div className="event-card-meta">
          <span>{venueLabel}</span>
          <span>{formatEventDate(event)}</span>
        </div>
      </div>
    </button>
  );
};

export default EventCard;
