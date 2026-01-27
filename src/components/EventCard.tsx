import React from 'react';
import { Event, Profile, VenuePlace, Artist } from '../lib/types';

type EventCardEvent = Event & {
  organizer?: Profile | null;
  venue?: Profile | null;
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Artist | null }[];
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

const getArtistName = (artist?: Artist | null) =>
  artist?.name || null;

const getPrimaryArtist = (event: EventCardEvent) => {
  const artist = event.event_artists?.find(item => item.artist)?.artist;
  if (artist) return getArtistName(artist);
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
  const artistLabel = getPrimaryArtist(event) || event.name || 'Lineup TBA';
  const venueLabel = getVenueLabel(event);
  return (
    <button
      type="button"
      className="relative overflow-hidden bg-black text-left"
      onClick={() => onSelect(event)}
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        {event.cover_image_url ? (
          <img src={event.cover_image_url} alt={event.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 bg-black" />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-black/70 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85 line-clamp-1">
            {artistLabel}
          </p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70 line-clamp-1">
            {venueLabel}
          </p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60 line-clamp-1">
            {formatEventDate(event)}
          </p>
        </div>
      </div>
    </button>
  );
};

export default EventCard;
