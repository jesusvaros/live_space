import React, { useMemo } from 'react';
import { Artist, Event, Profile, VenuePlace } from '../lib/types';

type EventPosterTileEvent = Event & {
  organizer?: Profile | null;
  venue?: Profile | null;
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Artist | null }[];
};

type EventPosterTileProps = {
  event: EventPosterTileEvent;
  onSelect: (event: EventPosterTileEvent) => void;
  className?: string;
  title?: string;
  subtitle?: string;
  kicker?: string;
  badge?: string;
};

const formatEventDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

const getProfileName = (profile?: Profile | null) => profile?.display_name || profile?.username || null;

const getPrimaryArtist = (event: EventPosterTileEvent) => {
  const artist = event.event_artists?.find(item => item.artist)?.artist;
  if (artist?.name) return artist.name;
  if (event.organizer && event.organizer.role !== 'venue') return getProfileName(event.organizer);
  return null;
};

const getVenueName = (event: EventPosterTileEvent) =>
  event.venue_place?.name || event.address || event.city || null;

const EventPosterTile: React.FC<EventPosterTileProps> = ({
  event,
  onSelect,
  className,
  title,
  subtitle,
  kicker,
  badge,
}) => {
  const imageUrl =
    event.cover_image_url ||
    event.event_artists?.find(item => item.artist?.avatar_url)?.artist?.avatar_url ||
    null;

  const resolvedTitle = useMemo(() => {
    if (title) return title;
    return getPrimaryArtist(event) || event.name;
  }, [event.name, title]);

  const resolvedSubtitle = useMemo(() => {
    if (subtitle) return subtitle;
    return getVenueName(event) || 'Venue';
  }, [event, subtitle]);

  const resolvedKicker = useMemo(() => {
    if (kicker) return kicker;
    return formatEventDate(event.starts_at);
  }, [event.starts_at, kicker]);

  return (
    <button
      type="button"
      className={className || 'w-[220px] shrink-0'}
      onClick={() => onSelect(event)}
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        {imageUrl ? (
          <img src={imageUrl} alt={event.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 bg-black" />
        )}
        {badge && (
          <div className="absolute left-3 top-3">
            <span className="rounded-md bg-black/60 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/90">
              {badge}
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-black/70 p-4 text-left">
          <p className="font-display text-lg font-bold text-white line-clamp-2">{resolvedTitle}</p>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/80 line-clamp-1">
            {resolvedSubtitle}
          </p>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/65 line-clamp-1">
            {resolvedKicker}
          </p>
        </div>
      </div>
    </button>
  );
};

export default EventPosterTile;
