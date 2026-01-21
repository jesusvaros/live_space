import React from 'react';
import { Event, Profile, VenuePlace, Artist } from '../lib/types';
import { IconCheckCircle, IconHeart } from './icons';

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
  const artistLabel = getPrimaryArtist(event) || 'Lineup TBA';
  const venueLabel = getVenueLabel(event);
  const now = new Date();
  const eventStart = new Date(event.starts_at);
  const eventEnd = event.ends_at ? new Date(event.ends_at) : null;
  const isPastEvent = eventEnd ? now > eventEnd : now > eventStart;
  const attendanceLabel = isPastEvent ? 'I went' : "I'm here";
  return (
    <button
      type="button"
      className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 text-left shadow-[0_24px_50px_rgba(0,0,0,0.45)] transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none"
      onClick={() => onSelect(event)}
    >
      <div className="relative h-44 overflow-hidden">
        {event.cover_image_url ? (
          <img src={event.cover_image_url} alt={event.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#1b2232] via-[#141824] to-[#0b0e14]" />
        )}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex gap-2">
          <div className="flex items-center gap-1 rounded-full bg-black/50 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
            <IconHeart className="h-4 w-4" />
            <span>Like</span>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-black/50 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
            <IconCheckCircle className="h-4 w-4" />
            <span>{attendanceLabel}</span>
          </div>
        </div>
      </div>
      <div className="space-y-2 p-4">
        <p className="text-xs text-slate-400">{artistLabel}</p>
        <h3 className="font-display text-lg text-slate-50">{event.name}</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span>{venueLabel}</span>
          <span className="h-1 w-1 rounded-full bg-slate-600" />
          <span>{formatEventDate(event)}</span>
        </div>
      </div>
    </button>
  );
};

export default EventCard;
