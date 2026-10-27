import React, { useMemo } from 'react';
import { Artist, Event, Profile, VenuePlace } from '../../../lib/types';
import GeneratedPoster from '../../../components/ui/GeneratedPoster';

type EventPosterTileArtist = Pick<Artist, 'id' | 'name' | 'avatar_url'>;

type EventPosterTileEvent = Event & {
  organizer?: Profile | null;
  venue?: Profile | null;
  venue_place?: VenuePlace | null;
  event_artists?: { artist: EventPosterTileArtist | null }[];
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
  new Date(iso).toLocaleString('es-ES', {
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
  }, [event, title]);

  const resolvedSubtitle = useMemo(() => {
    if (subtitle) return subtitle;
    return getVenueName(event) || 'Sala';
  }, [event, subtitle]);

  const resolvedKicker = useMemo(() => {
    if (kicker) return kicker;
    return formatEventDate(event.starts_at);
  }, [event.starts_at, kicker]);

  return (
    <button
      type="button"
      className={`${className || 'w-[168px] shrink-0'} text-left`}
      onClick={() => onSelect(event)}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-app-surface">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        ) : (
          <GeneratedPoster title={resolvedTitle} />
        )}
        {badge && (
          <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-app-accent line-clamp-1">
        {resolvedKicker}
      </p>
      <p className="mt-0.5 font-display text-[15px] font-bold leading-snug text-white line-clamp-2">{resolvedTitle}</p>
      <p className="mt-0.5 text-[13px] text-white/60 line-clamp-1">{resolvedSubtitle}</p>
    </button>
  );
};

export default EventPosterTile;
