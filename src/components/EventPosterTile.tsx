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

  const resolvedKicker = useMemo(() => {
    if (kicker) return kicker;
    return formatEventDate(event.starts_at);
  }, [event.starts_at, kicker]);

  const resolvedTitle = useMemo(() => {
    if (title) return title;
    return event.name;
  }, [event.name, title]);

  const resolvedSubtitle = useMemo(() => {
    if (subtitle) return subtitle;
    const primary = getPrimaryArtist(event);
    const venueName = event.venue_place?.name || event.city || 'Venue';
    return primary ? `${primary} · ${venueName}` : venueName;
  }, [event, subtitle]);

  return (
    <button
      type="button"
      className={className || 'w-[220px] shrink-0'}
      onClick={() => onSelect(event)}
    >
      <div className="relative aspect-[4/5] overflow-hidden border border-white/10 bg-[#141824] shadow-[0_20px_44px_rgba(0,0,0,0.45)]">
        {imageUrl ? (
          <img src={imageUrl} alt={event.name} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,107,74,0.18),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(122,167,255,0.14),transparent_55%)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0e14]/95 via-[#0b0e14]/35 to-transparent" />
        {badge && (
          <div className="absolute left-3 top-3">
            <span className="rounded-full bg-black/55 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
              {badge}
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 p-4 text-left">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-200/80 line-clamp-1">
            {resolvedKicker}
          </p>
          <p className="mt-2 font-display text-lg text-white line-clamp-2">{resolvedTitle}</p>
          <p className="mt-1 text-xs text-slate-200/70 line-clamp-2">{resolvedSubtitle}</p>
        </div>
      </div>
    </button>
  );
};

export default EventPosterTile;
